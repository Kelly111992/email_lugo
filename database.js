const { createClient } = require('@supabase/supabase-js');

// ============================================
// CONFIGURACIÓN DE SUPABASE
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gmail-monitor-supabase.ckoomq.easypanel.host';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Clasificar correo por dominio
function classifyEmail(fromAddress) {
    const address = fromAddress.toLowerCase();

    if (address.includes('arkelly147@gmail.com')) {
        return 'personal';
    } else if (address.includes('usuarios.inmuebles24.com')) {
        return 'inmuebles24';
    } else if (address.includes('solicitudes@proppit.com') || address.includes('@proppit.com')) {
        return 'proppit';
    } else if (address.includes('inbox.easybroker.com') || address.includes('@easybroker.com')) {
        return 'easybroker';
    } else if (address.includes('usuarios.vivanuncios.com.mx') || address.includes('@vivanuncios.com')) {
        return 'vivanuncios';
    } else if (address.includes('no-responder@mercadolibre.com') || address.includes('@mercadolibre.com')) {
        return 'mercadolibre';
    }

    return 'otros';
}

// Inicializar (en Supabase no es estrictamente necesario crear la tabla aquí si ya se creó en el panel)
async function initDatabase() {
    console.log('✅ Supabase conectado');
    return true;
}

// Insertar un nuevo correo
async function insertEmail(emailData) {
    const fromAddress = emailData.from?.emailAddress?.address ||
        emailData.from?.address ||
        emailData.from ||
        'unknown';

    const fromName = emailData.from?.emailAddress?.name ||
        emailData.from?.name ||
        '';

    const source = classifyEmail(fromAddress);

    const { data, error } = await supabase
        .from('emails')
        .insert([
            {
                from_address: fromAddress,
                from_name: fromName,
                subject: emailData.subject || '(Sin asunto)',
                body_preview: emailData.bodyPreview || emailData.body?.content || '',
                source: source,
                raw_data: emailData
            }
        ])
        .select();

    if (error) {
        console.error('❌ Error al insertar en Supabase:', error);
        throw error;
    }

    return {
        id: data[0].id,
        source: source
    };
}

// Obtener todos los correos
async function getAllEmails(limit = 100, source = null) {
    let query = supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(limit);

    if (source && source !== 'all') {
        query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) {
        console.error('❌ Error al obtener correos de Supabase:', error);
        return [];
    }

    return data;
}

// Obtener estadísticas
async function getStats() {
    const { data, error } = await supabase
        .from('emails')
        .select('source');

    if (error) {
        console.error('❌ Error al obtener estadísticas:', error);
        return { total: 0, personal: 0, inmuebles24: 0, proppit: 0, easybroker: 0, vivanuncios: 0, mercadolibre: 0, otros: 0 };
    }

    const stats = {
        total: data.length,
        personal: 0,
        inmuebles24: 0,
        proppit: 0,
        easybroker: 0,
        vivanuncios: 0,
        mercadolibre: 0,
        otros: 0
    };

    data.forEach(row => {
        if (stats[row.source] !== undefined) {
            stats[row.source]++;
        } else {
            stats.otros++;
        }
    });

    return stats;
}

// Obtener un correo por ID
async function getEmailById(id) {
    const { data, error } = await supabase
        .from('emails')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('❌ Error al obtener correo:', error);
        return null;
    }

    return data;
}

module.exports = {
    initDatabase,
    insertEmail,
    getAllEmails,
    getStats,
    getEmailById,
    classifyEmail
};
