import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Android UX strings are synchronized in English and Spanish', async () => {
  const en = JSON.parse(await readFile(new URL('../dist/i18n/en.json', import.meta.url), 'utf8'));
  const es = JSON.parse(await readFile(new URL('../dist/i18n/es.json', import.meta.url), 'utf8'));

  const requiredKeys = [
    'nav_devices',
    'companion_drawer_profile',
    'companion_drawer_garage',
    'companion_drawer_physics',
    'companion_drawer_environment',
    'companion_drawer_controls',
    'companion_drawer_sensors',
    'companion_drawer_system',
    'companion_drawer_connection',
    'companion_drawer_about',
    'companion_menu',
    'companion_actions',
    'companion_pc_connected',
    'companion_mod_active',
    'companion_autopilot_short',
    'companion_camera_short',
    'companion_erg',
    'companion_game_menu',
    'companion_ride_details',
    'companion_gears',
    'companion_brake',
    'companion_camera_advanced',
    'companion_camera_reset',
    'companion_sensor_pc',
    'companion_sensor_ownership',
    'companion_keys',
    'companion_keys_preview',
    'companion_close',
  ];

  for (const key of requiredKeys) {
    assert.ok(en[key], `Missing English key: ${key}`);
    assert.ok(es[key], `Missing Spanish key: ${key}`);
  }

  assert.equal(en.nav_devices, 'Devices');
  assert.equal(es.nav_devices, 'Dispositivos');
});

test('Help topics include device and sensor topics', async () => {
  const topics = JSON.parse(await readFile(new URL('../dist/i18n/help-topics.json', import.meta.url), 'utf8'));
  assert.ok(topics['devices.policy']);
  assert.ok(topics['devices.phoneScan']);
  assert.ok(topics['connection.status']);
});
