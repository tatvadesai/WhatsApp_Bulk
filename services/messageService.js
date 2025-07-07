const config = require('../config');
const logger = require('../utils/logger');
const { formatMessage, prepareContactMessage } = require('../utils/messageFormatter');
const RateLimiter = require('../utils/rateLimiter');
const templateManager = require('../templates');

const EventEmitter = require('events');

class MessageService extends EventEmitter {
    constructor(whatsappClient, io) {
        super();
        this.whatsappClient = whatsappClient;
        this.io = io;
        this.rateLimiter = new RateLimiter(
            config.MAX_MESSAGES_PER_MINUTE,
            60 * 1000  // 1 minute in milliseconds
        );
        this.messageQueue = [];
        this.isProcessing = false;
        this.stats = {
            total: 0,
            sent: 0,
            failed: 0,
            skipped: 0
        };
    }

    async sendBatchMessages(contacts, templateName, customData = {}) {
        if (!this.whatsappClient.isReady) {
            throw new Error('WhatsApp client is not ready');
        }

        this.stats = {
            total: contacts.length,
            sent: 0,
            failed: 0,
            skipped: 0
        };

        // Update UI with initial stats
        this._updateStats();

        // Get template content dynamically
        const template = await templateManager.getTemplateContent(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' not found.`);
        }
        
        // Queue all messages
        for (const contact of contacts) {
            this.messageQueue.push({
                contact,
                template,
                customData
            });
        }

        // Start processing if not already running
        if (!this.isProcessing) {
            this._processQueue();
        }

        return this.stats;
    }

    pauseProcessing() {
        this.whatsappClient.pause();
        this.emit('paused');
        return true;
    }

    resumeProcessing() {
        this.whatsappClient.resume();
        if (!this.isProcessing && this.messageQueue.length > 0) {
            this._processQueue();
        }
        this.emit('resumed');
        return true;
    }

    clearQueue() {
        const remainingCount = this.messageQueue.length;
        this.messageQueue = [];
        this.stats.skipped += remainingCount;
        this._updateStats();
        this.emit('queue_cleared', remainingCount);
        logger.info(`Message queue cleared. ${remainingCount} messages removed.`);
        return remainingCount;
    }

    getStats() {
        return this.stats;
    }

