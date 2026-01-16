const https = require('https');

const postData = JSON.stringify({
    number: '523318043673',
    text: '🧪 Prueba de conexión - Si recibes este mensaje, Evolution API está funcionando correctamente.'
});

const req = https.request({
    hostname: 'evolutionapi-evolution-api.ckoomq.easypanel.host',
    path: '/message/sendText/lugo_email',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'apikey': '429683C4C977415CAAFCCE10F7D57E11'
    }
}, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
    });
});

req.on('error', e => console.log('Error:', e.message));
req.write(postData);
req.end();
