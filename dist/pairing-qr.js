// The bridge prints this exact URI. Validate every component before using its one-time secret.
export function parsePairingQr(text) {
  const prefix = 'gtav-riding-companion://pair?';
  if (typeof text !== 'string' || !text.startsWith(prefix) || text.length > 1024) return null;
  const entries = text.slice(prefix.length).split('&').map(part => part.split('='));
  if (entries.some(pair => pair.length !== 2)) return null;
  const params = Object.fromEntries(entries);
  if (Object.keys(params).length !== entries.length || Object.keys(params).some(key => !['v', 'id', 'h', 'p', 'k', 's'].includes(key))) return null;
  if (params.v !== '1' || !/^[A-Za-z0-9-]{1,64}$/.test(params.id ?? '')) return null;
  const port = Number(params.p);
  if (!/^[0-9]{4,5}$/.test(params.p ?? '') || port < 1024 || port > 65535) return null;
  const hosts = (params.h ?? '').split(',');
  if (hosts.length < 1 || hosts.length > 8 || hosts.some(host => {
    if (!/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(host)) return true;
    const octets = host.split('.').map(Number);
    if (octets.some(octet => octet > 255)) return true;
    return !(octets[0] === 127 || octets[0] === 10 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
  })) return null;
  if (params.k != null && !/^[a-f0-9]{64}$/.test(params.k)) return null;
  if (!/^[A-Za-z0-9_-]{22}$/.test(params.s ?? '')) return null;
  return { bridgeId: params.id, hosts: [...new Set(hosts)], port, fingerprint: params.k ?? null, pairingKey: params.s };
}
