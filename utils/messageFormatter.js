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
        // Create data object with contact properties and additional data
        const messageData = {
            firstName: contact.firstname || contact.firstName || '',
            lastName: contact.lastname || contact.lastName || '',
            fullName: (contact.firstname || contact.firstName || '') + ' ' + (contact.lastname || contact.lastName || ''),
            city: contact.city || '',
            ...contact,
            ...additionalData
        };
        
        // Format the message
        const formattedMessage = formatMessage(templateContent, messageData);
        
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