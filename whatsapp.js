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
// EXTRAER NOMBRE COMPLETO DEL CLIENTE (NOMBRE Y APELLIDOS)
// ============================================
function extractClientName(emailData) {
    const bodyContent = emailData.body?.content || '';
    const bodyPreview = emailData.bodyPreview || '';
    const fullBody = bodyContent + ' ' + bodyPreview;

    // Patrón 1: Del campo from.emailAddress.name "NOMBRE APELLIDO mediante Inmuebles24/Proppit"
    const fromName = emailData.from?.emailAddress?.name || emailData.from?.name || '';
    const medianteMatch = fromName.match(/^(.+?)\s+mediante\s+(?:Inmuebles24|Proppit)/i);
    if (medianteMatch) {
        return medianteMatch[1].trim(); // Ya incluye nombre y apellidos
    }

    // Patrón 2: En el HTML "Nombre y apellido:</span>...<NOMBRE COMPLETO></span>" (Inmuebles24, Proppit)
    const nombreApellidoMatch = fullBody.match(/Nombre y apellido:?<\/span>\s*<span[^>]*>([^<]+)<\/span>/i);
    if (nombreApellidoMatch) {
        return nombreApellidoMatch[1].trim();
    }

    // Patrón 2b: "Nombre y apellidos:" (variante con 's')
    const nombreApellidosMatch = fullBody.match(/Nombre y apellidos:?<\/span>\s*<span[^>]*>([^<]+)<\/span>/i);
    if (nombreApellidosMatch) {
        return nombreApellidosMatch[1].trim();
    }

    // Patrón 2c: "Nombre completo:" en HTML
    const nombreCompletoHtmlMatch = fullBody.match(/Nombre completo:?<\/span>\s*<span[^>]*>([^<]+)<\/span>/i);
    if (nombreCompletoHtmlMatch) {
        return nombreCompletoHtmlMatch[1].trim();
    }

    // Patrón 3: "Nombre:</span>...<NOMBRE></span>" y buscar también apellido
    const nombreHtmlMatch = fullBody.match(/Nombre:<\/span>\s*<span[^>]*>([^<]+)<\/span>/i);
    if (nombreHtmlMatch) {
        let nombreCompleto = nombreHtmlMatch[1].trim();
        // Buscar apellido(s) por separado
        const apellidoMatch = fullBody.match(/Apellidos?:<\/span>\s*<span[^>]*>([^<]+)<\/span>/i);
        if (apellidoMatch) {
            nombreCompleto += ' ' + apellidoMatch[1].trim();
        }
        return nombreCompleto;
    }

    // Patrón 4: EasyBroker - "Enviado por:\n NOMBRE COMPLETO\n EMAIL"
    const easybrokerMatch = bodyPreview.match(/Enviado por:\s*\n\s*([^\n@]+)\s*\n/i);
    if (easybrokerMatch && easybrokerMatch[1].trim().length > 1 && !easybrokerMatch[1].includes('@')) {
        return easybrokerMatch[1].trim();
    }

    // Patrón 5: "Enviado por:" seguido de nombre en la misma línea
    const enviadoPorMatch = fullBody.match(/Enviado por:\s*([^\n<@]+)/i);
    if (enviadoPorMatch && enviadoPorMatch[1].trim().length > 2) {
        return enviadoPorMatch[1].trim();
    }

    // Patrón 6: MercadoLibre/Vivanuncios - "De: NOMBRE" o "Interesado: NOMBRE"
    const deMatch = bodyPreview.match(/(?:De|Interesado|Contacto|Cliente):\s*([^\n<@]+)/i);
    if (deMatch && deMatch[1].trim().length > 2) {
        return deMatch[1].trim();
    }

    // Patrón 7: "Nombre completo:" en texto plano
    const nombreCompletoMatch = bodyPreview.match(/Nombre completo:\s*([^\n<@]+)/i);
    if (nombreCompletoMatch && nombreCompletoMatch[1].trim().length > 2) {
        return nombreCompletoMatch[1].trim();
    }

    // Patrón 8: "Nombre:" y "Apellido:" en texto plano (combinarlos)
    const nombreTextoMatch = bodyPreview.match(/Nombre:\s*([^\n<@,]+)/i);
    const apellidoTextoMatch = bodyPreview.match(/Apellidos?:\s*([^\n<@,]+)/i);
    if (nombreTextoMatch && nombreTextoMatch[1].trim().length > 1) {
        let nombreCompleto = nombreTextoMatch[1].trim();
        if (apellidoTextoMatch && apellidoTextoMatch[1].trim().length > 1) {
            nombreCompleto += ' ' + apellidoTextoMatch[1].trim();
        }
        return nombreCompleto;
    }

    // Patrón 9: "Nombre:" o "Cliente:" en texto plano (ya podría incluir apellidos)
    const nombreSoloMatch = bodyPreview.match(/(?:Nombre|Cliente|Name):\s*([^\n<@]+)/i);
    if (nombreSoloMatch && nombreSoloMatch[1].trim().length > 2) {
        return nombreSoloMatch[1].trim();
    }

    // Fallback: usar el nombre del campo from (sin "mediante...")
    if (fromName && fromName !== 'Sin nombre' && !fromName.includes('@')) {
        return fromName;
    }

    return 'No detectado';
}

