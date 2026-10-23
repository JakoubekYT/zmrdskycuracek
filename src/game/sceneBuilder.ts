import * as THREE from 'three';
import { CarSpec, TimeOfDay, WeatherType } from './physics';
import {
  getTrackSamples,
  TRACK_KERB_WIDTH,
  TrackDefinition,
} from './track';

export interface CarRig {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
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

let sharedStudioEnvMap: THREE.CanvasTexture | null = null;
let sharedShadowTex: THREE.CanvasTexture | null = null;
let sharedCheckeredTex: THREE.CanvasTexture | null = null;
let sharedHeadlightBeamTex: THREE.CanvasTexture | null = null;
const cachedBodyGeometries = new Map<string, THREE.BufferGeometry>();
const cachedWheelGeometries = new Map<
  number,
  {
    frontLeftWheel: THREE.BufferGeometry;
    frontRightWheel: THREE.BufferGeometry;
    rearAxle: THREE.BufferGeometry;
  }
>();
let cachedCockpitGeos: {
  interiorShell: THREE.BufferGeometry;
  steeringWheelAndHands: THREE.BufferGeometry;
} | null = null;
let sharedStaticGeos: {
  shadowPlane: THREE.PlaneGeometry;
  tailBar: THREE.BufferGeometry;
  flame: THREE.ConeGeometry;
  headlightBeam: THREE.PlaneGeometry;
} | null = null;

export function getStudioEnvMap(): THREE.CanvasTexture {
  if (sharedStudioEnvMap) return sharedStudioEnvMap;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0.0, '#1d4ed8');
  grad.addColorStop(0.32, '#93c5fd');
  grad.addColorStop(0.47, '#fff7ed');
  grad.addColorStop(0.52, '#0f172a');
  grad.addColorStop(0.8, '#1e293b');
  grad.addColorStop(1.0, '#090d16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 64);

  ctx.fillStyle = 'rgba(255, 250, 235, 0.92)';
  ctx.fillRect(10, 14, 44, 5);
  ctx.fillRect(74, 14, 44, 5);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedStudioEnvMap = tex;
  return tex;
}

function createRoadTexture(def: TrackDefinition): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = def.theme.asphaltHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle asphalt grain & dark racing groove
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(38, 0, 180, 256);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let i = 0; i < 120; i++) {
    const gx = (i * 53) % 256;
    const gy = (i * 97) % 256;
    ctx.fillRect(gx, gy, 2, 6);
  }

  // Crisp edge lines
  ctx.fillStyle = def.theme.edgeLineHex;
  ctx.fillRect(8, 0, 6, 256);
  ctx.fillRect(242, 0, 6, 256);

  // Center dashed line
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillRect(125, 16, 6, 88);
  ctx.fillRect(125, 144, 6, 88);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createKerbTexture(def: TrackDefinition): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = def.theme.kerbColorA;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = def.theme.kerbColorB;
  ctx.fillRect(0, 64, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createCheckeredTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const size = 8;
  for (let y = 0; y < 32; y += size) {
    for (let x = 0; x < 128; x += size) {
      const even = (x / size + y / size) % 2 === 0;
      ctx.fillStyle = even ? '#f8fafc' : '#0f172a';
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 6, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function createHeadlightBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(224, 242, 254, 0.55)');
  grad.addColorStop(0.5, 'rgba(186, 230, 253, 0.22)');
  grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(22, 128);
  ctx.lineTo(42, 128);
  ctx.lineTo(62, 0);
  ctx.lineTo(2, 0);
  ctx.closePath();
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

export function createNameplateSprite(
  name: string,
  colorHex: number
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(9, 13, 20, 0.86)';
  ctx.beginPath();
  ctx.roundRect(12, 8, 232, 48, 12);
  ctx.fill();

  ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 3.5;
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
  sprite.position.set(0, 1.9, 0);
  return sprite;
}

class GeometryBuilder {
  public positions: number[] = [];
  public normals: number[] = [];
  public colors: number[] = [];
  private _c = new THREE.Color();
  private _vA = new THREE.Vector3();
  private _vB = new THREE.Vector3();
  private _vC = new THREE.Vector3();
  private _cb = new THREE.Vector3();
  private _ab = new THREE.Vector3();

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
    colorHex: number
  ): void {
    this._vA.set(ax, ay, az);
    this._vB.set(bx, by, bz);
    this._vC.set(cx, cy, cz);
    this._cb.subVectors(this._vC, this._vB);
    this._ab.subVectors(this._vA, this._vB);
    this._cb.cross(this._ab).normalize();

    const nx = this._cb.x;
    const ny = this._cb.y;
    const nz = this._cb.z;

    this._c.setHex(colorHex);
    const r = this._c.r;
    const g = this._c.g;
    const b = this._c.b;

    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.colors.push(r, g, b, r, g, b, r, g, b);
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
    colorHex: number
  ): void {
    this.addTri(ax, ay, az, bx, by, bz, cx, cy, cz, colorHex);
    this.addTri(ax, ay, az, cx, cy, cz, dx, dy, dz, colorHex);
  }

  public addSection(
    z0: number,
    w0Bottom: number,
    w0Top: number,
    y0Bottom: number,
    y0Top: number,
    z1: number,
    w1Bottom: number,
    w1Top: number,
    y1Bottom: number,
    y1Top: number,
    colors: {
      top: number;
      sides: number;
      bottom?: number;
      front?: number;
      back?: number;
    }
  ): void {
    const xb0 = w0Bottom * 0.5;
    const xt0 = w0Top * 0.5;
    const xb1 = w1Bottom * 0.5;
    const xt1 = w1Top * 0.5;

    // Top (+Y)
    this.addQuad(
      -xt0, y0Top, z0,
      -xt1, y1Top, z1,
      xt1, y1Top, z1,
      xt0, y0Top, z0,
      colors.top
    );
    // Bottom (-Y)
    this.addQuad(
      -xb1, y1Bottom, z1,
      -xb0, y0Bottom, z0,
      xb0, y0Bottom, z0,
      xb1, y1Bottom, z1,
      colors.bottom ?? colors.sides
    );
    // Right (+X)
    this.addQuad(
      xb0, y0Bottom, z0,
      xt0, y0Top, z0,
      xt1, y1Top, z1,
      xb1, y1Bottom, z1,
      colors.sides
    );
    // Left (-X)
    this.addQuad(
      -xb1, y1Bottom, z1,
      -xt1, y1Top, z1,
      -xt0, y0Top, z0,
      -xb0, y0Bottom, z0,
      colors.sides
    );
    // Front (+Z)
    if (colors.front !== undefined) {
      this.addQuad(
        -xb1, y1Bottom, z1,
        xb1, y1Bottom, z1,
        xt1, y1Top, z1,
        -xt1, y1Top, z1,
        colors.front
      );
    }
    // Back (-Z)
    if (colors.back !== undefined) {
      this.addQuad(
        xb0, y0Bottom, z0,
        -xb0, y0Bottom, z0,
        -xt0, y0Top, z0,
        xt0, y0Top, z0,
        colors.back
      );
    }
  }

  public addBox(
    cx: number,
    cy: number,
    cz: number,
    wx: number,
    hy: number,
    lz: number,
    colorHex: number,
    topTapering = 1.0,
    frontSlopeY = 0
  ): void {
    const x0 = cx - wx * 0.5;
    const x1 = cx + wx * 0.5;
    const tx0 = cx - wx * 0.5 * topTapering;
    const tx1 = cx + wx * 0.5 * topTapering;
    const y0 = cy - hy * 0.5;
    const y1 = cy + hy * 0.5;
    const z0 = cz - lz * 0.5;
    const z1 = cz + lz * 0.5;

    this.addQuad(
      tx0, y1, z0,
      tx0, y1 + frontSlopeY, z1,
      tx1, y1 + frontSlopeY, z1,
      tx1, y1, z0,
      colorHex
    );
    this.addQuad(x0, y0, z1, x0, y0, z0, x1, y0, z0, x1, y0, z1, colorHex);
    this.addQuad(
      x0, y0, z1,
      x1, y0, z1,
      tx1, y1 + frontSlopeY, z1,
      tx0, y1 + frontSlopeY, z1,
      colorHex
    );
    this.addQuad(x1, y0, z0, x0, y0, z0, tx0, y1, z0, tx1, y1, z0, colorHex);
    this.addQuad(
      x1, y0, z0,
      tx1, y1, z0,
      tx1, y1 + frontSlopeY, z1,
      x1, y0, z1,
      colorHex
    );
    this.addQuad(
      x0, y0, z1,
      tx0, y1 + frontSlopeY, z1,
      tx0, y1, z0,
      x0, y0, z0,
      colorHex
    );
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
    geo.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(this.colors, 3)
    );
    return geo;
  }
}

/**
 * Builds complex, high-detail sports car body geometry:
 * - Sculpted multi-contour hood with central power-dome, recessed NACA vents, and front aero splitter
 * - Framed cockpit windows (windshield, side windows, rear window) with painted A/B/C pillars
 * - Flared front & rear wheel arches with brake cooling ducts and side skirts
 * - Multi-element spoilers with swan-neck pylons, endplates, rear diffuser strakes, and quad/twin exhausts
 */
function buildSculptedCarBodyGeometry(spec: CarSpec): THREE.BufferGeometry {
  const existing = cachedBodyGeometries.get(spec.id);
  if (existing) return existing;

  const gb = new GeometryBuilder();

  const paint = spec.colorHex;
  const accent = spec.accentHex;
  const carbon = 0x151922;
  const glass = 0x091326;
  const windowFrame = 0x111827;
  const darkRecess = 0x090c12;
  const headlightHex = 0xe0f2fe;
  const drlAmber = 0x38bdf8;
  const exhaustChrome = 0xe2e8f0;

  const isHyper = spec.id === 'phantom-v10';
  const isMuscle = spec.id === 'muscle-v8';
  const isRally = spec.id === 'rallye-evo';
  const isDrift = spec.id === 'valkyrie-drift';
  const isTurbo = spec.id === 'blesk-rs';

  const wScale = isHyper ? 1.05 : isDrift ? 1.04 : isRally ? 0.96 : 1.0;

  // 1. Carbon Underbody Floor, Front Splitter Lip, Side Skirts & Rear Diffuser
  gb.addSection(
    -2.18, 1.74 * wScale, 1.82 * wScale, 0.25, 0.35,
    -1.72, 1.86 * wScale, 1.90 * wScale, 0.14, 0.24,
    { top: carbon, sides: carbon, bottom: carbon, back: darkRecess }
  );
  gb.addSection(
    -0.84, 1.88 * wScale, 1.96 * wScale, 0.13, 0.22,
    0.84, 1.88 * wScale, 1.96 * wScale, 0.13, 0.21,
    { top: carbon, sides: carbon, bottom: carbon }
  );
  gb.addSection(
    1.72, 1.86 * wScale, 1.92 * wScale, 0.13, 0.21,
    2.32, 1.76 * wScale, 1.84 * wScale, 0.12, 0.18,
    { top: carbon, sides: carbon, bottom: carbon, front: carbon }
  );

  // 2. Main Sculpted Lower Body Fuselage
  gb.addSection(
    -2.14, 1.80 * wScale, 1.66 * wScale, 0.32, 0.69,
    -1.70, 1.90 * wScale, 1.78 * wScale, 0.24, 0.73,
    { top: paint, sides: paint, back: darkRecess }
  );
  gb.addSection(
    -1.70, 1.48 * wScale, 1.86 * wScale, 0.24, 0.73,
    -0.84, 1.48 * wScale, 1.82 * wScale, 0.24, 0.71,
    { top: paint, sides: darkRecess }
  );
  gb.addSection(
    -0.84, 1.86 * wScale, 1.74 * wScale, 0.21, 0.71,
    0.84, 1.86 * wScale, 1.74 * wScale, 0.21, 0.67,
    { top: paint, sides: paint }
  );
  gb.addSection(
    0.84, 1.46 * wScale, 1.80 * wScale, 0.21, 0.67,
    1.72, 1.46 * wScale, 1.70 * wScale, 0.19, 0.54,
    { top: paint, sides: darkRecess }
  );
  const noseFrontY = isMuscle ? 0.42 : isHyper ? 0.28 : 0.32;
  gb.addSection(
    1.72, 1.84 * wScale, 1.70 * wScale, 0.19, 0.54,
    2.24, 1.64 * wScale, 1.46 * wScale, 0.17, noseFrontY,
    { top: paint, sides: paint, front: darkRecess }
  );

  // 3. Detailed Sculpted Hood (Power-Dome Bulge + Dual Recessed NACA Air Vents + Livery Stripe)
  gb.addSection(
    0.84, 0.86 * wScale, 0.68 * wScale, 0.66, 0.70,
    1.96, 0.64 * wScale, 0.48 * wScale, 0.44, noseFrontY + 0.08,
    { top: paint, sides: paint, front: paint }
  );
  // Central Racing Livery Stripe along Power Dome
  gb.addSection(
    0.86, 0.28, 0.28, 0.69, 0.706,
    2.14, 0.20, 0.20, 0.32, noseFrontY + 0.035,
    { top: accent, sides: accent }
  );
  // Dual Recessed Carbon Hood Louvers / NACA Vents
  for (const side of [-1, 1]) {
    gb.addBox(
      side * 0.46 * wScale,
      0.61,
      1.36,
      0.22,
      0.04,
      0.42,
      darkRecess,
      0.85,
      -0.05
    );
    gb.addBox(
      side * 0.46 * wScale,
      0.625,
      1.48,
      0.20,
      0.02,
      0.08,
      carbon,
      0.9,
      -0.01
    );
  }

  // 4. Sculpted Over-Fender Arches, Side Intakes & Rocker Blades
  for (const side of [-1, 1]) {
    // Rear Fender Flare Arch + Upper Vent
    gb.addBox(
      side * (0.92 * wScale),
      0.66,
      -1.28,
      0.18 * wScale,
      0.15,
      0.94,
      paint,
      0.72,
      -0.01
    );
    gb.addBox(
      side * (0.88 * wScale),
      0.735,
      -1.15,
      0.10,
      0.02,
      0.28,
      carbon
    );
    // Front Fender Flare Arch
    gb.addBox(
      side * (0.90 * wScale),
      0.60,
      1.30,
      0.17 * wScale,
      0.14,
      0.90,
      paint,
      0.72,
      -0.06
    );
    // Sculpted Sidepod Air Intake Scoop behind Doors
    gb.addBox(
      side * (0.93 * wScale),
      0.47,
      -0.52,
      0.08,
      0.26,
      0.52,
      carbon,
      0.82,
      0
    );
    gb.addBox(
      side * (0.95 * wScale),
      0.47,
      -0.30,
      0.03,
      0.24,
      0.06,
      accent
    );
    // Rocker Accent Livery Trim
    gb.addBox(
      side * (0.95 * wScale),
      0.24,
      0.0,
      0.05,
      0.05,
      1.66,
      accent
    );
  }

  // 5. Detailed Cabin & Delineated Windows with Painted A-Pillars, B-Pillars, C-Pillars & Roof Rails
  const roofY = isHyper ? 0.96 : isRally ? 1.08 : 1.01;
  // Inner Dark Glass Greenhouse Core
  gb.addSection(
    0.22, 1.44 * wScale, 1.18 * wScale, 0.66, roofY - 0.01,
    0.84, 1.52 * wScale, 1.36 * wScale, 0.65, 0.67,
    { top: glass, sides: glass }
  );
  gb.addSection(
    -0.54, 1.42 * wScale, 1.14 * wScale, 0.69, roofY - 0.02,
    0.22, 1.44 * wScale, 1.18 * wScale, 0.66, roofY - 0.01,
    { top: glass, sides: glass }
  );
  gb.addSection(
    -1.60, 1.30 * wScale, 0.98 * wScale, 0.70, 0.73,
    -0.54, 1.42 * wScale, 1.14 * wScale, 0.69, roofY - 0.02,
    { top: windowFrame, sides: glass }
  );

  // Painted Roof Panel & Central Livery Stripe over Cabin
  gb.addSection(
    -0.52, 1.16 * wScale, 1.08 * wScale, roofY - 0.03, roofY + 0.015,
    0.20, 1.20 * wScale, 1.12 * wScale, roofY - 0.02, roofY + 0.02,
    { top: paint, sides: paint, front: windowFrame, back: windowFrame }
  );
  gb.addBox(0, roofY + 0.022, -0.16, 0.24, 0.015, 0.68, accent);

  // Framed A-Pillars, B-Pillars & Fastback C-Pillar Buttresses
  for (const side of [-1, 1]) {
    // Raked A-Pillar framing the front windshield
    gb.addBox(
      side * (0.64 * wScale),
      0.83,
      0.52,
      0.065,
      0.06,
      0.68,
      paint,
      0.9,
      -0.31
    );
    // Vertical B-Pillar separating front door window & rear quarter window
    gb.addBox(
      side * (0.66 * wScale),
      0.84,
      -0.16,
      0.04,
      0.28,
      0.07,
      windowFrame
    );
    // Sculpted Flying Buttress C-Pillar along the fastback rear window
    gb.addBox(
      side * (0.58 * wScale),
      0.85,
      -1.06,
      0.11,
      0.08,
      1.04,
      paint,
      0.85,
      0.24
    );
    // Rear Engine Cover Louver Slats
    for (let l = 0; l < 3; l++) {
      gb.addBox(
        0,
        0.84 - l * 0.04,
        -0.78 - l * 0.24,
        0.76 * wScale,
        0.025,
        0.12,
        carbon
      );
    }
  }

  // 6. Projector Quad LED Headlights, DRL Lightblades & Front Splitter Struts
  for (const side of [-1, 1]) {
    // Outer headlight housing
    gb.addBox(
      side * (0.63 * wScale),
      noseFrontY + 0.085,
      2.02,
      0.36,
      0.075,
      0.34,
      darkRecess,
      0.85,
      -0.06
    );
    // Dual glowing LED projector lenses
    gb.addBox(
      side * (0.66 * wScale),
      noseFrontY + 0.095,
      2.04,
      0.28,
      0.055,
      0.26,
      headlightHex,
      0.85,
      -0.05
    );
    // DRL Cyan/Amber Lightblade
    gb.addBox(
      side * (0.64 * wScale),
      noseFrontY + 0.05,
      2.16,
      0.32,
      0.025,
      0.08,
      drlAmber
    );
    // Front Splitter Support Tie-Rods
    gb.addBox(side * 0.36, 0.19, 2.26, 0.02, 0.10, 0.02, exhaustChrome);
  }
  gb.addBox(0, 0.25, 2.23, 0.94 * wScale, 0.13, 0.06, darkRecess);

  // 7. Rear Diffuser Aero Strakes & Exhaust System
  for (const fx of [-0.58, -0.28, 0, 0.28, 0.58]) {
    gb.addBox(fx * wScale, 0.24, -2.14, 0.03, 0.16, 0.24, carbon);
  }
  const exOffset = isHyper ? 0.24 : 0.46;
  const exY = isHyper ? 0.38 : 0.26;
  for (const side of [-1, 1]) {
    gb.addBox(side * exOffset, exY, -2.18, 0.14, 0.11, 0.18, exhaustChrome);
    gb.addBox(side * exOffset, exY, -2.275, 0.10, 0.08, 0.02, darkRecess);
  }

  // 8. Sculpted Aero Door Mirrors on Stalks
  for (const side of [-1, 1]) {
    gb.addBox(side * (0.78 * wScale), 0.72, 0.50, 0.12, 0.03, 0.05, carbon);
    gb.addBox(
      side * (0.87 * wScale),
      0.75,
      0.48,
      0.18,
      0.07,
      0.15,
      paint,
      0.8,
      -0.02
    );
  }

  // 9. Complex Multi-Element Spoilers & Car-Specific Aero Packages
  if (isHyper) {
    // LMP Shark-Fin + Dual-Element Hypercar Wing + Diffuser Gurney Flap
    gb.addBox(0, 0.95, -1.28, 0.04, 0.28, 1.18, carbon, 0.6, 0.04);
    gb.addBox(0, 0.99, -1.98, 2.04, 0.045, 0.32, carbon, 0.96, -0.04);
    gb.addBox(0, 1.03, -2.08, 1.96, 0.035, 0.14, accent, 0.96, -0.05);
    for (const side of [-1, 1]) {
      gb.addBox(side * 1.01, 0.91, -1.96, 0.04, 0.32, 0.48, accent, 0.85, -0.04);
    }
  } else if (isMuscle) {
    // V8 Supercharger Blower + Dual-Flap Ducktail Spoiler
    gb.addBox(0, 0.70, 1.25, 0.52, 0.15, 0.74, carbon, 0.85, -0.02);
    gb.addBox(0, 0.74, 1.60, 0.44, 0.09, 0.10, accent);
    gb.addBox(0, 0.79, -2.04, 1.78, 0.14, 0.22, paint, 0.9, 0.06);
    gb.addBox(0, 0.86, -2.10, 1.74, 0.06, 0.10, carbon);
  } else if (isRally) {
    // WRC Roof Scoop + Bi-Plane Rally Box Wing + Quad Rally Light Pod
    gb.addBox(0, 1.12, 0.10, 0.36, 0.09, 0.44, accent, 0.8, -0.02);
    gb.addBox(0, 1.08, -1.88, 1.80, 0.045, 0.36, paint, 0.95, -0.04);
    gb.addBox(0, 0.93, -1.90, 1.76, 0.04, 0.28, carbon);
    for (const side of [-1, 1]) {
      gb.addBox(side * 0.89, 0.98, -1.88, 0.04, 0.30, 0.44, accent);
      gb.addBox(side * 0.38, 0.85, -1.88, 0.04, 0.22, 0.20, carbon);
    }
    gb.addBox(0, 0.41, 2.20, 0.72, 0.08, 0.10, headlightHex);
  } else if (isTurbo) {
    // Sculpted Ducktail Base + Upper Carbon GT Wing
    gb.addBox(0, 0.78, -1.92, 1.66, 0.13, 0.36, paint, 0.88, 0.04);
    gb.addBox(0, 0.99, -1.96, 1.92, 0.045, 0.30, carbon, 0.95, -0.04);
    gb.addBox(0, 1.03, -2.06, 1.86, 0.03, 0.12, accent);
    for (const side of [-1, 1]) {
      gb.addBox(side * 0.56, 0.88, -1.92, 0.05, 0.22, 0.22, carbon);
      gb.addBox(side * 0.95, 0.99, -1.96, 0.04, 0.24, 0.40, accent);
    }
  } else {
    // Swan-Neck Dual-Element GT3 / Time-Attack Wing + Front Dive Canards
    const wingY = isDrift ? 1.07 : 1.01;
    const wingW = isDrift ? 2.04 : 1.94;
    gb.addBox(0, wingY, -1.94, wingW, 0.045, 0.32, carbon, 0.96, -0.04);
    gb.addBox(0, wingY + 0.04, -2.04, wingW * 0.96, 0.03, 0.12, accent, 0.96, -0.05);
    for (const side of [-1, 1]) {
      // Swan-neck top-mounted pylons
      gb.addBox(side * 0.46, wingY - 0.15, -1.86, 0.045, 0.32, 0.22, carbon, 0.75, -0.04);
      gb.addBox(side * 0.46, wingY + 0.03, -1.88, 0.045, 0.05, 0.18, exhaustChrome);
      // Contoured Wing Endplates
      gb.addBox(side * (wingW * 0.5), wingY - 0.01, -1.94, 0.04, 0.28, 0.46, accent, 0.85, -0.03);
      // Dual Front Aero Dive Canards
      gb.addBox(
        side * (0.92 * wScale),
        0.29,
        1.98,
        0.15,
        0.025,
        0.26,
        carbon,
        0.8,
        -0.04
      );
      gb.addBox(
        side * (0.90 * wScale),
        0.35,
        1.88,
        0.13,
        0.025,
        0.22,
        carbon,
        0.8,
        -0.04
      );
    }
  }

  const geo = gb.toBufferGeometry();
  cachedBodyGeometries.set(spec.id, geo);
  return geo;
}

/**
 * Builds the 3D Cockpit Interior (Dashboard, Digital Cluster, A-Pillars, Rearview Mirror)
 * AND the rotating 3D Steering Wheel with Driver Hands & Forearms gripping the wheel!
 */
function getCockpitGeometries(): {
  interiorShell: THREE.BufferGeometry;
  steeringWheelAndHands: THREE.BufferGeometry;
} {
  if (cachedCockpitGeos) return cachedCockpitGeos;

  // 1. Static Cockpit Dashboard, Instrument Cluster, Pillars & Mirror
  const shellGb = new GeometryBuilder();
  const dashDark = 0x0f141d;
  const alcantara = 0x18202c;
  const carbon = 0x11151f;
  const screenGlow = 0x0ea5e9;
  const revGreen = 0x22c55e;
  const revRed = 0xef4444;
  const pillarColor = 0x1e293b;

  // Main dashboard cowl across the base of the windshield
  shellGb.addSection(
    0.38, 1.42, 1.32, 0.58, 0.76,
    0.92, 1.48, 1.38, 0.58, 0.72,
    { top: alcantara, sides: dashDark, back: dashDark }
  );
  // Instrument Binnacle Hood in front of driver (centered at x = 0)
  shellGb.addBox(0, 0.79, 0.56, 0.46, 0.14, 0.24, carbon, 0.82, -0.03);
  // Glowing Digital Telemetry Dash Screen
  shellGb.addBox(0, 0.78, 0.45, 0.36, 0.10, 0.02, screenGlow);
  // RPM Shift Lights along top of dash binnacle
  shellGb.addBox(-0.10, 0.845, 0.45, 0.10, 0.018, 0.02, revGreen);
  shellGb.addBox(0.0, 0.845, 0.45, 0.08, 0.018, 0.02, 0xf59e0b);
  shellGb.addBox(0.10, 0.845, 0.45, 0.10, 0.018, 0.02, revRed);
  // Steering Column Shaft
  shellGb.addBox(0, 0.74, 0.40, 0.09, 0.09, 0.24, carbon);

  // Left & Right Interior A-Pillars + Rollcage Bars + Rearview Mirror
  for (const side of [-1, 1]) {
    shellGb.addBox(
      side * 0.64,
      0.86,
      0.54,
      0.06,
      0.34,
      0.42,
      pillarColor,
      0.85,
      -0.18
    );
  }
  // Top Sun-Visor Header & Central Rearview Mirror
  shellGb.addBox(0, 1.03, 0.40, 1.24, 0.05, 0.14, dashDark);
  shellGb.addBox(0, 0.96, 0.44, 0.26, 0.065, 0.03, 0x334155);

  // 2. Dynamic Steering Wheel + Driver Hands & Forearms (rotates around its local Z axis!)
  const wheelGb = new GeometryBuilder();
  const rimCarbon = 0x141821;
  const gripSuede = 0x262f3f;
  const hubMetal = 0x94a3b8;
  const stripeRed = 0xef4444;
  const gloveMain = 0xdc2626; // Red/Black racing gloves
  const glovePalm = 0x1e293b;
  const suitSleeve = 0x0f172a;
  const cuffAccent = 0xf59e0b;

  // 12-segment sculpted GT steering wheel rim (radius ~0.165m)
  const segs = 12;
  const radius = 0.165;
  const tube = 0.022;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const midA = (a0 + a1) * 0.5;
    const cx = Math.cos(midA) * radius;
    // Slight flat-bottom GT shape
    const rawY = Math.sin(midA) * radius;
    const cy = rawY < -0.11 ? -0.125 : rawY;
    const segColor =
      Math.sin(midA) > 0.85
        ? stripeRed
        : Math.abs(Math.cos(midA)) > 0.75
        ? gripSuede
        : rimCarbon;
    wheelGb.addBox(cx, cy, 0, tube * 2.1, tube * 2.1, tube * 1.8, segColor);
  }

  // Center Hub, 3 Alloy Spokes, Shift Paddles & Rotary Buttons
  wheelGb.addBox(0, 0, 0, 0.11, 0.10, 0.04, rimCarbon);
  wheelGb.addBox(0, 0, 0.005, 0.30, 0.036, 0.025, hubMetal);
  wheelGb.addBox(0, -0.07, 0.005, 0.04, 0.12, 0.025, hubMetal);
  // Shift Paddles behind the wheel
  wheelGb.addBox(-0.11, 0.02, 0.03, 0.04, 0.09, 0.012, hubMetal);
  wheelGb.addBox(0.11, 0.02, 0.03, 0.04, 0.09, 0.012, hubMetal);
  // Rotary traction/brake dials on hub
  wheelGb.addBox(-0.03, 0.015, -0.022, 0.022, 0.022, 0.015, 0x38bdf8);
  wheelGb.addBox(0.03, 0.015, -0.022, 0.022, 0.022, 0.015, 0xf59e0b);

  // Driver Hands (Racing Gloves gripping 9-o'clock and 3-o'clock) + Forearms
  for (const side of [-1, 1]) {
    const hx = side * radius;
    // Gloved fist wrapped around the steering wheel grip
    wheelGb.addBox(hx, 0.0, -0.005, 0.068, 0.088, 0.065, gloveMain, 0.9, 0);
    // Thumb resting on the upper spoke
    wheelGb.addBox(
      hx - side * 0.032,
      0.035,
      -0.015,
      0.042,
      0.032,
      0.042,
      glovePalm
    );
    // Racing glove wrist cuff
    wheelGb.addBox(
      hx + side * 0.015,
      -0.035,
      -0.075,
      0.065,
      0.065,
      0.08,
      cuffAccent,
      0.9,
      0
    );
    // Driver Forearm extending back toward driver's shoulders
    wheelGb.addBox(
      hx + side * 0.055,
      -0.11,
      -0.24,
      0.085,
      0.085,
      0.28,
      suitSleeve,
      0.85,
      0.08
    );
  }

  cachedCockpitGeos = {
    interiorShell: shellGb.toBufferGeometry(),
    steeringWheelAndHands: wheelGb.toBufferGeometry(),
  };
  return cachedCockpitGeos;
}

