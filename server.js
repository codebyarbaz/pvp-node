import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);

import { ALLOWED_KEYS } from "./allowed_keys.js";

const rooms = new Map();
const MAX_ROOMS = 1000;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Tekken PVP Node.js relay is running\n");
});

const wss = new WebSocketServer({
  server,
  maxPayload: 2048,
  perMessageDeflate: false,
});

function send(ws, message) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function opponentOf(room, player) {
  return room.players.get(player === 1 ? 2 : 1);
}

function releasePlayerKeys(room, player) {
  const held = room.held.get(player);
  if (!held?.size) return;

  const changes = [...held].map((key) => ({ key, action: "up" }));
  held.clear();
  send(opponentOf(room, player), { type: "input", changes });
}

function applyChange(held, change) {
  if (!ALLOWED_KEYS.has(change.key)) return false;
  if (change.action === "down") {
    if (held.has(change.key)) return false;
    held.add(change.key);
    return true;
  }
  if (change.action === "up") {
    if (!held.has(change.key)) return false;
    held.delete(change.key);
    return true;
  }
  return false;
}

function removePlayer(ws) {
  const { roomCode, player } = ws;
  if (!roomCode || !player) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  releasePlayerKeys(room, player);

  if (room.players.get(player) === ws) {
    room.players.delete(player);
  }

  send(opponentOf(room, player), {
    type: "peer_disconnected",
    player,
  });

  console.log(`[${roomCode}] Player ${player} disconnected`);

  if (room.players.size === 0) rooms.delete(roomCode);

  ws.roomCode = null;
  ws.player = null;
}

wss.on("connection", (ws, req) => {
  ws._socket?.setNoDelay(true);
  req?.socket?.setNoDelay(true);
  ws.isAlive = true;
  ws.roomCode = null;
  ws.player = null;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (buffer) => {
    let msg;

    try {
      msg = JSON.parse(buffer.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (msg.type === "join") {
      if (ws.roomCode) {
        send(ws, { type: "error", message: "Already joined" });
        return;
      }

      if (
        typeof msg.room !== "string" ||
        !/^[A-Za-z0-9_-]{4,40}$/.test(msg.room) ||
        ![1, 2].includes(msg.player)
      ) {
        send(ws, { type: "error", message: "Invalid room or player" });
        return;
      }

      let room = rooms.get(msg.room);

      if (!room) {
        if (rooms.size >= MAX_ROOMS) {
          send(ws, { type: "error", message: "Server is full" });
          return;
        }

        room = {
          players: new Map(),
          held: new Map([
            [1, new Set()],
            [2, new Set()],
          ]),
        };
        rooms.set(msg.room, room);
      }

      if (room.players.has(msg.player)) {
        send(ws, { type: "error", message: "Player slot occupied" });
        return;
      }

      ws.roomCode = msg.room;
      ws.player = msg.player;
      room.players.set(msg.player, ws);

      send(ws, {
        type: "joined",
        room: msg.room,
        player: msg.player,
      });

      console.log(`[${msg.room}] Player ${msg.player} joined`);

      const opponent = room.players.get(msg.player === 1 ? 2 : 1);

      if (opponent) {
        send(ws, { type: "peer_connected", player: opponent.player });
        send(opponent, { type: "peer_connected", player: msg.player });
      }

      return;
    }

    if (!ws.roomCode || !ws.player) {
      send(ws, { type: "error", message: "Join a room first" });
      return;
    }

    if (msg.type !== "input") return;

    const incoming = Array.isArray(msg.changes)
      ? msg.changes
      : msg.key
        ? [{ key: msg.key, action: msg.action, t: msg.t }]
        : [];

    if (!incoming.length || incoming.length > 64) {
      send(ws, { type: "error", message: "Invalid input event" });
      return;
    }

    const room = rooms.get(ws.roomCode);
    if (!room) return;

    const held = room.held.get(ws.player);
    const accepted = [];

    for (const change of incoming) {
      if (!change || typeof change.key !== "string") continue;
      if (!applyChange(held, change)) continue;
      accepted.push({
        key: change.key,
        action: change.action,
        ...(Number.isFinite(change.t) ? { t: change.t } : {}),
      });
    }

    if (!accepted.length) return;

    send(opponentOf(room, ws.player), {
      type: "input",
      changes: accepted,
    });
  });

  ws.on("close", () => removePlayer(ws));
  ws.on("error", (err) => console.error("[WS ERROR]", err.message));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }

    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, HOST, () => {
  console.log(`PVP relay listening on ${HOST}:${PORT}`);
});

function shutdown() {
  clearInterval(heartbeat);

  for (const ws of wss.clients) {
    ws.close(1001, "Server shutting down");
  }

  wss.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
