const express = require('express');
const cors = require('cors');
const path = require('path');
const database = require('./database');
const whatsapp = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;

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
        const result = database.insertEmail(emailData);

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
app.get('/api/emails', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const source = req.query.source || null;

        const emails = database.getAllEmails(limit, source);
        res.json(emails);
    } catch (error) {
        console.error('❌ Error al obtener correos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener estadísticas
app.get('/api/stats', (req, res) => {
    try {
        const stats = database.getStats();
        res.json(stats);
    } catch (error) {
        console.error('❌ Error al obtener estadísticas:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un correo específico
app.get('/api/emails/:id', (req, res) => {
    try {
        const email = database.getEmailById(parseInt(req.params.id));
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

        app.listen(PORT, () => {
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
