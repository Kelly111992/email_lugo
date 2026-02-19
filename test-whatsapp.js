const https = require('https');
const http = require('http');
const { findGestorByName, getAdminContacts } = require('./gestores');

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
// CONFIGURACIÓN DE N8N WEBHOOK PARA EMAIL
// ============================================
const N8N_EMAIL_WEBHOOK = process.env.N8N_EMAIL_WEBHOOK || 'https://evolutionapi-n8n.ckoomq.easypanel.host/webhook/get_payload_lugo';

// ============================================
// FUNCIÓN PARA OBTENER FECHA/HORA DE MÉXICO
// ============================================
// ============================================
// FUNCIÓN PARA OBTENER FECHA/HORA DE MÉXICO
// ============================================
function getMexicoDateTime() {
    const now = new Date();

    // Usar API de Internacionalización para obtener hora exacta de CDMX
    // Esto maneja automáticamente offsets y formatos
    const options = {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };

    // Formato esperado: "DD/MM/YYYY, HH:MM a.m." (puede variar ligeramente según nodo)
    const formatter = new Intl.DateTimeFormat('es-MX', options);
    const parts = formatter.formatToParts(now);

    // Extraer partes para asegurar formato DD/MM/YYYY HH:MM a.m./p.m.
    const getPart = (type) => parts.find(p => p.type === type)?.value || '';

    const day = getPart('day');
    const month = getPart('month');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const dayPeriod = getPart('dayPeriod').toLowerCase().replace('.', '') + '.'; // am/pm -> a.m./p.m. aprox

    const dateStr = `${day}/${month}/${year}`;
    const timeStr = `${hour}:${minute} ${dayPeriod === 'am.' ? 'a.m.' : dayPeriod === 'pm.' ? 'p.m.' : dayPeriod}`;

    return { dateStr, timeStr };
}
//... (keeping other functions intact, just jump to notifyNewEmail modification if needed, but here we replace the function) ...
// Actually I need to replace the function at the top, and the payload construction later. 
// I will split this into two calls or use multi_replace.

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
// ENVIAR EMAIL DIRECTAMENTE VIA MICROSOFT GRAPH API
// ============================================
const outlookMonitor = require('./outlook-monitor');

