const { google } = require('googleapis');
const fs = require('fs');
const config = require('./config');
const logger = require('./utils/logger');

/**
 * Get authenticated Google Sheets client
 * @returns {Promise<Object>} Google Sheets client
 */
async function getGoogleSheetsClient() {
    try {
        // Check if credentials file exists
        if (!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
            throw new Error(`Google credentials file not found at: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
        }
        
        // Load service account credentials
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        
        const client = await auth.getClient();
        return google.sheets({ version: 'v4', auth: client });
    } catch (error) {
        logger.error('Failed to initialize Google Sheets client', error);
        throw error;
    }
}

/**
 * Fetch contact data from Google Sheets
 * @returns {Promise<Array>} Array of contact objects
 */
async function fetchGoogleSheetData() {
    try {
        logger.info('Fetching contacts from Google Sheets...');
        
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = config.GOOGLE_SHEETS_ID;
        const range = config.GOOGLE_SHEETS_RANGE;
        
        logger.debug(`Reading spreadsheet ID: ${spreadsheetId}, range: ${range}`);
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        
        // Get the header row and data rows
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            logger.warn('No data found in Google Sheet');
            return [];
        }
        
        const headers = rows[0].map(header => header.toLowerCase().trim().replace(/\s+/g, ''));
        
        // Convert the rows to objects using the headers as keys
        const contacts = rows.slice(1).map(row => {
            const contact = {};
            headers.forEach((header, index) => {
                if (index < row.length) {
                    contact[header] = row[index] || '';
                } else {
                    contact[header] = '';
                }
            });
            return contact;
        });
        
        logger.success(`Successfully retrieved ${contacts.length} contacts from Google Sheets`);
        return contacts;
    } catch (error) {
        logger.error('Error fetching data from Google Sheets', error);
        throw error;
    }
}

/**
 * Stream data from Google Sheets for processing large amounts of data
 * @param {Function} rowCallback - Callback function to process each row
 * @returns {Promise<void>}
 */
async function streamGoogleSheetData(rowCallback) {
    try {
        logger.info('Streaming contacts from Google Sheets...');
        
        const contacts = await fetchGoogleSheetData();
        let processedCount = 0;
        
        // Process each contact one by one
        for (const contact of contacts) {
            await rowCallback(contact, processedCount);
            processedCount++;
        }
        
        logger.success(`Finished streaming ${processedCount} contacts`);
    } catch (error) {
        logger.error('Error in Google Sheets streaming', error);
        throw error;
    }
}

module.exports = {
    fetchGoogleSheetData,
    streamGoogleSheetData
};