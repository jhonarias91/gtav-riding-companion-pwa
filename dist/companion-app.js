import { client, preferences, savePreferences } from './companion-client.js';
import { cameraControlState, cameraModeKeys, normalizeHeading } from './camera-logic.js';
import { parsePairingQr } from './pairing-qr.js';
import jsQR from './qr-decoder.js';
import { snake, shown, changes as addonChanges, fromInput, clock, formatValue, visibleStats, startBlock } from './addons-logic.js';
import { officialKeyBindings, parseKeyStrokeList, findConflicts } from './key-bindings.js';

/** Version matching the Android app and bridge */
const APP_VERSION = '1.0.0';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const id = value => encodeURIComponent(String(value));

let strings = {}, helpTopics = {}, fallback = {};
const t = (key, ...args) => {
  let value = strings[key] ?? fallback[key] ?? key;
  args.forEach((arg, index) => { value = value.replaceAll(new RegExp(`%${index + 1}\\$[sd]`, 'g'), String(arg)); });
  return value;
};
const T = (key, ...args) => esc(t(key, ...args));

const reasonKeys = {
  CAMERA_CONTROL_IN_USE: 'reason_camera_control_in_use',
  DEMO_MODE: 'reason_demo_mode', ADAPTER_ABSENT: 'reason_adapter_absent', ADAPTER_STALE: 'reason_adapter_stale',
  UNSUPPORTED_VERSION: 'reason_unsupported_version', MOD_INACTIVE: 'reason_mod_inactive', MOD_NOT_LOADED: 'reason_mod_not_loaded',
  CAPABILITY_UNAVAILABLE: 'reason_capability_unavailable', SENSOR_MISSING: 'reason_sensor_missing', NOT_CAPTURED: 'reason_not_captured',
  GAME_NOT_IN_CONTROL: 'reason_game_not_in_control', PANEL_CLOSED: 'reason_panel_closed', RIDER_MOVING: 'reason_rider_moving',
  REVISION_CONFLICT: 'reason_revision_conflict', INSTANCE_CHANGED: 'reason_instance_changed', VALUE_OUT_OF_RANGE: 'reason_value_out_of_range',
  BRIDGE_BUSY: 'reason_bridge_busy', OPERATION_UNKNOWN: 'reason_operation_unknown', PC_UNREACHABLE: 'reason_pc_unreachable',
  AUTH_REQUIRED: 'reason_auth_required', PAIRING_PIN_INVALID: 'reason_pin_invalid', PAIRING_PIN_EXPIRED: 'reason_pin_expired',
  BRIDGE_CHANGED: 'reason_bridge_changed', SAVE_TOO_SHORT: 'reason_save_too_short', FIT_INVALID: 'reason_fit_invalid',
  GAME_RUNNING: 'reason_game_running', OPERATION_IN_PROGRESS: 'reason_operation_in_progress',
  BRIDGE_IDENTITY_CHANGED: 'reason_tls_verification', BRIDGE_FINGERPRINT_REQUIRED: 'reason_tls_fingerprint',
  BRIDGE_KEY_UNAVAILABLE: 'pwa_bridge_key_unavailable',
  TLS_VERIFICATION_FAILED: 'reason_tls_verification', QR_INVALID: 'reason_qr_invalid', QR_USED: 'reason_qr_used',
  QR_SCAN_UNAVAILABLE: 'reason_qr_scan_unavailable', QR_PORT_MISMATCH: 'pwa_qr_port_mismatch',
  RIDER_NOT_ON_BIKE: 'reason_rider_not_on_bike', ADDON_NO_POINTS: 'reason_addon_no_points', ADDON_BUSY: 'reason_addon_busy', ADDON_UNSAVED: 'addons_unsaved',
  VALUE_NOT_ALLOWED: 'reason_value_not_allowed', NOT_FOUND: 'reason_not_found',
};
const reason = code => t(reasonKeys[code] ?? 'reason_unknown');

const iconSvg = {
  ride: '<path d="M9 17 A4 4 0 1 1 1 17 A4 4 0 1 1 9 17 M23 17 A4 4 0 1 1 15 17 A4 4 0 1 1 23 17 M5 17 L9 8 L15 17 L5 17 M9 8 L16 8 M19 17 L15 4 L18 4 M7 8 L11 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  routes: '<path d="M6 19 C6 13 18 15 18 9 C18 6.5 15 5 12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="6" cy="17.2" r="1.8" fill="currentColor"/><path d="M9 6 L12 3.5 L12 8.5 Z" fill="currentColor"/>',
  training: '<path d="M3 20h3v-6h-3z M8 20h3v-11h-3z M13 20h3v-8h-3z M18 20h3v-14h-3z" fill="currentColor"/>',
  devices: '<path d="M12 2 L12 22 M12 2 L18 7 L6 17 M12 22 L18 17 L6 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  actions: '<path d="M12 4v1M12 11.5v1M12 19v1" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>',
  back: '<path d="M15 5 L8 12 L15 19 M8 12 L21 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  autopilot: '<path d="M3 10 L21 3 L14 21 L11 13 Z M11 13 L21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  camera: '<path d="M3 7 L7 7 L9 4 L15 4 L17 7 L21 7 L21 20 L3 20 Z M16 13 A4 4 0 1 1 8 13 A4 4 0 1 1 16 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  bolt: '<path d="M13 2 L4 14 L11 14 L10 22 L20 9 L13 9 Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  gamepad: '<path d="M7 6 L17 6 Q20 6 21 11 L22 17 Q22 21 18 18 L16 16 L8 16 L5 19 Q1 21 2 16 L3 10 Q4 6 7 6 M6 10 L6 14 M4 12 L8 12 M16 11 L16.1 11 M19 13 L19.1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  globe: '<path d="M21 12 A9 9 0 1 1 3 12 A9 9 0 1 1 21 12 M3 12 L21 12 M12 3 Q4 12 12 21 M12 3 Q20 12 12 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  person: '<path d="M16 7 A4 4 0 1 1 8 7 A4 4 0 1 1 16 7 M4 22 L4 19 Q4 14 12 14 Q20 14 20 19 L20 22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  settings: '<path d="M12 3 L14 6 L18 6 L18 10 L21 12 L18 14 L18 18 L14 18 L12 21 L10 18 L6 18 L6 14 L3 12 L6 10 L6 6 L10 6 Z M15 12 A3 3 0 1 1 9 12 A3 3 0 1 1 15 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  info: '<path d="M21 12 A9 9 0 1 1 3 12 A9 9 0 1 1 21 12 M12 11 L12 17 M12 7 L12 7.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
};
const icon = name => `<svg class="ui-icon nav-icon" viewBox="0 0 24 24" aria-hidden="true">${iconSvg[name] ?? ''}</svg>`;

const fmt = (value, decimals = 0) => Number(value).toLocaleString(preferences.language === 'es' ? 'es-CO' : 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const duration = ms => {
  const seconds = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

const metricUnits = {
  powerW: 'unit_watts', cadenceRpm: 'unit_rpm', heartRateBpm: 'unit_bpm',
  speedMps: preferences.units === 'metric' ? 'unit_kmh' : 'unit_mph',
  distanceM: preferences.units === 'metric' ? 'unit_km' : 'unit_mi',
  elevationGainM: preferences.units === 'metric' ? 'unit_m' : 'unit_ft',
  slopeFraction: 'unit_percent',
};

const metricText = (metric, key) => {
  const unit = t(metricUnits[key] ?? '');
  if (metric?.value == null) return { value: t('metric_missing'), unit: key.endsWith('TimeMs') ? '' : unit, note: metric?.reasonCode ? reason(metric.reasonCode) : '' };
  const value = metric.value;
  let converted = value;
  let decimals = 0;
  if (key === 'speedMps') { converted *= preferences.units === 'metric' ? 3.6 : 2.236936; decimals = 1; }
  if (key === 'distanceM') { converted /= preferences.units === 'metric' ? 1000 : 1609.344; decimals = 2; }
  if (key === 'elevationGainM' && preferences.units === 'imperial') converted *= 3.28084;
  if (key === 'slopeFraction') { converted *= 100; decimals = 1; }
  return { value: key.endsWith('TimeMs') ? duration(value) : fmt(converted, decimals), unit: key.endsWith('TimeMs') ? '' : unit, note: metric.quality === 'stale' ? t('metric_stale_label') : '' };
};

const topLevel = ['ride', 'routes', 'training', 'devices'];
const drawerItems = [
  { id: 'profile', label: 'companion_drawer_profile', icon: 'person' },
  { id: 'garage', label: 'companion_drawer_garage', icon: 'ride' },
  { id: 'physics', label: 'companion_drawer_physics', icon: 'bolt' },
  { id: 'environment', label: 'companion_drawer_environment', icon: 'globe' },
  { id: 'controls', label: 'companion_drawer_controls', icon: 'gamepad' },
  { id: 'addons', label: 'more_addons', icon: 'bolt' },
  { id: 'waypoints', label: 'companion_waypoints', icon: 'routes' },
  { id: 'sensor-settings', label: 'companion_drawer_sensors', icon: 'devices' },
  { id: 'preferences', label: 'companion_preferences', icon: 'settings' },
  { id: 'system', label: 'companion_drawer_system', icon: 'settings' },
  { id: 'connect', label: 'companion_drawer_connection', icon: 'autopilot' },
  { id: 'about', label: 'companion_drawer_about', icon: 'info' },
];

const demoDeviceRoles = {
  revision: 'demo-devices',
  reasonCode: null,
  roles: [
    { role: 'power', visible: true, current: { deviceId: '12345', source: { name: 'ANT' }, sensorType: 'trainer', name: 'Wahoo KICKR' }, policy: 'AUTO', canAuto: false, canLock: true, canSkip: true },
    { role: 'resistance', visible: true, current: { deviceId: '12345', source: { name: 'ANT' }, sensorType: 'trainer', name: 'Wahoo KICKR' }, policy: 'AUTO', canAuto: false, canLock: true, canSkip: true },
    { role: 'cadence', visible: true, current: { deviceId: '12345', source: { name: 'ANT' }, sensorType: 'trainer', name: 'Wahoo KICKR' }, policy: 'AUTO', canAuto: false, canLock: true, canSkip: true },
    { role: 'heartRate', visible: true, current: { deviceId: '67890', source: { name: 'BLE' }, sensorType: 'hr', name: 'Polar H10' }, policy: 'AUTO', canAuto: false, canLock: true, canSkip: true },
    { role: 'steering', visible: true, current: null, policy: 'AUTO', canAuto: false, canLock: false, canSkip: false },
    { role: 'controls', visible: true, current: null, policy: 'AUTO', canAuto: false, canLock: false, canSkip: false },
  ],
};

const ui = {
  camera: null, cameraError: null,
  cameraHeadingDraft: null, cameraPitchDraft: null,
  sheet: null, drawerOpen: false,
  query: '', routes: null, route: null, loop: true, reverse: false, preview: null,
  plans: null, workouts: null, workout: null, progress: null,
  activities: null, activity: null, settings: null, options: null, draft: null, profileDraft: null,
  deviceRoles: null,
  keyProperty: 'MenuKey', keyDraft: '',
  riders: null, map: null, mapUrl: null,
  addons: null, addonProgress: null, addonDraft: {}, addonDraftFor: null,
  error: null, busy: false, demoTick: 0, bridgePort: 8788, bridgeTransport: 'https', bridgeFingerprint: '',
};

const path = () => decodeURIComponent(location.hash.slice(1) || (client.mode === 'setup' ? 'connect' : 'ride'));
const parts = () => path().split('/');

const demoMetric = (value, source = 'game') => ({ value, quality: 'valid', source });
function snapshot() {
  if (client.mode !== 'demo') return client.state;
  const x = ui.demoTick;
  const power = Math.round(185 + 35 * Math.sin(x / 6) + 12 * Math.sin(x / 1.7));
  return {
    adapterInstanceId: 'demo-adapter', modVersion: '0.8.0.4', bindingProfile: 'gtbikev-0804', snapshotAgeMs: 180,
    layers: { adapter: 'fresh', binding: 'compatible', mod: 'dataReady', antReceiver: 'ready', bleReceiver: 'ready', gameControl: 'inControl' },
    metrics: {
      powerW: demoMetric(power, 'ANT'), speedMps: demoMetric(8.5 + .8 * Math.sin(x / 9)),
      cadenceRpm: demoMetric(Math.round(88 + 4 * Math.sin(x / 4)), 'ANT'), heartRateBpm: demoMetric(Math.round(134 + 6 * Math.sin(x / 20)), 'BLE'),
      distanceM: demoMetric(1050.4 + 8.5 * x), ridingTimeMs: demoMetric(180000 + x * 1000),
      movingTimeMs: demoMetric(176000 + x * 1000), elevationGainM: demoMetric(12.4 + .05 * x), slopeFraction: demoMetric(.021 + .015 * Math.sin(x / 15)),
    }, workout: { present: false, finished: null }, activeRoute: { id: '35', loop: true, reverse: false },
    sensors: [
      { role: 'power', present: true, source: { name: 'ANT' }, deviceId: '12345', name: 'Wahoo KICKR' },
      { role: 'heartRate', present: true, source: { name: 'BLE' }, deviceId: '67890', name: 'Polar H10' },
      { role: 'cadence', present: true, source: { name: 'ANT' }, deviceId: '12345', name: 'Wahoo KICKR' },
    ],
  };
}

const capability = name => client.mode === 'demo' ? { available: false, reasonCode: 'DEMO_MODE' } : client.capability(name) ?? { available: false, reasonCode: client.lastError ?? 'ADAPTER_ABSENT' };
const helpButton = key => preferences.showHelpIcons ? `<button class="help-button" type="button" data-action="help" data-help="${esc(key)}" aria-label="${T('more_help_topics')}: ${esc(helpTopics[key] ? t(helpTopics[key].title) : key)}">?</button>` : '';
const screenHeader = (key, help) => `<div class="screen-header"><h1>${T(key)}</h1>${help ? helpButton(help) : ''}</div>`;
const card = (title, body, help) => `<section class="card"><div class="card-head"><h2>${esc(title)}</h2>${help ? helpButton(help) : '<span style="width:40px"></span>'}</div><div class="card-body">${body}</div></section>`;
const statusLine = (label, value, tone = 'neutral') => `<div class="status-line" style="--tone:var(--${tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'error' : 'muted'})"><span class="status-dot"></span><span class="status-label">${esc(label)}</span><span class="status-value" title="${esc(value)}">${esc(value)}</span></div>`;
const button = (label, action, { primary = false, full = false, large = false, disabled = false, data = '' } = {}) => `<button class="button ${primary ? 'primary' : ''} ${full ? 'full' : ''} ${large ? 'large' : ''}" type="button" data-action="${action}" ${data} ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;
const textButton = (label, action, data = '') => `<button class="button text" type="button" data-action="${action}" ${data}>${esc(label)}</button>`;
const radio = (name, options, selected, disabled = false) => options.map(([value, label]) => `<label class="radio-row"><input type="radio" name="${esc(name)}" value="${esc(value)}" ${String(value) === String(selected) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${esc(label)}</span></label>`).join('');
const field = (name, label, value, { type = 'text', min, max, step, disabled = false, hint = '', inputmode, maxLength, pattern, autocomplete } = {}) => `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(value ?? '')}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} ${step != null ? `step="${step}"` : ''} ${inputmode ? `inputmode="${esc(inputmode)}"` : ''} ${maxLength ? `maxlength="${maxLength}"` : ''} ${pattern ? `pattern="${esc(pattern)}"` : ''} ${autocomplete ? `autocomplete="${esc(autocomplete)}"` : ''} ${disabled ? 'disabled' : ''}><small>${esc(hint)}</small></label>`;
const listRow = (title, subtitle, action, data = '') => `<button class="list-row" type="button" data-action="${action}" ${data}><span class="row-copy"><strong>${esc(title)}</strong><small>${esc(subtitle ?? '')}</small></span><span class="chevron">›</span></button>`;
const sheetLink = (label, action, data = '') => `<button class="sheet-link" type="button" data-action="${action}" ${data}><span>${esc(label)}</span><span class="chevron">›</span></button>`;
const banner = () => client.mode === 'demo' ? `<div class="demo-banner">${T('companion_demo_banner_short')}</div>` : '';
const errorText = code => code ? `<p class="error">${esc(reason(code))}</p>` : '';

function pcStatusLabel() {
  if (client.mode === 'demo') return t('companion_demo');
  if (client.mode === 'live' && !client.lastError) return t('companion_pc_connected');
  if (client.lastError === 'AUTH_REQUIRED') return t('companion_pc_unpaired');
  if (ui.busy) return t('companion_pc_connecting');
  return t('companion_pc_offline');
}

function modStatusLabel() {
  const state = snapshot();
  const mod = state?.layers?.mod;
  if (client.mode === 'demo') return t('companion_mod_active');
  if (!state || state.layers?.adapter === 'stale') return t('companion_mod_unknown');
  if (mod === 'dataReady') return t('companion_mod_active');
  if (mod === 'inactive') return t('companion_mod_inactive');
  return t('companion_mod_unknown');
}

let toastTimer;
function toast(msg) {
  const node = $('#toast');
  node.textContent = msg;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3800);
}

function dialog(title, body, onConfirm, confirmLabel = t('action_confirm')) {
  $('#dialog-content').innerHTML = `<div class="dialog-content"><h2>${esc(title)}</h2><p>${esc(body)}</p><div class="dialog-actions">${textButton(t('action_cancel'), 'close-dialog')}${button(confirmLabel, 'confirm-dialog', { primary: true })}</div></div>`;
  ui.confirm = onConfirm;
  $('#dialog').showModal();
}

function message(title, body) {
  $('#dialog-content').innerHTML = `<div class="dialog-content"><h2>${esc(title)}</h2><p>${esc(body)}</p><div class="dialog-actions">${button(t('action_back'), 'close-dialog', { primary: true })}</div></div>`;
  ui.confirm = null;
  $('#dialog').showModal();
}

const navigate = destination => {
  ui.drawerOpen = false;
  if (destination === 'ride') ui.sheet = null;
  if (path() === destination) { loadPage(); return; }
  location.hash = destination;
};

const polar = (angle, radius = 91) => ({ x: 120 + radius * Math.cos(angle * Math.PI / 180), y: 120 + radius * Math.sin(angle * Math.PI / 180) });
const arc = (start, sweep, radius = 91) => { const a = polar(start, radius), b = polar(start + sweep, radius); return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`; };
function gauge(metric, ftp) {
  const m = metricText(metric, 'powerW');
  const live = metric?.quality === 'valid' && metric.value != null;
  const bounds = [0, .55, .75, .9, 1.05, 1.2, 1.5, 1.6];
  const zone = live && ftp ? Math.min(7, bounds.slice(1, -1).findIndex(bound => metric.value / ftp <= bound) + 1 || 7) : null;
  const bands = ftp ? bounds.slice(0, -1).map((low, index) => `<path d="${arc(150 + low / 1.6 * 240, (bounds[index + 1] - low) / 1.6 * 240)}" stroke="var(--zone-${index + 1})" stroke-width="12" opacity="${zone === index + 1 ? '1' : '.35'}" fill="none"/>`).join('') : '';
  const fraction = live ? Math.min(1, metric.value / (ftp ? ftp * 1.6 : 600)) : null;
  const point = fraction == null ? null : polar(150 + 240 * fraction);
  return `<div class="gauge" role="img" aria-label="${esc(`${m.value} ${m.unit}${zone ? `, ${t('power_zone', zone)}` : ''}`)}"><svg viewBox="0 0 240 240" aria-hidden="true"><path d="${arc(150, 240)}" stroke="var(--surface-high)" stroke-width="18" stroke-linecap="round" fill="none"/>${bands}${point ? `<circle cx="${point.x}" cy="${point.y}" r="7" fill="var(--text)"/>` : ''}</svg><div class="gauge-center"><div class="gauge-value"><strong>${esc(m.value)}</strong><small>${esc(m.unit)}</small></div>${zone ? `<div class="gauge-zone" style="--zone:var(--zone-${zone})"><span class="zone-dot"></span>${T('power_zone', zone)}</div>` : m.note ? `<div class="gauge-zone muted">${esc(m.note)}</div>` : ''}</div></div>`;
}

