// ============================================
// SCRIPT DE RECUPERACIÓN MANUAL DE LEADS
// ============================================
// Usa cuando el monitor falla y necesitas re-enviar leads
// manualmente usando los datos visibles en los logs.
//
// USO: Agregar los emails al array LOST_EMAILS y ejecutar
//      node recover-manual.js
// ============================================

const https = require('https');

// URL del servidor
const SERVER_URL = process.env.SERVER_URL || 'https://gmail-monitor-dashboard.ckoomq.easypanel.host';

// Emails perdidos (extraídos de logs del servidor)
// Agrega aquí cada email que veas en los logs que no se procesó
const LOST_EMAILS = [
    {
        id: 'AAMkAGMxMTc2Y2IzLWZkYWEtNGJmYi05ZjliLTAyNGI2M2M3ZGM5ZgBGAAAAAADcnOR04Xz3Q6b6a-lk-T9nBwAjDVe-CkPSS5AaGBSURRnqAAAAAAEMAAAjDVe-CkPSS5AaGBSURRnqAAN5eiHCAAA=',
        receivedDateTime: '2026-02-10T20:15:57Z',
        subject: '📱 ¡Consultaron tu WhatsApp en el aviso Casa en Venta en Nueva Galicia, Tlajomulco! CÓD:EB-VE0977 - REF:#484447748#',
        bodyPreview: 'Hola, Link Inmobiliario GDL! Hay interesados que consultaron tu número de WhatsApp. Datos del interesado: Nombre: alma kazumi shiguematsu, Teléfono: 3311243622, Email: almakomikado@gmail.com. Casa en Venta MN 4,100,000 - Av. Nueva Galicia, Fraccionamiento Nueva Galicia Residencial, Tlajomulco de Zúñiga. 130 m2, 3 recámaras, 3 baños, 2 estacionamientos. Código de aviso: 148777185, Código del anunciante: EB-VE0977. Busca: Casa en Venta MXN 1,019,446 - MXN 1,050,000. Zonas: Vista Sur Residencial, Fraccionamiento Loreto, Parque industrial Bosque.',
        from: {
            emailAddress: {
                name: 'Kazumi mediante Inmuebles24',
                address: 'almakomikado2@usuarios.vivanuncios.com.mx'
            }
        },
        body: {
            contentType: 'text',
            content: 'Datos del interesado. Nombre y apellido: alma kazumi shiguematsu. Teléfono: 3311243622. E-mail: almakomikado@gmail.com. Casa en Venta MN 4,100,000 Av. Nueva Galicia Fraccionamiento Nueva Galicia Residencial, Tlajomulco de Zúñiga. 130 m2 3 recámaras 3 baños 2 estacionamientos. Código de aviso: 148777185. Código del anunciante: EB-VE0977. Contacto busca: Casa en Venta MXN 1,019,446 - MXN 1,050,000. Zonas de interés: Vista Sur Residencial, Fraccionamiento Loreto, Parque industrial Bosque.'
        }
    }
    // AGREGA MÁS EMAILS AQUÍ si ves más en los logs
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendToServer(emailData) {
    return new Promise((resolve) => {
        const url = new URL(SERVER_URL + '/api/emails');
        const postData = JSON.stringify(emailData);

        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000
        };

        const protocol = url.protocol === 'https:' ? https : require('http');

        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve({ success: res.statusCode < 300, statusCode: res.statusCode, data: result });
                } catch (e) {
                    resolve({ success: false, error: 'Parse error', raw: data });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });

        req.write(postData);
        req.end();
    });
}

(async () => {
    console.log('🔄 === RECUPERACIÓN MANUAL DE LEADS ===');
    console.log(`📊 Emails a recuperar: ${LOST_EMAILS.length}`);
    console.log(`🌐 Servidor: ${SERVER_URL}\n`);

    let processed = 0, failed = 0;

    for (const [index, email] of LOST_EMAILS.entries()) {
        console.log(`📨 [${index + 1}/${LOST_EMAILS.length}] ${email.subject.substring(0, 60)}...`);

        const result = await sendToServer(email);

        if (result.success) {
            processed++;
            console.log(`   ✅ Procesado: ${JSON.stringify(result.data).substring(0, 150)}`);
        } else {
            failed++;
            console.error(`   ❌ Error: ${result.error || JSON.stringify(result.data)}`);
        }

        // Pausa entre envíos
        if (index < LOST_EMAILS.length - 1) {
            console.log('   ⏳ Esperando 5 segundos...');
            await sleep(5000);
        }
    }

    console.log(`\n🏁 === RECUPERACIÓN COMPLETADA ===`);
    console.log(`   ✅ Procesados: ${processed}`);
    console.log(`   ❌ Fallidos: ${failed}`);
})();
