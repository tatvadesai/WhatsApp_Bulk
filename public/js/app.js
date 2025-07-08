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
const googleSheetName = document.getElementById('google-sheet-name');

const btnApplyFilters = document.getElementById('btn-apply-filters'); // Added

const filterPaidContacts = document.getElementById('filter-paid-contacts');
const btnSendMessages = document.getElementById('btn-send-messages');
const btnSendAllMessages = document.getElementById('btn-send-all-messages');
const imageUpload = document.getElementById('image-upload');

// Input Elements

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

// Helper Functions
function logActivity(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry', type);
    logEntry.innerHTML = `<strong>[${timestamp}]</strong> ${message}`;
    activityLog.prepend(logEntry); // Add to top
    if (activityLog.children.length > 100) { // Keep log clean
        activityLog.removeChild(activityLog.lastChild);
    }
}

function updateWhatsAppStatus(status, message) {
    whatsappStatus.className = `status-indicator ${status}`;
    whatsappStatus.innerHTML = `<i class="bi bi-circle-fill"></i> ${message}`;
}

function updateStatusMessage(status, message) {
    statusMessage.className = `alert alert-${status === 'error' || status === 'fatal_error' ? 'danger' : 'info'}`;
    statusMessage.textContent = message;
}

function showQRCode() {
    qrcodeContainer.classList.remove('d-none');
}

function hideQRCode() {
    qrcodeContainer.classList.add('d-none');
}

function showRestartButton() {
    restartContainer.classList.remove('d-none');
}

function hideRestartButton() {
    restartContainer.classList.add('d-none');
}

function updateMessageStats(stats) {
    totalMessages.textContent = stats.total;
    sentMessages.textContent = stats.sent;
    failedMessages.textContent = stats.failed;
    skippedMessages.textContent = stats.skipped;
}

function updateProgressBar(stats) {
    const total = stats.total;
    const processed = stats.sent + stats.failed + stats.skipped;
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    progressBar.style.width = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', percentage);
    progressBar.textContent = `${percentage}%`;
}

function updateContactStats(stats) {
    totalContacts.textContent = stats.total;
    filteredContacts.textContent = stats.filtered;
}

function generateQRCode(qrData) {
    // This function is intentionally left blank as QR code is now displayed in the terminal.
}

function updateButtonStates() {
    btnPause.disabled = isPaused || !isProcessing || serviceErrorState;
    btnResume.disabled = !isPaused || isProcessing || serviceErrorState;
    btnClear.disabled = isProcessing || serviceErrorState;
    btnSendMessages.disabled = isProcessing || serviceErrorState;
    btnSendAllMessages.disabled = isProcessing || serviceErrorState;
    btnLoadGoogleSheets.disabled = isProcessing || serviceErrorState;
    if (btnApplyFilters) { // Check if element exists before accessing
        btnApplyFilters.disabled = isProcessing || serviceErrorState;
    }
    btnRestartService.disabled = isProcessing;
}

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
    logActivity('QR code received. Please scan to log in.', 'info');
    generateQRCode(qrData);
    showQRCode();
});

socket.on('stats', (stats) => {
    updateMessageStats(stats);
    updateProgressBar(stats);
});

socket.on('contacts', (stats) => {
    updateContactStats(stats);
});

socket.on('message_sent', (data) => {
    logActivity(`Message sent to ${data.fullName}`, 'success');
});

socket.on('message_failed', (data) => {
    logActivity(`Failed to send message to ${data.contact.firstName || ''} ${data.contact.lastName || ''} (${data.contact.number}): ${data.error.message || data.error}`, 'error');
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

btnLoadGoogleSheets.addEventListener('click', async () => {
    const sheetName = googleSheetName.value.trim();

    if (!sheetName) {
        logActivity('Please select a Google Sheet Name', 'error');
        return;
    }

    try {
        const response = await fetch('/api/google-sheet-id');
        const data = await response.json();
        if (data.sheetId) {
            const sheetId = data.sheetId;
            fetch('/api/contacts/google-sheets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sheetId, sheetName })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    logActivity(`Loaded ${data.count} contacts from Google Sheets`, 'success');
                    // Reset message stats when a new sheet is loaded
                    totalMessages.textContent = 0;
                    sentMessages.textContent = 0;
                    failedMessages.textContent = 0;
                    skippedMessages.textContent = 0;
                } else {
                    logActivity(`Error: ${data.error}`, 'error');
                }
            })
            .catch(error => {
                logActivity(`Error loading contacts: ${error.message}`, 'error');
            });
        } else {
            logActivity('Could not find Google Sheet ID', 'error');
        }
    } catch (error) {
        logActivity('Error fetching Google Sheet ID', 'error');
    }
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

const citiesLoader = document.getElementById('cities-loader');
const blockedNumbersLoader = document.getElementById('blocked-numbers-loader');

// Debounce function to limit how often a function is called
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Animate numbers when they change
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function updateMessageStats(stats) {
    animateValue(totalMessages, parseInt(totalMessages.textContent), stats.total, 500);
    animateValue(sentMessages, parseInt(sentMessages.textContent), stats.sent, 500);
    animateValue(failedMessages, parseInt(failedMessages.textContent), stats.failed, 500);
    animateValue(skippedMessages, parseInt(skippedMessages.textContent), stats.skipped, 500);
}

function updateContactStats(stats) {
    animateValue(totalContacts, parseInt(totalContacts.textContent), stats.total, 500);
    animateValue(filteredContacts, parseInt(filteredContacts.textContent), stats.filtered, 500);
}

// Enhance the filter process to provide more feedback
const debouncedFilter = debounce(() => {
    citiesLoader.classList.remove('d-none');
    blockedNumbersLoader.classList.remove('d-none');

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
    })
    .finally(() => {
        citiesLoader.classList.add('d-none');
        blockedNumbersLoader.classList.add('d-none');
    });
}, 500); // 500ms debounce delay