    // Private methods
    async _processQueue() {
        if (this.messageQueue.length === 0) {
            this.isProcessing = false;
            this.emit('queue_empty');
            logger.info('Message queue is empty');
            return;
        }

        this.isProcessing = true;

        try {
            // Process messages in batches
            const batchSize = Math.min(config.batchSize || 10, this.messageQueue.length);
            const batch = this.messageQueue.splice(0, batchSize);
            
            logger.info(`Processing batch of ${batch.length} messages`);
            this.emit('batch_start', batch.length);
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'processing', 
                    message: `Sending messages (${batch.length} contacts in current batch)` 
                });
            }

            const failedContacts = [];
            
            // Process each contact in the batch
            for (const item of batch) {
                if (this.whatsappClient.isPaused) {
                    // Put the item back in the queue
                    this.messageQueue.unshift(item);
                    this.emit('paused');
                    this.isProcessing = false;
                    return;
                }

                try {
                    // Wait for rate limiter
                    await this.rateLimiter.throttle();
                    
                    // Prepare message
                    const { contact, template, customData } = item;
                    
                    // Log the contact for debugging
                    logger.debug(`Processing contact: ${JSON.stringify(contact)}`);
                    
                    // Ensure contact has necessary fields and normalize field names
                    const enhancedContact = { ...contact };
                    
                    // Skip if contact doesn't have a number
                    if (!enhancedContact.number) {
                        logger.warn(`Contact missing phone number, skipping: ${JSON.stringify(contact)}`);
                        this.stats.skipped++;
                        this._updateStats();
                        continue;
                    }
                    
                    // Clean up and validate phone number
                    enhancedContact.number = this._validatePhoneNumber(enhancedContact.number);
                    
                    if (!enhancedContact.number) {
                        logger.warn('Invalid phone number format, skipping');
                        this.stats.skipped++;
                        this._updateStats();
                        continue;
                    }
                    
                    const messageObj = prepareContactMessage(enhancedContact, template, customData);
                    
                    // Send message
                    await this.whatsappClient.sendMessage(enhancedContact.number, messageObj.message);
                    
                    // Update stats
                    this.stats.sent++;
                    this._updateStats();
                    
                    // Emit event
                    this.emit('message_sent', { contact, message: messageObj.message });
                    
                    // Log success
                    logger.info(`Message sent to ${contact.firstName} (${contact.number})`);
                    
                    // Send a progress update every 5 messages
                    if (this.stats.sent % 5 === 0) {
                        const progress = (this.stats.sent + this.stats.failed + this.stats.skipped);
                        const total = progress + this.messageQueue.length;
                        if (this.io) {
                            this.io.emit('status', { 
                                status: 'progress', 
                                message: `Sent ${progress} of ${total} messages (${Math.round((progress/total)*100)}% complete)` 
                            });
                        }
                    }
                    
                } catch (error) {
                    // Update stats
                    this.stats.failed++;
                    this._updateStats();
                    
                    // Add to failed contacts
                    failedContacts.push({
                        ...item.contact,
                        error: error.message
                    });
                    
                    // Emit event
                    this.emit('message_failed', { contact: item.contact, error });
                    
                    // Log error
                    logger.error(`Failed to send message to ${item.contact.firstName} (${item.contact.number}):`, error);
                }
                
                // Small delay between messages in the same batch
                await new Promise(resolve => setTimeout(resolve, config.messageDelay || 5000));
            }
            
            
            
            // Delay between batches
            if (this.messageQueue.length > 0) {
                const batchDelaySeconds = (config.batchDelay || 30000) / 1000;
                logger.info(`Waiting ${batchDelaySeconds} seconds before next batch...`);
                
                if (this.io) {
                    this.io.emit('status', { 
                        status: 'batch_delay', 
                        message: `Taking a short break (${batchDelaySeconds} seconds) to avoid hitting WhatsApp rate limits...` 
                    });
                }
                
                setTimeout(() => this._processQueue(), config.batchDelay || 30000);
            } else {
                this.isProcessing = false;
                this.emit('queue_empty');
                logger.info('Message queue is empty');
                
                if (this.io) {
                    this.io.emit('status', { 
                        status: 'completed', 
                        message: '🎉 Success! All messages have been sent.' 
                    });
                }
            }
        } catch (error) {
            logger.error('Error processing message queue:', error);
            this.isProcessing = false;
            this.emit('error', error);
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'error', 
                    message: 'Error processing message queue: ' + error.message 
                });
            }
        }
    }

    _updateStats() {
        const stats = this.getStats();
        this.emit('stats_updated', stats);
        
        if (this.io) {
            this.io.emit('stats', stats);
        }
    }

    _validatePhoneNumber(number) {
        if (!number) return null;
        
        logger.debug(`Validating phone number: ${number}`);
        
        // Remove any non-digit characters
        let cleaned = number.toString().replace(/\D/g, '');
        
        // Handle special case where phone has a + prefix
        if (number.toString().startsWith('+')) {
            cleaned = number.toString().substring(1).replace(/\D/g, '');
        }
        
        logger.debug(`Cleaned phone number: ${cleaned}`);
        
        // Check length and add country code if missing
        if (cleaned.length < 10) {
            logger.warn(`Phone number ${cleaned} is too short`);
            return null;
        }
        
        // Add country code if missing (assuming India)
        if (cleaned.length === 10) {
            cleaned = '91' + cleaned;
            logger.debug(`Added country code: ${cleaned}`);
        }
        
        // Ensure it has correct format - more lenient now
        if (!cleaned.match(/^\d{10,15}$/)) {
            logger.warn(`Phone number ${cleaned} has invalid format`);
            return null;
        }
        
        logger.debug(`Validated phone number: ${cleaned}`);
        return cleaned;
    }
}

module.exports = MessageService; 