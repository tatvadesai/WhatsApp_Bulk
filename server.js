const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const qrcode = require('qrcode');
const fs = require('fs');
const config = require('./config');
const logger = require('./utils/logger');

// Import services
const WhatsAppClient = require('./services/whatsappClient');
const MessageService = require('./services/messageService');
const ContactService = require('./services/contactService');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Initialize services
let whatsappClient;
let messageService;
let contactService;
let servicesInitialized = false;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

// Safely initialize WhatsApp client and services with error handling
function initializeServices() {
    try {
        initializationAttempts++;
        logger.info(`Initializing services (attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS})...`);
        
        // Create the auth data directory if it doesn't exist
        const authDataPath = path.join(__dirname, 'auth_data');
        if (!fs.existsSync(authDataPath)) {
            logger.info('Creating auth data directory...');
            fs.mkdirSync(authDataPath, { recursive: true });
        }
        
        // Create the web cache directory if it doesn't exist
        const webCachePath = path.join(__dirname, '.wwebjs_cache');
        if (!fs.existsSync(webCachePath)) {
            logger.info('Creating web cache directory...');
            fs.mkdirSync(webCachePath, { recursive: true });
        }
        
        // Initialize services with proper error handling
        whatsappClient = new WhatsAppClient(io);
        whatsappClient.initialize();
        
        messageService = new MessageService(whatsappClient, io);
        contactService = new ContactService(whatsappClient, io);
        
        // Log events for debugging
        whatsappClient.on('ready', () => {
            logger.info('WhatsApp client is ready');
            servicesInitialized = true;
            initializationAttempts = 0; // Reset counter on success
        });
        
        whatsappClient.on('error', (error) => {
            logger.error('WhatsApp client error:', error);
            handleServiceInitError(error);
        });
        
        messageService.on('stats_updated', (stats) => {
            logger.debug('Message stats updated:', stats);
        });
        
        contactService.on('contacts_loaded', (count) => {
            logger.info(`${count} contacts loaded`);
        });
    } catch (error) {
        logger.error('Error initializing services:', error);
        handleServiceInitError(error);
    }
}

// Handle service initialization errors
function handleServiceInitError(error) {
    if (initializationAttempts < MAX_INIT_ATTEMPTS) {
        const retryDelay = Math.min(5000 * Math.pow(2, initializationAttempts), 30000);
        logger.info(`Service initialization failed. Retrying in ${retryDelay/1000} seconds...`);
        
        // Notify clients about the error and retry
        io.emit('status', {
            status: 'error',
            message: `Service initialization error: ${error.message}. Retrying in ${retryDelay/1000} seconds...`
        });
        
        // Clean up any resources
        cleanupServices();
        
        // Try again after delay
        setTimeout(initializeServices, retryDelay);
    } else {
        logger.error(`Failed to initialize services after ${MAX_INIT_ATTEMPTS} attempts.`);
        io.emit('status', {
            status: 'fatal_error',
            message: `Failed to initialize services after ${MAX_INIT_ATTEMPTS} attempts. Please restart the server.`
        });
    }
}

// Clean up service resources
function cleanupServices() {
    try {
        if (whatsappClient) {
            try {
                whatsappClient.destroy();
            } catch (e) {
                logger.warn('Error destroying WhatsApp client:', e);
            }
            whatsappClient = null;
        }
        messageService = null;
        contactService = null;
        servicesInitialized = false;
    } catch (error) {
        logger.warn('Error during service cleanup:', error);
    }
}

// Add graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
    logger.info('Received shutdown signal, closing connections...');
    
    // Close Socket.IO connections
    io.close(() => {
        logger.info('Socket.IO connections closed');
    });
    
    // Clean up WhatsApp client
    cleanupServices();
    
    // Close Express server
    server.close(() => {
        logger.info('Express server closed');
        process.exit(0);
    });
    
    // Force exit after timeout
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

