// Initialize Socket.io connection
const socket = io();

// DOM Elements
const whatsappStatus = document.getElementById('whatsapp-status');
const qrcodeContainer = document.getElementById('qrcode-container');
const qrcodeElement = document.getElementById('qrcode');
const restartContainer = document.getElementById('restart-container');
const btnRestartService = document.getElementById('btn-restart-service');
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
const activityLog = document.getElementById('activity-log');

// Message Stats Elements
const totalMessages = document.getElementById('total-messages');
const sentMessages = document.getElementById('sent-messages');
const failedMessages = document.getElementById('failed-messages');
const skippedMessages = document.getElementById('skipped-messages');

// Contact Stats Elements
const totalContacts = document.getElementById('total-contacts');
const filteredContacts = document.getElementById('filtered-contacts');

// Button Elements
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnClear = document.getElementById('btn-clear');
const btnLoadGoogleSheets = document.getElementById('btn-load-google-sheets');
const btnLoadCsv = document.getElementById('btn-load-csv');
const btnApplyFilters = document.getElementById('btn-apply-filters');
const btnSendMessages = document.getElementById('btn-send-messages');
const btnSendAllMessages = document.getElementById('btn-send-all-messages');

// Input Elements
const csvFilePath = document.getElementById('csv-file-path');
const filterCities = document.getElementById('filter-cities');
const filterBlockedNumbers = document.getElementById('filter-blocked-numbers');
const filterPaidLabel = document.getElementById('filter-paid-label');
const messageTemplate = document.getElementById('message-template');
const customMessage = document.getElementById('custom-message');
const eventDate = document.getElementById('event-date');
const eventTime = document.getElementById('event-time');
const eventName = document.getElementById('event-name');
const eventVenue = document.getElementById('event-venue');

// Containers
const customDataContainer = document.getElementById('custom-data-container');
const eventDataContainer = document.getElementById('event-data-container');

// Application state
let isPaused = false;
let isProcessing = false;
let serviceErrorState = false;

// Socket.io event listeners
socket.on('connect', () => {
    logActivity('Connected to server', 'info');
});

socket.on('disconnect', () => {
    logActivity('Disconnected from server', 'error');
    updateWhatsAppStatus('error', 'Disconnected');
    showRestartButton();
});

socket.on('status', (data) => {
    logActivity(`Status: ${data.message}`, 'info');
    updateStatusMessage(data.status, data.message);
    
    if (data.status === 'qr_received') {
        showQRCode();
        hideRestartButton();
        serviceErrorState = false;
    } else if (data.status === 'ready') {
        hideQRCode();
        hideRestartButton();
        updateWhatsAppStatus('ready', 'Connected');
        serviceErrorState = false;
    } else if (data.status === 'paused') {
        isPaused = true;
        updateButtonStates();
    } else if (data.status === 'resumed') {
        isPaused = false;
        updateButtonStates();
    } else if (data.status === 'processing') {
        isProcessing = true;
        updateButtonStates();
    } else if (data.status === 'completed') {
        isProcessing = false;
        updateButtonStates();
    } else if (data.status === 'error' || data.status === 'fatal_error') {
        isProcessing = false;
        serviceErrorState = true;
        updateButtonStates();
        updateWhatsAppStatus('error', 'Error');
        showRestartButton();
    } else if (data.status === 'reconnecting') {
        updateWhatsAppStatus('initializing', 'Reconnecting...');
        hideQRCode();
    } else if (data.status === 'initializing') {
        updateWhatsAppStatus('initializing', 'Initializing...');
        hideQRCode();
    }
});

socket.on('qr', (qrData) => {
    generateQRCode(qrData);
});

socket.on('stats', (stats) => {
    updateMessageStats(stats);
    updateProgressBar(stats);
});

socket.on('contacts', (stats) => {
    updateContactStats(stats);
});

// Button event listeners
btnPause.addEventListener('click', () => {
    fetch('/api/messages/pause', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            isPaused = true;
            updateButtonStates();
            logActivity('Message sending paused', 'warning');
        }
    })
    .catch(error => {
        logActivity(`Error pausing: ${error.message}`, 'error');
    });
});

btnResume.addEventListener('click', () => {
    fetch('/api/messages/resume', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            isPaused = false;
            updateButtonStates();
            logActivity('Message sending resumed', 'success');
        }
    })
    .catch(error => {
        logActivity(`Error resuming: ${error.message}`, 'error');
    });
});

btnClear.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the message queue?')) {
        fetch('/api/messages/clear', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                logActivity(`Cleared ${data.cleared} messages from queue`, 'warning');
            }
        })
        .catch(error => {
            logActivity(`Error clearing queue: ${error.message}`, 'error');
        });
    }
});

