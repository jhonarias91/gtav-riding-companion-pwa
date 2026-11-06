import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPwaServer, wifiAddress } from '../server.mjs';
import { parsePairingQr } from '../dist/pairing-qr.js';
import jsQR from '../dist/qr-decoder.js';
import qrcode from '../../gtav-riding-companion-bridge/node_modules/qrcode-generator/dist/qrcode.mjs';
import { selfSignedCertificate, keyFingerprint } from '../../gtav-riding-companion-bridge/bridge/api-v1/auto-tls.mjs';
import { pairingUri } from '../../gtav-riding-companion-bridge/bridge/pairing-qr.mjs';
import { setup } from '../../gtav-riding-companion-bridge/tests/support/bridge-v1.mjs';

test('PWA proxy relays v1 calls only to the local bridge and guards browser origins', async () => {
  const received = [];
  const bridge = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ path: req.url, method: req.method, origin: req.headers.origin, authorization: req.headers.authorization, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }).listen(0, '127.0.0.1');
  await once(bridge, 'listening');
  const server = createPwaServer({ bridgePort: bridge.address().port, bridgeTransport: 'http-dev' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Origin: base, 'X-Bridge-Transport': 'http-dev', Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /GTAV Riding Companion/);

    const relayed = await fetch(`${base}/api/v1/commands`, { method: 'POST', headers, body: '{"test":true}' });
    assert.equal(relayed.status, 200);
    assert.deepEqual(await relayed.json(), { ok: true });
    assert.deepEqual(received, [{ path: '/api/v1/commands', method: 'POST', origin: undefined, authorization: 'Bearer test-token', body: '{"test":true}' }]);

    assert.equal((await fetch(`${base}/api/v1/desktop/world`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/api/v1/state`, { headers: { ...headers, Origin: 'http://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/api/v1/state`, { headers: { 'X-Bridge-Transport': 'https' } })).status, 400);
    assert.deepEqual(await (await fetch(`${base}/api/pwa-info`)).json(), { bridgePort: bridge.address().port, bridgeTransport: 'http-dev', bridgeFingerprint: null });
    assert.equal(received.length, 1);
  } finally {
    server.close(); bridge.close();
    await Promise.all([once(server, 'close'), once(bridge, 'close')]);
  }
});

test('PWA proxy reaches the Android bridge v1 catalog after pairing', async t => {
  const { bridge } = await setup(t);
  const server = createPwaServer({ bridgePort: bridge.server.address().port, bridgeTransport: 'http-dev' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const transport = { Origin: base, 'X-Bridge-Transport': 'http-dev' };
  const hello = await (await fetch(`${base}/api/v1/hello`, { headers: transport })).json();
  assert.equal(hello.apiMajor, 1);
  const pairResponse = await fetch(`${base}/api/v1/pair`, { method: 'POST', headers: { ...transport, 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '246810', clientName: 'PWA test' }) });
  assert.equal(pairResponse.status, 200);
  const token = (await pairResponse.json()).token;
  const headers = { ...transport, Authorization: `Bearer ${token}` };
  const state = await (await fetch(`${base}/api/v1/state`, { headers })).json();
  assert.equal(state.layers.adapter, 'fresh');
  const routes = await (await fetch(`${base}/api/v1/routes`, { headers })).json();
  assert.equal(routes.items[0].name, 'Coastal Loop');
  const plans = await (await fetch(`${base}/api/v1/workout-plans`, { headers })).json();
  assert.equal(plans.plans[0].name, 'Plan A');

  const qr = parsePairingQr(pairingUri({ bridgeId: hello.bridgeId, hosts: ['127.0.0.1'], port: bridge.server.address().port,
    fingerprint: null, pairingKey: bridge.pairing.currentPairingKey() }));
  assert.equal(qr.bridgeId, hello.bridgeId);
  const qrPair = await fetch(`${base}/api/v1/pair`, { method: 'POST', headers: { ...transport, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingKey: qr.pairingKey, clientName: 'PWA QR test' }) });
  assert.equal(qrPair.status, 200);
  assert.ok((await qrPair.json()).token);
});

