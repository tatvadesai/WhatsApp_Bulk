const templates = require('../templates');
const logger = require('./logger');

/**
 * Format a message by replacing placeholders with actual values
 * @param {string} templateNameOrContent - Name of the template or custom message content
 * @param {Object} data - Object containing values to replace placeholders
 * @returns {string} Formatted message with placeholders replaced
 */
function formatMessage(templateNameOrContent, data) {
    try {
        // Determine if this is a template name or direct content
        let messageTemplate = templateNameOrContent;
        
        // If it's a template name, get the template content
        if (templates[templateNameOrContent]) {
            messageTemplate = templates[templateNameOrContent];
        }
        
        // Replace all placeholders with their values
        return messageTemplate.replace(/\{(\w+)\}/g, (match, placeholder) => {
            // Check if the placeholder exists in the data
            if (data[placeholder] !== undefined) {
                return data[placeholder];
            }
            
            // Log a warning if placeholder not found
            logger.warn(`Placeholder {${placeholder}} not found in data`);
            return match; // Keep the placeholder as is if no value found
        });
    } catch (error) {
        logger.error('Error formatting message', error);
        return templateNameOrContent; // Return original content in case of error
    }
}

/**
 * Prepare a contact's message using data and template
 * @param {Object} contact - Contact data
 * @param {string} templateName - Template to use
 * @param {Object} additionalData - Additional data to include
 * @returns {Object} Contact with formatted message
 */
function prepareContactMessage(contact, templateName = 'default', additionalData = {}) {
    try {
        // Create data object with contact properties and additional data
        const messageData = {
            firstName: contact.firstname || contact.firstName || '',
            lastName: contact.lastname || contact.lastName || '',
            ...contact,
            ...additionalData
        };
        
        // Format the message
        const formattedMessage = formatMessage(templateName, messageData);
        
        // Return contact with the formatted message
        return {
            ...contact,
            message: formattedMessage
        };
    } catch (error) {
        logger.error(`Error preparing message for contact: ${contact.firstname || contact.firstName || 'unknown'}`, error);
        return contact;
    }
}

module.exports = {
    formatMessage,
    prepareContactMessage
}; 