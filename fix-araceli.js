require('dotenv').config();
const hubspot = require('./hubspot-integration');
const whatsapp = require('./whatsapp');

async function fixAraceliLead() {
    console.log('🚀 Arreglando lead de Araceli (EB-VF7999)...');

    const propertyCode = 'EB-VF7999';
    let propertyUrl = `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir`;
    let propertyTitle = 'Casa en Venta en Valle Real';
    let price = 'MN 14,900,000';
    let location = 'Valle Real, Zapopan';

    try {
        const property = await whatsapp.getPropertyFromEasyBroker(propertyCode);
        if (property) {
            propertyUrl = property.public_url || propertyUrl;
            propertyTitle = property.title || propertyTitle;
            price = property.price ? `${property.price.amount} ${property.price.currency}` : price;
            location = property.location ? property.location.name : location;
        }
    } catch (e) {
        console.log('⚠️ Usando datos de respaldo para Araceli.');
    }

    const leadForHubSpot = {
        email: 'gmasinmobiliarios@gmail.com',
        firstName: 'GRUPO MAS INMOBILIARIOS',
        lastName: '',
        phone: '523333359150',
        source: 'inmuebles24',
        subject: '📱 Consultaron tu WhatsApp - Casa en Venta en Valle Real',
        message: 'Hola, me interesa esta propiedad: Casa en Venta en Valle Real. ¿Me puedes dar más información?',
        propertyTitle,
        price,
        location,
        url: propertyUrl,
        propertyCode
    };

    console.log('📤 Enviando nota a HubSpot...');
    try {
        await hubspot.processLead(leadForHubSpot);
        console.log('✅ Araceli actualizada!');
    } catch (e) {
        console.error('❌ Error en inyección:', e.message);
    }
}

fixAraceliLead();
