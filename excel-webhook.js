require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const https = require('https');
const { NOTIFICATION_CONFIG } = require('./gestores');

const app = express();
app.use(bodyParser.json());

// CONFIGURACIÓN CENTRALIZADA
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const GESTORES = NOTIFICATION_CONFIG.whatsapp_numbers;

/**
 * Lógica de Mapeo Inteligente para corregir leads de Meta/Excel
 */
function smartMapping(data) {
    // 1. Recolectar TODOS los valores de texto para búsqueda global
    const allValues = Object.values(data).map(v => (v || '').toString().trim());
    const allText = allValues.join(' ');

    const mapped = {
        Nombre: data.Nombre || data.Name || data.name || 'No disponible',
        Numero: data.Numero || data.Telefono || data.Phone || data.phone || data.tel || data.cel || 'No especificado',
        Propiedad: data.Propiedad || data.Property || data.propiedad || 'No especificada',
        Campaña: data.Campaña || data.Campaign || data.campaign || 'N/A',
        Plataforma: data.Plataforma || data.Source || data.source || 'N/A',
        Comentarios: data.Comentarios || data.Mensaje || data.Observaciones || data.message || 'Sin comentarios',
        Email: data.Email || data.EmailAddress || data.correo || data.Correo || null,
        Codigo: null,
        LinkInteres: null
    };

    // 2. Extraer Email si no existe
    if (!mapped.Email) {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const foundEmail = allText.match(emailRegex);
        if (foundEmail) mapped.Email = foundEmail[0];
    }

    // 3. IDENTIFICAR NOMBRE REAL (Si viene cruzado con Meta)
    const platforms = ['meta', 'facebook', 'instagram', 'google'];
    const nameLower = mapped.Nombre.toString().toLowerCase().trim();

    // Si el nombre es una plataforma O contiene el email O contiene números
    if (platforms.includes(nameLower) || (mapped.Email && mapped.Nombre.includes(mapped.Email)) || /^\d+$/.test(mapped.Nombre.replace(/[+\s-]/g, ''))) {
        // Buscar un nombre real en todos los valores recibidos
        for (const val of allValues) {
            // Un nombre real suele tener espacios, no tiene @, no es una plataforma y tiene letras
            if (val.length > 3 && val.includes(' ') && !val.includes('@') && !platforms.includes(val.toLowerCase()) && /[a-zA-Z]/.test(val)) {
                mapped.Nombre = val;
                break;
            }
        }
    }

    // 4. IDENTIFICAR TELÉFONO REAL (Limpieza exhaustiva)
    if (mapped.Numero === 'No especificado' || /[a-zA-Z]/.test(mapped.Numero) || (mapped.Email && mapped.Numero.includes(mapped.Email))) {
        for (const val of allValues) {
            const clean = val.replace(/[^\d]/g, '');
            if (clean.length >= 10 && clean.length <= 13) {
                mapped.Numero = clean;
                break;
            }
        }
    }

    // 5. Búsqueda de Código y Link
    const codePattern = /(?:EB-|CDV_)[A-Z0-9_]+/i;
    const foundCode = allText.match(codePattern);
    if (foundCode) mapped.Codigo = foundCode[0].toUpperCase();

    const urlPattern = /https?:\/\/[^\s,]+/;
    const foundUrl = allText.match(urlPattern);
    if (foundUrl) mapped.LinkInteres = foundUrl[0];

    // 6. Limpieza final de campos colapsados
    if (mapped.Email) {
        if (mapped.Propiedad && mapped.Propiedad.includes(mapped.Email)) mapped.Propiedad = 'No especificada';
        if (mapped.Campaña && mapped.Campaña.includes(mapped.Email)) mapped.Campaña = 'N/A';
    }

    // Enriquecer plataforma si el nombre original era una plataforma
    if (platforms.includes(nameLower)) {
        mapped.Plataforma = nameLower.charAt(0).toUpperCase() + nameLower.slice(1);
    }

    if (mapped.Codigo && (mapped.Propiedad === 'No especificada' || mapped.Propiedad === 'N/A')) {
        mapped.Propiedad = `Código ${mapped.Codigo}`;
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
🔗 *Link:* ${data.LinkInteres || 'N/A'}
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RECEPTOR LUX v3.2 LISTO en puerto ${PORT}`);
});

