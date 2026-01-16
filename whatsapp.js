const https = require('https');
const http = require('http');

// ============================================
// CONFIGURACIÓN DE EVOLUTION API
// ============================================
const EVOLUTION_CONFIG = {
    baseUrl: process.env.EVOLUTION_API_URL || 'https://evolutionapi-evolution-api.ckoomq.easypanel.host',
    instanceName: process.env.EVOLUTION_INSTANCE || 'lugo_email',
    apiKey: process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11',
    destinationNumber: process.env.WHATSAPP_DESTINATION || '523318043673'
};

// ============================================
// CONFIGURACIÓN DE EASYBROKER API
// ============================================
const EASYBROKER_CONFIG = {
    baseUrl: 'https://api.easybroker.com/v1',
    apiKey: process.env.EASYBROKER_API_KEY || '6dt2onwsu5u3ex1qqh49rzck0wsyf4'
};

// ============================================
// EXTRAER CÓDIGO DE PROPIEDAD DEL ASUNTO
// ============================================
function extractPropertyCode(subject) {
    // Buscar patrones como EB-UZ4293, EB-UK0326, etc.
    const match = subject.match(/EB-[A-Z]{2}\d+/i);
    return match ? match[0].toUpperCase() : null;
}

// ============================================
// OBTENER PROPIEDAD DE EASYBROKER API
// ============================================
async function getPropertyFromEasyBroker(propertyCode) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${EASYBROKER_CONFIG.baseUrl}/properties/${propertyCode}`);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'X-Authorization': EASYBROKER_CONFIG.apiKey
            }
        };

        console.log(`🔍 Consultando propiedad: ${propertyCode}`);

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const property = JSON.parse(data);
                        console.log(`✅ Propiedad encontrada: ${property.public_url || 'Sin URL pública'}`);
                        resolve(property);
                    } catch (e) {
                        console.error('❌ Error parseando respuesta de EasyBroker:', e.message);
                        resolve(null);
                    }
                } else {
                    console.log(`⚠️ Propiedad no encontrada (${res.statusCode}): ${propertyCode}`);
                    resolve(null);
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ Error al consultar EasyBroker:', error.message);
            resolve(null);
        });

        req.end();
    });
}

// ============================================
// ENVIAR MENSAJE DE WHATSAPP
// ============================================
async function sendWhatsAppMessage(message) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/message/sendText/${EVOLUTION_CONFIG.instanceName}`);

        const postData = JSON.stringify({
            number: EVOLUTION_CONFIG.destinationNumber,
            text: message
        });

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_CONFIG.apiKey,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const protocol = url.protocol === 'https:' ? https : http;

        const req = protocol.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('✅ WhatsApp enviado exitosamente');
                    resolve({ success: true, response: JSON.parse(data) });
                } else {
                    console.error('❌ Error en respuesta de Evolution API:', res.statusCode, data);
                    resolve({ success: false, error: data });
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ Error al enviar WhatsApp:', error.message);
            resolve({ success: false, error: error.message });
        });

        req.write(postData);
        req.end();
    });
}

// ============================================
// FORMATEAR NOTIFICACIÓN DE EMAIL
// ============================================
function formatEmailNotification(emailData, source, propertyUrl = null, propertyCode = null) {
    const fromAddress = emailData.from?.emailAddress?.address ||
        emailData.from?.address ||
        emailData.from ||
        'Desconocido';

    const fromName = emailData.from?.emailAddress?.name ||
        emailData.from?.name ||
        'Sin nombre';

    const subject = emailData.subject || '(Sin asunto)';
    const bodyPreview = emailData.bodyPreview || emailData.body?.content || '';

    // Truncar body preview si es muy largo
    const truncatedBody = bodyPreview.length > 300
        ? bodyPreview.substring(0, 300) + '...'
        : bodyPreview;

    // Intentar extraer teléfono del cuerpo del mensaje
    const phoneMatch = bodyPreview.match(/(?:tel[éeéf]fono|cel|celular|móvil|movil|whatsapp)?:?\s*(\+?[\d\s\-\(\)]{10,})/i);
    const phone = phoneMatch ? phoneMatch[1].trim() : 'No detectado';

    // Emoji según origen
    const sourceEmojis = {
        'inmuebles24': '🏠',
        'proppit': '🏢',
        'easybroker': '🔑',
        'vivanuncios': '📢',
        'mercadolibre': '🛒',
        'personal': '👤',
        'otros': '📧'
    };

    const sourceNames = {
        'inmuebles24': 'Inmuebles24',
        'proppit': 'Proppit',
        'easybroker': 'EasyBroker',
        'vivanuncios': 'Vivanuncios',
        'mercadolibre': 'MercadoLibre',
        'personal': 'Personal',
        'otros': 'Otros'
    };

    const emoji = sourceEmojis[source] || '📧';
    const sourceName = sourceNames[source] || source;

    // Formatear fecha
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Construir mensaje base
    let message = `📧 *NUEVO LEAD*

${emoji} *Origen:* ${sourceName}
👤 *Cliente:* ${fromName}
📧 *Email:* ${fromAddress}
📱 *Teléfono:* ${phone}`;

    // Agregar código de propiedad y URL si existen
    if (propertyCode) {
        message += `\n\n🏷️ *Código:* ${propertyCode}`;
    }

    if (propertyUrl) {
        message += `\n🔗 *Propiedad:* ${propertyUrl}`;
    }

    message += `

📝 *Asunto:* ${subject}

💬 *Vista previa:*
${truncatedBody}

🕐 ${dateStr} ${timeStr}`;

    return message;
}

// ============================================
// NOTIFICAR NUEVO EMAIL
// ============================================
async function notifyNewEmail(emailData, source) {
    try {
        const subject = emailData.subject || '';

        // Extraer código de propiedad del asunto
        const propertyCode = extractPropertyCode(subject);
        let propertyUrl = null;

        // Si encontramos un código, consultar EasyBroker API
        if (propertyCode) {
            console.log(`📋 Código de propiedad detectado: ${propertyCode}`);
            const property = await getPropertyFromEasyBroker(propertyCode);
            if (property && property.public_url) {
                propertyUrl = property.public_url;
                console.log(`🔗 URL de propiedad obtenida: ${propertyUrl}`);
            }
        }

        // Formatear mensaje con la URL de la propiedad (si existe)
        const message = formatEmailNotification(emailData, source, propertyUrl, propertyCode);
        const result = await sendWhatsAppMessage(message);
        return result;
    } catch (error) {
        console.error('❌ Error al notificar por WhatsApp:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWhatsAppMessage,
    formatEmailNotification,
    notifyNewEmail,
    extractPropertyCode,
    getPropertyFromEasyBroker,
    EVOLUTION_CONFIG,
    EASYBROKER_CONFIG
};
