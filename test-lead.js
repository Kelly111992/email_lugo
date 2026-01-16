const https = require('https');

const postData = JSON.stringify({
    subject: '📩 ¡Recibiste una nueva consulta por el aviso Departamento en Renta! CÓD:EB-UZ4293 - REF:#483374204#',
    bodyPreview: '¡Hola, Link Inmobiliario GDL! Hay interesados que están haciendo consultas por el siguiente aviso...',
    from: {
        emailAddress: {
            name: 'Fabiola mediante Inmuebles24',
            address: 'fasanofab@usuarios.inmuebles24.com'
        }
    },
    body: {
        contentType: 'html',
        content: '<html><body>Nombre y apellido:</span> <span style="font-family:Arial;">Fabiola Sanchez</span> Teléfono:</span> <span style="font-family:Arial;">523322099199</span> E-mail:</span> <a href="mailto:fasanofab@gmail.com">fasanofab@gmail.com</a></body></html>'
    }
});

const req = https.request({
    hostname: 'gmail-monitor-dashboard.ckoomq.easypanel.host',
    path: '/api/emails',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
}, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Status:', res.statusCode, 'Response:', data));
});

req.on('error', e => console.log('Error:', e.message));
req.write(postData);
req.end();
