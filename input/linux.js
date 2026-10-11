import { execFile } from "node:child_process";
import { writeSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import evdevlib from "evdevlib";
import { KEY_MAP, REMOTE_KEY_CODES, keyLabel } from "../key_map.js";

const require = createRequire(import.meta.url);
const UInput = require("uinput2");
const uinputRoot = path.dirname(require.resolve("uinput2"));
const bindings = require(require.resolve("bindings", { paths: [uinputRoot] }));
const inputEvent = bindings({
  bindings: "uinput",
  module_root: uinputRoot,
}).input_event;
const execFileAsync = promisify(execFile);

const listDevices = evdevlib.listDevices ?? evdevlib.default?.listDevices;
const DeviceListener =
  evdevlib.DeviceListener ?? evdevlib.default?.DeviceListener;

const localToRemote = KEY_MAP.linux;
const remoteCodes = REMOTE_KEY_CODES.linux;
const listeners = [];
const remoteHeld = new Set();

let devicePromise = null;
let virtualKeyboard = null;

function ensureDevice() {
  if (!devicePromise) {
    devicePromise = openVirtualKeyboard().catch((error) => {
      devicePromise = null;
      throw error;
    });
  }
  return devicePromise;
}

function writeEvent(type, code, value) {
  writeSync(virtualKeyboard.stream.fd, inputEvent(type, code, value));
}

function keyboardKeyCodes() {
  const codes = new Set(Object.values(remoteCodes));
  // A device with only a few keys is tagged as a button pad, not a keyboard,
  // so the desktop never delivers the keystroke. Register a normal key range.
  for (let code = 1; code <= 83; code++) codes.add(code);
  return [...codes];
}

async function openVirtualKeyboard() {
  const device = await UInput.setup({
    UI_SET_EVBIT: [UInput.EV_KEY, UInput.EV_SYN],
    UI_SET_KEYBIT: keyboardKeyCodes(),
  });

  await device.create({
    name: "PVP Remote Keys",
    id: {
      busType: UInput.BUS_USB,
      vendor: 0x1,
      product: 0x1,
      version: 1,
    },
  });

  await waitUntilKeyboardReady();
  virtualKeyboard = device;
  console.log("[INPUT] Virtual keyboard ready");
  return device;
}

async function waitUntilKeyboardReady() {
  const deadline = Date.now() + 2000;

  while (Date.now() < deadline) {
    const devices = await Promise.resolve(listDevices({ info: true }));
    const virtual = devices.filter((device) =>
      /PVP Remote Keys/.test(device.name || ""),
    );

    for (const device of virtual) {
      try {
        const { stdout } = await execFileAsync("udevadm", [
          "info",
          "-q",
          "property",
          "-n",
          device.path,
        ]);
        if (!stdout.includes("ID_INPUT_KEYBOARD=1")) continue;
        await fs.access(device.path, fs.constants.R_OK);
        return;
      } catch {
        // udev has not finished tagging this device yet.
      }
    }

    await sleep(10);
  }

  throw new Error(
    "Virtual keyboard was not recognized. Check that /dev/uinput is writable.",
  );
}

export { keyLabel, localToRemote };

export async function startListening(onKey) {
  if (typeof listDevices !== "function") {
    throw new Error(
      "evdevlib listDevices() export not found. Check the package exports.",
    );
  }

  if (typeof DeviceListener !== "function") {
    throw new Error(
      "evdevlib DeviceListener export not found. Check the package exports.",
    );
  }

  const devices = await Promise.resolve(listDevices({ info: true }));

  if (!Array.isArray(devices)) {
    throw new Error(
      `Expected an array of input devices; received ${typeof devices}`,
    );
  }

  const keyboards = devices.filter((device) => {
    const name = device.name || "";
    if (/PVP Remote Keys/i.test(name)) return false;
    return /keyboard/i.test(name);
  });

  console.log(`[INPUT] Linux: found ${keyboards.length} keyboard(s)`);
  await ensureDevice();

  for (const device of keyboards) {
    if (!device.path) continue;

    console.log(
      `[INPUT] Opening ${device.path}: ${device.name || "Unknown device"}`,
    );

    try {
      const listener = new DeviceListener(device.path);

      listener.on("data", (input) => {
        if (input.type !== "KEY") return;
        // 1 = pressed, 0 = released. Auto-repeat is ignored.
        if (input.value !== 0 && input.value !== 1) return;
        if (!localToRemote[input.code]) return;
        onKey(input.code, input.value === 1 ? "down" : "up");
      });

      listener.on("error", (err) => {
        console.error(`[INPUT] ${device.path}:`, err.message);
      });

      listeners.push(listener);
    } catch (err) {
      console.error(`[INPUT] Could not open ${device.path}:`, err.message);
    }
  }

  return stopListening;
}

export function stopListening() {
  for (const listener of listeners) {
    try {
      listener.stop();
    } catch {}
  }
  listeners.length = 0;
}

export function injectChanges(changes) {
  if (!virtualKeyboard) {
    throw new Error("Virtual keyboard is not ready");
  }

  const applied = [];

  for (const change of changes) {
    const code = remoteCodes[change.key];
    if (code == null) continue;
    if (change.action !== "down" && change.action !== "up") continue;

    if (change.action === "down") {
      if (remoteHeld.has(change.key)) continue;
      remoteHeld.add(change.key);
    } else if (!remoteHeld.has(change.key)) {
      continue;
    } else {
      remoteHeld.delete(change.key);
    }

    writeEvent(UInput.EV_KEY, code, change.action === "down" ? 1 : 0);
    applied.push(change);
  }

  if (applied.length) {
    writeEvent(UInput.EV_SYN, UInput.SYN_REPORT, 0);
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
