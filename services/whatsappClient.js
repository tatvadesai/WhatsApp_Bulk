const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('../config');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class WhatsAppClient extends EventEmitter {
    constructor(io) {
        super();
        this.client = null;
        this.isReady = false;
        this.isPaused = false;
        this.io = io; // Socket.io instance for real-time updates
        this.paidLabel = null;
        this.initAttempts = 0;
        this.maxInitAttempts = 3;
        this.restartTimeout = null;
    }

    initialize() {
        this.initAttempts++;
        logger.info(`Initializing WhatsApp client (attempt ${this.initAttempts}/${this.maxInitAttempts})...`);
        
        // Clear any previous restart timeouts
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }
        
        // Enhance browser options for better stability
        const puppeteerOptions = {
            args: [
                ...config.PUPPETEER_ARGS,
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials'
            ],
            timeout: config.BROWSER_TIMEOUT,
            headless: 'new', // Use new headless mode for better stability
            defaultViewport: null,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH // Allow custom Chrome path
        };
        
        logger.debug(`Using Puppeteer options: ${JSON.stringify(puppeteerOptions)}`);
        
        // Create a new client with enhanced options
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './auth_data' // Specify auth data path explicitly
            }),
            puppeteer: puppeteerOptions,
            webVersionCache: {
                type: 'remote', // Use remote cache for better stability
                remotePath: './.wwebjs_cache'
            },
            webVersion: '2.2337.7', // Explicitly set a stable version
            restartOnAuthFail: true, // Automatically restart on auth failure
        });

        // Set up event listeners
        this.client.on('qr', (qr) => {
            this._handleQrCode(qr);
        });

        this.client.on('ready', () => {
            this._handleReady();
            // Reset init attempts on success
            this.initAttempts = 0;
        });

        this.client.on('authenticated', () => {
            logger.info('WhatsApp client authenticated');
            this.emit('authenticated');
            if (this.io) this.io.emit('status', { status: 'authenticated', message: 'WhatsApp client authenticated' });
        });

        this.client.on('auth_failure', (msg) => {
            logger.error('WhatsApp authentication failed:', msg);
            this.emit('error', { type: 'auth_failure', message: msg });
            if (this.io) this.io.emit('status', { status: 'error', message: 'Authentication failed: ' + msg });
            this._handleInitError(new Error(`Authentication failed: ${msg}`));
        });

        this.client.on('disconnected', (reason) => {
            logger.warn('WhatsApp client disconnected:', reason);
            this.isReady = false;
            this.emit('disconnected', reason);
            if (this.io) this.io.emit('status', { status: 'disconnected', message: 'Disconnected: ' + reason });
            this._handleDisconnect(reason);
        });

        // Additional error handlers
        this.client.on('change_state', (state) => {
            logger.debug(`WhatsApp connection state changed to: ${state}`);
            if (this.io) this.io.emit('status', { status: 'state_change', message: `Connection state: ${state}` });
        });

        // Handle errors that might occur during initialization
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            if (reason && reason.toString().includes('WhatsApp')) {
                this._handleInitError(reason);
            }
        });

        // Initialize the client with a timeout safeguard
        const initTimeout = setTimeout(() => {
            logger.error('WhatsApp initialization timed out');
            if (this.io) this.io.emit('status', { 
                status: 'error', 
                message: 'WhatsApp initialization timed out. Will retry automatically.' 
            });
            this._handleInitError(new Error('Initialization timed out'));
        }, 120000); // 2 minutes timeout

        try {
            this.client.initialize()
                .catch(err => {
                    logger.error('Error during WhatsApp initialization:', err);
                    this._handleInitError(err);
                })
                .finally(() => {
                    clearTimeout(initTimeout);
                });
        } catch (error) {
            clearTimeout(initTimeout);
            logger.error('Unexpected error during WhatsApp initialization:', error);
            this._handleInitError(error);
        }
        
        return this;
    }

    async getPaidLabel() {
        if (this.paidLabel) return this.paidLabel;
        
        try {
            const labels = await this.client.getLabels();
            const foundPaidLabel = labels.find(label => 
                label.name.toLowerCase() === config.PAID_LABEL_NAME.toLowerCase() || 
                label.name.toLowerCase().includes(config.PAID_LABEL_NAME.toLowerCase())
            );
            
            if (!foundPaidLabel) {
                logger.warn(`No "${config.PAID_LABEL_NAME}" label found in WhatsApp Business.`);
                return null;
            }
            
            this.paidLabel = foundPaidLabel;
            logger.info(`Found "${config.PAID_LABEL_NAME}" label with ID: ${this.paidLabel.id}`);
            return this.paidLabel;
        } catch (error) {
            logger.error('Error fetching WhatsApp Business labels:', error);
            return null;
        }
    }

    async getContactsWithPaidLabel() {
        try {
            const paidLabel = await this.getPaidLabel();
            if (!paidLabel) {
                logger.warn('Cannot get contacts with paid label: No paid label found');
                return [];
            }

            logger.info(`Getting contacts with label: ${paidLabel.name} (${paidLabel.id})`);
            
            // First try to get chats with the label (newer API versions)
            try {
                const labeledChats = await this.client.getChatsByLabelId(paidLabel.id);
                if (labeledChats && labeledChats.length > 0) {
                    logger.info(`Found ${labeledChats.length} chats with the paid label`);
                    
                    // Extract phone numbers from the labeled chats
                    const paidNumbers = labeledChats.map(chat => {
                        if (chat.isGroup) return null;
                        return chat.id._serialized.split('@')[0];
                    }).filter(Boolean);
                    
                    logger.info(`Extracted ${paidNumbers.length} phone numbers with paid label`);
                    return paidNumbers;
                }
            } catch (e) {
                logger.warn(`getChatsByLabelId method failed, trying alternative approach: ${e.message}`);
            }
            
            // If the above fails, or if there are no labeled chats, fall back to getting all chats
            // and then checking each one for the label (this is less efficient but more compatible)
            logger.info('Falling back to manual chat label checking');
            const allChats = await this.client.getChats();
            const nonGroupChats = allChats.filter(chat => !chat.isGroup);
            
            logger.info(`Checking ${nonGroupChats.length} chats for the paid label`);
            
            const paidChats = [];
            for (const chat of nonGroupChats) {
                try {
                    const chatLabels = await chat.getLabels();
                    if (chatLabels.includes(paidLabel.id)) {
                        const phoneNumber = chat.id._serialized.split('@')[0];
                        paidChats.push(phoneNumber);
                    }
                } catch (e) {
                    logger.warn(`Error checking labels for chat ${chat.name}: ${e.message}`);
                }
            }
            
            logger.info(`Found ${paidChats.length} chats with the paid label`);
            return paidChats;
        } catch (error) {
            logger.error('Error getting contacts with paid label:', error);
            return [];
        }
    }

    async hasLabel(contactId, labelId) {
        try {
            if (!this.client) {
                logger.warn('WhatsApp client not initialized');
                return false;
            }
            
            if (!contactId || !labelId) {
                logger.warn('Missing contactId or labelId');
                return false;
            }
            
            // Format contact ID if needed
            const formattedContactId = contactId.includes('@c.us') 
                ? contactId 
                : `${contactId}@c.us`;
            
            // Try to get the chat
            const chat = await this.client.getChatById(formattedContactId);
            if (!chat) {
                logger.warn(`Chat not found for contact ${contactId}`);
                return false;
            }
            
            // Get labels for the chat
            const chatLabels = await chat.getLabels();
            return chatLabels.includes(labelId);
        } catch (error) {
            logger.error(`Error checking if contact ${contactId} has label ${labelId}:`, error);
            return false;
        }
    }

    async sendMessage(to, message) {
        if (!this.isReady) {
            throw new Error('WhatsApp client is not ready');
        }
        
        if (this.isPaused) {
            throw new Error('Message sending is paused');
        }

        try {
            const chatId = this._formatNumber(to);
            logger.debug(`Sending message to ${to} (formatted as ${chatId})`);
            
            // Handle both string and object messages
            let messageContent = message;
            if (typeof message === 'object' && message.message) {
                messageContent = message.message;
            }
            
            logger.debug(`Message content: ${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}`);
            
            const result = await this.client.sendMessage(chatId, messageContent);
            logger.info(`Successfully sent message to ${to}`);
            return result;
        } catch (error) {
            logger.error(`Failed to send message to ${to}:`, error);
            throw error;
        }
    }

    pause() {
        this.isPaused = true;
        logger.info('Message sending paused');
        if (this.io) this.io.emit('status', { status: 'paused', message: 'Message sending paused' });
        return this.isPaused;
    }

    resume() {
        this.isPaused = false;
        logger.info('Message sending resumed');
        if (this.io) this.io.emit('status', { status: 'resumed', message: 'Message sending resumed' });
        return this.isPaused;
    }

    getStatus() {
        return {
            isReady: this.isReady,
            isPaused: this.isPaused
        };
    }

    // Private methods
    _handleQrCode(qr) {
        logger.info('QR Code received, scan to authenticate');
        
        // Display QR in terminal
        qrcode.generate(qr, { small: true });
        
        // Generate QR code for web interface
        const qrCodeData = qr;
        this.emit('qr', qrCodeData);
        
        // Send to web interface if socket.io is available
        if (this.io) {
            this.io.emit('qr', qrCodeData);
            this.io.emit('status', { status: 'qr_received', message: 'QR Code received, scan to authenticate' });
        }
    }

    _handleReady() {
        this.isReady = true;
        logger.info('WhatsApp client is ready');
        this.emit('ready');
        
        if (this.io) {
            this.io.emit('status', { status: 'ready', message: 'WhatsApp client is ready' });
        }
    }

    _formatNumber(number) {
        // Remove any non-numeric characters
        let cleaned = number.toString().replace(/\D/g, '');
        
        // Ensure it has country code
        if (!cleaned.startsWith('1') && !cleaned.startsWith('+')) {
            // Check if it already has a country code
            if (cleaned.length > 10 && cleaned.startsWith('91')) {
                // Already has India country code
            } else if (cleaned.length === 10) {
                // Add India country code
                cleaned = '91' + cleaned;
            }
        }
        
        logger.debug(`Formatted number for WhatsApp: ${cleaned}@c.us`);
        
        // Add @ for WhatsApp Web.js format
        return cleaned + '@c.us';
    }

    // Private helper methods
    _handleInitError(error) {
        logger.error(`WhatsApp initialization error: ${error.message}`);
        
        if (this.io) {
            this.io.emit('status', { 
                status: 'error', 
                message: `Initialization error: ${error.message}. ${this.initAttempts < this.maxInitAttempts ? 'Will retry shortly.' : 'Max retries reached.'}`
            });
        }
        
        // Clean up current client
        if (this.client) {
            try {
                this.client.destroy();
            } catch (e) {
                logger.warn('Error destroying WhatsApp client:', e);
            }
            this.client = null;
        }
        
        // Retry if under the max attempts
        if (this.initAttempts < this.maxInitAttempts) {
            const delay = Math.pow(2, this.initAttempts) * 5000; // Exponential backoff
            logger.info(`Will retry WhatsApp initialization in ${delay/1000} seconds...`);
            
            this.restartTimeout = setTimeout(() => {
                this.initialize();
            }, delay);
        } else {
            logger.error(`Failed to initialize WhatsApp after ${this.maxInitAttempts} attempts. Please restart the application.`);
            if (this.io) {
                this.io.emit('status', { 
                    status: 'fatal_error', 
                    message: `Failed to initialize WhatsApp after ${this.maxInitAttempts} attempts. Please refresh the page or restart the application.`
                });
            }
        }
    }
    
    _handleDisconnect(reason) {
        // If disconnection wasn't user-initiated, attempt to reconnect
        if (reason !== 'userTriggered' && this.initAttempts < this.maxInitAttempts) {
            logger.info('Attempting to reconnect to WhatsApp...');
            if (this.io) {
                this.io.emit('status', { 
                    status: 'reconnecting', 
                    message: 'Attempting to reconnect to WhatsApp...'
                });
            }
            
            // Wait a bit before reconnecting
            const delay = 5000;
            this.restartTimeout = setTimeout(() => {
                this.initialize();
            }, delay);
        }
    }

    // Method to properly destroy client and free resources
    destroy() {
        logger.info('Destroying WhatsApp client...');
        
        // Clear any pending timeouts
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }
        
        // Remove all listeners to prevent memory leaks
        this.removeAllListeners();
        
        // Destroy the client if it exists
        if (this.client) {
            try {
                // Attempt to properly close the browser
                this.client.destroy().catch(err => {
                    logger.warn('Error while destroying WhatsApp client:', err);
                });
                this.client = null;
            } catch (error) {
                logger.warn('Exception while destroying WhatsApp client:', error);
            }
        }
        
        this.isReady = false;
        this.isPaused = false;
        
        logger.info('WhatsApp client destroyed');
    }
}

module.exports = WhatsAppClient; 