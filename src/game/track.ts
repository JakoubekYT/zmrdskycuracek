export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  angle: number;
  curvature: number;
  distance: number;
  t: number;
}

export type SurfaceType = 'asphalt' | 'kerb' | 'grass';

export interface TrackDefinition {
  id: string;
  name: string;
  subtitle: string;
  difficulty: string;
  roadHalfWidth: number;
  gripFactor: number;
  elevationScale?: number;
  isProcedural?: boolean;
  seed?: number;
  theme: {
    skyHex: number;
    fogHex: number;
    groundHex: number;
    asphaltHex: string;
    edgeLineHex: string;
    runoffColorA: string;
    runoffColorB: string;
    kerbColorA: string;
    kerbColorB: string;
    barrierHex: number;
    barrierEmissiveHex: number;
    foliageHex: number;
    sunLightHex: number;
    hemiSkyHex: number;
    hemiGroundHex: number;
  };
  waypoints: Array<[number, number, number]>;
}

export const TRACK_DEFINITIONS: TrackDefinition[] = [
  {
    id: 'alpine-gp',
    name: 'Alpský Autodrom GP',
    subtitle: 'Technický okruh F1 s rychlými esíčky, převýšením Eau Rouge a dlouhou DRS rovinkou',
    difficulty: 'Střední (F1 GP)',
    roadHalfWidth: 9.2,
    gripFactor: 1.0,
    elevationScale: 1.0,
    theme: {
      skyHex: 0x162642,
      fogHex: 0x1e3252,
      groundHex: 0x1e3a2a,
      asphaltHex: '#232934',
      edgeLineHex: '#f8fafc',
      runoffColorA: '#0284c7',
      runoffColorB: '#dc2626',
      kerbColorA: '#dc2626',
      kerbColorB: '#f8fafc',
      barrierHex: 0x94a3b8,
      barrierEmissiveHex: 0x000000,
      foliageHex: 0x2e6440,
      sunLightHex: 0xfff4d6,
      hemiSkyHex: 0x93c5fd,
      hemiGroundHex: 0x1e293b,
    },
    waypoints: [
      [0, 0, 0],
      [0, 0, 92],
      [34, 2.8, 156],
      [102, 6.5, 182],
      [174, 4.2, 154],
      [212, 1.0, 96],
      [182, -2.2, 28],
      [224, 3.6, -38],
      [202, 5.4, -116],
      [126, 2.0, -166],
      [48, 0.0, -168],
      [6, 0, -126],
      [0, 0, -68],
    ],
  },
  {
    id: 'tokyo-night',
    name: 'Neo Tokyo Bay GP',
    subtitle: 'Noční městský okruh F1 s osvětlenými nadjezdy, vracečkami a neonovou září',
    difficulty: 'Těžká (Městský)',
    roadHalfWidth: 9.4,
    gripFactor: 0.96,
    elevationScale: 0.9,
    theme: {
      skyHex: 0x070b16,
      fogHex: 0x090f20,
      groundHex: 0x0f172a,
      asphaltHex: '#181c26',
      edgeLineHex: '#38bdf8',
      runoffColorA: '#0891b2',
      runoffColorB: '#4f46e5',
      kerbColorA: '#06b6d4',
      kerbColorB: '#f8fafc',
      barrierHex: 0x1e293b,
      barrierEmissiveHex: 0x0284c7,
      foliageHex: 0x1e293b,
      sunLightHex: 0xbae6fd,
      hemiSkyHex: 0x38bdf8,
      hemiGroundHex: 0x090d1a,
    },
    waypoints: [
      [0, 0, 0],
      [0, 0, 84],
      [48, 3.5, 138],
      [118, 6.0, 122],
      [146, 3.2, 58],
      [96, -1.5, 12],
      [152, 2.8, -36],
      [202, 5.2, -98],
      [154, 2.4, -162],
      [78, 0.0, -150],
      [42, 0.0, -98],
      [6, 0, -118],
      [0, 0, -64],
    ],
  },
  {
    id: 'desert-canyon',
    name: 'Sonora Canyon GP',
    subtitle: 'Rychlý pouštní okruh F1 s klopenými zatáčkami, horizonty a dlouhými rovinkami',
    difficulty: 'Lehká (Maximální rychlost)',
    roadHalfWidth: 9.8,
    gripFactor: 1.02,
    elevationScale: 1.1,
    theme: {
      skyHex: 0x3b1d16,
      fogHex: 0x452118,
      groundHex: 0x6b3e26,
      asphaltHex: '#282320',
      edgeLineHex: '#fef08a',
      runoffColorA: '#d97706',
      runoffColorB: '#7c2d12',
      kerbColorA: '#f59e0b',
      kerbColorB: '#fafaf9',
      barrierHex: 0xd97706,
      barrierEmissiveHex: 0x000000,
      foliageHex: 0x854d0e,
      sunLightHex: 0xfde68a,
      hemiSkyHex: 0xfdba74,
      hemiGroundHex: 0x451a03,
    },
    waypoints: [
      [0, 0, 0],
      [0, 0, 125],
      [48, 4.0, 198],
      [140, 7.2, 214],
      [226, 3.8, 162],
      [252, -2.0, 50],
      [234, 4.5, -78],
      [178, 6.0, -168],
      [86, 1.5, -182],
      [16, 0, -136],
      [0, 0, -72],
    ],
  },
  {
    id: 'nordic-ice',
    name: 'Nordic Glacier Ring',
    subtitle: 'Zasněžený polární okruh F1 s horskými převýšeními a technickými pasážemi',
    difficulty: 'Expert (Kluzký povrch)',
    roadHalfWidth: 9.5,
    gripFactor: 0.82,
    elevationScale: 1.0,
    theme: {
      skyHex: 0x1e293b,
      fogHex: 0x26354d,
      groundHex: 0xcbd5e1,
      asphaltHex: '#2f3d52',
      edgeLineHex: '#38bdf8',
      runoffColorA: '#0284c7',
      runoffColorB: '#e2e8f0',
      kerbColorA: '#0284c7',
      kerbColorB: '#f8fafc',
      barrierHex: 0x64748b,
      barrierEmissiveHex: 0x000000,
      foliageHex: 0x334155,
      sunLightHex: 0xe0f2fe,
      hemiSkyHex: 0xe2e8f0,
      hemiGroundHex: 0x334155,
    },
    waypoints: [
      [0, 0, 0],
      [0, 0, 78],
      [38, 3.2, 140],
      [108, 6.2, 160],
      [170, 2.5, 118],
      [158, -1.8, 40],
      [202, 3.8, -26],
      [174, 5.0, -108],
      [102, 1.6, -148],
      [30, 0, -136],
      [0, 0, -68],
    ],
  },
];

