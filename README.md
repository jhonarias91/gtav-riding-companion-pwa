**EN** | [ES](README_ES.md)

# GTAV Riding Companion PWA

**Prerequisite:** Install and run the [GTAV Riding Companion PC bridge](https://github.com/jhonarias91/gtav-riding-companion-bridge) on the PC to use this PWA with GTBike V.

A web app based on `gtav-riding-companion-android` (its Compose screens and the text from version `0.7.0-p15`). It has the four **Ride, Routes, Training, and More** tabs, light and dark themes, unit preferences, contextual help, and screens for connection, profile, game options, activities, riders, and diagnostics. This PWA does not include sensor discovery, device selection, or phone Bluetooth scanning.

Live data and controls use the Android bridge v1 API in `gtav-riding-companion-bridge`, rather than the archived web bridge in this directory. The PWA and bridge v1 must run on the **same PC**: the web server forwards requests only to `127.0.0.1` and automatically verifies the bridge's local key when it uses HTTPS. Demo mode uses sample data and disables PC controls.

## Run on the PC

In one terminal, start Android bridge v1 as described in its repository. Its default port is 8788. Press Enter in that terminal to display a six-digit pairing code:

```powershell
cd G:\develop2\games\GTBikeV\gtav-riding-companion-bridge
node bridge/start-v1.mjs
```

In another terminal, start the PWA. By default it listens on the PC's Wi-Fi interface (or, without Wi-Fi, its Ethernet one) and prints its private IPv4 address, for example `http://192.168.1.37:4173`. Open the printed address on a phone connected to the same network:

```powershell
cd G:\develop2\games\GTBikeV\gtav-riding-companion-pwa
npm ci
node server.mjs
```

On **Connect**, enter only the six-digit code and tap **Connect**. The server reads the bridge key fingerprint from local files, so you do not need to copy it to the phone. You can also scan the bridge's QR code if you serve the PWA in a secure context and grant camera access. If the bridge uses another port, start the web server with `--bridge-port PORT`. For a bridge started with `--http-dev`, add `--bridge-http-dev` to the PWA command. If the bridge uses a custom TLS certificate, add `--bridge-cert C:\path\to\bridge-cert.pem`.

The Windows app **GTAV Riding Companion** can do all of this for you: its **Web** tab downloads this repository, starts it with the bundled Node.js, and opens `http://ADDRESS:4173/#pair=CODE` already paired. The page removes the code from the address bar as soon as it loads. Opening the PWA with `#pair=` followed by the bridge's current six-digit code works the same way from any browser.

To install the PWA on a phone, serve it with a TLS certificate trusted for the PC's address:

```powershell
node server.mjs --tls-cert C:\path\to\cert.pem --tls-key C:\path\to\key.pem
```

HTTP on a local network address is useful for testing the site. Service worker registration and PWA installation require a secure context; browsers allow a service worker on `localhost` for development. The interface files are cached for offline use, but PC actions require the web server and bridge to be running.

## Update text and verify

The JSON files in `dist/i18n`, including help text, are generated from Android resources. After changing Android text:

```powershell
python scripts/sync-android-strings.py
npm test
```

`npm test` checks the old web API and the new proxy, including pairing with a simulated bridge v1 and HTTPS key fingerprint verification. Integration with GTA V and a physical phone must be checked on the user's PC.

The files `dist/app.js`, `dist/bridge-ui.js`, `dist/bridge-client.js`, `dist/style.css`, and `dist/game-controls.*` belong to the earlier web prototype and are not loaded by `index.html`. `npm run bridge` still starts that older bridge if you need to inspect the archived prototype.

## License

This project is licensed under the [MIT License](https://github.com/jhonarias91/gtav-riding-companion-pwa/blob/main/LICENSE).
