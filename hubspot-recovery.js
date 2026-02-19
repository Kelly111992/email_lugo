// ============================================
// RE-ENVIAR LEADS DE HOY A HUBSPOT
// ============================================
// Los leads ya están en la DB del servidor pero no se enviaron
// a HubSpot porque faltaba la API key. Este script los recupera
// y los envía directamente.
// ============================================

require('dotenv').config();
const https = require('https');
const fs = require('fs');

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const SERVER_URL = 'https://gmail-monitor-dashboard.ckoomq.easypanel.host';

const FUENTE_MAP = {
    'inmuebles24': 'Inmuebes 24',
    'easybroker': 'Easybroker',
    'mercadolibre': 'Mercado Libre',
    'vivanuncios': 'VivAnuncios',
    'lamudi': 'Lamudi',
    'nocnok': 'Nocnok',
    'facebook': 'FaceBook',
    'proppit': 'Pagina Web',
    'propiedades': 'Propiedades'
};

const ALLOWED_SOURCES = ['inmuebles24', 'easybroker', 'proppit', 'propiedades'];

function getHubSpotSource(source) {
    const lower = (source || '').toLowerCase();
    for (const [key, val] of Object.entries(FUENTE_MAP)) {
        if (lower.includes(key)) return val;
    }
    return 'Pagina Web';
}

function httpRequest(options, postData) {
    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, error: 'parse' });
                }
            });
        });
        req.on('error', e => resolve({ status: 0, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
        if (postData) req.write(postData);
        req.end();
    });
}