btnLoadGoogleSheets.addEventListener('click', () => {
    fetch('/api/contacts/google-sheets', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            logActivity(`Loaded ${data.count} contacts from Google Sheets`, 'success');
        } else {
            logActivity(`Error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        logActivity(`Error loading contacts: ${error.message}`, 'error');
    });
});

btnLoadCsv.addEventListener('click', () => {
    const filePath = csvFilePath.value.trim();
    if (!filePath) {
        logActivity('Please enter a CSV file path', 'error');
        return;
    }
    
    fetch('/api/contacts/csv', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filePath })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            logActivity(`Loaded ${data.count} contacts from CSV`, 'success');
        } else {
            logActivity(`Error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        logActivity(`Error loading contacts: ${error.message}`, 'error');
    });
});

btnApplyFilters.addEventListener('click', () => {
    const cities = filterCities.value.trim() ? filterCities.value.split(',').map(city => city.trim()) : [];
    const blockedNumbers = filterBlockedNumbers.value.trim() ? filterBlockedNumbers.value.split(',').map(num => num.trim()) : [];
    const filterByPaidLabel = filterPaidLabel.checked;
    
    fetch('/api/contacts/filter', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            cities,
            blockedNumbers,
            filterByPaidLabel
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            logActivity(`Filtered contacts: ${data.count} remaining`, 'success');
        } else {
            logActivity(`Error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        logActivity(`Error filtering contacts: ${error.message}`, 'error');
    });
});

btnSendMessages.addEventListener('click', () => {
    const template = messageTemplate.value;
    
    // Prepare custom data based on template
    let customData = {};
    
    if (template === 'custom') {
        if (!customMessage.value.trim()) {
            logActivity('Please enter a custom message', 'error');
            return;
        }
        customData.customMessage = customMessage.value.trim();
        logActivity(`Using custom message: "${customMessage.value.substring(0, 30)}${customMessage.value.length > 30 ? '...' : ''}"`, 'info');
    } else if (['newEvent', 'reminder'].includes(template)) {
        if (!eventDate.value) {
            logActivity('Please enter an event date', 'error');
            return;
        }
        
        // Format date for display
        const date = new Date(eventDate.value);
        const formattedDate = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        customData.eventDate = formattedDate;
        
        if (eventTime.value) {
            customData.eventTime = eventTime.value;
        }
        
        if (eventName.value) {
            customData.eventName = eventName.value;
        }
        
        if (eventVenue.value) {
            customData.venue = eventVenue.value;
        }
    }
    
    fetch('/api/messages/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            templateName: template,
            customData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            logActivity(`Started sending messages to ${data.stats.total} contacts`, 'success');
            isProcessing = true;
            updateButtonStates();
        } else {
            logActivity(`Error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        logActivity(`Error sending messages: ${error.message}`, 'error');
    });
});

