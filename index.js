const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Load configuration
const config = require('./config');

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

// Variable to store paid label
let paidLabel = null;

// Function to fetch and cache the "paid" label
async function getPaidLabel() {
    if (paidLabel) return paidLabel;
    
    try {
        const labels = await client.getLabels();
        logger.info(`Found ${labels.length} labels in WhatsApp Business`);
        
        // Use the configured label name from config
        const configuredLabelName = config.PAID_LABEL_NAME || 'paid';
        logger.info(`Looking for label with name: "${configuredLabelName}" (case sensitive)`);
        
        // Print all available labels for debugging with exact formatting
        if (labels.length > 0) {
            logger.info(`Available labels (exact spelling and capitalization): ${labels.map(l => `"${l.name}"`).join(', ')}`);
        } else {
            logger.warn('No labels found in WhatsApp Business. You need to create labels first.');
            return null;
        }
        
        // First try exact match (preserving case) - this is most reliable
        let exactMatch = labels.find(label => label.name === configuredLabelName);
        if (exactMatch) {
            logger.success(`Found exact match for label: "${exactMatch.name}"`);
            paidLabel = exactMatch;
            return paidLabel;
        }
        
        // Next try specific variations in capitalization (Paid, PAID, paid)
        const capitalVariations = [
            configuredLabelName.toUpperCase(),                   // "PAID"
            configuredLabelName.toLowerCase(),                   // "paid"
            configuredLabelName[0].toUpperCase() + configuredLabelName.slice(1).toLowerCase() // "Paid"
        ];
        
        for (const variation of capitalVariations) {
            const matchedLabel = labels.find(label => label.name === variation);
            if (matchedLabel) {
                logger.info(`Found capital variation match: "${matchedLabel.name}"`);
                paidLabel = matchedLabel;
                return paidLabel;
            }
        }
        
        // Finally try case-insensitive contains 
        logger.info(`No exact match found, trying case-insensitive matching...`);
        const caseInsensitiveMatch = labels.find(label => 
            label.name.toLowerCase() === configuredLabelName.toLowerCase() || 
            label.name.toLowerCase().includes(configuredLabelName.toLowerCase()) ||
            configuredLabelName.toLowerCase().includes(label.name.toLowerCase())
        );
        
        if (caseInsensitiveMatch) {
            logger.info(`Found partial case-insensitive match: "${caseInsensitiveMatch.name}"`);
            paidLabel = caseInsensitiveMatch;
            return paidLabel;
        }
        
        logger.error(`No "${configuredLabelName}" label found in WhatsApp Business. Available labels: ${labels.map(l => `"${l.name}"`).join(', ')}`);
        logger.error('Please create this label first in WhatsApp Business or update PAID_LABEL_NAME in your .env file');
        logger.info('For example: PAID_LABEL_NAME=Paid (match the exact capitalization used in WhatsApp)');
        return null;
    } catch (error) {
        logger.error('Error fetching WhatsApp Business labels:', error);
        // If debug mode is enabled, show more details
        if (config.DEBUG_MODE) {
            logger.debug(`Error details: ${error.stack || error.message}`);
        }
        return null;
    }
}

