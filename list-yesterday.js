const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'emails.db');
const db = new sqlite3.Database(dbPath);

db.all(`SELECT id, source, subject, received_at FROM emails WHERE DATE(received_at) = '2026-01-23' ORDER BY received_at ASC`, (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 LEADS DE AYER (23 de enero 2026)');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Total: ${rows.length} leads\n`);

        rows.forEach((r, i) => {
            const time = r.received_at ? r.received_at.split(' ')[1] || '' : '';
            console.log(`${i + 1}. [${r.source.padEnd(12)}] ${(r.subject || '').substring(0, 55)}...`);
        });

        console.log('═══════════════════════════════════════════════════════');
    }
    db.close();
});
