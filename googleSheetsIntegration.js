const { google } = require('googleapis');
require('dotenv').config();

/**
 * fetchGoogleSheetData
 * Fetches data from Google Sheet and returns formatted contact data
 */
async function fetchGoogleSheetData() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SHEETS_CREDENTIALS_PATH || 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const range = process.env.GOOGLE_SHEET_RANGE || 'Sheet2!A1:F'; // Adjust based on your sheet name and range

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('No data found in the sheet.');
      return [];
    }

    // Skip header row and map data
    const [headers, ...dataRows] = rows;
    const data = dataRows.map(row => ({
      firstName: row[1] || '',
      lastName: row[2] || '',
      email: row[3] || '',
      number: (row[4] || '').replace(/[^\d]/g, ''),
      city: (row[5] || '').trim()
    }));

    console.log(`Fetched ${data.length} contacts from Google Sheets`);
    return data;
  } catch (error) {
    console.error('Error fetching Google Sheets data:', error);
    throw error;
  }
}

module.exports = {
  fetchGoogleSheetData,
};