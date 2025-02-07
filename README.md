# WhatsApp Mass Messaging Tool

A Node.js application for sending personalized WhatsApp messages to contacts from a Google Sheets database. This tool uses whatsapp-web.js for WhatsApp integration and Google Sheets API for contact management.

## Features

- 📱 Send personalized WhatsApp messages to multiple contacts
- 📊 Fetch contact data from Google Sheets
- 🎯 Filter contacts by city
- 🚫 Block list functionality
- 💬 Customizable message templates
- 🔒 Secure credential management

## Prerequisites

1. Node.js installed on your system
2. A Google Cloud Project with Google Sheets API enabled
3. Google Sheets API credentials (service account)
4. WhatsApp Business account

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd whatsapp-mass
```

2. Install dependencies:
```bash
npm install
```

3. Set up Google Sheets:
   - Create a Google Cloud Project
   - Enable Google Sheets API
   - Create a service account and download credentials
   - Save the credentials file as `credentials.json` in the project root
   - Share your Google Sheet with the service account email

4. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update the variables in `.env` with your values:
     - `GOOGLE_SPREADSHEET_ID`: Your Google Sheet ID
     - `GOOGLE_SHEET_RANGE`: Sheet range (e.g., 'Sheet2!A1:F')
     - `YOUR_NAME`: Your name
     - `ORGANIZATION_NAME`: Your organization name
     - `ORGANIZATION_LINK`: Your organization's link

5. Update the Google Sheet format:
   - Required columns: firstName, lastName, email, number, city
   - Ensure phone numbers are in international format

## Usage

1. Start the application:
```bash
node index.js
```

2. Scan the QR code with WhatsApp when prompted

3. The application will:
   - Fetch contacts from Google Sheets
   - Filter contacts based on allowed cities
   - Send personalized messages
   - Show progress in the console

## Customization

1. Message Template:
   - Edit the MESSAGE_TEMPLATE in .env
   - Use {firstName} as a placeholder for personalization

2. City Filtering:
   - Update ALLOWED_CITIES in index.js

3. Blocked Numbers:
   - Add numbers to BLOCKED_NUMBERS in index.js

## Security Notes

- Never commit `.env` or `credentials.json` to version control
- Keep your Google Sheets credentials secure
- Regularly rotate API credentials
- Use environment variables for sensitive data

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is for legitimate business communication only. Please ensure compliance with WhatsApp's terms of service and local regulations regarding bulk messaging.