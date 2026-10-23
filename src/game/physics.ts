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
    name: 'Apex GT-R Aero',
    subtitle: 'Vyvážený okruhový speciál s vysokým přítlakem',
    colorHex: 0xef4444,
    accentHex: 0xf59e0b,
    massKg: 1280,
    enginePowerN: 17500,
    topSpeedMs: 77, // 277 km/h
    brakeForceN: 24800,
    baseGrip: 1.14,
    driftSlipFactor: 0.85,
    aeroDownforce: 1.25,
    stats: { speed: 88, handling: 95, acceleration: 90, drift: 76 },
  },
  {
    id: 'blesk-rs',
    name: 'Blesk RS Turbo',
    subtitle: 'Extrémní akcelerace a maximální rychlost na rovinkách',
    colorHex: 0x06b6d4,
    accentHex: 0x38bdf8,
    massKg: 1330,
    enginePowerN: 19400,
    topSpeedMs: 84, // 302 km/h
    brakeForceN: 23800,
    baseGrip: 1.03,
    driftSlipFactor: 0.95,
    aeroDownforce: 1.1,
    stats: { speed: 98, handling: 85, acceleration: 96, drift: 82 },
  },
  {
    id: 'valkyrie-drift',
    name: 'Valkyrie Drift Spec',
    subtitle: 'Upravená zadokolka s agresivním přetáčivým vyvážením',
    colorHex: 0xf59e0b,
    accentHex: 0xfef08a,
    massKg: 1180,
    enginePowerN: 17100,
    topSpeedMs: 74, // 266 km/h
    brakeForceN: 22800,
    baseGrip: 0.96,
    driftSlipFactor: 1.38,
    aeroDownforce: 0.95,
    stats: { speed: 84, handling: 86, acceleration: 92, drift: 99 },
  },
  {
    id: 'phantom-v10',
    name: 'Phantom V10 Hyper',
    subtitle: 'Ultralehký karbonový hypercar s brutálním odpichem',
    colorHex: 0x10b981,
    accentHex: 0xa7f3d0,
    massKg: 1150,
    enginePowerN: 19600,
    topSpeedMs: 86, // 310 km/h
    brakeForceN: 26000,
    baseGrip: 1.18,
    driftSlipFactor: 0.9,
    aeroDownforce: 1.35,
    stats: { speed: 100, handling: 94, acceleration: 99, drift: 80 },
  },
  {
    id: 'rallye-evo',
    name: 'Rallye Evo AWD',
    subtitle: 'Pohon 4x4 s maximální trakcí na obrubnících, sněhu i trávě',
    colorHex: 0x3b82f6,
    accentHex: 0xfacc15,
    massKg: 1240,
    enginePowerN: 17800,
    topSpeedMs: 75, // 270 km/h
    brakeForceN: 25200,
    baseGrip: 1.24,
    driftSlipFactor: 1.05,
    aeroDownforce: 1.15,
    stats: { speed: 85, handling: 99, acceleration: 94, drift: 88 },
  },
  {
    id: 'muscle-v8',
    name: 'Nitro Muscle V8',
    subtitle: 'Masivní osmiválec s obřím krouticím momentem a dlouhými drifty',
    colorHex: 0xa855f7,
    accentHex: 0xf472b6,
    massKg: 1420,
    enginePowerN: 19800,
    topSpeedMs: 81, // 292 km/h
    brakeForceN: 22500,
    baseGrip: 0.98,
    driftSlipFactor: 1.28,
    aeroDownforce: 1.0,
    stats: { speed: 94, handling: 80, acceleration: 95, drift: 95 },
  },
];

export const AI_DRIVER_NAMES = [
  'Novák GP',
  'Kovář RS',
  'Dvořák Aero',
  'Svoboda V10',
  'Černý Drift',
  'Procházka GT',
  'Kučera Turbo',
];

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

  longitudinalG: number;
  lateralG: number;
  frontAxleLoadRatio: number;
  chassisPitch: number;
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
  lap: number;
  maxCheckpointPassed: number;
  totalDistanceDriven: number;
  currentLapTimeMs: number;
  bestLapTimeMs: number | null;
  lastLapTimeMs: number | null;
  finished: boolean;
  finishTimeMs: number | null;

  lastImpactSeverity: number;
}

