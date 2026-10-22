# God Diamonds — Node.js + MySQL

## Qué incluye
- Catálogo editable en `server.js`.
- API de validación de nickname configurable.
- Creación de pedido y llamada inicial al endpoint de órdenes de Culqi.
- WebSocket para actualizar la sala de espera.
- Webhook con control de eventos duplicados.
- Notificación a Sack mediante WhatsApp Cloud API.
- Panel de Sack con sesión, login y botón de entrega.
- Esquema MySQL.

## Requisitos
Ubuntu Server, Node.js 20+, MySQL 8+, dominio con HTTPS y una cuenta de comercio Culqi habilitada para el método de pago elegido.

## Instalación local/VPS
1. Sube la carpeta al VPS y entra en ella.
2. Instala dependencias:
   `npm install`
3. Crea la base y tablas:
   `mysql -u root -p < schema.sql`
4. Crea usuario MySQL con permisos solo sobre `god_diamonds`; coloca esos datos en `.env`.
5. Copia `.env.example` a `.env` y configura todas las variables. No subas `.env` a Git.
6. Genera el hash de contraseña de Sack:
   `node -e "require('bcrypt').hash('TU_CLAVE_LARGA',12).then(console.log)"`
   Copia el resultado a `SACK_PANEL_PASSWORD_HASH`. Cambia `SACK_PANEL_USER` si corresponde.
7. Configura Culqi en entorno de prueba. La API de Órdenes de Pago para billeteras puede entregar QR, pero la URL/campos exactos deben coincidir con el producto habilitado en tu cuenta y la documentación actual. No asumas que la respuesta contiene `qr` ni que Yape/Plin están activos.
8. Configura el endpoint público HTTPS `https://tudominio.pe/webhooks/culqi` en el panel Culqi, con el evento correcto para órdenes de billeteras (la documentación actual menciona `order.status.changed`). Implementa y prueba la validación/autenticidad oficial del webhook para tu cuenta antes de producción.
9. Configura `NICK_API_URL` con un proveedor autorizado de validación de ID. La API espera un JSON con `nickname` o `nick`. No se simula la validación.
10. Configura WhatsApp Cloud API: token, ID del número y número de Sack en formato internacional sin `+`. La plantilla y la ventana de mensajería de WhatsApp pueden requerir configuración según el tipo de mensaje.
11. Ejecuta `npm start`. Abre `/` para la tienda y `/sack.html` para el panel.

## 24/7 en Ubuntu con PM2
Instala PM2:
`sudo npm install -g pm2`
Desde la carpeta del proyecto:
`pm2 start server.js --name god-diamonds`
`pm2 save`
`pm2 startup`
Ejecuta el comando de startup que PM2 imprima. Usa Nginx como proxy inverso y Certbot para HTTPS.

## Seguridad imprescindible antes de cobrar dinero real
- No marques un pedido pagado solo por el retorno del navegador.
- Valida firma/autenticidad del webhook según la guía oficial de Culqi y consulta el recurso de pago/orden para verificar estado, importe, moneda e ID.
- Este ejemplo bloquea webhooks en producción si no se configura `CULQI_WEBHOOK_SECRET`, pero la variable por sí sola NO valida una firma. Implementa el mecanismo oficial que Culqi documente para tu cuenta antes de habilitar cobros reales.
- Implementa almacenamiento persistente de sesiones (Redis/MySQL), HTTPS, backups, CSP, monitoreo, logs y política de privacidad.
- El endpoint de WhatsApp puede reintentar; añade una cola/outbox y control de notificaciones para producción.
- Usa credenciales de prueba hasta completar una prueba integral con un adulto responsable/administrador del comercio.
- El precio del catálogo es ilustrativo y debe revisarse antes de publicar. Los productos Roblox/pases son marcadores de posición.
- El proyecto no incluye credenciales, ni una API real de nickname, ni una integración de Culqi validada contra tu cuenta. No se debe tratar como listo para producción sin esos pasos.

## Referencias oficiales
- Culqi API: https://apidocs.culqi.com/
- Webhooks Culqi: https://docs.culqi.com/es/documentacion/pagos-online/webhooks/
- Órdenes de pago / billeteras móviles: https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/billetera-moviles/
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/
