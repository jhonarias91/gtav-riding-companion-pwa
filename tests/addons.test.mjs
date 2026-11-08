// P18 add-ons in the web app: the pure logic against the bridge's own contract fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { snake, shown, snap, valid, changes, fromInput, clock, formatValue, visibleStats, startBlock } from '../dist/addons-logic.js';

const fixture = async name => JSON.parse(await readFile(new URL(`../../gtav-riding-companion-bridge/bridge/fixtures/v1/valid/${name}`, import.meta.url), 'utf8'));
const strings = async lang => JSON.parse(await readFile(new URL(`../dist/i18n/${lang}.json`, import.meta.url), 'utf8'));

test('values, snapping and validation follow the descriptors', async () => {
  const doc = await fixture('addons_finished.json');
  const alleycat = doc.addons.find(a => a.id === 'alleycat');
  const headwind = alleycat.parameters.find(p => p.id === 'headwindMps');
  const packages = alleycat.parameters.find(p => p.id === 'packages');
  assert.equal(shown(packages), 5);
  assert.equal(shown(packages, { packages: 3 }), 3);
  assert.equal(snap(headwind, 7.4), 7.5);
  assert.equal(snap(headwind, 40), 12);
  assert.equal(snap(packages, 3.6), 4);
  assert.equal(valid(headwind, 7.25), false);
  assert.equal(valid(packages, 2.5), false);
  assert.equal(valid(alleycat.parameters.find(p => p.id === 'fragility'), 'extreme'), false);
  assert.equal(fromInput(headwind, { value: '7.4' }), 7.5);
  assert.equal(fromInput(alleycat.parameters.find(p => p.id === 'showHud'), { checked: false }), false);
});

test('only real, editable changes are sent', async () => {
  const running = (await fixture('addons_running.json')).addons.find(a => a.id === 'alleycat');
  // packages is locked while running; fragility is live.
  assert.deepEqual(changes(running, { packages: 3, fragility: 'high', headwindMps: 10 }), { fragility: 'high' });
  const idle = (await fixture('addons_finished.json')).addons.find(a => a.id === 'alleycat');
  assert.deepEqual(changes(idle, { packages: 3, headwindMps: 7.25 }), { packages: 3 });
});

test('start is blocked by capability, missing revision, unsaved changes and the add-on itself', async () => {
  const doc = await fixture('addons_finished.json');
  const alleycat = doc.addons.find(a => a.id === 'alleycat');
  assert.equal(startBlock(alleycat, doc), 'VALUE_NOT_ALLOWED', 'the fixture has a course loaded');
  assert.equal(startBlock({ ...alleycat, startReasonCode: null }, doc), null);
  assert.equal(startBlock({ ...alleycat, startReasonCode: null }, doc, { dirty: true }), 'ADDON_UNSAVED');
  assert.equal(startBlock(alleycat, doc, { capability: { available: false, reasonCode: 'ADAPTER_STALE' } }), 'ADAPTER_STALE');
  assert.equal(startBlock(alleycat, await fixture('addons_adapter_absent.json')), 'ADAPTER_ABSENT');
  assert.equal(startBlock(alleycat, doc, { busy: true }), 'OPERATION_IN_PROGRESS');
});

test('stats are formatted and filtered for display', async () => {
  const ghost = (await fixture('addons_ghost_on_segment.json')).addons.find(a => a.id === 'ghost');
  const ids = visibleStats(ghost.run.stats).map(s => s.id);
  assert.ok(ids.includes('deltaS') && ids.includes('segment'));
  assert.equal(formatValue(-2.4, 's'), '-2.4 s');
  assert.equal(formatValue(251.4, 's'), '4:11');
  assert.equal(clock(251.4), '4:11');
  assert.equal(clock(3725), '1:02:05');
  assert.equal(formatValue(7.5, 'm/s'), '7.5 m/s');
  assert.equal(formatValue(true, null, { yesNo: f => (f ? 'sí' : 'no') }), 'sí');
  assert.equal(formatValue('hot', null, { word: w => ({ hot: 'caliente' })[w] ?? w }), 'caliente');
  assert.equal(formatValue(null, 'm'), '—');
  assert.deepEqual(visibleStats([{ id: 'heavy', value: false }, { id: 'zone', value: null }, { id: 'score', value: 0 }]).map(s => s.id), ['score']);
});

test('every add-on, parameter, option and stat of the registry has an English and a Spanish label', async () => {
  const [en, es] = [await strings('en'), await strings('es')];
  const docs = await Promise.all(['addons_running.json', 'addons_ghost_on_segment.json', 'addons_discover_searching.json', 'addons_sprint_chased.json'].map(fixture));
  const keys = new Set();
  for (const doc of docs) for (const addon of doc.addons) {
    keys.add(`addon_${snake(addon.id)}_name`).add(`addon_${snake(addon.id)}_summary`).add(`addon_state_${snake(addon.state)}`);
    for (const p of addon.parameters) {
      keys.add(`addon_param_${snake(addon.id)}_${snake(p.id)}`).add(`addon_param_${snake(addon.id)}_${snake(p.id)}_hint`);
      for (const o of p.options ?? []) keys.add(`addon_opt_${snake(addon.id)}_${snake(p.id)}_${snake(o.id)}`);
    }
    for (const s of [...(addon.run?.stats ?? []), ...(addon.result?.stats ?? []), ...(addon.progress?.stats ?? [])]) keys.add(`addon_stat_${snake(s.id)}`);
    if (addon.run) keys.add(`addon_phase_${snake(addon.run.phase)}`);
  }
  for (const key of keys) {
    assert.ok(en[key], `en: ${key}`);
    assert.ok(es[key], `es: ${key}`);
  }
});
