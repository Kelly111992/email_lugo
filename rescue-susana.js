require('dotenv').config();
const database = require('./database');
const hubspot = require('./hubspot-integration');
const whatsapp = require('./whatsapp');

async function rescueSusana() {
    console.log('🕵️‍♂️ Buscando a Susana Valdivia en Supabase...');

    // Obtenemos leads de Supabase
    const leads = await database.getLeadsFromSupabase(50);

    // Filtramos a Susana por su email
    const susana = leads.find(l =>
        l.from_address?.toLowerCase().includes('susanavalzam0124@gmail.com') ||
        l.body_preview?.toLowerCase().includes('susanavalzam0124@gmail.com') ||
        l.from_name?.toLowerCase().includes('susana valdivia')
    );

    if (!susana) {
        console.log('❌ No encontré a Susana en Supabase. Intentando búsqueda general...');
        return;
    }

    console.log('✅ Registro de Susana encontrado en Supabase!');
    console.log(`📧 Email: ${susana.from_address}`);
    console.log(`🏠 Fuente Original: ${susana.source}`);

    // Reconstruir emailData
    let emailData;
    try {
        emailData = typeof susana.raw_data === 'string' ? JSON.parse(susana.raw_data) : susana.raw_data;
    } catch (e) {
        emailData = {
            subject: susana.subject,
            bodyPreview: susana.body_preview,
            from: { emailAddress: { address: susana.from_address, name: susana.from_name } }
        };
    }

    // EXTRAER INFO DE PROPIEDAD
    const subject = susana.subject || '';
    const propertyCode = whatsapp.extractPropertyCode(subject);
    let propertyUrl = null;
    let propertyTitle = 'Propiedad interesada';
    let price = 'No especificado';
    let location = 'No especificada';

    if (propertyCode) {
        console.log(`🏠 Saca detalles para el código: ${propertyCode}`);
        try {
            const property = await whatsapp.getPropertyFromEasyBroker(propertyCode);
            if (property) {
                propertyUrl = property.public_url || null;
                propertyTitle = property.title || propertyTitle;
                price = property.price ? `${property.price.amount} ${property.price.currency}` : price;
                location = property.location ? property.location.name : location;
            }
        } catch (e) {
            console.log('⚠️ Error EasyBroker:', e.message);
        }
    }

    const leadForHubSpot = {
        email: 'susanavalzam0124@gmail.com',
        firstName: 'Susana Valdivia Zamudio',
        lastName: '',
        phone: '523331162517',
        message: susana.body_preview || '',
        source: susana.source,
        subject: subject,
        propertyTitle,
        price,
        location,
        url: propertyUrl || (propertyCode ? `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir` : null),
        propertyCode
    };

    console.log('📤 Enviando nota master a HubSpot...');
    const result = await hubspot.processLead(leadForHubSpot);

    if (success) {
        console.log('🚀 ¡EXITO! Nota enviada a Susana en HubSpot.');
    } else {
        console.log('❌ No se pudo actualizar a Susana.');
    }
}

rescueSusana().catch(console.error);
