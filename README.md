# WhatsApp Mass Messenger

A robust tool for sending personalized WhatsApp messages to multiple contacts, with support for Google Sheets and CSV data sources.

## Features

- 🚀 Send personalized messages to multiple contacts
- 📊 Integration with Google Sheets for contact management
- 📁 CSV file support for offline contact processing
- 📝 Customizable message templates with placeholders
- 🔄 Batch processing to avoid overwhelming your device
- ⏱️ Rate limiting to prevent WhatsApp blocking
- 📈 Detailed logging and error handling
- 🔍 Contact filtering by city and blocked numbers
- 📋 Failed message tracking and reporting

## Prerequisites

- Node.js (v14 or later recommended)
- A WhatsApp account with an active phone number
- For Google Sheets: Google Cloud Platform account with Sheets API enabled

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/whatsapp-mass-messenger.git
   cd whatsapp-mass-messenger
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your configuration settings.

5. For Google Sheets integration, place your service account credentials file in the project directory and update the `GOOGLE_APPLICATION_CREDENTIALS` path in your `.env` file.

## Configuration

The application can be configured using environment variables in the `.env` file:

### Google Sheets Integration
- `GOOGLE_SHEETS_ID`: Your Google Sheet ID (found in the sheet URL)
- `GOOGLE_SHEETS_RANGE`: Range of cells to read (e.g., 'Contacts!A:E')
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to your Google service account credentials file

### Message Configuration
- `MESSAGE_TEMPLATE`: Which template to use (default, followUp, reminder, etc.)
- Event details used in templates: `EVENT_DATE`, `EVENT_VENUE`, `EVENT_NAME`, `EVENT_TIME`

### Contact Filtering
- `ALLOWED_CITIES`: Comma-separated list of cities to include
- `BLOCKED_NUMBERS`: Comma-separated list of phone numbers to exclude

### Sending Configuration
- `MESSAGE_DELAY`: Delay between messages in milliseconds (default: 5000)
- `BATCH_SIZE`: Number of messages to send in each batch (default: 10)
- `BATCH_DELAY`: Delay between batches in milliseconds (default: 30000)
- `MAX_MESSAGES_PER_MINUTE`: Rate limiting setting (default: 30)
- `MAX_RETRY_ATTEMPTS`: How many times to retry failed messages (default: 3)
- `RETRY_DELAY`: Delay between retry attempts in milliseconds (default: 3000)

### Application Settings
- `DEBUG_MODE`: Enable or disable debug mode (true/false)
- `LOG_LEVEL`: Set logging verbosity (debug, info, success, warn, error)

## Usage

### Running with Google Sheets

```bash
node index.js --sheet
```

### Running with a CSV file

```bash
node index.js --csv path/to/your/contacts.csv
```

### Stream processing a CSV file (for large files)

```bash
node index.js --stream path/to/your/contacts.csv
```

## CSV File Format

Your CSV file should have the following format:

```
firstName,lastName,number,city
John,Doe,91XXXXXXXXXX,Vadodara
Jane,Smith,91XXXXXXXXXX,Ahmedabad
```

The column names can be varied (firstName/firstname/first_name, etc.) - the system will try to normalize them.

## Message Templates

Message templates are defined in `templates.js`. You can customize existing templates or add new ones.

Each template can contain placeholders in the format `{placeholderName}` which will be replaced with actual values.

Common placeholders:
- `{firstName}`: Contact's first name
- `{eventDate}`: Date of the event
- `{venue}`: Event venue
- `{eventName}`: Name of the event
- `{eventTime}`: Time of the event

## Output

The application will generate:
- Console output with progress information
- Log files in the `logs` directory
- Failed messages will be saved to CSV files in the `logs` directory for retry

## Notes

- When running for the first time, you'll need to scan a QR code to authenticate WhatsApp
- Subsequent runs will use the saved session (until it expires)
- Be aware of WhatsApp's fair usage policy - excessive messaging may result in your number being banned

## License

MIT

## Support

For any questions or issues, please open an issue on GitHub or contact the author.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.