import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraControlState, cameraModeKeys, normalizeHeading } from '../dist/camera-logic.js';

const capabilities = Object.fromEntries(['camera.next', 'camera.setMode', 'camera.look'].map(id => [id, { available: true }]));
const camera = { available: true, modes: Object.keys(cameraModeKeys), currentMode: 'medium', canLook: true, headingDeg: 20, pitchDeg: 0 };
test('camera UI offers only advertised native modes and selects the observed mode', () => {
  const state = cameraControlState({ ...camera, modes: ['near', 'medium', 'drone'] }, capabilities, true);
  assert.deepEqual(state.modes, ['near', 'medium']);
  assert.equal(state.currentMode, 'medium');
  assert.equal(state.nextBlock, null);
  assert.equal(state.lookBlock, null);
  assert.equal(cameraControlState({ ...camera, currentMode: 'unsupported' }, capabilities, true).currentMode, null);
});
test('offline, busy, missing capabilities and the rodillo camera control disable commands', () => {
  const offline = cameraControlState(camera, capabilities, false);
  assert.equal(offline.currentMode, null); assert.deepEqual(offline.modes, []); assert.equal(offline.nextBlock, 'PC_UNREACHABLE');
  assert.equal(cameraControlState(camera, capabilities, true, true).nextBlock, 'OPERATION_IN_PROGRESS');
  assert.equal(cameraControlState(camera, {}, true).nextBlock, 'CAPABILITY_UNAVAILABLE');
  assert.equal(cameraControlState({ ...camera, canLook: false, lookReasonCode: 'CAMERA_CONTROL_IN_USE' }, capabilities, true).lookBlock, 'CAMERA_CONTROL_IN_USE');
});
test('camera headings wrap through the shortest direction, including both sides of 180 degrees', () => {
  assert.equal(normalizeHeading(200), -160); assert.equal(normalizeHeading(-200), 160); assert.equal(normalizeHeading(360), 0);
});