// Handler for Send to ALL Contacts button
btnSendAllMessages.addEventListener('click', () => {
    const template = messageTemplate.value;
    
    // Confirm with user due to potentially large number of messages
    if (!confirm('Are you sure you want to send messages to ALL contacts? This will bypass city filters.')) {
        return;
    }
    
    // Prepare custom data based on template
    let customData = {};
    
    if (template === 'custom') {
        if (!customMessage.value.trim()) {
            logActivity('Please enter a custom message', 'error');
            return;
        }
        customData.customMessage = customMessage.value.trim();
        logActivity(`Using custom message: "${customMessage.value.substring(0, 30)}${customMessage.value.length > 30 ? '...' : ''}"`, 'info');
    } else if (['newEvent', 'reminder'].includes(template)) {
        if (!eventDate.value) {
            logActivity('Please enter an event date', 'error');
            return;
        }
        
        // Format date for display
        const date = new Date(eventDate.value);
        const formattedDate = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        customData.eventDate = formattedDate;
        
        if (eventTime.value) {
            customData.eventTime = eventTime.value;
        }
        
        if (eventName.value) {
            customData.eventName = eventName.value;
        }
        
        if (eventVenue.value) {
            customData.venue = eventVenue.value;
        }
    }
    
    // Use the send-all endpoint instead of send
    fetch('/api/messages/send-all', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            templateName: template,
            customData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            logActivity(`Started sending messages to ALL contacts (${data.stats.total} total)`, 'success');
            isProcessing = true;
            updateButtonStates();
        } else {
            logActivity(`Error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        logActivity(`Error sending messages: ${error.message}`, 'error');
    });
});

// Template selection change handler
messageTemplate.addEventListener('change', () => {
    const template = messageTemplate.value;
    
    // Hide all data containers first
    customDataContainer.classList.add('d-none');
    eventDataContainer.classList.add('d-none');
    
    // Show relevant container based on template
    if (template === 'custom') {
        customDataContainer.classList.remove('d-none');
    } else if (['newEvent', 'reminder'].includes(template)) {
        eventDataContainer.classList.remove('d-none');
    }
});

// Add event handler for restart button
btnRestartService.addEventListener('click', () => {
    restartWhatsAppService();
});

// Function to restart WhatsApp service
function restartWhatsAppService() {
    logActivity('Restarting WhatsApp service...', 'warning');
    updateWhatsAppStatus('initializing', 'Restarting...');
    hideQRCode();
    
    fetch('/api/restart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            logActivity('Restart request sent. Waiting for WhatsApp to initialize...', 'info');
        } else {
            logActivity(`Error restarting: ${data.error}`, 'error');
            showRestartButton();
        }
    })
    .catch(error => {
        logActivity(`Error restarting WhatsApp: ${error.message}`, 'error');
        showRestartButton();
    });
}

// Helper functions
function updateWhatsAppStatus(status, message) {
    whatsappStatus.innerHTML = `
        <div class="status-indicator ${status}">
            <i class="bi bi-circle-fill"></i> ${message}
        </div>
    `;
}

function updateStatusMessage(status, message) {
    let alertClass = 'alert-info';
    
    if (status === 'ready' || status === 'completed') {
        alertClass = 'alert-success';
    } else if (status === 'error') {
        alertClass = 'alert-danger';
    } else if (status === 'paused') {
        alertClass = 'alert-warning';
    }
    
    statusMessage.className = `alert ${alertClass}`;
    statusMessage.textContent = message;
}

function updateMessageStats(stats) {
    totalMessages.textContent = stats.total;
    sentMessages.textContent = stats.sent;
    failedMessages.textContent = stats.failed;
    skippedMessages.textContent = stats.skipped;
}

function updateContactStats(stats) {
    totalContacts.textContent = stats.total;
    filteredContacts.textContent = stats.filtered;
}

function updateProgressBar(stats) {
    if (stats.total > 0) {
        const progress = ((stats.sent + stats.failed + stats.skipped) / stats.total) * 100;
        progressBar.style.width = `${progress}%`;
        
        if (progress >= 100) {
            progressBar.classList.remove('progress-bar-animated');
        } else {
            progressBar.classList.add('progress-bar-animated');
        }
    } else {
        progressBar.style.width = '0%';
    }
}

function updateButtonStates() {
    if (isPaused) {
        btnPause.disabled = true;
        btnResume.disabled = false;
    } else {
        btnPause.disabled = false;
        btnResume.disabled = true;
    }
    
    const serviceDisabled = isProcessing || serviceErrorState;
    
    btnSendMessages.disabled = serviceDisabled;
    btnSendAllMessages.disabled = serviceDisabled;
    btnLoadGoogleSheets.disabled = serviceDisabled;
    btnLoadCsv.disabled = serviceDisabled;
    btnApplyFilters.disabled = serviceDisabled;
    btnClear.disabled = serviceDisabled;
}

function showQRCode() {
    qrcodeContainer.classList.remove('d-none');
}

function hideQRCode() {
    qrcodeContainer.classList.add('d-none');
}

function generateQRCode(data) {
    // Clear previous QR code
    qrcodeElement.innerHTML = '';
    
    // Generate new QR code
    QRCode.toCanvas(qrcodeElement, data, function (error) {
        if (error) {
            logActivity('Error generating QR code', 'error');
        }
    });
    
    showQRCode();
}

function logActivity(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
    
    activityLog.appendChild(logEntry);
    activityLog.scrollTop = activityLog.scrollHeight;
}

function showRestartButton() {
    restartContainer.classList.remove('d-none');
}

function hideRestartButton() {
    restartContainer.classList.add('d-none');
}

// Initialize the application
function init() {
    // Fetch initial status
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'initializing') {
                updateWhatsAppStatus('initializing', 'Initializing...');
                updateStatusMessage('initializing', data.message || 'Initializing WhatsApp client...');
                
                if (data.attempt > 1) {
                    logActivity(`Initialization attempt ${data.attempt}/${data.maxAttempts}`, 'warning');
                }
            } else if (data.whatsapp) {
                if (data.whatsapp.isReady) {
                    updateWhatsAppStatus('ready', 'Connected');
                    updateStatusMessage('ready', 'WhatsApp client is ready');
                    serviceErrorState = false;
                } else {
                    updateWhatsAppStatus('initializing', 'Initializing...');
                    updateStatusMessage('initializing', 'Initializing WhatsApp client...');
                }
                
                if (data.messages) {
                    updateMessageStats(data.messages);
                }
                
                if (data.contacts) {
                    updateContactStats(data.contacts);
                }
            } else {
                updateStatusMessage('error', 'Could not get status from server');
                serviceErrorState = true;
                showRestartButton();
            }
            
            updateButtonStates();
        })
        .catch(error => {
            logActivity(`Error fetching status: ${error.message}`, 'error');
            updateStatusMessage('error', 'Error connecting to server');
            serviceErrorState = true;
            showRestartButton();
            updateButtonStates();
        });
}

// Call init on page load
window.addEventListener('load', init); 
init(); 