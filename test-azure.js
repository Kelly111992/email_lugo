require('dotenv').config();
const outlookMonitor = require('./outlook-monitor');

async function testAzure() {
    console.log('🔐 === TEST DE CONEXIÓN AZURE/OUTLOOK ===\n');

    // 1. Verificar credenciales
    console.log('1️⃣ Verificando credenciales...');
    const status = outlookMonitor.getMonitorStatus();
    console.log(`   AZURE_TENANT_ID: ${process.env.AZURE_TENANT_ID ? '✅ ' + process.env.AZURE_TENANT_ID.substring(0, 8) + '...' : '❌ FALTA'}`);
    console.log(`   AZURE_CLIENT_ID: ${process.env.AZURE_CLIENT_ID ? '✅ ' + process.env.AZURE_CLIENT_ID.substring(0, 8) + '...' : '❌ FALTA'}`);
    console.log(`   AZURE_CLIENT_SECRET: ${process.env.AZURE_CLIENT_SECRET ? '✅ (configurado)' : '❌ FALTA'}`);
    console.log(`   OUTLOOK_USER_ID: ${process.env.OUTLOOK_USER_ID ? '✅ ' + process.env.OUTLOOK_USER_ID : '❌ FALTA'}`);
    console.log(`   hasCredentials: ${status.hasCredentials}`);

    if (!status.hasCredentials) {
        console.log('\n❌ Faltan credenciales. No se puede continuar.');
        return;
    }

    // 2. Obtener token
    console.log('\n2️⃣ Obteniendo token de Azure...');
    try {
        const token = await outlookMonitor.getAccessToken();
        if (token) {
            console.log(`   ✅ Token obtenido: ${token.substring(0, 20)}...`);
        } else {
            console.log('   ❌ No se pudo obtener token');
            return;
        }
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
        return;
    }

    // 3. Test de conexión completo
    console.log('\n3️⃣ Probando conexión a Outlook...');
    try {
        const result = await outlookMonitor.testConnection();
        console.log(`   Resultado: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
        return;
    }

    // 4. Intentar leer correos recientes
    console.log('\n4️⃣ Leyendo correos recientes...');
    try {
        const emails = await outlookMonitor.fetchNewEmails();
        console.log(`   📬 Correos encontrados: ${emails.length}`);
        if (emails.length > 0) {
            emails.slice(0, 3).forEach((e, i) => {
                console.log(`   ${i + 1}. "${e.subject}" - De: ${e.from?.emailAddress?.address || 'N/A'}`);
            });
        }
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
    }

    console.log('\n🏁 === TEST COMPLETADO ===');
}

testAzure().catch(err => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});
