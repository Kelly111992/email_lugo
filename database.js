const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// ============================================
// SUPABASE CLIENT
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kbdmbejefpldfjybusbd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase conectado:', SUPABASE_URL);
} else {
    console.log('⚠️ Supabase: SUPABASE_KEY no configurada. Solo se guardará en SQLite local.');
}

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
        // Use serialize to guarantee execution order
        db.serialize(() => {
            initDatabase();
            migrateDatabase();
        });
    }
});

// Inicializar tablas - outlook_id included from creation to avoid race condition
function initDatabase() {
    db.run(`CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_address TEXT NOT NULL,
        from_name TEXT,
        subject TEXT,
        body_preview TEXT,
        source TEXT NOT NULL,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_data TEXT,
        outlook_id TEXT
    )`, (err) => {
        if (err) {
            console.error('❌ Error al crear tabla:', err.message);
        } else {
            console.log('✅ Tabla emails lista (con outlook_id)');
        }
    });
}

function migrateDatabase() {
    // Still needed for existing DBs that don't have the column yet
    db.run("ALTER TABLE emails ADD COLUMN outlook_id TEXT", (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            // This is expected if column already exists from CREATE TABLE
            if (!err.message.includes('no such table')) {
                console.log('✅ Migración: outlook_id ya existe');
            }
        } else {
            console.log('✅ Migración: Columna outlook_id agregada.');
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
        // Validación Anti-Duplicados Mejorada:
        // 1. Primero intentar por ID de Outlook (Infalible)
        if (emailData.id) {
            db.get('SELECT id FROM emails WHERE outlook_id = ?', [emailData.id], (err, row) => {
                if (err) console.error('Error db duplicado id:', err);
                if (row) {
                    console.log(`⚠️ Correo duplicado por ID detectado (ID Local: ${row.id}, Outlook ID: ${emailData.id}). Ignorando.`);
                    resolve({ id: null, source, duplicate: true });
                    return;
                }
                // Si no existe por ID, continuamos con la inserción normal (la query de abajo ya no es necesaria si tenemos ID, pero la dejamos por seguridad si no viene ID)
                proceedInsert();
            });
            return;
        }

        function proceedInsert() {
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
                }

                if (row) {
                    console.log(`⚠️ Correo duplicado por contenido detectado (ID: ${row.id}). Ignorando.`);
                    resolve({ id: null, source, duplicate: true });
                    return;
                }

                // Insertar
                insertFinal();
            });
        }

        function insertFinal() {
            const sql = `INSERT INTO emails (from_address, from_name, subject, body_preview, source, raw_data, outlook_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            db.run(sql, [fromAddress, fromName, subject, bodyPreview, source, rawData, emailData.id], function (err) {
                if (err) {
                    console.error('❌ Error al insertar:', err.message);
                    reject(err);
                } else {
                    const localId = this.lastID;
                    // Sync to Supabase in background (non-blocking)
                    syncToSupabase({
                        from_address: fromAddress,
                        from_name: fromName,
                        subject,
                        body_preview: bodyPreview,
                        source,
                        outlook_id: emailData.id || null,
                        raw_data: emailData
                    });
                    resolve({ id: localId, source, duplicate: false });
                }
            });
        }
    });
}

// Obtener todos los correos con filtros opcionales
async function getAllEmails(limit = 100, source = null, startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
        let sql = 'SELECT * FROM emails';
        const params = [];
        const conditions = [];

        if (source && source !== 'all') {
            conditions.push('source = ?');
            params.push(source);
        }

        if (startDate) {
            conditions.push('received_at >= ?');
            params.push(startDate);
        }

        if (endDate) {
            // Asumiendo endDate es inclusivo, agregamos tiempo hasta el final del día si es solo fecha
            let end = endDate;
            if (end.length === 10) end += 'T23:59:59';
            conditions.push('received_at <= ?');
            params.push(end);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
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

// Buscar correos por término (nombre, teléfono, email, asunto)
async function searchEmails(query, limit = 50) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT * FROM emails 
            WHERE 
                subject LIKE ? OR 
                body_preview LIKE ? OR 
                from_address LIKE ? OR
                from_name LIKE ?
            ORDER BY received_at DESC 
            LIMIT ?
        `;
        const searchTerm = `%${query}%`;
        const params = [searchTerm, searchTerm, searchTerm, searchTerm, limit];

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

// ============================================
// SYNC TO SUPABASE (Background)
// ============================================
async function syncToSupabase(leadData) {
    if (!supabase) return;

    try {
        const { data, error } = await supabase
            .from('leads')
            .upsert({
                from_address: leadData.from_address,
                from_name: leadData.from_name,
                subject: leadData.subject,
                body_preview: leadData.body_preview,
                source: leadData.source,
                outlook_id: leadData.outlook_id,
                raw_data: leadData.raw_data
            }, {
                onConflict: 'outlook_id',
                ignoreDuplicates: true
            });

        if (error) {
            console.error('❌ Error Supabase sync:', error.message);
        } else {
            console.log('☁️ Lead sincronizado a Supabase');
        }
    } catch (e) {
        console.error('❌ Excepción Supabase sync:', e.message);
    }
}

// Update lead status in Supabase
async function updateLeadStatus(outlookId, updates) {
    if (!supabase || !outlookId) return;

    try {
        await supabase
            .from('leads')
            .update(updates)
            .eq('outlook_id', outlookId);
    } catch (e) {
        console.error('❌ Error updating lead status in Supabase:', e.message);
    }
}

// Get all leads from Supabase
async function getLeadsFromSupabase(limit = 100, source = null) {
    if (!supabase) return [];

    try {
        let query = supabase
            .from('leads')
            .select('*')
            .order('received_at', { ascending: false })
            .limit(limit);

        if (source && source !== 'all') {
            query = query.eq('source', source);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('❌ Error fetching leads from Supabase:', e.message);
        return [];
    }
}

module.exports = {
    initDatabase: () => Promise.resolve(),
    insertEmail,
    getAllEmails,
    getStats,
    getEmailById,
    getTrends,
    searchEmails,
    syncToSupabase,
    updateLeadStatus,
    getLeadsFromSupabase,
    supabase
};
