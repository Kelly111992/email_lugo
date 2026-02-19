const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(process.cwd(), 'emails.db');
console.log('📖 Leyendo base de datos:', dbPath);

const db = new sqlite3.Database(dbPath);

db.all('SELECT * FROM emails ORDER BY id DESC LIMIT 20', [], (err, rows) => {
    if (err) {
        console.error('❌ Error:', err.message);
        return;
    }

    if (rows.length === 0) {
        console.log('📭 La base de datos está vacía.');
    } else {
        console.log(`✅ Se encontraron ${rows.length} registros.`);
        rows.forEach(row => {
            console.log(`[${row.id}] ${row.received_at} - ${row.from_name} <${row.from_address}>`);
            console.log(`    Asunto: ${row.subject}`);
        });
    }
    db.close();
});
