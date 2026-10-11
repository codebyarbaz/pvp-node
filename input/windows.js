import koffi from "koffi";
import { KEY_MAP, REMOTE_KEY_CODES, keyLabel } from "../key_map.js";

const user32 = koffi.load("user32.dll");
const GetAsyncKeyState = user32.func(
  "int16 __stdcall GetAsyncKeyState(int32 vKey)",
);
const MapVirtualKeyW = user32.func(
  "uint32 __stdcall MapVirtualKeyW(uint32 uCode, uint32 uMapType)",
);
const keybd_event = user32.func(
  "void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)",
);

const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;
const MAPVK_VK_TO_VSC = 0;

const localToRemote = KEY_MAP.win32;
const remoteCodes = REMOTE_KEY_CODES.win32;

let timer = null;
const held = new Set();
const remoteHeld = new Set();

export { keyLabel, localToRemote };

function virtualKey(name) {
  const letter = keyLabel(name);
  if (!/^[A-Z]$/i.test(letter)) return null;
  return letter.toUpperCase().charCodeAt(0);
}

function isPressed(vk) {
  return (GetAsyncKeyState(vk) & 0x8000) !== 0;
}

function poll(onKey) {
  for (const localKey of Object.keys(localToRemote)) {
    const vk = virtualKey(localKey);
    if (vk == null) continue;

    if (!isPressed(vk)) {
      if (!held.has(localKey)) continue;
      held.delete(localKey);
      if (onKey) onKey(localKey, "up");
      continue;
    }

    if (held.has(localKey)) continue;
    held.add(localKey);
    if (onKey) onKey(localKey, "down");
  }
}

export async function startListening(onKey) {
  console.log("[INPUT] Windows: listening for key presses");

  // Record keys that are already held so they do not fire at startup.
  poll(null);
  timer = setInterval(() => poll(onKey), 1);
  return stopListening;
}

export function stopListening() {
  if (timer) clearInterval(timer);
  timer = null;
  held.clear();
}

function emitScan(vk, action) {
  const scan = MapVirtualKeyW(vk, MAPVK_VK_TO_VSC) & 0xff;
  if (!scan) {
    throw new Error(`No Windows scan code for virtual key ${vk}`);
  }

  const flags =
    action === "down" ? KEYEVENTF_SCANCODE : KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
  keybd_event(0, scan, flags, 0);
}

export function injectChanges(changes) {
  const applied = [];

  for (const change of changes) {
    const vk = remoteCodes[change.key] ?? virtualKey(change.key);
    if (vk == null) continue;
    if (change.action !== "down" && change.action !== "up") continue;

    if (change.action === "down") {
      if (remoteHeld.has(change.key)) continue;
      remoteHeld.add(change.key);
    } else if (!remoteHeld.has(change.key)) {
      continue;
    } else {
      remoteHeld.delete(change.key);
    }

    emitScan(vk, change.action);
    applied.push(change);
  }

  return applied.map((change) => ({
    key: keyLabel(change.key),
    action: change.action,
    t: change.t,
  }));
}

export async function releaseHeld() {
  if (!remoteHeld.size) return [];
  const changes = [...remoteHeld].map((key) => ({ key, action: "up" }));
  return injectChanges(changes);
}
