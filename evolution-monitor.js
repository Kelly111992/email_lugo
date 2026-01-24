const https = require('https');

// ============================================
// CONFIGURACIÓN PRINCIPAL (lugo_email)
// ============================================
const EVOLUTION_CONFIG = {
    baseUrl: process.env.EVOLUTION_API_URL || 'https://evolutionapi-evolution-api.ckoomq.easypanel.host',
    instanceName: process.env.EVOLUTION_INSTANCE || 'lugo_email',
    apiKey: process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11'
};

// ============================================
// CONFIGURACIÓN DE RESPALDO (claveai)
// Usada para enviar alertas cuando lugo_email falla
// ============================================
const BACKUP_EVOLUTION_CONFIG = {
    baseUrl: 'https://evolutionapi-evolution-api.ckoomq.easypanel.host',
    instanceName: 'claveai',
    apiKey: '429683C4C977415CAAFCCE10F7D57E11' // Misma API key del servidor
};

// Número de Reinier para recibir alertas
const ALERT_NUMBER = '523318043673';

// Número de admin para mensajes de prueba
const ADMIN_NUMBER = '523318043673';

// Intervalo de verificación (5 minutos)
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Estado del monitor
let lastStatus = 'unknown';
let failedAttempts = 0;
let lastSuccessfulCheck = null;
let lastAlertSent = null;

// ============================================
// FUNCIONES DE VERIFICACIÓN
// ============================================

/**
 * Verificar estado de conexión de la instancia
 */
function checkConnectionState() {
    return new Promise((resolve) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/instance/connectionState/${EVOLUTION_CONFIG.instanceName}`);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'GET',
            headers: {
                'apikey': EVOLUTION_CONFIG.apiKey
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    const state = result.instance?.state || 'unknown';
                    resolve({ success: true, state, raw: result });
                } catch (e) {
                    resolve({ success: false, state: 'error', error: 'Parse error' });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, state: 'error', error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, state: 'timeout', error: 'Request timeout' });
        });

        req.end();
    });
}

/**
 * Enviar mensaje de prueba para verificar que realmente funciona
 */
function sendTestMessage() {
    return new Promise((resolve) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/message/sendText/${EVOLUTION_CONFIG.instanceName}`);

        // Mensaje de prueba a sí mismo (o un número de prueba)
        const postData = JSON.stringify({
            number: ADMIN_NUMBER,
            text: `🔔 Monitor: Verificación de conexión exitosa - ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`
        });

        const options = {
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
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true, statusCode: res.statusCode });
                } else {
                    resolve({ success: false, statusCode: res.statusCode, error: data });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout' });
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Enviar alerta por WhatsApp usando la instancia de RESPALDO (claveai)
 * Esta función se usa cuando la instancia principal (lugo_email) falla
 */
function sendWhatsAppAlert(alertType, details) {
    return new Promise((resolve) => {
        const url = new URL(`${BACKUP_EVOLUTION_CONFIG.baseUrl}/message/sendText/${BACKUP_EVOLUTION_CONFIG.instanceName}`);

        // Formatear fecha México
        const timestampMexico = new Date().toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            dateStyle: 'short',
            timeStyle: 'short'
        });

        // Mensaje de alerta formateado para WhatsApp
        const alertMessage = `🚨 *ALERTA: Evolution API*
━━━━━━━━━━━━━━━━━━━━━━━

⚠️ *${alertType === 'CONNECTION_FAILED' ? 'Conexión Perdida' :
                alertType === 'SEND_FAILED' ? 'Fallo al Enviar' :
                    alertType === 'TEST_ALERT' ? 'Prueba de Alerta' : alertType}*

📝 *Detalle:* ${details.message || 'Error detectado'}
🕐 *Hora:* ${timestampMexico}
🔢 *Intentos fallidos:* ${failedAttempts}

━━━━━━━━━━━━━━━━━━━━━━━
*⚡ ACCIÓN REQUERIDA:*

1️⃣ Ir a Evolution API Manager:
   https://evolutionapi-evolution-api.ckoomq.easypanel.host/manager

2️⃣ Ingresar con API Key

3️⃣ Clic en instancia *"lugo_email"*

4️⃣ Clic en botón *"RESTART"*

5️⃣ Esperar 30 seg y verificar *"Connected"*
━━━━━━━━━━━━━━━━━━━━━━━

_Los leads NO se están enviando por WhatsApp mientras esto no se arregle._`;

        const postData = JSON.stringify({
            number: ALERT_NUMBER,
            text: alertMessage
        });

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': BACKUP_EVOLUTION_CONFIG.apiKey,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 15000
        };

        console.log(`📱 Enviando alerta por WhatsApp (via CLAVE.AI) a ${ALERT_NUMBER}...`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ Alerta WhatsApp enviada exitosamente`);
                    resolve({ success: true });
                } else {
                    console.error(`❌ Error enviando alerta: ${res.statusCode} - ${data}`);
                    resolve({ success: false, error: data });
                }
            });
        });

        req.on('error', (e) => {
            console.error('❌ Error de red enviando alerta:', e.message);
            resolve({ success: false, error: e.message });
        });

        req.on('timeout', () => {
            req.destroy();
            console.error('❌ Timeout enviando alerta');
            resolve({ success: false, error: 'Timeout' });
        });

        req.write(postData);
        req.end();
    });
}

// Mantener alias para compatibilidad
const sendEmailAlert = sendWhatsAppAlert;

/**
 * Intentar reiniciar la instancia automáticamente
 */
function attemptRestart() {
    return new Promise((resolve) => {
        console.log('🔄 Intentando reiniciar instancia...');

        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/instance/restart/${EVOLUTION_CONFIG.instanceName}`);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'PUT',
            headers: {
                'apikey': EVOLUTION_CONFIG.apiKey
            },
            timeout: 30000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`   Resultado del reinicio: ${res.statusCode}`);
                resolve({ success: res.statusCode >= 200 && res.statusCode < 300 });
            });
        });

        req.on('error', (e) => {
            console.error('   Error al reiniciar:', e.message);
            resolve({ success: false, error: e.message });
        });

        req.end();
    });
}

