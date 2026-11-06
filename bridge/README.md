# Puente Wi-Fi de GTBikeV Companion

Para la app Android nativa y el paquete de integración de Windows, consulta [Puente Android v1](ANDROID_BRIDGE_V1.md).

El celular abre la interfaz servida por el PC dentro de la misma red. El enlace anterior de Sites sigue funcionando como demo y tiene instrucciones para abrir el puente. El cliente local y el adaptador no pasan por Sites ni por un servidor externo.

```text
Celular: http://IP-DEL-PC:8787
        │ código de emparejamiento + token de sesión
        ▼
Node.js en Windows: API local + interfaz web
        │ archivos JSON locales; órdenes con caducidad y confirmación
        ▼
GTBikeVCompanion.dll: script adicional de ScriptHookVDotNet 3
        │ reflexión sobre miembros concretos de la instancia cargada
        ▼
GTBikeV.dll 0.8.0.4 → ANT+ / BLE
```

## Preparación, con GTA V cerrado

Node.js está instalado en este PC en `C:\Program Files\nodejs\node.exe`. Los archivos web y el SDK FIT ya están preparados: no hace falta instalar paquetes npm para ejecutar el puente.

Desde PowerShell, compila e instala el script adicional contra la DLL de ScriptHookVDotNet de tu instalación:

```powershell
cd G:\develop2\games\GTBikeV\companion-web
.\bridge\Build-GameAdapter.ps1 -GtaDirectory 'G:\SteamLibrary\steamapps\common\Grand Theft Auto V Enhanced' -Install
```

Esto añade `scripts\GTBikeVCompanion.dll`. Si ya existe, guarda una copia con fecha antes de reemplazarlo. No modifica `GTBikeV.dll`. El comando sin `-Install` solo compila en `outputs\game-adapter`.

## Arrancar

```powershell
cd G:\develop2\games\GTBikeV\companion-web
.\bridge\Start-Bridge.ps1
```

También puedes abrir `bridge\Start-Bridge.cmd`. Mantén abierta la ventana del puente. Mostrará las IPv4 privadas del PC y un código nuevo de seis dígitos. No publiques el código.

1. Conecta el celular a la misma red local del PC; el PC también puede usar Ethernet al mismo router.
2. Abre en Chrome de Android la dirección **«En el celular»** que aparece en el puente. No uses `localhost` en el celular: apuntaría al propio teléfono.
3. Toca **Emparejar PC** e introduce el código.
4. Inicia GTA V en modo Historia. Debe estar operativa tu instalación existente de GTBikeV y ScriptHookVDotNet. La app distingue el puente enlazado, el adaptador del juego y los receptores ANT+/BLE listos.

El proceso escucha en el puerto 8787. Si Windows bloquea el acceso y la red doméstica ya tiene perfil **Privado**, ejecuta una vez en PowerShell como administrador:

```powershell
& 'G:\develop2\games\GTBikeV\companion-web\bridge\Enable-LanAccess.ps1'
```

Esta regla permite únicamente el ejecutable Node, TCP 8787, perfil Privado y subred local. El proyecto no cambia el perfil de red ni abre puertos del router. Para retirar la regla, ejecuta el mismo comando añadiendo `-Remove`. Las redes de invitados con aislamiento entre clientes pueden impedir la conexión.

## Configuración y archivos

El puente localiza Documentos mediante la carpeta conocida de Windows, compatible con Documentos redirigido a OneDrive. Por defecto lee:

```text
Documentos\Rockstar Games\GTA V\ModSettings\GTBikeVConfig.ini
Documentos\Rockstar Games\GTA V\*.fit
```

La búsqueda FIT incluye hasta dos niveles de subcarpetas, un máximo de 500 archivos y 20 MB por archivo; no sigue enlaces simbólicos. Se importan archivos terminados de una sola sesión; un FIT todavía abierto por el juego puede fallar la validación CRC y debe importarse después de guardarlo.

Puedes indicar otra ubicación:

```powershell
.\bridge\Start-Bridge.ps1 -IniPath 'D:\Documentos\Rockstar Games\GTA V\ModSettings\GTBikeVConfig.ini' -FitDirectory 'D:\Documentos\Rockstar Games\GTA V' -Port 8787
```

**Cargar INI del PC** debe preceder a **Guardar INI en el PC**. El guardado comprueba que el archivo no haya cambiado, preserva UTF-8/UTF-16 y las claves ajenas, y crea una copia exacta en `%LOCALAPPDATA%\GTBikeVCompanion\backups`. Los cambios de INI requieren reiniciar el mod; el puente no afirma que se apliquen en caliente. Los límites de peso/FTP de la interfaz son límites del perfil web.

