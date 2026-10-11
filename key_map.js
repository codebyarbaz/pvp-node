// Player 1 keys are injected on the other computer as player 2.
// A key with no entry is ignored.
// Linux listener codes look like KEY_W. Windows listener codes are 1, 3, SPACE, or a letter.
export const KEY_MAP = {
  linux: {
    KEY_1: "2",
    KEY_3: "4",
    KEY_W: "I",
    KEY_S: "K",
    KEY_A: "J",
    KEY_D: "L",
    KEY_T: "7",
    KEY_Y: "8",
    KEY_G: "4",
    KEY_H: "5",
    KEY_SPACE: "KPENTER",
  },
  win32: {
    1: "2",
    3: "4",
    W: "I",
    S: "K",
    A: "J",
    D: "L",
    T: "7",
    Y: "8",
    G: "4",
    H: "5",
    SPACE: "KPENTER",
  },
};

// Linux values are evdev keycodes. Windows values are virtual-key codes.
// KPENTER is numpad Enter. On Windows the scan code is extended, handled in input/windows.js.
export const REMOTE_KEY_CODES = {
  linux: {
    2: 3,
    4: 5,
    5: 6,
    7: 8,
    8: 9,
    I: 23,
    J: 36,
    K: 37,
    L: 38,
    KPENTER: 96,
  },
  win32: {
    2: 0x32,
    4: 0x34,
    5: 0x35,
    7: 0x37,
    8: 0x38,
    I: 0x49,
    J: 0x4a,
    K: 0x4b,
    L: 0x4c,
    KPENTER: 0x0d,
  },
};

export function keyLabel(code) {
  return String(code).replace(/^KEY_/, "");
}