// ============================================
// EXTRAER TELÉFONO DEL CLIENTE
// ============================================
function extractClientPhone(emailData) {
    const bodyContent = emailData.body?.content || '';
    const bodyPreview = emailData.bodyPreview || '';
    const fullBody = bodyContent + ' ' + bodyPreview;

    // Patrón 1: En HTML "Teléfono:</span>...>NUMERO</span>"
    const telefonoHtmlMatch = fullBody.match(/Teléfono:<\/span>\s*<span[^>]*>([0-9+\s\-\(\)]{10,})<\/span>/i);
    if (telefonoHtmlMatch) {
        return telefonoHtmlMatch[1].trim();
    }

    // Patrón 2: Número de teléfono mexicano en el texto (52XXXXXXXXXX o 10 dígitos)
    const mexicanPhoneMatch = bodyPreview.match(/\b(52\d{10}|\d{10})\b/);
    if (mexicanPhoneMatch) {
        return mexicanPhoneMatch[1];
    }

    // Patrón 3: "Teléfono:" o "Tel:" seguido de número
    const telMatch = fullBody.match(/(?:teléfono|telefono|tel|cel|celular|móvil|movil|whatsapp|phone):?\s*(\+?[\d\s\-\(\)]{10,})/i);
    if (telMatch) {
        return telMatch[1].replace(/\s/g, '').trim();
    }

    // Patrón 4: Número con formato (XX) XXXX-XXXX
    const formattedPhone = bodyPreview.match(/\(?\d{2,3}\)?[\s\-]?\d{4}[\s\-]?\d{4}/);
    if (formattedPhone) {
        return formattedPhone[0].replace(/[\s\-\(\)]/g, '');
    }

    return 'No detectado';
}

// ============================================
// EXTRAER EMAIL DEL CLIENTE
// ============================================
function extractClientEmail(emailData) {
    const bodyContent = emailData.body?.content || '';
    const bodyPreview = emailData.bodyPreview || '';
    const fullBody = bodyContent + ' ' + bodyPreview;

    // Lista de dominios de portales a ignorar
    const portalDomains = [
        'usuarios.inmuebles24',
        'inbox.easybroker.com',
        'easybroker.com',
        'proppit.com',
        'vivanuncios.com',
        'mercadolibre.com',
        'mercado-libre.com'
    ];

    // Patrón 1: En HTML "mailto:EMAIL"
    const mailtoMatch = fullBody.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (mailtoMatch) {
        const email = mailtoMatch[1].toLowerCase();
        if (!portalDomains.some(domain => email.includes(domain))) {
            return mailtoMatch[1];
        }
    }

    // Patrón 2: Email en texto plano (buscar todos y filtrar portales)
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    const emails = bodyPreview.match(emailRegex) || [];
    for (const email of emails) {
        const lowerEmail = email.toLowerCase();
        if (!portalDomains.some(domain => lowerEmail.includes(domain))) {
            return email;
        }
    }

    // Patrón 3: "E-mail:" o "Email:" seguido del email
    const emailMatch = fullBody.match(/(?:e-?mail|correo):\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
        const email = emailMatch[1].toLowerCase();
        if (!portalDomains.some(domain => email.includes(domain))) {
            return emailMatch[1];
        }
    }

    return null;
}

// ============================================
// FORMATEAR NOTIFICACIÓN DE EMAIL
// ============================================
function formatEmailNotification(emailData, source, propertyUrl = null, propertyCode = null, linkInmobiliarioUrl = null) {
    const fromAddress = emailData.from?.emailAddress?.address ||
        emailData.from?.address ||
        emailData.from ||
        'Desconocido';

    // Extraer información del cliente
    const clientName = extractClientName(emailData);
    const clientPhone = extractClientPhone(emailData);
    const clientEmail = extractClientEmail(emailData);

    const subject = emailData.subject || '(Sin asunto)';
    const bodyPreview = emailData.bodyPreview || emailData.body?.content || '';

    // Truncar body preview si es muy largo
    const truncatedBody = bodyPreview.length > 300
        ? bodyPreview.substring(0, 300) + '...'
        : bodyPreview;

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
👤 *Nombre Completo:* ${clientName}
📱 *Teléfono:* ${clientPhone}`;

    // Agregar email del cliente si es diferente al del portal
    if (clientEmail) {
        message += `\n📧 *Email:* ${clientEmail}`;
    }

    // Agregar código de propiedad y URL si existen
    if (propertyCode) {
        message += `\n\n🏷️ *Código:* ${propertyCode}`;
    }

    if (propertyUrl) {
        message += `\n🔗 *Link EasyBroker:* ${propertyUrl}`;
    }

    if (linkInmobiliarioUrl) {
        message += `\n🏠 *Link Inmobiliario:* ${linkInmobiliarioUrl}`;
    }

    message += `

📝 *Asunto:* ${subject}

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
    extractClientName,
    extractClientPhone,
    extractClientEmail,
    EVOLUTION_CONFIG,
    EASYBROKER_CONFIG
};
