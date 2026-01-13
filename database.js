const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'emails.db');

let db = null;

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create table if not exists
    db.run(`
        CREATE TABLE IF NOT EXISTS emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_address TEXT NOT NULL,
            from_name TEXT,
            subject TEXT,
            body_preview TEXT,
            source TEXT NOT NULL,
            received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            raw_data TEXT
        )
    `);

    saveDatabase();
    console.log('✅ Base de datos inicializada');
    return db;
}

// Save database to file
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
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
    } else if (address.includes('inbox.easybroker.com') || address.includes('@easybroker.com')) {
        return 'easybroker';
    } else if (address.includes('usuarios.vivanuncios.com.mx') || address.includes('@vivanuncios.com')) {
        return 'vivanuncios';
    } else if (address.includes('no-responder@mercadolibre.com') || address.includes('@mercadolibre.com')) {
        return 'mercadolibre';
    }

    return 'otros';
}

// Insertar un nuevo correo
function insertEmail(emailData) {
    if (!db) throw new Error('Database not initialized');

    const fromAddress = emailData.from?.emailAddress?.address ||
        emailData.from?.address ||
        emailData.from ||
        'unknown';

    const fromName = emailData.from?.emailAddress?.name ||
        emailData.from?.name ||
        '';

    const source = classifyEmail(fromAddress);
    const receivedAt = new Date().toISOString();

    db.run(`
        INSERT INTO emails (from_address, from_name, subject, body_preview, source, received_at, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
        fromAddress,
        fromName,
        emailData.subject || '(Sin asunto)',
        emailData.bodyPreview || emailData.body?.content || '',
        source,
        receivedAt,
        JSON.stringify(emailData)
    ]);

    saveDatabase();

    // Get the last inserted ID
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0]?.values[0]?.[0] || 0;

    return {
        id: id,
        source: source
    };
}

// Obtener todos los correos
function getAllEmails(limit = 100, source = null) {
    if (!db) return [];

    let query = 'SELECT * FROM emails';
    const params = [];

    if (source && source !== 'all') {
        query += ' WHERE source = ?';
        params.push(source);
    }

    query += ' ORDER BY received_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(query);
    stmt.bind(params);

    const results = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push(row);
    }
    stmt.free();

    return results;
}

// Obtener estadísticas
function getStats() {
    if (!db) return { total: 0, personal: 0, inmuebles24: 0, proppit: 0, easybroker: 0, vivanuncios: 0, mercadolibre: 0, otros: 0 };

    const result = db.exec(`
        SELECT 
            source,
            COUNT(*) as count
        FROM emails
        GROUP BY source
    `);

    const stats = {
        total: 0,
        personal: 0,
        inmuebles24: 0,
        proppit: 0,
        easybroker: 0,
        vivanuncios: 0,
        mercadolibre: 0,
        otros: 0
    };

    if (result[0]) {
        result[0].values.forEach(row => {
            const source = row[0];
            const count = row[1];
            stats[source] = count;
            stats.total += count;
        });
    }

    return stats;
}

// Obtener un correo por ID
function getEmailById(id) {
    if (!db) return null;

    const stmt = db.prepare('SELECT * FROM emails WHERE id = ?');
    stmt.bind([id]);

    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();

    return result;
}

module.exports = {
    initDatabase,
    insertEmail,
    getAllEmails,
    getStats,
    getEmailById,
    classifyEmail
};
