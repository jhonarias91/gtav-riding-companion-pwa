// P18 add-ons, pure logic shared by the web app and its tests (no DOM). Everything is driven by GET /api/v1/addons:
// one control per parameter descriptor, so a new add-on on the PC needs no change here. Same rules as the bridge
// (bridge/api-v1/addons.mjs) and the Android app (core AddonRules).

/** registry id -> i18n key part: survivalSprint -> survival_sprint (keys come from Android's strings_addons.xml). */
export const snake = id => String(id).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** What a control shows: the user's draft, else what the PC holds, else the default. */
export const shown = (param, draft = {}) => (param.id in draft ? draft[param.id] : param.value ?? param.default);

/** A slider position snapped to the descriptor's range and step (integers stay whole). */
export function snap(param, raw) {
  const value = Math.min(param.max, Math.max(param.min, Number(raw)));
  const snapped = Math.min(param.max, Math.max(param.min, param.min + Math.round((value - param.min) / param.step) * param.step));
  const clean = Math.round(snapped * 1000) / 1000;
  return param.type === 'integer' ? Math.round(clean) : clean;
}

/** Whether a value is acceptable for its descriptor (type, range, step, options). */
export function valid(param, value) {
  if (param.type === 'boolean') return typeof value === 'boolean';
  if (param.type === 'enum') return typeof value === 'string' && param.options.some(option => option.id === value);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < param.min || value > param.max) return false;
  if (param.type === 'integer' && !Number.isInteger(value)) return false;
  const steps = (value - param.min) / param.step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** The draft entries that differ from what the PC holds and may change now: the body of addons.configure params. */
export function changes(addon, draft = {}) {
  const out = {};
  for (const param of addon?.parameters ?? []) {
    if (!(param.id in draft) || !param.editable) continue;
    const value = draft[param.id];
    if (value !== param.value && valid(param, value)) out[param.id] = value;
  }
  return out;
}

/** Reads a form control into a typed value for its descriptor. */
export function fromInput(param, input) {
  if (param.type === 'boolean') return !!input.checked;
  if (param.type === 'enum') return String(input.value);
  return snap(param, Number(input.value));
}

export const clock = seconds => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

const number = value => (Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100));

/**
 * A stat or parameter value as text. word(text) translates words the adapter sends (hot, closer, my place); yesNo(flag)
 * returns the localized yes/no.
 */
export function formatValue(value, unit, { word = text => text, yesNo = flag => (flag ? 'yes' : 'no') } = {}) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return yesNo(value);
  if (typeof value === 'string') return word(value);
  // Gaps (to a ghost, vs a best) can be negative and short: seconds, not a clock.
  if (unit === 's') return value < 0 || Math.abs(value) < 60 ? `${number(Math.round(value * 10) / 10)} s` : clock(value);
  return number(value) + (unit ? ` ${unit}` : '');
}

/** Stats worth showing on a phone: no empty values, no "heavy: no". */
export const visibleStats = stats => (stats ?? []).filter(stat => stat.value !== null && stat.value !== undefined && !(stat.id === 'heavy' && stat.value === false));

/** Why Start is unavailable, or null. Unsaved changes come first: a start uses the saved settings. */
export function startBlock(addon, doc, { capability, busy = false, dirty = false } = {}) {
  if (!addon) return 'CAPABILITY_UNAVAILABLE';
  if (busy) return 'OPERATION_IN_PROGRESS';
  if (capability && !capability.available) return capability.reasonCode ?? 'CAPABILITY_UNAVAILABLE';
  if (!doc?.addonsRevision) return doc?.reasonCode ?? 'CAPABILITY_UNAVAILABLE';
  if (dirty) return 'ADDON_UNSAVED';
  return addon.startReasonCode ?? null;
}
