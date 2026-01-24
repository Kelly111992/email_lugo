const express = require('express');
const cors = require('cors');
const path = require('path');
const database = require('./database');
const whatsapp = require('./whatsapp');
const evolutionMonitor = require('./evolution-monitor');
const leadNotifications = require('./lead-notifications');

const app = express();
const PORT = process.env.PORT || 4000;

// Intervalo de monitoreo (5 minutos)
const MONITOR_INTERVAL_MS = 5 * 60 * 1000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// API ENDPOINTS
// ============================================

// Recibir correos desde n8n (webhook)
app.post('/api/emails', async (req, res) => {
    try {
        console.log('📧 Correo recibido:', JSON.stringify(req.body, null, 2));

        const emailData = req.body;
        const subject = emailData.subject || '';

        // PROTECCIÓN CONTRA BUCLES (Anti-Loop)
        // Si el asunto comienza con nuestro propio patrón de notificación, lo ignoramos.
        // También ignoramos correos de 'Mailer Daemon' o rebotes comunes.
        // También ignoramos correos de nuestro propio dominio (internos).
        const fromAddress = (emailData.from?.emailAddress?.address || emailData.from?.address || '').toLowerCase();

        if (subject.includes('🏠 Nuevo Lead') ||
            subject.includes('Delivery Status Notification') ||
            fromAddress.includes('mailer-daemon') ||
            fromAddress.includes('@linkinmobiliario.com.mx')) {

            console.log(`🛑 Ignorando correo del sistema/interno para evitar bucles. From: ${fromAddress}`);
            return res.json({
                success: true,
                message: 'Correo del sistema ignorado (Anti-Loop)',
                ignored: true
            });
        }

        const result = await database.insertEmail(emailData);

        if (result.duplicate) {
            console.log('🛑 Deteniendo proceso por correo duplicado.');
            return res.json({
                success: true,
                message: 'Correo duplicado (ignorado)',
                duplicate: true
            });
        }

        console.log(`✅ Correo guardado - ID: ${result.id}, Clasificado como: ${result.source}`);

        // Registrar lead para el sistema de alertas de inactividad
        leadNotifications.registerNewLead();

        // Enviar notificación a WhatsApp
        console.log('📱 Enviando notificación a WhatsApp...');
        const whatsappResult = await whatsapp.notifyNewEmail(emailData, result.source);

        if (whatsappResult.success) {
            console.log('✅ Notificación WhatsApp enviada');
        } else {
            console.log('⚠️ No se pudo enviar WhatsApp:', whatsappResult.error);
        }

        res.json({
            success: true,
            message: 'Correo recibido y clasificado',
            id: result.id,
            source: result.source,
            whatsappSent: whatsappResult.success
        });
    } catch (error) {
        console.error('❌ Error al procesar correo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener todos los correos
app.get('/api/emails', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const source = req.query.source || null;

        const emails = await database.getAllEmails(limit, source);
        res.json(emails);
    } catch (error) {
        console.error('❌ Error al obtener correos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener estadísticas
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await database.getStats();
        res.json(stats);
    } catch (error) {
        console.error('❌ Error al obtener estadísticas:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un correo específico
app.get('/api/emails/:id', async (req, res) => {
    try {
        const email = await database.getEmailById(parseInt(req.params.id));
        if (email) {
            res.json(email);
        } else {
            res.status(404).json({ error: 'Correo no encontrado' });
        }
    } catch (error) {
        console.error('❌ Error al obtener correo:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// EVOLUTION API MONITOR ENDPOINTS
// ============================================

// Verificar estado de Evolution API
app.get('/api/evolution-status', async (req, res) => {
    try {
        const sendTest = req.query.test === 'true';
        const result = await evolutionMonitor.runHealthCheck(sendTest);
        const status = evolutionMonitor.getMonitorStatus();

        res.json({
            ...result,
            monitorStatus: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error al verificar Evolution API:', error);
        res.status(500).json({ error: error.message, healthy: false });
    }
});

// Forzar alerta de prueba
app.post('/api/evolution-status/test-alert', async (req, res) => {
    try {
        console.log('📧 Enviando alerta de prueba...');
        const result = await evolutionMonitor.sendEmailAlert('TEST_ALERT', {
            message: 'Esta es una alerta de prueba del sistema de monitoreo',
            requestedBy: 'Manual test via API'
        });

        res.json({
            success: result.success,
            message: result.success ? 'Alerta de prueba enviada' : 'Error al enviar alerta'
        });
    } catch (error) {
        console.error('❌ Error al enviar alerta de prueba:', error);
        res.status(500).json({ error: error.message });
    }
});

// Forzar reinicio de instancia
app.post('/api/evolution-status/restart', async (req, res) => {
    try {
        console.log('🔄 Forzando reinicio de instancia...');
        const result = await evolutionMonitor.attemptRestart();

        // Esperar 5 segundos y verificar
        await new Promise(r => setTimeout(r, 5000));
        const checkResult = await evolutionMonitor.runHealthCheck(false);

        res.json({
            restartSuccess: result.success,
            currentStatus: checkResult,
            message: checkResult.healthy ? 'Reinicio exitoso, conexión restaurada' : 'Reinicio completado pero conexión no disponible'
        });
    } catch (error) {
        console.error('❌ Error al reiniciar:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener tendencias para el gráfico
app.get('/api/trends', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const trends = await database.getTrends(days);
        res.json(trends);
    } catch (error) {
        console.error('❌ Error al obtener tendencias:', error);
        res.status(500).json({ error: error.message });
    }
});

// Servir el frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================

async function startServer() {
    try {
        // Initialize database first
        await database.initDatabase();

        app.listen(PORT, '0.0.0.0', async () => {
            console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   📧 Email Monitor App                                 ║
║   ──────────────────────────────────────────────       ║
║                                                        ║
║   🌐 Dashboard: http://localhost:${PORT}                 ║
║   📨 Webhook:   http://localhost:${PORT}/api/emails      ║
║   🔍 Monitor:   http://localhost:${PORT}/api/evolution-status
║                                                        ║
║   Esperando correos de n8n...                          ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
            `);

            // ============================================
            // INICIAR MONITOREO DE EVOLUTION API
            // ============================================
            console.log('🔍 Iniciando monitoreo de Evolution API...');

            // Verificación inicial
            const initialCheck = await evolutionMonitor.runHealthCheck(false);
            if (initialCheck.healthy) {
                console.log('✅ Evolution API está funcionando correctamente');
            } else {
                console.log('⚠️ Evolution API tiene problemas - Se enviará alerta');
            }

            // Programar verificaciones automáticas cada 5 minutos
            let checkCount = 0;
            setInterval(async () => {
                checkCount++;
                // Enviar mensaje de prueba cada 30 min (6 checks)
                const shouldSendTest = checkCount % 6 === 0;

                try {
                    await evolutionMonitor.runHealthCheck(shouldSendTest);
                } catch (error) {
                    console.error('❌ Error en verificación automática:', error.message);
                }
            }, MONITOR_INTERVAL_MS);

            console.log(`⏰ Verificación automática cada ${MONITOR_INTERVAL_MS / 1000 / 60} minutos`);

            // ============================================
            // INICIAR NOTIFICACIONES DE LEADS
            // ============================================
            leadNotifications.startScheduler();
            console.log('📊 Sistema de resumen diario y alertas de inactividad activado');
        });
    } catch (error) {
        console.error('❌ Error al iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();