// Deterministic PRNG (Mulberry32) for procedural track generation synced by seed
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROCEDURAL_THEMES = [
  {
    label: 'Soumrak GT',
    skyHex: 0x1e1b4b,
    fogHex: 0x26215c,
    groundHex: 0x1e293b,
    asphaltHex: '#1f2430',
    edgeLineHex: '#f472b6',
    runoffColorA: '#db2777',
    runoffColorB: '#312e81',
    kerbColorA: '#ec4899',
    kerbColorB: '#f8fafc',
    barrierHex: 0x475569,
    barrierEmissiveHex: 0xdb2777,
    foliageHex: 0x312e81,
    sunLightHex: 0xfbcfe8,
    hemiSkyHex: 0x818cf8,
    hemiGroundHex: 0x0f172a,
  },
  {
    label: 'Zelené Peklo',
    skyHex: 0x0f291e,
    fogHex: 0x143627,
    groundHex: 0x143322,
    asphaltHex: '#22272e',
    edgeLineHex: '#fef08a',
    runoffColorA: '#15803d',
    runoffColorB: '#eab308',
    kerbColorA: '#16a34a',
    kerbColorB: '#f8fafc',
    barrierHex: 0x64748b,
    barrierEmissiveHex: 0x000000,
    foliageHex: 0x15803d,
    sunLightHex: 0xfef9c3,
    hemiSkyHex: 0x86efac,
    hemiGroundHex: 0x052e16,
  },
  {
    label: 'Rudý Kaňon',
    skyHex: 0x351614,
    fogHex: 0x451d1a,
    groundHex: 0x57261c,
    asphaltHex: '#292220',
    edgeLineHex: '#fdba74',
    runoffColorA: '#ea580c',
    runoffColorB: '#7c2d12',
    kerbColorA: '#ea580c',
    kerbColorB: '#fafaf9',
    barrierHex: 0xb45309,
    barrierEmissiveHex: 0x000000,
    foliageHex: 0x7c2d12,
    sunLightHex: 0xffedd5,
    hemiSkyHex: 0xfb923c,
    hemiGroundHex: 0x27100c,
  },
  {
    label: 'Cyber Arena',
    skyHex: 0x091624,
    fogHex: 0x0c1f33,
    groundHex: 0x0c1d2e,
    asphaltHex: '#151c28',
    edgeLineHex: '#22d3ee',
    runoffColorA: '#0891b2',
    runoffColorB: '#1e3a8a',
    kerbColorA: '#0891b2',
    kerbColorB: '#f0f9ff',
    barrierHex: 0x1e293b,
    barrierEmissiveHex: 0x06b6d4,
    foliageHex: 0x164e63,
    sunLightHex: 0xcffafe,
    hemiSkyHex: 0x38bdf8,
    hemiGroundHex: 0x082f49,
  },
];

