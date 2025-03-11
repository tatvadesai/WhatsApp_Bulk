const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Load configuration
const config = require('./config');
config.validateConfig();

// Import utilities
const logger = require('./utils/logger');
const RateLimiter = require('./utils/rateLimiter');
const { formatMessage, prepareContactMessage } = require('./utils/messageFormatter');
const { saveFailedContacts, streamCsvFile } = require('./utils/csvHandler');

// Import services
const { fetchGoogleSheetData, streamGoogleSheetData } = require('./googleSheetsIntegration');
const templates = require('./templates');

// Initialize rate limiter
const rateLimiter = new RateLimiter(
    config.MAX_MESSAGES_PER_MINUTE,
    60 * 1000  // 1 minute in milliseconds
);

// Initialize the WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-mass-messenger",
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        headless: true,
        defaultViewport: null,
        timeout: 60000, // Increase timeout to 60 seconds
        ignoreHTTPSErrors: true,
        handleSIGINT: false
    },
    restartOnAuthFail: true,
    qrMaxRetries: 3,
    qrTimeoutMs: 60000
});

// Enable visible browser for debugging if DEBUG_MODE is true
if (config.DEBUG_MODE) {
    logger.info('Debug mode enabled - browser will be visible');
    client.options.puppeteer.headless = false;
}

// Better error handling for client
client.on('disconnected', async (reason) => {
    logger.error(`WhatsApp client disconnected: ${reason}`);
    logger.info('Attempting to restart client...');
    try {
        await client.destroy();
        await client.initialize();
    } catch (error) {
        logger.error('Failed to restart client after disconnect', error);
        process.exit(1);
    }
});

// Handle browser-related errors
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, but log the error
});

// Add session cleanup on start
process.on('exit', async () => {
    if (client) {
        await client.destroy();
    }
});

// Ensure single instance
let qrDisplayed = false;
client.on('qr', (qr) => {
    if (!qrDisplayed) {
        logger.info('Scan the QR code to log in:');
        qrcode.generate(qr, { small: true });
        qrDisplayed = true;
    }
});

