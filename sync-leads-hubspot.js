require('dotenv').config();
const hubspot = require('./hubspot-integration');

const leads = [
    {
        firstName: 'Gina',
        lastName: '',
        email: 'Lozayasmine4@gmail.com',
        phone: '523123493627',
        source: 'Inmuebles24',
        message: `Lead Inmuebles24 - Depto en Renta en Av Niños Héroes y Federalismo, Mexicaltzingo
Código: EB-VE9734
Link EasyBroker: https://www.easybroker.com/mx/listings/departamento-en-renta-en-av-ninos-herores-y-federalismo-mexicaltzingo-departamento
Link Inmobiliario: https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=EB-VE9734&commit=Ir
Consultaron WhatsApp del aviso. Fecha: 10/02/2026 07:01 pm`
    },
    {
        firstName: 'Juan Miguel',
        lastName: 'Guerrero Rodríguez',
        email: 'leo_8_juan@hotmail.com',
        phone: '3317650673',
        source: 'Vivanuncios',
        message: `Lead Vivanuncios - Terreno Industrial en Venta, Santa Cruz de las Flores, Tlajomulco
Precio: MN $6,061,487 | 700 m²
Código: EB-VF7002
Link EasyBroker: https://www.easybroker.com/mx/listings/lote-en-venta-en-elite-circuito-metropolitano-ii-directo-a-puerto-de-manzanillo-santa-cruz-de-las-flores-terreno-industrial
Link Inmobiliario: https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=EB-VF7002&commit=Ir
Busca: Depto en Venta MXN 1.45M-5.85M en Americana, Zapopan, Santa Cruz del Valle, Moderna, Santa Fe
Vieron teléfono del aviso. Fecha: 10/02/2026 06:56 pm`
    },
    {
        firstName: 'John',
        lastName: '',
        email: 'John@opidesmx.co',
        phone: '528122770088',
        source: 'Inmuebles24',
        message: `Lead Inmuebles24 - Local en Renta en Solares, Tec de Monterrey
Código: EB-VF8059
Link EasyBroker: https://www.easybroker.com/mx/listings/local-en-renta-en-solares-tec-de-monterrey
Link Inmobiliario: https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=EB-VF8059&commit=Ir
Vieron teléfono del aviso. Fecha: 10/02/2026 06:56 pm`
    },
    {
        firstName: 'Leticia',
        lastName: '',
        email: 'habitathumanogdl@gmail.com',
        phone: '523333713191',
        source: 'Inmuebles24',
        message: `Lead Inmuebles24 - Departamento en Renta Lirica, Virreyes
Código: EB-VE9757
Link EasyBroker: https://www.easybroker.com/mx/listings/departamento-en-renta-lirica-virreyes-bd19d6d3-e392-416f-88cf-4f4e9a21584f
Link Inmobiliario: https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=EB-VE9757&commit=Ir
Consulta recibida por el aviso. Fecha: 10/02/2026 06:55 pm`
    },
    {
        firstName: 'Kazumi',
        lastName: '',
        email: 'almakomikado@gmail.com',
        phone: '3311243622',
        source: 'Vivanuncios',
        message: `Lead Vivanuncios - Departamento en Venta Ideal Para Inversión, Sur de GDL, Tlajomulco
Código: EB-VF6634
Link EasyBroker: https://www.easybroker.com/mx/listings/departamento-en-venta-ideal-para-inversion-sur-de-la-ciudad-de-gdl-tlajomulco-a06c50c1-9cac-4f3e-9eb0-30a2cc03994a
Link Inmobiliario: https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=EB-VF6634&commit=Ir
Consultaron WhatsApp del aviso. Fecha: 10/02/2026 06:55 pm`
    },
    {
        firstName: 'Alejandra',
        lastName: '',
        email: 'alejandra.arocha1603@gmail.com',
        phone: '523317019761',
        source: 'Inmuebles24',
        message: `Lead Inmuebles24 - Bodega en Renta Dentro de Parque Industrial en Tesistán, Santa Lucía
Código: EB-VF7976
Link EasyBroker: https://www.easybroker.com/mx/listings/bodega-en-renta-dentro-de-parque-industrial-en-tesistan-santa-lucia-9998fa3c-a92c-4dd0-a31c-1548a481c30a
Link Inmobiliario: https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=EB-VF7976&commit=Ir
Consultaron WhatsApp del aviso. Fecha: 10/02/2026 06:54 pm`
    },
    {
        firstName: 'Violeta',
        lastName: '',
        email: 'violetilla84.vo@gmail.com',
        phone: '+525526938023',
        source: 'EasyBroker',
        message: `Lead EasyBroker/Proppit by Lamudi - Departamento en Renta Mexicaltzingo
Código: EB-VE9734
Link EasyBroker: https://www.easybroker.com/mx/listings/departamento-en-renta-en-av-ninos-herores-y-federalismo-mexicaltzingo-departamento
Link Inmobiliario: https://www.linkinmobiliario.com.mx/search_text?search%5Btext%5D=EB-VE9734&commit=Ir
Solicitud desde Proppit by Lamudi. Fecha: 10/02/2026 09:06 am`
    }
];

async function syncAll() {
    console.log('🚀 === SYNC MANUAL DE 7 LEADS A HUBSPOT ===\n');
    console.log(`📅 Fecha: ${new Date().toLocaleString('es-MX')}`);
    console.log(`📊 Total leads: ${leads.length}\n`);

    let success = 0, errors = 0;

    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        console.log(`\n--- Lead ${i + 1}/${leads.length} ---`);
        console.log(`👤 ${lead.firstName} ${lead.lastName}`.trim());
        console.log(`📧 ${lead.email}`);
        console.log(`📱 ${lead.phone}`);
        console.log(`🏠 Fuente: ${lead.source}`);

        try {
            const result = await hubspot.processLead(lead);
            if (result) {
                success++;
                console.log(`✅ ENVIADO OK`);
            } else if (result === null) {
                console.log(`⏭️ IGNORADO (fuente no permitida)`);
            } else {
                errors++;
                console.log(`❌ FALLÓ`);
            }
        } catch (err) {
            errors++;
            console.error(`❌ ERROR: ${err.message}`);
        }

        // Pausa de 2s entre leads para no saturar la API
        if (i < leads.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\n\n🏁 === RESULTADO FINAL ===`);
    console.log(`✅ Enviados: ${success}`);
    console.log(`❌ Errores: ${errors}`);
    console.log(`📊 Total: ${leads.length}`);
}

syncAll().catch(err => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});
