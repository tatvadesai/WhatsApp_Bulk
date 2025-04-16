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
    console.log('Received QR event from server, but QR display is disabled in UI');
    // QR code will be shown in terminal only, no need to generate it in the UI
    
    // Update the status message
    updateStatusMessage('qr_received', 'QR Code received. Please check your terminal to scan the QR code.');
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

// Add new button for inspecting contacts
const btnInspectContacts = document.createElement('button');
btnInspectContacts.id = 'btn-inspect-contacts';
btnInspectContacts.className = 'btn btn-secondary mt-2';
btnInspectContacts.innerHTML = '<i class="bi bi-search"></i> Inspect Contacts';
btnInspectContacts.onclick = inspectContacts;

// Insert it after filtered contacts element
filteredContacts.parentNode.parentNode.appendChild(btnInspectContacts);

// Create a modal for displaying contact data
const contactModal = document.createElement('div');
contactModal.className = 'modal fade';
contactModal.id = 'contactModal';
contactModal.tabIndex = '-1';
contactModal.setAttribute('aria-labelledby', 'contactModalLabel');
contactModal.setAttribute('aria-hidden', 'true');

contactModal.innerHTML = `
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="contactModalLabel">Contact Data</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <input type="text" class="form-control" id="contact-search" placeholder="Search contacts...">
        </div>
        <pre id="contact-data" style="max-height: 400px; overflow-y: auto;"></pre>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
`;

document.body.appendChild(contactModal);

// Function to inspect contacts
function inspectContacts() {
    fetch('/api/contacts/data')
        .then(response => response.json())
        .then(data => {
            const contactData = document.getElementById('contact-data');
            const contactJson = JSON.stringify(data.contacts, null, 2);
            contactData.textContent = contactJson;
            
            // Show the modal
            const modal = new bootstrap.Modal(document.getElementById('contactModal'));
            modal.show();
            
            // Setup search functionality
            const searchInput = document.getElementById('contact-search');
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                if (!searchTerm) {
                    contactData.textContent = contactJson;
                    return;
                }
                
                // Filter the contacts that match the search term
                const filtered = data.contacts.filter(contact => 
                    JSON.stringify(contact).toLowerCase().includes(searchTerm)
                );
                contactData.textContent = JSON.stringify(filtered, null, 2);
            });
        })
        .catch(error => {
            logActivity(`Error fetching contact data: ${error.message}`, 'error');
        });
}

