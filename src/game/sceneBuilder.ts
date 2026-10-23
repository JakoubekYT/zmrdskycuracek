import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CarSpec,
  TimeOfDay,
  TIRE_COMPOUNDS,
  TireCompound,
  WeatherType,
} from './physics';
import {
  getTrackSamples,
  TRACK_KERB_WIDTH,
  TrackDefinition,
  TrackPoint,
} from './track';

export interface CarRig {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  exteriorBodyMesh: THREE.Mesh;
  drsFlapMesh?: THREE.Mesh;
  frontLeftSteer: THREE.Group;
  frontRightSteer: THREE.Group;
  wheelMeshes: THREE.Object3D[];
  brakeLightMat: THREE.MeshBasicMaterial;
  nitroFlameLeft: THREE.Mesh;
  nitroFlameRight: THREE.Mesh;
  cockpitGroup: THREE.Group;
  steeringWheelRig: THREE.Group;
  headlightBeamGroup: THREE.Group;
  labelSprite?: THREE.Sprite;
  labelName?: string;
  currentCompound?: TireCompound;
}

export interface ParticlePool {
  mesh: THREE.InstancedMesh;
  spawn: (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    colorHex: number,
    scale: number,
    life: number
  ) => void;
  update: (dt: number) => void;
}

export interface WeatherSystem {
  mesh: THREE.InstancedMesh;
  update: (
    dt: number,
    camX: number,
    camY: number,
    camZ: number,
    weather: WeatherType
  ) => void;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;
let sharedCheckeredTex: THREE.CanvasTexture | null = null;
let sharedHeadlightBeamTex: THREE.CanvasTexture | null = null;
let sharedPitZoneTex: THREE.CanvasTexture | null = null;
let sharedPitEntryChevronTex: THREE.CanvasTexture | null = null;
let sharedEnvCubeMap: THREE.CubeTexture | null = null;
let sharedStudioEnvTex: THREE.Texture | null = null;
let sharedBumpTex: THREE.CanvasTexture | null = null;
const cachedAsphaltTextures = new Map<string, THREE.CanvasTexture>();
const cachedGroundTextures = new Map<string, THREE.CanvasTexture>();
const cachedSkyTextures = new Map<string, THREE.CanvasTexture>();
const cachedBodyGeometries = new Map<string, THREE.BufferGeometry>();
const cachedWheelGeometries = new Map<
  number,
  {
    frontLeftWheel: THREE.BufferGeometry;
    frontRightWheel: THREE.BufferGeometry;
    rearAxle: THREE.BufferGeometry;
  }
>();
const cachedCockpitGeometries = new Map<
  string,
  {
    interiorShell: THREE.BufferGeometry;
    steeringWheelAndHands: THREE.BufferGeometry;
  }
>();

let cachedStaticCarGeos: {
  shadow: THREE.PlaneGeometry;
  tailBar: THREE.BoxGeometry;
  drsFlap: THREE.BoxGeometry;
  flame: THREE.ConeGeometry;
  headlightBeam: THREE.PlaneGeometry;
} | null = null;

function getStaticCarGeometries() {
  if (!cachedStaticCarGeos) {
    const flame = new THREE.ConeGeometry(0.16, 0.95, 8);
    flame.rotateX(-Math.PI / 2);
    const headlightBeam = new THREE.PlaneGeometry(5.8, 20);
    headlightBeam.rotateX(-Math.PI / 2);
    cachedStaticCarGeos = {
      shadow: new THREE.PlaneGeometry(2.75, 5.45),
      tailBar: new THREE.BoxGeometry(0.22, 0.16, 0.08),
      drsFlap: new THREE.BoxGeometry(1.48, 0.08, 0.18),
      flame,
      headlightBeam,
    };
  }
  return cachedStaticCarGeos;
}

/**
 * Initializes a studio PMREM environment map using RoomEnvironment so all PBR and
 * reflective surfaces exhibit crisp F1 2026 specular highlights.
 */
export function initStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene
): THREE.Texture | null {
  try {
    if (!sharedStudioEnvTex) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const roomEnv = new RoomEnvironment();
      sharedStudioEnvTex = pmrem.fromScene(roomEnv, 0.04).texture;
      roomEnv.dispose();
      pmrem.dispose();
    }
    scene.environment = sharedStudioEnvTex;
    return sharedStudioEnvTex;
  } catch {
    return null;
  }
}

function getMicroBumpTexture(): THREE.CanvasTexture {
  if (sharedBumpTex) return sharedBumpTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const v = 90 + Math.floor(Math.random() * 76);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  sharedBumpTex = tex;
  return tex;
}

/**
 * Generates a 6-face procedural CubeTexture for real-time automotive clearcoat reflections.
 */
function getProceduralEnvCubeMap(): THREE.CubeTexture {
  if (sharedEnvCubeMap) return sharedEnvCubeMap;
  const faces: HTMLCanvasElement[] = [];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    if (f === 2) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(0, 0, 64, 64);
    } else if (f === 3) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 64, 64);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#0284c7');
      g.addColorStop(0.46, '#bae6fd');
      g.addColorStop(0.52, '#f59e0b');
      g.addColorStop(0.60, '#1e293b');
      g.addColorStop(1, '#090d16');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    faces.push(c);
  }
  const cubeTex = new THREE.CubeTexture(faces);
  cubeTex.needsUpdate = true;
  sharedEnvCubeMap = cubeTex;
  return cubeTex;
}

function createGroundTexture(trackDef: TrackDefinition): THREE.CanvasTexture {
  const key = `${trackDef.id}_${trackDef.theme.groundHex}`;
  const cached = cachedGroundTextures.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const baseColor = new THREE.Color(trackDef.theme.groundHex);
  const lightColor = baseColor.clone().offsetHSL(0, 0.02, 0.045);
  const darkColor = baseColor.clone().offsetHSL(0, 0, -0.04);

  ctx.fillStyle = `#${baseColor.getHexString()}`;
  ctx.fillRect(0, 0, 256, 256);

  // Diagonal F1 stadium lawn / terrain mowing stripes
  ctx.fillStyle = `#${lightColor.getHexString()}`;
  for (let s = -256; s < 512; s += 64) {
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(s + 32, 0);
    ctx.lineTo(s + 32 - 256, 256);
    ctx.lineTo(s - 256, 256);
    ctx.closePath();
    ctx.fill();
  }

  // Organic micro-relief speckles
  ctx.fillStyle = `#${darkColor.getHexString()}`;
  for (let i = 0; i < 900; i++) {
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(55, 55);
  cachedGroundTextures.set(key, tex);
  return tex;
}

function createAsphaltTexture(
  asphaltHex: string,
  edgeLineHex: string
): THREE.CanvasTexture {
  const key = `${asphaltHex}_${edgeLineHex}_v3`;
  const existing = cachedAsphaltTextures.get(key);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = asphaltHex;
  ctx.fillRect(0, 0, 512, 512);

  // Realistic rubbered-in F1 racing groove & twin wheel tracks
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.34)');
  grad.addColorStop(0.16, 'rgba(255,255,255,0.04)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.30)');
  grad.addColorStop(0.50, 'rgba(255,255,255,0.03)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.30)');
  grad.addColorStop(0.84, 'rgba(255,255,255,0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // High-frequency tarmac aggregate micro-grain
  for (let i = 0; i < 4200; i++) {
    const v = 32 + Math.floor(Math.random() * 38);
    ctx.fillStyle = `rgba(${v + 10}, ${v + 14}, ${v + 20}, 0.25)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }

  // Subtle tire rubber skid streaks along racing line
  ctx.fillStyle = 'rgba(6, 8, 14, 0.22)';
  for (let s = 0; s < 34; s++) {
    const sx = 110 + Math.random() * 292;
    ctx.fillRect(sx, Math.random() * 512, 3, 50 + Math.random() * 80);
  }

  // Crisp FIA White/Cyan Track Limit Edge Lines
  ctx.fillStyle = edgeLineHex;
  ctx.fillRect(12, 0, 12, 512);
  ctx.fillRect(488, 0, 12, 512);

  // Subtle center reference dashes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
  ctx.fillRect(253, 36, 6, 165);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cachedAsphaltTextures.set(key, tex);
  return tex;
}

function createCheckeredBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const size = 16;
  for (let y = 0; y < 64; y += size) {
    for (let x = 0; x < 256; x += size) {
      const even = (x / size + y / size) % 2 === 0;
      ctx.fillStyle = even ? '#f8fafc' : '#0f172a';
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPitEntryChevronTexture(): THREE.CanvasTexture {
  if (sharedPitEntryChevronTex) return sharedPitEntryChevronTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
  ctx.fillRect(0, 0, 128, 512);

  // Outer dashed Pit Entry Corridor lines
  ctx.fillStyle = '#10b981';
  for (let y = 0; y < 512; y += 32) {
    ctx.fillRect(4, y, 8, 20);
    ctx.fillRect(116, y, 8, 20);
  }

  // Forward-pointing glowing green/yellow chevrons guiding into PIT IN
  for (let y = 24; y < 490; y += 64) {
    ctx.fillStyle = y % 128 === 24 ? '#22c55e' : '#facc15';
    ctx.beginPath();
    ctx.moveTo(26, y + 28);
    ctx.lineTo(64, y);
    ctx.lineTo(102, y + 28);
    ctx.lineTo(102, y + 44);
    ctx.lineTo(64, y + 16);
    ctx.lineTo(26, y + 44);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedPitEntryChevronTex = tex;
  return tex;
}

function createPitZoneDecalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // F1 2026 Team Pit Stall tarmac apron
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(0, 0, 256, 512);

  // Red & White F1 Pit Stall border stripes
  for (let y = 0; y < 512; y += 32) {
    ctx.fillStyle = (y / 32) % 2 === 0 ? '#e10600' : '#f8fafc';
    ctx.fillRect(4, y, 14, 32);
    ctx.fillRect(238, y, 14, 32);
  }

  // Glowing cyan/emerald inner frame
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 8;
  ctx.strokeRect(22, 12, 212, 488);

  // Yellow & Red 4-Wheel Stop Target Brackets inside the Pit Box
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.strokeRect(38, 145, 48, 78);
  ctx.strokeRect(170, 145, 48, 78);
  ctx.strokeRect(38, 290, 48, 78);
  ctx.strokeRect(170, 290, 48, 78);

  // Center F1 Nosecone Stop Line ("STOP")
  ctx.fillStyle = '#e10600';
  ctx.fillRect(54, 112, 148, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PIT STOP BOX', 128, 95);

  // Forward guidance chevrons
  ctx.fillStyle = 'rgba(56, 189, 248, 0.92)';
  for (let y = 180; y < 460; y += 110) {
    ctx.beginPath();
    ctx.moveTo(76, y + 36);
    ctx.lineTo(128, y);
    ctx.lineTo(180, y + 36);
    ctx.lineTo(180, y + 56);
    ctx.lineTo(128, y + 20);
    ctx.lineTo(76, y + 56);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCarShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 64, 6, 32, 64, 52);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
  grad.addColorStop(0.68, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createHeadlightBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, 'rgba(224, 242, 254, 0.58)');
  grad.addColorStop(0.5, 'rgba(186, 230, 253, 0.22)');
  grad.addColorStop(1, 'rgba(186, 230, 253, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(36, 256);
  ctx.lineTo(92, 256);
  ctx.lineTo(126, 0);
  ctx.lineTo(2, 0);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSkyDomeTexture(
  topHex: number,
  midHex: number,
  horizonHex: number,
  isNight: boolean
): THREE.CanvasTexture {
  const key = `${topHex}_${midHex}_${horizonHex}_${isNight}_v2`;
  const cached = cachedSkyTextures.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const cTop = `#${topHex.toString(16).padStart(6, '0')}`;
  const cMid = `#${midHex.toString(16).padStart(6, '0')}`;
  const cHor = `#${horizonHex.toString(16).padStart(6, '0')}`;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, cTop);
  grad.addColorStop(0.42, cMid);
  grad.addColorStop(0.76, cHor);
  grad.addColorStop(1.0, cTop);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  if (isNight) {
    for (let s = 0; s < 220; s++) {
      const sx = Math.random() * 512;
      const sy = Math.random() * 145;
      const alpha = 0.35 + Math.random() * 0.65;
      ctx.fillStyle = `rgba(248, 250, 252, ${alpha.toFixed(2)})`;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
  } else {
    for (let c = 0; c < 28; c++) {
      const cx = Math.random() * 512;
      const cy = 50 + Math.random() * 105;
      const w = 48 + Math.random() * 96;
      const h = 6 + Math.random() * 14;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedSkyTextures.set(key, tex);
  return tex;
}

export function createNameplateSprite(
  name: string,
  colorHex: number
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(9, 13, 20, 0.90)';
  ctx.beginPath();
  ctx.roundRect(12, 8, 232, 48, 8);
  ctx.fill();

  ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 23px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 16), 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.8, 1);
  sprite.position.set(0, 1.75, 0);
  return sprite;
}

function adjustHexBrightness(hex: number, deltaLum: number): number {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, deltaLum);
  return c.getHex();
}

class GeometryBuilder {
  public positions: number[] = [];
  public normals: number[] = [];
  public colors: number[] = [];
  private c = new THREE.Color();

  public addTri(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    hex: number
  ) {
    const ux = cx - bx;
    const uy = cy - by;
    const uz = cz - bz;
    const vx = ax - bx;
    const vy = ay - by;
    const vz = az - bz;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    this.c.setHex(hex);
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.colors.push(
      this.c.r,
      this.c.g,
      this.c.b,
      this.c.r,
      this.c.g,
      this.c.b,
      this.c.r,
      this.c.g,
      this.c.b
    );
  }

  public addQuad(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
    hex: number
  ) {
    this.addTri(ax, ay, az, bx, by, bz, cx, cy, cz, hex);
    this.addTri(ax, ay, az, cx, cy, cz, dx, dy, dz, hex);
  }

  public addSection(
    z0: number,
    wBot0: number,
    wTop0: number,
    yBot0: number,
    yTop0: number,
    z1: number,
    wBot1: number,
    wTop1: number,
    yBot1: number,
    yTop1: number,
    colors: {
      top?: number;
      sides?: number;
      bottom?: number;
      front?: number;
      back?: number;
    }
  ) {
    const hb0 = wBot0 * 0.5;
    const ht0 = wTop0 * 0.5;
    const hb1 = wBot1 * 0.5;
    const ht1 = wTop1 * 0.5;

    if (colors.top !== undefined) {
      this.addQuad(
        -ht0, yTop0, z0,
        -ht1, yTop1, z1,
        ht1, yTop1, z1,
        ht0, yTop0, z0,
        adjustHexBrightness(colors.top, 0.05)
      );
    }
    if (colors.bottom !== undefined) {
      this.addQuad(
        -hb1, yBot1, z1,
        -hb0, yBot0, z0,
        hb0, yBot0, z0,
        hb1, yBot1, z1,
        adjustHexBrightness(colors.bottom, -0.05)
      );
    }
    if (colors.sides !== undefined) {
      const sideDark = adjustHexBrightness(colors.sides, -0.03);
      this.addQuad(
        hb0, yBot0, z0,
        hb0, yTop0, z0,
        hb1, yTop1, z1,
        hb1, yBot1, z1,
        sideDark
      );
      this.addQuad(
        -hb1, yBot1, z1,
        -ht1, yTop1, z1,
        -ht0, yTop0, z0,
        -hb0, yBot0, z0,
        sideDark
      );
    }
    if (colors.front !== undefined) {
      this.addQuad(
        -hb1, yBot1, z1,
        hb1, yBot1, z1,
        ht1, yTop1, z1,
        -ht1, yTop1, z1,
        colors.front
      );
    }
    if (colors.back !== undefined) {
      this.addQuad(
        hb0, yBot0, z0,
        -hb0, yBot0, z0,
        -ht0, yTop0, z0,
        ht0, yTop0, z0,
        colors.back
      );
    }
  }

  public addBox(
    cx: number,
    cy: number,
    cz: number,
    wx: number,
    wy: number,
    wz: number,
    hex: number,
    topScaleX = 1.0,
    topOffsetZ = 0.0
  ) {
    const z0 = cz - wz * 0.5;
    const z1 = cz + wz * 0.5;
    const y0 = cy - wy * 0.5;
    const y1 = cy + wy * 0.5;
    const hb = wx * 0.5;
    const ht = wx * 0.5 * topScaleX;

    const topHex = adjustHexBrightness(hex, 0.06);
    const sideHex = adjustHexBrightness(hex, -0.04);
    const frontBackHex = adjustHexBrightness(hex, 0.01);

    // Top face
    this.addQuad(
      cx - ht, y1, z0 + topOffsetZ,
      cx - ht, y1, z1 + topOffsetZ,
      cx + ht, y1, z1 + topOffsetZ,
      cx + ht, y1, z0 + topOffsetZ,
      topHex
    );
    // Bottom face
    this.addQuad(
      cx - hb, y0, z1,
      cx - hb, y0, z0,
      cx + hb, y0, z0,
      cx + hb, y0, z1,
      sideHex
    );
    // +X Side
    this.addQuad(
      cx + hb, y0, z0,
      cx + ht, y1, z0 + topOffsetZ,
      cx + ht, y1, z1 + topOffsetZ,
      cx + hb, y0, z1,
      frontBackHex
    );
    // -X Side
    this.addQuad(
      cx - hb, y0, z1,
      cx - ht, y1, z1 + topOffsetZ,
      cx - ht, y1, z0 + topOffsetZ,
      cx - hb, y0, z0,
      sideHex
    );
    // +Z Front
    this.addQuad(
      cx - hb, y0, z1,
      cx + hb, y0, z1,
      cx + ht, y1, z1 + topOffsetZ,
      cx - ht, y1, z1 + topOffsetZ,
      topHex
    );
    // -Z Back
    this.addQuad(
      cx + hb, y0, z0,
      cx - hb, y0, z0,
      cx - ht, y1, z0 + topOffsetZ,
      cx + ht, y1, z0 + topOffsetZ,
      sideHex
    );
  }

  public addOrientedBox(
    wx: number,
    wy: number,
    wz: number,
    yaw: number,
    lx: number,
    ly: number,
    lz: number,
    hex: number
  ) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const hx = lx * 0.5;
    const hy = ly * 0.5;
    const hz = lz * 0.5;

    const pt = (dx: number, dy: number, dz: number): [number, number, number] => [
      wx + dx * cos + dz * sin,
      wy + dy,
      wz - dx * sin + dz * cos,
    ];

    const p000 = pt(-hx, -hy, -hz);
    const p100 = pt(hx, -hy, -hz);
    const p101 = pt(hx, -hy, hz);
    const p001 = pt(-hx, -hy, hz);
    const p010 = pt(-hx, hy, -hz);
    const p110 = pt(hx, hy, -hz);
    const p111 = pt(hx, hy, hz);
    const p011 = pt(-hx, hy, hz);

    const topHex = adjustHexBrightness(hex, 0.06);
    const sideHex = adjustHexBrightness(hex, -0.04);

    this.addQuad(...p010, ...p011, ...p111, ...p110, topHex);
    this.addQuad(...p100, ...p110, ...p111, ...p101, hex);
    this.addQuad(...p001, ...p011, ...p010, ...p000, sideHex);
    this.addQuad(...p001, ...p101, ...p111, ...p011, topHex);
    this.addQuad(...p100, ...p000, ...p010, ...p110, sideHex);
  }

  public toBufferGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(this.positions, 3)
    );
    geo.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(this.normals, 3)
    );
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

