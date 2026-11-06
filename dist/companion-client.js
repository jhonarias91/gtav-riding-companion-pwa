const saved = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

export const preferences = saved('gtav-companion-preferences', { language: 'es', theme: 'system', units: 'metric' });
export function savePreferences() { localStorage.setItem('gtav-companion-preferences', JSON.stringify(preferences)); }

export class CompanionClient {
  constructor() {
    const paired = saved('gtav-companion-pairing', null);
    this.token = paired?.token ?? null;
    this.bridgeId = paired?.bridgeId ?? null;
    this.fingerprint = paired?.fingerprint ?? '';
    this.transport = paired?.transport ?? 'https';
    this.expiresAtUtc = paired?.expiresAtUtc ?? null;
    this.mode = saved('gtav-companion-demo', false) ? 'demo' : this.token ? 'live' : 'setup';
    this.state = null;
    this.capabilities = null;
    this.hello = null;
    this.lastError = null;
  }

  setConnection(transport, fingerprint) {
    this.transport = transport;
    this.fingerprint = fingerprint.trim().toLowerCase().replaceAll(':', '');
  }

  async request(path, { method = 'GET', body, binary = false, auth = true } = {}) {
    if (this.transport === 'https' && !/^[a-f0-9]{64}$/.test(this.fingerprint)) throw Error('BRIDGE_KEY_UNAVAILABLE');
    const response = await fetch(`/api/v1/${path}`, {
      method,
      headers: {
        'X-Bridge-Transport': this.transport,
        ...(this.transport === 'https' ? { 'X-Bridge-Fingerprint': this.fingerprint } : {}),
        ...(auth && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      try { code = (await response.json()).error?.code ?? code; } catch { /* binary failure */ }
      if (code === 'AUTH_REQUIRED') this.lastError = code;
      throw Error(code);
    }
    if (response.status === 204) return null;
    return binary ? { bytes: await response.arrayBuffer(), headers: response.headers } : response.json();
  }

  async probe() {
    const hello = await this.request('hello', { auth: false });
    if (hello.service !== 'gtav-riding-companion-bridge' || hello.apiMajor !== 1 || hello.nativePairing !== true) throw Error('UNSUPPORTED_VERSION');
    if (hello.transport !== this.transport) throw Error('TLS_VERIFICATION_FAILED');
    if (this.bridgeId && hello.bridgeId !== this.bridgeId) throw Error('BRIDGE_CHANGED');
    this.hello = hello;
    return hello;
  }

  async pair(pin) {
    if (!/^\d{6}$/.test(pin)) throw Error('PAIRING_PIN_INVALID');
    const hello = this.hello ?? await this.probe();
    const paired = await this.request('pair', { method: 'POST', body: { pin, clientName: 'GTAV Riding Companion PWA' }, auth: false });
    await this.finishPair(hello, paired);
  }

  async pairWithQr(qr, bridgePort) {
    if (qr.port !== bridgePort) throw Error('QR_PORT_MISMATCH');
    this.setConnection(qr.fingerprint ? 'https' : 'http-dev', qr.fingerprint ?? '');
    this.hello = null;
    const hello = await this.probe();
    if (hello.bridgeId !== qr.bridgeId) throw Error('BRIDGE_CHANGED');
    let paired;
    try {
      paired = await this.request('pair', { method: 'POST', body: { pairingKey: qr.pairingKey, clientName: 'GTAV Riding Companion PWA' }, auth: false });
    } catch (error) {
      if (error.message === 'PAIRING_PIN_INVALID') throw Error('QR_USED');
      throw error;
    }
    await this.finishPair(hello, paired);
  }

  async finishPair(hello, paired) {
    if (paired.bridgeId !== hello.bridgeId) throw Error('BRIDGE_CHANGED');
    this.token = paired.token;
    this.bridgeId = paired.bridgeId;
    this.expiresAtUtc = paired.expiresAtUtc;
    this.mode = 'live';
    this.lastError = null;
    localStorage.setItem('gtav-companion-pairing', JSON.stringify({ token: this.token, bridgeId: this.bridgeId, expiresAtUtc: this.expiresAtUtc, fingerprint: this.fingerprint, transport: this.transport }));
    localStorage.removeItem('gtav-companion-demo');
    await this.refresh();
  }

  async unpair() {
    if (this.token) await this.request('unpair', { method: 'POST', body: {} }).catch(() => {});
    this.token = null;
    this.bridgeId = null;
    this.state = null;
    this.capabilities = null;
    this.mode = 'setup';
    localStorage.removeItem('gtav-companion-pairing');
  }

  useDemo() {
    this.mode = 'demo';
    this.lastError = null;
    localStorage.setItem('gtav-companion-demo', 'true');
  }

  async resumeLive() {
    if (!this.token) throw Error('AUTH_REQUIRED');
    this.mode = 'live';
    await this.refresh();
    localStorage.removeItem('gtav-companion-demo');
  }

  async refresh() {
    if (this.mode !== 'live') return;
    const [state, capabilities] = await Promise.all([this.request('state'), this.request('capabilities')]);
    this.state = state;
    this.capabilities = capabilities;
    this.lastError = null;
    return state;
  }

  capability(id) { return this.capabilities?.capabilities?.find(item => item.id === id) ?? null; }

  async command(type, args = {}, expectedRevision = null) {
    const adapterInstanceId = this.state?.adapterInstanceId;
    if (!adapterInstanceId) throw Error('ADAPTER_ABSENT');
    const requestId = crypto.randomUUID();
    let operation = await this.request('commands', { method: 'POST', body: { requestId, adapterInstanceId, type, expectedRevision, args } });
    for (let attempt = 0; attempt < 16 && ['received', 'validated', 'dispatched', 'pending'].includes(operation.status); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      operation = await this.request(`operations/${requestId}`);
    }
    if (operation.status === 'applied') {
      await this.refresh();
      return operation;
    }
    throw Error(operation.error?.code ?? (operation.status === 'unknown' ? 'OPERATION_UNKNOWN' : 'OPERATION_IN_PROGRESS'));
  }
}

export const client = new CompanionClient();