// Function to filter contacts with the "paid" label
async function filterPaidContacts(contacts) {
    // Check if filtering by paid label is disabled in config
    if (!config.FILTER_BY_PAID_LABEL) {
        logger.info('Filtering by paid label is disabled in config, skipping label filter');
        return contacts;
    }

    const label = await getPaidLabel();
    if (!label) {
        logger.warn('Cannot filter for paid contacts - no paid label found');
        return contacts;
    }
    
    try {
        // Log more info about the contacts we're trying to filter
        logger.info(`Starting filtering of ${contacts.length} contacts using label: "${label.name}"`);
        if (contacts.length > 0) {
            const sampleContact = contacts[0];
            logger.debug(`Sample contact format: ${JSON.stringify(sampleContact)}`);
        }
        
        // Get all chats with the "paid" label
        const paidChats = await label.getChats();
        logger.info(`Found ${paidChats.length} chats with "${label.name}" label (ID: ${label.id})`);
        
        if (paidChats.length === 0) {
            logger.warn(`No chats found with the "${label.name}" label. Make sure you have applied this label to chats in WhatsApp Business.`);
            return [];
        }
        
        // Create a map of phone numbers from the paid chats for faster lookup
        const paidPhoneNumbers = new Set();
        const paidPhoneVariants = new Map(); // Map to store all variants of each number
        
        for (const chat of paidChats) {
            try {
                // Extract the phone number from the chat ID
                if (chat.id && chat.id._serialized) {
                    // Chat IDs are in format "1234567890@c.us" or similar
                    const chatNumber = chat.id._serialized.split('@')[0];
                    if (chatNumber) {
                        // Clean the chat number to match our contact number cleaning format
                        const cleanChatNumber = chatNumber.toString().replace(/[^\d]/g, '');
                        paidPhoneNumbers.add(cleanChatNumber);
                        
                        // Store this number and some potential variants for matching
                        paidPhoneVariants.set(cleanChatNumber, true);
                        
                        // Add common variants (with/without country code)
                        // If number starts with country code (like 91 for India), store version without it
                        if (cleanChatNumber.length > 10) {
                            // Try removing first digit (some country codes are single digit)
                            paidPhoneVariants.set(cleanChatNumber.substring(1), true);
                            
                            // Try removing first two digits (many country codes are two digits)
                            paidPhoneVariants.set(cleanChatNumber.substring(2), true);
                            
                            // Try last 10 digits (standard phone number length in many countries)
                            if (cleanChatNumber.length >= 10) {
                                paidPhoneVariants.set(cleanChatNumber.substring(cleanChatNumber.length - 10), true);
                            }
                        }
                        
                        logger.debug(`Added paid number from chat: ${cleanChatNumber} (original: ${chatNumber})`);
                    }
                }
            } catch (error) {
                logger.debug(`Error extracting number from chat: ${error.message}`);
                continue;
            }
        }
        
        logger.info(`Extracted ${paidPhoneNumbers.size} unique phone numbers from labeled chats`);
        logger.info(`Generated ${paidPhoneVariants.size} total phone number variants for matching`);
        
        // For debugging - log the first few numbers in the set
        if (paidPhoneNumbers.size > 0) {
            const numbersArray = Array.from(paidPhoneNumbers);
            const sampleSize = Math.min(5, numbersArray.length);
            logger.debug(`Sample of paid numbers: ${numbersArray.slice(0, sampleSize).join(', ')}${numbersArray.length > sampleSize ? '...' : ''}`);
        }
        
        // Filter contacts that have their number in the paid phone numbers set
        const filteredContacts = contacts.filter(contact => {
            // Clean the number to ensure consistent format
            const cleanNumber = contact.number.toString().replace(/[^\d]/g, '');
            
            // Try basic match first
            let isMatch = paidPhoneVariants.has(cleanNumber);
            
            // If no match, try variants of this number too
            if (!isMatch) {
                // Create variants of the contact number
                if (cleanNumber.length > 10) {
                    // Try without first digit
                    isMatch = isMatch || paidPhoneVariants.has(cleanNumber.substring(1));
                    
                    // Try without first two digits
                    isMatch = isMatch || paidPhoneVariants.has(cleanNumber.substring(2));
                }
                
                // Try just the last 10 digits
                if (cleanNumber.length >= 10) {
                    isMatch = isMatch || paidPhoneVariants.has(
                        cleanNumber.substring(cleanNumber.length - 10)
                    );
                }
            }
            
            if (isMatch) {
                logger.debug(`Match found for contact: ${contact.name || contact.firstName}, number: ${cleanNumber}`);
            }
            
            return isMatch;
        });
        
        logger.info(`Filtered ${filteredContacts.length} contacts with "${label.name}" label out of ${contacts.length} total contacts`);
        
        if (filteredContacts.length === 0) {
            logger.warn(`No contacts matched with the "${label.name}" label after filtering. 
            Check that your contact numbers in the CSV/Sheet match exactly with the numbers in WhatsApp.`);
        }
        
        return filteredContacts;
    } catch (error) {
        logger.error('Error filtering contacts by paid label:', error);
        logger.warn('Returning all contacts without label filtering due to error');
        return contacts;
    }
}

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

// Force headless mode
client.options.puppeteer.headless = true;
logger.info('Running in headless mode - terminal only');

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
    // Print clear instructions and make the QR code stand out
    console.clear(); // Clear the terminal for better visibility
    console.log('\n\n');
    console.log('='.repeat(60));
    console.log('SCAN THIS QR CODE WITH YOUR WHATSAPP TO LOGIN:');
    console.log('='.repeat(60));
    console.log('\n');
    qrcode.generate(qr, { small: false }); // Use larger QR code for better readability
    console.log('\n');
    console.log('='.repeat(60));
    console.log('After scanning, the app will continue automatically.');
    console.log('='.repeat(60));
    
    qrDisplayed = true;
});

client.on('authenticated', () => {
    logger.success('WhatsApp authentication successful!');
});

client.on('auth_failure', (error) => {
    logger.error('WhatsApp authentication failed', error);
});

client.on('loading_screen', (percent, message) => {
    logger.info(`Loading WhatsApp: ${percent}% - ${message}`);
});

