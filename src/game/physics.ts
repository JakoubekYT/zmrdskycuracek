import {
  findClosestTrackSample,
  getActiveTrackDefinition,
  getTrackSamples,
  getTrackTotalLength,
  SurfaceType,
  TrackQueryResult,
} from './track';

export type AssistMode = 'arcade' | 'sim-lite' | 'drift';
export type BotDifficulty = 'easy' | 'medium' | 'hard';
export type TimeOfDay = 'day' | 'sunrise' | 'sunset' | 'night';
export type WeatherType = 'clear' | 'rain' | 'fog' | 'snow';
export type TireCompound = 'soft' | 'medium' | 'hard' | 'wet';

export interface TireCompoundInfo {
  id: TireCompound;
  name: string;
  shortCode: 'S' | 'M' | 'H' | 'W';
  colorHex: number;
  cssColor: string;
  gripMultiplier: number;
  wetGripBonus: number;
  topSpeedMultiplier: number;
  accelMultiplier: number;
  wearRateMultiplier: number;
  durabilityRating: number; // 0..100 for UI bars
  speedRating: number; // 0..100 for UI bars
  description: string;
}

export const TIRE_COMPOUNDS: Record<TireCompound, TireCompoundInfo> = {
  soft: {
    id: 'soft',
    name: 'Měkká směs (Soft)',
    shortCode: 'S',
    colorHex: 0xef4444,
    cssColor: '#ef4444',
    gripMultiplier: 1.10,
    wetGripBonus: 0.92,
    topSpeedMultiplier: 1.02,
    accelMultiplier: 1.03,
    wearRateMultiplier: 1.55,
    durabilityRating: 42,
    speedRating: 100,
    description: 'Maximální přilnavost a rychlost (+10 % grip, +2 % max rychlost), rychlé opotřebení',
  },
  medium: {
    id: 'medium',
    name: 'Střední směs (Medium)',
    shortCode: 'M',
    colorHex: 0xfacc15,
    cssColor: '#facc15',
    gripMultiplier: 1.0,
    wetGripBonus: 0.96,
    topSpeedMultiplier: 1.0,
    accelMultiplier: 1.0,
    wearRateMultiplier: 1.0,
    durabilityRating: 70,
    speedRating: 94,
    description: 'Vyvážená závodní směs —100 % rychlost a optimální životnost',
  },
  hard: {
    id: 'hard',
    name: 'Tvrdá směs (Hard)',
    shortCode: 'H',
    colorHex: 0xf8fafc,
    cssColor: '#f8fafc',
    gripMultiplier: 0.93,
    wetGripBonus: 0.90,
    topSpeedMultiplier: 0.94,
    accelMultiplier: 0.93,
    wearRateMultiplier: 0.45,
    durabilityRating: 100,
    speedRating: 86,
    description: 'Vydrží zdaleka nejdéle (2,2× delší nájezd), ale lehce zpomaluje (-6 % rychlost)',
  },
  wet: {
    id: 'wet',
    name: 'Mokrá směs (Wet)',
    shortCode: 'W',
    colorHex: 0x38bdf8,
    cssColor: '#38bdf8',
    gripMultiplier: 0.91,
    wetGripBonus: 1.28,
    topSpeedMultiplier: 0.95,
    accelMultiplier: 0.96,
    wearRateMultiplier: 1.25,
    durabilityRating: 78,
    speedRating: 89,
    description: 'Hluboký dezén do deště a sněhu (+28 % grip na mokru, na suchu se přehřívá)',
  },
};

export interface CarSpec {
  id: string;
  name: string;
  subtitle: string;
  colorHex: number;
  accentHex: number;
  massKg: number;
  enginePowerN: number;
  topSpeedMs: number;
  brakeForceN: number;
  baseGrip: number;
  driftSlipFactor: number;
  aeroDownforce: number;
  stats: {
    speed: number;
    handling: number;
    acceleration: number;
    drift: number;
  };
}

export const CAR_SPECS: CarSpec[] = [
  {
    id: 'apex-gtr',
    name: 'Scuderia Apex SF-26',
    subtitle: 'Tovární monopost F1 s obřím přítlakem a bleskovým výjezdem ze zatáček',
    colorHex: 0xef4444,
    accentHex: 0xfbbf24,
    massKg: 798,
    enginePowerN: 12200,
    topSpeedMs: 85, // 306 km/h
    brakeForceN: 19500,
    baseGrip: 1.24,
    driftSlipFactor: 0.85,
    aeroDownforce: 1.45,
    stats: { speed: 94, handling: 98, acceleration: 96, drift: 76 },
  },
  {
    id: 'blesk-rs',
    name: 'Blesk RB-20 Aero',
    subtitle: 'Mistrovský monopost s aktivním DRS a maximální rychlostí na rovinkách',
    colorHex: 0x0284c7,
    accentHex: 0xfacc15,
    massKg: 798,
    enginePowerN: 12800,
    topSpeedMs: 89, // 320 km/h
    brakeForceN: 19200,
    baseGrip: 1.20,
    driftSlipFactor: 0.92,
    aeroDownforce: 1.40,
    stats: { speed: 99, handling: 94, acceleration: 98, drift: 82 },
  },
  {
    id: 'valkyrie-drift',
    name: 'Papaya MCL-38 Formula',
    subtitle: 'Agilní monopost s hravou zádí a šetrnou prací s pneumatikami',
    colorHex: 0xf97316,
    accentHex: 0x38bdf8,
    massKg: 795,
    enginePowerN: 12100,
    topSpeedMs: 84, // 302 km/h
    brakeForceN: 19000,
    baseGrip: 1.16,
    driftSlipFactor: 1.25,
    aeroDownforce: 1.32,
    stats: { speed: 92, handling: 95, acceleration: 95, drift: 96 },
  },
  {
    id: 'phantom-v10',
    name: 'Silver Arrow W15 GP',
    subtitle: 'Karbonová střela s extrémní stabilitou na brzdách a vysokým výkonem ERS',
    colorHex: 0x10b981,
    accentHex: 0xe2e8f0,
    massKg: 796,
    enginePowerN: 12900,
    topSpeedMs: 90, // 324 km/h
    brakeForceN: 20400,
    baseGrip: 1.26,
    driftSlipFactor: 0.88,
    aeroDownforce: 1.48,
    stats: { speed: 100, handling: 97, acceleration: 99, drift: 80 },
  },
  {
    id: 'rallye-evo',
    name: 'Aston AMR-26 Wet Spec',
    subtitle: 'Speciálně naladěná formule s maximální mechanickou trakcí v dešti i na obrubnících',
    colorHex: 0x059669,
    accentHex: 0xbef264,
    massKg: 802,
    enginePowerN: 12000,
    topSpeedMs: 83, // 298 km/h
    brakeForceN: 19800,
    baseGrip: 1.30,
    driftSlipFactor: 1.0,
    aeroDownforce: 1.42,
    stats: { speed: 90, handling: 100, acceleration: 95, drift: 86 },
  },
  {
    id: 'muscle-v8',
    name: 'Enstone A526 Turbo',
    subtitle: 'Dravá formule s agresivním turbo nástupem a přetáčivým charakterem',
    colorHex: 0x6366f1,
    accentHex: 0xf472b6,
    massKg: 805,
    enginePowerN: 12600,
    topSpeedMs: 87, // 313 km/h
    brakeForceN: 18800,
    baseGrip: 1.15,
    driftSlipFactor: 1.22,
    aeroDownforce: 1.30,
    stats: { speed: 96, handling: 90, acceleration: 96, drift: 94 },
  },
];

