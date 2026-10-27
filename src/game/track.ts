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
  isBridge?: boolean;
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
  isCustom?: boolean;
  hasBridge?: boolean;
  themeIndex?: number;
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
  rawUserCheckpoints?: Array<[number, number, number]>;
}

export const PROCEDURAL_THEMES = [
  {
    label: 'Alpský Den GP',
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

// 12 Handcrafted Official FIA Grand Prix Circuits (including Figure-8 Overpass Bridges!)
export const TRACK_DEFINITIONS: TrackDefinition[] = [
  {
    id: 'alpine-gp',
    name: 'Alpský Autodrom GP',
    subtitle: 'Technický okruh s rychlými esíčky, převýšením Eau Rouge a dlouhou DRS rovinkou',
    difficulty: 'Střední · Klasický GP',
    roadHalfWidth: 9.2,
    gripFactor: 1.0,
    elevationScale: 1.0,
    theme: PROCEDURAL_THEMES[0],
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
    id: 'suzuka-figure8',
    name: 'Suzuka Osmička GP (Most)',
    subtitle: 'Ikonický okruh ve tvaru osmičky s betonovým přemostěním, podjezdem a technickými esíčky',
    difficulty: 'Těžká · Most & Osmička',
    roadHalfWidth: 9.2,
    gripFactor: 1.01,
    elevationScale: 1.0,
    hasBridge: true,
    theme: PROCEDURAL_THEMES[0],
    waypoints: [
      [0, 0, 0],
      [0, 0, 84],
      [45, 1.5, 152],
      [128, 0.0, 168],
      [196, 0.0, 112],
      [142, 0.0, 16], // Lower underpass of the figure-8 (y = 0m)
      [82, -1.0, -68],
      [118, 1.5, -152],
      [204, 5.2, -138],
      [228, 7.6, -34],
      [142, 7.8, 16], // Upper overpass bridge crossing right over [142, 0, 16]! (y = 7.8m)
      [64, 4.2, 58],
      [34, 1.0, -96],
      [0, 0, -68],
    ],
  },
  {
    id: 'tokyo-night',
    name: 'Neo Tokyo Bay GP',
    subtitle: 'Noční městský okruh s osvětlenými nadjezdy, vracečkami a rychlým průjezdem přístavem',
    difficulty: 'Těžká · Noční Městský',
    roadHalfWidth: 9.4,
    gripFactor: 0.96,
    elevationScale: 0.9,
    theme: PROCEDURAL_THEMES[4],
    waypoints: [
      [0, 0, 0],
      [0, 0, 84],
      [48, 3.5, 138],
      [118, 6.0, 122],
      [146, 3.2, 58],
      [96, -1.5, 12],
      [152, 2.8, -36],
      [202, 5.2, -98],
      [162, 2.4, -164],
      [96, 0.0, -158],
      [48, 0.0, -126],
      [16, 0.0, -78],
      [0, 0, -32],
    ],
  },
  {
    id: 'monza-temple',
    name: 'Monza Chrám Rychlosti',
    subtitle: 'Extrémně rychlý okruh s dlouhými rovinkami přes 320 km/h, šikanou Rettifilo a Parabolikou',
    difficulty: 'Lehká · Max Rychlost',
    roadHalfWidth: 9.8,
    gripFactor: 1.03,
    elevationScale: 1.0,
    theme: PROCEDURAL_THEMES[2],
    waypoints: [
      [0, 0, 0],
      [0, 0, 135],
      [32, 1.0, 188],
      [68, 2.2, 168],
      [156, 3.5, 192],
      [232, 2.0, 145],
      [242, 0.0, 10],
      [238, -1.0, -135],
      [158, 1.5, -184],
      [52, 0.5, -172],
      [8, 0, -118],
      [0, 0, -68],
    ],
  },
  {
    id: 'desert-canyon',
    name: 'Sonora Canyon GP',
    subtitle: 'Rychlý pouštní okruh s klopenými zatáčkami, horizonty a dlouhými rovinkami v kaňonu',
    difficulty: 'Lehká · Rychlý Kaňon',
    roadHalfWidth: 9.8,
    gripFactor: 1.02,
    elevationScale: 1.1,
    theme: PROCEDURAL_THEMES[3],
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
    name: 'Nordic Glacier 8 (Most)',
    subtitle: 'Zasněžený polární okruh ve tvaru 8 s vysutým ledovcovým mostem a technickými pasážemi',
    difficulty: 'Expert · Polární Most',
    roadHalfWidth: 9.5,
    gripFactor: 0.84,
    elevationScale: 1.0,
    hasBridge: true,
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
      [0, 0, 82],
      [52, 2.0, 154],
      [148, 0.0, 162],
      [212, 0.0, 88],
      [136, 0.0, -4], // Underpass
      [74, -1.5, -88],
      [124, 2.0, -164],
      [214, 5.5, -124],
      [218, 7.5, -22],
      [136, 7.6, -4], // Overpass bridge
      [56, 3.2, 34],
      [24, 0.0, -98],
      [0, 0, -64],
    ],
  },
  {
    id: 'monaco-harbor',
    name: 'Monte Carlo Přístav GP',
    subtitle: 'Technický městský okruh s pomalou vracečkou Grand Hotel, tunelem a šikanou u jachet',
    difficulty: 'Expert · Úzký Městský',
    roadHalfWidth: 8.8,
    gripFactor: 0.98,
    elevationScale: 1.0,
    theme: PROCEDURAL_THEMES[1],
    waypoints: [
      [0, 0, 0],
      [0, 0, 78],
      [36, 4.5, 134],
      [98, 7.5, 152],
      [148, 3.0, 112],
      [92, 1.0, 68],
      [168, -1.5, 36],
      [212, -2.0, -34],
      [154, 0.0, -82],
      [182, 1.5, -142],
      [104, 0.0, -162],
      [34, 0.0, -128],
      [0, 0, -68],
    ],
  },
  {
    id: 'silverstone-arena',
    name: 'Silverstone Hangar GP',
    subtitle: 'Kolébka motorsportu s ultrarychlou sekvencí zatáček Maggotts-Becketts a rovinkou Hangar',
    difficulty: 'Střední · Rychlé Zatáčky',
    roadHalfWidth: 9.6,
    gripFactor: 1.02,
    elevationScale: 1.0,
    theme: PROCEDURAL_THEMES[0],
    waypoints: [
      [0, 0, 0],
      [0, 0, 88],
      [48, 1.5, 148],
      [112, 2.5, 178],
      [162, 1.0, 132],
      [134, 0.5, 72],
      [196, 2.0, 28],
      [246, 1.5, -68],
      [198, 0.0, -158],
      [114, 1.0, -134],
      [54, 0.0, -162],
      [12, 0.0, -112],
      [0, 0, -64],
    ],
  },
  {
    id: 'spa-ardennes',
    name: 'Ardennes Forest Spa GP',
    subtitle: 'Dlouhý přírodní okruh v lesích s prudkým stoupáním, dvojitým levým obloukem Pouhon a šikanou',
    difficulty: 'Těžká · Horský Lesní',
    roadHalfWidth: 9.4,
    gripFactor: 0.99,
    elevationScale: 1.2,
    theme: PROCEDURAL_THEMES[2],
    waypoints: [
      [0, 0, 0],
      [0, 0, 96],
      [28, 5.5, 168],
      [108, 8.5, 204],
      [204, 6.2, 176],
      [248, 2.5, 92],
      [186, -1.5, 24],
      [236, -3.0, -56],
      [212, 1.5, -148],
      [122, 3.0, -182],
      [42, 0.5, -156],
      [0, 0, -72],
    ],
  },
  {
    id: 'interlagos-senna',
    name: 'Interlagos Senna S GP',
    subtitle: 'Brazilský autodrom s klesajícím esíčkem Senna S, technickým středním sektorem a dlouhým stoupáním',
    difficulty: 'Střední · Vlnitý Profil',
    roadHalfWidth: 9.4,
    gripFactor: 1.01,
    elevationScale: 1.0,
    theme: PROCEDURAL_THEMES[2],
    waypoints: [
      [0, 0, 0],
      [0, 0, 86],
      [44, -2.5, 146],
      [88, -3.5, 114],
      [158, -1.0, 164],
      [228, 2.5, 118],
      [214, 4.5, 22],
      [142, 1.5, -18],
      [198, -1.5, -86],
      [164, 2.0, -162],
      [68, 3.5, -152],
      [14, 1.0, -108],
      [0, 0, -64],
    ],
  },
  {
    id: 'marina-bridge-8',
    name: 'Marina Bay Night 8 (Most)',
    subtitle: 'Noční okruh s přejezdem přes osvětlený visutý most a ostrými 90° zatáčkami podél zátoky',
    difficulty: 'Těžká · Noční Most',
    roadHalfWidth: 9.2,
    gripFactor: 0.97,
    elevationScale: 1.0,
    hasBridge: true,
    theme: PROCEDURAL_THEMES[4],
    waypoints: [
      [0, 0, 0],
      [0, 0, 84],
      [54, 0.5, 148],
      [146, 0.0, 152],
      [198, 0.0, 74],
      [124, 0.0, -18], // Underpass
      [68, 0.0, -96],
      [118, 2.5, -168],
      [212, 6.2, -136],
      [216, 7.8, -36],
      [124, 7.8, -18], // Overpass bridge
      [48, 3.8, 18],
      [22, 0.0, -92],
      [0, 0, -64],
    ],
  },
  {
    id: 'spielberg-bull',
    name: 'Spielberg Alpy Ring',
    subtitle: 'Kompaktní a dravý horský okruh se třemi prudkými brzdnými zónami a panoramatem Alp',
    difficulty: 'Lehká · Rychlý Sprint',
    roadHalfWidth: 9.6,
    gripFactor: 1.04,
    elevationScale: 1.1,
    theme: PROCEDURAL_THEMES[0],
    waypoints: [
      [0, 0, 0],
      [0, 0, 108],
      [56, 5.5, 178],
      [168, 8.0, 192],
      [234, 4.5, 118],
      [172, 1.0, 42],
      [228, -1.0, -38],
      [196, -2.0, -142],
      [88, 0.0, -164],
      [16, 0.0, -124],
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

/**
 * Deterministically generates a smooth closed-loop F1 circuit from any numeric seed.
 */
export function buildProceduralTrackDefinition(seed: number): TrackDefinition {
  const cleanSeed = Math.abs(Math.floor(seed)) % 999999 || 42107;
  const rand = mulberry32(cleanSeed);

  const theme =
    PROCEDURAL_THEMES[Math.floor(rand() * PROCEDURAL_THEMES.length)];
  const gripFactor = Number((0.94 + rand() * 0.1).toFixed(2));
  const roadHalfWidth = Number((9.2 + rand() * 0.8).toFixed(1));

  const numPts = 18;
  const phase2 = rand() * Math.PI * 2;
  const phase3 = rand() * Math.PI * 2;
  const elevPhase = rand() * Math.PI * 2;
  const amp2 = 0.08 + rand() * 0.06;
  const amp3 = 0.05 + rand() * 0.05;

  const cx = 115 + rand() * 25;
  const cz = 0;
  const rx = 92 + rand() * 20;
  const rz = 135 + rand() * 25;

  const rawWaypoints: Array<[number, number, number]> = [
    [0, 0, 0],
    [0, 0, 78],
    [32, 2.5, 142],
  ];

  const backSteps = numPts - 5;
  for (let s = 0; s < backSteps; s++) {
    const frac = (s + 1) / (backSteps + 1);
    const theta = Math.PI * 0.44 - frac * Math.PI * 1.88;
    const rMod =
      1.0 +
      Math.cos(theta * 2 + phase2) * amp2 +
      Math.sin(theta * 3 + phase3) * amp3;
    const wx = Math.round(cx + Math.cos(theta) * rx * rMod);
    const wz = Math.round(cz + Math.sin(theta) * rz * rMod);

    const elevEnvelope = Math.sin(frac * Math.PI);
    const wy = Number(
      (
        Math.sin(frac * Math.PI * 2.2 + elevPhase) *
        6.0 *
        elevEnvelope
      ).toFixed(1)
    );
    rawWaypoints.push([Math.max(26, wx), wy, wz]);
  }

  rawWaypoints.push([28, 0.0, -138]);
  rawWaypoints.push([0, 0, -76]);

  const waypoints = rawWaypoints.map(
    ([x, y, z]) => [x, y, z] as [number, number, number]
  );
  for (let pass = 0; pass < 2; pass++) {
    const copy = waypoints.map(
      ([x, y, z]) => [x, y, z] as [number, number, number]
    );
    const n = copy.length;
    for (let i = 2; i < n - 1; i++) {
      const prev = copy[(i - 1 + n) % n];
      const curr = copy[i];
      const next = copy[(i + 1) % n];
      waypoints[i][0] = Math.round(
        prev[0] * 0.22 + curr[0] * 0.56 + next[0] * 0.22
      );
      waypoints[i][1] = Number(
        (prev[1] * 0.25 + curr[1] * 0.5 + next[1] * 0.25).toFixed(1)
      );
      waypoints[i][2] = Math.round(
        prev[2] * 0.22 + curr[2] * 0.56 + next[2] * 0.22
      );
    }
  }

  return {
    id: `proc-${cleanSeed}`,
    name: `Velká cena #${cleanSeed}`,
    subtitle: `Procedurální 3D okruh (${theme.label}) · šířka ${Math.round(
      roadHalfWidth * 2
    )}m`,
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

const CUSTOM_TRACKS_STORAGE_KEY = 'apex_saved_custom_tracks_v2';
const trackCache = new Map<string, CachedTrack>();
const customTracks = new Map<string, TrackDefinition>();
let activeTrackId = 'alpine-gp';

/**
 * Checks if two 2D line segments (A->B and C->D) intersect in the XZ plane.
 */
function segmentsIntersectXZ(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): { u: number; v: number } | null {
  const rX = bx - ax;
  const rZ = bz - az;
  const sX = dx - cx;
  const sZ = dz - cz;
  const denom = rX * sZ - rZ * sX;
  if (Math.abs(denom) < 1e-5) return null;
  const qpX = cx - ax;
  const qpZ = cz - az;
  const u = (qpX * sZ - qpZ * sX) / denom;
  const v = (qpX * rZ - qpZ * rX) / denom;
  if (u >= 0.02 && u <= 0.98 && v >= 0.02 && v <= 0.98) {
    return { u, v };
  }
  return null;
}

/**
 * Builds a faithful 3D TrackDefinition directly from the player's 2D Grid Editor checkpoints.
 * - Preserves the exact 2D/3D coordinates the player placed (no clamping to x>=24 and no shrinking filter!).
 * - Anchors the compact Start/Pit Box straight at [0, 0, -42] -> [0, 0, 48] so 3D Pit Stops,
 *   Starting Grid, and Gantry lights always work seamlessly.
 * - Automatically detects 2D road crossings (e.g., Figure-8 tracks) and elevates the crossing branch
 *   into a 3D Bridge Overpass if the user hasn't already separated their heights!
 */
export function buildCustomTrackDefinition(
  id: string,
  name: string,
  userCheckpoints: Array<[number, number, number]>,
  themeIndex = 0,
  roadHalfWidth = 9.4
): TrackDefinition {
  const cleanThemeIdx =
    Math.abs(Math.floor(themeIndex)) % PROCEDURAL_THEMES.length;
  const theme = PROCEDURAL_THEMES[cleanThemeIdx] || PROCEDURAL_THEMES[0];

  const validMidpoints: Array<[number, number, number]> =
    Array.isArray(userCheckpoints) && userCheckpoints.length >= 2
      ? userCheckpoints.map(
          ([x, y, z]) =>
            [
              Math.max(-240, Math.min(280, Math.round(Number(x) || 0))),
              Math.max(-6, Math.min(14, Number((Number(y) || 0).toFixed(1)))),
              Math.max(-220, Math.min(220, Math.round(Number(z) || 0))),
            ] as [number, number, number]
        )
      : [
          [48, 3.0, 148],
          [140, 6.0, 165],
          [208, 2.5, 92],
          [196, -1.5, -28],
          [145, 4.0, -135],
          [56, 1.0, -142],
        ];

  // Anchor only the compact Start / Pit Box straight on x=0, then pass DIRECTLY through every user checkpoint!
  const waypoints: Array<[number, number, number]> = [
    [0, 0, -42],
    [0, 0, 0],
    [0, 0, 52],
    ...validMidpoints.map(
      ([x, y, z]) => [x, y, z] as [number, number, number]
    ),
  ];

  // Auto-detect any 2D crossing (Figure-8 / Bridge Overpass) among segments and ensure the second crossing branch rises into a 3D bridge!
  let hasBridge = false;
  const n = waypoints.length;
  for (let i = 0; i < n; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = waypoints[j];
      const d = waypoints[(j + 1) % n];
      const hit = segmentsIntersectXZ(
        a[0],
        a[2],
        b[0],
        b[2],
        c[0],
        c[2],
        d[0],
        d[2]
      );
      if (hit) {
        hasBridge = true;
        const y1 = a[1] + (b[1] - a[1]) * hit.u;
        const y2 = c[1] + (d[1] - c[1]) * hit.v;
        if (Math.abs(y2 - y1) < 5.5) {
          // Lift the later segment (c -> d) into a 7.5m high 3D Overpass Bridge!
          const bridgeTargetY = Math.max(7.2, Math.max(a[1], b[1]) + 7.2);
          if (j >= 3) waypoints[j][1] = Math.max(waypoints[j][1], bridgeTargetY);
          if ((j + 1) % n >= 3) {
            waypoints[(j + 1) % n][1] = Math.max(
              waypoints[(j + 1) % n][1],
              bridgeTargetY
            );
          }
        }
      }
    }
  }

  // Also mark hasBridge if any user checkpoint is elevated >= 5.5m
  if (validMidpoints.some((pt) => pt[1] >= 5.5)) {
    hasBridge = true;
  }

  const def: TrackDefinition = {
    id: id || 'custom-track',
    name: (name || 'Vlastní Okruh').trim().slice(0, 32) || 'Vlastní Okruh',
    subtitle: `${hasBridge ? 'Vlastní 3D okruh s přemostěním' : 'Vlastní 3D okruh'} (${theme.label}) · ${validMidpoints.length} bodů`,
    difficulty: hasBridge ? 'Vlastní · 3D Most' : 'Vlastní · Editor',
    roadHalfWidth,
    gripFactor: 1.0,
    elevationScale: 1.0,
    isProcedural: true,
    isCustom: true,
    hasBridge,
    themeIndex: cleanThemeIdx,
    theme,
    waypoints,
    rawUserCheckpoints: validMidpoints,
  };
  return registerCustomTrack(def);
}

export function registerCustomTrack(def: TrackDefinition): TrackDefinition {
  customTracks.set(def.id, def);
  trackCache.delete(def.id);
  return def;
}

export function getCustomTracks(): TrackDefinition[] {
  return Array.from(customTracks.values()).filter(
    (t) => t.id !== 'custom-editor-preview'
  );
}

export function saveCustomTracksToStorage(): void {
  try {
    const list = getCustomTracks().map((t) => ({
      id: t.id,
      name: t.name,
      themeIndex: t.themeIndex ?? 0,
      roadHalfWidth: t.roadHalfWidth,
      checkpoints: t.rawUserCheckpoints ?? t.waypoints.slice(3),
    }));
    localStorage.setItem(CUSTOM_TRACKS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota errors
  }
}

export function loadSavedCustomTracksFromStorage(): TrackDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TRACKS_STORAGE_KEY);
    if (!raw) return getCustomTracks();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item.id === 'string' && Array.isArray(item.checkpoints)) {
          buildCustomTrackDefinition(
            item.id,
            String(item.name || 'Vlastní trať'),
            item.checkpoints,
            Number(item.themeIndex || 0),
            Number(item.roadHalfWidth || 9.4)
          );
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return getCustomTracks();
}

export function deleteCustomTrack(trackId: string): void {
  customTracks.delete(trackId);
  trackCache.delete(trackId);
  saveCustomTracksToStorage();
  if (activeTrackId === trackId) {
    activeTrackId = TRACK_DEFINITIONS[0].id;
  }
}

export function renameCustomTrack(trackId: string, newName: string): TrackDefinition | null {
  const existing = customTracks.get(trackId);
  if (!existing) return null;
  const cleanName = newName.trim().slice(0, 32) || existing.name;
  const updated = buildCustomTrackDefinition(
    existing.id,
    cleanName,
    existing.rawUserCheckpoints ?? existing.waypoints.slice(3),
    existing.themeIndex ?? 0,
    existing.roadHalfWidth
  );
  saveCustomTracksToStorage();
  return updated;
}

/**
 * Encodes a Custom Track into a compact URL-safe share token so friends can open the exact 3D map via link.
 */
export function encodeCustomTrackShareCode(def: TrackDefinition): string {
  const payload = {
    i: def.id,
    n: def.name,
    t: def.themeIndex ?? 0,
    w: def.roadHalfWidth,
    c: (def.rawUserCheckpoints ?? def.waypoints.slice(3)).map(([x, y, z]) => [
      Math.round(x),
      Number(y.toFixed(1)),
      Math.round(z),
    ]),
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes a shared Custom Track token from URL (`?customTrack=...`) and registers it.
 */
export function decodeCustomTrackShareCode(token: string): TrackDefinition | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    const binary = atob(base64 + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || !Array.isArray(parsed.c) || parsed.c.length < 2) return null;
    const trackId =
      typeof parsed.i === 'string' && parsed.i.startsWith('custom-')
        ? parsed.i
        : `custom-shared-${Math.abs(
            String(parsed.n || 'trat')
              .split('')
              .reduce((a: number, ch: string) => a + ch.charCodeAt(0), 0)
          )}`;
    const built = buildCustomTrackDefinition(
      trackId,
      String(parsed.n || 'Sdílená 3D Trať'),
      parsed.c,
      Number(parsed.t || 0),
      Number(parsed.w || 9.4)
    );
    saveCustomTracksToStorage();
    return built;
  } catch {
    return null;
  }
}

export function resolveTrackDefinition(
  trackId: string,
  optionalSeed?: number
): TrackDefinition {
  const custom = customTracks.get(trackId);
  if (custom) return custom;
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

    // Keep the immediate Pit Box straight (t <= 0.08 || t >= 0.92) level at y = 0 so the Pit Lane Alley & Garages are flush
    let wy = catmullRom(w0[1], w1[1], w2[1], w3[1], u);
    if (t <= 0.08 || t >= 0.92) {
      wy = 0;
    } else if (t < 0.14) {
      wy *= (t - 0.08) / 0.06;
    } else if (t > 0.86) {
      wy *= (0.92 - t) / 0.06;
    }

    raw.push({
      x: catmullRom(w0[0], w1[0], w2[0], w3[0], u),
      y: wy,
      z: catmullRom(w0[2], w1[2], w2[2], w3[2], u),
    });
  }

  // Enforce vertical bridge separation whenever two non-adjacent spline sections cross in XZ (Figure-8 / Overpass)
  const crossThresholdSq = (def.roadHalfWidth * 2.25) * (def.roadHalfWidth * 2.25);
  for (let i = 28; i < TRACK_SAMPLE_COUNT - 28; i++) {
    for (let j = i + 45; j < TRACK_SAMPLE_COUNT - 22; j++) {
      const dx = raw[i].x - raw[j].x;
      const dz = raw[i].z - raw[j].z;
      const dSq = dx * dx + dz * dz;
      if (dSq < crossThresholdSq) {
        const yDiff = Math.abs(raw[j].y - raw[i].y);
        if (yDiff < 5.6) {
          // Smoothly raise the second branch (around j) into a 3D Bridge Overpass
          const targetBridgeY = Math.max(raw[i].y, raw[j].y) + 6.4;
          const rampRadius = 26;
          for (let offset = -rampRadius; offset <= rampRadius; offset++) {
            const idx = (j + offset + TRACK_SAMPLE_COUNT) % TRACK_SAMPLE_COUNT;
            if (idx < 20 || idx > TRACK_SAMPLE_COUNT - 20) continue;
            const w = 0.5 * (1 + Math.cos((offset / rampRadius) * Math.PI));
            const desiredY = raw[idx].y * (1 - w) + targetBridgeY * w;
            if (desiredY > raw[idx].y) {
              raw[idx].y = desiredY;
            }
          }
        }
      }
    }
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
      isBridge: curr.y > 2.4,
    });
  }

  const last = raw[TRACK_SAMPLE_COUNT - 1];
  const first = raw[0];
  const totalLength =
    totalDist + Math.hypot(first.x - last.x, first.z - last.z);

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

  // When hintIndex is provided (active car on track), search a local window along the spline first
  // so cars on Figure-8 bridges/underpasses stay strictly on their current vertical level!
  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < count) {
    const windowRadius = 18;
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
    if (bestDistSq > 1250) {
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

  const segNextX = nextPt.x - pt.x;
  const segNextZ = nextPt.z - pt.z;
  const segNextLenSq = segNextX * segNextX + segNextZ * segNextZ;
  const dotNext = (x - pt.x) * segNextX + (z - pt.z) * segNextZ;

  const totalLen = Math.max(1, getTrackTotalLength());
  let groundY = pt.y;
  let slopeAngle = 0;
  let continuousT = pt.t;
  let continuousDistance = pt.distance;

  if (dotNext > 0 && segNextLenSq > 0.0001) {
    const u = Math.min(1, Math.max(0, dotNext / segNextLenSq));
    groundY = pt.y + (nextPt.y - pt.y) * u;
    const segLen = Math.sqrt(segNextLenSq);
    slopeAngle = Math.atan2(nextPt.y - pt.y, segLen);
    continuousT = ((bestIdx + u) / count) % 1;
    const segArc =
      nextIdx === 0
        ? Math.max(0.01, totalLen - pt.distance)
        : Math.max(0.01, nextPt.distance - pt.distance);
    continuousDistance = (pt.distance + u * segArc) % totalLen;
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
      continuousT = (((bestIdx - u) / count) % 1 + 1) % 1;
      const segArc =
        bestIdx === 0
          ? Math.max(0.01, totalLen - prevPt.distance)
          : Math.max(0.01, pt.distance - prevPt.distance);
      continuousDistance =
        (((pt.distance - u * segArc) % totalLen) + totalLen) % totalLen;
    } else {
      const segLen = Math.hypot(segNextX, segNextZ) || 1;
      slopeAngle = Math.atan2(nextPt.y - pt.y, segLen);
    }
  }

  const dx = x - pt.x;
  const dz = z - pt.z;
  const lateralOffset = dx * pt.nx + dz * pt.nz;
  const absOffset = Math.abs(lateralOffset);

  const inPitAlleyLongitudinal =
    continuousT >= 0.88 ||
    continuousT <= 0.18 ||
    (Math.abs(pt.x) < 10 && pt.z >= -48 && pt.z <= 48 && pt.tz > 0.7);
  const inPitAlleyLateral =
    inPitAlleyLongitudinal &&
    lateralOffset >= roadHalfWidth - 0.6 &&
    lateralOffset <= roadHalfWidth + 7.2;

  let surface: SurfaceType = 'asphalt';
  if (inPitAlleyLateral) {
    surface = 'asphalt';
  } else if (absOffset <= roadHalfWidth) {
    surface = 'asphalt';
  } else if (absOffset <= roadHalfWidth + TRACK_KERB_WIDTH) {
    surface = 'kerb';
  } else if (absOffset <= barrierHalfWidth - 0.2) {
    surface = 'kerb';
  } else {
    surface = 'grass';
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
    t: continuousT,
    distanceAlongTrack: continuousDistance,
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
