const https = require('https');
const { checkConnectionState } = require('./evolution-monitor');
const fs = require('fs');

// URL del servidor de producción
const REMOTE_API_URL = 'https://gmail-monitor-dashboard.ckoomq.easypanel.host/api/emails?limit=500';

(async () => {
    console.log('🔍 Iniciando diagnóstico MULTI-DÍA (25-27 Enero 2026)...');
    let result = {
        summary: {},
        whatsappStatus: null,
        timestamp: new Date().toISOString(),
        error: null
    };

    try {
        // 1. Fetch Remote Emails
        const emails = await new Promise((resolve, reject) => {
            https.get(REMOTE_API_URL, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        console.log('Raw Data:', data);
                        reject(new Error('Invalid JSON: ' + e.message));
                    }
                });
            }).on('error', reject);
        });

        if (!Array.isArray(emails)) {
            console.log('⚠️ La respuesta no es un arreglo:', emails);
            result.error = 'API did not return an array: ' + JSON.stringify(emails);
            fs.writeFileSync('diag_multi_day.json', JSON.stringify(result, null, 2));
            process.exit(1);
        }

        emails.forEach(e => {
            const date = new Date(e.received_at);
            const mexicoDate = date.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });

            // Filtrar solo desde el domingo 25
            if (mexicoDate.includes('/01/2026') || mexicoDate.includes('/1/2026')) {
                const day = mexicoDate.split('/')[0];
                if (parseInt(day) >= 25) {
                    if (!result.summary[mexicoDate]) {
                        result.summary[mexicoDate] = { count: 0, sources: {} };
                    }
                    result.summary[mexicoDate].count++;
                    result.summary[mexicoDate].sources[e.source] = (result.summary[mexicoDate].sources[e.source] || 0) + 1;
                }
            }
        });

        // 2. WhatsApp Status
        const status = await checkConnectionState();
        result.whatsappStatus = status.state;

    } catch (e) {
        result.error = e.message;
        console.error('❌ Error:', e.message);
    }

    fs.writeFileSync('diag_multi_day.json', JSON.stringify(result, null, 2));
    console.log('✅ Diagnóstico guardado en diag_multi_day.json');
    console.log('Resumen:', JSON.stringify(result.summary, null, 2));
    process.exit(0);
})();
