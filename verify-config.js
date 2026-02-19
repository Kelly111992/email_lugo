const { NOTIFICATION_CONFIG } = require('./gestores');

async function testConfig() {
    console.log('--- Verifying Configuration ---');
    console.log('WhatsApp Numbers:', NOTIFICATION_CONFIG.whatsapp_numbers);
    console.log('Email Recipients:', NOTIFICATION_CONFIG.email_recipients);

    if (NOTIFICATION_CONFIG.whatsapp_numbers.length === 3 && NOTIFICATION_CONFIG.email_recipients.length === 3) {
        console.log('✅ Configuration matches requirements (3 WA, 3 Emails)');
    } else {
        console.error('❌ Configuration mismatch!');
    }
}

testConfig();
