import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
let generation = 0;
const reload = () => import(`../dist/companion-client.js?help-preferences=${++generation}`);

test('help icons default to hidden for new and existing installations', async () => {
  storage.clear();
  assert.equal((await reload()).preferences.showHelpIcons, false);
  storage.set('gtav-companion-preferences', JSON.stringify({ language: 'en', theme: 'dark', units: 'imperial' }));
  const { preferences } = await reload();
  assert.equal(preferences.showHelpIcons, false);
  assert.equal(preferences.language, 'en');
  assert.equal(preferences.units, 'imperial');
});

test('help visibility survives reloading and can be turned off again', async () => {
  storage.clear();
  const first = await reload();
  first.preferences.showHelpIcons = true;
  first.savePreferences();
  const second = await reload();
  assert.equal(second.preferences.showHelpIcons, true);
  second.preferences.showHelpIcons = false;
  second.savePreferences();
  assert.equal((await reload()).preferences.showHelpIcons, false);
});
