import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type {
  HallOfFameDriverDoc,
  HallOfFameLapDoc,
} from '../firebase';
import {
  AI_STRATEGY_PROFILES,
  BotDifficulty,
  CAR_SPECS,
  TimeOfDay,
  TIRE_COMPOUNDS,
  TireCompound,
  TuningConfig,
  WeatherType,
} from '../game/physics';
import {
  getTrackSamples,
  resolveTrackDefinition,
  TRACK_DEFINITIONS,
} from '../game/track';

export type GamePhase = 'title' | 'playing' | 'pitstop' | 'paused' | 'gameover';
export type CameraMode = 'chase' | 'close' | 'hood' | 'heli';

export interface MultiplayerPlayerDTO {
  id: string;
  name: string;
  carSpecId: string;
  colorHex: number;
  tireCompound?: TireCompound;
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

export interface LobbyChatMessageDTO {
  id: string;
  senderName: string;
  senderColorHex: number;
  text: string;
  timestamp: number;
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
  chatMessages?: LobbyChatMessageDTO[];
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
  tireCompound?: TireCompound;
  tireHealth?: number;
  inPitBox?: boolean;
  inPitLaneAlley?: boolean;
  pitStopsCompleted?: number;
  aiStrategyName?: string;
  finished?: boolean;
  finishTimeMs?: number | null;
}

export interface HudLiveRefs {
  speedText: React.RefObject<HTMLSpanElement | null>;
  gearText: React.RefObject<HTMLSpanElement | null>;
  rpmText: React.RefObject<HTMLSpanElement | null>;
  rpmBar: React.RefObject<SVGCircleElement | null>;
  shiftLedStrip: Array<React.RefObject<HTMLSpanElement | null>>;
  nitroBar: React.RefObject<HTMLDivElement | null>;
  lapTimeText: React.RefObject<HTMLSpanElement | null>;
  bestLapText: React.RefObject<HTMLSpanElement | null>;
  driftChainText: React.RefObject<HTMLSpanElement | null>;
  driftTotalText: React.RefObject<HTMLSpanElement | null>;
  surfaceBadge: React.RefObject<HTMLSpanElement | null>;
  gDot: React.RefObject<SVGCircleElement | null>;
  frontLoadText: React.RefObject<HTMLSpanElement | null>;
  fpsText: React.RefObject<HTMLSpanElement | null>;
  tirePctText: React.RefObject<HTMLSpanElement | null>;
  tireTempText: React.RefObject<HTMLSpanElement | null>;
  tireBarFill: React.RefObject<HTMLDivElement | null>;
  tireWheelBoxes: Array<React.RefObject<HTMLDivElement | null>>;
  pitZoneBanner: React.RefObject<HTMLButtonElement | null>;
  pitStatusBanner: React.RefObject<HTMLDivElement | null>;
  pitStatusText: React.RefObject<HTMLSpanElement | null>;
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
  pitStopsCompleted: number;
  carName: string;
  trackName: string;
  standings: Array<{
    name: string;
    isPlayer: boolean;
    speedKmh: number;
    lap: number;
    tireCompound?: TireCompound;
    pitStopsCompleted?: number;
    aiStrategyName?: string;
    finished?: boolean;
    finishTimeMs?: number | null;
  }>;
}

interface GameHudProps {
  phase: GamePhase;
  selectedTrackId: string;
  onSelectTrack: (trackId: string) => void;
  onGenerateRandomTrack: () => void;
  selectedCarIdx: number;
  onSelectCar: (idx: number) => void;
  selectedCompound: TireCompound;
  onSelectCompound: (compound: TireCompound) => void;
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
  onEnterPitStop: () => void;
  onForceOpenPitStop?: () => void;
  onCompletePitStop: (newCompound: TireCompound, nitroBonus: number) => void;
  onFastenWheelSound?: (quality: 'perfect' | 'good' | 'slow') => void;
  onJackReleaseSound?: () => void;
  onTouchControl: (
    control: 'left' | 'right' | 'throttle' | 'brake' | 'handbrake' | 'nitro',
    active: boolean
  ) => void;
  liveRefs: HudLiveRefs;

  // Online Multiplayer Props
  playerName: string;
  onChangePlayerName: (name: string) => void;
  localPlayerId: string;
  activeRoom: LobbyRoomDTO | null;
  publicLobbies: PublicLobbySummary[];
  lobbyError: string | null;
  onCreateLobby: (customCode?: string) => void;
  onJoinLobby: (code: string) => void;
  onQuickMatchLobby?: () => void;
  onLeaveLobby: () => void;
  onRefreshLobbies: () => void;
  onSendLobbyChat?: (text: string) => void;