function buildWheelGeometries(accentHex: number): {
  frontLeftWheel: THREE.BufferGeometry;
  frontRightWheel: THREE.BufferGeometry;
  rearAxle: THREE.BufferGeometry;
} {
  const cached = cachedWheelGeometries.get(accentHex);
  if (cached) return cached;

  function appendWheelAt(
    gb: GeometryBuilder,
    offsetX: number,
    radius: number,
    width: number,
    outwardSign: 1 | -1
  ) {
    const segs = 16;
    const tireDark = 0x11151c;
    const tireShoulder = 0x1e2532;
    const rimSilver = 0xe2e8f0;
    const rotorSteel = 0x64748b;

    const halfW = width * 0.5;
    const bevelW = halfW * 0.74;
    const rimR = radius * 0.65;
    const shoulderR = radius * 0.93;

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
        xMax, y1 * rimR, z1 * rimR,
        xMax, y0 * rimR, z0 * rimR,
        tireDark
      );
      gb.addTri(
        xMax, 0, 0,
        xMax, y0 * rimR, z0 * rimR,
        xMax, y1 * rimR, z1 * rimR,
        outwardSign > 0 ? rotorSteel : tireDark
      );

      gb.addQuad(
        xMin, y0 * shoulderR, z0 * shoulderR,
        xMin, y1 * shoulderR, z1 * shoulderR,
        xMinBevel, y1 * radius, z1 * radius,
        xMinBevel, y0 * radius, z0 * radius,
        tireShoulder
      );
      gb.addQuad(
        xMin, y0 * rimR, z0 * rimR,
        xMin, y1 * rimR, z1 * rimR,
        xMin, y1 * shoulderR, z1 * shoulderR,
        xMin, y0 * shoulderR, z0 * shoulderR,
        tireDark
      );
      gb.addTri(
        xMin, 0, 0,
        xMin, y1 * rimR, z1 * rimR,
        xMin, y0 * rimR, z0 * rimR,
        outwardSign < 0 ? rotorSteel : tireDark
      );
    }

    // 5-Star Alloy Rim Spokes + Brake Caliper + Accent Center Lock
    gb.addBox(
      offsetX + outwardSign * halfW,
      0,
      0,
      0.04,
      rimR * 1.68,
      0.07,
      rimSilver
    );
    gb.addBox(
      offsetX + outwardSign * halfW,
      0,
      0,
      0.04,
      0.07,
      rimR * 1.68,
      rimSilver
    );
    gb.addBox(
      offsetX + outwardSign * (halfW + 0.015),
      0,
      0,
      0.04,
      0.12,
      0.12,
      accentHex
    );
  }

  const flGb = new GeometryBuilder();
  appendWheelAt(flGb, 0, 0.35, 0.29, 1);

  const frGb = new GeometryBuilder();
  appendWheelAt(frGb, 0, 0.35, 0.29, -1);

  const rearGb = new GeometryBuilder();
  appendWheelAt(rearGb, 0.95, 0.37, 0.34, 1);
  appendWheelAt(rearGb, -0.95, 0.37, 0.34, -1);

  const built = {
    frontLeftWheel: flGb.toBufferGeometry(),
    frontRightWheel: frGb.toBufferGeometry(),
    rearAxle: rearGb.toBufferGeometry(),
  };
  cachedWheelGeometries.set(accentHex, built);
  return built;
}

