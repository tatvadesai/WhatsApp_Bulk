const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { fetchGoogleSheetData } = require('./googleSheetsIntegration');

// Allowed cities and default message template.
const ALLOWED_CITIES = ['Ahmedabad'];
const DEFAULT_MESSAGE_TEMPLATE = `Hi {firstName},

We're setting the table for this Wednesday's GatherAround Dinner.

Pay Rs 99 at gather.around@ybl to confirm your spot.

Just a heads-up: Prices rise to Rs. 149 on Monday.`;

// Ensure MESSAGE_TEMPLATE is a string.
const MESSAGE_TEMPLATE = (process.env.MESSAGE_TEMPLATE && typeof process.env.MESSAGE_TEMPLATE === 'string')
  ? process.env.MESSAGE_TEMPLATE
  : DEFAULT_MESSAGE_TEMPLATE;

// Initialize the client with LocalAuth so you don't scan the QR every time.
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "client-one",
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp authentication successful!');
});

client.on('auth_failure', (error) => {
    console.error('❌ Authentication failed:', error);
});

client.on('ready', async () => {
    console.log('🚀 WhatsApp client is ready!');
    const contacts = await prepareContacts();
    await sendBulkMessages(contacts);
});

client.initialize();

/**
 * prepareContacts: Fetches data from Google Sheets, filters by allowed cities,
 * and formats the contact list with personalized messages.
 */
async function prepareContacts() {
    try {
        const sheetData = await fetchGoogleSheetData();
      
        // Filter contacts for allowed cities.
        const filteredContacts = sheetData.filter(contact => 
            ALLOWED_CITIES.includes(contact.city)
        );
      
        // Format each contact with their name and message.
        const preparedContacts = filteredContacts.map(contact => {
            const firstName = (contact.firstName || '').trim();
            if (!firstName) {
                console.warn(`Skipping contact with missing first name: ${contact.number}`);
                return null;
            }
            
            return {
                name: `${firstName} ${(contact.lastName || '').trim()}`,
                number: contact.number,
                message: MESSAGE_TEMPLATE.replace('{firstName}', firstName)
            };
        }).filter(contact => contact !== null);
      
        console.log(`📋 Found ${preparedContacts.length} contacts in ${ALLOWED_CITIES.join(', ')}`);
        return preparedContacts;
    } catch (error) {
        console.error('Error preparing contacts:', error);
        return [];
    }
}

/**
 * sendBulkMessages: Iterates over contacts and sends a WhatsApp message to each.
 */
async function sendBulkMessages(contacts) {
    console.log(`📤 Starting to send messages to ${contacts.length} contacts`);

    for (const contact of contacts) {
        try {
            if (!contact.number || !contact.message) {
                console.error(`❌ Invalid contact data: Skipping ${contact.name || 'unknown'}`);
                continue;
            }
            const number = contact.number.replace(/[^\d]/g, '');
            if (!number) {
                console.error(`❌ Invalid phone number for ${contact.name || 'unknown'}`);
                continue;
            }
            const chatId = `${number}@c.us`;
            await client.sendMessage(chatId, contact.message);
            console.log(`✅ Message sent to ${contact.name} (${number})`);
            // Delay of 5 seconds between messages.
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            console.error(`❌ Error sending to ${contact.name || 'unknown'} (${contact.number || 'invalid'}): ${error.message}`);
        }
    }
    console.log('✨ Bulk messaging completed!');
}