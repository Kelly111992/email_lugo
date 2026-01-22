const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'emails.db');

// Cerciorarse de que exista la carpeta data
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    console.log('📂 Creando carpeta de datos persistentes...');
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// Crear la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error al abrir la base de datos SQLite:', err.message);
    } else {
        console.log('✅ SQLite conectado');
        initDatabase();
    }
});

// Inicializar tablas
function initDatabase() {
    db.run(`CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_address TEXT NOT NULL,
        from_name TEXT,
        subject TEXT,
        body_preview TEXT,
        source TEXT NOT NULL,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_data TEXT
    )`, (err) => {
        if (err) {
            console.error('❌ Error al crear tabla:', err.message);
        }
    });
}

// Clasificar correo por dominio
function classifyEmail(fromAddress) {
    const address = fromAddress.toLowerCase();

    if (address.includes('usuarios.inmuebles24.com')) {
        return 'inmuebles24';
    } else if (address.includes('solicitudes@proppit.com') || address.includes('@proppit.com')) {
        return 'proppit';
    } else if (address.includes('easybroker.com')) {
        return 'easybroker';
    } else if (address.includes('vivanuncios.com.mx')) {
        return 'vivanuncios';
    } else if (address.includes('mercado-libre.com.mx') || address.includes('mercadolibre.com')) {
        return 'mercadolibre';
    } else {
        return 'otros';
    }
}

// Insertar un nuevo correo
async function insertEmail(emailData) {
    const fromAddress = emailData.from?.emailAddress?.address || emailData.from?.address || emailData.from || 'Desconocido';
    const fromName = emailData.from?.emailAddress?.name || emailData.from?.name || 'Sin nombre';
    const subject = emailData.subject || '(Sin asunto)';
    const bodyPreview = emailData.bodyPreview || emailData.body?.content || '';
    const source = classifyEmail(fromAddress);
    const rawData = JSON.stringify(emailData);

    return new Promise((resolve, reject) => {
        // Validación Anti-Duplicados:
        // Verificar si ya existe un correo con el mismo asunto y preview recibido en los últimos 5 minutos
        const checkDuplicateSql = `
            SELECT id FROM emails 
            WHERE from_address = ? 
            AND subject = ? 
            AND body_preview = ? 
            AND received_at >= datetime('now', '-5 minutes')
        `;

        db.get(checkDuplicateSql, [fromAddress, subject, bodyPreview], (err, row) => {
            if (err) {
                console.error('❌ Error verificando duplicados:', err.message);
                // Si falla la verificación, procedemos a insertar por si acaso
            }

            if (row) {
                console.log(`⚠️ Correo duplicado detectado (ID: ${row.id}). Ignorando.`);
                // Resolvemos con null para indicar que no se insertó nada
                resolve({ id: null, source, duplicate: true });
                return;
            }

            // Si no es duplicado, insertar
            const sql = `INSERT INTO emails (from_address, from_name, subject, body_preview, source, raw_data) VALUES (?, ?, ?, ?, ?, ?)`;
            db.run(sql, [fromAddress, fromName, subject, bodyPreview, source, rawData], function (err) {
                if (err) {
                    console.error('❌ Error al insertar:', err.message);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, source, duplicate: false });
                }
            });
        });
    });
}

// Obtener todos los correos con filtros opcionales
async function getAllEmails(limit = 100, source = null) {
    return new Promise((resolve, reject) => {
        let sql = 'SELECT * FROM emails';
        const params = [];

        if (source && source !== 'all') {
            sql += ' WHERE source = ?';
            params.push(source);
        }

        sql += ' ORDER BY received_at DESC LIMIT ?';
        params.push(limit);

        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Obtener estadísticas
async function getStats() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                source, 
                COUNT(*) as count 
            FROM emails 
            GROUP BY source
        `;
        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const stats = {
                    total: 0,
                    bySource: {}
                };
                rows.forEach(row => {
                    stats.total += row.count;
                    stats.bySource[row.source] = row.count;
                });
                resolve(stats);
            }
        });
    });
}

// Obtener correo por ID
async function getEmailById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM emails WHERE id = ?', [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Obtener tendencias por día para el gráfico
async function getTrends(days = 30) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                DATE(received_at) as date,
                source,
                COUNT(*) as count
            FROM emails 
            WHERE received_at >= DATE('now', '-${days} days')
            GROUP BY DATE(received_at), source
            ORDER BY DATE(received_at) ASC
        `;

        db.all(sql, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                // Organizar los datos por fecha y fuente
                const sources = ['inmuebles24', 'proppit', 'easybroker', 'vivanuncios', 'mercadolibre', 'otros'];
                const dateMap = {};

                // Generar todas las fechas en el rango
                for (let i = days - 1; i >= 0; i--) {
                    const date = new Date();
                    date.setDate(date.getDate() - i);
                    const dateStr = date.toISOString().split('T')[0];
                    dateMap[dateStr] = {};
                    sources.forEach(source => {
                        dateMap[dateStr][source] = 0;
                    });
                }

                // Llenar con datos reales
                rows.forEach(row => {
                    if (dateMap[row.date]) {
                        dateMap[row.date][row.source] = row.count;
                    }
                });

                // Convertir a formato para Chart.js
                const labels = Object.keys(dateMap).map(date => {
                    const d = new Date(date + 'T00:00:00');
                    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
                });

                const datasets = sources.map(source => ({
                    source,
                    data: Object.values(dateMap).map(day => day[source] || 0)
                }));

                resolve({ labels, datasets });
            }
        });
    });
}

module.exports = {
    initDatabase: () => Promise.resolve(), // SQLite ya se inicializa en el constructor
    insertEmail,
    getAllEmails,
    getStats,
    getEmailById,
    getTrends
};
