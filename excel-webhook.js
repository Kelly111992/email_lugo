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

    // 2. Búsqueda Global de Email (si no está mapeado)
    if (!mapped.Email) {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const foundEmail = allText.match(emailRegex);
        if (foundEmail) mapped.Email = foundEmail[0];
    }

    // 3. Búsqueda Global de Teléfono (especialmente si Numero tiene letras o el email)
    const phoneRegex = /(?:52|55|\+52)?\d{10,12}/;
    if (mapped.Numero === 'No especificado' || /[a-zA-Z]/.test(mapped.Numero) || (mapped.Email && mapped.Numero.includes(mapped.Email))) {
        // Buscar en todos los campos un valor que parezca teléfono
        for (const val of allValues) {
            if (val.length >= 10 && /^\d+$/.test(val.replace(/[+\s-]/g, ''))) {
                const clean = val.replace(/[+\s-]/g, '');
                if (clean.length >= 10) {
                    mapped.Numero = clean;
                    break;
                }
            }
        }
    }

    // 4. Búsqueda Global de Código de Propiedad (Pattern EB-XXX o CDV_XXX)
    const codePattern = /(?:EB-|CDV_)[A-Z0-9_]+/i;
    const foundCode = allText.match(codePattern);
    if (foundCode) mapped.Codigo = foundCode[0].toUpperCase();

    // 5. Búsqueda Global de Links (Instagram, EasyBroker, etc)
    const urlPattern = /https?:\/\/[^\s,]+/;
    const foundUrl = allText.match(urlPattern);
    if (foundUrl) mapped.LinkInteres = foundUrl[0];

    // 6. Limpieza y Re-asignación de Campos Colapsados
    if (mapped.Email) {
        if (mapped.Propiedad && mapped.Propiedad.includes(mapped.Email)) mapped.Propiedad = 'No especificada';
        if (mapped.Campaña && mapped.Campaña.includes(mapped.Email)) mapped.Campaña = 'N/A';
    }

    // 7. Lógica de Nombres / Plataforma Corregida
    const platforms = ['meta', 'facebook', 'instagram', 'google'];
    const nameLower = mapped.Nombre.toString().toLowerCase().trim();

    if (platforms.includes(nameLower)) {
        // Buscar un nombre real en el objeto (valor que tenga espacios y sea texto)
        for (const val of allValues) {
            if (val.length > 3 && val.includes(' ') && !val.includes('@') && !platforms.includes(val.toLowerCase()) && !/^\d+$/.test(val.replace(/\s/g, ''))) {
                mapped.Nombre = val;
                break;
            }
        }
        mapped.Plataforma = nameLower.charAt(0).toUpperCase() + nameLower.slice(1);
    }

    // 8. Enriquecer Propiedad con el Código si se encontró
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

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ LUX Excel encendido y listo en puerto ${PORT}`);
});