/**
 * Deterministically generates a smooth, guaranteed non-self-intersecting closed-loop F1 circuit
 * with 3D elevation changes from any numeric seed.
 */
export function buildProceduralTrackDefinition(seed: number): TrackDefinition {
  const cleanSeed = Math.abs(Math.floor(seed)) % 999999 || 42107;
  const rand = mulberry32(cleanSeed);

  const theme =
    PROCEDURAL_THEMES[Math.floor(rand() * PROCEDURAL_THEMES.length)];
  const gripFactor = Number((0.94 + rand() * 0.1).toFixed(2));
  const roadHalfWidth = Number((9.2 + rand() * 0.8).toFixed(1));

  const numPts = 16;
  const rawRadii: number[] = [];
  const phase2 = rand() * Math.PI * 2;
  const phase3 = rand() * Math.PI * 2;
  const elevPhase = rand() * Math.PI * 2;
  const amp2 = 16 + rand() * 16;
  const amp3 = 10 + rand() * 14;

  for (let i = 0; i < numPts; i++) {
    const theta = (i / numPts) * Math.PI * 2;
    const jitter = (rand() - 0.5) * 18;
    const r =
      142 +
      Math.cos(theta * 2 + phase2) * amp2 +
      Math.sin(theta * 3 + phase3) * amp3 +
      jitter;
    rawRadii.push(Math.max(102, Math.min(182, r)));
  }

  const smoothRadii = [...rawRadii];
  for (let pass = 0; pass < 2; pass++) {
    const copy = [...smoothRadii];
    for (let i = 0; i < numPts; i++) {
      const prev = copy[(i - 1 + numPts) % numPts];
      const curr = copy[i];
      const next = copy[(i + 1) % numPts];
      smoothRadii[i] = prev * 0.25 + curr * 0.5 + next * 0.25;
    }
  }

  const r0 = smoothRadii[0];
  const centerX = r0;
  const centerZ = 10;

  const waypoints: Array<[number, number, number]> = [
    [0, 0, 0],
    [0, 0, 76],
  ];

  for (let i = 2; i < numPts - 1; i++) {
    const frac = (i - 1) / (numPts - 2);
    const angle = Math.PI * 0.78 - frac * Math.PI * 1.56;
    const r = smoothRadii[i];
    const wx = Math.round(centerX + Math.cos(angle) * r);
    const wz = Math.round(centerZ + Math.sin(angle) * r);
    // Smooth 3D elevation on back sectors while keeping pit straight flat at y=0
    const elevEnvelope = Math.sin(frac * Math.PI);
    const wy = Number(
      (Math.sin(frac * Math.PI * 2.5 + elevPhase) * 5.5 * elevEnvelope).toFixed(1)
    );
    waypoints.push([Math.max(38, wx), wy, wz]);
  }

  waypoints.push([0, 0, -70]);

  return {
    id: `proc-${cleanSeed}`,
    name: `Velká cena #${cleanSeed}`,
    subtitle: `Procedurální 3D okruh F1 (${theme.label}) · šířka ${Math.round(roadHalfWidth * 2)}m`,
    difficulty: `Seed #${cleanSeed}`,
    roadHalfWidth,
    gripFactor,
    elevationScale: 1.0,
    isProcedural: true,
    seed: cleanSeed,
    theme,
    waypoints,
  };
}

