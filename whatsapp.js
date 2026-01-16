const https = require('https');
const http = require('http');

// ============================================
// CONFIGURACIÓN DE EVOLUTION API
// ============================================
const EVOLUTION_CONFIG = {
    baseUrl: process.env.EVOLUTION_API_URL || 'https://evolutionapi-evolution-api.ckoomq.easypanel.host',
    instanceName: process.env.EVOLUTION_INSTANCE || 'lugo_email',
    apiKey: process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11',
    destinationNumbers: (process.env.WHATSAPP_DESTINATION || '523318043673,523312505239').split(',')
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
async function sendWhatsAppMessage(message, destinationNumber) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/message/sendText/${EVOLUTION_CONFIG.instanceName}`);

        const postData = JSON.stringify({
            number: destinationNumber,
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
                    console.log(`✅ WhatsApp enviado a ${destinationNumber}`);
                    resolve({ success: true, response: JSON.parse(data) });
                } else {
                    console.error(`❌ Error en respuesta de Evolution API (${destinationNumber}):`, res.statusCode, data);
                    resolve({ success: false, error: data });
                }
            });
        });

        req.on('error', (error) => {
            console.error(`❌ Error al enviar WhatsApp a ${destinationNumber}:`, error.message);
            resolve({ success: false, error: error.message });
        });

        req.write(postData);
        req.end();
    });
}

// ============================================
// EXTRAER NOMBRE DEL CLIENTE
// ============================================
function extractClientName(emailData) {
    const bodyPreview = emailData.bodyPreview || emailData.body?.content || '';
    const subject = emailData.subject || '';

    // Patrón 1: "From: NOMBRE mediante Inmuebles24" o "From: NOMBRE mediante Proppit"
    const inmuebles24Match = bodyPreview.match(/From:\s*([^<\n]+)\s*mediante\s*(?:Inmuebles24|Proppit)/i);
    if (inmuebles24Match) {
        return inmuebles24Match[1].trim();
    }

    // Patrón 2: "Enviado por:" seguido de nombre en la siguiente línea
    const enviadoPorMatch = bodyPreview.match(/Enviado por:\s*\n?\s*([^\n<@]+)/i);
    if (enviadoPorMatch) {
        return enviadoPorMatch[1].trim();
    }

    // Patrón 3: "Nombre:" o "Cliente:" seguido del nombre
    const nombreMatch = bodyPreview.match(/(?:Nombre|Cliente|Name):\s*([^\n<@]+)/i);
    if (nombreMatch) {
        return nombreMatch[1].trim();
    }

    // Patrón 4: "De:" seguido del nombre (común en algunos portales)
    const deMatch = bodyPreview.match(/De:\s*([^<\n@]+?)(?:\s*<|$|\n)/i);
    if (deMatch && deMatch[1].trim().length > 2) {
        return deMatch[1].trim();
    }

    // Fallback: usar el nombre del campo from del email
    const fromName = emailData.from?.emailAddress?.name || emailData.from?.name || null;
    if (fromName && fromName !== 'Sin nombre') {
        return fromName;
    }

    return 'No detectado';
}

// ============================================
// FORMATEAR NOTIFICACIÓN DE EMAIL
// ============================================
function formatEmailNotification(emailData, source, propertyUrl = null, propertyCode = null, linkInmobiliarioUrl = null) {
    const fromAddress = emailData.from?.emailAddress?.address ||
        emailData.from?.address ||
        emailData.from ||
        'Desconocido';

    // Extraer nombre del cliente del cuerpo del correo
    const clientName = extractClientName(emailData);

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
👤 *Cliente:* ${clientName}
📧 *Email:* ${fromAddress}
📱 *Teléfono:* ${phone}`;

    // Agregar código de propiedad y URL si existen
    if (propertyCode) {
        message += `\n\n🏷️ *Código:* ${propertyCode}`;
    }

    if (propertyUrl) {
        message += `\n🔗 *EasyBroker:* ${propertyUrl}`;
    }

    if (linkInmobiliarioUrl) {
        message += `\n🏠 *Link Inmobiliario:* ${linkInmobiliarioUrl}`;
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

        // Generar URL de Link Inmobiliario si hay código
        let linkInmobiliarioUrl = null;
        if (propertyCode) {
            linkInmobiliarioUrl = `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir`;
            console.log(`🏠 URL de Link Inmobiliario: ${linkInmobiliarioUrl}`);
        }

        // Formatear mensaje con las URLs de la propiedad (si existen)
        const message = formatEmailNotification(emailData, source, propertyUrl, propertyCode, linkInmobiliarioUrl);

        // Enviar a todos los números configurados
        const sendPromises = EVOLUTION_CONFIG.destinationNumbers.map(number =>
            sendWhatsAppMessage(message, number.trim())
        );

        const results = await Promise.all(sendPromises);

        // Retornar éxito si al menos uno se envió correctamente
        const atLeastOneSuccess = results.some(r => r.success);
        return {
            success: atLeastOneSuccess,
            results
        };
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
