import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { KEEPERS, MAP, MERC_ORDER, RULES, TICK_RATE, UNITS, UNIT_ORDER, canPlan, cellCenter, hqMax, hqX } from "@lw/sim";
import type { GameState, SimEvent, TeamId } from "@lw/sim";
import { PAL, TEAM, ball, box, cyl, cathedralModel, chantryModel, chapelModel, cloisterModel, curtainModel, fenceModel, graveyardModel, merge, precinctModel, shrineModel, unitModel, wholeModel } from "./models";
import type { Gait, ModelDef, Part } from "./models";
import { LANE_GAP, LANE_LEN, LANE_PITCH, LANE_W, fieldZ, laneAt, laneZ, midZ } from "./layout";
import { courtyardTile, glowTexture, groundTile, runeTexture } from "./textures";

/** Presentation only: a 3D view drawn FROM GameState. No rules here. World: x along the lane, z across it, y up. */
const W = (milli: number) => milli / 1000;
const MID_Z = LANE_W / 2, LZ = laneZ;
const PITCH = (52 * Math.PI) / 180, FOV = 30;
const NEUTRAL = 0x8a90a6, UNIT_SCALE = 0.8, BUILDING_SCALE = 0.6;
const SHRINE_Z = [-1.8, LANE_W + 1.8]; // shrines flank the lane instead of standing in it
const FOOT = W(MAP.footprint * MAP.cell); // side of a building's footprint
/** Soldiers are drawn at UNIT_SCALE; structures are modelled at world size. */
const scaleOf = (type: string): number => (type === "vulture" ? VULTURE_SCALE : UNITS[type]?.structure ? 1 : UNITS[type] ? UNIT_SCALE : KEEPER_SCALE);

/** Every model the HUD shows a portrait of. */
export const PORTRAITS = [...UNIT_ORDER, ...MERC_ORDER, ...KEEPERS.map(k => k.id)];
/** Gravekeepers are drawn through the same rig as units; this is the id their view is kept under. */
export const keeperKey = (owner: number, slot: number): number => -(owner * 2 + slot + 1);
const KEEPER_SCALE = 0.95, VULTURE_SCALE = 1.5;
/** Key of one bird of a player's flight of Ossuary Vultures in the unit views: they are posed like soldiers but are not units. */
const vultureKey = (owner: number, bird: number): number => -(1000 + owner * 2 + bird);
export interface ViewState {
  selectedKeeper: 0 | 1 | null;
  selectedUnit: string | null;
  hoverCell: { col: number; row: number; lane: number } | null;
  selectedBuilding: number | null;
  me: number;
}
interface UnitView {
  root: THREE.Group; rig: THREE.Group;      // root: where it stands and which way it faces; rig: the body's bob, lean and lunge
  legs: THREE.Mesh[]; weapon: THREE.Group; parts: { node: THREE.Group; def: Part }[];
  def: ModelDef; type: string; team: TeamId; lastAttack: number; born: number;
  yaw: number; walk: number; alt: number;   // smoothed facing, 0..1 how much it is walking, height of its feet above the ground
}
/** Stride speed (radians per millisecond) of each gait. */
const STRIDE: Record<Gait, number> = { walk: 0.02, shuffle: 0.016, gallop: 0.024, lope: 0.03, stomp: 0.011, float: 0.01, roll: 0.02, fly: 0.01 };
/** How each unit's attack looks and sounds; anything not listed strikes in melee. */
type Shot = "bolt" | "gun" | "orb" | "stone" | "flame" | "stake" | "lightning" | "beam";
const SHOTS: Record<string, { kind: Shot; color: number }> = {
  marksman: { kind: "gun", color: 0xfff1c9 }, fireeater: { kind: "flame", color: 0xff7a1a }, seraph: { kind: "orb", color: PAL.ember }, hellmouth: { kind: "stone", color: 0xff5a1f },
  arbalester: { kind: "bolt", color: PAL.bone }, witchhunter: { kind: "gun", color: 0xfff1c9 }, hexbinder: { kind: "orb", color: PAL.storm },
  necromancer: { kind: "orb", color: PAL.venom }, lich: { kind: "orb", color: PAL.frost }, trebuchet: { kind: "stone", color: 0x55586a },
  zealot: { kind: "flame", color: 0xff7a1a }, wyrm: { kind: "flame", color: 0xff5a1f }, ballista: { kind: "stake", color: 0x8c93a6 },
  cantor: { kind: "lightning", color: PAL.storm }, hq: { kind: "beam", color: 0 }, tower: { kind: "beam", color: 0 }, bastion: { kind: "beam", color: 0 },
};
const MELEE: Record<string, number> = { titan: 0xffd27a, rider: 0xdfe6ff, ogre: 0xcdbf9f, countess: 0xff3b4f, shade: PAL.ghost, colossus: 0xcdbf9f, headsman: 0xffffff, gargoyle: 0xc8ccd8, hound: 0xe2d7bc };
export const shotKind = (unit: string): Shot | "melee" => SHOTS[unit]?.kind ?? "melee";
interface Particle { sprite: THREE.Sprite; vx: number; vy: number; vz: number; born: number; life: number; s0: number; s1: number; grav: number }
interface Flight { mesh: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; born: number; life: number; arc: number; beam: boolean; onEnd?: () => void }

/** Steps of picture quality, dearest first: pixel density, shadow map size (0 = no shadows), and whether the glow pass runs. */
const QUALITY = [
  { pixels: 2, shadow: 2048, bloom: true },
  { pixels: 1.5, shadow: 1024, bloom: true },
  { pixels: 1.25, shadow: 1024, bloom: false },
  { pixels: 1, shadow: 512, bloom: false },
  { pixels: 1, shadow: 0, bloom: false },
];
/**
 * The Deadly Fog: sheets of drifting vapour stacked over the lane, each a warped noise field, so that it reads as a
 * rolling bank with depth and never as a solid slab. vP.x is the distance from the caster's lane end, vP.y across the lane.
 */
