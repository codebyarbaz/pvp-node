// Each player uses the same local arcade layout.
// Those keys are injected on the other computer as player 2,
// so the two layouts never share a key.
//
// Local:  W A S D move, F G T punches, R V B kicks.
// Remote: U H J K move, Y I O punches, P C E kicks.
//
// A key with no entry is ignored.
// Linux listener codes look like KEY_W. Windows listener codes are letters.
export const KEY_MAP = {
  linux: {
    KEY_W: "U",
    KEY_A: "H",
    KEY_S: "J",
    KEY_D: "K",
    KEY_F: "Y",
    KEY_G: "I",
    KEY_T: "O",
    KEY_R: "P",
    KEY_V: "C",
    KEY_B: "E",
  },
  win32: {
    W: "U",
    A: "H",
    S: "J",
    D: "K",
    F: "Y",
    G: "I",
    T: "O",
    R: "P",
    V: "C",
    B: "E",
  },
};

// Linux values are evdev keycodes. Windows values are virtual-key codes.
export const REMOTE_KEY_CODES = {
  linux: {
    U: 22,
    H: 35,
    J: 36,
    K: 37,
    Y: 21,
    I: 23,
    O: 24,
    P: 25,
    C: 46,
    E: 18,
  },
  win32: {
    U: 0x55,
    H: 0x48,
    J: 0x4a,
    K: 0x4b,
    Y: 0x59,
    I: 0x49,
    O: 0x4f,
    P: 0x50,
    C: 0x43,
    E: 0x45,
  },
};

export function keyLabel(code) {
  return String(code).replace(/^KEY_/, "");
}