// API Routes
app.get('/api/status', (req, res) => {
    if (!whatsappClient || !servicesInitialized) {
        return res.json({ 
            status: 'initializing',
            message: 'Services are being initialized...',
            attempt: initializationAttempts,
            maxAttempts: MAX_INIT_ATTEMPTS
        });
    }
    
    const status = whatsappClient.getStatus();
    res.json({
        whatsapp: status,
        messages: messageService ? messageService.getStats() : null,
        contacts: contactService ? contactService.getContactStats() : null
    });
});

// Add a new route to restart the WhatsApp client if needed
app.post('/api/restart', (req, res) => {
    try {
        logger.info('Manual restart of services requested');
        
        // Clean up existing services
        cleanupServices();
        
        // Reset attempt counter for manual restart
        initializationAttempts = 0;
        
        // Reinitialize
        initializeServices();
        
        res.json({ 
            success: true, 
            message: 'Services are being restarted...' 
        });
    } catch (error) {
        logger.error('Error during manual restart:', error);
        res.status(500).json({ error: error.message });
    }
});

// Load contacts from Google Sheets
app.post('/api/contacts/google-sheets', async (req, res) => {
    try {
        if (!contactService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        const contacts = await contactService.loadContactsFromGoogleSheets();
        res.json({ success: true, count: contacts.length });
    } catch (error) {
        logger.error('Error loading contacts from Google Sheets:', error);
        res.status(500).json({ error: error.message });
    }
});

// Load contacts from CSV
app.post('/api/contacts/csv', async (req, res) => {
    try {
        if (!contactService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        const { filePath } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'File path is required' });
        }
        
        const contacts = await contactService.loadContactsFromCsv(filePath);
        res.json({ success: true, count: contacts.length });
    } catch (error) {
        logger.error('Error loading contacts from CSV:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add a new API endpoint to get contact data
app.get('/api/contacts/data', (req, res) => {
    try {
        if (!contactService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        // Get all contacts
        const allContacts = contactService.getContacts(false);
        
        // For security and bandwidth reasons, limit to the first 20 contacts
        // and remove sensitive fields
        const limitedContacts = allContacts.slice(0, 20).map(contact => {
            // Create a sanitized version of the contact
            const sanitized = { ...contact };
            
            // Remove any potentially sensitive fields
            delete sanitized.password;
            delete sanitized.token;
            delete sanitized.authToken;
            
            return sanitized;
        });
        
        res.json({ 
            success: true, 
            count: allContacts.length,
            contacts: limitedContacts,
            note: allContacts.length > 20 ? 'Showing first 20 contacts only' : ''
        });
    } catch (error) {
        logger.error('Error getting contact data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Filter contacts - enhance to support debug mode
app.post('/api/contacts/filter', async (req, res) => {
    try {
        if (!contactService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        const options = req.body;
        logger.info(`Received filter request: ${JSON.stringify(options)}`);
        
        // Process options to ensure proper format
        if (options.cities && Array.isArray(options.cities)) {
            // Remove empty strings and trim values
            options.cities = options.cities
                .map(city => city.trim())
                .filter(city => city.length > 0);
                
            if (options.cities.length > 0) {
                logger.info(`Filtering by cities: ${options.cities.join(', ')}`);
            }
        }
        
        if (options.blockedNumbers && Array.isArray(options.blockedNumbers)) {
            // Clean up blocked numbers
            options.blockedNumbers = options.blockedNumbers
                .map(num => num.trim())
                .filter(num => num.length > 0);
        }
        
        // Enable debug mode if requested
        const debugMode = options.debug === true;
        if (debugMode) {
            logger.info('Debug mode enabled for filtering');
            options.debugMessages = [];
        }
        
        const filtered = await contactService.filterContacts(options);
        
        // Return debug information if requested
        const response = { 
            success: true, 
            count: filtered.length 
        };
        
        if (debugMode && options.debugMessages) {
            response.debug = options.debugMessages;
        }
        
        res.json(response);
    } catch (error) {
        logger.error('Error filtering contacts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send messages to filtered contacts
app.post('/api/messages/send', async (req, res) => {
    try {
        if (!messageService || !contactService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        const { templateName, customData } = req.body;
        if (!templateName) {
            return res.status(400).json({ error: 'Template name is required' });
        }
        
        const contacts = contactService.getContacts(true); // Get filtered contacts
        if (contacts.length === 0) {
            return res.status(400).json({ error: 'No contacts to send messages to' });
        }
        
        const stats = await messageService.sendBatchMessages(contacts, templateName, customData || {});
        res.json({ success: true, stats });
    } catch (error) {
        logger.error('Error sending messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send messages to ALL contacts (no filtering by city)
app.post('/api/messages/send-all', async (req, res) => {
    try {
        if (!messageService || !contactService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        const { templateName, customData } = req.body;
        if (!templateName) {
            return res.status(400).json({ error: 'Template name is required' });
        }
        
        // Apply only minimal filtering (blocked numbers) but skip city filtering
        await contactService.filterContacts({ applyFilters: false });
        
        // Get the minimally filtered contacts
        const contacts = contactService.getContacts(true);
        if (contacts.length === 0) {
            return res.status(400).json({ error: 'No contacts to send messages to' });
        }
        
        const stats = await messageService.sendBatchMessages(contacts, templateName, customData || {});
        res.json({ success: true, stats });
    } catch (error) {
        logger.error('Error sending messages to all contacts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Pause message sending
app.post('/api/messages/pause', (req, res) => {
    try {
        if (!messageService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        const paused = messageService.pauseProcessing();
        res.json({ success: true, paused });
    } catch (error) {
        logger.error('Error pausing message sending:', error);
        res.status(500).json({ error: error.message });
    }
});

// Resume message sending
app.post('/api/messages/resume', (req, res) => {
    try {
        if (!messageService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        const resumed = messageService.resumeProcessing();
        res.json({ success: true, resumed });
    } catch (error) {
        logger.error('Error resuming message sending:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear message queue
app.post('/api/messages/clear', (req, res) => {
    try {
        if (!messageService) {
            return res.status(500).json({ error: 'Services not initialized' });
        }
        
        const cleared = messageService.clearQueue();
        res.json({ success: true, cleared });
    } catch (error) {
        logger.error('Error clearing message queue:', error);
        res.status(500).json({ error: error.message });
    }
});

// Socket.io connection
io.on('connection', (socket) => {
    logger.info('New client connected');
    
    // Send initial status
    if (whatsappClient) {
        socket.emit('status', { 
            status: whatsappClient.isReady ? 'ready' : 'initializing',
            message: whatsappClient.isReady ? 'WhatsApp client is ready' : 'Initializing WhatsApp client...'
        });
        
        if (contactService) {
            socket.emit('contacts', contactService.getContactStats());
        }
        
        if (messageService) {
            socket.emit('stats', messageService.getStats());
        }
    }
    
    socket.on('disconnect', () => {
        logger.info('Client disconnected');
    });
});

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    initializeServices();
});

// Check service status before processing requests
function checkServices(req, res, next) {
    if (!servicesInitialized || !whatsappClient || !whatsappClient.isReady) {
        return res.status(503).json({ 
            error: 'Services not ready', 
            message: 'WhatsApp client is not ready. Please wait or restart the server.'
        });
    }
    next();
}

// Apply middleware to API routes that require initialized services
app.post('/api/contacts/google-sheets', checkServices);
app.post('/api/contacts/csv', checkServices);
app.post('/api/contacts/filter', checkServices);
app.post('/api/messages/send', checkServices);
app.post('/api/messages/send-all', checkServices);
app.post('/api/messages/pause', checkServices);
app.post('/api/messages/resume', checkServices);
app.post('/api/messages/clear', checkServices); 