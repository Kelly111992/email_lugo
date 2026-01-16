# Email Monitor App

Dashboard para monitorear correos desde n8n, clasificados por origen, con **notificaciones automáticas a WhatsApp**.

## ✨ Características

- 📊 Dashboard en tiempo real para visualizar correos
- 🏷️ Clasificación automática por origen
- 📱 **Notificaciones WhatsApp** via Evolution API cuando llega un correo nuevo
- 📈 Estadísticas por origen

## 📱 Notificaciones WhatsApp

Cuando llega un nuevo correo, automáticamente se envía una notificación a tu WhatsApp con:
- Origen del lead (Inmuebles24, Proppit, etc.)
- Nombre del cliente
- Email del cliente
- Teléfono (detección automática)
- Asunto y vista previa del mensaje

### Configuración de Evolution API

Variables de entorno (opcionales, ya configuradas por defecto):

```bash
EVOLUTION_API_URL=https://tu-evolution-api.com
EVOLUTION_INSTANCE=nombre_instancia
EVOLUTION_API_KEY=tu_api_key
WHATSAPP_DESTINATION=5218145520483
```

## Orígenes de correo soportados

- 🏠 **Inmuebles24** - `usuarios.inmuebles24.com`
- 🏢 **Proppit** - `@proppit.com`
- 🔑 **EasyBroker** - `@easybroker.com`
- 📢 **Vivanuncios** - `@vivanuncios.com.mx`
- 🛒 **MercadoLibre** - `@mercadolibre.com`

## Endpoints API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/emails` | Recibir correo desde n8n |
| GET | `/api/emails` | Listar todos los correos |
| GET | `/api/emails/:id` | Obtener correo específico |
| GET | `/api/stats` | Obtener estadísticas |
| GET | `/api/health` | Health check |

## Configuración en n8n

Después del **Microsoft Outlook Trigger**, agregar un nodo **HTTP Request**:

- **Method**: POST
- **URL**: `https://tu-dominio.com/api/emails`
- **Body Type**: JSON
- **Body**: `{{ $json }}`

## Desarrollo local

```bash
npm install
npm start
```

El servidor correrá en `http://localhost:3000`
