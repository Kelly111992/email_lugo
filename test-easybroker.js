const https = require('https');

// Simular correo de EasyBroker con el formato real que vimos
const postData = JSON.stringify({
    subject: 'Solicitud desde Inmuebles24: EB-VA3941 Casa en Valle Real (#IN14329055)',
    bodyPreview: `Vió teléfono \n \n Enviado por: \n alex \n alex.mrcd@outlook.com \n 523331457865 \n \n Responder \n \n Casa en renta en Valle Real \n Casa en Valle Real, Zapopan \n 4 recs. 4 baños 400 m² de constr. \n $ 75,000 MXN En Renta \n EasyBroker.`,
    from: {
        emailAddress: {
            name: 'EasyBroker Leads',
            address: 'reinier@inbox.easybroker.com'
        }
    },
    body: {
        contentType: 'text',
        content: ''
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
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
    });
});

req.on('error', e => console.log('Error:', e.message));
req.write(postData);
req.end();
