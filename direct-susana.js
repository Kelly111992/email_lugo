require('dotenv').config();
const hubspot = require('./hubspot-integration');
const whatsapp = require('./whatsapp');

async function directInjectSusana() {
    console.log('🚀 Iniciando inyección directa para Susana Valdivia...');

    // Datos sacados de tu captura de pantalla
    const leadForHubSpot = {
        email: 'susanavalzam0124@gmail.com',
        firstName: 'Susana Valdivia Zamudio',
        lastName: '',
        phone: '523331162517',
        source: 'inmuebles24',
        subject: 'Nuevo contacto desde Inmuebles24',
        message: 'Hola, me interesa esta propiedad. ¿Me puedes dar más información?',
        // Datos de la propiedad (Inmuebles24 suele enviar el código en el mensaje o subject)
        propertyTitle: 'Propiedad en Inmuebles24',
        price: 'Consultar',
        location: 'México',
        propertyCode: 'EB-XXXXXX' // El código real lo sacaría si lo tuviera, pero esto activará la nota
    };

    console.log('📤 Enviando nota master a HubSpot...');
    try {
        await hubspot.processLead(leadForHubSpot);
        console.log('✅ ¡Susana actualizada con éxito!');
    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}

directInjectSusana();
