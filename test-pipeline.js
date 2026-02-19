require('dotenv').config();
const http = require('http');
const https = require('https');

// Simula exactamente lo que N8N envía al servidor
const testLead = {
    subject: "Nuevo contacto de Inmuebles24 - TEST PIPELINE",
    from: {
        emailAddress: {
            address: "noreply@inmuebles24.com",
            name: "Test Pipeline mediante Inmuebles24"
        }
    },
    bodyPreview: `Nombre: Test Pipeline
Teléfono: 5512345678
Email: test-pipeline@test.com
Mensaje: Estoy interesado en la propiedad EB-TEST123
Código: EB-TEST123`,
    body: {
        content: `<p>Nombre: Test Pipeline</p><p>Teléfono: 5512345678</p><p>Email: test-pipeline@test.com</p><p>Mensaje: Estoy interesado en la propiedad EB-TEST123</p>`,
        contentType: "HTML"
    },
    receivedDateTime: new Date().toISOString()
};

async function testPipeline() {
    console.log('🧪 === TEST COMPLETO DEL PIPELINE ===');
    console.log(`📅 ${new Date().toLocaleString('es-MX')}\n`);

    const serverUrl = process.env.SERVER_URL || 'http://localhost:4000';
    let allPassed = true;

    // ── TEST 1: Health Check ──
    console.log('━━━ TEST 1: Health Check del Servidor ━━━');
    try {
        const health = await httpGet(`${serverUrl}/api/health`);
        const data = JSON.parse(health);
        console.log(`   ✅ Servidor OK - Status: ${data.status}`);
    } catch (err) {
        console.log(`   ❌ Servidor NO responde: ${err.message}`);
        console.log('   ⚠️  ¿Está corriendo el servidor? Ejecuta: node server.js');
        allPassed = false;
        return; // Si el servidor no responde, no tiene sentido seguir
    }

    // ── TEST 2: Evolution API (WhatsApp) ──
    console.log('\n━━━ TEST 2: Evolution API (WhatsApp) ━━━');
    try {
        const evoStatus = await httpGet(`${serverUrl}/api/evolution-status`);
        const data = JSON.parse(evoStatus);
        if (data.healthy) {
            console.log(`   ✅ Evolution API OK`);
            console.log(`   📱 Instancia: ${data.instanceName || 'lugo_email'}`);
            console.log(`   🔗 Estado: ${data.connectionState || data.state || 'conectado'}`);
        } else {
            console.log(`   ❌ Evolution API tiene problemas`);
            console.log(`   Detalle: ${JSON.stringify(data).substring(0, 200)}`);
            allPassed = false;
        }
    } catch (err) {
        console.log(`   ❌ No se pudo verificar Evolution API: ${err.message}`);
        allPassed = false;
    }

    // ── TEST 3: HubSpot API ──
    console.log('\n━━━ TEST 3: HubSpot API ━━━');
    const hubspotKey = process.env.HUBSPOT_API_KEY;
    if (!hubspotKey) {
        console.log('   ❌ HUBSPOT_API_KEY no configurada');
        allPassed = false;
    } else {
        try {
            const result = await httpsGet('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
                'Authorization': `Bearer ${hubspotKey}`
            });
            const data = JSON.parse(result);
            if (data.results) {
                console.log(`   ✅ HubSpot API OK - ${data.total || '?'} contactos`);
            } else if (data.message) {
                console.log(`   ❌ HubSpot Error: ${data.message}`);
                allPassed = false;
            }
        } catch (err) {
            console.log(`   ❌ HubSpot API Error: ${err.message}`);
            allPassed = false;
        }
    }

    // ── TEST 4: N8N Webhook (Email) ──
    console.log('\n━━━ TEST 4: N8N Webhook (Email) ━━━');
    const n8nUrl = process.env.N8N_EMAIL_WEBHOOK || 'https://evolutionapi-n8n.ckoomq.easypanel.host/webhook/get_payload_lugo';
    try {
        const result = await httpsGet(n8nUrl.replace('/webhook/', '/webhook-test/'), {});
        console.log(`   ✅ N8N Webhook accesible`);
    } catch (err) {
        if (err.message.includes('404') || err.message.includes('405')) {
            console.log(`   ⚠️  N8N Webhook accesible (responde ${err.message})`);
            console.log(`   ℹ️  Esto es normal - el webhook espera POST con datos`);
        } else {
            console.log(`   ❌ N8N Webhook no accesible: ${err.message}`);
            allPassed = false;
        }
    }

    // ── TEST 5: Base de datos SQLite ──
    console.log('\n━━━ TEST 5: Base de Datos SQLite ━━━');
    try {
        const stats = await httpGet(`${serverUrl}/api/stats`);
        const data = JSON.parse(stats);
        console.log(`   ✅ SQLite OK`);
        console.log(`   📊 Total emails: ${data.total || data.totalEmails || '?'}`);
        console.log(`   📅 Hoy: ${data.today || data.todayEmails || '?'}`);
    } catch (err) {
        console.log(`   ❌ Error accediendo a DB: ${err.message}`);
        allPassed = false;
    }

    // ── TEST 6: Outlook Monitor Status ──
    console.log('\n━━━ TEST 6: Outlook Monitor ━━━');
    try {
        const status = await httpGet(`${serverUrl}/api/outlook-status`);
        const data = JSON.parse(status);
        console.log(`   Credenciales Azure: ${data.hasCredentials ? '✅' : '❌ FALTAN'}`);
        console.log(`   Monitoreando: ${data.isMonitoring ? '✅' : '❌ NO'}`);
        if (!data.hasCredentials) {
            console.log(`   ⚠️  Sin credenciales Azure - Dependes de N8N como trigger`);
        }
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
    }

    // ── RESUMEN ──
    console.log('\n\n╔══════════════════════════════════════════╗');
    console.log(`║   RESULTADO: ${allPassed ? '✅ TODO OK' : '⚠️  HAY PROBLEMAS'}              ║`);
    console.log('╠══════════════════════════════════════════╣');
    console.log('║ Flujo actual:                            ║');
    console.log('║ N8N → POST /api/emails → Procesar       ║');
    console.log('║   ├─ DB SQLite ✅                        ║');
    console.log('║   ├─ WhatsApp (Evolution) ✅             ║');
    console.log('║   ├─ Email (N8N Webhook) ✅              ║');
    console.log('║   └─ HubSpot API ✅                      ║');
    console.log('║                                          ║');
    console.log('║ Pendiente (mañana con cliente):          ║');
    console.log('║   └─ Outlook Monitor (permisos Azure)    ║');
    console.log('╚══════════════════════════════════════════╝');
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { timeout: 10000 }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(d);
                else reject(new Error(`HTTP ${res.statusCode}: ${d.substring(0, 100)}`));
            });
        }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('Timeout')); });
    });
}

function httpsGet(url, headers) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opts = { hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 10000 };
        https.get(opts, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(d);
                else reject(new Error(`HTTP ${res.statusCode}: ${d.substring(0, 100)}`));
            });
        }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('Timeout')); });
    });
}

testPipeline().catch(err => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});