export const AI_DRIVER_NAMES = [
  'Novák GP',
  'Kovář F1',
  'Dvořák Aero',
  'Svoboda RS',
  'Černý Apex',
  'Procházka GT',
  'Kučera Turbo',
];

export interface AiStrategyProfile {
  id: string;
  name: string;
  startingCompound: TireCompound;
  cornerAggression: number;
  wearMultiplier: number;
  pitHealthThreshold: number;
  dryCompoundPool: TireCompound[];
}

export const AI_STRATEGY_PROFILES: AiStrategyProfile[] = [
  {
    id: 'aggressive-soft',
    name: 'Útočný Sprinter (Soft 2-Stop)',
    startingCompound: 'soft',
    cornerAggression: 1.12,
    wearMultiplier: 1.16,
    pitHealthThreshold: 42,
    dryCompoundPool: ['soft', 'soft', 'medium'],
  },
  {
    id: 'balanced-medium',
    name: 'Vyvážený Taktik (Medium)',
    startingCompound: 'medium',
    cornerAggression: 1.0,
    wearMultiplier: 1.0,
    pitHealthThreshold: 35,
    dryCompoundPool: ['soft', 'medium', 'hard'],
  },
  {
    id: 'marathon-hard',
    name: 'Maratonec 1-Stop (Hard)',
    startingCompound: 'hard',
    cornerAggression: 0.93,
    wearMultiplier: 0.86,
    pitHealthThreshold: 28,
    dryCompoundPool: ['soft', 'medium', 'hard'],
  },
  {
    id: 'undercut-specialist',
    name: 'Undercut Specialista',
    startingCompound: 'soft',
    cornerAggression: 1.08,
    wearMultiplier: 1.08,
    pitHealthThreshold: 45,
    dryCompoundPool: ['medium', 'hard', 'soft'],
  },
  {
    id: 'overcut-whisperer',
    name: 'Šetřič Pneu (Overcut)',
    startingCompound: 'medium',
    cornerAggression: 0.95,
    wearMultiplier: 0.88,
    pitHealthThreshold: 30,
    dryCompoundPool: ['soft', 'medium'],
  },
  {
    id: 'adaptive-allrounder',
    name: 'Flexibilní Stratég',
    startingCompound: 'medium',
    cornerAggression: 1.04,
    wearMultiplier: 0.98,
    pitHealthThreshold: 37,
    dryCompoundPool: ['soft', 'medium', 'hard'],
  },
  {
    id: 'late-braker',
    name: 'Rizikový Dravec (Late Brake)',
    startingCompound: 'soft',
    cornerAggression: 1.16,
    wearMultiplier: 1.22,
    pitHealthThreshold: 39,
    dryCompoundPool: ['soft', 'medium', 'hard'],
  },
];

/**
 * Selects the next tire compound for an AI driver during their Pit Stop based on
 * weather conditions, remaining laps, and their individual AI strategy profile + randomness.
 */
export function chooseAiNextCompound(
  state: CarState,
  isWetWeather: boolean,
  totalLaps = 3
): TireCompound {
  if (isWetWeather) {
    return 'wet';
  }
  const remainingLaps = Math.max(1, totalLaps - state.lap + 1);
  const profileIdx =
    Math.abs(
      state.id
        .split('')
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    ) % AI_STRATEGY_PROFILES.length;
  const profile = AI_STRATEGY_PROFILES[profileIdx];

  // On the final lap in dry conditions, 65% chance to bolt on fresh Softs for fastest lap attack
  if (remainingLaps <= 1 && Math.random() < 0.65) {
    return 'soft';
  }
  const pool = profile.dryCompoundPool;
  return pool[Math.floor(Math.random() * pool.length)] || 'medium';
}

export interface TuningConfig {
  assistMode: AssistMode;
  tireGripMultiplier: number;
  suspensionStiffness: number;
  steeringSensitivity: number;
  weatherGripMultiplier?: number;
}

export const DEFAULT_TUNING: TuningConfig = {
  assistMode: 'sim-lite',
  tireGripMultiplier: 1.0,
  suspensionStiffness: 1.0,
  steeringSensitivity: 1.0,
  weatherGripMultiplier: 1.0,
};

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}

export interface CarState {
  id: string;
  name: string;
  isPlayer: boolean;
  isRemote?: boolean;
  spec: CarSpec;

  x: number;
  y: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  yawRate: number;

  forwardSpeed: number;
  lateralSpeed: number;
  speedKmh: number;

  steerInputSmooth: number;
  steerHoldTime: number;
  steerAngle: number;
  wheelRotation: number;
  rpm: number;
  gear: number;
  nitroAmount: number;
  nitroActive: boolean;

  // Tire Wear, Temperature & Physical Pit Lane Alley System
  tireCompound: TireCompound;
  tireWear: [number, number, number, number]; // [FL, FR, RL, RR] in % (100 = new, 0 = worn out)
  tireHealth: number; // Average 0..100%
  tireTemp: number; // °C (optimal 80..100°C)
  inPitZone: boolean; // Approaching or alongside the main straight pit lane
  inPitLaneAlley: boolean; // Physically inside the right-side Pit Lane Alley (ulička v boxech)
  inPitBox: boolean; // Physically inside the Pit Box stall inside the alley
  pitExitCooldown: number; // Seconds remaining before pit box can trigger again
  distanceToPitMeters: number; // Remaining distance along circuit to Pit Entry
  pitStopsCompleted: number;