export interface TrackQueryResult {
  index: number;
  t: number;
  distanceAlongTrack: number;
  lateralOffset: number;
  absOffset: number;
  surface: SurfaceType;
  groundY: number;
  slopeAngle: number;
  trackAngle: number;
  curvature: number;
  closestPoint: Vec3;
  tangent: { x: number; z: number };
  normal: { x: number; z: number };
  barrierHit: 'left' | 'right' | null;
  barrierPenetration: number;
}

export const TRACK_ROAD_HALF_WIDTH = 9.2;
export const TRACK_KERB_WIDTH = 1.6;
export const TRACK_BARRIER_HALF_WIDTH = 13.0;
export const TRACK_SAMPLE_COUNT = 360;

function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  u: number
): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}

interface CachedTrack {
  def: TrackDefinition;
  samples: TrackPoint[];
  totalLength: number;
}

const trackCache = new Map<string, CachedTrack>();
let activeTrackId = 'alpine-gp';

export function resolveTrackDefinition(
  trackId: string,
  optionalSeed?: number
): TrackDefinition {
  if (trackId === 'procedural' && optionalSeed !== undefined) {
    const id = `proc-${optionalSeed}`;
    const cached = trackCache.get(id);
    if (cached) return cached.def;
    return buildProceduralTrackDefinition(optionalSeed);
  }
  if (trackId.startsWith('proc-')) {
    const seedNum = parseInt(trackId.slice(5), 10) || 42107;
    const cached = trackCache.get(`proc-${seedNum}`);
    if (cached) return cached.def;
    return buildProceduralTrackDefinition(seedNum);
  }
  if (trackId === 'alpine' || trackId === 'autodrom') {
    return TRACK_DEFINITIONS[0];
  }
  return (
    TRACK_DEFINITIONS.find((t) => t.id === trackId) || TRACK_DEFINITIONS[0]
  );
}

export function setActiveTrack(
  trackId: string,
  optionalSeed?: number
): TrackDefinition {
  const def = resolveTrackDefinition(trackId, optionalSeed);
  activeTrackId = def.id;
  ensureTrackBuilt(activeTrackId);
  return def;
}

export function getActiveTrackDefinition(): TrackDefinition {
  return resolveTrackDefinition(activeTrackId);
}

