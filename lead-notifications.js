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

// Hora del reinicio automático preventivo (2:00 AM hora México)
const AUTO_RESTART_HOUR = 2;
const AUTO_RESTART_MINUTE = 0;

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
// REINICIO AUTOMÁTICO PREVENTIVO DE EVOLUTION API
// ============================================
async function performScheduledRestart() {
    console.log('🔄 Ejecutando reinicio automático preventivo...');

    const timeStr = new Date().toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        dateStyle: 'short',
        timeStyle: 'short'
    });

    try {
        // 1. Enviar aviso de que se va a reiniciar
        await sendWhatsApp(`🔄 *Reinicio Preventivo*
━━━━━━━━━━━━━━━━━━━━━━━

⏰ ${timeStr}

Ejecutando reinicio automático nocturno de Evolution API para mantener la conexión estable.

_Espera unos segundos..._`);

        // 2. Esperar 2 segundos
        await new Promise(r => setTimeout(r, 2000));

        // 3. Reiniciar la instancia
        const restartResult = await restartEvolutionInstance();

        // 4. Esperar 10 segundos para que se estabilice
        await new Promise(r => setTimeout(r, 10000));

        // 5. Verificar estado
        const statusResult = await checkEvolutionStatus();

        // 6. Enviar resultado
        if (statusResult.success && statusResult.state === 'open') {
            await sendWhatsApp(`✅ *Reinicio Completado*
━━━━━━━━━━━━━━━━━━━━━━━

🟢 Estado: *Conectado*
⏰ ${timeStr}

El sistema está listo para recibir leads mañana.

_¡Buenas noches!_ 🌙`);
            console.log('✅ Reinicio automático exitoso');
        } else {
            await sendWhatsApp(`⚠️ *Reinicio con Problemas*
━━━━━━━━━━━━━━━━━━━━━━━

🟡 Estado: *${statusResult.state || 'Desconocido'}*
⏰ ${timeStr}

El reinicio se ejecutó pero la conexión no está confirmada. Por favor revisa mañana temprano.

_Verifica en: evolutionapi-evolution-api.ckoomq.easypanel.host/manager_`);
            console.log('⚠️ Reinicio completado pero estado incierto');
        }

        return { success: true, state: statusResult.state };
    } catch (error) {
        console.error('❌ Error en reinicio automático:', error);
        return { success: false, error: error.message };
    }
}

// Función auxiliar para reiniciar instancia
function restartEvolutionInstance() {
    return new Promise((resolve) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/instance/restart/${EVOLUTION_CONFIG.instanceName}`);

        const req = https.request({
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'PUT',
            headers: {
                'apikey': EVOLUTION_CONFIG.apiKey
            },
            timeout: 30000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ success: res.statusCode >= 200 && res.statusCode < 300 });
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.end();
    });
}

// Función auxiliar para verificar estado
function checkEvolutionStatus() {
    return new Promise((resolve) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/instance/connectionState/${EVOLUTION_CONFIG.instanceName}`);

        const req = https.request({
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'GET',
            headers: {
                'apikey': EVOLUTION_CONFIG.apiKey
            },
            timeout: 10000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve({ success: true, state: result.instance?.state || 'unknown' });
                } catch (e) {
                    resolve({ success: false, state: 'error' });
                }
            });
        });

        req.on('error', () => resolve({ success: false, state: 'error' }));
        req.end();
    });
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

    // Verificar cada minuto si es hora de ejecutar tareas programadas
    let lastSummaryDay = -1;
    let lastRestartDay = -1;

    setInterval(() => {
        const now = new Date();
        const mexicoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
        const currentDay = mexicoTime.getDate();
        const currentHour = mexicoTime.getHours();
        const currentMinute = mexicoTime.getMinutes();

        // Enviar resumen a las 8:00 PM (20:00)
        if (currentHour === DAILY_SUMMARY_HOUR && currentMinute === 0 && lastSummaryDay !== currentDay) {
            sendDailySummary();
            lastSummaryDay = currentDay;
        }

        // Reinicio automático a las 11:30 PM (23:30)
        if (currentHour === AUTO_RESTART_HOUR && currentMinute === AUTO_RESTART_MINUTE && lastRestartDay !== currentDay) {
            performScheduledRestart();
            lastRestartDay = currentDay;
        }
    }, 60 * 1000);

    console.log(`   📊 Resumen diario: ${DAILY_SUMMARY_HOUR}:00 hrs (México)`);
    console.log(`   🔄 Reinicio automático: ${AUTO_RESTART_HOUR}:${AUTO_RESTART_MINUTE} hrs (México)`);
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
    performScheduledRestart,     // Reinicio manual/programado
    restartEvolutionInstance,    // Solo reiniciar
    checkEvolutionStatus,        // Solo verificar estado
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
