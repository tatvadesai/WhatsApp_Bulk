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
            
            // Debug: Log sample contact
            if (contacts.length > 0) {
                logger.info(`Sample contact fields: ${Object.keys(contacts[0]).join(', ')}`);
                logger.info(`Sample contact data: ${JSON.stringify(contacts[0])}`);
            }
            
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
            cities = [], 
            blockedNumbers = [],
            applyFilters = true,
            debugMode = false
        } = options;
        
        const debugMessages = [];
        const addDebugMessage = (message) => {
            if (debugMode) {
                debugMessages.push(message);
                logger.debug(message);
            }
        };
        
        logger.info('Filtering contacts...');
        logger.info(`Filter options: cities=${JSON.stringify(cities)}, blocked=${blockedNumbers?.length}, applyFilters=${applyFilters}`);
        
        if (this.io) {
            this.io.emit('status', { 
                status: 'filtering', 
                message: 'Filtering contacts...' 
            });
        }
        
        let filtered = [...this.contacts];
        
        // Debug: Log all contacts before filtering
        logger.info(`Starting with ${filtered.length} contacts before filtering`);
        if (filtered.length > 0) {
            logger.info(`First contact before filtering: ${JSON.stringify(filtered[0])}`);
            
            if (debugMode) {
                addDebugMessage(`Starting with ${filtered.length} contacts`);
                addDebugMessage(`Sample contact data: ${JSON.stringify(filtered[0])}`);
                addDebugMessage(`Available fields: ${Object.keys(filtered[0]).join(', ')}`);
            }
        }
        
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
            // Log the cities for debugging
            logger.info(`Filtering by cities: ${cities.join(', ')}`);
            if (debugMode) {
                addDebugMessage(`Filtering by cities: ${cities.join(', ')}`);
            }

            // Keep track of why contacts are being filtered out
            const cityMismatchReasons = {};
            
            filtered = filtered.filter(contact => {
                // Enhanced field checking - look for city info in multiple possible fields
                const possibleCityFields = [
                    'city', 'location', 'City', 'Location', 
                    'address', 'Address', 'region', 'Region', 
                    'area', 'Area', 'town', 'Town', 'village', 'Village',
                    'locality', 'Locality', 'district', 'District'
                ];
                
                let contactCity = '';
                let cityField = '';
                
                // Try to find a city value in any of the possible fields
                for (const field of possibleCityFields) {
                    if (contact[field] && contact[field].toString().trim() !== '') {
                        contactCity = contact[field].toString().trim();
                        cityField = field;
                        logger.debug(`Found city in field '${field}': '${contactCity}'`);
                        if (debugMode) {
                            addDebugMessage(`Contact ${contact.name || contact.firstName || 'unknown'}: Found city "${contactCity}" in field "${field}"`);
                        }
                        break;
                    }
                }
                
                // If no explicit city field, try to extract from address if present
                if (!contactCity) {
                    // Try several address-like fields
                    const addressFields = ['address', 'fullAddress', 'addr', 'location', 'contactAddress'];
                    
                    for (const addrField of addressFields) {
                        if (contact[addrField]) {
                            logger.debug(`No city field found, checking ${addrField}: ${contact[addrField]}`);
                            contactCity = this.extractCityFromAddress(contact[addrField]);
                            if (contactCity) {
                                cityField = `${addrField} (extracted)`;
                                if (debugMode) {
                                    addDebugMessage(`Contact ${contact.name || contact.firstName || 'unknown'}: Extracted city "${contactCity}" from address field "${addrField}"`);
                                }
                                break;
                            }
                        }
                    }
                }
                
                if (!contactCity) {
                    // If still no city, try to see if any field contains a city name
                    for (const city of cities) {
                        const trimmedCity = city.trim().toLowerCase();
                        if (!trimmedCity) continue;
                        
                        // Look through all fields for city name
                        for (const [field, value] of Object.entries(contact)) {
                            if (value && typeof value === 'string' && value.toLowerCase().includes(trimmedCity)) {
                                contactCity = trimmedCity;
                                cityField = `${field} (matched pattern)`;
                                if (debugMode) {
                                    addDebugMessage(`Contact ${contact.name || contact.firstName || 'unknown'}: Found city "${contactCity}" in field "${field}" by pattern matching`);
                                }
                                break;
                            }
                        }
                        
                        if (contactCity) break;
                    }
                }
                
                if (!contactCity) {
                    // Debug log all fields to see if we're missing something
                    logger.debug(`Contact has no recognized city field: ${JSON.stringify(contact)}`);
                    
                    // Track reason for debug
                    if (debugMode) {
                        addDebugMessage(`Contact ${contact.name || contact.firstName || 'unknown'} filtered out: No city field found`);
                        cityMismatchReasons['No city field'] = (cityMismatchReasons['No city field'] || 0) + 1;
                    }
                    
                    return false;
                }
                
                // More flexible city matching
                for (const city of cities) {
                    const trimmedCity = city.trim();
                    if (!trimmedCity) continue;
                    
                    // Try multiple matching strategies
                    if (this.cityMatches(contactCity, trimmedCity)) {
                        logger.info(`City match found: Contact city "${contactCity}" matches filter "${trimmedCity}"`);
                        if (debugMode) {
                            addDebugMessage(`Contact ${contact.name || contact.firstName || 'unknown'} MATCHED: "${contactCity}" (${cityField}) matches filter "${trimmedCity}"`);
                        }
                        return true;
                    }
                }
                
                // Track reason for debug
                if (debugMode) {
                    addDebugMessage(`Contact ${contact.name || contact.firstName || 'unknown'} filtered out: City "${contactCity}" (${cityField}) did not match any filter cities`);
                    cityMismatchReasons[`No match for "${contactCity}"`] = (cityMismatchReasons[`No match for "${contactCity}"`] || 0) + 1;
                }
                
                logger.debug(`No city match for contact with city "${contactCity}"`);
                return false;
            });
            
            logger.info(`Filtered to ${filtered.length} contacts by city`);
            
            // Summarize reasons for debug mode
            if (debugMode && Object.keys(cityMismatchReasons).length > 0) {
                addDebugMessage(`City filtering summary: ${filtered.length} contacts matched, ${this.contacts.length - filtered.length} filtered out`);
                addDebugMessage(`Reasons for city filter mismatch: ${JSON.stringify(cityMismatchReasons)}`);
            }
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

    // Helper functions to improve city matching
    
    // Attempt to extract city from a full address string
    extractCityFromAddress(address) {
        if (!address) return '';
        
        const addressStr = address.toString();
        // Simple heuristic - split by commas and try to find city-like segments
        const parts = addressStr.split(/,|;/);
        
        // If we have multiple parts, the second-to-last is often the city
        if (parts.length > 2) {
            return parts[parts.length - 2].trim();
        }
        
        // Otherwise return the whole string as a fallback
        return addressStr.trim();
    }
    
    // Check if city names match using multiple strategies
    cityMatches(contactCity, filterCity) {
        if (!contactCity || !filterCity) return false;
        
        const contactLower = contactCity.toLowerCase();
        const filterLower = filterCity.toLowerCase();
        
        // 1. Exact match
        if (contactLower === filterLower) return true;
        
        // 2. Contains match
        if (contactLower.includes(filterLower) || filterLower.includes(contactLower)) return true;
        
        // 3. Word boundary match - check if filter city is a whole word in contact city
        const wordBoundaryRegex = new RegExp(`\\b${filterLower}\\b`);
        if (wordBoundaryRegex.test(contactLower)) return true;
        
        // 4. Remove common suffixes (like "city") and try again
        const cleanContactCity = contactLower.replace(/\s+(city|town|village|area|region)$/, '');
        const cleanFilterCity = filterLower.replace(/\s+(city|town|village|area|region)$/, '');
        
        if (cleanContactCity === cleanFilterCity) return true;
        if (cleanContactCity.includes(cleanFilterCity) || cleanFilterCity.includes(cleanContactCity)) return true;
        
        return false;
    }
}

module.exports = ContactService; 