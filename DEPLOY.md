# Guía de Despliegue (Actualización del Bot)

Para aplicar los últimos cambios (formato de leads corregido en HubSpot y base de datos persistente), sigue estos pasos en tu servidor VPS.

## 1. Conectarse al Servidor
Ingresa a tu terminal (o consola del proveedor) y conéctate vía SSH:
```bash
ssh usuario@tu-ip-servidor
```

## 2. Actualizar el Código
Navega a la carpeta donde está clonado el proyecto (ejemplo: `email_lugo` o `ProyectoLugoCorreo`) y descarga la última versión desde GitHub:

```bash
cd nombre_de_la_carpeta_del_proyecto
git pull origin main
```
*(Si te pide credenciales y no las tienes configuradas, contacta a tu administrador).*

## 3. Reconstruir y Reiniciar los Contenedores
Es **crucial** reconstruir la imagen para que el nuevo código (`server.js`, `whatsapp.js`) se copie dentro del contenedor:

```bash
docker-compose up -d --build
```

## 4. Verificar
Puedes ver los logs para asegurarte de que todo arrancó bien:
```bash
docker-compose logs -f --tail=50
```

---
**Nota Importante:**
Los leads anteriores a esta actualización seguirán con el formato antiguo. Solo los **nuevos** leads que lleguen después de este reinicio tendrán la información completa en HubSpot.
