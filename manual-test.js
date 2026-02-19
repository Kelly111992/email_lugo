const whatsapp = require('./whatsapp');

async function manualTest() {
    console.log('--- Manual Test Start ---');
    console.log('Testing with customized GESTORES settings...');

    const mockEmailData = {
        subject: 'Consulta por propiedad EB-TEST1234',
        body: { content: 'Hola, me interesa esta propiedad.' },
        from: {
            name: 'Cliente Prueba mediante Portal',
            address: 'cliente@test.com'
        },
        bodyPreview: 'Hola, me interesa esta propiedad. Mi teléfono es 5512345678.'
    };

    try {
        const result = await whatsapp.notifyNewEmail(mockEmailData, 'test-source');
        console.log('--- Test Finished ---');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Test Failed:', error);
    }
}

manualTest();
