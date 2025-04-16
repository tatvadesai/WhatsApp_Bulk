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
        
        logger.info(`Using Google credentials file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
        
        // Load service account credentials
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        
        logger.info('Google Auth object created successfully');
        
        const client = await auth.getClient();
        logger.info('Google Auth client obtained successfully');
        
        return google.sheets({ version: 'v4', auth: client });
    } catch (error) {
        logger.error('Failed to initialize Google Sheets client', error);
        throw new Error(`Google Sheets client initialization failed: ${error.message}`);
    }
}

/**
 * Fetch contact data from Google Sheets
 * @returns {Promise<Array>} Array of contact objects
 */
async function fetchGoogleSheetData() {
    try {
        logger.info('Fetching contacts from Google Sheets...');
        
        // Log all available config properties for debugging
        logger.info('Current config values:');
        logger.info(JSON.stringify({
            googleSheetId: config.googleSheetId,
            googleSheetsRange: config.googleSheetsRange,
            googleApplicationCredentials: config.googleApplicationCredentials
        }));
        
        // Validate config parameters
        if (!config.googleSheetId) {
            throw new Error('GOOGLE_SHEETS_ID is not configured in .env file');
        }
        
        if (!config.googleSheetsRange) {
            throw new Error('GOOGLE_SHEETS_RANGE is not configured in .env file');
        }
        
        logger.info(`Using spreadsheet ID: ${config.googleSheetId}, range: ${config.googleSheetsRange}`);
        
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = config.googleSheetId;
        const range = config.googleSheetsRange;
        
        logger.debug(`Reading spreadsheet ID: ${spreadsheetId}, range: ${range}`);
        
        try {
            logger.info(`Calling sheets.spreadsheets.values.get with ID ${spreadsheetId} and range ${range}`);
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
            
            // Log the headers to debug
            logger.debug(`Raw headers from sheet: ${JSON.stringify(rows[0])}`);
            
            const headers = rows[0].map(header => header.toLowerCase().trim().replace(/\s+/g, ''));
            
            // Log processed headers
            logger.debug(`Processed headers: ${JSON.stringify(headers)}`);
            
            // Convert the rows to objects using the headers as keys
            const contacts = rows.slice(1).map((row, index) => {
                const contact = {};
                headers.forEach((header, colIndex) => {
                    if (colIndex < row.length) {
                        contact[header] = row[colIndex] || '';
                    } else {
                        contact[header] = '';
                    }
                });
                
                // Log the first few contacts for debugging
                if (index < 2) {
                    logger.debug(`Contact ${index+1}: ${JSON.stringify(contact)}`);
                }
                
                return contact;
            });
            
            logger.success(`Successfully retrieved ${contacts.length} contacts from Google Sheets`);
            return contacts;
        } catch (error) {
            // Specific error for spreadsheet API call
            logger.error(`Google Sheets API error: ${error.message}`);
            if (error.errors && error.errors.length > 0) {
                logger.error(`API error details: ${JSON.stringify(error.errors)}`);
            }
            throw new Error(`Failed to access Google Sheets: ${error.message}`);
        }
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