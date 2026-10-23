import React, { useMemo, useState } from 'react';
import {
  AssistMode,
  BotDifficulty,
  CAR_SPECS,
  CarSpec,
  TimeOfDay,
  TuningConfig,
  WeatherType,
} from '../game/physics';
import {
  getTrackSamples,
  resolveTrackDefinition,
  TRACK_DEFINITIONS,
} from '../game/track';

export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';
export type CameraMode = 'chase' | 'close' | 'hood' | 'heli';

export interface MultiplayerPlayerDTO {
  id: string;
  name: string;
  carSpecId: string;
  colorHex: number;
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
}

export interface LobbyRoomDTO {
  roomId: string;
  hostId: string;
  trackId: string;
  totalLaps: number;
  botCount: number;
  botDifficulty: BotDifficulty;
  status: 'waiting' | 'racing' | 'finished';
  raceStartedAt: number | null;
  players: MultiplayerPlayerDTO[];
}

export interface PublicLobbySummary {
  roomId: string;
  trackId: string;
  totalLaps: number;
  botCount: number;
  status: string;
  playerCount: number;
  hostName: string;
}

export interface StandingEntry {
  id: string;
  name: string;
  isPlayer: boolean;
  isRemote?: boolean;
  colorHex: number;
  speedKmh: number;
  lap: number;
}

export interface HudLiveRefs {
  speedText: React.RefObject<HTMLSpanElement | null>;
  gearText: React.RefObject<HTMLSpanElement | null>;
  rpmText: React.RefObject<HTMLSpanElement | null>;
  rpmBar: React.RefObject<SVGCircleElement | null>;
  nitroBar: React.RefObject<HTMLDivElement | null>;
  lapTimeText: React.RefObject<HTMLSpanElement | null>;
  bestLapText: React.RefObject<HTMLSpanElement | null>;
  driftChainText: React.RefObject<HTMLSpanElement | null>;
  driftTotalText: React.RefObject<HTMLSpanElement | null>;
  surfaceBadge: React.RefObject<HTMLSpanElement | null>;
  gDot: React.RefObject<SVGCircleElement | null>;
  frontLoadText: React.RefObject<HTMLSpanElement | null>;
  fpsText: React.RefObject<HTMLSpanElement | null>;
  playerMapDot: React.RefObject<SVGCircleElement | null>;
  playerMapLabel: React.RefObject<SVGTextElement | null>;
  rivalMapDots: Array<React.RefObject<SVGCircleElement | null>>;
  rivalMapLabels: Array<React.RefObject<SVGTextElement | null>>;
}

export interface RaceSummarySnapshot {
  position: number;
  totalCars: number;
  totalTimeMs: number;
  bestLapMs: number | null;
  maxSpeedKmh: number;
  driftScore: number;
  carName: string;
  trackName: string;
  standings: Array<{
    name: string;
    isPlayer: boolean;
    speedKmh: number;
    lap: number;
  }>;
}

interface GameHudProps {
  phase: GamePhase;
  selectedTrackId: string;
  onSelectTrack: (trackId: string) => void;
  onGenerateRandomTrack: () => void;
  selectedCarIdx: number;
  onSelectCar: (idx: number) => void;
  botCount: number;
  onChangeBotCount: (count: number) => void;
  botDifficulty: BotDifficulty;
  onChangeBotDifficulty: (diff: BotDifficulty) => void;
  timeOfDay: TimeOfDay;
  onChangeTimeOfDay: (tod: TimeOfDay) => void;
  weather: WeatherType;
  onChangeWeather: (w: WeatherType) => void;
  totalLaps: number;
  onChangeTotalLaps: (laps: number) => void;
  tuning: TuningConfig;
  onChangeTuning: (next: TuningConfig) => void;
  cameraMode: CameraMode;
  onCycleCamera: () => void;
  muted: boolean;
  onToggleMute: () => void;
  dockOpen: boolean;
  onToggleDock: () => void;
  position: number;
  totalCarsCount: number;
  lap: number;
  liveStandings: StandingEntry[];
  summary: RaceSummarySnapshot | null;
  onStartRace: () => void;
  onResumeRace: () => void;
  onRestartRace: () => void;
  onReturnTitle: () => void;
  onFinishEarly: () => void;
  onTouchControl: (
    control: 'left' | 'right' | 'throttle' | 'brake' | 'handbrake' | 'nitro',
    active: boolean
  ) => void;
  liveRefs: HudLiveRefs;
  playerName: string;
  onChangePlayerName: (name: string) => void;
  googleUserEmail?: string | null;
  onGoogleSignIn?: () => void;
  localPlayerId: string;
  activeRoom: LobbyRoomDTO | null;
  publicLobbies: PublicLobbySummary[];
  lobbyError: string | null;
  onCreateLobby: (customCode?: string) => void;
  onJoinLobby: (code: string) => void;
  onLeaveLobby: () => void;
  onRefreshLobbies: () => void;
}

export function formatRaceTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '--:--.-';
  const totalSeconds = ms / 1000;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