function ensureTrackBuilt(trackId: string): CachedTrack {
  const existing = trackCache.get(trackId);
  if (existing) return existing;

  const def = resolveTrackDefinition(trackId);
  const waypoints = def.waypoints;
  const n = waypoints.length;
  const raw: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i++) {
    const t = i / TRACK_SAMPLE_COUNT;
    const scaled = t * n;
    const seg = Math.floor(scaled) % n;
    const u = scaled - Math.floor(scaled);

    const w0 = waypoints[(seg - 1 + n) % n];
    const w1 = waypoints[seg];
    const w2 = waypoints[(seg + 1) % n];
    const w3 = waypoints[(seg + 2) % n];

    // Keep the main pit straight (t <= 0.12 || t >= 0.86) strictly flat at y = 0 so the Pit Lane Alley & Garages are flush
    let wy = catmullRom(w0[1], w1[1], w2[1], w3[1], u);
    if (t <= 0.12 || t >= 0.86) {
      wy = 0;
    } else if (t < 0.18) {
      wy *= (t - 0.12) / 0.06;
    } else if (t > 0.80) {
      wy *= (0.86 - t) / 0.06;
    }

    raw.push({
      x: catmullRom(w0[0], w1[0], w2[0], w3[0], u),
      y: wy,
      z: catmullRom(w0[2], w1[2], w2[2], w3[2], u),
    });
  }

  const samples: TrackPoint[] = [];
  let totalDist = 0;

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i++) {
    const prev = raw[(i - 1 + TRACK_SAMPLE_COUNT) % TRACK_SAMPLE_COUNT];
    const curr = raw[i];
    const next = raw[(i + 1) % TRACK_SAMPLE_COUNT];

    if (i > 0) {
      totalDist += Math.hypot(curr.x - prev.x, curr.z - prev.z);
    }

    const txRaw = next.x - prev.x;
    const tzRaw = next.z - prev.z;
    const len = Math.hypot(txRaw, tzRaw) || 1;
    const tx = txRaw / len;
    const tz = tzRaw / len;
    const nx = -tz;
    const nz = tx;
    const angle = Math.atan2(tx, tz);

    samples.push({
      x: curr.x,
      y: curr.y,
      z: curr.z,
      tx,
      tz,
      nx,
      nz,
      angle,
      curvature: 0,
      distance: totalDist,
      t: i / TRACK_SAMPLE_COUNT,
    });
  }

  const last = raw[TRACK_SAMPLE_COUNT - 1];
  const first = raw[0];
  const totalLength = totalDist + Math.hypot(first.x - last.x, first.z - last.z);

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i++) {
    const prev = samples[(i - 2 + TRACK_SAMPLE_COUNT) % TRACK_SAMPLE_COUNT];
    const next = samples[(i + 2) % TRACK_SAMPLE_COUNT];
    let dAngle = next.angle - prev.angle;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    samples[i].curvature = dAngle;
  }

  const built: CachedTrack = { def, samples, totalLength };
  trackCache.set(def.id, built);
  return built;
}

export function getTrackSamples(trackId = activeTrackId): TrackPoint[] {
  return ensureTrackBuilt(trackId).samples;
}

export function getTrackTotalLength(trackId = activeTrackId): number {
  return ensureTrackBuilt(trackId).totalLength;
}

export function sampleTrackByNormalizedT(
  t: number,
  trackId = activeTrackId
): TrackPoint {
  const samples = getTrackSamples(trackId);
  const wrapped = ((t % 1) + 1) % 1;
  const idx = Math.floor(wrapped * samples.length) % samples.length;
  return samples[idx];
}

