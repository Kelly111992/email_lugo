const https = require('https');
const http = require('http');

// Configuración
const REMOTE_API_URL = 'https://gmail-monitor-dashboard.ckoomq.easypanel.host/api/emails?limit=200';
const N8N_EMAIL_WEBHOOK = 'https://evolutionapi-n8n.ckoomq.easypanel.host/webhook/get_payload_lugo';

// Importar configuración de notificación
// Como es un script suelto, definimos lo que necesitamos aquí para no fallar por requires
const EMAIL_RECIPIENTS = [
    { name: 'Administración', email: 'administracion@linkinmobiliario.com.mx' },
    { name: 'Reinier Personal', email: 'rlugo@linkinmobiliario.com.mx' }
];

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

async function sendEmailViaN8N(emailPayload) {
    return new Promise((resolve) => {
        const url = new URL(N8N_EMAIL_WEBHOOK);
        const postData = JSON.stringify(emailPayload);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const protocol = url.protocol === 'https:' ? https : http;
        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: `${res.statusCode} ${data}` });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.write(postData);
        req.end();
    });
}

function getMexicoDateTime() {
    const now = new Date();
    // Replicar función simple
    const dateStr = now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
    const timeStr = now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour12: true });
    return { dateStr, timeStr };
}

(async () => {
    console.log('🚀 Iniciando reenvío de CORREOS perdidos (25 Enero 2026)...');

    try {
        const emails = await fetchRemoteEmails();

        // Filtrar HOY (25 Enero)
        const todayLeads = emails.filter(e => {
            const date = new Date(e.received_at);
            const mexicoDate = date.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
            return mexicoDate.includes('25/1/2026') || mexicoDate.includes('25/01/2026');
        });

        console.log(`📊 Encontrados: ${todayLeads.length} leads de hoy.`);

        if (todayLeads.length === 0) {
            console.log('✅ No hay leads para reenviar.');
            process.exit(0);
        }

        // Ordenar cronológico
        todayLeads.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));

        for (const [index, lead] of todayLeads.entries()) {
            console.log(`\n📨 Procesando ${index + 1}/${todayLeads.length} - ID: ${lead.id}`);

            // Preparar Payload para Email (N8N)
            // Extraer datos básicos (simplificado para rescate)
            const subject = lead.subject || '(Sin asunto)';
            const bodyPreview = (lead.body_preview || '').substring(0, 500);

            // Intentar extraer datos parseando raw si existe, o usar defaults
            let clientEmail = 'No detectado';
            // Regex simple para intentar sacar email del body preview si está ahí
            const emailMatch = bodyPreview.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
            if (emailMatch) clientEmail = emailMatch[0];

            const { dateStr, timeStr } = getMexicoDateTime();

            // Enviar a cada destinatario de correo
            for (const recipient of EMAIL_RECIPIENTS) {
                console.log(`   📧 Enviando a: ${recipient.email}`);

                const emailPayload = {
                    gestor: {
                        nombre: recipient.name,
                        telefono: 'N/A',
                        email: recipient.email
                    },
                    lead: {
                        nombreCliente: 'Cliente (Reenvío Manual)',
                        telefonoCliente: 'Ver correo original',
                        emailCliente: clientEmail,
                        origen: lead.source || 'Desconocido',
                        asunto: subject,
                        mensaje: bodyPreview
                    },
                    propiedad: {
                        codigo: 'N/A',
                        urlEasyBroker: '',
                        urlLinkInmobiliario: ''
                    },
                    fecha: `${dateStr} ${timeStr}`,
                    timestamp: new Date().toISOString(),
                    emailSubject: `[REENVÍO] 🏠 Nuevo Lead de ${lead.source}`
                };

                try {
                    const result = await sendEmailViaN8N(emailPayload);
                    if (result.success) {
                        console.log('      ✅ Enviado a N8N');
                    } else {
                        console.error('      ❌ Falló N8N:', result.error);
                    }
                } catch (err) {
                    console.error('      ❌ Error:', err.message);
                }

                // Pequeña pausa
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        console.log('\n🏁 Proceso de reenvío de correos finalizado.');

    } catch (error) {
        console.error('❌ Error general:', error);
    }
})();
