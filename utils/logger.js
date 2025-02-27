const fs = require('fs');
const path = require('path');
const config = require('../config');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create a log file for today's date
const getLogFilePath = () => {
    const today = new Date().toISOString().split('T')[0];
    return path.join(logsDir, `whatsapp-mass-${today}.log`);
};

// Create or append to log file
const getLogStream = () => {
    return fs.createWriteStream(getLogFilePath(), { flags: 'a' });
};

// Format the log message with timestamp and level
function formatLogMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}\n`;
}

// Log levels and their numeric values
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    success: 2,
    warn: 3,
    error: 4
};

// Get the configured log level or default to 'info'
const configuredLevel = config.LOG_LEVEL.toLowerCase();
const currentLevelValue = LOG_LEVELS[configuredLevel] || LOG_LEVELS.info;

// Check if we should log this level based on configuration
const shouldLog = (level) => {
    return LOG_LEVELS[level] >= currentLevelValue;
};

// The logger object with methods for different log levels
const logger = {
    debug: (message) => {
        if (!shouldLog('debug')) return;
        
        const formattedMessage = formatLogMessage('DEBUG', message);
        if (config.DEBUG_MODE) console.log(`🔍 ${message}`);
        getLogStream().write(formattedMessage);
    },
    
    info: (message) => {
        if (!shouldLog('info')) return;
        
        const formattedMessage = formatLogMessage('INFO', message);
        console.log(`ℹ️ ${message}`);
        getLogStream().write(formattedMessage);
    },
    
    success: (message) => {
        if (!shouldLog('success')) return;
        
        const formattedMessage = formatLogMessage('SUCCESS', message);
        console.log(`✅ ${message}`);
        getLogStream().write(formattedMessage);
    },
    
    warn: (message) => {
        if (!shouldLog('warn')) return;
        
        const formattedMessage = formatLogMessage('WARN', message);
        console.warn(`⚠️ ${message}`);
        getLogStream().write(formattedMessage);
    },
    
    error: (message, error = null) => {
        if (!shouldLog('error')) return;
        
        let logMessage = message;
        if (error) {
            logMessage += ` | ${error.message}`;
            if (config.DEBUG_MODE && error.stack) {
                logMessage += `\n${error.stack}`;
            }
        }
        
        const formattedMessage = formatLogMessage('ERROR', logMessage);
        console.error(`❌ ${message}`);
        getLogStream().write(formattedMessage);
    }
};

module.exports = logger; 