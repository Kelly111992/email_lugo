const https = require('https');
const database = require('./database');

// ============================================
// CONFIGURACIÓN
// ============================================
const EVOLUTION_CONFIG = {
    baseUrl: 'https://evolutionapi-evolution-api.ckoomq.easypanel.host',
    instanceName: 'lugo_email',
    apiKey: '429683C4C977415CAAFCCE10F7D57E11'
};

// Número para recibir alertas y resúmenes
const ALERT_NUMBER = '523318043673';

// Tiempo sin leads para alertar (4 horas en ms)
const INACTIVITY_THRESHOLD_MS = 4 * 60 * 60 * 1000;

// Hora del resumen diario (8:00 PM hora México)
const DAILY_SUMMARY_HOUR = 20; // 20:00 = 8:00 PM

// Estado
let lastLeadTime = new Date();
let inactivityAlertSent = false;

// ============================================
// ENVIAR WHATSAPP
// ============================================
function sendWhatsApp(message, number = ALERT_NUMBER) {
    return new Promise((resolve) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/message/sendText/${EVOLUTION_CONFIG.instanceName}`);

        const postData = JSON.stringify({ number, text: message });

        const req = https.request({
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_CONFIG.apiKey,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ success: res.statusCode >= 200 && res.statusCode < 300 });
            });
        });

        req.on('error', () => resolve({ success: false }));
        req.write(postData);
        req.end();
    });
}

// ============================================
// OBTENER ESTADÍSTICAS DEL DÍA
// ============================================
async function getTodayStats() {
    return new Promise((resolve, reject) => {
        // Obtener fecha de hoy en formato ISO (sin hora)
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const sql = `
            SELECT 
                source,
                COUNT(*) as count,
                MAX(received_at) as last_received
            FROM emails 
            WHERE DATE(received_at) = DATE('now')
            GROUP BY source
        `;

        // Usando el objeto db directamente no funciona aquí, así que usamos getAllEmails
        // y filtramos manualmente
        database.getAllEmails(500, null).then(emails => {
            const todayStr = today.toISOString().split('T')[0];

            const todayEmails = emails.filter(email => {
                const emailDate = new Date(email.received_at).toISOString().split('T')[0];
                return emailDate === todayStr;
            });

            const stats = {
                total: todayEmails.length,
                bySource: {},
                lastReceived: null
            };

            todayEmails.forEach(email => {
                stats.bySource[email.source] = (stats.bySource[email.source] || 0) + 1;

                const emailTime = new Date(email.received_at);
                if (!stats.lastReceived || emailTime > new Date(stats.lastReceived)) {
                    stats.lastReceived = email.received_at;
                }
            });

            resolve(stats);
        }).catch(reject);
    });
}

// ============================================
// RESUMEN DIARIO
// ============================================
async function sendDailySummary() {
    console.log('📊 Generando resumen diario...');

    try {
        const stats = await getTodayStats();

        // Formatear fecha
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Mexico_City'
        });

        // Emojis por fuente
        const sourceEmojis = {
            'inmuebles24': '🏠',
            'proppit': '🏢',
            'easybroker': '🔑',
            'vivanuncios': '📢',
            'mercadolibre': '🛒',
            'otros': '📧'
        };

        const sourceNames = {
            'inmuebles24': 'Inmuebles24',
            'proppit': 'Proppit',
            'easybroker': 'EasyBroker',
            'vivanuncios': 'Vivanuncios',
            'mercadolibre': 'MercadoLibre',
            'otros': 'Otros'
        };

        // Construir desglose por fuente
        let sourceBreakdown = '';
        const sources = Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);

        if (sources.length > 0) {
            sources.forEach(([source, count]) => {
                const emoji = sourceEmojis[source] || '📧';
                const name = sourceNames[source] || source;
                const bar = '█'.repeat(Math.min(count, 10)) + (count > 10 ? '...' : '');
                sourceBreakdown += `\n${emoji} *${name}:* ${count} ${bar}`;
            });
        } else {
            sourceBreakdown = '\n_No se recibieron leads hoy_';
        }

        // Determinar mensaje según cantidad
        let emoji, messageType;
        if (stats.total === 0) {
            emoji = '😔';
            messageType = 'Sin leads hoy';
        } else if (stats.total < 5) {
            emoji = '📉';
            messageType = 'Día tranquilo';
        } else if (stats.total < 15) {
            emoji = '📊';
            messageType = 'Día normal';
        } else {
            emoji = '🔥';
            messageType = '¡Excelente día!';
        }

        const message = `📋 *RESUMEN DEL DÍA*
━━━━━━━━━━━━━━━━━━━━━━━

📅 ${dateStr}

${emoji} *${messageType}*
📊 *Total de leads:* ${stats.total}

*Desglose por fuente:*${sourceBreakdown}

━━━━━━━━━━━━━━━━━━━━━━━
_Link Inmobiliario GDL_`;

        const result = await sendWhatsApp(message);

        if (result.success) {
            console.log('✅ Resumen diario enviado');
        } else {
            console.log('❌ Error al enviar resumen diario');
        }

        return result;
    } catch (error) {
        console.error('❌ Error generando resumen:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// ALERTA DE INACTIVIDAD
// ============================================
async function checkInactivity() {
    const now = new Date();
    const timeSinceLastLead = now - lastLeadTime;

    // Si han pasado más de 4 horas sin leads
    if (timeSinceLastLead > INACTIVITY_THRESHOLD_MS && !inactivityAlertSent) {
        console.log('⚠️ Detectada inactividad de leads...');

        const hours = Math.floor(timeSinceLastLead / (1000 * 60 * 60));
        const minutes = Math.floor((timeSinceLastLead % (1000 * 60 * 60)) / (1000 * 60));

        const lastLeadStr = lastLeadTime.toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            dateStyle: 'short',
            timeStyle: 'short'
        });

        const message = `⚠️ *ALERTA: Baja Actividad*
━━━━━━━━━━━━━━━━━━━━━━━

🕐 No han llegado leads en *${hours}h ${minutes}m*

📧 Último lead recibido:
   ${lastLeadStr}

━━━━━━━━━━━━━━━━━━━━━━━
*Posibles causas:*

1️⃣ Es fin de semana/horario bajo
2️⃣ Problema con n8n (revisa workflows)
3️⃣ Problema con correo de Outlook
4️⃣ Problema con Evolution API

_Si es horario laboral normal, revisa los sistemas._`;

        const result = await sendWhatsApp(message);

        if (result.success) {
            console.log('✅ Alerta de inactividad enviada');
            inactivityAlertSent = true; // Evitar spam de alertas
        }

        return result;
    }

    return { checked: true, inactive: false };
}

// ============================================
// REGISTRAR NUEVO LEAD (para resetear timer)
// ============================================
function registerNewLead() {
    lastLeadTime = new Date();
    inactivityAlertSent = false; // Reset para poder alertar de nuevo
    console.log(`📥 Lead registrado a las ${lastLeadTime.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' })}`);
}

// ============================================
// PROGRAMAR TAREAS
// ============================================
function startScheduler() {
    console.log('⏰ Iniciando programador de tareas...');

    // Verificar inactividad cada 30 minutos
    setInterval(() => {
        checkInactivity();
    }, 30 * 60 * 1000);

    // Verificar si es hora del resumen diario cada minuto
    setInterval(() => {
        const now = new Date();
        const mexicoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));

        // Enviar resumen a las 8:00 PM (20:00) y 0 minutos
        if (mexicoTime.getHours() === DAILY_SUMMARY_HOUR && mexicoTime.getMinutes() === 0) {
            sendDailySummary();
        }
    }, 60 * 1000);

    console.log(`   📊 Resumen diario: ${DAILY_SUMMARY_HOUR}:00 hrs (México)`);
    console.log(`   ⚠️ Alerta inactividad: después de ${INACTIVITY_THRESHOLD_MS / 1000 / 60 / 60} horas sin leads`);
}

// ============================================
// EXPORTAR
// ============================================
module.exports = {
    sendDailySummary,
    checkInactivity,
    registerNewLead,
    startScheduler,
    getTodayStats,
    sendWhatsApp,
    getLastLeadTime: () => lastLeadTime,
    isInactivityAlertSent: () => inactivityAlertSent
};

// ============================================
// SI SE EJECUTA DIRECTAMENTE
// ============================================
if (require.main === module) {
    console.log('🧪 Ejecutando prueba de notificaciones...\n');

    // Probar resumen diario
    sendDailySummary().then(result => {
        console.log('\n📊 Resultado del resumen:', result.success ? '✅ Enviado' : '❌ Error');
        process.exit(0);
    });
}
