require('dotenv').config();
const https = require('https');
const fs = require('fs');

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;

const options = {
    hostname: 'api.hubapi.com',
    path: '/crm/v3/objects/contacts?limit=15&properties=firstname,lastname,phone,email,createdate',
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const result = JSON.parse(data);
        const output = [];
        if (result.results) {
            result.results.forEach((c, i) => {
                const p = c.properties;
                output.push({
                    n: i + 1,
                    name: (p.firstname || '') + ' ' + (p.lastname || ''),
                    email: p.email || 'N/A',
                    phone: p.phone || 'N/A',
                    created: p.createdate || 'N/A',
                    today: (p.createdate || '').includes('2026-02-10')
                });
            });
        }
        fs.writeFileSync('hubspot-check.json', JSON.stringify(output, null, 2));
    });
});
req.on('error', e => fs.writeFileSync('hubspot-check.json', JSON.stringify({ error: e.message })));
req.end();
