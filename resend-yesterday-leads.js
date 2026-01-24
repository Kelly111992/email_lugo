const https = require('https');

// Configuración de Evolution API
const EVOLUTION_CONFIG = {
    baseUrl: 'https://evolutionapi-evolution-api.ckoomq.easypanel.host',
    instanceName: 'lugo_email',
    apiKey: '429683C4C977415CAAFCCE10F7D57E11'
};

// Números de destino
const DESTINATION_NUMBERS = ['523318043673', '523312505239'];

// URL del servidor
const SERVER_URL = 'https://gmail-monitor-dashboard.ckoomq.easypanel.host';

// Función para obtener leads del servidor
function getLeadsFromServer() {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SERVER_URL}/api/emails?limit=200`);

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Función para enviar WhatsApp
function sendWhatsApp(message, number) {
    return new Promise((resolve) => {
        const url = new URL(`${EVOLUTION_CONFIG.baseUrl}/message/sendText/${EVOLUTION_CONFIG.instanceName}`);
        const postData = JSON.stringify({ number, text: message });

        const req = https.request({
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_CONFIG.apiKey,
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`   ➔ ${number}: ${res.statusCode === 201 ? '✅' : '❌ ' + res.statusCode}`);
                resolve(res.statusCode === 201);
            });
        });

        req.on('error', (e) => {
            console.log(`   ➔ ${number}: ❌ ${e.message}`);
            resolve(false);
        });
        req.write(postData);
        req.end();
    });
}

// Pausa
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Formatear mensaje
function formatMessage(lead, index, total) {
    const sourceNames = {
        'inmuebles24': 'Inmuebles24',
        'proppit': 'Proppit',
        'easybroker': 'EasyBroker',
        'vivanuncios': 'Vivanuncios',
        'mercadolibre': 'MercadoLibre',
        'otros': 'Otros'
    };

    const sourceEmojis = {
        'inmuebles24': '🏠',
        'proppit': '🏢',
        'easybroker': '🔑',
        'vivanuncios': '📢',
        'mercadolibre': '🛒',
        'otros': '📧'
    };

    const sourceName = sourceNames[lead.source] || lead.source;
    const emoji = sourceEmojis[lead.source] || '📧';

    // Extraer info del raw_data
    let clientName = lead.from_name || 'No detectado';
    let clientPhone = 'No detectado';
    let propertyCode = null;

    // Limpiar nombre
    if (clientName.includes('mediante')) {
        clientName = clientName.split('mediante')[0].trim();
    }

    // Buscar teléfono en body_preview
    const phoneMatch = (lead.body_preview || '').match(/\b(52\d{10}|\d{10})\b/);
    if (phoneMatch) {
        clientPhone = phoneMatch[1];
    }

    // Buscar código de propiedad
    const codeMatch = (lead.subject || '').match(/EB-[A-Z]{2}\d+/i);
    if (codeMatch) {
        propertyCode = codeMatch[0].toUpperCase();
    }

    // Formatear fecha
    const date = new Date(lead.received_at);
    const dateStr = date.toLocaleDateString('es-MX');
    const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });

    let msg = `📧 *LEAD RECUPERADO (${index}/${total})*
⚠️ _Desconexión de WhatsApp ayer_

${emoji} *Origen:* ${sourceName}
👤 *Nombre:* ${clientName}
📱 *Teléfono:* ${clientPhone}`;

    if (propertyCode) {
        msg += `\n🏷️ *Código:* ${propertyCode}`;
        msg += `\n🔗 https://linkinmobiliario.com.mx/search_text?search%5Btext%5D=${propertyCode}`;
    }

    msg += `\n\n📝 *Asunto:* ${(lead.subject || '').substring(0, 100)}
🕐 *Recibido:* ${dateStr} ${timeStr}`;

    return msg;
}

// Main
async function main() {
    console.log('📋 Obteniendo leads del servidor...\n');

    try {
        const leads = await getLeadsFromServer();

        // Filtrar leads del 23 de enero 2026
        const yesterdayLeads = leads.filter(lead => {
            const date = new Date(lead.received_at);
            return date.getFullYear() === 2026 &&
                date.getMonth() === 0 && // Enero
                date.getDate() === 23;
        });

        console.log(`📊 Total de leads en servidor: ${leads.length}`);
        console.log(`📅 Leads del 23 de enero: ${yesterdayLeads.length}\n`);

        if (yesterdayLeads.length === 0) {
            console.log('⚠️ No se encontraron leads del 23 de enero');

            // Mostrar las fechas disponibles
            const dates = [...new Set(leads.map(l => new Date(l.received_at).toLocaleDateString('es-MX')))];
            console.log('\nFechas disponibles en la base de datos:');
            dates.slice(0, 10).forEach(d => console.log(`  • ${d}`));
            return;
        }

        // Ordenar por fecha
        yesterdayLeads.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));

        console.log('═══════════════════════════════════════════════════════');
        console.log('LEADS A REENVIAR:');
        console.log('═══════════════════════════════════════════════════════');
        yesterdayLeads.forEach((lead, i) => {
            console.log(`${i + 1}. [${lead.source}] ${(lead.subject || '').substring(0, 50)}...`);
        });
        console.log('═══════════════════════════════════════════════════════\n');

        // Enviar mensaje inicial
        console.log('📤 Enviando mensaje de resumen...');
        const summaryMsg = `🔔 *REENVÍO DE LEADS PERDIDOS*
━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Ayer (23/01/2026) hubo desconexión de WhatsApp.
📊 Se encontraron *${yesterdayLeads.length} leads* que no llegaron.

A continuación recibirás cada uno...`;

        for (const num of DESTINATION_NUMBERS) {
            await sendWhatsApp(summaryMsg, num);
        }
        await sleep(3000);

        // Enviar cada lead
        for (let i = 0; i < yesterdayLeads.length; i++) {
            const lead = yesterdayLeads[i];
            console.log(`\n📤 Enviando lead ${i + 1}/${yesterdayLeads.length}: ${lead.source}`);

            const msg = formatMessage(lead, i + 1, yesterdayLeads.length);

            for (const num of DESTINATION_NUMBERS) {
                await sendWhatsApp(msg, num);
                await sleep(1500);
            }
            await sleep(2000);
        }

        // Mensaje final
        console.log('\n📤 Enviando mensaje de cierre...');
        await sleep(2000);

        const finalMsg = `✅ *REENVÍO COMPLETADO*
━━━━━━━━━━━━━━━━━━━━━━━

📊 Total leads recuperados: *${yesterdayLeads.length}*

Por favor contacten a estos clientes a la brevedad. 🙏`;

        for (const num of DESTINATION_NUMBERS) {
            await sendWhatsApp(finalMsg, num);
        }

        console.log(`\n✅ ¡Completado! Se reenviaron ${yesterdayLeads.length} leads.`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();
