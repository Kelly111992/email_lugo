const https = require('https');

// URL del Webhook N8N
// Si tu URL es diferente, cámbiala aquí:
const WEBHOOK_URL = 'https://evolutionapi-n8n.ckoomq.easypanel.host/webhook/72f396a3-afb7-498c-8e13-a5510aafebe5';

const testLead = {
    firstName: "Lucha",
    lastName: "Villa (Test Nota)",
    email: "lucha.villa.test@example.com",
    phone: "5577665544",
    source: "Inmuebles24",
    message: "Quiero saber el enganche de la propiedad.",
    // Datos extra para la Nota
    propertyTitle: "Penthouse en Polanco",
    price: "$12,500,000 MXN",
    location: "Polanco, CDMX",
    url: "https://www.inmuebles24.com/propiedades/penthouse-polanco.html"
};

console.log('🚀 Enviando Lead de Prueba a N8N...');
console.log('Datos:', testLead);

const url = new URL(WEBHOOK_URL);
const options = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = https.request(url, options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(`\n✅ Respuesta del Servidor: ${res.statusCode}`);
        console.log('Cuerpo:', data);

        if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('\n✨ ¡ÉXITO! El lead debería aparecer en HubSpot en unos segundos.');
        } else {
            console.log('\n❌ Error: Algo falló en el envío.');
        }
    });
});

req.on('error', (e) => {
    console.error(`\n❌ Error de conexión: ${e.message}`);
});

req.write(JSON.stringify(testLead));
req.end();