const GEAR_SPEED_THRESHOLDS_MS = [0, 14, 26, 39, 53, 68, 92];

export function createInitialCarState(
  id: string,
  name: string,
  isPlayer: boolean,
  spec: CarSpec,
  startT: number,
  lateralGridOffset: number
): CarState {
  const samples = getTrackSamples();
  const count = samples.length;
  const wrappedT = ((startT % 1) + 1) % 1;
  const idx = Math.floor(wrappedT * count) % count;
  const pt = samples[idx];

  const x = pt.x + pt.nx * lateralGridOffset;
  const z = pt.z + pt.nz * lateralGridOffset;

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
    rpm: 1050,
    gear: 1,
    nitroAmount: 100,
    nitroActive: false,
    longitudinalG: 0,
    lateralG: 0,
    frontAxleLoadRatio: 0.5,
    chassisPitch: 0,
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
    lap: 1,
    maxCheckpointPassed: 0,
    totalDistanceDriven: startT * getTrackTotalLength(),
    currentLapTimeMs: 0,
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
  // Tapping A/D begins with gentle precision steering; holding A/D progressively builds steering lock.
  const absSpeed = Math.hypot(forwardSpeed, lateralSpeed);
  if (Math.abs(input.steer) > 0.05) {
    // Check if player reversed steering direction
    if (
      state.steerInputSmooth !== 0 &&
      Math.sign(input.steer) !== Math.sign(state.steerInputSmooth)
    ) {
      state.steerHoldTime = 0;
    }
    state.steerHoldTime = Math.min(1.0, state.steerHoldTime + dt * 2.4);
    // Non-linear progressive curve: starts at 32% authority on tap, ramps smoothly to 100% as held
    const holdAuthority = 0.32 + 0.68 * (state.steerHoldTime * state.steerHoldTime);
    const desiredSteer = input.steer * holdAuthority;
    const turnInRate = state.isPlayer ? 6.8 : 11.0;
    state.steerInputSmooth +=
      (desiredSteer - state.steerInputSmooth) * (1 - Math.exp(-turnInRate * dt));
  } else {
    state.steerHoldTime = Math.max(0, state.steerHoldTime - dt * 5.0);
    // Quick self-centering caster return when key is released
    state.steerInputSmooth *= Math.exp(-13 * dt);
    if (Math.abs(state.steerInputSmooth) < 0.005) state.steerInputSmooth = 0;
  }

  // Realistic high-speed steering reduction (at 200+ km/h you cannot turn the wheels 30 degrees)
  const maxSteerRad = (state.isPlayer ? 0.38 : 0.46) * tuning.steeringSensitivity;
  const speedSteerFactor = 1 / (1 + Math.max(0, absSpeed - 9) * 0.042);
  const targetSteerAngle = state.steerInputSmooth * maxSteerRad * speedSteerFactor;
  const rackRate = 1 - Math.exp(-11 * dt);
  state.steerAngle += (targetSteerAngle - state.steerAngle) * rackRate;

  // 4. Longitudinal forces
  let driveForce = 0;
  let brakeForce = 0;

  const isReversing =
    input.brake > 0.1 && input.throttle < 0.1 && forwardSpeed < 1.2;

  if (isReversing) {
    driveForce = -input.brake * state.spec.enginePowerN * 0.55;
  } else {
    if (input.throttle > 0) {
      const speedRatio = Math.max(0, forwardSpeed) / state.spec.topSpeedMs;
      const torqueCurve = Math.max(0.18, 1.34 - speedRatio * 0.92);
      driveForce = input.throttle * state.spec.enginePowerN * torqueCurve;
    }
    if (input.brake > 0 && forwardSpeed > -0.5) {
      brakeForce = input.brake * state.spec.brakeForceN;
    }
  }

  // Nitro boost
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
    const rechargeRate = state.isDrifting ? 16 : 4.8;
    state.nitroAmount = Math.min(100, state.nitroAmount + rechargeRate * dt);
  }

  if (input.handbrake && Math.abs(forwardSpeed) > 0.5) {
    brakeForce += state.spec.brakeForceN * 0.55;
  }

  const aeroDrag = 0.42 * forwardSpeed * Math.abs(forwardSpeed);
  const isAwd = state.spec.id === 'rallye-evo';
  const surfaceRollingMult =
    state.surface === 'grass'
      ? isAwd
        ? 2.8
        : 5.5
      : state.surface === 'kerb'
      ? 1.25
      : 1.0;
  const rollingResistance = 240 * surfaceRollingMult * forwardSpeed;

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
      state.spec.topSpeedMs * (canUseNitro ? 1.14 : 1.02),
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

  // 6. Lateral Tire Grip, High-Speed Understeer & Drift Physics
  const surfaceGripMult =
    state.surface === 'grass'
      ? isAwd
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
  const weatherGrip = (tuning.weatherGripMultiplier ?? 1.0) * weatherGripMultiplier;

  const effectiveGrip =
    state.spec.baseGrip *
    trackDef.gripFactor *
    tuning.tireGripMultiplier *
    surfaceGripMult *
    assistGripMult *
    weatherGrip;

  // Front axle authority increases under trail-braking and decreases under full-throttle high-speed entry (understeer)
  const understeerPenalty =
    1 / (1 + Math.max(0, Math.abs(newForwardSpeed) - 32) * 0.018);
  const frontGripAuthority =
    (0.78 + state.frontAxleLoadRatio * 0.44) * understeerPenalty;

  const wheelbase = 2.72;
  const speedForTurn =
    Math.abs(newForwardSpeed) < 0.4
      ? 0
      : Math.sign(newForwardSpeed) * Math.min(Math.abs(newForwardSpeed), 28);
  let targetYawRate =
    (speedForTurn / wheelbase) * Math.tan(state.steerAngle) * frontGripAuthority;

  const rearSlipTrigger =
    input.handbrake ||
    (Math.abs(state.steerInputSmooth) > 0.55 &&
      Math.abs(newForwardSpeed) > 20 &&
      (tuning.assistMode === 'drift' || state.spec.driftSlipFactor > 1.1));

  if (rearSlipTrigger && Math.abs(newForwardSpeed) > 8) {
    const oversteerBoost = input.handbrake
      ? 1.38
      : 1.12 * state.spec.driftSlipFactor;
    targetYawRate *= oversteerBoost;
  }

  // Cap maximum angular velocity by tire lateral grip limit (prevents unrealistic instant spinning)
  const maxLatAccelMs2 = (12.5 + state.spec.aeroDownforce * 2.2) * effectiveGrip;
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
  let newLateralSpeed = lateralSpeed - newForwardSpeed * state.yawRate * dt * 0.42;
  const corneringStiffness = rearSlipTrigger
    ? (3.2 / state.spec.driftSlipFactor) * effectiveGrip
    : (9.2 / state.spec.driftSlipFactor) * effectiveGrip;
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

  if (postQuery.barrierHit && postQuery.barrierPenetration > 0) {
    const sign = postQuery.barrierHit === 'right' ? 1 : -1;
    const clampedOffset = sign * (barrierHalfWidth - 0.15);
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
    (targetPitch - state.chassisPitch) * springK - state.pitchVelocity * damperC;
  state.pitchVelocity += pitchAccel * dt;
  state.chassisPitch += state.pitchVelocity * dt;

  const rollAccel =
    (targetRoll - state.chassisRoll) * springK - state.rollVelocity * damperC;
  state.rollVelocity += rollAccel * dt;
  state.chassisRoll += state.rollVelocity * dt;

  // Kerb high-frequency vibration
  if (state.surface === 'kerb' && state.speedKmh > 15) {
    state.kerbRumble = Math.sin(state.totalDistanceDriven * 3.2) * 0.015;
  } else {
    state.kerbRumble = 0;
  }

  // 10. Slip Angle & Drift Scoring
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

  // 11. Automatic 6-Speed Gearbox & Engine RPM
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
    980 + gearFraction * 6600 + (input.throttle > 0.2 ? 420 : 0);
  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-15 * dt));

  const wheelRadius = 0.34;
  state.wheelRotation += (state.forwardSpeed / wheelRadius) * dt;

  // 12. Lap & Checkpoint Progression
  if (!state.finished) {
    state.currentLapTimeMs += dt * 1000;
  }

  const prevT = state.trackProgressT;
  const newT = postQuery.t;

  if (newT > 0.2 && newT < 0.45 && state.maxCheckpointPassed === 0) {
    state.maxCheckpointPassed = 1;
  } else if (newT >= 0.45 && newT < 0.72 && state.maxCheckpointPassed === 1) {
    state.maxCheckpointPassed = 2;
  } else if (newT >= 0.72 && state.maxCheckpointPassed === 2) {
    state.maxCheckpointPassed = 3;
  }

  if (prevT > 0.85 && newT < 0.15 && state.forwardSpeed > 0) {
    if (state.maxCheckpointPassed >= 2) {
      state.lastLapTimeMs = state.currentLapTimeMs;
      if (
        state.bestLapTimeMs === null ||
        state.currentLapTimeMs < state.bestLapTimeMs
      ) {
        state.bestLapTimeMs = state.currentLapTimeMs;
      }
      state.currentLapTimeMs = 0;
      state.maxCheckpointPassed = 0;

      if (state.lap >= totalLaps) {
        state.finished = true;
        state.finishTimeMs =
          (state.bestLapTimeMs ?? state.lastLapTimeMs ?? 45000) * totalLaps;
      } else {
        state.lap += 1;
      }
    }
  }

  state.trackProgressT = newT;
  const trackLen = getTrackTotalLength();
  state.totalDistanceDriven = (state.lap - 1 + state.trackProgressT) * trackLen;

  return postQuery;
}