  // Individual AI Strategy & Physical AI Pit Stop State
  aiStrategyName?: string;
  aiCornerAggression?: number;
  aiWearMultiplier?: number;
  aiPitThreshold?: number;
  aiWantsToPit?: boolean;
  aiPitStopTimer?: number;

  longitudinalG: number;
  lateralG: number;
  frontAxleLoadRatio: number;
  chassisPitch: number;
  trackSlopePitch: number;
  chassisRoll: number;
  pitchVelocity: number;
  rollVelocity: number;

  slipAngle: number;
  isDrifting: boolean;
  driftScore: number;
  currentDriftChain: number;
  surface: SurfaceType;
  kerbRumble: number;

  trackSampleIndex: number;
  trackProgressT: number;
  unwrappedProgress: number; // Continuous monotonic lap progress (0.0 -> 1.0 -> 2.0 -> 3.0)
  lap: number;
  maxCheckpointPassed: number;
  totalDistanceDriven: number;
  currentLapTimeMs: number;
  totalRaceTimeMs: number;
  bestLapTimeMs: number | null;
  lastLapTimeMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;

  lastImpactSeverity: number;
}

const GEAR_SPEED_THRESHOLDS_MS = [0, 15, 28, 42, 56, 71, 96];

/**
 * Calculates the real-time tire grip multiplier from tire health (0..100%),
 * selected compound (soft/medium/hard/wet), tire temperature, and weather.
 * Includes the realistic "Tire Cliff" below 35% health.
 */
export function computeTireGripMultiplier(
  tireHealth: number,
  compound: TireCompound,
  tireTemp = 88,
  isWetWeather = false
): number {
  const compoundInfo = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.medium;
  const h = Math.max(0, Math.min(100, tireHealth));

  let wearFactor = 1.0;
  if (h >= 70) {
    // 100% -> 70%: gentle initial wear (1.00 -> 0.95)
    wearFactor = 0.95 + ((h - 70) / 30) * 0.05;
  } else if (h >= 35) {
    // 70% -> 35%: noticeable degradation (0.95 -> 0.78)
    wearFactor = 0.78 + ((h - 35) / 35) * 0.17;
  } else {
    // Below 35%: the "Tire Cliff" — steep drop-off down to 0.52 at 0%
    wearFactor = 0.52 + (h / 35) * 0.26;
  }

  // Thermal penalty if tires are severely overheated (> 106°C)
  const overheatPenalty =
    tireTemp > 106 ? Math.max(0.86, 1 - (tireTemp - 106) * 0.006) : 1.0;

  const weatherMatchMult = isWetWeather ? compoundInfo.wetGripBonus : 1.0;

  return (
    compoundInfo.gripMultiplier *
    weatherMatchMult *
    wearFactor *
    overheatPenalty
  );
}

/**
 * Services a car in the Pit Box: fits a fresh set of 4 tires of the chosen compound,
 * resets tire temperature to optimal 82°C, sets a 5.5s pit-exit cooldown, and grants an ERS/Nitro boost.
 */
export function servicePitStop(
  state: CarState,
  newCompound: TireCompound,
  nitroBonus = 35
): void {
  state.tireCompound = newCompound;
  state.tireWear = [100, 100, 100, 100];
  state.tireHealth = 100;
  state.tireTemp = newCompound === 'wet' ? 72 : 82;
  state.inPitBox = false;
  state.aiWantsToPit = false;
  state.aiPitStopTimer = 0;
  state.pitExitCooldown = 6.0;
  state.pitStopsCompleted += 1;
  state.nitroAmount = Math.min(100, state.nitroAmount + nitroBonus);
}

export function createInitialCarState(
  id: string,
  name: string,
  isPlayer: boolean,
  spec: CarSpec,
  startT: number,
  lateralGridOffset: number,
  initialCompound: TireCompound = 'soft',
  aiProfileIndex = 0
): CarState {
  const samples = getTrackSamples();
  const count = samples.length;
  const wrappedT = ((startT % 1) + 1) % 1;
  const idx = Math.floor(wrappedT * count) % count;
  const pt = samples[idx];

  const x = pt.x + pt.nx * lateralGridOffset;
  const z = pt.z + pt.nz * lateralGridOffset;
  const aiProfile =
    AI_STRATEGY_PROFILES[aiProfileIndex % AI_STRATEGY_PROFILES.length];

  return {
    id,
    name,
    isPlayer,
    spec,
    x,
    y: pt.y,
    z,
    heading: pt.angle,
    vx: 0,
    vz: 0,
    yawRate: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    speedKmh: 0,
    steerInputSmooth: 0,
    steerHoldTime: 0,
    steerAngle: 0,
    wheelRotation: 0,
    rpm: 3500,
    gear: 1,
    nitroAmount: 100,
    nitroActive: false,
    tireCompound: initialCompound,
    tireWear: [100, 100, 100, 100],
    tireHealth: 100,
    tireTemp: 82,
    inPitZone: true,
    inPitLaneAlley: false,
    inPitBox: false,
    pitExitCooldown: 4.0, // Prevent pit trigger right at race launch
    distanceToPitMeters: 0,
    pitStopsCompleted: 0,
    aiStrategyName: isPlayer ? undefined : aiProfile.name,
    aiCornerAggression: isPlayer ? 1.0 : aiProfile.cornerAggression,
    aiWearMultiplier: isPlayer ? 1.0 : aiProfile.wearMultiplier,
    aiPitThreshold: isPlayer ? 35 : aiProfile.pitHealthThreshold,
    aiWantsToPit: false,
    aiPitStopTimer: 0,
    longitudinalG: 0,
    lateralG: 0,
    frontAxleLoadRatio: 0.5,
    chassisPitch: 0,
    trackSlopePitch: 0,
    chassisRoll: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
    slipAngle: 0,
    isDrifting: false,
    driftScore: 0,
    currentDriftChain: 0,
    surface: 'asphalt',
    kerbRumble: 0,
    trackSampleIndex: idx,
    trackProgressT: pt.t,
    unwrappedProgress: startT,
    lap: 1,
    maxCheckpointPassed: 0,
    totalDistanceDriven: startT * getTrackTotalLength(),
    currentLapTimeMs: 0,
    totalRaceTimeMs: 0,
    bestLapTimeMs: null,
    lastLapTimeMs: null,
    finished: false,
    finishTimeMs: null,
    lastImpactSeverity: 0,
  };
}

