const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'emails.db');

console.log('🧹 Iniciando limpieza de Base de Datos Corrupta...');

if (fs.existsSync(dbPath)) {
    try {
        // Renombrar en lugar de borrar por seguridad (backup)
        const backupPath = `${dbPath}.bak.${Date.now()}`;
        fs.renameSync(dbPath, backupPath);
        console.log(`✅ Base de datos corrupta movida a: ${backupPath}`);
        console.log('🚀 El sistema creará una base de datos nueva al reiniciar.');
    } catch (error) {
        console.error('❌ Error al mover la base de datos:', error.message);
        console.log('Intentando borrar directamente...');
        try {
            fs.unlinkSync(dbPath);
            console.log('✅ Base de datos borrada correctamente.');
        } catch (err) {
            console.error('❌ Fallo total al intentar borrar el archivo. ¿Está el disco lleno?', err.message);
        }
    }
} else {
    console.log('❓ No se encontró el archivo emails.db en este directorio.');
}

console.log('\n📌 PRÓXIMOS PASOS:');
console.log('1. Verifica el espacio en disco con el comando: df -h');
console.log('2. Reinicia el contenedor/app en Easypanel.');
