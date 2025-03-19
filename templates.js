/**
 * Message templates for WhatsApp mass messaging
 * 
 * Usage:
 * - Each template can use placeholders like {firstName}, {eventDate}, {venue}, etc.
 * - These placeholders will be replaced with actual values when sending messages
 * - Customize these templates or add new ones as needed
 */
const templates = {
    // Default dinner meetup invitation
    default: `Hi {firstName}! 🌟

Tatva here from GatherAround (https://www.instagram.com/gatheraround.social/)—I hope this message finds you well!

Just wanted to share that we’re organizing a dinner meetup on {eventDate} and thought you might be interested. 🥂

Would love to have you join us if you’re available! Let me know, and I’ll share all the details. 😊

`,
    
    // Follow-up message for people who didn't respond
    followUp: `Hi {firstName},

Just following up on the previous message about the GatherAround dinner on {eventDate}.
Best,
Tatva`,

    // Reminder for confirmed attendees
    reminder: `Quick reminder {firstName}!

Our GatherAround dinner is tomorrow at 7 PM.
Looking forward to seeing you there!

Venue: {venue}
`,

    // New event announcement
    newEvent: `Hello {firstName}!

We're excited to announce a new GatherAround event: {eventName}!

📅 Date: {eventDate}
📍 Location: {venue}
🕖 Time: {eventTime}

Would you like to join us? Let me know and I'll reserve your spot!

Best,
Tatva`,

    // Custom template - use for special messages
    custom: `{customMessage}`
};

module.exports = templates;