test('PWA QR parser accepts the bridge format and rejects unsafe addresses', () => {
  const key = 'a'.repeat(22), fingerprint = 'b'.repeat(64);
  const valid = pairingUri({ bridgeId: 'bridge-123', hosts: ['192.168.1.4', '10.0.0.5'], port: 8788, fingerprint, pairingKey: key });
  assert.deepEqual(parsePairingQr(valid), { bridgeId: 'bridge-123', hosts: ['192.168.1.4', '10.0.0.5'], port: 8788, fingerprint, pairingKey: key });
  for (const bad of [valid.replace('192.168.1.4', '8.8.8.8'), valid.replace('p=8788', 'p=80'),
    valid.replace('id=bridge-123', 'id=bad%2Fid'), valid + '&s=duplicate', valid.replace('k=' + fingerprint, 'k=wrong')]) {
    assert.equal(parsePairingQr(bad), null);
  }
});

test('bundled QR decoder reads a bridge pairing code', () => {
  const uri = pairingUri({ bridgeId: 'bridge-123', hosts: ['192.168.1.4'], port: 8788,
    fingerprint: 'b'.repeat(64), pairingKey: 'a'.repeat(22) });
  const qr = qrcode(0, 'M');
  qr.addData(uri, 'Byte'); qr.make();
  const scale = 5, quiet = 4, side = (qr.getModuleCount() + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const row = Math.floor(y / scale) - quiet, col = Math.floor(x / scale) - quiet;
    const shade = row >= 0 && col >= 0 && row < qr.getModuleCount() && col < qr.getModuleCount() && qr.isDark(row, col) ? 0 : 255;
    const index = (y * side + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = shade;
    pixels[index + 3] = 255;
  }
  assert.equal(jsQR(pixels, side, side)?.data, uri);
});

test('HTTPS proxy sends a token only after verifying the Android bridge key', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const cert = selfSignedCertificate(key, ['127.0.0.1']);
  const directory = await mkdtemp(join(tmpdir(), 'gtav-pwa-key-'));
  const keyFile = join(directory, 'bridge-key.pem');
  await writeFile(keyFile, key);
  const seen = [];
  const bridge = https.createServer({ key, cert }, (req, res) => {
    seen.push(req.headers.authorization);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  }).listen(0, '127.0.0.1');
  await once(bridge, 'listening');
  const server = createPwaServer({ bridgePort: bridge.address().port, bridgeKeyFile: keyFile }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const info = await (await fetch(`${base}/api/pwa-info`)).json();
    assert.equal(info.bridgeFingerprint, keyFingerprint(cert));
    assert.equal(info.bridgeTransport, 'https');
    const missing = await fetch(`${base}/api/v1/state`, { headers: { Authorization: 'Bearer secret' } });
    assert.equal(missing.status, 400);
    const wrong = await fetch(`${base}/api/v1/state`, { headers: { 'X-Bridge-Fingerprint': 'a'.repeat(64), Authorization: 'Bearer secret' } });
    assert.equal(wrong.status, 502);
    assert.equal((await wrong.json()).error.code, 'BRIDGE_IDENTITY_CHANGED');
    assert.equal(seen.length, 0);
    const good = await fetch(`${base}/api/v1/state`, { headers: { 'X-Bridge-Fingerprint': keyFingerprint(cert), Authorization: 'Bearer secret' } });
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { ok: true });
    assert.deepEqual(seen, ['Bearer secret']);
  } finally {
    server.close(); bridge.close();
    await Promise.all([once(server, 'close'), once(bridge, 'close')]);
    await unlink(keyFile); await rmdir(directory);
  }
});

test('Wi-Fi address selection prefers the private wireless IPv4', () => {
  const networks = {
    Ethernet: [{ family: 'IPv4', address: '192.168.1.27', internal: false }],
    'Wi-Fi': [{ family: 'IPv6', address: '::1', internal: false }, { family: 'IPv4', address: '192.168.1.37', internal: false }],
  };
  assert.equal(wifiAddress(networks), '192.168.1.37');
  assert.equal(wifiAddress({ 'Wi-Fi': [{ family: 'IPv4', address: '169.254.1.2', internal: false }] }), null);
});
