const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const whatsapp = require('./whatsapp');

const dbPath = path.join(__dirname, 'emails.db');
const db = new sqlite3.Database(dbPath);

console.log('--- Starting Real Flow Test ---');

db.get("SELECT * FROM emails ORDER BY id DESC LIMIT 1", async (err, row) => {
    if (err) {
        console.error('❌ Error reading DB:', err);
        return;
    }

    if (!row) {
        console.error('❌ No emails found in DB.');
        return;
    }

    try {
        console.log(`📋 Found email ID: ${row.id} from ${row.from_address}`);
        const emailData = JSON.parse(row.raw_data);
        const source = row.source || 'otros';

        console.log('🚀 Processing notification...');
        const result = await whatsapp.notifyNewEmail(emailData, source);

        console.log('--- Test Finished ---');
        console.log('Result:', JSON.stringify(result, null, 2));

    } catch (parseError) {
        console.error('❌ Error parsing raw_data:', parseError);
    } finally {
        db.close();
    }
});
