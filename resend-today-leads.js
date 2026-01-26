const https = require('https');
const { sendWhatsAppMessage } = require('./whatsapp');

// Configuración
const REMOTE_API_URL = 'https://gmail-monitor-dashboard.ckoomq.easypanel.host/api/emails?limit=200';
const TARGET_NUMBER = '523318043673'; // Reinier

// Formatear mensaje igual que el sistema original (simplificado)
function formatWhatsAppMessage(email) {
    const mexicoTime = new Date(email.received_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: true });

    // Intentar extraer datos si están en raw_data, o usar defaults
    let cleanBody = email.body_preview || 'Sin vista previa';

    // Limpieza básica del cuerpo
    cleanBody = cleanBody.replace(/\s+/g, ' ').substring(0, 500);

    return `*🏠 Nuevo Lead Detectado*
━━━━━━━━━━━━━━━━━━━━━━━

*Fuente:* ${email.source ? email.source.toUpperCase() : 'DESCONOCIDO'}
*Asunto:* ${email.subject}
*Recibido:* ${mexicoTime}

*Mensaje / Detalle:*
${cleanBody}

━━━━━━━━━━━━━━━━━━━━━━━
*Acciones:*
1. Revisa el correo original para más detalles.
2. Contacta al cliente lo antes posible.

_🤖 Reenvío Manual de Leads Perdidos_`;
}

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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    console.log('🚀 Iniciando reenvío de leads (25 Enero 2026)...');

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

        // Ordenar: más antiguos primero (para enviar en orden cronológico)
        todayLeads.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));

        // Enviar uno por uno con pausa
        for (const [index, lead] of todayLeads.entries()) {
            console.log(`\n📨 Enviando ${index + 1}/${todayLeads.length} - ID: ${lead.id}`);

            const message = formatWhatsAppMessage(lead);

            // Usar la función existente de whatsapp.js que ya maneja la lógica de envío
            // NOTA: sendWhatsAppMessage(message, destinationNumber)
            try {
                // Importar la función (requiere que whatsapp.js exporte sendWhatsAppMessage si no lo hace, 
                // pero whatsapp.js normalmente exporta notifyNewEmail. 
                // Revisaré whatsapp.js después si falla, pero asumo que puedo requerirlo o usar HTTP directo si falla).

                // Opción segura: Llamada directa HTTP aquí para no depender de exports internos
                // Pero intentaremos reusar si es posible. 
                // Mejor: Copiar lógica de envío simple para asegurar independencia en este script de "Rescate"

                const result = await sendDirectWhatsApp(message, TARGET_NUMBER);

                if (result.success) {
                    console.log('   ✅ Enviado correctamente');
                } else {
                    console.error('   ❌ Falló el envío:', result.error);
                }

            } catch (error) {
                console.error('   ❌ Error:', error.message);
            }

            // Pausa de 5 segundos entre mensajes para no saturar
            await sleep(5000);
        }

        console.log('\n🏁 Proceso finalizado.');

    } catch (error) {
        console.error('❌ Error general:', error);
    }
})();

// Función auxiliar de envío directo para este script
// Copiada de evolution-monitor.js simplificada
async function sendDirectWhatsApp(message, number) {
    return new Promise((resolve) => {
        // Config hardcodeada segura para este script de emergencia
        const options = {
            hostname: 'evolutionapi-evolution-api.ckoomq.easypanel.host',
            port: 443,
            path: '/message/sendText/lugo_email',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': '429683C4C977415CAAFCCE10F7D57E11'
            }
        };

        const req = https.request(options, (res) => {
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

        req.write(JSON.stringify({
            number: number,
            text: message
        }));
        req.end();
    });
}
