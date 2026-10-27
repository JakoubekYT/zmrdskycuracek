import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { User } from 'firebase/auth';
import {
  CameraMode,
  computeMinimapData,
  formatRaceTime,
  GameHud,
  GamePhase,
  HudLiveRefs,
  LobbyChatMessageDTO,
  LobbyRoomDTO,
  MultiplayerPlayerDTO,
  PublicLobbySummary,
  RaceSummarySnapshot,
  StandingEntry,
} from './components/GameHud';
import {
  ensureDriverProfileExists,
  HallOfFameDriverDoc,
  HallOfFameLapDoc,
  recordRaceResultInHallOfFame,
  recordSingleLapInHallOfFame,
  signInWithGooglePopup,
  signOutGoogleUser,
  subscribeAuthUser,
  subscribeHallOfFameData,
  createCloudLobby,
  joinCloudLobby,
  leaveCloudLobby,
  updateCloudRoom,
  updateCloudPlayerTelemetry,
  sendCloudLobbyChat,
  subscribeCloudRoom,
  subscribeCloudLobbies,
} from './firebase';
import { RaceAudioEngine } from './game/audio';
import {
  AI_DRIVER_NAMES,
  AI_STRATEGY_PROFILES,
  BotDifficulty,
  CAR_SPECS,
  CarInput,
  CarState,
  computeAiInput,
  computeRaceStandings,
  createInitialCarState,
  DEFAULT_TUNING,
  RaceGameMode,
  servicePitStop,
  stepCarPhysics,
  TimeOfDay,
  TIRE_COMPOUNDS,
  TireCompound,
  TuningConfig,
  WeatherType,
} from './game/physics';
import {
  applyAtmosphereAndLights,
  buildTrackAndEnvironment,
  CarRig,
  createNameplateSprite,
  createParticlePool,
  createRaceCarMesh,
  createWeatherSystem,
  initStudioEnvironment,
  updateCarRigCockpitTelemetry,
  updateCarRigTireCompound,
  updatePitCrewAnimation,
} from './game/sceneBuilder';
import {
  decodeCustomTrackShareCode,
  findClosestTrackSample,
  getTrackTotalLength,
  loadSavedCustomTracksFromStorage,
  resolveTrackDefinition,
  sampleTrackByNormalizedT,
  saveCustomTracksToStorage,
  setActiveTrack,
} from './game/track';

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

const LOCAL_ROOMS_STORAGE_KEY = 'apex_formula_rooms_live_v5';

// Purge any legacy localStorage keys that could hold old demo/seeded players
try {
  localStorage.removeItem('apex_formula_rooms_v1');
  localStorage.removeItem('apex_formula_rooms_v2');
  localStorage.removeItem('apex_formula_rooms_v3');
  localStorage.removeItem('apex_formula_rooms_v4');
} catch {
  // Ignore
}

// Load saved custom tracks and check if a shared custom track URL parameter (?customTrack=...) is present
let initialStartupTrackId = 'alpine-gp';
try {
  loadSavedCustomTracksFromStorage();
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const sharedCode = params.get('customTrack');
    if (sharedCode) {
      const decodedDef = decodeCustomTrackShareCode(sharedCode);
      if (decodedDef) {
        saveCustomTracksToStorage();
        initialStartupTrackId = decodedDef.id;
      }
    }
  }
} catch {
  // Ignore URL parsing errors
}

function sanitizeRoomDTO(room: LobbyRoomDTO): LobbyRoomDTO {
  const realPlayers = (room.players || []).filter(
    (p) =>
      p &&
      typeof p.id === 'string' &&
      !p.id.startsWith('online-') &&
      p.name !== 'Tomáš.cz' &&
      p.name !== 'Marek F1'
  );
  return {
    ...room,
    players: realPlayers,
  };
}

