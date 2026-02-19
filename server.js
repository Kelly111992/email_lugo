require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const database = require('./database');
const whatsapp = require('./whatsapp');
const evolutionMonitor = require('./evolution-monitor');
const leadNotifications = require('./lead-notifications');
const outlookMonitor = require('./outlook-monitor');
const hubspot = require('./hubspot-integration');
const { classifyAsLead } = require('./lead-classifier');

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

// Recibir correos (webhook de compatibilidad O monitor directo de Outlook)
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

        // Clasificar si es un lead real o correo informativo
        const classification = classifyAsLead(emailData, result.source);

        // Solo enviar a HubSpot si es un lead REAL
        if (classification.isLead) {
            // Extraer info de propiedad para la Nota de HubSpot
            const propertyCode = whatsapp.extractPropertyCode(subject);
            let propertyUrl = null;
            let propertyTitle = propertyCode ? `Propiedad ${propertyCode}` : 'Propiedad interesada';
            let price = ''; // Dejar vacío para que no se muestre si no hay dato
            let location = '';

            // Intentar obtener más detalles si hay código
            if (propertyCode) {
                try {
                    const property = await whatsapp.getPropertyFromEasyBroker(propertyCode);
                    if (property) {
                        propertyUrl = property.public_url || null;
                        propertyTitle = property.title || propertyTitle;
                        price = property.price ? `${property.price.amount} ${property.price.currency}` : price;
                        location = property.location ? property.location.name : location;
                    }
                } catch (e) {
                    console.error('⚠️ Error obteniendo detalles extra para HubSpot:', e.message);
                }
            }

            const leadForHubSpot = {
                email: whatsapp.extractClientEmail(emailData) || fromAddress,
                firstName: whatsapp.extractClientName(emailData),
                lastName: '',
                phone: whatsapp.extractClientPhone(emailData),
                message: whatsappResult.formattedMessage || emailData.bodyPreview,
                source: result.source,
                // Datos para la Nota HTML
                propertyTitle: propertyTitle,
                price: price,
                location: location,
                url: propertyUrl || (propertyCode ? `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir` : null)
            };

            hubspot.processLead(leadForHubSpot).catch(err => console.error('Error background HubSpot:', err));
            console.log('📤 Lead enviado a HubSpot con detalles completos');
        } else {
            console.log(`📰 Correo informativo - NO se envía a HubSpot (${classification.reason})`);
        }

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
            isLead: classification.isLead,
            leadConfidence: classification.confidence,
            whatsappSent: whatsappResult.success,
            hubspotSent: classification.isLead
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
// Obtener todos los correos (con filtros de fecha)
app.get('/api/emails', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const source = req.query.source || null;
        const startDate = req.query.startDate || null;
        const endDate = req.query.endDate || null;

        const emails = await database.getAllEmails(limit, source, startDate, endDate);
        res.json(emails);
    } catch (error) {
        console.error('❌ Error al obtener correos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Buscar correos (Endpoint para Clawdbot)
app.get('/api/emails/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Parámetro "q" requerido' });
        }

        const limit = parseInt(req.query.limit) || 50;
        const emails = await database.searchEmails(query, limit);
        res.json(emails);
    } catch (error) {
        console.error('❌ Error al buscar correos:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// RECUPERAR LEADS PERDIDOS DESDE OUTLOOK
// ============================================
app.post('/api/recover-today', async (req, res) => {
    try {
        console.log('🔄 === INICIANDO RECUPERACIÓN DE LEADS PERDIDOS ===');

        // Tiempo desde cuándo recuperar (default: 9:06 AM México hoy)
        const sinceHour = req.body.sinceHour || 9;
        const sinceMinute = req.body.sinceMinute || 6;

        // Calcular timestamp en UTC (México = UTC-6)
        const mexicoOffset = 6;
        const now = new Date();
        const todayMexico = new Date(now);
        todayMexico.setUTCHours(sinceHour + mexicoOffset, sinceMinute, 0, 0);
        const sinceISO = todayMexico.toISOString();

        console.log(`📅 Buscando emails desde: ${sinceISO} (${sinceHour}:${String(sinceMinute).padStart(2, '0')} AM México)`);

        // Verificar credenciales de Outlook
        const status = outlookMonitor.getMonitorStatus();
        if (!status.hasCredentials) {
            return res.status(400).json({
                success: false,
                error: 'Credenciales de Azure no configuradas. Necesitas AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, OUTLOOK_USER_ID'
            });
        }

        // Obtener token
        const token = await outlookMonitor.getAccessToken();
        if (!token) {
            return res.status(500).json({ success: false, error: 'No se pudo obtener token de Azure' });
        }

        // Fetch emails desde Graph API (leídos Y no leídos)
        const userId = encodeURIComponent(process.env.OUTLOOK_USER_ID || process.env.OUTLOOK_EMAIL);
        const filter = `receivedDateTime ge ${sinceISO}`;
        const encodedFilter = encodeURIComponent(filter);
        const graphPath = `/v1.0/users/${userId}/messages?%24filter=${encodedFilter}&%24select=${encodeURIComponent('id,subject,body,from,receivedDateTime,bodyPreview')}&%24top=100&%24orderby=${encodeURIComponent('receivedDateTime asc')}`;

        const graphResult = await new Promise((resolve) => {
            const https = require('https');
            const options = {
                hostname: 'graph.microsoft.com',
                path: graphPath,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            };

            const req = https.request(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        resolve({ success: true, data: JSON.parse(data) });
                    } catch (e) {
                        resolve({ success: false, error: 'Parse error' });
                    }
                });
            });
            req.on('error', (e) => resolve({ success: false, error: e.message }));
            req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
            req.end();
        });

        if (!graphResult.success || !graphResult.data.value) {
            return res.status(500).json({ success: false, error: graphResult.error || 'No se pudieron obtener emails', details: graphResult.data?.error });
        }

        const emails = graphResult.data.value;
        console.log(`📬 Encontrados ${emails.length} correos desde las ${sinceHour}:${String(sinceMinute).padStart(2, '0')} AM`);

        // Filtrar correos del sistema
        const validEmails = emails.filter(email => {
            const subject = (email.subject || '').toLowerCase();
            const fromAddress = (email.from?.emailAddress?.address || '').toLowerCase();
            return !subject.includes('🏠 nuevo lead') &&
                !subject.includes('delivery status notification') &&
                !fromAddress.includes('mailer-daemon') &&
                !fromAddress.includes('@linkinmobiliario.com.mx') &&
                !subject.includes('📊 resumen') &&
                !subject.includes('⚠️ alerta');
        });

        console.log(`✅ ${validEmails.length} correos válidos para procesar (filtrados ${emails.length - validEmails.length} del sistema)`);

        const results = [];
        let processed = 0, duplicates = 0, errors = 0, whatsappSent = 0, hubspotSent = 0;

        for (const emailData of validEmails) {
            try {
                const subject = emailData.subject || '';
                const fromAddress = (emailData.from?.emailAddress?.address || '').toLowerCase();
                console.log(`\n📨 [${processed + 1}/${validEmails.length}] ${subject.substring(0, 60)}`);

                // Intentar insertar en DB
                const result = await database.insertEmail(emailData);

                if (result.duplicate) {
                    console.log('   🔁 Duplicado, saltando');
                    duplicates++;
                    results.push({ subject, status: 'duplicate' });
                    continue;
                }

                processed++;
                console.log(`   ✅ Guardado ID: ${result.id} | Fuente: ${result.source}`);

                // Registrar lead
                leadNotifications.registerNewLead();

                // Enviar WhatsApp
                try {
                    const whatsappResult = await whatsapp.notifyNewEmail(emailData, result.source);
                    if (whatsappResult.success) {
                        whatsappSent++;
                        console.log('   📱 WhatsApp enviado');
                    } else {
                        console.log('   ⚠️ WhatsApp falló:', whatsappResult.error);
                    }

                    // Clasificar y enviar a HubSpot si es lead real
                    const classification = classifyAsLead(emailData, result.source);

                    if (classification.isLead) {
                        // Extraer info de propiedad para la Nota de HubSpot
                        const propertyCode = whatsapp.extractPropertyCode(emailData.subject || '');
                        let propertyUrl = null;
                        let propertyTitle = 'Propiedad interesada';
                        let price = 'No especificado';
                        let location = 'No especificada';

                        if (propertyCode) {
                            try {
                                const property = await whatsapp.getPropertyFromEasyBroker(propertyCode);
                                if (property) {
                                    propertyUrl = property.public_url || null;
                                    propertyTitle = property.title || propertyTitle;
                                    price = property.price ? `${property.price.amount} ${property.price.currency}` : price;
                                    location = property.location ? property.location.name : location;
                                }
                            } catch (e) { }
                        }

                        const leadForHubSpot = {
                            email: whatsapp.extractClientEmail(emailData) || fromAddress,
                            firstName: whatsapp.extractClientName(emailData),
                            lastName: '',
                            phone: whatsapp.extractClientPhone(emailData),
                            message: whatsappResult.formattedMessage || emailData.bodyPreview || emailData.body?.content,
                            source: result.source,
                            propertyTitle,
                            price,
                            location,
                            url: propertyUrl || (propertyCode ? `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir` : null)
                        };
                        await hubspot.processLead(leadForHubSpot);
                        hubspotSent++;
                        console.log('   📤 HubSpot enviado con detalles');
                    } else {
                        console.log(`   📰 Informativo - NO HubSpot (${classification.reason})`);
                    }

                    results.push({
                        subject,
                        status: 'processed',
                        source: result.source,
                        isLead: classification.isLead,
                        whatsapp: whatsappResult.success,
                        hubspot: classification.isLead
                    });
                } catch (notifyErr) {
                    console.error('   ❌ Error notificando:', notifyErr.message);
                    results.push({ subject, status: 'partial', error: notifyErr.message });
                }

                // Pausa entre mensajes para no saturar
                await new Promise(r => setTimeout(r, 3000));

            } catch (emailErr) {
                errors++;
                console.error(`   ❌ Error procesando: ${emailErr.message}`);
                results.push({ subject: emailData.subject, status: 'error', error: emailErr.message });
            }
        }

        const summary = {
            success: true,
            totalFound: emails.length,
            systemFiltered: emails.length - validEmails.length,
            processed,
            duplicates,
            errors,
            whatsappSent,
            hubspotSent,
            results
        };

        console.log(`\n🏁 === RECUPERACIÓN COMPLETADA ===`);
        console.log(`   📊 Procesados: ${processed} | Duplicados: ${duplicates} | Errores: ${errors}`);
        console.log(`   📱 WhatsApp: ${whatsappSent} | 📤 HubSpot: ${hubspotSent}`);

        res.json(summary);

    } catch (error) {
        console.error('❌ Error en recuperación:', error);
        res.status(500).json({ success: false, error: error.message });
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

// Reenviar notificación de un correo específico (Para Clawdbot)
app.post('/api/emails/:id/resend', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const email = await database.getEmailById(id);

        if (!email) {
            return res.status(404).json({ error: 'Correo no encontrado' });
        }

        // Reconstruir emailData desde raw_data
        let emailData;
        try {
            emailData = JSON.parse(email.raw_data);
        } catch (e) {
            emailData = {
                subject: email.subject,
                bodyPreview: email.body_preview,
                from: { address: email.from_address, name: email.from_name }
            };
        }

        console.log(`🔄 Reenviando notificaciones para ID: ${id}`);
        const whatsappResult = await whatsapp.notifyNewEmail(emailData, email.source);

        res.json({
            success: true,
            message: 'Notificaciones reenviadas',
            whatsapp: whatsappResult
        });
    } catch (error) {
        console.error('❌ Error al reenviar notificación:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SYNC LEADS DE HOY A HUBSPOT
// ============================================
app.get('/api/hubspot/sync-today', async (req, res) => {
    try {
        console.log('🔄 === SINCRONIZANDO LEADS DE HOY A HUBSPOT ===');

        // Obtener fecha de hoy en formato YYYY-MM-DD
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // 2026-02-10

        const allEmails = await database.getAllEmails(100, null, todayStr, null);
        console.log(`📊 Emails de hoy en DB: ${allEmails.length}`);

        if (allEmails.length === 0) {
            return res.json({ success: true, message: 'No hay emails de hoy', processed: 0 });
        }

        let sent = 0, skipped = 0, errors = 0;
        const results = [];

        for (const email of allEmails) {
            const source = (email.source || '').toLowerCase();

            // Reconstruir emailData
            let emailData;
            try {
                emailData = JSON.parse(email.raw_data || '{}');
            } catch (e) {
                emailData = {
                    subject: email.subject,
                    bodyPreview: email.body_preview,
                    from: { emailAddress: { address: email.from_address, name: email.from_name } }
                };
            }

            // Clasificar
            const classification = classifyAsLead(emailData, email.source);

            if (!classification.isLead) {
                skipped++;
                console.log(`   ⏭️ "${email.subject?.substring(0, 40)}" - Informativo (${classification.reason})`);
                results.push({ subject: email.subject, status: 'skipped', reason: classification.reason });
                continue;
            }

            // Extraer datos del cliente
            const bodyText = email.body_preview || '';
            const fromAddress = email.from_address || '';

            const clientEmail = whatsapp.extractClientEmail(emailData) || fromAddress;
            const clientName = whatsapp.extractClientName(emailData) || email.from_name || '';
            const clientPhone = whatsapp.extractClientPhone(emailData) || '';

            console.log(`   📤 Enviando a HubSpot: ${clientEmail} (${clientName}) - ${email.source}`);

            try {
                const leadForHubSpot = {
                    email: clientEmail,
                    firstName: clientName,
                    lastName: '',
                    phone: clientPhone,
                    message: bodyText.substring(0, 500),
                    source: email.source
                };

                await hubspot.processLead(leadForHubSpot);
                sent++;
                console.log(`   ✅ HubSpot OK`);
                results.push({ subject: email.subject, email: clientEmail, status: 'sent' });
            } catch (err) {
                errors++;
                console.error(`   ❌ HubSpot Error: ${err.message}`);
                results.push({ subject: email.subject, email: clientEmail, status: 'error', error: err.message });
            }

            // Pausa para no saturar API
            await new Promise(r => setTimeout(r, 1500));
        }

        const summary = { success: true, totalEmails: allEmails.length, sentToHubSpot: sent, skipped, errors, results };
        console.log(`\n🏁 HubSpot Sync: Enviados=${sent} Saltados=${skipped} Errores=${errors}`);
        res.json(summary);

    } catch (error) {
        console.error('❌ Error en sync HubSpot:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Enviar mensaje de WhatsApp (Para Clawdbot)
app.post('/api/whatsapp/send', async (req, res) => {
    try {
        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({ error: 'Faltan parámetros: number y message requeridos' });
        }

        console.log(`💬 Enviando WhatsApp manual a ${number}`);
        const result = await whatsapp.sendWhatsAppMessage(message, number);

        res.json({
            success: true,
            result
        });
    } catch (error) {
        console.error('❌ Error al enviar WhatsApp manual:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// OUTLOOK MONITOR ENDPOINTS
// ============================================

// Verificar estado del monitor de Outlook
app.get('/api/outlook-status', async (req, res) => {
    try {
        const status = outlookMonitor.getMonitorStatus();
        const testConnection = req.query.test === 'true';

        let connectionTest = null;
        if (testConnection) {
            connectionTest = await outlookMonitor.testConnection();
        }

        res.json({
            ...status,
            connectionTest,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error al verificar Outlook Monitor:', error);
        res.status(500).json({ error: error.message, isMonitoring: false });
    }
});

// Forzar verificación de correos nuevos
app.post('/api/outlook-status/check', async (req, res) => {
    try {
        const emails = await outlookMonitor.fetchNewEmails();
        res.json({
            success: true,
            emailsFound: emails.length,
            emails: emails.map(e => ({ subject: e.subject, from: e.from?.emailAddress?.address }))
        });
    } catch (error) {
        console.error('❌ Error al verificar correos:', error);
        res.status(500).json({ error: error.message });
    }
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
║   📧 Email Monitor App (SIN N8N)                       ║
║   ──────────────────────────────────────────────       ║
║                                                        ║
║   🌐 Dashboard: http://localhost:${PORT}                 ║
║   📬 Outlook:   http://localhost:${PORT}/api/outlook-status
║   📱 WhatsApp:  http://localhost:${PORT}/api/evolution-status
║                                                        ║
║   Monitoreo directo de Outlook via Graph API           ║
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

            // ============================================
            // INICIAR MONITOREO DE OUTLOOK (REEMPLAZA N8N)
            // ============================================
            console.log('📧 Iniciando monitoreo de Outlook via Microsoft Graph...');
            try {
                await outlookMonitor.startMonitoring(async (emailData) => {
                    // Procesar correo igual que antes
                    const subject = emailData.subject || '';
                    const fromAddress = (emailData.from?.emailAddress?.address || '').toLowerCase();

                    // Protección anti-loop
                    if (subject.includes('🏠 Nuevo Lead') ||
                        subject.includes('Delivery Status Notification') ||
                        fromAddress.includes('mailer-daemon') ||
                        fromAddress.includes('@linkinmobiliario.com.mx')) {
                        console.log(`🛑 Ignorando correo del sistema: ${subject}`);
                        return;
                    }

                    const result = await database.insertEmail(emailData);

                    if (result.duplicate) {
                        console.log('🛑 Correo duplicado, ignorando.');
                        return;
                    }

                    console.log(`✅ Nuevo lead desde Outlook: ${subject}`);
                    leadNotifications.registerNewLead();
                    const whatsappResult = await whatsapp.notifyNewEmail(emailData, result.source);

                    // Clasificar si es lead real
                    const classification = classifyAsLead(emailData, result.source);

                    // Solo enviar a HubSpot si es lead REAL
                    if (classification.isLead) {
                        // Extraer info de propiedad para la Nota de HubSpot
                        const propertyCode = whatsapp.extractPropertyCode(emailData.subject || '');
                        let propertyUrl = null;
                        let propertyTitle = 'Propiedad interesada';
                        let price = 'No especificado';
                        let location = 'No especificada';

                        if (propertyCode) {
                            try {
                                const property = await whatsapp.getPropertyFromEasyBroker(propertyCode);
                                if (property) {
                                    propertyUrl = property.public_url || null;
                                    propertyTitle = property.title || propertyTitle;
                                    price = property.price ? `${property.price.amount} ${property.price.currency}` : price;
                                    location = property.location ? property.location.name : location;
                                }
                            } catch (e) {
                                console.error('⚠️ Error obteniendo detalles extra para HubSpot (Outlook):', e.message);
                            }
                        }

                        const leadForHubSpot = {
                            email: whatsapp.extractClientEmail(emailData) || fromAddress,
                            firstName: whatsapp.extractClientName(emailData),
                            lastName: '',
                            phone: whatsapp.extractClientPhone(emailData),
                            message: whatsappResult.formattedMessage || emailData.bodyPreview || emailData.body?.content,
                            source: result.source,
                            subject: emailData.subject,
                            propertyTitle,
                            price,
                            location,
                            url: propertyUrl || (propertyCode ? `https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}&commit=Ir` : null),
                            propertyCode
                        };
                        hubspot.processLead(leadForHubSpot).catch(err => console.error('Error background HubSpot (Outlook):', err));
                        console.log('📤 Lead enviado a HubSpot (Outlook) con detalles completos');
                    } else {
                        console.log(`📰 Correo informativo (Outlook) - NO se envía a HubSpot`);
                    }
                });
                console.log('✅ Monitoreo de Outlook activo');
            } catch (error) {
                console.error('❌ Error iniciando monitor de Outlook:', error.message);
                console.log('⚠️  Verifica los permisos de Microsoft Graph API');
            }
        });
    } catch (error) {
        console.error('❌ Error al iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();