  // Google Auth & Hall of Fame Props
  authUser: User | null;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  hallOfFameDrivers: HallOfFameDriverDoc[];
  hallOfFameLaps: HallOfFameLapDoc[];
}

export function formatRaceTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '--:--,---';
  const totalMs = Math.max(0, Math.round(ms));
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${mins}:${secs.toString().padStart(2, '0')},${millis
    .toString()
    .padStart(3, '0')}`;
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
  const pad = 16;
  const spanX = Math.max(1, maxX - minX + pad * 2);
  const spanZ = Math.max(1, maxZ - minZ + pad * 2);
  const scale = 126 / Math.max(spanX, spanZ);

  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  const toMap = (wx: number, wz: number) => ({
    mx: 75 + (wx - cx) * scale,
    mz: 75 - (wz - cz) * scale,
  });

  const pts = samples.map((s) => {
    const { mx, mz } = toMap(s.x, s.z);
    return `${mx.toFixed(1)},${mz.toFixed(1)}`;
  });

  // Sector 1, 2, 3 split points on the minimap
  const s1Pt = toMap(samples[0].x, samples[0].z);
  const s2Sample = samples[Math.floor(samples.length * 0.33)] || samples[0];
  const s3Sample = samples[Math.floor(samples.length * 0.66)] || samples[0];
  const s2Pt = toMap(s2Sample.x, s2Sample.z);
  const s3Pt = toMap(s3Sample.x, s3Sample.z);

  // Sector sub-paths for colored F1 minimap segments
  const cut1 = Math.floor(samples.length * 0.33);
  const cut2 = Math.floor(samples.length * 0.66);
  const s1Path = `M ${pts.slice(0, cut1 + 1).join(' L ')}`;
  const s2Path = `M ${pts.slice(cut1, cut2 + 1).join(' L ')}`;
  const s3Path = `M ${pts.slice(cut2).concat([pts[0]]).join(' L ')}`;

  return {
    pathD: `M ${pts.join(' L ')} Z`,
    s1Path,
    s2Path,
    s3Path,
    startPt: s1Pt,
    s2Pt,
    s3Pt,
    toMap,
  };
}

const WHEEL_NAMES = [
  'Přední levé (PL)',
  'Přední pravé (PP)',
  'Zadní levé (ZL)',
  'Zadní pravé (ZP)',
];

const ALL_COMPOUNDS: TireCompound[] = ['soft', 'medium', 'hard', 'wet'];

/** Official F1 Speed-Mark Vector Logo */
const F1BroadcastLogo: React.FC<{ className?: string }> = ({
  className = 'w-14 h-5',
}) => (
  <svg viewBox="0 0 120 32" className={className} aria-hidden="true">
    {/* Stylized F1 Speed Wings */}
    <path
      d="M4 28 L24 6 L74 6 L64 14 L29 14 L16 28 Z"
      fill="#ffffff"
    />
    <path
      d="M24 28 L34 17 L61 17 L53 25 L34 25 L31 28 Z"
      fill="#ffffff"
    />
    <path
      d="M66 28 L86 6 L102 6 L82 28 Z"
      fill="#e10600"
    />
  </svg>
);

export const GameHud: React.FC<GameHudProps> = ({
  phase,
  selectedTrackId,
  onSelectTrack,
  onGenerateRandomTrack,
  selectedCarIdx,
  onSelectCar,
  selectedCompound,
  onSelectCompound,
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
  onEnterPitStop,
  onForceOpenPitStop,
  onCompletePitStop,
  onFastenWheelSound,
  onJackReleaseSound,
  onTouchControl,
  liveRefs,
  playerName,
  onChangePlayerName,
  localPlayerId,
  activeRoom,
  publicLobbies,
  lobbyError,
  onCreateLobby,
  onJoinLobby,
  onQuickMatchLobby,
  onLeaveLobby,
  onRefreshLobbies,
  onSendLobbyChat,
  authUser,
  onSignInGoogle,
  onSignOutGoogle,
  hallOfFameDrivers,
  hallOfFameLaps,
}) => {
  const [titleTab, setTitleTab] = useState<
    'single' | 'multiplayer' | 'hallOfFame'
  >('single');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [customCreateCode, setCustomCreateCode] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');
  const [copiedInvite, setCopiedInvite] = useState<boolean>(false);

  // Pit Stop Minigame State
  const [pitCompoundChoice, setPitCompoundChoice] =
    useState<TireCompound>(selectedCompound);
  const [pitWheelIndex, setPitWheelIndex] = useState<number>(0);
  const [pitWheelResults, setPitWheelResults] = useState<
    Array<'perfect' | 'good' | 'slow'>
  >([]);
  const [pitNeedlePos, setPitNeedlePos] = useState<number>(50);
  const [pitTotalSeconds, setPitTotalSeconds] = useState<number>(0);
  const [pitLastFeedback, setPitLastFeedback] = useState<string>(
    'Zastav ručičku v zelené zóně pro bleskové utažení matice!'
  );
  const pitAnimRef = useRef<number>(0);
  const pitNeedleValRef = useRef<number>(15);
  const pitNeedleDirRef = useRef<number>(1);

  useEffect(() => {
    if (phase === 'pitstop') {
      const defaultChoice =
        weather === 'rain' || weather === 'snow' ? 'wet' : selectedCompound;
      setPitCompoundChoice(defaultChoice);
      setPitWheelIndex(0);
      setPitWheelResults([]);
      setPitTotalSeconds(0);
      setPitLastFeedback(
        'Zvol směs pneu (S/M/H/W) a utáhni všechny 4 matice kol!'
      );
      pitNeedleValRef.current = 12;
      pitNeedleDirRef.current = 1;

      let lastT = performance.now();
      const stepNeedle = (now: number) => {
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        let next =
          pitNeedleValRef.current + pitNeedleDirRef.current * 135 * dt;
        if (next >= 96) {
          next = 96;
          pitNeedleDirRef.current = -1;
        } else if (next <= 4) {
          next = 4;
          pitNeedleDirRef.current = 1;
        }
        pitNeedleValRef.current = next;
        setPitNeedlePos(next);
        pitAnimRef.current = requestAnimationFrame(stepNeedle);
      };
      pitAnimRef.current = requestAnimationFrame(stepNeedle);
      return () => cancelAnimationFrame(pitAnimRef.current);
    }
  }, [phase, selectedCompound, weather]);

  const handleFastenWheel = () => {
    if (phase !== 'pitstop' || pitWheelIndex >= 4) return;
    const pos = pitNeedleValRef.current;
    let result: 'perfect' | 'good' | 'slow' = 'slow';
    let wheelTime = 1.25;
    if (pos >= 38 && pos <= 66) {
      result = 'perfect';
      wheelTime = 0.46;
      setPitLastFeedback(
        `PERFEKTNÍ! ${WHEEL_NAMES[pitWheelIndex]} utaženo za 0.46 s (+ERS Boost)`
      );
    } else if (pos >= 24 && pos <= 80) {
      result = 'good';
      wheelTime = 0.76;
      setPitLastFeedback(`DOBRÉ! ${WHEEL_NAMES[pitWheelIndex]} utaženo za 0.76 s`);
    } else {
      result = 'slow';
      wheelTime = 1.32;
      setPitLastFeedback(
        `ZASEKNUTÁ MATICE! ${WHEEL_NAMES[pitWheelIndex]} trvalo 1.32 s`
      );
    }

    onFastenWheelSound?.(result);

    const nextResults = [...pitWheelResults, result];
    const nextTime = Number((pitTotalSeconds + wheelTime).toFixed(2));
    setPitWheelResults(nextResults);
    setPitTotalSeconds(nextTime);

    const nextIdx = pitWheelIndex + 1;
    setPitWheelIndex(nextIdx);

    if (nextIdx >= 4) {
      onJackReleaseSound?.();
      const perfectCount = nextResults.filter((r) => r === 'perfect').length;
      const nitroBonus = 32 + perfectCount * 17;
      window.setTimeout(() => {
        onCompletePitStop(pitCompoundChoice, nitroBonus);
      }, 420);
    }
  };

  useEffect(() => {
    if (phase !== 'pitstop') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleFastenWheel();
      } else if (e.code === 'Digit1') {
        setPitCompoundChoice('soft');
      } else if (e.code === 'Digit2') {
        setPitCompoundChoice('medium');
      } else if (e.code === 'Digit3') {
        setPitCompoundChoice('hard');
      } else if (e.code === 'Digit4') {
        setPitCompoundChoice('wet');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const minimap = useMemo(
    () => computeMinimapData(selectedTrackId),
    [selectedTrackId]
  );

  const selectedTrack = useMemo(
    () => resolveTrackDefinition(selectedTrackId),
    [selectedTrackId]
  );
  const selectedCar = CAR_SPECS[selectedCarIdx] ?? CAR_SPECS[0];
  const currentCompoundInfo =
    TIRE_COMPOUNDS[selectedCompound] || TIRE_COMPOUNDS.soft;

  const cameraLabel =
    cameraMode === 'chase'
      ? 'Za vozem'
      : cameraMode === 'close'
      ? 'TV Pod'
      : cameraMode === 'hood'
      ? 'Kokpit Halo'
      : 'Heli';

  const isHost = activeRoom ? activeRoom.hostId === localPlayerId : true;

  const handleSubmitChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendLobbyChat?.(chatInput.trim());
    setChatInput('');
  };

  // Group fastest laps by trackId for Hall of Fame
  const fastestLapByTrack = useMemo(() => {
    const map = new Map<string, HallOfFameLapDoc>();
    for (const rec of hallOfFameLaps) {
      const existing = map.get(rec.trackId);
      if (!existing || rec.lapTimeMs < existing.lapTimeMs) {
        map.set(rec.trackId, rec);
      }
    }
    return map;
  }, [hallOfFameLaps]);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between select-none overflow-hidden">
      {/* ==================== SLEEK F1 25 PADDOCK HUB (TITLE SCREEN) ==================== */}
      {phase === 'title' && (
        <div className="pointer-events-auto relative flex-1 flex flex-col justify-between p-2 sm:p-4 md:p-5 overflow-y-auto">
          {/* Top Official F1 Broadcast Header Bar */}
          <div
            className="w-full max-w-[920px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#e10600] shadow-2xl"
            style={{
              backgroundColor: 'rgba(10, 12, 16, 0.94)',
              clipPath:
                'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
            }}
          >
            {/* Brand Zone */}
            <div className="flex items-center gap-3">
              <F1BroadcastLogo className="w-14 h-5 shrink-0" />
              <div className="h-5 w-0.5 bg-white/20" />
              <div>
                <div className="text-[9px] font-bold tracking-[0.24em] uppercase text-[#e10600] leading-none">
                  OFFICIAL RACING SIMULATOR
                </div>
                <h1 className="font-display text-base sm:text-lg font-bold tracking-wider uppercase text-white leading-tight">
                  APEX FORMULA 25
                </h1>
              </div>
            </div>

            {/* Center Sleek Broadcast Navigation Tabs */}
            <div className="flex items-center gap-1 bg-black/60 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setTitleTab('single')}
                className={`px-3.5 py-1.5 text-[11px] font-display font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap ${
                  titleTab === 'single'
                    ? 'bg-[#e10600] text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Grand Prix
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitleTab('multiplayer');
                  onRefreshLobbies();
                }}
                className={`px-3.5 py-1.5 text-[11px] font-display font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  titleTab === 'multiplayer'
                    ? 'bg-[#e10600] text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span>Online</span>
                {activeRoom && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTitleTab('hallOfFame')}
                className={`px-3.5 py-1.5 text-[11px] font-display font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap ${
                  titleTab === 'hallOfFame'
                    ? 'bg-[#e10600] text-white shadow'
                    : 'text-amber-300 hover:text-white'
                }`}
              >
                🏆 Síň slávy
              </button>
            </div>

            {/* Right Zone: Google Driver Superlicense */}
            <div className="flex items-center gap-2">
              {authUser ? (
                <div className="flex items-center gap-2 bg-white/5 border border-emerald-400/40 px-2.5 py-1">
                  {authUser.photoURL ? (
                    <img
                      src={authUser.photoURL}
                      alt=""
                      className="w-4 h-4 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                  <span className="text-[11px] font-bold text-white max-w-[110px] truncate">
                    {authUser.displayName || playerName}
                  </span>
                  <button
                    type="button"
                    onClick={onSignOutGoogle}
                    className="text-[10px] text-slate-400 hover:text-rose-400 font-bold ml-1 cursor-pointer"
                    title="Odhlásit účet Google"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onSignInGoogle}
                  className="px-3 py-1.5 bg-white hover:bg-slate-200 text-slate-950 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow cursor-pointer transition whitespace-nowrap"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"
                    />
                  </svg>
                  <span>Přihlásit Googlem</span>
                </button>
              )}
            </div>
          </div>

          {/* Center Sleek F1 Paddock Content Panel */}
          <div
            className="w-full max-w-[920px] mx-auto my-auto p-3.5 sm:p-5 border border-white/15 shadow-2xl"
            style={{
              backgroundColor: 'rgba(10, 12, 16, 0.90)',
              borderLeft: '4px solid #e10600',
            }}
          >
            {titleTab === 'single' ? (
              <div className="space-y-3">
                {/* Row 1: Circuit Selector + Procedural Generator + Track Environment */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-8">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1.5">
                      <span>01. OKRUH FIA GRAND PRIX</span>
                      <button
                        type="button"
                        onClick={onGenerateRandomTrack}
                        disabled={Boolean(activeRoom && !isHost)}
                        className="px-2.5 py-0.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-[10px] uppercase tracking-wider transition cursor-pointer"
                      >
                        🎲 Generovat novou trať
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {TRACK_DEFINITIONS.map((trk) => {
                        const active = trk.id === selectedTrackId;
                        const bestRec = fastestLapByTrack.get(trk.id);
                        return (
                          <button
                            key={trk.id}
                            type="button"
                            disabled={Boolean(activeRoom && !isHost)}
                            onClick={() => onSelectTrack(trk.id)}
                            className={`text-left p-2.5 border transition cursor-pointer relative overflow-hidden ${
                              active
                                ? 'bg-white/12 border-[#e10600] text-white'
                                : 'bg-black/60 border-white/10 text-slate-300 hover:border-white/30'
                            }`}
                          >
                            {active && (
                              <span className="absolute top-0 left-0 right-0 h-0.5 bg-[#e10600]" />
                            )}
                            <div className="font-display font-bold text-xs uppercase tracking-wide truncate">
                              {trk.name}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono-tabular">
                              <span>
                                Grip {Math.round(trk.gripFactor * 100)}%
                              </span>
                              <span className="text-emerald-400 font-bold">
                                {bestRec
                                  ? formatRaceTime(bestRec.lapTimeMs)
                                  : 'F1'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Environment Conditions (Time of Day & Weather) */}
                  <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-2">
                    <div className="bg-black/60 p-2 border border-white/10">
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1">
                        DENNÍ DOBA
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
                            className={`py-1 text-[10px] font-bold uppercase transition cursor-pointer ${
                              timeOfDay === id
                                ? 'bg-white text-slate-950'
                                : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-black/60 p-2 border border-white/10">
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1">
                        POČASÍ NA TRATI
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
                            className={`py-1 text-[10px] font-bold uppercase transition cursor-pointer ${
                              weather === id
                                ? 'bg-cyan-400 text-slate-950'
                                : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 2: Formula 1 Team Selection (6 Constructors) */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1.5">
                    <span>02. TOVÁRNÍ MONOPOST F1 (6 TÝMŮ)</span>
                    <span className="text-white font-mono-tabular">
                      {selectedCar.name} ·{' '}
                      <strong className="text-[#e10600]">
                        {Math.round(selectedCar.topSpeedMs * 3.6)} km/h
                      </strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
                    {CAR_SPECS.map((car, idx) => {
                      const active = idx === selectedCarIdx;
                      const teamHex = `#${car.colorHex
                        .toString(16)
                        .padStart(6, '0')}`;
                      return (
                        <button
                          key={car.id}
                          type="button"
                          onClick={() => onSelectCar(idx)}
                          className={`text-left p-2.5 border transition cursor-pointer relative ${
                            active
                              ? 'bg-white/12 border-white text-white'
                              : 'bg-black/60 border-white/10 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-1 h-3.5 shrink-0"
                              style={{ backgroundColor: teamHex }}
                            />
                            <span className="font-display font-bold text-xs uppercase truncate">
                              {car.name.split(' ')[0]} {car.name.split(' ')[1]}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1 font-mono-tabular">
                            {Math.round(car.topSpeedMs * 3.6)} km/h · Aero{' '}
                            {car.stats.handling}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Row 3: Pirelli Starting Tire Compound (S / M / H / W) + Race Format Strip */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
                  <div className="lg:col-span-8 bg-black/60 p-2.5 border border-white/10">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1.5">
                      <span>03. STARTOVNÍ SMĚS PNEUMATIK PIRELLI</span>
                      <span
                        style={{ color: currentCompoundInfo.cssColor }}
                        className="font-mono-tabular font-bold"
                      >
                        {currentCompoundInfo.name}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {ALL_COMPOUNDS.map((cid) => {
                        const info = TIRE_COMPOUNDS[cid];
                        const active = selectedCompound === cid;
                        return (
                          <button
                            key={cid}
                            type="button"
                            onClick={() => onSelectCompound(cid)}
                            className={`p-2 border text-left transition cursor-pointer ${
                              active
                                ? 'bg-white/15 border-white text-white'
                                : 'bg-black/80 border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white"
                                  style={{ borderColor: info.cssColor }}
                                >
                                  {info.shortCode}
                                </span>
                                <span className="font-display font-bold text-xs uppercase">
                                  {cid === 'soft'
                                    ? 'Měkká'
                                    : cid === 'medium'
                                    ? 'Střední'
                                    : cid === 'hard'
                                    ? 'Tvrdá'
                                    : 'Mokrá'}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono-tabular text-slate-400">
                                {info.durabilityRating}%
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-400 mt-1 truncate">
                              {cid === 'hard'
                                ? 'Nejdelší výdrž (-6% rychl.)'
                                : cid === 'soft'
                                ? '+10% grip, rychlé opotřebení'
                                : cid === 'wet'
                                ? 'Do deště (+28% grip v mokru)'
                                : 'Vyvážená rychlost a výdrž'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Race Parameters (AI Count, AI Difficulty, Laps, Camera) */}
                  <div className="lg:col-span-4 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeBotCount(
                          botCount === 0
                            ? 3
                            : botCount === 3
                            ? 5
                            : botCount === 5
                            ? 7
                            : 0
                        )
                      }
                      className="p-2 bg-black/70 hover:bg-white/10 border border-white/15 text-left cursor-pointer"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">
                        SOUPEŘI NA ROŠTU
                      </div>
                      <div className="font-display font-bold text-xs text-white mt-0.5 font-mono-tabular">
                        Soupeři: {botCount} AI
                      </div>
                    </button>
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
                      className="p-2 bg-black/70 hover:bg-white/10 border border-white/15 text-left cursor-pointer"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">
                        OBTÍŽNOST AI
                      </div>
                      <div className="font-display font-bold text-xs text-amber-400 mt-0.5">
                        AI:{' '}
                        {botDifficulty === 'easy'
                          ? 'Lehká'
                          : botDifficulty === 'medium'
                          ? 'Střední'
                          : 'Expert'}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeTotalLaps(
                          totalLaps === 3 ? 5 : totalLaps === 5 ? 8 : 3
                        )
                      }
                      className="p-2 bg-black/70 hover:bg-white/10 border border-white/15 text-left cursor-pointer"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">
                        DÉLKA ZÁVODU
                      </div>
                      <div className="font-display font-bold text-xs text-white mt-0.5 font-mono-tabular">
                        Délka: {totalLaps} kol
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={onCycleCamera}
                      className="p-2 bg-black/70 hover:bg-white/10 border border-white/15 text-left cursor-pointer"
                    >
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">
                        POHLED KAMERY
                      </div>
                      <div className="font-display font-bold text-xs text-cyan-400 mt-0.5 truncate">
                        Kam: {cameraLabel}
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            ) : titleTab === 'multiplayer' ? (
              /* ==================== ONLINE MULTIPLAYER PADDOCK (REAL PLAYERS + AI BOT FILL + REAL-TIME TIRE SYNC) ==================== */
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-7 flex items-center gap-2 bg-black/70 px-3 py-2 border border-white/15">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                      Jméno pilota:
                    </span>
                    <input
                      id="player-name-input"
                      type="text"
                      maxLength={16}
                      value={playerName}
                      onChange={(e) => onChangePlayerName(e.target.value)}
                      placeholder="Zadej přezdívku..."
                      className="flex-1 bg-transparent text-xs sm:text-sm font-bold text-white focus:outline-none font-mono-tabular"
                    />
                    <span
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ borderColor: currentCompoundInfo.cssColor }}
                    >
                      {currentCompoundInfo.shortCode}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onQuickMatchLobby) {
                        onQuickMatchLobby();
                      } else {
                        onCreateLobby('GPF1');
                      }
                    }}
                    className="sm:col-span-5 py-2 px-3 bg-[#e10600] hover:bg-red-500 text-white font-display text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>⚡ Rychlý Online Zápas</span>
                  </button>
                </div>

                {lobbyError && (
                  <div className="p-2 bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200">
                    {lobbyError}
                  </div>
                )}

                {!activeRoom ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Create Custom Room */}
                      <div className="bg-black/60 p-3 border border-white/10 flex flex-col justify-between gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-display font-bold uppercase text-white">
                            Založit vlastní Grand Prix Lobby
                          </span>
                          <span className="text-[10px] text-[#e10600] font-mono-tabular font-bold">
                            HOST
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            maxLength={6}
                            value={customCreateCode}
                            onChange={(e) =>
                              setCustomCreateCode(e.target.value.toUpperCase())
                            }
                            placeholder="Vlastní kód (např. F1CZ)"
                            className="w-full px-2.5 py-1.5 bg-black border border-white/15 text-xs font-mono-tabular text-white uppercase"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onCreateLobby(customCreateCode || undefined)
                            }
                            className="px-3.5 py-1.5 bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs uppercase shrink-0 cursor-pointer"
                          >
                            + Vytvořit
                          </button>
                        </div>
                      </div>

                      {/* Join by Room ID */}
                      <div className="bg-black/60 p-3 border border-white/10 flex flex-col justify-between gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-display font-bold uppercase text-white">
                            Připojit se podle kódu místnosti
                          </span>
                          <span className="text-[10px] text-cyan-400 font-mono-tabular font-bold">
                            ID MÍSTNOSTI
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            maxLength={6}
                            value={joinCodeInput}
                            onChange={(e) =>
                              setJoinCodeInput(e.target.value.toUpperCase())
                            }
                            placeholder="ZADEJ KÓD (NAPŘ. 1234)"
                            className="w-full px-2.5 py-1.5 bg-black border border-white/15 text-xs font-mono-tabular text-white uppercase"
                          />
                          <button
                            type="button"
                            onClick={() => onJoinLobby(joinCodeInput)}
                            className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs uppercase shrink-0 cursor-pointer"
                          >
                            Připojit
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Public Rooms Server Browser */}
                    <div className="bg-black/60 p-3 border border-white/10">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Veřejné Serverové Lobby ({publicLobbies.length} aktivních)
                        </span>
                        <button
                          type="button"
                          onClick={onRefreshLobbies}
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
                        >
                          ↻ Obnovit servery
                        </button>
                      </div>
                      {publicLobbies.length === 0 ? (
                        <div className="text-xs text-slate-400 py-2 text-center">
                          Žádná otevřená lobby. Klikni na{' '}
                          <span className="text-white font-bold">
                            ⚡ Rychlý Online Zápas
                          </span>{' '}
                          nebo vytvoř vlastní místnost!
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-28 overflow-y-auto">
                          {publicLobbies.map((lob) => (
                            <div
                              key={lob.roomId}
                              className="flex items-center justify-between px-3 py-1.5 bg-black/80 border border-white/10"
                            >
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 bg-[#e10600] font-mono-tabular font-bold text-xs text-white">
                                  #{lob.roomId}
                                </span>
                                <span className="text-xs text-white font-semibold">
                                  {lob.hostName}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  · {lob.playerCount} hráčů + {lob.botCount} AI ·{' '}
                                  {lob.totalLaps} kol
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => onJoinLobby(lob.roomId)}
                                className="px-2.5 py-1 bg-white hover:bg-slate-200 text-slate-950 text-xs font-bold uppercase cursor-pointer"
                              >
                                Vstoupit
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Active Online Lobby Room */
                  <div className="bg-black/75 p-3 border border-white/20 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 bg-[#e10600] font-display text-sm font-bold text-white font-mono-tabular">
                          LOBBY #{activeRoom.roomId}
                        </span>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                            REÁLNÍ HRÁČI + AI ROŠT (LIVE SYNC)
                          </div>
                          <div className="text-[11px] text-slate-300">
                            Okruh:{' '}
                            <strong className="text-white">
                              {selectedTrack.name}
                            </strong>{' '}
                            · {totalLaps} kol · Obtížnost AI:{' '}
                            <strong className="text-amber-400">
                              {botDifficulty === 'easy'
                                ? 'Lehká'
                                : botDifficulty === 'medium'
                                ? 'Střední'
                                : 'Expert'}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}${window.location.pathname}?room=${activeRoom.roomId}`;
                            navigator.clipboard?.writeText(url);
                            setCopiedInvite(true);
                            window.setTimeout(
                              () => setCopiedInvite(false),
                              2000
                            );
                          }}
                          className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white cursor-pointer"
                        >
                          {copiedInvite
                            ? '✓ Odkaz zkopírován!'
                            : '🔗 Pozvat hráče'}
                        </button>
                        <button
                          type="button"
                          onClick={onLeaveLobby}
                          className="px-2.5 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-[11px] font-bold cursor-pointer"
                        >
                          Opustit
                        </button>
                      </div>
                    </div>

                    {/* Per-Player Real-Time Tire Compound & Car Setup + Host AI Bot Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-7 bg-black/80 p-2.5 border border-white/10">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          <span>
                            Moje startovní pneu & vůz (propisuje se real-time):
                          </span>
                          <span
                            style={{ color: currentCompoundInfo.cssColor }}
                            className="font-mono-tabular"
                          >
                            {currentCompoundInfo.name}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1 mb-1.5">
                          {ALL_COMPOUNDS.map((cid) => {
                            const info = TIRE_COMPOUNDS[cid];
                            const active = selectedCompound === cid;
                            return (
                              <button
                                key={cid}
                                type="button"
                                onClick={() => onSelectCompound(cid)}
                                className={`py-1 px-1.5 border text-left flex items-center gap-1 transition cursor-pointer ${
                                  active
                                    ? 'bg-white/15 border-white text-white'
                                    : 'bg-black border-white/10 text-slate-400 hover:text-white'
                                }`}
                              >
                                <span
                                  className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                                  style={{ borderColor: info.cssColor }}
                                >
                                  {info.shortCode}
                                </span>
                                <span className="text-[10px] font-bold truncate">
                                  {cid === 'soft'
                                    ? 'Měkká'
                                    : cid === 'medium'
                                    ? 'Střed'
                                    : cid === 'hard'
                                    ? 'Tvrdá'
                                    : 'Mokrá'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-6 gap-1">
                          {CAR_SPECS.map((car, idx) => {
                            const active = idx === selectedCarIdx;
                            return (
                              <button
                                key={car.id}
                                type="button"
                                onClick={() => onSelectCar(idx)}
                                className={`py-1 px-1 border text-[9px] font-bold truncate flex items-center justify-center gap-1 cursor-pointer ${
                                  active
                                    ? 'bg-white/15 border-white text-white'
                                    : 'bg-black border-white/10 text-slate-400 hover:text-white'
                                }`}
                                title={car.name}
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: `#${car.colorHex
                                      .toString(16)
                                      .padStart(6, '0')}`,
                                  }}
                                />
                                <span className="truncate">
                                  {car.name.split(' ')[0]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Host AI Bot Count & Difficulty */}
                      <div className="sm:col-span-5 bg-black/80 p-2.5 border border-white/10 flex flex-col justify-between gap-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-400">
                          <span>Doplnění roštu AI boty</span>
                          <span className="text-[9px] text-slate-400">
                            {isHost ? 'HOST NASTAVENÍ' : 'NASTAVUJE HOST'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            disabled={!isHost}
                            onClick={() =>
                              onChangeBotCount(
                                botCount >= 7 ? 0 : botCount + 1
                              )
                            }
                            className="py-1.5 px-2 bg-white/5 hover:bg-white/10 disabled:opacity-60 border border-white/10 text-[11px] font-bold text-amber-300 cursor-pointer"
                          >
                            🤖 Botů: {botCount} AI
                          </button>
                          <button
                            type="button"
                            disabled={!isHost}
                            onClick={() =>
                              onChangeBotDifficulty(
                                botDifficulty === 'easy'
                                  ? 'medium'
                                  : botDifficulty === 'medium'
                                  ? 'hard'
                                  : 'easy'
                              )
                            }
                            className="py-1.5 px-2 bg-white/5 hover:bg-white/10 disabled:opacity-60 border border-white/10 text-[11px] font-bold text-cyan-300 cursor-pointer"
                          >
                            Obtížnost:{' '}
                            {botDifficulty === 'easy'
                              ? 'Lehká'
                              : botDifficulty === 'medium'
                              ? 'Střední'
                              : 'Expert'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            disabled={!isHost}
                            onClick={() => {
                              const idx = TRACK_DEFINITIONS.findIndex(
                                (t) => t.id === selectedTrackId
                              );
                              const next =
                                TRACK_DEFINITIONS[
                                  (idx + 1) % TRACK_DEFINITIONS.length
                                ];
                              onSelectTrack(next.id);
                            }}
                            className="py-1 px-2 bg-white/5 hover:bg-white/10 disabled:opacity-60 border border-white/10 text-[10px] font-bold text-white truncate cursor-pointer"
                          >
                            Trať: {selectedTrack.name.split(' ')[0]}
                          </button>
                          <button
                            type="button"
                            disabled={!isHost}
                            onClick={() =>
                              onChangeTotalLaps(
                                totalLaps === 3 ? 5 : totalLaps === 5 ? 8 : 3
                              )
                            }
                            className="py-1 px-2 bg-white/5 hover:bg-white/10 disabled:opacity-60 border border-white/10 text-[10px] font-bold text-slate-200 cursor-pointer"
                          >
                            Délka: {totalLaps} kol
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Starting Grid Cards + Team Radio Chat */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-7 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                          <span>
                            Reální hráči ({activeRoom.players.length}) +
                            Doplnění ({botCount} AI)
                          </span>
                          <span className="text-cyan-300">Startovní Pneu</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto pr-0.5">
                          {activeRoom.players.map((p, idx) => {
                            const pComp =
                              TIRE_COMPOUNDS[p.tireCompound || 'soft'] ||
                              TIRE_COMPOUNDS.soft;
                            const carSpec =
                              CAR_SPECS.find((c) => c.id === p.carSpecId) ||
                              CAR_SPECS[0];
                            return (
                              <div
                                key={p.id}
                                className="flex items-center justify-between px-2.5 py-1 bg-black/90 border border-emerald-400/30"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="font-mono-tabular text-[10px] font-bold text-emerald-400 w-4">
                                    P{idx + 1}
                                  </span>
                                  <span
                                    className="w-1 h-3.5 shrink-0"
                                    style={{
                                      backgroundColor: `#${p.colorHex
                                        .toString(16)
                                        .padStart(6, '0')}`,
                                    }}
                                  />
                                  <div className="truncate">
                                    <span className="text-xs font-bold text-white mr-1.5">
                                      {p.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {carSpec.name.split(' ')[0]}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span
                                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold text-white"
                                    style={{ borderColor: pComp.cssColor }}
                                    title={pComp.name}
                                  >
                                    {pComp.shortCode}
                                  </span>
                                  <span className="text-[9px] uppercase px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold">
                                    {p.isHost ? 'HOST (HRÁČ)' : 'HRÁČ'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}

                          {Array.from({ length: botCount }).map((_, bIdx) => {
                            const aiProf =
                              AI_STRATEGY_PROFILES[
                                bIdx % AI_STRATEGY_PROFILES.length
                              ];
                            const aiComp =
                              TIRE_COMPOUNDS[
                                weather === 'rain' || weather === 'snow'
                                  ? 'wet'
                                  : aiProf.startingCompound
                              ];
                            return (
                              <div
                                key={`ai-slot-${bIdx}`}
                                className="flex items-center justify-between px-2.5 py-1 bg-black/50 border border-white/5 text-slate-400"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="font-mono-tabular text-[10px] font-bold text-slate-500 w-4">
                                    P{activeRoom.players.length + bIdx + 1}
                                  </span>
                                  <span className="text-[11px] text-slate-300 font-semibold truncate">
                                    🤖 AI Bot #{bIdx + 1}
                                  </span>
                                  <span className="text-[9px] text-amber-400/90 truncate">
                                    ({aiProf.name})
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span
                                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold text-white"
                                    style={{ borderColor: aiComp.cssColor }}
                                  >
                                    {aiComp.shortCode}
                                  </span>
                                  <span className="text-[9px] uppercase px-1.5 py-0.5 bg-white/5 text-slate-400 font-bold">
                                    AI BOT
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Live Team Radio Chat */}
                      <div className="sm:col-span-5 bg-black/80 p-2 border border-white/10 flex flex-col justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                          📻 Team Radio Chat
                        </div>
                        <div className="space-y-1 max-h-20 overflow-y-auto text-[11px] mb-1.5 pr-1">
                          {(activeRoom.chatMessages &&
                          activeRoom.chatMessages.length > 0
                            ? activeRoom.chatMessages
                            : [
                                {
                                  id: 'welcome',
                                  senderName: 'FIA Rádio',
                                  senderColorHex: 0x38bdf8,
                                  text: 'Jezdci připraveni na startovním roštu.',
                                  timestamp: Date.now(),
                                },
                              ]
                          ).map((m) => (
                            <div key={m.id} className="leading-tight">
                              <span
                                className="font-bold mr-1"
                                style={{
                                  color: `#${(m.senderColorHex || 0x38bdf8)
                                    .toString(16)
                                    .padStart(6, '0')}`,
                                }}
                              >
                                {m.senderName}:
                              </span>
                              <span className="text-slate-200">{m.text}</span>
                            </div>
                          ))}
                        </div>
                        <form onSubmit={handleSubmitChat} className="flex gap-1">
                          <input
                            type="text"
                            maxLength={80}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Zpráva do vysílačky..."
                            className="flex-1 bg-black border border-white/15 px-2 py-1 text-[11px] text-white focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1 bg-[#e10600] hover:bg-red-500 text-white font-bold text-[10px] uppercase cursor-pointer"
                          >
                            Odeslat
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ==================== HALL OF FAME (SÍŇ SLÁVY FIA) ==================== */
              <div className="space-y-3">
                {!authUser ? (
                  <div className="p-3 bg-white/5 border-l-4 border-[#e10600] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold uppercase text-white">
                        Přihlas se přes Google pro zápis do Síně slávy FIA!
                      </div>
                      <div className="text-[11px] text-slate-300">
                        Tvé nejrychlejší časy na tratích a vyhrané Velké ceny se
                        automaticky uloží do cloudu.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onSignInGoogle}
                      className="px-3.5 py-1.5 bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs uppercase cursor-pointer shadow"
                    >
                      Přihlásit přes Google
                    </button>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-between text-xs">
                    <span className="text-emerald-300 font-semibold">
                      ✓ Přihlášen jako{' '}
                      <strong>{authUser.displayName || playerName}</strong> —
                      výsledky a rekordy tratí se ukládají automaticky!
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Fastest Laps per Circuit */}
                  <div className="bg-black/70 p-3 border border-white/10">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-2 flex items-center justify-between">
                      <span>⏱️ Nejrychlejší kola na tratích</span>
                      <span className="text-slate-400">Rekord okruhu</span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                      {TRACK_DEFINITIONS.map((trk) => {
                        const rec = fastestLapByTrack.get(trk.id);
                        const comp =
                          rec && TIRE_COMPOUNDS[rec.tireCompound as TireCompound]
                            ? TIRE_COMPOUNDS[rec.tireCompound as TireCompound]
                            : TIRE_COMPOUNDS.soft;
                        return (
                          <div
                            key={trk.id}
                            className="p-2 bg-black/90 border border-white/10 flex items-center justify-between gap-2"
                          >
                            <div className="truncate">
                              <div className="text-xs font-display font-bold uppercase text-white truncate">
                                {trk.name}
                              </div>
                              {rec ? (
                                <div className="text-[10px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                                  <span className="text-amber-300 font-semibold">
                                    {rec.displayName}
                                  </span>
                                  <span className="text-slate-500">·</span>
                                  <span className="text-slate-400 truncate">
                                    {rec.carName.split(' ')[0]}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  Zatím bez rekordu — zajeď čisté kolo!
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {rec && (
                                <span
                                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold text-white"
                                  style={{ borderColor: comp.cssColor }}
                                  title={comp.name}
                                >
                                  {comp.shortCode}
                                </span>
                              )}
                              <span className="font-mono-tabular font-bold text-xs text-purple-300">
                                {rec ? formatRaceTime(rec.lapTimeMs) : '--:--,---'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Most Races Won */}
                  <div className="bg-black/70 p-3 border border-white/10">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center justify-between">
                      <span>🏆 Síň slávy — Nejvíce vítězství</span>
                      <span className="text-slate-400">Výhry · Pódia</span>
                    </div>
                    {hallOfFameDrivers.length === 0 ? (
                      <div className="text-xs text-slate-400 py-8 text-center">
                        Zatím žádní zapsaní šampioni. Vyhraj závod s
                        přihlášeným účtem Google!
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                        {hallOfFameDrivers.slice(0, 10).map((drv, idx) => (
                          <div
                            key={drv.uid || drv.userId}
                            className={`p-2 border flex items-center justify-between gap-2 ${
                              idx === 0
                                ? 'bg-amber-500/15 border-amber-400/40'
                                : 'bg-black/90 border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="font-mono-tabular text-xs font-bold text-amber-400 w-5">
                                #{idx + 1}
                              </span>
                              <div className="truncate">
                                <div className="text-xs font-bold text-white truncate">
                                  {drv.displayName}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {drv.racesCompleted} závodů · {drv.podiums}×
                                  pódium
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono-tabular text-xs font-bold text-emerald-400">
                                {drv.wins} 🏆
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Primary Start Grand Prix CTA (Official F1 Red Bar) */}
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onStartRace();
              }}
              className="w-full mt-3.5 py-3.5 bg-[#e10600] hover:bg-red-500 text-white font-display text-base sm:text-lg font-bold tracking-wider uppercase transition shadow-2xl cursor-pointer"
              style={{
                clipPath:
                  'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)',
              }}
            >
              {activeRoom
                ? `🏁 Odstartovat Online Grand Prix (${activeRoom.players.length} Hráčů + ${botCount} AI)`
                : `🏁 Odstartovat Velkou Cenu (${botCount + 1} formulí na roštu)`}
            </button>
          </div>

          {/* Flat Bottom Control Hint */}
          <div className="text-center text-[11px] sm:text-xs font-semibold tracking-wide text-slate-200/90 drop-shadow py-1">
            WASD / Šipky Řízení · Zajeď vpravo na cílové rovince do uličky PIT IN pro výměnu pneu (S/M/H/W) · Shift DRS · C Kamera
          </div>
        </div>
      )}

      {/* ==================== PLAYING HUD (OFFICIAL F1 24/25 TV BROADCAST & HALO TELEMETRY) ==================== */}
      {(phase === 'playing' || phase === 'pitstop' || phase === 'paused') && (
        <>
          {/* ==================== TOP PERIMETER: F1 BROADCAST TIMING TOWER (LEFT) + SECTOR & DELTA BOX (RIGHT) ==================== */}
          <div className="flex items-start justify-between p-2 sm:p-4 gap-2">
            {/* TOP-LEFT: Official F1 TV Broadcast Timing Tower (Exact match to reference image.png) */}
            <div
              className="pointer-events-auto w-48 sm:w-64 shadow-2xl overflow-hidden"
              style={{
                backgroundColor: 'rgba(10, 12, 16, 0.88)',
                clipPath:
                  'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
                borderBottom: '2px solid rgba(255,255,255,0.12)',
              }}
            >
              {/* F1 Logo + GRAND PRIX Header */}
              <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between border-b border-white/10">
                <F1BroadcastLogo className="w-14 sm:w-16 h-5" />
                <div className="text-right leading-none">
                  <div className="font-display text-[11px] sm:text-xs font-bold tracking-[0.18em] uppercase text-slate-200">
                    {activeRoom ? 'ONLINE' : 'GRAND'}
                  </div>
                  <div className="font-display text-xs sm:text-sm font-bold tracking-[0.2em] uppercase text-white">
                    {activeRoom ? `#${activeRoom.roomId}` : 'PRIX'}
                  </div>
                </div>
              </div>

              {/* Lap Subheader (VUELTA / KOLO style with bottom rule) */}
              <div className="px-3 py-1.5 text-center border-b border-white/25 bg-white/[0.03]">
                <span className="font-display text-xs sm:text-sm font-bold tracking-[0.22em] uppercase text-white font-mono-tabular">
                  KOLO {lap}
                  <span className="text-slate-400 font-normal">
                    {' '}
                    / {totalLaps}
                  </span>
                </span>
              </div>

              {/* Driver Timing Rows */}
              <div className="divide-y divide-white/5 py-0.5">
                {liveStandings.slice(0, 6).map((driver, idx) => {
                  const comp =
                    TIRE_COMPOUNDS[driver.tireCompound || 'soft'] ||
                    TIRE_COMPOUNDS.soft;
                  const inPit = driver.inPitBox || driver.inPitLaneAlley;
                  const leaderFinishMs = liveStandings[0]?.finishTimeMs ?? null;
                  const teamColor = `#${driver.colorHex
                    .toString(16)
                    .padStart(6, '0')}`;
                  return (
                    <div
                      key={driver.id}
                      className={`flex items-center justify-between px-2.5 py-1 text-[11px] sm:text-xs font-mono-tabular ${
                        driver.isPlayer
                          ? 'bg-white/15 text-white font-bold'
                          : 'text-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-3.5 text-right font-bold text-white">
                          {idx + 1}
                        </span>
                        <span
                          className="w-1 h-3.5 shrink-0"
                          style={{ backgroundColor: teamColor }}
                        />
                        <span className="font-sans font-semibold tracking-tight truncate max-w-[82px] sm:max-w-[105px]">
                          {driver.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {driver.finished ? (
                          <span className="px-1 py-0.2 bg-emerald-500 text-slate-950 text-[8px] font-bold tracking-wider uppercase">
                            🏁 CÍL
                          </span>
                        ) : inPit ? (
                          <span className="px-1 py-0.2 bg-[#e10600] text-white text-[8px] font-bold tracking-wider uppercase animate-pulse">
                            PIT
                          </span>
                        ) : null}
                        {/* Official Pirelli Circular Compound Ring */}
                        <span
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold text-white bg-black/80"
                          style={{ borderColor: comp.cssColor }}
                          title={`${comp.name} (${Math.round(
                            driver.tireHealth ?? 100
                          )}%)`}
                        >
                          {comp.shortCode}
                        </span>
                        <span className="w-12 sm:w-14 text-right text-[10px] sm:text-[11px] text-slate-200">
                          {driver.finished &&
                          idx > 0 &&
                          leaderFinishMs !== null &&
                          driver.finishTimeMs !== null &&
                          driver.finishTimeMs !== undefined
                            ? `+${Math.max(
                                0,
                                (driver.finishTimeMs - leaderFinishMs) / 1000
                              )
                                .toFixed(3)
                                .replace('.', ',')}`
                            : driver.finished && idx === 0
                            ? 'VÍTĚZ'
                            : idx === 0
                            ? `${Math.round(driver.speedKmh)} km/h`
                            : `+${(idx * 0.65 + 0.32).toFixed(3).replace('.', ',')}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TOP-CENTER: Dynamic Pit Lane / Team Radio Alert Banner */}
            <div
              ref={liveRefs.pitStatusBanner}
              className="pointer-events-auto hidden items-center gap-2 px-4 py-2 border-l-4 border-emerald-400 bg-black/90 text-white shadow-2xl mx-auto mt-1"
            >
              <span
                ref={liveRefs.pitStatusText}
                className="font-display text-xs sm:text-sm font-bold tracking-wider uppercase text-emerald-300"
              >
                🟢 PIT LANE OTEVŘENA — ZAJED VPRAVO DO BOXU
              </span>
            </div>

            {/* TOP-RIGHT: Official F1 Sector Strip + Lap Time + Diagonal-Striped DELTA Box (Exact match to image.png) */}
            <div className="flex flex-col items-end gap-1.5">
              <div
                className="pointer-events-auto w-48 sm:w-64 shadow-2xl overflow-hidden border border-white/10"
                style={{ backgroundColor: 'rgba(10, 12, 16, 0.90)' }}
              >
                {/* S1 / S2 / S3 Sector Bar Strip */}
                <div className="grid grid-cols-3 gap-0.5 bg-black/90 p-0.5 text-center font-display text-[9px] font-bold tracking-widest uppercase">
                  <div className="bg-purple-600 text-white py-0.5">S1</div>
                  <div className="bg-purple-600/85 text-white py-0.5">S2</div>
                  <div className="bg-zinc-800 text-slate-300 py-0.5">S3</div>
                </div>

                {/* Position / Lap & Current Running Lap Time Row */}
                <div className="px-3 py-1.5 flex items-baseline justify-between bg-black/60">
                  <div className="font-display text-lg sm:text-xl font-bold text-white font-mono-tabular leading-none">
                    P{position}
                    <span className="text-xs sm:text-sm text-slate-400 font-normal">
                      /{totalCarsCount}
                    </span>
                  </div>
                  <span
                    ref={liveRefs.lapTimeText}
                    className="font-display text-base sm:text-lg font-bold text-white font-mono-tabular tracking-tight"
                  >
                    0:00,000
                  </span>
                </div>

                {/* Diagonal-Striped Green DELTA Row */}
                <div
                  className="px-3 py-1.5 flex items-center justify-between border-t border-emerald-300/30"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, rgba(22, 163, 74, 0.92), rgba(22, 163, 74, 0.92) 6px, rgba(21, 128, 61, 0.92) 6px, rgba(21, 128, 61, 0.92) 12px)',
                  }}
                >
                  <div className="flex items-center gap-1.5 text-white font-display text-[11px] sm:text-xs font-bold tracking-wider uppercase">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-3.5 h-3.5 fill-none stroke-current"
                      strokeWidth="2.4"
                    >
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2.5 2.5M10 2h4" />
                    </svg>
                    <span>DELTA / NEJ</span>
                  </div>
                  <span
                    ref={liveRefs.bestLapText}
                    className="font-display text-sm sm:text-base font-bold italic text-white font-mono-tabular drop-shadow"
                  >
                    --:--,---
                  </span>
                </div>
              </div>

              {/* Compact Sleek F1 Broadcast Utility Buttons */}
              <div className="pointer-events-auto flex items-center gap-1">
                <span
                  ref={liveRefs.fpsText}
                  className="px-2 py-1 bg-black/80 border border-white/10 text-emerald-400 font-mono-tabular text-[10px] font-bold hidden md:inline-block"
                >
                  60 FPS
                </span>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Pohled: ${cameraLabel}`}
                  title={`Kamera: ${cameraLabel} [C]`}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onCycleCamera();
                  }}
                  className="px-2.5 py-1 bg-black/85 hover:bg-white/15 border border-white/15 text-[11px] font-display font-bold uppercase tracking-wider text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <span>🎥 {cameraLabel}</span>
                  <span className="text-[9px] text-slate-400 font-mono-tabular hidden sm:inline">
                    [C]
                  </span>
                </button>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Inženýrský pult a počasí"
                  title="Inženýrský pult & Počasí [H]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleDock();
                  }}
                  className={`px-2 py-1 border text-[11px] font-display font-bold uppercase cursor-pointer ${
                    dockOpen
                      ? 'bg-[#e10600] border-white text-white'
                      : 'bg-black/85 hover:bg-white/15 border-white/15 text-slate-200'
                  }`}
                >
                  ⚙️
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
                  className="px-2 py-1 bg-black/85 hover:bg-white/15 border border-white/15 text-slate-200 text-[11px] font-bold cursor-pointer"
                >
                  ↻
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
                  className="px-2.5 py-1 bg-black/85 hover:bg-white/15 border border-white/15 text-white text-[11px] font-bold cursor-pointer"
                >
                  ❚❚
                </button>
              </div>

              {/* Optional Collapsible Race Engineer Drawer */}
              {dockOpen && (
                <div
                  className="pointer-events-auto w-68 p-3 border border-white/20 shadow-2xl"
                  style={{ backgroundColor: 'rgba(10, 12, 16, 0.95)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#e10600]">
                      Inženýrský pult & Počasí
                    </span>
                    <button
                      type="button"
                      onClick={onToggleDock}
                      className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-slate-300">Citlivost řízení</span>
                      <span className="font-mono-tabular text-white font-bold">
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
                      className="w-full accent-[#e10600] cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1 mb-1.5">
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
                        className={`py-1 text-[10px] font-bold cursor-pointer ${
                          timeOfDay === id
                            ? 'bg-white text-slate-950'
                            : 'bg-white/5 text-slate-300'
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
                        className={`py-1 text-[10px] font-bold cursor-pointer ${
                          weather === id
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-white/5 text-slate-300'
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

          {/* ==================== BOTTOM PERIMETER: FLOATING 2D TRACK MAP (LEFT) + TWIN-POD HALO TELEMETRY (CENTER) + F1 OSD BARS (RIGHT) ==================== */}
          <div className="pointer-events-none flex flex-col gap-2 px-2 sm:px-5 pb-2 sm:pb-3">
            {/* Mobile Ergonomic Touch Controls (< md screens) */}
            <div className="pointer-events-auto flex items-center justify-between gap-1.5 w-full md:hidden">
              <div className="flex items-center gap-1.5">
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
                  className="w-13 h-13 bg-black/90 active:bg-[#e10600] text-white border border-white/25 flex items-center justify-center shadow-2xl touch-none select-none cursor-pointer"
                >
                  <span className="font-display text-xl font-bold">◀</span>
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
                  className="w-13 h-13 bg-black/90 active:bg-[#e10600] text-white border border-white/25 flex items-center justify-center shadow-2xl touch-none select-none cursor-pointer"
                >
                  <span className="font-display text-xl font-bold">▶</span>
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Ruční brzda / Smyk"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('handbrake', true);
                  }}
                  onPointerUp={() => onTouchControl('handbrake', false)}
                  onPointerCancel={() => onTouchControl('handbrake', false)}
                  onPointerLeave={() => onTouchControl('handbrake', false)}
                  className="px-2.5 h-12 bg-black/85 active:bg-amber-500 text-amber-300 border border-amber-400/50 font-display text-[11px] font-bold uppercase shadow-xl touch-none select-none cursor-pointer"
                >
                  SMYK
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="ERS / DRS Boost"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('nitro', true);
                  }}
                  onPointerUp={() => onTouchControl('nitro', false)}
                  onPointerCancel={() => onTouchControl('nitro', false)}
                  onPointerLeave={() => onTouchControl('nitro', false)}
                  className="px-2.5 h-12 bg-black/85 active:bg-cyan-400 text-cyan-300 border border-cyan-400/50 font-display text-[11px] font-bold uppercase shadow-xl touch-none select-none cursor-pointer"
                >
                  DRS
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Brzda a zpátečka"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('brake', true);
                  }}
                  onPointerUp={() => onTouchControl('brake', false)}
                  onPointerCancel={() => onTouchControl('brake', false)}
                  onPointerLeave={() => onTouchControl('brake', false)}
                  className="px-3 h-13 bg-rose-700/80 active:bg-rose-500 text-white border border-rose-400/60 font-display text-xs font-bold uppercase shadow-xl touch-none select-none cursor-pointer"
                >
                  BRZDA
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Plyn"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onTouchControl('throttle', true);
                  }}
                  onPointerUp={() => onTouchControl('throttle', false)}
                  onPointerCancel={() => onTouchControl('throttle', false)}
                  onPointerLeave={() => onTouchControl('throttle', false)}
                  className="px-3.5 h-13 bg-emerald-600/80 active:bg-emerald-400 text-white border border-emerald-300/60 font-display text-xs font-bold uppercase shadow-xl touch-none select-none cursor-pointer"
                >
                  PLYN
                </button>
              </div>
            </div>

            {/* Bottom 3-Zone F1 25 Layout: [Bottom-Left Floating Track Map] — [Bottom-Center Twin-Pod Halo Cluster] — [Bottom-Right OSD Sliders & Pit Button] */}
            <div className="flex items-end justify-between gap-2">
              {/* BOTTOM-LEFT: Clean Floating 2D Circuit Map with Colored Sectors & Pit Lane (Exact match to image.png) */}
              <div className="pointer-events-auto relative hidden sm:block">
                <svg
                  viewBox="0 0 150 150"
                  className="w-32 h-32 md:w-40 md:h-40 overflow-visible drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]"
                >
                  {/* Dark Outer Track Casing */}
                  <path
                    d={minimap.pathD}
                    fill="none"
                    stroke="#090d16"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Crisp White Track Ribbon */}
                  <path
                    d={minimap.pathD}
                    fill="none"
                    stroke="#f8fafc"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Colored Sector Highlights (Purple / Green / Magenta like F1 TV Map) */}
                  <path
                    d={minimap.s1Path}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d={minimap.s2Path}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  {/* Sector Numbers 1, 2, 3 */}
                  <text
                    x={minimap.startPt.mx - 10}
                    y={minimap.startPt.mz + 4}
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                  >
                    1
                  </text>
                  <text
                    x={minimap.s2Pt.mx + 6}
                    y={minimap.s2Pt.mz - 4}
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                  >
                    2
                  </text>
                  <text
                    x={minimap.s3Pt.mx + 6}
                    y={minimap.s3Pt.mz + 8}
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                  >
                    3
                  </text>
                  {/* Pit Box Stall Indicator on Main Straight */}
                  <rect
                    x={minimap.startPt.mx - 3.5}
                    y={minimap.startPt.mz - 3.5}
                    width="7"
                    height="7"
                    rx="1.5"
                    fill="#e10600"
                    stroke="#facc15"
                    strokeWidth="1.2"
                  />
                  {/* Rival Dots */}
                  {liveRefs.rivalMapDots.map((dotRef, i) => (
                    <g key={i}>
                      <circle
                        ref={dotRef}
                        cx="75"
                        cy="75"
                        r="3.4"
                        fill="#f59e0b"
                        stroke="#090d16"
                        strokeWidth="1.2"
                        opacity="0"
                      />
                      <text
                        ref={liveRefs.rivalMapLabels[i]}
                        x="80"
                        y="77"
                        fill="#e2e8f0"
                        fontSize="7"
                        fontWeight="bold"
                        opacity="0"
                      />
                    </g>
                  ))}
                  {/* Player Arrow/Circle Marker (Bright Blue/Cyan like image.png) */}
                  <circle
                    ref={liveRefs.playerMapDot}
                    cx="75"
                    cy="75"
                    r="5"
                    fill="#2563eb"
                    stroke="#38bdf8"
                    strokeWidth="2"
                  />
                  <text
                    ref={liveRefs.playerMapLabel}
                    x="81"
                    y="77"
                    fill="#38bdf8"
                    fontSize="8"
                    fontWeight="bold"
                  >
                    {playerName.slice(0, 10)}
                  </text>
                </svg>
              </div>

              {/* BOTTOM-CENTER: Official F1 Twin-Pod Halo / Steering Wheel Telemetry Cluster (Exact match to image.png) */}
              <div
                className="pointer-events-auto mx-auto px-3 sm:px-5 py-2 sm:py-2.5 border border-white/15 shadow-2xl flex items-center gap-3 sm:gap-5"
                style={{
                  backgroundColor: 'rgba(8, 11, 16, 0.92)',
                  borderRadius: '28px 28px 14px 14px',
                  borderTop: '2px solid rgba(56, 189, 248, 0.45)',
                }}
              >
                {/* LEFT CIRCULAR POD: BAT / ERS 100% (Cyan Ring Gauge like image.png) */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="rgba(6, 182, 212, 0.08)"
                      stroke="#164e63"
                      strokeWidth="5"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="5"
                      strokeDasharray="190 240"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                    <span className="text-[8px] sm:text-[9px] font-display font-bold uppercase tracking-wider text-cyan-300">
                      BAT
                    </span>
                    <span className="font-display text-sm sm:text-lg font-bold text-white font-mono-tabular mt-0.5">
                      100 %
                    </span>
                    <span
                      ref={liveRefs.surfaceBadge}
                      className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-emerald-400 mt-0.5"
                    >
                      ASFALT
                    </span>
                  </div>
                  {/* Hidden G-dot SVG to preserve ref compatibility */}
                  <svg className="hidden" aria-hidden="true">
                    <circle ref={liveRefs.gDot} cx="32" cy="32" r="4" />
                  </svg>
                </div>

                {/* CENTER GEAR & OVERTAKE MODE POD (N / 1..8 + MODO ADELANTAMIENTO / REŽIM PŘEDJÍŽDĚNÍ) */}
                <div className="flex flex-col items-center min-w-[110px] sm:min-w-[140px]">
                  {/* 15-LED Shift Light Strip */}
                  <div className="grid grid-cols-15 gap-0.5 h-1.5 w-full mb-1">
                    {liveRefs.shiftLedStrip.map((ledRef, idx) => (
                      <span
                        key={idx}
                        ref={ledRef}
                        className="rounded-xs bg-slate-800 transition-colors"
                      />
                    ))}
                  </div>

                  {/* Giant Crisp White Gear Numeral */}
                  <span
                    ref={liveRefs.gearText}
                    className="font-display text-3xl sm:text-5xl font-bold text-white font-mono-tabular leading-none tracking-tight"
                  >
                    1
                  </span>

                  {/* Bottom Overtake Mode / ERS Bar (MODO ADELANTAMIENTO style) */}
                  <div className="w-full mt-1.5 bg-slate-900/95 border border-cyan-400/30 px-2 py-0.5 text-center">
                    <div className="text-[7px] sm:text-[8px] font-display font-bold uppercase tracking-[0.14em] text-slate-200 leading-tight">
                      REŽIM PŘEDJÍŽDĚNÍ
                    </div>
                    <div className="w-full h-1 bg-slate-800 overflow-hidden mt-0.5">
                      <div
                        ref={liveRefs.nitroBar}
                        className="h-full bg-cyan-400"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>

                {/* RIGHT CIRCULAR POD: KM/H & RPM (Magenta/Purple Tachometer Ring like image.png) */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
                  <svg
                    viewBox="0 0 80 80"
                    className="w-full h-full -rotate-135"
                  >
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="rgba(168, 85, 247, 0.08)"
                      stroke="#3b0764"
                      strokeWidth="5.5"
                      strokeDasharray="175 240"
                      strokeLinecap="round"
                    />
                    <circle
                      ref={liveRefs.rpmBar}
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="#d946ef"
                      strokeWidth="5.5"
                      strokeDasharray="32 240"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                    <span className="text-[7px] sm:text-[8px] font-display font-bold uppercase tracking-wider text-slate-300">
                      KM/H
                    </span>
                    <span
                      ref={liveRefs.speedText}
                      className="font-display text-base sm:text-xl font-bold text-white font-mono-tabular leading-none mt-0.5"
                    >
                      0
                    </span>
                    <span className="text-[6px] sm:text-[7px] uppercase text-slate-400 mt-0.5">
                      RPM
                    </span>
                    <span
                      ref={liveRefs.rpmText}
                      className="text-[8px] sm:text-[9px] font-mono-tabular font-bold text-slate-200 leading-none"
                    >
                      4018
                    </span>
                  </div>
                </div>
              </div>

              {/* BOTTOM-RIGHT: F1 OSD Micro-Sliders (Brake Balance + Differential/Tires) & [ / (B) ] Pit Prompt (Exact match to image.png) */}
              <div className="pointer-events-auto flex flex-col items-end gap-1 w-44 sm:w-60">
                {/* Compact [ / (B) ] Box Prompt Badge */}
                <button
                  ref={liveRefs.pitZoneBanner}
                  type="button"
                  tabIndex={-1}
                  aria-label="Vyžádat Pit Stop nebo vjet do boxu"
                  title="Pit Stop — Zajeď do uličky v boxech nebo vyžádej BOX [B]"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onEnterPitStop();
                  }}
                  className="px-2.5 py-1 bg-black/90 hover:bg-zinc-900 border border-white/20 text-white text-[11px] font-display font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xl cursor-pointer"
                  style={{
                    clipPath:
                      'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)',
                  }}
                >
                  <span className="text-slate-400 font-mono-tabular">/</span>
                  <span className="w-4 h-4 rounded-full border border-rose-500 text-rose-400 flex items-center justify-center text-[9px] font-bold">
                    B
                  </span>
                  <span>BOX</span>
                </button>

                {/* OSD Bar 1: Front Brake Bias / Aero Balance (Frenada delantera <> 57%) */}
                <div
                  className="w-full px-2.5 py-1 border-l-2 border-white bg-black/85 text-[10px] sm:text-[11px] flex items-center justify-between gap-2 relative overflow-hidden"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-white/15 pointer-events-none"
                    style={{ width: '57%' }}
                  />
                  <span className="relative z-10 text-slate-200 font-medium truncate">
                    ◐ Přední brzdy
                  </span>
                  <div className="relative z-10 flex items-center gap-1 font-mono-tabular font-bold text-white shrink-0">
                    <span className="text-slate-400 text-[9px]">&lt;&gt;</span>
                    <span ref={liveRefs.frontLoadText}>57 %</span>
                  </div>
                </div>

                {/* OSD Bar 2: Tire Wear & Differential Status (Diferencial <> 100% + 4-Wheel Wear) */}
                <div
                  className="w-full px-2.5 py-1 border-l-2 border-cyan-400 bg-black/85 text-[10px] sm:text-[11px] flex flex-col gap-1 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      {/* Mini 4-Wheel Wear Matrix */}
                      <div className="grid grid-cols-2 gap-0.5 w-3.5 shrink-0">
                        {[0, 1, 2, 3].map((wIdx) => (
                          <div
                            key={wIdx}
                            ref={liveRefs.tireWheelBoxes[wIdx]}
                            className="w-1.5 h-2 rounded-[1px]"
                            style={{ backgroundColor: '#22c55e' }}
                          />
                        ))}
                      </div>
                      <span className="text-slate-200 font-medium truncate">
                        ⚙ Pneu {currentCompoundInfo.shortCode} ·{' '}
                        <span
                          ref={liveRefs.tireTempText}
                          className="font-mono-tabular text-amber-300"
                        >
                          82°C
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1 font-mono-tabular font-bold text-white shrink-0">
                      <span className="text-slate-400 text-[9px]">
                        &lt;&gt;
                      </span>
                      <span ref={liveRefs.tirePctText}>100%</span>
                    </div>
                  </div>
                  <div className="w-full h-1 bg-white/10 overflow-hidden">
                    <div
                      ref={liveRefs.tireBarFill}
                      className="h-full bg-emerald-400 transition-all"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== INTERACTIVE PIT STOP MINIGAME MODAL (LIVE 3D PIT CREW VIEW + 4 COMPOUNDS) ==================== */}
      {phase === 'pitstop' && (
        <div
          className="pointer-events-auto fixed inset-0 z-30 flex items-end justify-end p-2 sm:p-5"
          style={{
            background:
              'linear-gradient(to left, rgba(4, 7, 14, 0.82) 0%, rgba(4, 7, 14, 0.18) 52%, rgba(4, 7, 14, 0.0) 100%)',
          }}
        >
          <div
            className="w-full max-w-[440px] p-3.5 sm:p-4 border border-white/20 shadow-2xl"
            style={{
              backgroundColor: 'rgba(10, 12, 16, 0.94)',
              borderTop: '4px solid #e10600',
            }}
          >
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#e10600]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>FIA PIT BOX TELEMETRIE · VŮZ NA ZVEDÁCÍCH</span>
                </div>
                <h2 className="font-display text-lg sm:text-xl font-bold uppercase text-white">
                  ZASTÁVKA V BOXECH (F1 2026 PIT STOP)
                </h2>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-slate-400">
                  Čas servisu (Cíl &lt; 2,4 s)
                </div>
                <div className="font-display text-2xl font-bold text-cyan-400 font-mono-tabular">
                  {pitTotalSeconds.toFixed(2)} s
                </div>
              </div>
            </div>

            {/* FIA 5-Light Pit Release Gantry Bar */}
            <div className="mb-3 px-3 py-1.5 bg-black/90 border border-white/15 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                {pitWheelIndex >= 4 ? '🟢 UVOLNĚNO — ZELENÁ!' : '🔴 ZVEDÁKY AKTIVNÍ'}
              </span>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3, 4].map((lightIdx) => {
                  const isGreen = pitWheelIndex >= 4;
                  const isRed = !isGreen && lightIdx < pitWheelIndex;
                  return (
                    <span
                      key={lightIdx}
                      className={`w-3.5 h-3.5 rounded-full border border-white/20 transition-all ${
                        isGreen
                          ? 'bg-emerald-400 shadow-[0_0_8px_#22c55e]'
                          : isRed
                          ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                          : 'bg-zinc-800'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Step 1: Select New Tire Compound (Soft, Medium, Hard, Wet) */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                <span>
                  1. Zvol směs pneumatik Pirelli (klávesy 1–4 nebo dotyk):
                </span>
                <span className="text-amber-400 text-[11px]">
                  {TIRE_COMPOUNDS[pitCompoundChoice].name}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ALL_COMPOUNDS.map((cid, idx) => {
                  const info = TIRE_COMPOUNDS[cid];
                  const active = pitCompoundChoice === cid;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => setPitCompoundChoice(cid)}
                      className={`p-2 border text-left transition cursor-pointer ${
                        active
                          ? 'bg-white/15 border-white text-white shadow-lg'
                          : 'bg-black/80 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 font-display font-bold text-xs uppercase">
                          <span
                            className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ borderColor: info.cssColor }}
                          >
                            {info.shortCode}
                          </span>
                          <span>
                            {cid === 'soft'
                              ? 'Měkká'
                              : cid === 'medium'
                              ? 'Střední'
                              : cid === 'hard'
                              ? 'Tvrdá'
                              : 'Mokrá'}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono-tabular text-slate-500">
                          [{idx + 1}]
                        </span>
                      </div>

                      <div className="space-y-0.5 text-[9px] font-mono-tabular mt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Rychl.</span>
                          <span
                            className={
                              cid === 'hard' ? 'text-amber-400' : 'text-white'
                            }
                          >
                            {Math.round(info.topSpeedMultiplier * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Grip</span>
                          <span className="text-cyan-300">
                            {cid === 'wet'
                              ? '118% (Mokro)'
                              : `${Math.round(info.gripMultiplier * 100)}%`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Výdrž</span>
                          <span className="text-emerald-400 font-bold">
                            {info.durabilityRating}%
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: 4-Wheel Pneumatic Gun Minigame */}
            <div className="bg-black/90 p-3 border border-white/10 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white">
                  2. Utáhni matice kol ({Math.min(4, pitWheelIndex + 1)}/4):{' '}
                  <span className="text-amber-400">
                    {WHEEL_NAMES[Math.min(3, pitWheelIndex)]}
                  </span>
                </span>
                <span className="text-xs font-mono-tabular text-emerald-400 font-bold">
                  {pitWheelIndex}/4 hotovo
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-2.5">
                {WHEEL_NAMES.map((wLabel, idx) => {
                  const res = pitWheelResults[idx];
                  const isCurrent = idx === pitWheelIndex;
                  return (
                    <div
                      key={wLabel}
                      className={`py-1 px-2 text-center border text-[11px] font-bold ${
                        res === 'perfect'
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300'
                          : res === 'good'
                          ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                          : res === 'slow'
                          ? 'bg-rose-500/25 border-rose-400 text-rose-300'
                          : isCurrent
                          ? 'bg-cyan-500/20 border-cyan-400 text-white animate-pulse'
                          : 'bg-black border-white/10 text-slate-500'
                      }`}
                    >
                      <div>{wLabel.split(' ')[2]}</div>
                      <div className="text-[9px] uppercase mt-0.5">
                        {res === 'perfect'
                          ? 'PERFEKTNÍ'
                          : res === 'good'
                          ? 'DOBRÉ'
                          : res === 'slow'
                          ? 'POMALÉ'
                          : isCurrent
                          ? 'UTÁHNI!'
                          : 'ČEKÁ'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Oscillating Pneumatic Torque Bar */}
              <div className="relative w-full h-8 bg-zinc-900 border border-white/15 overflow-hidden mb-1.5">
                <div
                  className="absolute top-0 bottom-0 bg-amber-500/30 border-x border-amber-400/50"
                  style={{ left: '24%', width: '56%' }}
                />
                <div
                  className="absolute top-0 bottom-0 bg-emerald-500/45 border-x-2 border-emerald-400 flex items-center justify-center"
                  style={{ left: '38%', width: '28%' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                    ZELENÁ ZÓNA — IDEÁLNÍ MOMENT
                  </span>
                </div>
                <div
                  className="absolute top-0 bottom-0 w-2 bg-white shadow-lg -ml-1"
                  style={{ left: `${pitNeedlePos}%` }}
                />
              </div>

              <div className="text-xs text-center font-semibold text-cyan-300 min-h-[18px]">
                {pitLastFeedback}
              </div>
            </div>

            <button
              type="button"
              onClick={handleFastenWheel}
              disabled={pitWheelIndex >= 4}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-display text-base sm:text-lg font-bold uppercase tracking-wide shadow-xl cursor-pointer transition"
            >
              {pitWheelIndex >= 4
                ? 'VŠECHNA KOLA HOTOVA — VYJÍŽDÍME Z BOXU!'
                : `⚡ UTÁHNOUT MATICI (${WHEEL_NAMES[pitWheelIndex]}) [MEZERNÍK / DOTYK]`}
            </button>
          </div>
        </div>
      )}

      {/* ==================== PAUSE MODAL ==================== */}
      {phase === 'paused' && (
        <div
          className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(4, 7, 14, 0.84)' }}
        >
          <div
            className="w-full max-w-md p-6 border border-white/15 shadow-2xl text-center"
            style={{
              backgroundColor: 'rgba(10, 12, 16, 0.96)',
              borderTop: '4px solid #e10600',
            }}
          >
            <div className="text-xs font-bold uppercase tracking-widest text-[#e10600] mb-1">
              Ředitelství závodu FIA
            </div>
            <h2 className="font-display text-2xl font-bold uppercase text-white mb-5">
              PAUZA & SERVIS
            </h2>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onResumeRace}
                className="w-full py-3 bg-[#e10600] hover:bg-red-500 text-white font-display font-bold uppercase cursor-pointer"
              >
                Pokračovat v jízdě [Esc]
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onForceOpenPitStop) {
                    onForceOpenPitStop();
                  } else {
                    onEnterPitStop();
                  }
                }}
                className="w-full py-3 bg-white/10 hover:bg-white/15 border border-white/20 text-cyan-300 font-semibold cursor-pointer"
              >
                🔧 Nouzový odtah do Pit Boxu (3D Servis pneu)
              </button>
              <button
                type="button"
                onClick={onRestartRace}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-semibold cursor-pointer"
              >
                Restartovat závod [R]
              </button>
              <button
                type="button"
                onClick={onFinishEarly}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold cursor-pointer"
              >
                Ukončit závod a zobrazit výsledky
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="w-full py-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold cursor-pointer"
              >
                Hlavní menu (Paddock & Online Lobby)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== GAME OVER / RACE SUMMARY MODAL ==================== */}
      {phase === 'gameover' && summary && (
        <div
          className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(4, 7, 14, 0.88)' }}
        >
          <div
            className="w-full max-w-lg p-6 border border-white/15 shadow-2xl"
            style={{
              backgroundColor: 'rgba(10, 12, 16, 0.96)',
              borderTop: '4px solid #e10600',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-[#e10600]">
                  Oficiální klasifikace FIA · {summary.trackName}
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-white">
                  {summary.position === 1
                    ? 'VÍTĚZSTVÍ VE VELKÉ CENĚ!'
                    : `${summary.position}. MÍSTO V CÍLI`}
                </h2>
              </div>
              <div className="w-14 h-14 bg-[#e10600] flex items-center justify-center font-display text-2xl font-bold text-white">
                P{summary.position}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-black/80 p-2.5 border border-white/10">
                <div className="text-[10px] uppercase text-slate-400">
                  Nejlepší kolo
                </div>
                <div className="font-mono-tabular font-bold text-sm text-purple-400 mt-0.5">
                  {formatRaceTime(summary.bestLapMs)}
                </div>
              </div>
              <div className="bg-black/80 p-2.5 border border-white/10">
                <div className="text-[10px] uppercase text-slate-400">
                  Max rychlost
                </div>
                <div className="font-mono-tabular font-bold text-sm text-white mt-0.5">
                  {Math.round(summary.maxSpeedKmh)} km/h
                </div>
              </div>
              <div className="bg-black/80 p-2.5 border border-white/10">
                <div className="text-[10px] uppercase text-slate-400">
                  Pit Stopy
                </div>
                <div className="font-mono-tabular font-bold text-sm text-emerald-400 mt-0.5">
                  {summary.pitStopsCompleted}× v boxu
                </div>
              </div>
              <div className="bg-black/80 p-2.5 border border-white/10">
                <div className="text-[10px] uppercase text-slate-400">
                  Čas v cíli
                </div>
                <div className="font-mono-tabular font-bold text-sm text-amber-400 mt-0.5">
                  {formatRaceTime(summary.totalTimeMs)}
                </div>
              </div>
            </div>

            <div className="bg-black/90 p-3 border border-white/10 mb-5 max-h-48 overflow-y-auto space-y-1">
              {summary.standings.map((row, idx) => {
                const winnerTimeMs =
                  summary.standings[0]?.finishTimeMs ?? null;
                const rowComp =
                  TIRE_COMPOUNDS[row.tireCompound || 'soft'] ||
                  TIRE_COMPOUNDS.soft;
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-3 py-1.5 text-xs ${
                      row.isPlayer
                        ? 'bg-white/15 border-l-4 border-[#e10600] text-white font-bold'
                        : 'text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono-tabular font-bold text-white w-6">
                        P{idx + 1}
                      </span>
                      <span className="truncate">{row.name}</span>
                      <span
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                        style={{ borderColor: rowComp.cssColor }}
                      >
                        {rowComp.shortCode}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-slate-300 shrink-0">
                      {row.finished && row.finishTimeMs
                        ? idx === 0
                          ? `🏁 ${formatRaceTime(row.finishTimeMs)}`
                          : winnerTimeMs
                          ? `🏁 +${Math.max(
                              0,
                              (row.finishTimeMs - winnerTimeMs) / 1000
                            )
                              .toFixed(3)
                              .replace('.', ',')} s`
                          : `🏁 ${formatRaceTime(row.finishTimeMs)}`
                        : `Kolo ${row.lap} · ${row.pitStopsCompleted ?? 0}× BOX`}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onRestartRace}
                className="py-3 bg-[#e10600] hover:bg-red-500 text-white font-display font-bold uppercase cursor-pointer"
              >
                Jet znovu
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="py-3 bg-white/10 hover:bg-white/20 text-white font-display font-bold uppercase cursor-pointer"
              >
                Paddock / Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
