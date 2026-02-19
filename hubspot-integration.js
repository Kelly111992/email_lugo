const https = require('https');
const http = require('http');
const { URL } = require('url');

const N8N_WEBHOOK_URL = process.env.N8N_HUBSPOT_WEBHOOK;

// Mapeo normalizado de fuentes (lowercase input -> exact HubSpot Value)
const FUENTE_MAP = {
    'inmuebles24': 'Inmuebes 24', // Mantiene el nombre exacto de HubSpot
    'easybroker': 'Easybroker',
    'mercadolibre': 'Mercado Libre',
    'vivanuncios': 'VivAnuncios',
    'lamudi': 'Lamudi',
    'nocnok': 'Nocnok',
    'facebook': 'FaceBook',
    'proppit': 'Pagina Web',
    'propiedades': 'Propiedades'
};

function getHubSpotSource(sourceStr) {
    if (!sourceStr) return null;
    const lower = sourceStr.toLowerCase().trim();

    if (FUENTE_MAP[lower]) return FUENTE_MAP[lower];

    if (lower.includes('inmuebles24')) return FUENTE_MAP['inmuebles24'];
    if (lower.includes('easybroker')) return FUENTE_MAP['easybroker'];
    if (lower.includes('mercado')) return FUENTE_MAP['mercadolibre'];

    return 'Pagina Web';
}

function parseDetailsFromMessage(message) {
    if (!message) return {};
    const details = {};

    // Limpiar marcadores de bold de WhatsApp (*texto*) antes de parsear
    const clean = message.replace(/\*/g, '');

    const titleMatch = clean.match(/(?:Lead\s+\w+\s+-\s+)([^\n]+)/i);
    if (titleMatch) details.propertyTitle = titleMatch[1].trim();

    const priceMatch = clean.match(/Precio:\s*([^\n|]+)/i);
    if (priceMatch) details.price = priceMatch[1].trim();

    // Buscar código primero por patrón "Código: XXX", luego por patrón EB-XXXXX
    const codeMatch = clean.match(/C[oó]digo:\s*([A-Z0-9][\w-]+)/i);
    if (codeMatch) {
        details.propertyCode = codeMatch[1].trim();
    } else {
        const ebMatch = clean.match(/\b(EB-[A-Z0-9]+)\b/i);
        if (ebMatch) details.propertyCode = ebMatch[1].trim();
    }

    const urlMatch = clean.match(/Link\s+EasyBroker:\s*(https?:\/\/[^\s\n]+)/i);
    if (urlMatch) details.url = urlMatch[1].trim();

    if (details.propertyTitle && details.propertyTitle.includes(',')) {
        const parts = details.propertyTitle.split(',');
        details.location = parts.slice(-2).join(',').trim();
    }

    return details;
}

function linkify(text) {
    if (!text) return '';
    const urlRegex = /(https?:\/\/[^\s\n<]+)/g;
    return text.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" style="color: #00a38d; text-decoration: underline;">${url}</a>`;
    });
}

/**
 * Construye el HTML del engagement con toda la info del lead
 * Formato tipo ficha técnica — cada campo aparece UNA sola vez
 */
