import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { createHash, createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, networkInterfaces } from 'node:os';

const root = resolve(import.meta.dirname, 'dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};
const hostAllowed = host => /^(localhost|127\.0\.0\.1|\[::1\]|(\d{1,3}\.){3}\d{1,3})(:\d{1,5})?$/.test(host ?? '');
const fingerprintValid = value => /^[a-f0-9]{64}$/.test(value ?? '');
const privateIpv4 = address => /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(address);
export function wifiAddress(interfaces = networkInterfaces()) {
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!/wi-?fi|wlan|wireless|inal[aá]mbric/i.test(name)) continue;
    const address = addresses.find(item => item.family === 'IPv4' && !item.internal && privateIpv4(item.address));
    if (address) return address.address;
  }
  return null;
}
const defaultBridgeKeyFile = join(process.env.LOCALAPPDATA ?? homedir(), 'GTBikeVCompanion', 'tls', 'bridge-key.pem');
async function localBridgeFingerprint({ bridgeKeyFile, bridgeCertFile }) {
  const pem = await readFile(bridgeCertFile ?? bridgeKeyFile);
  const publicKey = bridgeCertFile ? new X509Certificate(pem).publicKey : createPublicKey(createPrivateKey(pem));
  return createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
}
const send = (res, code, message) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: { code: message } }));
};

function pinnedAgent(fingerprint) {
  const agent = new https.Agent({ keepAlive: false });
  agent.createConnection = (options, callback) => {
    const socket = tls.connect({ ...options, rejectUnauthorized: false });
    let done = false;
    const complete = (error, value) => {
      if (done) return;
      done = true;
      callback(error, value);
    };
    socket.once('secureConnect', () => {
      try {
        const certificate = socket.getPeerCertificate(true);
        if (!certificate?.raw) throw Error('BRIDGE_IDENTITY_UNAVAILABLE');
        const spki = new X509Certificate(certificate.raw).publicKey.export({ type: 'spki', format: 'der' });
        const actual = createHash('sha256').update(spki).digest('hex');
        if (actual !== fingerprint) throw Error('BRIDGE_IDENTITY_CHANGED');
        complete(null, socket);
      } catch (error) {
        socket.destroy();
        complete(error);
      }
    });
    socket.once('error', error => complete(error));
  };
  return agent;
}

async function proxy(req, res, { bridgePort, bridgeTransport, bridgeKeyFile, bridgeCertFile }) {
  const transport = bridgeTransport;
  const fingerprint = req.headers['x-bridge-fingerprint'];
  if (req.headers['x-bridge-transport'] && req.headers['x-bridge-transport'] !== transport) return send(res, 400, 'TLS_VERIFICATION_FAILED');
  if (transport === 'https') {
    if (!fingerprintValid(fingerprint)) return send(res, 400, 'BRIDGE_FINGERPRINT_REQUIRED');
    let expected;
    try { expected = await localBridgeFingerprint({ bridgeKeyFile, bridgeCertFile }); }
    catch { return send(res, 503, 'BRIDGE_KEY_UNAVAILABLE'); }
    if (fingerprint !== expected) return send(res, 502, 'BRIDGE_IDENTITY_CHANGED');
  }
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/v1/') || url.pathname.startsWith('/api/v1/desktop/') || !['GET', 'POST'].includes(req.method)) {
    return send(res, 404, 'NOT_FOUND');
  }
  const headers = { host: `127.0.0.1:${bridgePort}` };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.headers['content-type'] === 'application/json') headers['content-type'] = 'application/json';
  let body = Buffer.alloc(0);
  if (req.method === 'POST') {
    for await (const chunk of req) {
      body = Buffer.concat([body, chunk]);
      if (body.length > 64 * 1024) return send(res, 413, 'PAYLOAD_TOO_LARGE');
    }
    headers['content-length'] = String(body.length);
  }
  const client = transport === 'https' ? https : http;
  const options = {
    hostname: '127.0.0.1', port: bridgePort, path: url.pathname + url.search,
    method: req.method, headers, agent: transport === 'https' ? pinnedAgent(fingerprint) : false,
    timeout: 12_000,
  };
  await new Promise(resolveDone => {
    const outgoing = client.request(options, upstream => {
      const responseHeaders = {
        'Content-Type': upstream.headers['content-type'] ?? 'application/json',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      };
      for (const name of ['content-length', 'content-disposition', 'x-content-sha256', 'retry-after']) {
        if (upstream.headers[name]) responseHeaders[name] = upstream.headers[name];
      }
      res.writeHead(upstream.statusCode ?? 502, responseHeaders);
      upstream.pipe(res);
      upstream.once('end', resolveDone);
      upstream.once('error', () => { res.destroy(); resolveDone(); });
    });
    outgoing.once('timeout', () => outgoing.destroy(Error('BRIDGE_TIMEOUT')));
    outgoing.once('error', error => {
      if (!res.headersSent) send(res, 502, error.message === 'BRIDGE_IDENTITY_CHANGED' ? error.message : 'PC_UNREACHABLE');
      resolveDone();
    });
    outgoing.end(body);
  });
}

