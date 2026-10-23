import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MultiplayerPlayerState {
  id: string;
  name: string;
  carSpecId: string;
  colorHex: number;
  tireCompound: 'soft' | 'medium' | 'hard' | 'wet';
  isReady: boolean;
  isHost: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  speedKmh: number;
  steerAngle: number;
  chassisPitch: number;
  chassisRoll: number;
  isDrifting: boolean;
  nitroActive: boolean;
  lap: number;
  totalDistanceDriven: number;
  finished: boolean;
  finishTimeMs: number | null;
  lastSeen: number;
}

export interface LobbyChatMessage {
  id: string;
  senderName: string;
  senderColorHex: number;
  text: string;
  timestamp: number;
}

export interface LobbyRoom {
  roomId: string;
  hostId: string;
  trackId: string;
  totalLaps: number;
  botCount: number;
  botDifficulty: 'easy' | 'medium' | 'hard';
  status: 'waiting' | 'racing' | 'finished';
  raceStartedAt: number | null;
  players: Map<string, MultiplayerPlayerState>;
  chatMessages: LobbyChatMessage[];
  createdAt: number;
}

const rooms = new Map<string, LobbyRoom>();
const clientSocketMap = new Map<WebSocket, { roomId: string; playerId: string }>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function serializeRoom(room: LobbyRoom) {
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    trackId: room.trackId,
    totalLaps: room.totalLaps,
    botCount: room.botCount,
    botDifficulty: room.botDifficulty,
    status: room.status,
    raceStartedAt: room.raceStartedAt,
    players: Array.from(room.players.values()),
    chatMessages: room.chatMessages.slice(-20),
  };
}