function buildEngagementHtml(lead, extracted) {
    const finalPropertyTitle = lead.propertyTitle || extracted.propertyTitle || 'Propiedad Interesada';
    const finalPrice = lead.price || extracted.price || '';
    const finalLocation = lead.location || extracted.location || '';
    const finalCode = lead.propertyCode || extracted.propertyCode || '';
    const finalUrl = lead.url || extracted.url || '';
    const finalLinkInmobiliario = lead.linkInmobiliarioUrl || (finalCode ? `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${finalCode}&commit=Ir` : '');

    const rowStyle = 'padding: 8px 12px; border-bottom: 1px solid #eaf0f6; vertical-align: top;';
    const labelStyle = `${rowStyle} font-weight: bold; color: #33475b; white-space: nowrap; width: 140px;`;
    const valueStyle = `${rowStyle} color: #555;`;

    const rows = [];

    // Propiedad
    rows.push(`<tr><td style="${labelStyle}">🏷️ Título</td><td style="${valueStyle}">${finalPropertyTitle}</td></tr>`);
    if (finalCode) rows.push(`<tr><td style="${labelStyle}">🔖 Código</td><td style="${valueStyle}"><span style="background: #eaf0f6; padding: 2px 6px; border-radius: 3px; font-weight: bold;">${finalCode}</span></td></tr>`);
    if (finalPrice) rows.push(`<tr><td style="${labelStyle}">💰 Precio</td><td style="${valueStyle}"><span style="color: #00a38d; font-weight: bold;">${finalPrice}</span></td></tr>`);
    if (finalLocation) rows.push(`<tr><td style="${labelStyle}">📍 Ubicación</td><td style="${valueStyle}">${finalLocation}</td></tr>`);

    // Contacto
    rows.push(`<tr><td style="${labelStyle}">👤 Nombre</td><td style="${valueStyle}">${lead.firstName || ''} ${lead.lastName || ''}</td></tr>`);
    rows.push(`<tr><td style="${labelStyle}">📧 Email</td><td style="${valueStyle}">${lead.email || 'N/A'}</td></tr>`);
    if (lead.phone) rows.push(`<tr><td style="${labelStyle}">📞 Teléfono</td><td style="${valueStyle}">${lead.phone}</td></tr>`);
    rows.push(`<tr><td style="${labelStyle}">🌐 Fuente</td><td style="${valueStyle}">${lead.source || 'N/A'}</td></tr>`);

    // Links
    if (finalUrl) rows.push(`<tr><td style="${labelStyle}">🔗 EasyBroker</td><td style="${valueStyle}"><a href="${finalUrl}" target="_blank" style="color: #ff7a59; text-decoration: underline; word-break: break-all;">${finalUrl}</a></td></tr>`);
    if (finalLinkInmobiliario) rows.push(`<tr><td style="${labelStyle}">🏠 Link Inmob.</td><td style="${valueStyle}"><a href="${finalLinkInmobiliario}" target="_blank" style="color: #2e6ea5; text-decoration: underline; word-break: break-all;">Ver en Link Inmobiliario</a></td></tr>`);

    // Asunto
    if (lead.subject) rows.push(`<tr><td style="${labelStyle}">📝 Asunto</td><td style="${valueStyle} font-size: 0.9em; color: #7c98b6;">${lead.subject}</td></tr>`);

    // Timestamp
    rows.push(`<tr><td style="${labelStyle}">🕐 Fecha</td><td style="${valueStyle}">${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</td></tr>`);

    return `
        <div style="font-family: sans-serif; line-height: 1.5; color: #33475b; max-width: 600px; border: 1px solid #eaf0f6; border-radius: 8px; overflow: hidden;">
            <div style="background: #2e6ea5; color: white; padding: 12px 16px;">
                <strong>🏠 Detalle de la Propiedad</strong>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                ${rows.join('\n                ')}
            </table>
        </div>
    `;
}

/**
 * Envía el lead al webhook de n8n para que cree contacto + engagement en HubSpot
 */
function sendToWebhook(payload) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(N8N_WEBHOOK_URL);
        const isHttps = parsed.protocol === 'https:';
        const transport = isHttps ? https : http;

        const data = JSON.stringify(payload);

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 30000
        };

        const req = transport.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`[n8n Webhook] ✅ Respuesta OK (${res.statusCode})`);
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        resolve({ success: true, raw: body });
                    }
                } else {
                    reject(new Error(`[n8n Webhook] Error: ${res.statusCode} - ${body}`));
                }
            });
        });

        req.on('error', (err) => reject(new Error(`[n8n Webhook] Connection Error: ${err.message}`)));
        req.on('timeout', () => { req.destroy(); reject(new Error('[n8n Webhook] Timeout after 30s')); });
        req.write(data);
        req.end();
    });
}

/**
 * Procesa un lead: construye el payload y lo envía al webhook de n8n
 * n8n se encarga de crear contacto + engagement (call) en HubSpot
 */
async function processLead(lead) {
    const allowedSources = ['inmuebles24', 'easybroker', 'proppit', 'propiedades', 'vivanuncios', 'lamudi'];
    const leadSourceLower = (lead.source || '').toLowerCase();
    const isAllowed = allowedSources.some(s => leadSourceLower.includes(s));

    if (!isAllowed) {
        console.log(`[HubSpot/n8n] Ignorando lead de fuente: ${lead.source}`);
        return null;
    }

    try {
        console.log(`[HubSpot/n8n] Procesando lead: ${lead.email} → Webhook n8n`);

        const extracted = parseDetailsFromMessage(lead.message);
        const hubspotSource = getHubSpotSource(leadSourceLower);

        // HTML completo para el engagement
        const engagementHtml = buildEngagementHtml(lead, extracted);

        // Payload para n8n webhook
        const payload = {
            // Datos para crear/actualizar contacto
            email: lead.email,
            firstName: lead.firstName || '',
            lastName: lead.lastName || '',
            phone: lead.phone || '',
            fuenteDeTrafico: hubspotSource,
            estatus: 'Nuevo',

            // HTML para el engagement (registro de email/llamada)
            engagementHtml: engagementHtml,

            // Metadata adicional (por si n8n necesita lógica extra)
            source: lead.source,
            propertyTitle: lead.propertyTitle || extracted.propertyTitle || '',
            price: lead.price || extracted.price || '',
            location: lead.location || extracted.location || '',
            url: lead.url || extracted.url || '',
            propertyCode: lead.propertyCode || extracted.propertyCode || '',
            subject: lead.subject || '',
            message: lead.message || '',
            timestamp: new Date().toISOString()
        };

        const result = await sendToWebhook(payload);
        console.log(`[HubSpot/n8n] ✅ Lead enviado exitosamente al webhook de n8n`);
        return result;

    } catch (err) {
        console.error('[HubSpot/n8n] ❌ Error enviando lead al webhook:', err.message);
        return false;
    }
}

module.exports = {
    processLead
};
