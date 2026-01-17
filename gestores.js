// ============================================
// CONFIGURACIÓN DE GESTORES DE COMPRA
// ============================================
// Cada gestor está asociado a propiedades en EasyBroker
// El nombre debe coincidir EXACTAMENTE con el campo agent.name de EasyBroker

const GESTORES = {
    'Nohemí Contreras': {
        nombre: 'Nohemí Contreras',
        telefono: '523310412758',
        email: 'ccnojemi@gmail.com'
    },
    'Reinier Lugo': {
        nombre: 'Reinier Lugo',
        telefono: '523318043673',
        email: 'Rlugo@linkinmobiliario.com.mx'
    },
    'Anet Torres': {
        nombre: 'Anet Torres',
        telefono: '523325618369',
        email: 'ajazmin-tc@gmail.com'
    },
    'Christian Santana Nuñez': {
        nombre: 'Christian Santana Nuñez',
        telefono: '523339486834',
        email: 'lae.christians@hotmail.com'
    },
    'Lídice Ocaña': {
        nombre: 'Lídice Ocaña',
        telefono: '523320841481',
        email: 'Lidice@linkinmobiliario.com.mx'
    },
    'Meredith Velázquez': {
        nombre: 'Meredith Velázquez',
        telefono: '523121267668',
        email: null // No se proporcionó email
    }
};

// Configuración separada para evitar duplicidad de envíos
const NOTIFICATION_CONFIG = {
    whatsapp_numbers: [
        '523318043673', // Reinier
        '523312505239', // Nohemí
        '523318213624'  // Monitor/Soporte
    ],
    email_recipients: [
        { name: 'Administración', email: 'administracion@linkinmobiliario.com.mx' },
        { name: 'Soporte', email: 'arkelly147@gmail.com' },
        { name: 'Reinier Personal', email: 'rlugo@linkinmobiliario.com.mx' }
    ]
};

// Mantenemos la función original para compatibilidad, pero ahora usa la nueva config
function getAdminContacts() {
    // Esta función se usaba para devolver una lista mixta. 
    // Para no romper whatsapp.js, vamos a devolver una estructura que whatsapp.js pueda entender,
    // o mejor aun, actualizaremos whatsapp.js para leer esta nueva estructura.
    // Por ahora, devolvemos NULL aquí y exportamos la nueva config.
    return [];
}

// ============================================
// FUNCIONES PARA BUSCAR GESTORES
// ============================================

/**
 * Busca un gestor por nombre (coincidencia exacta o parcial)
 * @param {string} agentName - Nombre del agente desde EasyBroker
 * @returns {Object|null} - Datos del gestor o null si no se encuentra
 */
function findGestorByName(agentName) {
    if (!agentName) return null;

    // Primero buscar coincidencia exacta
    if (GESTORES[agentName]) {
        return GESTORES[agentName];
    }

    // Buscar coincidencia parcial (por si hay variaciones menores)
    const agentNameLower = agentName.toLowerCase().trim();
    for (const [key, gestor] of Object.entries(GESTORES)) {
        if (key.toLowerCase().includes(agentNameLower) ||
            agentNameLower.includes(key.toLowerCase())) {
            return gestor;
        }
    }

    // Buscar por nombre de pila
    const firstName = agentName.split(' ')[0].toLowerCase();
    for (const [key, gestor] of Object.entries(GESTORES)) {
        const gestorFirstName = key.split(' ')[0].toLowerCase();
        if (firstName === gestorFirstName) {
            return gestor;
        }
    }

    return null;
}

/**
 * Obtiene los contactos de administrador de respaldo
 * @returns {Array} - Lista de contactos de respaldo
 */
function getAdminContacts() {
    return ADMIN_CONTACTS;
}

/**
 * Obtiene todos los gestores
 * @returns {Object} - Objeto con todos los gestores
 */
function getAllGestores() {
    return GESTORES;
}

module.exports = {
    GESTORES,
    ADMIN_CONTACTS: [], // Deprecado, mantenido por compatibilidad si algo externo lo llama
    NOTIFICATION_CONFIG,
    findGestorByName,
    getAdminContacts,
    getAllGestores
};