function rideMetric(key, labelKey, metric, primary = false, help = null) {
  const m = metricText(metric, key);
  return `<div class="ride-metric ${primary ? 'primary' : ''}"><div class="ride-metric-head"><span>${T(labelKey)}</span>${help ? helpButton(help) : ''}</div><div class="metric-val"><strong>${esc(m.value)}</strong>${m.unit ? `<small>${esc(m.unit)}</small>` : ''}</div>${m.note ? `<div class="muted small">${esc(m.note)}</div>` : ''}</div>`;
}

function cameraState() {
  return cameraControlState(ui.camera, Object.fromEntries(['camera.next', 'camera.setMode', 'camera.look'].map(key => [key, capability(key)])),
    client.mode === 'demo' || client.mode === 'live' && !client.lastError, ui.busy, client.lastError === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'PC_UNREACHABLE');
}

function rideScreen() {
  const state = snapshot(), metrics = state?.metrics ?? {}, layers = state?.layers ?? {};
  const ftp = client.mode === 'demo' ? 250 : ui.settings?.profile?.ftpW?.value ?? null;
  const autopilotObserved = ui.settings?.ride?.autopilot?.value;
  const autopilotCap = capability('rideSettings.update');
  const autopilotActive = autopilotObserved === true;
  const autopilotSubtitle = ui.busy ? t('companion_pending') : autopilotActive ? t('companion_active') : autopilotObserved === false ? t('companion_inactive') : t('companion_unknown');

  const cState = cameraState();
  const currentCameraMode = cState.currentMode ? t(cameraModeKeys[cState.currentMode]) : t('companion_unknown');

  return `<div class="screen">
    ${banner()}
    ${client.lastError === 'AUTH_REQUIRED' ? card(t('pair_again_title'), `${errorText(client.lastError)}${button(t('more_connection'), 'navigate', { full: true, data: 'data-to="connect"' })}`) : ''}
    ${layers.adapter === 'stale' ? `<p class="accent">${T('state_stale')} · ${fmt(Math.floor((state.snapshotAgeMs ?? 0) / 1000))} s</p>` : ''}
    <div class="telemetry-card">
      <div class="telemetry-primary">
        ${rideMetric('speedMps', 'metric_speed', metrics.speedMps, true, 'metrics.speed')}
        ${rideMetric('powerW', 'metric_power', metrics.powerW, true, 'metrics.power')}
      </div>
      <hr class="telemetry-divider">
      <div class="telemetry-secondary">
        ${rideMetric('cadenceRpm', 'metric_cadence', metrics.cadenceRpm, false, 'metrics.cadence')}
        ${rideMetric('heartRateBpm', 'metric_heart_rate', metrics.heartRateBpm, false, 'metrics.heartRate')}
        ${rideMetric('distanceM', 'metric_distance', metrics.distanceM, false)}
        ${rideMetric('ridingTimeMs', 'metric_riding_time', metrics.ridingTimeMs, false, 'metrics.time')}
      </div>
    </div>

    <div class="action-deck">
      <button class="action-tile ${autopilotActive ? 'active' : ''}" type="button" data-action="toggle-autopilot" ${autopilotCap.available && !ui.busy ? '' : 'disabled'}>
        <span class="action-tile-icon">${iconSvg.autopilot}</span>
        <span class="action-tile-title">${T('companion_autopilot_short')}</span>
        <span class="action-tile-subtitle">${esc(autopilotSubtitle)}</span>
      </button>

      <button class="action-tile" type="button" data-action="open-sheet" data-sheet="camera">
        <span class="action-tile-icon">${iconSvg.camera}</span>
        <span class="action-tile-title">${T('companion_camera_short')}</span>
        <span class="action-tile-subtitle">${esc(currentCameraMode)}</span>
      </button>

      <button class="action-tile unavailable" type="button" data-action="open-sheet" data-sheet="unsupported">
        <span class="action-tile-icon">${iconSvg.bolt}</span>
        <span class="action-tile-title">${T('companion_erg')}</span>
        <span class="action-tile-subtitle">${T('companion_unavailable')}</span>
      </button>

      <button class="action-tile unavailable" type="button" data-action="open-sheet" data-sheet="menu">
        <span class="action-tile-icon">${iconSvg.gamepad}</span>
        <span class="action-tile-title">${T('companion_game_menu')}</span>
        <span class="action-tile-subtitle">${T('companion_unavailable')}</span>
      </button>
    </div>

    ${!autopilotCap.available && autopilotCap.reasonCode ? `<p class="small muted">${esc(reason(autopilotCap.reasonCode))}</p>` : ''}

    <div class="action-deck-buttons">
      ${button(t('companion_details_short'), 'open-sheet', { full: true, data: 'data-sheet="details"' })}
      ${button(t('companion_actions_short'), 'open-sheet', { full: true, data: 'data-sheet="actions"' })}
    </div>
  </div>`;
}

function renderDetailsSheet() {
  const state = snapshot(), metrics = state?.metrics ?? {}, layers = state?.layers ?? {};
  const ftp = client.mode === 'demo' ? 250 : ui.settings?.profile?.ftpW?.value ?? null;
  const adapterValue = layers.adapter === 'absent' ? t('state_absent') : layers.adapter === 'stale' ? t('state_stale') : layers.binding === 'incompatible' ? t('state_incompatible') : t('state_fresh');
  const modLabels = { inactive: 'state_mod_inactive', initializing: 'state_mod_initializing', dataReady: 'state_mod_ready', stopping: 'state_mod_stopping', error: 'state_error', unknown: 'state_unknown' };
  const receiver = value => ({ uninitialized: 'state_receiver_uninitialized', initialized: 'state_receiver_starting', started: 'state_receiver_starting', complete: 'state_receiver_starting', ready: 'state_receiver_ready', stopping: 'state_receiver_stopping', stopped: 'state_receiver_stopped', error: 'state_error', unknown: 'state_unknown' })[value] ?? 'state_unknown';

  const layersStatus = statusLine(t('layer_bridge'), pcStatusLabel(), client.lastError ? 'warn' : 'good')
    + statusLine(t('layer_adapter'), adapterValue, layers.adapter === 'fresh' ? 'good' : 'warn')
    + statusLine(t('layer_mod'), t(modLabels[layers.mod] ?? 'state_unknown'), layers.mod === 'dataReady' ? 'good' : 'warn')
    + (layers.antReceiver && layers.antReceiver !== 'unknown' ? statusLine(t('layer_ant'), t(receiver(layers.antReceiver)), layers.antReceiver === 'ready' ? 'good' : 'neutral') : '')
    + (layers.bleReceiver && layers.bleReceiver !== 'unknown' ? statusLine(t('layer_ble'), t(receiver(layers.bleReceiver)), layers.bleReceiver === 'ready' ? 'good' : 'neutral') : '');

  const sensors = state?.sensors ?? [];
  const sensorsHtml = sensors.length ? sensors.map(s => statusLine(roleLabel(s.role), s.present ? `${s.name ?? t('sensor_present', s.source?.name ?? 'ANT', s.deviceId)} · ${s.source?.name ?? ''}` : t('sensor_absent'), s.present ? 'good' : 'neutral')).join('') : `<p class="muted">${T('sensor_unknown')}</p>`;

  return `<h2>${T('companion_ride_details')}</h2>
    ${gauge(metrics.powerW, ftp)}
    <div class="telemetry-card">
      <div class="telemetry-secondary">
        ${rideMetric('movingTimeMs', 'metric_moving_time', metrics.movingTimeMs, false, 'metrics.movingTime')}
        ${rideMetric('elevationGainM', 'metric_elevation_gain', metrics.elevationGainM, false, 'metrics.elevation')}
        ${rideMetric('slopeFraction', 'metric_grade', metrics.slopeFraction, false)}
      </div>
    </div>
    ${card(t('status_title'), layersStatus, 'connection.status')}
    ${card(t('sensors_title'), sensorsHtml + button(t('devices_manage'), 'navigate', { full: true, data: 'data-to="devices"' }), 'devices.missing')}`;
}

function renderActionsSheet() {
  const state = snapshot(), layers = state?.layers ?? {};
  const modCap = capability('mod.setActive');
  const modActive = layers.mod === 'dataReady' || layers.mod === 'initializing';

  const modCard = card(t('layer_mod'), `<div class="setting-row"><div class="setting-copy"><p>${T('mod_active_label')}</p>${!modCap.available ? `<small class="reason">${esc(reason(modCap.reasonCode))}</small>` : ''}</div>${helpButton(modActive ? 'mod.deactivate' : 'mod.activate')}<input class="switch" type="checkbox" data-action="mod-toggle" aria-label="${T('mod_active_label')}" ${modActive ? 'checked' : ''} ${modCap.available && !ui.busy ? '' : 'disabled'}></div>`, null);

  return `<h2>${T('companion_actions')}</h2>
    ${modCard}
    ${sheetLink(t('companion_map'), 'open-sheet', 'data-sheet="map"')}
    ${sheetLink(t('activity_save_section'), 'navigate', 'data-to="activities"')}
    ${sheetLink(t('more_riders'), 'navigate', 'data-to="riders"')}
    ${sheetLink(t('more_addons'), 'navigate', 'data-to="addons"')}
    <hr class="drawer-divider">
    ${sheetLink(t('companion_new_destination'), 'open-sheet', 'data-sheet="unsupported"')}
    ${sheetLink(t('companion_brake'), 'open-sheet', 'data-sheet="unsupported"')}
    ${sheetLink(t('companion_gears'), 'open-sheet', 'data-sheet="gears"')}`;
}

function renderCameraSheet() {
  const s = cameraState(), c = ui.camera;
  const heading = ui.cameraHeadingDraft ?? c?.headingDeg ?? 0;
  const pitch = ui.cameraPitchDraft ?? c?.pitchDeg ?? 0;

  const modes = ['near', 'medium', 'far', 'firstPerson', 'cinematic'];
  const chipsHtml = modes.map(mode => {
    const isAvailable = s.modes.includes(mode);
    const isCurrent = s.currentMode === mode;
    return `<button class="chip ${isCurrent ? 'active' : ''}" type="button" data-action="camera-mode" data-mode="${mode}" ${!isAvailable || s.modeBlock ? 'disabled' : ''}>${T(cameraModeKeys[mode])}</button>`;
  }).join('');

  return `<h2>${T('camera_title')}</h2>
    <p class="small muted">${T('camera_current', s.currentMode ? t(cameraModeKeys[s.currentMode]) : t('metric_missing'))}</p>
    <div class="chip-grid">${chipsHtml}</div>
    ${s.nextBlock ? `<p class="small muted">${esc(ui.cameraError === 'NOT_FOUND' ? t('camera_bridge_update') : reason(s.nextBlock))}</p>` : ''}
    <div class="button-row">
      ${button(t('camera_left'), 'camera-left', { disabled: !!s.lookBlock })}
      ${button(t('camera_right'), 'camera-right', { disabled: !!s.lookBlock })}
      ${button(t('camera_center'), 'camera-center', { disabled: !!s.lookBlock })}
    </div>
    ${button(t('camera_next'), 'camera-next', { full: true, disabled: !!s.nextBlock })}
    <div class="expandable-section" id="camera-advanced-section">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="camera-advanced-section">
        <span class="expand-title">${T('companion_camera_advanced')}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">${T('companion_camera_no_distance')}</p>
        <div class="options-slider">
          <label><span>${T('camera_heading')}</span><output id="cam-head-out">${fmt(heading)}°</output></label>
          <input type="range" data-action="camera-heading" min="-180" max="180" step="1" value="${heading}" ${s.lookBlock ? 'disabled' : ''}>
        </div>
        <div class="options-slider">
          <label><span>${T('camera_pitch')}</span><output id="cam-pitch-out">${fmt(pitch)}°</output></label>
          <input type="range" data-action="camera-pitch" min="-45" max="45" step="1" value="${pitch}" ${s.lookBlock ? 'disabled' : ''}>
        </div>
        ${button(t('companion_camera_reset'), 'camera-reset', { full: true, disabled: !!s.lookBlock })}
        <p class="small muted">${T('companion_camera_reset_hint')}</p>
      </div>
    </div>`;
}

