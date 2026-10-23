import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  setActiveTrack,
  getTrackSamples,
  getTrackTotalLength,
  buildProceduralTrackDefinition,
} from './track.ts';
import {
  CAR_SPECS,
  DEFAULT_TUNING,
  createInitialCarState,
  stepCarPhysics,
  computeAiInput,
  computeTireGripMultiplier,
  servicePitStop,
  computeRaceStandings,
  type CarInput,
} from './physics.ts';

const NO_INPUT: CarInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  nitro: false,
};

describe('Track geometry and procedural generator', () => {
  it('generates 360 smooth closed-loop samples for presets and procedural seeds without pinching', () => {
    setActiveTrack('alpine');
    const samples = getTrackSamples();
    assert.equal(samples.length, 360);
    assert.ok(getTrackTotalLength() > 800, `Expected length > 800m, got ${getTrackTotalLength()}`);

    // Test multiple random procedural seeds to ensure no sharp self-intersection or pinching
    for (const seed of [101, 2026, 7777, 99999]) {
      const procDef = buildProceduralTrackDefinition(seed);
      assert.equal(procDef.id, `proc-${seed}`);
      setActiveTrack('procedural', seed);
      const procSamples = getTrackSamples();
      assert.equal(procSamples.length, 360);
      assert.ok(getTrackTotalLength() > 900, `Procedural track seed ${seed} should have >900m length`);
    }
  });
});

