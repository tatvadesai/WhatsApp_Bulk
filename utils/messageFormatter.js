const templates = require('../templates');
const logger = require('./logger');

/**
 * Format a message by replacing placeholders with actual values
 * @param {string} templateContent - The template content with placeholders
 * @param {Object} data - Object containing values to replace placeholders
 * @returns {string} Formatted message with placeholders replaced
 */
function formatMessage(templateContent, data) {
    try {
        if (!templateContent) {
            logger.error('No template content provided');
            return '';
        }

        // Create a case-insensitive data map
        const lowerCaseData = {};
        for (const key in data) {
            lowerCaseData[key.toLowerCase()] = data[key];
        }
        
        return templateContent.replace(/\{(\w+)\}/g, (match, placeholder) => {
            const lowerCasePlaceholder = placeholder.toLowerCase();
            if (lowerCaseData[lowerCasePlaceholder] !== undefined) {
                return lowerCaseData[lowerCasePlaceholder];
            }
            
            logger.warn(`Placeholder {${placeholder}} not found in data`);
            return match;
        });
    } catch (error) {
        logger.error('Error formatting message', error);
        return templateContent;
    }
}

/**
 * Prepare a contact's message using data and template
 * @param {Object} contact - Contact data
 * @param {string} templateContent - Template content to use
 * @param {Object} additionalData - Additional data to include
 * @returns {Object} Contact with formatted message
 */
function prepareContactMessage(contact, templateContent, additionalData = {}) {
    try {
        logger.debug(`Preparing message for contact: ${JSON.stringify(contact)}`);
        logger.debug(`Using template: ${templateContent.substring(0, 30)}...`);
        logger.debug(`Additional data: ${JSON.stringify(additionalData)}`);
        
        // Normalize the contact to ensure consistent field names
        const normalizedContact = {};
        for (const key in contact) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('first')) {
                normalizedContact.firstName = contact[key];
            } else if (lowerKey.includes('last')) {
                normalizedContact.lastName = contact[key];
            } else {
                normalizedContact[key] = contact[key];
            }
        }

        // Create data object with contact properties and additional data
        const messageData = { ...normalizedContact, ...additionalData };
        
        // For custom templates, directly return the custom message if provided
        if (templateContent === templates.custom && messageData.customMessage) {
            logger.info(`Using custom message: "${messageData.customMessage.substring(0, 30)}..."`);
            return {
                ...normalizedContact,
                message: messageData.customMessage
            };
        }
        
        // Format the message
        const formattedMessage = formatMessage(templateContent, messageData);
        logger.debug(`Formatted message: ${formattedMessage.substring(0, 50)}...`);
        
        // Return the contact object with the formatted message
        return {
            ...normalizedContact,
            message: formattedMessage
        };
    } catch (error) {
        logger.error(`Error preparing message for contact: ${contact.firstname || contact.firstName || 'unknown'}`, error);
        return {
            ...contact,
            message: "Sorry, there was an error preparing your message."
        };
    }
}

module.exports = {
    formatMessage,
    prepareContactMessage
};