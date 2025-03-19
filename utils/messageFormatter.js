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
        
        return templateContent.replace(/\{(\w+)\}/g, (match, placeholder) => {
            if (data[placeholder] !== undefined) {
                return data[placeholder];
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
        
        // Create data object with contact properties and additional data
        const messageData = {
            firstName: contact.firstname || contact.firstName || '',
            lastName: contact.lastname || contact.lastName || '',
            fullName: (contact.firstname || contact.firstName || '') + ' ' + (contact.lastname || contact.lastName || ''),
            city: contact.city || '',
            // Include default event data
            eventDate: process.env.EVENT_DATE || 'TBD',
            eventName: process.env.EVENT_NAME || 'our event',
            eventTime: process.env.EVENT_TIME || 'TBD',
            venue: process.env.EVENT_VENUE || 'TBD',
            ...contact,
            ...additionalData
        };
        
        // For custom templates, directly return the custom message if provided
        if (templateContent === templates.custom && messageData.customMessage) {
            logger.info(`Using custom message: "${messageData.customMessage.substring(0, 30)}..."`);
            return {
                ...contact,
                message: messageData.customMessage
            };
        }
        
        // Format the message
        const formattedMessage = formatMessage(templateContent, messageData);
        logger.debug(`Formatted message: ${formattedMessage.substring(0, 50)}...`);
        
        // Return the contact object with the formatted message
        return {
            ...contact,
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