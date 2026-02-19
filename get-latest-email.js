const database = require('./database');

async function getLatestEmail() {
    try {
        await database.initDatabase();
        const emails = await database.getAllEmails(1); // Get just the latest 1
        console.log(JSON.stringify(emails[0], null, 2));
    } catch (error) {
        console.error(error);
    }
}

getLatestEmail();