async function fetchTodayLeads() {
    const url = new URL(SERVER_URL + '/api/emails?limit=50&startDate=2026-02-10');
    return httpRequest({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
}

async function searchHubSpotContact(email) {
    const body = JSON.stringify({
        filterGroups: [{
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }]
        }],
        properties: ['email', 'firstname']
    });

    return httpRequest({
        hostname: 'api.hubapi.com',
        path: '/crm/v3/objects/contacts/search',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);
}

async function createOrUpdateHubSpot(properties, existingId) {
    const body = JSON.stringify({ properties });
    const path = existingId
        ? `/crm/v3/objects/contacts/${existingId}`
        : '/crm/v3/objects/contacts';

    return httpRequest({
        hostname: 'api.hubapi.com',
        path: path,
        method: existingId ? 'PATCH' : 'POST',
        headers: {
            'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);
}

function extractEmailFromBody(bodyPreview) {
    const match = (bodyPreview || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0] : null;
}

function extractPhoneFromBody(bodyPreview) {
    const match = (bodyPreview || '').match(/(?:tel[eé]fono|tel|cel|celular|phone)[\s:]*([+\d\s\-()]{10,})/i);
    if (match) return match[1].replace(/\D/g, '');
    const numMatch = (bodyPreview || '').match(/\b(\d{10})\b/);
    return numMatch ? numMatch[1] : null;
}

function extractNameFromBody(bodyPreview) {
    const match = (bodyPreview || '').match(/(?:nombre[s]?[\s]*(?:y\s*apellido)?|name|cliente|interesado|enviado por)[\s:]+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,40})/i);
    return match ? match[1].trim() : null;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

(async () => {
    console.log('🔄 === RE-ENVÍO DE LEADS DE HOY A HUBSPOT ===\n');

    // Step 1: Fetch today's leads from dashboard
    console.log('📥 Obteniendo leads de hoy del servidor...');
    const leadsResponse = await fetchTodayLeads();

    if (leadsResponse.status !== 200 || !Array.isArray(leadsResponse.data)) {
        console.error('❌ No se pudieron obtener leads:', leadsResponse);
        process.exit(1);
    }

    const allLeads = leadsResponse.data;
    console.log(`📊 Total leads guardados hoy: ${allLeads.length}\n`);

    // Step 2: Filter only leads from allowed sources
    const validLeads = allLeads.filter(lead => {
        const source = (lead.source || '').toLowerCase();
        return ALLOWED_SOURCES.some(s => source.includes(s));
    });

    console.log(`✅ Leads de fuentes válidas para HubSpot: ${validLeads.length}\n`);

    if (validLeads.length === 0) {
        console.log('⚠️ No hay leads válidos para enviar a HubSpot.');
        process.exit(0);
    }

    let created = 0, updated = 0, skipped = 0, errors = 0;
    const results = [];

    for (const [i, lead] of validLeads.entries()) {
        console.log(`\n--- [${i + 1}/${validLeads.length}] ${lead.subject || 'Sin asunto'} ---`);
        console.log(`   Fuente: ${lead.source} | De: ${lead.from_name || lead.from_address}`);

        // Extract contact info from body
        const bodyText = lead.body_preview || '';
        let rawData = {};
        try { rawData = JSON.parse(lead.raw_data || '{}'); } catch (e) { }

        const clientEmail = extractEmailFromBody(bodyText) || lead.from_address;
        const clientPhone = extractPhoneFromBody(bodyText);
        const clientName = extractNameFromBody(bodyText) || lead.from_name || '';

        // Skip if it's a portal email (not a real client email)
        if (clientEmail.includes('usuarios.vivanuncios') || clientEmail.includes('noreply') || clientEmail.includes('no-reply')) {
            // Try to find real email in body
            const realEmail = extractEmailFromBody(bodyText);
            if (!realEmail) {
                console.log(`   ⚠️ Sin email real del cliente, usando: ${clientEmail}`);
            }
        }

        const hubspotSource = getHubSpotSource(lead.source);

        const properties = {
            email: clientEmail,
            firstname: clientName,
            lastname: '',
            phone: clientPhone || '',
            message: bodyText.substring(0, 500),
            estatus: 'Nuevo',
            fuente_de_trafico: hubspotSource
        };

        console.log(`   📧 Email: ${clientEmail}`);
        console.log(`   👤 Nombre: ${clientName || 'N/A'}`);
        console.log(`   📞 Tel: ${clientPhone || 'N/A'}`);
        console.log(`   🏷️ Fuente HubSpot: ${hubspotSource}`);

        try {
            // Search if contact exists
            const searchResult = await searchHubSpotContact(clientEmail);
            const existing = searchResult.data?.results?.[0];

            if (existing) {
                console.log(`   📝 Contacto existente (${existing.id}), actualizando...`);
                const updateResult = await createOrUpdateHubSpot(properties, existing.id);
                if (updateResult.status >= 200 && updateResult.status < 300) {
                    updated++;
                    console.log(`   ✅ Actualizado en HubSpot`);
                } else {
                    errors++;
                    console.log(`   ❌ Error actualizando: ${updateResult.status} ${JSON.stringify(updateResult.data).substring(0, 200)}`);
                }
            } else {
                console.log(`   🆕 Creando nuevo contacto...`);
                const createResult = await createOrUpdateHubSpot(properties, null);
                if (createResult.status >= 200 && createResult.status < 300) {
                    created++;
                    console.log(`   ✅ Creado en HubSpot (ID: ${createResult.data?.id})`);
                } else {
                    errors++;
                    console.log(`   ❌ Error creando: ${createResult.status} ${JSON.stringify(createResult.data).substring(0, 200)}`);
                }
            }

            results.push({ email: clientEmail, name: clientName, status: 'ok' });
        } catch (err) {
            errors++;
            console.error(`   ❌ Error: ${err.message}`);
            results.push({ email: clientEmail, name: clientName, status: 'error', error: err.message });
        }

        await sleep(2000);
    }

    console.log(`\n🏁 === RESUMEN HUBSPOT ===`);
    console.log(`   🆕 Creados: ${created}`);
    console.log(`   📝 Actualizados: ${updated}`);
    console.log(`   ⏭️ Saltados: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);

    // Save results
    fs.writeFileSync('hubspot-recovery-results.json', JSON.stringify(results, null, 2));
    console.log(`\n📄 Resultados guardados en hubspot-recovery-results.json`);
})();
