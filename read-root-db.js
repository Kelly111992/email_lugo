const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'emails.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.all("SELECT * FROM emails ORDER BY id DESC LIMIT 1", (err, rows) => {
        if (err) {
            console.error('Error:', err);
        } else {
            if (rows.length > 0) {
                const email = rows[0];
                console.log(JSON.stringify(email, null, 2));
            } else {
                console.log('No emails found in root DB.');
            }
        }
        db.close();
    });
});