function renderMenuSheet() {
  return `<h2>${T('companion_game_menu')}</h2>
    <p class="notice warn">${T('companion_bridge_extension')}</p>
    ${button(t('companion_open_menu'), '', { full: true, disabled: true })}
    <div class="dpad-container">
      <button class="dpad-button" disabled aria-label="${T('companion_up')}">↑</button>
      <div class="dpad-row">
        <button class="dpad-button" disabled aria-label="${T('companion_left')}">←</button>
        <button class="dpad-button" disabled aria-label="${T('companion_select')}">✓</button>
        <button class="dpad-button" disabled aria-label="${T('companion_right')}">→</button>
      </div>
      <button class="dpad-button" disabled aria-label="${T('companion_down')}">↓</button>
    </div>
    ${button(t('companion_cancel'), '', { full: true, disabled: true })}
    <h3>${T('companion_dialog')}</h3>
    <div class="button-row">
      ${button(t('companion_select'), '', { disabled: true })}
      ${button(t('companion_cancel'), '', { disabled: true })}
    </div>`;
}

function renderMapSheet() {
  return `<h2>${T('companion_map')}</h2>${mapCard()}`;
}

function renderGearsSheet() {
  return `<h2>${T('companion_gears')}</h2><p class="notice warn">${T('companion_gears_unavailable')}</p>`;
}

function renderUnsupportedSheet() {
  return `<h2>${T('companion_not_supported')}</h2><p class="notice warn">${T('companion_bridge_extension')}</p>`;
}

function roleLabel(role) {
  const map = {
    power: 'sensor_role_power',
    resistance: 'sensor_role_resistance',
    cadence: 'sensor_role_cadence',
    heartRate: 'sensor_role_heart_rate',
    speed: 'sensor_role_speed',
    steering: 'sensor_role_steering',
    controls: 'sensor_role_controls',
  };
  return t(map[role] ?? role);
}

function devicesScreen() {
  const rolesDoc = client.mode === 'demo' ? demoDeviceRoles : ui.deviceRoles;
  const roles = rolesDoc?.roles ?? [];

  const rolesHtml = roles.filter(r => r.visible !== false).map(role => {
    const current = role.current;
    const curText = current
      ? (current.name ? `${current.name} · ${current.source?.name ?? ''}` : `${t('sensor_present', current.source?.name ?? 'ANT', current.deviceId ?? '')} · ${current.sensorType ?? ''}`)
      : t('devices_none');
    const policyMap = { AUTO: 'devices_policy_auto', LOCKED: 'devices_policy_locked', FILTERED: 'devices_policy_filtered' };
    const polText = t(policyMap[role.policy] ?? 'devices_policy_auto');
    const roleId = `role-${role.role}`;

    return `<div class="expandable-section open" id="${roleId}">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="${roleId}">
        <span class="expand-title">${esc(roleLabel(role.role))} · ${esc(current?.name ?? current?.source?.name ?? t('devices_none'))}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        ${statusLine(t('devices_current'), curText, current ? 'good' : 'neutral')}
        ${statusLine(t('devices_policy'), polText)}
        <div class="button-row">
          ${button(t('devices_policy_auto'), 'device-action', { data: `data-role="${esc(role.role)}" data-dev-action="auto"`, disabled: !role.canAuto || ui.busy })}
          ${button(t('devices_policy_locked'), 'device-action', { data: `data-role="${esc(role.role)}" data-dev-action="lock"`, disabled: !role.canLock || ui.busy })}
          ${button(t('devices_policy_filtered'), 'device-action', { data: `data-role="${esc(role.role)}" data-dev-action="skip"`, disabled: !role.canSkip || ui.busy })}
        </div>
      </div>
    </div>`;
  }).join('');

  return `<div class="screen">
    ${banner()}
    ${screenHeader('nav_devices', 'devices.policy')}
    <p>${T('companion_sensor_pc')}</p>
    <div class="expandable-section" id="sensor-ownership-section">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="sensor-ownership-section">
        <span class="expand-title">${T('companion_training_profile')}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">${T('companion_sensor_ownership')}</p>
      </div>
    </div>
    <div class="button-row">
      ${button(t('devices_phone_scan'), 'phone-scan-info', { full: true })}
      ${helpButton('devices.phoneScan')}
    </div>
    ${errorText(ui.error)}
    ${rolesDoc ? rolesHtml : `<p>${T('loading')}</p>`}
  </div>`;
}

function trainingScreen(planId, workoutId) {
  const plans = client.mode === 'demo' ? demoPlans : ui.plans;
  const progress = ui.progress;
  const activeCard = progress?.present ? card(t('training_active_on_pc'), `<h3>${esc(progress.name ?? '—')}</h3>${statusLine(t('training_status'), t(progress.finished ? 'training_status_finished' : progress.inCountdown ? 'training_status_countdown' : progress.started ? 'training_status_running' : 'training_status_waiting'))}${progress.total ? `<div class="progress-track"><span style="width:${Math.min(100, Math.max(0, (progress.elapsed ?? 0) / progress.total * 100))}%"></span></div>${statusLine(t('training_remaining'), duration((progress.total - (progress.elapsed ?? 0)) * 1000))}` : ''}<p class="small muted">${T('training_pc_controls')}</p>`, 'training.progress') : '';

  const sensorCount = snapshot()?.sensors?.filter(s => s.present)?.length ?? 0;
  const overviewCard = card(t('companion_training_profile'), `
    <p><strong>${T('companion_profile_summary', ui.settings?.profile?.weightKg?.value ?? t('metric_missing'), ui.settings?.profile?.ftpW?.value ?? t('metric_missing'))}</strong></p>
    <div class="button-row">
      ${button(t('companion_drawer_profile'), 'navigate', { data: 'data-to="profile"' })}
      ${button(sensorCount ? t('companion_sensor_count_other', sensorCount) : t('sensors_title'), 'navigate', { data: 'data-to="devices"' })}
    </div>
  `);
  const historyButton = button(t('companion_training_history'), 'navigate', { full: true, data: 'data-to="activities"' });

  const prefix = `<div class="screen">${banner()}${overviewCard}${historyButton}${screenHeader('training_title', 'training.catalog')}<p class="accent">${T('training_read_only')}</p>${activeCard}${errorText(ui.error)}`;

  if (workoutId) {
    const workout = client.mode === 'demo' ? { workout: { ...demoWorkouts.find(item => item.id === workoutId), description: '', segments: [] }, ftpReferenceW: 250 } : ui.workout;
    const w = workout?.workout;
    if (!w) return prefix + `${T('loading')}</div>`;
    const cap = capability('workouts.select');
    const max = Math.max(1, ...w.segments.map(s => s.endPowerW ?? s.startPowerW ?? 0));
    const profile = w.segments.length ? `<div class="profile-chart" aria-label="${T('training_profile_description', w.segments.length)}">${w.segments.map(s => `<span style="--width:${Math.max(1, s.end - s.start)};--height:${Math.max(6, (s.endPowerW ?? s.startPowerW ?? 0) / max * 100)}%"></span>`).join('')}</div>` : '';
    const names = { warmup: 'segment_warmup', cooldown: 'segment_cooldown', interval: 'segment_interval', steady: 'segment_steady', ramp: 'segment_ramp', freeRide: 'segment_free_ride' };
    return prefix + `${textButton(t('action_back'), 'navigate', `data-to="training/plan/${id(w.planId)}"`)}<h2>${esc(w.name)}</h2>${w.author ? `<p>${T('routes_author', w.author)}</p>` : ''}<p>${esc(workoutAmount(w.total, w.durationType))}</p>${w.description ? `<p>${esc(w.description)}</p>` : ''}${profile}<p class="small muted">${T('training_reference_ftp', Math.round(workout.ftpReferenceW ?? 0))}${helpButton('training.reference')}</p>${w.segments.map(s => statusLine(`${s.index + 1}. ${t(names[s.type] ?? 'segment_unknown')} · ${workoutAmount(s.end - s.start, w.durationType)}`, s.startPowerW == null ? '—' : s.startPowerW === s.endPowerW || s.endPowerW == null ? t('training_reference_w', s.startPowerW) : t('training_reference_range_w', s.startPowerW, s.endPowerW))).join('')}<p class="small muted">${T('training_pc_controls')}</p>${!cap.available ? errorText(cap.reasonCode) : ''}${button(t('training_select_start'), 'workout-select', { full: true, large: true, primary: true, disabled: !cap.available || ui.busy })}</div>`;
  }
  if (planId) {
    const workouts = client.mode === 'demo' ? demoWorkouts : ui.workouts?.workouts;
    return prefix + `${textButton(t('action_back'), 'navigate', 'data-to="training"')}${workouts ? workouts.map(w => listRow(w.name, `${workoutAmount(w.total, w.durationType)} · ${t('training_segments', w.segmentCount)}`, 'navigate', `data-to="training/workout/${id(w.id)}"`)).join('') || `<p>${T('training_empty')}</p>` : T('loading')}</div>`;
  }
  return prefix + `${plans ? !plans.ready ? `<p>${T('training_loading_pc')}</p>` : plans.plans.length ? plans.plans.map(p => listRow(p.name, t('training_workout_count', p.workoutCount), 'navigate', `data-to="training/plan/${id(p.id)}"`)).join('') : `<p>${T('training_empty')}</p>` : T('loading')}</div>`;
}

function garageScreen() {
  const bikes = ui.settings?.appearance?.bike?.options ?? [
    { id: 'CarbonBike', label: 'Carbon road bike' },
    { id: 'Scorcher', label: 'Mountain bike' },
    { id: 'Cruiser', label: 'City cruiser' },
    { id: 'Tribike', label: 'Triathlon bike' },
  ];
  const selectedId = ui.settings?.appearance?.bike?.selectedId ?? bikes[0]?.id;
  const appCap = capability('appearance.select');

  const itemsHtml = bikes.map(bike => `
    <div class="garage-card ${bike.id === selectedId ? 'selected' : ''}" data-action="select-bike" data-bike="${esc(bike.id)}">
      <span class="ui-icon">${iconSvg.ride}</span>
      <strong>${esc(bike.label)}</strong>
    </div>
  `).join('');

  return `<div class="screen">
    ${banner()}
    ${screenHeader('companion_drawer_garage', 'appearance.bike')}
    <p class="small muted">${T('companion_garage_hint')}</p>
    <div class="garage-grid">${itemsHtml}</div>
    ${!appCap.available && appCap.reasonCode ? `<p class="small muted">${esc(reason(appCap.reasonCode))}</p>` : ''}
  </div>`;
}

function physicsScreen() {
  const ride = ui.settings?.ride ?? {};
  const rideCap = capability('rideSettings.update');
  const editable = rideCap.available && !ui.busy;

  const difficultyVal = ride.difficulty?.value ?? 50;
  const isResistanceDisabled = difficultyVal === 255;
  const discreteLevel = isResistanceDisabled ? 50 : Math.round(difficultyVal / 25) * 25;

  return `<div class="screen">
    ${banner()}
    ${screenHeader('companion_drawer_physics', 'ride.difficulty')}
    <p class="small muted">${T('companion_physics_hint')}</p>

    ${card(t('pc_settings_ride'), `
      <label class="setting-row">
        <span class="setting-copy"><p>${T('ride_autopilot')}</p></span>
        <input class="switch" type="checkbox" data-action="pc-switch" data-key="autopilot" ${ride.autopilot?.value ? 'checked' : ''} ${editable ? '' : 'disabled'}>
      </label>
      <label class="setting-row">
        <span class="setting-copy"><p>${T('ride_obstacles')}</p></span>
        <input class="switch" type="checkbox" data-action="pc-switch" data-key="avoidObstacles" ${ride.avoidObstacles?.value ? 'checked' : ''} ${editable ? '' : 'disabled'}>
      </label>
      <label class="setting-row">
        <span class="setting-copy"><p>${T('ride_road_feel')}</p><small>${T('companion_road_feel_hint')}</small></span>
        <input class="switch" type="checkbox" data-action="pc-switch" data-key="roadFeel" ${ride.roadFeel?.value ? 'checked' : ''} ${editable ? '' : 'disabled'}>
      </label>

      <hr class="drawer-divider">
      <div class="options-slider">
        <label>
          <span>${T('ride_difficulty')}</span>
          <output id="diff-out">${isResistanceDisabled ? t('ride_difficulty_disabled') : `${discreteLevel}%`}</output>
        </label>
        <input type="range" min="0" max="100" step="25" value="${discreteLevel}" data-action="difficulty-slider" ${editable && !isResistanceDisabled ? '' : 'disabled'}>
        <p class="small muted">${T('companion_difficulty_levels')}</p>
      </div>

      <label class="setting-row">
        <span class="setting-copy"><p>${T('companion_disable_resistance')}</p></span>
        <input class="switch" type="checkbox" data-action="disable-resistance" ${isResistanceDisabled ? 'checked' : ''} ${editable ? '' : 'disabled'}>
      </label>
    `)}

    <div class="expandable-section" id="gears-advanced">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="gears-advanced">
        <span class="expand-title">${T('companion_gears')}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">${T('companion_gears_unavailable')}</p>
      </div>
    </div>

    <div class="expandable-section" id="brake-advanced">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="brake-advanced">
        <span class="expand-title">${T('companion_brake')}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">${T('companion_braking_unavailable')}</p>
      </div>
    </div>
  </div>`;
}

