const https = require('https');

// ============================================
// CONFIGURACIÓN
// ============================================
const EVOLUTION_CONFIG = {
    baseUrl: 'https://evolutionapi-evolution-api.ckoomq.easypanel.host',
    instanceName: 'lugo_email',
    apiKey: '429683C4C977415CAAFCCE10F7D57E11'
};

const EASYBROKER_CONFIG = {
    baseUrl: 'https://api.easybroker.com/v1',
    apiKey: '6dt2onwsu5u3ex1qqh49rzck0wsyf4'
};

const API_URL = 'https://gmail-monitor-dashboard.ckoomq.easypanel.host/api/emails?limit=500';
const DESTINATION_NUMBERS = ['523318043673', '523312505239'];

// ============================================
// OBTENER PROPIEDAD DE EASYBROKER API
// ============================================
async function getPropertyFromEasyBroker(propertyCode) {
    return new Promise((resolve) => {
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

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const property = JSON.parse(data);
                        resolve(property.public_url || null);
                    } catch (e) {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.end();
    });
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function extractClientName(lead) {
    const fromName = lead.from_name || '';
    // Limpiar nombres tipo "Usuario mediante Inmuebles24"
    if (fromName.includes('mediante')) {
        return fromName.split('mediante')[0].trim();
    }
    return fromName || 'Cliente';
}

function extractClientPhone(lead) {
    const body = lead.body_preview || '';
    // Buscar patrones de teléfono mexicano
    const phoneMatch = body.match(/(?:Tel[éeEÉ]?(?:fono)?|Celular|Cel|Móvil|Phone)?[:\s]*(?:\+?52)?[\s.-]?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4}[\s.-]?\d{4}/gi);
    if (phoneMatch) {
        return phoneMatch[0].replace(/[^\d+]/g, '');
    }
    return null;
}

function extractClientEmail(lead) {
    const body = lead.body_preview || '';
    const emailMatch = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0] : null;
}

function getSourceEmoji(source) {
    const emojis = {
        'inmuebles24': '🏠',
        'easybroker': '🔑',
        'proppit': '🏢',
        'vivanuncios': '📢',
        'mercadolibre': '🛒',
        'otros': '📧'
    };
    return emojis[source] || '📧';
}

// ============================================
// FORMATEAR MENSAJE DE LEAD (FORMATO ESTÁNDAR)
// ============================================
async function formatLeadMessage(lead) {
    const clientName = extractClientName(lead);
    const clientPhone = extractClientPhone(lead) || 'No detectado';
    const clientEmail = extractClientEmail(lead);
    const source = lead.source || 'otros';
    const emoji = getSourceEmoji(source);
    const sourceName = getSourceName(source);
    const subject = lead.subject || '(Sin asunto)';
    const bodyPreview = lead.body_preview || '';

    // Extraer código de propiedad (EB-XXXX)
    const propertyCode = extractPropertyCode(subject);

    // Generar URLs si hay código de propiedad
    let propertyUrl = null;
    let linkInmobiliarioUrl = null;
    if (propertyCode) {
        linkInmobiliarioUrl = `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir`;
        // Consultar EasyBroker API para obtener URL de la propiedad
        console.log(`   🔍 Buscando propiedad ${propertyCode} en EasyBroker...`);
        propertyUrl = await getPropertyFromEasyBroker(propertyCode);
        if (propertyUrl) {
            console.log(`   ✅ URL encontrada: ${propertyUrl}`);
        }
    }

    // Truncar y sanitizar body preview
    let cleanBody = bodyPreview
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Caracteres de control
        .replace(/\r\n/g, '\n')  // Normalizar saltos de línea
        .replace(/\r/g, '\n')
        .trim();

    const truncatedBody = cleanBody.length > 300
        ? cleanBody.substring(0, 300) + '...'
        : cleanBody;

    // Formatear fecha original del lead (hora México)
    const originalDate = new Date(lead.received_at);
    const dateStr = originalDate.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const timeStr = originalDate.toLocaleTimeString('es-MX', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    // Construir mensaje en formato ESTÁNDAR (igual que whatsapp.js)
    let message = `📧 *NUEVO LEAD*

${emoji} *Origen:* ${sourceName}
👤 *Nombre Completo:* ${clientName}
📱 *Teléfono:* ${clientPhone}`;

    if (clientEmail) {
        message += `\n📧 *Email:* ${clientEmail}`;
    }

    // Agregar código de propiedad y URLs si existen
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

💬 *Mensaje:*
${truncatedBody}

🕐 ${dateStr} ${timeStr}
⚠️ _[Reenviado - Lead perdido del fin de semana]_`;

    return message;
}

// Extraer código de propiedad del asunto (EB-XXXX)
function extractPropertyCode(subject) {
    const match = subject.match(/EB-[A-Z]{2}\d+/i);
    return match ? match[0].toUpperCase() : null;
}

function getSourceName(source) {
    const names = {
        'inmuebles24': 'Inmuebles24',
        'easybroker': 'EasyBroker',
        'proppit': 'Proppit',
        'vivanuncios': 'Vivanuncios',
        'mercadolibre': 'MercadoLibre',
        'otros': 'Otros'
    };
    return names[source] || source;
}

// ============================================
// ENVIAR WHATSAPP
// ============================================
async function sendWhatsApp(message, number) {
    return new Promise((resolve) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/message/sendText/${EVOLUTION_CONFIG.instanceName}`);
        const postData = JSON.stringify({ number, text: message });

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_CONFIG.apiKey,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`   ✅ Enviado a ${number}`);
                    resolve({ success: true });
                } else {
                    console.log(`   ❌ Error ${number}: ${res.statusCode}`);
                    console.log(`   📝 Respuesta: ${data.substring(0, 200)}`);
                    resolve({ success: false, error: data });
                }
            });
        });

        req.on('error', e => {
            console.log(`   ❌ Error ${number}: ${e.message}`);
            resolve({ success: false, error: e.message });
        });

        req.write(postData);
        req.end();
    });
}

// ============================================
// MAIN: REENVIAR LEADS PERDIDOS
// ============================================
(async () => {
    console.log('🔄 Reenviando leads perdidos del 25-27 de Enero...\n');

    // 1. Obtener leads del servidor
    const leads = await new Promise((resolve) => {
        https.get(API_URL, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
    });

    // 2. Filtrar leads del 25-27 de enero
    const lostLeads = leads.filter(e => {
        const date = new Date(e.received_at);
        const day = date.getDate();
        const month = date.getMonth() + 1;
        return month === 1 && day >= 25 && day <= 27;
    });

    console.log(`📋 Encontrados ${lostLeads.length} leads para reenviar:\n`);

    // 3. Reenviar cada lead
    let sent = 0;
    let failed = 0;

    for (const lead of lostLeads) {
        const clientName = extractClientName(lead);
        console.log(`📤 Reenviando Lead #${lead.id} - ${clientName} (${lead.source})`);

        const message = await formatLeadMessage(lead);

        for (const number of DESTINATION_NUMBERS) {
            const result = await sendWhatsApp(message, number);
            if (result.success) sent++;
            else failed++;

            // Pequeña pausa para no saturar la API
            await new Promise(r => setTimeout(r, 1000));
        }

        // Pausa entre leads
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n✅ Completado: ${sent} mensajes enviados, ${failed} fallidos`);
})();
