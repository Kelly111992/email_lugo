const https = require('https');

// ============================================
// CONFIGURACIÓN
// ============================================
const EVOLUTION_CONFIG = {
    baseUrl: process.env.EVOLUTION_API_URL || 'https://evolutionapi-evolution-api.ckoomq.easypanel.host',
    instanceName: process.env.EVOLUTION_INSTANCE || 'lugo_email',
    apiKey: process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11'
};

// Número de admin para alertas de WhatsApp (cuando funcione)
const ADMIN_NUMBER = '523318043673';

// Webhook de n8n para enviar alertas por email cuando WhatsApp falle
const N8N_ALERT_WEBHOOK = process.env.N8N_ALERT_WEBHOOK || 'https://evolutionapi-n8n.ckoomq.easypanel.host/webhook/evolution_alert';

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
 * Enviar alerta por email (vía n8n) cuando WhatsApp falla
 */
function sendEmailAlert(alertType, details) {
    return new Promise((resolve) => {
        const url = new URL(N8N_ALERT_WEBHOOK);

        const alertData = {
            type: alertType,
            timestamp: new Date().toISOString(),
            timestampMexico: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
            details: details,
            instance: EVOLUTION_CONFIG.instanceName,
            failedAttempts: failedAttempts,
            lastSuccessfulCheck: lastSuccessfulCheck,
            actionRequired: '⚠️ ACCIÓN REQUERIDA: Reiniciar la instancia de Evolution API',
            instructions: [
                '1. Ir a https://evolutionapi-evolution-api.ckoomq.easypanel.host/manager',
                '2. Ingresar con API Key: 429683C4C977415CAAFCCE10F7D57E11',
                '3. Hacer clic en la instancia "lugo_email"',
                '4. Hacer clic en el botón "RESTART"',
                '5. Esperar 30 segundos y verificar que diga "Connected"'
            ]
        };

        const postData = JSON.stringify(alertData);

        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 10000
        };

        const protocol = url.protocol === 'https:' ? https : require('http');

        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`📧 Alerta por email enviada: ${res.statusCode}`);
                resolve({ success: res.statusCode >= 200 && res.statusCode < 300 });
            });
        });

        req.on('error', (e) => {
            console.error('❌ Error enviando alerta por email:', e.message);
            resolve({ success: false, error: e.message });
        });

        req.write(postData);
        req.end();
    });
}

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
    sendEmailAlert,
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