filterCities.addEventListener('input', debouncedFilter);
filterBlockedNumbers.addEventListener('input', debouncedFilter);

btnSendMessages.addEventListener('click', async () => {
    const template = messageTemplate.value;
    const imageFile = imageUpload.files[0];
    let imagePath = null;

    if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);

        try {
            logActivity('Uploading image...', 'info');
            const uploadResponse = await fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResponse.json();
            if (uploadData.success) {
                imagePath = uploadData.imagePath;
                logActivity(`Image uploaded: ${imagePath}`, 'success');
            } else {
                logActivity(`Image upload failed: ${uploadData.error}`, 'error');
                return; // Stop if image upload fails
            }
        } catch (error) {
            logActivity(`Error uploading image: ${error.message}`, 'error');
            return; // Stop if image upload fails
        }
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
    
    fetch('/api/messages/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            templateName: template,
            customData,
            imagePath // Include imagePath in the request
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
btnSendAllMessages.addEventListener('click', async () => {
    const template = messageTemplate.value;
    const imageFile = imageUpload.files[0];
    let imagePath = null;

    // Confirm with user due to potentially large number of messages
    if (!confirm('Are you sure you want to send messages to ALL contacts? This will bypass city filters.')) {
        return;
    }

    if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);

        try {
            logActivity('Uploading image...', 'info');
            const uploadResponse = await fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResponse.json();
            if (uploadData.success) {
                imagePath = uploadData.imagePath;
                logActivity(`Image uploaded: ${imagePath}`, 'success');
            } else {
                logActivity(`Image upload failed: ${uploadData.error}`, 'error');
                return; // Stop if image upload fails
            }
        } catch (error) {
            logActivity(`Error uploading image: ${error.message}`, 'error');
            return; // Stop if image upload fails
        }
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
            customData,
            imagePath // Include imagePath in the request
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

// Template Management Elements
const templateNameInput = document.getElementById('template-name');
const templateContentInput = document.getElementById('template-content');
const btnSaveTemplate = document.getElementById('btn-save-template');
const btnDeleteTemplate = document.getElementById('btn-delete-template');

// Template selection change handler
messageTemplate.addEventListener('change', () => {
    const template = messageTemplate.value;
    
    // Hide all data containers first
    customDataContainer.classList.add('d-none');
    eventDataContainer.classList.add('d-none');

    if (template === 'custom') {
        customDataContainer.classList.remove('d-none');
    } else if (['newEvent', 'reminder'].includes(template)) {
        eventDataContainer.classList.remove('d-none');
    }

    // Load selected template into editor
    loadTemplateIntoEditor(template);
});

btnSaveTemplate.addEventListener('click', saveTemplate);
btnDeleteTemplate.addEventListener('click', deleteTemplate);

// Function to load templates into the dropdown
async function loadTemplatesIntoDropdown() {
    try {
        const response = await fetch('/api/templates');
        const data = await response.json();
        if (data.success) {
            messageTemplate.innerHTML = ''; // Clear existing options
            data.templates.forEach(templateName => {
                const option = document.createElement('option');
                option.value = templateName;
                option.textContent = templateName;
                messageTemplate.appendChild(option);
            });
            // Trigger change to load default template into editor
            messageTemplate.dispatchEvent(new Event('change'));
        } else {
            logActivity(`Error loading templates: ${data.error}`, 'error');
        }
    } catch (error) {
        logActivity(`Error fetching templates: ${error.message}`, 'error');
    }
}

// Function to load a selected template into the editor
async function loadTemplateIntoEditor(templateName) {
    if (!templateName) {
        templateNameInput.value = '';
        templateContentInput.value = '';
        btnDeleteTemplate.disabled = true;
        return;
    }
    try {
        const response = await fetch(`/api/templates/${templateName}`);
        const data = await response.json();
        if (data.success) {
            templateNameInput.value = templateName;
            templateContentInput.value = data.content;
            btnDeleteTemplate.disabled = false;
        } else {
            logActivity(`Error loading template ${templateName}: ${data.error}`, 'error');
            templateNameInput.value = templateName; // Keep name
            templateContentInput.value = ''; // Clear content if not found
            btnDeleteTemplate.disabled = true;
        }
    } catch (error) {
        logActivity(`Error fetching template ${templateName}: ${error.message}`, 'error');
        templateNameInput.value = templateName;
        templateContentInput.value = '';
        btnDeleteTemplate.disabled = true;
    }
}

// Function to save a template
async function saveTemplate() {
    const name = templateNameInput.value.trim();
    const content = templateContentInput.value.trim();

    if (!name || !content) {
        logActivity('Template name and content cannot be empty.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/templates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, content })
        });
        const data = await response.json();
        if (data.success) {
            logActivity(`Template '${name}' saved successfully.`, 'success');
            await loadTemplatesIntoDropdown(); // Refresh dropdown
            messageTemplate.value = name; // Select the newly saved template
            messageTemplate.dispatchEvent(new Event('change')); // Trigger change to update editor
        } else {
            logActivity(`Error saving template: ${data.error}`, 'error');
        }
    } catch (error) {
        logActivity(`Error saving template: ${error.message}`, 'error');
    }
}

// Function to delete a template
async function deleteTemplate() {
    const name = templateNameInput.value.trim();
    if (!name) {
        logActivity('No template selected to delete.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete template '${name}'?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/templates/${name}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            logActivity(`Template '${name}' deleted successfully.`, 'success');
            await loadTemplatesIntoDropdown(); // Refresh dropdown
            templateNameInput.value = '';
            templateContentInput.value = '';
            btnDeleteTemplate.disabled = true;
        } else {
            logActivity(`Error deleting template: ${data.error}`, 'error');
        }
    } catch (error) {
        logActivity(`Error deleting template: ${error.message}`, 'error');
    }
}

async function init() {
    // Initial button states
    updateButtonStates();
    // Load templates into dropdown on page load
    loadTemplatesIntoDropdown();

    // Fetch the Google Sheet ID from the server and load sheets
    try {
        const response = await fetch('/api/google-sheet-id');
        const data = await response.json();
        if (data.sheetId) {
            const sheetId = data.sheetId;
            try {
                const response = await fetch(`/api/google-sheets/sheets?sheetId=${sheetId}`);
                const data = await response.json();
                if (data.success) {
                    googleSheetName.innerHTML = '';
                    data.sheets.forEach(name => {
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        googleSheetName.appendChild(option);
                    });
                    googleSheetName.disabled = false;
                    logActivity(`Loaded ${data.sheets.length} sheets for ID: ${sheetId}`, 'success');
                    // Automatically load contacts for the first sheet
                    if (data.sheets.length > 0) {
                        const firstSheetName = data.sheets[0];
                        fetch('/api/contacts/google-sheets', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ sheetId, sheetName: firstSheetName })
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                logActivity(`Loaded ${data.count} contacts from Google Sheets (initial load)`, 'success');
                                totalMessages.textContent = 0;
                                sentMessages.textContent = 0;
                                failedMessages.textContent = 0;
                                skippedMessages.textContent = 0;
                            } else {
                                logActivity(`Error loading contacts (initial load): ${data.error}`, 'error');
                            }
                        })
                        .catch(error => {
                            logActivity(`Error loading contacts (initial load): ${error.message}`, 'error');
                        });
                    }
                } else {
                    logActivity(`Error loading sheets: ${data.error}`, 'error');
                    googleSheetName.innerHTML = '<option value="">Error loading sheets</option>';
                    googleSheetName.disabled = true;
                }
            } catch (error) {
                logActivity(`Error fetching sheet names: ${error.message}`, 'error');
                googleSheetName.innerHTML = '<option value="">Error fetching sheets</option>';
                googleSheetName.disabled = true;
            }
        }
    } catch (error) {
        logActivity('Error fetching Google Sheet ID', 'error');
    }

    

    // Event listener for restart service button
    btnRestartService.addEventListener('click', () => {
        logActivity('Restarting WhatsApp service...', 'info');
        fetch('/api/restart', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    logActivity('WhatsApp service restart initiated.', 'success');
                    hideRestartButton();
                    updateWhatsAppStatus('initializing', 'Restarting...');
                } else {
                    logActivity(`Error restarting service: ${data.error}`, 'error');
                }
            })
            .catch(error => {
                logActivity(`Error restarting service: ${error.message}`, 'error');
            });
    });
}

// Call init on page load
init();