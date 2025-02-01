const { google } = require('googleapis');

/**
 * fetchGoogleSheetData
 * Fetches data from Google Sheet and returns formatted contact data
 */
async function fetchGoogleSheetData() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const spreadsheetId = '1T8GIGrEqln4vKCxgy1Itb9nOLHHr8q2HylMK46wQHRc';
    const range = 'Sheet2!A1:F'; // Adjust based on your sheet name and range

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