// ============================================
// LÓGICA PRINCIPAL DE MONITOREO
// ============================================

async function runHealthCheck(sendTestMsg = false) {
    const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    console.log(`\n🔍 [${timestamp}] Verificando estado de Evolution API...`);

    // 1. Verificar estado de conexión
    const connectionCheck = await checkConnectionState();
    console.log(`   Estado de conexión: ${connectionCheck.state}`);

    // 2. Si la conexión no está "open", hay problema
    if (connectionCheck.state !== 'open') {
        failedAttempts++;
        console.log(`   ⚠️ Conexión no disponible. Intentos fallidos: ${failedAttempts}`);

        // Intentar reiniciar automáticamente después de 2 fallos
        if (failedAttempts >= 2) {
            await attemptRestart();

            // Esperar 10 segundos y verificar de nuevo
            await new Promise(r => setTimeout(r, 10000));
            const recheckResult = await checkConnectionState();

            if (recheckResult.state === 'open') {
                console.log('   ✅ Reinicio exitoso, conexión restaurada');
                failedAttempts = 0;
                lastSuccessfulCheck = new Date().toISOString();
                return { healthy: true, recovered: true };
            }
        }

        // Si sigue fallando y no hemos enviado alerta en la última hora
        const now = new Date();
        const shouldSendAlert = !lastAlertSent ||
            (now - new Date(lastAlertSent)) > 60 * 60 * 1000; // 1 hora

        if (failedAttempts >= 3 && shouldSendAlert) {
            console.log('   📧 Enviando alerta por email...');
            await sendEmailAlert('CONNECTION_FAILED', {
                state: connectionCheck.state,
                error: connectionCheck.error,
                message: `La instancia de Evolution API no está conectada. Estado: ${connectionCheck.state}`
            });
            lastAlertSent = now.toISOString();
        }

        lastStatus = 'disconnected';
        return { healthy: false, state: connectionCheck.state };
    }

    // 3. Si la conexión está "open", verificar que realmente pueda enviar
    if (sendTestMsg) {
        console.log('   📤 Enviando mensaje de prueba...');
        const testResult = await sendTestMessage();

        if (!testResult.success) {
            failedAttempts++;
            console.log(`   ❌ Fallo al enviar mensaje: ${testResult.error || testResult.statusCode}`);

            // Enviar alerta si falla
            const now = new Date();
            const shouldSendAlert = !lastAlertSent ||
                (now - new Date(lastAlertSent)) > 60 * 60 * 1000;

            if (failedAttempts >= 2 && shouldSendAlert) {
                await sendEmailAlert('SEND_FAILED', {
                    connectionState: connectionCheck.state,
                    sendError: testResult.error || `HTTP ${testResult.statusCode}`,
                    message: 'La conexión muestra "Connected" pero no puede enviar mensajes'
                });
                lastAlertSent = now.toISOString();
            }

            lastStatus = 'send_failed';
            return { healthy: false, state: 'send_failed', error: testResult.error };
        }

        console.log('   ✅ Mensaje de prueba enviado correctamente');
    }

    // Todo bien
    failedAttempts = 0;
    lastSuccessfulCheck = new Date().toISOString();
    lastStatus = 'healthy';

    console.log('   ✅ Evolution API funcionando correctamente');
    return { healthy: true, state: 'healthy' };
}

// ============================================
// EXPORTAR PARA USO COMO MÓDULO
// ============================================

module.exports = {
    runHealthCheck,
    checkConnectionState,
    sendTestMessage,
    sendEmailAlert,        // Alias de sendWhatsAppAlert (compatibilidad)
    sendWhatsAppAlert,     // Función real de alerta vía CLAVE.AI
    attemptRestart,
    getMonitorStatus: () => ({
        lastStatus,
        failedAttempts,
        lastSuccessfulCheck,
        lastAlertSent
    })
};

// ============================================
// SI SE EJECUTA DIRECTAMENTE
// ============================================

if (require.main === module) {
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║   🔍 MONITOR DE EVOLUTION API                         ║');
    console.log('║   Verificando cada 5 minutos                          ║');
    console.log('╚═══════════════════════════════════════════════════════╝');

    // Ejecutar verificación inicial con mensaje de prueba
    runHealthCheck(true).then(result => {
        console.log('\n📊 Resultado inicial:', result);

        if (!result.healthy) {
            console.log('\n⚠️ ALERTA: El sistema requiere atención!');
        }
    });

    // Programar verificaciones periódicas (cada 5 minutos)
    // Enviar mensaje de prueba cada 30 minutos
    let checkCount = 0;
    setInterval(() => {
        checkCount++;
        const shouldSendTest = checkCount % 6 === 0; // Cada 6 checks = 30 min
        runHealthCheck(shouldSendTest);
    }, CHECK_INTERVAL_MS);

    console.log(`\n⏰ Próxima verificación en ${CHECK_INTERVAL_MS / 1000 / 60} minutos...`);
}
