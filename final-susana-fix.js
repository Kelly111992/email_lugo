require('dotenv').config();
const hubspot = require('./hubspot-integration');
const whatsapp = require('./whatsapp');

async function finalInjectSusana() {
    console.log('🚀 Iniciando inyección FINAL para Susana Valdivia (EB-VF8059)...');

    const propertyCode = 'EB-VF8059';
    let propertyUrl = `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir`;
    let propertyTitle = 'Local en Renta en Solares, Tec de Monterrey';
    let price = 'MN 8,500';
    let location = 'Fraccionamiento Solares, Zapopan';

    // Intentar obtener detalles frescos de EasyBroker
    try {
        const property = await whatsapp.getPropertyFromEasyBroker(propertyCode);
        if (property) {
            propertyUrl = property.public_url || propertyUrl;
            propertyTitle = property.title || propertyTitle;
            price = property.price ? `${property.price.amount} ${property.price.currency}` : price;
            location = property.location ? property.location.name : location;
        }
    } catch (e) {
        console.log('⚠️ No se pudo conectar a EasyBroker, usando datos de respaldo.');
    }

    const leadForHubSpot = {
        email: 'susanavalzam0124@gmail.com',
        firstName: 'Susana Valdivia Zamudio',
        lastName: '',
        phone: '523331162517',
        source: 'inmuebles24',
        subject: '📱 Consultaron tu WhatsApp - Local en Renta en Solares',
        message: 'Hola, me interesa esta propiedad: Local en Renta en Solares, Tec de Monterrey. ¿Me puedes dar más información?',
        propertyTitle,
        price,
        location,
        url: propertyUrl,
        propertyCode
    };

    console.log('📤 Enviando nota VERDADERA a HubSpot...');
    try {
        await hubspot.processLead(leadForHubSpot);
        console.log('✅ ¡Susana actualizada con DATOS REALES!');
    } catch (e) {
        console.error('❌ Error en inyección:', e.message);
    }
}

finalInjectSusana();
