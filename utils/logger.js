const fs = require('fs');
const path = require('path');
const config = require('../config');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Maintain a single stream instance
let logStream = null;
let currentLogDate = null;

// Create a log file for today's date
const getLogFilePath = () => {
    const today = new Date().toISOString().split('T')[0];
    return path.join(logsDir, `whatsapp-mass-${today}.log`);
};

// Get or create log stream, ensuring we don't create too many
const getLogStream = () => {
    const today = new Date().toISOString().split('T')[0];
    
    // If date changed or stream doesn't exist, create a new one
    if (!logStream || currentLogDate !== today) {
        // Close existing stream if it exists
        if (logStream) {
            logStream.end();
            logStream = null;
        }
        
        // Create new stream
        currentLogDate = today;
        logStream = fs.createWriteStream(getLogFilePath(), { flags: 'a' });
        
        // Handle stream errors
        logStream.on('error', (err) => {
            console.error(`Log stream error: ${err.message}`);
            // Attempt to recreate the stream on next log call
            logStream = null;
        });
    }
    
    return logStream;
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
const configuredLevel = (config.LOG_LEVEL || 'info').toLowerCase();
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
        
        try {
            getLogStream().write(formattedMessage);
        } catch (err) {
            console.error(`Failed to write debug log: ${err.message}`);
        }
    },
    
    info: (message) => {
        if (!shouldLog('info')) return;
        
        const formattedMessage = formatLogMessage('INFO', message);
        console.log(`ℹ️ ${message}`);
        
        try {
            getLogStream().write(formattedMessage);
        } catch (err) {
            console.error(`Failed to write info log: ${err.message}`);
        }
    },
    
    success: (message) => {
        if (!shouldLog('success')) return;
        
        const formattedMessage = formatLogMessage('SUCCESS', message);
        console.log(`✅ ${message}`);
        
        try {
            getLogStream().write(formattedMessage);
        } catch (err) {
            console.error(`Failed to write success log: ${err.message}`);
        }
    },
    
    warn: (message) => {
        if (!shouldLog('warn')) return;
        
        const formattedMessage = formatLogMessage('WARN', message);
        console.warn(`⚠️ ${message}`);
        
        try {
            getLogStream().write(formattedMessage);
        } catch (err) {
            console.error(`Failed to write warning log: ${err.message}`);
        }
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
        
        try {
            getLogStream().write(formattedMessage);
        } catch (err) {
            console.error(`Failed to write error log: ${err.message}`);
        }
    },
    
    // Clean up resources when the application exits
    cleanup: () => {
        if (logStream) {
            logStream.end();
            logStream = null;
        }
    }
};

// Clean up on process exit
process.on('exit', () => {
    logger.cleanup();
});

process.on('SIGINT', () => {
    logger.cleanup();
});

process.on('SIGTERM', () => {
    logger.cleanup();
});

module.exports = logger; 