const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'emails.db');

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

    if (address.includes('arkelly147@gmail.com')) {
        return 'personal';
    } else if (address.includes('usuarios.inmuebles24.com')) {
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
    const fromAddress = emailData.from?.emailAddress?.address || emailData.from?.address || emailAddress || 'Desconocido';
    const fromName = emailData.from?.emailAddress?.name || emailData.from?.name || 'Sin nombre';
    const subject = emailData.subject || '(Sin asunto)';
    const bodyPreview = emailData.bodyPreview || emailData.body?.content || '';
    const source = classifyEmail(fromAddress);
    const rawData = JSON.stringify(emailData);

    return new Promise((resolve, reject) => {
        const sql = `INSERT INTO emails (from_address, from_name, subject, body_preview, source, raw_data) VALUES (?, ?, ?, ?, ?, ?)`;

        db.run(sql, [fromAddress, fromName, subject, bodyPreview, source, rawData], function (err) {
            if (err) {
                console.error('❌ Error al insertar:', err.message);
                reject(err);
            } else {
                resolve({ id: this.lastID, source });
            }
        });
    });
}

// Obtener todos los correos
async function getAllEmails() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM emails ORDER BY received_at DESC', [], (err, rows) => {
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

module.exports = {
    initDatabase: () => Promise.resolve(), // SQLite ya se inicializa en el constructor
    insertEmail,
    getAllEmails,
    getStats,
    getEmailById
};
