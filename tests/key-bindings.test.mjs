import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyStroke, parseKeyStrokeList, officialKeyBindings, findConflicts } from '../dist/key-bindings.js';

test('parseKeyStroke correctly parses key and optional modifier', () => {
  assert.deepEqual(parseKeyStroke('F5'), { name: 'F5', modifier: null, identity: 'F5' });
  assert.deepEqual(parseKeyStroke('NumPad9(U)'), { name: 'NumPad9', modifier: 'U', identity: 'NUMPAD9(U)' });
  assert.deepEqual(parseKeyStroke('ZP_Right_Shift(L)'), { name: 'ZP_Right_Shift', modifier: 'L', identity: 'ZP_RIGHT_SHIFT(L)' });
  assert.equal(parseKeyStroke('Invalid(X)'), null);
  assert.equal(parseKeyStroke('123'), null);
});

test('parseKeyStrokeList parses comma separated list of keys', () => {
  const list = parseKeyStrokeList('NumPad9(U), ZP_Right_Shift(U)');
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 'NumPad9');
  assert.equal(list[0].modifier, 'U');
  assert.equal(list[1].name, 'ZP_Right_Shift');
  assert.equal(list[1].modifier, 'U');
  assert.equal(parseKeyStrokeList('').length, 0);
  assert.equal(parseKeyStrokeList('Valid, Invalid(X)'), null);
});

test('findConflicts identifies conflicting assignments in same context', () => {
  const conflicts = findConflicts('AutopilotKey', 'F5', officialKeyBindings);
  assert.ok(conflicts.includes('MenuKey'));
  // Dialog keys should not conflict with menu/ride keys
  const dialogConflicts = findConflicts('DialogOkKey', 'F5', officialKeyBindings);
  assert.equal(dialogConflicts.length, 0);
});
