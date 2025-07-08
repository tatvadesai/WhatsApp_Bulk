# WhatsApp Mass Messenger - Gemini CLI Context

This project is a WhatsApp Mass Messenger with a web interface, designed to send personalized messages to contacts.

## Recent Changes (July 2025)

*   **Fixed Image Uploads:** Resolved an issue where images uploaded from the local machine were being sent as documents instead of viewable images. The file upload logic was updated to preserve the original file extension, ensuring WhatsApp correctly interprets the file type.
*   **Corrected Image Path Handling:** Fixed a bug where the application was trying to send local images using a URL path instead of an absolute file path. The code now correctly resolves the local file path, allowing the WhatsApp service to send the image.
*   **Resolved JavaScript Errors:** Fixed a "Cannot read properties of null" error in the frontend JavaScript by correctly declaring and referencing the `googleSheetName` element. This ensures the Google Sheet integration works as expected.
*   **Added Debug Logging:** Implemented logging for incoming server requests and image uploads to help diagnose and troubleshoot issues more effectively.

## Key Features:
- Send personalized messages.
- Google Sheets integration for contact management (including sheet selection).
- Customizable message templates.
- Rate limiting and batch processing.
- Real-time status updates via Socket.IO.
- Apple-like UI aesthetic.
- Flexible contact data handling (no hardcoded column names).

## Removed Functionality:
- CSV file import/export.
- "Filter by Paid" contact functionality.

## Important Notes for Gemini:
- The main application entry point is `server.js`.
- Frontend assets are in the `public/` directory.
- Configuration is managed via `.env` and `config.js`.
- Logging is handled by `utils/logger.js`.
- Google Sheets integration is in `googleSheetsIntegration.js` and `services/contactService.js`.
- WhatsApp client logic is in `services/whatsappClient.js`.
- UI styling is in `public/css/styles.css`.
- UI logic is in `public/js/app.js`.
- Always prioritize user control and project conventions.
- When making changes, ensure consistency across frontend and backend.
- Be mindful of Node.js caching issues; advise `npm cache clean --force`, `rm -rf node_modules`, `npm install` if unexpected errors occur.

## Future Enhancements:

### 1. Enhanced Error Reporting & Failed Message Management:
- **UI Display:** Integrate a section in the UI to display recent failed messages, including the contact and the reason for failure.
- **Retry Mechanism:** Implement a feature to easily retry sending messages to contacts that previously failed.
- **Export Failed Messages:** Provide a button to download the `failed-messages-*.csv` logs directly from the UI.

### 2. Message Scheduling:
- Allow users to schedule message campaigns to be sent at a specific date and time in the future, rather than immediately.

### 3. Advanced Personalization:
- Explore more complex personalization options beyond simple `{variable}` replacement, such as conditional logic within templates (e.g., "If city is X, say Y, else say Z").

### 4. User-Configurable Rate Limiting:
- Expose the `MAX_MESSAGES_PER_MINUTE` setting (currently in `config.js`) in the UI, allowing users to adjust it based on their needs and WhatsApp's policies.
