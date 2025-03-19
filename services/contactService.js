const config = require('../config');
const logger = require('../utils/logger');
const { fetchGoogleSheetData, streamGoogleSheetData } = require('../googleSheetsIntegration');
const { streamCsvFile } = require('../utils/csvHandler');
const EventEmitter = require('events');

class ContactService extends EventEmitter {
    constructor(whatsappClient, io) {
        super();
        this.whatsappClient = whatsappClient;
        this.io = io;
        this.contacts = [];
        this.filteredContacts = [];
    }

    async loadContactsFromGoogleSheets() {
        try {
            logger.info('Loading contacts from Google Sheets...');
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'loading', 
                    message: 'Loading contacts from Google Sheets...' 
                });
            }
            
            const contacts = await fetchGoogleSheetData();
            this.contacts = contacts;
            
            logger.info(`Loaded ${contacts.length} contacts from Google Sheets`);
            this.emit('contacts_loaded', contacts.length);
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'contacts_loaded', 
                    message: `Loaded ${contacts.length} contacts from Google Sheets` 
                });
            }
            
            return contacts;
        } catch (error) {
            logger.error('Error loading contacts from Google Sheets:', error);
            this.emit('error', error);
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'error', 
                    message: 'Error loading contacts: ' + error.message 
                });
            }
            
            throw error;
        }
    }

    async loadContactsFromCsv(filePath) {
        try {
            logger.info(`Loading contacts from CSV file: ${filePath}`);
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'loading', 
                    message: 'Loading contacts from CSV file...' 
                });
            }
            
            const contacts = [];
            
            await new Promise((resolve, reject) => {
                streamCsvFile(filePath, (contact) => {
                    contacts.push(contact);
                })
                .then(() => resolve())
                .catch(err => reject(err));
            });
            
            this.contacts = contacts;
            
            logger.info(`Loaded ${contacts.length} contacts from CSV`);
            this.emit('contacts_loaded', contacts.length);
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'contacts_loaded', 
                    message: `Loaded ${contacts.length} contacts from CSV` 
                });
            }
            
            return contacts;
        } catch (error) {
            logger.error('Error loading contacts from CSV:', error);
            this.emit('error', error);
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'error', 
                    message: 'Error loading contacts: ' + error.message 
                });
            }
            
            throw error;
        }
    }

    async filterContacts(options = {}) {
        const {
            cities = config.ALLOWED_CITIES,
            blockedNumbers = config.BLOCKED_NUMBERS,
            filterByPaidLabel = config.FILTER_BY_PAID_LABEL,
            applyFilters = true
        } = options;
        
        logger.info('Filtering contacts...');
        
        if (this.io) {
            this.io.emit('status', { 
                status: 'filtering', 
                message: 'Filtering contacts...' 
            });
        }
        
        let filtered = [...this.contacts];
        
        if (!applyFilters) {
            logger.info('Skipping city and paid label filters as requested');
            
            if (blockedNumbers && blockedNumbers.length > 0) {
                filtered = filtered.filter(contact => {
                    // Normalize number field to handle different naming conventions
                    const contactNumber = (contact.number || contact.phone || contact.phoneNumber || contact.phone_number || '').toString();
                    if (!contactNumber) return false;
                    
                    return !blockedNumbers.some(blockedNum => 
                        contactNumber.includes(blockedNum)
                    );
                });
                logger.info(`Filtered to ${filtered.length} contacts after removing blocked numbers`);
            }
            
            this.filteredContacts = filtered;
            
            logger.info(`Filtering complete. ${filtered.length} contacts remaining.`);
            this.emit('contacts_filtered', filtered.length);
            
            if (this.io) {
                this.io.emit('status', { 
                    status: 'filtered', 
                    message: `Filtering complete. ${filtered.length} contacts remaining.` 
                });
                
                this.io.emit('contacts', {
                    total: this.contacts.length,
                    filtered: filtered.length
                });
            }
            
            return filtered;
        }
        
        if (cities && cities.length > 0) {
            filtered = filtered.filter(contact => {
                // Normalize city field to handle different naming conventions
                const contactCity = contact.city || contact.location || '';
                if (!contactCity) return false;
                
                return cities.some(city => 
                    contactCity.toLowerCase().includes(city.toLowerCase()) ||
                    city.toLowerCase().includes(contactCity.toLowerCase())
                );
            });
            logger.info(`Filtered to ${filtered.length} contacts by city`);
        }
        
        // Filter out blocked numbers
        if (blockedNumbers && blockedNumbers.length > 0) {
            filtered = filtered.filter(contact => {
                // Normalize number field to handle different naming conventions
                const contactNumber = (contact.number || contact.phone || contact.phoneNumber || contact.phone_number || '').toString();
                if (!contactNumber) return false;
                
                return !blockedNumbers.some(blockedNum => 
                    contactNumber.includes(blockedNum)
                );
            });
            logger.info(`Filtered to ${filtered.length} contacts after removing blocked numbers`);
        }
        
        // Filter by paid label if enabled
        if (filterByPaidLabel && this.whatsappClient.isReady) {
            try {
                const paidLabel = await this.whatsappClient.getPaidLabel();
                
                if (paidLabel) {
                    logger.info(`Filtering contacts by paid label: ${paidLabel.name} (${paidLabel.id})`);
                    
                    // Get all contacts with the paid label
                    const paidNumbers = await this.whatsappClient.getContactsWithPaidLabel();
                    
                    if (paidNumbers.length > 0) {
                        // Keep only contacts whose numbers are in the paidNumbers list
                        const beforeCount = filtered.length;
                        filtered = filtered.filter(contact => {
                            if (!contact.number) return false;
                            
                            // Clean the number for comparison (remove non-digits)
                            const cleanNumber = contact.number.toString().replace(/\D/g, '');
                            
                            // Check if this contact's number is in the paid label list
                            const hasPaidLabel = paidNumbers.some(paidNum => {
                                const cleanPaidNum = paidNum.replace(/\D/g, '');
                                return cleanNumber.endsWith(cleanPaidNum) || cleanPaidNum.endsWith(cleanNumber);
                            });
                            
                            return hasPaidLabel;
                        });
                        
                        logger.info(`Filtered from ${beforeCount} to ${filtered.length} contacts with paid label`);
                    } else {
                        logger.warn('No contacts found with the paid label. No filtering applied.');
                    }
                } else {
                    logger.warn('Paid label filtering enabled but no label found');
                }
            } catch (error) {
                logger.error('Error filtering by paid label:', error);
            }
        }
        
        this.filteredContacts = filtered;
        
        logger.info(`Filtering complete. ${filtered.length} contacts remaining.`);
        this.emit('contacts_filtered', filtered.length);
        
        if (this.io) {
            this.io.emit('status', { 
                status: 'filtered', 
                message: `Filtering complete. ${filtered.length} contacts remaining.` 
            });
            
            this.io.emit('contacts', {
                total: this.contacts.length,
                filtered: filtered.length
            });
        }
        
        return filtered;
    }

    getContacts(filtered = true) {
        return filtered ? this.filteredContacts : this.contacts;
    }

    getContactStats() {
        return {
            total: this.contacts.length,
            filtered: this.filteredContacts.length
        };
    }
}

module.exports = ContactService; 