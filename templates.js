const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Ensure templates directory exists
if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    logger.info(`Created templates directory: ${TEMPLATES_DIR}`);
}

// Default templates to be created if they don't exist
const defaultTemplates = {
    default: `Hey {firstName}! 😊
Tatva here from GatherAround.

We’re hosting a cozy dinner meetup on {eventDate}—good vibes, great convos, and amazing people. Thought of you instantly. Would love for you to join. 🥂✨

Can I save you a spot? Just say the word and I’ll send over the details.



`,
    followUp: `Hi {firstName},

Just following up on the previous message about the GatherAround dinner on {eventDate}.
Best,
Tatva

P.S. To those who paid, don't worry. You're in.`,
    reminder: `Quick reminder {firstName}!

Our GatherAround dinner is tomorrow at 7 PM.
Looking forward to seeing you there!

Venue: {venue}
`,
    newEvent: `Hello {firstName}!

We're excited to announce a new GatherAround event: {eventName}!

📅 Date: {eventDate}
📍 Location: {venue}
🕖 Time: {eventTime}

Would you like to join us? Let me know and I'll reserve your spot!

Best,
Tatva`,
    custom: `{customMessage}`
};

/**
 * Initializes default templates if they don't exist as files.
 */
function initializeDefaultTemplates() {
    for (const name in defaultTemplates) {
        const filePath = path.join(TEMPLATES_DIR, `${name}.txt`);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, defaultTemplates[name]);
            logger.info(`Created default template file: ${name}.txt`);
        }
    }
}

/**
 * Get all template names.
 * @returns {Promise<Array<string>>} A promise that resolves with an array of template names.
 */
async function getAllTemplateNames() {
    try {
        const files = await fs.promises.readdir(TEMPLATES_DIR);
        return files.filter(file => file.endsWith('.txt')).map(file => file.replace('.txt', ''));
    } catch (error) {
        logger.error('Error reading templates directory:', error);
        return [];
    }
}

/**
 * Get template content by name.
 * @param {string} name The name of the template.
 * @returns {Promise<string|null>} A promise that resolves with the template content or null if not found.
 */
async function getTemplateContent(name) {
    const filePath = path.join(TEMPLATES_DIR, `${name}.txt`);
    try {
        if (fs.existsSync(filePath)) {
            return await fs.promises.readFile(filePath, 'utf8');
        }
        return null;
    } catch (error) {
        logger.error(`Error reading template file ${name}.txt:`, error);
        return null;
    }
}

/**
 * Save a template.
 * @param {string} name The name of the template.
 * @param {string} content The content of the template.
 * @returns {Promise<boolean>} A promise that resolves to true if saved successfully, false otherwise.
 */
async function saveTemplate(name, content) {
    const filePath = path.join(TEMPLATES_DIR, `${name}.txt`);
    try {
        await fs.promises.writeFile(filePath, content, 'utf8');
        logger.info(`Template '${name}' saved successfully.`);
        return true;
    } catch (error) {
        logger.error(`Error saving template '${name}':`, error);
        return false;
    }
}

/**
 * Delete a template.
 * @param {string} name The name of the template.
 * @returns {Promise<boolean>} A promise that resolves to true if deleted successfully, false otherwise.
 */
async function deleteTemplate(name) {
    const filePath = path.join(TEMPLATES_DIR, `${name}.txt`);
    try {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            logger.info(`Template '${name}' deleted successfully.`);
            return true;
        }
        logger.warn(`Template '${name}' not found for deletion.`);
        return false;
    } catch (error) {
        logger.error(`Error deleting template '${name}':`, error);
        return false;
    }
}

// Initialize default templates on module load
initializeDefaultTemplates();

module.exports = {
    getAllTemplateNames,
    getTemplateContent,
    saveTemplate,
    deleteTemplate
};