function controlsScreen() {
  const property = ui.keyProperty ?? 'MenuKey';
  const draft = ui.keyDraft ?? '';
  const parsed = parseKeyStrokeList(draft);
  const conflicts = findConflicts(property, draft, officialKeyBindings);
  const isInvalid = draft.trim().length > 0 && parsed === null;
  const hasConflicts = conflicts.length > 0;

  const validationMsg = isInvalid
    ? `<p class="error small">${T('companion_keys_invalid')}</p>`
    : hasConflicts
      ? `<p class="error small">${T('companion_keys_conflict', conflicts.join(', '))}</p>`
      : draft.trim()
        ? `<p class="success small">${T('companion_keys_valid')}</p>`
        : '';

  const referenceList = Object.entries(officialKeyBindings).map(([key, val]) => `
    <div class="status-line">
      <span class="status-label"><strong>${esc(key)}</strong></span>
      <span class="status-value">${esc(val || t('metric_missing'))}</span>
    </div>
  `).join('');

  return `<div class="screen">
    ${banner()}
    ${screenHeader('companion_drawer_controls')}
    ${sheetLink(t('camera_title'), 'open-sheet', 'data-sheet="camera"')}
    ${sheetLink(t('companion_game_menu'), 'open-sheet', 'data-sheet="menu"')}

    ${card(t('companion_keys_preview'), `
      <p class="small muted">${T('companion_keys_preview_hint')}</p>
      <label class="field">
        <span>${T('companion_keys')}</span>
        <select data-action="key-prop-select">
          ${Object.keys(officialKeyBindings).map(k => `<option value="${esc(k)}" ${k === property ? 'selected' : ''}>${esc(k)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>${T('companion_keys_binding')}</span>
        <input type="text" data-action="key-draft-input" value="${esc(draft)}" placeholder="e.g. F5, ZP_Right_Shift(L)">
      </label>
      ${validationMsg}
      ${button(t('companion_not_supported'), '', { full: true, disabled: true })}
    `)}

    <div class="expandable-section" id="keys-reference-section">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="keys-reference-section">
        <span class="expand-title">${T('companion_keys')}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">${T('companion_keys_hint')}</p>
        ${referenceList}
      </div>
    </div>

    <div class="expandable-section" id="keys-advanced-section">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="keys-advanced-section">
        <span class="expand-title">${T('companion_advanced')}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small">${T('companion_keys_modifiers')}</p>
        <p class="small muted">${T('companion_controllers_hint')}</p>
      </div>
    </div>
  </div>`;
}

function sensorSettingsScreen() {
  return `<div class="screen">
    ${banner()}
    ${screenHeader('companion_drawer_sensors', 'devices.policy')}
    <p>${T('companion_sensor_ownership')}</p>
    ${card(t('companion_sensor_pc'), `<p class="small">${T('companion_sensor_special')}</p>`)}
    <div class="expandable-section open" id="ant-profiles">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="ant-profiles">
        <span class="expand-title">ANT+</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">FECDeviceId · PWRDeviceId · HRDeviceId · CADDeviceId · ControlsDeviceId · FPODDeviceId · SPDDeviceId · STEERDeviceId</p>
      </div>
    </div>
    <div class="expandable-section open" id="ble-profiles">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="ble-profiles">
        <span class="expand-title">BLE</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">BPWRDeviceAddr · BHRDeviceAddr · BCADDeviceAddr · BSteerDeviceAddr · BSPDDeviceAddr · BKICKRDeviceAddr · BFTMSDeviceAddr</p>
      </div>
    </div>
    <div class="expandable-section" id="phone-profiles">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="phone-profiles">
        <span class="expand-title">${T('companion_sensor_phone')}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">${T('companion_sensor_phone_none')}</p>
      </div>
    </div>
    <div class="expandable-section" id="bridge-profiles">
      <button class="expandable-head" type="button" data-action="toggle-section" data-target="bridge-profiles">
        <span class="expand-title">${T('companion_sensor_bridge')}</span>
        <span class="expand-arrow">›</span>
      </button>
      <div class="expandable-body">
        <p class="small muted">${T('companion_sensor_bridge_hint')}</p>
      </div>
    </div>
  </div>`;
}

function systemScreen() {
  return `<div class="screen">
    ${screenHeader('companion_drawer_system')}
    ${card(t('companion_drawer_system'), `
      ${sheetLink(t('companion_system_advanced'), 'navigate', 'data-to="game-options/system"')}
      ${sheetLink(t('options_network'), 'navigate', 'data-to="game-options/network"')}
      ${sheetLink(t('diagnostics_title'), 'navigate', 'data-to="diagnostics"')}
      ${sheetLink(t('more_help_topics'), 'navigate', 'data-to="help"')}
    `)}
  </div>`;
}

function preferencesScreen() {
  const helpSetting = `<label class="setting-row"><span class="setting-copy">${T('show_help_icons')}</span><input class="switch" type="checkbox" data-action="show-help-icons" ${preferences.showHelpIcons ? 'checked' : ''}></label>`;
  return `<div class="screen">
    ${screenHeader('companion_preferences')}
    ${card(t('more_language'), radio('language', [['en', t('language_english')], ['es', t('language_spanish')]], preferences.language), 'app.language')}
    ${card(t('more_theme'), radio('theme', [['system', t('theme_system')], ['dark', t('theme_dark')], ['light', t('theme_light')]], preferences.theme), 'app.theme')}
    ${card(t('more_units'), radio('units', [['metric', t('units_metric')], ['imperial', t('units_imperial')]], preferences.units), 'app.units')}
    ${card(t('more_section_help'), helpSetting + sheetLink(t('more_help_topics'), 'navigate', 'data-to="help"') + sheetLink(t('diagnostics_title'), 'navigate', 'data-to="diagnostics"'), 'diagnostics.local')}
  </div>`;
}

function aboutScreen() {
  return `<div class="screen">
    ${screenHeader('companion_drawer_about')}
    ${card(t('app_name'), `
      <p><strong>${T('about_version', `${APP_VERSION} · PWA`)}</strong></p>
      <p class="small muted">${T('welcome_unofficial')}</p>
    `)}
  </div>`;
}

function mapCard() {
  const map = ui.map;
  if (!map || !ui.mapUrl) return `<p class="muted">${T('loading')}</p>`;
  const segments = []; let segment = [];
  for (const point of map.route?.waypoints ?? []) {
    if (!point) { if (segment.length) segments.push(segment); segment = []; continue; }
    segment.push(`${(point.u * 100).toFixed(2)},${(point.v * 100).toFixed(2)}`);
  }
  if (segment.length) segments.push(segment);
  const overlay = segments.map(points => `<polyline points="${points.join(' ')}"/>`).join('') + (map.position ? `<circle cx="${map.position.u * 100}" cy="${map.position.v * 100}" r="1.5"/>` : '');
  return `<div class="map-frame"><img src="${esc(ui.mapUrl)}" alt="${T('map_description')}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${overlay}</svg></div>${map.position ? '' : `<p class="small muted">${T('map_outside')}</p>`}`;
}

function routeSummary(route) {
  const p = [];
  if (route.distanceM != null) p.push(metricText({ value: route.distanceM }, 'distanceM').value + ' ' + t(metricUnits.distanceM));
  if (route.elevationGainM != null) p.push('↑ ' + metricText({ value: route.elevationGainM }, 'elevationGainM').value + ' ' + t(metricUnits.elevationGainM));
  p.push(...(route.categories ?? []));
  return p.join(' · ');
}

const demoRoutes = { catalogRevision: 'demo-catalog', total: 3, items: [
  { id: '1', name: 'Demo Coastal Loop', author: 'Demo author', distanceM: 24300, elevationGainM: 310, categories: ['Flat'], loopAllowed: true, reverseAllowed: true, description: 'Demo route for trying the app without a PC.' },
  { id: '2', name: 'Demo Hill Climb', distanceM: 8100, elevationGainM: 640, categories: ['Climb'], loopAllowed: false, reverseAllowed: false, description: 'Demo route for trying the app without a PC.' },
  { id: '3', name: 'Demo City Sprint', author: 'Demo author', distanceM: 5200, elevationGainM: 40, categories: ['Urban', 'Sprint'], loopAllowed: true, reverseAllowed: true, description: 'Demo route for trying the app without a PC.' },
] };

function routesScreen(routeId) {
  const catalog = ui.routes ?? (client.mode === 'demo' ? demoRoutes : null);
  if (routeId) {
    const route = client.mode === 'demo' ? demoRoutes.items.find(item => item.id === routeId) : ui.route?.route;
    if (!route) return `<div class="screen">${textButton(t('action_back'), 'navigate', 'data-to="routes"')}${T('loading')}</div>`;
    const preview = ui.preview;
    const previewText = !preview?.panelOpen ? t('routes_pc_selector_closed') : preview.routeId === routeId ? t('routes_pc_showing_this') : t('routes_pc_showing_other');
    const previewCap = capability(preview?.panelOpen ? 'routes.preview' : 'ui.openPanel'), applyCap = capability('routes.apply');
    return `<div class="screen">${banner()}${textButton(t('action_back'), 'navigate', 'data-to="routes"')}<h1>${esc(route.name)}</h1>${route.author ? `<p>${T('routes_author', route.author)}</p>` : ''}<p>${esc(routeSummary(route))} ${helpButton('routes.profile')}</p>${route.description ? `<p>${esc(route.description)}</p>` : ''}${statusLine(t('routes_active'), snapshot()?.activeRoute?.id === route.id ? route.name : t('routes_active_none'))}${card(t('routes_options'), `<div class="setting-row"><span class="setting-copy">${T('routes_loop')}</span>${helpButton('routes.loop')}<input class="switch" type="checkbox" data-action="route-loop" ${ui.loop ? 'checked' : ''} ${route.loopAllowed ? '' : 'disabled'}></div><div class="setting-row"><span class="setting-copy">${T('routes_reverse')}</span>${helpButton('routes.reverse')}<input class="switch" type="checkbox" data-action="route-reverse" ${ui.reverse ? 'checked' : ''} ${route.reverseAllowed ? '' : 'disabled'}></div>`)}${card(t('routes_pc_preview'), `<p>${esc(previewText)}</p>${button(t('routes_show_on_pc'), 'route-preview', { full: true, disabled: !previewCap.available || ui.busy || preview?.panelOpen && preview.routeId === routeId })}${!previewCap.available ? `<p class="small accent">${esc(reason(previewCap.reasonCode))}</p>` : ''}`, 'routes.pcPreview')}${!applyCap.available ? errorText(applyCap.reasonCode) : ''}${button(t('routes_apply'), 'route-apply', { full: true, large: true, primary: true, disabled: !applyCap.available || ui.busy })}</div>`;
  }
  const items = catalog?.items ?? [];
  const active = snapshot()?.activeRoute?.id;
  const activeName = items.find(item => item.id === active)?.name ?? (active ? t('ride_title_route', active) : t('routes_active_none'));
  const applyCap = capability('routes.apply');
  return `<div class="screen">${banner()}${screenHeader('routes_title', 'routes.browse')}${statusLine(t('routes_active'), activeName, active ? 'good' : 'neutral')}${field('route-query', t('routes_search'), ui.query)}${errorText(ui.error)}${button(t('routes_free_ride'), 'free-ride', { full: true, disabled: !applyCap.available || !catalog?.catalogRevision || ui.busy })}${items.length ? items.map(route => listRow(route.name + (route.id === active ? ` • ${t('routes_active_badge')}` : ''), routeSummary(route), 'navigate', `data-to="routes/${id(route.id)}"`)).join('') : `<p>${catalog ? T('routes_empty') : T('loading')}</p>`}${catalog?.total > items.length ? button(t('routes_load_more'), 'routes-more', { full: true }) : ''}</div>`;
}

const demoPlans = { ready: true, catalogRevision: 'demo-workouts', ftpReferenceW: 250, plans: [{ id: 'p-00000000000000d1', name: 'Demo plan', workoutCount: 1 }] };
const demoWorkouts = [{ id: 'w-00000000000000d1', planId: 'p-00000000000000d1', name: 'Demo Sweet Spot', author: 'Demo coach', durationType: 'time', total: 2700, segmentCount: 3, description: 'Synthetic workout.', segments: [
  { index: 0, type: 'warmup', start: 0, end: 600, startPowerW: 125, endPowerW: 188 },
  { index: 1, type: 'steady', start: 600, end: 2400, startPowerW: 225, endPowerW: 225, cadenceRpm: 90 },
  { index: 2, type: 'cooldown', start: 2400, end: 2700, startPowerW: 163, endPowerW: 110 },
] }];
const demoActivityId = 'a-00000000000000d1';
const demoActivities = { available: true, total: 1, offset: 0, items: [{ id: demoActivityId, fileName: 'GTBikeV_demo.fit', modifiedUtc: '2026-11-04T13:00:00Z', sizeBytes: 182340 }] };
const demoActivity = { activity: { id: demoActivityId, fileName: 'GTBikeV_demo.fit', sizeBytes: 182340, sport: 'cycling', startUtc: '2026-11-04T12:00:00Z', elapsedS: 3700, movingS: 3600, distanceM: 30120, ascentM: 410, avgPowerW: 185, maxPowerW: 610, avgHeartRateBpm: 142, avgCadenceRpm: 87, calories: 640, power: { bucketS: 60, values: Array.from({ length: 60 }, (_, index) => index === 30 ? null : 170 + index % 7 * 6) } } };
const demoNumber = (value, min, max) => ({ value, min, max, editable: false, reasonCode: 'DEMO_MODE' });
const demoBool = value => ({ value, editable: false, reasonCode: 'DEMO_MODE' });
const demoChoice = label => ({ selectedId: label, options: [{ id: label, label }], editable: false, reasonCode: 'DEMO_MODE' });
const demoSettings = { settingsRevision: 'demo-settings', profile: { weightKg: demoNumber(72, 40, 150), ftpW: demoNumber(250, 50, 500), hrMaxBpm: demoNumber(185, 50, 220) }, ride: { autopilot: demoBool(true), avoidObstacles: demoBool(false), roadFeel: demoBool(true), difficulty: { value: 50, editable: false, reasonCode: 'DEMO_MODE', allowed: [0, 25, 50, 75, 100, 255] } }, appearance: { bike: demoChoice('Demo bike'), character: demoChoice('Demo rider') } };
const demoOptionsDefaults = { trafficBikesPercent: 50, trafficStyle: 'NORMAL', crowdsEnabled: true, crowdsSlopePercent: 6, crowdsAmount: 50, bots: [1, 0, 0], defensiveLevel: 1, waypointColor: 'FFADFF2F', waypointRadius: 20, fineSteering: .7, screenshotIntervalKm: 5, screenshotXOffset: 0, menuAutoOpen: true, showClock: true, debugWindow: false, logLevel: 3, gpsOriginLat: -19.10637, gpsOriginLon: -169.871, telemetry: true, multiplayer: true };
const demoOptions = { available: true, reasonCode: 'DEMO_MODE', revision: null, gameRunning: false, editable: false, options: demoOptionsDefaults, defaults: demoOptionsDefaults };
const demoRiders = { connected: true, course: { id: '1', reverse: false }, busiestRoute: null, riders: [{ rank: 1, kind: 'bot', name: 'Demo bot', wattsPerKg: 3.4, speedMps: 9.1 }, { rank: 2, kind: 'local', name: 'You (demo)', wattsPerKg: 3.1, speedMps: 8.8 }, { rank: 3, kind: 'human', name: 'Demo rider', wattsPerKg: 2.9, speedMps: 8.5 }] };

function workoutAmount(value, type) { return type === 'distance' ? metricText({ value }, 'distanceM').value + ' ' + t(metricUnits.distanceM) : duration(value * 1000); }

function connectScreen() {
  const current = client.token ? card(t('connect_current_pc'), statusLine(t('connect_identity'), client.bridgeId ?? '—', 'good') + statusLine(t('connect_address'), `${location.hostname}:${ui.bridgePort}`) + (client.expiresAtUtc ? statusLine(t('connect_paired_until'), new Date(client.expiresAtUtc).toLocaleDateString(preferences.language)) : '') + (client.mode === 'demo' ? button(t('connect_button'), 'resume-live', { full: true, primary: true }) : '') + button(t('connect_forget'), 'forget-pc', { full: true }), 'app.unpair') : '';
  const scanner = window.isSecureContext && navigator.mediaDevices?.getUserMedia
    ? `${button(t('connect_scan_qr'), 'scan-qr', { full: true, large: true, primary: true, disabled: ui.busy })}<p class="small muted">${T('connect_scan_hint')}</p>` : '';
  return `<div class="screen">${screenHeader('connect_title')}<p class="intro">${T('connect_intro')}</p>${current}${scanner}<p class="small muted">${T('connect_address')}: ${esc(location.hostname)} · ${T('connect_port')}: ${ui.bridgePort}</p>${field('pin', t('connect_pin'), '', { type: 'text', hint: t('pwa_pin_hint'), inputmode: 'numeric', maxLength: 6, pattern: '[0-9]{6}', autocomplete: 'one-time-code' })}${button(t('connect_button'), 'pair', { full: true, large: true, primary: true, disabled: ui.busy })}${errorText(ui.error)}${button(t('connect_use_demo'), 'demo', { full: true, large: true })}</div>`;
}

function numberSetting(name, label, setting, value, help, disabled) {
  const reasonCode = setting?.editable === false ? setting.reasonCode : null;
  const imperialWeight = name === 'weightKg' && preferences.units === 'imperial';
  const min = imperialWeight ? Math.floor(setting?.min * 2.20462) : setting?.min;
  const max = imperialWeight ? Math.ceil(setting?.max * 2.20462) : setting?.max;
  return `<div class="setting-row"><div class="setting-copy"><p>${esc(label)}</p>${reasonCode ? `<small class="reason">${esc(reason(reasonCode))}</small>` : ''}</div>${helpButton(help)}</div>${field(name, label, value ?? '', { type: 'number', min, max, step: 1, disabled: disabled || !setting?.editable, hint: setting ? `${min}–${max}` : '' })}`;
}

