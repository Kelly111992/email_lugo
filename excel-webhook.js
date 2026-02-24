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
        Nombre: data.Nombre || data.Name || data.name || 'No disponible',
        Numero: data.Numero || data.Telefono || data.Phone || data.phone || data.tel || data.cel || 'No especificado',
        Propiedad: data.Propiedad || data.Property || data.propiedad || 'No especificada',
        Campaña: data.Campaña || data.Campaign || data.campaign || 'N/A',
        Plataforma: data.Plataforma || data.Source || data.source || 'N/A',
        Comentarios: data.Comentarios || data.Mensaje || data.Observaciones || data.message || 'Sin comentarios',
        Email: data.Email || data.EmailAddress || data.correo || data.Correo || null
    };

    // 1. Extraer Email de cualquier campo si no lo tenemos
    if (!mapped.Email) {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        for (const key in data) {
            const val = data[key];
            if (typeof val === 'string' && emailRegex.test(val)) {
                mapped.Email = val.match(emailRegex)[0];
                break;
            }
        }
    }

    // 2. Limpiar Propiedad y Campaña si contienen el email (error común de n8n)
    if (mapped.Email) {
        if (mapped.Propiedad && mapped.Propiedad.includes(mapped.Email)) mapped.Propiedad = 'No especificada';
        if (mapped.Campaña && mapped.Campaña.includes(mapped.Email)) mapped.Campaña = 'N/A';
        // Si el número es el email, ponerlo como no especificado
        if (mapped.Numero && mapped.Numero.includes(mapped.Email)) mapped.Numero = 'No especificado';
    }

    // 3. Detectar si el nombre es en realidad la plataforma ("Meta")
    const platforms = ['meta', 'facebook', 'instagram', 'google'];
    const nameLower = mapped.Nombre.toString().toLowerCase().trim();

    if (platforms.includes(nameLower)) {
        // Si el "Número" tiene letras, es probablemente el NOMBRE REAL
        if (/[a-zA-Z]/.test(mapped.Numero) && !mapped.Numero.includes('@')) {
            const tempName = mapped.Nombre;
            mapped.Nombre = mapped.Numero;
            mapped.Plataforma = tempName.charAt(0).toUpperCase() + tempName.slice(1);
            mapped.Numero = 'No especificado';
        }
    }

    // 4. Intentar rescatar el número de otros campos si no lo tenemos bien
    if (mapped.Numero === 'No especificado' || /[a-zA-Z]/.test(mapped.Numero)) {
        const fieldsToSearch = [data.Phone, data.Telefono, data.WhatsApp, data.tel, data.cel, data.numero];
        for (const val of fieldsToSearch) {
            if (val && /^[0-9+\s-]{8,}$/.test(val)) {
                mapped.Numero = val.toString().trim();
                break;
            }
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
📧 *Email:* ${data.Email || 'No disponible'}
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

