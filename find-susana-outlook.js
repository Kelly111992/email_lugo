require('dotenv').config();
const outlook = require('./outlook-monitor');
const whatsapp = require('./whatsapp');

async function findRealSusana() {
    console.log('🔍 Buscando el correo real de Susana en tu Inbox de Outlook...');
    const token = await outlook.getAccessToken();
    if (!token) {
        console.error('❌ No se pudo obtener token de Outlook.');
        return;
    }

    const userId = process.env.OUTLOOK_USER_ID || process.env.OUTLOOK_EMAIL;
    // Buscamos correos que mencionen a Susana o su email
    const query = encodeURIComponent("susanavalzam0124@gmail.com");
    const url = `https://graph.microsoft.com/v1.0/users/${userId}/messages?$search="${query}"&$top=1`;

    const https = require('https');
    const result = await new Promise((resolve) => {
        const options = {
            headers: { 'Authorization': `Bearer ${token}` }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', (e) => resolve({ error: e.message }));
    });

    if (result.value && result.value.length > 0) {
        const email = result.value[0];
        console.log('✅ Correo encontrado!');
        console.log('Asunto:', email.subject);
        console.log('Preview:', email.bodyPreview);

        const propertyCode = whatsapp.extractPropertyCode(email.subject || '');
        console.log('🏠 Código detectado:', propertyCode);

        if (propertyCode) {
            console.log('🚀 ¡ENCONTRADO! El código real es:', propertyCode);
            // Ahora guardamos este dato para el siguiente paso
        } else {
            console.log('⚠️ No pude sacar el código del asunto. Revisando el cuerpo...');
        }
    } else {
        console.log('❌ No encontré ningún correo de hoy para Susana en Outlook. ¿Llegó hoy a las 8:53 AM?');
    }
}

findRealSusana();