function profileScreen() {
  const settings = ui.settings;
  const live = client.mode === 'live' && !!settings;
  const profile = settings?.profile ?? {};
  const draft = ui.profileDraft ?? {};
  const profileCap = capability('profile.update');
  if (!settings) return `<div class="screen">${banner()}${screenHeader('companion_drawer_profile')}${errorText(ui.error)}${button(t('action_retry'), 'reload', { full: true })}</div>`;

  const profileFields = numberSetting('weightKg', t(preferences.units === 'metric' ? 'profile_weight_kg' : 'profile_weight_lb'), profile.weightKg, draft.weightKg, 'profile.weight', !profileCap.available)
    + numberSetting('ftpW', t('profile_ftp'), profile.ftpW, draft.ftpW, 'profile.ftp', !profileCap.available)
    + numberSetting('hrMaxBpm', t('profile_hr_max'), profile.hrMaxBpm, draft.hrMaxBpm, 'profile.hrMax', !profileCap.available);
  const initialWeight = preferences.units === 'imperial' ? Math.round((profile.weightKg?.value ?? 0) * 2.20462) : profile.weightKg?.value;
  const profileDirty = draft.weightKg != initialWeight || draft.ftpW != profile.ftpW?.value || draft.hrMaxBpm != profile.hrMaxBpm?.value;
  const profileActions = `<div class="button-row">${button(t('action_discard'), 'profile-discard', { disabled: !live || !profileDirty })}${button(t('action_save'), 'profile-save', { primary: true, disabled: !profileCap.available || !live || !profileDirty || ui.busy })}</div>`;

  return `<div class="screen">${banner()}${screenHeader('companion_drawer_profile')}<form id="profile-form">${card(t('pc_settings_profile'), profileFields + profileActions)}</form></div>`;
}

const optionSections = [
  { id: 'environment', title: 'options_traffic', fields: [['range', 'trafficBikesPercent', 'options_traffic_percent', 0, 100, 5, '%'], ['choice', 'trafficStyle', 'options_traffic_style', [['NORMAL', 'options_style_normal'], ['AGRESSIVE', 'options_style_aggressive'], ['BREAKLAWS', 'options_style_breaks_laws']]], ['hint', 'options_traffic_hint']] },
  { id: 'environment', title: 'options_crowds', fields: [['switch', 'crowdsEnabled', 'options_crowds_enabled'], ['range', 'crowdsSlopePercent', 'options_crowds_slope', 0, 20, 1, '%'], ['range', 'crowdsAmount', 'options_crowds_amount', 0, 100, 5, '']] },
  { id: 'environment', title: 'options_bots', fields: [['bots'], ['hint', 'options_bots_hint']] },
  { id: 'environment', title: 'options_riding', fields: [['choice', 'defensiveLevel', 'options_defensive', [[0, 'options_defensive_passive'], [1, 'options_defensive_defensive'], [2, 'options_defensive_aggressive']]], ['hint', 'options_defensive_hint'], ['range', 'fineSteering', 'options_fine_steering', .1, 1, .05, ''], ['hint', 'options_fine_steering_hint']] },
  { id: 'waypoints', title: 'options_waypoints', fields: [['colors', 'waypointColor', 'options_waypoint_color'], ['range', 'waypointRadius', 'options_waypoint_radius', 0, 40, 1, ''], ['hint', 'options_waypoint_hint']] },
  { id: 'waypoints', title: 'options_gps', fields: [['number', 'gpsOriginLat', 'options_gps_lat', -90, 90, .000001], ['number', 'gpsOriginLon', 'options_gps_lon', -180, 180, .000001], ['hint', 'options_gps_hint']] },
  { id: 'system', title: 'options_screenshots', fields: [['range', 'screenshotIntervalKm', 'options_screenshot_km', 1, 50, 1, ' km'], ['number', 'screenshotXOffset', 'options_screenshot_offset', -20000, 20000, 1], ['hint', 'options_screenshot_hint']] },
  { id: 'system', title: 'options_menu_screen', fields: [['switch', 'menuAutoOpen', 'options_menu_auto_open'], ['switch', 'showClock', 'options_show_clock'], ['switch', 'debugWindow', 'options_debug_window'], ['range', 'logLevel', 'options_log_level', 0, 5, 1, ''], ['hint', 'options_log_hint']] },
  { id: 'network', title: 'options_network', fields: [['switch', 'telemetry', 'options_telemetry'], ['switch', 'multiplayer', 'options_multiplayer'], ['hint', 'options_multiplayer_hint']] },
];

const waypointColors = ['FFADFF2F', 'FF47D9E3', 'FFFFD15C', 'FFFF9A4D', 'FFFF5FAE', 'FFFFFFFF', 'FF3B82F6', 'FFEF4444'];
const botNames = ['options_bot_random', 'options_bot_companion', 'options_bot_climber', 'options_bot_sprinter', 'options_bot_time_trialer'];

function optionField(spec, draft, enabled) {
  const [kind, key, label, a, b, step, unit] = spec;
  if (kind === 'hint') return `<p class="small muted">${T(key)}</p>`;
  if (kind === 'bots') return `<p>${T('options_bots_total_other', draft.bots.length, 5)}</p>${botNames.map((name, index) => `<div class="counter"><span>${T(name)}</span><button class="button" type="button" data-action="bot-change" data-bot="${index}" data-delta="-1" ${!enabled || !draft.bots.includes(index) ? 'disabled' : ''} aria-label="${T('options_bot_remove', t(name))}">−</button><strong>${draft.bots.filter(bot => bot === index).length}</strong><button class="button" type="button" data-action="bot-change" data-bot="${index}" data-delta="1" ${!enabled || draft.bots.length >= 5 ? 'disabled' : ''} aria-label="${T('options_bot_add', t(name))}">+</button></div>`).join('')}`;
  if (kind === 'switch') return `<label class="setting-row"><span class="setting-copy">${T(label)}</span><input class="switch" type="checkbox" data-option="${key}" ${draft[key] ? 'checked' : ''} ${enabled ? '' : 'disabled'}></label>`;
  if (kind === 'range') return `<div class="options-slider"><label for="option-${key}"><span>${T(label)}</span><output id="output-${key}">${esc(draft[key])}${esc(unit ?? '')}</output></label><input id="option-${key}" type="range" data-option="${key}" min="${a}" max="${b}" step="${step}" value="${draft[key]}" ${enabled ? '' : 'disabled'}></div>`;
  if (kind === 'number') return `<label class="field"><span>${T(label)}</span><input type="number" data-option="${key}" min="${a}" max="${b}" step="${step}" value="${draft[key] ?? ''}" required ${enabled ? '' : 'disabled'}><small>${a}–${b}</small></label>`;
  if (kind === 'choice') return `<div><p>${T(label)}</p>${a.map(([value, text]) => `<label class="radio-row"><input type="radio" name="option-${key}" data-option="${key}" value="${value}" ${String(draft[key]) === String(value) ? 'checked' : ''} ${enabled ? '' : 'disabled'}><span>${T(text)}</span></label>`).join('')}</div>`;
  if (kind === 'colors') return `<div><p>${T(label)}</p><div class="swatches">${[...new Set([draft[key], ...waypointColors])].map(color => `<button class="swatch ${color === draft[key] ? 'selected' : ''}" style="--swatch:#${esc(color.slice(2))}" data-action="option-color" data-color="${esc(color)}" aria-label="#${esc(color.slice(2))}" ${enabled ? '' : 'disabled'}></button>`).join('')}</div></div>`;
  return '';
}

function gameOptionsScreen(filterCategory = null) {
  const doc = ui.options, draft = ui.draft;
  const editable = client.mode === 'live' && doc?.editable && doc?.available && !doc?.gameRunning;
  const dirty = !!draft && !!doc?.options && JSON.stringify(draft) !== JSON.stringify({ ...doc.defaults, ...Object.fromEntries(Object.entries(doc.options).filter(([, value]) => value != null)) });
  const status = !doc ? client.mode === 'demo' ? reason('DEMO_MODE') : t('loading') : doc.reasonCode === 'DEMO_MODE' ? reason('DEMO_MODE') : !doc.available ? t('options_file_missing') : doc.gameRunning ? t('options_game_running') : dirty ? t('options_unsaved') : t('options_game_closed');
  const controls = `<div class="button-row">${button(t('action_save'), 'options-save', { primary: true, disabled: !editable || !dirty || ui.busy })}${button(t('action_discard'), 'options-discard', { disabled: !dirty })}${button(t('options_defaults'), 'options-defaults', { disabled: !editable })}</div>`;

  const sectionsToShow = filterCategory
    ? optionSections.filter(s => s.id === filterCategory)
    : optionSections;

  const headerTitle = filterCategory === 'environment'
    ? 'companion_drawer_environment'
    : filterCategory === 'waypoints'
      ? 'companion_waypoints'
      : 'options_title';

  return `<div class="screen">${screenHeader(headerTitle)}<p>${T('options_intro')}</p><div class="notice ${doc?.gameRunning || !doc?.available ? 'warn' : ''}">${esc(status)}</div>${errorText(ui.error)}${draft ? `${controls}${sectionsToShow.map(section => card(t(section.title), section.fields.map(spec => optionField(spec, draft, editable)).join(''), section.title === 'options_traffic' ? 'modConfig.options' : null)).join('')}${controls}` : button(t('action_retry'), 'reload', { full: true })}</div>`;
}

const tx = (key, fallbackText) => strings[key] ?? fallback[key] ?? fallbackText ?? key;
const addonName = addon => tx(`addon_${snake(addon.id)}_name`, addon.name);
const paramLabel = (addon, param) => tx(`addon_param_${snake(addon.id)}_${snake(param.id)}`, param.label);
const valueText = (value, unit) => formatValue(value, unit && /^[a-z]+$/.test(unit) ? tx(`addon_unit_${unit}`, unit) : unit, { word: text => tx(`addon_word_${snake(text.replaceAll(' ', '_'))}`, text), yesNo: flag => t(flag ? 'addons_yes' : 'addons_no') });
const statRows = stats => visibleStats(stats).map(stat => statusLine(tx(`addon_stat_${snake(stat.id)}`, stat.label), valueText(stat.value, stat.unit))).join('');
const demoParam = (id, label, type, extra) => ({ id, label, description: '', type, unit: null, liveEdit: true, editable: false, ...extra, value: extra.default });
const demoAddons = { addonsRevision: null, reasonCode: 'DEMO_MODE', addons: [
  { id: 'alleycat', name: 'Alleycat courier', category: 'mission', summary: '', description: '', helpId: 'addons.alleycat', state: 'idle', enabled: false, startReasonCode: 'DEMO_MODE', configureReasonCode: 'DEMO_MODE', segments: null, places: null, progress: null, run: null, result: null,
    parameters: [demoParam('packages', 'Packages', 'integer', { min: 1, max: 10, step: 1, default: 5, liveEdit: false }), demoParam('fragility', 'Fragility', 'enum', { options: [{ id: 'low', label: 'Low' }, { id: 'normal', label: 'Normal' }, { id: 'high', label: 'High' }], default: 'normal' }), demoParam('headwindMps', 'Headwind with heavy packages', 'number', { min: 0, max: 12, step: .5, unit: 'm/s', default: 10 }), demoParam('showHud', 'On-screen status', 'boolean', { default: true })] },
  { id: 'survivalSprint', name: 'Survival sprint', category: 'training', summary: '', description: '', helpId: 'addons.survivalSprint', state: 'idle', enabled: false, startReasonCode: 'DEMO_MODE', configureReasonCode: 'DEMO_MODE', segments: null, places: null, progress: null, run: null, result: null,
    parameters: [demoParam('targetKmh', 'Target speed', 'integer', { min: 15, max: 60, step: 1, unit: 'km/h', default: 30 }), demoParam('chaser', 'Chaser', 'enum', { options: [{ id: 'phantomWedge', label: 'Phantom Wedge' }, { id: 'police', label: 'Police cruiser' }, { id: 'truck', label: 'Phantom truck' }], default: 'phantomWedge', liveEdit: false })] },
  { id: 'ghost', name: 'Ghost segments', category: 'training', summary: '', description: '', helpId: 'addons.ghost', state: 'idle', enabled: false, startReasonCode: 'DEMO_MODE', configureReasonCode: 'DEMO_MODE', places: null, progress: null, run: null, result: null,
    segments: [{ id: 'seg-0000000d', name: 'Demo climb', loop: false, straightM: 1490, attempts: 3, lastTimeS: 258.3, best: { timeS: 251.4, avgPowerW: 245 } }],
    parameters: [demoParam('ghostSource', 'Race against', 'enum', { options: [{ id: 'best', label: 'My best' }, { id: 'last', label: 'My last' }], default: 'best' })] },
  { id: 'discover', name: 'Discover', category: 'exploration', summary: '', description: '', helpId: 'addons.discover', state: 'idle', enabled: false, startReasonCode: 'DEMO_MODE', configureReasonCode: 'DEMO_MODE', segments: null, progress: null, run: null, result: null,
    places: [{ id: 'pl-0000000d', name: 'Demo summit', found: 1, bestTimeS: 1802.4 }],
    parameters: [demoParam('rounds', 'Spots per run', 'integer', { min: 1, max: 20, step: 1, default: 3, liveEdit: false }), demoParam('searchAreaM', 'Search circle', 'integer', { min: 0, max: 1000, step: 50, unit: 'm', default: 300 })] },
] };
const demoProgress = { xp: 1240, level: 3, levelName: 'Explorer', xpToNextLevel: 1010, levelProgressPct: 19, stats: [{ id: 'discoveries', label: 'Spots found', value: 7, unit: null }, { id: 'routesCompleted', label: 'Routes completed', value: 2, unit: null }, { id: 'streakDays', label: 'Daily streak', value: 2, unit: 'days' }], recent: [{ kind: 'route', label: 'Demo Coastal Loop', xp: 1758, timeS: 3122.4 }], routes: [{ routeId: '1', name: 'Demo Coastal Loop', completions: 2, laps: 0, bestTimeS: 3122.4 }], lastFind: null, lastRoute: null };

function progressCard(progress, { routes = true } = {}) {
  if (!progress) return '';
  const recent = (progress.recent ?? []).slice(0, 3).map(event => `<p class="small">${esc(event.label)} · +${fmt(event.xp)} XP${event.timeS != null ? ` · ${esc(clock(event.timeS))}` : ''}</p>`).join('');
  const done = routes && progress.routes?.length ? `<h3>${T('addons_routes_done')}</h3>${progress.routes.slice(0, 10).map(route => statusLine(route.name, t('addons_route_done', route.completions + route.laps, route.bestTimeS != null ? clock(route.bestTimeS) : '—'), 'good')).join('')}` : '';
  return card(t('addons_progress'), `<p><strong>${T('addons_level', progress.level, progress.levelName)}</strong></p><p>${T('addons_xp', fmt(progress.xp), fmt(progress.xpToNextLevel))}</p><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.levelProgressPct}"><span style="width:${progress.levelProgressPct}%"></span></div>${statRows(progress.stats)}${recent ? `<h3>${T('addons_recent')}</h3>${recent}` : ''}${done}`, 'progress.xp');
}

function addonControl(addon, param, value, enabled) {
  const label = esc(paramLabel(addon, param));
  const hint = esc(tx(`addon_param_${snake(addon.id)}_${snake(param.id)}_hint`, param.description)) + (!param.liveEdit && !param.editable && addon.enabled ? ` · ${T('addons_locked_hint')}` : '');
  const data = `data-addon-param="${esc(param.id)}" ${enabled ? '' : 'disabled'}`;
  if (param.type === 'boolean') return `<label class="setting-row"><span class="setting-copy"><p>${label}</p><small>${hint}</small></span><input class="switch" type="checkbox" ${data} ${value ? 'checked' : ''}></label>`;
  if (param.type === 'enum') return `<div><p>${label}</p>${param.options.map(option => `<label class="radio-row"><input type="radio" name="addon-${esc(param.id)}" value="${esc(option.id)}" ${data} ${option.id === value ? 'checked' : ''}><span>${esc(tx(`addon_opt_${snake(addon.id)}_${snake(param.id)}_${snake(option.id)}`, option.label))}</span></label>`).join('')}<p class="small muted">${hint}</p></div>`;
  return `<div class="options-slider"><label for="addon-${esc(param.id)}"><span>${label}</span><output id="addon-out-${esc(param.id)}">${esc(valueText(value, param.unit))}</output></label><input id="addon-${esc(param.id)}" type="range" min="${param.min}" max="${param.max}" step="${param.step}" value="${esc(value)}" ${data}><p class="small muted">${hint}</p></div>`;
}

