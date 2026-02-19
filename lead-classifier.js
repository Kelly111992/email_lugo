// ============================================
// CLASIFICADOR INTELIGENTE DE LEADS
// ============================================
// Determina si un correo es un LEAD REAL (persona interesada en una propiedad)
// o un correo INFORMATIVO (newsletter, alertas, notificaciones del portal)

// Asuntos que indican correos informativos (NO son leads)
const INFORMATIONAL_SUBJECTS = [
    'nuevas propiedades en',
    'propiedades que te pueden interesar',
    'resumen de propiedades',
    'alerta de propiedades',
    'reporte semanal',
    'reporte diario',
    'boletín',
    'boletin',
    'newsletter',
    'tu resumen',
    'propiedades similares',
    'propiedades recomendadas',
    'novedades en tu zona',
    'actualización de precios',
    'actualizacion de precios',
    'propiedades destacadas',
    'recordatorio',
    'invitación a',
    'invitacion a',
    'tips para',
    'tendencias del mercado',
    'informe de mercado',
    'estadísticas',
    'estadisticas',
    'tu cuenta',
    'verifica tu',
    'confirma tu',
    'contraseña',
    'password',
    'suscripción',
    'suscripcion',
    'bienvenido a',
    'gracias por registrarte',
    'casas en venta en',
    'departamentos en venta en',
    'terrenos en venta en',
    'casas en renta en',
    'departamentos en renta en',
    'oficinas en renta en',
    'locales en',
    'nuevos inmuebles',
    'publicación actualizada',
    'publicacion actualizada',
    'tu publicación',
    'tu publicacion',
    'rendimiento de tu',
    'visitas a tu propiedad',
    'estadísticas de tu',
    'estadisticas de tu',
    'factura',
    'pago recibido',
    'recibo de pago',
    'plan de suscripción',
    'renovación',
    'renovacion',
];

// Asuntos que confirman que ES un lead real
const LEAD_SUBJECTS = [
    'nuevo contacto',
    'nueva consulta',
    'solicitud de información',
    'solicitud de informacion',
    'interesado en',
    'consulta sobre',
    'pregunta sobre',
    'quiero información',
    'quiero informacion',
    'me interesa',
    'contacto recibido',
    'lead recibido',
    'nuevo mensaje de',
    'te han contactado',
    'tienes un nuevo contacto',
    'alguien te contactó',
    'nuevo interesado',
    'solicitud recibida',
    'mensaje de contacto',
    'inquiry',
    'contact request',
    'enviado por:',
    'te ha enviado un mensaje',
];

// Nombres de remitente que indican correos informativos
const INFORMATIONAL_SENDERS = [
    'no-reply',
    'noreply',
    'no_reply',
    'newsletter',
    'alerts',
    'alertas',
    'info@',
    'marketing@',
    'comunicaciones@',
    'notificaciones@',
    'notifications@',
    'soporte@',
    'support@',
    'billing@',
    'facturacion@',
];

/**
 * Classifies an email as a real lead or informational
 * @param {Object} emailData - The full email data object
 * @param {string} source - The classified source (inmuebles24, proppit, etc.)
 * @returns {Object} { isLead: boolean, reason: string, confidence: string }
 */
function classifyAsLead(emailData, source) {
    const subject = (emailData.subject || '').toLowerCase();
    const fromAddress = (emailData.from?.emailAddress?.address || emailData.from?.address || '').toLowerCase();
    const fromName = (emailData.from?.emailAddress?.name || emailData.from?.name || '').toLowerCase();
    const bodyPreview = (emailData.bodyPreview || '').toLowerCase();
    const bodyContent = (emailData.body?.content || '').toLowerCase();
    const fullBody = bodyPreview + ' ' + bodyContent;

    let score = 0; // Positive = lead, Negative = informational
    const reasons = [];

    // --- CHECK 1: Subject patterns ---
    for (const pattern of INFORMATIONAL_SUBJECTS) {
        if (subject.includes(pattern)) {
            score -= 3;
            reasons.push(`Asunto informativo: "${pattern}"`);
            break;
        }
    }

    for (const pattern of LEAD_SUBJECTS) {
        if (subject.includes(pattern)) {
            score += 3;
            reasons.push(`Asunto de lead: "${pattern}"`);
            break;
        }
    }

    // --- CHECK 2: Sender patterns ---
    for (const pattern of INFORMATIONAL_SENDERS) {
        if (fromAddress.includes(pattern)) {
            score -= 1;
            reasons.push(`Remitente tipo informativo: "${pattern}"`);
            break;
        }
    }

    // --- CHECK 3: Does it have a real person's name? ---
    // Lead emails from portals usually have the client's name in the body
    const hasPersonName = /(?:nombre|name|cliente|contacto|interesado)[\s:]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/i.test(fullBody) ||
        /(?:enviado por|sent by|de parte de)[\s:]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/i.test(fullBody);
    if (hasPersonName) {
        score += 2;
        reasons.push('Contiene nombre de persona');
    }

    // --- CHECK 4: Does it have a phone number? ---
    const hasPhone = /(?:teléfono|telefono|tel|cel|celular|phone)[\s:]*[\+]?[\d\s\-\(\)]{10,}/i.test(fullBody) ||
        /\b(?:52)?\d{10}\b/.test(bodyPreview);
    if (hasPhone) {
        score += 2;
        reasons.push('Contiene número de teléfono');
    }

    // --- CHECK 5: Does it have a client email? ---
    const hasClientEmail = /(?:email|correo|e-mail)[\s:]+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(fullBody);
    if (hasClientEmail) {
        score += 1;
        reasons.push('Contiene email de cliente');
    }

    // --- CHECK 6: Does it have a property reference? ---
    const hasPropertyRef = /(?:EB-|MLS-|ID:?\s*\d|código|código de propiedad|property)/i.test(fullBody);
    if (hasPropertyRef) {
        score += 1;
        reasons.push('Referencia a propiedad específica');
    }

    // --- CHECK 7: "mediante" in sender name (portals use this for real leads) ---
    if (fromName.includes('mediante')) {
        score += 3;
        reasons.push('Remitente "mediante portal" = lead real');
    }

    // --- CHECK 8: EasyBroker specific - "Enviado por:" with actual client info ---
    if (source === 'easybroker') {
        if (/enviado por:/i.test(bodyPreview) && hasPersonName) {
            score += 2;
            reasons.push('EasyBroker: correo con datos de cliente');
        } else if (subject.includes('nuevas propiedades') || subject.includes('casas en')) {
            score -= 3;
            reasons.push('EasyBroker: alerta de propiedades (no lead)');
        }
    }

    // --- CHECK 9: "Nuevo Lead" from own system (ignore, it's an internal notification) ---
    if (subject.includes('nuevo lead') && fromAddress.includes('linkinmobiliario')) {
        score -= 5;
        reasons.push('Notificación interna del sistema');
    }

    // --- DETERMINE RESULT ---
    const isLead = score > 0;
    let confidence;
    if (Math.abs(score) >= 4) confidence = 'alta';
    else if (Math.abs(score) >= 2) confidence = 'media';
    else confidence = 'baja';

    const result = {
        isLead,
        score,
        confidence,
        reason: reasons.join(' | ') || (isLead ? 'Sin patrones claros, asumido como lead' : 'Sin indicadores de lead real'),
    };

    console.log(`🔍 Clasificación: ${isLead ? '✅ LEAD REAL' : '📰 INFORMATIVO'} (score: ${score}, confianza: ${confidence})`);
    console.log(`   Razones: ${result.reason}`);

    return result;
}

module.exports = { classifyAsLead };
