export const cameraModeKeys = { near: 'camera_near', medium: 'camera_medium', far: 'camera_far', firstPerson: 'camera_first_person', cinematic: 'camera_cinematic' };
export const normalizeHeading = degrees => ((degrees + 180) % 360 + 360) % 360 - 180;
export function cameraControlState(camera, capabilities, connected, busy = false, connectionReason = 'PC_UNREACHABLE') {
  const block = id => !connected ? connectionReason : busy || camera?.busy ? 'OPERATION_IN_PROGRESS'
    : capabilities[id]?.available !== true ? capabilities[id]?.reasonCode ?? 'CAPABILITY_UNAVAILABLE'
      : camera?.reasonCode ?? (camera?.available !== true ? 'CAPABILITY_UNAVAILABLE' : null);
  const modes = connected && camera?.available === true ? (camera.modes ?? []).filter(mode => Object.hasOwn(cameraModeKeys, mode)) : [];
  return { modes, currentMode: modes.includes(camera?.currentMode) ? camera.currentMode : null,
    nextBlock: block('camera.next'), modeBlock: block('camera.setMode'),
    lookBlock: block('camera.look') ?? camera?.lookReasonCode ?? (camera?.canLook !== true ? 'CAPABILITY_UNAVAILABLE' : null) };
}
