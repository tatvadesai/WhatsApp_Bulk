const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const logger = require('./logger');

/**
 * Read contacts from a CSV file
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Array>} Array of contact objects
 */
function readContactsFromCsv(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        
        logger.info(`Reading contacts from CSV file: ${filePath}`);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return reject(new Error(`CSV file not found: ${filePath}`));
        }
        
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
                logger.success(`Successfully read ${results.length} contacts from CSV`);
                resolve(results);
            })
            .on('error', (error) => {
                logger.error(`Error reading CSV file: ${filePath}`, error);
                reject(error);
            });
    });
}

/**
 * Write contacts to a CSV file
 * @param {Array} contacts - Array of contact objects
 * @param {string} filePath - Path where to save the CSV file
 * @param {Array} headers - Array of header objects { id, title }
 * @returns {Promise<void>}
 */
async function writeContactsToCsv(contacts, filePath, headers) {
    try {
        // Ensure the directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Create CSV writer with headers
        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: headers
        });
        
        logger.info(`Writing ${contacts.length} contacts to CSV file: ${filePath}`);
        
        // Write records to file
        await csvWriter.writeRecords(contacts);
        
        logger.success(`Successfully wrote contacts to CSV: ${filePath}`);
    } catch (error) {
        logger.error(`Error writing contacts to CSV: ${filePath}`, error);
        throw error;
    }
}

/**
 * Save failed messages to a CSV file
 * @param {Array} failedContacts - Array of failed contact objects
 * @returns {Promise<string>} Path to the saved CSV file
 */
async function saveFailedContacts(failedContacts) {
    try {
        if (!failedContacts || failedContacts.length === 0) {
            logger.info('No failed contacts to save');
            return null;
        }
        
        // Create a filename with current date and time
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const filePath = path.join(__dirname, '../logs', `failed-messages-${timestamp}.csv`);
        
        // Define headers
        const headers = [
            { id: 'name', title: 'Name' },
            { id: 'firstName', title: 'First Name' },
            { id: 'lastName', title: 'Last Name' },
            { id: 'number', title: 'Number' },
            { id: 'city', title: 'City' },
            { id: 'error', title: 'Error' },
            { id: 'timestamp', title: 'Timestamp' }
        ];
        
        // Add timestamp to each record
        const contactsWithTimestamp = failedContacts.map(contact => ({
            ...contact,
            timestamp: new Date().toISOString()
        }));
        
        // Write to CSV
        await writeContactsToCsv(contactsWithTimestamp, filePath, headers);
        
        return filePath;
    } catch (error) {
        logger.error('Error saving failed contacts', error);
        return null;
    }
}

/**
 * Stream process a CSV file
 * @param {string} filePath - Path to the CSV file
 * @param {Function} rowCallback - Callback function to process each row
 * @returns {Promise<void>}
 */
function streamCsvFile(filePath, rowCallback) {
    return new Promise((resolve, reject) => {
        let count = 0;
        
        logger.info(`Streaming CSV file: ${filePath}`);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return reject(new Error(`CSV file not found: ${filePath}`));
        }
        
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', async (row) => {
                try {
                    // Pause the stream
                    logger.debug(`Processing row ${count + 1}: ${row.name || row.firstName || ''}`);
                    await rowCallback(row, count);
                    count++;
                } catch (error) {
                    logger.error(`Error processing row ${count + 1}`, error);
                }
            })
            .on('end', () => {
                logger.success(`Finished processing ${count} rows from CSV`);
                resolve(count);
            })
            .on('error', (error) => {
                logger.error(`Error streaming CSV file: ${filePath}`, error);
                reject(error);
            });
    });
}

module.exports = {
    readContactsFromCsv,
    writeContactsToCsv,
    saveFailedContacts,
    streamCsvFile
}; 