export function createPwaServer({ bridgePort = 8788, bridgeTransport = 'https', bridgeKeyFile = defaultBridgeKeyFile,
  bridgeCertFile = process.env.GTBIKE_BRIDGE_TLS_CERT ?? null, tlsOptions = null } = {}) {
  if (!['https', 'http-dev'].includes(bridgeTransport)) throw Error('Invalid bridge transport');
  const bridgeSettings = { bridgePort, bridgeTransport, bridgeKeyFile, bridgeCertFile };
  const serve = async (req, res) => {
    try {
      if (!hostAllowed(req.headers.host)) return send(res, 403, 'FORBIDDEN_SCOPE');
      if (req.headers.origin && req.headers.origin !== `${tlsOptions ? 'https' : 'http'}://${req.headers.host}`) return send(res, 403, 'FORBIDDEN_SCOPE');
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/pwa-info' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        const bridgeFingerprint = bridgeTransport === 'https'
          ? await localBridgeFingerprint(bridgeSettings).catch(() => null) : null;
        return res.end(JSON.stringify({ bridgePort, bridgeTransport, bridgeFingerprint }));
      }
      if (url.pathname.startsWith('/api/v1/')) return await proxy(req, res, bridgeSettings);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'METHOD_NOT_ALLOWED');
      const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const path = resolve(root, '.' + requested);
      if (!path.startsWith(root + sep)) return send(res, 404, 'NOT_FOUND');
      const canonical = await realpath(path);
      if (!canonical.startsWith(root + sep)) return send(res, 404, 'NOT_FOUND');
      const data = await readFile(canonical);
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      if (!res.headersSent) send(res, 404, 'NOT_FOUND');
      else res.end();
    }
  };
  return tlsOptions ? https.createServer(tlsOptions, serve) : http.createServer(serve);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
  };
  const host = option('--host', wifiAddress() ?? '0.0.0.0');
  const port = Number(option('--port', '4173'));
  const bridgePort = Number(option('--bridge-port', '8788'));
  const certFile = option('--tls-cert', null), keyFile = option('--tls-key', null);
  const bridgeCertFile = option('--bridge-cert', process.env.GTBIKE_BRIDGE_TLS_CERT ?? null);
  const bridgeTransport = args.includes('--bridge-http-dev') ? 'http-dev' : 'https';
  const valued = ['--host', '--port', '--bridge-port', '--tls-cert', '--tls-key', '--bridge-cert'];
  const flags = ['--bridge-http-dev'];
  if (args.some((arg, index) => arg.startsWith('--') && !valued.includes(arg) && !flags.includes(arg) || valued.includes(arg) && (!args[index + 1] || args[index + 1].startsWith('--')) || index > 0 && valued.includes(args[index - 1]) && arg.startsWith('--'))
    || !Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(bridgePort) || bridgePort < 1024 || bridgePort > 65535
    || !['0.0.0.0', '127.0.0.1'].includes(host) && !hostAllowed(host) || Boolean(certFile) !== Boolean(keyFile))
    throw Error('Uso: node server.mjs [--host 0.0.0.0] [--port 4173] [--bridge-port 8788] [--bridge-http-dev] [--bridge-cert FILE] [--tls-cert FILE --tls-key FILE]');
  const tlsOptions = certFile ? { cert: await readFile(certFile), key: await readFile(keyFile) } : null;
  const server = createPwaServer({ bridgePort, bridgeTransport, bridgeCertFile, tlsOptions });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `El puerto ${port} ya está en uso. Cierra la otra instancia o inicia con --port OTRO_PUERTO.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const address = host === '0.0.0.0' ? wifiAddress() : host;
    if (address) console.log(`GTAV Riding Companion PWA: ${tlsOptions ? 'https' : 'http'}://${address}:${port}`);
    else console.log('GTAV Riding Companion PWA: no se encontró una IPv4 privada en la interfaz Wi-Fi. Conecta el PC al Wi-Fi y reinicia.');
  });
}
