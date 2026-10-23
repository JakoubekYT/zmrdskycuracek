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
  isProcedural?: boolean;
  seed?: number;
  theme: {
    skyHex: number;
    fogHex: number;
    groundHex: number;
    asphaltHex: string;
    edgeLineHex: string;
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
    subtitle: 'Vyvážený technický okruh s rychlou cílovou rovinkou a esíčky',
    difficulty: 'Střední',
    roadHalfWidth: 8.8,
    gripFactor: 1.0,
    theme: {
      skyHex: 0x162642,
      fogHex: 0x162642,
      groundHex: 0x1e3a2a,
      asphaltHex: '#252b37',
      edgeLineHex: '#f8fafc',
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
      [0, 0, 90],
      [30, 0, 150],
      [95, 0, 175],
      [165, 0, 150],
      [200, 0, 95],
      [175, 0, 30],
      [215, 0, -35],
      [195, 0, -110],
      [120, 0, -160],
      [45, 0, -165],
      [5, 0, -125],
      [0, 0, -65],
    ],
  },
  {
    id: 'tokyo-night',
    name: 'Neo Tokyo Drift',
    subtitle: 'Noční městská dálnice se širokými vracečkami a neonovými svodidly',
    difficulty: 'Těžká (Drift)',
    roadHalfWidth: 9.2,
    gripFactor: 0.94,
    theme: {
      skyHex: 0x090d1a,
      fogHex: 0x090d1a,
      groundHex: 0x0f172a,
      asphaltHex: '#181c26',
      edgeLineHex: '#38bdf8',
      kerbColorA: '#06b6d4',
      kerbColorB: '#0f172a',
      barrierHex: 0x1e293b,
      barrierEmissiveHex: 0x0284c7,
      foliageHex: 0x1e293b,
      sunLightHex: 0xbae6fd,
      hemiSkyHex: 0x38bdf8,
      hemiGroundHex: 0x090d1a,
    },
    waypoints: [
      [0, 0, 0],
      [0, 0, 80],
      [45, 0, 130],
      [110, 0, 115],
      [135, 0, 55],
      [90, 0, 10],
      [145, 0, -35],
      [190, 0, -95],
      [145, 0, -155],
      [75, 0, -145],
      [40, 0, -95],
      [5, 0, -115],
      [0, 0, -60],
    ],
  },
  {
    id: 'desert-canyon',
    name: 'Sonora Speedway',
    subtitle: 'Rychlý pouštní okruh s dlouhými rovinkami pro maximální rychlost',
    difficulty: 'Lehká (Rychlost)',
    roadHalfWidth: 9.5,
    gripFactor: 1.02,
    theme: {
      skyHex: 0x3b1d16,
      fogHex: 0x3b1d16,
      groundHex: 0x6b3e26,
      asphaltHex: '#2b2623',
      edgeLineHex: '#fef08a',
      kerbColorA: '#f59e0b',
      kerbColorB: '#292524',
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
      [45, 0, 195],
      [135, 0, 210],
      [220, 0, 160],
      [245, 0, 50],
      [230, 0, -75],
      [175, 0, -165],
      [85, 0, -180],
      [15, 0, -135],
      [0, 0, -70],
    ],
  },
  {
    id: 'nordic-ice',
    name: 'Nordic Ice Ring',
    subtitle: 'Zasněžený severský okruh se sníženou přilnavostí a dlouhými smyky',
    difficulty: 'Expert (Kluzko)',
    roadHalfWidth: 9.2,
    gripFactor: 0.80,
    theme: {
      skyHex: 0x1e293b,
      fogHex: 0x1e293b,
      groundHex: 0xcbd5e1,
      asphaltHex: '#334155',
      edgeLineHex: '#38bdf8',
      kerbColorA: '#0284c7',
      kerbColorB: '#f8fafc',
      barrierHex: 0x64748b,
      barrierEmissiveHex: 0x000000,
      foliageHex: 0x475569,
      sunLightHex: 0xe0f2fe,
      hemiSkyHex: 0xe2e8f0,
      hemiGroundHex: 0x334155,
    },
    waypoints: [
      [0, 0, 0],
      [0, 0, 75],
      [35, 0, 135],
      [105, 0, 155],
      [165, 0, 115],
      [155, 0, 40],
      [195, 0, -25],
      [170, 0, -105],
      [100, 0, -145],
      [30, 0, -135],
      [0, 0, -65],
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
    fogHex: 0x1e1b4b,
    groundHex: 0x1e293b,
    asphaltHex: '#1f2430',
    edgeLineHex: '#f472b6',
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
    fogHex: 0x0f291e,
    groundHex: 0x143322,
    asphaltHex: '#22272e',
    edgeLineHex: '#fef08a',
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
    fogHex: 0x351614,
    groundHex: 0x57261c,
    asphaltHex: '#292220',
    edgeLineHex: '#fdba74',
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
    fogHex: 0x091624,
    groundHex: 0x0c1d2e,
    asphaltHex: '#151c28',
    edgeLineHex: '#22d3ee',
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
 * Deterministically generates a smooth closed-loop racing circuit from any numeric seed.
 * Ensures a straight start/finish zone around (0, 0, -60 -> +80) and varied corners around the loop.
 */
export function buildProceduralTrackDefinition(seed: number): TrackDefinition {
  const cleanSeed = Math.abs(Math.floor(seed)) % 999999 || 42107;
  const rand = mulberry32(cleanSeed);

  const theme =
    PROCEDURAL_THEMES[Math.floor(rand() * PROCEDURAL_THEMES.length)];
  const gripFactor = Number((0.88 + rand() * 0.14).toFixed(2));
  const roadHalfWidth = Number((8.6 + rand() * 1.1).toFixed(1));

  // Keep start/finish straight aligned along X=0, Z=-65 -> +85 so start gantry and grid always fit cleanly
  const waypoints: Array<[number, number, number]> = [
    [0, 0, 0],
    [0, 0, 82],
  ];

  // Generate 9 radial waypoints sweeping clockwise from angle +15° to -155° centered at (110, 0, 5)
  const centerX = 112;
  const centerZ = 5;
  const numDynamicPts = 9;
  for (let i = 0; i < numDynamicPts; i++) {
    const progress = i / (numDynamicPts - 1);
    const angle = Math.PI * 0.42 - progress * Math.PI * 1.28;
    const baseRadius = 125;
    // Controlled radial modulation for chicanes, hairpins, and fast sweepers
    const wave =
      (rand() - 0.45) * 46 + Math.sin(progress * Math.PI * 2.5) * 22;
    const r = Math.max(78, Math.min(180, baseRadius + wave));
    const wx = Math.round(centerX + Math.cos(angle) * r);
    const wz = Math.round(centerZ + Math.sin(angle) * r);
    waypoints.push([Math.max(24, wx), 0, wz]);
  }

  waypoints.push([6, 0, -118]);
  waypoints.push([0, 0, -62]);

  return {
    id: `proc-${cleanSeed}`,
    name: `Generovaná #${cleanSeed}`,
    subtitle: `Procedurální trať (${theme.label}) · šířka ${roadHalfWidth * 2}m`,
    difficulty: `Seed #${cleanSeed}`,
    roadHalfWidth,
    gripFactor,
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
  trackAngle: number;
  curvature: number;
  closestPoint: Vec3;
  tangent: { x: number; z: number };
  normal: { x: number; z: number };
  barrierHit: 'left' | 'right' | null;
  barrierPenetration: number;
}

export const TRACK_ROAD_HALF_WIDTH = 8.8;
export const TRACK_KERB_WIDTH = 1.5;
export const TRACK_BARRIER_HALF_WIDTH = 12.4;
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

export function resolveTrackDefinition(trackId: string): TrackDefinition {
  if (trackId.startsWith('proc-')) {
    const seedNum = parseInt(trackId.slice(5), 10) || 42107;
    const cached = trackCache.get(`proc-${seedNum}`);
    if (cached) return cached.def;
    return buildProceduralTrackDefinition(seedNum);
  }
  return (
    TRACK_DEFINITIONS.find((t) => t.id === trackId) || TRACK_DEFINITIONS[0]
  );
}

export function setActiveTrack(trackId: string): TrackDefinition {
  const def = resolveTrackDefinition(trackId);
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

    raw.push({
      x: catmullRom(w0[0], w1[0], w2[0], w3[0], u),
      y: 0,
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
      y: 0,
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
  const barrierHalfWidth = roadHalfWidth + 3.6;
  const count = samples.length;

  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < count) {
    const windowRadius = 28;
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
  const dx = x - pt.x;
  const dz = z - pt.z;
  const lateralOffset = dx * pt.nx + dz * pt.nz;
  const absOffset = Math.abs(lateralOffset);

  let surface: SurfaceType = 'asphalt';
  if (absOffset > roadHalfWidth + TRACK_KERB_WIDTH) {
    surface = 'grass';
  } else if (absOffset > roadHalfWidth - 0.25) {
    surface = 'kerb';
  }

  let barrierHit: 'left' | 'right' | null = null;
  let barrierPenetration = 0;
  if (lateralOffset > barrierHalfWidth) {
    barrierHit = 'right';
    barrierPenetration = lateralOffset - barrierHalfWidth;
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
    groundY: pt.y,
    trackAngle: pt.angle,
    curvature: pt.curvature,
    closestPoint: { x: pt.x, y: pt.y, z: pt.z },
    tangent: { x: pt.tx, z: pt.tz },
    normal: { x: pt.nx, z: pt.nz },
    barrierHit,
    barrierPenetration,
  };
}
