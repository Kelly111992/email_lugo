// ============================================
// CONFIGURACIÓN DE GESTORES DE COMPRA
// ============================================
const GESTORES = {
    'Nohemí Contreras': { nombre: 'Nohemí Contreras', telefono: '523310412758', email: 'ccnojemi@gmail.com' },
    'Reinier Lugo': { nombre: 'Reinier Lugo', telefono: '523318043673', email: 'Rlugo@linkinmobiliario.com.mx' },
    'Anet Torres': { nombre: 'Anet Torres', telefono: '523325618369', email: 'ajazmin-tc@gmail.com' },
    'Christian Santana Nuñez': { nombre: 'Christian Santana Nuñez', telefono: '523339486834', email: 'lae.christians@hotmail.com' },
    'Lídice Ocaña': { nombre: 'Lídice Ocaña', telefono: '523320841481', email: 'Lidice@linkinmobiliario.com.mx' },
    'Meredith Velázquez': { nombre: 'Meredith Velázquez', telefono: '523121267668', email: null }
};

const NOTIFICATION_CONFIG = {
    whatsapp_numbers: process.env.WHATSAPP_DESTINATION
        ? process.env.WHATSAPP_DESTINATION.split(',')
        : ['523318043673', '523312505239', '523318213624'],
    email_recipients: process.env.EMAIL_RECIPIENTS
        ? process.env.EMAIL_RECIPIENTS.split(',').map(e => { const [name, email] = e.split(':'); return { name: name || 'Destinatario', email }; })
        : [
            { name: 'Administración', email: 'administracion@linkinmobiliario.com.mx' },
            { name: 'Reinier Personal', email: 'rlugo@linkinmobiliario.com.mx' },
            { name: 'Arkelly', email: 'arkelly147@gmail.com' }
        ]
};

function findGestorByName(agentName) {
    if (!agentName) return null;
    if (GESTORES[agentName]) return GESTORES[agentName];
    const agentNameLower = agentName.toLowerCase().trim();
    for (const [key, gestor] of Object.entries(GESTORES)) {
        if (key.toLowerCase().includes(agentNameLower) || agentNameLower.includes(key.toLowerCase())) return gestor;
    }
    return null;
}

function getAdminContacts() { return []; }
function getAllGestores() { return GESTORES; }

module.exports = { GESTORES, ADMIN_CONTACTS: [], NOTIFICATION_CONFIG, findGestorByName, getAdminContacts, getAllGestores };
