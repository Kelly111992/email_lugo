require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const https = require('https');
const { NOTIFICATION_CONFIG } = require('./gestores');

const app = express();
app.use(bodyParser.json());

// CONFIGURACIÓN CENTRALIZADA
const EVOLUTION_API_URL = 'https://evolutionapi-evolution-api.ckoomq.easypanel.host';
const EVOLUTION_INSTANCE = 'lugo_email';
const EVOLUTION_API_KEY = '429683C4C977415CAAFCCE10F7D57E11';
const GESTORES = NOTIFICATION_CONFIG.whatsapp_numbers;

/**
 * Lógica de Mapeo Inteligente para corregir leads de Meta/Excel
 */
function smartMapping(data) {
    const mapped = {
        Nombre: data.Nombre || 'No disponible',
        Numero: data.Numero || 'No especificado',
        Propiedad: data.Propiedad || 'No especificada',
        Campaña: data.Campaña || 'N/A',
        Plataforma: data.Plataforma || 'N/A',
        Comentarios: data.Comentarios || data.Mensaje || data.Observaciones || 'Sin comentarios'
    };

    // Detectar si el nombre es en realidad la plataforma ("Meta")
    const platforms = ['meta', 'facebook', 'instagram', 'google'];
    const nameLower = mapped.Nombre.toString().toLowerCase().trim();

    if (platforms.includes(nameLower)) {
        // Si el "Número" contiene letras, es probablemente el NOMBRE REAL
        if (/[a-zA-Z]/.test(mapped.Numero)) {
            const tempName = mapped.Nombre;
            mapped.Nombre = mapped.Numero;
            mapped.Plataforma = tempName.charAt(0).toUpperCase() + tempName.slice(1);
            mapped.Numero = 'No especificado';
        }
    }

    // Verificar si el teléfono viene en otro campo por error
    const fieldsToSearch = [data.Phone, data.Telefono, data.WhatsApp, data.tel, data.cel];
    for (const val of fieldsToSearch) {
        if (val && /^[0-9+\s-]{8,}$/.test(val)) {
            mapped.Numero = val;
            break;
        }
    }

    return mapped;
}

// FUNCIÓN: Enviar WhatsApp Pro
async function sendWhatsApp(number, text) {
    if (!number) return;
    const cleanNumber = number.toString().replace(/[^\d+]/g, '');
    return new Promise((resolve) => {
        const urlObj = new URL(EVOLUTION_API_URL);
        const body = JSON.stringify({ number: cleanNumber, text });
        const options = {
            hostname: urlObj.hostname,
            path: `/message/sendText/${EVOLUTION_INSTANCE}`,
            method: 'POST',
            port: urlObj.port || 443,
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY,
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(options, res => {
            res.on('data', () => { }); // Consumir respuesta
            res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', (e) => {
            console.error(`Error WA: ${e.message}`);
            resolve(500);
        });
        req.write(body); req.end();
    });
}

// ENDPOINT PRINCIPAL (Específico para Excel)
app.post('/webhook/excel-lead', async (req, res) => {
    try {
        const rawData = req.body;
        const data = smartMapping(rawData);

        console.log(`\n🚀 NUEVO LEAD RECIBIDO (${data.Plataforma}): ${data.Nombre} (${data.Numero})`);

        const message = `🏠 *NUEVO LEAD DESDE EXCEL* 🏠
━━━━━━━━━━━━━━━━━━━━━━━
👤 *Nombre:* ${data.Nombre}
📱 *Teléfono:* ${data.Numero}
🏠 *Propiedad:* ${data.Propiedad}
🎯 *Campaña:* ${data.Campaña}
🏗️ *Plataforma:* ${data.Plataforma}
💬 *Comentarios:* ${data.Comentarios}
━━━━━━━━━━━━━━━━━━━━━━━
⚠️ _Origen: Sincronización Directa Google Sheets_`;

        // Notificar a todos los gestores en paralelo para máxima velocidad
        const promises = GESTORES.map(num => sendWhatsApp(num, message));
        await Promise.all(promises);

        res.status(200).json({ success: true, message: 'Notificaciones enviadas con éxito', mapped: data });
    } catch (error) {
        console.error('❌ Error procesando lead de Excel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ LUX Excel encendido y listo en puerto ${PORT}`);
});

