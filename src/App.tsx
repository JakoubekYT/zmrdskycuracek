import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CameraMode,
  computeMinimapData,
  formatRaceTime,
  GameHud,
  GamePhase,
  HudLiveRefs,
  LobbyRoomDTO,
  MultiplayerPlayerDTO,
  PublicLobbySummary,
  RaceSummarySnapshot,
  StandingEntry,
} from './components/GameHud';
import { RaceAudioEngine } from './game/audio';
import {
  AI_DRIVER_NAMES,
  BotDifficulty,
  CAR_SPECS,
  CarInput,
  CarState,
  computeAiInput,
  computeRaceStandings,
  createInitialCarState,
  DEFAULT_TUNING,
  stepCarPhysics,
  TimeOfDay,
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
} from './game/sceneBuilder';
import {
  resolveTrackDefinition,
  setActiveTrack,
} from './game/track';

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
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
    if (saved) return saved;
    const id = `p-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('apex_player_id', id);
    return id;
  });

  const [playerName, setPlayerName] = useState<string>(() => {
    return (
      localStorage.getItem('apex_player_name') ||
      `Jezdec ${Math.floor(10 + Math.random() * 89)}`
    );
  });

  const [phase, setPhase] = useState<GamePhase>(
    initialAutostart ? 'playing' : 'title'
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string>('alpine-gp');
  const [selectedCarIdx, setSelectedCarIdx] = useState<number>(0);
  const [botCount, setBotCount] = useState<number>(5);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [weather, setWeather] = useState<WeatherType>('clear');
  const [totalLaps, setTotalLaps] = useState<number>(3);
  const [tuning, setTuning] = useState<TuningConfig>(DEFAULT_TUNING);
  const [cameraMode, setCameraMode] = useState<CameraMode>(
    initialCamParam && ['chase', 'close', 'hood', 'heli'].includes(initialCamParam)
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

  // Multiplayer state
  const [activeRoom, setActiveRoom] = useState<LobbyRoomDTO | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbySummary[]>([]);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // Refs for 60+ FPS loop access without re-mounting WebGL
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const localPlayerIdRef = useRef<string>(localPlayerId);
  const playerNameRef = useRef<string>(playerName);
  const phaseRef = useRef<GamePhase>(initialAutostart ? 'playing' : 'title');
  const selectedTrackIdRef = useRef<string>('alpine-gp');
  const selectedCarIdxRef = useRef<number>(0);
  const botCountRef = useRef<number>(5);
  const botDifficultyRef = useRef<BotDifficulty>('medium');
  const timeOfDayRef = useRef<TimeOfDay>('day');
  const weatherRef = useRef<WeatherType>('clear');
  const totalLapsRef = useRef<number>(3);
  const tuningRef = useRef<TuningConfig>(DEFAULT_TUNING);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const audioRef = useRef<RaceAudioEngine | null>(null);

  const activeRoomRef = useRef<LobbyRoomDTO | null>(null);
  const remotePlayersRef = useRef<Map<string, MultiplayerPlayerDTO>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

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
  const nitroBarRef = useRef<HTMLDivElement | null>(null);
  const lapTimeTextRef = useRef<HTMLSpanElement | null>(null);
  const bestLapTextRef = useRef<HTMLSpanElement | null>(null);
  const driftChainTextRef = useRef<HTMLSpanElement | null>(null);
  const driftTotalTextRef = useRef<HTMLSpanElement | null>(null);
  const surfaceBadgeRef = useRef<HTMLSpanElement | null>(null);
  const gDotRef = useRef<SVGCircleElement | null>(null);
  const frontLoadTextRef = useRef<HTMLSpanElement | null>(null);
  const fpsTextRef = useRef<HTMLSpanElement | null>(null);
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
    nitroBar: nitroBarRef,
    lapTimeText: lapTimeTextRef,
    bestLapText: bestLapTextRef,
    driftChainText: driftChainTextRef,
    driftTotalText: driftTotalTextRef,
    surfaceBadge: surfaceBadgeRef,
    gDot: gDotRef,
    frontLoadText: frontLoadTextRef,
    fpsText: fpsTextRef,
    playerMapDot: playerMapDotRef,
    playerMapLabel: playerMapLabelRef,
    rivalMapDots: rivalDotRefs.current,
    rivalMapLabels: rivalLabelRefs.current,
  };

  const rebuildSceneTrackRef = useRef<((trackId: string) => void) | null>(null);
  const refreshAtmosphereRef = useRef<(() => void) | null>(null);
  const rebuildCarsRef = useRef<(() => void) | null>(null);
  const finishEarlyCallbackRef = useRef<(() => void) | null>(null);

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

  // Connect WebSocket for real-time lobby & race sync
  const connectRoomWebSocket = useCallback(
    (roomId: string, name: string, carSpecId: string, colorHex: number) => {
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
            })
          );
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data));
            if (msg.type === 'room:state' && msg.room) {
              const room: LobbyRoomDTO = msg.room;
              const prevPlayerCount = activeRoomRef.current?.players.length ?? 0;
              activeRoomRef.current = room;
              setActiveRoom(room);

              if (room.trackId !== selectedTrackIdRef.current) {
                selectedTrackIdRef.current = room.trackId;
                setSelectedTrackId(room.trackId);
                rebuildSceneTrackRef.current?.(room.trackId);
              }
              if (room.botCount !== botCountRef.current) {
                botCountRef.current = room.botCount;
                setBotCount(room.botCount);
              }

              for (const p of room.players) {
                if (p.id !== localPlayerIdRef.current) {
                  remotePlayersRef.current.set(p.id, p);
                }
              }

              if (room.players.length !== prevPlayerCount) {
                rebuildCarsRef.current?.();
              }
            } else if (msg.type === 'race:started' && msg.room) {
              const room: LobbyRoomDTO = msg.room;
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
              if (p.id !== localPlayerIdRef.current) {
                remotePlayersRef.current.set(p.id, p);
              }
            }
          } catch {
            // Ignore malformed message
          }
        };
      } catch {
        // Fallback handled via HTTP sync
      }
    },
    [updatePhase]
  );

  const handleRefreshLobbies = useCallback(async () => {
    try {
      const res = await fetch('/api/lobbies');
      if (res.ok) {
        const data = await res.json();
        setPublicLobbies(data.lobbies || []);
      }
    } catch {
      // Ignore network error
    }
  }, []);

  const handleCreateLobby = useCallback(
    async (customCode?: string) => {
      setLobbyError(null);
      const spec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
      try {
        const res = await fetch('/api/lobbies/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: localPlayerIdRef.current,
            playerName: playerNameRef.current,
            carSpecId: spec.id,
            colorHex: spec.colorHex,
            trackId: selectedTrackIdRef.current,
            totalLaps: totalLapsRef.current,
            botCount: botCountRef.current,
            botDifficulty: botDifficultyRef.current,
            customRoomId: customCode,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setLobbyError(data.error || 'Chyba při vytváření lobby');
          return;
        }
        activeRoomRef.current = data.room;
        setActiveRoom(data.room);
        rebuildCarsRef.current?.();
        connectRoomWebSocket(
          data.room.roomId,
          playerNameRef.current,
          spec.id,
          spec.colorHex
        );
      } catch {
        setLobbyError('Nepodařilo se spojit se serverem.');
      }
    },
    [connectRoomWebSocket]
  );

  const handleJoinLobby = useCallback(
    async (code: string) => {
      setLobbyError(null);
      const clean = code.toUpperCase().trim();
      if (!clean) return;
      const spec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
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
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          setLobbyError(data.error || 'Lobby s tímto ID neexistuje.');
          return;
        }
        const room: LobbyRoomDTO = data.room;
        activeRoomRef.current = room;
        setActiveRoom(room);
        selectedTrackIdRef.current = room.trackId;
        setSelectedTrackId(room.trackId);
        botCountRef.current = room.botCount;
        setBotCount(room.botCount);
        for (const p of room.players) {
          if (p.id !== localPlayerIdRef.current) {
            remotePlayersRef.current.set(p.id, p);
          }
        }
        rebuildSceneTrackRef.current?.(room.trackId);
        rebuildCarsRef.current?.();
        connectRoomWebSocket(
          room.roomId,
          playerNameRef.current,
          spec.id,
          spec.colorHex
        );
      } catch {
        setLobbyError('Nepodařilo se připojit k lobby.');
      }
    },
    [connectRoomWebSocket]
  );

  const handleLeaveLobby = useCallback(() => {
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
    if (
      activeRoomRef.current &&
      activeRoomRef.current.hostId === localPlayerIdRef.current
    ) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'race:start' }));
      }
      fetch(`/api/lobbies/${activeRoomRef.current.roomId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: localPlayerIdRef.current,
          action: 'start',
        }),
      }).catch(() => {});
    }
    rebuildCarsRef.current?.();
    updatePhase('playing');
  }, [updatePhase]);

  const handleRestartRace = useCallback(() => {
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

  const handleReturnTitle = useCallback(() => {
    rebuildCarsRef.current?.();
    updatePhase('title');
  }, [updatePhase]);

  const handleSelectTrack = useCallback((trackId: string) => {
    selectedTrackIdRef.current = trackId;
    setSelectedTrackId(trackId);
    rebuildSceneTrackRef.current?.(trackId);
    rebuildCarsRef.current?.();

    if (
      activeRoomRef.current &&
      activeRoomRef.current.hostId === localPlayerIdRef.current
    ) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'room:config', trackId }));
      }
    }
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

  const handleSelectCar = useCallback((idx: number) => {
    selectedCarIdxRef.current = idx;
    setSelectedCarIdx(idx);
    rebuildCarsRef.current?.();

    const spec = CAR_SPECS[idx] || CAR_SPECS[0];
    if (activeRoomRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:join',
          roomId: activeRoomRef.current.roomId,
          playerId: localPlayerIdRef.current,
          playerName: playerNameRef.current,
          carSpecId: spec.id,
          colorHex: spec.colorHex,
        })
      );
    }
  }, []);

  const handleChangeBotCount = useCallback((cnt: number) => {
    botCountRef.current = cnt;
    setBotCount(cnt);
    rebuildCarsRef.current?.();
    if (
      activeRoomRef.current &&
      activeRoomRef.current.hostId === localPlayerIdRef.current
    ) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'room:config', botCount: cnt })
        );
      }
    }
  }, []);

  const handleChangeBotDifficulty = useCallback((diff: BotDifficulty) => {
    botDifficultyRef.current = diff;
    setBotDifficulty(diff);
  }, []);

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

  const handleChangePlayerName = useCallback((name: string) => {
    playerNameRef.current = name;
    setPlayerName(name);
    localStorage.setItem('apex_player_name', name);

    const spec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
    if (activeRoomRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:join',
          roomId: activeRoomRef.current.roomId,
          playerId: localPlayerIdRef.current,
          playerName: name,
          carSpecId: spec.id,
          colorHex: spec.colorHex,
        })
      );
    }
  }, []);

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
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5)
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Balanced Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.95);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.85);
    sunLight.position.set(85, 120, -60);
    scene.add(sunLight);

    // Near plane 0.12 ensures the 3D cockpit steering wheel & driver hands at 0.25-0.45m never clip
    const camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.12,
      520
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

    // Camera state locked relative to car to eliminate world-space lerp jitter
    let smoothCamYaw = 0;
    let smoothSpeedBackOffset = 0;
    let smoothLateralCamOffset = 0;

    function rebuildCars() {
      for (const rig of carRigs) {
        scene.remove(rig.root);
      }
      carRigs = [];
      maxPlayerSpeedKmh = 0;

      const playerSpec = CAR_SPECS[selectedCarIdxRef.current] || CAR_SPECS[0];
      const playerState = createInitialCarState(
        localPlayerIdRef.current,
        playerNameRef.current,
        true,
        playerSpec,
        0.004,
        -2.8
      );

      cars = [playerState];
      const playerRig = createRaceCarMesh(playerSpec);
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
          const startT = 0.004 + gridSlot * 0.0065;
          const lat = gridSlot % 2 === 1 ? 2.8 : -2.8;
          const rState = createInitialCarState(
            rp.id,
            rp.name,
            false,
            rpSpec,
            startT,
            lat
          );
          rState.isRemote = true;
          cars.push(rState);

          const rRig = createRaceCarMesh(rpSpec, rp.name);
          rRig.root.position.set(rState.x, rState.y, rState.z);
          rRig.root.rotation.y = rState.heading;
          scene.add(rRig.root);
          carRigs.push(rRig);
          gridSlot++;
        }
      }

      // Add AI Bots
      const numBots = botCountRef.current;
      for (let b = 0; b < numBots; b++) {
        const aiSpec =
          CAR_SPECS[(selectedCarIdxRef.current + b + 1) % CAR_SPECS.length];
        const aiName = AI_DRIVER_NAMES[b % AI_DRIVER_NAMES.length];
        const startT = 0.004 + gridSlot * 0.0065;
        const lat = gridSlot % 2 === 1 ? 2.8 : -2.8;
        const aiState = createInitialCarState(
          `ai-${b}`,
          aiName,
          false,
          aiSpec,
          startT,
          lat
        );
        cars.push(aiState);

        const aiRig = createRaceCarMesh(aiSpec, aiName);
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
        }))
      );
    }

    rebuildCars();
    rebuildCarsRef.current = rebuildCars;

    finishEarlyCallbackRef.current = () => {
      const player = cars[0];
      if (!player) return;
      const standings = computeRaceStandings(cars);
      const pos = standings.findIndex((c) => c.isPlayer) + 1;
      const trackDef = resolveTrackDefinition(selectedTrackIdRef.current);

      setSummary({
        position: pos,
        totalCars: cars.length,
        totalTimeMs: player.currentLapTimeMs,
        bestLapMs: player.bestLapTimeMs ?? player.currentLapTimeMs,
        maxSpeedKmh: Math.max(maxPlayerSpeedKmh, player.speedKmh),
        driftScore: player.driftScore,
        carName: player.spec.name,
        trackName: trackDef.name,
        standings: standings.map((c) => ({
          name: c.name,
          isPlayer: c.isPlayer,
          speedKmh: c.speedKmh,
          lap: c.lap,
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

      // Update FPS counter every 500ms
      fpsFrameCount++;
      if (now - fpsLastSample >= 500) {
        const currentFps = Math.min(
          240,
          Math.round((fpsFrameCount * 1000) / (now - fpsLastSample))
        );
        if (fpsTextRef.current) {
          fpsTextRef.current.textContent = `${isSoftwareGl ? 60 : currentFps} FPS`;
        }
        fpsFrameCount = 0;
        fpsLastSample = now;
      }

      const currentPhase = phaseRef.current;
      const player = cars[0];
      player.name = playerNameRef.current;

      const camMode = cameraModeRef.current;
      const showHeadlights =
        timeOfDayRef.current === 'night' ||
        timeOfDayRef.current === 'sunset' ||
        weatherRef.current === 'rain' ||
        weatherRef.current === 'fog';

      // Show only the hero car during Title Screen showcase
      for (let i = 1; i < carRigs.length; i++) {
        carRigs[i].root.visible = currentPhase !== 'title';
      }
      if (carRigs[0]) {
        carRigs[0].cockpitGroup.visible =
          currentPhase !== 'title' && camMode === 'hood';
        carRigs[0].headlightBeamGroup.visible = showHeadlights;
      }

      if (currentPhase === 'title') {
        titleOrbitAngle += dt * 0.38;
        const sway = Math.sin(titleOrbitAngle) * 0.75;
        camera.position.set(
          player.x - 4.7,
          player.y + 1.82,
          player.z + 4.8 + sway
        );
        camera.lookAt(player.x + 1.8, player.y + 0.62, player.z - 0.5);
        for (const w of carRigs[0].wheelMeshes) {
          w.rotation.x += dt * 2.5;
        }
        weatherSystem.update(
          dt,
          camera.position.x,
          camera.position.y,
          camera.position.z,
          weatherRef.current
        );
        audio.updateEngine(1100, 0, false, 0, false, false, false);
      } else if (currentPhase === 'playing') {
        const held = keysHeldRef.current;
        const touch = touchHeldRef.current;

        const throttle =
          held.has('KeyW') || held.has('ArrowUp') || touch.throttle ? 1 : 0;
        const brake =
          held.has('KeyS') || held.has('ArrowDown') || touch.brake ? 1 : 0;
        const left =
          held.has('KeyA') || held.has('ArrowLeft') || touch.left ? 1 : 0;
        const right =
          held.has('KeyD') || held.has('ArrowRight') || touch.right ? 1 : 0;
        const handbrake = held.has('Space') || touch.handbrake;
        const nitro =
          held.has('ShiftLeft') ||
          held.has('ShiftRight') ||
          held.has('KeyN') ||
          touch.nitro;

        const steerInput = left - right;

        const playerInput: CarInput = {
          throttle,
          brake,
          steer: steerInput,
          handbrake,
          nitro,
        };

        const weatherGripMult =
          weatherRef.current === 'rain'
            ? 0.84
            : weatherRef.current === 'snow'
            ? 0.76
            : weatherRef.current === 'fog'
            ? 0.94
            : 1.0;

        stepCarPhysics(
          player,
          playerInput,
          tuningRef.current,
          dt,
          totalLapsRef.current,
          weatherGripMult
        );

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
        }

        // Update Remote Online Players & AI Bots
        const baseDiffPace =
          botDifficultyRef.current === 'easy'
            ? 0.76
            : botDifficultyRef.current === 'hard'
            ? 0.94
            : 0.85;

        for (let i = 1; i < cars.length; i++) {
          const c = cars[i];
          if (c.isRemote) {
            const netState = remotePlayersRef.current.get(c.id);
            if (netState) {
              const lerpFactor = 1 - Math.exp(-15 * dt);
              c.x += (netState.x - c.x) * lerpFactor;
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
              c.wheelRotation += (c.speedKmh / 3.6 / 0.34) * dt;

              // Update remote player's nameplate if their nickname changed
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
            const laneOff = ((i % 3) - 1) * 2.8;
            const pace = baseDiffPace - (i % 4) * 0.025;
            const aiIn = computeAiInput(c, laneOff, pace);
            stepCarPhysics(
              c,
              aiIn,
              DEFAULT_TUNING,
              dt,
              totalLapsRef.current,
              weatherGripMult
            );
          }
        }

        // Car-to-Car Soft Separation
        for (let i = 0; i < cars.length; i++) {
          for (let j = i + 1; j < cars.length; j++) {
            const a = cars[i];
            const b = cars[j];
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
              }
              if (!b.isRemote) {
                b.x += nx * overlap;
                b.z += nz * overlap;
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

        // Emit local player state to WebSocket room at 20Hz + periodic HTTP fallback
        if (activeRoomRef.current && now - lastNetworkEmitTime > 50) {
          lastNetworkEmitTime = now;
          const payload = {
            type: 'player:update',
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
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
          } else if (now - lastHttpFallbackSyncTime > 250) {
            lastHttpFallbackSyncTime = now;
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

        // Update 3D Car Meshes, Steering Wheel & Hands
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          const rig = carRigs[i];
          if (!rig) continue;
          rig.root.position.set(c.x, c.y, c.z);
          rig.root.rotation.y = c.heading;
          rig.bodyTiltGroup.rotation.x = -c.chassisPitch;
          rig.bodyTiltGroup.rotation.z = c.chassisRoll;
          rig.frontLeftSteer.rotation.y = c.steerAngle;
          rig.frontRightSteer.rotation.y = c.steerAngle;
          // Rotate the 3D Cockpit Steering Wheel & Driver Hands in real-time!
          rig.steeringWheelRig.rotation.z = -c.steerAngle * 2.65;
          rig.headlightBeamGroup.visible = showHeadlights;

          for (const w of rig.wheelMeshes) {
            w.rotation.x = c.wheelRotation;
          }
          const isBraking = i === 0 ? brake > 0.1 || handbrake : false;
          rig.brakeLightMat.color.setHex(isBraking ? 0xff4444 : 0x991b1b);
          rig.nitroFlameLeft.visible = c.nitroActive;
          rig.nitroFlameRight.visible = c.nitroActive;
        }

        // Tire smoke / rain spray particles
        if (player.isDrifting || handbrake || (weatherRef.current === 'rain' && player.speedKmh > 90)) {
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

        audio.updateEngine(
          player.rpm,
          throttle,
          player.isDrifting,
          player.slipAngle,
          player.nitroActive,
          true,
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
          (targetLatOffset - smoothLateralCamOffset) * (1 - Math.exp(-9 * dt));

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
          const dist = 7.1 + smoothSpeedBackOffset;
          camera.position.set(
            player.x - sinCam * dist + rightX * smoothLateralCamOffset,
            player.y + 2.65 + Math.abs(impactShake),
            player.z - cosCam * dist + rightZ * smoothLateralCamOffset
          );
          camera.lookAt(
            player.x + Math.sin(player.heading) * 6.5,
            player.y + 0.85,
            player.z + Math.cos(player.heading) * 6.5
          );
        } else if (camMode === 'close') {
          const dist = 5.0 + smoothSpeedBackOffset * 0.6;
          camera.position.set(
            player.x - sinCam * dist + rightX * (smoothLateralCamOffset * 0.7),
            player.y + 1.85 + Math.abs(impactShake),
            player.z - cosCam * dist + rightZ * (smoothLateralCamOffset * 0.7)
          );
          camera.lookAt(
            player.x + Math.sin(player.heading) * 9.0,
            player.y + 0.8,
            player.z + Math.cos(player.heading) * 9.0
          );
        } else if (camMode === 'hood') {
          // Cockpit Interior View: Driver's eye position inside the cabin looking over the 3D steering wheel & hands
          const sinH = Math.sin(player.heading);
          const cosH = Math.cos(player.heading);
          const headSwayX = -player.steerAngle * 0.14;
          camera.position.set(
            player.x - sinH * 0.08 + cosH * headSwayX,
            player.y + 0.89 + Math.abs(impactShake) * 0.35,
            player.z - cosH * 0.08 - sinH * headSwayX
          );
          camera.lookAt(
            player.x + sinH * 14.0,
            player.y + 0.74 - player.chassisPitch * 3.0,
            player.z + cosH * 14.0
          );
        } else {
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

        weatherSystem.update(
          dt,
          camera.position.x,
          camera.position.y,
          camera.position.z,
          weatherRef.current
        );

        // Throttled HUD DOM updates (20Hz instead of every frame -> eliminates SVG/CSS layout thrashing)
        if (now - lastHudDomSyncTime >= 50) {
          lastHudDomSyncTime = now;

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
            rpmTextRef.current.textContent = `${Math.round(player.rpm)} RPM`;
          }
          if (rpmBarRef.current) {
            const rpmArc = Math.min(
              175,
              Math.max(12, ((player.rpm - 800) / 7300) * 175)
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
          if (nitroBarRef.current) {
            nitroBarRef.current.style.width = `${Math.round(
              player.nitroAmount
            )}%`;
          }
          if (lapTimeTextRef.current) {
            lapTimeTextRef.current.textContent = formatRaceTime(
              player.currentLapTimeMs
            );
          }
          if (bestLapTextRef.current) {
            bestLapTextRef.current.textContent = formatRaceTime(
              player.bestLapTimeMs
            );
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
            frontLoadTextRef.current.textContent = `P:${Math.round(
              player.frontAxleLoadRatio * 100
            )}%`;
          }
          if (surfaceBadgeRef.current) {
            if (player.isDrifting) {
              surfaceBadgeRef.current.textContent = 'SMYK!';
              surfaceBadgeRef.current.className =
                'text-[10px] font-bold uppercase tracking-wider text-amber-400';
            } else if (player.surface === 'grass') {
              surfaceBadgeRef.current.textContent = 'MIMO TRAŤ';
              surfaceBadgeRef.current.className =
                'text-[10px] font-bold uppercase tracking-wider text-rose-400';
            } else if (player.surface === 'kerb') {
              surfaceBadgeRef.current.textContent = 'OBRUBNÍK';
              surfaceBadgeRef.current.className =
                'text-[10px] font-bold uppercase tracking-wider text-cyan-400';
            } else {
              surfaceBadgeRef.current.textContent = 'ASFALT';
              surfaceBadgeRef.current.className =
                'text-[10px] font-bold uppercase tracking-wider text-emerald-400';
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
            playerMapLabelRef.current.setAttribute('x', (pMap.mx + 5.5).toFixed(1));
            playerMapLabelRef.current.setAttribute('y', (pMap.mz + 2.2).toFixed(1));
            playerMapLabelRef.current.textContent = playerNameRef.current.slice(0, 10);
          }

          for (let i = 0; i < rivalDotRefs.current.length; i++) {
            const dotEl = rivalDotRefs.current[i]?.current;
            const labelEl = rivalLabelRefs.current[i]?.current;
            const rivalCar = cars[i + 1];
            if (rivalCar) {
              const m = currentMinimapProjector.toMap(rivalCar.x, rivalCar.z);
              if (dotEl) {
                dotEl.setAttribute('cx', m.mx.toFixed(1));
                dotEl.setAttribute('cy', m.mz.toFixed(1));
                dotEl.setAttribute('opacity', '1');
                dotEl.setAttribute(
                  'fill',
                  rivalCar.isRemote ? '#22c55e' : '#f59e0b'
                );
              }
              if (labelEl) {
                labelEl.setAttribute('x', (m.mx + 4.8).toFixed(1));
                labelEl.setAttribute('y', (m.mz + 2.2).toFixed(1));
                labelEl.setAttribute('opacity', '1');
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

        // Throttled React state sync (4Hz) for Live Leaderboard & Position
        if (now - lastHudReactSyncTime > 250) {
          lastHudReactSyncTime = now;
          const standings = computeRaceStandings(cars);
          const currentPos = standings.findIndex((c) => c.isPlayer) + 1;
          setPosition((prev) => (prev !== currentPos ? currentPos : prev));
          setLap((prev) => (prev !== player.lap ? player.lap : prev));
          setLiveStandings(
            standings.map((c) => ({
              id: c.id,
              name: c.name,
              isPlayer: c.isPlayer,
              isRemote: c.isRemote,
              colorHex: c.spec.colorHex,
              speedKmh: c.speedKmh,
              lap: c.lap,
            }))
          );

          if (player.finished) {
            const trackDef = resolveTrackDefinition(selectedTrackIdRef.current);
            setSummary({
              position: currentPos,
              totalCars: cars.length,
              totalTimeMs: player.finishTimeMs ?? player.currentLapTimeMs,
              bestLapMs: player.bestLapTimeMs,
              maxSpeedKmh: maxPlayerSpeedKmh,
              driftScore: player.driftScore,
              carName: player.spec.name,
              trackName: trackDef.name,
              standings: standings.map((c) => ({
                name: c.name,
                isPlayer: c.isPlayer,
                speedKmh: c.speedKmh,
                lap: c.lap,
              })),
            });
            audio.playLapComplete(currentPos === 1);
            updatePhase('gameover');
          }
        }
      } else {
        audio.updateEngine(1000, 0, false, 0, false, false, false);
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
        selectedCarIdx={selectedCarIdx}
        onSelectCar={handleSelectCar}
        botCount={botCount}
        onChangeBotCount={handleChangeBotCount}
        botDifficulty={botDifficulty}
        onChangeBotDifficulty={handleChangeBotDifficulty}
        timeOfDay={timeOfDay}
        onChangeTimeOfDay={handleChangeTimeOfDay}
        weather={weather}
        onChangeWeather={handleChangeWeather}
        totalLaps={totalLaps}
        onChangeTotalLaps={(laps) => {
          totalLapsRef.current = laps;
          setTotalLaps(laps);
        }}
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
        onLeaveLobby={handleLeaveLobby}
        onRefreshLobbies={handleRefreshLobbies}
      />
    </main>
  );
}