export function stepCarPhysics(
  state: CarState,
  input: CarInput,
  tuning: TuningConfig,
  rawDt: number,
  totalLaps = 3,
  weatherGripMultiplier = 1.0
): TrackQueryResult {
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
  state.lastImpactSeverity = 0;
  if (state.pitExitCooldown > 0) {
    state.pitExitCooldown = Math.max(0, state.pitExitCooldown - dt);
  }

  const trackDef = getActiveTrackDefinition();
  const barrierHalfWidth = trackDef.roadHalfWidth + 3.6;

  // 1. Query track surface & geometry at current position
  const trackQuery = findClosestTrackSample(
    state.x,
    state.z,
    state.trackSampleIndex
  );
  state.trackSampleIndex = trackQuery.index;
  state.surface = trackQuery.surface;

  // 2. Transform world velocity into car local frame
  const sinH = Math.sin(state.heading);
  const cosH = Math.cos(state.heading);
  const forwardSpeed = state.vx * sinH + state.vz * cosH;
  const lateralSpeed = -state.vx * cosH + state.vz * sinH;

  // 3. Progressive & Speed-Dependent Realistic Steering
  const absSpeed = Math.hypot(forwardSpeed, lateralSpeed);
  if (Math.abs(input.steer) > 0.05) {
    if (
      state.steerInputSmooth !== 0 &&
      Math.sign(input.steer) !== Math.sign(state.steerInputSmooth)
    ) {
      state.steerHoldTime = 0;
    }
    state.steerHoldTime = Math.min(1.0, state.steerHoldTime + dt * 2.4);
    const holdAuthority = 0.32 + 0.68 * (state.steerHoldTime * state.steerHoldTime);
    const desiredSteer = input.steer * holdAuthority;
    const turnInRate = state.isPlayer ? 6.8 : 11.0;
    state.steerInputSmooth +=
      (desiredSteer - state.steerInputSmooth) * (1 - Math.exp(-turnInRate * dt));
  } else {
    state.steerHoldTime = Math.max(0, state.steerHoldTime - dt * 5.0);
    state.steerInputSmooth *= Math.exp(-13 * dt);
    if (Math.abs(state.steerInputSmooth) < 0.005) state.steerInputSmooth = 0;
  }

  // Realistic high-speed steering reduction
  const maxSteerRad = (state.isPlayer ? 0.38 : 0.46) * tuning.steeringSensitivity;
  const speedSteerFactor = 1 / (1 + Math.max(0, absSpeed - 9) * 0.042);
  const targetSteerAngle = state.steerInputSmooth * maxSteerRad * speedSteerFactor;
  const rackRate = 1 - Math.exp(-11 * dt);
  state.steerAngle += (targetSteerAngle - state.steerAngle) * rackRate;

  const compoundInfo =
    TIRE_COMPOUNDS[state.tireCompound] || TIRE_COMPOUNDS.medium;
  const isWetWeather = weatherGripMultiplier < 0.90;

  // Compute current Tire Grip Multiplier from tire wear + compound + temperature + wet conditions
  const tireGripMult = computeTireGripMultiplier(
    state.tireHealth,
    state.tireCompound,
    state.tireTemp,
    isWetWeather
  );

  // Compound speed & acceleration modifiers (Hard compound lasts longest but slightly slows the car!)
  const compoundTopSpeedMult = compoundInfo.topSpeedMultiplier;
  const compoundAccelMult = compoundInfo.accelMultiplier;
  const effectiveTopSpeedMs = state.spec.topSpeedMs * compoundTopSpeedMult;

  // 4. Longitudinal forces
  let driveForce = 0;
  let brakeForce = 0;

  const isReversing =
    input.brake > 0.1 && input.throttle < 0.1 && forwardSpeed < 1.2;

  if (isReversing) {
    driveForce = -input.brake * state.spec.enginePowerN * 0.55;
  } else {
    if (input.throttle > 0) {
      const speedRatio = Math.max(0, forwardSpeed) / effectiveTopSpeedMs;
      const torqueCurve = Math.max(0.18, 1.34 - speedRatio * 0.92);
      // Worn rear tires slightly reduce launch traction out of slow corners
      const tractionWearFactor = 0.78 + 0.22 * Math.min(1, state.tireHealth / 60);
      driveForce =
        input.throttle *
        state.spec.enginePowerN *
        compoundAccelMult *
        torqueCurve *
        tractionWearFactor;
    }
    if (input.brake > 0 && forwardSpeed > -0.5) {
      // Braking distance increases when front tires are worn out
      const brakeWearFactor = 0.72 + 0.28 * Math.min(1, state.tireHealth / 65);
      brakeForce = input.brake * state.spec.brakeForceN * brakeWearFactor;
    }
  }

  // Nitro / ERS + DRS boost
  const canUseNitro =
    input.nitro &&
    state.nitroAmount > 1 &&
    input.throttle > 0.2 &&
    !isReversing;
  state.nitroActive = canUseNitro;
  if (canUseNitro) {
    driveForce += state.spec.enginePowerN * 0.55;
    state.nitroAmount = Math.max(0, state.nitroAmount - 26 * dt);
  } else {
    const rechargeRate = state.isDrifting ? 16 : 5.2;
    state.nitroAmount = Math.min(100, state.nitroAmount + rechargeRate * dt);
  }

  if (input.handbrake && Math.abs(forwardSpeed) > 0.5) {
    brakeForce += state.spec.brakeForceN * 0.55;
  }

  const aeroDrag = 0.36 * forwardSpeed * Math.abs(forwardSpeed);
  const isWetSpec = state.spec.id === 'rallye-evo';
  const surfaceRollingMult =
    state.surface === 'grass'
      ? isWetSpec
        ? 2.8
        : 5.5
      : state.surface === 'kerb'
      ? 1.25
      : 1.0;
  const rollingResistance = 190 * surfaceRollingMult * forwardSpeed;

  const brakingSign = forwardSpeed > 0.1 ? -1 : forwardSpeed < -0.1 ? 1 : 0;
  const netLongForce =
    driveForce + brakingSign * brakeForce - aeroDrag - rollingResistance;
  const longAccel = netLongForce / state.spec.massKg;

  let newForwardSpeed = forwardSpeed + longAccel * dt;
  if (
    !isReversing &&
    input.throttle === 0 &&
    input.brake > 0 &&
    forwardSpeed > 0 &&
    newForwardSpeed < 0
  ) {
    newForwardSpeed = 0;
  }
  const maxReverseSpeed = -22;
  newForwardSpeed = Math.max(
    maxReverseSpeed,
    Math.min(
      effectiveTopSpeedMs * (canUseNitro ? 1.14 : 1.02),
      newForwardSpeed
    )
  );

  // 5. Dynamic Weight Transfer
  const rawLongG = (newForwardSpeed - forwardSpeed) / dt / 9.81;
  state.longitudinalG +=
    (rawLongG - state.longitudinalG) * (1 - Math.exp(-12 * dt));
  state.frontAxleLoadRatio = Math.max(
    0.32,
    Math.min(0.68, 0.5 - state.longitudinalG * 0.16)
  );

  // 6. Lateral Tire Grip, High-Speed Understeer, Tire Wear Effect & Drift Physics
  const surfaceGripMult =
    state.surface === 'grass'
      ? isWetSpec
        ? 0.78
        : 0.58
      : state.surface === 'kerb'
      ? 0.94
      : 1.0;
  const assistGripMult =
    tuning.assistMode === 'arcade'
      ? 1.25
      : tuning.assistMode === 'drift'
      ? 0.82
      : 1.0;
  const weatherGrip =
    (tuning.weatherGripMultiplier ?? 1.0) * weatherGripMultiplier;

  const effectiveGrip =
    state.spec.baseGrip *
    trackDef.gripFactor *
    tuning.tireGripMultiplier *
    surfaceGripMult *
    assistGripMult *
    weatherGrip *
    tireGripMult;

  const understeerPenalty =
    1 / (1 + Math.max(0, Math.abs(newForwardSpeed) - 34) * 0.017);
  const frontGripAuthority =
    (0.78 + state.frontAxleLoadRatio * 0.44) * understeerPenalty;

  const wheelbase = 2.75;
  const speedForTurn =
    Math.abs(newForwardSpeed) < 0.4
      ? 0
      : Math.sign(newForwardSpeed) * Math.min(Math.abs(newForwardSpeed), 29);
  let targetYawRate =
    (speedForTurn / wheelbase) * Math.tan(state.steerAngle) * frontGripAuthority;

  // Worn tires (< 45%) induce tail-happiness / oversteer under throttle
  const wornTireSlipBoost =
    state.tireHealth < 45 ? 1 + ((45 - state.tireHealth) / 45) * 0.45 : 1.0;

  const rearSlipTrigger =
    input.handbrake ||
    state.tireHealth < 30 ||
    (Math.abs(state.steerInputSmooth) > 0.55 &&
      Math.abs(newForwardSpeed) > 20 &&
      (tuning.assistMode === 'drift' || state.spec.driftSlipFactor > 1.1));

  if (rearSlipTrigger && Math.abs(newForwardSpeed) > 8) {
    const oversteerBoost = input.handbrake
      ? 1.38
      : 1.12 * state.spec.driftSlipFactor * wornTireSlipBoost;
    targetYawRate *= oversteerBoost;
  }

  // Cap maximum angular velocity by tire lateral grip limit
  const maxLatAccelMs2 = (13.2 + state.spec.aeroDownforce * 2.4) * effectiveGrip;
  if (Math.abs(newForwardSpeed) > 10 && !input.handbrake) {
    const maxPhysicalYawRate = maxLatAccelMs2 / Math.abs(newForwardSpeed);
    targetYawRate = Math.max(
      -maxPhysicalYawRate * 1.25,
      Math.min(maxPhysicalYawRate * 1.25, targetYawRate)
    );
  }

  const yawResponse = 1 - Math.exp(-9.5 * effectiveGrip * dt);
  state.yawRate += (targetYawRate - state.yawRate) * yawResponse;
  state.heading += state.yawRate * dt;

  // Inject centripetal lateral velocity and damp it according to tire grip
  let newLateralSpeed =
    lateralSpeed - newForwardSpeed * state.yawRate * dt * 0.42;
  const corneringStiffness = rearSlipTrigger
    ? (3.2 / (state.spec.driftSlipFactor * wornTireSlipBoost)) * effectiveGrip
    : (9.4 / (state.spec.driftSlipFactor * wornTireSlipBoost)) * effectiveGrip;
  newLateralSpeed *= Math.exp(-corneringStiffness * dt);

  // Convert back to world velocity
  const newSinH = Math.sin(state.heading);
  const newCosH = Math.cos(state.heading);
  state.vx = newForwardSpeed * newSinH - newLateralSpeed * newCosH;
  state.vz = newForwardSpeed * newCosH + newLateralSpeed * newSinH;

  state.forwardSpeed = newForwardSpeed;
  state.lateralSpeed = newLateralSpeed;
  state.speedKmh = Math.hypot(state.vx, state.vz) * 3.6;

  // 7. Integrate world position
  const stepDistMeters = Math.hypot(state.vx, state.vz) * dt;
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // 8. Re-query track for barrier collisions & lap progress
  const postQuery = findClosestTrackSample(
    state.x,
    state.z,
    state.trackSampleIndex
  );
  state.trackSampleIndex = postQuery.index;
  state.surface = postQuery.surface;
  state.y = postQuery.groundY;

  // Track slope pitch aligned with car heading (positive = pointing uphill)
  const forwardDotTangent =
    Math.sin(state.heading) * postQuery.tangent.x +
    Math.cos(state.heading) * postQuery.tangent.z;
  const rawSlopePitch = postQuery.slopeAngle * forwardDotTangent;
  state.trackSlopePitch =
    (state.trackSlopePitch ?? 0) +
    (rawSlopePitch - (state.trackSlopePitch ?? 0)) * (1 - Math.exp(-14 * dt));

  if (postQuery.barrierHit && postQuery.barrierPenetration > 0) {
    const sign = postQuery.barrierHit === 'right' ? 1 : -1;
    const inPitAlleyLong = postQuery.t >= 0.89 || postQuery.t <= 0.11;
    const rightLim = inPitAlleyLong
      ? trackDef.roadHalfWidth + 6.8
      : barrierHalfWidth;
    const clampedOffset =
      sign > 0 ? rightLim - 0.15 : -(barrierHalfWidth - 0.15);
    state.x = postQuery.closestPoint.x + postQuery.normal.x * clampedOffset;
    state.z = postQuery.closestPoint.z + postQuery.normal.z * clampedOffset;

    const vn = state.vx * postQuery.normal.x + state.vz * postQuery.normal.z;
    if (vn * sign > 0) {
      const impactSpeed = Math.abs(vn);
      state.lastImpactSeverity = Math.min(1, impactSpeed / 18);
      state.vx -= postQuery.normal.x * vn * 1.25;
      state.vz -= postQuery.normal.z * vn * 1.25;
      state.vx *= 0.84;
      state.vz *= 0.84;
      state.forwardSpeed *= 0.84;
      state.speedKmh = Math.hypot(state.vx, state.vz) * 3.6;
    }

    const tangentAngle = Math.atan2(postQuery.tangent.x, postQuery.tangent.z);
    let angleDiff = tangentAngle - state.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    state.heading += angleDiff * 0.25;
  }

  // 9. Suspension Pitch & Roll Spring-Damper Dynamics
  const rawLatG = (newForwardSpeed * state.yawRate) / 9.81;
  state.lateralG += (rawLatG - state.lateralG) * (1 - Math.exp(-10 * dt));

  const targetPitch = Math.max(
    -0.065,
    Math.min(0.065, (state.longitudinalG * 0.032) / tuning.suspensionStiffness)
  );
  const targetRoll = Math.max(
    -0.095,
    Math.min(0.095, (state.lateralG * 0.038) / tuning.suspensionStiffness)
  );

  const springK = 115 * tuning.suspensionStiffness;
  const damperC = 17;

  const pitchAccel =
    (targetPitch - state.chassisPitch) * springK -
    state.pitchVelocity * damperC;
  state.pitchVelocity += pitchAccel * dt;
  state.chassisPitch += state.pitchVelocity * dt;

  const rollAccel =
    (targetRoll - state.chassisRoll) * springK - state.rollVelocity * damperC;
  state.rollVelocity += rollAccel * dt;
  state.chassisRoll += state.rollVelocity * dt;

  if (state.surface === 'kerb' && state.speedKmh > 15) {
    state.kerbRumble = Math.sin(state.totalDistanceDriven * 3.2) * 0.015;
  } else {
    state.kerbRumble = 0;
  }

  // 10. Slip Angle, Drift Scoring & Dynamic Tire Wear + Temperature Simulation
  state.slipAngle =
    Math.abs(state.forwardSpeed) > 3
      ? Math.atan2(state.lateralSpeed, Math.abs(state.forwardSpeed))
      : 0;
  const slipDeg = Math.abs(state.slipAngle) * (180 / Math.PI);
  state.isDrifting =
    state.speedKmh > 38 &&
    (slipDeg > 9.5 || (input.handbrake && Math.abs(state.steerAngle) > 0.06));

  if (state.isDrifting && state.surface !== 'grass') {
    const pointsEarned =
      (slipDeg * 1.8 + state.speedKmh * 0.35) * dt * (canUseNitro ? 1.5 : 1.0);
    state.currentDriftChain += pointsEarned;
    state.driftScore += pointsEarned;
  } else if (state.currentDriftChain > 0) {
    state.currentDriftChain = Math.max(0, state.currentDriftChain - 120 * dt);
  }

  // --- TIRE WEAR & THERMAL MODEL ---
  // Wet tires wear slower in rain/snow (0.72x) and faster on bone-dry hot tarmac (1.35x)
  const effectiveWearMult =
    state.tireCompound === 'wet'
      ? isWetWeather
        ? 0.72
        : 1.35
      : compoundInfo.wearRateMultiplier;
  const aiWearFactor = state.aiWearMultiplier ?? 1.0;
  const baseWearPerMeter = 0.0165 * effectiveWearMult * aiWearFactor;
  const surfaceAbrasion =
    state.surface === 'grass' ? 1.85 : state.surface === 'kerb' ? 1.38 : 1.0;

  // Driving style factors
  const corneringLoad = Math.abs(state.lateralG) * 0.85;
  const slipAbuse = Math.min(3.4, (slipDeg / 10) * 1.65 + (input.handbrake ? 1.8 : 0));
  const brakeLockAbuse =
    input.brake > 0.5 && state.speedKmh > 60 ? input.brake * 0.95 : 0;
  const understeerScrub =
    Math.abs(state.steerAngle) > 0.14 && state.speedKmh > 120
      ? (Math.abs(state.steerAngle) - 0.12) * 3.2
      : 0;

  // Tire temperature dynamics (ambient 76°C, Wet tires overheat faster on dry track)
  const dryWetHeatPenalty =
    state.tireCompound === 'wet' && !isWetWeather ? 14 : 0;
  const targetTemp =
    76 +
    dryWetHeatPenalty +
    (state.speedKmh / 300) * 16 +
    slipAbuse * 11 +
    corneringLoad * 6 +
    (isWetWeather ? -10 : 0);
  state.tireTemp += (targetTemp - state.tireTemp) * (1 - Math.exp(-1.8 * dt));

  const thermalWearMult = state.tireTemp > 102 ? 1 + (state.tireTemp - 102) * 0.035 : 1.0;
  const stepBaseWear =
    stepDistMeters * baseWearPerMeter * surfaceAbrasion * thermalWearMult;

  if (stepBaseWear > 0 && !state.finished) {
    // Outside tires wear more in corners based on lateralG sign
    const leftLoadBias = state.lateralG > 0 ? 1.22 : 0.86;
    const rightLoadBias = state.lateralG < 0 ? 1.22 : 0.86;

    const frontStyleMult = 1 + corneringLoad + brakeLockAbuse + understeerScrub + slipAbuse * 0.45;
    const rearStyleMult = 1 + corneringLoad * 0.85 + slipAbuse * 1.35 + (canUseNitro ? 0.65 : 0);

    state.tireWear[0] = Math.max(0, state.tireWear[0] - stepBaseWear * frontStyleMult * leftLoadBias);
    state.tireWear[1] = Math.max(0, state.tireWear[1] - stepBaseWear * frontStyleMult * rightLoadBias);
    state.tireWear[2] = Math.max(0, state.tireWear[2] - stepBaseWear * rearStyleMult * leftLoadBias);
    state.tireWear[3] = Math.max(0, state.tireWear[3] - stepBaseWear * rearStyleMult * rightLoadBias);

    state.tireHealth =
      (state.tireWear[0] +
        state.tireWear[1] +
        state.tireWear[2] +
        state.tireWear[3]) *
      0.25;
  }

  // Physical Pit Zone & Right-Side Drive-In Pit Lane Alley (Ulička v boxech) detection on Main Straight
  const trackTotalLen = getTrackTotalLength();
  const inStraightCorridor = postQuery.t >= 0.895 || postQuery.t <= 0.085;
  state.inPitZone = inStraightCorridor;

  // Distance in meters along the track to the Pit Entry at t = 0.905
  if (inStraightCorridor) {
    state.distanceToPitMeters = 0;
  } else {
    const remainingT = Math.max(0, 0.905 - postQuery.t);
    state.distanceToPitMeters = Math.round(remainingT * trackTotalLen);
  }

  // Right-Side Paved Pit Lane Alley (lateralOffset >= roadHalfWidth - 1.8m)
  const inRightSideAlley =
    inStraightCorridor && postQuery.lateralOffset >= trackDef.roadHalfWidth - 1.8;
  state.inPitLaneAlley = inRightSideAlley;

  // Automatic F1 Pit Lane Speed Limiter (80 km/h = 22.2 m/s) & Pit Alley Lane Assist when driving inside the Pit Lane Alley
  if (inRightSideAlley && state.pitExitCooldown <= 0) {
    if (state.forwardSpeed > 22.2) {
      const limitedSpeed = Math.max(22.2, state.forwardSpeed - 42 * dt);
      const scale = limitedSpeed / Math.max(0.1, state.forwardSpeed);
      state.forwardSpeed = limitedSpeed;
      state.vx *= scale;
      state.vz *= scale;
      state.speedKmh = Math.hypot(state.vx, state.vz) * 3.6;
    }
    // Gently align car heading & lateral offset toward the Pit Box Stall center (roadHalfWidth + 3.2m) inside the alley
    if (state.forwardSpeed > 3.0) {
      const targetAlleyLat = trackDef.roadHalfWidth + 3.2;
      const latErr = targetAlleyLat - postQuery.lateralOffset;
      const pullStep = Math.max(-2.5 * dt, Math.min(2.5 * dt, latErr * 2.2 * dt));
      state.x += postQuery.normal.x * pullStep;
      state.z += postQuery.normal.z * pullStep;
    }
  }

  // Physical Drive-In Pit Box Stall inside the Pit Lane Alley (t >= 0.950 || t <= 0.050)
  const inPitStallLongitudinal = postQuery.t >= 0.950 || postQuery.t <= 0.050;
  state.inPitBox =
    state.pitExitCooldown <= 0 &&
    inPitStallLongitudinal &&
    inRightSideAlley &&
    state.speedKmh < 145;

  // AI Strategy & Physical Drive-In Pit Stop Execution
  if (!state.isPlayer && !state.isRemote && !state.finished) {
    const pitThreshold = state.aiPitThreshold ?? 36;
    const wrongWeatherTire =
      state.totalDistanceDriven > 200 &&
      ((isWetWeather && state.tireCompound !== 'wet') ||
        (!isWetWeather && state.tireCompound === 'wet'));

    if (
      state.pitExitCooldown <= 0 &&
      (state.tireHealth <= pitThreshold || wrongWeatherTire)
    ) {
      state.aiWantsToPit = true;
    }

    // If AI is currently parked in the Pit Box inside the alley being serviced by the crew
    if ((state.aiPitStopTimer ?? 0) > 0) {
      state.aiPitStopTimer = Math.max(0, (state.aiPitStopTimer ?? 0) - dt);
      state.vx = 0;
      state.vz = 0;
      state.forwardSpeed = 0;
      state.lateralSpeed = 0;
      state.speedKmh = 0;
      state.inPitLaneAlley = true;
      state.inPitBox = true;

      if (state.aiPitStopTimer <= 0) {
        const nextComp = chooseAiNextCompound(state, isWetWeather, totalLaps);
        servicePitStop(state, nextComp, 30);
        // Launch AI smoothly out of the pit box along the alley
        const sinOut = Math.sin(state.heading);
        const cosOut = Math.cos(state.heading);
        state.forwardSpeed = 22.0;
        state.vx = sinOut * 22.0;
        state.vz = cosOut * 22.0;
        state.speedKmh = 79.2;
      }
    } else if (
      state.aiWantsToPit &&
      state.pitExitCooldown <= 0 &&
      inPitStallLongitudinal &&
      postQuery.lateralOffset >= trackDef.roadHalfWidth - 2.2
    ) {
      // AI has physically driven into the Pit Lane Alley & reached its Pit Stall -> start 2.2s tire change!
      state.aiPitStopTimer = 2.2;
      state.vx = 0;
      state.vz = 0;
      state.forwardSpeed = 0;
      state.lateralSpeed = 0;
      state.speedKmh = 0;
      state.inPitLaneAlley = true;
      state.inPitBox = true;
    }
  }

  // 11. Automatic 6-Speed F1 Gearbox & High-Revving Engine RPM
  const absFwd = Math.abs(state.forwardSpeed);
  if (isReversing) {
    state.gear = -1;
  } else {
    let g = 1;
    for (let i = 1; i < GEAR_SPEED_THRESHOLDS_MS.length - 1; i++) {
      if (absFwd >= GEAR_SPEED_THRESHOLDS_MS[i]) {
        g = i + 1;
      }
    }
    state.gear = Math.min(6, g);
  }

  const gearIdx = Math.max(1, state.gear);
  const gearMin = GEAR_SPEED_THRESHOLDS_MS[gearIdx - 1] * 0.65;
  const gearMax = GEAR_SPEED_THRESHOLDS_MS[gearIdx];
  const gearFraction = Math.max(
    0,
    Math.min(1, (absFwd - gearMin) / Math.max(5, gearMax - gearMin))
  );
  const targetRpm =
    1100 + gearFraction * 6500 + (input.throttle > 0.2 ? 450 : 0);
  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-15 * dt));

  const wheelRadius = 0.34;
  state.wheelRotation += (state.forwardSpeed / wheelRadius) * dt;

  // 12. Continuous Unwrapped Lap & Formula 1 Finish-Line Classification
  const stepMs = dt * 1000;
  if (!state.finished) {
    state.currentLapTimeMs += stepMs;
    state.totalRaceTimeMs += stepMs;
  }

  const prevT = state.trackProgressT;
  const newT = postQuery.t;

  // Compute shortest signed delta along the closed [0, 1) spline
  let deltaT = newT - prevT;
  if (deltaT < -0.5) deltaT += 1.0;
  if (deltaT > 0.5) deltaT -= 1.0;

  // Guard against any non-physical spike (> 8% of track in a single frame)
  if (Math.abs(deltaT) < 0.08 && !state.finished) {
    const prevLapFloor = Math.floor(Math.max(0, state.unwrappedProgress));
    state.unwrappedProgress += deltaT;
    const newLapFloor = Math.floor(Math.max(0, state.unwrappedProgress));

    // Completed a full continuous lap forward across the Start/Finish Line
    if (newLapFloor > prevLapFloor && state.unwrappedProgress >= 0.98) {
      if (state.currentLapTimeMs > 8000) {
        state.lastLapTimeMs = state.currentLapTimeMs;
        if (
          state.bestLapTimeMs === null ||
          state.currentLapTimeMs < state.bestLapTimeMs
        ) {
          state.bestLapTimeMs = state.currentLapTimeMs;
        }
        state.currentLapTimeMs = 0;
      }

      if (newLapFloor >= totalLaps) {
        // Exact sub-frame moment when the car crossed the finish line on the final lap
        const overshoot = Math.max(0, state.unwrappedProgress - totalLaps);
        const stepProgress = Math.max(0.0001, Math.abs(deltaT));
        const subFrameFraction = Math.min(1, overshoot / stepProgress);
        const exactFinishMs = Math.max(
          100,
          state.totalRaceTimeMs - subFrameFraction * stepMs
        );
        state.finished = true;
        state.lap = totalLaps;
        state.finishTimeMs = state.finishTimeMs ?? exactFinishMs;
      } else {
        state.lap = newLapFloor + 1;
      }
    } else {
      state.lap = Math.max(1, Math.min(totalLaps, newLapFloor + 1));
    }
  }

  state.trackProgressT = newT;
  const trackLen = getTrackTotalLength();
  if (!state.finished) {
    state.totalDistanceDriven = state.unwrappedProgress * trackLen;
  }

  return postQuery;
}

