const https = require('https');

// ============================================
// CONFIGURACIÓN DE MICROSOFT GRAPH API
// ============================================
const GRAPH_CONFIG = {
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    userId: process.env.OUTLOOK_USER_ID || process.env.OUTLOOK_EMAIL,
    checkIntervalMs: parseInt(process.env.OUTLOOK_CHECK_INTERVAL) || 60000
};

let accessToken = null;
let tokenExpiry = 0;
let isMonitoring = false;
let lastCheckTime = null;
let emailsProcessed = 0;
let monitorInterval = null;
let emailCallback = null;

// ============================================
// AUTENTICACIÓN CON MICROSOFT GRAPH
// ============================================
function getAccessToken() {
    return new Promise((resolve) => {
        if (!GRAPH_CONFIG.tenantId || !GRAPH_CONFIG.clientId || !GRAPH_CONFIG.clientSecret) {
            console.log('⚠️ Outlook Monitor: Faltan credenciales de Azure (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)');
            return resolve(null);
        }

        // Return cached token if still valid
        if (accessToken && Date.now() < tokenExpiry - 60000) {
            return resolve(accessToken);
        }

        const postData = new URLSearchParams({
            client_id: GRAPH_CONFIG.clientId,
            client_secret: GRAPH_CONFIG.clientSecret,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials'
        }).toString();

        const options = {
            hostname: 'login.microsoftonline.com',
            path: `/${GRAPH_CONFIG.tenantId}/oauth2/v2.0/token`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.access_token) {
                        accessToken = result.access_token;
                        tokenExpiry = Date.now() + (result.expires_in * 1000);
                        resolve(accessToken);
                    } else {
                        console.error('❌ Error obteniendo token:', result.error_description || result.error);
                        resolve(null);
                    }
                } catch (e) {
                    console.error('❌ Error parseando token response:', e.message);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('❌ Error de red al obtener token:', e.message);
            resolve(null);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });

        req.write(postData);
        req.end();
    });
}

// ============================================
// FUNCIONES DE GRAPH API
// ============================================
function graphRequest(path) {
    return new Promise(async (resolve) => {
        const token = await getAccessToken();
        if (!token) {
            return resolve({ success: false, error: 'No token available' });
        }

        const options = {
            hostname: 'graph.microsoft.com',
            path: path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true, data: result });
                    } else {
                        resolve({ success: false, error: result.error?.message || `HTTP ${res.statusCode}`, statusCode: res.statusCode });
                    }
                } catch (e) {
                    resolve({ success: false, error: 'Parse error' });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Timeout' });
        });

        req.end();
    });
}

// Enviar email via Graph API
function sendEmail(toEmail, subject, htmlContent, textContent) {
    return new Promise(async (resolve) => {
        const token = await getAccessToken();
        if (!token) {
            return resolve({ success: false, error: 'No token available' });
        }

        const emailData = JSON.stringify({
            message: {
                subject: subject,
                body: {
                    contentType: htmlContent ? 'HTML' : 'Text',
                    content: htmlContent || textContent
                },
                toRecipients: [{
                    emailAddress: { address: toEmail }
                }]
            },
            saveToSentItems: false
        });

        const userId = encodeURIComponent(GRAPH_CONFIG.userId);
        const options = {
            hostname: 'graph.microsoft.com',
            path: `/v1.0/users/${userId}/sendMail`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(emailData)
            },
            timeout: 15000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ Email enviado via Graph API a ${toEmail}`);
                    resolve({ success: true });
                } else {
                    console.error(`❌ Error enviando email (${res.statusCode}):`, data);
                    resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Timeout' });
        });

        req.write(emailData);
        req.end();
    });
}

// ============================================
// OBTENER CORREOS NUEVOS
// ============================================
async function fetchNewEmails() {
    if (!GRAPH_CONFIG.userId) {
        console.log('⚠️ Outlook Monitor: OUTLOOK_USER_ID o OUTLOOK_EMAIL no configurado');
        return [];
    }

    const since = lastCheckTime
        ? new Date(lastCheckTime).toISOString()
        : new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const filter = encodeURIComponent(`receivedDateTime ge ${since} and isRead eq false`);
    const select = encodeURIComponent('subject,body,from,receivedDateTime,bodyPreview');
    const path = `/v1.0/users/${encodeURIComponent(GRAPH_CONFIG.userId)}/messages?%24filter=${filter}&%24select=${select}&%24top=50&%24orderby=${encodeURIComponent('receivedDateTime desc')}`;

    const result = await graphRequest(path);

    if (result.success && result.data.value) {
        lastCheckTime = new Date().toISOString();
        return result.data.value;
    }

    if (!result.success) {
        console.error('❌ Error fetching emails:', result.error);
    }

    return [];
}

// ============================================
// TEST DE CONEXIÓN
// ============================================
async function testConnection() {
    if (!GRAPH_CONFIG.userId) {
        return { success: false, error: 'OUTLOOK_USER_ID not configured' };
    }

    const result = await graphRequest(`/v1.0/users/${encodeURIComponent(GRAPH_CONFIG.userId)}/mailFolders/inbox?%24select=displayName,totalItemCount,unreadItemCount`);

    if (result.success) {
        return {
            success: true,
            inbox: result.data
        };
    }

    return { success: false, error: result.error };
}

// ============================================
// MONITOREO CONTINUO
// ============================================
async function startMonitoring(callback) {
    if (!GRAPH_CONFIG.tenantId || !GRAPH_CONFIG.clientId || !GRAPH_CONFIG.clientSecret) {
        console.log('⚠️ Outlook Monitor: Credenciales de Azure no configuradas. Monitoreo de Outlook desactivado.');
        console.log('   Configura: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, OUTLOOK_USER_ID');
        return;
    }

    emailCallback = callback;

    // Test connection first
    const connectionTest = await testConnection();
    if (!connectionTest.success) {
        console.error('❌ No se pudo conectar a Outlook:', connectionTest.error);
        throw new Error(`Outlook connection failed: ${connectionTest.error}`);
    }

    console.log(`✅ Conectado a Outlook. Monitoreando cada ${GRAPH_CONFIG.checkIntervalMs / 1000}s`);
    isMonitoring = true;
    lastCheckTime = new Date().toISOString();

    // Start periodic checking
    monitorInterval = setInterval(async () => {
        try {
            const emails = await fetchNewEmails();
            for (const email of emails) {
                emailsProcessed++;
                console.log(`📧 Correo recibido:`, JSON.stringify({ body: email.body }, null, 2));

                if (emailCallback) {
                    await emailCallback(email);
                }
            }
        } catch (error) {
            console.error('❌ Error en ciclo de monitoreo:', error.message);
        }
    }, GRAPH_CONFIG.checkIntervalMs);
}

function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    isMonitoring = false;
    console.log('🛑 Monitoreo de Outlook detenido');
}

function getMonitorStatus() {
    return {
        isMonitoring,
        lastCheckTime,
        emailsProcessed,
        hasCredentials: !!(GRAPH_CONFIG.tenantId && GRAPH_CONFIG.clientId && GRAPH_CONFIG.clientSecret),
        userId: GRAPH_CONFIG.userId || 'Not configured'
    };
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
    startMonitoring,
    stopMonitoring,
    fetchNewEmails,
    testConnection,
    getMonitorStatus,
    sendEmail,
    getAccessToken
};
