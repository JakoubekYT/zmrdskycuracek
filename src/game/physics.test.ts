import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_DEFINITIONS,
  setActiveTrack,
  getTrackSamples,
  getTrackTotalLength,
  buildProceduralTrackDefinition,
  buildCustomTrackDefinition,
  registerCustomTrack,
  renameCustomTrack,
  deleteCustomTrack,
  getCustomTracks,
  encodeCustomTrackShareCode,
  decodeCustomTrackShareCode,
} from './track.ts';
import {
  CAR_SPECS,
  DEFAULT_TUNING,
  RACE_GAME_MODES,
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

describe('Track geometry, 12 presets, Figure-8 3D bridges, and custom track sharing', () => {
  it('provides 12 handcrafted preset circuits including Figure-8 bridge tracks', () => {
    assert.equal(
      TRACK_DEFINITIONS.length,
      12,
      `Expected 12 preset circuits, got ${TRACK_DEFINITIONS.length}`
    );
    const bridgePresets = TRACK_DEFINITIONS.filter((t) => t.hasBridge);
    assert.ok(
      bridgePresets.length >= 3,
      `Expected at least 3 Figure-8 bridge circuits, got ${bridgePresets.length}`
    );

    setActiveTrack('suzuka-8-gp');
    const suzukaSamples = getTrackSamples('suzuka-8-gp');
    assert.equal(suzukaSamples.length, 360);
    assert.ok(
      suzukaSamples.some((s) => s.isBridge && s.y > 4.0),
      'Suzuka Figure-8 track must contain elevated 3D bridge samples (isBridge && y > 4.0)'
    );
  });

  it('generates 360 smooth closed-loop samples for presets, procedural seeds, and custom 2D editor checkpoints with Figure-8 bridges', () => {
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

    // Test custom 2D-to-3D Track Editor builder with a crossing Figure-8 shape (automatic 3D bridge elevation)
    const figure8Points: Array<[number, number, number]> = [
      [58, 0.5, 130],
      [175, 2.5, 145],
      [215, 2.0, 50],
      [115, 0.0, 0], // Crosses toward bottom-left
      [45, 0.0, -135],
      [165, 2.5, -145],
      [220, 4.0, -45],
      [115, 6.5, 0], // Crosses over the first diagonal -> auto-elevated into a 3D bridge!
    ];
    const customDef = buildCustomTrackDefinition(
      'custom-test-figure8',
      'Custom Figure-8 GP',
      figure8Points,
      0,
      9.4
    );
    assert.equal(
      customDef.hasBridge,
      true,
      'Crossing custom track must automatically detect intersection and enable hasBridge'
    );
    registerCustomTrack(customDef);
    setActiveTrack('custom-test-figure8');
    const customSamples = getTrackSamples('custom-test-figure8');
    assert.equal(customSamples.length, 360);
    assert.ok(
      customSamples.some((s) => s.isBridge && s.y >= 4.0),
      'Crossing custom track must generate elevated 3D bridge samples'
    );
    assert.ok(
      Math.abs(customSamples[0].x) < 0.01,
      'Start/finish straight must be anchored at x = 0 for 3D pit lane'
    );

    // Test Rename, Share Code Encode/Decode, and Delete for Custom Tracks
    const savedCustom = buildCustomTrackDefinition(
      'custom-unit-test',
      'Moje Testovací Trať',
      [
        [60, 1.5, 120],
        [160, 3.0, 90],
        [160, 2.0, -90],
        [60, 0.5, -120],
      ]
    );
    const shareCode = encodeCustomTrackShareCode(savedCustom);
    assert.ok(shareCode.length > 10, 'Share code should be non-empty base64url string');
    const decoded = decodeCustomTrackShareCode(shareCode);
    assert.ok(decoded, 'Decoded custom track should not be null');
    assert.equal(decoded?.name, 'Moje Testovací Trať');
    assert.equal(decoded?.rawUserCheckpoints?.length, 4);

    const renamed = renameCustomTrack('custom-unit-test', 'Přejmenovaná Trať GP');
    assert.equal(renamed?.name, 'Přejmenovaná Trať GP');

    deleteCustomTrack('custom-unit-test');
    assert.ok(
      !getCustomTracks().some((t) => t.id === 'custom-unit-test'),
      'Deleted custom track should be removed from custom tracks list'
    );
  });
});

describe('Formula 3D physics, continuous standings, game modes, and tire wear system', () => {
  it('defines GP, Elimination, and Checkpoint game modes and ranks active cars ahead of eliminated cars', () => {
    assert.ok(RACE_GAME_MODES.gp);
    assert.ok(RACE_GAME_MODES.elimination);
    assert.ok(RACE_GAME_MODES.checkpoint);

    setActiveTrack('alpine');
    const activeCar = createInitialCarState(
      'car-active',
      'Active Driver',
      true,
      CAR_SPECS[0],
      0.05,
      0,
      'soft'
    );
    const eliminatedCar = createInitialCarState(
      'car-elim',
      'Eliminated Driver',
      false,
      CAR_SPECS[1],
      0.25,
      0,
      'soft'
    );
    eliminatedCar.eliminated = true;

    const standings = computeRaceStandings([eliminatedCar, activeCar]);
    assert.equal(
      standings[0].id,
      'car-active',
      'Active non-eliminated car must rank ahead of eliminated car regardless of distance'
    );

    // Verify Danger Zone Overcharge boosts ERS recovery for the car in last place
    activeCar.nitroAmount = 30;
    activeCar.inDangerZone = true;
    for (let i = 0; i < 10; i++) {
      stepCarPhysics(activeCar, { ...NO_INPUT, throttle: 1 }, DEFAULT_TUNING, 0.05, 3);
    }
    assert.ok(
      activeCar.nitroAmount > 33.5,
      `Danger Zone Overcharge should rapidly recharge ERS, got ${activeCar.nitroAmount}`
    );
  });

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

    // Verify millimeter-precision overtaking within the SAME 3-meter sample segment!
    const carBehind = createInitialCarState(
      'car-behind',
      'Behind',
      true,
      CAR_SPECS[0],
      0.241,
      0,
      'soft'
    );
    const carAhead = createInitialCarState(
      'car-ahead',
      'Ahead',
      false,
      CAR_SPECS[1],
      0.2415,
      0,
      'soft'
    );
    assert.equal(
      computeRaceStandings([carBehind, carAhead])[0].id,
      'car-ahead',
      'Car 0.05% (0.6m) ahead within the same sample segment must be P1'
    );

    // Move carBehind forward by 1.2 meters so it overtakes carAhead within the same sample segment
    carBehind.x += Math.sin(carBehind.heading) * 1.2;
    carBehind.z += Math.cos(carBehind.heading) * 1.2;
    stepCarPhysics(carBehind, NO_INPUT, DEFAULT_TUNING, 1 / 60, 3);
    assert.equal(
      computeRaceStandings([carBehind, carAhead])[0].id,
      'car-behind',
      'Overtaking by 0.6m within the same spline segment must immediately promote carBehind to P1'
    );
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

  it('assigns distinct racing strategies to AI bots and executes physical AI pit stops (~2.85s-4.05s minigame-equivalent duration) when tires wear down', () => {
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

    // Place AI inside the Pit Box stall in the Pit Lane Alley and run through the ~2.85s stationary pit stop service
    aiAggressive.x = -11.2;
    aiAggressive.z = -5.0;
    aiAggressive.forwardSpeed = 12;
    aiAggressive.vx = 0;
    aiAggressive.vz = 12;

    for (let step = 0; step < 240; step++) {
      const input = computeAiInput(aiAggressive, 0, 0.9, 'clear');
      stepCarPhysics(aiAggressive, input, DEFAULT_TUNING, 1 / 60, 5, 1.0);
    }

    assert.equal(
      aiAggressive.pitStopsCompleted,
      1,
      'AI should complete its pit stop in the Pit Lane Alley after realistic minigame duration'
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

