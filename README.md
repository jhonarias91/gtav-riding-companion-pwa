# GTAV Riding Companion PWA

Interfaz web basada en la app Android `gtav-riding-companion-android` (pantallas Compose y textos de la versión `0.7.0-p15`). Conserva las cuatro pestañas **Rodar, Recorridos, Entrenamiento y Más**, el tema claro/oscuro, las unidades, la ayuda contextual y las pantallas secundarias de conexión, perfil, opciones del juego, actividades, ciclistas y diagnóstico. La búsqueda y detección de sensores, la selección de dispositivos y el escaneo Bluetooth del teléfono no forman parte de esta PWA.

Los datos en vivo y los controles usan la API v1 del puente Android en `gtav-riding-companion-bridge`, no el puente web archivado de este directorio. La PWA y el puente v1 deben ejecutarse en el **mismo PC**: el servidor web solo reenvía a `127.0.0.1` y verifica automáticamente la clave local del puente cuando este usa HTTPS. En modo demo, los datos son sintéticos y los controles del PC están desactivados.

## Ejecutar en el PC

En una terminal, inicia el puente Android v1 según las instrucciones de su repositorio. Su puerto predeterminado es 8788. Pulsa Enter en esa terminal para mostrar el código de emparejamiento de seis dígitos:

```powershell
cd G:\develop2\games\GTBikeV\gtav-riding-companion-bridge
node bridge/start-v1.mjs
```

En otra terminal, inicia la PWA. Por defecto escucha en la red local y muestra la IPv4 privada de la interfaz Wi-Fi, por ejemplo `http://192.168.1.37:4173`. Abre esa dirección en el celular, conectado al mismo Wi-Fi:

```powershell
cd G:\develop2\games\GTBikeV\gtav-riding-companion-pwa
npm ci
node server.mjs
```

En **Conexión**, escribe únicamente ese código y pulsa **Conectar**. El servidor obtiene la huella de la clave del puente de los archivos locales; no hay que copiarla al celular. También puedes escanear el QR del puente si sirves la PWA en un contexto seguro y das permiso de cámara. Si el puente usa otro puerto, inicia el servidor web con `--bridge-port PUERTO`. Para un puente iniciado con `--http-dev`, añade `--bridge-http-dev` al comando de la PWA. Si el puente usa un certificado TLS personalizado, añade `--bridge-cert C:\ruta\cert-del-puente.pem`.

Para instalarla como PWA en un teléfono, sirve la web con un certificado TLS confiable para la dirección del PC:

```powershell
node server.mjs --tls-cert C:\ruta\cert.pem --tls-key C:\ruta\key.pem
```

El servidor HTTP en una IP de la red local sirve para probar la web; el registro del service worker y la instalación como PWA requieren un contexto seguro. En `localhost` el navegador admite el service worker para desarrollo. Los archivos de la interfaz se almacenan para uso sin conexión, pero las acciones del PC necesitan que el servidor y el puente estén activos.

## Actualizar textos y verificar

Los JSON en `dist/i18n` se generan de los recursos de Android, incluida la ayuda. Después de cambiar textos en Android:

```powershell
python scripts/sync-android-strings.py
npm test
```

`npm test` comprueba la API web anterior y el proxy nuevo, incluido el emparejamiento con un puente v1 simulado y la verificación de la huella HTTPS. La integración dentro de GTA V y en un teléfono físico necesita una comprobación con el PC del usuario.

Los archivos `dist/app.js`, `dist/bridge-ui.js`, `dist/bridge-client.js`, `dist/style.css` y `dist/game-controls.*` pertenecen al prototipo web anterior y no se cargan desde `index.html`. `npm run bridge` sigue iniciando ese puente antiguo para quien necesite consultar el archivo histórico.
