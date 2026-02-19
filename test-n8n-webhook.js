/**
 * Test: Enviar lead de prueba al webhook de n8n para HubSpot
 */
require('dotenv').config();
const hubspot = require('./hubspot-integration');

async function testWebhook() {
    console.log('🧪 === TEST: Envío de lead al webhook de n8n ===\n');
    console.log(`📡 Webhook URL: ${process.env.N8N_HUBSPOT_WEBHOOK || '(usando default hardcoded)'}\n`);

    const testLead = {
        email: 'test-webhook-n8n@gmail.com',
        firstName: 'Test Webhook',
        lastName: 'n8n',
        phone: '5551234567',
        message: 'Hola, estoy interesado en la propiedad EB-ABC123. Me gustaría agendar una visita.',
        source: 'easybroker',
        propertyTitle: 'Casa en Venta en Colonia del Valle',
        price: '$4,500,000 MXN',
        location: 'Colonia del Valle, CDMX',
        url: 'https://www.easybroker.com/mx/inmueble/casa-del-valle',
        propertyCode: 'EB-ABC123',
        subject: 'Lead EasyBroker - Casa en Venta EB-ABC123'
    };

    console.log('📋 Lead de prueba:');
    console.log(`   Email: ${testLead.email}`);
    console.log(`   Nombre: ${testLead.firstName} ${testLead.lastName}`);
    console.log(`   Fuente: ${testLead.source}`);
    console.log(`   Propiedad: ${testLead.propertyTitle}`);
    console.log('');

    try {
        const result = await hubspot.processLead(testLead);
        console.log('\n✅ Resultado:', JSON.stringify(result, null, 2));
        console.log('\n🎉 ¡Test exitoso! Verifica en n8n que se recibió el webhook.');
    } catch (err) {
        console.error('\n❌ Error:', err.message);
    }
}

testWebhook();
