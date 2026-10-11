#!/usr/bin/env node

import WebSocket from "ws";
import { loadInput } from "./input/index.js";

const input = await loadInput();

const args = Object.fromEntries(
  process.argv.slice(2).reduce((result, item, index, array) => {
    if (item.startsWith("--")) {
      result.push([item.slice(2), array[index + 1]]);
    }
    return result;
  }, []),
);

const SERVER = args.server;
const ROOM = args.room;
const PLAYER = Number(args.player);

if (!SERVER || !ROOM || ![1, 2].includes(PLAYER)) {
  console.error(
    "Usage: node client.js --server ws://127.0.0.1:8080 " +
      "--room tekken-test --player 1",
  );
  process.exit(1);
}

const ws = new WebSocket(SERVER, { perMessageDeflate: false });
const heldKeys = new Set();

let stopping = false;
let stopListening = () => {};

function log(...values) {
  console.log(new Date().toLocaleTimeString(), ...values);
}

function heldLabel() {
  const names = [...heldKeys].map((key) => input.keyLabel(key));
  return names.length ? names.join(", ") : "none";
}

function sendChange(remoteKey, action, t) {
  if (ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: "input",
      changes: [{ key: remoteKey, action, t }],
    }),
  );
}

function onLocalKey(localKey, action) {
  const remoteKey = input.localToRemote[localKey];
  if (!remoteKey) return;

  const t = Date.now();

  if (action === "down") {
    if (heldKeys.has(localKey)) return;
    heldKeys.add(localKey);
  } else {
    if (!heldKeys.has(localKey)) return;
    heldKeys.delete(localKey);
  }

  sendChange(remoteKey, action, t);
  log("[LOCAL]", input.keyLabel(localKey), action.toUpperCase(), "held", heldLabel());
}

function inputChanges(msg) {
  if (Array.isArray(msg.changes)) return msg.changes;
  if (msg.key && msg.action) {
    return [{ key: msg.key, action: msg.action, t: msg.t }];
  }
  return [];
}

ws.on("open", () => {
  ws._socket?.setNoDelay(true);
  log("[WS] Connected");
  ws.send(
    JSON.stringify({
      type: "join",
      room: ROOM,
      player: PLAYER,
    }),
  );

  Promise.resolve(input.startListening(onLocalKey))
    .then((stop) => {
      if (typeof stop === "function") stopListening = stop;
    })
    .catch((err) => {
      console.error("[INPUT] Keyboard initialization failed:", err);
    });
});

ws.on("message", async (raw) => {
  let msg;

  try {
    msg = JSON.parse(raw.toString());
  } catch {
    log("[WS] Invalid message");
    return;
  }

  switch (msg.type) {
    case "joined":
      log(`[ROOM] Joined ${msg.room} as Player ${msg.player}`);
      break;

    case "peer_connected":
      log(`[ROOM] Player ${msg.player} connected`);
      break;

    case "peer_disconnected":
      log(`[ROOM] Player ${msg.player} disconnected`);
      await input.releaseHeld();
      break;

    case "input":
      try {
        const applied = input.injectChanges(inputChanges(msg));
        const now = Date.now();
        for (const change of applied) {
          const latency =
            Number.isFinite(change.t) && now >= change.t ? `${now - change.t}ms` : null;
          log(
            "[REMOTE]",
            change.key,
            change.action.toUpperCase(),
            ...(latency ? [latency] : []),
          );
        }
      } catch (error) {
        log("[INJECT ERROR]", error.message);
      }
      break;

    case "error":
      log("[SERVER ERROR]", msg.message);
      break;
  }
});

ws.on("error", (error) => log("[WS ERROR]", error.message));

ws.on("close", async () => {
  log("[WS] Disconnected");
  stopListening();
  await input.releaseHeld();
});

async function shutdown() {
  if (stopping) return;
  stopping = true;

  log("[EXIT] Releasing keys");

  for (const localKey of heldKeys) {
    const remoteKey = input.localToRemote[localKey];
    if (remoteKey) sendChange(remoteKey, "up", Date.now());
  }
  heldKeys.clear();

  stopListening();
  await input.releaseHeld();

  if (ws.readyState === WebSocket.OPEN) ws.close();
  setTimeout(() => process.exit(0), 300).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