## Datos y controles

La selección se basa en el C# de `DataTransceiver`, `VirtualTrainer` y `Menus` aportado por el usuario desde dnSpy para la versión 0.8.0.4. No se carga una segunda copia de la DLL ni se crea otro `VirtualTrainer`.

| Dato o control | Integración |
| --- | --- |
| Potencia | `DataTransceiver.Power_w`; -1 → sin dato |
| Cadencia | `Cadence_rpm`; 255 → sin dato |
| Pulso | `HeartRate`; 255 o 0 → sin dato |
| Velocidad | `Speed_ms × 3.6`, respetando la selección real/virtual del mod |
| Distancia | `TotalDistance_m / 1000` |
| Tiempo | `RidingTime_ms / 1000`, según la definición del contador del mod |
| ERG | Setter `ERGMode`: `Engaged` / `Off` |
| Potencia objetivo | `SetTargetPower(short)` con ERG activo; 50–600 W |
| Activar/desactivar | Acción de `Menus.activateModMenuItem`, si tiene los manejadores esperados |
| Solicitar finalizar/guardar | Acción de `Menus.saveActivityMenuItem`, habilitada y con velocidad menor de 0.05 m/s |

Las acciones de menú usan el punto de entrada `NativeItem.OnActivated(object)` de LemonUI, que se verifica por reflexión antes de anunciar la capacidad. La respuesta de guardado confirma que se invocó la acción del menú: consulta el resumen del juego y actualiza **FIT del PC** para comprobar el archivo resultante. No llama a `DataTransceiver.Stop()` para simular un guardado.

El adaptador captura en el hilo del script del juego cada 250 ms, publica archivos de forma atómica y procesa allí las órdenes. El cliente consulta el puente cada segundo. Una lectura de más de cinco segundos se descarta. Las órdenes llevan identificador del adaptador y caducan en tres segundos; no se reintentan automáticamente. Un resultado de ERG confirma el estado aceptado por el mod, no una medición independiente del rodillo físico.

No se inventa ascenso acumulado: el dato permanece como — hasta identificar su miembro real. El mapa sigue siendo ilustrativo. Los planes mostrados son ejemplos; todavía no se cargan automáticamente como workouts del juego ni hay pausa remota del entrenamiento.

## Seguridad y diagnóstico

HTTP está limitado a direcciones IPv4 privadas y loopback. Úsalo dentro de tu red doméstica de confianza: el tráfico HTTP local no está cifrado. No publiques el puerto en Internet. El PIN admite cinco intentos por IP y minuto; los tokens viven en la memoria del servidor, expiran tras 24 horas y se invalidan al detenerlo. El navegador guarda el token solo durante la sesión. Las API de datos requieren autenticación; hay comprobaciones de Host, Origin y tamaño de solicitudes, sin CORS abierto ni ejecución de comandos arbitrarios.

Los archivos del adaptador están en `%LOCALAPPDATA%\GTBikeVCompanion`: `telemetry.json`, `commands` y `adapter.log`. Puente y juego deben ejecutarse con la misma cuenta de Windows. Si se reinicia el puente o vence la sesión, vuelve a emparejar. Si cambia la IP del PC, reinicia el puente y usa la dirección nueva. Un cierre abrupto durante el guardado del INI puede dejar `GTBikeVConfig.ini.companion.lock`: con puente y juego cerrados, revisa el archivo y retira ese bloqueo para volver a guardar.

La compilación contra el `ScriptHookVDotNet3.dll` indicado fue comprobada. Las pruebas automáticas usan carpetas temporales y un mod simulado; la carga dentro de GTA V Enhanced y el enlace físico con Android requieren la prueba del usuario.

## Fuentes

- Código C# proporcionado por el usuario en este chat desde dnSpy, 4 de noviembre de 2026. Es la evidencia específica para 0.8.0.4; no se distribuye el código de GTBikeV.
- [Configuración oficial de GTBikeV](https://www.gtbikev.com/content/configuration/)
- [Soporte oficial de GTBikeV](https://www.gtbikev.com/support/)
- [ScriptHookVDotNet: instalación y scripts](https://github.com/scripthookvdotnet/scripthookvdotnet/wiki/Getting-Started)
- [LemonUI NativeItem, código oficial](https://github.com/LemonUIbyLemon/LemonUI/blob/master/LemonUI/Menus/NativeItem.cs)