export function computeAiInput(
  aiState: CarState,
  laneOffsetTarget: number,
  difficultyPace = 0.86,
  weather: WeatherType = 'clear'
): CarInput {
  if (!aiState.isPlayer && !aiState.isRemote && !aiState.finished) {
    const isWet = weather === 'rain' || weather === 'snow';
    const needsWetSwap =
      (isWet && aiState.tireCompound !== 'wet') ||
      (!isWet && aiState.tireCompound === 'wet');
    if (
      aiState.pitExitCooldown <= 0 &&
      aiState.totalDistanceDriven > 90 &&
      (aiState.tireHealth <= (aiState.aiPitThreshold ?? 35) || needsWetSwap)
    ) {
      aiState.aiWantsToPit = true;
    }
  }

  if ((aiState.aiPitStopTimer ?? 0) > 0) {
    return {
      throttle: 0,
      brake: 1,
      steer: 0,
      handbrake: false,
      nitro: false,
    };
  }

  const trackDef = getActiveTrackDefinition();
  const samples = getTrackSamples();
  const count = samples.length;

  // Check if AI wants to pit and is approaching or inside the main straight Pit Lane Alley
  const approachingPitAlley =
    !aiState.finished &&
    Boolean(aiState.aiWantsToPit) &&
    aiState.pitExitCooldown <= 0 &&
    (aiState.trackProgressT >= 0.83 || aiState.trackProgressT <= 0.055);

  const mergingOutOfPitAlley =
    aiState.pitExitCooldown > 2.5 &&
    (aiState.trackProgressT >= 0.95 || aiState.trackProgressT <= 0.085);

  // If AI has already finished the race, pull gently to the outside line on a cool-down lap so trailing drivers can finish cleanly
  const effectiveLaneOffset = aiState.finished
    ? -(trackDef.roadHalfWidth - 2.4)
    : approachingPitAlley
    ? trackDef.roadHalfWidth + 2.8
    : mergingOutOfPitAlley
    ? trackDef.roadHalfWidth - 1.5
    : laneOffsetTarget;

  const lookAheadSteps = approachingPitAlley
    ? 8
    : Math.max(10, Math.min(26, Math.round(aiState.forwardSpeed * 0.38)));
  const targetIdx = (aiState.trackSampleIndex + lookAheadSteps) % count;
  const targetPt = samples[targetIdx];

  const aimX = targetPt.x + targetPt.nx * effectiveLaneOffset;
  const aimZ = targetPt.z + targetPt.nz * effectiveLaneOffset;

  const dx = aimX - aiState.x;
  const dz = aimZ - aiState.z;
  const desiredHeading = Math.atan2(dx, dz);

  let headingError = desiredHeading - aiState.heading;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;

  const steer = Math.max(-1, Math.min(1, headingError * 2.4));

  const upcomingCurvature = Math.abs(targetPt.curvature);
  const cornerAggr = aiState.aiCornerAggression ?? 1.0;
  const safeCornerSpeed =
    (upcomingCurvature > 0.14 ? 40 : upcomingCurvature > 0.08 ? 55 : 88) *
    cornerAggr;
  const targetSpeed = aiState.finished
    ? 24.0 // Cool-down lap after crossing checkered flag
    : approachingPitAlley
    ? 22.0 // 80 km/h Pit Lane speed limit
    : Math.min(aiState.spec.topSpeedMs, safeCornerSpeed) * difficultyPace;

  const throttle = aiState.forwardSpeed < targetSpeed ? 0.94 : 0.15;
  const brake =
    aiState.forwardSpeed > targetSpeed + (approachingPitAlley ? 3 : 7)
      ? 0.75
      : 0;
  const nitro =
    !aiState.finished &&
    !approachingPitAlley &&
    upcomingCurvature < 0.04 &&
    aiState.forwardSpeed > 32 &&
    aiState.nitroAmount > 62;

  return {
    throttle,
    brake,
    steer,
    handbrake: false,
    nitro,
  };
}

/**
 * Computes official Formula 1 race standings:
 * 1. Drivers who have crossed the finish line on the final lap (`finished === true`)
 *    have their finishing position permanently locked by the exact order they crossed
 *    the finish line (`finishTimeMs` ascending).
 * 2. Drivers still racing on track (`finished === false`) are ordered behind finished
 *    drivers by their continuous unwrapped progress / total distance driven.
 */
export function computeRaceStandings(cars: CarState[]): CarState[] {
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity);
    }
    if (a.finished !== b.finished) {
      return a.finished ? -1 : 1;
    }
    if (Math.abs(b.unwrappedProgress - a.unwrappedProgress) > 1e-5) {
      return b.unwrappedProgress - a.unwrappedProgress;
    }
    return b.totalDistanceDriven - a.totalDistanceDriven;
  });
}
