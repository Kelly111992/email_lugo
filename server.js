const express = require('express');
const cors = require('cors');
const path = require('path');
const database = require('./database');
const whatsapp = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 4000;

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

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   📧 Email Monitor App                                 ║
║   ──────────────────────────────────────────────       ║
║                                                        ║
║   🌐 Dashboard: http://localhost:${PORT}                 ║
║   📨 Webhook:   http://localhost:${PORT}/api/emails      ║
║                                                        ║
║   Esperando correos de n8n...                          ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ Error al iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();