export function computeMinimapData(trackId: string) {
  const samples = getTrackSamples(trackId);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of samples) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const scale = 104 / Math.max(spanX, spanZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const toMap = (x: number, z: number) => ({
    mx: 75 + (x - cx) * scale,
    mz: 75 - (z - cz) * scale,
  });

  const pts: string[] = [];
  for (let i = 0; i < samples.length; i += 3) {
    const { mx, mz } = toMap(samples[i].x, samples[i].z);
    pts.push(`${i === 0 ? 'M' : 'L'}${mx.toFixed(1)},${mz.toFixed(1)}`);
  }
  pts.push('Z');
  const startPt = toMap(samples[16].x, samples[16].z);

  return {
    pathD: pts.join(' '),
    startPt,
    toMap,
  };
}

export const GameHud: React.FC<GameHudProps> = ({
  phase,
  selectedTrackId,
  onSelectTrack,
  onGenerateRandomTrack,
  selectedCarIdx,
  onSelectCar,
  botCount,
  onChangeBotCount,
  botDifficulty,
  onChangeBotDifficulty,
  timeOfDay,
  onChangeTimeOfDay,
  weather,
  onChangeWeather,
  totalLaps,
  onChangeTotalLaps,
  tuning,
  onChangeTuning,
  cameraMode,
  onCycleCamera,
  muted,
  onToggleMute,
  dockOpen,
  onToggleDock,
  position,
  totalCarsCount,
  lap,
  liveStandings,
  summary,
  onStartRace,
  onResumeRace,
  onRestartRace,
  onReturnTitle,
  onFinishEarly,
  onTouchControl,
  liveRefs,
  playerName,
  onChangePlayerName,
  googleUserEmail,
  onGoogleSignIn,
  localPlayerId,
  activeRoom,
  publicLobbies,
  lobbyError,
  onCreateLobby,
  onJoinLobby,
  onLeaveLobby,
  onRefreshLobbies,
}) => {
  const [menuTab, setMenuTab] = useState<'solo' | 'multiplayer'>('solo');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [customCreateCode, setCustomCreateCode] = useState<string>('');
  const [copiedRoom, setCopiedRoom] = useState<boolean>(false);

  const selectedCar: CarSpec = CAR_SPECS[selectedCarIdx] || CAR_SPECS[0];
  const selectedTrack = resolveTrackDefinition(selectedTrackId);

  const minimap = useMemo(
    () => computeMinimapData(selectedTrackId),
    [selectedTrackId]
  );

  const cameraLabel =
    cameraMode === 'chase'
      ? 'Pohled: Za vozem'
      : cameraMode === 'close'
      ? 'Pohled: Nízký GT'
      : cameraMode === 'hood'
      ? 'Pohled: Interiér (Volant)'
      : 'Pohled: Helikoptéra';

  const isHost = activeRoom ? activeRoom.hostId === localPlayerId : true;

  const handleCopyRoomLink = () => {
    if (!activeRoom) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${activeRoom.roomId}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedRoom(true);
    setTimeout(() => setCopiedRoom(false), 2000);
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between select-none">
      {/* ==================== TITLE & GARAGE / LOBBY SCREEN ==================== */}
      {phase === 'title' && (
        <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-5 md:p-7 overflow-y-auto">
          <div
            className="pointer-events-auto w-full max-w-xl rounded-2xl p-4 sm:p-5 border border-white/15 shadow-2xl my-auto"
            style={{ backgroundColor: 'rgba(8, 12, 20, 0.90)' }}
          >
            {/* Header Lockup */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <svg
                  viewBox="0 0 56 56"
                  className="w-10 h-10 shrink-0"
                  aria-hidden="true"
                >
                  <polygon
                    points="28,3 52,15 46,45 28,53 10,45 4,15"
                    fill="#0f172a"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M14 36 L24 14 L32 14 L42 36 L35 36 L28 21 L21 36 Z"
                    fill="#f8fafc"
                  />
                  <path
                    d="M18 41 L38 41"
                    stroke="#ef4444"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div>
                  <div className="text-[11px] font-semibold tracking-widest uppercase text-amber-400">
                    {selectedTrack.name} · {selectedTrack.difficulty}
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white leading-none">
                    APEX VELOCITY
                  </h1>
                </div>
              </div>

              {/* Solo vs Online Lobby Switch */}
              <div className="flex bg-slate-900/90 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setMenuTab('solo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    menuTab === 'solo' && !activeRoom
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Závod / Kariéra
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuTab('multiplayer');
                    onRefreshLobbies();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    menuTab === 'multiplayer' || activeRoom
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Online Lobby
                </button>
              </div>
            </div>

            {/* 1. Circuit & Procedural Generator */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                <span>1. Okruh (4 tratě + generátor)</span>
                <button
                  type="button"
                  disabled={Boolean(activeRoom && !isHost)}
                  onClick={onGenerateRandomTrack}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                    selectedTrack.isProcedural
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-800 border-white/15 text-cyan-300 hover:border-cyan-400'
                  }`}
                >
                  Náhodná trať (Generovat)
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {TRACK_DEFINITIONS.map((t) => {
                  const active = t.id === selectedTrackId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={Boolean(activeRoom && !isHost)}
                      onClick={() => onSelectTrack(t.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-left border transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-800 border-amber-400 text-white'
                          : 'bg-slate-900/90 border-white/10 text-slate-300 hover:border-white/30'
                      } ${
                        activeRoom && !isHost
                          ? 'opacity-60 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      <div className="font-display text-xs font-bold truncate">
                        {t.name.split(' ')[0]} {t.name.split(' ')[1]}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        Grip {Math.round(t.gripFactor * 100)}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Environment: Time of Day & Weather */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-slate-900/80 p-2 rounded-xl border border-white/10">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Denní doba
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      ['day', 'Den'],
                      ['sunrise', 'Ráno'],
                      ['sunset', 'Západ'],
                      ['night', 'Noc'],
                    ] as Array<[TimeOfDay, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onChangeTimeOfDay(id)}
                      className={`py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                        timeOfDay === id
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/80 p-2 rounded-xl border border-white/10">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Počasí a povrch
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      ['clear', 'Jasno'],
                      ['rain', 'Déšť'],
                      ['fog', 'Mlha'],
                      ['snow', 'Sníh'],
                    ] as Array<[WeatherType, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onChangeWeather(id)}
                      className={`py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                        weather === id
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Car Selection (6 Sculpted Cars) */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                <span>2. Výběr vozu (6 modelů)</span>
                <span className="text-cyan-400 font-mono-tabular">
                  {selectedCar.name} · {Math.round(selectedCar.topSpeedMs * 3.6)}{' '}
                  km/h
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CAR_SPECS.map((car, idx) => {
                  const active = idx === selectedCarIdx;
                  return (
                    <button
                      key={car.id}
                      type="button"
                      onClick={() => onSelectCar(idx)}
                      className={`p-2 rounded-xl text-left border transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-800 border-amber-400 text-white'
                          : 'bg-slate-900/90 border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{
                            backgroundColor: `#${car.colorHex
                              .toString(16)
                              .padStart(6, '0')}`,
                          }}
                        />
                        <span className="font-display font-bold text-xs truncate">
                          {car.name.split(' ')[0]}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono-tabular mt-0.5">
                        {Math.round(car.topSpeedMs * 3.6)} km/h · G:
                        {car.stats.handling}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ==================== SOLO MODE TAB ==================== */}
            {menuTab === 'solo' && !activeRoom && (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-slate-900/90 p-2 rounded-xl border border-white/10">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Počet soupeřů
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[3, 5, 7].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => onChangeBotCount(cnt)}
                          className={`py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            botCount === cnt
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {cnt} AI
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-900/90 p-2 rounded-xl border border-white/10">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Obtížnost a kamera
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeBotDifficulty(
                            botDifficulty === 'easy'
                              ? 'medium'
                              : botDifficulty === 'medium'
                              ? 'hard'
                              : 'easy'
                          )
                        }
                        className="py-1 px-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] font-bold truncate cursor-pointer"
                      >
                        AI:{' '}
                        {botDifficulty === 'easy'
                          ? 'Lehká'
                          : botDifficulty === 'medium'
                          ? 'Střední'
                          : 'Expert'}
                      </button>
                      <button
                        type="button"
                        onClick={onCycleCamera}
                        className={`py-1 px-1.5 rounded-lg text-[11px] font-bold truncate cursor-pointer ${
                          cameraMode === 'hood'
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {cameraMode === 'hood' ? 'Volant 3D' : 'Za vozem'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Driving Physics Preset */}
                <div className="mb-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['arcade', 'Arkáda', 'Vysoká stabilita'],
                        ['sim-lite', 'Sim-Lite', 'Přenos váhy a grip'],
                        ['drift', 'Drift Spec', 'Dlouhé powerslidy'],
                      ] as Array<[AssistMode, string, string]>
                    ).map(([mode, title, desc]) => {
                      const active = tuning.assistMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() =>
                            onChangeTuning({ ...tuning, assistMode: mode })
                          }
                          className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-amber-500/20 border-amber-400 text-white'
                              : 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="text-xs font-bold">{title}</div>
                          <div className="text-[10px] opacity-80 truncate">
                            {desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  data-start="true"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onStartRace();
                  }}
                  className="w-full py-3 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-display font-bold text-lg tracking-wide transition-colors cursor-pointer shadow-lg shadow-amber-500/25"
                >
                  ODSTARTOVAT ZÁVOD ({botCount + 1} AUT NA ROŠTU)
                </button>
              </>
            )}

            {/* ==================== ONLINE MULTIPLAYER LOBBY TAB ==================== */}
            {(menuTab === 'multiplayer' || activeRoom) && (
              <div className="bg-slate-900/95 rounded-xl p-3.5 border border-cyan-500/30">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    Online Multiplayer Lobby (Jména nad auty i na mapě)
                  </span>
                  {onGoogleSignIn && (
                    <button
                      type="button"
                      onClick={onGoogleSignIn}
                      className="px-2.5 py-1 rounded-lg bg-white text-slate-900 hover:bg-slate-100 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow"
                    >
                      <span>G</span>
                      <span>
                        {googleUserEmail
                          ? `Přihlášen (${googleUserEmail.split('@')[0]})`
                          : 'Přihlásit přes Google'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Nickname input prominently visible before & during lobby */}
                <div className="flex items-center gap-2 mb-3 bg-slate-950 px-3 py-2 rounded-lg border border-white/15">
                  <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                    Tvoje jméno nad autem:
                  </span>
                  <input
                    type="text"
                    maxLength={16}
                    value={playerName}
                    onChange={(e) => onChangePlayerName(e.target.value)}
                    placeholder="Zadej přezdívku..."
                    className="w-full bg-transparent text-xs font-bold text-white focus:outline-none"
                  />
                </div>

                {lobbyError && (
                  <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-xs text-rose-300">
                    {lobbyError}
                  </div>
                )}

                {!activeRoom ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      <div className="bg-slate-950/90 p-2.5 rounded-lg border border-white/10">
                        <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                          Vytvořit vlastní Lobby
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            maxLength={8}
                            value={customCreateCode}
                            onChange={(e) =>
                              setCustomCreateCode(e.target.value.toUpperCase())
                            }
                            placeholder="Vlastní ID (volitelné)"
                            className="w-full bg-slate-900 border border-white/15 rounded-lg px-2 py-1.5 text-xs font-mono-tabular text-white uppercase"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onCreateLobby(customCreateCode || undefined)
                            }
                            className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs whitespace-nowrap cursor-pointer"
                          >
                            + Vytvořit
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-950/90 p-2.5 rounded-lg border border-white/10">
                        <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                          Připojit se podle ID
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            maxLength={8}
                            value={joinCodeInput}
                            onChange={(e) =>
                              setJoinCodeInput(e.target.value.toUpperCase())
                            }
                            placeholder="Zadej ID (např. A7X9K)"
                            className="w-full bg-slate-900 border border-white/15 rounded-lg px-2 py-1.5 text-xs font-mono-tabular text-white uppercase"
                          />
                          <button
                            type="button"
                            onClick={() => onJoinLobby(joinCodeInput)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs whitespace-nowrap cursor-pointer"
                          >
                            Připojit
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span>Otevřené místnosti ({publicLobbies.length})</span>
                        <button
                          type="button"
                          onClick={onRefreshLobbies}
                          className="text-cyan-400 hover:underline cursor-pointer"
                        >
                          Obnovit seznam
                        </button>
                      </div>
                      {publicLobbies.length === 0 ? (
                        <div className="text-xs text-slate-500 py-2 text-center bg-slate-950/60 rounded-lg">
                          Žádná veřejná lobby zatím neběží. Vytvoř novou místnost
                          a pošli ID kamarádovi!
                        </div>
                      ) : (
                        <div className="max-h-24 overflow-y-auto space-y-1">
                          {publicLobbies.map((lob) => (
                            <div
                              key={lob.roomId}
                              className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded-lg border border-white/10 text-xs"
                            >
                              <div>
                                <span className="font-mono-tabular font-bold text-cyan-400 mr-2">
                                  #{lob.roomId}
                                </span>
                                <span className="text-slate-200 font-semibold">
                                  {lob.hostName}
                                </span>
                                <span className="text-slate-400 ml-2 text-[11px]">
                                  ({lob.playerCount} jezdců)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => onJoinLobby(lob.roomId)}
                                className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 font-bold text-[11px] cursor-pointer"
                              >
                                Vstoupit
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-lg border border-cyan-400/40 mb-2.5">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          ID Místnosti
                        </div>
                        <div className="font-mono-tabular text-xl font-bold text-cyan-400 tracking-wider">
                          {activeRoom.roomId}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={handleCopyRoomLink}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 border border-cyan-500/30 cursor-pointer"
                        >
                          {copiedRoom ? 'Zkopírováno!' : 'Kopírovat pozvánku'}
                        </button>
                        <button
                          type="button"
                          onClick={onLeaveLobby}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-semibold text-rose-300 cursor-pointer"
                        >
                          Opustit
                        </button>
                      </div>
                    </div>

                    <div className="mb-2.5">
                      <div className="text-[11px] text-slate-400 mb-1">
                        Připojení jezdci v lobby ({activeRoom.players.length}):
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 max-h-24 overflow-y-auto">
                        {activeRoom.players.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between bg-slate-950 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor: `#${p.colorHex
                                    .toString(16)
                                    .padStart(6, '0')}`,
                                }}
                              />
                              <span className="font-semibold text-white truncate">
                                {p.name}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono-tabular text-amber-400 ml-1">
                              {p.isHost ? 'HOST' : 'PŘIPRAVEN'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {isHost && (
                      <div className="flex items-center justify-between gap-2 mb-3 text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-white/10">
                        <span className="text-slate-300">Doplnit AI boty:</span>
                        <div className="flex gap-1">
                          {[0, 2, 4, 6].map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => onChangeBotCount(cnt)}
                              className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                                activeRoom.botCount === cnt
                                  ? 'bg-cyan-400 text-slate-950'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {cnt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      data-start="true"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onStartRace();
                      }}
                      className="w-full py-2.5 px-5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-base tracking-wide cursor-pointer shadow-lg"
                    >
                      {isHost
                        ? 'ODSTARTOVAT ONLINE ZÁVOD PRO VŠECHNY'
                        : 'SPUSTIT JÍZDU V LOBBY'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="w-full text-center mt-1">
            <p
              className="inline-block text-xs font-medium text-slate-200 tracking-wide"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.95)' }}
            >
              WASD / Šipky Plynulé Řízení · Space Ruční brzda · Shift Nitro · C
              Pohled z volantu (Interiér) · Esc Pauza
            </p>
          </div>
        </div>
      )}

      {/* ==================== PLAYING HUD ==================== */}
      {phase === 'playing' && (
        <>
          {/* Top Perimeter Row */}
          <div className="flex items-start justify-between p-3 sm:p-5 gap-3">
            {/* Top-Left Cluster: Position, Lap, Lap Times + Live Standings Leaderboard */}
            <div className="flex flex-col gap-2">
              <div
                className="pointer-events-auto rounded-xl px-3.5 py-2.5 border border-white/15 shadow-xl flex items-center gap-3.5 sm:gap-5"
                style={{ backgroundColor: 'rgba(8, 12, 20, 0.86)' }}
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    POŘADÍ
                  </div>
                  <div className="font-display text-2xl sm:text-3xl font-bold text-amber-400 font-mono-tabular leading-none mt-0.5">
                    {position}
                    <span className="text-sm text-slate-400 font-normal">
                      /{totalCarsCount}
                    </span>
                  </div>
                </div>

                <div className="w-px h-8 bg-white/10" />

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    KOLO
                  </div>
                  <div className="font-display text-2xl sm:text-3xl font-bold text-white font-mono-tabular leading-none mt-0.5">
                    {lap}
                    <span className="text-sm text-slate-400 font-normal">
                      /{totalLaps}
                    </span>
                  </div>
                </div>

                <div className="w-px h-8 bg-white/10" />

                <div className="min-w-[95px]">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>ČAS</span>
                    <span
                      ref={liveRefs.lapTimeText}
                      className="font-mono-tabular font-bold text-white text-xs sm:text-sm"
                    >
                      0:00.0
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                    <span>NEJ</span>
                    <span
                      ref={liveRefs.bestLapText}
                      className="font-mono-tabular font-semibold text-cyan-400 text-xs"
                    >
                      --:--.-
                    </span>
                  </div>
                </div>

                <div className="w-px h-8 bg-white/10 hidden md:block" />

                <div className="hidden md:block min-w-[78px]">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    DRIFT
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span
                      ref={liveRefs.driftTotalText}
                      className="font-display text-lg font-bold text-white font-mono-tabular leading-none"
                    >
                      0
                    </span>
                    <span
                      ref={liveRefs.driftChainText}
                      className="text-xs font-mono-tabular font-bold text-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Live Standings Leaderboard directly under Position */}
              <div
                className="pointer-events-auto rounded-xl px-3 py-2 border border-white/15 shadow-xl w-52 sm:w-60"
                style={{ backgroundColor: 'rgba(8, 12, 20, 0.82)' }}
              >
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center justify-between">
                  <span>Pořadí jezdců</span>
                  <span className="text-amber-400">Živě</span>
                </div>
                <div className="space-y-0.5">
                  {liveStandings.slice(0, 6).map((driver, idx) => (
                    <div
                      key={driver.id}
                      className={`flex items-center justify-between px-2 py-0.5 rounded text-xs ${
                        driver.isPlayer
                          ? 'bg-amber-500/25 text-amber-300 font-bold border border-amber-400/30'
                          : 'text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-mono-tabular text-[11px] text-slate-400 w-4">
                          {idx + 1}.
                        </span>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: driver.isPlayer
                              ? '#38bdf8'
                              : `#${driver.colorHex
                                  .toString(16)
                                  .padStart(6, '0')}`,
                          }}
                        />
                        <span className="truncate">{driver.name}</span>
                      </div>
                      <span className="font-mono-tabular text-[10px] text-slate-400 ml-2 shrink-0">
                        {Math.round(driver.speedKmh)} km/h
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top-Right Cluster: Camera / Cockpit Button + Minimap with Player Names */}
            <div className="flex flex-col items-end gap-2">
              <div
                className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-xl border border-white/15 shadow-xl"
                style={{ backgroundColor: 'rgba(8, 12, 20, 0.86)' }}
              >
                {activeRoom && (
                  <span className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 font-mono-tabular text-xs font-bold hidden sm:inline-block">
                    LOBBY #{activeRoom.roomId}
                  </span>
                )}
                <span
                  ref={liveRefs.fpsText}
                  className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 font-mono-tabular text-xs font-bold hidden sm:inline-block"
                >
                  60 FPS
                </span>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={cameraLabel}
                  title={`${cameraLabel} [C]`}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onCycleCamera();
                  }}
                  className={`px-2.5 min-h-[40px] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    cameraMode === 'hood'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40'
                      : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4 fill-none stroke-current"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 3v6M3.5 14.5l5.5-2M20.5 14.5l-5.5-2" />
                  </svg>
                  <span className="hidden lg:inline">{cameraLabel}</span>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={muted ? 'Zapnout zvuk' : 'Ztlumit zvuk'}
                  title="Zvuk [M]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleMute();
                  }}
                  className="min-w-[40px] min-h-[40px] rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  {muted ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4 fill-none stroke-rose-400"
                      strokeWidth="2"
                    >
                      <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4 fill-none stroke-emerald-400"
                      strokeWidth="2"
                    >
                      <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  )}
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Restartovat závod"
                  title="Restart [R]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRestartRace();
                  }}
                  className="min-w-[40px] min-h-[40px] rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4 fill-none stroke-current"
                    strokeWidth="2"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Pozastavit hru"
                  title="Pauza [Esc]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onResumeRace();
                  }}
                  className="min-w-[40px] min-h-[40px] rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4 fill-none stroke-current"
                    strokeWidth="2"
                  >
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                </button>
              </div>

              {/* Circuit Minimap with Driver Names next to Dots */}
              <div
                className="pointer-events-auto rounded-xl p-2 border border-white/15 shadow-xl hidden sm:block"
                style={{ backgroundColor: 'rgba(8, 12, 20, 0.84)' }}
              >
                <svg
                  viewBox="0 0 150 150"
                  className="w-32 h-32 md:w-36 md:h-36 overflow-visible"
                >
                  <path
                    d={minimap.pathD}
                    fill="none"
                    stroke="#334155"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={minimap.pathD}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx={minimap.startPt.mx}
                    cy={minimap.startPt.mz}
                    r="3.5"
                    fill="#f8fafc"
                  />
                  {liveRefs.rivalMapDots.map((dotRef, i) => (
                    <g key={i}>
                      <circle
                        ref={dotRef}
                        cx="75"
                        cy="75"
                        r="3.4"
                        fill="#f59e0b"
                        opacity="0"
                      />
                      <text
                        ref={liveRefs.rivalMapLabels[i]}
                        x="80"
                        y="77"
                        fill="#e2e8f0"
                        fontSize="7.5"
                        fontWeight="bold"
                        opacity="0"
                        style={{
                          textShadow: '0 1px 2px rgba(0,0,0,0.95)',
                        }}
                      />
                    </g>
                  ))}
                  <circle
                    ref={liveRefs.playerMapDot}
                    cx="75"
                    cy="75"
                    r="4.5"
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                  <text
                    ref={liveRefs.playerMapLabel}
                    x="81"
                    y="77"
                    fill="#38bdf8"
                    fontSize="8"
                    fontWeight="bold"
                    style={{
                      textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                    }}
                  >
                    {playerName.slice(0, 10)}
                  </text>
                </svg>
              </div>
            </div>
          </div>

          {/* ==================== MOBILE & TOUCH CONTROLS ==================== */}
          <div className="pointer-events-none flex items-end justify-between px-3 pb-2 sm:pb-3 gap-2">
            {/* Left Thumb Zone: Steering + Collapsible Tuning */}
            <div className="flex flex-col items-start gap-2">
              <div className="pointer-events-auto flex items-center gap-2 md:hidden">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Zatočit vlevo"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('left', true);
                  }}
                  onPointerUp={() => onTouchControl('left', false)}
                  onPointerCancel={() => onTouchControl('left', false)}
                  onPointerLeave={() => onTouchControl('left', false)}
                  className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-slate-900/90 active:bg-amber-500 active:text-slate-950 text-white border border-white/20 flex items-center justify-center shadow-xl touch-none select-none cursor-pointer"
                >
                  <span className="font-display text-2xl font-bold">◀</span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Zatočit vpravo"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('right', true);
                  }}
                  onPointerUp={() => onTouchControl('right', false)}
                  onPointerCancel={() => onTouchControl('right', false)}
                  onPointerLeave={() => onTouchControl('right', false)}
                  className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-slate-900/90 active:bg-amber-500 active:text-slate-950 text-white border border-white/20 flex items-center justify-center shadow-xl touch-none select-none cursor-pointer"
                >
                  <span className="font-display text-2xl font-bold">▶</span>
                </button>
              </div>

              <div className="pointer-events-auto hidden sm:block">
                {!dockOpen ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onToggleDock();
                    }}
                    className="px-3.5 py-2 rounded-xl border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-2 shadow-xl cursor-pointer"
                    style={{ backgroundColor: 'rgba(8, 12, 20, 0.86)' }}
                  >
                    <span>Nastavení podvozku a počasí [H]</span>
                  </button>
                ) : (
                  <div
                    className="w-72 rounded-2xl p-4 border border-white/15 shadow-2xl"
                    style={{ backgroundColor: 'rgba(8, 12, 20, 0.92)' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                        Telemetrie & Podvozek
                      </span>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onToggleDock();
                        }}
                        className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 cursor-pointer"
                      >
                        Skrýt
                      </button>
                    </div>

                    <div className="mb-2.5">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">Citlivost řízení</span>
                        <span className="font-mono-tabular text-amber-400">
                          {Math.round(tuning.steeringSensitivity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.6"
                        max="1.4"
                        step="0.05"
                        value={tuning.steeringSensitivity}
                        onChange={(e) =>
                          onChangeTuning({
                            ...tuning,
                            steeringSensitivity: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div className="mb-2.5">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">Přilnavost pneu</span>
                        <span className="font-mono-tabular text-amber-400">
                          {Math.round(tuning.tireGripMultiplier * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.75"
                        max="1.35"
                        step="0.05"
                        value={tuning.tireGripMultiplier}
                        onChange={(e) =>
                          onChangeTuning({
                            ...tuning,
                            tireGripMultiplier: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-1 mb-2">
                      {(
                        [
                          ['day', 'Den'],
                          ['sunrise', 'Ráno'],
                          ['sunset', 'Západ'],
                          ['night', 'Noc'],
                        ] as Array<[TimeOfDay, string]>
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onChangeTimeOfDay(id)}
                          className={`py-1 rounded text-[10px] font-bold cursor-pointer ${
                            timeOfDay === id
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          ['clear', 'Jasno'],
                          ['rain', 'Déšť'],
                          ['fog', 'Mlha'],
                          ['snow', 'Sníh'],
                        ] as Array<[WeatherType, string]>
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onChangeWeather(id)}
                          className={`py-1 rounded text-[10px] font-bold cursor-pointer ${
                            weather === id
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Cluster: Touch Action Pedals + Digital Speedometer */}
            <div className="flex flex-col items-end gap-2">
              <div className="pointer-events-auto flex items-center gap-1.5 md:hidden">
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('nitro', true);
                  }}
                  onPointerUp={() => onTouchControl('nitro', false)}
                  onPointerCancel={() => onTouchControl('nitro', false)}
                  onPointerLeave={() => onTouchControl('nitro', false)}
                  className="px-3.5 h-14 rounded-2xl bg-cyan-500/90 active:bg-cyan-300 text-slate-950 font-display font-bold text-xs tracking-wider border border-white/20 shadow-xl touch-none select-none cursor-pointer"
                >
                  NITRO
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('handbrake', true);
                  }}
                  onPointerUp={() => onTouchControl('handbrake', false)}
                  onPointerCancel={() => onTouchControl('handbrake', false)}
                  onPointerLeave={() => onTouchControl('handbrake', false)}
                  className="px-3.5 h-14 rounded-2xl bg-amber-500/90 active:bg-amber-300 text-slate-950 font-display font-bold text-xs tracking-wider border border-white/20 shadow-xl touch-none select-none cursor-pointer"
                >
                  SMYK
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('brake', true);
                  }}
                  onPointerUp={() => onTouchControl('brake', false)}
                  onPointerCancel={() => onTouchControl('brake', false)}
                  onPointerLeave={() => onTouchControl('brake', false)}
                  className="px-4 h-16 rounded-2xl bg-rose-600/90 active:bg-rose-400 text-white font-display font-bold text-xs tracking-wider border border-white/20 shadow-xl touch-none select-none cursor-pointer"
                >
                  BRZDA
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('throttle', true);
                  }}
                  onPointerUp={() => onTouchControl('throttle', false)}
                  onPointerCancel={() => onTouchControl('throttle', false)}
                  onPointerLeave={() => onTouchControl('throttle', false)}
                  className="px-5 h-16 rounded-2xl bg-emerald-500/90 active:bg-emerald-300 text-slate-950 font-display font-bold text-sm tracking-wider border border-white/20 shadow-xl touch-none select-none cursor-pointer"
                >
                  PLYN
                </button>
              </div>

              {/* Speedometer, Tachometer, Gear & G-Meter */}
              <div
                className="pointer-events-auto rounded-2xl p-3 sm:p-3.5 border border-white/15 shadow-2xl flex items-center gap-3.5"
                style={{ backgroundColor: 'rgba(8, 12, 20, 0.88)' }}
              >
                <div className="hidden sm:flex flex-col items-center">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                    G-METR
                  </div>
                  <svg viewBox="0 0 64 64" className="w-12 h-12">
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="#0f172a"
                      stroke="#334155"
                      strokeWidth="1.5"
                    />
                    <line
                      x1="32"
                      y1="6"
                      x2="32"
                      y2="58"
                      stroke="#1e293b"
                      strokeWidth="1"
                    />
                    <line
                      x1="6"
                      y1="32"
                      x2="58"
                      y2="32"
                      stroke="#1e293b"
                      strokeWidth="1"
                    />
                    <circle
                      ref={liveRefs.gDot}
                      cx="32"
                      cy="32"
                      r="4.5"
                      fill="#f59e0b"
                    />
                  </svg>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      ref={liveRefs.frontLoadText}
                      className="text-[10px] font-mono-tabular text-slate-400"
                    >
                      P:50%
                    </span>
                    <span
                      ref={liveRefs.surfaceBadge}
                      className="text-[10px] font-bold uppercase tracking-wider text-emerald-400"
                    >
                      ASFALT
                    </span>
                  </div>
                </div>

                <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20">
                  <svg
                    viewBox="0 0 88 88"
                    className="w-full h-full -rotate-135"
                  >
                    <circle
                      cx="44"
                      cy="44"
                      r="36"
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="7"
                      strokeDasharray="175 240"
                      strokeLinecap="round"
                    />
                    <circle
                      ref={liveRefs.rpmBar}
                      cx="44"
                      cy="44"
                      r="36"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="7"
                      strokeDasharray="24 240"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      STUPEŇ
                    </span>
                    <span
                      ref={liveRefs.gearText}
                      className="font-display text-xl sm:text-2xl font-bold text-amber-400 font-mono-tabular leading-none"
                    >
                      1
                    </span>
                    <span
                      ref={liveRefs.rpmText}
                      className="text-[8px] font-mono-tabular text-slate-400 mt-0.5"
                    >
                      1050 RPM
                    </span>
                  </div>
                </div>

                <div className="min-w-[85px] sm:min-w-[100px]">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    RYCHLOST
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span
                      ref={liveRefs.speedText}
                      className="font-display text-3xl sm:text-4xl font-bold text-white font-mono-tabular leading-none"
                    >
                      0
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      KM/H
                    </span>
                  </div>

                  <div className="mt-2">
                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-cyan-400 mb-0.5">
                      <span>NITRO [SHIFT]</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        ref={liveRefs.nitroBar}
                        className="h-full bg-cyan-400 rounded-full"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== PAUSE MODAL ==================== */}
      {phase === 'paused' && (
        <div className="fixed inset-0 pointer-events-auto flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-2xl p-6 border border-white/15 shadow-2xl"
            style={{ backgroundColor: 'rgba(8, 12, 20, 0.95)' }}
          >
            <div className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">
              Závod pozastaven
            </div>
            <h2 className="font-display text-3xl font-bold text-white mb-4">
              PAUZA
            </h2>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onResumeRace}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base tracking-wide cursor-pointer"
              >
                POKRAČOVAT V JÍZDĚ [ESC]
              </button>
              <button
                type="button"
                onClick={onRestartRace}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm cursor-pointer"
              >
                Restartovat závod od startu
              </button>
              <button
                type="button"
                onClick={onFinishEarly}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-sm cursor-pointer"
              >
                Ukončit jízdu a zobrazit výsledky
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-sm border border-white/10 cursor-pointer"
              >
                Zpět do garáže / výběru tratě
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== GAMEOVER / RESULTS MODAL ==================== */}
      {phase === 'gameover' && summary && (
        <div className="fixed inset-0 pointer-events-auto flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div
            className="w-full max-w-lg rounded-2xl p-6 border border-white/15 shadow-2xl"
            style={{ backgroundColor: 'rgba(8, 12, 20, 0.95)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Výsledková listina · {summary.trackName}
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono-tabular text-xs font-bold">
                {summary.carName}
              </span>
            </div>

            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
              {summary.position === 1
                ? 'VÍTĚZSTVÍ V ZÁVODĚ!'
                : `${summary.position}. MÍSTO V CÍLI`}
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
              <div className="bg-slate-900 p-3 rounded-xl border border-white/10">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Pořadí
                </div>
                <div className="font-display text-2xl font-bold text-amber-400 font-mono-tabular mt-0.5">
                  {summary.position}/{summary.totalCars}
                </div>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-white/10">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Nejlepší kolo
                </div>
                <div className="font-display text-lg font-bold text-cyan-400 font-mono-tabular mt-1">
                  {formatRaceTime(summary.bestLapMs)}
                </div>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-white/10">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Max rychlost
                </div>
                <div className="font-display text-lg font-bold text-white font-mono-tabular mt-1">
                  {Math.round(summary.maxSpeedKmh)} km/h
                </div>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-white/10">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Drift body
                </div>
                <div className="font-display text-lg font-bold text-emerald-400 font-mono-tabular mt-1">
                  {Math.round(summary.driftScore)}
                </div>
              </div>
            </div>

            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Konečné pořadí jezdců
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {summary.standings.map((row, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                      row.isPlayer
                        ? 'bg-amber-500/20 border border-amber-400/50 text-white font-bold'
                        : 'bg-slate-900 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono-tabular text-amber-400 w-5">
                        #{idx + 1}
                      </span>
                      <span>{row.name}</span>
                    </div>
                    <span className="font-mono-tabular text-slate-400">
                      Kolo {row.lap} · {Math.round(row.speedKmh)} km/h
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={onRestartRace}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-base tracking-wide cursor-pointer"
              >
                JET ZNOVU [ENTER]
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm cursor-pointer"
              >
                Změnit trať / vůz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