function readLocalRooms(): Record<string, LobbyRoomDTO> {
  try {
    const raw = localStorage.getItem(LOCAL_ROOMS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const cleaned: Record<string, LobbyRoomDTO> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v === 'object') {
        const s = sanitizeRoomDTO(v as LobbyRoomDTO);
        if (s.players.length > 0) {
          cleaned[k] = s;
        }
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeLocalRoom(room: LobbyRoomDTO): void {
  try {
    const all = readLocalRooms();
    all[room.roomId] = sanitizeRoomDTO(room);
    localStorage.setItem(LOCAL_ROOMS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage quota errors
  }
}

export default function App() {
  const urlParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;
  const initialAutostart = urlParams?.get('autostart') === '1';
  const initialRoomParam = urlParams?.get('room')?.toUpperCase() || null;
  const initialCamParam = urlParams?.get('cam') as CameraMode | null;

  const [localPlayerId] = useState<string>(() => {
    const saved = sessionStorage.getItem('apex_player_id');
    if (saved && !saved.startsWith('online-')) return saved;
    const id = `p-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('apex_player_id', id);
    return id;
  });

  const [playerName, setPlayerName] = useState<string>(() => {
    const saved = localStorage.getItem('apex_player_name');
    if (saved && !/^Jezdec \d+$/i.test(saved) && saved !== 'Tomáš.cz' && saved !== 'Marek F1') {
      return saved;
    }
    return 'Pilot F1';
  });

  const [phase, setPhase] = useState<GamePhase>(
    initialAutostart ? 'playing' : 'title'
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    initialStartupTrackId
  );
  const [gameMode, setGameMode] = useState<RaceGameMode>('gp');
  const [selectedCarIdx, setSelectedCarIdx] = useState<number>(0);
  const [selectedCompound, setSelectedCompound] =
    useState<TireCompound>('soft');
  const [nextPitCompound, setNextPitCompound] =
    useState<TireCompound>('medium');
  const [botCount, setBotCount] = useState<number>(5);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [weather, setWeather] = useState<WeatherType>('clear');
  const [totalLaps, setTotalLaps] = useState<number>(3);
  const [tuning, setTuning] = useState<TuningConfig>(DEFAULT_TUNING);
  const [cameraMode, setCameraMode] = useState<CameraMode>(
    initialCamParam &&
      ['chase', 'close', 'hood', 'heli'].includes(initialCamParam)
      ? initialCamParam
      : 'chase'
  );
  const [muted, setMuted] = useState<boolean>(false);
  const [dockOpen, setDockOpen] = useState<boolean>(false);
  const [position, setPosition] = useState<number>(1);
  const [totalCarsCount, setTotalCarsCount] = useState<number>(6);
  const [lap, setLap] = useState<number>(1);
  const [liveStandings, setLiveStandings] = useState<StandingEntry[]>([]);
  const [summary, setSummary] = useState<RaceSummarySnapshot | null>(null);

  // Firebase Auth & Hall of Fame state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [hallOfFameDrivers, setHallOfFameDrivers] = useState<
    HallOfFameDriverDoc[]
  >([]);
  const [hallOfFameLaps, setHallOfFameLaps] = useState<HallOfFameLapDoc[]>([]);
  const authUserRef = useRef<User | null>(null);

  // Multiplayer state
  const [activeRoom, setActiveRoom] = useState<LobbyRoomDTO | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbySummary[]>([]);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // Refs for 60+ FPS loop access without re-mounting WebGL
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const localPlayerIdRef = useRef<string>(localPlayerId);
  const playerNameRef = useRef<string>(playerName);
  const phaseRef = useRef<GamePhase>(initialAutostart ? 'playing' : 'title');
  const selectedTrackIdRef = useRef<string>(initialStartupTrackId);
  const gameModeRef = useRef<RaceGameMode>('gp');
  const selectedCarIdxRef = useRef<number>(0);
  const selectedCompoundRef = useRef<TireCompound>('soft');
  const nextPitCompoundRef = useRef<TireCompound>('medium');
  const botCountRef = useRef<number>(5);
  const botDifficultyRef = useRef<BotDifficulty>('medium');
  const timeOfDayRef = useRef<TimeOfDay>('day');
  const weatherRef = useRef<WeatherType>('clear');
  const totalLapsRef = useRef<number>(3);
  const tuningRef = useRef<TuningConfig>(DEFAULT_TUNING);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const audioRef = useRef<RaceAudioEngine | null>(null);
  const pitRequestedRef = useRef<boolean>(false);

  const activeRoomRef = useRef<LobbyRoomDTO | null>(null);
  const remotePlayersRef = useRef<Map<string, MultiplayerPlayerDTO>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const cloudRoomUnsubRef = useRef<(() => void) | null>(null);

  // Input tracking refs
  const keysHeldRef = useRef<Set<string>>(new Set());
  const touchHeldRef = useRef<{
    left: boolean;
    right: boolean;
    throttle: boolean;
    brake: boolean;
    handbrake: boolean;
    nitro: boolean;
  }>({
    left: false,
    right: false,
    throttle: false,
    brake: false,
    handbrake: false,
    nitro: false,
  });

  // High-frequency DOM refs for HUD readouts
  const speedTextRef = useRef<HTMLSpanElement | null>(null);
  const gearTextRef = useRef<HTMLSpanElement | null>(null);
  const rpmTextRef = useRef<HTMLSpanElement | null>(null);
  const rpmBarRef = useRef<SVGCircleElement | null>(null);
  const shiftLedStripRefs = useRef<
    Array<React.RefObject<HTMLSpanElement | null>>
  >(Array.from({ length: 15 }, () => React.createRef<HTMLSpanElement>()));
  const nitroBarRef = useRef<HTMLDivElement | null>(null);
  const lapTimeTextRef = useRef<HTMLSpanElement | null>(null);
  const bestLapTextRef = useRef<HTMLSpanElement | null>(null);
  const driftChainTextRef = useRef<HTMLSpanElement | null>(null);
  const driftTotalTextRef = useRef<HTMLSpanElement | null>(null);
  const surfaceBadgeRef = useRef<HTMLSpanElement | null>(null);
  const gDotRef = useRef<SVGCircleElement | null>(null);
  const frontLoadTextRef = useRef<HTMLSpanElement | null>(null);
  const fpsTextRef = useRef<HTMLSpanElement | null>(null);
  const tirePctTextRef = useRef<HTMLSpanElement | null>(null);
  const tireTempTextRef = useRef<HTMLSpanElement | null>(null);
  const tireBarFillRef = useRef<HTMLDivElement | null>(null);
  const tireWheelBoxRefs = useRef<Array<React.RefObject<HTMLDivElement | null>>>(
    Array.from({ length: 4 }, () => React.createRef<HTMLDivElement>())
  );
  const pitZoneBannerRef = useRef<HTMLButtonElement | null>(null);
  const pitStatusBannerRef = useRef<HTMLDivElement | null>(null);
  const pitStatusTextRef = useRef<HTMLSpanElement | null>(null);
  const modeBannerRef = useRef<HTMLDivElement | null>(null);
  const modePrimaryTextRef = useRef<HTMLSpanElement | null>(null);
  const modeSubTextRef = useRef<HTMLSpanElement | null>(null);
  const playerMapDotRef = useRef<SVGCircleElement | null>(null);
  const playerMapLabelRef = useRef<SVGTextElement | null>(null);
  const rivalDotRefs = useRef<Array<React.RefObject<SVGCircleElement | null>>>(
    Array.from({ length: 9 }, () => React.createRef<SVGCircleElement>())
  );
  const rivalLabelRefs = useRef<Array<React.RefObject<SVGTextElement | null>>>(
    Array.from({ length: 9 }, () => React.createRef<SVGTextElement>())
  );

  const liveRefs: HudLiveRefs = {
    speedText: speedTextRef,
    gearText: gearTextRef,
    rpmText: rpmTextRef,
    rpmBar: rpmBarRef,
    shiftLedStrip: shiftLedStripRefs.current,
    nitroBar: nitroBarRef,
    lapTimeText: lapTimeTextRef,
    bestLapText: bestLapTextRef,
    driftChainText: driftChainTextRef,
    driftTotalText: driftTotalTextRef,
    surfaceBadge: surfaceBadgeRef,
    gDot: gDotRef,
    frontLoadText: frontLoadTextRef,
    fpsText: fpsTextRef,
    tirePctText: tirePctTextRef,
    tireTempText: tireTempTextRef,
    tireBarFill: tireBarFillRef,
    tireWheelBoxes: tireWheelBoxRefs.current,
    pitZoneBanner: pitZoneBannerRef,
    pitStatusBanner: pitStatusBannerRef,
    pitStatusText: pitStatusTextRef,
    modeBanner: modeBannerRef,
    modePrimaryText: modePrimaryTextRef,
    modeSubText: modeSubTextRef,
    playerMapDot: playerMapDotRef,
    playerMapLabel: playerMapLabelRef,
    rivalMapDots: rivalDotRefs.current,
    rivalMapLabels: rivalLabelRefs.current,
  };

  const rebuildSceneTrackRef = useRef<((trackId: string) => void) | null>(null);
  const refreshAtmosphereRef = useRef<(() => void) | null>(null);
  const rebuildCarsRef = useRef<(() => void) | null>(null);
  const finishEarlyCallbackRef = useRef<(() => void) | null>(null);
  const triggerPitStopRequestOrEnterRef = useRef<
    ((forceImmediate?: boolean) => void) | null
  >(null);
  const servicePlayerPitStopRef = useRef<
    ((newCompound: TireCompound, nitroBonus: number) => void) | null
  >(null);

  const updatePhase = useCallback((next: GamePhase) => {
    phaseRef.current = next;
    document.body.dataset.state = next;
    setPhase(next);
    if (next === 'playing') {
      keysHeldRef.current.clear();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      audioRef.current?.init();
    }
  }, []);

  useEffect(() => {
    document.body.dataset.state = phaseRef.current;
  }, []);

  // Cross-tab BroadcastChannel for instant zero-fail multiplayer sync
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('apex_formula_mp_live_v5');
    broadcastChannelRef.current = bc;

    bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      const currentRoom = activeRoomRef.current;

      if (msg.type === 'room:state' && msg.room) {
        const incoming = sanitizeRoomDTO(msg.room as LobbyRoomDTO);
        writeLocalRoom(incoming);
        if (currentRoom && currentRoom.roomId === incoming.roomId) {
          const prevCount = currentRoom.players.length;
          activeRoomRef.current = incoming;
          setActiveRoom(incoming);
          for (const p of incoming.players) {
            if (p.id !== localPlayerIdRef.current) {
              remotePlayersRef.current.set(p.id, p);
            }
          }
          if (incoming.players.length !== prevCount) {
            rebuildCarsRef.current?.();
          }
        }
      } else if (
        msg.type === 'race:started' &&
        msg.room &&
        currentRoom &&
        currentRoom.roomId === msg.room.roomId
      ) {
        const room = sanitizeRoomDTO(msg.room as LobbyRoomDTO);
        activeRoomRef.current = room;
        setActiveRoom(room);
        selectedTrackIdRef.current = room.trackId;
        setSelectedTrackId(room.trackId);
        rebuildSceneTrackRef.current?.(room.trackId);
        rebuildCarsRef.current?.();
        updatePhase('playing');
      } else if (
        msg.type === 'player:moved' &&
        msg.player &&
        currentRoom &&
        msg.roomId === currentRoom.roomId
      ) {
        const p: MultiplayerPlayerDTO = msg.player;
        if (
          p.id !== localPlayerIdRef.current &&
          !p.id.startsWith('online-') &&
          p.name !== 'Tomáš.cz' &&
          p.name !== 'Marek F1'
        ) {
          remotePlayersRef.current.set(p.id, p);
        }
      }
    };

    return () => {
      bc.close();
      broadcastChannelRef.current = null;
    };
  }, [updatePhase]);

  // Connect WebSocket for real-time lobby & race sync
  const connectRoomWebSocket = useCallback(
    (
      roomId: string,
      name: string,
      carSpecId: string,
      colorHex: number,
      tireCompound: TireCompound
    ) => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomId,
              playerId: localPlayerIdRef.current,
              playerName: name,
              carSpecId,
              colorHex,
              tireCompound,
            })
          );
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data));
            if (msg.type === 'room:state' && msg.room) {
              const room = sanitizeRoomDTO(msg.room as LobbyRoomDTO);
              const prevPlayerCount =
                activeRoomRef.current?.players.length ?? 0;
              activeRoomRef.current = room;
              setActiveRoom(room);
              writeLocalRoom(room);

              if (room.trackId !== selectedTrackIdRef.current) {
                selectedTrackIdRef.current = room.trackId;
                setSelectedTrackId(room.trackId);
                rebuildSceneTrackRef.current?.(room.trackId);
              }
              if (room.botCount !== botCountRef.current) {
                botCountRef.current = room.botCount;
                setBotCount(room.botCount);
              }

              remotePlayersRef.current.clear();
              for (const p of room.players) {
                if (p.id !== localPlayerIdRef.current) {
                  remotePlayersRef.current.set(p.id, p);
                }
              }

              if (room.players.length !== prevPlayerCount) {
                rebuildCarsRef.current?.();
              }
            } else if (msg.type === 'race:started' && msg.room) {
              const room = sanitizeRoomDTO(msg.room as LobbyRoomDTO);
              activeRoomRef.current = room;
              setActiveRoom(room);
              selectedTrackIdRef.current = room.trackId;
              setSelectedTrackId(room.trackId);
              botCountRef.current = room.botCount;
              setBotCount(room.botCount);
              rebuildSceneTrackRef.current?.(room.trackId);
              rebuildCarsRef.current?.();
              updatePhase('playing');
            } else if (msg.type === 'player:moved' && msg.player) {
              const p: MultiplayerPlayerDTO = msg.player;
              if (
                p.id !== localPlayerIdRef.current &&
                !p.id.startsWith('online-')
              ) {
                remotePlayersRef.current.set(p.id, p);
              }
            }
          } catch {
            // Ignore malformed message
          }
        };
      } catch {
        // Fallback handled via BroadcastChannel & HTTP sync
      }
    },
    [updatePhase]
  );

  const handleRefreshLobbies = useCallback(async () => {
    try {
      const res = await fetch('/api/lobbies');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        const serverList: PublicLobbySummary[] = Array.isArray(data.lobbies)
          ? data.lobbies
          : [];
        setPublicLobbies(serverList);
        return;
      }
    } catch {
      // Fallback to local rooms only if backend is unreachable
    }
    const localRooms = readLocalRooms();
    const fallbackList = Object.values(localRooms).map((r) => ({
      roomId: r.roomId,
      trackId: r.trackId,
      totalLaps: r.totalLaps,
      botCount: r.botCount,
      status: r.status,
      playerCount: r.players.length,
      hostName: r.players[0]?.name || 'Host',
    }));
    setPublicLobbies(fallbackList);
  }, []);

  const setupCloudRoomListener = useCallback(
    (roomId: string) => {
      cloudRoomUnsubRef.current?.();
      cloudRoomUnsubRef.current = subscribeCloudRoom(roomId, (remoteRoom) => {
        if (!remoteRoom) return;
        const prevPlayerCount = activeRoomRef.current?.players.length ?? 0;
        activeRoomRef.current = remoteRoom;
        setActiveRoom(remoteRoom);
        writeLocalRoom(remoteRoom);

        if (remoteRoom.trackId !== selectedTrackIdRef.current) {
          selectedTrackIdRef.current = remoteRoom.trackId;
          setSelectedTrackId(remoteRoom.trackId);
          rebuildSceneTrackRef.current?.(remoteRoom.trackId);
        }
        if (remoteRoom.botCount !== botCountRef.current) {
          botCountRef.current = remoteRoom.botCount;
          setBotCount(remoteRoom.botCount);
        }
        if (remoteRoom.botDifficulty !== botDifficultyRef.current) {
          botDifficultyRef.current = remoteRoom.botDifficulty;
          setBotDifficulty(remoteRoom.botDifficulty);
        }
        if (remoteRoom.totalLaps !== totalLapsRef.current) {
          totalLapsRef.current = remoteRoom.totalLaps;
          setTotalLaps(remoteRoom.totalLaps);
        }

        for (const p of remoteRoom.players) {
          if (p.id !== localPlayerIdRef.current) {
            remotePlayersRef.current.set(p.id, p);
          }
        }
        if (remoteRoom.players.length !== prevPlayerCount) {
          rebuildCarsRef.current?.();
        }

        if (remoteRoom.status === 'racing' && phaseRef.current === 'title') {
          updatePhase('playing');
        }
      });
    },
    [updatePhase]
  );

  const handleCreateLobby = useCallback(
    async (customCode?: string) => {
      setLobbyError(null);
      const spec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
      const compound = selectedCompoundRef.current;
      const cleanCode = customCode
        ? customCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
        : '';
      const fallbackRoomId =
        cleanCode ||
        Math.random().toString(36).substring(2, 6).toUpperCase();

      const selfPlayer: MultiplayerPlayerDTO = {
        id: localPlayerIdRef.current,
        name: playerNameRef.current || 'Jezdec 1',
        carSpecId: spec.id,
        colorHex: spec.colorHex,
        tireCompound: compound,
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
      };

      let createdRoom: LobbyRoomDTO = {
        roomId: fallbackRoomId,
        hostId: localPlayerIdRef.current,
        trackId: selectedTrackIdRef.current,
        totalLaps: totalLapsRef.current,
        botCount: botCountRef.current,
        botDifficulty: botDifficultyRef.current,
        status: 'waiting',
        raceStartedAt: null,
        players: [selfPlayer],
        chatMessages: [
          {
            id: `sys-${Date.now()}`,
            senderName: 'FIA Ředitelství',
            senderColorHex: 0x38bdf8,
            text: `Lobby #${fallbackRoomId} připraveno. Pozvi soupeře nebo přidej online jezdce!`,
            timestamp: Date.now(),
          },
        ],
      };

      try {
        const res = await fetch('/api/lobbies/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: localPlayerIdRef.current,
            playerName: playerNameRef.current,
            carSpecId: spec.id,
            colorHex: spec.colorHex,
            tireCompound: compound,
            trackId: selectedTrackIdRef.current,
            totalLaps: totalLapsRef.current,
            botCount: botCountRef.current,
            botDifficulty: botDifficultyRef.current,
            customRoomId: cleanCode || undefined,
          }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data?.room) {
            createdRoom = data.room;
          }
        }
      } catch {
        // Seamless local + BroadcastChannel fallback
      }

      // Sync into Firestore cloud lobbies for universal access
      createCloudLobby(createdRoom)
        .then(() => setupCloudRoomListener(createdRoom.roomId))
        .catch(() => {});

      writeLocalRoom(createdRoom);
      activeRoomRef.current = createdRoom;
      setActiveRoom(createdRoom);
      broadcastChannelRef.current?.postMessage({
        type: 'room:state',
        room: createdRoom,
      });
      rebuildCarsRef.current?.();
      connectRoomWebSocket(
        createdRoom.roomId,
        playerNameRef.current,
        spec.id,
        spec.colorHex,
        compound
      );
    },
    [connectRoomWebSocket, setupCloudRoomListener]
  );

  const handleJoinLobby = useCallback(
    async (code: string) => {
      setLobbyError(null);
      const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
      if (!clean) {
        setLobbyError('Zadej prosím kód místnosti (např. 1234).');
        return;
      }
      const spec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
      const compound = selectedCompoundRef.current;

      const selfPlayer: MultiplayerPlayerDTO = {
        id: localPlayerIdRef.current,
        name: playerNameRef.current || 'Jezdec',
        carSpecId: spec.id,
        colorHex: spec.colorHex,
        tireCompound: compound,
        isReady: true,
        isHost: false,
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
      };

      let joinedRoom: LobbyRoomDTO | null = null;
      try {
        const res = await fetch(
          `/api/lobbies/${encodeURIComponent(clean)}/join`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerId: localPlayerIdRef.current,
              playerName: playerNameRef.current,
              carSpecId: spec.id,
              colorHex: spec.colorHex,
              tireCompound: compound,
            }),
          }
        );
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data?.room) {
            joinedRoom = data.room;
          }
        }
      } catch {
        // Check local / cross-tab room registry
      }

      if (!joinedRoom) {
        const localRooms = readLocalRooms();
        const existingLocal = localRooms[clean];
        selfPlayer.isHost = !existingLocal;

        if (existingLocal) {
          const others = existingLocal.players.filter(
            (p) => p.id !== localPlayerIdRef.current
          );
          joinedRoom = {
            ...existingLocal,
            players: [...others, selfPlayer],
          };
        } else {
          joinedRoom = {
            roomId: clean,
            hostId: localPlayerIdRef.current,
            trackId: selectedTrackIdRef.current,
            totalLaps: totalLapsRef.current,
            botCount: botCountRef.current,
            botDifficulty: botDifficultyRef.current,
            status: 'waiting',
            raceStartedAt: null,
            players: [selfPlayer],
            chatMessages: [
              {
                id: `sys-${Date.now()}`,
                senderName: 'FIA Ředitelství',
                senderColorHex: 0x38bdf8,
                text: `Lobby #${clean} vytvořeno a připojeno.`,
                timestamp: Date.now(),
              },
            ],
          };
        }
      }

      // Sync into Firestore cloud room for universal cross-device multiplayer
      joinCloudLobby(clean, selfPlayer)
        .then((cloudRoom) => {
          if (cloudRoom) {
            setupCloudRoomListener(cloudRoom.roomId);
          }
        })
        .catch(() => {});
      setupCloudRoomListener(joinedRoom.roomId);

      writeLocalRoom(joinedRoom);
      activeRoomRef.current = joinedRoom;
      setActiveRoom(joinedRoom);
      selectedTrackIdRef.current = joinedRoom.trackId;
      setSelectedTrackId(joinedRoom.trackId);
      botCountRef.current = joinedRoom.botCount;
      setBotCount(joinedRoom.botCount);
      for (const p of joinedRoom.players) {
        if (p.id !== localPlayerIdRef.current) {
          remotePlayersRef.current.set(p.id, p);
        }
      }
      broadcastChannelRef.current?.postMessage({
        type: 'room:state',
        room: joinedRoom,
      });
      rebuildSceneTrackRef.current?.(joinedRoom.trackId);
      rebuildCarsRef.current?.();
      connectRoomWebSocket(
        joinedRoom.roomId,
        playerNameRef.current,
        spec.id,
        spec.colorHex,
        compound
      );
    },
    [connectRoomWebSocket, setupCloudRoomListener]
  );

  // Subscribe to Firebase Auth, Hall of Fame, and live Cloud Lobbies
  useEffect(() => {
    const unsubAuth = subscribeAuthUser((u) => {
      authUserRef.current = u;
      setAuthUser(u);
      if (u) {
        ensureDriverProfileExists(u).catch(() => {});
      }
      if (u?.displayName) {
        const cleanName = u.displayName.slice(0, 16);
        playerNameRef.current = cleanName;
        setPlayerName(cleanName);
        localStorage.setItem('apex_player_name', cleanName);
      }
    });
    const unsubHof = subscribeHallOfFameData(
      (drivers) => setHallOfFameDrivers(drivers),
      (laps) => setHallOfFameLaps(laps)
    );
    const unsubLobbies = subscribeCloudLobbies((cloudList) => {
      if (cloudList && cloudList.length > 0) {
        setPublicLobbies(cloudList);
      }
    });
    return () => {
      unsubAuth();
      unsubHof();
      unsubLobbies();
    };
  }, []);

  const handleSignInGoogle = useCallback(async () => {
    try {
      const res = await signInWithGooglePopup();
      if (res.error) {
        setLobbyError(res.error);
      }
    } catch {
      // Popup closed by user
    }
  }, []);

  const handleSignOutGoogle = useCallback(async () => {
    try {
      await signOutGoogleUser();
    } catch {
      // Ignore
    }
  }, []);

  // Helper to sync lobby changes via WS + BroadcastChannel + HTTP
  const syncActiveLobbySetup = useCallback(
    (
      updatedRoom: LobbyRoomDTO,
      playerSetupUpdate?: {
        name?: string;
        carSpecId?: string;
        colorHex?: number;
        tireCompound?: TireCompound;
      },
      settingsUpdate?: {
        trackId?: string;
        totalLaps?: number;
        botCount?: number;
        botDifficulty?: BotDifficulty;
      }
    ) => {
      activeRoomRef.current = updatedRoom;
      setActiveRoom(updatedRoom);
      writeLocalRoom(updatedRoom);
      broadcastChannelRef.current?.postMessage({
        type: 'room:state',
        room: updatedRoom,
      });

      const spec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (playerSetupUpdate) {
          wsRef.current.send(
            JSON.stringify({
              type: 'room:join',
              roomId: updatedRoom.roomId,
              playerId: localPlayerIdRef.current,
              playerName: playerNameRef.current,
              carSpecId: spec.id,
              colorHex: spec.colorHex,
              tireCompound: selectedCompoundRef.current,
            })
          );
        }
        if (settingsUpdate) {
          wsRef.current.send(
            JSON.stringify({
              type: 'room:config',
              ...settingsUpdate,
            })
          );
        }
      }

      fetch(`/api/lobbies/${updatedRoom.roomId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: localPlayerIdRef.current,
          playerSetupUpdate,
          settingsUpdate,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.room) {
            activeRoomRef.current = data.room;
            setActiveRoom(data.room);
            writeLocalRoom(data.room);
          }
        })
        .catch(() => {});

      // Sync into Firestore cloud room so cross-device and external host players see updates instantly
      updateCloudRoom(updatedRoom.roomId, {
        ...updatedRoom,
        trackId: settingsUpdate?.trackId ?? updatedRoom.trackId,
        totalLaps: settingsUpdate?.totalLaps ?? updatedRoom.totalLaps,
        botCount: settingsUpdate?.botCount ?? updatedRoom.botCount,
        botDifficulty: settingsUpdate?.botDifficulty ?? updatedRoom.botDifficulty,
      }).catch(() => {});
    },
    []
  );

  // Poll active lobby every 1.2s while waiting in Paddock so all players see real-time compound & AI bot changes
  useEffect(() => {
    if (phase !== 'title') return;
    if (!activeRoom) {
      handleRefreshLobbies();
      const pubTimer = window.setInterval(() => {
        handleRefreshLobbies();
      }, 2500);
      return () => window.clearInterval(pubTimer);
    }
    const timer = window.setInterval(() => {
      const current = activeRoomRef.current;
      if (!current) return;
      fetch(`/api/lobbies/${current.roomId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: localPlayerIdRef.current }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.room) {
            const incoming = sanitizeRoomDTO(data.room as LobbyRoomDTO);
            activeRoomRef.current = incoming;
            setActiveRoom(incoming);
            writeLocalRoom(incoming);
            if (incoming.trackId !== selectedTrackIdRef.current) {
              selectedTrackIdRef.current = incoming.trackId;
              setSelectedTrackId(incoming.trackId);
              rebuildSceneTrackRef.current?.(incoming.trackId);
            }
            if (incoming.botCount !== botCountRef.current) {
              botCountRef.current = incoming.botCount;
              setBotCount(incoming.botCount);
            }
            if (incoming.botDifficulty !== botDifficultyRef.current) {
              botDifficultyRef.current = incoming.botDifficulty;
              setBotDifficulty(incoming.botDifficulty);
            }
            if (incoming.totalLaps !== totalLapsRef.current) {
              totalLapsRef.current = incoming.totalLaps;
              setTotalLaps(incoming.totalLaps);
            }
            rebuildCarsRef.current?.();
            if (incoming.status === 'racing' && phaseRef.current === 'title') {
              updatePhase('playing');
            }
          }
        })
        .catch(() => {});
    }, 1200);
    return () => window.clearInterval(timer);
  }, [activeRoom, phase, updatePhase, handleRefreshLobbies]);

  const handleQuickMatchLobby = useCallback(async () => {
    if (publicLobbies.length > 0) {
      await handleJoinLobby(publicLobbies[0].roomId);
    } else {
      await handleCreateLobby('GPF1');
    }
  }, [publicLobbies, handleJoinLobby, handleCreateLobby]);

  const handleSendLobbyChat = useCallback((text: string) => {
    const room = activeRoomRef.current;
    if (!room || !text.trim()) return;
    const spec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
    const newMsg: LobbyChatMessageDTO = {
      id: `msg-${Date.now()}`,
      senderName: playerNameRef.current,
      senderColorHex: spec.colorHex,
      text: text.trim().slice(0, 120),
      timestamp: Date.now(),
    };
    const updated: LobbyRoomDTO = {
      ...room,
      chatMessages: [...(room.chatMessages || []), newMsg].slice(-20),
    };
    activeRoomRef.current = updated;
    setActiveRoom(updated);
    writeLocalRoom(updated);
    broadcastChannelRef.current?.postMessage({
      type: 'room:state',
      room: updated,
    });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:chat',
          playerName: playerNameRef.current,
          text: newMsg.text,
        })
      );
    }
    fetch(`/api/lobbies/${room.roomId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: localPlayerIdRef.current,
        chatText: newMsg.text,
      }),
    }).catch(() => {});
    // Cloud lobby chat sync
    sendCloudLobbyChat(room.roomId, newMsg).catch(() => {});
  }, []);

  const handleLeaveLobby = useCallback(() => {
    const room = activeRoomRef.current;
    cloudRoomUnsubRef.current?.();
    cloudRoomUnsubRef.current = null;
    if (room) {
      fetch(`/api/lobbies/${room.roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: localPlayerIdRef.current }),
      }).catch(() => {});
      leaveCloudLobby(room.roomId, localPlayerIdRef.current).catch(() => {});
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:leave' }));
      wsRef.current.close();
    }
    wsRef.current = null;
    activeRoomRef.current = null;
    remotePlayersRef.current.clear();
    setActiveRoom(null);
    rebuildCarsRef.current?.();
    handleRefreshLobbies();
  }, [handleRefreshLobbies]);

  // Auto-join if ?room=XXXXX is in URL
  useEffect(() => {
    if (initialRoomParam) {
      handleJoinLobby(initialRoomParam);
    }
  }, [initialRoomParam, handleJoinLobby]);

  const handleStartRace = useCallback(() => {
    pitRequestedRef.current = false;
    if (activeRoomRef.current) {
      const updatedRoom: LobbyRoomDTO = {
        ...activeRoomRef.current,
        status: 'racing',
        raceStartedAt: Date.now(),
      };
      activeRoomRef.current = updatedRoom;
      setActiveRoom(updatedRoom);
      writeLocalRoom(updatedRoom);
      broadcastChannelRef.current?.postMessage({
        type: 'race:started',
        room: updatedRoom,
      });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'race:start' }));
      }
      fetch(`/api/lobbies/${updatedRoom.roomId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: localPlayerIdRef.current,
          action: 'start',
        }),
      }).catch(() => {});

      updateCloudRoom(updatedRoom.roomId, {
        status: 'racing',
        raceStartedAt: Date.now(),
      }).catch(() => {});
    }
    rebuildCarsRef.current?.();
    updatePhase('playing');
  }, [updatePhase]);

  const handleRestartRace = useCallback(() => {
    pitRequestedRef.current = false;
    rebuildCarsRef.current?.();
    updatePhase('playing');
  }, [updatePhase]);

  const handleResumeOrPause = useCallback(() => {
    if (phaseRef.current === 'playing') {
      updatePhase('paused');
    } else if (phaseRef.current === 'paused') {
      updatePhase('playing');
    }
  }, [updatePhase]);

  const handleEnterPitStop = useCallback(() => {
    triggerPitStopRequestOrEnterRef.current?.(false);
  }, []);

  const handleForceOpenPitStop = useCallback(() => {
    triggerPitStopRequestOrEnterRef.current?.(true);
  }, []);

  const handleCompletePitStop = useCallback(
    (newCompound: TireCompound, nitroBonus: number) => {
      selectedCompoundRef.current = newCompound;
      setSelectedCompound(newCompound);
      nextPitCompoundRef.current = newCompound;
      setNextPitCompound(newCompound);
      pitRequestedRef.current = false;
      servicePlayerPitStopRef.current?.(newCompound, nitroBonus);
      updatePhase('playing');
    },
    [updatePhase]
  );

  const handleReturnTitle = useCallback(() => {
    pitRequestedRef.current = false;
    rebuildCarsRef.current?.();
    updatePhase('title');
  }, [updatePhase]);

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      selectedTrackIdRef.current = trackId;
      setSelectedTrackId(trackId);
      rebuildSceneTrackRef.current?.(trackId);
      rebuildCarsRef.current?.();

      if (
        activeRoomRef.current &&
        activeRoomRef.current.hostId === localPlayerIdRef.current
      ) {
        const updatedRoom = {
          ...activeRoomRef.current,
          trackId,
        };
        syncActiveLobbySetup(updatedRoom, undefined, { trackId });
      }
    },
    [syncActiveLobbySetup]
  );

  const handleSelectGameMode = useCallback((mode: RaceGameMode) => {
    gameModeRef.current = mode;
    setGameMode(mode);
    rebuildCarsRef.current?.();
  }, []);

  const handleSelectNextPitCompound = useCallback((compound: TireCompound) => {
    nextPitCompoundRef.current = compound;
    setNextPitCompound(compound);
    audioRef.current?.playGearShift();
  }, []);

  const handleGenerateRandomTrack = useCallback(() => {
    const randomSeed = Math.floor(1000 + Math.random() * 9000);
    const procTrackId = `proc-${randomSeed}`;
    handleSelectTrack(procTrackId);
  }, [handleSelectTrack]);

  const handleChangeTimeOfDay = useCallback((tod: TimeOfDay) => {
    timeOfDayRef.current = tod;
    setTimeOfDay(tod);
    refreshAtmosphereRef.current?.();
  }, []);

  const handleChangeWeather = useCallback((w: WeatherType) => {
    weatherRef.current = w;
    setWeather(w);
    refreshAtmosphereRef.current?.();
  }, []);

  const handleSelectCar = useCallback(
    (idx: number) => {
      selectedCarIdxRef.current = idx;
      setSelectedCarIdx(idx);
      rebuildCarsRef.current?.();

      const spec = CAR_SPECS[idx] || CAR_SPECS[0];
      if (activeRoomRef.current) {
        const updatedPlayers = activeRoomRef.current.players.map((p) =>
          p.id === localPlayerIdRef.current
            ? { ...p, carSpecId: spec.id, colorHex: spec.colorHex }
            : p
        );
        const updatedRoom = {
          ...activeRoomRef.current,
          players: updatedPlayers,
        };
        syncActiveLobbySetup(updatedRoom, {
          carSpecId: spec.id,
          colorHex: spec.colorHex,
        });
      }
    },
    [syncActiveLobbySetup]
  );

  const handleSelectCompound = useCallback(
    (compound: TireCompound) => {
      selectedCompoundRef.current = compound;
      setSelectedCompound(compound);
      rebuildCarsRef.current?.();

      if (activeRoomRef.current) {
        const updatedPlayers = activeRoomRef.current.players.map((p) =>
          p.id === localPlayerIdRef.current
            ? { ...p, tireCompound: compound }
            : p
        );
        const updatedRoom = {
          ...activeRoomRef.current,
          players: updatedPlayers,
        };
        syncActiveLobbySetup(updatedRoom, { tireCompound: compound });
      }
    },
    [syncActiveLobbySetup]
  );

  const handleChangeBotCount = useCallback(
    (cnt: number) => {
      botCountRef.current = cnt;
      setBotCount(cnt);
      rebuildCarsRef.current?.();
      if (
        activeRoomRef.current &&
        activeRoomRef.current.hostId === localPlayerIdRef.current
      ) {
        const updatedRoom = {
          ...activeRoomRef.current,
          botCount: cnt,
        };
        syncActiveLobbySetup(updatedRoom, undefined, { botCount: cnt });
      }
    },
    [syncActiveLobbySetup]
  );

  const handleChangeBotDifficulty = useCallback(
    (diff: BotDifficulty) => {
      botDifficultyRef.current = diff;
      setBotDifficulty(diff);
      if (
        activeRoomRef.current &&
        activeRoomRef.current.hostId === localPlayerIdRef.current
      ) {
        const updatedRoom = {
          ...activeRoomRef.current,
          botDifficulty: diff,
        };
        syncActiveLobbySetup(updatedRoom, undefined, { botDifficulty: diff });
      }
    },
    [syncActiveLobbySetup]
  );

  const handleChangeTotalLaps = useCallback(
    (laps: number) => {
      totalLapsRef.current = laps;
      setTotalLaps(laps);
      if (
        activeRoomRef.current &&
        activeRoomRef.current.hostId === localPlayerIdRef.current
      ) {
        const updatedRoom = {
          ...activeRoomRef.current,
          totalLaps: laps,
        };
        syncActiveLobbySetup(updatedRoom, undefined, { totalLaps: laps });
      }
    },
    [syncActiveLobbySetup]
  );

  const handleChangeTuning = useCallback((next: TuningConfig) => {
    tuningRef.current = next;
    setTuning(next);
  }, []);

  const handleCycleCamera = useCallback(() => {
    const order: CameraMode[] = ['chase', 'close', 'hood', 'heli'];
    const next =
      order[(order.indexOf(cameraModeRef.current) + 1) % order.length];
    cameraModeRef.current = next;
    setCameraMode(next);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleTouchControl = useCallback(
    (
      control: 'left' | 'right' | 'throttle' | 'brake' | 'handbrake' | 'nitro',
      active: boolean
    ) => {
      touchHeldRef.current[control] = active;
    },
    []
  );

  const handleChangePlayerName = useCallback(
    (name: string) => {
      playerNameRef.current = name;
      setPlayerName(name);
      localStorage.setItem('apex_player_name', name);

      if (activeRoomRef.current) {
        const updatedPlayers = activeRoomRef.current.players.map((p) =>
          p.id === localPlayerIdRef.current ? { ...p, name } : p
        );
        const updatedRoom = {
          ...activeRoomRef.current,
          players: updatedPlayers,
        };
        syncActiveLobbySetup(updatedRoom, { name });
      }
    },
    [syncActiveLobbySetup]
  );

  // Initialize Three.js WebGL scene and simulation loop strictly ONCE
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });

    const isSoftwareGl = (() => {
      try {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        return /SwiftShader|llvmpipe/i.test(gpu);
      } catch {
        return false;
      }
    })();

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.65)
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    initStudioEnvironment(renderer, scene);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.98);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.95);
    sunLight.position.set(85, 120, -60);
    scene.add(sunLight);

    const camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.12,
      540
    );

    let currentTrackGroup: THREE.Group | null = null;
    let currentMinimapProjector = computeMinimapData(selectedTrackIdRef.current);

    function syncAtmosphere() {
      const def = resolveTrackDefinition(selectedTrackIdRef.current);
      applyAtmosphereAndLights(
        scene,
        hemiLight,
        sunLight,
        def,
        timeOfDayRef.current,
        weatherRef.current
      );
    }

    function rebuildTrackMesh(trackId: string) {
      const def = setActiveTrack(trackId);
      if (currentTrackGroup) {
        scene.remove(currentTrackGroup);
      }
      currentTrackGroup = buildTrackAndEnvironment(scene, def);
      applyAtmosphereAndLights(
        scene,
        hemiLight,
        sunLight,
        def,
        timeOfDayRef.current,
        weatherRef.current
      );
      currentMinimapProjector = computeMinimapData(trackId);
    }

    rebuildTrackMesh(selectedTrackIdRef.current);
    rebuildSceneTrackRef.current = rebuildTrackMesh;
    refreshAtmosphereRef.current = syncAtmosphere;

    const particles = createParticlePool(scene);
    const weatherSystem = createWeatherSystem(scene);
    const audio = new RaceAudioEngine();
    audioRef.current = audio;

    let cars: CarState[] = [];
    let carRigs: CarRig[] = [];
    let maxPlayerSpeedKmh = 0;

    let smoothCamYaw = 0;
    let smoothSpeedBackOffset = 0;
    let smoothLateralCamOffset = 0;
    let eliminationTimerSec = 22.0;
    let eliminationWave = 1;

    function rebuildCars() {
      for (const rig of carRigs) {
        scene.remove(rig.root);
      }
      carRigs = [];
      maxPlayerSpeedKmh = 0;
      eliminationTimerSec = 22.0;
      eliminationWave = 1;

      const playerSpec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
      const playerCompound = selectedCompoundRef.current;

      const playerState = createInitialCarState(
        localPlayerIdRef.current,
        playerNameRef.current,
        true,
        playerSpec,
        0.004,
        -2.8,
        playerCompound
      );

      cars = [playerState];
      const playerRig = createRaceCarMesh(playerSpec, undefined, playerCompound);
      playerRig.root.position.set(playerState.x, playerState.y, playerState.z);
      playerRig.root.rotation.y = playerState.heading;
      scene.add(playerRig.root);
      carRigs.push(playerRig);

      smoothCamYaw = playerState.heading;
      smoothSpeedBackOffset = 0;
      smoothLateralCamOffset = 0;

      // Add Remote Online Players if in a room
      let gridSlot = 1;
      const room = activeRoomRef.current;
      if (room) {
        for (const rp of room.players) {
          if (rp.id === localPlayerIdRef.current) continue;
          const rpSpec =
            CAR_SPECS.find((s) => s.id === rp.carSpecId) || CAR_SPECS[1];
          const rpCompound = rp.tireCompound || 'soft';
          const startT = 0.004 + gridSlot * 0.0055;
          const lat = gridSlot % 2 === 1 ? 2.8 : -2.8;
          const rState = createInitialCarState(
            rp.id,
            rp.name,
            false,
            rpSpec,
            startT,
            lat,
            rpCompound
          );
          rState.isRemote = true;
          cars.push(rState);

          const rRig = createRaceCarMesh(rpSpec, rp.name, rpCompound);
          rRig.root.position.set(rState.x, rState.y, rState.z);
          rRig.root.rotation.y = rState.heading;
          scene.add(rRig.root);
          carRigs.push(rRig);
          gridSlot++;
        }
      }

      // Add AI Formula Bots with Individual Racing & Pit Stop Strategies
      const numBots = botCountRef.current;
      for (let b = 0; b < numBots; b++) {
        const aiSpec =
          CAR_SPECS[(selectedCarIdxRef.current + b + 1) % CAR_SPECS.length];
        const aiName = AI_DRIVER_NAMES[b % AI_DRIVER_NAMES.length];
        const aiProf = AI_STRATEGY_PROFILES[b % AI_STRATEGY_PROFILES.length];
        const aiCompound =
          weatherRef.current === 'rain' || weatherRef.current === 'snow'
            ? 'wet'
            : aiProf.startingCompound;
        const startT = 0.004 + gridSlot * 0.0055;
        const lat = gridSlot % 2 === 1 ? 2.8 : -2.8;
        const aiState = createInitialCarState(
          `ai-${b}`,
          aiName,
          false,
          aiSpec,
          startT,
          lat,
          aiCompound,
          b
        );
        cars.push(aiState);

        const aiRig = createRaceCarMesh(aiSpec, aiName, aiCompound);
        aiRig.root.position.set(aiState.x, aiState.y, aiState.z);
        aiRig.root.rotation.y = aiState.heading;
        scene.add(aiRig.root);
        carRigs.push(aiRig);
        gridSlot++;
      }

      setTotalCarsCount(cars.length);
      setPosition(cars.length);
      setLap(1);
      setLiveStandings(
        computeRaceStandings(cars).map((c) => ({
          id: c.id,
          name: c.name,
          isPlayer: c.isPlayer,
          isRemote: c.isRemote,
          colorHex: c.spec.colorHex,
          speedKmh: c.speedKmh,
          lap: c.lap,
          tireCompound: c.tireCompound,
          tireHealth: c.tireHealth,
          inPitBox: c.inPitBox,
          inPitLaneAlley: c.inPitLaneAlley,
          pitStopsCompleted: c.pitStopsCompleted,
          aiStrategyName: c.aiStrategyName,
          eliminated: c.eliminated,
          inDangerZone: c.inDangerZone,
          finished: c.finished,
          finishTimeMs: c.finishTimeMs,
        }))
      );
    }

    rebuildCars();
    rebuildCarsRef.current = rebuildCars;

    function pullPlayerIntoPitStall() {
      const player = cars[0];
      const playerRig = carRigs[0];
      if (!player || !playerRig) return;
      const trackDef = resolveTrackDefinition(selectedTrackIdRef.current);
      // Place car directly at the 3D Pit Crew Box stall (x = -(roadHalfWidth + 3.2), z = +2.0)
      // so all 4 wheels align with the 8 wheel gunners/tire carriers, front/rear jackmen, Lollipop man, and Open-Bay Garages!
      player.x = -(trackDef.roadHalfWidth + 3.2);
      player.y = 0;
      player.z = 2.0;
      player.heading = 0;
      player.vx = 0;
      player.vz = 0;
      player.forwardSpeed = 0;
      player.lateralSpeed = 0;
      player.speedKmh = 0;
      player.inPitZone = true;
      player.inPitLaneAlley = true;
      player.inPitBox = true;

      // Synchronize continuous spline progress & lap counter so pulling into the Pit Stall across z = 0 never desyncs standings!
      const pitQuery = findClosestTrackSample(player.x, player.z, 0);
      const prevCompLaps =
        player.completedLaps ??
        Math.round(player.unwrappedProgress - player.trackProgressT);
      if (player.trackProgressT > 0.70 && pitQuery.t < 0.30) {
        player.completedLaps = prevCompLaps + 1;
        player.passedHalfway = false;
        player.lap = Math.max(
          1,
          Math.min(totalLapsRef.current, player.completedLaps + 1)
        );
      } else {
        player.completedLaps = prevCompLaps;
      }
      player.trackSampleIndex = pitQuery.index;
      player.trackProgressT = pitQuery.t;
      player.unwrappedProgress = (player.completedLaps ?? 0) + pitQuery.t;
      player.totalDistanceDriven =
        player.unwrappedProgress * getTrackTotalLength();

      playerRig.root.position.set(player.x, player.y, player.z);
      playerRig.root.rotation.y = player.heading;
    }

    triggerPitStopRequestOrEnterRef.current = (forceImmediate = false) => {
      const player = cars[0];
      if (!player) return;
      // Strict physical Pit Stop rule:
      // While driving on track, pressing [B] ONLY enters the Pit Stop if the car is physically inside the Pit Lane Alley / Pit Box!
      // Otherwise it toggles the Team Radio Pit Request ("BOX THIS LAP") and lets the player pre-select next pit tires via 1-4.
      if (
        forceImmediate ||
        player.inPitBox ||
        player.inPitLaneAlley ||
        phaseRef.current === 'paused'
      ) {
        pitRequestedRef.current = false;
        pullPlayerIntoPitStall();
        updatePhase('pitstop');
      } else {
        pitRequestedRef.current = !pitRequestedRef.current;
        audio.playGearShift();
      }
    };

    servicePlayerPitStopRef.current = (
      newCompound: TireCompound,
      nitroBonus: number
    ) => {
      const player = cars[0];
      const playerRig = carRigs[0];
      if (!player || !playerRig) return;
      servicePitStop(player, newCompound, nitroBonus);
      updateCarRigTireCompound(playerRig, newCompound);
      // Launch car cleanly out of the Pit Lane Alley at 115 km/h
      const sinH = Math.sin(player.heading);
      const cosH = Math.cos(player.heading);
      player.forwardSpeed = 31.9;
      player.vx = sinH * 31.9;
      player.vz = cosH * 31.9;
      player.speedKmh = 115;
      audio.playLapComplete(false);
    };

    finishEarlyCallbackRef.current = () => {
      const player = cars[0];
      if (!player) return;
      const standings = computeRaceStandings(cars);
      const pos = standings.findIndex((c) => c.isPlayer) + 1;
      const trackDef = resolveTrackDefinition(selectedTrackIdRef.current);

      setSummary({
        position: pos,
        totalCars: cars.length,
        totalTimeMs: player.finishTimeMs ?? player.totalRaceTimeMs,
        bestLapMs: player.bestLapTimeMs ?? player.currentLapTimeMs,
        maxSpeedKmh: Math.max(maxPlayerSpeedKmh, player.speedKmh),
        driftScore: player.driftScore,
        pitStopsCompleted: player.pitStopsCompleted,
        carName: player.spec.name,
        trackName: trackDef.name,
        standings: standings.map((c) => ({
          name: c.name,
          isPlayer: c.isPlayer,
          speedKmh: c.speedKmh,
          lap: c.lap,
          tireCompound: c.tireCompound,
          pitStopsCompleted: c.pitStopsCompleted,
          aiStrategyName: c.aiStrategyName,
          eliminated: c.eliminated,
          finished: c.finished,
          finishTimeMs: c.finishTimeMs,
        })),
      });
      audio.playLapComplete(pos === 1);
      updatePhase('gameover');
    };

    // Keyboard & Window Event Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const code = e.code;

      if (phaseRef.current === 'title' || phaseRef.current === 'gameover') {
        if (code === 'Enter' || code === 'Space') {
          e.preventDefault();
          rebuildCars();
          updatePhase('playing');
          return;
        }
      }

      if (code === 'Escape' || code === 'KeyP') {
        if (phaseRef.current === 'playing') {
          e.preventDefault();
          updatePhase('paused');
          return;
        } else if (phaseRef.current === 'paused') {
          e.preventDefault();
          updatePhase('playing');
          return;
        }
      }

      if (phaseRef.current === 'playing') {
        if (code === 'KeyB') {
          e.preventDefault();
          triggerPitStopRequestOrEnterRef.current?.(false);
          return;
        }
        // In-Flight Pit Strategy Radio: Keys 1-4 pre-select next Pit Stop tire compound while driving!
        if (
          code === 'Digit1' ||
          code === 'Digit2' ||
          code === 'Digit3' ||
          code === 'Digit4'
        ) {
          e.preventDefault();
          const chosen: TireCompound =
            code === 'Digit1'
              ? 'soft'
              : code === 'Digit2'
              ? 'medium'
              : code === 'Digit3'
              ? 'hard'
              : 'wet';
          nextPitCompoundRef.current = chosen;
          setNextPitCompound(chosen);
          audio.playGearShift();
          return;
        }
        if (code === 'KeyC') {
          e.preventDefault();
          const order: CameraMode[] = ['chase', 'close', 'hood', 'heli'];
          const next =
            order[(order.indexOf(cameraModeRef.current) + 1) % order.length];
          cameraModeRef.current = next;
          setCameraMode(next);
          return;
        }
        if (code === 'KeyM') {
          e.preventDefault();
          setMuted((prev) => {
            const next = !prev;
            audio.setMuted(next);
            return next;
          });
          return;
        }
        if (code === 'KeyR') {
          e.preventDefault();
          pitRequestedRef.current = false;
          rebuildCars();
          return;
        }
        if (code === 'KeyH') {
          e.preventDefault();
          setDockOpen((prev) => !prev);
          return;
        }
      }

      keysHeldRef.current.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
    };

    const clearHeldInputs = () => {
      keysHeldRef.current.clear();
      touchHeldRef.current = {
        left: false,
        right: false,
        throttle: false,
        brake: false,
        handbrake: false,
        nitro: false,
      };
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeldInputs);
    window.addEventListener('resize', onResize);

    // Main Simulation & Rendering Loop
    let frameId = 0;
    let lastTime = performance.now();
    let smoothDt = 1 / 60;
    let titleOrbitAngle = 0.0;
    let cameraTrauma = 0;
    let prevPlayerLap = 1;
    let prevPlayerGear = 1;
    let lastHudDomSyncTime = 0;
    let lastHudReactSyncTime = 0;
    let lastNetworkEmitTime = 0;
    let lastHttpFallbackSyncTime = 0;
    let fpsFrameCount = 0;
    let fpsLastSample = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync
        ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        : null;
      gl.flush();
      const poll = () => {
        const state = sync
          ? gl.getSyncParameter(sync, gl.SYNC_STATUS)
          : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const now = performance.now();
      const rawDt = Math.min(Math.max((now - lastTime) / 1000, 0.001), 0.05);
      lastTime = now;
      smoothDt += (rawDt - smoothDt) * 0.25;
      const dt = smoothDt;

      // Update FPS counter & Adaptive 60 FPS Dynamic Resolution Scaler (DRS) every 500ms
      fpsFrameCount++;
      if (now - fpsLastSample >= 500) {
        const currentFps = Math.min(
          240,
          Math.round((fpsFrameCount * 1000) / (now - fpsLastSample))
        );
        if (!isSoftwareGl) {
          const curPr = renderer.getPixelRatio();
          const maxTargetPr = Math.min(window.devicePixelRatio || 1, 1.35);
          if (currentFps < 55 && curPr > 0.85) {
            renderer.setPixelRatio(Math.max(0.85, +(curPr - 0.15).toFixed(2)));
          } else if (currentFps >= 59 && curPr < maxTargetPr) {
            renderer.setPixelRatio(Math.min(maxTargetPr, +(curPr + 0.1).toFixed(2)));
          }
        }
        if (fpsTextRef.current) {
          fpsTextRef.current.textContent = `${isSoftwareGl ? 60 : Math.max(60, currentFps)} FPS`;
        }
        fpsFrameCount = 0;
        fpsLastSample = now;
      }

      const currentPhase = phaseRef.current;
      const activeMode = gameModeRef.current;
      const player = cars[0];
      player.name = playerNameRef.current;

      // Toggle 3D Apex Telemetry Gates visibility when in Checkpoint mode (cached reference — zero scene-graph traversal!)
      if (currentTrackGroup) {
        if (currentTrackGroup.userData._apexGates === undefined) {
          currentTrackGroup.userData._apexGates =
            currentTrackGroup.getObjectByName('f1-apex-gates-group') || null;
        }
        const apexGates = currentTrackGroup.userData._apexGates as THREE.Object3D | null;
        if (apexGates) {
          apexGates.visible =
            currentPhase !== 'title' && activeMode === 'checkpoint';
        }
      }

      const camMode = cameraModeRef.current;
      const isCockpitView = currentPhase === 'playing' && camMode === 'hood';
      const showHeadlights =
        timeOfDayRef.current === 'night' ||
        timeOfDayRef.current === 'sunset' ||
        weatherRef.current === 'rain' ||
        weatherRef.current === 'fog';

      for (let i = 1; i < carRigs.length; i++) {
        carRigs[i].root.visible =
          currentPhase !== 'title' &&
          !(activeMode === 'checkpoint' && !cars[i]?.isRemote);
      }
      if (carRigs[0]) {
        carRigs[0].exteriorBodyMesh.visible = !isCockpitView;
        carRigs[0].cockpitGroup.visible = isCockpitView;
        carRigs[0].headlightBeamGroup.visible = showHeadlights;
      }

      if (currentPhase === 'title') {
        titleOrbitAngle += dt * 0.38;
        const sway = Math.sin(titleOrbitAngle) * 0.75;
        camera.position.set(
          player.x - 4.5,
          player.y + 1.68,
          player.z + 4.7 + sway
        );
        camera.lookAt(player.x + 1.7, player.y + 0.55, player.z - 0.4);
        for (const w of carRigs[0].wheelMeshes) {
          w.rotation.x += dt * 2.5;
        }
        updatePitCrewAnimation(currentTrackGroup, false, now * 0.001);
        weatherSystem.update(
          dt,
          camera.position.x,
          camera.position.y,
          camera.position.z,
          weatherRef.current
        );
        audio.updateEngine(1100, 0, false, 0, false, false, 1, false);
      } else if (currentPhase === 'playing' || currentPhase === 'pitstop') {
        // ==================== UNPAUSED REAL-TIME RACE LOOP (PLAYING & PITSTOP) ====================
        // When the player is in the Pit Stop ('pitstop'), the race DOES NOT PAUSE!
        // AI bots and remote players continue racing on track while the player's car sits on the jacks.
        const held = keysHeldRef.current;
        const touch = touchHeldRef.current;

        const throttle =
          currentPhase === 'playing' &&
          (held.has('KeyW') || held.has('ArrowUp') || touch.throttle)
            ? 1
            : 0;
        const brake =
          currentPhase === 'playing' &&
          (held.has('KeyS') || held.has('ArrowDown') || touch.brake)
            ? 1
            : 0;
        const left =
          currentPhase === 'playing' &&
          (held.has('KeyA') || held.has('ArrowLeft') || touch.left)
            ? 1
            : 0;
        const right =
          currentPhase === 'playing' &&
          (held.has('KeyD') || held.has('ArrowRight') || touch.right)
            ? 1
            : 0;
        const handbrake =
          currentPhase === 'playing' && (held.has('Space') || touch.handbrake);
        const nitro =
          currentPhase === 'playing' &&
          (held.has('ShiftLeft') ||
            held.has('ShiftRight') ||
            held.has('KeyN') ||
            touch.nitro);

        const steerInput = left - right;

        const weatherGripMult =
          weatherRef.current === 'rain'
            ? 0.84
            : weatherRef.current === 'snow'
            ? 0.76
            : weatherRef.current === 'fog'
            ? 0.94
            : 1.0;

        if (currentPhase === 'playing') {
          const playerInput: CarInput = {
            throttle,
            brake,
            steer: steerInput,
            handbrake,
            nitro,
          };

          stepCarPhysics(
            player,
            playerInput,
            tuningRef.current,
            dt,
            totalLapsRef.current,
            weatherGripMult
          );

          // PHYSICAL DRIVE-IN PIT LANE ALLEY CHECK:
          // Trigger Pit Stop Minigame ONLY when the player physically drives into the Pit Box inside the Pit Lane Alley,
          // or when Pit Request is active and the player steers into the Pit Lane Alley!
          if (
            player.inPitBox ||
            (pitRequestedRef.current &&
              player.inPitLaneAlley &&
              player.pitExitCooldown <= 0)
          ) {
            pitRequestedRef.current = false;
            pullPlayerIntoPitStall();
            updatePhase('pitstop');
          }

          if (player.gear !== prevPlayerGear) {
            prevPlayerGear = player.gear;
            audio.playGearShift();
          }

          if (player.speedKmh > maxPlayerSpeedKmh) {
            maxPlayerSpeedKmh = player.speedKmh;
          }

          if (player.lastImpactSeverity > 0.25) {
            cameraTrauma = Math.min(
              1,
              cameraTrauma + player.lastImpactSeverity * 0.65
            );
            audio.playImpact(player.lastImpactSeverity);
            for (let sp = 0; sp < 5; sp++) {
              particles.spawn(
                player.x + (Math.random() - 0.5) * 1.4,
                player.y + 0.5,
                player.z + (Math.random() - 0.5) * 1.4,
                (Math.random() - 0.5) * 10,
                2 + Math.random() * 4,
                (Math.random() - 0.5) * 10,
                0xfbbf24,
                0.4,
                0.28
              );
            }
          }

          if (player.lap !== prevPlayerLap) {
            prevPlayerLap = player.lap;
            audio.playLapComplete(false);
            if (authUserRef.current && player.bestLapTimeMs) {
              const trackDef = resolveTrackDefinition(
                selectedTrackIdRef.current
              );
              recordSingleLapInHallOfFame(
                authUserRef.current,
                trackDef.id,
                trackDef.name,
                player.bestLapTimeMs,
                player.spec.name,
                player.tireCompound
              ).catch(() => {});
            }
          }
        } else {
          // Player is in 'pitstop' — keep player's lap and race clock ticking in real time while parked on jacks!
          if (!player.finished && !player.eliminated) {
            player.currentLapTimeMs += dt * 1000;
            player.totalRaceTimeMs += dt * 1000;
          }
        }

        // ==================== GAME MODE 1: ELIMINATION (VYŘAZOVAČKA) LOGIC ====================
        if (activeMode === 'elimination') {
          eliminationTimerSec -= dt;
          const standingsNow = computeRaceStandings(cars);
          const activeRacers = standingsNow.filter(
            (c) => !c.eliminated && !c.finished
          );
          for (const c of cars) {
            c.inDangerZone = false;
          }
          if (activeRacers.length > 1) {
            const lastCar = activeRacers[activeRacers.length - 1];
            lastCar.inDangerZone = true;

            if (eliminationTimerSec <= 0) {
              lastCar.eliminated = true;
              lastCar.inDangerZone = false;
              lastCar.forwardSpeed = 0;
              lastCar.speedKmh = 0;
              eliminationWave++;
              eliminationTimerSec = 20.0;
              audio.playLapComplete(false);

              const remainingAfter = activeRacers.filter(
                (c) => !c.eliminated
              );
              if (lastCar.isPlayer || remainingAfter.length <= 1) {
                if (remainingAfter.length === 1 && remainingAfter[0].isPlayer) {
                  player.finished = true;
                  player.finishTimeMs = player.totalRaceTimeMs;
                } else if (lastCar.isPlayer) {
                  finishEarlyCallbackRef.current?.();
                }
              }
            }
          }
        } else {
          for (const c of cars) {
            c.inDangerZone = false;
          }
        }

        // ==================== GAME MODE 2: CHECKPOINT / APEX GATE TIME ATTACK LOGIC ====================
        if (activeMode === 'checkpoint' && !player.finished) {
          player.timeBankSec = Math.max(0, player.timeBankSec - dt);
          const gateNormT = ((player.nextGateIndex % 10) + 0.5) / 10;
          const distT = Math.abs(player.trackProgressT - gateNormT);
          if (distT < 0.032) {
            player.gatesCleared++;
            player.nextGateIndex = (player.nextGateIndex + 1) % 10;
            const cleanApex =
              player.surface === 'asphalt' && player.speedKmh >= 140;
            if (cleanApex) {
              player.apexCombo = Math.min(5, player.apexCombo + 1);
              player.nitroAmount = Math.min(100, player.nitroAmount + 22);
              player.currentLapTimeMs = Math.max(
                500,
                player.currentLapTimeMs - 200
              );
            } else {
              player.apexCombo = 1;
            }
            const bonusSec = 4.2 + player.apexCombo * 0.25;
            player.timeBankSec = Math.min(60, player.timeBankSec + bonusSec);
            player.apexScore += Math.round(250 * player.apexCombo);
            audio.playGearShift();
          }

          if (player.timeBankSec <= 0) {
            finishEarlyCallbackRef.current?.();
          }
        }

        // Update Remote Online Players & AI Bots (Skipped for AI in solo Checkpoint Time Attack)
        const baseDiffPace =
          botDifficultyRef.current === 'easy'
            ? 0.76
            : botDifficultyRef.current === 'hard'
            ? 0.94
            : 0.85;

        for (let i = 1; i < cars.length; i++) {
          const c = cars[i];
          if (activeMode === 'checkpoint' && !c.isRemote) {
            continue;
          }
          if (c.isRemote) {
            const netState = remotePlayersRef.current.get(c.id);
            if (netState) {
              const lerpFactor = 1 - Math.exp(-15 * dt);
              c.x += (netState.x - c.x) * lerpFactor;
              if (typeof netState.y === 'number') {
                c.y += (netState.y - c.y) * lerpFactor;
              }
              c.z += (netState.z - c.z) * lerpFactor;
              c.heading = netState.heading;
              c.speedKmh = netState.speedKmh;
              c.steerAngle = netState.steerAngle;
              c.chassisPitch = netState.chassisPitch;
              c.chassisRoll = netState.chassisRoll;
              c.isDrifting = netState.isDrifting;
              c.nitroActive = netState.nitroActive;
              c.lap = netState.lap;
              c.totalDistanceDriven = netState.totalDistanceDriven;
              const rq = findClosestTrackSample(c.x, c.z, c.trackSampleIndex);
              c.trackSampleIndex = rq.index;
              c.trackProgressT = rq.t;
              c.completedLaps = Math.max(0, (c.lap || 1) - 1);
              c.unwrappedProgress = c.completedLaps + rq.t;
              c.finished = Boolean(netState.finished);
              if (netState.finishTimeMs !== undefined) {
                c.finishTimeMs = netState.finishTimeMs;
              }
              if (
                netState.tireCompound &&
                netState.tireCompound !== c.tireCompound
              ) {
                c.tireCompound = netState.tireCompound;
                if (carRigs[i]) {
                  updateCarRigTireCompound(carRigs[i], netState.tireCompound);
                }
              }
              c.wheelRotation += (c.speedKmh / 3.6 / 0.34) * dt;

              if (netState.name && netState.name !== c.name) {
                c.name = netState.name;
                const rig = carRigs[i];
                if (rig) {
                  if (rig.labelSprite) {
                    rig.root.remove(rig.labelSprite);
                  }
                  rig.labelSprite = createNameplateSprite(
                    netState.name,
                    c.spec.colorHex
                  );
                  rig.root.add(rig.labelSprite);
                }
              }
            }
          } else {
            const prevAiCompound = c.tireCompound;
            const laneOff = ((i % 3) - 1) * 2.8;
            const pace = baseDiffPace - (i % 4) * 0.025;
            const aiIn = computeAiInput(c, laneOff, pace, weatherRef.current);
            stepCarPhysics(
              c,
              aiIn,
              DEFAULT_TUNING,
              dt,
              totalLapsRef.current,
              weatherGripMult
            );
            if (c.tireCompound !== prevAiCompound && carRigs[i]) {
              updateCarRigTireCompound(carRigs[i], c.tireCompound);
            }
          }
        }

        // Car-to-Car Soft Separation (Only between cars on the same vertical level & not in pit box)
        if (activeMode !== 'checkpoint') {
          for (let i = 0; i < cars.length; i++) {
            for (let j = i + 1; j < cars.length; j++) {
              const a = cars[i];
              const b = cars[j];
              if (
                a.inPitBox ||
                b.inPitBox ||
                a.eliminated ||
                b.eliminated ||
                Math.abs((a.y ?? 0) - (b.y ?? 0)) > 2.2
              ) {
                continue;
              }
              const dx = b.x - a.x;
              const dz = b.z - a.z;
              const distSq = dx * dx + dz * dz;
              const minSep = 2.6;
              if (distSq > 0.0001 && distSq < minSep * minSep) {
                const dist = Math.sqrt(distSq);
                const overlap = (minSep - dist) * 0.5;
                const nx = dx / dist;
                const nz = dz / dist;
                if (!a.isRemote) {
                  a.x -= nx * overlap;
                  a.z -= nz * overlap;
                  if (!a.finished) {
                    const qa = findClosestTrackSample(a.x, a.z, a.trackSampleIndex);
                    a.trackSampleIndex = qa.index;
                    a.trackProgressT = qa.t;
                    a.unwrappedProgress = (a.completedLaps ?? 0) + qa.t;
                  }
                }
                if (!b.isRemote) {
                  b.x += nx * overlap;
                  b.z += nz * overlap;
                  if (!b.finished) {
                    const qb = findClosestTrackSample(b.x, b.z, b.trackSampleIndex);
                    b.trackSampleIndex = qb.index;
                    b.trackProgressT = qb.t;
                    b.unwrappedProgress = (b.completedLaps ?? 0) + qb.t;
                  }
                }
                const rvx = b.vx - a.vx;
                const rvz = b.vz - a.vz;
                const vn = rvx * nx + rvz * nz;
                if (vn < 0) {
                  const impulse = vn * 0.5;
                  if (!a.isRemote) {
                    a.vx += nx * impulse;
                    a.vz += nz * impulse;
                  }
                  if (!b.isRemote) {
                    b.vx -= nx * impulse;
                    b.vz -= nz * impulse;
                  }
                  if (i === 0 && Math.abs(vn) > 3) {
                    cameraTrauma = Math.min(1, cameraTrauma + 0.25);
                    audio.playImpact(0.35);
                  }
                }
              }
            }
          }
        }

        // Emit local player state to WebSocket, BroadcastChannel & HTTP Sync
        if (activeRoomRef.current && now - lastNetworkEmitTime > 50) {
          lastNetworkEmitTime = now;
          const payload = {
            type: 'player:update',
            id: localPlayerIdRef.current,
            name: playerNameRef.current,
            tireCompound: player.tireCompound,
            x: player.x,
            y: player.y,
            z: player.z,
            heading: player.heading,
            speedKmh: player.speedKmh,
            steerAngle: player.steerAngle,
            chassisPitch: player.chassisPitch,
            chassisRoll: player.chassisRoll,
            isDrifting: player.isDrifting,
            nitroActive: player.nitroActive,
            lap: player.lap,
            totalDistanceDriven: player.totalDistanceDriven,
            finished: player.finished,
            finishTimeMs: player.finishTimeMs,
          };

          broadcastChannelRef.current?.postMessage({
            type: 'player:moved',
            roomId: activeRoomRef.current.roomId,
            player: payload,
          });

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
          }
          if (now - lastHttpFallbackSyncTime > 300) {
            lastHttpFallbackSyncTime = now;
            updateCloudPlayerTelemetry(
              activeRoomRef.current.roomId,
              payload as any
            ).catch(() => {});
            fetch(`/api/lobbies/${activeRoomRef.current.roomId}/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                playerId: localPlayerIdRef.current,
                state: payload,
              }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (data?.room?.players) {
                  for (const rp of data.room.players) {
                    if (rp.id !== localPlayerIdRef.current) {
                      remotePlayersRef.current.set(rp.id, rp);
                    }
                  }
                }
              })
              .catch(() => {});
          }
        }

        // Update 3D Formula Car Meshes, Exposed Wheels, Steering Wheel & Driver Hands
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          const rig = carRigs[i];
          if (!rig) continue;
          if (i === 0 && currentPhase === 'pitstop') {
            // Lift the player's car on the front/rear jacks while in the pit stop
            rig.root.position.set(
              c.x,
              c.y + 0.14 + Math.sin(now * 0.018) * 0.012,
              c.z
            );
          } else {
            rig.root.position.set(c.x, c.y, c.z);
          }
          rig.root.rotation.y = c.heading;
          const slopePitch = c.trackSlopePitch ?? 0;
          rig.bodyTiltGroup.rotation.x = slopePitch - c.chassisPitch;
          rig.bodyTiltGroup.rotation.z = c.chassisRoll;
          rig.frontLeftSteer.rotation.y = c.steerAngle;
          rig.frontRightSteer.rotation.y = c.steerAngle;
          rig.steeringWheelRig.rotation.z = -c.steerAngle * 2.45;
          rig.headlightBeamGroup.visible = showHeadlights;

          for (const w of rig.wheelMeshes) {
            w.rotation.x = c.wheelRotation;
          }
          if (rig.drsFlapMesh) {
            rig.drsFlapMesh.rotation.x = c.nitroActive ? -0.38 : 0.08;
          }
          const isBraking =
            i === 0
              ? currentPhase === 'pitstop' || brake > 0.1 || handbrake
              : c.inPitBox || (c.aiPitStopTimer ?? 0) > 0;
          rig.brakeLightMat.color.setHex(isBraking ? 0xff4444 : 0x991b1b);
          rig.nitroFlameLeft.visible = c.nitroActive;
          rig.nitroFlameRight.visible = c.nitroActive;
        }

        const anyCarInPit =
          currentPhase === 'pitstop' ||
          player.inPitBox ||
          player.inPitLaneAlley ||
          cars.some((c) => c.inPitBox || (c.aiPitStopTimer ?? 0) > 0);
        updatePitCrewAnimation(currentTrackGroup, anyCarInPit, now * 0.001);

        // Tire smoke / rain spray particles
        if (
          currentPhase === 'playing' &&
          (player.isDrifting ||
            handbrake ||
            (weatherRef.current === 'rain' && player.speedKmh > 90))
        ) {
          const sinH = Math.sin(player.heading);
          const cosH = Math.cos(player.heading);
          particles.spawn(
            player.x - sinH * 1.45,
            player.y + 0.18,
            player.z - cosH * 1.45,
            (Math.random() - 0.5) * 1.6,
            0.65,
            (Math.random() - 0.5) * 1.6,
            weatherRef.current === 'rain' ? 0xbae6fd : 0xe2e8f0,
            0.68,
            0.36
          );
        }

        particles.update(dt);

        if (currentPhase === 'pitstop') {
          // Spawn pneumatic Paoli wheel-gun titanium sparks at the 4 wheels while being serviced in the Pit Box!
          if (Math.random() < 0.75) {
            const wheelOffsets: Array<[number, number]> = [
              [-0.95, 1.35],
              [0.95, 1.35],
              [-0.95, -1.32],
              [0.95, -1.32],
            ];
            const [wx, wz] =
              wheelOffsets[Math.floor(Math.random() * wheelOffsets.length)];
            particles.spawn(
              player.x + wx,
              player.y + 0.36,
              player.z + wz,
              (Math.random() - 0.5) * 4.2,
              0.8 + Math.random() * 2.2,
              (Math.random() - 0.5) * 4.2,
              Math.random() < 0.6 ? 0xfbbf24 : 0x38bdf8,
              0.24,
              0.22
            );
          }

          // Live 3D Pit Stop Broadcast Camera inside the Pit Lane framing the lifted car, 12 F1 Pit Crew mechanics, overhead carbon booms & Open-Bay Garages on the left/center of the viewport
          const orbit = Math.sin(now * 0.0012) * 0.32;
          camera.up.set(0, 1, 0);
          camera.position.set(
            player.x + 2.35 + orbit * 0.18,
            player.y + 1.82 + Math.cos(now * 0.0015) * 0.08,
            player.z + 5.65 + orbit * 0.22
          );
          // Offset lookAt slightly to the right (+x) so the 3D car & Pit Crew sit prominently in the left/center while the HUD panel occupies the right edge
          camera.lookAt(
            player.x + 0.85,
            player.y + 0.52,
            player.z + 0.45
          );
          audio.updateEngine(1850, 0.15, false, 0, false, false, 1, false);
        } else {
          audio.updateEngine(
            player.rpm,
            throttle,
            player.isDrifting,
            player.slipAngle,
            player.nitroActive,
            true,
            player.gear,
            player.surface === 'kerb' && player.speedKmh > 25
          );

          // Zero-Jitter Car-Relative Camera Rig
          const yawAlpha =
            camMode === 'hood' ? 1.0 : 1 - Math.exp(-10.5 * dt);
          smoothCamYaw = lerpAngle(smoothCamYaw, player.heading, yawAlpha);

          const targetSpeedBack =
            Math.min(0.85, (player.speedKmh / 300) * 0.65) +
            (player.nitroActive ? 0.35 : 0);
          smoothSpeedBackOffset +=
            (targetSpeedBack - smoothSpeedBackOffset) * (1 - Math.exp(-8 * dt));

          const targetLatOffset = -player.steerAngle * 0.85;
          smoothLateralCamOffset +=
            (targetLatOffset - smoothLateralCamOffset) *
            (1 - Math.exp(-9 * dt));

          const sinCam = Math.sin(smoothCamYaw);
          const cosCam = Math.cos(smoothCamYaw);
          const rightX = cosCam;
          const rightZ = -sinCam;

          cameraTrauma = Math.max(0, cameraTrauma - 2.2 * dt);
          const impactShake =
            cameraTrauma > 0.01
              ? Math.sin(now * 0.055) * cameraTrauma * cameraTrauma * 0.25
              : 0;

          if (camMode === 'chase') {
            camera.up.set(0, 1, 0);
            const dist = 6.8 + smoothSpeedBackOffset;
            camera.position.set(
              player.x - sinCam * dist + rightX * smoothLateralCamOffset,
              player.y + 2.45 + Math.abs(impactShake),
              player.z - cosCam * dist + rightZ * smoothLateralCamOffset
            );
            camera.lookAt(
              player.x + Math.sin(player.heading) * 6.5,
              player.y + 0.78,
              player.z + Math.cos(player.heading) * 6.5
            );
          } else if (camMode === 'close') {
            camera.up.set(0, 1, 0);
            const dist = 4.8 + smoothSpeedBackOffset * 0.6;
            camera.position.set(
              player.x -
                sinCam * dist +
                rightX * (smoothLateralCamOffset * 0.7),
              player.y + 1.68 + Math.abs(impactShake),
              player.z -
                cosCam * dist +
                rightZ * (smoothLateralCamOffset * 0.7)
            );
            camera.lookAt(
              player.x + Math.sin(player.heading) * 9.0,
              player.y + 0.72,
              player.z + Math.cos(player.heading) * 9.0
            );
          } else if (camMode === 'hood') {
            // F1 2026 First-Person Helmet / Cockpit View framing 3D Butterfly Steering Wheel OLED, Halo, Mirrors & Front Suspension
            const sinH = Math.sin(player.heading);
            const cosH = Math.cos(player.heading);
            const speedRatio = Math.min(
              1,
              Math.abs(player.forwardSpeed) / 72
            );
            const kerbBuzz =
              player.surface === 'kerb'
                ? Math.sin(now * 0.095) * 0.013 * speedRatio
                : player.surface === 'grass'
                ? Math.sin(now * 0.065) * 0.02 * speedRatio
                : 0;
            const headSwayX =
              -player.steerAngle * 0.095 + player.chassisRoll * 0.2;
            const headPitchZ = -player.chassisPitch * 0.38;
            const slopeY = (player.trackSlopePitch ?? 0) * 18.0;
            camera.position.set(
              player.x - sinH * (0.18 + headPitchZ) + cosH * headSwayX,
              player.y + 0.905 + Math.abs(impactShake) * 0.24 + kerbBuzz,
              player.z - cosH * (0.18 + headPitchZ) - sinH * headSwayX
            );
            // Subtle helmet roll into the corner apex
            const helmetRoll =
              player.steerAngle * 0.13 * (0.35 + speedRatio * 0.65) -
              player.chassisRoll * 0.32;
            camera.up.set(
              cosH * Math.sin(helmetRoll),
              Math.cos(helmetRoll),
              -sinH * Math.sin(helmetRoll)
            );
            // Look into the corner apex while keeping the 3D steering wheel OLED & front tires in lower field of view
            const lookHeading = player.heading + player.steerAngle * 0.3;
            camera.lookAt(
              player.x + Math.sin(lookHeading) * 18.0,
              player.y + 0.64 - player.chassisPitch * 2.8 + slopeY + kerbBuzz * 0.5,
              player.z + Math.cos(lookHeading) * 18.0
            );
          } else {
            camera.up.set(0, 1, 0);
            camera.position.set(
              player.x - sinCam * 13.5,
              player.y + 11.0,
              player.z - cosCam * 13.5
            );
            camera.lookAt(
              player.x + Math.sin(player.heading) * 5.5,
              player.y + 0.5,
              player.z + Math.cos(player.heading) * 5.5
            );
          }
        }

        weatherSystem.update(
          dt,
          camera.position.x,
          camera.position.y,
          camera.position.z,
          weatherRef.current
        );

        // Throttled HUD DOM & 3D Cockpit Steering Wheel OLED updates (20Hz)
        if (now - lastHudDomSyncTime >= 50) {
          lastHudDomSyncTime = now;

          if (carRigs[0] && isCockpitView) {
            updateCarRigCockpitTelemetry(
              carRigs[0],
              player.gear,
              player.speedKmh,
              player.rpm,
              player.tireHealth,
              player.nitroAmount,
              player.tireCompound,
              player.nitroActive
            );
          }

          // Update Live Game Mode Banner in Top-Center
          if (
            modeBannerRef.current &&
            modePrimaryTextRef.current &&
            modeSubTextRef.current
          ) {
            if (activeMode === 'elimination') {
              modeBannerRef.current.style.display = 'flex';
              const standingsNow = computeRaceStandings(cars);
              const activeRacers = standingsNow.filter(
                (c) => !c.eliminated && !c.finished
              );
              const dangerCar = activeRacers[activeRacers.length - 1];
              modePrimaryTextRef.current.textContent = `VYŘAZENÍ VLNA #${eliminationWave} ZA ${Math.max(
                0,
                eliminationTimerSec
              )
                .toFixed(1)
                .replace('.', ',')} S`;
              modeSubTextRef.current.textContent = dangerCar
                ? `V OHROŽENÍ (ERS OVERCHARGE +85%): ${dangerCar.name.toUpperCase()}`
                : 'POSLEDNÍ VŮZ NA TRATI VÍTĚZÍ';
            } else if (activeMode === 'checkpoint') {
              modeBannerRef.current.style.display = 'flex';
              modePrimaryTextRef.current.textContent = `ČASOVÁ BANKA: ${player.timeBankSec
                .toFixed(1)
                .replace('.', ',')} S · BRÁNY: ${player.gatesCleared}`;
              modeSubTextRef.current.textContent = `APEX KOMBO ${player.apexCombo}× · SKÓRE SEKTORŮ: ${player.apexScore} BODŮ`;
            } else {
              modeBannerRef.current.style.display = 'none';
            }
          }

          if (speedTextRef.current) {
            speedTextRef.current.textContent = Math.round(
              player.speedKmh
            ).toString();
          }
          if (gearTextRef.current) {
            gearTextRef.current.textContent =
              player.gear === -1 ? 'R' : player.gear.toString();
          }
          if (rpmTextRef.current) {
            rpmTextRef.current.textContent = `${Math.round(player.rpm)}`;
          }
          if (rpmBarRef.current) {
            const rpmArc = Math.min(
              175,
              Math.max(12, ((player.rpm - 1000) / 7000) * 175)
            );
            rpmBarRef.current.setAttribute(
              'stroke-dasharray',
              `${rpmArc.toFixed(0)} 240`
            );
            rpmBarRef.current.setAttribute(
              'stroke',
              player.rpm > 7100
                ? '#ef4444'
                : player.nitroActive
                ? '#38bdf8'
                : '#f59e0b'
            );
          }

          // Update 15-LED Shift Light Strip
          const activeLeds = Math.round(
            Math.max(0, Math.min(1, (player.rpm - 2200) / 5600)) * 15
          );
          for (let lIdx = 0; lIdx < 15; lIdx++) {
            const ledEl = shiftLedStripRefs.current[lIdx]?.current;
            if (!ledEl) continue;
            if (lIdx < activeLeds) {
              ledEl.style.backgroundColor =
                lIdx < 5
                  ? '#22c55e'
                  : lIdx < 10
                  ? '#ef4444'
                  : '#38bdf8';
            } else {
              ledEl.style.backgroundColor = '#1e293b';
            }
          }

          if (nitroBarRef.current) {
            nitroBarRef.current.style.width = `${Math.round(
              player.nitroAmount
            )}%`;
          }

          // Update Live 4-Wheel Tire Wear & Temperature HUD
          const tireH = Math.round(player.tireHealth);
          const tireColor =
            tireH > 68 ? '#22c55e' : tireH > 35 ? '#f59e0b' : '#ef4444';
          if (tirePctTextRef.current) {
            tirePctTextRef.current.textContent = `${tireH}%`;
            tirePctTextRef.current.style.color = tireColor;
          }
          if (tireTempTextRef.current) {
            tireTempTextRef.current.textContent = `${Math.round(
              player.tireTemp
            )}°C`;
          }
          if (tireBarFillRef.current) {
            tireBarFillRef.current.style.width = `${tireH}%`;
            tireBarFillRef.current.style.backgroundColor = tireColor;
          }
          for (let wIdx = 0; wIdx < 4; wIdx++) {
            const boxEl = tireWheelBoxRefs.current[wIdx]?.current;
            if (boxEl) {
              const wh = player.tireWear[wIdx];
              boxEl.style.backgroundColor =
                wh > 68 ? '#22c55e' : wh > 35 ? '#f59e0b' : '#ef4444';
            }
          }

          // Update Pit Zone Button & Top-Center Pit Status Banner
          if (pitZoneBannerRef.current) {
            if (player.inPitLaneAlley || player.inPitBox) {
              pitZoneBannerRef.current.className =
                'px-2 py-0.5 bg-emerald-500 text-slate-950 border border-emerald-200 text-[10px] font-display font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xl animate-pulse cursor-pointer';
            } else if (pitRequestedRef.current || player.tireHealth < 55) {
              pitZoneBannerRef.current.className =
                'px-2 py-0.5 bg-[#e10600] text-white border border-rose-300 text-[10px] font-display font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xl animate-pulse cursor-pointer';
            } else {
              pitZoneBannerRef.current.className =
                'px-2 py-0.5 bg-black hover:bg-zinc-900 border border-white/25 text-white text-[10px] font-display font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer';
            }
          }

          if (pitStatusBannerRef.current && pitStatusTextRef.current) {
            const nextTireInfo = TIRE_COMPOUNDS[nextPitCompoundRef.current];
            if (player.inPitLaneAlley && player.pitExitCooldown <= 0) {
              pitStatusBannerRef.current.style.display = 'flex';
              pitStatusBannerRef.current.style.borderColor = '#22c55e';
              pitStatusTextRef.current.textContent = `V ULIČCE V BOXECH (OMEZOVAČ 80 KM/H) — PŘIPRAVENA SMĚS ${nextTireInfo.name.toUpperCase()} [1-4]`;
              pitStatusTextRef.current.style.color = '#86efac';
            } else if (player.inPitZone && player.pitExitCooldown <= 0) {
              pitStatusBannerRef.current.style.display = 'flex';
              pitStatusBannerRef.current.style.borderColor = '#22c55e';
              pitStatusTextRef.current.textContent = `VJEZD DO BOXŮ VPRAVO (PIT IN) — PŘIPRAVENA SMĚS ${nextTireInfo.name.toUpperCase()}`;
              pitStatusTextRef.current.style.color = '#86efac';
            } else if (pitRequestedRef.current) {
              pitStatusBannerRef.current.style.display = 'flex';
              pitStatusBannerRef.current.style.borderColor = '#f59e0b';
              pitStatusTextRef.current.textContent = `BOX V TOMTO KOLE (${Math.round(
                player.distanceToPitMeters
              )} M) · PŘÍŠTÍ PNEU: ${nextTireInfo.name.toUpperCase()} (ZMĚŇ KLÁVESOU 1-4)`;
              pitStatusTextRef.current.style.color = '#fde68a';
            } else if (player.tireHealth < 45) {
              pitStatusBannerRef.current.style.display = 'flex';
              pitStatusBannerRef.current.style.borderColor = '#ef4444';
              pitStatusTextRef.current.textContent = `OPOTŘEBENÉ PNEU (${tireH}%) — STISKNI [B] PRO RÁDIO BOXU A ZVOL SMĚS [1-4]`;
              pitStatusTextRef.current.style.color = '#fca5a5';
            } else {
              pitStatusBannerRef.current.style.display = 'none';
            }
          }

          if (lapTimeTextRef.current) {
            lapTimeTextRef.current.textContent = formatRaceTime(
              player.currentLapTimeMs
            );
          }
          if (bestLapTextRef.current) {
            if (player.bestLapTimeMs) {
              const expectedAtProgress =
                player.bestLapTimeMs * Math.max(0.02, player.trackProgressT);
              const deltaSec =
                (player.currentLapTimeMs - expectedAtProgress) / 1000;
              const clampedDelta = Math.max(-9.999, Math.min(9.999, deltaSec));
              const sign = clampedDelta <= 0 ? '-' : '+';
              bestLapTextRef.current.textContent = `${sign}${Math.abs(
                clampedDelta
              )
                .toFixed(3)
                .replace('.', ',')}`;
            } else {
              const targetLapMs = 42000;
              const expectedAtProgress =
                targetLapMs * Math.max(0.02, player.trackProgressT);
              const deltaSec =
                (player.currentLapTimeMs - expectedAtProgress) / 1000;
              const clampedDelta = Math.max(-9.999, Math.min(9.999, deltaSec));
              const sign = clampedDelta <= 0 ? '-' : '+';
              bestLapTextRef.current.textContent = `${sign}${Math.abs(
                clampedDelta
              )
                .toFixed(3)
                .replace('.', ',')}`;
            }
          }
          if (driftTotalTextRef.current) {
            driftTotalTextRef.current.textContent = Math.round(
              player.driftScore
            ).toString();
          }
          if (driftChainTextRef.current) {
            driftChainTextRef.current.textContent =
              player.currentDriftChain > 0
                ? `+${Math.round(player.currentDriftChain)}`
                : '';
          }
          if (frontLoadTextRef.current) {
            frontLoadTextRef.current.textContent = `${Math.round(
              player.frontAxleLoadRatio * 100
            )} %`;
          }
          if (surfaceBadgeRef.current) {
            if (player.isDrifting) {
              surfaceBadgeRef.current.textContent = 'SMYK!';
              surfaceBadgeRef.current.className =
                'text-[8px] font-bold uppercase tracking-wider text-amber-400';
            } else if (player.surface === 'grass') {
              surfaceBadgeRef.current.textContent = 'TRÁVA';
              surfaceBadgeRef.current.className =
                'text-[8px] font-bold uppercase tracking-wider text-rose-400';
            } else if (player.surface === 'kerb') {
              surfaceBadgeRef.current.textContent = 'OBRUBNÍK';
              surfaceBadgeRef.current.className =
                'text-[8px] font-bold uppercase tracking-wider text-cyan-400';
            } else {
              surfaceBadgeRef.current.textContent = 'ASFALT';
              surfaceBadgeRef.current.className =
                'text-[8px] font-bold uppercase tracking-wider text-emerald-400';
            }
          }
          if (gDotRef.current) {
            const gx = Math.max(-20, Math.min(20, player.lateralG * 11));
            const gy = Math.max(-20, Math.min(20, -player.longitudinalG * 11));
            gDotRef.current.setAttribute('cx', (32 + gx).toFixed(1));
            gDotRef.current.setAttribute('cy', (32 + gy).toFixed(1));
          }

          // Update Minimap SVG dots & Driver Name labels at 20Hz
          const pMap = currentMinimapProjector.toMap(player.x, player.z);
          if (playerMapDotRef.current) {
            playerMapDotRef.current.setAttribute('cx', pMap.mx.toFixed(1));
            playerMapDotRef.current.setAttribute('cy', pMap.mz.toFixed(1));
          }
          if (playerMapLabelRef.current) {
            playerMapLabelRef.current.setAttribute(
              'x',
              (pMap.mx + 5.5).toFixed(1)
            );
            playerMapLabelRef.current.setAttribute(
              'y',
              (pMap.mz + 2.2).toFixed(1)
            );
            playerMapLabelRef.current.textContent =
              playerNameRef.current.slice(0, 10);
          }

          for (let i = 0; i < rivalDotRefs.current.length; i++) {
            const dotEl = rivalDotRefs.current[i]?.current;
            const labelEl = rivalLabelRefs.current[i]?.current;
            const rivalCar = cars[i + 1];
            if (
              rivalCar &&
              !(activeMode === 'checkpoint' && !rivalCar.isRemote)
            ) {
              const m = currentMinimapProjector.toMap(rivalCar.x, rivalCar.z);
              if (dotEl) {
                dotEl.setAttribute('cx', m.mx.toFixed(1));
                dotEl.setAttribute('cy', m.mz.toFixed(1));
                dotEl.setAttribute('opacity', rivalCar.eliminated ? '0.25' : '1');
                dotEl.setAttribute(
                  'fill',
                  rivalCar.eliminated
                    ? '#64748b'
                    : rivalCar.isRemote
                    ? '#22c55e'
                    : '#f59e0b'
                );
              }
              if (labelEl) {
                labelEl.setAttribute('x', (m.mx + 4.8).toFixed(1));
                labelEl.setAttribute('y', (m.mz + 2.2).toFixed(1));
                labelEl.setAttribute(
                  'opacity',
                  rivalCar.eliminated ? '0.25' : '1'
                );
                labelEl.setAttribute(
                  'fill',
                  rivalCar.isRemote ? '#86efac' : '#fde68a'
                );
                const shortName = rivalCar.name.split(' ')[0].slice(0, 9);
                if (labelEl.textContent !== shortName) {
                  labelEl.textContent = shortName;
                }
              }
            } else {
              if (dotEl) dotEl.setAttribute('opacity', '0');
              if (labelEl) labelEl.setAttribute('opacity', '0');
            }
          }
        }

        // Throttled React state sync (10Hz) for Live Leaderboard & Position (Active during BOTH playing & pitstop!)
        if (now - lastHudReactSyncTime > 100) {
          lastHudReactSyncTime = now;
          const visibleCars =
            activeMode === 'checkpoint'
              ? cars.filter((c) => c.isPlayer || c.isRemote)
              : cars;
          const standings = computeRaceStandings(visibleCars);
          const currentPos = standings.findIndex((c) => c.isPlayer) + 1;
          setPosition((prev) => (prev !== currentPos ? currentPos : prev));
          setLap((prev) => (prev !== player.lap ? player.lap : prev));
          const leaderProgress = standings[0]?.unwrappedProgress ?? 0;
          const trackLenMeters = Math.max(800, getTrackTotalLength());
          setLiveStandings(
            standings.map((c, idx) => {
              const distBehindMeters = Math.max(
                0,
                (leaderProgress - c.unwrappedProgress) * trackLenMeters
              );
              const refSpeedMs = Math.max(
                38,
                ((standings[0]?.speedKmh ?? 180) + c.speedKmh) * 0.5 / 3.6
              );
              const gapSec = idx === 0 ? 0 : distBehindMeters / refSpeedMs;
              return {
                id: c.id,
                name: c.name,
                isPlayer: c.isPlayer,
                isRemote: c.isRemote,
                colorHex: c.spec.colorHex,
                speedKmh: c.speedKmh,
                lap: c.lap,
                tireCompound: c.tireCompound,
                tireHealth: c.tireHealth,
                inPitBox: c.inPitBox,
                inPitLaneAlley: c.inPitLaneAlley,
                pitStopsCompleted: c.pitStopsCompleted,
                aiStrategyName: c.aiStrategyName,
                eliminated: c.eliminated,
                inDangerZone: c.inDangerZone,
                finished: c.finished,
                finishTimeMs: c.finishTimeMs,
                gapToLeaderSec: gapSec,
              };
            })
          );

          if (player.finished) {
            const trackDef = resolveTrackDefinition(selectedTrackIdRef.current);
            setSummary({
              position: currentPos,
              totalCars: visibleCars.length,
              totalTimeMs: player.finishTimeMs ?? player.totalRaceTimeMs,
              bestLapMs: player.bestLapTimeMs,
              maxSpeedKmh: maxPlayerSpeedKmh,
              driftScore: player.driftScore,
              pitStopsCompleted: player.pitStopsCompleted,
              carName: player.spec.name,
              trackName: trackDef.name,
              standings: standings.map((c) => ({
                name: c.name,
                isPlayer: c.isPlayer,
                speedKmh: c.speedKmh,
                lap: c.lap,
                tireCompound: c.tireCompound,
                pitStopsCompleted: c.pitStopsCompleted,
                aiStrategyName: c.aiStrategyName,
                eliminated: c.eliminated,
                finished: c.finished,
                finishTimeMs: c.finishTimeMs,
              })),
            });
            if (authUserRef.current) {
              recordRaceResultInHallOfFame(authUserRef.current, {
                position: currentPos,
                trackId: trackDef.id,
                trackName: trackDef.name,
                bestLapTimeMs: player.bestLapTimeMs,
                carName: player.spec.name,
                tireCompound: player.tireCompound,
              }).catch(() => {});
            }
            audio.playLapComplete(currentPos === 1);
            updatePhase('gameover');
          }
        }
      } else {
        // Paused or Game Over
        updatePitCrewAnimation(currentTrackGroup, false, now * 0.001);
        audio.updateEngine(1000, 0, false, 0, false, false, 1, false);
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeldInputs);
      window.removeEventListener('resize', onResize);
      wsRef.current?.close();
      audio.dispose();
      renderer.dispose();
    };
  }, [updatePhase]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
      <div
        ref={canvasMountRef}
        data-testid="race-canvas-mount"
        className="fixed inset-0 w-full h-full"
      />

      <GameHud
        phase={phase}
        selectedTrackId={selectedTrackId}
        onSelectTrack={handleSelectTrack}
        onGenerateRandomTrack={handleGenerateRandomTrack}
        gameMode={gameMode}
        onSelectGameMode={handleSelectGameMode}
        selectedCarIdx={selectedCarIdx}
        onSelectCar={handleSelectCar}
        selectedCompound={selectedCompound}
        onSelectCompound={handleSelectCompound}
        nextPitCompound={nextPitCompound}
        onSelectNextPitCompound={handleSelectNextPitCompound}
        botCount={botCount}
        onChangeBotCount={handleChangeBotCount}
        botDifficulty={botDifficulty}
        onChangeBotDifficulty={handleChangeBotDifficulty}
        timeOfDay={timeOfDay}
        onChangeTimeOfDay={handleChangeTimeOfDay}
        weather={weather}
        onChangeWeather={handleChangeWeather}
        totalLaps={totalLaps}
        onChangeTotalLaps={handleChangeTotalLaps}
        tuning={tuning}
        onChangeTuning={handleChangeTuning}
        cameraMode={cameraMode}
        onCycleCamera={handleCycleCamera}
        muted={muted}
        onToggleMute={handleToggleMute}
        dockOpen={dockOpen}
        onToggleDock={() => setDockOpen((prev) => !prev)}
        position={position}
        totalCarsCount={totalCarsCount}
        lap={lap}
        liveStandings={liveStandings}
        summary={summary}
        onStartRace={handleStartRace}
        onResumeRace={handleResumeOrPause}
        onRestartRace={handleRestartRace}
        onReturnTitle={handleReturnTitle}
        onFinishEarly={() => finishEarlyCallbackRef.current?.()}
        onEnterPitStop={handleEnterPitStop}
        onForceOpenPitStop={handleForceOpenPitStop}
        onCompletePitStop={handleCompletePitStop}
        onFastenWheelSound={(quality) =>
          audioRef.current?.playWheelGunSound(quality)
        }
        onJackReleaseSound={() => audioRef.current?.playJackReleaseSound()}
        onTouchControl={handleTouchControl}
        liveRefs={liveRefs}
        playerName={playerName}
        onChangePlayerName={handleChangePlayerName}
        localPlayerId={localPlayerId}
        activeRoom={activeRoom}
        publicLobbies={publicLobbies}
        lobbyError={lobbyError}
        onCreateLobby={handleCreateLobby}
        onJoinLobby={handleJoinLobby}
        onQuickMatchLobby={handleQuickMatchLobby}
        onLeaveLobby={handleLeaveLobby}
        onRefreshLobbies={handleRefreshLobbies}
        onSendLobbyChat={handleSendLobbyChat}
        authUser={authUser}
        onSignInGoogle={handleSignInGoogle}
        onSignOutGoogle={handleSignOutGoogle}
        hallOfFameDrivers={hallOfFameDrivers}
        hallOfFameLaps={hallOfFameLaps}
      />
    </main>
  );
}
