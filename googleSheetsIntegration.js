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
async function fetchGoogleSheetData(sheetId, sheetName) {
    try {
        logger.info(`Fetching contacts from Google Sheets with ID: ${sheetId}, Sheet: ${sheetName}...`);
        
        // Validate config parameters
        if (!sheetId) {
            throw new Error('Google Sheet ID is required');
        }
        if (!sheetName) {
            throw new Error('Google Sheet Name is required');
        }
        
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = sheetId;
        const range = `${sheetName}!A:Z`; // Construct range using sheetName
        
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
 * Lists all sheet names within a given Google Spreadsheet ID.
 * @param {string} spreadsheetId - The ID of the Google Spreadsheet.
 * @returns {Promise<Array<string>>} A promise that resolves with an array of sheet names.
 */
async function listSheetNames(spreadsheetId) {
    try {
        logger.info(`Listing sheet names for spreadsheet ID: ${spreadsheetId}...`);
        const sheets = await getGoogleSheetsClient();
        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties.title'
        });

        const sheetNames = response.data.sheets.map(sheet => sheet.properties.title);
        logger.success(`Successfully retrieved ${sheetNames.length} sheet names.`);
        return sheetNames;
    } catch (error) {
        logger.error(`Error listing sheet names for spreadsheet ID ${spreadsheetId}:`, error);
        throw new Error(`Failed to list sheet names: ${error.message}`);
    }
}

module.exports = {
    fetchGoogleSheetData,
    listSheetNames
};