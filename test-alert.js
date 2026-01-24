// Test de alerta vía CLAVE.AI
const { sendWhatsAppAlert } = require('./evolution-monitor');

console.log('🧪 Probando envío de alerta vía CLAVE.AI...\n');

sendWhatsAppAlert('TEST_ALERT', {
    message: 'Esta es una alerta de PRUEBA del sistema de monitoreo'
}).then(result => {
    if (result.success) {
        console.log('\n✅ ¡Alerta de prueba enviada exitosamente!');
        console.log('   Deberías recibir un WhatsApp desde CLAVE.AI');
    } else {
        console.log('\n❌ Error al enviar alerta:', result.error);
    }
    process.exit(0);
});
