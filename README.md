# WhatsApp Mass Messenger

A simple tool to send personalized WhatsApp messages to multiple contacts from Google Sheets or CSV files.

## 🚀 Quick Start Guide

### Step 1: Setup Your Environment
1. Clone this repository
2. Install dependencies: `npm install`
3. Configure your `.env` file (copy from `.env.example` and modify)

### Step 2: Set Up Google Sheets (Recommended Method)
1. Create a Google Sheet with your contacts
2. Column headers should include:
   - `firstName` or `firstname` (required)
   - `lastName` or `lastname` (optional)
   - `number` or `phone` (required, with country code)
   - `city` (optional, for filtering)
3. Get Google Sheets credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a project, enable Google Sheets API
   - Create service account & download JSON credentials
   - Save as `credentials.json` in project root
4. Update your `.env` file with:
   - `GOOGLE_SHEETS_ID=your-sheet-id`
   - `GOOGLE_SHEETS_RANGE=Sheet1!A:E` (adjust as needed)

### Step 3: Configure Your Message and Filters

1. Edit your `.env` file:
   ```
   # Choose template (see templates.js for options)
   MESSAGE_TEMPLATE=default
   
   # Event details (will replace placeholder in templates)
   EVENT_DATE=8th March
   EVENT_VENUE=The Grand Hall, Vadodara
   EVENT_NAME=GatherAround Dinner
   EVENT_TIME=8:30 PM
   
   # Filter by cities (comma-separated, case insensitive)
   ALLOWED_CITIES=Vadodara,Ahmedabad,Gandhinagar
   
   # Blocked numbers (comma-separated)
   BLOCKED_NUMBERS=911234567890,919876543210
   ```

2. Customize message templates in `templates.js` file if needed

### Step 4: Run the Application

#### Using Google Sheets:
```bash
node index.js --sheet --template default
```

#### Using CSV file:
```bash
node index.js --csv contacts.csv --template default
```

The first time you run the app, you'll need to scan a QR code to authenticate WhatsApp Web.

## 📝 How to Modify Settings

### 1. Changing Message Templates

You can change message templates in two ways:

#### Method 1: Update the .env file
1. Open your `.env` file
2. Find or add the `MESSAGE_TEMPLATE` line
3. Set it to one of the template names defined in `templates.js`:
   ```
   MESSAGE_TEMPLATE=default      # Default invitation
   MESSAGE_TEMPLATE=followUp     # Follow-up message
   MESSAGE_TEMPLATE=reminder     # Event reminder
   MESSAGE_TEMPLATE=newEvent     # New event announcement
   MESSAGE_TEMPLATE=custom       # Custom message
   ```

#### Method 2: Use command line arguments
```bash
node index.js --sheet --template followUp
```
This overrides the template specified in your `.env` file.

