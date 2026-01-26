const https = require('https');
const { checkConnectionState } = require('./evolution-monitor');
const fs = require('fs');

// URL del servidor de producción
const REMOTE_API_URL = 'https://gmail-monitor-dashboard.ckoomq.easypanel.host/api/emails?limit=200';

(async () => {
    let result = {
        remoteLeads: { count: 0, lastLead: null },
        whatsappStatus: null,
        timestamp: new Date().toISOString(),
        error: null
    };

    try {
        // 1. Remote Emails
        const emails = await new Promise((resolve, reject) => {
            https.get(REMOTE_API_URL, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                });
            }).on('error', reject);
        });

        const todayLeads = emails.filter(e => {
            const date = new Date(e.received_at);
            const mexicoDate = date.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
            return mexicoDate.includes('25/1/2026') || mexicoDate.includes('25/01/2026');
        });

        result.remoteLeads.count = todayLeads.length;
        if (todayLeads.length > 0) {
            result.remoteLeads.lastLead = {
                received_at: todayLeads[0].received_at,
                source: todayLeads[0].source
            };
        }

        // 2. WhatsApp Status
        const status = await checkConnectionState();
        result.whatsappStatus = status.state;

    } catch (e) {
        result.error = e.message;
    }

    fs.writeFileSync('diag_result.json', JSON.stringify(result, null, 2));
    process.exit(0);
})();