function getStaticHelperGeos() {
  if (sharedStaticGeos) return sharedStaticGeos;
  const flame = new THREE.ConeGeometry(0.11, 0.75, 6);
  flame.rotateX(-Math.PI / 2);

  const headlightBeam = new THREE.PlaneGeometry(3.8, 16.0);
  headlightBeam.rotateX(-Math.PI / 2);

  sharedStaticGeos = {
    shadowPlane: new THREE.PlaneGeometry(3.2, 5.4),
    tailBar: new THREE.BoxGeometry(1.66, 0.10, 0.06),
    flame,
    headlightBeam,
  };
  return sharedStaticGeos;
}

/**
 * Custom Automotive Fresnel Clearcoat Shader injection.
 * Adds view-dependent rim reflections and metallic flake depth to car paint!
 */
function createAutomotiveShaderMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.24,
    metalness: 0.22,
    envMap: getStudioEnvMap(),
    envMapIntensity: 0.55,
  });

  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      // Automotive Fresnel Clearcoat Rim Highlight
      vec3 viewDir = normalize(vViewPosition);
      float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 3.0);
      gl_FragColor.rgb += vec3(0.18, 0.22, 0.30) * fresnel * 0.55;
      #include <dithering_fragment>
      `
    );
  };
  return mat;
}

export function createRaceCarMesh(
  spec: CarSpec,
  labelText?: string
): CarRig {
  const staticGeos = getStaticHelperGeos();
  const bodyGeo = buildSculptedCarBodyGeometry(spec);
  const wheelGeos = buildWheelGeometries(spec.accentHex);
  const cockpitGeos = getCockpitGeometries();

  const root = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

  if (!sharedShadowTex) sharedShadowTex = createContactShadowTexture();
  const shadowPlane = new THREE.Mesh(
    staticGeos.shadowPlane,
    new THREE.MeshBasicMaterial({
      map: sharedShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.74,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  // 1. Sculpted Sports Car Body with Custom Fresnel Clearcoat Shader
  const bodyMat = createAutomotiveShaderMaterial();
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyTiltGroup.add(bodyMesh);

  // 2. 3D Cockpit Interior Group + Rotating Steering Wheel with Driver Hands
  const cockpitGroup = new THREE.Group();
  cockpitGroup.visible = false; // Toggled on when player enters Cockpit camera
  const cockpitMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const interiorShellMesh = new THREE.Mesh(
    cockpitGeos.interiorShell,
    cockpitMat
  );
  cockpitGroup.add(interiorShellMesh);

  const steeringWheelRig = new THREE.Group();
  // Positioned right in front of the driver's chest inside the cabin
  steeringWheelRig.position.set(0, 0.77, 0.36);
  steeringWheelRig.rotation.x = -0.22; // Ergonomic racing wheel tilt
  const wheelAndHandsMesh = new THREE.Mesh(
    cockpitGeos.steeringWheelAndHands,
    cockpitMat
  );
  steeringWheelRig.add(wheelAndHandsMesh);
  cockpitGroup.add(steeringWheelRig);
  bodyTiltGroup.add(cockpitGroup);

  // 3. Dynamic Full-Width LED Brake Light Strip
  const brakeLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const tailBar = new THREE.Mesh(staticGeos.tailBar, brakeLightMat);
  tailBar.position.set(0, 0.55, -2.15);
  bodyTiltGroup.add(tailBar);

  // 4. Headlight Ground Beams (illuminates road at night / sunset / rain)
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

  // 5. Twin Nitro Exhaust Flames
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
  });
  const exOffset = spec.id === 'phantom-v10' ? 0.24 : 0.46;
  const exY = spec.id === 'phantom-v10' ? 0.38 : 0.26;

  const nitroFlames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(staticGeos.flame, flameMat);
    flame.position.set(side * exOffset, exY, -2.55);
    flame.visible = false;
    bodyTiltGroup.add(flame);
    nitroFlames.push(flame);
  }

  // 6. Sculpted 5-Spoke Racing Wheels
  const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  const frontLeftSteer = new THREE.Group();
  const frontRightSteer = new THREE.Group();
  frontLeftSteer.position.set(0.93, 0.35, 1.30);
  frontRightSteer.position.set(-0.93, 0.35, 1.30);
  root.add(frontLeftSteer, frontRightSteer);

  const flWheel = new THREE.Mesh(wheelGeos.frontLeftWheel, wheelMat);
  frontLeftSteer.add(flWheel);

  const frWheel = new THREE.Mesh(wheelGeos.frontRightWheel, wheelMat);
  frontRightSteer.add(frWheel);

  const rearAxleMesh = new THREE.Mesh(wheelGeos.rearAxle, wheelMat);
  rearAxleMesh.position.set(0, 0.37, -1.28);
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
  };
}

/**
 * Applies Time of Day (day, sunrise, sunset, night) & Weather (clear, rain, fog, snow)
 * atmosphere, lighting, sun disc, and wet road reflections.
 */
export function applyAtmosphereAndLights(
  scene: THREE.Scene,
  hemiLight: THREE.HemisphereLight,
  sunLight: THREE.DirectionalLight,
  trackDef: TrackDefinition,
  timeOfDay: TimeOfDay,
  weather: WeatherType
): void {
  let skyHex = trackDef.theme.skyHex;
  let fogHex = trackDef.theme.fogHex;
  let sunHex = trackDef.theme.sunLightHex;
  let hemiSky = trackDef.theme.hemiSkyHex;
  let hemiGround = trackDef.theme.hemiGroundHex;
  let sunIntensity = 1.85;
  let hemiIntensity = 0.95;

  if (timeOfDay === 'sunrise') {
    skyHex = 0x3b1d38;
    fogHex = 0xd97706;
    sunHex = 0xffedd5;
    hemiSky = 0xfdba74;
    hemiGround = 0x31102f;
    sunIntensity = 2.1;
    sunLight.position.set(160, 28, 95);
  } else if (timeOfDay === 'sunset') {
    skyHex = 0x2a122e;
    fogHex = 0x9a3412;
    sunHex = 0xfb923c;
    hemiSky = 0xf472b6;
    hemiGround = 0x1e1b4b;
    sunIntensity = 1.95;
    sunLight.position.set(-150, 25, -80);
  } else if (timeOfDay === 'night') {
    skyHex = 0x050811;
    fogHex = 0x070b16;
    sunHex = 0x93c5fd;
    hemiSky = 0x1e3a8a;
    hemiGround = 0x050811;
    sunIntensity = 0.75;
    hemiIntensity = 0.65;
    sunLight.position.set(60, 110, -40);
  } else {
    // Day
    sunLight.position.set(85, 130, -60);
  }

  let fogDensity = 0.0024;
  if (weather === 'fog') {
    fogHex = timeOfDay === 'night' ? 0x1e293b : 0x94a3b8;
    skyHex = fogHex;
    fogDensity = 0.0095;
  } else if (weather === 'rain') {
    fogDensity = 0.0045;
    sunIntensity *= 0.75;
  } else if (weather === 'snow') {
    fogHex = timeOfDay === 'night' ? 0x1e293b : 0xcbd5e1;
    fogDensity = 0.0048;
  }

  scene.background = new THREE.Color(skyHex);
  scene.fog = new THREE.FogExp2(fogHex, fogDensity);

  hemiLight.color.setHex(hemiSky);
  hemiLight.groundColor.setHex(hemiGround);
  hemiLight.intensity = hemiIntensity;

  sunLight.color.setHex(sunHex);
  sunLight.intensity = sunIntensity;
}

export function buildTrackAndEnvironment(
  scene: THREE.Scene,
  trackDef: TrackDefinition,
  timeOfDay: TimeOfDay = 'day',
  weather: WeatherType = 'clear'
): THREE.Group {
  const trackGroup = new THREE.Group();
  scene.add(trackGroup);

  const samples = getTrackSamples(trackDef.id);
  const count = samples.length;
  const roadHalfWidth = trackDef.roadHalfWidth;
  const barrierHalfWidth = roadHalfWidth + 3.6;

  // 1. Ground Plane (adapts to snow weather if active)
  const groundColor =
    weather === 'snow' ? 0xdbeafe : trackDef.theme.groundHex;
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400, 1, 1),
    new THREE.MeshLambertMaterial({ color: groundColor })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.02;
  groundMesh.matrixAutoUpdate = false;
  groundMesh.updateMatrix();
  trackGroup.add(groundMesh);

  // 2. Closed-Loop Road Ribbon Mesh (with wet specular shader in Rain!)
  const roadTex = createRoadTexture(trackDef);
  const roadVertices: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const dist = i === count ? samples[count - 1].distance + 4 : s.distance;
    const vCoord = dist * 0.08;

    const lx = s.x - s.nx * roadHalfWidth;
    const lz = s.z - s.nz * roadHalfWidth;
    const rx = s.x + s.nx * roadHalfWidth;
    const rz = s.z + s.nz * roadHalfWidth;

    roadVertices.push(lx, 0.02, lz, rx, 0.02, rz);
    roadUvs.push(0, vCoord, 1, vCoord);

    if (i < count) {
      const base = i * 2;
      roadIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(roadVertices, 3)
  );
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();

  const roadMat =
    weather === 'rain'
      ? new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: roadTex,
          roughness: 0.16,
          metalness: 0.38,
          envMap: getStudioEnvMap(),
          envMapIntensity: 0.9,
        })
      : new THREE.MeshLambertMaterial({ color: 0xffffff, map: roadTex });

  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.matrixAutoUpdate = false;
  roadMesh.updateMatrix();
  trackGroup.add(roadMesh);

  // 3. Merged Left + Right Rumble Kerb Ribbons
  const kerbTex = createKerbTexture(trackDef);
  const kVerts: number[] = [];
  const kUvs: number[] = [];
  const kIndices: number[] = [];
  let kVertOffset = 0;

  for (const side of [-1, 1]) {
    const innerOff = side * (roadHalfWidth - 0.1);
    const outerOff = side * (roadHalfWidth + TRACK_KERB_WIDTH);

    for (let i = 0; i <= count; i++) {
      const s = samples[i % count];
      const dist = i === count ? samples[count - 1].distance + 4 : s.distance;
      const vCoord = dist * 0.25;

      const x1 = s.x + s.nx * innerOff;
      const z1 = s.z + s.nz * innerOff;
      const x2 = s.x + s.nx * outerOff;
      const z2 = s.z + s.nz * outerOff;

      if (side > 0) {
        kVerts.push(x1, 0.025, z1, x2, 0.055, z2);
      } else {
        kVerts.push(x2, 0.055, z2, x1, 0.025, z1);
      }
      kUvs.push(0, vCoord, 1, vCoord);

      if (i < count) {
        const base = kVertOffset + i * 2;
        kIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    kVertOffset += (count + 1) * 2;
  }

  const kGeo = new THREE.BufferGeometry();
  kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kVerts, 3));
  kGeo.setAttribute('uv', new THREE.Float32BufferAttribute(kUvs, 2));
  kGeo.setIndex(kIndices);
  kGeo.computeVertexNormals();
  const kerbMesh = new THREE.Mesh(
    kGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: kerbTex })
  );
  kerbMesh.matrixAutoUpdate = false;
  kerbMesh.updateMatrix();
  trackGroup.add(kerbMesh);

  // 4. Merged Left + Right Guardrail Barriers
  const bVerts: number[] = [];
  const bIndices: number[] = [];
  let bVertOffset = 0;

  for (const side of [-1, 1]) {
    const offset = side * barrierHalfWidth;
    for (let i = 0; i <= count; i++) {
      const s = samples[i % count];
      const bx = s.x + s.nx * offset;
      const bz = s.z + s.nz * offset;
      bVerts.push(bx, 0.08, bz, bx, 0.92, bz);

      if (i < count) {
        const base = bVertOffset + i * 2;
        bIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    bVertOffset += (count + 1) * 2;
  }

  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bVerts, 3));
  bGeo.setIndex(bIndices);
  bGeo.computeVertexNormals();
  const barrierMesh = new THREE.Mesh(
    bGeo,
    new THREE.MeshLambertMaterial({
      color: trackDef.theme.barrierHex,
      emissive: trackDef.theme.barrierEmissiveHex,
      emissiveIntensity:
        trackDef.theme.barrierEmissiveHex || timeOfDay === 'night' ? 0.75 : 0,
      side: THREE.DoubleSide,
    })
  );
  barrierMesh.matrixAutoUpdate = false;
  barrierMesh.updateMatrix();
  trackGroup.add(barrierMesh);

  // 5. Start / Finish Gantry Landmark & Pit Building
  const startSample = samples[16];
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(startSample.x, 0, startSample.z);
  gantryGroup.rotation.y = startSample.angle;

  if (!sharedCheckeredTex) sharedCheckeredTex = createCheckeredTexture();
  const startStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(roadHalfWidth * 2, 3.0),
    new THREE.MeshBasicMaterial({
      map: sharedCheckeredTex,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  startStrip.rotation.x = -Math.PI / 2;
  startStrip.position.y = 0.035;
  gantryGroup.add(startStrip);

  const gantryGb = new GeometryBuilder();
  gantryGb.addBox(-(roadHalfWidth + 2.0), 3.8, 0, 0.9, 7.6, 0.9, 0x1e293b);
  gantryGb.addBox(roadHalfWidth + 2.0, 3.8, 0, 0.9, 7.6, 0.9, 0x1e293b);
  gantryGb.addBox(0, 7.2, 0, (roadHalfWidth + 2.4) * 2, 1.4, 1.3, 0x1e293b);
  for (let l = -2; l <= 2; l++) {
    gantryGb.addBox(l * 1.4, 6.25, -0.7, 0.42, 0.42, 0.42, 0x22c55e);
  }
  gantryGroup.add(
    new THREE.Mesh(
      gantryGb.toBufferGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true })
    )
  );

  const bannerStrip = new THREE.Mesh(
    new THREE.BoxGeometry(roadHalfWidth * 1.9, 0.85, 1.38),
    new THREE.MeshBasicMaterial({ map: sharedCheckeredTex })
  );
  bannerStrip.position.set(0, 7.2, 0);
  gantryGroup.add(bannerStrip);
  trackGroup.add(gantryGroup);

  const pitBuilding = new THREE.Group();
  pitBuilding.position.set(
    startSample.x - startSample.nx * 22,
    0,
    startSample.z + 24
  );
  pitBuilding.rotation.y = startSample.angle;

  const pitGb = new GeometryBuilder();
  pitGb.addBox(0, 3.1, 0, 10, 6.2, 64, 0x1e293b);
  pitGb.addBox(0, 4.4, 0, 10.3, 2.0, 60, 0x38bdf8);
  pitGb.addBox(1.4, 6.5, 0, 13.5, 0.65, 68, 0xf59e0b);
  pitBuilding.add(
    new THREE.Mesh(
      pitGb.toBufferGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true })
    )
  );
  trackGroup.add(pitBuilding);

  // 6. Map-Specific 3D Surroundings & Horizon Landmarks (Merged into 1 Draw Call!)
  const envGb = new GeometryBuilder();
  const centerX = 105;
  const centerZ = 0;

  // Distant 360-degree Mountain / Skyline Ring around the circuit
  const ringCount = 24;
  for (let r = 0; r < ringCount; r++) {
    const ang = (r / ringCount) * Math.PI * 2;
    const dist = 250 + ((r * 37) % 65);
    const mx = centerX + Math.cos(ang) * dist;
    const mz = centerZ + Math.sin(ang) * dist;

    if (trackDef.id === 'tokyo-night') {
      // Cyber Metropolis Skyscrapers with neon window bands
      const h = 38 + ((r * 19) % 55);
      const w = 18 + (r % 4) * 5;
      envGb.addBox(mx, h * 0.5, mz, w, h, w, 0x0f172a);
      envGb.addBox(
        mx,
        h * 0.82,
        mz,
        w * 1.03,
        2.2,
        w * 1.03,
        r % 2 === 0 ? 0x06b6d4 : 0xec4899
      );
      envGb.addBox(
        mx,
        h * 0.52,
        mz,
        w * 1.02,
        1.5,
        w * 1.02,
        0x38bdf8
      );
    } else if (trackDef.id === 'desert-canyon') {
      // Monument Valley Red Sandstone Mesas & Canyon Buttes
      const h = 28 + ((r * 23) % 42);
      const w = 34 + (r % 5) * 8;
      envGb.addBox(mx, h * 0.4, mz, w, h * 0.8, w * 0.85, 0x9a3412, 0.65, 0);
      envGb.addBox(mx, h * 0.85, mz, w * 0.55, h * 0.3, w * 0.5, 0xc2410c, 0.8, 0);
    } else if (trackDef.id === 'nordic-ice') {
      // Jagged Glacial Peaks
      const h = 42 + ((r * 29) % 48);
      const w = 32 + (r % 4) * 7;
      envGb.addBox(mx, h * 0.35, mz, w, h * 0.7, w, 0x475569, 0.35, 0);
      envGb.addBox(mx, h * 0.78, mz, w * 0.42, h * 0.4, w * 0.42, 0xf8fafc, 0.08, 0);
    } else {
      // Alpine Mountain Peaks with Snow Caps
      const h = 36 + ((r * 23) % 46);
      const w = 36 + (r % 4) * 8;
      envGb.addBox(mx, h * 0.35, mz, w, h * 0.7, w, 0x334155, 0.38, 0);
      envGb.addBox(mx, h * 0.76, mz, w * 0.44, h * 0.35, w * 0.44, 0xe2e8f0, 0.1, 0);
    }
  }

  // Trackside Spectacle: Highway Light Arches / Grandstands along the circuit
  for (let i = 45; i < count - 25; i += 55) {
    const s = samples[i];
    const side = i % 2 === 0 ? 1 : -1;
    const gx = s.x + s.nx * side * (barrierHalfWidth + 9.5);
    const gz = s.z + s.nz * side * (barrierHalfWidth + 9.5);
    if (trackDef.id === 'tokyo-night') {
      envGb.addBox(gx, 5.5, gz, 2.5, 11, 2.5, 0x1e293b);
      envGb.addBox(gx, 10.5, gz, 3.0, 0.8, 3.0, 0x38bdf8);
    } else {
      // Trackside spectator grandstand / marshal tower
      envGb.addBox(gx, 2.8, gz, 7.5, 5.6, 7.5, 0x1e293b, 0.85, 0);
      envGb.addBox(
        gx,
        5.8,
        gz,
        8.2,
        0.5,
        8.2,
        i % 110 === 45 ? 0xef4444 : 0xf59e0b
      );
    }
  }

  const envMesh = new THREE.Mesh(
    envGb.toBufferGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  envMesh.matrixAutoUpdate = false;
  envMesh.updateMatrix();
  trackGroup.add(envMesh);

  // 7. Glowing Sun / Sunrise / Sunset / Moon Orb in the Sky
  if (timeOfDay === 'sunrise' || timeOfDay === 'sunset' || timeOfDay === 'night') {
    const orbColor =
      timeOfDay === 'sunrise'
        ? 0xfde047
        : timeOfDay === 'sunset'
        ? 0xf97316
        : 0xe0f2fe;
    const orbRadius = timeOfDay === 'night' ? 14 : 28;
    const orbMesh = new THREE.Mesh(
      new THREE.SphereGeometry(orbRadius, 16, 12),
      new THREE.MeshBasicMaterial({ color: orbColor, fog: false })
    );
    if (timeOfDay === 'sunrise') {
      orbMesh.position.set(280, 48, 220);
    } else if (timeOfDay === 'sunset') {
      orbMesh.position.set(-260, 42, -210);
    } else {
      orbMesh.position.set(160, 140, -180);
    }
    trackGroup.add(orbMesh);
  }

  // 8. Instanced Trackside Foliage / Cacti / Cyber Pillars (2 draw calls total)
  const propCount = 60;
  const isDesert = trackDef.id === 'desert-canyon';
  const isTokyo = trackDef.id === 'tokyo-night';

  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.28, 0.4, 2.2, 6),
    new THREE.MeshLambertMaterial({
      color: isDesert ? 0x15803d : 0x4a3222,
    }),
    propCount
  );
  const crownMesh = new THREE.InstancedMesh(
    isTokyo
      ? new THREE.BoxGeometry(3.2, 14.0, 3.2)
      : isDesert
      ? new THREE.BoxGeometry(1.4, 4.8, 0.9)
      : new THREE.ConeGeometry(2.3, 6.0, 6),
    new THREE.MeshLambertMaterial({
      color:
        weather === 'snow' && !isTokyo
          ? 0xe2e8f0
          : trackDef.theme.foliageHex,
    }),
    propCount
  );

  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let i = 0; i < propCount; i++) {
    const sampleIdx = (i * 6 + 5) % count;
    if (sampleIdx < 32) continue;
    const s = samples[sampleIdx];
    const side = i % 2 === 0 ? 1 : -1;
    const dist = barrierHalfWidth + 6.5 + ((i * 13) % 18);
    const tx = s.x + s.nx * side * dist;
    const tz = s.z + s.nz * side * dist;
    const sc = 0.85 + (i % 5) * 0.08;

    dummy.position.set(tx, 1.1 * sc, tz);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(placed, dummy.matrix);

    dummy.position.set(tx, isTokyo ? 7.0 * sc : 4.2 * sc, tz);
    dummy.updateMatrix();
    crownMesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  trunkMesh.count = placed;
  crownMesh.count = placed;
  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
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