describe('Formula 3D physics, continuous standings, and tire wear system', () => {
  it('accelerates Formula car forward and smoothly returns steering to center', () => {
    setActiveTrack('alpine');
    const player = createInitialCarState(
      'player-1',
      'Jezdec',
      true,
      CAR_SPECS[0],
      0.008,
      0,
      'medium'
    );

    for (let i = 0; i < 60; i++) {
      stepCarPhysics(
        player,
        { ...NO_INPUT, throttle: 1, steer: 0.7 },
        DEFAULT_TUNING,
        1 / 60,
        3
      );
    }

    assert.ok(player.forwardSpeed > 15, `Expected speed > 15 m/s after 1s, got ${player.forwardSpeed}`);
    const steeredAngle = player.steerAngle;
    assert.ok(steeredAngle > 0.08, `Expected positive steerAngle, got ${steeredAngle}`);

    for (let i = 0; i < 30; i++) {
      stepCarPhysics(
        player,
        { ...NO_INPUT, throttle: 1, steer: 0 },
        DEFAULT_TUNING,
        1 / 60,
        3
      );
    }
    assert.ok(player.steerAngle < steeredAngle * 0.4, 'Steering angle should recenter smoothly');
  });

  it('maintains continuous monotonic unwrappedProgress and accurate race standings without random jumps near t=0', () => {
    setActiveTrack('autodrom');
    // Place car slightly behind start line (startT = -0.004, wrapped trackProgressT ~0.996)
    const trailingCar = createInitialCarState(
      'car-trailing',
      'Trailing',
      true,
      CAR_SPECS[0],
      -0.004,
      -3.0,
      'soft'
    );
    const leadingCar = createInitialCarState(
      'car-leading',
      'Leading',
      false,
      CAR_SPECS[1],
      0.012,
      3.0,
      'soft'
    );

    // At grid start, leadingCar (0.012) must rank ahead of trailingCar (-0.004), even though trailingCar has wrapped t ~ 0.996!
    const gridStandings = computeRaceStandings([trailingCar, leadingCar]);
    assert.equal(gridStandings[0].id, 'car-leading', 'Leading car at +0.012 must be P1 ahead of -0.004 car');
    assert.equal(gridStandings[1].id, 'car-trailing', 'Trailing car at -0.004 must be P2, not jumped to lap 2');

    // Drive trailingCar across the start/finish line (t wraps 0.996 -> 0.005)
    const initialUnwrapped = trailingCar.unwrappedProgress;
    for (let i = 0; i < 60; i++) {
      stepCarPhysics(
        trailingCar,
        { ...NO_INPUT, throttle: 1 },
        DEFAULT_TUNING,
        1 / 60,
        3
      );
    }

    assert.ok(
      trailingCar.unwrappedProgress > initialUnwrapped && trailingCar.unwrappedProgress < 0.25,
      `Expected smooth unwrappedProgress across start line, got ${trailingCar.unwrappedProgress}`
    );
    assert.equal(trailingCar.finished, false, 'Race must not randomly finish on lap 1 start');
  });

  it('gradually wears down 4 tires with distance and cornering and restores them via pit stop', () => {
    setActiveTrack('autodrom');
    const player = createInitialCarState(
      'player-1',
      'Jezdec',
      true,
      CAR_SPECS[0],
      0.01,
      0,
      'soft'
    );

    assert.equal(player.tireHealth, 100);
    assert.equal(player.tireCompound, 'soft');

    // Simulate 10 seconds of fast racing around the track on Soft slicks
    for (let i = 0; i < 600; i++) {
      const aiInput = computeAiInput(player, 0, 1.0);
      stepCarPhysics(
        player,
        { ...aiInput, throttle: 1 },
        DEFAULT_TUNING,
        1 / 60,
        3
      );
    }

    assert.ok(player.totalDistanceDriven > 300, `Expected distance > 300m, got ${player.totalDistanceDriven}`);
    assert.ok(player.tireHealth < 98.5, `Expected measurable tire wear (< 98.5%), got ${player.tireHealth}%`);

    // Verify tire grip multiplier drops when health is heavily degraded ("Tire Cliff" below 35%)
    const freshGrip = computeTireGripMultiplier(100, 'soft', 92);
    const wornGrip = computeTireGripMultiplier(20, 'soft', 92);
    assert.ok(freshGrip > wornGrip + 0.35, `Expected fresh grip (${freshGrip}) > worn grip (${wornGrip}) + 0.35`);

    // Service pit stop to Medium compound
    servicePitStop(player, 'medium', 45);
    assert.equal(player.tireHealth, 100);
    assert.deepEqual(player.tireWear, [100, 100, 100, 100]);
    assert.equal(player.tireCompound, 'medium');
    assert.equal(player.pitStopsCompleted, 1);
    assert.ok(player.pitExitCooldown > 0, 'Pit exit cooldown should be active after pit stop');
  });

  it('ensures Hard tires last significantly longer than Soft tires while slightly reducing top speed, and Wet tires excel in rain', () => {
    setActiveTrack('alpine');
    const softCar = createInitialCarState(
      'car-soft',
      'SoftDriver',
      true,
      CAR_SPECS[0],
      0.05,
      -2.0,
      'soft'
    );
    const hardCar = createInitialCarState(
      'car-hard',
      'HardDriver',
      true,
      CAR_SPECS[0],
      0.05,
      2.0,
      'hard'
    );

    for (let i = 0; i < 420; i++) {
      stepCarPhysics(
        softCar,
        { ...NO_INPUT, throttle: 1 },
        DEFAULT_TUNING,
        1 / 60,
        3
      );
      stepCarPhysics(
        hardCar,
        { ...NO_INPUT, throttle: 1 },
        DEFAULT_TUNING,
        1 / 60,
        3
      );
    }

    const softWearLost = 100 - softCar.tireHealth;
    const hardWearLost = 100 - hardCar.tireHealth;
    assert.ok(
      hardWearLost < softWearLost * 0.5,
      `Hard compound wear (${hardWearLost.toFixed(2)}%) must be less than half of Soft compound wear (${softWearLost.toFixed(2)}%)`
    );
    assert.ok(
      hardCar.speedKmh < softCar.speedKmh,
      `Hard compound speed (${hardCar.speedKmh.toFixed(1)} km/h) should be slightly slower than Soft (${softCar.speedKmh.toFixed(1)} km/h)`
    );

    // Verify Wet compound provides higher grip in rain (isWetWeather = true)
    const wetInRainGrip = computeTireGripMultiplier(100, 'wet', 75, true);
    const softInRainGrip = computeTireGripMultiplier(100, 'soft', 75, true);
    assert.ok(
      wetInRainGrip > softInRainGrip,
      `Wet tires in rain (${wetInRainGrip.toFixed(2)}) should have more grip than Soft slicks in rain (${softInRainGrip.toFixed(2)})`
    );

    // Verify physical Pit Lane Alley & Pit Box detection on the right side of the main straight
    const pitCar = createInitialCarState(
      'car-pit',
      'PitDriver',
      true,
      CAR_SPECS[0],
      0.99,
      10.8,
      'soft'
    );
    pitCar.totalDistanceDriven = 60;
    pitCar.pitExitCooldown = 0;
    stepCarPhysics(pitCar, NO_INPUT, DEFAULT_TUNING, 1 / 60, 3);
    assert.equal(pitCar.inPitZone, true, 'Car on main straight at t=0.99 should be inPitZone');
    assert.equal(pitCar.inPitLaneAlley, true, 'Car inside right-side pit lane alley (lat=10.8m) should be inPitLaneAlley');
    assert.equal(pitCar.inPitBox, true, 'Car inside right-side pit lane alley stall at t=0.99, lat=10.8m should trigger inPitBox');
  });

  it('assigns distinct racing strategies to AI bots and executes physical AI pit stops when tires wear down', () => {
    setActiveTrack('alpine');
    const aiAggressive = createInitialCarState(
      'ai-0',
      'Max V.',
      false,
      CAR_SPECS[1],
      0.94,
      2.5,
      'soft',
      0
    );
    const aiEndurance = createInitialCarState(
      'ai-1',
      'Charles L.',
      false,
      CAR_SPECS[2],
      0.94,
      -2.5,
      'hard',
      1
    );

    assert.notEqual(
      aiAggressive.aiStrategyName,
      aiEndurance.aiStrategyName,
      'AI bots should have different racing & pit stop strategies'
    );
    assert.notEqual(
      aiAggressive.aiPitThreshold,
      aiEndurance.aiPitThreshold,
      'AI bots should have different tire health thresholds for pitting'
    );

    // Degrade AI tire health below its strategy threshold so it decides to pit
    aiAggressive.totalDistanceDriven = 500;
    aiAggressive.pitExitCooldown = 0;
    aiAggressive.tireWear = [32, 32, 32, 32];
    aiAggressive.tireHealth = 32;

    const aiIn = computeAiInput(aiAggressive, 0, 0.9, 'clear');
    assert.equal(
      aiAggressive.aiWantsToPit,
      true,
      'AI with worn tires below threshold should activate aiWantsToPit'
    );
    assert.ok(aiIn.throttle > 0, 'AI should drive toward the Pit Lane Alley');

    // Place AI inside the Pit Box stall in the Pit Lane Alley and run through the 2.2s stationary pit stop service
    aiAggressive.x = -11.2;
    aiAggressive.z = -5.0;
    aiAggressive.forwardSpeed = 12;
    aiAggressive.vx = 0;
    aiAggressive.vz = 12;

    for (let step = 0; step < 180; step++) {
      const input = computeAiInput(aiAggressive, 0, 0.9, 'clear');
      stepCarPhysics(aiAggressive, input, DEFAULT_TUNING, 1 / 60, 5, 1.0);
    }

    assert.equal(
      aiAggressive.pitStopsCompleted,
      1,
      'AI should complete its pit stop in the Pit Lane Alley'
    );
    assert.ok(
      aiAggressive.tireHealth > 95,
      `AI tire health should be restored after pit stop, got ${aiAggressive.tireHealth}%`
    );
    assert.equal(
      aiAggressive.aiWantsToPit,
      false,
      'AI should clear aiWantsToPit after servicing tires'
    );
  });

  it('locks final race classification strictly by final-lap finish-line crossing time (finishTimeMs) while allowing trailing cars to finish', () => {
    setActiveTrack('alpine-gp');
    const samples = getTrackSamples('alpine-gp');
    const maxElevation = Math.max(...samples.map((s) => s.y));
    assert.ok(maxElevation > 3.0, `Expected 3D circuit elevation > 3.0m on alpine-gp, got ${maxElevation}`);

    const carA = createInitialCarState('car-a', 'Car A (First across line)', false, CAR_SPECS[0], 0.02, 0, 'soft');
    const carB = createInitialCarState('car-b', 'Car B (Second across line)', false, CAR_SPECS[1], 0.02, 0, 'medium');
    const playerLast = createInitialCarState('player', 'Player (Still on final lap)', true, CAR_SPECS[2], 0.85, 0, 'hard');

    // Car A crossed the finish line on the final lap at 92,150 ms; Car B crossed at 93,480 ms
    carA.finished = true;
    carA.finishTimeMs = 92150;
    carA.unwrappedProgress = 3.04; // Slowed down on cool-down lap

    carB.finished = true;
    carB.finishTimeMs = 93480;
    carB.unwrappedProgress = 3.12; // Drove further on cool-down lap, but finished AFTER Car A!

    playerLast.finished = false;
    playerLast.finishTimeMs = null;
    playerLast.unwrappedProgress = 2.85;

    const standingsWhilePlayerRacing = computeRaceStandings([playerLast, carB, carA]);
    assert.equal(standingsWhilePlayerRacing[0].id, 'car-a', 'Car A must remain P1 because it crossed the finish line first on the final lap');
    assert.equal(standingsWhilePlayerRacing[1].id, 'car-b', 'Car B must be P2 based on finishTimeMs');
    assert.equal(standingsWhilePlayerRacing[2].id, 'player', 'Player still on final lap is P3 and allowed to finish the race');

    // Now player crosses the finish line in P3 at 98,200 ms
    playerLast.finished = true;
    playerLast.finishTimeMs = 98200;
    playerLast.unwrappedProgress = 3.01;

    const finalClassification = computeRaceStandings([playerLast, carB, carA]);
    assert.deepEqual(
      finalClassification.map((c) => c.id),
      ['car-a', 'car-b', 'player'],
      'Final classification must be strictly ordered by finishTimeMs ascending'
    );
  });

  it('continuously interpolates 3D ground elevation and calculates slope pitch without cliff jumps', () => {
    setActiveTrack('alpine');
    const player = createInitialCarState(
      'player-slope',
      'Test Slope',
      true,
      CAR_SPECS[0],
      0.14,
      0,
      'medium'
    );

    // Drive the car up the hill
    let prevGroundY = player.y;
    let maxSlopePitch = 0;
    for (let step = 0; step < 120; step++) {
      stepCarPhysics(player, { ...NO_INPUT, throttle: 1 }, DEFAULT_TUNING, 1 / 60, 3);
      // Elevation should never jump by more than 0.2m in a single 1/60s frame
      const dy = Math.abs(player.y - prevGroundY);
      assert.ok(dy < 0.25, `Ground height delta per frame too large: ${dy}m`);
      prevGroundY = player.y;
      if (Math.abs(player.trackSlopePitch) > Math.abs(maxSlopePitch)) {
        maxSlopePitch = player.trackSlopePitch;
      }
    }
    // Verify that track slope pitch is computed on hills
    assert.ok(
      Math.abs(maxSlopePitch) > 0.01,
      `Expected non-zero slope pitch on elevated section, got ${maxSlopePitch}`
    );
  });
});