function addonsScreen(addonId) {
  const doc = ui.addons;
  const problem = !doc ? (client.mode === 'demo' ? null : ui.error === 'NOT_FOUND' ? t('addons_bridge_too_old') : ui.error ? reason(ui.error) : t('loading')) : doc.reasonCode ? reason(doc.reasonCode) : null;
  const notice = problem ? `<div class="notice warn">${esc(problem)}</div>` : '';
  const addon = doc?.addons?.find(item => item.id === addonId);
  if (!addon) {
    const list = (doc?.addons ?? []).map(item => listRow(addonName(item), `${tx(`addon_state_${snake(item.state)}`, item.state)} · ${tx(`addon_${snake(item.id)}_summary`, item.summary)}`, 'navigate', `data-to="addons/${esc(item.id)}"`)).join('');
    return `<div class="screen">${banner()}${screenHeader('addons_title', 'addons.catalog')}<p>${T('addons_intro')}</p>${notice}${progressCard(ui.addonProgress)}${doc ? card(t('addons_title'), list || `<p>${T('addons_none')}</p>`) : button(t('action_retry'), 'reload', { full: true })}</div>`;
  }
  if (ui.addonDraftFor !== addon.id) { ui.addonDraft = {}; ui.addonDraftFor = addon.id; }
  const pending = addonChanges(addon, ui.addonDraft);
  const dirty = Object.keys(pending).length > 0;
  const live = client.mode === 'live';
  const run = addon.run;
  const time = run ? (run.timeLeftS != null ? t('addons_time_left', clock(run.timeLeftS)) : run.elapsedS > 0 ? t('addons_elapsed', clock(run.elapsedS)) : '') : '';
  const block = startBlock(addon, doc, { capability: live ? capability('addons.setEnabled') : { available: false, reasonCode: 'DEMO_MODE' }, busy: ui.busy, dirty });
  const stopBlocked = !live || ui.busy || !capability('addons.setEnabled').available;
  const saveBlocked = !live || ui.busy || !dirty || !doc?.addonsRevision || !!addon.configureReasonCode || !capability('addons.configure').available;
  const runButtons = addon.enabled
    ? button(t('addons_stop'), 'addon-stop', { primary: true, disabled: stopBlocked, data: `data-addon="${esc(addon.id)}"` })
    : `${button(t('addons_start'), 'addon-start', { primary: true, disabled: !!block, data: `data-addon="${esc(addon.id)}"` })}${block && block !== 'OPERATION_IN_PROGRESS' ? `<p class="small muted">${block === 'ADDON_UNSAVED' ? T('addons_unsaved') : T('addons_to_start', reason(block))}</p>` : ''}`;
  const status = `<p>${statusLine(t('addons_state'), tx(`addon_state_${snake(addon.state)}`, addon.state), addon.enabled ? 'good' : addon.state === 'failed' ? 'bad' : 'neutral')}</p>${run ? `<p><strong>${esc(tx(`addon_phase_${snake(run.phase)}`, run.phase))}</strong></p>${time ? `<p>${esc(time)}</p>` : ''}${statRows(run.stats)}` : ''}${!run && addon.result ? `<p>${T('addons_last_run', tx(`addon_outcome_${snake(addon.result.outcome)}`, addon.result.outcome))}</p>${statRows(addon.result.stats)}` : ''}`;
  const items = (title, list, detail) => list ? card(title, `${list.map(item => statusLine(item.name, detail(item))).join('') || '—'}<p class="small muted">${T('addons_items_hint')}</p>`) : '';
  const segments = items(t('addons_segments'), addon.segments, item => item.best ? `${clock(item.best.timeS)}${item.best.avgPowerW != null ? ` · ${fmt(item.best.avgPowerW)} W` : ''} · ×${item.attempts}` : `×${item.attempts}`);
  const places = items(t('addons_places'), addon.places, item => `${item.found ? '✓ ×' + item.found : '—'}${item.bestTimeS != null ? ` · ${clock(item.bestTimeS)}` : ''}`);
  const settings = addon.parameters.length ? card(t('addons_settings'), `${addon.parameters.map(param => addonControl(addon, param, shown(param, ui.addonDraft), live && param.editable && !ui.busy)).join('')}<div class="button-row">${button(t('addons_save'), 'addon-save', { primary: true, disabled: saveBlocked, data: `data-addon="${esc(addon.id)}"` })}${button(t('addons_discard'), 'addon-discard', { disabled: !dirty })}</div>`) : '';
  return `<div class="screen">${banner()}${textButton(t('action_back'), 'navigate', 'data-to="addons"')}${screenHeader('addons_title')}${notice}${card(addonName(addon), `<p>${esc(tx(`addon_${snake(addon.id)}_summary`, addon.summary))}</p>${status}<div class="button-row">${runButtons}</div>${errorText(ui.error)}`, addon.helpId)}${progressCard(addon.progress, { routes: false })}${segments}${places}${settings}</div>`;
}
async function loadAddons() {
  ui.addons = await client.request('addons');
  if (ui.demoTick % 5 === 0 || !ui.addonProgress) ui.addonProgress = await client.request('progress').then(doc => doc.progress).catch(() => ui.addonProgress);
}

function activitiesScreen(activityId) {
  const page = ui.activities;
  if (activityId) {
    const activity = ui.activity?.activity;
    if (!activity) return `<div class="screen">${textButton(t('action_back'), 'navigate', 'data-to="activities"')}${T('loading')}</div>`;
    const lines = [['activity_start', activity.startUtc ? activity.startUtc.slice(0, 16).replace('T', ' ') + ' UTC' : null], ['metric_distance', activity.distanceM, 'distanceM'], ['metric_moving_time', activity.movingS == null ? null : activity.movingS * 1000, 'movingTimeMs'], ['metric_riding_time', activity.elapsedS == null ? null : activity.elapsedS * 1000, 'ridingTimeMs'], ['metric_elevation_gain', activity.ascentM, 'elevationGainM'], ['activity_avg_power', activity.avgPowerW, 'powerW'], ['activity_max_power', activity.maxPowerW, 'powerW'], ['activity_avg_hr', activity.avgHeartRateBpm, 'heartRateBpm'], ['activity_avg_cadence', activity.avgCadenceRpm, 'cadenceRpm'], ['activity_calories', activity.calories]];
    return `<div class="screen">${banner()}${screenHeader('activities_title', 'activity.history')}${textButton(t('action_back'), 'navigate', 'data-to="activities"')}<h2>${esc(activity.fileName)}</h2>${card(t('activity_summary'), lines.map(([label, raw, kind]) => statusLine(t(label), raw == null ? t('metric_missing') : kind ? Object.values(metricText({ value: raw }, kind)).slice(0, 2).filter(Boolean).join(' ') : typeof raw === 'number' ? fmt(raw) : String(raw))).join('') + `<p class="small muted">${T('activity_source_fit')}</p>`, 'activity.summary')}${card(t('activity_power_chart'), powerChart(activity.power), 'activity.powerChart')}${button(t('activity_download'), 'fit-download', { full: true, large: true, disabled: client.mode !== 'live' })}</div>`;
  }
  const saveCap = capability('activities.finish');
  return `<div class="screen">${banner()}${screenHeader('activities_title', 'activity.history')}${card(t('activity_save_section'), `<p>${T('activity_save_hint')}</p>${!saveCap.available ? `<p class="small accent">${esc(reason(saveCap.reasonCode))}</p>` : ''}${button(t('activity_save_button'), 'activity-save', { full: true, large: true, primary: true, disabled: !saveCap.available || ui.busy })}`, 'activity.save')}${errorText(ui.error)}${page ? !page.available ? `<p>${T('activities_folder_unknown')}</p>` : page.items.length ? page.items.map(activity => listRow(activity.fileName.replace(/\.fit$/i, ''), `${activity.modifiedUtc.slice(0, 16).replace('T', ' ')} UTC · ${Math.max(1, Math.floor(activity.sizeBytes / 1024))} KB`, 'navigate', `data-to="activities/${id(activity.id)}"`)).join('') : `<p>${T('activities_empty')}</p>` : T('loading')}${button(t('action_retry'), 'reload', { full: true })}</div>`;
}

function powerChart(power) {
  if (!power?.values?.some(v => v != null)) return `<p>${T('activity_no_power')}</p>`;
  const values = power.values, max = Math.max(...values.filter(v => v != null), 1);
  const paths = []; let pathStr = '';
  values.forEach((value, index) => {
    if (value == null) { if (pathStr) paths.push(pathStr); pathStr = ''; return; }
    pathStr += `${pathStr ? ' L' : 'M'} ${(index / Math.max(1, values.length - 1) * 100).toFixed(2)} ${(100 - value / max * 100).toFixed(2)}`;
  });
  if (pathStr) paths.push(pathStr);
  return `<svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${T('activity_power_chart_description', Math.round(max))}">${paths.map(d => `<path d="${d}"/>`).join('')}</svg>`;
}

function ridersScreen() {
  const board = ui.riders;
  if (!board) return `<div class="screen">${screenHeader('riders_title', 'multiplayer.riders')}${errorText(ui.error || (client.mode === 'demo' ? 'DEMO_MODE' : null))}</div>`;
  const course = route => route ? t('ride_title_route', route.id) : t('routes_active_none');
  return `<div class="screen">${screenHeader('riders_title', 'multiplayer.riders')}${card(t('riders_session'), statusLine(t('riders_multiplayer'), board.connected ? t('riders_connected') : t('riders_offline'), board.connected ? 'good' : 'neutral') + (board.course ? statusLine(t('riders_course'), course(board.course)) : '') + (board.busiestRoute ? statusLine(t('riders_busiest'), course(board.busiestRoute)) + `<p class="small muted">${T('riders_join_on_pc')}</p>` : ''))}${board.riders?.length ? board.riders.map(rider => `<div class="list-row"><strong style="width:30px">${rider.rank}</strong><span class="row-copy"><strong>${esc(rider.name ?? t('riders_unnamed'))}</strong><small>${T(rider.kind === 'local' ? 'riders_kind_you' : rider.kind === 'human' ? 'riders_kind_human' : rider.kind === 'bot' ? 'riders_kind_bot' : 'riders_kind_unknown')}</small></span><span>${rider.wattsPerKg == null ? '--' : fmt(rider.wattsPerKg, 1) + ' W/kg'}<br><small>${rider.speedMps == null ? '--' : metricText({ value: rider.speedMps }, 'speedMps').value + ' ' + t(metricUnits.speedMps)}</small></span></div>`).join('') : `<p>${T('riders_empty')}</p>`}</div>`;
}

function diagnosticsScreen() {
  const state = snapshot(), hello = client.hello;
  const caps = client.capabilities?.capabilities ?? [];
  const version = card(t('diagnostics_versions'), statusLine(t('diagnostics_app'), `PWA ${APP_VERSION}`) + statusLine(t('diagnostics_bridge'), hello ? `${hello.bridgeVersion} · API 1.${hello.apiMinor}` : client.mode === 'demo' ? t('state_demo') : t('metric_missing'), hello ? 'good' : 'neutral') + (hello ? statusLine(t('diagnostics_transport'), hello.transport === 'https' ? 'HTTPS' : t('diagnostics_http_dev'), hello.transport === 'https' ? 'good' : 'warn') : '') + statusLine(t('diagnostics_mod'), state?.modVersion ?? t('metric_missing')) + statusLine(t('diagnostics_profile'), state?.bindingProfile ?? t('metric_missing')));
  return `<div class="screen">${screenHeader('diagnostics_title', 'diagnostics.local')}<p>${T('diagnostics_intro')}</p>${version}${card(t('diagnostics_capabilities'), caps.filter(item => !item.id.startsWith('devices.') && item.id !== 'sensors.read').map(item => statusLine(item.id, item.available ? t('diagnostics_available') : item.reasonCode ?? '—', item.available ? 'good' : 'neutral')).join('') || `<p>${client.mode === 'demo' ? T('state_demo') : T('loading')}</p>`)}${button(t('diagnostics_copy'), 'diagnostics-copy', { full: true, large: true })}<p class="small muted">${T('diagnostics_privacy')}</p></div>`;
}

function helpScreen() {
  return `<div class="screen">${screenHeader('more_help_topics')}${Object.entries(helpTopics).map(([key, item]) => `<div class="setting-row"><button class="button text" type="button" data-action="help" data-help="${esc(key)}">${T(item.title)}</button>${helpButton(key)}</div>`).join('')}</div>`;
}