// Enhance the filter process to provide more feedback
btnApplyFilters.addEventListener('click', () => {
    // Parse cities input, split by commas and trim each value
    const cities = filterCities.value.trim() 
        ? filterCities.value.split(',')
            .map(city => city.trim())
            .filter(city => city.length > 0) 
        : [];
    
    // Parse blocked numbers, split by commas and trim each value
    const blockedNumbers = filterBlockedNumbers.value.trim() 
        ? filterBlockedNumbers.value.split(',')
            .map(num => num.trim())
            .filter(num => num.length > 0) 
        : [];
    
    // Show detailed feedback that filters are being applied
    logActivity(`Applying filters: ${cities.length ? 'Cities: ' + cities.join(', ') : 'No cities'}, ${blockedNumbers.length ? 'Blocked numbers: ' + blockedNumbers.length : 'No blocked numbers'}`, 'info');
    
    // If no filters specified, warn the user
    if (cities.length === 0 && blockedNumbers.length === 0) {
        logActivity('Warning: No filters specified. All contacts will pass the filter.', 'warning');
    }
    
    fetch('/api/contacts/filter', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            cities,
            blockedNumbers,
            debug: true // Request detailed debug info
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            logActivity(`Filtered contacts: ${data.count} remaining`, 'success');
            
            // If they requested city filtering but got no results, show helpful message
            if (cities.length > 0 && data.count === 0) {
                logActivity('No contacts matched your city filters. Try checking the contact data with "Inspect Contacts" to see available city values.', 'warning');
            }
            
            // Show any debug information that came back
            if (data.debug) {
                for (const msg of data.debug) {
                    logActivity(`Debug: ${msg}`, 'info');
                }
            }
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
    if (!message) return;
    
    // Set appropriate alert class
    let alertClass = 'alert-info';
    
    if (status === 'ready' || status === 'completed' || status === 'authenticated') {
        alertClass = 'alert-success';
    } else if (status === 'error' || status === 'fatal_error' || status === 'disconnected') {
        alertClass = 'alert-danger';
    } else if (status === 'paused' || status === 'warning') {
        alertClass = 'alert-warning';
    }
    
    statusMessage.className = `alert ${alertClass}`;
    
    // Create more user-friendly status messages
    let userFriendlyMessage = message;
    
    // Transform technical status messages into user-friendly ones
    switch (status) {
        case 'initializing':
            userFriendlyMessage = '🚀 Starting WhatsApp service...';
            break;
        case 'qr_received':
            userFriendlyMessage = '📱 Please check your terminal to scan the QR code with WhatsApp';
            break;
        case 'ready':
            userFriendlyMessage = '✅ WhatsApp connected and ready to send messages!';
            break;
        case 'authenticated':
            userFriendlyMessage = '🔐 WhatsApp successfully authenticated';
            break;
        case 'processing':
            userFriendlyMessage = '📤 Sending messages...';
            break;
        case 'batch_delay':
            userFriendlyMessage = '⏱️ Taking a short break between batches to avoid rate limits';
            break;
        case 'completed':
            userFriendlyMessage = '🎉 All messages have been sent successfully!';
            break;
        case 'paused':
            userFriendlyMessage = '⏸️ Message sending paused - click Resume to continue';
            break;
        case 'resumed':
            userFriendlyMessage = '▶️ Message sending resumed';
            break;
        case 'error':
            userFriendlyMessage = `❌ ${message.replace(/Error:|error:/i, '')}`;
            break;
        case 'fatal_error':
            userFriendlyMessage = `⛔ ${message.replace(/Error:|error:/i, '')}`;
            break;
        case 'disconnected':
            userFriendlyMessage = '🔌 WhatsApp disconnected - trying to reconnect...';
            break;
        default:
            // If no specific formatting, keep original but add emoji based on content
            if (message.includes('error') || message.includes('fail')) {
                userFriendlyMessage = `❌ ${message}`;
            } else if (message.includes('success') || message.includes('ready')) {
                userFriendlyMessage = `✅ ${message}`;
            } else if (message.includes('warning') || message.includes('caution')) {
                userFriendlyMessage = `⚠️ ${message}`;
            } else {
                userFriendlyMessage = `ℹ️ ${message}`;
            }
    }
    
    statusMessage.textContent = userFriendlyMessage;
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
        const completed = stats.sent + stats.failed + stats.skipped;
        const progress = (completed / stats.total) * 100;
        
        // Update progress bar
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', completed);
        progressBar.setAttribute('aria-valuemax', stats.total);
        
        // Add text to the progress bar
        progressBar.textContent = `${Math.round(progress)}% (${completed}/${stats.total})`;
        
        // Style based on progress
        progressBar.className = 'progress-bar progress-bar-striped';
        
        if (progress >= 100) {
            progressBar.classList.remove('progress-bar-animated');
            progressBar.classList.add('bg-success');
            progressBar.textContent = '100% Complete! 🎉';
        } else {
            progressBar.classList.add('progress-bar-animated');
            
            // Color based on relative success rate
            if (stats.failed > stats.sent) {
                progressBar.classList.add('bg-danger');
            } else if (stats.failed > 0) {
                progressBar.classList.add('bg-warning');
            } else {
                progressBar.classList.add('bg-info');
            }
        }
    } else {
        progressBar.style.width = '0%';
        progressBar.textContent = '';
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
    console.log('QR code container is hidden - QR codes only shown in terminal');
    // Keep the container hidden as QR codes are only shown in terminal
    // qrcodeContainer.classList.remove('d-none');
}

function hideQRCode() {
    qrcodeContainer.classList.add('d-none');
}

function generateQRCode(data) {
    console.log('QR code generation in UI is disabled. Check your terminal for QR code.');
    // QR code generation in UI is disabled
}

function logActivity(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    
    // Create a log entry that's more user-readable
    let userFriendlyMessage = message;
    
    // Replace technical terms with more user-friendly ones
    if (message.startsWith('Status:')) {
        userFriendlyMessage = message.replace('Status:', '📋');
    }
    
    // Add emojis and friendlier language based on the message type
    if (type === 'error') {
        userFriendlyMessage = `❌ ${userFriendlyMessage}`;
    } else if (type === 'success') {
        userFriendlyMessage = `✅ ${userFriendlyMessage}`;
    } else if (type === 'warning') {
        userFriendlyMessage = `⚠️ ${userFriendlyMessage}`;
    } else if (type === 'info') {
        userFriendlyMessage = `ℹ️ ${userFriendlyMessage}`;
    }

    // Create log entry element
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${userFriendlyMessage}`;
    
    // Add to log
    activityLog.appendChild(logEntry);
    activityLog.scrollTop = activityLog.scrollHeight;
    
    // Update progress bar if the message indicates progress
    updateProgressIndicator(message, type);
}

// New function to update the progress indicator based on message content
function updateProgressIndicator(message, type) {
    // Only update progress bar for certain message types
    if (message.includes("Loaded") || 
        message.includes("filtered") || 
        message.includes("Sending") ||
        message.includes("sent") ||
        message.includes("completed")) {
        
        // Extract numbers from the message when possible
        const numbers = message.match(/\d+/g);
        if (numbers && numbers.length >= 1) {
            const value = parseInt(numbers[0]);
            
            // If we have two numbers, treat as progress (e.g., "Sent 5 of 20 messages")
            if (numbers.length >= 2) {
                const total = parseInt(numbers[1]);
                if (!isNaN(value) && !isNaN(total) && total > 0) {
                    const percentage = (value / total) * 100;
                    progressBar.style.width = `${percentage}%`;
                    progressBar.setAttribute('aria-valuenow', value);
                    progressBar.setAttribute('aria-valuemax', total);
                    
                    // Add text inside the progress bar
                    progressBar.textContent = `${Math.round(percentage)}% (${value}/${total})`;
                    
                    // Set color based on type
                    progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated';
                    if (type === 'error') {
                        progressBar.classList.add('bg-danger');
                    } else if (type === 'success' || percentage === 100) {
                        progressBar.classList.add('bg-success');
                    } else if (type === 'warning') {
                        progressBar.classList.add('bg-warning');
                    } else {
                        progressBar.classList.add('bg-info');
                    }
                }
            } else {
                // If we just have one number and it's a completion message, set to 100%
                if (message.includes("completed") || message.includes("finished") || type === 'success') {
                    progressBar.style.width = '100%';
                    progressBar.setAttribute('aria-valuenow', 100);
                    progressBar.textContent = 'Complete!';
                    progressBar.classList.remove('progress-bar-animated');
                    progressBar.classList.add('bg-success');
                }
            }
        }
    }
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
                updateButtonStates();
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