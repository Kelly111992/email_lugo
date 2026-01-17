const whatsapp = require('./whatsapp');
const { getAdminContacts } = require('./gestores');

async function verifyLogic() {
    console.log('--- Verifying Logic ---');

    const admins = getAdminContacts();
    console.log('Admins found:', admins.length);
    admins.forEach((a, i) => {
        console.log(`Admin ${i}: ${a.nombre}, Email: ${a.email}, HasEmail: ${!!a.email}`);
    });

    const mockEmailData = {
        subject: 'Test Subject',
        body: { content: 'Test Body' },
        from: { address: 'sender@test.com', name: 'Sender' }
    };

    // We can't easily mock the internal sendWhatsAppMessage but we can see if it throws or crashes
    // Actually, sendWhatsAppMessage tries to hit a real URL. 
    // We can temporarily monkey-patch it to avoid real calls during this verify script

    const originalSendWA = whatsapp.sendWhatsAppMessage;
    whatsapp.sendWhatsAppMessage = async (msg, number) => {
        console.log(`[MOCK] Sending WA to ${number}`);
        return { success: true };
    };

    const originalSendN8N = whatsapp.sendEmailViaN8N;
    whatsapp.sendEmailViaN8N = async (payload) => {
        console.log(`[MOCK] Sending N8N to ${payload.gestor.email}`);
        return { success: true };
    };

    console.log('Calling notifyNewEmail...');
    const result = await whatsapp.notifyNewEmail(mockEmailData, 'test-source');

    console.log('Result:', result);
    console.log('Email Results:', result.emailResults);

    if (result.emailResults.length > 0) {
        console.log('SUCCESS: Email logic was triggered.');
    } else {
        console.error('FAILURE: Email logic was NOT triggered.');
    }
}

verifyLogic();