function render() {
  const [section, sub, item] = parts();
  const selected = topLevel.includes(section) ? section : null;
  const isSetup = client.mode === 'setup' && section === 'connect';
  const navVisible = !isSetup;

  $('#app').classList.toggle('no-nav', !navVisible);
  $('#bottom-nav').hidden = !navVisible;
  $('#bottom-nav').innerHTML = topLevel.map(name => {
    const isAct = name === selected;
    return `<button class="nav-item ${isAct ? 'active' : ''}" data-action="navigate" data-to="${name}" ${isAct ? 'aria-current="page"' : ''}><span class="nav-pill">${icon(name)}</span><span>${T('nav_' + name)}</span></button>`;
  }).join('');

  // Top Bar update
  const topBar = $('#top-bar');
  const screenTitleNode = $('#screen-title');
  const screenSubtitleNode = $('#screen-subtitle');
  const navToggle = $('#nav-toggle');
  const headerConnection = $('#header-connection');
  const headerConnText = $('#header-connection-text');
  const headerActions = $('#header-actions');

  let titleText = t('app_name');
  if (section === 'ride') {
    const actRoute = snapshot()?.activeRoute;
    titleText = actRoute ? t('ride_title_route', actRoute.id) : t('nav_ride');
  } else {
    const allDestinations = [
      ...topLevel.map(k => ({ id: k, label: 'nav_' + k })),
      ...drawerItems,
      { id: 'activities', label: 'activities_title' },
      { id: 'riders', label: 'riders_title' },
      { id: 'diagnostics', label: 'diagnostics_title' },
      { id: 'help', label: 'more_help_topics' },
    ];
    const found = allDestinations.find(d => d.id === section);
    if (found) titleText = t(found.label);
  }
  screenTitleNode.textContent = titleText;
  screenSubtitleNode.textContent = modStatusLabel();

  // Navigation icon: Menu if top-level, else Back
  const isTopLevel = topLevel.includes(section);
  navToggle.innerHTML = isTopLevel ? iconSvg.menu : iconSvg.back;
  navToggle.setAttribute('aria-label', isTopLevel ? t('companion_menu') : t('action_back'));
  navToggle.dataset.action = isTopLevel ? 'toggle-drawer' : 'back';

  // PC status pill
  const reachable = (client.mode === 'live' && !client.lastError) || client.mode === 'demo';
  headerConnection.classList.toggle('connected', reachable);
  headerConnText.textContent = pcStatusLabel();
  headerActions.hidden = section !== 'ride';

  // Drawer update
  const drawer = $('#drawer');
  const drawerBackdrop = $('#drawer-backdrop');
  drawer.hidden = !ui.drawerOpen;
  drawerBackdrop.hidden = !ui.drawerOpen;
  if (ui.drawerOpen) {
    $('#drawer-pc-status').innerHTML = statusLine(t('layer_bridge'), pcStatusLabel(), reachable ? 'good' : 'warn');
    $('#drawer-mod-status').textContent = modStatusLabel();
    const bikeOption = ui.settings?.appearance?.bike?.options?.find(o => o.id === ui.settings?.appearance?.bike?.selectedId);
    $('#drawer-bike-name').textContent = bikeOption?.label ?? t('appearance_bike');
    $('#drawer-profile-summary').textContent = t('companion_profile_summary', ui.settings?.profile?.weightKg?.value ?? t('metric_missing'), ui.settings?.profile?.ftpW?.value ?? t('metric_missing'));

    $('#drawer-nav').innerHTML = drawerItems.map(item => {
      const isAct = section === item.id;
      return `<button class="drawer-item ${isAct ? 'active' : ''}" type="button" data-action="navigate" data-to="${esc(item.id)}"><span class="drawer-icon">${icon(item.icon)}</span><span>${T(item.label)}</span></button>`;
    }).join('');
  }

  // Bottom Sheet update
  const sheet = $('#bottom-sheet');
  const sheetBackdrop = $('#sheet-backdrop');
  sheet.hidden = !ui.sheet;
  sheetBackdrop.hidden = !ui.sheet;
  if (ui.sheet) {
    let sheetHtml = '';
    if (ui.sheet === 'camera') sheetHtml = renderCameraSheet();
    else if (ui.sheet === 'actions') sheetHtml = renderActionsSheet();
    else if (ui.sheet === 'details') sheetHtml = renderDetailsSheet();
    else if (ui.sheet === 'menu') sheetHtml = renderMenuSheet();
    else if (ui.sheet === 'map') sheetHtml = renderMapSheet();
    else if (ui.sheet === 'gears') sheetHtml = renderGearsSheet();
    else if (ui.sheet === 'unsupported') sheetHtml = renderUnsupportedSheet();
    $('#sheet-content').innerHTML = sheetHtml;
    $('#sheet-close').textContent = t('companion_close');
  }

  // Main screen routing
  let html;
  if (section === 'connect') html = connectScreen();
  else if (section === 'ride') html = rideScreen();
  else if (section === 'routes') html = routesScreen(sub);
  else if (section === 'training') html = trainingScreen(sub === 'plan' ? item : null, sub === 'workout' ? item : null);
  else if (section === 'devices') html = devicesScreen();
  else if (section === 'profile') html = profileScreen();
  else if (section === 'garage') html = garageScreen();
  else if (section === 'physics') html = physicsScreen();
  else if (section === 'controls') html = controlsScreen();
  else if (section === 'sensor-settings') html = sensorSettingsScreen();
  else if (section === 'preferences') html = preferencesScreen();
  else if (section === 'system') html = systemScreen();
  else if (section === 'about') html = aboutScreen();
  else if (section === 'environment') html = gameOptionsScreen('environment');
  else if (section === 'waypoints') html = gameOptionsScreen('waypoints');
  else if (section === 'game-options') html = gameOptionsScreen(sub);
  else if (section === 'addons') html = addonsScreen(sub);
  else if (section === 'activities') html = activitiesScreen(sub);
  else if (section === 'riders') html = ridersScreen();
  else if (section === 'diagnostics') html = diagnosticsScreen();
  else if (section === 'help') html = helpScreen();
  else { navigate(client.mode === 'setup' ? 'connect' : 'ride'); return; }

  $('#main').innerHTML = html;
  document.documentElement.lang = preferences.language;
  document.documentElement.dataset.theme = preferences.theme;
  document.querySelector('meta[name="theme-color"]').content = preferences.theme === 'light' ? '#f4f6f8' : '#0d1117';
}

async function loadPage() {
  const [section, sub, item] = parts();
  ui.error = null;
  if (client.mode === 'demo') {
    if (section === 'routes') {
      const items = demoRoutes.items.filter(route => route.name.toLowerCase().includes(ui.query.toLowerCase()) || route.categories.some(c => c.toLowerCase().includes(ui.query.toLowerCase())));
      ui.routes = { ...demoRoutes, items, total: items.length };
      ui.route = sub ? { route: demoRoutes.items.find(route => route.id === sub) } : null;
      ui.loop = ui.route?.route?.loopAllowed ?? true;
      ui.reverse = false;
      ui.preview = { panelOpen: false };
    }
    if (section === 'training') {
      ui.plans = demoPlans;
      ui.progress = { present: false };
      ui.workouts = { workouts: demoWorkouts };
      ui.workout = { workout: demoWorkouts[0], ftpReferenceW: 250 };
    }
    if (section === 'activities') { ui.activities = demoActivities; ui.activity = sub === demoActivityId ? demoActivity : null; }
    if (section === 'profile' || section === 'garage' || section === 'physics' || section === 'ride' || section === 'training') {
      ui.settings = demoSettings;
      ui.profileDraft = { weightKg: preferences.units === 'imperial' ? Math.round(72 * 2.20462) : 72, ftpW: 250, hrMaxBpm: 185 };
    }
    if (section === 'devices') ui.deviceRoles = demoDeviceRoles;
    if (section === 'environment' || section === 'waypoints' || section === 'game-options' || section === 'system') {
      ui.options = demoOptions;
      ui.draft = structuredClone(demoOptionsDefaults);
    }
    if (section === 'riders') ui.riders = demoRiders;
    if (section === 'addons') { ui.addons = demoAddons; ui.addonProgress = demoProgress; }
    render(); return;
  }

  if (client.mode !== 'live') { render(); return; }

  try {
    if (!client.state) await client.refresh();
    if (section === 'ride') {
      await loadCamera();
      if (capability('profile.read').available) ui.settings = await client.request('settings').catch(() => ui.settings);
      if (capability('map.position').available) await loadMap();
    } else if (section === 'routes') {
      if (!ui.routes) ui.routes = await client.request(`routes?offset=0&limit=100&q=${encodeURIComponent(ui.query)}`);
      ui.progress = await client.request('workout-progress').catch(() => null);
      if (sub) {
        ui.route = await client.request(`routes/${id(sub)}`);
        ui.loop = ui.route.route.loopAllowed;
        ui.reverse = false;
        ui.preview = await client.request('route-preview').catch(() => null);
      } else ui.route = null;
    } else if (section === 'training') {
      ui.plans = await client.request('workout-plans');
      ui.progress = await client.request('workout-progress').catch(() => null);
      if (capability('profile.read').available) ui.settings = await client.request('settings').catch(() => ui.settings);
      if (sub === 'plan' && item) ui.workouts = await client.request(`workouts?planId=${id(item)}`);
      if (sub === 'workout' && item) ui.workout = await client.request(`workouts/${id(item)}`);
    } else if (section === 'devices') {
      ui.deviceRoles = await client.request('device-roles');
    } else if (section === 'profile' || section === 'garage' || section === 'physics') {
      ui.settings = await client.request('settings');
      ui.profileDraft = { weightKg: ui.settings.profile.weightKg.value, ftpW: ui.settings.profile.ftpW.value, hrMaxBpm: ui.settings.profile.hrMaxBpm.value };
      if (preferences.units === 'imperial' && ui.profileDraft.weightKg != null) ui.profileDraft.weightKg = Math.round(ui.profileDraft.weightKg * 2.20462);
    } else if (section === 'environment' || section === 'waypoints' || section === 'game-options' || section === 'system') {
      ui.options = await client.request('mod-config');
      ui.draft = ui.options.options ? { ...ui.options.defaults, ...Object.fromEntries(Object.entries(ui.options.options).filter(([, value]) => value != null)) } : null;
    } else if (section === 'activities') {
      if (sub) ui.activity = await client.request(`activities/${id(sub)}`);
      else ui.activities = await client.request('activities?offset=0&limit=100');
    } else if (section === 'addons') await loadAddons();
    else if (section === 'riders') ui.riders = await client.request('riders');
    else if (section === 'diagnostics') client.hello = await client.probe();
  } catch (error) { ui.error = error.message; }
  render();
}

async function loadCamera() {
  try { ui.camera = await client.request('camera'); ui.cameraError = null; }
  catch (error) { ui.camera = null; ui.cameraError = error.message; }
}

function cameraLook(heading, pitch) {
  if (cameraState().lookBlock || !Number.isFinite(heading) || !Number.isFinite(pitch)) return;
  return operation('camera.look', { headingDeg: normalizeHeading(heading), pitchDeg: Math.max(-45, Math.min(45, pitch)) });
}

async function loadMap() {
  try {
    const map = await client.request('map');
    if (ui.map?.assetId !== map.assetId || !ui.mapUrl) {
      const data = await client.request(`assets/${id(map.assetId)}`, { binary: true });
      if (ui.mapUrl) URL.revokeObjectURL(ui.mapUrl);
      ui.mapUrl = URL.createObjectURL(new Blob([data.bytes], { type: 'image/png' }));
    }
    ui.map = map;
  } catch { ui.map = null; }
}

async function run(task, { reload = true } = {}) {
  if (ui.busy) return;
  ui.busy = true;
  try { await task(); if (reload) await loadPage(); else render(); }
  catch (error) { ui.error = error.message; toast(reason(error.message)); render(); }
  finally { ui.busy = false; render(); }
}

function operation(type, args, revision) {
  return run(async () => {
    await client.command(type, args, revision);
    toast(t('diagnostics_available'));
  });
}

let qrStream = null, qrActive = false;
function stopQrScan() {
  qrActive = false;
  qrStream?.getTracks().forEach(track => track.stop());
  qrStream = null;
  $('#qr-video').srcObject = null;
  if ($('#qr-dialog').open) $('#qr-dialog').close();
}

async function startQrScan() {
  if (qrActive) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    ui.error = 'QR_SCAN_UNAVAILABLE'; render(); return;
  }
  qrActive = true;
  const dialogNode = $('#qr-dialog'), video = $('#qr-video');
  $('#qr-title').textContent = t('connect_scan_qr');
  $('#qr-cancel').textContent = t('action_cancel');
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (!qrActive || path() !== 'connect') { stopQrScan(); return; }
    video.srcObject = qrStream;
    dialogNode.showModal();
    await video.play();
    let detector;
    try { if ('BarcodeDetector' in window) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch { /* use jsQR */ }
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
    const scan = async () => {
      if (!qrActive) return;
      try {
        let rawValue = null;
        if (detector) {
          try { rawValue = (await detector.detect(video))[0]?.rawValue ?? null; } catch { detector = null; }
        }
        if (!rawValue && video.videoWidth > 0 && context) {
          canvas.width = Math.min(video.videoWidth, 640);
          canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          rawValue = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
        }
        if (!qrActive) return;
        if (rawValue) {
          stopQrScan();
          const qr = parsePairingQr(rawValue);
          if (!qr) { ui.error = 'QR_INVALID'; render(); return; }
          await run(async () => { await client.pairWithQr(qr, ui.bridgePort); navigate('ride'); });
          return;
        }
      } catch { stopQrScan(); ui.error = 'QR_SCAN_UNAVAILABLE'; render(); return; }
      if (qrActive) setTimeout(scan, 120);
    };
    setTimeout(scan, 120);
  } catch { stopQrScan(); ui.error = 'QR_SCAN_UNAVAILABLE'; render(); }
}
$('#qr-cancel').addEventListener('click', stopQrScan);
$('#qr-dialog').addEventListener('close', stopQrScan);

async function reloadStrings() {
  const [main, english, topics] = await Promise.all([
    fetch(`./i18n/${preferences.language}.json`).then(res => res.json()),
    fetch('./i18n/en.json').then(res => res.json()),
    fetch('./i18n/help-topics.json').then(res => res.json()),
  ]);
  strings = main; fallback = english; helpTopics = topics;
}

function syncUnits() {
  metricUnits.speedMps = preferences.units === 'metric' ? 'unit_kmh' : 'unit_mph';
  metricUnits.distanceM = preferences.units === 'metric' ? 'unit_km' : 'unit_mi';
  metricUnits.elevationGainM = preferences.units === 'metric' ? 'unit_m' : 'unit_ft';
}