export function computeAiInput(
  aiState: CarState,
  laneOffsetTarget: number,
  difficultyPace = 0.86
): CarInput {
  const samples = getTrackSamples();
  const count = samples.length;
  const lookAheadSteps = Math.max(
    10,
    Math.min(26, Math.round(aiState.forwardSpeed * 0.38))
  );
  const targetIdx = (aiState.trackSampleIndex + lookAheadSteps) % count;
  const targetPt = samples[targetIdx];

  const aimX = targetPt.x + targetPt.nx * laneOffsetTarget;
  const aimZ = targetPt.z + targetPt.nz * laneOffsetTarget;

  const dx = aimX - aiState.x;
  const dz = aimZ - aiState.z;
  const desiredHeading = Math.atan2(dx, dz);

  let headingError = desiredHeading - aiState.heading;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;

  const steer = Math.max(-1, Math.min(1, headingError * 2.3));

  const upcomingCurvature = Math.abs(targetPt.curvature);
  const safeCornerSpeed =
    upcomingCurvature > 0.14 ? 38 : upcomingCurvature > 0.08 ? 52 : 85;
  const targetSpeed =
    Math.min(aiState.spec.topSpeedMs, safeCornerSpeed) * difficultyPace;

  const throttle = aiState.forwardSpeed < targetSpeed ? 0.94 : 0.2;
  const brake = aiState.forwardSpeed > targetSpeed + 7 ? 0.65 : 0;
  const nitro =
    upcomingCurvature < 0.04 &&
    aiState.forwardSpeed > 32 &&
    aiState.nitroAmount > 65;

  return {
    throttle,
    brake,
    steer,
    handbrake: false,
    nitro,
  };
}

export function computeRaceStandings(cars: CarState[]): CarState[] {
  return [...cars].sort(
    (a, b) => b.totalDistanceDriven - a.totalDistanceDriven
  );
}
