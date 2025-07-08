require('dotenv').config();

// Function to safely parse JSON potentially stored in env vars
const parseJsonEnvVar = (envVar) => {
  if (!envVar) return undefined;
  try {
    return JSON.parse(envVar);
  } catch (e) {
    console.warn(`Warning: Could not parse JSON environment variable: ${e.message}`);
    return envVar; // Return original string if parsing fails
  }
};

// Function to parse boolean env vars
const parseBooleanEnvVar = (envVar) => {
    return envVar ? envVar.toLowerCase() === 'true' : false;
};

// Parse integer with fallback
const parseIntEnvVar = (envVar, defaultVal) => {
    if (!envVar) return defaultVal;
    const parsed = parseInt(envVar, 10);
    return isNaN(parsed) ? defaultVal : parsed;
};

module.exports = {
  // Server Port (Using PORT variable common in hosting envs)
  port: parseIntEnvVar(process.env.PORT, 3000),

  // Google Sheets Integration
  googleSheetId: process.env.GOOGLE_SHEETS_ID,
  googleSheetsRange: process.env.GOOGLE_SHEETS_RANGE,
  googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,

  // Message Configuration
  messageTemplate: process.env.MESSAGE_TEMPLATE || 'default',

  // Event Details
  eventDate: process.env.EVENT_DATE,
  eventVenue: process.env.EVENT_VENUE,
  eventName: process.env.EVENT_NAME,
  eventTime: process.env.EVENT_TIME,

  // Contact Filtering
  allowedCities: process.env.ALLOWED_CITIES ? process.env.ALLOWED_CITIES.split(',').map(city => city.trim()) : [], // Split comma-separated string into an array
  blockedNumbers: process.env.BLOCKED_NUMBERS ? process.env.BLOCKED_NUMBERS.split(',').map(num => num.trim()).filter(num => num.length > 0) : [], // Split comma-separated string into an array and ensure non-empty values

  // Sending Configuration with safe defaults
  messageDelay: parseIntEnvVar(process.env.MESSAGE_DELAY, 5000),
  batchSize: parseIntEnvVar(process.env.BATCH_SIZE, 10),
  batchDelay: parseIntEnvVar(process.env.BATCH_DELAY, 30000),
  maxMessagesPerMinute: parseIntEnvVar(process.env.MAX_MESSAGES_PER_MINUTE, 30),
  maxRetryAttempts: parseIntEnvVar(process.env.MAX_RETRY_ATTEMPTS, 3),
  retryDelay: parseIntEnvVar(process.env.RETRY_DELAY, 3000),

  // Application Settings
  debugMode: parseBooleanEnvVar(process.env.DEBUG_MODE),
  logLevel: process.env.LOG_LEVEL || 'info',

  // Puppeteer arguments (default to empty array)
  puppeteerArgs: process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',') : [],
}; 