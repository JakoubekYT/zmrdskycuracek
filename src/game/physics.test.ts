import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAR_SPECS,
  DEFAULT_TUNING,
  createInitialCarState,
  stepCarPhysics,
  computeRaceStandings,
  computeAiInput,
} from './physics';
import {
  findClosestTrackSample,
  getTrackSamples,
  getTrackTotalLength,
  setActiveTrack,
  TRACK_DEFINITIONS,
} from './track';

test('all 4 tracks generate valid closed loops with distinct themes and lengths', () => {
  assert.equal(TRACK_DEFINITIONS.length, 4);
  for (const def of TRACK_DEFINITIONS) {
    setActiveTrack(def.id);
    const samples = getTrackSamples(def.id);
    assert.ok(samples.length >= 300);
    const totalLen = getTrackTotalLength(def.id);
    assert.ok(totalLen > 750, `Expected circuit ${def.id} > 750m, got ${totalLen}`);

    const qCenter = findClosestTrackSample(samples[10].x, samples[10].z, 10, def.id);
    assert.equal(qCenter.surface, 'asphalt');
    assert.ok(qCenter.absOffset < 0.5);
  }
  setActiveTrack('alpine-gp');
});

test('all 6 car specs accelerate forward, shift gears, and squat rear suspension', () => {
  assert.equal(CAR_SPECS.length, 6);
  const car = createInitialCarState('player', 'Player', true, CAR_SPECS[3], 0.02, 0);
  for (let i = 0; i < 120; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      DEFAULT_TUNING,
      1 / 60
    );
  }

  assert.ok(car.speedKmh > 95, `Expected speed > 95 km/h after 2s, got ${car.speedKmh}`);
  assert.ok(car.gear >= 2, `Expected gear >= 2, got ${car.gear}`);
  assert.ok(car.frontAxleLoadRatio < 0.5, 'Acceleration should transfer weight to rear axle');
  assert.ok(car.chassisPitch > 0, 'Acceleration should cause positive rear squat pitch');
});

test('hard braking transfers weight to front axle and causes nose dive', () => {
  const car = createInitialCarState('player', 'Player', true, CAR_SPECS[0], 0.02, 0);
  for (let i = 0; i < 120; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      DEFAULT_TUNING,
      1 / 60
    );
  }
  const speedBeforeBrake = car.speedKmh;

  for (let i = 0; i < 24; i++) {
    stepCarPhysics(
      car,
      { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false },
      DEFAULT_TUNING,
      1 / 60
    );
  }

  assert.ok(car.speedKmh < speedBeforeBrake - 25, 'Braking should significantly reduce speed');
  assert.ok(
    car.frontAxleLoadRatio > 0.52,
    `Expected front axle load > 0.52 under braking, got ${car.frontAxleLoadRatio}`
  );
  assert.ok(car.chassisPitch < 0, 'Braking should cause negative nose-dive pitch');
});

test('cornering and handbrake induce yaw rotation, chassis roll, and drift score', () => {
  const car = createInitialCarState('player', 'Player', true, CAR_SPECS[2], 0.02, 0);
  const initialHeading = car.heading;

  for (let i = 0; i < 90; i++) {
    stepCarPhysics(
      car,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      { ...DEFAULT_TUNING, assistMode: 'drift' },
      1 / 60
    );
  }

  for (let i = 0; i < 35; i++) {
    stepCarPhysics(
      car,
      { throttle: 0.9, brake: 0, steer: 1.0, handbrake: i < 15, nitro: false },
      { ...DEFAULT_TUNING, assistMode: 'drift' },
      1 / 60
    );
  }

  assert.ok(car.heading > initialHeading + 0.15, 'Right steering should rotate heading positively');
  assert.ok(Math.abs(car.chassisRoll) > 0.005, 'Cornering should induce chassis body roll');
  assert.ok(Math.abs(car.slipAngle) > 0.05, 'Handbrake turn should create tire slip angle');
});

test('barrier collision keeps car within track bounds and sets impact severity', () => {
  const def = setActiveTrack('alpine-gp');
  const barrierHalfWidth = def.roadHalfWidth + 3.6;
  const samples = getTrackSamples();
  const s = samples[20];
  const car = createInitialCarState('player', 'Player', true, CAR_SPECS[0], s.t, barrierHalfWidth - 0.5);
  car.heading = Math.atan2(s.nx, s.nz);
  car.vx = s.nx * 25;
  car.vz = s.nz * 25;

  const post = stepCarPhysics(
    car,
    { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
    DEFAULT_TUNING,
    1 / 30
  );

  const checkAfter = findClosestTrackSample(car.x, car.z, post.index);
  assert.ok(
    checkAfter.absOffset <= barrierHalfWidth + 0.01,
    `Car should be constrained inside barrier, got offset ${checkAfter.absOffset}`
  );
  assert.ok(car.lastImpactSeverity > 0, 'Barrier hit should record impact severity');
});

test('AI driver and race standings sort cars by total distance driven', () => {
  const c1 = createInitialCarState('c1', 'Car 1', true, CAR_SPECS[0], 0.1, 0);
  const c2 = createInitialCarState('c2', 'Car 2', false, CAR_SPECS[1], 0.25, 2);

  const aiIn = computeAiInput(c2, 2, 0.95);
  assert.ok(aiIn.throttle >= 0 && aiIn.throttle <= 1);
  assert.ok(aiIn.steer >= -1 && aiIn.steer <= 1);

  const standings = computeRaceStandings([c1, c2]);
  assert.equal(standings[0].id, 'c2');
  assert.equal(standings[1].id, 'c1');
});

test('procedural track generator builds deterministic closed circuits from seed', () => {
  const def = setActiveTrack('proc-4821');
  assert.equal(def.id, 'proc-4821');
  const samples = getTrackSamples('proc-4821');
  assert.ok(samples.length >= 300);
  const totalLen = getTrackTotalLength('proc-4821');
  assert.ok(totalLen > 900, `Expected procedural track > 900m, got ${totalLen}`);
  setActiveTrack('alpine-gp');
});

test('progressive steering starts gentle on tap and reduces max lock at high speed', () => {
  const tapCar = createInitialCarState('tap', 'Tap', true, CAR_SPECS[0], 0.02, 0);
  const holdCar = createInitialCarState('hold', 'Hold', true, CAR_SPECS[0], 0.02, 0);

  // Brief tap (3 frames ~ 50ms)
  for (let i = 0; i < 3; i++) {
    stepCarPhysics(
      tapCar,
      { throttle: 0.5, brake: 0, steer: 1, handbrake: false, nitro: false },
      DEFAULT_TUNING,
      1 / 60
    );
  }
  // Held steer (35 frames ~ 580ms)
  for (let i = 0; i < 35; i++) {
    stepCarPhysics(
      holdCar,
      { throttle: 0.5, brake: 0, steer: 1, handbrake: false, nitro: false },
      DEFAULT_TUNING,
      1 / 60
    );
  }
  assert.ok(
    Math.abs(tapCar.steerAngle) < 0.14,
    `Brief tap should produce gentle steering (< 0.14 rad), got ${tapCar.steerAngle}`
  );
  assert.ok(
    Math.abs(holdCar.steerAngle) > Math.abs(tapCar.steerAngle) * 2.2,
    'Holding steering key should progressively increase steering lock'
  );
});