// WhatsApp event handlers
client.on('qr', (qr) => {
    logger.info('Scan the QR code to log in:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    logger.success('WhatsApp authentication successful!');
});

client.on('auth_failure', (error) => {
    logger.error('WhatsApp authentication failed', error);
});

client.on('ready', async () => {
    logger.success('WhatsApp client is ready!');
    
    // Choose the operation mode based on command line arguments
    const args = process.argv.slice(2);
    
    // Handle template selection
    if (args.includes('--template')) {
        const templateIndex = args.indexOf('--template');
        const templateName = args[templateIndex + 1];
        if (templateName && templates[templateName]) {
            config.MESSAGE_TEMPLATE = templateName;
            logger.info(`Using template: ${templateName}`);
        } else {
            logger.warn(`Template "${templateName}" not found. Using default template.`);
            config.MESSAGE_TEMPLATE = 'default';
        }
    } else {
        logger.info(`Using template from .env: ${config.MESSAGE_TEMPLATE}`);
    }
    
    // Show available templates for reference
    logger.info(`Available templates: ${Object.keys(templates).join(', ')}`);
    
    // Add event details to the global additionalData object
    const additionalData = {
        eventDate: process.env.EVENT_DATE || 'upcoming date',
        venue: process.env.EVENT_VENUE || 'venue to be announced',
        eventName: process.env.EVENT_NAME || 'GatherAround Event',
        eventTime: process.env.EVENT_TIME || '7:00 PM'
    };
    logger.info(`Event details: ${JSON.stringify(additionalData)}`);
    
    // Process based on mode
    if (args.includes('--csv') && args.length > args.indexOf('--csv') + 1) {
        // CSV mode
        const csvFilePath = args[args.indexOf('--csv') + 1];
        await processCsvContacts(csvFilePath, additionalData);
    } else if (args.includes('--sheet')) {
        // Google Sheets mode
        await processGoogleSheetContacts(additionalData);
    } else if (args.includes('--stream') && args.length > args.indexOf('--stream') + 1) {
        // Stream mode
        const csvFilePath = args[args.indexOf('--stream') + 1];
        await streamProcessContacts(csvFilePath, additionalData);
    } else {
        // Default to Google Sheets mode
        logger.info('No specific mode selected, defaulting to Google Sheets mode');
        await processGoogleSheetContacts(additionalData);
    }
    
    logger.success('Processing complete!');
});

client.initialize();

/**
 * Process contacts from Google Sheets
 */
async function processGoogleSheetContacts(additionalData = {}) {
    try {
        // Fetch contacts from Google Sheets
        const contacts = await fetchGoogleSheetData();
        
        // Filter contacts
        const filteredContacts = filterContacts(contacts);
        
        if (filteredContacts.length === 0) {
            logger.warn('No contacts to message after filtering');
            return;
        }
        
        // Prepare contacts with messages
        const preparedContacts = prepareContacts(filteredContacts, additionalData);
        
        // Send messages in batches
        await sendMessageInBatches(preparedContacts);
    } catch (error) {
        logger.error('Error processing Google Sheet contacts', error);
    }
}

/**
 * Process contacts from a CSV file
 * @param {string} csvFilePath - Path to the CSV file
 */
async function processCsvContacts(csvFilePath, additionalData = {}) {
    try {
        logger.info(`Processing contacts from CSV file: ${csvFilePath}`);
        
        // Import the CSV handler here to avoid circular dependencies
        const { readContactsFromCsv } = require('./utils/csvHandler');
        
        // Read contacts from CSV
        const contacts = await readContactsFromCsv(csvFilePath);
        
        // Filter contacts
        const filteredContacts = filterContacts(contacts);
        
        if (filteredContacts.length === 0) {
            logger.warn('No contacts to message after filtering');
            return;
        }
        
        // Prepare contacts with messages
        const preparedContacts = prepareContacts(filteredContacts, additionalData);
        
        // Send messages in batches
        await sendMessageInBatches(preparedContacts);
    } catch (error) {
        logger.error(`Error processing CSV contacts from ${csvFilePath}`, error);
    }
}

/**
 * Stream and process contacts from a CSV file
 * @param {string} csvFilePath - Path to the CSV file
 */
async function streamProcessContacts(csvFilePath, additionalData = {}) {
    try {
        logger.info(`Stream processing contacts from CSV file: ${csvFilePath}`);
        
        let count = 0;
        let successCount = 0;
        let failedCount = 0;
        const failedContacts = [];
        
        // Process each row in the CSV file
        await streamCsvFile(csvFilePath, async (row) => {
            // Check if this contact should be processed
            if (!shouldProcessContact(row)) {
                logger.debug(`Skipping contact: ${row.firstname || row.firstName || row.name || ''}`);
                return;
            }
            
            count++;
            const contact = prepareContactMessage(row, templates[config.MESSAGE_TEMPLATE] || templates.default, additionalData);
            
            try {
                // Send the message
                const result = await sendMessage(contact);
                if (result.success) {
                    successCount++;
                } else {
                    failedCount++;
                    failedContacts.push({...contact, error: result.error});
                }
            } catch (error) {
                failedCount++;
                failedContacts.push({...contact, error: error.message});
                logger.error(`Error sending to ${contact.firstname || contact.firstName || ''}: ${error.message}`);
            }
        });
        
        // Generate report
        logger.info(`
📊 Messaging Summary:
✅ Successfully sent: ${successCount}
❌ Failed: ${failedCount}
📩 Total processed: ${count}
        `);
        
        // Save failed contacts if any
        if (failedContacts.length > 0) {
            const failedContactsFile = await saveFailedContacts(failedContacts);
            if (failedContactsFile) {
                logger.info(`Failed contacts saved to: ${failedContactsFile}`);
            }
        }
    } catch (error) {
        logger.error(`Error stream processing contacts from ${csvFilePath}`, error);
    }
}

/**
 * Filter contacts based on allowed cities and blocked numbers
 * @param {Array} contacts - Array of contact objects
 * @returns {Array} Filtered contacts
 */
function filterContacts(contacts) {
    const filteredContacts = contacts.filter(contact => {
        // Normalize the contact for consistent property access
        const normalizedContact = normalizeContact(contact);
        
        // Check if this contact should be processed
        return shouldProcessContact(normalizedContact);
    });
    
    logger.info(`Filtered ${contacts.length} contacts down to ${filteredContacts.length}`);
    return filteredContacts;
}

/**
 * Normalize contact object to handle different property naming
 * @param {Object} contact - Contact object
 * @returns {Object} Normalized contact object
 */
function normalizeContact(contact) {
    return {
        firstName: contact.firstname || contact.firstName || contact.first_name || '',
        lastName: contact.lastname || contact.lastName || contact.last_name || '',
        name: contact.name || `${contact.firstname || contact.firstName || ''} ${contact.lastname || contact.lastName || ''}`.trim(),
        number: (contact.number || contact.phone || contact.phoneNumber || contact.phone_number || '').toString(),
        city: contact.city || contact.location || '',
        // Keep original properties
        ...contact
    };
}

/**
 * Check if a contact should be processed based on filtering rules
 * @param {Object} contact - Contact object
 * @returns {boolean} Whether to process this contact
 */
function shouldProcessContact(contact) {
    const normalizedContact = normalizeContact(contact);
    
    // Check if city is allowed (if ALLOWED_CITIES is configured)
    if (config.ALLOWED_CITIES && config.ALLOWED_CITIES.length > 0) {
        const contactCity = (normalizedContact.city || '').trim().toLowerCase();
        
        // Skip contacts with no city if city filtering is enabled
        if (!contactCity) {
            logger.debug(`Skipping contact without city: ${normalizedContact.name}`);
            return false;
        }
        
        // Check if any allowed city matches (including partial matches)
        const cityMatched = config.ALLOWED_CITIES.some(city => 
            contactCity === city.toLowerCase() || 
            contactCity.includes(city.toLowerCase()) ||
            city.toLowerCase().includes(contactCity)
        );
        
        if (!cityMatched) {
            logger.debug(`Contact city "${contactCity}" not in allowed cities list: ${config.ALLOWED_CITIES.join(', ')}`);
            return false;
        }
    }
    
    // Check if number is in blocked list
    const cleanNumber = normalizedContact.number.replace(/[^\d]/g, '');
    if (!cleanNumber) {
        logger.debug(`Skipping contact with missing number: ${normalizedContact.name}`);
        return false;
    }
    
    if (config.BLOCKED_NUMBERS.includes(cleanNumber)) {
        logger.debug(`Skipping blocked number: ${cleanNumber}`);
        return false;
    }
    
    return true;
}

/**
 * Prepare contacts with personalized messages
 * @param {Array} contacts - Array of contact objects
 * @param {Object} additionalData - Additional data for message templates
 * @returns {Array} Contacts with personalized messages
 */
function prepareContacts(contacts, additionalData = {}) {
    // Get the template content from the configured template name
    const templateName = config.MESSAGE_TEMPLATE;
    const templateContent = templates[templateName] || templates.default;
    
    logger.info(`Using message template: ${templateName}`);
    
    // Prepare each contact with personalized message
    return contacts.map(contact => {
        const normalizedContact = normalizeContact(contact);
        return prepareContactMessage(normalizedContact, templateContent, additionalData);
    });
}

/**
 * Send a message to a contact
 * @param {Object} contact - Contact object with message
 * @returns {Object} Result object {success, error}
 */
async function sendMessage(contact) {
    try {
        // Apply rate limiting
        await rateLimiter.throttle();
        
        // Clean the phone number
        const number = contact.number.replace(/[^\d]/g, '');
        if (!number) {
            return { success: false, error: 'Invalid phone number' };
        }
        
        // Create the WhatsApp chat ID
        const chatId = `${number}@c.us`;
        
        // Try to send message with retries
        let attempts = 0;
        let success = false;
        let error = null;
        
        while (attempts < config.MAX_RETRY_ATTEMPTS && !success) {
            try {
                attempts++;
                await client.sendMessage(chatId, contact.message);
                success = true;
                logger.success(`Message sent to ${contact.name || contact.firstName} (${number}) after ${attempts} attempt(s)`);
            } catch (err) {
                error = err;
                
                // Special handling for context destroyed errors
                const isContextError = 
                    err.message?.includes('Execution context was destroyed') || 
                    err.originalMessage?.includes('Execution context was destroyed');
                
                if (isContextError) {
                    logger.warn(`Puppeteer context error detected. Waiting longer before retry...`);
                    // Wait longer for context errors
                    await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY * 3));
                } else {
                    logger.warn(`Attempt ${attempts} failed for ${contact.name || contact.firstName}: ${err.message}`);
                    await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
                }
            }
        }
        
        if (!success) {
            throw new Error(`Failed after ${attempts} attempts: ${error.message || 'Unknown error'}`);
        }
        
        // Wait between messages - add random delay to reduce pattern detection
        const randomDelay = Math.floor(config.MESSAGE_DELAY * (0.8 + Math.random() * 0.4));
        await new Promise(resolve => setTimeout(resolve, randomDelay));
        
        return { success: true };
    } catch (error) {
        logger.error(`Error sending message to ${contact.name || contact.firstName}`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Send messages in batches to avoid overwhelming the system
 * @param {Array} contacts - Array of contact objects with messages
 */
async function sendMessageInBatches(contacts) {
    try {
        const totalContacts = contacts.length;
        const batchSize = config.BATCH_SIZE;
        const totalBatches = Math.ceil(totalContacts / batchSize);
        
        let successCount = 0;
        let failedCount = 0;
        const failedContacts = [];
        
        logger.info(`Processing ${totalContacts} contacts in ${totalBatches} batches of ${batchSize}`);
        
        // Process in batches
        for (let i = 0; i < totalContacts; i += batchSize) {
            const batch = contacts.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            
            logger.info(`Processing batch ${batchNumber}/${totalBatches} (contacts ${i+1}-${Math.min(i+batchSize, totalContacts)})`);
            
            // Process each contact in the batch
            for (const contact of batch) {
                try {
                    const result = await sendMessage(contact);
                    if (result.success) {
                        successCount++;
                    } else {
                        failedCount++;
                        failedContacts.push({...contact, error: result.error});
                    }
                } catch (error) {
                    failedCount++;
                    failedContacts.push({...contact, error: error.message});
                    logger.error(`Error in batch ${batchNumber}, contact ${contact.name || contact.firstName}`, error);
                }
            }
            
            // If not the last batch, wait between batches
            if (i + batchSize < totalContacts) {
                logger.info(`Waiting ${config.BATCH_DELAY/1000} seconds before next batch...`);
                await new Promise(resolve => setTimeout(resolve, config.BATCH_DELAY));
            }
        }
        
        // Generate report
        logger.info(`
📊 Messaging Summary:
✅ Successfully sent: ${successCount}
❌ Failed: ${failedCount}
📩 Total: ${totalContacts}
        `);
        
        // Save failed contacts if any
        if (failedContacts.length > 0) {
            const failedContactsFile = await saveFailedContacts(failedContacts);
            if (failedContactsFile) {
                logger.info(`Failed contacts saved to: ${failedContactsFile}`);
            }
        }
        
        logger.success('Bulk messaging completed!');
    } catch (error) {
        logger.error('Error in batch processing', error);
    }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Closing WhatsApp client...');
    await client.destroy();
    logger.info('WhatsApp client closed. Exiting...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Closing WhatsApp client...');
    await client.destroy();
    logger.info('WhatsApp client closed. Exiting...');
    process.exit(0);
});