async function sendEmailDirect(emailPayload) {
    try {
        const { gestor, lead, propiedad, fecha, emailSubject } = emailPayload;

        // Construir contenido HTML del email
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
                .field { margin-bottom: 15px; }
                .label { font-weight: bold; color: #555; }
                .value { color: #333; }
                .link { color: #667eea; text-decoration: none; }
                .footer { background: #f0f0f0; padding: 15px; border-radius: 0 0 10px 10px; text-align: center; font-size: 12px; color: #666; }
                .property-links { background: #e8f4fd; padding: 15px; border-radius: 5px; margin-top: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>📧 Nuevo Lead - ${lead.origen}</h2>
                    <p>Asignado a: ${gestor.nombre}</p>
                </div>
                <div class="content">
                    <div class="field">
                        <span class="label">👤 Nombre Completo:</span>
                        <span class="value">${lead.nombreCliente}</span>
                    </div>
                    <div class="field">
                        <span class="label">📱 Teléfono:</span>
                        <span class="value">${lead.telefonoCliente}</span>
                    </div>
                    ${lead.emailCliente && lead.emailCliente !== 'No proporcionado' ? `
                    <div class="field">
                        <span class="label">📧 Email:</span>
                        <span class="value"><a href="mailto:${lead.emailCliente}" class="link">${lead.emailCliente}</a></span>
                    </div>
                    ` : ''}
                    ${propiedad.codigo && propiedad.codigo !== 'No detectado' ? `
                    <div class="property-links">
                        <div class="field">
                            <span class="label">🏷️ Código de Propiedad:</span>
                            <span class="value">${propiedad.codigo}</span>
                        </div>
                        ${propiedad.urlEasyBroker ? `
                        <div class="field">
                            <span class="label">🔗 Link EasyBroker:</span>
                            <a href="${propiedad.urlEasyBroker}" class="link">${propiedad.urlEasyBroker}</a>
                        </div>
                        ` : ''}
                        ${propiedad.urlLinkInmobiliario ? `
                        <div class="field">
                            <span class="label">🏠 Link Inmobiliario:</span>
                            <a href="${propiedad.urlLinkInmobiliario}" class="link">Ver en Link Inmobiliario</a>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}
                    <div class="field" style="margin-top: 20px;">
                        <span class="label">📝 Asunto Original:</span>
                        <p class="value">${lead.asunto}</p>
                    </div>
                    <div class="field">
                        <span class="label">💬 Mensaje:</span>
                        <p class="value">${lead.mensaje}</p>
                    </div>
                </div>
                <div class="footer">
                    Recibido: ${fecha} | Link Inmobiliario GDL
                </div>
            </div>
        </body>
        </html>
        `;

        console.log(`📧 Enviando email directo a: ${gestor.email}`);

        const result = await outlookMonitor.sendEmail(
            gestor.email,
            emailSubject,
            htmlContent,
            '' // texto plano vacío, usamos HTML
        );

        if (result.success) {
            console.log(`✅ Email enviado directamente a ${gestor.email}`);
        } else {
            console.error(`❌ Error enviando email:`, result.error);
        }

        return result;
    } catch (error) {
        console.error(`❌ Error al enviar email directo:`, error.message);
        return { success: false, error: error.message };
    }
}

// Alias para compatibilidad con código existente
const sendEmailViaN8N = sendEmailDirect;

// ============================================
// FORMATEAR NOTIFICACIÓN DE EMAIL PARA GESTOR
// ============================================
function formatEmailNotificationForGestor(emailData, source, propertyUrl, propertyCode, linkInmobiliarioUrl, gestorName) {
    const clientName = extractClientName(emailData);
    const clientPhone = extractClientPhone(emailData);
    const clientEmail = extractClientEmail(emailData);
    const subject = emailData.subject || '(Sin asunto)';
    const bodyPreview = emailData.bodyPreview || emailData.body?.content || '';

    // Truncar body preview
    const truncatedBody = bodyPreview.length > 300
        ? bodyPreview.substring(0, 300) + '...'
        : bodyPreview;

    // Formatear fecha con zona horaria de México
    const { dateStr, timeStr } = getMexicoDateTime();

    const sourceNames = {
        'inmuebles24': 'Inmuebles24',
        'proppit': 'Proppit',
        'easybroker': 'EasyBroker',
        'vivanuncios': 'Vivanuncios',
        'mercadolibre': 'MercadoLibre',
        'personal': 'Personal',
        'otros': 'Otros'
    };

    const sourceName = sourceNames[source] || source;

    // HTML para email
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #555; }
            .value { color: #333; }
            .link { color: #667eea; text-decoration: none; }
            .footer { background: #f0f0f0; padding: 15px; border-radius: 0 0 10px 10px; text-align: center; font-size: 12px; color: #666; }
            .property-links { background: #e8f4fd; padding: 15px; border-radius: 5px; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>📧 Nuevo Lead - ${sourceName}</h2>
                <p>Asignado a: ${gestorName}</p>
            </div>
            <div class="content">
                <div class="field">
                    <span class="label">👤 Nombre Completo:</span>
                    <span class="value">${clientName}</span>
                </div>
                <div class="field">
                    <span class="label">📱 Teléfono:</span>
                    <span class="value">${clientPhone}</span>
                </div>
                ${clientEmail ? `
                <div class="field">
                    <span class="label">📧 Email:</span>
                    <span class="value"><a href="mailto:${clientEmail}" class="link">${clientEmail}</a></span>
                </div>
                ` : ''}
                ${propertyCode ? `
                <div class="property-links">
                    <div class="field">
                        <span class="label">🏷️ Código de Propiedad:</span>
                        <span class="value">${propertyCode}</span>
                    </div>
                    ${propertyUrl ? `
                    <div class="field">
                        <span class="label">🔗 Link EasyBroker:</span>
                        <a href="${propertyUrl}" class="link">${propertyUrl}</a>
                    </div>
                    ` : ''}
                    ${linkInmobiliarioUrl ? `
                    <div class="field">
                        <span class="label">🏠 Link Inmobiliario:</span>
                        <a href="${linkInmobiliarioUrl}" class="link">Ver en Link Inmobiliario</a>
                    </div>
                    ` : ''}
                </div>
                ` : ''}
                <div class="field" style="margin-top: 20px;">
                    <span class="label">📝 Asunto Original:</span>
                    <p class="value">${subject}</p>
                </div>
                <div class="field">
                    <span class="label">💬 Mensaje:</span>
                    <p class="value">${truncatedBody}</p>
                </div>
            </div>
            <div class="footer">
                Recibido: ${dateStr} ${timeStr} | Link Inmobiliario GDL
            </div>
        </div>
    </body>
    </html>
    `;

    // Texto plano
    const textContent = `
NUEVO LEAD - ${sourceName}
Asignado a: ${gestorName}
========================

👤 Nombre Completo: ${clientName}
📱 Teléfono: ${clientPhone}
${clientEmail ? `📧 Email: ${clientEmail}\n` : ''}
${propertyCode ? `🏷️ Código: ${propertyCode}\n` : ''}
${propertyUrl ? `🔗 EasyBroker: ${propertyUrl}\n` : ''}
${linkInmobiliarioUrl ? `🏠 Link Inmobiliario: ${linkInmobiliarioUrl}\n` : ''}

📝 Asunto: ${subject}

💬 Mensaje: ${truncatedBody}

Recibido: ${dateStr} ${timeStr}
    `;

    return { htmlContent, textContent };
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

    // Formatear fecha con zona horaria de México
    const { dateStr, timeStr } = getMexicoDateTime();

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
        let agentName = null;
        let property = null;

        // Si encontramos un código, consultar EasyBroker API
        if (propertyCode) {
            console.log(`📋 Código de propiedad detectado: ${propertyCode}`);
            property = await getPropertyFromEasyBroker(propertyCode);
            if (property) {
                if (property.public_url) {
                    propertyUrl = property.public_url;
                    console.log(`🔗 URL de propiedad obtenida: ${propertyUrl}`);
                }
                // Obtener nombre del agente
                if (property.agent && property.agent.name) {
                    agentName = property.agent.name;
                    console.log(`👤 Agente de la propiedad: ${agentName}`);
                }
            }
        }

        // Generar URL de Link Inmobiliario si hay código
        let linkInmobiliarioUrl = null;
        if (propertyCode) {
            linkInmobiliarioUrl = `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir`;
            console.log(`🏠 URL de Link Inmobiliario: ${linkInmobiliarioUrl}`);
        }

        // Obtener Configuración de Notificaciones (Separada)
        const { NOTIFICATION_CONFIG } = require('./gestores');

        console.log(`📨 Enviando WhatsApp a ${NOTIFICATION_CONFIG.whatsapp_numbers.length} números`);
        console.log(`📨 Enviando Email a ${NOTIFICATION_CONFIG.email_recipients.length} destinatarios`);
        console.log('🚀 Iniciando proceso de notificaciones (WhatsApp -> N8N Email)');

        // Formatear mensaje de WhatsApp
        const gestorNameForMessage = 'Equipo Link Inmobiliario';
        const message = formatEmailNotification(emailData, source, propertyUrl, propertyCode, linkInmobiliarioUrl);

        // Agregar info del gestor asignado al mensaje
        const messageWithGestor = message + `\n\n👔 *Asignado a:* ${gestorNameForMessage}`;

        // 1. Enviar WhatsApp (Lista única de números)
        const whatsappResults = [];
        for (const number of NOTIFICATION_CONFIG.whatsapp_numbers) {
            const result = await sendWhatsAppMessage(messageWithGestor, number);
            whatsappResults.push({
                destinatario: number,
                telefono: number,
                ...result
            });
        }

        // 2. Enviar Email (Lista única de correos vía N8N)
        const emailResults = [];
        const clientName = extractClientName(emailData);
        const clientPhone = extractClientPhone(emailData);
        const clientEmail = extractClientEmail(emailData);

        // Formatear fecha con zona horaria de México
        const { dateStr, timeStr } = getMexicoDateTime();

        const sourceNames = {
            'inmuebles24': 'Inmuebles24',
            'proppit': 'Proppit',
            'easybroker': 'EasyBroker',
            'vivanuncios': 'Vivanuncios',
            'mercadolibre': 'MercadoLibre',
            'personal': 'Personal',
            'otros': 'Otros'
        };
        const sourceName = sourceNames[source] || source;

        for (const recipient of NOTIFICATION_CONFIG.email_recipients) {
            console.log(`📧 Procesando envío de email para: ${recipient.name} (${recipient.email})`);

            // Construir payload para n8n
            const emailPayload = {
                gestor: {
                    nombre: recipient.name,
                    telefono: 'No requerido en email', // Ya no es relevante para el envío del correo en sí
                    email: recipient.email
                },
                lead: {
                    nombreCliente: clientName,
                    telefonoCliente: clientPhone,
                    emailCliente: clientEmail || 'No proporcionado',
                    origen: sourceName,
                    asunto: emailData.subject || '(Sin asunto)',
                    mensaje: (emailData.bodyPreview || '').substring(0, 500)
                },
                propiedad: {
                    codigo: propertyCode || 'No detectado',
                    urlEasyBroker: propertyUrl || '',
                    urlLinkInmobiliario: linkInmobiliarioUrl || ''
                },
                fecha: `${dateStr} ${timeStr}`,
                timestamp: new Date().toISOString(),
                emailSubject: `🏠 Nuevo Lead de ${sourceName}${propertyCode ? ` - ${propertyCode}` : ''}`
            };

            const result = await sendEmailViaN8N(emailPayload);
            emailResults.push({
                destinatario: recipient.name,
                email: recipient.email,
                ...result
            });
        }

        // Retornar resultados
        const atLeastOneWhatsAppSuccess = whatsappResults.some(r => r.success);
        const atLeastOneEmailSuccess = emailResults.some(r => r.success);

        return {
            success: atLeastOneWhatsAppSuccess || atLeastOneEmailSuccess,
            gestorAsignado: 'Administración',
            agenteEasyBroker: agentName,
            whatsappResults,
            emailResults
        };
    } catch (error) {
        console.error('❌ Error al notificar:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWhatsAppMessage,
    sendEmailViaN8N,
    formatEmailNotification,
    notifyNewEmail,
    extractPropertyCode,
    getPropertyFromEasyBroker,
    extractClientName,
    extractClientPhone,
    extractClientEmail,
    findGestorByName,
    EVOLUTION_CONFIG,
    EASYBROKER_CONFIG,
    N8N_EMAIL_WEBHOOK
};