const FOG_VERT = `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FOG_FRAG = `
varying vec2 vP; uniform float uFront, uTime, uFade, uLayer, uWidth; uniform vec3 uTint;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, v = 0.0; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return v; }
void main(){
  float t = uTime;
  vec2 q = vP * 0.085 + vec2(-t * 0.06, t * 0.014) * (1.0 + uLayer * 0.35) + uLayer * 7.3;
  vec2 curl = vec2(fbm(q * 1.7 + t * 0.03), fbm(q * 1.7 + 5.2 - t * 0.02));
  float d = fbm(q + curl * 1.5);
  float edge = uFront + (fbm(vec2(vP.y * 0.16 + uLayer * 3.1, t * 0.12)) - 0.55) * 16.0 - uLayer * 2.5; // ragged, and the high sheets trail
  float body = smoothstep(edge, edge - 9.0, vP.x);
  float crest = body * smoothstep(edge - 16.0, edge - 1.0, vP.x);
  float side = smoothstep(-2.5, 2.0, vP.y) * smoothstep(uWidth + 2.5, uWidth - 2.0, vP.y) * smoothstep(-9.0, -2.0, vP.x);
  float dens = smoothstep(0.33, 0.72, d);
  float a = body * side * uFade * (0.05 + 0.34 * dens + 0.24 * crest * dens);
  vec3 col = mix(vec3(0.0, 0.05, 0.03), vec3(0.16, 0.62, 0.27), dens);
  col = mix(col, uTint, 0.08) + pow(dens, 3.0) * vec3(0.2, 0.5, 0.22) + crest * dens * vec3(0.12, 0.6, 0.22);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** The skull urn an Ossuary Vulture lets fall. */
const URN = { lit: merge([cyl(0.3, 0.2, 0.5, 7, PAL.iron, 0, 0, 0), cyl(0.2, 0.3, 0.14, 7, PAL.iron, 0, 0.32, 0), cyl(0.32, 0.32, 0.06, 7, PAL.bronze, 0, 0.16, 0), ball(0.16, PAL.bone, 0, 0.5, 0, 1)]),
  glow: merge([box(0.54, 0.06, 0.06, PAL.ghost, 0, -0.04, 0), box(0.06, 0.06, 0.54, PAL.ghost, 0, -0.04, 0), ball(0.1, PAL.ghost, 0, -0.3, 0, 0)]) };
type FogView = { g: THREE.Group; front: { value: number }; time: { value: number }; fade: { value: number }; mote: number };

export class Renderer {
  private renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private overlay = document.createElement("canvas");
  private moon = new THREE.DirectionalLight(0xdfe4f7, 2.5);
  private lit = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  private glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, color: new THREE.Color(1.7, 1.7, 1.7) });
  private statue = new THREE.MeshStandardMaterial({ color: 0x9da1b2, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  private ghost = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.66, emissive: 0x2a2060 });
  private halo = new THREE.MeshBasicMaterial({ color: PAL.heal, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  private glowTex = new THREE.CanvasTexture(glowTexture());
  private units = new Map<number, UnitView>();
  private dying: { root: THREE.Group; rig: THREE.Group; born: number; structure: boolean; alt: number }[] = [];
  private buildings = new Map<number, THREE.Group>();
  private shrines: { flames: THREE.Mesh[]; lights: THREE.PointLight[]; runes: THREE.Mesh[]; owner: TeamId | null | undefined }[] = [];
  private hqGlow: THREE.Mesh[] = [];
  private particles: Particle[] = [];
  private shots: Flight[] = [];
  private prev = new Map<number, { x: number; y: number }>();
  private hover!: THREE.Mesh; private range!: THREE.Mesh; private selRing!: THREE.Mesh;
  private keeperRing!: THREE.Mesh; private wayMark!: THREE.Mesh; private ghostMarks: THREE.Mesh[] = [];
  private ray = new THREE.Raycaster(); private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private fogs = new Map<number, FogView>(); // by the player who called it: each may only once
  private dist = 60; private lastEmber = 0; private hqScale = 1; private flash = 0;
  camX = 30; // camera target along the lanes, world units
  camZ = MID_Z; // ...and across them
  lanes = 1;    // lanes of the current battlefield
  private world = new THREE.Group(); // everything that depends on the number of lanes

  init(mount: HTMLElement): void {
    const r = this.renderer;
    // phones start a step down, and with plain (cheaper) shadow filtering; every device steps down further if it cannot keep up
    const phone = matchMedia("(pointer:coarse)").matches;
    this.quality = phone ? 1 : 0;
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.4;
    r.shadowMap.enabled = true; r.shadowMap.type = phone ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    mount.append(r.domElement, this.overlay);
    Object.assign(this.overlay.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
    this.scene.background = new THREE.Color(0x090b14);
    this.scene.fog = new THREE.FogExp2(0x0e0f16, 0.006);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.6, 0.85);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.scene.add(new THREE.HemisphereLight(0xa9afc4, 0x2a2622, 1.15));
    const m = this.moon; m.castShadow = true;
    Object.assign(m.shadow.camera, { left: -58, right: 58, top: 44, bottom: -44, near: 1, far: 160 });
    m.shadow.bias = -0.0006; m.shadow.normalBias = 0.04;
    this.scene.add(m, m.target, this.world);
    this.buildWorld();
    this.applyQuality();
  }
  /** How much the picture costs: 0 is everything, each step up sheds something (see QUALITY). Only ever raised, by `pace`. */
  private quality = 0;
  private slow = 0; private frames = 0;
  private applyQuality(): void {
    const q = QUALITY[this.quality]!, m = this.moon;
    this.renderer.setPixelRatio(Math.min(q.pixels, devicePixelRatio || 1));
    m.castShadow = q.shadow > 0;
    if (q.shadow > 0 && m.shadow.mapSize.x !== q.shadow) { m.shadow.mapSize.set(q.shadow, q.shadow); m.shadow.map?.dispose(); m.shadow.map = null; }
    this.resize();
  }
  /** Watch the frame times; when most of a second's frames run late, shed the next most expensive thing. */
  private pace(dt: number): void {
    if (dt >= 100 || document.hidden) return; // a stalled or hidden tab says nothing about the device
    this.frames++; if (dt > 24) this.slow++;
    if (this.frames < 90) return;
    if (this.slow > 45 && this.quality < QUALITY.length - 1) { this.quality++; this.applyQuality(); }
    this.frames = 0; this.slow = 0;
  }
  /** Rebuild the battlefield for a match with this many lanes (1v1: one, 2v2: two, 3v3: three). */
  layout(lanes: number): void {
    if (lanes === this.lanes) return;
    this.lanes = lanes;
    this.world.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
    this.world.clear();
    this.shrines = []; this.hqGlow = []; this.ghostMarks = [];
    this.buildWorld();
    this.clampCam();
  }
  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m;
  }

  private buildWorld(): void {
    const s = this.world, n = this.lanes, mid = midZ(n), nearEdge = LZ(n - 1) + LANE_W;

    // ground: one texture tile is 48 x 48 world units with a lane band in the middle; one strip per lane, overlapping in the graveyards between
    const tex = new THREE.CanvasTexture(groundTile(22, 48, 12, LANE_W, 48));
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.set((LANE_LEN + 240) / 48, 1); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    for (let l = 0; l < n; l++) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(LANE_LEN + 240, 48), groundMat);
      ground.rotation.x = -Math.PI / 2; ground.position.set(LANE_LEN / 2, l * 0.004, LZ(l) + MID_Z); ground.receiveShadow = true; s.add(ground);
    }
    const far = new THREE.Mesh(new THREE.PlaneGeometry(LANE_LEN + 460, 200 + nearEdge), new THREE.MeshStandardMaterial({ color: 0x1b1d26, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(LANE_LEN / 2, -0.05, mid); s.add(far);

    // the far edge is a ruined cloister, the near edge an iron fence; between two lanes lies a strip of graveyard behind a fence of its own
    const cloister = this.mesh(cloisterModel(-40, LANE_LEN + 40), this.lit); cloister.position.z = -3.2; s.add(cloister);
    const fenceNear = this.mesh(fenceModel(-40, LANE_LEN + 40, 0), this.lit); fenceNear.position.z = nearEdge + 5.2; s.add(fenceNear);
    const zoneEnd = W(MAP.zoneStart + MAP.zoneCols * MAP.cell) + 6; // dividers stop short of the building grounds, where the keepers cross
    for (let l = 0; l < n; l++) {
      const graves = this.mesh(graveyardModel(l === 0 ? -30 : zoneEnd, l === 0 ? LANE_LEN + 30 : LANE_LEN - zoneEnd, LANE_W + 1.2), this.lit); graves.position.z = LZ(l); s.add(graves);
      if (l === n - 1) continue;
      const z = LZ(l) + LANE_W + LANE_GAP / 2;
      const fence = this.mesh(fenceModel(zoneEnd, LANE_LEN - zoneEnd, 0), this.lit); fence.position.z = z; s.add(fence);
      // a low stone kerb either side of the strip, so each lane reads as its own road
      for (const dz of [-LANE_GAP / 2 + 0.5, LANE_GAP / 2 - 0.5]) s.add(this.mesh(box(LANE_LEN - zoneEnd * 2, 0.35, 0.5, PAL.stoneLo, LANE_LEN / 2, 0.17, z + dz), this.lit));
      // ...and a paved walk joining the building grounds across it at either end
      for (const team of [0, 1] as const) {
        const zoneLen = W(MAP.zoneCols * MAP.cell), x0 = team === 0 ? W(MAP.zoneStart) : LANE_LEN - W(MAP.zoneStart) - zoneLen;
        s.add(this.mesh(box(8, 0.06, LANE_GAP - 1.6, PAL.stoneHi, x0 + zoneLen / 2, 0.04, z), this.lit));
      }
    }

    // lamp posts: warm pools of light along the kerbs (every lane edge when there is one lane, the strips between and outside when there are more)
    const lamps: THREE.BufferGeometry[] = [], flames: THREE.BufferGeometry[] = [];
    const rows = n === 1 ? [-1, LANE_W + 1] : [-1, ...Array.from({ length: n - 1 }, (_, l) => LZ(l) + LANE_W + LANE_GAP / 2 + 1.2), nearEdge + 1];
    const step = n === 1 ? 76 : 96;
    rows.forEach((z, r) => {
      for (let x = 32 + (r % 2) * (step / 2); x <= LANE_LEN - 30; x += step) {
        lamps.push(box(0.5, 0.4, 0.5, PAL.stoneLo, x, 0.2, z), box(0.16, 3.6, 0.16, PAL.ink, x, 2, z), box(0.7, 0.1, 0.7, PAL.ink, x, 3.8, z), box(0.5, 0.1, 0.5, PAL.ink, x, 4.5, z));
        flames.push(box(0.36, 0.56, 0.36, PAL.candle, x, 4.15, z));
        const l = new THREE.PointLight(0xffb060, 90, 26, 1.7); l.position.set(x, 4.4, z); s.add(l);
      }
    });
    s.add(this.mesh(merge(lamps), this.lit), new THREE.Mesh(merge(flames), this.glow));

    // one cathedral per side, standing behind all of its lanes and growing with their number
    this.hqScale = 1 + 0.25 * (n - 1);
    for (const team of [0, 1] as const) {
      const c = cathedralModel(team), g = new THREE.Group();
      const glow = new THREE.Mesh(c.glow, this.glow.clone());
      g.add(this.mesh(c.lit, this.lit), glow); this.hqGlow[team] = glow;
      const lamp = new THREE.PointLight(TEAM[team].glow, 60, 34, 1.6); lamp.position.set(0, 6, 12); g.add(lamp);
      g.scale.setScalar(this.hqScale);
      g.position.set(W(hqX(team)) + (team === 0 ? -1 : 1) * 5.5 * (this.hqScale - 1), 0, mid); s.add(g);
    }

    // the cathedral close: a curtain wall across the back of every lane with the cathedral standing in it. A lane that
    // ends beside the cathedral rather than at it ends at a chapel of the close, so every army has something of it to storm.
    const closeX = W(MAP.hqOffset), nave = 9.4 * this.hqScale;
    for (const team of [0, 1] as const) {
      const x = team === 0 ? closeX : LANE_LEN - closeX;
      for (const [z0, z1] of [[-0.9, mid - nave], [mid + nave, nearEdge + 0.9]] as const) {
        if (z1 - z0 < 1.5) continue;
        const wall = this.mesh(curtainModel(z0, z1), this.lit); wall.position.x = x; s.add(wall);
      }
      for (let l = 0; l < n; l++) {
        if (Math.abs(LZ(l) + MID_Z - mid) < nave) continue; // this lane runs up to the cathedral itself
        const c = chapelModel(team), g = new THREE.Group();
        g.add(this.mesh(c.lit, this.lit), new THREE.Mesh(c.glow, this.glow));
        g.position.set(x, 0, LZ(l) + MID_Z); g.scale.x = team === 0 ? 1 : -1; s.add(g);
      }
    }

    // building ground: a paved precinct that runs from the cathedral steps to the base towers in every lane, walled along its sides, with a gate toward each neighbouring lane
    const zoneLen = W(MAP.zoneCols * MAP.cell), back = W(MAP.zoneStart - MAP.hqOffset), yardLen = zoneLen + back + 0.6, yardTex = new THREE.CanvasTexture(courtyardTile(40, 12));
    yardTex.wrapS = yardTex.wrapT = THREE.RepeatWrapping; yardTex.repeat.set(yardLen / 12, (LANE_W + 1.2) / 12); yardTex.colorSpace = THREE.SRGBColorSpace; yardTex.anisotropy = 8;
    const yardMat = new THREE.MeshStandardMaterial({ map: yardTex, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let l = 0; l < n; l++) for (const team of [0, 1] as const) {
      const rear = W(MAP.zoneStart), x0 = team === 0 ? rear : LANE_LEN - rear - zoneLen;
      const yard = new THREE.Mesh(new THREE.PlaneGeometry(yardLen, LANE_W + 1.2), yardMat);
      yard.rotation.x = -Math.PI / 2; yard.position.set(x0 + zoneLen / 2 + (team === 0 ? -1 : 1) * (back - 0.6) / 2, 0.03, LZ(l) + MID_Z); yard.receiveShadow = true; s.add(yard);
      const wall = precinctModel(team, zoneLen, LANE_W, l > 0, l < n - 1, back), g = new THREE.Group();
      g.add(this.mesh(wall.lit, this.lit), new THREE.Mesh(wall.glow, this.glow));
      g.position.set(team === 0 ? rear : LANE_LEN - rear, 0, LZ(l)); g.scale.x = team === 0 ? 1 : -1; s.add(g);
    }

    // shrines: each checkpoint is a pair standing just outside its lane, one on either edge (same order as the sim's beacons)
    const runeTex = new THREE.CanvasTexture(runeTexture());
    for (let l = 0; l < n; l++) for (const x of MAP.beaconX) {
      const flames: THREE.Mesh[] = [], lights: THREE.PointLight[] = [], runes: THREE.Mesh[] = [];
      for (const z of SHRINE_Z) {
        const g = new THREE.Group(); g.position.set(W(x), 0, LZ(l) + z);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 7), new THREE.MeshBasicMaterial({ toneMapped: false }));
        flame.position.y = 5.7;
        const light = new THREE.PointLight(0xffffff, 0, 24, 1.5); light.position.y = 6.2;
        const rune = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4),
          new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        rune.rotation.x = -Math.PI / 2; rune.position.y = 0.12;
        g.add(this.mesh(shrineModel(), this.lit), flame, light, rune); s.add(g);
        flames.push(flame); lights.push(light); runes.push(rune);
      }
      this.shrines.push({ flames, lights, runes, owner: undefined });
    }

    const flat = (geo: THREE.BufferGeometry, color: number, opacity: number) => {
      const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      o.rotation.x = -Math.PI / 2; o.position.y = 0.16; o.visible = false; s.add(o); return o;
    };
    this.hover = flat(new THREE.PlaneGeometry(FOOT, FOOT), 0x7dff9a, 0.45);
    this.range = flat(new THREE.RingGeometry(0.985, 1, 64), 0xffffff, 0.5);
    this.selRing = flat(new THREE.RingGeometry(1.3, 1.45, 40), 0xffd77a, 0.9);
    this.keeperRing = flat(new THREE.RingGeometry(0.75, 0.9, 6), 0x8dffb0, 0.95);
    this.wayMark = flat(new THREE.RingGeometry(0.25, 0.42, 4), 0x8dffb0, 0.9);
  }

  resize(): void {
    const el = this.renderer.domElement.parentElement!, w = el.clientWidth, h = el.clientHeight, dpr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(dpr);
    this.renderer.setSize(w, h); this.composer.setSize(w, h); this.bloom.resolution.set(w, h);
    this.overlay.width = w * dpr; this.overlay.height = h * dpr;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.setZoom(this.zoom);
  }
  /** How close the camera stands: 1 is the usual view, less is closer (a pinch, or ctrl + wheel). */
  zoom = 1;
  setZoom(z: number): void {
    this.zoom = Math.max(0.5, Math.min(1.3, z));
    // Far enough to show the whole lane depth, and at least ~46 units of lane width on narrow windows.
    this.dist = Math.max(74, 104 / this.camera.aspect) * this.zoom;
    this.clampCam();
  }
  private halfWidth(): number { return this.camera.aspect * Math.tan((FOV * Math.PI) / 360) * this.dist; }
  clampCam(): void {
    const hw = this.halfWidth() - 9;
    if (!Number.isFinite(hw)) return; // the canvas has no size yet (a hidden or just-opened window)
    if (!Number.isFinite(this.camX)) this.camX = 0;
    this.camX = hw * 2 >= LANE_LEN ? LANE_LEN / 2 : Math.max(hw, Math.min(LANE_LEN - hw, this.camX));
    this.camZ = Math.max(MID_Z, Math.min(LZ(this.lanes - 1) + MID_Z, this.camZ));
  }
  /** World units per screen pixel along the lanes (for drag scrolling). */
  unitsPerPixel(): number { return (this.halfWidth() * 2) / this.renderer.domElement.clientWidth; }
  /** The stretch of battlefield on screen, as fractions of the whole field [x0, x1, z0, z1], for the minimap. */
  viewRect(): [number, number, number, number] {
    const hw = this.halfWidth(), [f0, f1] = fieldZ(this.lanes), frac = (z: number) => Math.max(0, Math.min(1, (z - f0) / (f1 - f0)));
    const top = this.groundAt(0, 1)?.z ?? this.camZ - 20, bottom = this.groundAt(0, -1)?.z ?? this.camZ + 20;
    return [Math.max(0, (this.camX - hw) / LANE_LEN), Math.min(1, (this.camX + hw) / LANE_LEN), frac(top), frac(bottom)];
  }
  /** Centre the camera on a point of the minimap (fractions of the whole field). */
  panTo(fx: number, fz: number): void { const [f0, f1] = fieldZ(this.lanes); this.camX = fx * LANE_LEN; this.camZ = f0 + fz * (f1 - f0); this.clampCam(); }
  /** Centre the camera on a lane position. */
  lookAt(lane: number, x: number): void { this.camX = x; this.camZ = LZ(lane) + MID_Z; this.clampCam(); }

  private placeCamera(): void {
    const tz = this.camZ + 0.6;
    this.camera.position.set(this.camX, Math.sin(PITCH) * this.dist, tz + Math.cos(PITCH) * this.dist);
    this.camera.lookAt(this.camX, 0, tz);
    this.moon.position.set(this.camX - 26, 46, this.camZ + 30); this.moon.target.position.set(this.camX, 0, this.camZ);
  }
  private groundAt(ndcX: number, ndcY: number): THREE.Vector3 | null {
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return this.ray.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
  }

  /** Screen point → the lane under it and lane coordinates in milli-units, or null if it misses the ground. */
  pick(clientX: number, clientY: number): { x: number; y: number; lane: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const hit = this.groundAt(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    return hit ? { x: hit.x * 1000, ...laneAt(hit.z, this.lanes) } : null;
  }
  /**
   * Where a building centred on the pointer would stand (snapped to the hidden grid and kept inside
   * the zone), plus the single grid cell under the pointer for picking an existing building.
   */
  cellAt(team: TeamId, wx: number, wy: number): { col: number; row: number; at: { col: number; row: number } } | null {
    const f = MAP.footprint, cx = ((team === 0 ? wx : MAP.laneLength - wx) - MAP.zoneStart) / MAP.cell, cy = wy / MAP.cell;
    if (cx < 0 || cx >= MAP.zoneCols || cy < 0 || cy >= MAP.zoneRows) return null;
    const snap = (v: number, n: number) => Math.max(0, Math.min(n - f, Math.round(v - f / 2)));
    return { col: snap(cx, MAP.zoneCols), row: snap(cy, MAP.zoneRows), at: { col: Math.floor(cx), row: Math.floor(cy) } };
  }

  /** Render each unit once to a small image for the HUD cards. */
  portraits(team: TeamId = 0): Record<string, string> {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(220, 260); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.2;
    const out: Record<string, string> = {};
    for (const id of PORTRAITS) {
      const sc = new THREE.Scene(), model = wholeModel(id, team);
      sc.add(new THREE.HemisphereLight(0xc4cdea, 0x4a4450, 2));
      const key = new THREE.DirectionalLight(0xfff0d8, 3.4); key.position.set(-3, 5, 6); sc.add(key); const rim = new THREE.DirectionalLight(0x9ab8ff, 2); rim.position.set(4, 3, -5); sc.add(rim);
      // Centre the model on its own bounding box and stand back far enough to frame it, whatever its shape.
      model.lit.computeBoundingBox();
      const bb = model.lit.boundingBox!, c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
      const inner = new THREE.Group(); inner.position.copy(c).negate();
      inner.add(new THREE.Mesh(model.lit, unitModel(id, team).ghost ? this.ghost : this.lit)); if (model.glow) inner.add(new THREE.Mesh(model.glow, this.glow));
      const g = new THREE.Group(); g.add(inner); g.rotation.y = -0.55; sc.add(g);
      const reach = Math.max(size.y * 0.5, size.x * 0.5 + size.z * 0.31) * 1.1; // the model is turned 0.55 rad in a 220 x 260 frame
      const cam = new THREE.PerspectiveCamera(24, 220 / 260, 0.1, 200);
      cam.position.set(0, reach * 0.28, reach / Math.tan((12 * Math.PI) / 180)); cam.lookAt(0, 0, 0);
      r.render(sc, cam);
      out[id] = r.domElement.toDataURL();
    }
    r.dispose(); r.forceContextLoss();
    return out;
  }

  /** Remember unit positions before a sim step so frames can interpolate. */
  snapshot(s: GameState): void {
    this.prev.clear();
    for (const u of s.units) this.prev.set(u.id, { x: u.x, y: u.y });
    for (const k of s.keepers) this.prev.set(keeperKey(k.owner, k.slot), { x: k.x, y: k.y });
    for (const f of s.flights) for (const bird of [0, 1]) this.prev.set(vultureKey(f.owner, bird), { x: f.x, y: RULES.vultureY[bird]! });
  }
  reset(): void {
    for (const v of this.units.values()) this.scene.remove(v.root);
    for (const d of this.dying) this.scene.remove(d.root);
    for (const b of this.buildings.values()) this.scene.remove(b);
    for (const p of this.particles) this.scene.remove(p.sprite);
    for (const sh of this.shots) this.scene.remove(sh.mesh);
    for (const f of this.fogs.values()) this.dropFog(f);
    this.fogs.clear();
    this.units.clear(); this.buildings.clear(); this.dying = []; this.particles = []; this.shots = []; this.prev.clear();
  }

  private makeFog(team: TeamId, lane: number): FogView {
    const reach = W(RULES.fogReach), g = new THREE.Group(), geo = new THREE.BufferGeometry();
    const x0 = -10, x1 = reach + 12, z0 = -3, z1 = LANE_W + 3;
    geo.setAttribute("position", new THREE.Float32BufferAttribute([x0, 0, z0, x0, 0, z1, x1, 0, z0, x1, 0, z1], 3)); geo.setIndex([0, 1, 2, 2, 1, 3]);
    const view: FogView = { g, front: { value: 0 }, time: { value: 0 }, fade: { value: 0 }, mote: 0 };
    const sheets = QUALITY[this.quality]!.bloom ? 4 : 2; // fewer on a struggling phone
    for (let i = 0; i < sheets; i++) {
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        vertexShader: FOG_VERT, fragmentShader: FOG_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uFront: view.front, uTime: view.time, uFade: view.fade, uLayer: { value: i }, uWidth: { value: LANE_W }, uTint: { value: new THREE.Color(TEAM[team].glow) } },
      }));
      m.position.y = 0.5 + (i * 3.3) / Math.max(1, sheets - 1); m.renderOrder = 5 + i; m.frustumCulled = false; g.add(m);
    }
    g.position.set(team === 0 ? 0 : LANE_LEN, 0, LZ(lane)); g.scale.x = team === 0 ? 1 : -1; this.scene.add(g);
    return view;
  }
  private dropFog(f: FogView): void {
    this.scene.remove(f.g);
    f.g.traverse(o => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose(); });
  }

  private spark(x: number, y: number, z: number, color: number, life: number, s0: number, s1: number, vx = 0, vy = 0, vz = 0, grav = 0, now = performance.now()): void {
    if (this.particles.length > 500) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    sprite.position.set(x, y, z); sprite.scale.setScalar(s0); this.scene.add(sprite);
    this.particles.push({ sprite, vx, vy, vz, born: now, life, s0, s1, grav });
  }
  private shoot(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, now: number, life: number, arc = 0, beam = false, onEnd?: () => void): void {
    this.scene.add(mesh); this.shots.push({ mesh, from, to, born: now, life, arc, beam, onEnd });
  }

  addEvents(s: GameState, events: SimEvent[], now: number): void {
    const rnd = (a: number) => (Math.random() - 0.5) * a; // cosmetic only
    const basic = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
    const bright = (color: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, toneMapped: false });
    /** Where a unit's attack leaves it and where it lands, at the right heights (flyers, giants). */
    let lane = 0; // the lane of the event being drawn
    const Zy = (y: number) => LZ(lane) + W(y);
    const muzzle = (id: number, x: number, y: number) => { const v = this.units.get(id); return new THREE.Vector3(W(x), v ? v.alt + v.def.height * scaleOf(v.type) * 0.62 : 0.9, Zy(y)); };
    const chest = (id: number, x: number, y: number) => { const v = this.units.get(id); return new THREE.Vector3(W(x), v ? v.alt + v.def.height * scaleOf(v.type) * 0.45 : 0.7, Zy(y)); };
    const lightning = (from: THREE.Vector3, to: THREE.Vector3, color: number) => {
      const n = Math.max(2, Math.round(from.distanceTo(to) / 1.6)); let a = from;
      for (let i = 1; i <= n; i++) {
        const b = from.clone().lerp(to, i / n); if (i < n) b.add(new THREE.Vector3(rnd(0.9), rnd(0.9), rnd(0.9)));
        this.shoot(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), bright(color)), a, b, now, 190, 0, true); a = b;
      }
      this.spark(to.x, to.y, to.z, color, 240, 1.6, 0.3, 0, 0, 0, 0, now);
    };
    for (const e of events) {
      lane = "lane" in e ? e.lane : 0;
      if (e.t === "shot") {
        const v = this.units.get(e.id); if (v) v.lastAttack = now;
        const from = muzzle(e.id, e.x1, e.y1), to = e.to ? chest(e.to, e.x2, e.y2) : new THREE.Vector3(W(e.x2), 3, Zy(e.y2));
        const style = SHOTS[e.unit], kind = style?.kind ?? "melee", color = style?.color ?? MELEE[e.unit] ?? 0xffe2a8;
        if (kind === "bolt") this.shoot(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.05), basic(color)), from, to, now, 170);
        else if (kind === "gun") {
          this.spark(from.x, from.y, from.z, 0xffd27a, 110, 1.6, 0.4, 0, 0, 0, 0, now);
          this.spark(from.x, from.y + 0.1, from.z, 0x8d8a92, 700, 0.6, 1.8, rnd(0.6), 0.9, rnd(0.6), 0, now);
          this.shoot(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), bright(color)), from, to, now, 90, 0, true);
          this.spark(to.x, to.y, to.z, 0xffffff, 150, 0.7, 0.1, 0, 0, 0, 0, now);
        } else if (kind === "orb") {
          const burst = e.unit === "lich" || e.unit === "seraph";
          this.shoot(new THREE.Mesh(new THREE.IcosahedronGeometry(burst ? 0.24 : 0.16, 1), bright(color)), from, to, now, 110 + from.distanceTo(to) * 34, burst ? 1.2 : 0.5, false, () => {
            const t = performance.now(), n = burst ? 14 : 5, reach = burst ? W(UNITS[e.unit]!.splash) * 2 : 1.5;
            this.spark(to.x, to.y, to.z, color, 260, burst ? 4 : 1.2, 0.2, 0, 0, 0, 0, t);
            for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.spark(to.x, burst ? 0.3 : to.y, to.z, color, 420 + Math.random() * 240, 0.7, 0.15, Math.cos(a) * reach, burst ? 0.6 : 1 + rnd(1), Math.sin(a) * reach, 0, t); }
          });
        } else if (kind === "stone") {
          this.shoot(this.mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color, flatShading: true })), from, to, now, 700, 6, false, () => {
            const t = performance.now();
            this.spark(to.x, 0.6, to.z, 0xffd9a0, 260, 2, e.unit === "hellmouth" ? 14 : 9, 0, 0, 0, 0, t);
            if (e.unit === "hellmouth") for (let i = 0; i < 16; i++) this.spark(to.x + rnd(4), 0.3, to.z + rnd(4), i % 2 ? 0xff5a1f : 0xffc04a, 900 + Math.random() * 600, 1.2, 0.2, rnd(2), 2 + Math.random() * 3, rnd(2), 0, t);
            for (let i = 0; i < 12; i++) this.spark(to.x + rnd(2), 0.4, to.z + rnd(2), 0x6d6050, 700 + Math.random() * 500, 1.4, 4.5, rnd(6), 2 + Math.random() * 4, rnd(6), -6, t);
          });
        } else if (kind === "flame") {
          const far = e.unit === "wyrm", d = to.clone().sub(from), n = far ? 9 : 6;
          for (let i = 0; i < n; i++) this.spark(from.x, from.y, from.z, i % 2 ? color : 0xffc04a, 320 + Math.random() * 200, far ? 0.5 : 0.6, far ? 1.9 : 2.2, d.x * 2.6 + rnd(far ? 1.6 : 3), d.y * 2.6 + 0.6 + rnd(1.4), d.z * 2.6 + rnd(far ? 1.6 : 3), 0, now);
        } else if (kind === "stake") {
          // the stake carries on through its victim for the length of the line it skewers
          const dir = to.clone().sub(from).setY(0).normalize(), end = from.clone().addScaledVector(dir, W(UNITS.ballista!.line!.length)).setY(to.y);
          this.shoot(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.09), basic(color)), from, end, now, 230, 0, false, () => { for (let i = 0; i < 5; i++) this.spark(end.x + rnd(0.6), 0.3, end.z + rnd(0.6), 0x6d6050, 500, 0.8, 2.2, rnd(2), 1.5, rnd(2), -4, performance.now()); });
          for (let i = 1; i <= 4; i++) this.spark(from.x + dir.x * i * 3, to.y, from.z + dir.z * i * 3, 0xdfe6ff, 200 + i * 40, 0.5, 0.1, 0, 0, 0, 0, now);
        } else if (kind === "lightning") lightning(from, to, color);
        else if (kind === "beam") {
          const hq = e.unit === "hq"; if (hq) from.set(W(e.x1), 8 * this.hqScale, midZ(this.lanes) + 8.4 * this.hqScale); else from.y = 4.9;
          this.shoot(new THREE.Mesh(new THREE.CylinderGeometry(hq ? 0.09 : 0.06, hq ? 0.09 : 0.06, 1, 5), bright(TEAM[e.team].glow)), from, to, now, hq ? 200 : 180, 0, true);
          this.spark(to.x, to.y, to.z, TEAM[e.team].glow, hq ? 260 : 200, hq ? 1.2 : 0.6, hq ? 3 : 1.5, 0, 0, 0, 0, now);
        } else {
          const big = e.unit === "colossus" || e.unit === "headsman" || e.unit === "penitent" || e.unit === "titan" || e.unit === "ogre" || e.unit === "rider";
          for (let i = 0; i < (big ? 6 : 3); i++) this.spark(to.x + rnd(0.3), to.y + rnd(0.3), to.z + 0.2, color, 150 + Math.random() * 120, big ? 0.9 : 0.55, 0.15, rnd(big ? 5 : 3), 1.5 + rnd(2), rnd(big ? 4 : 2), -9, now);
          if (e.unit === "colossus" || e.unit === "titan" || e.unit === "ogre") for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this.spark(to.x, 0.3, to.z, 0x6d6050, 520, 0.9, 2.4, Math.cos(a) * 4, 0.8, Math.sin(a) * 4, 0, now); }
          else if (e.unit === "countess") for (let i = 0; i < 3; i++) this.spark(to.x, to.y, to.z, 0xff2b45, 420, 0.5, 0.15, (from.x - to.x) * 2.2 + rnd(1), 0.6 + rnd(1), (from.z - to.z) * 2.2 + rnd(1), 0, now); // blood drawn back to her
        }
      } else if (e.t === "arc") lightning(chest(e.from, e.x1, e.y1), chest(e.to, e.x2, e.y2), PAL.storm);
      else if (e.t === "raise") {
        for (let i = 0; i < 12; i++) this.spark(W(e.x) + rnd(0.8), 0.1 + Math.random() * 0.4, Zy(e.y) + rnd(0.8), PAL.venom, 700 + Math.random() * 400, 0.6, 0.1, 0, 1.6 + Math.random() * 2, 0, 0, now);
        this.spark(W(e.x), 0.4, Zy(e.y), PAL.venom, 380, 0.6, 3.4, 0, 0, 0, 0, now);
      } else if (e.t === "built") {
        const k = this.units.get(keeperKey(e.player, e.slot)); if (k) k.lastAttack = now; // the spade comes down
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this.spark(W(e.x), 0.3, Zy(e.y), i % 3 ? 0x6d6050 : 0xe9c56b, 520 + Math.random() * 260, 0.8, 2.2, Math.cos(a) * 3, 1 + Math.random() * 1.5, Math.sin(a) * 3, -2, now); }
      } else if (e.t === "teleport") {
        // a pillar of grave-light where he vanished and where he rises
        for (const [x, z] of [[W(e.fromX), LZ(e.fromLane) + W(e.fromY)], [W(e.x), Zy(e.y)]] as const) {
          this.spark(x, 1.2, z, 0x8dffb0, 420, 1, 6, 0, 0, 0, 0, now);
          for (let i = 0; i < 14; i++) this.spark(x + rnd(0.9), 0.1 + Math.random() * 0.4, z + rnd(0.9), i % 3 ? 0x8dffb0 : 0xffffff, 600 + Math.random() * 500, 0.5, 0.1, 0, 2.5 + Math.random() * 3.5, 0, 0, now);
        }
      } else if (e.t === "storm") {
        this.flash = now;
      } else if (e.t === "bolt") {
        // one volley of a Storm of Wrath: it strikes every enemy soldier, and the sky shows it on a handful of them, in the caster's colour
        const foes = s.units.filter(u => u.team !== e.team && !UNITS[u.type]!.structure), n = Math.min(foes.length, 16), tint = TEAM[e.team].glow;
        if (n) this.flash = now;
        for (let i = 0; i < n; i++) {
          const u = foes[Math.floor(((i + Math.random()) * foes.length) / n)]!; lane = u.lane;
          const to = chest(u.id, u.x, u.y), top = new THREE.Vector3(to.x + rnd(7), 42, to.z - 4 + rnd(7));
          let a = top;
          for (let k = 1; k <= 7; k++) {
            const b = top.clone().lerp(to, k / 7); if (k < 7) b.add(new THREE.Vector3(rnd(2.6), 0, rnd(2.6)));
            this.shoot(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1, 4), bright(k % 3 ? 0xe8ecff : tint)), a, b, now, 230, 0, true); a = b;
          }
          this.spark(to.x, to.y, to.z, 0xffffff, 260, 2.6, 0.4, 0, 0, 0, 0, now);
          for (let k = 0; k < 5; k++) this.spark(to.x, 0.3, to.z, tint, 380 + Math.random() * 200, 0.6, 0.1, rnd(7), 2 + Math.random() * 3, rnd(7), -9, now);
        }
      } else if (e.t === "vultures") {
        // they rise out of the home shrine in a swirl of ghost-fire and grave dust
        const x = W(e.team === 0 ? MAP.beaconX[0]! : MAP.laneLength - MAP.beaconX[0]!);
        for (const y of RULES.vultureY) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; this.spark(x + Math.cos(a) * 1.4, 0.4 + i * 0.5, Zy(y) + Math.sin(a) * 1.4, i % 3 ? PAL.ghost : 0xe2d7bc, 700 + i * 60, 0.7, 0.1, Math.cos(a + 1.6) * 2, 3 + Math.random() * 2, Math.sin(a + 1.6) * 2, 0, now); }
      } else if (e.t === "urn") {
        // the bird opens its claws: the urn tumbles down trailing ghost-fire
        const bird = this.units.get(vultureKey(e.owner, e.bird)); if (bird) bird.lastAttack = now;
        const from = new THREE.Vector3(W(e.x1), bird ? bird.alt + 0.4 : 7.5, Zy(e.y1)), to = new THREE.Vector3(W(e.x2), 0.2, Zy(e.y2));
        const urn = new THREE.Group(), pot = this.mesh(URN.lit, this.lit), fire = this.mesh(URN.glow, this.glow);
        urn.add(pot, fire); urn.scale.setScalar(1.3);
        this.shoot(urn, from, to, now, RULES.vultureFallTicks * (1000 / TICK_RATE), -1.2);
        for (let i = 0; i < 6; i++) this.spark(from.x + rnd(0.4), from.y - i * 0.5, from.z + rnd(0.4), PAL.ghost, 500 + i * 70, 0.5, 0.05, 0, -1.5, 0, 0, now);
      } else if (e.t === "burst") {
        // the urn shatters: a white heart, a ring of ghost-fire racing out to the edge of the blast, bone shards and a pall of ash
        const x = W(e.x), z = Zy(e.y), r = W(RULES.vultureRadius);
        this.spark(x, 0.8, z, 0xffffff, 240, 2, 9, 0, 0, 0, 0, now); this.spark(x, 0.6, z, PAL.ghost, 520, 3, r * 2.2, 0, 0, 0, 0, now);
        for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2 + rnd(0.2), v = r / 0.5; this.spark(x, 0.35, z, i % 4 ? PAL.ghost : 0xd9ccff, 500, 1.3, 0.3, Math.cos(a) * v, 0.4, Math.sin(a) * v, 0, now); }
        for (let i = 0; i < 12; i++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 6; this.spark(x, 0.5, z, 0xe2d7bc, 700 + Math.random() * 400, 0.45, 0.2, Math.cos(a) * v, 5 + Math.random() * 6, Math.sin(a) * v, -16, now); }
        for (let i = 0; i < 7; i++) this.spark(x + rnd(r), 0.5, z + rnd(r), 0x4a4658, 1300 + Math.random() * 600, 1.5, 4.5, rnd(1), 1 + Math.random(), rnd(1), 0, now);
      } else if (e.t === "leave") {
        for (let i = 0; i < 8; i++) this.spark(W(e.x) + rnd(0.8), 0.4 + Math.random() * 1.6, Zy(e.y) + rnd(0.8), i % 2 ? 0xe9c56b : 0x8d8a92, 600 + Math.random() * 300, 0.5, 1.6, rnd(1), 1.2, rnd(1), 0, now);
      } else if (e.t === "heal") {
        const v = this.units.get(e.id); if (v) v.lastAttack = now;
        const from = new THREE.Vector3(W(e.x1), 1.3, Zy(e.y1)), to = new THREE.Vector3(W(e.x2), 0.7, Zy(e.y2));
        this.shoot(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.heal).multiplyScalar(1.6), transparent: true, toneMapped: false })), from, to, now, 260, 0, true);
        for (let i = 0; i < 4; i++) this.spark(to.x + rnd(0.6), 0.3 + Math.random() * 0.6, to.z + rnd(0.6), PAL.heal, 600 + Math.random() * 300, 0.45, 0.08, 0, 1.4, 0, 0, now);
      } else if (e.t === "death") {
        // taken by a Deadly Fog: the breath leaves him as a pale green wisp
        if (!UNITS[e.unit]?.structure && s.fogs.some(f => f.team !== e.team && f.lane === e.lane && (f.team === 0 ? e.x : MAP.laneLength - e.x) <= RULES.fogReach)) {
          this.spark(W(e.x), 1.2, Zy(e.y), 0x9dffb8, 700, 0.8, 3.2, 0, 1.2, 0, 0, now);
          for (let i = 0; i < 5; i++) this.spark(W(e.x) + rnd(0.7), 0.4 + Math.random(), Zy(e.y) + rnd(0.7), i % 2 ? 0x7dffa0 : 0xe9ffe8, 900 + Math.random() * 600, 0.45, 0.05, rnd(0.8), 2 + Math.random() * 2.5, rnd(0.8), 0, now);
        }
        if (UNITS[e.unit]?.structure) for (let i = 0; i < (e.unit === MAP.baseTower ? 44 : 26); i++) this.spark(W(e.x) + rnd(2), 0.5 + Math.random() * 4, Zy(e.y) + rnd(2), i % 5 ? 0x6d6050 : 0xffb060, 900 + Math.random() * 700, 1.4, 4.5, rnd(5), 1 + Math.random() * 3, rnd(5), -4, now);
        else if (e.unit === "colossus") for (let i = 0; i < 18; i++) this.spark(W(e.x) + rnd(2.4), 0.4 + Math.random() * 3, Zy(e.y) + rnd(2.4), i % 3 ? 0xcdbf9f : TEAM[e.team].glow, 800 + Math.random() * 500, 1, 3, rnd(4), 1 + Math.random() * 2, rnd(4), -3, now);
        else for (let i = 0; i < 4; i++) this.spark(W(e.x) + rnd(0.6), 0.3, Zy(e.y) + rnd(0.6), e.unit === "skeleton" ? 0xb9ae93 : e.unit === "shade" ? PAL.ghost : 0x5d5348, 600 + Math.random() * 300, 0.6, 1.8, rnd(1.2), 1, rnd(1.2), 0, now);
      } else if (e.t === "capture") {
        const b = s.beacons.find(q => q.id === e.beacon)!;
        for (const z of SHRINE_Z) for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; this.spark(W(b.x), 0.6, LZ(b.lane) + z, TEAM[e.team].glow, 900, 1.6, 0.3, Math.cos(a) * 9, 3 + Math.random() * 3, Math.sin(a) * 9, -5, now); }
      }
    }
  }

  private makeUnit(type: string, team: TeamId, now: number): UnitView {
    const def = unitModel(type, team), root = new THREE.Group(), rig = new THREE.Group(), lit = def.ghost ? this.ghost : this.lit;
    root.add(rig);
    rig.add(this.mesh(def.body, lit));
    if (def.glow) rig.add(new THREE.Mesh(def.glow, this.glow));
    const legs = (def.legs ?? []).map(l => { const m = this.mesh(l.geo, lit); m.position.set(...l.pivot); rig.add(m); return m; });
    const parts = (def.parts ?? []).map(p => {
      const node = new THREE.Group(); node.position.set(...p.pivot);
      node.add(this.mesh(p.geo, lit)); if (p.glow) node.add(new THREE.Mesh(p.glow, this.glow));
      rig.add(node); return { node, def: p };
    });
    const weapon = new THREE.Group(); weapon.position.set(...def.weapon.pivot);
    weapon.add(this.mesh(def.weapon.geo, lit)); if (def.weapon.glow) weapon.add(new THREE.Mesh(def.weapon.glow, this.glow));
    rig.add(weapon);
    if (def.aura) { // sanctuary: a faint ring on the ground showing how far the blessing reaches
      const ring = new THREE.Mesh(new THREE.RingGeometry(def.aura / UNIT_SCALE - 0.5, def.aura / UNIT_SCALE, 48), this.halo);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; root.add(ring);
    }
    this.scene.add(root);
    return { root, rig, legs, weapon, parts, def, type, team, lastAttack: -1e9, born: now, yaw: 0, walk: 0, alt: 0 };
  }
  private makeBuilding(unit: string, team: TeamId): THREE.Group {
    const g = new THREE.Group(), c = chantryModel(team), whole = wholeModel(unit, team);
    const chapel = this.mesh(c.lit, this.lit), glass = new THREE.Mesh(c.glow, this.glow);
    chapel.position.x = glass.position.x = -0.45;
    whole.lit.computeBoundingBox();
    const st = this.mesh(whole.lit, this.statue), k = Math.min(0.55, 1.9 / unitModel(unit, team).height, 2.0 / (whole.lit.boundingBox!.max.x - whole.lit.boundingBox!.min.x));
    st.scale.setScalar(k); st.position.set(1.45, 0.5, 0.9);
    g.add(chapel, glass, st); g.scale.set(team === 0 ? BUILDING_SCALE : -BUILDING_SCALE, BUILDING_SCALE, BUILDING_SCALE); this.scene.add(g);
    return g;
  }

  draw(s: GameState, v: ViewState, alpha: number, now: number, dt: number): void {
    this.placeCamera();
    const myTeam = s.players[v.me]!.team;
    // lightning lights the whole field for a moment; while a storm rages the night itself turns colder and flickers
    const glare = Math.max(0, 1 - (now - this.flash) / 320), raging = s.storms.length > 0 ? 0.5 + 0.5 * Math.sin(now / 90) * Math.sin(now / 37) : 0;
    this.moon.intensity = 2.5 + glare * 7 + raging * 0.9;

    // Deadly Fogs: the bank rolls with the sim's front, breathes in when called and thins away as it lifts
    for (const [owner, f] of this.fogs) if (!s.fogs.some(q => q.owner === owner)) { this.dropFog(f); this.fogs.delete(owner); }
    for (const q of s.fogs) {
      let f = this.fogs.get(q.owner);
      if (!f) { f = this.makeFog(q.team, q.lane); this.fogs.set(q.owner, f); }
      const age = s.tick + alpha - q.from, front = (W(RULES.fogReach) * Math.min(age, RULES.fogRollTicks)) / RULES.fogRollTicks;
      f.front.value = front + 4; f.time.value = now / 1000;
      f.fade.value = Math.min(1, age / 25) * Math.max(0, Math.min(1, (RULES.fogRollTicks + RULES.fogHoldTicks - age) / 60));
      if (now - f.mote > 45 && f.fade.value > 0.3) { // pale motes torn loose along the leading edge
        f.mote = now;
        const x = q.team === 0 ? front : LANE_LEN - front, z = LZ(q.lane) + Math.random() * LANE_W;
        this.spark(x + (Math.random() - 0.5) * 6, 0.3 + Math.random() * 2, z, Math.random() < 0.3 ? 0xe9ffe8 : 0x7dffa0, 900 + Math.random() * 700, 0.5, 0.05, (q.team === 0 ? 1 : -1) * (1 + Math.random() * 2), 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 1.5, 0, now);
      }
    }

    // units
    const seen = new Set<number>(), byId = new Map<number, GameState["units"][number]>();
    for (const u of s.units) byId.set(u.id, u);
    const ease = Math.min(1, dt * 0.012);
    // Gravekeepers are posed by the same code as soldiers: they walk, turn and swing a spade, but are not units.
    const walkers = s.keepers.map(k => ({ id: keeperKey(k.owner, k.slot), type: KEEPERS[k.slot].id as string, team: k.team, lane: k.lane, x: k.x, y: k.y, target: 0, dotUntil: 0, slowUntil: 0 }));
    for (const f of s.flights) for (const bird of [0, 1]) walkers.push({ id: vultureKey(f.owner, bird), type: "vulture", team: f.team, lane: f.lane, x: f.x, y: RULES.vultureY[bird]!, target: 0, dotUntil: 0, slowUntil: 0 });
    for (const u of [...s.units, ...walkers]) {
      seen.add(u.id);
      let view = this.units.get(u.id);
      if (!view) { view = this.makeUnit(u.type, u.team, now); this.units.set(u.id, view); }
      const def = view.def, gait = def.gait ?? "walk", sd = UNITS[u.type] ?? { structure: false, range: 1500 }, fixed = sd.structure === true;
      const pr = this.prev.get(u.id) ?? u, moving = pr.x !== u.x || pr.y !== u.y;
      const k0 = scaleOf(u.type), grow = k0 === 1 ? 1 : Math.min(1, 0.4 + (now - view.born) / 350), side = u.team === 0 ? 1 : -1;
      view.root.position.set(W(pr.x + (u.x - pr.x) * alpha), 0, LZ(u.lane) + W(pr.y + (u.y - pr.y) * alpha));
      view.root.scale.set(side * grow * k0, grow * k0, grow * k0);
      view.walk += ((moving ? 1 : 0) - view.walk) * ease;
      const w = view.walk, stride = now * STRIDE[gait] + u.id * 1.7, sw = Math.sin(stride), tt = now * 0.001 + u.id * 0.37;

      // Turn toward whatever it is fighting, or the way it is walking (the model is mirrored for team 1, so the angle is too).
      const foe = u.target ? byId.get(u.target) : undefined;
      const dx = foe ? foe.x - u.x : u.x - pr.x, dz = foe ? foe.y - u.y : u.y - pr.y;
      const want = fixed || (!dx && !dz) ? 0 : Math.max(-1.2, Math.min(1.2, Math.atan2(-dz * side, dx * side)));
      view.yaw += (want - view.yaw) * Math.min(1, dt * 0.009);
      view.root.rotation.y = view.yaw;

      // Attack: 0 → 1 fast, then back.
      const anim = def.weapon.anim, t = (now - view.lastAttack) / (anim === "sling" ? 1300 : anim === "chop" ? 560 : 420);
      const k = t >= 1 ? 0 : t < 0.22 ? t / 0.22 : 1 - (t - 0.22) / 0.78;

      // Body: each gait has its own bob, lean and roll; everything breathes when it stands.
      let y = 0, pitch = 0, roll = 0, legSwing = sw * 0.6 * w;
      if (gait === "walk") { y = Math.abs(sw) * 0.07 * w; pitch = -0.07 * w; roll = sw * 0.04 * w; }
      else if (gait === "shuffle") { y = Math.abs(sw) * 0.04 * w; pitch = -0.05 * w; roll = sw * 0.08 * w; }
      else if (gait === "gallop") { y = Math.abs(Math.sin(stride * 0.5)) * 0.25 * w; pitch = sw * 0.08 * w; legSwing = sw * 0.75 * w; }
      else if (gait === "lope") { y = Math.abs(sw) * 0.14 * w; pitch = sw * 0.13 * w; legSwing = sw * 0.9 * w; }
      else if (gait === "stomp") { y = Math.abs(sw) * 0.1 * w; pitch = -0.04 * w; roll = sw * 0.06 * w; legSwing = sw * 0.45 * w; }
      else if (gait === "float") { y = 0.22 + Math.sin(tt * 2) * 0.1; pitch = -0.12 * w; roll = Math.sin(tt * 1.3) * 0.04; }
      else if (gait === "roll") pitch = Math.sin(stride * 2) * 0.008 * w;
      else { y = (def.hover ?? 3) + Math.sin(tt * 2.2) * 0.22; pitch = -0.14 * w; roll = Math.sin(tt * 1.1) * 0.09; legSwing = Math.sin(tt * 2) * 0.12; }
      const melee = sd.range <= RULES.meleeReach, heavy = gait === "roll" || fixed;
      const rig = view.rig;
      rig.position.set(heavy ? 0 : melee ? 0.32 * k : -0.1 * k, y, 0);
      rig.rotation.set(roll, 0, pitch + (heavy ? 0 : melee ? -0.17 * k : 0.06 * k));
      rig.scale.y = fixed ? 1 : 1 + Math.sin(tt * 1.8) * 0.014 * (1 - w);
      view.alt = y * k0;
      view.legs.forEach((l, i) => { l.rotation.z = i % 2 ? -legSwing : legSwing; });

      const wp = view.weapon, px = def.weapon.pivot[0];
      wp.position.x = px; wp.rotation.z = fixed ? 0 : Math.sin(tt * 1.5) * 0.035;
      if (anim === "recoil") wp.position.x = px - 0.3 * k;
      else if (anim === "swing") wp.rotation.z += -1.5 * k;
      else if (anim === "thrust") { wp.rotation.z += -0.55 * k; wp.position.x = px + 0.25 * k; }
      else if (anim === "raise") wp.rotation.z += 0.45 * k;
      else if (anim === "lance") wp.position.x = px + 0.9 * k;
      else if (anim === "chop") wp.rotation.z += (t < 0.22 && t >= 0 ? 0.5 * (1 - k) : 0) - 1.9 * k;
      else if (anim === "bite") { wp.position.x = px + 0.38 * k; wp.rotation.z += -0.28 * k; }
      else if (anim === "cast") { wp.rotation.z += 0.5 * k; wp.position.y = def.weapon.pivot[1] + 0.2 * k; }
      else wp.rotation.z = -2.2 * k;

      for (const { node, def: p } of view.parts) {
        const a = p.amp ?? 1, ph = p.phase ?? 0;
        if (p.motion === "arm") node.rotation.z = (p.side ?? 1) * legSwing * 0.9 - k * 1.1 * a;
        else if (p.motion === "wing") node.rotation.x = -(p.side ?? 1) * (0.12 + Math.sin(tt * (p.speed ?? 9) + ph) * 0.55 * a);
        else if (p.motion === "tail") node.rotation.y = Math.sin(tt * 3 + ph) * 0.35 * a;
        else if (p.motion === "cape") node.rotation.z = -(0.06 + 0.5 * w * a) + Math.sin(tt * 5 + ph) * (0.04 + 0.07 * w) * a;
        else if (p.motion === "head") node.rotation.z = Math.sin(tt * 1.7 + ph) * 0.07 * a - k * 0.2;
        else if (p.motion === "sway") node.rotation.z = Math.sin(tt * 2.4 + ph) * (0.12 + 0.22 * w) * a - 0.2 * w * a;
        else if (p.motion === "bob") { node.position.y = p.pivot[1] + Math.sin(tt * 2 + ph) * 0.14 * a + 0.3 * k; node.rotation.y = Math.sin(tt * 0.9 + ph) * 0.3; }
        else if (p.motion === "orbit") node.rotation.y = tt * (p.speed ?? 1.5) + ph;
        else node.rotation.z = -((u.team === 0 ? u.x : MAP.laneLength - u.x) / 1000 / k0) / a; // wheel: turns with the ground covered
      }

      // Afflictions show: burning units shed embers, cursed or frozen ones a cold mist.
      if (s.tick < u.dotUntil && Math.random() < dt * 0.012) this.spark(view.root.position.x + (Math.random() - 0.5) * 0.5, view.alt + 0.6 + Math.random() * 1.2, view.root.position.z + (Math.random() - 0.5) * 0.5, 0xff7a1a, 420, 0.5, 0.1, 0, 1.6, 0, 0, now);
      if (s.tick < u.slowUntil && Math.random() < dt * 0.009) this.spark(view.root.position.x + (Math.random() - 0.5) * 0.7, view.alt + 0.2 + Math.random() * 0.5, view.root.position.z + (Math.random() - 0.5) * 0.7, PAL.frost, 520, 0.5, 0.9, 0, 0.3, 0, 0, now);
    }
    for (const [id, view] of this.units) if (!seen.has(id) && view.type === "vulture") { // its errand done, it comes apart into ash and ghost-light
      this.units.delete(id); this.scene.remove(view.root);
      const at = view.root.position;
      for (let i = 0; i < 16; i++) this.spark(at.x + (Math.random() - 0.5) * 3, view.alt + Math.random() * 2.5, at.z + (Math.random() - 0.5) * 3, i % 3 ? PAL.ghost : 0xe2d7bc, 700 + Math.random() * 600, 0.8, 0.1, (Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3, 0, now);
    }
    for (const [id, view] of this.units) if (!seen.has(id)) { this.units.delete(id); this.dying.push({ root: view.root, rig: view.rig, born: now, structure: scaleOf(view.type) === 1, alt: view.rig.position.y }); }
    this.dying = this.dying.filter(d => {
      const t = (now - d.born) / 1500;
      if (t >= 1) { this.scene.remove(d.root); return false; }
      if (d.structure) { d.root.position.y = -t * 7; d.root.rotation.z = t * 0.25; return true; } // a tower crumbles into the ground
      d.rig.position.y = d.alt * Math.max(0, 1 - t * 3.2) ** 2; // whatever was in the air comes down
      d.root.rotation.z = Math.min(1, t * 5) * (Math.PI / 2) * Math.sign(d.root.scale.x);
      d.root.position.y = -Math.max(0, t - 0.35) * 1.4;
      return true;
    });

    // buildings rise out of the ground while under construction
    const live = new Set<number>();
    for (const b of s.buildings) {
      live.add(b.id);
      let g = this.buildings.get(b.id);
      if (!g) { g = this.makeBuilding(b.unit, b.team); const p = cellCenter(b.team, b.col, b.row); g.position.set(W(p.x), 0, LZ(b.lane) + W(p.y)); this.buildings.set(b.id, g); }
      g.scale.y = BUILDING_SCALE * Math.min(1, 0.15 + (s.tick - b.readyTick + alpha) / 7); // it springs up the moment the keeper arrives
    }
    for (const [id, g] of this.buildings) if (!live.has(id)) { this.scene.remove(g); this.buildings.delete(id); }

    // shrines
    s.beacons.forEach((b, i) => {
      const sh = this.shrines[i]; if (!sh) return;
      if (sh.owner !== b.owner) {
        sh.owner = b.owner;
        const col = b.owner === null ? NEUTRAL : TEAM[b.owner].glow;
        for (const f of sh.flames) { (f.material as THREE.MeshBasicMaterial).color.set(col).multiplyScalar(1.15); f.visible = b.owner !== null; }
        for (const r of sh.runes) (r.material as THREE.MeshBasicMaterial).color.set(col).multiplyScalar(b.owner === null ? 0.25 : 0.9);
        for (const l of sh.lights) l.color.set(col);
      }
      sh.flames.forEach((f, k) => {
        const flick = 0.85 + Math.sin(now * 0.02 + i * 2 + k * 3) * 0.1 + Math.sin(now * 0.047 + i + k) * 0.08;
        f.scale.set(flick, flick * (1 + Math.sin(now * 0.013 + i + k) * 0.15), flick);
        sh.lights[k]!.intensity = b.owner === null ? 0 : 40 * flick;
        sh.runes[k]!.rotation.z = now * 0.00012 * (k ? 1 : -1);
      });
    });
    if (now - this.lastEmber > 110) { // embers off lit shrines
      this.lastEmber = now;
      s.beacons.forEach(b => { if (b.owner !== null) for (const z of SHRINE_Z) this.spark(W(b.x) + (Math.random() - 0.5) * 0.7, 6, LZ(b.lane) + z, TEAM[b.owner].glow, 900 + Math.random() * 700, 0.3, 0.05, (Math.random() - 0.5) * 1.2, 2.4 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 0, now); });
    }
    this.hqGlow.forEach((g, team) => { // glass dims as the cathedral falls
      const hp = s.teams[team as TeamId].hqHp / hqMax(s);
      (g.material as THREE.MeshBasicMaterial).color.setScalar((0.5 + 1.3 * hp) * (0.94 + Math.sin(now * 0.004 + team) * 0.06));
      if (hp < 0.6 && Math.random() < (0.6 - hp) * 0.5) this.spark(W(hqX(team as TeamId)) + (Math.random() - 0.5) * 8, (9 + Math.random() * 6) * this.hqScale, midZ(this.lanes) + (Math.random() - 0.5) * 12 * this.hqScale, hp < 0.3 ? 0xff6a1a : 0x4a4038, 1400, 2, 6, 0, 3, 0, 0, now);
    });

    // placement and selection markers
    const def = v.selectedUnit ? UNITS[v.selectedUnit] : undefined, placing = def && v.selectedKeeper !== null && v.hoverCell;
    this.hover.visible = this.range.visible = !!placing;
    if (def && placing) {
      const p = cellCenter(myTeam, v.hoverCell!.col, v.hoverCell!.row);
      const ok = canPlan(s, myTeam, v.hoverCell!.lane, v.hoverCell!.col, v.hoverCell!.row) && s.players[v.me]!.credits >= def.cost;
      this.hover.position.set(W(p.x), 0.16, LZ(v.hoverCell!.lane) + W(p.y)); (this.hover.material as THREE.MeshBasicMaterial).color.set(ok ? 0x7dff9a : 0xff5a4a);
      this.range.position.set(W(p.x), 0.17, LZ(v.hoverCell!.lane) + W(p.y)); this.range.scale.setScalar(W(def.range));
    }
    // my keepers: a ring under the selected one, a pennant where each was sent, a ghost footprint for every chantry on order
    let ghosts = 0;
    this.keeperRing.visible = this.wayMark.visible = false;
    for (const k of s.keepers) {
      if (k.owner !== v.me) continue;
      const view = this.units.get(keeperKey(k.owner, k.slot)), chosen = k.slot === v.selectedKeeper;
      if (chosen && view) {
        this.keeperRing.visible = true; this.keeperRing.position.set(view.root.position.x, 0.19, view.root.position.z); this.keeperRing.rotation.z = -now * 0.0015;
        if (k.jobs.length === 0 && (k.x !== k.tx || k.y !== k.ty || k.lane !== k.tlane)) { this.wayMark.visible = true; this.wayMark.position.set(W(k.tx), 0.2, LZ(k.tlane) + W(k.ty)); this.wayMark.scale.setScalar(0.8 + Math.sin(now * 0.008) * 0.15); }
      }
      for (const j of k.jobs) {
        let g = this.ghostMarks[ghosts];
        if (!g) { g = this.hover.clone(); g.material = new THREE.MeshBasicMaterial({ color: 0xe9c56b, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }); this.scene.add(g); this.ghostMarks.push(g); }
        const p = cellCenter(k.team, j.col, j.row);
        g.visible = true; g.position.set(W(p.x), 0.15, LZ(j.lane) + W(p.y)); (g.material as THREE.MeshBasicMaterial).opacity = (chosen ? 0.34 : 0.2) + Math.sin(now * 0.006 + ghosts) * 0.08;
        ghosts++;
      }
    }
    for (let i = ghosts; i < this.ghostMarks.length; i++) this.ghostMarks[i]!.visible = false;
    const sel = s.buildings.find(b => b.id === v.selectedBuilding);
    this.selRing.visible = !!sel;
    if (sel) { const p = cellCenter(sel.team, sel.col, sel.row); this.selRing.position.set(W(p.x), 0.18, LZ(sel.lane) + W(p.y)); this.selRing.rotation.z = now * 0.001; }

    // particles and projectiles
    const sec = dt / 1000;
    this.particles = this.particles.filter(p => {
      const t = (now - p.born) / p.life;
      if (t >= 1) { this.scene.remove(p.sprite); p.sprite.material.dispose(); return false; }
      p.vy += p.grav * sec;
      p.sprite.position.x += p.vx * sec; p.sprite.position.y = Math.max(0.1, p.sprite.position.y + p.vy * sec); p.sprite.position.z += p.vz * sec;
      p.sprite.scale.setScalar(p.s0 + (p.s1 - p.s0) * t); p.sprite.material.opacity = 1 - t * t;
      return true;
    });
    this.shots = this.shots.filter(sh => {
      const t = (now - sh.born) / sh.life;
      if (t >= 1) { this.scene.remove(sh.mesh); sh.onEnd?.(); return false; }
      if (sh.beam) {
        const d = sh.to.clone().sub(sh.from), len = d.length();
        sh.mesh.position.copy(sh.from).addScaledVector(d, 0.5); sh.mesh.scale.set(1, len, 1);
        sh.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        ((sh.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - t;
      } else {
        sh.mesh.position.lerpVectors(sh.from, sh.to, t); sh.mesh.position.y += Math.sin(t * Math.PI) * sh.arc;
        sh.mesh.rotation.y = -Math.atan2(sh.to.z - sh.from.z, sh.to.x - sh.from.x);
        if (sh.arc) sh.mesh.rotation.x = now * 0.01;
      }
      return true;
    });

    if (QUALITY[this.quality]!.bloom) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.pace(dt);

    // health bars on a crisp 2D overlay
    const c = this.overlay.getContext("2d")!, dpr = this.overlay.width / this.renderer.domElement.clientWidth;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, this.overlay.width, this.overlay.height);
    const cw = this.renderer.domElement.clientWidth, ch = this.renderer.domElement.clientHeight, p = new THREE.Vector3();
    for (const u of s.units) {
      const max = UNITS[u.type]!.hp, view = this.units.get(u.id);
      if (u.hp >= max || !view) continue;
      const tower = scaleOf(u.type) === 1;
      p.set(view.root.position.x, view.alt + view.def.height * scaleOf(u.type) + 0.3, view.root.position.z).project(this.camera);
      const x = (p.x * 0.5 + 0.5) * cw, y = (-p.y * 0.5 + 0.5) * ch, w = tower ? 44 : view.def.height > 5 ? 34 : view.def.height > 3.5 || max > 450 ? 22 : 16;
      if (x < -20 || x > cw + 20) continue;
      c.fillStyle = "rgba(8,7,11,0.85)"; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
      c.fillStyle = u.team === myTeam ? "#8fd18a" : "#e2685c"; c.fillRect(x - w / 2, y, (w * u.hp) / max, 3);
    }
    // the cathedral's health, always shown: over the cathedral itself and over each chapel of its close (they are one building, with one life)
    const full = RULES.hqHp * s.laneCount, mid = midZ(this.lanes), nave = 9.4 * this.hqScale;
    c.font = "600 11px Cinzel, serif"; c.textAlign = "center";
    for (const team of [0, 1] as const) {
      const hp = s.teams[team].hqHp, spots: [number, number][] = [[mid + 7 * this.hqScale, 22 * this.hqScale]];
      for (let l = 0; l < this.lanes; l++) if (Math.abs(LZ(l) + MID_Z - mid) >= nave) spots.push([LZ(l) + MID_Z, 12.5]);
      for (const [z, up] of spots) {
        p.set(W(hqX(team)), up, z).project(this.camera);
        const x = (p.x * 0.5 + 0.5) * cw, y = Math.max(74, (-p.y * 0.5 + 0.5) * ch), w = 150;
        if (x < -w || x > cw + w || p.z > 1) continue;
        c.fillStyle = "rgba(8,7,11,0.88)"; c.fillRect(x - w / 2 - 2, y - 2, w + 4, 11);
        c.fillStyle = team === myTeam ? "#5f8fe0" : "#d8574c"; if (TEAM[team].css) c.fillStyle = TEAM[team].css; c.fillRect(x - w / 2, y, (w * hp) / full, 7);
        c.strokeStyle = "#c9a85a"; c.lineWidth = 1; c.strokeRect(x - w / 2 - 1.5, y - 1.5, w + 3, 10);
        c.fillStyle = "#efe6cf"; c.shadowColor = "#000"; c.shadowBlur = 4; c.fillText(`${team === myTeam ? "Your" : "Enemy"} cathedral · ${hp}`, x, y - 7); c.shadowBlur = 0;
      }
    }
  }
}