/**
 * Custom Automotive Clearcoat Shader Material with CubeMap Reflection, Fresnel Rim & Specular Sheen
 */
let sharedAutomotiveMaterial: THREE.MeshPhongMaterial | null = null;
function createAutomotiveShaderMaterial(): THREE.MeshPhongMaterial {
  if (sharedAutomotiveMaterial) return sharedAutomotiveMaterial;
  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 165,
    specular: new THREE.Color(0xe2e8f0),
    envMap: getProceduralEnvCubeMap(),
    reflectivity: 0.38,
    combine: THREE.MixOperation,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      vec3 viewDir = normalize(vViewPosition);
      float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.4);
      float topSheen = max(0.0, normal.y) * 0.10;
      gl_FragColor.rgb += vec3(0.20, 0.28, 0.40) * fresnel + vec3(topSheen);
      #include <dithering_fragment>
      `
    );
  };
  sharedAutomotiveMaterial = mat;
  return mat;
}

/**
 * Builds an F1 2026 Active-Aero Monopost!
 */
function buildFormulaCarBodyGeometry(spec: CarSpec): THREE.BufferGeometry {
  const existing = cachedBodyGeometries.get(spec.id);
  if (existing) return existing;

  const gb = new GeometryBuilder();

  const paint = spec.colorHex;
  const accent = spec.accentHex;
  const carbon = 0x131720;
  const darkRecess = 0x080b10;
  const haloTitanium = 0x1e293b;
  const helmetVisor = 0x38bdf8;
  const exhaustChrome = 0xe2e8f0;
  const caliperRed = 0xef4444;
  const ersGlowCyan = 0x22d3ee;

  // 1. Carbon Ground-Effect Venturi Floor Plank (-1.98 -> +0.85) & Rear Diffuser
  gb.addSection(
    -1.98, 1.58, 1.64, 0.08, 0.14,
    0.72, 1.70, 1.74, 0.08, 0.13,
    { top: carbon, sides: carbon, bottom: carbon, front: carbon, back: darkRecess }
  );
  // Floor edge vortex strakes & 2026 floor fences
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.85, 0.13, -0.55, 0.045, 0.045, 2.28, accent);
    gb.addBox(side * 0.83, 0.17, 0.48, 0.03, 0.11, 0.30, carbon);
    // 2026 Front Wheel Wake Deflector Fin ("Blatník / Wake Winglet")
    gb.addBox(side * 0.78, 0.56, 1.06, 0.035, 0.18, 0.36, carbon, 0.8, -0.05);
  }
  for (const fx of [-0.56, -0.26, 0.26, 0.56]) {
    gb.addBox(fx, 0.16, -2.02, 0.03, 0.17, 0.30, carbon);
  }
  gb.addBox(0, 0.24, -2.14, 0.14, 0.16, 0.08, carbon);
  gb.addBox(0, 0.42, -2.12, 0.13, 0.13, 0.25, exhaustChrome);
  gb.addBox(0, 0.42, -2.24, 0.09, 0.09, 0.04, darkRecess);
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.09, 0.39, -2.10, 0.045, 0.045, 0.20, exhaustChrome);
  }

  // 2. Central Monocoque Fuselage & F1 2026 Sculpted Needle Nosecone (-1.85 -> +2.48)
  gb.addSection(
    -1.85, 0.52, 0.26, 0.14, 0.62,
    -0.60, 0.96, 0.58, 0.14, 0.84,
    { top: paint, sides: paint, back: darkRecess }
  );
  gb.addSection(
    -0.60, 0.96, 0.72, 0.14, 0.68,
    0.55, 0.72, 0.58, 0.16, 0.66,
    { top: carbon, sides: paint }
  );
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.30, 0.70, -0.05, 0.08, 0.12, 0.88, paint, 0.85, 0);
  }
  gb.addSection(
    0.55, 0.72, 0.58, 0.16, 0.66,
    1.45, 0.44, 0.36, 0.20, 0.54,
    { top: paint, sides: paint, bottom: carbon }
  );
  gb.addSection(
    1.45, 0.44, 0.36, 0.20, 0.54,
    2.48, 0.24, 0.18, 0.14, 0.28,
    { top: paint, sides: paint, bottom: carbon, front: accent }
  );
  gb.addBox(0, 0.55, 1.0, 0.14, 0.015, 0.85, accent);
  gb.addBox(0, 0.42, 1.92, 0.10, 0.015, 0.88, accent, 0.8, 0);

  // 3. F1 2026 3-Element Active Front Wing (+2.08 -> +2.54)
  gb.addBox(0, 0.12, 2.34, 1.90, 0.035, 0.34, carbon, 0.96, 0.04);
  gb.addBox(0, 0.17, 2.22, 1.84, 0.03, 0.22, paint, 0.95, -0.02);
  gb.addBox(0, 0.20, 2.15, 1.76, 0.02, 0.10, accent);
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.11, 0.18, 2.26, 0.035, 0.12, 0.22, carbon);
    gb.addBox(side * 0.94, 0.22, 2.28, 0.04, 0.26, 0.46, paint, 0.82, -0.05);
    gb.addBox(side * 0.96, 0.13, 2.28, 0.05, 0.04, 0.44, accent);
  }

  // 4. Sculpted Undercut Sidepods (-1.20 -> +0.52) with 2026 ERS Energy Light Strip
  for (const side of [-1, 1]) {
    gb.addBox(
      side * 0.56,
      0.38,
      -0.34,
      0.44,
      0.38,
      1.64,
      paint,
      0.78,
      -0.08
    );
    gb.addBox(side * 0.56, 0.40, 0.49, 0.36, 0.26, 0.06, darkRecess);
    gb.addBox(side * 0.56, 0.58, -0.25, 0.24, 0.015, 1.15, accent);
    // Glowing 2026 MGU-K Electrical Status Accent Strip along sidepod flank
    gb.addBox(side * 0.785, 0.36, -0.25, 0.015, 0.035, 1.18, ersGlowCyan);
    gb.addBox(side * 0.68, 0.30, 0.72, 0.035, 0.28, 0.32, carbon);
    gb.addBox(side * 0.52, 0.68, 0.42, 0.16, 0.03, 0.04, carbon);
    gb.addBox(side * 0.58, 0.71, 0.42, 0.14, 0.065, 0.11, paint);
  }

  // 5. Exposed Open-Wheel Carbon Double-Wishbone Suspension Arms & Brembo Brake Ducts
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.54, 0.44, 1.35, 0.68, 0.028, 0.06, carbon);
    gb.addBox(side * 0.54, 0.26, 1.35, 0.68, 0.028, 0.06, carbon);
    gb.addBox(side * 0.52, 0.36, 1.18, 0.64, 0.025, 0.045, carbon, 1.0, 0.12);
    gb.addBox(side * 0.72, 0.36, 1.35, 0.06, 0.24, 0.24, carbon);
    gb.addBox(side * 0.74, 0.36, 1.44, 0.05, 0.12, 0.08, caliperRed);

    gb.addBox(side * 0.54, 0.46, -1.32, 0.68, 0.03, 0.065, carbon);
    gb.addBox(side * 0.54, 0.26, -1.32, 0.68, 0.03, 0.065, carbon);
    gb.addBox(side * 0.52, 0.36, -1.16, 0.64, 0.025, 0.045, carbon);
    gb.addBox(side * 0.70, 0.37, -1.32, 0.06, 0.26, 0.26, carbon);
    gb.addBox(side * 0.72, 0.37, -1.22, 0.05, 0.13, 0.09, caliperRed);
  }

  // 6. Open Cockpit Driver Helmet, Overhead Roll-Hoop Airbox, T-Cam, Shark Fin & Titanium HALO
  gb.addBox(0, 0.75, -0.06, 0.24, 0.22, 0.26, accent, 0.85, -0.02);
  gb.addBox(0, 0.76, 0.06, 0.22, 0.09, 0.05, helmetVisor);

  gb.addBox(0, 0.74, 0.38, 0.04, 0.20, 0.06, haloTitanium, 0.9, -0.04);
  gb.addBox(0, 0.85, 0.32, 0.34, 0.04, 0.12, haloTitanium);
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.20, 0.83, 0.02, 0.045, 0.045, 0.62, haloTitanium);
  }

  gb.addBox(0, 0.94, -0.44, 0.24, 0.22, 0.36, paint, 0.78, -0.04);
  gb.addBox(0, 0.96, -0.25, 0.16, 0.14, 0.04, darkRecess);
  // Overhead FIA Onboard T-Cam Bar
  gb.addBox(0, 1.09, -0.38, 0.28, 0.03, 0.06, accent);

  gb.addBox(0, 0.86, -1.18, 0.035, 0.24, 1.12, carbon, 0.9, -0.08);
  gb.addBox(0, 0.92, -1.18, 0.04, 0.06, 1.06, accent);

  // 7. F1 2026 Swan-Neck Rear Wing Mainplane & Endplates (upper DRS flap is animated separately)
  gb.addBox(0, 0.68, -1.92, 0.06, 0.42, 0.22, carbon, 0.85, -0.05);
  gb.addBox(0, 0.86, -2.02, 1.54, 0.04, 0.28, carbon, 0.96, -0.02);
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.78, 0.80, -2.04, 0.04, 0.52, 0.42, paint, 0.9, -0.04);
    gb.addBox(side * 0.80, 0.96, -2.04, 0.045, 0.12, 0.38, accent);
  }

  const geo = gb.toBufferGeometry();
  cachedBodyGeometries.set(spec.id, geo);
  return geo;
}

/**
 * Builds the First-Person Open-Cockpit Formula View (`cockpitGroup`)
 */
function getCockpitGeometries(spec: CarSpec): {
  interiorShell: THREE.BufferGeometry;
  steeringWheelAndHands: THREE.BufferGeometry;
} {
  const cached = cachedCockpitGeometries.get(spec.id);
  if (cached) return cached;

  const shellGb = new GeometryBuilder();
  const paint = spec.colorHex;
  const accent = spec.accentHex;
  const carbon = 0x1a2232;
  const alcantara = 0x243044;
  const haloTitanium = 0x334155;

  shellGb.addSection(
    0.20, 0.92, 0.78, 0.50, 0.69,
    0.68, 0.76, 0.62, 0.50, 0.71,
    { top: alcantara, sides: paint, back: carbon }
  );
  for (const side of [-1, 1]) {
    shellGb.addBox(side * 0.38, 0.68, 0.15, 0.09, 0.12, 0.75, paint);
  }

  shellGb.addSection(
    0.68, 0.62, 0.50, 0.30, 0.69,
    1.55, 0.42, 0.34, 0.24, 0.56,
    { top: paint, sides: paint }
  );
  shellGb.addSection(
    1.55, 0.42, 0.34, 0.24, 0.56,
    2.42, 0.24, 0.18, 0.16, 0.30,
    { top: paint, sides: paint, front: accent }
  );
  shellGb.addBox(0, 0.63, 1.12, 0.12, 0.015, 0.86, accent);
  shellGb.addBox(0, 0.45, 1.96, 0.09, 0.015, 0.82, accent);

  shellGb.addBox(0, 0.16, 2.28, 1.88, 0.03, 0.28, carbon);
  for (const side of [-1, 1]) {
    shellGb.addBox(side * 0.95, 0.22, 2.28, 0.04, 0.24, 0.44, paint);
    shellGb.addBox(side * 0.96, 0.15, 2.28, 0.05, 0.04, 0.42, accent);
    shellGb.addBox(side * 0.78, 0.56, 1.06, 0.035, 0.18, 0.36, carbon);
    shellGb.addBox(side * 0.54, 0.44, 1.32, 0.68, 0.026, 0.055, carbon);
    shellGb.addBox(side * 0.54, 0.28, 1.32, 0.68, 0.026, 0.055, carbon);
    shellGb.addBox(side * 0.50, 0.37, 1.16, 0.62, 0.022, 0.04, carbon);
    shellGb.addBox(side * 0.50, 0.72, 0.55, 0.18, 0.025, 0.04, carbon);
    shellGb.addBox(side * 0.58, 0.76, 0.55, 0.16, 0.075, 0.09, paint);
    shellGb.addBox(side * 0.58, 0.76, 0.50, 0.13, 0.055, 0.015, 0x38bdf8);
  }

  shellGb.addBox(0, 0.97, 0.86, 0.020, 0.54, 0.038, haloTitanium, 0.85, -0.08);
  shellGb.addBox(0, 1.24, 0.70, 0.76, 0.032, 0.18, haloTitanium);
  for (const side of [-1, 1]) {
    shellGb.addBox(side * 0.38, 1.15, 0.30, 0.036, 0.036, 0.78, haloTitanium, 1.0, 0);
  }

  shellGb.addBox(0, 0.68, 0.52, 0.065, 0.065, 0.26, carbon);

  const wheelGb = new GeometryBuilder();
  const rimCarbon = 0x263248;
  const gripSuede = 0x3b4963;
  const screenBg = 0x06101e;
  const screenCyan = 0x38bdf8;
  const gloveColor = 0xef4444;
  const glovePalm = 0xfacc15;
  const cuffAccent = 0xf8fafc;
  const sleeveDark = 0x1e293b;

  wheelGb.addBox(0, 0.0, 0, 0.22, 0.125, 0.024, rimCarbon, 0.92, 0);
  wheelGb.addBox(0, 0.072, 0, 0.20, 0.022, 0.026, rimCarbon);
  wheelGb.addBox(-0.065, 0.072, -0.014, 0.028, 0.010, 0.005, 0x22c55e);
  wheelGb.addBox(-0.032, 0.072, -0.014, 0.028, 0.010, 0.005, 0x22c55e);
  wheelGb.addBox(0.0, 0.072, -0.014, 0.028, 0.010, 0.005, 0xfacc15);
  wheelGb.addBox(0.032, 0.072, -0.014, 0.028, 0.010, 0.005, 0xef4444);
  wheelGb.addBox(0.065, 0.072, -0.014, 0.028, 0.010, 0.005, 0x38bdf8);

  wheelGb.addBox(0, 0.012, -0.013, 0.118, 0.064, 0.004, screenBg);
  wheelGb.addBox(0, 0.026, -0.015, 0.098, 0.015, 0.003, screenCyan);
  wheelGb.addBox(-0.028, -0.004, -0.015, 0.034, 0.024, 0.003, 0xfacc15);
  wheelGb.addBox(0.028, -0.004, -0.015, 0.034, 0.024, 0.003, 0x22c55e);

  wheelGb.addBox(0, -0.042, -0.014, 0.024, 0.024, 0.008, 0xef4444);
  wheelGb.addBox(-0.045, -0.042, -0.014, 0.020, 0.020, 0.008, 0x38bdf8);
  wheelGb.addBox(0.045, -0.042, -0.014, 0.020, 0.020, 0.008, 0xfacc15);

  for (const side of [-1, 1]) {
    const gx = side * 0.132;
    wheelGb.addBox(gx, 0.0, 0, 0.032, 0.145, 0.028, gripSuede, 0.9, 0);
    wheelGb.addBox(side * 0.105, 0.062, 0, 0.055, 0.022, 0.024, rimCarbon);
    wheelGb.addBox(side * 0.105, -0.056, 0, 0.055, 0.022, 0.024, rimCarbon);
    wheelGb.addBox(side * 0.095, 0.01, 0.022, 0.035, 0.075, 0.008, accent);

    wheelGb.addBox(gx + side * 0.006, -0.004, -0.004, 0.044, 0.064, 0.044, gloveColor, 0.9, 0);
    wheelGb.addBox(
      gx - side * 0.022,
      0.026,
      -0.012,
      0.030,
      0.022,
      0.028,
      glovePalm
    );
    wheelGb.addBox(
      gx + side * 0.018,
      -0.042,
      -0.042,
      0.044,
      0.042,
      0.048,
      cuffAccent
    );
    wheelGb.addBox(
      gx + side * 0.045,
      -0.135,
      -0.115,
      0.056,
      0.15,
      0.11,
      sleeveDark,
      0.85,
      0.03
    );
  }

  const built = {
    interiorShell: shellGb.toBufferGeometry(),
    steeringWheelAndHands: wheelGb.toBufferGeometry(),
  };
  cachedCockpitGeometries.set(spec.id, built);
  return built;
}

function buildWheelGeometries(compoundRingHex: number): {
  frontLeftWheel: THREE.BufferGeometry;
  frontRightWheel: THREE.BufferGeometry;
  rearAxle: THREE.BufferGeometry;
} {
  const cached = cachedWheelGeometries.get(compoundRingHex);
  if (cached) return cached;

  function appendWheelAt(
    gb: GeometryBuilder,
    offsetX: number,
    radius: number,
    width: number,
    outwardSign: 1 | -1
  ) {
    const segs = 18;
    const tireDark = 0x10131a;
    const tireShoulder = 0x1c2230;
    const rimDark = 0x1e293b;
    const rotorGlow = 0xf97316;

    const halfW = width * 0.5;
    const bevelW = halfW * 0.80;
    const stripeInnerR = radius * 0.71;
    const stripeOuterR = radius * 0.84;
    const rimR = radius * 0.56;
    const shoulderR = radius * 0.94;

    const xMin = offsetX - halfW;
    const xMinBevel = offsetX - bevelW;
    const xMaxBevel = offsetX + bevelW;
    const xMax = offsetX + halfW;

    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const y0 = Math.cos(a0);
      const z0 = Math.sin(a0);
      const y1 = Math.cos(a1);
      const z1 = Math.sin(a1);

      gb.addQuad(
        xMinBevel, y0 * radius, z0 * radius,
        xMinBevel, y1 * radius, z1 * radius,
        xMaxBevel, y1 * radius, z1 * radius,
        xMaxBevel, y0 * radius, z0 * radius,
        tireDark
      );

      // +X Sidewall
      gb.addQuad(
        xMaxBevel, y0 * radius, z0 * radius,
        xMaxBevel, y1 * radius, z1 * radius,
        xMax, y1 * shoulderR, z1 * shoulderR,
        xMax, y0 * shoulderR, z0 * shoulderR,
        tireShoulder
      );
      gb.addQuad(
        xMax, y0 * shoulderR, z0 * shoulderR,
        xMax, y1 * shoulderR, z1 * shoulderR,
        xMax, y1 * stripeOuterR, z1 * stripeOuterR,
        xMax, y0 * stripeOuterR, z0 * stripeOuterR,
        tireDark
      );
      gb.addQuad(
        xMax, y0 * stripeOuterR, z0 * stripeOuterR,
        xMax, y1 * stripeOuterR, z1 * stripeOuterR,
        xMax, y1 * stripeInnerR, z1 * stripeInnerR,
        xMax, y0 * stripeInnerR, z0 * stripeInnerR,
        compoundRingHex
      );
      gb.addQuad(
        xMax, y0 * stripeInnerR, z0 * stripeInnerR,
        xMax, y1 * stripeInnerR, z1 * stripeInnerR,
        xMax, y1 * rimR, z1 * rimR,
        xMax, y0 * rimR, z0 * rimR,
        tireDark
      );
      gb.addTri(
        xMax, 0, 0,
        xMax, y0 * rimR, z0 * rimR,
        xMax, y1 * rimR, z1 * rimR,
        outwardSign > 0 ? rimDark : rotorGlow
      );

      // -X Sidewall
      gb.addQuad(
        xMin, y0 * shoulderR, z0 * shoulderR,
        xMin, y1 * shoulderR, z1 * shoulderR,
        xMinBevel, y1 * radius, z1 * radius,
        xMinBevel, y0 * radius, z0 * radius,
        tireShoulder
      );
      gb.addQuad(
        xMin, y0 * stripeOuterR, z0 * stripeOuterR,
        xMin, y1 * stripeOuterR, z1 * stripeOuterR,
        xMin, y1 * shoulderR, z1 * shoulderR,
        xMin, y0 * shoulderR, z0 * shoulderR,
        tireDark
      );
      gb.addQuad(
        xMin, y0 * stripeInnerR, z0 * stripeInnerR,
        xMin, y1 * stripeInnerR, z1 * stripeInnerR,
        xMin, y1 * stripeOuterR, z1 * stripeOuterR,
        xMin, y0 * stripeOuterR, z0 * stripeOuterR,
        compoundRingHex
      );
      gb.addQuad(
        xMin, y0 * rimR, z0 * rimR,
        xMin, y1 * rimR, z1 * rimR,
        xMin, y1 * stripeInnerR, z1 * stripeInnerR,
        xMin, y0 * stripeInnerR, z0 * stripeInnerR,
        tireDark
      );
      gb.addTri(
        xMin, 0, 0,
        xMin, y1 * rimR, z1 * rimR,
        xMin, y0 * rimR, z0 * rimR,
        outwardSign < 0 ? rimDark : rotorGlow
      );
    }

    gb.addBox(
      offsetX + outwardSign * halfW,
      0,
      0,
      0.03,
      rimR * 1.6,
      0.06,
      0x94a3b8
    );
    gb.addBox(
      offsetX + outwardSign * halfW,
      0,
      0,
      0.03,
      0.06,
      rimR * 1.6,
      0x94a3b8
    );
    gb.addBox(
      offsetX + outwardSign * (halfW + 0.015),
      0,
      0,
      0.03,
      0.11,
      0.11,
      compoundRingHex
    );
  }

  const flGb = new GeometryBuilder();
  appendWheelAt(flGb, 0, 0.35, 0.38, 1);

  const frGb = new GeometryBuilder();
  appendWheelAt(frGb, 0, 0.35, 0.38, -1);

  const rearGb = new GeometryBuilder();
  appendWheelAt(rearGb, 0.92, 0.37, 0.46, 1);
  appendWheelAt(rearGb, -0.92, 0.37, 0.46, -1);

  const built = {
    frontLeftWheel: flGb.toBufferGeometry(),
    frontRightWheel: frGb.toBufferGeometry(),
    rearAxle: rearGb.toBufferGeometry(),
  };
  cachedWheelGeometries.set(compoundRingHex, built);
  return built;
}

export function updateCarRigTireCompound(
  rig: CarRig,
  compound: TireCompound
): void {
  if (rig.currentCompound === compound) return;
  rig.currentCompound = compound;
  const compoundHex = TIRE_COMPOUNDS[compound]?.colorHex ?? 0xef4444;
  const wheelGeos = buildWheelGeometries(compoundHex);
  const [fl, fr, rear] = rig.wheelMeshes as THREE.Mesh[];
  if (fl) fl.geometry = wheelGeos.frontLeftWheel;
  if (fr) fr.geometry = wheelGeos.frontRightWheel;
  if (rear) rear.geometry = wheelGeos.rearAxle;
}

export function createRaceCarMesh(
  spec: CarSpec,
  labelText?: string,
  compound: TireCompound = 'soft'
): CarRig {
  const root = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

  const staticGeos = getStaticCarGeometries();
  const bodyGeo = buildFormulaCarBodyGeometry(spec);
  const compoundHex = TIRE_COMPOUNDS[compound]?.colorHex ?? 0xef4444;
  const wheelGeos = buildWheelGeometries(compoundHex);
  const cockpitGeos = getCockpitGeometries(spec);

  if (!sharedShadowTex) {
    sharedShadowTex = createCarShadowTexture();
  }
  const shadowMat = new THREE.MeshBasicMaterial({
    map: sharedShadowTex,
    transparent: true,
    depthWrite: false,
  });
  const shadowPlane = new THREE.Mesh(staticGeos.shadow, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  const bodyMat = createAutomotiveShaderMaterial();
  const exteriorBodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyTiltGroup.add(exteriorBodyMesh);

  // Active DRS Upper Rear Wing Flap that physically tilts open when DRS / Overtake Mode is active!
  const drsFlapMat = new THREE.MeshPhongMaterial({
    color: spec.colorHex,
    shininess: 140,
    specular: 0xffffff,
  });
  const drsFlapMesh = new THREE.Mesh(staticGeos.drsFlap, drsFlapMat);
  drsFlapMesh.position.set(0, 0.99, -2.10);
  bodyTiltGroup.add(drsFlapMesh);

  const cockpitGroup = new THREE.Group();
  cockpitGroup.visible = false;
  const cockpitShellMesh = new THREE.Mesh(cockpitGeos.interiorShell, bodyMat);
  cockpitGroup.add(cockpitShellMesh);

  const steeringWheelRig = new THREE.Group();
  steeringWheelRig.position.set(0, 0.71, 0.38);
  steeringWheelRig.rotation.x = 0.14;
  const wheelDisplayMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const wheelAndHandsMesh = new THREE.Mesh(
    cockpitGeos.steeringWheelAndHands,
    wheelDisplayMat
  );
  steeringWheelRig.add(wheelAndHandsMesh);
  cockpitGroup.add(steeringWheelRig);
  bodyTiltGroup.add(cockpitGroup);

  const brakeLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const tailBar = new THREE.Mesh(staticGeos.tailBar, brakeLightMat);
  tailBar.position.set(0, 0.24, -2.18);
  bodyTiltGroup.add(tailBar);

  if (!sharedHeadlightBeamTex) {
    sharedHeadlightBeamTex = createHeadlightBeamTexture();
  }
  const headlightBeamGroup = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    map: sharedHeadlightBeamTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.65,
  });
  const beamMesh = new THREE.Mesh(staticGeos.headlightBeam, beamMat);
  beamMesh.position.set(0, 0.05, 10.2);
  headlightBeamGroup.add(beamMesh);
  headlightBeamGroup.visible = false;
  root.add(headlightBeamGroup);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
  });
  const nitroFlames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(staticGeos.flame, flameMat);
    flame.position.set(side * 0.14, 0.42, -2.55);
    flame.visible = false;
    bodyTiltGroup.add(flame);
    nitroFlames.push(flame);
  }

  const wheelMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 65,
    specular: new THREE.Color(0x475569),
  });

  const frontLeftSteer = new THREE.Group();
  const frontRightSteer = new THREE.Group();
  frontLeftSteer.position.set(0.91, 0.35, 1.35);
  frontRightSteer.position.set(-0.91, 0.35, 1.35);
  root.add(frontLeftSteer, frontRightSteer);

  const flWheel = new THREE.Mesh(wheelGeos.frontLeftWheel, wheelMat);
  frontLeftSteer.add(flWheel);

  const frWheel = new THREE.Mesh(wheelGeos.frontRightWheel, wheelMat);
  frontRightSteer.add(frWheel);

  const rearAxleMesh = new THREE.Mesh(wheelGeos.rearAxle, wheelMat);
  rearAxleMesh.position.set(0, 0.37, -1.32);
  root.add(rearAxleMesh);

  const wheelMeshes: THREE.Object3D[] = [flWheel, frWheel, rearAxleMesh];

  let labelSprite: THREE.Sprite | undefined;
  if (labelText) {
    labelSprite = createNameplateSprite(labelText, spec.colorHex);
    root.add(labelSprite);
  }

  return {
    root,
    bodyTiltGroup,
    exteriorBodyMesh,
    drsFlapMesh,
    frontLeftSteer,
    frontRightSteer,
    wheelMeshes,
    brakeLightMat,
    nitroFlameLeft: nitroFlames[0],
    nitroFlameRight: nitroFlames[1],
    cockpitGroup,
    steeringWheelRig,
    headlightBeamGroup,
    labelSprite,
    labelName: labelText,
    currentCompound: compound,
  };
}

/**
 * Animates the 3D F1 Pit Crew mechanics around the Pit Box Stall and the Festival Ferris Wheel.
 */
export function updatePitCrewAnimation(
  root: THREE.Object3D | null | undefined,
  arg1: number | boolean,
  arg2?: number | boolean
): void {
  if (!root) return;
  const isPitStopActive =
    typeof arg1 === 'boolean' ? arg1 : typeof arg2 === 'boolean' ? arg2 : false;
  const timeSec =
    typeof arg1 === 'number' ? arg1 : typeof arg2 === 'number' ? arg2 : 0;

  const crewGroup = root.getObjectByName('f1-pit-crew-group') as
    | THREE.Group
    | undefined;
  if (crewGroup) {
    const targetSlide = isPitStopActive ? 1.0 : 0.0;
    const currentSlide = (crewGroup.userData.slide ?? 0) as number;
    const nextSlide = currentSlide + (targetSlide - currentSlide) * 0.14;
    crewGroup.userData.slide = nextSlide;

    for (const child of crewGroup.children) {
      const role = child.userData.role as string | undefined;
      if (role === 'wheel-gunner') {
        const baseX = child.userData.baseX as number;
        const targetX = child.userData.targetX as number;
        const baseZ = child.userData.baseZ as number;
        const vib = isPitStopActive ? Math.sin(timeSec * 38 + baseZ) * 0.04 : 0;
        child.position.x = baseX + (targetX - baseX) * nextSlide + vib;
        child.position.y = -nextSlide * 0.16;
      } else if (role === 'jackman') {
        const baseZ = child.userData.baseZ as number;
        const targetZ = child.userData.targetZ as number;
        child.position.z = baseZ + (targetZ - baseZ) * nextSlide;
      } else if (role === 'pit-beacon') {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.color.setHex(
          isPitStopActive
            ? Math.floor(timeSec * 8) % 2 === 0
              ? 0xfacc15
              : 0xef4444
            : 0x22c55e
        );
      }
    }
  }

  const ferrisWheel = root.getObjectByName('f1-ferris-wheel-rotor');
  if (ferrisWheel) {
    ferrisWheel.rotation.z = timeSec * 0.18;
  }
}

export function applyAtmosphereAndLights(
  scene: THREE.Scene,
  hemiLight: THREE.HemisphereLight,
  sunLight: THREE.DirectionalLight,
  trackDef: TrackDefinition,
  timeOfDay: TimeOfDay,
  weather: WeatherType
): void {
  let skyHex = trackDef.theme.skyHex;
  let midSkyHex = trackDef.theme.hemiSkyHex;
  let fogHex = trackDef.theme.fogHex;
  let sunHex = trackDef.theme.sunLightHex;
  let hemiSky = trackDef.theme.hemiSkyHex;
  let hemiGround = trackDef.theme.hemiGroundHex;
  let sunIntensity = 2.05;
  let hemiIntensity = 1.08;

  if (timeOfDay === 'sunrise') {
    skyHex = 0x1e1b4b;
    midSkyHex = 0x7c2d12;
    fogHex = 0xd97706;
    sunHex = 0xffedd5;
    hemiSky = 0xfdba74;
    hemiGround = 0x31102f;
    sunIntensity = 2.25;
    sunLight.position.set(160, 32, 95);
  } else if (timeOfDay === 'sunset') {
    skyHex = 0x170f2e;
    midSkyHex = 0x6b21a8;
    fogHex = 0x9a3412;
    sunHex = 0xfb923c;
    hemiSky = 0xf472b6;
    hemiGround = 0x1e1b4b;
    sunIntensity = 2.15;
    sunLight.position.set(-150, 28, -80);
  } else if (timeOfDay === 'night') {
    skyHex = 0x030712;
    midSkyHex = 0x091326;
    fogHex = 0x070b16;
    sunHex = 0x38bdf8;
    hemiSky = 0x1e293b;
    hemiGround = 0x050811;
    sunIntensity = 0.72;
    hemiIntensity = 0.68;
    sunLight.position.set(40, 120, -60);
  } else {
    sunLight.position.set(85, 135, -60);
  }

  let fogNear = 135;
  let fogFar = 490;

  if (weather === 'fog') {
    fogHex = timeOfDay === 'night' ? 0x111827 : 0x94a3b8;
    skyHex = fogHex;
    midSkyHex = fogHex;
    fogNear = 26;
    fogFar = 175;
    sunIntensity *= 0.68;
  } else if (weather === 'rain') {
    fogHex = timeOfDay === 'night' ? 0x090f1d : 0x1e293b;
    skyHex = fogHex;
    midSkyHex = 0x334155;
    fogNear = 60;
    fogFar = 295;
    sunIntensity *= 0.75;
  } else if (weather === 'snow') {
    fogHex = timeOfDay === 'night' ? 0x1e293b : 0xcbd5e1;
    skyHex = fogHex;
    midSkyHex = 0x94a3b8;
    fogNear = 52;
    fogFar = 275;
  }

  scene.background = new THREE.Color(skyHex);
  if (!scene.environment) {
    scene.environment = getProceduralEnvCubeMap();
  }
  scene.fog = new THREE.Fog(fogHex, fogNear, fogFar);

  hemiLight.color.setHex(hemiSky);
  hemiLight.groundColor.setHex(hemiGround);
  hemiLight.intensity = hemiIntensity;

  sunLight.color.setHex(sunHex);
  sunLight.intensity = sunIntensity;

  const skyDome = scene.getObjectByName('sky-dome-mesh') as THREE.Mesh | undefined;
  if (skyDome && skyDome.material instanceof THREE.MeshBasicMaterial) {
    skyDome.material.map = createSkyDomeTexture(
      skyHex,
      midSkyHex,
      fogHex,
      timeOfDay === 'night'
    );
    skyDome.material.needsUpdate = true;
  }

  const sunOrb = scene.getObjectByName('sky-sun-orb') as THREE.Mesh | undefined;
  if (sunOrb) {
    const isHorizonSun = timeOfDay === 'sunrise' || timeOfDay === 'sunset';
    sunOrb.visible = weather === 'clear';
    if (timeOfDay === 'sunrise') {
      sunOrb.position.set(270, 48, 150);
      (sunOrb.material as THREE.MeshBasicMaterial).color.setHex(0xfb923c);
      sunOrb.scale.setScalar(1.65);
    } else if (timeOfDay === 'sunset') {
      sunOrb.position.set(-270, 42, -135);
      (sunOrb.material as THREE.MeshBasicMaterial).color.setHex(0xf43f5e);
      sunOrb.scale.setScalar(1.75);
    } else if (timeOfDay === 'night') {
      sunOrb.position.set(160, 185, -210);
      (sunOrb.material as THREE.MeshBasicMaterial).color.setHex(0xe2e8f0);
      sunOrb.scale.setScalar(0.85);
    } else {
      sunOrb.position.set(190, 210, -145);
      (sunOrb.material as THREE.MeshBasicMaterial).color.setHex(0xfef08a);
      sunOrb.scale.setScalar(isHorizonSun ? 1.5 : 1.0);
    }
  }

  const roadMesh = scene.getObjectByName('track-road-mesh') as THREE.Mesh | undefined;
  if (roadMesh && roadMesh.material instanceof THREE.MeshPhongMaterial) {
    if (weather === 'rain') {
      roadMesh.material.shininess = 175;
      roadMesh.material.specular.setHex(0x93c5fd);
      roadMesh.material.reflectivity = 0.38;
    } else {
      roadMesh.material.shininess = 48;
      roadMesh.material.specular.setHex(0x64748b);
      roadMesh.material.reflectivity = 0.12;
    }
  }
}

function minDistanceSqToTrack(
  wx: number,
  wz: number,
  samples: TrackPoint[],
  excludeSampleIndex = -1,
  excludeWindow = 0
): number {
  let minSq = Infinity;
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    if (excludeSampleIndex >= 0) {
      let diff = Math.abs(i - excludeSampleIndex);
      if (diff > n / 2) diff = n - diff;
      if (diff <= excludeWindow) continue;
    }
    const s = samples[i];
    const dx = wx - s.x;
    const dz = wz - s.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minSq) minSq = dSq;
  }
  return minSq;
}

function findNearestTrackSample(
  wx: number,
  wz: number,
  samples: TrackPoint[]
): { sample: TrackPoint; distSq: number } {
  let minSq = Infinity;
  let best = samples[0];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const dx = wx - s.x;
    const dz = wz - s.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minSq) {
      minSq = dSq;
      best = s;
    }
  }
  return { sample: best, distSq: minSq };
}

function createConformingTerrainMesh(
  samples: TrackPoint[],
  trackDef: TrackDefinition,
  roadHalfWidth: number
): THREE.Mesh {
  let minTrackY = Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].y < minTrackY) minTrackY = samples[i].y;
  }
  const baseFloorY = Math.min(-3.4, minTrackY - 1.8);
  const barrierHalfWidth = roadHalfWidth + 3.8;

  const planeSize = 1600;
  const gridSegs = 80;
  const terrainGeo = new THREE.PlaneGeometry(
    planeSize,
    planeSize,
    gridSegs,
    gridSegs
  );
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);

    const { sample, distSq } = findNearestTrackSample(vx, vz, samples);
    const dist = Math.sqrt(distSq);

    let vy = baseFloorY;
    if (dist < barrierHalfWidth + 4) {
      // Underneath or immediately next to the track road/kerbs: keep strictly 40cm below road surface
      vy = sample.y - 0.4;
    } else if (dist < barrierHalfWidth + 56) {
      // Smooth Hermite blend from track elevation down to ambient ground floor
      const t = (dist - (barrierHalfWidth + 4)) / 52;
      const smoothT = t * t * (3 - 2 * t);
      vy = (sample.y - 0.4) * (1 - smoothT) + baseFloorY * smoothT;
    } else {
      // Ambient undulating rolling terrain outside the racing envelope
      const rolling =
        Math.sin(vx * 0.007) * Math.cos(vz * 0.007) * 2.8 +
        Math.sin(vx * 0.015 + vz * 0.012) * 1.2;
      vy = baseFloorY + rolling;
    }

    posAttr.setY(i, vy);
  }

  terrainGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    map: createGroundTexture(trackDef),
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.04,
    bumpMap: getMicroBumpTexture(),
    bumpScale: 0.08,
  });

  const groundMesh = new THREE.Mesh(terrainGeo, groundMat);
  groundMesh.name = 'track-conformed-terrain-mesh';
  return groundMesh;
}

/**
 * Builds a composite 3D F1 Pit Crew Mechanic (legs, torso, arms, helmet, visor, wheel gun)
 */
function createPitMechanicMesh(
  suitHex: number,
  helmetHex: number,
  withWheelGun: boolean,
  facingRight: boolean
): THREE.Mesh {
  const gb = new GeometryBuilder();
  const sign = facingRight ? 1 : -1;
  // Boots & legs
  gb.addBox(-0.11, 0.22, 0, 0.14, 0.44, 0.16, 0x0f172a);
  gb.addBox(0.11, 0.22, 0, 0.14, 0.44, 0.16, 0x0f172a);
  // Fireproof racing suit torso + team stripe
  gb.addBox(0, 0.68, 0, 0.38, 0.5, 0.24, suitHex, 0.92, 0);
  gb.addBox(0, 0.72, 0, 0.4, 0.12, 0.25, 0xf8fafc);
  // Helmet & cyan visor
  gb.addBox(0, 1.08, 0, 0.26, 0.26, 0.28, helmetHex, 0.9, 0);
  gb.addBox(sign * 0.11, 1.09, 0, 0.08, 0.1, 0.22, 0x38bdf8);
  // Extended arms holding pneumatic wheel gun or jack handle
  gb.addBox(sign * 0.22, 0.72, 0.09, 0.28, 0.11, 0.11, suitHex);
  gb.addBox(sign * 0.22, 0.72, -0.09, 0.28, 0.11, 0.11, suitHex);
  if (withWheelGun) {
    gb.addBox(sign * 0.42, 0.66, 0, 0.28, 0.14, 0.14, 0x1e293b);
    gb.addBox(sign * 0.56, 0.66, 0, 0.12, 0.09, 0.09, 0xfacc15);
  } else {
    gb.addBox(sign * 0.52, 0.35, 0, 0.48, 0.08, 0.18, 0xef4444);
  }
  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 80,
  });
  return new THREE.Mesh(gb.toBufferGeometry(), mat);
}

export function buildTrackAndEnvironment(
  scene: THREE.Scene,
  trackDef: TrackDefinition
): THREE.Group {
  const trackGroup = new THREE.Group();
  scene.add(trackGroup);

  const samples = getTrackSamples(trackDef.id);
  const n = samples.length;
  const roadHalfWidth = trackDef.roadHalfWidth;
  const kerbOuterWidth = roadHalfWidth + TRACK_KERB_WIDTH;
  const runoffOuterWidth = kerbOuterWidth + 2.2;
  const barrierHalfWidth = roadHalfWidth + 3.8;

  // 0. Atmospheric Gradient Sky Dome + Sun/Moon Disc
  const skyDomeGeo = new THREE.SphereGeometry(480, 24, 16);
  const skyDomeMat = new THREE.MeshBasicMaterial({
    map: createSkyDomeTexture(
      trackDef.theme.skyHex,
      trackDef.theme.hemiSkyHex,
      trackDef.theme.fogHex,
      false
    ),
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const skyDomeMesh = new THREE.Mesh(skyDomeGeo, skyDomeMat);
  skyDomeMesh.name = 'sky-dome-mesh';
  trackGroup.add(skyDomeMesh);

  const sunGeo = new THREE.SphereGeometry(18, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    fog: false,
  });
  const sunOrb = new THREE.Mesh(sunGeo, sunMat);
  sunOrb.name = 'sky-sun-orb';
  sunOrb.position.set(190, 210, -145);
  trackGroup.add(sunOrb);

  // 1. 3D Conforming Terrain Mesh (Sculpted to match 3D track elevation across all hills & valleys without clipping!)
  const conformedTerrainMesh = createConformingTerrainMesh(
    samples,
    trackDef,
    roadHalfWidth
  );
  trackGroup.add(conformedTerrainMesh);

  // 2. Continuous 3D Asphalt Ribbon Mesh + Elevated Embankment Skirt
  const roadPositions = new Float32Array((n + 1) * 2 * 3);
  const roadNormals = new Float32Array((n + 1) * 2 * 3);
  const roadUvs = new Float32Array((n + 1) * 2 * 2);
  const roadIndices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const lx = s.x - s.nx * roadHalfWidth;
    const lz = s.z - s.nz * roadHalfWidth;
    const rx = s.x + s.nx * roadHalfWidth;
    const rz = s.z + s.nz * roadHalfWidth;

    const vBase = i * 2;
    roadPositions[vBase * 3 + 0] = lx;
    roadPositions[vBase * 3 + 1] = s.y + 0.02;
    roadPositions[vBase * 3 + 2] = lz;

    roadPositions[(vBase + 1) * 3 + 0] = rx;
    roadPositions[(vBase + 1) * 3 + 1] = s.y + 0.02;
    roadPositions[(vBase + 1) * 3 + 2] = rz;

    roadNormals[vBase * 3 + 1] = 1;
    roadNormals[(vBase + 1) * 3 + 1] = 1;

    const vCoord = i * 0.45;
    roadUvs[vBase * 2 + 0] = 0;
    roadUvs[vBase * 2 + 1] = vCoord;
    roadUvs[(vBase + 1) * 2 + 0] = 1;
    roadUvs[(vBase + 1) * 2 + 1] = vCoord;

    if (i < n) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      roadIndices.push(a, b, c, b, d, c);
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('normal', new THREE.BufferAttribute(roadNormals, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeBoundingSphere();

  const asphaltTex = createAsphaltTexture(
    trackDef.theme.asphaltHex,
    trackDef.theme.edgeLineHex
  );
  const roadMat = new THREE.MeshPhongMaterial({
    map: asphaltTex,
    bumpMap: getMicroBumpTexture(),
    bumpScale: 0.04,
    color: 0xffffff,
    shininess: 48,
    specular: new THREE.Color(0x64748b),
    envMap: getProceduralEnvCubeMap(),
    reflectivity: 0.12,
    combine: THREE.MixOperation,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.name = 'track-road-mesh';
  trackGroup.add(roadMesh);

  // 3. 3D Alternating Apex Kerbs + FIA Painted Runoff Aprons + Terrain Embankment Slopes
  const kerbPositions: number[] = [];
  const kerbNormals: number[] = [];
  const kerbColors: number[] = [];
  const colorA = new THREE.Color(trackDef.theme.kerbColorA);
  const colorB = new THREE.Color(trackDef.theme.kerbColorB);
  const runoffA = new THREE.Color(trackDef.theme.runoffColorA);
  const runoffB = new THREE.Color(trackDef.theme.runoffColorB);
  const embankmentCol = new THREE.Color(trackDef.theme.groundHex).offsetHSL(
    0,
    0,
    -0.03
  );

  function push3DStripQuad(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    col: THREE.Color
  ) {
    kerbPositions.push(
      x0, y0, z0, x1, y1, z1, x2, y2, z2,
      x1, y1, z1, x3, y3, z3, x2, y2, z2
    );
    for (let k = 0; k < 6; k++) {
      kerbNormals.push(0, 1, 0);
      kerbColors.push(col.r, col.g, col.b);
    }
  }

  for (let i = 0; i < n; i++) {
    const s0 = samples[i];
    const s1 = samples[(i + 1) % n];
    const col = i % 2 === 0 ? colorA : colorB;
    const rCol = Math.floor(i / 3) % 2 === 0 ? runoffA : runoffB;
    const y0 = s0.y + 0.03;
    const y1 = s1.y + 0.03;

    // Left & Right FIA Kerbs
    push3DStripQuad(
      s0.x - s0.nx * kerbOuterWidth, y0 + 0.02, s0.z - s0.nz * kerbOuterWidth,
      s0.x - s0.nx * roadHalfWidth, y0, s0.z - s0.nz * roadHalfWidth,
      s1.x - s1.nx * kerbOuterWidth, y1 + 0.02, s1.z - s1.nz * kerbOuterWidth,
      s1.x - s1.nx * roadHalfWidth, y1, s1.z - s1.nz * roadHalfWidth,
      col
    );
    push3DStripQuad(
      s0.x + s0.nx * roadHalfWidth, y0, s0.z + s0.nz * roadHalfWidth,
      s0.x + s0.nx * kerbOuterWidth, y0 + 0.02, s0.z + s0.nz * kerbOuterWidth,
      s1.x + s1.nx * roadHalfWidth, y1, s1.z + s1.nz * roadHalfWidth,
      s1.x + s1.nx * kerbOuterWidth, y1 + 0.02, s1.z + s1.nz * kerbOuterWidth,
      col
    );

    // FIA Blue/Red Painted Runoff Strips outside kerbs
    const inPitAlley = s0.t >= 0.88 || s0.t <= 0.11;
    push3DStripQuad(
      s0.x - s0.nx * barrierHalfWidth, s0.y, s0.z - s0.nz * barrierHalfWidth,
      s0.x - s0.nx * kerbOuterWidth, s0.y + 0.015, s0.z - s0.nz * kerbOuterWidth,
      s1.x - s1.nx * barrierHalfWidth, s1.y, s1.z - s1.nz * barrierHalfWidth,
      s1.x - s1.nx * kerbOuterWidth, s1.y + 0.015, s1.z - s1.nz * kerbOuterWidth,
      rCol
    );
    if (!inPitAlley) {
      push3DStripQuad(
        s0.x + s0.nx * kerbOuterWidth, s0.y + 0.015, s0.z + s0.nz * kerbOuterWidth,
        s0.x + s0.nx * barrierHalfWidth, s0.y, s0.z + s0.nz * barrierHalfWidth,
        s1.x + s1.nx * kerbOuterWidth, s1.y + 0.015, s1.z + s1.nz * kerbOuterWidth,
        s1.x + s1.nx * barrierHalfWidth, s1.y, s1.z + s1.nz * barrierHalfWidth,
        rCol
      );
    }

    // 3D Terrain Embankment Slopes anchoring elevated track sections smoothly to conformed terrain
    const vergeMid = barrierHalfWidth + 7.5;
    const vergeOuter = barrierHalfWidth + 22.0;

    // Left verge strip 1 (near barriers)
    push3DStripQuad(
      s0.x - s0.nx * vergeMid, s0.y - 0.16, s0.z - s0.nz * vergeMid,
      s0.x - s0.nx * barrierHalfWidth, s0.y - 0.02, s0.z - s0.nz * barrierHalfWidth,
      s1.x - s1.nx * vergeMid, s1.y - 0.16, s1.z - s1.nz * vergeMid,
      s1.x - s1.nx * barrierHalfWidth, s1.y - 0.02, s1.z - s1.nz * barrierHalfWidth,
      embankmentCol
    );
    // Left verge strip 2 (outer roll down to conformed terrain)
    push3DStripQuad(
      s0.x - s0.nx * vergeOuter, s0.y - 0.38, s0.z - s0.nz * vergeOuter,
      s0.x - s0.nx * vergeMid, s0.y - 0.16, s0.z - s0.nz * vergeMid,
      s1.x - s1.nx * vergeOuter, s1.y - 0.38, s1.z - s1.nz * vergeOuter,
      s1.x - s1.nx * vergeMid, s1.y - 0.16, s1.z - s1.nz * vergeMid,
      embankmentCol
    );

    if (!inPitAlley) {
      // Right verge strip 1
      push3DStripQuad(
        s0.x + s0.nx * barrierHalfWidth, s0.y - 0.02, s0.z + s0.nz * barrierHalfWidth,
        s0.x + s0.nx * vergeMid, s0.y - 0.16, s0.z + s0.nz * vergeMid,
        s1.x + s1.nx * barrierHalfWidth, s1.y - 0.02, s1.z + s1.nz * barrierHalfWidth,
        s1.x + s1.nx * vergeMid, s1.y - 0.16, s1.z + s1.nz * vergeMid,
        embankmentCol
      );
      // Right verge strip 2
      push3DStripQuad(
        s0.x + s0.nx * vergeMid, s0.y - 0.16, s0.z + s0.nz * vergeMid,
        s0.x + s0.nx * vergeOuter, s0.y - 0.38, s0.z + s0.nz * vergeOuter,
        s1.x + s1.nx * vergeMid, s1.y - 0.16, s1.z + s1.nz * vergeMid,
        s1.x + s1.nx * vergeOuter, s1.y - 0.38, s1.z + s1.nz * vergeOuter,
        embankmentCol
      );
    }
  }

  const kerbGeo = new THREE.BufferGeometry();
  kerbGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(kerbPositions, 3)
  );
  kerbGeo.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(kerbNormals, 3)
  );
  kerbGeo.setAttribute('color', new THREE.Float32BufferAttribute(kerbColors, 3));
  kerbGeo.computeBoundingSphere();

  const kerbMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 35,
  });
  trackGroup.add(new THREE.Mesh(kerbGeo, kerbMat));

  // 4. Multi-Color FIA TecPro Barriers & High Catch-Fencing along Corners
  const barrierPositions: number[] = [];
  const barrierNormals: number[] = [];
  const barrierColors: number[] = [];
  const bHeight = 0.92;
  const minBarrierRoadDistSq = (roadHalfWidth + 1.6) * (roadHalfWidth + 1.6);
  const tecProRed = new THREE.Color(0xdc2626);
  const tecProWhite = new THREE.Color(0xf8fafc);
  const tecProBlue = new THREE.Color(0x0284c7);
  const baseBarrierCol = new THREE.Color(trackDef.theme.barrierHex);

  function pushWallQuadColored(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    h: number,
    nx: number, nz: number,
    col: THREE.Color
  ) {
    barrierPositions.push(
      x0, y0, z0,
      x1, y1, z1,
      x0, y0 + h, z0,
      x1, y1, z1,
      x1, y1 + h, z1,
      x0, y0 + h, z0
    );
    for (let k = 0; k < 6; k++) {
      barrierNormals.push(nx, 0, nz);
      barrierColors.push(col.r, col.g, col.b);
    }
  }

  for (let i = 0; i < n; i++) {
    const s0 = samples[i];
    const s1 = samples[(i + 1) % n];
    const isCorner = Math.abs(s0.curvature) > 0.055;
    const blockCol = isCorner
      ? i % 2 === 0
        ? tecProRed
        : tecProWhite
      : i % 4 === 0
      ? tecProBlue
      : baseBarrierCol;

    const l0x = s0.x - s0.nx * barrierHalfWidth;
    const l0z = s0.z - s0.nz * barrierHalfWidth;
    const l1x = s1.x - s1.nx * barrierHalfWidth;
    const l1z = s1.z - s1.nz * barrierHalfWidth;
    const lMidX = (l0x + l1x) * 0.5;
    const lMidZ = (l0z + l1z) * 0.5;

    if (minDistanceSqToTrack(lMidX, lMidZ, samples) >= minBarrierRoadDistSq) {
      pushWallQuadColored(l0x, s0.y, l0z, l1x, s1.y, l1z, bHeight, s0.nx, s0.nz, blockCol);
    }

    const inPitAlley0 = s0.t >= 0.88 || s0.t <= 0.11;
    const inPitAlley1 = s1.t >= 0.88 || s1.t <= 0.11;
    const rWidth0 = inPitAlley0 ? roadHalfWidth + 7.2 : barrierHalfWidth;
    const rWidth1 = inPitAlley1 ? roadHalfWidth + 7.2 : barrierHalfWidth;

    const r0x = s0.x + s0.nx * rWidth0;
    const r0z = s0.z + s0.nz * rWidth0;
    const r1x = s1.x + s1.nx * rWidth1;
    const r1z = s1.z + s1.nz * rWidth1;
    const rMidX = (r0x + r1x) * 0.5;
    const rMidZ = (r0z + r1z) * 0.5;

    if (minDistanceSqToTrack(rMidX, rMidZ, samples) >= minBarrierRoadDistSq) {
      pushWallQuadColored(r1x, s1.y, r1z, r0x, s0.y, r0z, bHeight, -s0.nx, -s0.nz, blockCol);
    }
  }

  const barrierGeo = new THREE.BufferGeometry();
  barrierGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(barrierPositions, 3)
  );
  barrierGeo.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(barrierNormals, 3)
  );
  barrierGeo.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(barrierColors, 3)
  );
  barrierGeo.computeBoundingSphere();

  const barrierMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 55,
    emissive: new THREE.Color(trackDef.theme.barrierEmissiveHex),
    emissiveIntensity: 0.32,
    side: THREE.DoubleSide,
  });
  trackGroup.add(new THREE.Mesh(barrierGeo, barrierMat));

  // 5. F1 2026 Paddock Architecture, Overhead Bridges, Braking Markers, Grandstands & Shaded Mountains
  const propGb = new GeometryBuilder();
  const sStart = samples[0];
  const gantryHalfSpan = roadHalfWidth + 2.8;

  // Start/Finish Gantry Pillars & F1 5-Red-Light Bridge
  propGb.addBox(
    sStart.x - sStart.nx * gantryHalfSpan,
    3.9,
    sStart.z,
    0.9,
    7.8,
    0.9,
    0x1e293b
  );
  propGb.addBox(
    sStart.x + sStart.nx * gantryHalfSpan,
    3.9,
    sStart.z,
    0.9,
    7.8,
    0.9,
    0x1e293b
  );
  propGb.addBox(sStart.x, 7.2, sStart.z, gantryHalfSpan * 2 + 1.8, 1.3, 1.4, 0x0f172a);
  propGb.addBox(sStart.x, 7.9, sStart.z, gantryHalfSpan * 2 + 2.0, 0.22, 1.5, 0xe10600);

  for (let l = -2; l <= 2; l++) {
    propGb.addBox(sStart.x + l * 1.15, 6.25, sStart.z + 0.72, 0.48, 0.58, 0.22, 0x22c55e);
    propGb.addBox(sStart.x + l * 1.15, 6.25, sStart.z - 0.72, 0.48, 0.58, 0.22, 0xef4444);
  }

  // Overhead F1 Sponsor & Sector Timing Bridges at Sector 1 (t=0.33) & Sector 2 / DRS (t=0.66)
  for (const [secIdx, bridgeHex, accentHex] of [
    [Math.floor(n * 0.33), 0x0f172a, 0xe10600],
    [Math.floor(n * 0.66), 0x0f172a, 0x22c55e],
  ] as Array<[number, number, number]>) {
    const sb = samples[secIdx];
    const span = roadHalfWidth + 2.9;
    const lx = sb.x - sb.nx * span;
    const lz = sb.z - sb.nz * span;
    const rx = sb.x + sb.nx * span;
    const rz = sb.z + sb.nz * span;
    if (
      minDistanceSqToTrack(lx, lz, samples, secIdx, 10) >= minBarrierRoadDistSq &&
      minDistanceSqToTrack(rx, rz, samples, secIdx, 10) >= minBarrierRoadDistSq
    ) {
      propGb.addOrientedBox(lx, sb.y + 3.6, lz, sb.angle, 0.85, 7.2, 1.1, 0x1e293b);
      propGb.addOrientedBox(rx, sb.y + 3.6, rz, sb.angle, 0.85, 7.2, 1.1, 0x1e293b);
      propGb.addOrientedBox(sb.x, sb.y + 6.8, sb.z, sb.angle, span * 2 + 1.4, 1.15, 1.3, bridgeHex);
      propGb.addOrientedBox(sb.x, sb.y + 7.45, sb.z, sb.angle, span * 2 + 1.6, 0.24, 1.35, accentHex);
    }
  }

  // Corner Braking Distance Marker Boards (150m / 100m / 50m) & Catch-Fence Posts along Outside of Corners
  for (let i = 18; i < n - 18; i += 4) {
    const s = samples[i];
    const ahead = samples[(i + 12) % n];
    if (Math.abs(ahead.curvature) > 0.085 && i % 12 === 0) {
      const outsideSign = ahead.curvature > 0 ? -1 : 1;
      const bx = s.x + s.nx * outsideSign * (barrierHalfWidth + 1.4);
      const bz = s.z + s.nz * outsideSign * (barrierHalfWidth + 1.4);
      if (minDistanceSqToTrack(bx, bz, samples) >= minBarrierRoadDistSq) {
        propGb.addOrientedBox(bx, s.y + 0.9, bz, s.angle, 1.3, 0.85, 0.14, 0xf8fafc);
        propGb.addOrientedBox(bx, s.y + 1.4, bz, s.angle, 1.35, 0.22, 0.16, 0xe10600);
      }
    }
    if (Math.abs(s.curvature) > 0.06) {
      const outSign = s.curvature > 0 ? -1 : 1;
      const px = s.x + s.nx * outSign * (barrierHalfWidth + 0.25);
      const pz = s.z + s.nz * outSign * (barrierHalfWidth + 0.25);
      if (minDistanceSqToTrack(px, pz, samples) >= minBarrierRoadDistSq) {
        propGb.addBox(px, s.y + 2.1, pz, 0.16, 2.6, 0.16, 0x475569);
        propGb.addOrientedBox(px, s.y + 3.2, pz, s.angle, 0.2, 0.18, 3.4, 0x64748b);
      }
    }
  }

  // ==================== DEDICATED 3D F1 2026 PIT LANE ALLEY & TEAM GARAGES ====================
  const pitAlleyCenterX = -(roadHalfWidth + 3.2);
  const pitAlleyPavementGeo = new THREE.PlaneGeometry(7.8, 108);
  pitAlleyPavementGeo.rotateX(-Math.PI / 2);
  const pitAlleyPavementMat = new THREE.MeshPhongMaterial({
    color: 0x1e293b,
    shininess: 65,
    specular: new THREE.Color(0x64748b),
  });
  const pitAlleyPavementMesh = new THREE.Mesh(
    pitAlleyPavementGeo,
    pitAlleyPavementMat
  );
  pitAlleyPavementMesh.position.set(pitAlleyCenterX, 0.022, 2);
  trackGroup.add(pitAlleyPavementMesh);

  // Glowing Pit Entry Chevron Decal leading off the right side of the main straight into the Pit Lane Alley (z = -46..-16)
  const pitEntryChevronGeo = new THREE.PlaneGeometry(4.2, 30);
  pitEntryChevronGeo.rotateX(-Math.PI / 2);
  const pitEntryChevronMat = new THREE.MeshBasicMaterial({
    map: createPitEntryChevronTexture(),
    transparent: true,
    depthWrite: false,
  });
  const pitEntryChevronMesh = new THREE.Mesh(
    pitEntryChevronGeo,
    pitEntryChevronMat
  );
  pitEntryChevronMesh.position.set(pitAlleyCenterX + 0.4, 0.032, -31);
  trackGroup.add(pitEntryChevronMesh);

  // Physical Pit Wall Divider + Engineer Canopy separating Main Straight from Pit Lane Alley (z = -14..+18)
  const pitWallDividerX = -(roadHalfWidth + 0.25);
  propGb.addBox(pitWallDividerX, 0.55, 2, 0.45, 1.1, 32, 0x1e293b);
  propGb.addBox(pitWallDividerX, 1.18, 2, 0.16, 0.24, 32, 0x38bdf8);
  // Pit Wall Engineer Telemetry Canopy & Monitors
  propGb.addBox(pitWallDividerX - 0.35, 1.85, 2, 0.9, 1.1, 14, 0x0f172a);
  propGb.addBox(pitWallDividerX - 0.82, 1.85, 2, 0.08, 0.65, 12.5, 0x22d3ee);
  propGb.addBox(pitWallDividerX - 0.2, 2.55, 2, 1.5, 0.18, 15, 0xe10600);

  // High-visibility Entry & Exit Bollards on the Pit Wall tips
  propGb.addBox(pitWallDividerX, 0.85, -14.8, 0.72, 1.7, 0.72, 0x22c55e);
  propGb.addBox(pitWallDividerX, 0.85, 18.8, 0.72, 1.7, 0.72, 0xfacc15);

  // Glowing Green "PIT IN · 80 KM/H" Arch over the Pit Lane Alley Entrance (z = -34)
  propGb.addBox(pitWallDividerX, 2.4, -34, 0.5, 4.8, 0.5, 0x10b981);
  propGb.addBox(pitAlleyCenterX - 3.2, 2.4, -34, 0.5, 4.8, 0.5, 0x10b981);
  propGb.addBox(pitAlleyCenterX, 4.6, -34, 7.2, 0.85, 0.85, 0x0f172a);
  propGb.addBox(pitAlleyCenterX, 4.6, -34.45, 6.2, 0.48, 0.14, 0x22c55e);

  // Physical 3D F1 Pit Stop Box Decal inside the Pit Lane Alley (x = -(roadHalfWidth + 3.2), z = 2)
  if (!sharedPitZoneTex) {
    sharedPitZoneTex = createPitZoneDecalTexture();
  }
  const pitDecalGeo = new THREE.PlaneGeometry(5.4, 42);
  pitDecalGeo.rotateX(-Math.PI / 2);
  const pitDecalMat = new THREE.MeshBasicMaterial({
    map: sharedPitZoneTex,
    transparent: true,
    depthWrite: false,
  });
  const pitDecalMesh = new THREE.Mesh(pitDecalGeo, pitDecalMat);
  pitDecalMesh.position.set(pitAlleyCenterX, 0.035, 2);
  trackGroup.add(pitDecalMesh);

  // 3D Pit Box Overhead Crew Gantry & Stacked Pirelli Tire Racks (x = -(roadHalfWidth + 6.6))
  const pitApronX = -(roadHalfWidth + 6.6);
  if (
    minDistanceSqToTrack(pitApronX, 2, samples) >=
    (roadHalfWidth + 3.2) * (roadHalfWidth + 3.2)
  ) {
    // Overhead Carbon Pit Crew Boom Truss extending over the Pit Box stall
    propGb.addBox(pitApronX, 2.6, -1.5, 0.65, 5.2, 0.65, 0x1e293b);
    propGb.addBox(pitApronX, 2.6, 5.5, 0.65, 5.2, 0.65, 0x1e293b);
    propGb.addBox(pitApronX + 2.8, 4.9, -1.5, 5.8, 0.42, 0.55, 0xe10600);
    propGb.addBox(pitApronX + 2.8, 4.9, 5.5, 5.8, 0.42, 0.55, 0xe10600);
    propGb.addBox(pitApronX + 3.4, 4.6, 2.0, 1.1, 0.32, 7.6, 0x0f172a);
    // Overhead Pneumatic Wheel-Gun Air Hoses hanging down toward the 4 wheels
    for (const hoseZ of [0.4, 3.6]) {
      propGb.addBox(pitAlleyCenterX - 1.2, 3.4, hoseZ, 0.08, 2.2, 0.08, 0xfacc15);
      propGb.addBox(pitAlleyCenterX + 1.2, 3.4, hoseZ, 0.08, 2.2, 0.08, 0xfacc15);
    }
    // Stacked Pirelli Tire Warmers & Racks (Soft=Red, Medium=Yellow, Hard=White, Wet=Blue)
    propGb.addBox(pitApronX, 0.75, 10, 1.2, 1.5, 1.2, 0xef4444);
    propGb.addBox(pitApronX, 0.75, 12.2, 1.2, 1.5, 1.2, 0xfacc15);
    propGb.addBox(pitApronX, 0.75, 14.4, 1.2, 1.5, 1.2, 0xf8fafc);
    propGb.addBox(pitApronX, 0.75, 16.6, 1.2, 1.5, 1.2, 0x38bdf8);

    // 3D Animated F1 Pit Crew Group (6 Mechanics around the Pit Stall at z = 2)
    const pitCrewGroup = new THREE.Group();
    pitCrewGroup.name = 'f1-pit-crew-group';
    pitCrewGroup.position.set(0, 0, 0);

    const wheelCrewOffsets: Array<{
      baseX: number;
      targetX: number;
      z: number;
      facingRight: boolean;
    }> = [
      { baseX: pitAlleyCenterX - 2.35, targetX: pitAlleyCenterX - 1.38, z: 3.35, facingRight: true },
      { baseX: pitAlleyCenterX + 2.35, targetX: pitAlleyCenterX + 1.38, z: 3.35, facingRight: false },
      { baseX: pitAlleyCenterX - 2.35, targetX: pitAlleyCenterX - 1.38, z: 0.68, facingRight: true },
      { baseX: pitAlleyCenterX + 2.35, targetX: pitAlleyCenterX + 1.38, z: 0.68, facingRight: false },
    ];

    for (const wc of wheelCrewOffsets) {
      const mech = createPitMechanicMesh(0xe10600, 0xf8fafc, true, wc.facingRight);
      mech.position.set(wc.baseX, 0, wc.z);
      mech.userData = {
        role: 'wheel-gunner',
        baseX: wc.baseX,
        targetX: wc.targetX,
        baseZ: wc.z,
      };
      pitCrewGroup.add(mech);
    }

    // Front & Rear Jackmen
    const frontJack = createPitMechanicMesh(0x0f172a, 0xfacc15, false, true);
    frontJack.position.set(pitAlleyCenterX, 0, 5.8);
    frontJack.rotation.y = Math.PI / 2;
    frontJack.userData = { role: 'jackman', baseZ: 5.8, targetZ: 4.85 };
    pitCrewGroup.add(frontJack);

    const rearJack = createPitMechanicMesh(0x0f172a, 0xfacc15, false, true);
    rearJack.position.set(pitAlleyCenterX, 0, -2.0);
    rearJack.rotation.y = -Math.PI / 2;
    rearJack.userData = { role: 'jackman', baseZ: -2.0, targetZ: -1.1 };
    pitCrewGroup.add(rearJack);

    // Overhead Pit Stall Status Light Beacon
    const beaconGeo = new THREE.BoxGeometry(0.9, 0.35, 0.35);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.set(pitAlleyCenterX, 4.35, 5.5);
    beaconMesh.userData = { role: 'pit-beacon' };
    pitCrewGroup.add(beaconMesh);

    trackGroup.add(pitCrewGroup);
  }

  // Multi-Story F1 6-Team Pit Garages & VIP Paddock Club + Helipad
  const minBuildingClearanceSq = (roadHalfWidth + 11) * (roadHalfWidth + 11);
  const pitBuildingX = -(roadHalfWidth + 17.5);
  if (minDistanceSqToTrack(pitBuildingX, 14, samples) >= minBuildingClearanceSq) {
    // Main Garage Structure
    propGb.addBox(pitBuildingX, 3.6, 8, 13, 7.2, 68, 0x0f172a);
    // 6 Open-Bay Team Garages facing the Pit Lane Alley with team color headers & interior light bays
    const teamHeaderColors = [0xe10600, 0x0284c7, 0xf97316, 0x10b981, 0x059669, 0x6366f1];
    for (let g = 0; g < 6; g++) {
      const gz = -18 + g * 10.4;
      propGb.addBox(pitBuildingX + 6.55, 4.9, gz, 0.28, 0.85, 9.2, teamHeaderColors[g]);
      propGb.addBox(pitBuildingX + 6.45, 2.1, gz, 0.22, 4.2, 7.8, 0x1e293b);
      propGb.addBox(pitBuildingX + 6.58, 3.9, gz, 0.14, 0.25, 7.2, 0xf8fafc);
    }
    // 2nd Floor VIP Paddock Club Glass Hospitality Lounge
    propGb.addBox(pitBuildingX + 0.8, 8.8, 8, 14, 3.2, 64, 0x1e293b);
    propGb.addBox(pitBuildingX + 7.85, 8.8, 8, 0.22, 2.4, 60, 0x38bdf8);
    // Sculpted Cantilevered Paddock Roof Wing
    propGb.addBox(pitBuildingX + 1.8, 10.8, 8, 16.5, 0.65, 68, 0xf8fafc, 0.92, 0);
    propGb.addBox(pitBuildingX + 10.1, 10.8, 8, 0.35, 0.72, 68, 0xe10600);
  }

  // Main Straight Stadium Grandstand (Left Side of Main Straight)
  const standBaseX = roadHalfWidth + 16.5;
  if (minDistanceSqToTrack(standBaseX, -6, samples) >= minBuildingClearanceSq) {
    for (let tier = 0; tier < 6; tier++) {
      propGb.addBox(
        standBaseX + tier * 2.4,
        1.0 + tier * 1.2,
        -6,
        2.4,
        1.9,
        66,
        tier % 2 === 0 ? 0x1e293b : 0x334155
      );
      propGb.addBox(
        standBaseX + tier * 2.4 - 0.65,
        2.1 + tier * 1.2,
        -6,
        0.75,
        0.48,
        62,
        tier % 3 === 0 ? 0xe10600 : tier % 3 === 1 ? 0xfacc15 : 0x38bdf8
      );
    }
    propGb.addBox(standBaseX + 5.2, 9.6, -6, 15.5, 0.55, 68, 0xf8fafc, 0.9, 0);
    propGb.addBox(standBaseX - 2.4, 9.6, -6, 0.45, 0.62, 68, 0xe10600);
  }

  // Secondary Corner Grandstands at Sector 1 & Sector 2
  for (const cIdx of [92, 215]) {
    const sc = samples[cIdx % n];
    const gx = sc.x + sc.nx * (roadHalfWidth + 22);
    const gz = sc.z + sc.nz * (roadHalfWidth + 22);
    if (minDistanceSqToTrack(gx, gz, samples) >= (roadHalfWidth + 15) * (roadHalfWidth + 15)) {
      propGb.addOrientedBox(gx, sc.y + 2.8, gz, sc.angle, 8.5, 5.6, 32, 0x1e293b);
      propGb.addOrientedBox(gx, sc.y + 6.0, gz, sc.angle, 9.5, 0.55, 34, 0xe10600);
      propGb.addOrientedBox(gx, sc.y + 4.2, gz, sc.angle, 8.8, 0.9, 30, 0xfacc15);
    }
  }

  // Iconic 3D F1 Festival Ferris Wheel & Helical Observation Tower (Infield / Paddock Vista)
  const ferrisX = 112;
  const ferrisZ = 42;
  if (minDistanceSqToTrack(ferrisX, ferrisZ, samples) >= (roadHalfWidth + 24) * (roadHalfWidth + 24)) {
    // Ferris wheel A-frame support legs
    propGb.addBox(ferrisX - 2.6, 14, ferrisZ, 1.2, 28, 8.0, 0x334155, 0.25, 0);
    propGb.addBox(ferrisX + 2.6, 14, ferrisZ, 1.2, 28, 8.0, 0x334155, 0.25, 0);

    // Rotating 3D Ferris Wheel Rim & Illuminated Gondolas
    const rotorGroup = new THREE.Group();
    rotorGroup.name = 'f1-ferris-wheel-rotor';
    rotorGroup.position.set(ferrisX, 26, ferrisZ);
    const wheelGb = new GeometryBuilder();
    const spokes = 12;
    const rad = 18;
    for (let s = 0; s < spokes; s++) {
      const a0 = (s / spokes) * Math.PI * 2;
      const a1 = ((s + 1) / spokes) * Math.PI * 2;
      const x0 = Math.cos(a0) * rad;
      const y0 = Math.sin(a0) * rad;
      const x1 = Math.cos(a1) * rad;
      const y1 = Math.sin(a1) * rad;
      wheelGb.addBox((x0 + x1) * 0.5, (y0 + y1) * 0.5, 0, 2.2, 2.2, 2.4, s % 2 === 0 ? 0xe10600 : 0x38bdf8);
      wheelGb.addBox(x0 * 0.5, y0 * 0.5, 0, 0.5, 0.5, 1.2, 0xf8fafc);
    }
    const rotorMesh = new THREE.Mesh(
      wheelGb.toBufferGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true })
    );
    rotorGroup.add(rotorMesh);
    trackGroup.add(rotorGroup);
  }

  // Helical Observation Tower (inspired by COTA Austin F1 Tower)
  const towerX = 125;
  const towerZ = -48;
  if (minDistanceSqToTrack(towerX, towerZ, samples) >= (roadHalfWidth + 24) * (roadHalfWidth + 24)) {
    propGb.addBox(towerX, 24, towerZ, 3.4, 48, 3.4, 0xf8fafc, 0.65, 0);
    propGb.addBox(towerX, 44, towerZ, 9.5, 2.8, 9.5, 0x0f172a);
    propGb.addBox(towerX, 46, towerZ, 10.2, 0.7, 10.2, 0xe10600);
    propGb.addBox(towerX, 52, towerZ, 0.8, 10, 0.8, 0x38bdf8);
  }

  // Stadium Floodlight Towers around the circuit
  for (const idx of [35, 95, 155, 215, 275, 325]) {
    const s = samples[idx % n];
    const side = idx % 2 === 0 ? 1 : -1;
    const fx = s.x + s.nx * side * (roadHalfWidth + 15.5);
    const fz = s.z + s.nz * side * (roadHalfWidth + 15.5);
    if (minDistanceSqToTrack(fx, fz, samples) >= minBuildingClearanceSq) {
      propGb.addBox(fx, s.y + 9.5, fz, 0.75, 19.0, 0.75, 0x334155);
      propGb.addBox(fx, s.y + 19.2, fz, 3.8, 1.5, 1.4, 0xfef08a);
    }
  }

  // High-Altitude Championship Blimp & Hot-Air Balloons
  propGb.addBox(85, 94, 65, 19, 6.8, 8.0, 0xf59e0b, 0.75, 0);
  propGb.addBox(85, 89.2, 65, 4.8, 1.9, 2.4, 0x0f172a);
  propGb.addBox(-95, 80, 125, 9.5, 11.5, 9.5, 0xe10600, 0.65, 0);
  propGb.addBox(195, 86, -95, 9.5, 11.5, 9.5, 0x38bdf8, 0.65, 0);

  // Map-Specific Multi-Layered Shaded 3D Horizon Landmarks (guaranteed outside circuit & road-checked!)
  const landmarkClearSq = (roadHalfWidth + 28) * (roadHalfWidth + 28);
  const isTokyo = trackDef.id === 'tokyo-night';
  const isDesert = trackDef.id === 'desert-canyon';
  const isNordic = trackDef.id === 'nordic-ice';

  for (let m = 0; m < 32; m++) {
    const ang = (m / 32) * Math.PI * 2;
    const dist = 290 + (m % 4) * 32;
    const mx = 95 + Math.cos(ang) * dist;
    const mz = Math.sin(ang) * dist;

    if (minDistanceSqToTrack(mx, mz, samples) < landmarkClearSq) continue;

    if (isTokyo) {
      const h = 46 + (m % 5) * 24;
      const w = 22 + (m % 3) * 7;
      propGb.addBox(mx, h * 0.5 - 2, mz, w, h, w, 0x0f172a);
      propGb.addBox(
        mx,
        h - 3,
        mz,
        w + 0.9,
        2.2,
        w + 0.9,
        m % 2 === 0 ? 0x06b6d4 : 0xec4899
      );
      propGb.addBox(
        mx,
        h * 0.64,
        mz,
        w + 0.6,
        1.5,
        w + 0.6,
        m % 3 === 0 ? 0x38bdf8 : 0xa855f7
      );
      propGb.addBox(
        mx,
        h * 0.34,
        mz,
        w + 0.6,
        1.3,
        w + 0.6,
        0x22d3ee
      );
      propGb.addBox(mx, h + 5, mz, 1.2, 12, 1.2, 0x38bdf8);
    } else if (isDesert) {
      const h = 36 + (m % 4) * 18;
      const w = 46 + (m % 3) * 18;
      propGb.addBox(mx, h * 0.35 - 2, mz, w * 1.25, h * 0.7, w * 1.1, 0x7c2d12, 0.72, 0);
      propGb.addBox(mx, h * 0.75 - 2, mz, w * 0.82, h * 0.5, w * 0.75, 0x9a3412, 0.65, 0);
      propGb.addBox(mx, h, mz, w * 0.52, 4.0, w * 0.50, 0xd97706, 0.82, 0);
    } else if (isNordic) {
      const h = 56 + (m % 5) * 22;
      const w = 44 + (m % 3) * 16;
      propGb.addBox(mx, h * 0.45 - 2, mz, w, h * 0.9, w, 0x475569, 0.36, 0);
      propGb.addBox(mx, h * 0.86 - 2, mz, w * 0.48, h * 0.45, w * 0.48, 0xe0f2fe, 0.08, 0);
    } else {
      const h = 52 + (m % 5) * 20;
      const w = 50 + (m % 3) * 16;
      propGb.addBox(mx, h * 0.42 - 2, mz, w, h * 0.84, w, 0x1e293b, 0.38, 0);
      propGb.addBox(
        mx + 12,
        h * 0.35 - 2,
        mz - 9,
        w * 0.72,
        h * 0.7,
        w * 0.72,
        0x334155,
        0.32,
        0
      );
      propGb.addBox(
        mx,
        h * 0.84 - 2,
        mz,
        w * 0.44,
        h * 0.36,
        w * 0.44,
        0xf1f5f9,
        0.08,
        0
      );
    }
  }

  const propMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 45,
    specular: new THREE.Color(0x475569),
  });
  trackGroup.add(new THREE.Mesh(propGb.toBufferGeometry(), propMat));

  if (!sharedCheckeredTex) {
    sharedCheckeredTex = createCheckeredBannerTexture();
  }
  const bannerMat = new THREE.MeshBasicMaterial({ map: sharedCheckeredTex });
  const bannerGeo = new THREE.PlaneGeometry(gantryHalfSpan * 2, 1.0);
  const bannerFront = new THREE.Mesh(bannerGeo, bannerMat);
  bannerFront.position.set(sStart.x, 7.2, sStart.z + 0.72);
  const bannerBack = new THREE.Mesh(bannerGeo, bannerMat);
  bannerBack.position.set(sStart.x, 7.2, sStart.z - 0.72);
  bannerBack.rotation.y = Math.PI;
  trackGroup.add(bannerFront, bannerBack);

  // 6. Road-Clearance-Checked Multi-Tier Instanced Trackside Trees / Cyber Towers / Cacti
  const treeCount = 110;
  const trunkGeo = isDesert
    ? new THREE.DodecahedronGeometry(1.6, 0)
    : new THREE.CylinderGeometry(0.30, 0.46, 2.4, 7);
  const trunkMat = new THREE.MeshPhongMaterial({
    color: isDesert ? 0x9a3412 : isTokyo ? 0x1e293b : 0x451a03,
    shininess: 20,
  });
  const crownGeo = isTokyo
    ? new THREE.BoxGeometry(2.8, 12, 2.8)
    : isDesert
    ? new THREE.CylinderGeometry(0.38, 0.48, 4.6, 7)
    : new THREE.ConeGeometry(2.5, 6.8, 7);
  const crownMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    shininess: 28,
  });

  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crownMesh = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);

  const dummy = new THREE.Object3D();
  const baseCrownCol = new THREE.Color(trackDef.theme.foliageHex);
  const tintCol = new THREE.Color();
  let placed = 0;
  const minTreeClearanceSq =
    (barrierHalfWidth + 8.0) * (barrierHalfWidth + 8.0);

  for (
    let i = 0;
    i < n && placed < treeCount;
    i += Math.max(1, Math.floor(n / treeCount))
  ) {
    const s = samples[i];
    const side = i % 2 === 0 ? 1 : -1;
    const dist = barrierHalfWidth + 10.5 + ((i * 13) % 22);
    const tx = s.x + s.nx * side * dist;
    const tz = s.z + s.nz * side * dist;

    if (minDistanceSqToTrack(tx, tz, samples) < minTreeClearanceSq) {
      continue;
    }

    const sc = 0.85 + (i % 5) * 0.1;
    const baseY = s.y - 0.35;

    dummy.position.set(tx, baseY + 1.2 * sc, tz);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(placed, dummy.matrix);

    dummy.position.set(tx, baseY + (isTokyo ? 6.8 * sc : 4.5 * sc), tz);
    dummy.updateMatrix();
    crownMesh.setMatrixAt(placed, dummy.matrix);

    tintCol
      .copy(baseCrownCol)
      .offsetHSL(((i % 5) - 2) * 0.015, 0, ((i % 3) - 1) * 0.04);
    crownMesh.setColorAt(placed, tintCol);
    placed++;
  }
  trunkMesh.count = placed;
  crownMesh.count = placed;
  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
  trunkMesh.computeBoundingSphere();
  crownMesh.computeBoundingSphere();
  trackGroup.add(trunkMesh, crownMesh);

  return trackGroup;
}

/**
 * 3D Weather Precipitation System (Rain & Snow) attached around the active camera.
 */
export function createWeatherSystem(scene: THREE.Scene): WeatherSystem {
  const count = 160;
  const geo = new THREE.BoxGeometry(0.04, 0.85, 0.04);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.65,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.visible = false;

  const ox = new Float32Array(count);
  const oy = new Float32Array(count);
  const oz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    ox[i] = (Math.random() - 0.5) * 44;
    oy[i] = Math.random() * 18;
    oz[i] = (Math.random() - 0.5) * 44;
  }

  const dummy = new THREE.Object3D();
  scene.add(mesh);

  return {
    mesh,
    update(dt, camX, camY, camZ, weather) {
      if (weather !== 'rain' && weather !== 'snow') {
        if (mesh.visible) mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const isSnow = weather === 'snow';
      const fallSpeed = isSnow ? 6.5 : 28.0;

      for (let i = 0; i < count; i++) {
        oy[i] -= fallSpeed * dt;
        if (isSnow) {
          ox[i] += Math.sin(oy[i] * 0.5 + i) * 1.5 * dt;
        }
        if (oy[i] < -2) {
          oy[i] = 16 + Math.random() * 4;
          ox[i] = (Math.random() - 0.5) * 44;
          oz[i] = (Math.random() - 0.5) * 44;
        }
        dummy.position.set(camX + ox[i], camY + oy[i] - 4, camZ + oz[i]);
        if (isSnow) {
          dummy.scale.set(3.2, 0.16, 3.2);
        } else {
          dummy.scale.set(1, 1, 1);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function createParticlePool(scene: THREE.Scene): ParticlePool {
  const capacity = 48;
  const geo = new THREE.BoxGeometry(0.36, 0.36, 0.36);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.68,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.frustumCulled = false;

  const active = new Uint8Array(capacity);
  const px = new Float32Array(capacity);
  const py = new Float32Array(capacity);
  const pz = new Float32Array(capacity);
  const vx = new Float32Array(capacity);
  const vy = new Float32Array(capacity);
  const vz = new Float32Array(capacity);
  const scaleArr = new Float32Array(capacity);
  const lifeArr = new Float32Array(capacity);
  const maxLifeArr = new Float32Array(capacity);

  const dummy = new THREE.Object3D();
  const colorObj = new THREE.Color();
  let cursor = 0;

  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  for (let i = 0; i < capacity; i++) {
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colorObj.setHex(0xffffff));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  scene.add(mesh);

  return {
    mesh,
    spawn(x, y, z, pvx, pvy, pvz, colorHex, scale, life) {
      const idx = cursor;
      cursor = (cursor + 1) % capacity;
      active[idx] = 1;
      px[idx] = x;
      py[idx] = y;
      pz[idx] = z;
      vx[idx] = pvx;
      vy[idx] = pvy;
      vz[idx] = pvz;
      scaleArr[idx] = scale;
      lifeArr[idx] = life;
      maxLifeArr[idx] = life;

      colorObj.setHex(colorHex);
      mesh.setColorAt(idx, colorObj);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(dt: number) {
      let dirty = false;
      for (let i = 0; i < capacity; i++) {
        if (!active[i]) continue;
        dirty = true;
        lifeArr[i] -= dt;
        if (lifeArr[i] <= 0) {
          active[i] = 0;
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        vy[i] += 1.4 * dt;

        const progress = 1 - lifeArr[i] / maxLifeArr[i];
        const s = scaleArr[i] * (0.6 + progress * 1.2) * (1 - progress * 0.5);
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      if (dirty) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
