/**
 * Domain mirror of KeyBindings.kt from gtav-riding-companion-android.
 * Official documented defaults, never presented as the observed user's assignments.
 */

export const keyModifierValues = ['U', 'D', 'L'];

const strokePattern = /^([A-Za-z][A-Za-z0-9_]*)(?:\(([UDL])\))?$/;

export function parseKeyStroke(value) {
  const match = strokePattern.exec(String(value ?? '').trim());
  if (!match) return null;
  return {
    name: match[1],
    modifier: match[2] ?? null,
    identity: (match[1] + (match[2] ? `(${match[2]})` : '')).toUpperCase(),
  };
}

export function parseKeyStrokeList(value) {
  const str = String(value ?? '').trim();
  if (!str) return [];
  const parts = str.split(',');
  const result = [];
  for (const part of parts) {
    const stroke = parseKeyStroke(part);
    if (!stroke) return null;
    result.push(stroke);
  }
  return result;
}

export const officialKeyBindings = {
  MenuKey: 'F5',
  DebugKey: 'F11',
  ScreenshotKey: 'NumPad0',
  AutopilotKey: 'NumPad1',
  RadioKey: 'NumPad7',
  HUDKey: 'NumPad3',
  DestinationKey: 'NumPad2',
  ERGToggleKey: 'NumPad5, ZP_Right_Shift(L)',
  MenuSelectKey: 'ZP_A, WH_Right_Up',
  MenuCancelKey: 'ZP_B, WH_Right_Down',
  MenuUpKey: 'ZP_UpArrow, WH_Left_Up',
  MenuDownKey: 'ZP_DownArrow, WH_Left_Down',
  MenuRightKey: 'ZP_RightArrow, WH_Left_Shift_Up(L)',
  MenuLeftKey: 'ZP_LeftArrow, WH_Left_Shift_Down(L)',
  DialogOkKey: 'ZP_A, WH_Right_Up',
  DialogCancelKey: 'ZP_B, WH_Right_Down',
  LookBehindKey: 'ZP_Right_Joy(D), ZP_Right_Joy(U)',
  NextCamKey: 'ZP_Left_Joy_Btn(U)',
  GearUpKey: 'NumPad9(U), ZP_Right_Shift(U), ZC_Right_Shift(U)',
  GearDownKey: 'NumPad7(U), ZP_Left_Shift(U), ZC_Left_Shift(U)',
  MultigeardownKey: 'ZP_Left_Shift(L), ZC_Left_Shift(L)',
  BrakeReleaseKey: 'ZP_Right_Brake(U), ZP_Left_Brake(U)',
  ExtraBrakeKey: '',
};

export function findConflicts(property, value, bindings = officialKeyBindings) {
  const parsed = parseKeyStrokeList(value);
  if (!parsed || !parsed.length) return [];
  const identities = new Set(parsed.map(s => s.identity));
  const context = key => key.startsWith('Dialog') ? 'dialog' : 'menu-and-ride';
  const targetContext = context(property);
  const conflicts = [];
  for (const [key, assignment] of Object.entries(bindings)) {
    if (key === property || context(key) !== targetContext) continue;
    const keyParsed = parseKeyStrokeList(assignment);
    if (keyParsed?.some(s => identities.has(s.identity))) {
      conflicts.push(key);
    }
  }
  return conflicts;
}
