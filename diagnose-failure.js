const https = require('https');
const { checkConnectionState } = require('./evolution-monitor');

// URL del servidor de producción
const REMOTE_API_URL = 'https://gmail-monitor-dashboard.ckoomq.easypanel.host/api/emails?limit=200';

function fetchRemoteEmails() {
    return new Promise((resolve, reject) => {
        https.get(REMOTE_API_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function diagnose() {
    console.log('🔍 Iniciando diagnóstico REMOTO (25 Enero 2026)...');

    try {
        // 1. Verificar Servidor de Producción (API)
        console.log('\n1️⃣  Verificando Servidor de Producción (Easypanel)...');
        const emails = await fetchRemoteEmails();

        // Filtrar leads de hoy (25 Enero 2026)
        // La API devuelve received_at.
        const todayLeads = emails.filter(e => {
            const date = new Date(e.received_at);
            const mexicoDate = date.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
            return mexicoDate.includes('25/1/2026') || mexicoDate.includes('25/01/2026');
        });

        console.log(`   📊 Total leads en Producción hoy: ${todayLeads.length}`);

        if (todayLeads.length > 0) {
            console.log('   ✅ El servidor RECIBIÓ los leads.');
            console.log(`   🕒 Último lead: ${new Date(todayLeads[0].received_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
            console.log(`   📧 Fuente: ${todayLeads[0].source}`);
            console.log('   ⚠️  Si llegaron al server pero no a WhatsApp, el fallo está en el ENVÍO o EVOLUTION API.');
        } else {
            console.log('   ⚠️  NO hay leads de hoy en el servidor de producción.');
            console.log('   🚩 CONCLUSIÓN: El servidor nunca recibió los datos. El problema está en n8n o Scraper.');
        }

        // 2. Verificar Evolution API
        console.log('\n2️⃣  Verificando Conexión WhatsApp (Evolution API)...');
        // Esto verifica desde LOCAL hacia la API de Evolution (que es accesible públicamente)
        const status = await checkConnectionState();
        console.log(`   📡 Estado instancia 'lugo_email': ${status.state}`);

        if (status.state === 'open') {
            console.log('   ✅ WhatsApp parece estar conectado.');
        } else {
            console.log('   ❌ WhatsApp NO está conectado.');
        }

    } catch (error) {
        console.error('❌ Error crítico en diagnóstico:', error);
    }

    process.exit(0);
}

diagnose();