export function findClosestTrackSample(
  x: number,
  z: number,
  hintIndex?: number,
  trackId = activeTrackId
): TrackQueryResult {
  const built = ensureTrackBuilt(trackId);
  const samples = built.samples;
  const roadHalfWidth = built.def.roadHalfWidth;
  const barrierHalfWidth = roadHalfWidth + 3.8;
  const count = samples.length;

  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < count) {
    const windowRadius = 12;
    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      const idx = (hintIndex + offset + count) % count;
      const s = samples[idx];
      const dx = x - s.x;
      const dz = z - s.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
    if (bestDistSq > 900) {
      bestDistSq = Infinity;
      for (let i = 0; i < count; i++) {
        const s = samples[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }
  } else {
    for (let i = 0; i < count; i++) {
      const s = samples[i];
      const dx = x - s.x;
      const dz = z - s.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
  }

  const pt = samples[bestIdx];
  const nextIdx = (bestIdx + 1) % count;
  const prevIdx = (bestIdx - 1 + count) % count;
  const nextPt = samples[nextIdx];
  const prevPt = samples[prevIdx];

  // Continuous longitudinal projection along track tangent
  const segNextX = nextPt.x - pt.x;
  const segNextZ = nextPt.z - pt.z;
  const segNextLenSq = segNextX * segNextX + segNextZ * segNextZ;
  const dotNext = (x - pt.x) * segNextX + (z - pt.z) * segNextZ;

  let groundY = pt.y;
  let slopeAngle = 0;

  if (dotNext > 0 && segNextLenSq > 0.0001) {
    const u = Math.min(1, Math.max(0, dotNext / segNextLenSq));
    groundY = pt.y + (nextPt.y - pt.y) * u;
    const segLen = Math.sqrt(segNextLenSq);
    slopeAngle = Math.atan2(nextPt.y - pt.y, segLen);
  } else {
    const segPrevX = prevPt.x - pt.x;
    const segPrevZ = prevPt.z - pt.z;
    const segPrevLenSq = segPrevX * segPrevX + segPrevZ * segPrevZ;
    const dotPrev = (x - pt.x) * segPrevX + (z - pt.z) * segPrevZ;
    if (dotPrev > 0 && segPrevLenSq > 0.0001) {
      const u = Math.min(1, Math.max(0, dotPrev / segPrevLenSq));
      groundY = pt.y + (prevPt.y - pt.y) * u;
      const segLen = Math.sqrt(segPrevLenSq);
      slopeAngle = Math.atan2(pt.y - prevPt.y, segLen);
    } else {
      const segLen = Math.hypot(segNextX, segNextZ) || 1;
      slopeAngle = Math.atan2(nextPt.y - pt.y, segLen);
    }
  }

  const dx = x - pt.x;
  const dz = z - pt.z;
  const lateralOffset = dx * pt.nx + dz * pt.nz;
  const absOffset = Math.abs(lateralOffset);

  // Main straight right-side Pit Lane Alley corridor (t >= 0.88 || t <= 0.11, lateralOffset > 0)
  const inPitAlleyLongitudinal = pt.t >= 0.88 || pt.t <= 0.11;
  const inPitAlleyLateral =
    inPitAlleyLongitudinal &&
    lateralOffset >= roadHalfWidth - 0.6 &&
    lateralOffset <= roadHalfWidth + 7.2;

  let surface: SurfaceType = 'asphalt';
  if (inPitAlleyLateral) {
    surface = 'asphalt';
  } else if (absOffset > roadHalfWidth + TRACK_KERB_WIDTH) {
    surface = 'grass';
  } else if (absOffset > roadHalfWidth - 0.25) {
    surface = 'kerb';
  }

  const rightBarrierLimit = inPitAlleyLongitudinal
    ? roadHalfWidth + 7.2
    : barrierHalfWidth;

  let barrierHit: 'left' | 'right' | null = null;
  let barrierPenetration = 0;
  if (lateralOffset > rightBarrierLimit) {
    barrierHit = 'right';
    barrierPenetration = lateralOffset - rightBarrierLimit;
  } else if (lateralOffset < -barrierHalfWidth) {
    barrierHit = 'left';
    barrierPenetration = -barrierHalfWidth - lateralOffset;
  }

  return {
    index: bestIdx,
    t: pt.t,
    distanceAlongTrack: pt.distance,
    lateralOffset,
    absOffset,
    surface,
    groundY,
    slopeAngle,
    trackAngle: pt.angle,
    curvature: pt.curvature,
    closestPoint: { x: pt.x, y: pt.y, z: pt.z },
    tangent: { x: pt.tx, z: pt.tz },
    normal: { x: pt.nx, z: pt.nz },
    barrierHit,
    barrierPenetration,
  };
}