#### Method 3: Customize the template files
1. Open `templates.js` in a text editor
2. Modify existing templates or add new ones:
   ```javascript
   const templates = {
     default: `Hey {firstName}! ✨  
   
   Hope you're doing great! This is Tatva from GatherAround...`,
     
     // Add or modify templates here
     myNewTemplate: `Hello {firstName}!
   This is my custom message with {eventDate} as the date.`
   };
   ```
3. Use your new template name in the `.env` file or command line

### 2. Updating Allowed Cities

To change which cities receive messages:

1. Open your `.env` file
2. Find or add the `ALLOWED_CITIES` line
3. Enter a comma-separated list of cities:
   ```
   ALLOWED_CITIES=Vadodara,Ahmedabad,Gandhinagar,Mumbai,Delhi
   ```
4. No spaces between commas
5. City matching is case-insensitive and supports partial matches

To send to all cities (no filtering):
```
ALLOWED_CITIES=
```
(Leave it empty or comment out the line)

### 3. Managing Blocked Contacts

To prevent specific contacts from receiving messages:

1. Open your `.env` file
2. Find or add the `BLOCKED_NUMBERS` line
3. Enter a comma-separated list of phone numbers (with country code):
   ```
   BLOCKED_NUMBERS=919876543210,918765432109
   ```
4. No spaces between commas
5. Include the complete number with country code
6. No dashes, spaces, or special characters

To clear the blocked list:
```
BLOCKED_NUMBERS=
```
(Leave it empty or comment out the line)

### 4. Applying Changes

After modifying any settings:

1. Save your `.env` file
2. No need to restart the application if you haven't run it yet
3. If the application is already running, stop it (Ctrl+C) and restart it

For template changes made in `templates.js`:
1. Save the file
2. Restart the application to apply changes

## 🔍 Troubleshooting Tips

### City Filtering Not Working?
- Check that contact cities match exactly with your ALLOWED_CITIES list (case insensitive)
- The app now supports partial matching, but the city field must be present
- If using Google Sheets, make sure the 'city' column exists and has values

### Messages Not Sending?

If you're experiencing issues with messages not being sent, try these steps:

1. **Check the contact data**:
   - Make sure your Google Sheet has a column named `number`, `phone`, `phonenumber`, or similar
   - Phone numbers should include country code (e.g., 919876543210) or be 10 digits (the system will add '91' prefix)
   - Verify that the phone numbers are valid WhatsApp numbers

2. **Enable Debug Mode**:
   - Open your `.env` file and set `DEBUG_MODE=true`
   - Also set `LOG_LEVEL=debug`
   - Restart the server
   - Check the logs for detailed information about what's happening

3. **Try Sending to All Contacts**:
   - The "Send to ALL Contacts" button bypasses most filtering and will send to all contacts
   - This can help identify if the issue is with filtering or with the actual sending

4. **Check the Activity Log in the UI**:
   - The web interface provides real-time feedback about what's happening
   - Look for error messages or warnings that might indicate the issue

5. **Check WhatsApp Connection**:
   - Make sure your WhatsApp client shows as "Connected" in the sidebar
   - Try scanning the QR code again if needed

### Message Template Issues?
- Check that your template placeholders use single braces: `{firstName}`
- Available placeholders: `{firstName}`, `{lastName}`, `{fullName}`, `{city}`, `{eventDate}`, `{venue}`, `{eventName}`, `{eventTime}`
- Make sure your EVENT_* environment variables are set correctly

### Browser/Puppeteer Errors
If you encounter errors like `Execution context was destroyed` or other Puppeteer-related issues:

1. **Increase timeout and retry settings** in your `.env` file:
   ```
   MAX_RETRY_ATTEMPTS=5
   RETRY_DELAY=10000
   ```

2. **Try with a slower sending rate**:
   ```
   MESSAGE_DELAY=8000
   BATCH_SIZE=5
   MAX_MESSAGES_PER_MINUTE=15
   ```

3. **Restart your computer** before running the app (clears browser processes)

4. **Run with a visible browser** (for debugging):
   Add this line to your `.env` file:
   ```
   DEBUG_MODE=true
   ```
   Then add this to your `index.js` right after const client definition:
   ```javascript
   if (config.DEBUG_MODE) {
     client.options.puppeteer.headless = false;
   }
   ```

5. **Make sure WhatsApp Web works in your normal browser** first

The app now has better error handling for browser issues and will automatically retry with longer delays if these errors occur.

## 🛠 Advanced Configuration

### Rate Limiting and Batch Settings
```
MESSAGE_DELAY=5000      # Delay between each message (ms)
BATCH_SIZE=10           # Messages per batch
BATCH_DELAY=30000       # Delay between batches (ms)
MAX_MESSAGES_PER_MINUTE=30  # Rate limiting
```

### Command Line Arguments
- `--sheet`: Use Google Sheets source
- `--csv filename.csv`: Use CSV file source
- `--template templateName`: Override template in .env
- `--stream filename.csv`: Process larger CSV files in streaming mode

## 📝 Examples

### Send follow-up messages to Gandhinagar contacts
1. Set environment variables:
```
MESSAGE_TEMPLATE=followUp
ALLOWED_CITIES=Gandhinagar
EVENT_DATE=March 8th
```
2. Run: `node index.js --sheet`

### Send event reminders to all cities
1. Set environment variables:
```
MESSAGE_TEMPLATE=reminder
ALLOWED_CITIES=Vadodara,Ahmedabad,Gandhinagar
EVENT_VENUE=The Grand Hall, Vadodara
```
2. Run: `node server.js --sheet`

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
node server.js --csv path/to/your/contacts.csv
```

### Stream processing a CSV file (for large files)

```bash
node server.js --stream path/to/your/contacts.csv
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

## 🆕 Web Interface

The WhatsApp Mass Messenger now includes a web interface for easier management of your messaging campaigns!

### Features

- **Real-time Dashboard**: Monitor message sending progress with live updates
- **WhatsApp QR Code**: Scan the QR code directly from the web interface
- **Contact Management**: Load and filter contacts from Google Sheets or CSV files
- **Message Control**: Pause, resume, or clear the message queue at any time
- **Template Selection**: Choose from different message templates or create custom messages
- **Activity Logging**: View detailed logs of all operations

### How to Use the Web Interface

1. Start the server: `npm start`
2. Open your browser and navigate to `http://localhost:3000`
3. Scan the WhatsApp QR code when prompted
4. Load your contacts from Google Sheets or a CSV file
5. Apply filters if needed
6. Select a message template and customize it
7. Click "Send Messages" to start the campaign
8. Monitor progress and control the process from the dashboard

### Screenshots

![Dashboard](https://example.com/dashboard.png)
![Contact Management](https://example.com/contacts.png)
![Message Templates](https://example.com/templates.png)