function broadcastToRoom(wss: WebSocketServer, roomId: string, payload: unknown, excludeWs?: WebSocket) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(payload);
  for (const [ws, meta] of clientSocketMap.entries()) {
    if (meta.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// Cleanup stale rooms and disconnected players every 15s
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    for (const [pid, p] of room.players.entries()) {
      if (now - p.lastSeen > 45000) {
        room.players.delete(pid);
      }
    }
    if (room.players.size === 0 && now - room.createdAt > 60000) {
      rooms.delete(roomId);
    } else if (room.players.size > 0 && !room.players.has(room.hostId)) {
      const nextHost = room.players.values().next().value;
      if (nextHost) {
        room.hostId = nextHost.id;
        nextHost.isHost = true;
      }
    }
  }
}, 15000);

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // REST Endpoints for listing & creating/joining lobbies (also serves as fallback)
  app.get('/api/lobbies', (_req, res) => {
    const list = Array.from(rooms.values()).map((r) => ({
      roomId: r.roomId,
      trackId: r.trackId,
      totalLaps: r.totalLaps,
      botCount: r.botCount,
      status: r.status,
      playerCount: r.players.size,
      hostName: r.players.get(r.hostId)?.name ?? 'Host',
    }));
    res.json({ lobbies: list });
  });

  app.post('/api/lobbies/create', (req, res) => {
    const {
      playerId,
      playerName,
      carSpecId,
      colorHex,
      tireCompound = 'soft',
      trackId = 'alpine-gp',
      totalLaps = 3,
      botCount = 4,
      botDifficulty = 'medium',
      customRoomId,
    } = req.body || {};

    const pid = String(playerId || `p-${Math.random().toString(36).slice(2, 9)}`);
    const cleanCode = customRoomId
      ? String(customRoomId).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
      : '';
    const roomId = cleanCode && !rooms.has(cleanCode) ? cleanCode : generateRoomCode();

    const hostPlayer: MultiplayerPlayerState = {
      id: pid,
      name: String(playerName || 'Jezdec 1').slice(0, 18),
      carSpecId: String(carSpecId || 'apex-gtr'),
      colorHex: Number(colorHex || 0xef4444),
      tireCompound: (['soft', 'medium', 'hard', 'wet'].includes(tireCompound)
        ? tireCompound
        : 'soft') as 'soft' | 'medium' | 'hard' | 'wet',
      isReady: true,
      isHost: true,
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      speedKmh: 0,
      steerAngle: 0,
      chassisPitch: 0,
      chassisRoll: 0,
      isDrifting: false,
      nitroActive: false,
      lap: 1,
      totalDistanceDriven: 0,
      finished: false,
      finishTimeMs: null,
      lastSeen: Date.now(),
    };

    const room: LobbyRoom = {
      roomId,
      hostId: pid,
      trackId,
      totalLaps: Number(totalLaps) || 3,
      botCount: Number(botCount ?? 4),
      botDifficulty,
      status: 'waiting',
      raceStartedAt: null,
      players: new Map([[pid, hostPlayer]]),
      chatMessages: [
        {
          id: `sys-${Date.now()}`,
          senderName: 'FIA Ředitelství',
          senderColorHex: 0x38bdf8,
          text: `Lobby #${roomId} otevřeno. Připravte monoposty a směs pneu!`,
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
    };

    rooms.set(roomId, room);
    res.json({ room: serializeRoom(room), playerId: pid });
  });

  app.post('/api/lobbies/:roomId/join', (req, res) => {
    const roomId = String(req.params.roomId || '').toUpperCase().trim();
    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: 'Lobby s tímto ID nebylo nalezeno.' });
      return;
    }

    const { playerId, playerName, carSpecId, colorHex, tireCompound = 'soft' } = req.body || {};
    const pid = String(playerId || `p-${Math.random().toString(36).slice(2, 9)}`);

    // Idempotent join check
    const existing = room.players.get(pid);
    if (existing) {
      existing.name = String(playerName || existing.name).slice(0, 18);
      existing.carSpecId = String(carSpecId || existing.carSpecId);
      existing.colorHex = Number(colorHex || existing.colorHex);
      if (['soft', 'medium', 'hard', 'wet'].includes(tireCompound)) {
        existing.tireCompound = tireCompound;
      }
      existing.lastSeen = Date.now();
    } else {
      const joinedName = String(playerName || `Jezdec ${room.players.size + 1}`).slice(0, 18);
      room.players.set(pid, {
        id: pid,
        name: joinedName,
        carSpecId: String(carSpecId || 'apex-gtr'),
        colorHex: Number(colorHex || 0x06b6d4),
        tireCompound: (['soft', 'medium', 'hard', 'wet'].includes(tireCompound)
          ? tireCompound
          : 'soft') as 'soft' | 'medium' | 'hard' | 'wet',
        isReady: true,
        isHost: room.hostId === pid,
        x: 0,
        y: 0,
        z: 0,
        heading: 0,
        speedKmh: 0,
        steerAngle: 0,
        chassisPitch: 0,
        chassisRoll: 0,
        isDrifting: false,
        nitroActive: false,
        lap: 1,
        totalDistanceDriven: 0,
        finished: false,
        finishTimeMs: null,
        lastSeen: Date.now(),
      });
      room.chatMessages.push({
        id: `join-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        senderName: 'TEAM RADIO',
        senderColorHex: 0x22c55e,
        text: `${joinedName} vstoupil do paddocku.`,
        timestamp: Date.now(),
      });
    }

    const serialized = serializeRoom(room);
    broadcastToRoom(wss, roomId, { type: 'room:state', room: serialized });
    res.json({ room: serialized, playerId: pid });
  });

  app.post('/api/lobbies/:roomId/sync', (req, res) => {
    const roomId = String(req.params.roomId || '').toUpperCase().trim();
    const room = rooms.get(roomId);
    if (!room) {
      res.status(404).json({ error: 'Lobby nenalezeno' });
      return;
    }
    const {
      playerId,
      state,
      stateUpdate,
      playerSetupUpdate,
      settingsUpdate,
      action,
      chatText,
    } = req.body || {};
    const incomingState = state || stateUpdate;
    const player = room.players.get(String(playerId));
    let shouldBroadcastRoomState = false;

    if (player) {
      player.lastSeen = Date.now();
      if (playerSetupUpdate && typeof playerSetupUpdate === 'object') {
        if (typeof playerSetupUpdate.name === 'string' && playerSetupUpdate.name.trim()) {
          player.name = playerSetupUpdate.name.trim().slice(0, 18);
          shouldBroadcastRoomState = true;
        }
        if (typeof playerSetupUpdate.carSpecId === 'string') {
          player.carSpecId = playerSetupUpdate.carSpecId;
          shouldBroadcastRoomState = true;
        }
        if (typeof playerSetupUpdate.colorHex === 'number') {
          player.colorHex = playerSetupUpdate.colorHex;
          shouldBroadcastRoomState = true;
        }
        if (
          ['soft', 'medium', 'hard', 'wet'].includes(
            playerSetupUpdate.tireCompound
          )
        ) {
          player.tireCompound = playerSetupUpdate.tireCompound;
          shouldBroadcastRoomState = true;
        }
      }
      if (incomingState && typeof incomingState === 'object') {
        if (typeof incomingState.x === 'number') player.x = incomingState.x;
        if (typeof incomingState.y === 'number') player.y = incomingState.y;
        if (typeof incomingState.z === 'number') player.z = incomingState.z;
        if (typeof incomingState.heading === 'number') player.heading = incomingState.heading;
        if (typeof incomingState.speedKmh === 'number') player.speedKmh = incomingState.speedKmh;
        if (typeof incomingState.steerAngle === 'number') player.steerAngle = incomingState.steerAngle;
        if (typeof incomingState.chassisPitch === 'number') player.chassisPitch = incomingState.chassisPitch;
        if (typeof incomingState.chassisRoll === 'number') player.chassisRoll = incomingState.chassisRoll;
        if (typeof incomingState.isDrifting === 'boolean') player.isDrifting = incomingState.isDrifting;
        if (typeof incomingState.nitroActive === 'boolean') player.nitroActive = incomingState.nitroActive;
        if (typeof incomingState.lap === 'number') player.lap = incomingState.lap;
        if (typeof incomingState.totalDistanceDriven === 'number') {
          player.totalDistanceDriven = incomingState.totalDistanceDriven;
        }
        if (typeof incomingState.finished === 'boolean') player.finished = incomingState.finished;
        if (incomingState.finishTimeMs !== undefined) player.finishTimeMs = incomingState.finishTimeMs;
        if (['soft', 'medium', 'hard', 'wet'].includes(incomingState.tireCompound)) {
          if (player.tireCompound !== incomingState.tireCompound) {
            player.tireCompound = incomingState.tireCompound;
            shouldBroadcastRoomState = true;
          }
        }
        if (typeof incomingState.carSpecId === 'string' && player.carSpecId !== incomingState.carSpecId) {
          player.carSpecId = incomingState.carSpecId;
          shouldBroadcastRoomState = true;
        }
        if (typeof incomingState.colorHex === 'number' && player.colorHex !== incomingState.colorHex) {
          player.colorHex = incomingState.colorHex;
          shouldBroadcastRoomState = true;
        }
      }
      if (typeof chatText === 'string' && chatText.trim()) {
        room.chatMessages.push({
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          senderName: player.name,
          senderColorHex: player.colorHex,
          text: chatText.trim().slice(0, 120),
          timestamp: Date.now(),
        });
        shouldBroadcastRoomState = true;
      }
    }
    if (settingsUpdate && room.hostId === playerId) {
      if (settingsUpdate.trackId) room.trackId = settingsUpdate.trackId;
      if (settingsUpdate.totalLaps !== undefined) room.totalLaps = Number(settingsUpdate.totalLaps);
      if (settingsUpdate.botCount !== undefined) room.botCount = Number(settingsUpdate.botCount);
      if (settingsUpdate.botDifficulty) room.botDifficulty = settingsUpdate.botDifficulty;
      shouldBroadcastRoomState = true;
    }
    if (shouldBroadcastRoomState) {
      broadcastToRoom(wss, roomId, {
        type: 'room:state',
        room: serializeRoom(room),
      });
    }
    if (action === 'start' && room.hostId === playerId) {
      room.status = 'racing';
      room.raceStartedAt = Date.now();
      broadcastToRoom(wss, roomId, {
        type: 'race:started',
        room: serializeRoom(room),
      });
    }
    res.json({ room: serializeRoom(room) });
  });

  app.post('/api/lobbies/:roomId/leave', (req, res) => {
    const roomId = String(req.params.roomId || '').toUpperCase().trim();
    const room = rooms.get(roomId);
    const { playerId } = req.body || {};
    if (room && playerId) {
      room.players.delete(String(playerId));
      if (room.players.size === 0) {
        rooms.delete(roomId);
      } else if (room.hostId === playerId) {
        const nextHost = room.players.values().next().value;
        if (nextHost) {
          room.hostId = nextHost.id;
          nextHost.isHost = true;
        }
        broadcastToRoom(wss, roomId, {
          type: 'room:state',
          room: serializeRoom(room),
        });
      }
    }
    res.json({ ok: true });
  });

  // WebSocket real-time protocol
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const { type } = msg;

        if (type === 'room:join') {
          const roomId = String(msg.roomId || '').toUpperCase().trim();
          const playerId = String(msg.playerId || '');
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Lobby nenalezeno.' }));
            return;
          }
          clientSocketMap.set(ws, { roomId, playerId });

          let player = room.players.get(playerId);
          if (!player) {
            player = {
              id: playerId,
              name: String(msg.playerName || `Jezdec ${room.players.size + 1}`).slice(0, 18),
              carSpecId: String(msg.carSpecId || 'apex-gtr'),
              colorHex: Number(msg.colorHex || 0x06b6d4),
              tireCompound: (['soft', 'medium', 'hard', 'wet'].includes(msg.tireCompound)
                ? msg.tireCompound
                : 'soft') as 'soft' | 'medium' | 'hard' | 'wet',
              isReady: true,
              isHost: room.hostId === playerId,
              x: 0,
              y: 0,
              z: 0,
              heading: 0,
              speedKmh: 0,
              steerAngle: 0,
              chassisPitch: 0,
              chassisRoll: 0,
              isDrifting: false,
              nitroActive: false,
              lap: 1,
              totalDistanceDriven: 0,
              finished: false,
              finishTimeMs: null,
              lastSeen: Date.now(),
            };
            room.players.set(playerId, player);
          } else {
            player.lastSeen = Date.now();
            if (msg.playerName) player.name = String(msg.playerName).slice(0, 18);
            if (msg.carSpecId) player.carSpecId = String(msg.carSpecId);
            if (msg.colorHex) player.colorHex = Number(msg.colorHex);
            if (['soft', 'medium', 'hard', 'wet'].includes(msg.tireCompound)) {
              player.tireCompound = msg.tireCompound;
            }
          }

          const serialized = serializeRoom(room);
          ws.send(JSON.stringify({ type: 'room:state', room: serialized }));
          broadcastToRoom(wss, roomId, { type: 'room:state', room: serialized }, ws);
        } else if (type === 'room:chat') {
          const meta = clientSocketMap.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;
          const player = room.players.get(meta.playerId);
          const text = String(msg.text || '').trim().slice(0, 120);
          if (!text) return;
          room.chatMessages.push({
            id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            senderName: player?.name || String(msg.playerName || 'Jezdec'),
            senderColorHex: player?.colorHex || 0x38bdf8,
            text,
            timestamp: Date.now(),
          });
          const serialized = serializeRoom(room);
          ws.send(JSON.stringify({ type: 'room:state', room: serialized }));
          broadcastToRoom(wss, meta.roomId, { type: 'room:state', room: serialized }, ws);
        } else if (type === 'room:config') {
          const meta = clientSocketMap.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room || room.hostId !== meta.playerId) return;

          if (msg.trackId) room.trackId = String(msg.trackId);
          if (msg.totalLaps !== undefined) room.totalLaps = Number(msg.totalLaps);
          if (msg.botCount !== undefined) room.botCount = Number(msg.botCount);
          if (msg.botDifficulty) room.botDifficulty = msg.botDifficulty;

          broadcastToRoom(wss, meta.roomId, {
            type: 'room:state',
            room: serializeRoom(room),
          });
        } else if (type === 'race:start') {
          const meta = clientSocketMap.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room || room.hostId !== meta.playerId) return;

          room.status = 'racing';
          room.raceStartedAt = Date.now();
          for (const p of room.players.values()) {
            p.lap = 1;
            p.totalDistanceDriven = 0;
            p.finished = false;
            p.finishTimeMs = null;
          }

          broadcastToRoom(wss, meta.roomId, {
            type: 'race:started',
            room: serializeRoom(room),
          });
        } else if (type === 'player:update') {
          const meta = clientSocketMap.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room) return;
          const player = room.players.get(meta.playerId);
          if (!player) return;

          player.lastSeen = Date.now();
          if (typeof msg.x === 'number') player.x = msg.x;
          if (typeof msg.y === 'number') player.y = msg.y;
          if (typeof msg.z === 'number') player.z = msg.z;
          if (typeof msg.heading === 'number') player.heading = msg.heading;
          if (typeof msg.speedKmh === 'number') player.speedKmh = msg.speedKmh;
          if (typeof msg.steerAngle === 'number') player.steerAngle = msg.steerAngle;
          if (typeof msg.chassisPitch === 'number') player.chassisPitch = msg.chassisPitch;
          if (typeof msg.chassisRoll === 'number') player.chassisRoll = msg.chassisRoll;
          if (typeof msg.isDrifting === 'boolean') player.isDrifting = msg.isDrifting;
          if (typeof msg.nitroActive === 'boolean') player.nitroActive = msg.nitroActive;
          if (typeof msg.lap === 'number') player.lap = msg.lap;
          if (typeof msg.totalDistanceDriven === 'number') {
            player.totalDistanceDriven = msg.totalDistanceDriven;
          }
          if (typeof msg.finished === 'boolean') player.finished = msg.finished;
          if (msg.finishTimeMs !== undefined) player.finishTimeMs = msg.finishTimeMs;
          if (['soft', 'medium', 'hard', 'wet'].includes(msg.tireCompound)) {
            player.tireCompound = msg.tireCompound;
          }

          broadcastToRoom(
            wss,
            meta.roomId,
            {
              type: 'player:moved',
              player,
            },
            ws
          );
        } else if (type === 'room:leave') {
          const meta = clientSocketMap.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (room) {
            room.players.delete(meta.playerId);
            if (room.players.size === 0) {
              rooms.delete(meta.roomId);
            } else {
              if (room.hostId === meta.playerId) {
                const nextHost = room.players.values().next().value;
                if (nextHost) {
                  room.hostId = nextHost.id;
                  nextHost.isHost = true;
                }
              }
              broadcastToRoom(wss, meta.roomId, {
                type: 'room:state',
                room: serializeRoom(room),
              });
            }
          }
          clientSocketMap.delete(ws);
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      // Do not immediately delete the player or room on socket close so HTTP /sync and WS reconnects preserve the lobby
      clientSocketMap.delete(ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Velocity 3D Server + WebSocket listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