client.on('ready', async () => {
    logger.success('WhatsApp client is ready!');
    
    // Verify label functionality first if we're filtering by label
    if (config.FILTER_BY_PAID_LABEL) {
        const label = await getPaidLabel();
        if (!label) {
            logger.error('WARNING: Label filtering is enabled but no matching label was found!');
            logger.warn('The app will continue, but no contacts will be filtered by label.');
            logger.warn('Please check your WhatsApp Business app and ensure the label exists.');
            
            // Prompt the user to decide whether to continue
            logger.warn('If you want to continue without label filtering, set FILTER_BY_PAID_LABEL=false in your .env file');
            logger.warn('or restart with the --no-label-filter flag.');
            
            // Check if we're running with the --no-label-filter flag
            const args = process.argv.slice(2);
            if (args.includes('--no-label-filter')) {
                logger.info('Continuing without label filtering as --no-label-filter flag was provided');
                config.FILTER_BY_PAID_LABEL = false;
            } else {
                logger.warn('Continuing with label filtering enabled, but this may result in no contacts being messaged');
            }
        } else {
            logger.success(`Successfully connected to WhatsApp and found label: "${label.name}"`);
            
            // Try to fetch some chats with this label to verify it's working
            try {
                const labeledChats = await label.getChats();
                logger.info(`Found ${labeledChats.length} chats with the "${label.name}" label`);
                
                if (labeledChats.length > 0) {
                    logger.success('Label filtering should work correctly!');
                } else {
                    logger.warn(`No chats found with the "${label.name}" label. Make sure you've applied this label to chats in WhatsApp.`);
                }
            } catch (error) {
                logger.error(`Error verifying label chats: ${error.message}`);
            }
        }
    } else {
        logger.info('Label filtering is disabled in config');
    }
    
    // Choose the operation mode based on command line arguments
    const args = process.argv.slice(2);
    
    // Process command-line flags first
    if (args.includes('--no-label-filter')) {
        logger.info('Label filtering disabled via command line flag');
        config.FILTER_BY_PAID_LABEL = false;
    }
    
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
    if (args.includes('--test-labels')) {
        // Label testing mode
        await testLabelFunctionality();
    } else if (args.includes('--csv') && args.length > args.indexOf('--csv') + 1) {
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

/**
 * Test the label functionality
 */
async function testLabelFunctionality() {
    try {
        logger.info('Testing label functionality...');
        
        // Get the paid label
        const label = await getPaidLabel();
        if (!label) {
            logger.error('Label test failed: No matching label found');
            return;
        }
        
        logger.success(`Found label: "${label.name}" with ID ${label.id}`);
        
        // Get chats with this label
        const labeledChats = await label.getChats();
        logger.info(`Found ${labeledChats.length} chats with the "${label.name}" label`);
        
        if (labeledChats.length === 0) {
            logger.warn('No chats found with this label. Please apply the label to some chats in WhatsApp first.');
            return;
        }
        
        // Extract and display sample phone numbers
        const phoneNumbers = new Set();
        for (const chat of labeledChats) {
            try {
                if (chat.id && chat.id._serialized) {
                    const number = chat.id._serialized.split('@')[0];
                    const cleanNumber = number.replace(/[^\d]/g, '');
                    phoneNumbers.add(cleanNumber);
                }
            } catch (error) {
                logger.debug(`Error extracting number from chat: ${error.message}`);
            }
        }
        
        logger.info(`Extracted ${phoneNumbers.size} unique phone numbers from labeled chats`);
        
        if (phoneNumbers.size > 0) {
            const numbersArray = Array.from(phoneNumbers);
            const sampleSize = Math.min(5, numbersArray.length);
            logger.info(`Sample phone numbers: ${numbersArray.slice(0, sampleSize).join(', ')}${numbersArray.length > sampleSize ? '...' : ''}`);
        }
        
        logger.success('Label functionality test completed');
    } catch (error) {
        logger.error('Error testing label functionality:', error);
    }
}

client.initialize();

/**
 * Process contacts from Google Sheets
 */
async function processGoogleSheetContacts(additionalData = {}) {
    try {
        // Fetch contacts from Google Sheets
        const contacts = await fetchGoogleSheetData();
        
        // Filter contacts based on city, blocked numbers, etc.
        const filteredContacts = filterContacts(contacts);
        
        if (filteredContacts.length === 0) {
            logger.warn('No contacts to message after filtering');
            return;
        }
        
        // Filter contacts with "paid" label
        const paidContacts = await filterPaidContacts(filteredContacts);
        
        if (paidContacts.length === 0) {
            logger.warn('No contacts with "paid" label found after filtering');
            return;
        }
        
        logger.info(`Found ${paidContacts.length} contacts with "paid" label out of ${filteredContacts.length} filtered contacts`);
        
        // Prepare contacts with messages
        const preparedContacts = prepareContacts(paidContacts, additionalData);
        
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
        
        // Filter contacts based on city, blocked numbers, etc.
        const filteredContacts = filterContacts(contacts);
        
        if (filteredContacts.length === 0) {
            logger.warn('No contacts to message after filtering');
            return;
        }
        
        // Filter contacts with "paid" label
        const paidContacts = await filterPaidContacts(filteredContacts);
        
        if (paidContacts.length === 0) {
            logger.warn('No contacts with "paid" label found after filtering');
            return;
        }
        
        logger.info(`Found ${paidContacts.length} contacts with "paid" label out of ${filteredContacts.length} filtered contacts`);
        
        // Prepare contacts with messages
        const preparedContacts = prepareContacts(paidContacts, additionalData);
        
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
        
        // If we're filtering by paid label, we'll need to get the label first
        if (config.FILTER_BY_PAID_LABEL) {
            const label = await getPaidLabel();
            if (!label) {
                logger.error('Cannot proceed with stream processing - paid label not found');
                return;
            }
            logger.info(`Will filter by "${label.name}" label during stream processing`);
        }
        
        let count = 0;
        let successCount = 0;
        let failedCount = 0;
        const failedContacts = [];
        
        // Create a temporary array to hold contacts for paid label filtering
        const tempContacts = [];
        const batchSize = Math.min(25, config.BATCH_SIZE * 3); // Use a reasonable batch size
        
        // Stream and process contacts
        await streamCsvFile(csvFilePath, async (contact) => {
            count++;
            
            // Normalize contact fields
            const normalizedContact = normalizeContact(contact);
            
            // Check if contact should be processed
            if (!shouldProcessContact(normalizedContact)) {
                return;
            }
            
            // Add to temporary array for batch filtering
            tempContacts.push(normalizedContact);
            
            // Process in small batches to avoid memory issues
            if (tempContacts.length >= batchSize) {
                // Filter for paid contacts
                const paidBatch = await filterPaidContacts([...tempContacts]);
                logger.info(`Batch filtering: Found ${paidBatch.length} paid contacts out of ${tempContacts.length}`);
                
                // Clear temp array
                tempContacts.length = 0;
                
                if (paidBatch.length > 0) {
                    // Process the paid contacts
                    for (const paidContact of paidBatch) {
                        // Format message for the contact
                        const contactWithMessage = prepareContactMessage(
                            paidContact, 
                            templates[config.MESSAGE_TEMPLATE] || templates.default,
                            additionalData
                        );
                        
                        // Send message
                        const result = await sendMessage(contactWithMessage);
                        
                        if (result.success) {
                            successCount++;
                        } else {
                            failedCount++;
                            failedContacts.push({
                                ...paidContact,
                                error: result.error
                            });
                        }
                    }
                }
            }
        });
        
        // Process any remaining contacts
        if (tempContacts.length > 0) {
            logger.info(`Processing remaining ${tempContacts.length} contacts`);
            
            // Filter for paid contacts
            const paidBatch = await filterPaidContacts([...tempContacts]);
            logger.info(`Final batch: Found ${paidBatch.length} paid contacts out of ${tempContacts.length}`);
            
            if (paidBatch.length > 0) {
                // Process the paid contacts
                for (const paidContact of paidBatch) {
                    // Format message for the contact
                    const contactWithMessage = prepareContactMessage(
                        paidContact, 
                        templates[config.MESSAGE_TEMPLATE] || templates.default,
                        additionalData
                    );
                    
                    // Send message
                    const result = await sendMessage(contactWithMessage);
                    
                    if (result.success) {
                        successCount++;
                    } else {
                        failedCount++;
                        failedContacts.push({
                            ...paidContact,
                            error: result.error
                        });
                    }
                }
            }
        }
        
        // Save failed contacts to a file
        if (failedContacts.length > 0) {
            await saveFailedContacts(failedContacts, csvFilePath);
        }
        
        logger.info(`Stream processing complete. Total: ${count}, Success: ${successCount}, Failed: ${failedCount}`);
    } catch (error) {
        logger.error(`Error stream processing CSV contacts from ${csvFilePath}`, error);
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
    const cleanNumber = (normalizedContact.number || '').replace(/[^\d]/g, '');
    if (!cleanNumber) {
        logger.debug(`Skipping contact with missing number: ${normalizedContact.name}`);
        return false;
    }
    
    if (config.BLOCKED_NUMBERS && config.BLOCKED_NUMBERS.length > 0 && 
        config.BLOCKED_NUMBERS.includes(cleanNumber)) {
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
        const batchSize = config.batchSize || 10;
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
                const batchDelaySeconds = (config.batchDelay || 30000) / 1000;
                logger.info(`Waiting ${batchDelaySeconds} seconds before next batch...`);
                await new Promise(resolve => setTimeout(resolve, config.batchDelay || 30000));
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