document.addEventListener('click', async event => {
  const node = event.target.closest('[data-action]');
  if (!node || node.disabled) return;
  const action = node.dataset.action;

  if (action === 'navigate') return navigate(node.dataset.to);
  if (action === 'back') {
    if (history.length > 1) history.back();
    else navigate('ride');
    return;
  }
  if (action === 'toggle-drawer') { ui.drawerOpen = !ui.drawerOpen; render(); return; }
  if (action === 'open-sheet') { ui.sheet = node.dataset.sheet; render(); return; }
  if (action === 'close-sheet') { ui.sheet = null; render(); return; }
  if (action === 'toggle-section') {
    const target = $(`#${node.dataset.target}`);
    if (target) target.classList.toggle('open');
    return;
  }
  if (action === 'help') {
    const topic = helpTopics[node.dataset.help];
    return message(topic ? t(topic.title) : t('help_connection_status_title'), topic ? t(topic.body) : t('help_connection_status_body'));
  }
  if (action === 'close-dialog') { $('#dialog').close(); ui.confirm = null; return; }
  if (action === 'confirm-dialog') { const callback = ui.confirm; $('#dialog').close(); ui.confirm = null; if (callback) callback(); return; }
  if (action === 'reload') return loadPage();

  if (action === 'toggle-autopilot') {
    const observed = ui.settings?.ride?.autopilot?.value;
    return operation('rideSettings.update', { autopilot: !observed }, ui.settings?.settingsRevision);
  }
  if (action === 'camera-next' && !cameraState().nextBlock) return operation('camera.next', {});
  if (action === 'camera-mode') {
    const mode = node.dataset.mode;
    if (!cameraState().modeBlock && ui.camera?.modes.includes(mode) && ui.camera.currentMode !== mode) {
      return operation('camera.setMode', { mode });
    }
  }
  if (action === 'camera-left') return cameraLook((ui.camera?.headingDeg ?? 0) + 30, ui.camera?.pitchDeg ?? 0);
  if (action === 'camera-right') return cameraLook((ui.camera?.headingDeg ?? 0) - 30, ui.camera?.pitchDeg ?? 0);
  if (action === 'camera-center' || action === 'camera-reset') return cameraLook(0, 0);

  if (action === 'scan-qr') return startQrScan();
  if (action === 'pair') return run(async () => {
    const pin = $('input[name="pin"]')?.value?.trim() ?? '';
    if (!/^\d{6}$/.test(pin)) throw Error('PAIRING_PIN_INVALID');
    client.hello = null;
    await client.pair(pin);
    navigate('ride');
  }, { reload: true });

  if (action === 'demo') { client.useDemo(); ui.error = null; navigate('ride'); return; }
  if (action === 'resume-live') return run(async () => { await client.resumeLive(); navigate('ride'); });
  if (action === 'forget-pc') return dialog(t('connect_forget'), t('help_app_unpair_body'), async () => { await client.unpair(); client.hello = null; client.setConnection(ui.bridgeTransport, ui.bridgeFingerprint); navigate('connect'); render(); }, t('connect_forget'));

  if (action === 'route-preview') return run(async () => {
    if (!ui.preview?.panelOpen) await client.command('ui.openPanel', { panel: 'routes' });
    await client.command('routes.preview', { routeId: ui.route.route.id }, ui.routes.catalogRevision);
    ui.preview = await client.request('route-preview');
  });

  if (action === 'route-apply') {
    const route = ui.route.route;
    const running = ui.progress?.present && ui.progress?.finished !== true;
    return dialog(running ? t('routes_confirm_workout_title') : t('routes_confirm_apply_title', route.name), running ? t('routes_confirm_workout_body', ui.progress?.name ?? t('routes_workout_current'), route.name) : t('routes_confirm_apply_body'), () => operation('routes.apply', { routeId: route.id, loop: ui.loop && route.loopAllowed, reverse: ui.reverse && route.reverseAllowed }, ui.routes.catalogRevision), running ? t('routes_confirm_workout_action') : t('action_confirm'));
  }

  if (action === 'free-ride') return dialog(t('routes_free_ride'), t('routes_confirm_free_ride_body'), () => operation('routes.apply', { routeId: null, loop: false, reverse: false }, ui.routes.catalogRevision));

  if (action === 'routes-more') return run(async () => {
    const next = await client.request(`routes?offset=${ui.routes.items.length}&limit=100&q=${encodeURIComponent(ui.query)}`);
    ui.routes = next.catalogRevision === ui.routes.catalogRevision ? { ...next, items: [...ui.routes.items, ...next.items] } : next;
  }, { reload: false });

  if (action === 'workout-select') {
    const workout = ui.workout.workout;
    const running = ui.progress?.present && ui.progress?.finished !== true;
    return dialog(running ? t('training_select_replace_title') : t('training_select_confirm_title', workout.name), running ? t('training_select_replace_body', ui.progress?.name ?? '…', workout.name) : t('training_select_confirm_body'), () => operation('workouts.select', { workoutId: workout.id }, ui.plans.catalogRevision), running ? t('training_select_replace') : t('training_select_start'));
  }

  if (action === 'profile-discard') return loadPage();
  if (action === 'profile-save') return run(async () => {
    const form = $('#profile-form');
    if (!form.reportValidity()) throw Error('VALUE_OUT_OF_RANGE');
    const values = Object.fromEntries(new FormData(form));
    const profile = ui.settings.profile;
    const changes = {};
    for (const key of ['weightKg', 'ftpW', 'hrMaxBpm']) {
      if (!(key in values) || values[key] === '') continue;
      const value = Math.round(key === 'weightKg' && preferences.units === 'imperial' ? Number(values[key]) / 2.20462 : Number(values[key]));
      if (!Number.isInteger(value) || value < profile[key].min || value > profile[key].max) throw Error('VALUE_OUT_OF_RANGE');
      if (value !== profile[key].value) changes[key] = value;
    }
    if (!Object.keys(changes).length) return toast(t('options_nothing_changed'));
    await client.command('profile.update', changes, ui.settings.settingsRevision);
    toast(t('diagnostics_available'));
  });

  if (action === 'select-bike') {
    const bikeId = node.dataset.bike;
    if (bikeId && bikeId !== ui.settings?.appearance?.bike?.selectedId) {
      return operation('appearance.select', { bikeId }, ui.settings?.settingsRevision);
    }
  }

  if (action === 'device-action') {
    const roleKey = node.dataset.role, act = node.dataset.devAction;
    const rolesDoc = client.mode === 'demo' ? demoDeviceRoles : ui.deviceRoles;
    const role = rolesDoc?.roles?.find(r => r.role === roleKey);
    if (!role) return;
    const expected = act === 'auto' ? null : role.current;
    return operation('devices.configure', { role: role.role, action: act, expectedDeviceId: expected?.deviceId ?? null }, rolesDoc.revision);
  }

  if (action === 'phone-scan-info') {
    return message(t('devices_phone_scan'), t('devices_phone_scan_body') || t('companion_sensor_ownership'));
  }

  if (action === 'options-save') return run(async () => {
    const numbers = [...document.querySelectorAll('input[type="number"][data-option]')];
    const invalid = numbers.find(input => !input.checkValidity());
    if (invalid) { invalid.reportValidity(); throw Error('VALUE_OUT_OF_RANGE'); }
    const original = { ...ui.options.defaults, ...Object.fromEntries(Object.entries(ui.options.options).filter(([, value]) => value != null)) };
    const changes = Object.fromEntries(Object.entries(ui.draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key])));
    if (!Object.keys(changes).length) return toast(t('options_nothing_changed'));
    const result = await client.request('mod-config', { method: 'POST', body: { expectedRevision: ui.options.revision, options: changes } });
    ui.options = result;
    toast(t('options_saved_other', Object.keys(changes).length));
  });

  if (action === 'options-discard') return loadPage();
  if (action === 'options-defaults') { ui.draft = structuredClone(ui.options.defaults); render(); return; }
  if (action === 'option-color') { ui.draft.waypointColor = node.dataset.color; render(); return; }
  if (action === 'bot-change') {
    const type = Number(node.dataset.bot), delta = Number(node.dataset.delta);
    if (delta > 0 && ui.draft.bots.length < 5) ui.draft.bots.push(type);
    if (delta < 0) { const index = ui.draft.bots.indexOf(type); if (index >= 0) ui.draft.bots.splice(index, 1); }
    render(); return;
  }

  if (action === 'addon-start') return run(async () => {
    await client.command('addons.setEnabled', { addonId: node.dataset.addon, enabled: true }, ui.addons?.addonsRevision ?? null);
    toast(t('addons_started', addonName(ui.addons.addons.find(item => item.id === node.dataset.addon))));
  });

  if (action === 'addon-stop') {
    const addon = ui.addons.addons.find(item => item.id === node.dataset.addon);
    return dialog(t('addons_stop_title', addonName(addon)), t('addons_stop_body'), () => run(async () => {
      await client.command('addons.setEnabled', { addonId: addon.id, enabled: false }, null);
      toast(t('addons_stopped', addonName(addon)));
    }), t('addons_stop'));
  }

  if (action === 'addon-save') return run(async () => {
    const addon = ui.addons.addons.find(item => item.id === node.dataset.addon);
    const params = addonChanges(addon, ui.addonDraft);
    if (!Object.keys(params).length) return;
    try { await client.command('addons.configure', { addonId: addon.id, params }, ui.addons.addonsRevision); }
    catch (error) { if (error.message === 'REVISION_CONFLICT') ui.addonDraft = {}; throw error; }
    ui.addonDraft = {};
    toast(t('addons_saved'));
  });

  if (action === 'addon-discard') { ui.addonDraft = {}; render(); return; }
  if (action === 'activity-save') return dialog(t('activity_save_title'), t('activity_save_body'), () => operation('activities.finish', {}, snapshot()?.sessionGeneration), t('action_save'));
  if (action === 'fit-download') return run(async () => {
    const activity = ui.activity.activity;
    const result = await client.request(`activities/${id(activity.id)}/fit`, { binary: true });
    const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/octet-stream' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = activity.fileName; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, { reload: false });

  if (action === 'diagnostics-copy') {
    const state = snapshot();
    const report = `App: PWA ${APP_VERSION}\nBridge: ${client.hello?.bridgeVersion ?? '-'}\nAPI: 1.${client.hello?.apiMinor ?? '-'}\nMod: ${state?.modVersion ?? '-'}\nProfile: ${state?.bindingProfile ?? '-'}\nLayers: adapter=${state?.layers?.adapter ?? '-'} mod=${state?.layers?.mod ?? '-'}\n` + (client.capabilities?.capabilities ?? []).filter(cap => !cap.id.startsWith('devices.') && cap.id !== 'sensors.read').map(cap => `${cap.id}: ${cap.available ? 'ok' : cap.reasonCode}`).join('\n');
    await navigator.clipboard.writeText(report); toast(t('diagnostics_copied')); return;
  }
});

// Sheet & Drawer Backdrop click listeners
$('#drawer-backdrop').addEventListener('click', () => { ui.drawerOpen = false; render(); });
$('#sheet-backdrop').addEventListener('click', () => { ui.sheet = null; render(); });
$('#sheet-close').addEventListener('click', () => { ui.sheet = null; render(); });
$('#header-connection').addEventListener('click', () => navigate('diagnostics'));
$('#header-actions').addEventListener('click', () => { ui.sheet = 'actions'; render(); });

document.addEventListener('change', event => {
  const node = event.target;
  if (node.dataset.action === 'show-help-icons') {
    preferences.showHelpIcons = node.checked;
    savePreferences(); render(); return;
  }
  if (node.name === 'language' || node.name === 'theme' || node.name === 'units') {
    preferences[node.name] = node.value; savePreferences(); syncUnits();
    if (node.name === 'language') reloadStrings().then(render); else render();
    return;
  }
  if (node.dataset.action === 'route-loop') { ui.loop = node.checked; return; }
  if (node.dataset.action === 'route-reverse') { ui.reverse = node.checked; return; }
  if (node.dataset.action === 'mod-toggle') return operation('mod.setActive', { enabled: node.checked });
  if (node.dataset.action === 'pc-switch') return operation('rideSettings.update', { [node.dataset.key]: node.checked }, ui.settings?.settingsRevision);
  if (node.dataset.action === 'difficulty-slider') {
    const level = Number(node.value);
    return operation('rideSettings.update', { difficulty: level }, ui.settings?.settingsRevision);
  }
  if (node.dataset.action === 'disable-resistance') {
    const newDifficulty = node.checked ? 255 : 50;
    return operation('rideSettings.update', { difficulty: newDifficulty }, ui.settings?.settingsRevision);
  }
  if (node.dataset.action === 'camera-heading' || node.dataset.action === 'camera-pitch') {
    const heading = ui.cameraHeadingDraft ?? ui.camera?.headingDeg ?? 0;
    const pitch = ui.cameraPitchDraft ?? ui.camera?.pitchDeg ?? 0;
    ui.cameraHeadingDraft = null; ui.cameraPitchDraft = null;
    return cameraLook(heading, pitch);
  }
  if (node.dataset.action === 'key-prop-select') {
    ui.keyProperty = node.value;
    render(); return;
  }
  if (node.dataset.option) {
    ui.draft[node.dataset.option] = node.type === 'checkbox' ? node.checked : node.type === 'number' && node.value === '' ? null : node.type === 'range' || node.type === 'number' || node.dataset.option === 'defensiveLevel' ? Number(node.value) : node.value;
    const save = document.querySelector('[data-action="options-save"]'); if (save) save.disabled = false;
  }
  if (node.dataset.addonParam) {
    const addon = ui.addons?.addons?.find(item => item.id === parts()[1]);
    const param = addon?.parameters.find(item => item.id === node.dataset.addonParam);
    if (!param) return;
    ui.addonDraft[param.id] = fromInput(param, node);
    node.blur();
    render();
  }
});

document.addEventListener('input', event => {
  const node = event.target;
  if (node.closest('#profile-form')) {
    ui.profileDraft[node.name] = node.value;
    const save = $('[data-action="profile-save"]'), discard = $('[data-action="profile-discard"]');
    if (save) save.disabled = false;
    if (discard) discard.disabled = false;
  }
  if (node.dataset.action === 'difficulty-slider') {
    const out = $('#diff-out');
    if (out) out.textContent = `${node.value}%`;
  }
  if (node.dataset.action === 'camera-heading') {
    ui.cameraHeadingDraft = Number(node.value);
    const out = $('#cam-head-out');
    if (out) out.textContent = `${node.value}°`;
  }
  if (node.dataset.action === 'camera-pitch') {
    ui.cameraPitchDraft = Number(node.value);
    const out = $('#cam-pitch-out');
    if (out) out.textContent = `${node.value}°`;
  }
  if (node.dataset.action === 'key-draft-input') {
    ui.keyDraft = node.value;
    render(); return;
  }
  if (node.name === 'route-query') {
    ui.query = node.value.slice(0, 60);
    clearTimeout(ui.queryTimer);
    ui.queryTimer = setTimeout(async () => {
      const redraw = () => {
        const focused = document.activeElement?.name === 'route-query';
        const position = focused ? document.activeElement.selectionStart : null;
        render();
        if (focused) {
          const search = $('input[name="route-query"]');
          search?.focus();
          if (position != null) search?.setSelectionRange(position, position);
        }
      };
      if (client.mode !== 'live') {
        const items = demoRoutes.items.filter(route => route.name.toLowerCase().includes(ui.query.toLowerCase()) || route.categories.some(c => c.toLowerCase().includes(ui.query.toLowerCase())));
        ui.routes = { ...demoRoutes, items, total: items.length };
        redraw(); return;
      }
      try { ui.routes = await client.request(`routes?offset=0&limit=100&q=${encodeURIComponent(ui.query)}`); redraw(); }
      catch (error) { ui.error = error.message; redraw(); }
    }, 300);
  }
  if (node.dataset.addonParam && node.type === 'range') {
    const addon = ui.addons?.addons?.find(item => item.id === parts()[1]);
    const param = addon?.parameters.find(item => item.id === node.dataset.addonParam);
    const output = $(`#addon-out-${node.dataset.addonParam}`);
    if (param && output) output.textContent = valueText(fromInput(param, node), param.unit);
  }
  if (node.dataset.option) {
    const output = $(`#output-${node.dataset.option}`);
    if (output) output.textContent = node.value + (node.dataset.option === 'trafficBikesPercent' || node.dataset.option === 'crowdsSlopePercent' ? '%' : node.dataset.option === 'screenshotIntervalKm' ? ' km' : '');
    ui.draft[node.dataset.option] = node.type === 'checkbox' ? node.checked : node.type === 'number' && node.value === '' ? null : node.type === 'range' || node.type === 'number' ? Number(node.value) : node.value;
    const save = document.querySelector('[data-action="options-save"]'); if (save) save.disabled = false;
  }
});

window.addEventListener('hashchange', () => {
  if (/^#pair=\d{6}$/.test(location.hash)) { location.reload(); return; }
  stopQrScan();
  ui.drawerOpen = false;
  if (path() === 'ride') ui.sheet = null;
  window.scrollTo(0, 0);
  render();
  loadPage();
});

setInterval(async () => {
  if (client.mode === 'demo' && path() === 'ride') { ui.demoTick++; render(); return; }
  if (client.mode !== 'live' || ui.busy) return;
  try {
    await client.refresh();
    const [section, sub] = parts();
    if (section === 'ride') {
      await loadCamera();
      if (capability('profile.read').available && ui.demoTick % 2 === 0) ui.settings = await client.request('settings').catch(() => ui.settings);
      if (capability('map.position').available && ui.demoTick++ % 3 === 0) await loadMap();
      if (!document.activeElement?.dataset.action?.startsWith('camera')) render();
    }
    if (section === 'devices') {
      if (ui.demoTick++ % 2 === 0) {
        ui.deviceRoles = await client.request('device-roles');
        render();
      }
    }
    if (section === 'training') {
      if (ui.demoTick++ % 2 === 0) {
        ui.progress = await client.request('workout-progress');
        if (document.activeElement?.tagName !== 'INPUT') render();
      }
    }
    if (section === 'routes' && sub) {
      ui.preview = await client.request('route-preview');
      render();
    }
    if (section === 'riders' && ui.demoTick++ % 3 === 0) {
      ui.riders = await client.request('riders');
      render();
    }
    if (section === 'addons') {
      ui.demoTick++;
      await loadAddons();
      if (document.activeElement?.tagName !== 'INPUT') render();
    }
  } catch (error) { client.lastError = error.message; if (path() === 'ride') render(); }
}, 1000);

async function boot() {
  await reloadStrings();
  syncUnits();
  const info = await fetch('./api/pwa-info').then(res => res.json()).catch(() => null);
  ui.bridgePort = info?.bridgePort ?? 8788;
  ui.bridgeTransport = info?.bridgeTransport ?? 'https';
  ui.bridgeFingerprint = info?.bridgeFingerprint ?? '';
  if (!client.token) client.setConnection(ui.bridgeTransport, ui.bridgeFingerprint);

  const handoff = /^#pair=(\d{6})$/.exec(location.hash);
  if (handoff) history.replaceState(null, '', location.pathname + location.search + '#' + (client.mode === 'setup' ? 'connect' : 'ride'));
  if (!location.hash) location.hash = client.mode === 'setup' ? 'connect' : 'ride';
  render();

  let live = false, handoffError = null;
  if (client.mode === 'live') {
    try { await client.probe(); await client.refresh(); live = true; }
    catch (error) { client.lastError = error.message; }
  }

  if (handoff && !live) {
    const previous = { bridgeId: client.bridgeId, transport: client.transport, fingerprint: client.fingerprint };
    try {
      client.hello = null;
      client.bridgeId = null;
      client.setConnection(ui.bridgeTransport, ui.bridgeFingerprint);
      await client.pair(handoff[1]);
      history.replaceState(null, '', location.pathname + location.search + '#ride');
    } catch (error) {
      if (client.token) Object.assign(client, previous);
      handoffError = error.message;
      history.replaceState(null, '', location.pathname + location.search + '#connect');
    }
    render();
  }

  await loadPage();
  if (handoffError) { ui.error = handoffError; render(); }
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot().catch(error => { $('#main').textContent = error.message; });
