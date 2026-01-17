const whatsapp = require('./whatsapp');

async function test() {
    console.log('Testing N8N email sending...');

    const payload = {
        gestor: {
            nombre: 'Test User',
            email: 'administracion@linkinmobiliario.com.mx'
        },
        lead: {
            nombreCliente: 'Test Client',
            emailCliente: 'client@test.com',
            origen: 'Test Source',
            asunto: 'Test Subject',
            mensaje: 'This is a test message.'
        },
        propiedad: {
            codigo: 'TEST-123'
        },
        emailSubject: '🔔 Test Email Notification'
    };

    try {
        const result = await whatsapp.sendEmailViaN8N(payload);
        console.log('Result:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
