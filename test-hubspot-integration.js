require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const https = require('https');

// Configuración
const DB_PATH = path.join(__dirname, 'emails.db');
// URL del Webhook de N8N (según tu captura)
// NOTA: Como no tengo la URL base exacta de tu N8N, usaré la que hemos visto antes:
// https://evolutionapi-n8n.ckoomq.easypanel.host/webhook/72f396a3-afb7-498c-8e13-a5510aafebe5
// Si es diferente, avísame.
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://evolutionapi-n8n.ckoomq.easypanel.host/webhook/72f396a3-afb7-498c-8e13-a5510aafebe5';

function getLatestLead() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        db.get(
            `SELECT * FROM emails WHERE is_lead = 1 ORDER BY received_date DESC LIMIT 1`,
            [],
            (err, row) => {
                db.close();
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

function extractLeadData(email) {
    let body = email.body_preview || '';
    let from = email.from_address || '';
    let name = email.from_name || '';

    // Intento básico de extracción (simplificado del whatsapp.js)
    const phoneRegex = /(\+?52\s?)?(\(?\d{2,3}\)?[\s\-]?)?[\d\s\-]{7,10}/;
    const phoneMatch = body.match(phoneRegex);
    const phone = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : '';

    const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/;
    const emailMatch = body.match(emailRegex);
    const clientEmail = emailMatch ? emailMatch[0] : from;

    const nameRegex = /Nombre:\s*([^\n]+)/i;
    const nameMatch = body.match(nameRegex);
    if (nameMatch) name = nameMatch[1].trim();

    return {
        firstName: name.split(' ')[0],
        lastName: name.split(' ').slice(1).join(' ') || '',
        email: clientEmail,
        phone: phone,
        message: body.substring(0, 500), // HubSpot a veces limita
        source: email.source || 'Desconocido'
    };
}

async function sendToN8N(data) {
    console.log('📤 Enviando a N8N:', JSON.stringify(data, null, 2));

    const url = new URL(WEBHOOK_URL);
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('✅ Éxito! Respuesta N8N:', responseBody || 'OK');
                    resolve(responseBody);
                } else {
                    console.error(`❌ Error N8N (${res.statusCode}):`, responseBody);
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (e) => {
            console.error('❌ Error de conexión:', e);
            reject(e);
        });

        req.write(JSON.stringify(data));
        req.end();
    });
}

async function run() {
    try {
        console.log('🔍 Buscando último lead en DB...');
        const lead = await getLatestLead();

        if (!lead) {
            console.log('⚠️ No se encontraron leads en la base de datos.');
            return;
        }

        console.log(`📝 Lead encontrado: ${lead.subject} (${lead.received_date})`);

        const data = extractLeadData(lead);
        await sendToN8N(data);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

run();
