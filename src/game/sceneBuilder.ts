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
  cockpitScreenCanvas?: HTMLCanvasElement;
  cockpitScreenTex?: THREE.CanvasTexture;
  cockpitShiftLeds?: THREE.Mesh[];
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
      g.addColorStop(0.45, '#e0f2fe');
      g.addColorStop(0.52, '#64748b');
      g.addColorStop(0.62, '#1e293b');
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
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // F1 2026 Team Pit Stall high-grip epoxy tarmac apron
  ctx.fillStyle = 'rgba(10, 15, 28, 0.92)';
  ctx.fillRect(0, 0, 512, 1024);

  // Subtle carbon-grid diagonal texture across the pit stall floor
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 1024; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }

  // Red, White & Yellow FIA Pit Stall border curbing stripes
  for (let y = 0; y < 1024; y += 48) {
    const idx = Math.floor(y / 48);
    ctx.fillStyle = idx % 2 === 0 ? '#e10600' : '#f8fafc';
    ctx.fillRect(8, y, 24, 48);
    ctx.fillRect(480, y, 24, 48);
  }

  // Glowing cyan/emerald inner telemetry frame
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 10;
  ctx.strokeRect(42, 24, 428, 976);

  // Center longitudinal laser alignment stripe for F1 monopost plank
  ctx.fillStyle = 'rgba(250, 204, 21, 0.85)';
  ctx.fillRect(248, 190, 16, 680);

  // 4 High-Contrast Wheel Stop Target Pockets (FL, FR, RL, RR) with corner brackets
  const wheelBoxes = [
    { x: 74, y: 280, w: 96, h: 156, label: 'FL' },
    { x: 342, y: 280, w: 96, h: 156, label: 'FR' },
    { x: 74, y: 576, w: 96, h: 156, label: 'RL' },
    { x: 342, y: 576, w: 96, h: 156, label: 'RR' },
  ];
  for (const wb of wheelBoxes) {
    ctx.fillStyle = 'rgba(225, 6, 0, 0.24)';
    ctx.fillRect(wb.x, wb.y, wb.w, wb.h);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 12;
    ctx.strokeRect(wb.x, wb.y, wb.w, wb.h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(wb.label, wb.x + wb.w / 2, wb.y + wb.h / 2 + 10);
  }

  // Front Wing / Nosecone Stop Target Bar ("STOP HERE")
  ctx.fillStyle = '#e10600';
  ctx.fillRect(92, 204, 328, 38);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(92, 204, 328, 38);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('◀ STOP · FRONT WING ▶', 256, 232);

  // Header Banner
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText('F1 2026 PIT BOX', 256, 148);

  // Forward guidance chevrons
  for (let y = 360; y < 920; y += 180) {
    ctx.fillStyle = y % 360 === 0 ? '#22c55e' : '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(156, y + 64);
    ctx.lineTo(256, y);
    ctx.lineTo(356, y + 64);
    ctx.lineTo(356, y + 98);
    ctx.lineTo(256, y + 34);
    ctx.lineTo(156, y + 98);
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

  public addSmoothTri(
    ax: number,
    ay: number,
    az: number,
    nax: number,
    nay: number,
    naz: number,
    bx: number,
    by: number,
    bz: number,
    nbx: number,
    nby: number,
    nbz: number,
    cx: number,
    cy: number,
    cz: number,
    ncx: number,
    ncy: number,
    ncz: number,
    hex: number
  ) {
    this.c.setHex(hex);
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.normals.push(nax, nay, naz, nbx, nby, nbz, ncx, ncy, ncz);
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

  public addSmoothQuad(
    ax: number,
    ay: number,
    az: number,
    nax: number,
    nay: number,
    naz: number,
    bx: number,
    by: number,
    bz: number,
    nbx: number,
    nby: number,
    nbz: number,
    cx: number,
    cy: number,
    cz: number,
    ncx: number,
    ncy: number,
    ncz: number,
    dx: number,
    dy: number,
    dz: number,
    ndx: number,
    ndy: number,
    ndz: number,
    hex: number
  ) {
    this.addSmoothTri(
      ax, ay, az, nax, nay, naz,
      bx, by, bz, nbx, nby, nbz,
      cx, cy, cz, ncx, ncy, ncz,
      hex
    );
    this.addSmoothTri(
      ax, ay, az, nax, nay, naz,
      cx, cy, cz, ncx, ncy, ncz,
      dx, dy, dz, ndx, ndy, ndz,
      hex
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
      // Smoothly arched normal across the top edge so studio clearcoat reflections wrap around the fuselage
      this.addSmoothQuad(
        -ht0, yTop0, z0, -0.32, 0.94, 0,
        -ht1, yTop1, z1, -0.32, 0.94, 0,
        ht1, yTop1, z1, 0.32, 0.94, 0,
        ht0, yTop0, z0, 0.32, 0.94, 0,
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
      const sideDark = adjustHexBrightness(colors.sides, -0.02);
      this.addSmoothQuad(
        hb0, yBot0, z0, 0.95, -0.15, 0,
        ht0, yTop0, z0, 0.82, 0.57, 0,
        ht1, yTop1, z1, 0.82, 0.57, 0,
        hb1, yBot1, z1, 0.95, -0.15, 0,
        sideDark
      );
      this.addSmoothQuad(
        -hb1, yBot1, z1, -0.95, -0.15, 0,
        -ht1, yTop1, z1, -0.82, 0.57, 0,
        -ht0, yTop0, z0, -0.82, 0.57, 0,
        -hb0, yBot0, z0, -0.95, -0.15, 0,
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

  public addMountainPeak(
    cx: number,
    baseY: number,
    cz: number,
    radiusX: number,
    height: number,
    radiusZ: number,
    baseHex: number,
    midHex: number,
    peakHex: number,
    seed = 0
  ) {
    const segs = 18;
    const peakOffsetX = Math.sin(seed * 1.7) * radiusX * 0.11;
    const peakOffsetZ = Math.cos(seed * 2.3) * radiusZ * 0.11;
    const topX = cx + peakOffsetX;
    const topY = baseY + height;
    const topZ = cz + peakOffsetZ;

    const cBase = new THREE.Color(baseHex);
    const cMid = new THREE.Color(midHex);
    const cSnow = new THREE.Color(midHex).lerp(new THREE.Color(peakHex), 0.72);
    const cPeak = new THREE.Color(peakHex);

    const pushVert = (
      px: number,
      py: number,
      pz: number,
      nx: number,
      ny: number,
      nz: number,
      col: THREE.Color
    ) => {
      this.positions.push(px, py, pz);
      this.normals.push(nx, ny, nz);
      this.colors.push(col.r, col.g, col.b);
    };

    const ring0: Array<[number, number, number, number, number, number]> = [];
    const ring1: Array<[number, number, number, number, number, number]> = [];
    const ring2: Array<[number, number, number, number, number, number]> = [];

    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ridgeWave =
        Math.sin(seed * 3.1 + a * 3.0) * 0.12 +
        Math.cos(seed * 1.9 + a * 4.0) * 0.06;
      const j0 = 0.90 + ridgeWave;
      const j1 = 0.56 + ridgeWave * 0.6;
      const j2 = 0.25 + ridgeWave * 0.3;

      const nx = ca * 0.82;
      const ny = 0.57;
      const nz = sa * 0.82;

      ring0.push([
        cx + ca * radiusX * j0,
        baseY,
        cz + sa * radiusZ * j0,
        nx,
        ny * 0.65,
        nz,
      ]);
      ring1.push([
        cx + peakOffsetX * 0.35 + ca * radiusX * j1,
        baseY + height * 0.44,
        cz + peakOffsetZ * 0.35 + sa * radiusZ * j1,
        nx,
        ny,
        nz,
      ]);
      ring2.push([
        cx + peakOffsetX * 0.72 + ca * radiusX * j2,
        baseY + height * 0.75,
        cz + peakOffsetZ * 0.72 + sa * radiusZ * j2,
        nx * 0.75,
        0.66,
        nz * 0.75,
      ]);
    }

    for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      const b0 = ring0[i];
      const b1 = ring0[next];
      const m0 = ring1[i];
      const m1 = ring1[next];
      const u0 = ring2[i];
      const u1 = ring2[next];

      // Lower slope quad: baseHex -> midHex
      pushVert(b0[0], b0[1], b0[2], b0[3], b0[4], b0[5], cBase);
      pushVert(b1[0], b1[1], b1[2], b1[3], b1[4], b1[5], cBase);
      pushVert(m1[0], m1[1], m1[2], m1[3], m1[4], m1[5], cMid);
      pushVert(b0[0], b0[1], b0[2], b0[3], b0[4], b0[5], cBase);
      pushVert(m1[0], m1[1], m1[2], m1[3], m1[4], m1[5], cMid);
      pushVert(m0[0], m0[1], m0[2], m0[3], m0[4], m0[5], cMid);

      // Mid slope quad: midHex -> snowline
      pushVert(m0[0], m0[1], m0[2], m0[3], m0[4], m0[5], cMid);
      pushVert(m1[0], m1[1], m1[2], m1[3], m1[4], m1[5], cMid);
      pushVert(u1[0], u1[1], u1[2], u1[3], u1[4], u1[5], cSnow);
      pushVert(m0[0], m0[1], m0[2], m0[3], m0[4], m0[5], cMid);
      pushVert(u1[0], u1[1], u1[2], u1[3], u1[4], u1[5], cSnow);
      pushVert(u0[0], u0[1], u0[2], u0[3], u0[4], u0[5], cSnow);

      // Peak snow cap triangle: snowline -> peakHex
      pushVert(u0[0], u0[1], u0[2], u0[3], u0[4], u0[5], cSnow);
      pushVert(u1[0], u1[1], u1[2], u1[3], u1[4], u1[5], cSnow);
      pushVert(topX, topY, topZ, 0, 1, 0, cPeak);
    }
  }

  public addSmoothCylinder(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    r0: number,
    r1: number,
    segs: number,
    hex: number,
    capEnds = true
  ) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return;
    const tx = dx / len;
    const ty = dy / len;
    const tz = dz / len;

    let upX = 0;
    let upY = 1;
    let upZ = 0;
    if (Math.abs(ty) > 0.9) {
      upX = 1;
      upY = 0;
    }
    let ux = ty * upZ - tz * upY;
    let uy = tz * upX - tx * upZ;
    let uz = tx * upY - ty * upX;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;

    const vx = ty * uz - tz * uy;
    const vy = tz * ux - tx * uz;
    const vz = tx * uy - ty * ux;

    this.c.setHex(hex);
    const cr = this.c.r;
    const cg = this.c.g;
    const cb = this.c.b;

    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);

      const n0x = ux * c0 + vx * s0;
      const n0y = uy * c0 + vy * s0;
      const n0z = uz * c0 + vz * s0;
      const n1x = ux * c1 + vx * s1;
      const n1y = uy * c1 + vy * s1;
      const n1z = uz * c1 + vz * s1;

      const p00x = ax + n0x * r0;
      const p00y = ay + n0y * r0;
      const p00z = az + n0z * r0;
      const p01x = ax + n1x * r0;
      const p01y = ay + n1y * r0;
      const p01z = az + n1z * r0;

      const p10x = bx + n0x * r1;
      const p10y = by + n0y * r1;
      const p10z = bz + n0z * r1;
      const p11x = bx + n1x * r1;
      const p11y = by + n1y * r1;
      const p11z = bz + n1z * r1;

      this.positions.push(
        p00x, p00y, p00z,
        p01x, p01y, p01z,
        p11x, p11y, p11z,
        p00x, p00y, p00z,
        p11x, p11y, p11z,
        p10x, p10y, p10z
      );
      this.normals.push(
        n0x, n0y, n0z,
        n1x, n1y, n1z,
        n1x, n1y, n1z,
        n0x, n0y, n0z,
        n1x, n1y, n1z,
        n0x, n0y, n0z
      );
      for (let k = 0; k < 6; k++) {
        this.colors.push(cr, cg, cb);
      }

      if (capEnds) {
        if (r0 > 1e-4) {
          this.addTri(ax, ay, az, p01x, p01y, p01z, p00x, p00y, p00z, hex);
        }
        if (r1 > 1e-4) {
          this.addTri(bx, by, bz, p10x, p10y, p10z, p11x, p11y, p11z, hex);
        }
      }
    }
  }

  public addSmoothSphere(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    latSegs: number,
    lonSegs: number,
    hex: number,
    visorBandHex?: number
  ) {
    for (let lat = 0; lat < latSegs; lat++) {
      const v0 = lat / latSegs;
      const v1 = (lat + 1) / latSegs;
      const phi0 = (v0 - 0.5) * Math.PI;
      const phi1 = (v1 - 0.5) * Math.PI;
      const cp0 = Math.cos(phi0);
      const sp0 = Math.sin(phi0);
      const cp1 = Math.cos(phi1);
      const sp1 = Math.sin(phi1);

      const isVisorRow =
        visorBandHex !== undefined && v0 >= 0.42 && v1 <= 0.72;

      for (let lon = 0; lon < lonSegs; lon++) {
        const u0 = lon / lonSegs;
        const u1 = (lon + 1) / lonSegs;
        const th0 = u0 * Math.PI * 2;
        const th1 = u1 * Math.PI * 2;

        const n00x = cp0 * Math.cos(th0);
        const n00y = sp0;
        const n00z = cp0 * Math.sin(th0);

        const n10x = cp0 * Math.cos(th1);
        const n10y = sp0;
        const n10z = cp0 * Math.sin(th1);

        const n11x = cp1 * Math.cos(th1);
        const n11y = sp1;
        const n11z = cp1 * Math.sin(th1);

        const n01x = cp1 * Math.cos(th0);
        const n01y = sp1;
        const n01z = cp1 * Math.sin(th0);

        const useVisor = isVisorRow && (u0 < 0.25 || u0 > 0.75);
        this.c.setHex(useVisor ? visorBandHex! : hex);
        const cr = this.c.r;
        const cg = this.c.g;
        const cb = this.c.b;

        this.positions.push(
          cx + n00x * rx, cy + n00y * ry, cz + n00z * rz,
          cx + n10x * rx, cy + n10y * ry, cz + n10z * rz,
          cx + n11x * rx, cy + n11y * ry, cz + n11z * rz,
          cx + n00x * rx, cy + n00y * ry, cz + n00z * rz,
          cx + n11x * rx, cy + n11y * ry, cz + n11z * rz,
          cx + n01x * rx, cy + n01y * ry, cz + n01z * rz
        );
        this.normals.push(
          n00x, n00y, n00z,
          n10x, n10y, n10z,
          n11x, n11y, n11z,
          n00x, n00y, n00z,
          n11x, n11y, n11z,
          n01x, n01y, n01z
        );
        for (let k = 0; k < 6; k++) {
          this.colors.push(cr, cg, cb);
        }
      }
    }
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
 * Custom PBR Automotive Clearcoat Material with Studio PMREM Reflection, Procedural 3K Carbon Weave,
 * Metallic Flake Sheen, Fresnel Rim & Ground-Effect Ambient Occlusion
 */
let sharedAutomotiveMaterial: THREE.MeshPhysicalMaterial | null = null;
function createAutomotiveShaderMaterial(): THREE.MeshPhysicalMaterial {
  if (sharedAutomotiveMaterial) return sharedAutomotiveMaterial;
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.46,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    reflectivity: 0.95,
    envMapIntensity: 1.75,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vLocalPos = position;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      vec3 viewDir = normalize(vViewPosition);
      float ndotv = abs(dot(normal, viewDir));
      float fresnel = pow(1.0 - ndotv, 2.8);
      float topSheen = pow(max(0.0, normal.y), 1.8) * 0.14;

      // Procedural diagonal 3K carbon-fiber weave on dark carbon chassis, wings & floor parts
      float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
      if (lum < 0.18) {
        float weave = sin((vLocalPos.x + vLocalPos.z) * 155.0) * sin((vLocalPos.x - vLocalPos.z) * 155.0);
        gl_FragColor.rgb += vec3(weave * 0.025);
      } else {
        // Subtle metallic flake micro-sparkle on painted livery clearcoat
        float flake = fract(sin(dot(floor(vLocalPos.xz * 180.0), vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor.rgb += vec3((flake - 0.5) * 0.018);
      }

      // Sky-horizon studio reflection band across sculpted sidepods & nosecone
      float skyHorizon = smoothstep(-0.15, 0.65, vWorldNormal.y);
      vec3 envTint = mix(vec3(0.05, 0.08, 0.14), vec3(0.28, 0.42, 0.58), skyHorizon);

      // Ground-effect underbody ambient occlusion
      float groundAo = smoothstep(0.04, 0.44, vLocalPos.y) * 0.28 + 0.72;
      gl_FragColor.rgb *= groundAo;
      gl_FragColor.rgb += envTint * fresnel * 0.48 + vec3(topSheen * 0.65);
      #include <dithering_fragment>
      `
    );
  };
  sharedAutomotiveMaterial = mat;
  return mat;
}

/**
 * Builds a High-Detail Sculpted F1 2026 Active-Aero Monopost with Smooth Curved Sidepods,
 * Contoured Needle Nosecone, Spherical Bell Helmet, Tubular Titanium Halo & Carbon Wishbones!
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
  // Floor edge vortex strakes, rolled floor lip & 2026 floor fences
  for (const side of [-1, 1]) {
    gb.addSmoothCylinder(side * 0.85, 0.12, -1.65, side * 0.85, 0.12, 0.62, 0.025, 0.025, 8, accent);
    gb.addBox(side * 0.83, 0.17, 0.48, 0.03, 0.11, 0.30, carbon);
    gb.addBox(side * 0.81, 0.16, -1.25, 0.035, 0.08, 0.55, carbon);
    // 2026 Front Wheel Wake Deflector Fin ("Wake Winglet")
    gb.addBox(side * 0.78, 0.56, 1.06, 0.035, 0.18, 0.36, carbon, 0.8, -0.05);
  }
  for (const fx of [-0.56, -0.26, 0.26, 0.56]) {
    gb.addBox(fx, 0.16, -2.02, 0.03, 0.17, 0.30, carbon);
  }
  // Rear Crash Structure, FIA Pulsing Rain Light & Cylindrical Chrome Turbo Exhaust + Twin Wastegates
  gb.addBox(0, 0.24, -2.14, 0.15, 0.18, 0.12, carbon);
  gb.addSmoothCylinder(0, 0.43, -1.94, 0, 0.44, -2.26, 0.078, 0.068, 14, exhaustChrome);
  gb.addSmoothCylinder(0, 0.44, -2.23, 0, 0.44, -2.265, 0.056, 0.056, 12, darkRecess);
  for (const side of [-1, 1]) {
    gb.addSmoothCylinder(side * 0.095, 0.40, -1.96, side * 0.095, 0.40, -2.21, 0.026, 0.024, 10, exhaustChrome);
  }

  // 2. Central Monocoque Fuselage & F1 2026 Sculpted Needle Nosecone (-1.85 -> +2.50)
  gb.addSection(
    -1.85, 0.52, 0.26, 0.14, 0.62,
    -0.60, 0.96, 0.58, 0.14, 0.84,
    { top: paint, sides: paint, back: darkRecess }
  );
  // Smooth rounded spine fairing along engine cover (-1.82 -> -0.45)
  gb.addSmoothCylinder(0, 0.60, -1.82, 0, 0.84, -0.48, 0.11, 0.22, 14, paint);

  gb.addSection(
    -0.60, 0.96, 0.72, 0.14, 0.68,
    0.55, 0.72, 0.58, 0.16, 0.66,
    { top: carbon, sides: paint }
  );
  for (const side of [-1, 1]) {
    // Rounded cockpit collar bolsters
    gb.addSmoothCylinder(side * 0.30, 0.71, -0.46, side * 0.28, 0.68, 0.42, 0.055, 0.048, 10, paint);
  }
  gb.addSection(
    0.55, 0.72, 0.58, 0.16, 0.66,
    1.45, 0.44, 0.36, 0.20, 0.54,
    { top: paint, sides: paint, bottom: carbon }
  );
  gb.addSection(
    1.45, 0.44, 0.36, 0.20, 0.54,
    2.45, 0.22, 0.16, 0.15, 0.27,
    { top: paint, sides: paint, bottom: carbon, front: accent }
  );
  // Smooth contoured upper nosecone barrel & aerodynamic rounded nose tip
  gb.addSmoothCylinder(0, 0.58, 0.55, 0, 0.48, 1.45, 0.24, 0.16, 14, paint);
  gb.addSmoothCylinder(0, 0.48, 1.45, 0, 0.23, 2.45, 0.16, 0.085, 14, paint);
  gb.addSmoothSphere(0, 0.22, 2.47, 0.095, 0.068, 0.11, 8, 12, accent);

  gb.addBox(0, 0.62, 1.0, 0.12, 0.015, 0.85, accent);
  gb.addBox(0, 0.39, 1.92, 0.09, 0.015, 0.88, accent, 0.8, 0);
  // F1 2026 Nosecone Onboard Camera Pods
  for (const side of [-1, 1]) {
    gb.addSmoothCylinder(side * 0.15, 0.44, 1.65, side * 0.21, 0.44, 1.76, 0.024, 0.022, 8, carbon);
  }

  // 3. F1 2026 3-Element Active Front Wing (+2.08 -> +2.54) with X-Mode / Z-Mode Actuators
  gb.addBox(0, 0.12, 2.34, 1.90, 0.032, 0.34, carbon, 0.96, 0.04);
  gb.addBox(0, 0.165, 2.22, 1.84, 0.028, 0.22, paint, 0.95, -0.02);
  gb.addBox(0, 0.20, 2.15, 1.76, 0.02, 0.10, accent);
  for (const side of [-1, 1]) {
    // Nose-to-wing swan-neck aero pillars
    gb.addBox(side * 0.10, 0.18, 2.26, 0.028, 0.12, 0.22, carbon);
    // 2026 Active Front Wing Hydraulic Flap Actuators
    gb.addSmoothCylinder(side * 0.48, 0.15, 2.26, side * 0.48, 0.21, 2.16, 0.018, 0.016, 8, carbon);
    // Curved 3D Front Wing Endplates + Footplates + Outwash Diveplanes
    gb.addBox(side * 0.94, 0.22, 2.28, 0.038, 0.26, 0.46, paint, 0.82, -0.05);
    gb.addSmoothCylinder(side * 0.94, 0.35, 2.08, side * 0.94, 0.35, 2.48, 0.022, 0.018, 8, accent);
    gb.addBox(side * 0.96, 0.13, 2.28, 0.05, 0.038, 0.44, accent);
    gb.addBox(side * 0.97, 0.23, 2.32, 0.05, 0.024, 0.26, carbon);
  }

  // 4. Sculpted Undercut Sidepods (-1.28 -> +0.54) with Smooth Rounded Barrels, Cooling Louvers & ERS Strip
  for (const side of [-1, 1]) {
    gb.addBox(
      side * 0.54,
      0.36,
      -0.34,
      0.42,
      0.34,
      1.58,
      paint,
      0.78,
      -0.08
    );
    // Smooth sculpted aerodynamic sidepod shoulder barrel tapering into coke-bottle rear
    gb.addSmoothCylinder(
      side * 0.58,
      0.44,
      0.52,
      side * 0.36,
      0.36,
      -1.36,
      0.19,
      0.10,
      14,
      paint
    );
    // Overbite upper lip on 2026 shark-mouth radiator inlet
    gb.addBox(side * 0.56, 0.55, 0.54, 0.38, 0.035, 0.16, paint);
    gb.addBox(side * 0.56, 0.40, 0.50, 0.34, 0.24, 0.06, darkRecess);
    gb.addSmoothCylinder(side * 0.56, 0.57, 0.42, side * 0.42, 0.50, -0.82, 0.045, 0.02, 10, accent);
    // Sidepod cooling gill louvers
    for (let lv = 0; lv < 4; lv++) {
      gb.addBox(side * 0.46, 0.585, -0.05 - lv * 0.16, 0.12, 0.015, 0.05, darkRecess);
    }
    // Glowing 2026 MGU-K Electrical Status Accent Strip along sidepod flank
    gb.addBox(side * 0.77, 0.36, -0.25, 0.016, 0.035, 1.18, ersGlowCyan);
    gb.addBox(side * 0.68, 0.30, 0.72, 0.035, 0.28, 0.32, carbon);
    // Aero Rear-View Mirrors on twin carbon stalks
    gb.addSmoothCylinder(side * 0.36, 0.67, 0.44, side * 0.56, 0.71, 0.42, 0.014, 0.012, 8, carbon);
    gb.addSmoothSphere(side * 0.58, 0.72, 0.42, 0.075, 0.038, 0.055, 8, 10, paint);
    gb.addBox(side * 0.58, 0.72, 0.37, 0.11, 0.045, 0.015, helmetVisor);
  }

  // 5. Exposed Open-Wheel Smooth Tubular Carbon Double-Wishbone Suspension Arms & Brembo Brake Ducts
  for (const side of [-1, 1]) {
    // Front upper/lower wishbones & pushrod
    gb.addSmoothCylinder(side * 0.18, 0.46, 1.48, side * 0.84, 0.43, 1.35, 0.018, 0.015, 8, carbon);
    gb.addSmoothCylinder(side * 0.18, 0.45, 1.18, side * 0.84, 0.43, 1.35, 0.018, 0.015, 8, carbon);
    gb.addSmoothCylinder(side * 0.18, 0.26, 1.46, side * 0.84, 0.26, 1.35, 0.018, 0.015, 8, carbon);
    gb.addSmoothCylinder(side * 0.18, 0.26, 1.18, side * 0.84, 0.26, 1.35, 0.018, 0.015, 8, carbon);
    gb.addSmoothCylinder(side * 0.18, 0.54, 1.24, side * 0.80, 0.28, 1.35, 0.014, 0.014, 8, accent);
    gb.addBox(side * 0.72, 0.36, 1.35, 0.06, 0.24, 0.24, carbon);
    gb.addBox(side * 0.74, 0.36, 1.44, 0.05, 0.12, 0.08, caliperRed);

    // Rear upper/lower wishbones & pullrod
    gb.addSmoothCylinder(side * 0.18, 0.47, -1.16, side * 0.84, 0.45, -1.32, 0.019, 0.016, 8, carbon);
    gb.addSmoothCylinder(side * 0.18, 0.46, -1.48, side * 0.84, 0.45, -1.32, 0.019, 0.016, 8, carbon);
    gb.addSmoothCylinder(side * 0.18, 0.26, -1.18, side * 0.84, 0.26, -1.32, 0.019, 0.016, 8, carbon);
    gb.addSmoothCylinder(side * 0.18, 0.26, -1.46, side * 0.84, 0.26, -1.32, 0.019, 0.016, 8, carbon);
    gb.addSmoothCylinder(side * 0.20, 0.28, -1.22, side * 0.80, 0.45, -1.32, 0.014, 0.014, 8, accent);
    gb.addBox(side * 0.70, 0.37, -1.32, 0.06, 0.26, 0.26, carbon);
    gb.addBox(side * 0.72, 0.37, -1.22, 0.05, 0.13, 0.09, caliperRed);
  }

  // 6. Sculpted Spherical Driver Helmet + Iridium Visor, Roll-Hoop Airbox, T-Cam, Shark Fin & Tubular Titanium HALO
  gb.addSmoothCylinder(0, 0.62, -0.06, 0, 0.70, -0.05, 0.11, 0.095, 10, carbon);
  gb.addSmoothSphere(0, 0.77, -0.04, 0.132, 0.138, 0.148, 12, 16, accent, helmetVisor);

  // Smooth Tubular Titanium Halo Protection Structure
  gb.addSmoothCylinder(0, 0.64, 0.42, 0, 0.85, 0.34, 0.022, 0.026, 10, haloTitanium);
  gb.addSmoothCylinder(-0.19, 0.85, 0.30, 0.19, 0.85, 0.30, 0.026, 0.026, 10, haloTitanium);
  for (const side of [-1, 1]) {
    gb.addSmoothCylinder(side * 0.19, 0.85, 0.30, side * 0.22, 0.80, -0.32, 0.026, 0.024, 10, haloTitanium);
  }

  // Sculpted Overhead Roll-Hoop Airbox Intake + FIA T-Cam
  gb.addSmoothCylinder(0, 0.94, -0.25, 0, 0.91, -0.68, 0.13, 0.08, 12, paint);
  gb.addSmoothCylinder(0, 0.94, -0.23, 0, 0.94, -0.27, 0.09, 0.09, 12, darkRecess);
  gb.addBox(0, 1.09, -0.38, 0.28, 0.03, 0.06, accent);

  // Dorsal Carbon Shark Fin
  gb.addBox(0, 0.86, -1.18, 0.032, 0.24, 1.12, carbon, 0.9, -0.08);
  gb.addBox(0, 0.92, -1.18, 0.036, 0.06, 1.06, accent);

  // 7. F1 2026 Twin-Pylon Rear Wing Mainplane & Curved Endplates (upper DRS flap is animated separately)
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.09, 0.68, -1.92, 0.032, 0.42, 0.20, carbon, 0.85, -0.05);
  }
  gb.addBox(0, 0.86, -2.02, 1.54, 0.04, 0.28, carbon, 0.96, -0.02);
  for (const side of [-1, 1]) {
    gb.addBox(side * 0.78, 0.80, -2.04, 0.038, 0.52, 0.42, paint, 0.9, -0.04);
    gb.addSmoothCylinder(side * 0.78, 1.05, -1.85, side * 0.78, 1.05, -2.23, 0.024, 0.020, 8, accent);
  }

  const geo = gb.toBufferGeometry();
  cachedBodyGeometries.set(spec.id, geo);
  return geo;
}

/**
 * Builds the First-Person Open-Cockpit Formula View (`cockpitGroup`)
 * with F1 2026 Carbon Tub, Wind Deflector, Dual-Stalk Side Mirrors, Smooth Tubular Suspension Arms,
 * Smooth Titanium Halo, and Sculpted Carbon Butterfly Steering Wheel with Gloved Hands
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
  const carbon = 0x121824;
  const alcantara = 0x1e293b;
  const haloTitanium = 0x243042;
  const mirrorGlass = 0xbae6fd;

  // Open-Cockpit Carbon Floor, Side Tub Walls & Forward Instrument Coaming (leaving z = -0.20..0.52 open for the 3D Steering Wheel!)
  shellGb.addBox(0, 0.45, 0.36, 0.72, 0.06, 0.68, carbon);
  // Forward Dashboard Shroud ahead of Steering Wheel (z = 0.54..0.72)
  shellGb.addBox(0, 0.60, 0.63, 0.64, 0.22, 0.18, carbon);
  shellGb.addSmoothCylinder(-0.24, 0.715, 0.63, 0.24, 0.715, 0.63, 0.024, 0.024, 10, alcantara);

  // Tinted Aero Windscreen Fin + Center Apex Sight Reticle ahead of steering column
  shellGb.addBox(0, 0.755, 0.70, 0.36, 0.048, 0.08, 0x38bdf8, 0.85, -0.02);
  shellGb.addBox(0, 0.785, 0.72, 0.008, 0.035, 0.02, 0xe10600);
  for (const side of [-1, 1]) {
    // Sculpted Left/Right Cockpit Tub Sidewalls & Rounded Kevlar Headrest Bolsters
    shellGb.addBox(side * 0.38, 0.60, 0.26, 0.12, 0.24, 0.88, carbon);
    shellGb.addSmoothCylinder(side * 0.38, 0.72, -0.16, side * 0.36, 0.71, 0.64, 0.058, 0.052, 12, paint);
    shellGb.addSmoothCylinder(side * 0.33, 0.75, 0.06, side * 0.33, 0.74, 0.62, 0.022, 0.020, 8, accent);
    // Pitot Sensor Tubes on Front Nosecone
    shellGb.addSmoothCylinder(side * 0.06, 0.69, 0.88, side * 0.06, 0.74, 0.88, 0.006, 0.005, 8, 0xe2e8f0);
    shellGb.addSmoothCylinder(side * 0.06, 0.74, 0.86, side * 0.06, 0.74, 0.93, 0.006, 0.004, 8, 0xe2e8f0);
  }

  // Forward Monocoque & Sculpted Smooth-Arched 2026 Needle Nosecone visible from Helmet Cam
  shellGb.addSection(
    0.72, 0.64, 0.52, 0.30, 0.70,
    1.56, 0.44, 0.35, 0.24, 0.56,
    { top: paint, sides: paint }
  );
  shellGb.addSection(
    1.56, 0.44, 0.35, 0.24, 0.56,
    2.44, 0.24, 0.18, 0.16, 0.30,
    { top: paint, sides: paint, front: accent }
  );
  // Smooth rounded nosecone crown for realistic studio horizon reflection in Cockpit View
  shellGb.addSmoothCylinder(0, 0.60, 0.72, 0, 0.49, 1.56, 0.23, 0.16, 16, paint);
  shellGb.addSmoothCylinder(0, 0.49, 1.56, 0, 0.25, 2.44, 0.16, 0.09, 16, paint);

  // Racing Livery Center Stripe & Nose Number Panel
  shellGb.addBox(0, 0.64, 1.12, 0.14, 0.016, 0.88, accent);
  shellGb.addBox(0, 0.645, 1.12, 0.05, 0.018, 0.86, 0xf8fafc);
  shellGb.addBox(0, 0.455, 1.96, 0.10, 0.016, 0.84, accent);

  // Front Wing, Endplates, 2026 Wake Deflectors, Smooth Tubular Multi-Link Suspension & Aero Rear-View Mirrors
  shellGb.addBox(0, 0.16, 2.28, 1.90, 0.032, 0.30, carbon);
  for (const side of [-1, 1]) {
    shellGb.addBox(side * 0.95, 0.23, 2.28, 0.042, 0.25, 0.45, paint);
    shellGb.addBox(side * 0.96, 0.15, 2.28, 0.052, 0.042, 0.43, accent);
    // 2026 Front Wheel Wake Deflector Fin + Over-Wheel Winglet (clearly visible above front tires)
    shellGb.addBox(side * 0.78, 0.59, 1.10, 0.042, 0.22, 0.40, carbon, 0.8, -0.04);
    shellGb.addSmoothCylinder(side * 0.79, 0.70, 0.90, side * 0.79, 0.68, 1.26, 0.022, 0.018, 8, accent);
    // Smooth Tubular Upper & Lower Carbon Wishbones + Diagonal Pushrod + Steering Tie-Rod
    shellGb.addSmoothCylinder(side * 0.19, 0.47, 1.46, side * 0.86, 0.45, 1.35, 0.017, 0.015, 8, carbon);
    shellGb.addSmoothCylinder(side * 0.19, 0.44, 1.18, side * 0.86, 0.45, 1.35, 0.017, 0.015, 8, carbon);
    shellGb.addSmoothCylinder(side * 0.19, 0.28, 1.44, side * 0.86, 0.28, 1.35, 0.017, 0.015, 8, carbon);
    shellGb.addSmoothCylinder(side * 0.18, 0.52, 1.16, side * 0.82, 0.31, 1.35, 0.014, 0.014, 8, accent);
    // Brembo Carbon Brake Duct Scoop inside front wheel
    shellGb.addBox(side * 0.73, 0.38, 1.35, 0.06, 0.24, 0.24, carbon);
    // Sculpted Aero Side Mirrors + Smooth Dual Carbon Stalks + Reflective Glass + Team Accent Cap
    shellGb.addSmoothCylinder(side * 0.38, 0.72, 0.60, side * 0.56, 0.76, 0.58, 0.015, 0.013, 8, carbon);
    shellGb.addSmoothCylinder(side * 0.42, 0.69, 0.48, side * 0.56, 0.75, 0.56, 0.013, 0.012, 8, carbon);
    shellGb.addSmoothSphere(side * 0.60, 0.78, 0.58, 0.10, 0.048, 0.056, 10, 12, paint);
    shellGb.addBox(side * 0.60, 0.826, 0.58, 0.17, 0.016, 0.09, accent);
    shellGb.addBox(side * 0.60, 0.78, 0.524, 0.16, 0.066, 0.016, mirrorGlass);
  }

  // Smooth Tubular Titanium HALO Protection Hoop with Aero Fairing & Slim V-Pylon (clear apex sightline)
  shellGb.addSmoothCylinder(0, 0.70, 0.92, 0, 1.22, 0.74, 0.014, 0.020, 10, haloTitanium);
  shellGb.addSmoothCylinder(-0.40, 1.22, 0.70, 0.40, 1.22, 0.70, 0.024, 0.024, 12, haloTitanium);
  shellGb.addSmoothCylinder(-0.24, 1.205, 0.76, 0.24, 1.205, 0.76, 0.014, 0.014, 10, accent);
  for (const side of [-1, 1]) {
    shellGb.addSmoothCylinder(side * 0.40, 1.22, 0.70, side * 0.39, 1.06, -0.10, 0.024, 0.022, 10, haloTitanium);
    shellGb.addSmoothCylinder(side * 0.39, 1.24, 0.68, side * 0.39, 1.09, -0.05, 0.012, 0.010, 8, accent);
  }

  // Smooth Cylindrical Carbon Steering Column Shaft & Gold Quick-Release Spline Collar
  shellGb.addSmoothCylinder(0, 0.72, 0.58, 0, 0.75, 0.34, 0.032, 0.032, 12, carbon);
  shellGb.addSmoothCylinder(0, 0.745, 0.39, 0, 0.75, 0.35, 0.042, 0.042, 12, 0xfacc15);

  // Detailed F1 2026 Carbon Butterfly Steering Wheel, Multi-Dial Faceplate & Articulated Gloved Hands
  const wheelGb = new GeometryBuilder();
  const rimCarbon = 0x161f2e;
  const gripSuede = 0x293548;
  const gloveColor = spec.colorHex;
  const glovePalm = 0xfacc15;
  const cuffAccent = 0xf8fafc;
  const sleeveDark = 0x0f172a;

  // Main Carbon Butterfly Center Plate & Top Shift-LED Brow
  wheelGb.addBox(0, 0.0, 0, 0.252, 0.142, 0.026, rimCarbon, 0.92, 0);
  wheelGb.addSmoothCylinder(-0.112, 0.080, 0, 0.112, 0.080, 0, 0.016, 0.016, 10, rimCarbon);
  // Lower Split Butterfly Cutout Bridge
  wheelGb.addSmoothCylinder(-0.085, -0.068, 0, 0.085, -0.068, 0, 0.013, 0.013, 10, rimCarbon);

  // 3 Lower Rotary Engine / MGU-K / Differential Knobs with Cylindrical Bezels
  wheelGb.addSmoothCylinder(0, -0.044, -0.010, 0, -0.044, -0.022, 0.016, 0.015, 10, 0xe10600);
  wheelGb.addBox(0, -0.044, -0.023, 0.008, 0.024, 0.006, 0xf8fafc);
  wheelGb.addSmoothCylinder(-0.052, -0.044, -0.010, -0.052, -0.044, -0.021, 0.014, 0.013, 10, 0x38bdf8);
  wheelGb.addSmoothCylinder(0.052, -0.044, -0.010, 0.052, -0.044, -0.021, 0.014, 0.013, 10, 0xfacc15);

  for (const side of [-1, 1]) {
    const gx = side * 0.144;
    // Sculpted Contoured Alcantara Cylindrical Side Grips & Upper/Lower Butterfly Horns
    wheelGb.addSmoothCylinder(gx, -0.080, 0, gx, 0.080, 0, 0.020, 0.019, 12, gripSuede);
    wheelGb.addSmoothCylinder(side * 0.085, 0.072, 0, gx, 0.064, 0, 0.014, 0.016, 10, rimCarbon);
    wheelGb.addSmoothCylinder(side * 0.085, -0.064, 0, gx, -0.058, 0, 0.014, 0.016, 10, rimCarbon);
    // Cylindrical Push Buttons (DRS / Overtake / Pit Radio / Pit Limiter)
    wheelGb.addSmoothCylinder(side * 0.098, 0.046, -0.012, side * 0.098, 0.046, -0.021, 0.009, 0.009, 8, side < 0 ? 0x22c55e : 0xef4444);
    wheelGb.addSmoothCylinder(side * 0.092, 0.020, -0.012, side * 0.092, 0.020, -0.021, 0.008, 0.008, 8, 0xfacc15);
    wheelGb.addSmoothCylinder(side * 0.094, -0.006, -0.012, side * 0.094, -0.006, -0.021, 0.008, 0.008, 8, 0x38bdf8);
    // Carbon Shift & Dual-Clutch Paddles behind wheel
    wheelGb.addBox(side * 0.104, 0.014, 0.024, 0.042, 0.090, 0.008, accent);

    // Driver Fireproof Nomex Racing Gloves, Smooth Articulated Fingers, Wrist Cuffs & Forearm Sleeves
    wheelGb.addSmoothSphere(gx + side * 0.006, -0.004, -0.006, 0.026, 0.040, 0.026, 8, 10, gloveColor);
    // 4 Smooth Wrapped Fingers around the Alcantara grip
    for (let f = 0; f < 4; f++) {
      const fy = 0.024 - f * 0.015;
      wheelGb.addSmoothCylinder(
        gx + side * 0.004,
        fy,
        0.016,
        gx - side * 0.024,
        fy,
        0.010,
        0.0075,
        0.0065,
        8,
        glovePalm
      );
    }
    // Smooth Thumb resting on inner button cluster
    wheelGb.addSmoothCylinder(
      gx,
      0.018,
      -0.014,
      gx - side * 0.036,
      0.032,
      -0.015,
      0.011,
      0.009,
      8,
      glovePalm
    );
    // Smooth Nomex Wrist Gauntlet & Forearm Racing Suit Sleeve
    wheelGb.addSmoothCylinder(
      gx + side * 0.010,
      -0.028,
      -0.018,
      gx + side * 0.024,
      -0.068,
      -0.058,
      0.025,
      0.028,
      10,
      cuffAccent
    );
    wheelGb.addSmoothCylinder(
      gx + side * 0.024,
      -0.068,
      -0.058,
      gx + side * 0.064,
      -0.215,
      -0.185,
      0.029,
      0.038,
      10,
      sleeveDark
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
    const segs = 28;
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

      // Smooth radial normals across the Pirelli slick tire tread so the tire is perfectly round!
      gb.addSmoothQuad(
        xMinBevel, y0 * radius, z0 * radius, 0, y0, z0,
        xMinBevel, y1 * radius, z1 * radius, 0, y1, z1,
        xMaxBevel, y1 * radius, z1 * radius, 0, y1, z1,
        xMaxBevel, y0 * radius, z0 * radius, 0, y0, z0,
        tireDark
      );

      // +X Smooth Beveled Tire Shoulder & Sidewall
      gb.addSmoothQuad(
        xMaxBevel, y0 * radius, z0 * radius, 0.45, y0 * 0.89, z0 * 0.89,
        xMaxBevel, y1 * radius, z1 * radius, 0.45, y1 * 0.89, z1 * 0.89,
        xMax, y1 * shoulderR, z1 * shoulderR, 0.85, y1 * 0.52, z1 * 0.52,
        xMax, y0 * shoulderR, z0 * shoulderR, 0.85, y0 * 0.52, z0 * 0.52,
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

      // -X Smooth Beveled Tire Shoulder & Sidewall
      gb.addSmoothQuad(
        xMin, y0 * shoulderR, z0 * shoulderR, -0.85, y0 * 0.52, z0 * 0.52,
        xMin, y1 * shoulderR, z1 * shoulderR, -0.85, y1 * 0.52, z1 * 0.52,
        xMinBevel, y1 * radius, z1 * radius, -0.45, y1 * 0.89, z1 * 0.89,
        xMinBevel, y0 * radius, z0 * radius, -0.45, y0 * 0.89, z0 * 0.89,
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

    // 5-Axis Machined BBS F1 18-Inch Rim Spokes + Center-Lock Wheel Nut
    for (let sp = 0; sp < 5; sp++) {
      const ang = (sp / 5) * Math.PI;
      const sy = Math.cos(ang) * rimR * 0.82;
      const sz = Math.sin(ang) * rimR * 0.82;
      gb.addSmoothCylinder(
        offsetX + outwardSign * (halfW + 0.005),
        -sy,
        -sz,
        offsetX + outwardSign * (halfW + 0.005),
        sy,
        sz,
        0.016,
        0.016,
        6,
        0x94a3b8
      );
    }
    gb.addSmoothCylinder(
      offsetX + outwardSign * (halfW - 0.01),
      0,
      0,
      offsetX + outwardSign * (halfW + 0.025),
      0,
      0,
      0.062,
      0.048,
      10,
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
  steeringWheelRig.position.set(0, 0.752, 0.33);
  steeringWheelRig.rotation.x = -0.16;
  const steeringWheelMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 55,
    specular: new THREE.Color(0x475569),
  });
  const wheelAndHandsMesh = new THREE.Mesh(
    cockpitGeos.steeringWheelAndHands,
    steeringWheelMat
  );
  steeringWheelRig.add(wheelAndHandsMesh);

  // Live 3D OLED Telemetry Screen & 9 Dynamic Shift LEDs on the Player's Steering Wheel
  let cockpitScreenCanvas: HTMLCanvasElement | undefined;
  let cockpitScreenTex: THREE.CanvasTexture | undefined;
  let cockpitShiftLeds: THREE.Mesh[] | undefined;

  if (!labelText) {
    cockpitScreenCanvas = document.createElement('canvas');
    cockpitScreenCanvas.width = 256;
    cockpitScreenCanvas.height = 140;
    cockpitScreenTex = new THREE.CanvasTexture(cockpitScreenCanvas);
    cockpitScreenTex.colorSpace = THREE.SRGBColorSpace;

    const screenPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.142, 0.078),
      new THREE.MeshBasicMaterial({
        map: cockpitScreenTex,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      })
    );
    screenPlane.position.set(0, 0.016, -0.017);
    screenPlane.rotation.y = Math.PI;
    steeringWheelRig.add(screenPlane);

    cockpitShiftLeds = [];
    const ledGeo = new THREE.BoxGeometry(0.017, 0.011, 0.006);
    for (let l = 0; l < 9; l++) {
      const lx = (4 - l) * 0.021; // Positive X is left in car-forward camera space
      const ledMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      const ledMesh = new THREE.Mesh(ledGeo, ledMat);
      ledMesh.position.set(lx, 0.081, -0.018);
      steeringWheelRig.add(ledMesh);
      cockpitShiftLeds.push(ledMesh);
    }
  }

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

  const rig: CarRig = {
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
    cockpitScreenCanvas,
    cockpitScreenTex,
    cockpitShiftLeds,
    headlightBeamGroup,
    labelSprite,
    labelName: labelText,
    currentCompound: compound,
  };

  if (!labelText) {
    updateCarRigCockpitTelemetry(rig, 1, 0, 1100, 100, 100, compound, false);
  }

  return rig;
}

/**
 * Updates the live 3D Steering Wheel OLED Screen & 9 Shift LEDs in First-Person Cockpit view.
 */
export function updateCarRigCockpitTelemetry(
  rig: CarRig | undefined,
  gear: number,
  speedKmh: number,
  rpm: number,
  tireHealth: number,
  ersPct: number,
  compound: TireCompound,
  drsActive: boolean
): void {
  if (!rig) return;

  if (rig.cockpitShiftLeds) {
    const activeCount = Math.round(
      Math.max(0, Math.min(1, (rpm - 2200) / 5500)) * rig.cockpitShiftLeds.length
    );
    for (let i = 0; i < rig.cockpitShiftLeds.length; i++) {
      const mat = rig.cockpitShiftLeds[i].material as THREE.MeshBasicMaterial;
      if (i < activeCount) {
        mat.color.setHex(
          i < 3 ? 0x22c55e : i < 6 ? 0xfacc15 : i < 8 ? 0xef4444 : 0x38bdf8
        );
      } else {
        mat.color.setHex(0x1e293b);
      }
    }
  }

  if (!rig.cockpitScreenCanvas || !rig.cockpitScreenTex) return;
  const ctx = rig.cockpitScreenCanvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#040812';
  ctx.fillRect(0, 0, 256, 140);

  // Outer telemetry frame
  ctx.strokeStyle = drsActive ? '#22d3ee' : '#334155';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 132);

  // Top RPM / DRS status bar
  ctx.fillStyle = drsActive ? '#0891b2' : '#0f172a';
  ctx.fillRect(8, 8, 240, 24);
  ctx.fillStyle = drsActive ? '#ecfeff' : '#38bdf8';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(drsActive ? 'DRS OVERTAKE' : `RPM ${Math.round(rpm)}`, 14, 25);

  const compCode = TIRE_COMPOUNDS[compound]?.shortCode || 'S';
  const compCol = TIRE_COMPOUNDS[compound]?.cssColor || '#ef4444';
  ctx.fillStyle = compCol;
  ctx.textAlign = 'right';
  ctx.fillText(`PNEU ${compCode} ${Math.round(tireHealth)}%`, 242, 25);

  // Left: Speed KM/H
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RYCHLOST', 14, 54);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px monospace';
  ctx.fillText(`${Math.round(speedKmh)}`, 14, 90);
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('KM/H', 14, 108);

  // Center: Large Gear Box
  ctx.fillStyle = '#111827';
  ctx.fillRect(98, 40, 60, 74);
  ctx.strokeStyle = '#e10600';
  ctx.lineWidth = 3;
  ctx.strokeRect(98, 40, 60, 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(gear === -1 ? 'R' : `${gear}`, 128, 96);

  // Right: ERS Battery Bar & %
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('ERS BAT', 242, 54);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(`${Math.round(ersPct)}%`, 242, 88);

  // Bottom ERS Fill Strip
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(14, 120, 228, 10);
  ctx.fillStyle = drsActive ? '#38bdf8' : '#22c55e';
  ctx.fillRect(14, 120, Math.round(2.28 * Math.max(0, Math.min(100, ersPct))), 10);

  rig.cockpitScreenTex.needsUpdate = true;
}

/**
 * Animates the 3D F1 Pit Crew mechanics around the Pit Box Stall, the Grandstand Spectator Wave,
 * and the Festival Ferris Wheel.
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

  if (!root.userData._cachedAnimRefs) {
    root.userData._cachedAnimRefs = {
      crewGroup: root.getObjectByName('f1-pit-crew-group'),
      crowdGroup: root.getObjectByName('f1-grandstand-crowd'),
      ferrisWheel: root.getObjectByName('f1-ferris-wheel-rotor'),
    };
  }
  const { crewGroup, crowdGroup, ferrisWheel } = root.userData._cachedAnimRefs as {
    crewGroup?: THREE.Group;
    crowdGroup?: THREE.Object3D;
    ferrisWheel?: THREE.Object3D;
  };

  if (crewGroup) {
    const targetSlide = isPitStopActive ? 1.0 : 0.0;
    const currentSlide = (crewGroup.userData.slide ?? 0) as number;
    if (isPitStopActive || currentSlide > 0.0005) {
      const nextSlide =
        Math.abs(targetSlide - currentSlide) < 0.0005
          ? targetSlide
          : currentSlide + (targetSlide - currentSlide) * 0.16;
      crewGroup.userData.slide = nextSlide;

      for (const child of crewGroup.children) {
        const role = child.userData.role as string | undefined;
        if (role === 'wheel-gunner') {
          const baseX = child.userData.baseX as number;
          const targetX = child.userData.targetX as number;
          const baseZ = child.userData.baseZ as number;
          const vib = isPitStopActive ? Math.sin(timeSec * 48 + baseZ) * 0.048 : 0;
          child.position.x = baseX + (targetX - baseX) * nextSlide + vib;
          child.position.y = -nextSlide * 0.12;
          child.rotation.z =
            (baseX < targetX ? -1 : 1) *
            nextSlide *
            (0.08 + Math.sin(timeSec * 36 + baseZ) * 0.025);
        } else if (role === 'tire-carrier') {
          const baseX = child.userData.baseX as number;
          const targetX = child.userData.targetX as number;
          const baseZ = child.userData.baseZ as number;
          child.position.x = baseX + (targetX - baseX) * nextSlide;
          child.position.y =
            isPitStopActive ? Math.abs(Math.sin(timeSec * 14 + baseZ)) * 0.04 : 0;
        } else if (role === 'jackman') {
          const baseZ = child.userData.baseZ as number;
          const targetZ = child.userData.targetZ as number;
          child.position.z = baseZ + (targetZ - baseZ) * nextSlide;
          child.rotation.x = nextSlide * 0.06;
        } else if (role === 'lollipop-man') {
          const baseX = child.userData.baseX as number;
          const targetX = child.userData.targetX as number;
          if (typeof baseX === 'number' && typeof targetX === 'number') {
            child.position.x = baseX + (targetX - baseX) * nextSlide;
          }
        } else if (role === 'pit-beacon') {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.color.setHex(
            isPitStopActive
              ? Math.floor(timeSec * 10) % 2 === 0
                ? 0xfacc15
                : 0xef4444
              : 0x22c55e
          );
        } else if (role === 'wheel-spark') {
          child.visible = isPitStopActive && nextSlide > 0.55;
          if (child.visible) {
            const idx = (child.userData.sparkIdx ?? 0) as number;
            child.rotation.x = timeSec * 24 + idx * 1.5;
            child.rotation.z = timeSec * 19 + idx;
            const pulse = 0.65 + 0.55 * Math.abs(Math.sin(timeSec * 38 + idx * 2.1));
            child.scale.setScalar(pulse);
          }
        } else if (role === 'pit-floor-led') {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.color.setHex(
            isPitStopActive
              ? Math.floor(timeSec * 12) % 2 === 0
                ? 0x22d3ee
                : 0xfacc15
              : 0x10b981
          );
        }
      }
    }
  }

  // Animate 3D Grandstand Spectator Crowd cheering wave & waving flags
  if (crowdGroup) {
    crowdGroup.position.y = Math.sin(timeSec * 6.5) * 0.08;
  }

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

function minDistanceSqToTrackSameLevel(
  wx: number,
  wy: number,
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
    if (Math.abs(s.y - wy) > 3.2) continue;
    const dx = wx - s.x;
    const dz = wz - s.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minSq) minSq = dSq;
  }
  return minSq;
}

function findNearestGroundTrackSample(
  wx: number,
  wz: number,
  samples: TrackPoint[]
): { sample: TrackPoint; distSq: number } {
  let minSq = Infinity;
  let best = samples[0];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    // Elevated bridge decks sit on structural piers above ground, so terrain stays conformed to the ground/underpass level
    if (s.isBridge || s.y > 2.4) continue;
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
  const gridSegs = 96;
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

    const { sample, distSq } = findNearestGroundTrackSample(vx, vz, samples);
    const dist = Math.sqrt(distSq);

    // Keep Paddock, Pit Lane, Team Garages & Main Grandstand zone level with the main straight so nothing floats or drops off!
    const inPaddockEnvelope =
      Math.abs(vz) < 88 && Math.abs(vx) < roadHalfWidth + 36;

    let vy = baseFloorY;
    if (dist < barrierHalfWidth + 4 || inPaddockEnvelope) {
      // Underneath or immediately next to the ground track road/kerbs or Paddock: keep strictly 35cm below road surface
      vy = sample.y - 0.35;
    } else if (dist < barrierHalfWidth + 58) {
      // Smooth Hermite blend from track elevation down to ambient ground floor
      const t = (dist - (barrierHalfWidth + 4)) / 54;
      const smoothT = t * t * (3 - 2 * t);
      vy = (sample.y - 0.35) * (1 - smoothT) + baseFloorY * smoothT;
    } else {
      // Ambient undulating rolling terrain outside the racing envelope
      const rolling =
        Math.sin(vx * 0.007) * Math.cos(vz * 0.007) * 3.1 +
        Math.sin(vx * 0.015 + vz * 0.012) * 1.4;
      vy = baseFloorY + rolling;
    }

    posAttr.setY(i, vy);
  }

  terrainGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    map: createGroundTexture(trackDef),
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.04,
    bumpMap: getMicroBumpTexture(),
    bumpScale: 0.09,
  });

  const groundMesh = new THREE.Mesh(terrainGeo, groundMat);
  groundMesh.name = 'track-conformed-terrain-mesh';
  return groundMesh;
}

/**
 * Helper that computes the right-hand outer barrier offset along the Pit Lane & Paddock zone
 * so the barrier smoothly widens around the Pit Lane & Team Garages instead of slicing through them.
 */
function getRightBarrierOffsetForSample(
  s: TrackPoint,
  roadHalfWidth: number,
  barrierHalfWidth: number
): number {
  const pitApronOuterWidth = roadHalfWidth + 11.2;
  const t = s.t;
  const onMainStraight = Math.abs(s.x) < 14 && s.tz > 0.65;

  if (onMainStraight) {
    if (s.z >= -42 && s.z <= 44) {
      return pitApronOuterWidth;
    }
    if (s.z >= -66 && s.z < -42) {
      const u = (s.z - -66) / 24;
      const smooth = 0.5 - 0.5 * Math.cos(u * Math.PI);
      return barrierHalfWidth + (pitApronOuterWidth - barrierHalfWidth) * smooth;
    }
    if (s.z > 44 && s.z <= 68) {
      const u = (s.z - 44) / 24;
      const smooth = 0.5 + 0.5 * Math.cos(u * Math.PI);
      return barrierHalfWidth + (pitApronOuterWidth - barrierHalfWidth) * smooth;
    }
  }

  // Fallback by normalized spline progress t
  if (t >= 0.855 && t < 0.895) {
    const u = (t - 0.855) / 0.04;
    const smooth = 0.5 - 0.5 * Math.cos(u * Math.PI);
    return barrierHalfWidth + (pitApronOuterWidth - barrierHalfWidth) * smooth;
  }
  if (t >= 0.895 || t <= 0.165) {
    return pitApronOuterWidth;
  }
  if (t > 0.165 && t <= 0.205) {
    const u = (t - 0.165) / 0.04;
    const smooth = 0.5 + 0.5 * Math.cos(u * Math.PI);
    return barrierHalfWidth + (pitApronOuterWidth - barrierHalfWidth) * smooth;
  }
  return barrierHalfWidth;
}

/**
 * Builds a high-detail 3D F1 2026 Pit Crew Mechanic with sculpted spherical carbon helmet,
 * iridium visor, articulated cylindrical limbs, fireproof Nomex suit, Paoli Hurricane pneumatic
 * wheel gun with LED torque ring + coiled overhead air hose, or hydraulic carbon quick-lift jack.
 */
function createPitMechanicMesh(
  suitHex: number,
  helmetHex: number,
  withWheelGun: boolean,
  facingRight: boolean,
  holdingSpareTireHex?: number,
  holdingLollipop = false
): THREE.Mesh {
  const gb = new GeometryBuilder();
  const sign = facingRight ? 1 : -1;
  const darkCarbon = 0x0f172a;
  const suitStripe = 0xf8fafc;
  const visorCyan = 0x38bdf8;
  const kneePadHex = 0xe10600;

  // Racing Boots & Articulated Lower/Upper Legs (Athletic crouched pit stance)
  for (const legZ of [-0.11, 0.11]) {
    // Boot sole & toe
    gb.addBox(sign * 0.04, 0.05, legZ, 0.22, 0.10, 0.12, darkCarbon);
    // Lower calf
    gb.addSmoothCylinder(0, 0.08, legZ, sign * 0.05, 0.36, legZ, 0.068, 0.072, 10, suitHex);
    // Carbon knee pad
    gb.addSmoothSphere(sign * 0.07, 0.37, legZ, 0.06, 0.065, 0.06, 6, 8, kneePadHex);
    // Upper thigh angled back to hip
    gb.addSmoothCylinder(sign * 0.05, 0.36, legZ, -sign * 0.03, 0.62, legZ * 0.9, 0.078, 0.088, 10, suitHex);
  }

  // Sculpted Torso, Team Chest Chevron & Lumbar Belt
  gb.addSmoothCylinder(-sign * 0.02, 0.58, 0, sign * 0.04, 0.98, 0, 0.145, 0.175, 12, suitHex);
  gb.addSmoothCylinder(-sign * 0.01, 0.74, 0, sign * 0.03, 0.84, 0, 0.168, 0.178, 12, suitStripe);
  gb.addSmoothCylinder(-sign * 0.02, 0.57, 0, -sign * 0.01, 0.64, 0, 0.152, 0.155, 12, darkCarbon);

  // HANS Device Collar & Sculpted Bell Carbon Pit Crew Helmet with Curved Iridium Visor
  gb.addSmoothCylinder(sign * 0.04, 0.98, 0, sign * 0.05, 1.05, 0, 0.11, 0.095, 10, darkCarbon);
  gb.addSmoothSphere(sign * 0.06, 1.15, 0, 0.145, 0.155, 0.14, 10, 14, helmetHex, visorCyan);
  // Helmet radio headset ear-cups & boom mic
  gb.addSmoothSphere(sign * 0.06, 1.14, 0.14, 0.04, 0.055, 0.035, 6, 8, darkCarbon);
  gb.addSmoothSphere(sign * 0.06, 1.14, -0.14, 0.04, 0.055, 0.035, 6, 8, darkCarbon);

  // Articulated Upper Arms, Forearms & Fireproof Gloves reaching forward
  for (const armZ of [-0.16, 0.16]) {
    const handZ = armZ * 0.48;
    gb.addSmoothCylinder(sign * 0.04, 0.93, armZ, sign * 0.22, 0.78, armZ * 0.82, 0.058, 0.052, 8, suitHex);
    gb.addSmoothCylinder(sign * 0.22, 0.78, armZ * 0.82, sign * 0.42, 0.68, handZ, 0.050, 0.044, 8, suitStripe);
    gb.addSmoothSphere(sign * 0.44, 0.67, handZ, 0.048, 0.045, 0.045, 6, 8, 0xfacc15);
  }

  if (holdingLollipop) {
    // FIA Carbon Optical Lollipop Release Pole & Glowing LED "BRAKE / GO" Board held over the car nosecone
    gb.addSmoothCylinder(sign * 0.42, 0.68, 0, sign * 1.45, 1.45, 0, 0.024, 0.022, 8, 0x94a3b8);
    gb.addSmoothCylinder(sign * 1.45, 1.45, 0, sign * 1.45, 1.15, 0, 0.022, 0.022, 8, 0x94a3b8);
    gb.addBox(sign * 1.45, 1.05, 0, 0.48, 0.28, 0.06, darkCarbon);
    gb.addBox(sign * 1.45, 1.05, 0.035, 0.42, 0.22, 0.02, 0x22c55e);
    gb.addBox(sign * 1.45, 1.05, -0.035, 0.42, 0.22, 0.02, 0xe10600);
  } else if (holdingSpareTireHex !== undefined) {
    // Tire Carrier holding a fresh 18-inch Pirelli F1 Wheel & Slick Tire ready to mount
    const tireX = sign * 0.54;
    const tireY = 0.64;
    gb.addSmoothCylinder(tireX, tireY, -0.19, tireX, tireY, 0.19, 0.34, 0.34, 16, 0x11151f);
    gb.addSmoothCylinder(tireX, tireY, -0.195, tireX, tireY, 0.195, 0.25, 0.25, 16, holdingSpareTireHex);
    gb.addSmoothCylinder(tireX, tireY, -0.20, tireX, tireY, 0.20, 0.19, 0.19, 14, 0x1e293b);
  } else if (withWheelGun) {
    // High-Detail Paoli Hurricane Pneumatic F1 Wheel Gun + Glowing LED Torque Ring + Coiled Air Hose
    gb.addSmoothCylinder(sign * 0.34, 0.67, 0, sign * 0.62, 0.67, 0, 0.072, 0.058, 12, 0x1e293b);
    gb.addSmoothCylinder(sign * 0.62, 0.67, 0, sign * 0.76, 0.67, 0, 0.044, 0.038, 12, 0x94a3b8);
    // Glowing green/yellow LED status ring around wheel gun nose
    gb.addSmoothCylinder(sign * 0.59, 0.67, 0, sign * 0.63, 0.67, 0, 0.066, 0.066, 12, 0x22c55e);
    gb.addSmoothCylinder(sign * 0.73, 0.67, 0, sign * 0.77, 0.67, 0, 0.046, 0.046, 12, 0xfacc15);
    // Pistol grip & top stabilize handle
    gb.addSmoothCylinder(sign * 0.42, 0.67, 0, sign * 0.39, 0.52, 0, 0.032, 0.028, 8, 0xe10600);
    gb.addSmoothCylinder(sign * 0.48, 0.67, -0.08, sign * 0.48, 0.76, 0.08, 0.022, 0.022, 8, 0xfacc15);
    // High-pressure pneumatic air hose curving from gun up toward overhead gantry boom
    gb.addSmoothCylinder(sign * 0.38, 0.53, 0.04, sign * 0.22, 1.45, 0.12, 0.022, 0.022, 8, 0xfacc15);
    gb.addSmoothCylinder(sign * 0.22, 1.45, 0.12, -sign * 0.15, 2.85, 0.08, 0.022, 0.022, 8, 0xfacc15);
  } else {
    // Carbon Rapid-Lift F1 Front/Rear Swivel Jack with Low-Profile Cradle & Twin Roller Wheels
    gb.addSmoothCylinder(sign * 0.38, 0.68, -0.14, sign * 0.38, 0.68, 0.14, 0.028, 0.028, 8, 0xfacc15);
    gb.addSmoothCylinder(sign * 0.38, 0.68, 0, sign * 0.74, 0.14, 0, 0.042, 0.048, 10, 0xe10600);
    gb.addBox(sign * 0.88, 0.09, 0, 0.44, 0.07, 0.34, darkCarbon);
    gb.addSmoothCylinder(sign * 0.72, 0.08, -0.19, sign * 0.72, 0.08, 0.19, 0.075, 0.075, 10, 0x334155);
    gb.addBox(sign * 0.98, 0.15, 0, 0.22, 0.08, 0.26, 0xfacc15);
  }

  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 115,
    specular: new THREE.Color(0x64748b),
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

  // 1. 3D Conforming Terrain Mesh (Sculpted to match 3D track elevation & flat Paddock apron)
  const conformedTerrainMesh = createConformingTerrainMesh(
    samples,
    trackDef,
    roadHalfWidth
  );
  trackGroup.add(conformedTerrainMesh);

  // 2. Continuous 3D Asphalt Ribbon Mesh + Custom GLSL Micro-Grain & Rubbered Racing-Line Specular Shader
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
    bumpScale: 0.045,
    color: 0xffffff,
    shininess: 56,
    specular: new THREE.Color(0x64748b),
    envMap: getProceduralEnvCubeMap(),
    reflectivity: 0.14,
    combine: THREE.MixOperation,
  });
  roadMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vRoadWorldPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vRoadWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vRoadWorldPos;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      // Rubbered racing-line sheen & micro-aggregate sparkle
      float grain = fract(sin(dot(floor(vRoadWorldPos.xz * 26.0), vec2(12.9898, 78.233))) * 43758.5453);
      vec3 viewDir = normalize(vViewPosition);
      float grazing = pow(1.0 - clamp( abs(dot(normal, viewDir)), 0.0, 1.0 ), 3.0);
      gl_FragColor.rgb += vec3(0.06, 0.08, 0.11) * grazing + (grain - 0.5) * 0.022;
      #include <dithering_fragment>`
    );
  };
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.name = 'track-road-mesh';
  trackGroup.add(roadMesh);

  // 3. 3D Alternating Apex Kerbs + FIA Painted Runoff Aprons + Spline-Conformed Pit Lane & Garage Apron
  const kerbPositions: number[] = [];
  const kerbNormals: number[] = [];
  const kerbColors: number[] = [];
  const colorA = new THREE.Color(trackDef.theme.kerbColorA);
  const colorB = new THREE.Color(trackDef.theme.kerbColorB);
  const runoffA = new THREE.Color(trackDef.theme.runoffColorA);
  const runoffB = new THREE.Color(trackDef.theme.runoffColorB);
  const pitLaneAsphaltCol = new THREE.Color(0x1e293b);
  const pitApronConcreteCol = new THREE.Color(0x334155);
  const embankmentCol = new THREE.Color(trackDef.theme.groundHex).offsetHSL(
    0,
    0,
    -0.03
  );
  const bridgeUndersideCol = new THREE.Color(0x1e293b);

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
    const isBridgeSpan = Boolean(s0.isBridge || s1.isBridge || s0.y > 2.4 || s1.y > 2.4);

    const rOuter0 = getRightBarrierOffsetForSample(s0, roadHalfWidth, barrierHalfWidth);
    const rOuter1 = getRightBarrierOffsetForSample(s1, roadHalfWidth, barrierHalfWidth);
    const inPitComplex = rOuter0 > barrierHalfWidth + 0.05 || rOuter1 > barrierHalfWidth + 0.05;

    // Left FIA Kerbs (always active)
    push3DStripQuad(
      s0.x - s0.nx * kerbOuterWidth, y0 + 0.02, s0.z - s0.nz * kerbOuterWidth,
      s0.x - s0.nx * roadHalfWidth, y0, s0.z - s0.nz * roadHalfWidth,
      s1.x - s1.nx * kerbOuterWidth, y1 + 0.02, s1.z - s1.nz * kerbOuterWidth,
      s1.x - s1.nx * roadHalfWidth, y1, s1.z - s1.nz * roadHalfWidth,
      col
    );
    // Right FIA Kerbs (suppressed inside Pit Complex so cars drive smoothly onto the Pit Lane)
    if (!inPitComplex) {
      push3DStripQuad(
        s0.x + s0.nx * roadHalfWidth, y0, s0.z + s0.nz * roadHalfWidth,
        s0.x + s0.nx * kerbOuterWidth, y0 + 0.02, s0.z + s0.nz * kerbOuterWidth,
        s1.x + s1.nx * roadHalfWidth, y1, s1.z + s1.nz * roadHalfWidth,
        s1.x + s1.nx * kerbOuterWidth, y1 + 0.02, s1.z + s1.nz * kerbOuterWidth,
        col
      );
    }

    // Left FIA Blue/Red Painted Runoff Strip
    push3DStripQuad(
      s0.x - s0.nx * barrierHalfWidth, s0.y, s0.z - s0.nz * barrierHalfWidth,
      s0.x - s0.nx * kerbOuterWidth, s0.y + 0.015, s0.z - s0.nz * kerbOuterWidth,
      s1.x - s1.nx * barrierHalfWidth, s1.y, s1.z - s1.nz * barrierHalfWidth,
      s1.x - s1.nx * kerbOuterWidth, s1.y + 0.015, s1.z - s1.nz * kerbOuterWidth,
      rCol
    );

    if (inPitComplex) {
      // Seamless Spline-Conformed Pit Lane Fast Lane + Pit Box Apron extending from Main Straight edge to Team Garages
      const pitMid0 = Math.min(rOuter0, roadHalfWidth + 6.2);
      const pitMid1 = Math.min(rOuter1, roadHalfWidth + 6.2);
      // Fast Lane / Pit Stall Asphalt (flush with main straight at y + 0.018)
      push3DStripQuad(
        s0.x + s0.nx * roadHalfWidth, s0.y + 0.018, s0.z + s0.nz * roadHalfWidth,
        s0.x + s0.nx * pitMid0, s0.y + 0.018, s0.z + s0.nz * pitMid0,
        s1.x + s1.nx * roadHalfWidth, s1.y + 0.018, s1.z + s1.nz * roadHalfWidth,
        s1.x + s1.nx * pitMid1, s1.y + 0.018, s1.z + s1.nz * pitMid1,
        pitLaneAsphaltCol
      );
      // Garage Apron Concrete between Pit Box and Team Garage doors
      if (rOuter0 > pitMid0 + 0.05 || rOuter1 > pitMid1 + 0.05) {
        push3DStripQuad(
          s0.x + s0.nx * pitMid0, s0.y + 0.02, s0.z + s0.nz * pitMid0,
          s0.x + s0.nx * rOuter0, s0.y + 0.02, s0.z + s0.nz * rOuter0,
          s1.x + s1.nx * pitMid1, s1.y + 0.02, s1.z + s1.nz * pitMid1,
          s1.x + s1.nx * rOuter1, s1.y + 0.02, s1.z + s1.nz * rOuter1,
          pitApronConcreteCol
        );
      }
    } else {
      push3DStripQuad(
        s0.x + s0.nx * kerbOuterWidth, s0.y + 0.015, s0.z + s0.nz * kerbOuterWidth,
        s0.x + s0.nx * barrierHalfWidth, s0.y, s0.z + s0.nz * barrierHalfWidth,
        s1.x + s1.nx * kerbOuterWidth, s1.y + 0.015, s1.z + s1.nz * kerbOuterWidth,
        s1.x + s1.nx * barrierHalfWidth, s1.y, s1.z + s1.nz * barrierHalfWidth,
        rCol
      );
    }

    if (isBridgeSpan) {
      // Underneath elevated bridge span: solid bottom deck soffit so cars driving underneath see a clean bridge box girder
      push3DStripQuad(
        s0.x + s0.nx * (barrierHalfWidth + 0.6), s0.y - 0.95, s0.z + s0.nz * (barrierHalfWidth + 0.6),
        s0.x - s0.nx * (barrierHalfWidth + 0.6), s0.y - 0.95, s0.z - s0.nz * (barrierHalfWidth + 0.6),
        s1.x + s1.nx * (barrierHalfWidth + 0.6), s1.y - 0.95, s1.z + s1.nz * (barrierHalfWidth + 0.6),
        s1.x - s1.nx * (barrierHalfWidth + 0.6), s1.y - 0.95, s1.z - s1.nz * (barrierHalfWidth + 0.6),
        bridgeUndersideCol
      );
    } else {
      // 3D Terrain Embankment Slopes anchoring ground-level track sections smoothly to conformed terrain
      const vergeMidL = barrierHalfWidth + 7.5;
      const vergeOuterL = barrierHalfWidth + 22.0;

      // Left verge strip 1 & 2
      push3DStripQuad(
        s0.x - s0.nx * vergeMidL, s0.y - 0.16, s0.z - s0.nz * vergeMidL,
        s0.x - s0.nx * barrierHalfWidth, s0.y - 0.02, s0.z - s0.nz * barrierHalfWidth,
        s1.x - s1.nx * vergeMidL, s1.y - 0.16, s1.z - s1.nz * vergeMidL,
        s1.x - s1.nx * barrierHalfWidth, s1.y - 0.02, s1.z - s1.nz * barrierHalfWidth,
        embankmentCol
      );
      push3DStripQuad(
        s0.x - s0.nx * vergeOuterL, s0.y - 0.35, s0.z - s0.nz * vergeOuterL,
        s0.x - s0.nx * vergeMidL, s0.y - 0.16, s0.z - s0.nz * vergeMidL,
        s1.x - s1.nx * vergeOuterL, s1.y - 0.35, s1.z - s1.nz * vergeOuterL,
        s1.x - s1.nx * vergeMidL, s1.y - 0.16, s1.z - s1.nz * vergeMidL,
        embankmentCol
      );

      // Right verge strip 1 & 2 (starts outside rOuter0/rOuter1 so it never overlaps the Pit Lane or Garages!)
      const rVergeMid0 = rOuter0 + 7.5;
      const rVergeMid1 = rOuter1 + 7.5;
      const rVergeOuter0 = rOuter0 + 22.0;
      const rVergeOuter1 = rOuter1 + 22.0;
      push3DStripQuad(
        s0.x + s0.nx * rOuter0, s0.y - 0.02, s0.z + s0.nz * rOuter0,
        s0.x + s0.nx * rVergeMid0, s0.y - 0.16, s0.z + s0.nz * rVergeMid0,
        s1.x + s1.nx * rOuter1, s1.y - 0.02, s1.z + s1.nz * rOuter1,
        s1.x + s1.nx * rVergeMid1, s1.y - 0.16, s1.z + s1.nz * rVergeMid1,
        embankmentCol
      );
      push3DStripQuad(
        s0.x + s0.nx * rVergeMid0, s0.y - 0.16, s0.z + s0.nz * rVergeMid0,
        s0.x + s0.nx * rVergeOuter0, s0.y - 0.35, s0.z + s0.nz * rVergeOuter0,
        s1.x + s1.nx * rVergeMid1, s1.y - 0.16, s1.z + s1.nz * rVergeMid1,
        s1.x + s1.nx * rVergeOuter1, s1.y - 0.35, s1.z + s1.nz * rVergeOuter1,
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
    shininess: 38,
    side: THREE.DoubleSide,
  });
  trackGroup.add(new THREE.Mesh(kerbGeo, kerbMat));

  // 4. Multi-Color FIA TecPro Barriers & Bridge Girder Side Fascia (Smoothly wrapping behind the Pit Garage Apron)
  const barrierPositions: number[] = [];
  const barrierNormals: number[] = [];
  const barrierColors: number[] = [];
  const bHeight = 0.92;
  const minBarrierRoadDistSq = (roadHalfWidth + 1.6) * (roadHalfWidth + 1.6);
  const tecProRed = new THREE.Color(0xdc2626);
  const tecProWhite = new THREE.Color(0xf8fafc);
  const tecProBlue = new THREE.Color(0x0284c7);
  const bridgeGirderCol = new THREE.Color(0x334155);
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
    const isBridgeSpan = Boolean(s0.isBridge || s1.isBridge || s0.y > 2.4 || s1.y > 2.4);
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
    const lMidY = (s0.y + s1.y) * 0.5;
    const lMidZ = (l0z + l1z) * 0.5;

    if (minDistanceSqToTrackSameLevel(lMidX, lMidY, lMidZ, samples, i, 6) >= minBarrierRoadDistSq) {
      pushWallQuadColored(l0x, s0.y, l0z, l1x, s1.y, l1z, isBridgeSpan ? 1.25 : bHeight, s0.nx, s0.nz, blockCol);
      if (isBridgeSpan) {
        pushWallQuadColored(l0x, s0.y - 0.95, l0z, l1x, s1.y - 0.95, l1z, 0.98, -s0.nx, -s0.nz, bridgeGirderCol);
      }
    }

    const rWidth0 = getRightBarrierOffsetForSample(s0, roadHalfWidth, barrierHalfWidth);
    const rWidth1 = getRightBarrierOffsetForSample(s1, roadHalfWidth, barrierHalfWidth);

    const r0x = s0.x + s0.nx * rWidth0;
    const r0z = s0.z + s0.nz * rWidth0;
    const r1x = s1.x + s1.nx * rWidth1;
    const r1z = s1.z + s1.nz * rWidth1;
    const rMidX = (r0x + r1x) * 0.5;
    const rMidY = (s0.y + s1.y) * 0.5;
    const rMidZ = (r0z + r1z) * 0.5;

    if (minDistanceSqToTrackSameLevel(rMidX, rMidY, rMidZ, samples, i, 6) >= minBarrierRoadDistSq) {
      pushWallQuadColored(r1x, s1.y, r1z, r0x, s0.y, r0z, isBridgeSpan ? 1.25 : bHeight, -s0.nx, -s0.nz, blockCol);
      if (isBridgeSpan) {
        pushWallQuadColored(r1x, s1.y - 0.95, r1z, r0x, s0.y - 0.95, r0z, 0.98, s0.nx, s0.nz, bridgeGirderCol);
      }
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

  // 5. F1 2026 Paddock Architecture, 3D Bridge Overpass Piers, Overhead Bridges, Braking Markers, Grandstands & Sculpted Mountains
  const propGb = new GeometryBuilder();
  const sStart = samples[0];
  const gantryHalfSpan = roadHalfWidth + 2.8;

  // 5A. Structural Concrete Bridge Support Piers & Overhead Suspension Arch on Elevated Bridge Sections (e.g. Figure-8 Overpasses)
  for (let i = 0; i < n; i += 6) {
    const sb = samples[i];
    if (!sb.isBridge && sb.y < 2.6) continue;
    const pierSpan = barrierHalfWidth + 1.2;
    const lx = sb.x - sb.nx * pierSpan;
    const lz = sb.z - sb.nz * pierSpan;
    const rx = sb.x + sb.nx * pierSpan;
    const rz = sb.z + sb.nz * pierSpan;

    const lowerRoadClearSq = (roadHalfWidth + 3.4) * (roadHalfWidth + 3.4);
    const leftClear = minDistanceSqToTrackSameLevel(lx, 0, lz, samples, i, 18) >= lowerRoadClearSq;
    const rightClear = minDistanceSqToTrackSameLevel(rx, 0, rz, samples, i, 18) >= lowerRoadClearSq;

    const pierHeight = sb.y + 2.8;
    const pierMidY = sb.y * 0.5 - 1.1;
    if (leftClear && rightClear) {
      propGb.addOrientedBox(lx, pierMidY, lz, sb.angle, 1.35, pierHeight, 1.65, 0x475569);
      propGb.addOrientedBox(rx, pierMidY, rz, sb.angle, 1.35, pierHeight, 1.65, 0x475569);
      propGb.addOrientedBox(sb.x, sb.y - 0.72, sb.z, sb.angle, pierSpan * 2 + 1.8, 0.85, 1.8, 0x334155);
    }
    if (i % 12 === 0) {
      propGb.addOrientedBox(lx, sb.y + 3.2, lz, sb.angle, 0.55, 6.4, 0.65, 0xe2e8f0);
      propGb.addOrientedBox(rx, sb.y + 3.2, rz, sb.angle, 0.55, 6.4, 0.65, 0xe2e8f0);
      propGb.addOrientedBox(sb.x, sb.y + 6.2, sb.z, sb.angle, pierSpan * 2 + 0.8, 0.55, 0.75, 0xe10600);
    }
  }

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
      minDistanceSqToTrackSameLevel(lx, sb.y, lz, samples, secIdx, 10) >= minBarrierRoadDistSq &&
      minDistanceSqToTrackSameLevel(rx, sb.y, rz, samples, secIdx, 10) >= minBarrierRoadDistSq
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

  // ==================== SEAMLESS 3D F1 2026 PIT LANE COMPLEX & OPEN-BAY TEAM GARAGES ====================
  const pitAlleyCenterX = -(roadHalfWidth + 3.2);

  // Glowing Pit Entry Chevron Decal leading off the right side of the main straight into the Pit Lane (z = -46..-16)
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

  // Glowing Pit Exit Merge Line Decal guiding cars back onto the Main Straight (z = 22..46)
  const pitExitChevronMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 24).rotateX(-Math.PI / 2),
    pitEntryChevronMat
  );
  pitExitChevronMesh.position.set(pitAlleyCenterX + 0.6, 0.032, 34);
  trackGroup.add(pitExitChevronMesh);

  // Physical Pit Wall Divider + FIA PratPerch Engineer Telemetry Stand separating Main Straight from Pit Lane (z = -18..+20)
  const pitWallDividerX = -(roadHalfWidth + 0.25);
  propGb.addBox(pitWallDividerX, 0.48, 2, 0.42, 0.96, 38, 0x1e293b);
  propGb.addBox(pitWallDividerX, 1.02, 2, 0.16, 0.18, 38, 0x38bdf8);
  // Pit Wall Engineer Telemetry Canopy & Multi-Screen Bank (stationed at z = -11 so Pit Box at z = +2 has clear sightlines)
  propGb.addBox(pitWallDividerX - 0.32, 1.75, -11, 0.85, 1.1, 11, 0x0f172a);
  propGb.addBox(pitWallDividerX - 0.76, 1.75, -11, 0.08, 0.64, 9.8, 0x22d3ee);
  propGb.addBox(pitWallDividerX - 0.18, 2.42, -11, 1.45, 0.18, 12, 0xe10600);

  // High-visibility FIA Pit Entry & Exit Crash Attenuator Bollards on the Pit Wall tips
  propGb.addBox(pitWallDividerX, 0.85, -17.4, 0.76, 1.7, 1.2, 0x22c55e);
  propGb.addBox(pitWallDividerX, 0.85, 21.4, 0.76, 1.7, 1.2, 0xfacc15);

  // Glowing Green "PIT IN · 80 KM/H" Arch over the Pit Lane Entrance (z = -34)
  propGb.addBox(pitWallDividerX, 2.4, -34, 0.5, 4.8, 0.5, 0x10b981);
  propGb.addBox(pitAlleyCenterX - 3.4, 2.4, -34, 0.5, 4.8, 0.5, 0x10b981);
  propGb.addBox(pitAlleyCenterX, 4.6, -34, 7.6, 0.85, 0.85, 0x0f172a);
  propGb.addBox(pitAlleyCenterX, 4.6, -34.45, 6.6, 0.48, 0.14, 0x22c55e);

  // Physical 3D F1 Pit Stop Box Decal inside the Pit Lane (x = -(roadHalfWidth + 3.2), z = 2)
  if (!sharedPitZoneTex) {
    sharedPitZoneTex = createPitZoneDecalTexture();
  }
  const pitDecalGeo = new THREE.PlaneGeometry(6.8, 46);
  pitDecalGeo.rotateX(-Math.PI / 2);
  const pitDecalMat = new THREE.MeshBasicMaterial({
    map: sharedPitZoneTex,
    transparent: true,
    depthWrite: false,
  });
  const pitDecalMesh = new THREE.Mesh(pitDecalGeo, pitDecalMat);
  pitDecalMesh.position.set(pitAlleyCenterX - 0.4, 0.036, 2);
  trackGroup.add(pitDecalMesh);

  // 3D Pit Box Overhead Carbon Crew Gantry, Swivel Booms, Tire Blankets & Telemetry Racks
  const pitApronX = -(roadHalfWidth + 6.8);
  {
    // Sculpted Twin Carbon-Fiber Overhead Pit Gantry Pylons & Cantilevered Swivel Booms
    for (const boomZ of [-1.2, 5.2]) {
      propGb.addSmoothCylinder(pitApronX - 0.4, 0, boomZ, pitApronX - 0.1, 5.1, boomZ, 0.28, 0.22, 12, 0x0f172a);
      propGb.addSmoothCylinder(pitApronX - 0.1, 4.95, boomZ, pitAlleyCenterX + 1.4, 4.85, boomZ, 0.18, 0.12, 12, 0xe10600);
      propGb.addBox(pitApronX + 1.8, 5.18, boomZ, 4.8, 0.14, 0.32, 0xf8fafc);
    }
    // Central Overhead Telemetry & Floodlight Bridge spanning between the two carbon booms
    propGb.addBox(pitAlleyCenterX, 4.78, 2.0, 1.55, 0.36, 7.4, 0x0f172a);
    propGb.addBox(pitAlleyCenterX + 0.78, 4.78, 2.0, 0.08, 0.24, 6.8, 0x22d3ee);
    propGb.addBox(pitAlleyCenterX - 0.78, 4.78, 2.0, 0.08, 0.24, 6.8, 0xe10600);

    // Curved Pneumatic Air Hoses & Sensor Cables dropping from the Overhead Gantry to all 4 Wheel Stations
    for (const hoseZ of [0.68, 3.35]) {
      for (const side of [-1, 1]) {
        const topX = pitAlleyCenterX + side * 0.68;
        const midX = pitAlleyCenterX + side * 1.45;
        const botX = pitAlleyCenterX + side * 1.25;
        propGb.addSmoothCylinder(topX, 4.65, hoseZ, midX, 3.35, hoseZ, 0.032, 0.028, 8, 0xfacc15);
        propGb.addSmoothCylinder(midX, 3.35, hoseZ, botX, 2.15, hoseZ, 0.028, 0.024, 8, 0xe10600);
      }
    }

    // Stacked Cylindrical Pirelli Tire Warmers (Soft Red, Medium Yellow, Hard White, Wet Blue) + Nitrogen Bottle Carts along the Pit Apron
    const tireStackSpecs: Array<{ z: number; hex: number }> = [
      { z: -5.5, hex: 0xef4444 },
      { z: -3.2, hex: 0xfacc15 },
      { z: 7.4, hex: 0xef4444 },
      { z: 9.6, hex: 0xfacc15 },
      { z: 11.8, hex: 0xf8fafc },
      { z: 14.0, hex: 0x38bdf8 },
    ];
    for (const ts of tireStackSpecs) {
      // 4 stacked wrapped Pirelli tires per rack
      for (let tier = 0; tier < 4; tier++) {
        const y0 = 0.06 + tier * 0.38;
        const y1 = y0 + 0.34;
        propGb.addSmoothCylinder(pitApronX - 1.15, y0, ts.z, pitApronX - 1.15, y1, ts.z, 0.38, 0.38, 14, 0x111827);
        propGb.addSmoothCylinder(pitApronX - 1.15, y0 + 0.05, ts.z, pitApronX - 1.15, y1 - 0.05, ts.z, 0.39, 0.39, 14, ts.hex);
      }
    }
    // High-Pressure Blue/Gold Nitrogen & Compressed Air Cylinder Cart for Pneumatic Wheel Guns
    propGb.addBox(pitApronX - 1.1, 0.14, 2.0, 0.95, 0.16, 2.2, 0x1e293b);
    for (const bz of [1.35, 2.0, 2.65]) {
      propGb.addSmoothCylinder(pitApronX - 1.1, 0.22, bz, pitApronX - 1.1, 1.55, bz, 0.16, 0.16, 10, 0x0284c7);
      propGb.addSmoothSphere(pitApronX - 1.1, 1.55, bz, 0.16, 0.14, 0.16, 6, 10, 0xfacc15);
    }
    // Spare Carbon Front Wing Assembly on Pit Apron Stand
    propGb.addBox(pitApronX - 1.15, 0.45, -8.2, 0.65, 0.85, 2.1, 0x334155);
    propGb.addBox(pitApronX - 1.05, 0.92, -8.2, 0.42, 0.12, 1.95, 0xe10600);
    propGb.addBox(pitApronX - 1.05, 1.02, -8.2, 0.36, 0.08, 1.88, 0xfacc15);

    // 3D Animated F1 2026 Pit Crew Group (4 Wheel Gunners + 4 Tire Carriers + 2 Aero Stabilizers + 2 Jackmen + Lollipop Signaller + Wheel Sparks)
    const pitCrewGroup = new THREE.Group();
    pitCrewGroup.name = 'f1-pit-crew-group';
    pitCrewGroup.position.set(0, 0, 0);

    const wheelCrewOffsets: Array<{
      baseX: number;
      targetX: number;
      z: number;
      facingRight: boolean;
      suitHex?: number;
    }> = [
      // Front-Right & Front-Left Wheel Gunners (exact car front axle z = 2.0 + 1.35 = 3.35)
      { baseX: pitAlleyCenterX - 2.38, targetX: pitAlleyCenterX - 1.34, z: 3.35, facingRight: true, suitHex: 0xe10600 },
      { baseX: pitAlleyCenterX + 2.38, targetX: pitAlleyCenterX + 1.34, z: 3.35, facingRight: false, suitHex: 0xe10600 },
      // Rear-Right & Rear-Left Wheel Gunners (exact car rear axle z = 2.0 - 1.32 = 0.68)
      { baseX: pitAlleyCenterX - 2.38, targetX: pitAlleyCenterX - 1.34, z: 0.68, facingRight: true, suitHex: 0xe10600 },
      { baseX: pitAlleyCenterX + 2.38, targetX: pitAlleyCenterX + 1.34, z: 0.68, facingRight: false, suitHex: 0xe10600 },
      // Front Wing Active Aero Flap Adjusters & Sidepod Stabilizers
      { baseX: pitAlleyCenterX - 2.25, targetX: pitAlleyCenterX - 1.18, z: 4.35, facingRight: true, suitHex: 0x0284c7 },
      { baseX: pitAlleyCenterX + 2.25, targetX: pitAlleyCenterX + 1.18, z: 4.35, facingRight: false, suitHex: 0x0284c7 },
    ];

    for (const wc of wheelCrewOffsets) {
      const mech = createPitMechanicMesh(
        wc.suitHex ?? 0xe10600,
        0xf8fafc,
        true,
        wc.facingRight
      );
      mech.position.set(wc.baseX, 0, wc.z);
      mech.userData = {
        role: 'wheel-gunner',
        baseX: wc.baseX,
        targetX: wc.targetX,
        baseZ: wc.z,
      };
      pitCrewGroup.add(mech);
    }

    // 4 Tire Carriers holding fresh 18-inch Pirelli Slicks beside each wheel station
    const tireCarrierOffsets: Array<{
      baseX: number;
      targetX: number;
      z: number;
      facingRight: boolean;
      tireHex: number;
    }> = [
      { baseX: pitAlleyCenterX - 2.85, targetX: pitAlleyCenterX - 1.88, z: 2.55, facingRight: true, tireHex: 0xef4444 },
      { baseX: pitAlleyCenterX + 2.85, targetX: pitAlleyCenterX + 1.88, z: 2.55, facingRight: false, tireHex: 0xef4444 },
      { baseX: pitAlleyCenterX - 2.85, targetX: pitAlleyCenterX - 1.88, z: 1.45, facingRight: true, tireHex: 0xfacc15 },
      { baseX: pitAlleyCenterX + 2.85, targetX: pitAlleyCenterX + 1.88, z: 1.45, facingRight: false, tireHex: 0xfacc15 },
    ];
    for (const tc of tireCarrierOffsets) {
      const carrier = createPitMechanicMesh(
        0x0f172a,
        0xfacc15,
        false,
        tc.facingRight,
        tc.tireHex
      );
      carrier.position.set(tc.baseX, 0, tc.z);
      carrier.userData = {
        role: 'tire-carrier',
        baseX: tc.baseX,
        targetX: tc.targetX,
        baseZ: tc.z,
      };
      pitCrewGroup.add(carrier);
    }

    // 4 Animated High-Intensity Wheel-Gun Titanium Spark Bursts at the 4 Wheel Hubs during active Pit Stops
    const sparkCoords: Array<[number, number, number]> = [
      [pitAlleyCenterX - 0.95, 0.36, 3.35],
      [pitAlleyCenterX + 0.95, 0.36, 3.35],
      [pitAlleyCenterX - 0.95, 0.37, 0.68],
      [pitAlleyCenterX + 0.95, 0.37, 0.68],
    ];
    const sparkGeo = new THREE.OctahedronGeometry(0.24, 0);
    for (let sIdx = 0; sIdx < sparkCoords.length; sIdx++) {
      const [sx, sy, sz] = sparkCoords[sIdx];
      const sparkMat = new THREE.MeshBasicMaterial({
        color: sIdx % 2 === 0 ? 0xfbbf24 : 0x38bdf8,
        wireframe: true,
      });
      const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
      sparkMesh.position.set(sx, sy, sz);
      sparkMesh.visible = false;
      sparkMesh.userData = { role: 'wheel-spark', sparkIdx: sIdx };
      pitCrewGroup.add(sparkMesh);
    }

    // Glowing LED Pit Stall Side Strips on the tarmac framing the car
    const stripGeo = new THREE.BoxGeometry(0.14, 0.04, 6.2);
    for (const side of [-1, 1]) {
      const stripMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const stripMesh = new THREE.Mesh(stripGeo, stripMat);
      stripMesh.position.set(pitAlleyCenterX + side * 1.65, 0.045, 2.0);
      stripMesh.userData = { role: 'pit-floor-led' };
      pitCrewGroup.add(stripMesh);
    }

    // Front & Rear Rapid-Lift Jackmen
    const frontJack = createPitMechanicMesh(0x0f172a, 0xfacc15, false, true);
    frontJack.position.set(pitAlleyCenterX, 0, 5.85);
    frontJack.rotation.y = Math.PI / 2;
    frontJack.userData = { role: 'jackman', baseZ: 5.85, targetZ: 4.82 };
    pitCrewGroup.add(frontJack);

    const rearJack = createPitMechanicMesh(0x0f172a, 0xfacc15, false, true);
    rearJack.position.set(pitAlleyCenterX, 0, -2.05);
    rearJack.rotation.y = -Math.PI / 2;
    rearJack.userData = { role: 'jackman', baseZ: -2.05, targetZ: -1.08 };
    pitCrewGroup.add(rearJack);

    // Lollipop / Optical Release Signaller standing beside Front-Right with overhead Release Board
    const lollipopMan = createPitMechanicMesh(
      0x10b981,
      0xf8fafc,
      false,
      true,
      undefined,
      true
    );
    lollipopMan.position.set(pitAlleyCenterX - 2.05, 0, 5.15);
    lollipopMan.userData = {
      role: 'lollipop-man',
      baseX: pitAlleyCenterX - 2.05,
      targetX: pitAlleyCenterX - 1.55,
    };
    pitCrewGroup.add(lollipopMan);

    // Overhead Pit Stall Status Light Beacon + Work Floodbar
    const beaconGeo = new THREE.BoxGeometry(1.65, 0.42, 0.46);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.set(pitAlleyCenterX, 4.42, 5.4);
    beaconMesh.userData = { role: 'pit-beacon' };
    pitCrewGroup.add(beaconMesh);

    const floodGeo = new THREE.BoxGeometry(1.25, 0.14, 6.8);
    const floodMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
    const floodMesh = new THREE.Mesh(floodGeo, floodMat);
    floodMesh.position.set(pitAlleyCenterX, 4.52, 2.0);
    pitCrewGroup.add(floodMesh);

    trackGroup.add(pitCrewGroup);
  }

  // Multi-Story F1 6-Team Pit Garages & VIP Paddock Club directly bordering the Pit Garage Apron
  const minBuildingClearanceSq = (roadHalfWidth + 10.5) * (roadHalfWidth + 10.5);
  const pitBuildingX = -(roadHalfWidth + 17.5);
  if (minDistanceSqToTrack(pitBuildingX, 14, samples) >= minBuildingClearanceSq) {
    // Main Garage Structure (front facade sits right at x = -(roadHalfWidth + 11.0), flush with the Pit Apron!)
    propGb.addBox(pitBuildingX - 1.2, 3.6, 8, 10.6, 7.2, 68, 0x0f172a);
    // 6 Open-Bay Team Garages facing the Pit Lane with illuminated interior bays, tool cabinets, telemetry desks & team liveries
    const teamHeaderColors = [0xe10600, 0x0284c7, 0xf97316, 0x10b981, 0x059669, 0x6366f1];
    for (let g = 0; g < 6; g++) {
      const gz = -18 + g * 10.4;
      // Team color header fascia & glowing LED trim above garage door
      propGb.addBox(pitBuildingX + 6.45, 5.15, gz, 0.45, 1.05, 9.6, teamHeaderColors[g]);
      propGb.addBox(pitBuildingX + 6.72, 4.62, gz, 0.12, 0.12, 9.4, 0xf8fafc);
      // Side pillars between garage bays
      propGb.addBox(pitBuildingX + 5.2, 2.3, gz - 4.7, 2.8, 4.6, 0.65, 0x1e293b);
      // Recessed garage interior back wall + bright ceiling light panels + Snap-On tool chests + dual telemetry monitor desks
      propGb.addBox(pitBuildingX + 3.4, 2.2, gz, 0.35, 4.4, 8.6, 0x1e293b);
      propGb.addBox(pitBuildingX + 5.0, 4.25, gz - 1.8, 2.6, 0.16, 3.2, 0xe0f2fe);
      propGb.addBox(pitBuildingX + 5.0, 4.25, gz + 1.8, 2.6, 0.16, 3.2, 0xe0f2fe);
      propGb.addBox(pitBuildingX + 4.1, 0.9, gz - 2.6, 0.9, 1.6, 2.4, teamHeaderColors[g]);
      propGb.addBox(pitBuildingX + 4.1, 0.9, gz + 2.6, 0.9, 1.6, 2.4, 0x334155);
      // Center race engineer telemetry island desk + glowing cyan monitor screens inside each open garage bay
      propGb.addBox(pitBuildingX + 4.8, 0.65, gz, 1.1, 1.1, 2.2, 0x0f172a);
      propGb.addBox(pitBuildingX + 5.38, 1.45, gz, 0.08, 0.55, 1.85, 0x38bdf8);
    }
    // 2nd Floor VIP Paddock Club Glass Hospitality Lounge & Balcony overlooking the Pit Lane
    propGb.addBox(pitBuildingX + 0.8, 8.8, 8, 14, 3.2, 64, 0x1e293b);
    propGb.addBox(pitBuildingX + 7.85, 8.8, 8, 0.22, 2.4, 60, 0x38bdf8);
    // Sculpted Cantilevered Paddock Roof Wing
    propGb.addBox(pitBuildingX + 1.8, 10.8, 8, 16.5, 0.65, 68, 0xf8fafc, 0.92, 0);
    propGb.addBox(pitBuildingX + 10.1, 10.8, 8, 0.35, 0.72, 68, 0xe10600);
  }

  // Main Straight Stadium Grandstand (Left Side of Main Straight) + Animated 3D Spectator Crowd & Flags
  const standBaseX = roadHalfWidth + 16.5;
  const spectatorPlacements: Array<{ x: number; y: number; z: number; rotY: number; colorHex: number }> = [];
  const fanPalette = [0xe10600, 0xfacc15, 0x38bdf8, 0xf97316, 0x10b981, 0xf8fafc, 0xa855f7];

  if (minDistanceSqToTrack(standBaseX, -6, samples) >= minBuildingClearanceSq) {
    for (let tier = 0; tier < 6; tier++) {
      const tx = standBaseX + tier * 2.4;
      const ty = 1.0 + tier * 1.2;
      propGb.addBox(
        tx,
        ty,
        -6,
        2.4,
        1.9,
        66,
        tier % 2 === 0 ? 0x1e293b : 0x334155
      );
      propGb.addBox(
        tx - 0.65,
        2.1 + tier * 1.2,
        -6,
        0.75,
        0.48,
        62,
        tier % 3 === 0 ? 0xe10600 : tier % 3 === 1 ? 0xfacc15 : 0x38bdf8
      );
      // Populate 3D spectators along every tier of the Main Grandstand
      for (let fz = -34; fz <= 22; fz += 1.55) {
        spectatorPlacements.push({
          x: tx - 0.55,
          y: ty + 1.38,
          z: fz + ((tier * 7) % 3) * 0.25,
          rotY: -Math.PI / 2,
          colorHex: fanPalette[(Math.abs(Math.floor(fz)) + tier * 3) % fanPalette.length],
        });
      }
    }
    propGb.addBox(standBaseX + 5.2, 9.6, -6, 15.5, 0.55, 68, 0xf8fafc, 0.9, 0);
    propGb.addBox(standBaseX - 2.4, 9.6, -6, 0.45, 0.62, 68, 0xe10600);
  }

  // Secondary Corner Grandstands at Sector 1, Sector 2 & Sector 3 with 3D Spectator Crowds
  for (const cIdx of [92, 168, 235]) {
    const sc = samples[cIdx % n];
    if (sc.isBridge || sc.y > 2.4) continue;
    const gx = sc.x + sc.nx * (roadHalfWidth + 22);
    const gz = sc.z + sc.nz * (roadHalfWidth + 22);
    if (minDistanceSqToTrack(gx, gz, samples) >= (roadHalfWidth + 15) * (roadHalfWidth + 15)) {
      propGb.addOrientedBox(gx, sc.y + 2.8, gz, sc.angle, 8.5, 5.6, 32, 0x1e293b);
      propGb.addOrientedBox(gx, sc.y + 6.0, gz, sc.angle, 9.5, 0.55, 34, 0xe10600);
      propGb.addOrientedBox(gx, sc.y + 4.2, gz, sc.angle, 8.8, 0.9, 30, 0xfacc15);
      // Add 3 rows of cheering fans on each Corner Grandstand
      for (let row = 0; row < 3; row++) {
        for (let along = -12; along <= 12; along += 2.0) {
          const offsetOut = roadHalfWidth + 19.2 + row * 1.8;
          const fx = sc.x + sc.nx * offsetOut + sc.tx * along;
          const fz = sc.z + sc.nz * offsetOut + sc.tz * along;
          spectatorPlacements.push({
            x: fx,
            y: sc.y + 3.2 + row * 0.95,
            z: fz,
            rotY: sc.angle + Math.PI,
            colorHex: fanPalette[(row * 5 + Math.abs(along)) % fanPalette.length],
          });
        }
      }
    }
  }

  // Build Instanced 3D Grandstand Spectator Crowd (`f1-grandstand-crowd`) with sculpted cheering upper bodies & team caps
  if (spectatorPlacements.length > 0) {
    const fanGb = new GeometryBuilder();
    // Smooth sculpted torso + raised cheering arms + spherical head & team cap visor
    fanGb.addSmoothCylinder(0, 0.05, 0, 0, 0.52, 0, 0.14, 0.16, 8, 0xffffff);
    fanGb.addSmoothCylinder(-0.16, 0.44, 0, -0.26, 0.72, 0.04, 0.045, 0.04, 6, 0xffffff);
    fanGb.addSmoothCylinder(0.16, 0.44, 0, 0.26, 0.72, 0.04, 0.045, 0.04, 6, 0xffffff);
    fanGb.addSmoothSphere(0, 0.65, 0, 0.11, 0.115, 0.11, 6, 8, 0xfde68a);
    fanGb.addSmoothCylinder(0, 0.71, 0, 0, 0.76, 0.05, 0.115, 0.11, 8, 0xffffff);
    const fanMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 35,
    });
    const crowdInst = new THREE.InstancedMesh(
      fanGb.toBufferGeometry(),
      fanMat,
      spectatorPlacements.length
    );
    crowdInst.name = 'f1-grandstand-crowd';
    const fanDummy = new THREE.Object3D();
    const fanCol = new THREE.Color();
    for (let idx = 0; idx < spectatorPlacements.length; idx++) {
      const sp = spectatorPlacements[idx];
      fanDummy.position.set(sp.x, sp.y, sp.z);
      fanDummy.rotation.set(0, sp.rotY, 0);
      fanDummy.scale.setScalar(0.92 + (idx % 3) * 0.08);
      fanDummy.updateMatrix();
      crowdInst.setMatrixAt(idx, fanDummy.matrix);
      crowdInst.setColorAt(idx, fanCol.setHex(sp.colorHex));
    }
    crowdInst.instanceMatrix.needsUpdate = true;
    if (crowdInst.instanceColor) crowdInst.instanceColor.needsUpdate = true;
    crowdInst.computeBoundingSphere();
    trackGroup.add(crowdInst);
  }

  // Iconic 3D F1 Festival Ferris Wheel & Helical Observation Tower (Infield / Paddock Vista)
  const ferrisX = 112;
  const ferrisZ = 42;
  if (minDistanceSqToTrack(ferrisX, ferrisZ, samples) >= (roadHalfWidth + 24) * (roadHalfWidth + 24)) {
    propGb.addBox(ferrisX - 2.6, 14, ferrisZ, 1.2, 28, 8.0, 0x334155, 0.25, 0);
    propGb.addBox(ferrisX + 2.6, 14, ferrisZ, 1.2, 28, 8.0, 0x334155, 0.25, 0);

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
  propGb.addSmoothSphere(85, 94, 65, 9.8, 3.6, 4.2, 10, 14, 0xf59e0b);
  propGb.addBox(85, 89.6, 65, 4.2, 1.6, 2.2, 0x0f172a);
  propGb.addSmoothSphere(-95, 80, 125, 5.2, 6.4, 5.2, 10, 14, 0xe10600);
  propGb.addSmoothSphere(195, 86, -95, 5.2, 6.4, 5.2, 10, 14, 0x38bdf8);

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
      const h = 48 + (m % 5) * 24;
      const w = 22 + (m % 3) * 7;
      propGb.addBox(mx, h * 0.5 - 2, mz, w, h, w, 0x0f172a, 0.92, 0);
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
      const h = 42 + (m % 4) * 20;
      const w = 36 + (m % 3) * 14;
      propGb.addMountainPeak(
        mx,
        -4,
        mz,
        w * 1.15,
        h,
        w,
        0x7c2d12,
        0x9a3412,
        0xd97706,
        m + 11
      );
      propGb.addMountainPeak(
        mx + 18,
        -4,
        mz - 14,
        w * 0.72,
        h * 0.68,
        w * 0.7,
        0x7c2d12,
        0xb45309,
        0xf59e0b,
        m + 29
      );
    } else if (isNordic) {
      const h = 64 + (m % 5) * 24;
      const w = 34 + (m % 3) * 12;
      propGb.addMountainPeak(
        mx,
        -4,
        mz,
        w,
        h,
        w * 0.95,
        0x334155,
        0x64748b,
        0xf0f9ff,
        m + 5
      );
      propGb.addMountainPeak(
        mx - 16,
        -4,
        mz + 14,
        w * 0.68,
        h * 0.72,
        w * 0.68,
        0x1e293b,
        0x475569,
        0xe0f2fe,
        m + 19
      );
    } else {
      const h = 58 + (m % 5) * 22;
      const w = 36 + (m % 3) * 14;
      propGb.addMountainPeak(
        mx,
        -4,
        mz,
        w,
        h,
        w * 0.92,
        0x1e293b,
        0x334155,
        0xf8fafc,
        m + 3
      );
      propGb.addMountainPeak(
        mx + 16,
        -4,
        mz - 12,
        w * 0.72,
        h * 0.74,
        w * 0.72,
        0x0f172a,
        0x334155,
        0xe2e8f0,
        m + 17
      );
    }
  }

  const propMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.58,
    metalness: 0.14,
  });
  trackGroup.add(new THREE.Mesh(propGb.toBufferGeometry(), propMat));

  // 5B. 3D Illuminated Apex / Sector Telemetry Gates for Checkpoint Time Attack Mode
  const apexGatesGroup = new THREE.Group();
  apexGatesGroup.name = 'f1-apex-gates-group';
  const gateGb = new GeometryBuilder();
  const totalGates = 10;
  for (let g = 0; g < totalGates; g++) {
    const gIdx = Math.floor(((g + 0.5) / totalGates) * n) % n;
    const sg = samples[gIdx];
    const gSpan = roadHalfWidth + 1.65;
    const lx = sg.x - sg.nx * gSpan;
    const lz = sg.z - sg.nz * gSpan;
    const rx = sg.x + sg.nx * gSpan;
    const rz = sg.z + sg.nz * gSpan;
    const gateColor = g % 2 === 0 ? 0x22d3ee : 0x10b981;
    gateGb.addOrientedBox(lx, sg.y + 2.6, lz, sg.angle, 0.36, 5.2, 0.42, 0x0f172a);
    gateGb.addOrientedBox(rx, sg.y + 2.6, rz, sg.angle, 0.36, 5.2, 0.42, 0x0f172a);
    gateGb.addOrientedBox(lx, sg.y + 2.7, lz, sg.angle, 0.42, 4.4, 0.18, gateColor);
    gateGb.addOrientedBox(rx, sg.y + 2.7, rz, sg.angle, 0.42, 4.4, 0.18, gateColor);
    gateGb.addOrientedBox(sg.x, sg.y + 5.15, sg.z, sg.angle, gSpan * 2 + 0.5, 0.32, 0.44, 0x0f172a);
    gateGb.addOrientedBox(sg.x, sg.y + 5.36, sg.z, sg.angle, gSpan * 2 + 0.6, 0.14, 0.48, gateColor);
  }
  const gateMesh = new THREE.Mesh(
    gateGb.toBufferGeometry(),
    new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 90,
      emissive: new THREE.Color(0x083344),
      emissiveIntensity: 0.35,
    })
  );
  apexGatesGroup.add(gateMesh);
  trackGroup.add(apexGatesGroup);

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

  // 6. Road-Clearance-Checked Multi-Tier Instanced Trackside Forest (Lush Smooth-Normal 3-Canopy Trees, Bushes & Sculpted 3D Rocks)
  const treeCount = 240;
  const trunkGeo = isDesert
    ? new THREE.IcosahedronGeometry(1.55, 1)
    : new THREE.CylinderGeometry(0.24, 0.48, 3.0, 12);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: isDesert ? 0x9a3412 : isTokyo ? 0x1e293b : 0x451a03,
    roughness: 0.88,
    metalness: 0.05,
  });
  const crownGeo = isTokyo
    ? new THREE.BoxGeometry(2.8, 12, 2.8)
    : isDesert
    ? new THREE.CylinderGeometry(0.38, 0.48, 4.8, 12)
    : new THREE.ConeGeometry(2.9, 5.5, 16);
  const upperCrownGeo = new THREE.ConeGeometry(2.15, 4.5, 16);
  const topCrownGeo = new THREE.ConeGeometry(1.4, 3.3, 14);
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.76,
    metalness: 0.04,
  });

  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crownMesh = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const upperCrownMesh = new THREE.InstancedMesh(upperCrownGeo, crownMat, treeCount);
  const topCrownMesh = new THREE.InstancedMesh(topCrownGeo, crownMat, treeCount);

  // Trackside Shrubs / Bushes & 3D Rock Outcrops
  const bushCount = 150;
  const bushGeo = new THREE.IcosahedronGeometry(1.38, 2);
  const bushMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.02,
  });
  const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);

  const rockCount = 75;
  const rockGeo = new THREE.DodecahedronGeometry(2.2, 1);
  const rockMat = new THREE.MeshStandardMaterial({
    color: isDesert ? 0xb45309 : isNordic ? 0x94a3b8 : 0x475569,
    roughness: 0.78,
    metalness: 0.12,
  });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);

  const dummy = new THREE.Object3D();
  const baseCrownCol = new THREE.Color(trackDef.theme.foliageHex);
  const tintCol = new THREE.Color();
  let placed = 0;
  let placedBushes = 0;
  let placedRocks = 0;
  const minTreeClearanceSq =
    (barrierHalfWidth + 8.5) * (barrierHalfWidth + 8.5);

  for (let pass = 0; pass < 2 && placed < treeCount; pass++) {
    for (let i = 0; i < n && placed < treeCount; i += 2) {
      const s = samples[i];
      if (s.isBridge || s.y > 2.4) continue;
      const side = (i + pass) % 2 === 0 ? 1 : -1;
      const rEdge = side > 0
        ? getRightBarrierOffsetForSample(s, roadHalfWidth, barrierHalfWidth)
        : barrierHalfWidth;
      const dist =
        rEdge +
        (pass === 0 ? 11.0 + ((i * 13) % 20) : 32.0 + ((i * 29) % 42));
      const jitterAlong = ((i * 7 + pass * 19) % 9) - 4;
      const tx = s.x + s.nx * side * dist + s.tx * jitterAlong;
      const tz = s.z + s.nz * side * dist + s.tz * jitterAlong;

      // Avoid placing trees inside the Paddock / Main Grandstand apron
      if (Math.abs(tz) < 52 && Math.abs(tx) < roadHalfWidth + 32) continue;
      if (minDistanceSqToTrack(tx, tz, samples) < minTreeClearanceSq) {
        continue;
      }

      const sc = 0.82 + ((i + pass * 3) % 6) * 0.14;
      const baseY = s.y - 0.35;

      dummy.position.set(tx, baseY + 1.25 * sc, tz);
      dummy.rotation.set(0, (i * 0.7) % (Math.PI * 2), 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(placed, dummy.matrix);

      dummy.position.set(tx, baseY + (isTokyo ? 6.8 * sc : 3.6 * sc), tz);
      dummy.updateMatrix();
      crownMesh.setMatrixAt(placed, dummy.matrix);

      dummy.position.set(tx, baseY + (isTokyo ? 9.2 * sc : 5.9 * sc), tz);
      dummy.scale.set(
        isTokyo || isDesert ? 0.001 : sc,
        isTokyo || isDesert ? 0.001 : sc,
        isTokyo || isDesert ? 0.001 : sc
      );
      dummy.updateMatrix();
      upperCrownMesh.setMatrixAt(placed, dummy.matrix);

      dummy.position.set(tx, baseY + 7.8 * sc, tz);
      dummy.scale.set(
        isTokyo || isDesert ? 0.001 : sc * 0.92,
        isTokyo || isDesert ? 0.001 : sc * 0.92,
        isTokyo || isDesert ? 0.001 : sc * 0.92
      );
      dummy.updateMatrix();
      topCrownMesh.setMatrixAt(placed, dummy.matrix);

      tintCol
        .copy(baseCrownCol)
        .offsetHSL(((i % 5) - 2) * 0.018, 0.04, ((i % 3) - 1) * 0.045);
      crownMesh.setColorAt(placed, tintCol);
      upperCrownMesh.setColorAt(placed, tintCol.clone().offsetHSL(0, 0, 0.04));
      topCrownMesh.setColorAt(placed, tintCol.clone().offsetHSL(0, 0, 0.08));
      placed++;

      // Place natural undergrowth bush cluster near the tree
      if (!isTokyo && placedBushes < bushCount && i % 3 === 0) {
        const bx = tx + Math.cos(i) * 2.6;
        const bz = tz + Math.sin(i) * 2.6;
        dummy.position.set(bx, baseY + 0.55, bz);
        dummy.scale.set(1.25, 0.72, 1.15);
        dummy.updateMatrix();
        bushMesh.setMatrixAt(placedBushes, dummy.matrix);
        bushMesh.setColorAt(placedBushes, tintCol.clone().offsetHSL(0.01, 0.05, -0.03));
        placedBushes++;
      }

      // Place sculpted 3D rock boulders along embankments
      if (placedRocks < rockCount && i % 5 === 0) {
        const rx = tx - s.nx * side * 2.2;
        const rz = tz - s.nz * side * 2.2;
        dummy.position.set(rx, baseY + 0.65, rz);
        dummy.rotation.set((i * 0.4) % 1.2, (i * 1.1) % 3.1, 0);
        dummy.scale.set(1.1 + (i % 3) * 0.35, 0.75 + (i % 2) * 0.25, 0.95 + (i % 4) * 0.25);
        dummy.updateMatrix();
        rockMesh.setMatrixAt(placedRocks, dummy.matrix);
        placedRocks++;
      }
    }
  }

  trunkMesh.count = placed;
  crownMesh.count = placed;
  upperCrownMesh.count = placed;
  topCrownMesh.count = placed;
  bushMesh.count = placedBushes;
  rockMesh.count = placedRocks;
  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  upperCrownMesh.instanceMatrix.needsUpdate = true;
  topCrownMesh.instanceMatrix.needsUpdate = true;
  bushMesh.instanceMatrix.needsUpdate = true;
  rockMesh.instanceMatrix.needsUpdate = true;
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
  if (upperCrownMesh.instanceColor) upperCrownMesh.instanceColor.needsUpdate = true;
  if (topCrownMesh.instanceColor) topCrownMesh.instanceColor.needsUpdate = true;
  if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
  trunkMesh.computeBoundingSphere();
  crownMesh.computeBoundingSphere();
  upperCrownMesh.computeBoundingSphere();
  topCrownMesh.computeBoundingSphere();
  bushMesh.computeBoundingSphere();
  rockMesh.computeBoundingSphere();
  trackGroup.add(trunkMesh, crownMesh, upperCrownMesh, topCrownMesh, bushMesh, rockMesh);

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
