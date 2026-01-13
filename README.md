# Email Monitor App

Dashboard para monitorear correos desde n8n, clasificados por origen.

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
