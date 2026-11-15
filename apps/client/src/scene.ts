import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { KEEPERS, MAP, MERC_ORDER, RULES, UNITS, UNIT_ORDER, canPlan, cellCenter, hqMax, hqX } from "@lw/sim";
import type { GameState, SimEvent, TeamId } from "@lw/sim";
import { PAL, TEAM, box, cathedralModel, chantryModel, cloisterModel, fenceModel, graveyardModel, merge, precinctModel, shrineModel, unitModel, wholeModel } from "./models";
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
const scaleOf = (type: string): number => (UNITS[type]?.structure ? 1 : UNITS[type] ? UNIT_SCALE : KEEPER_SCALE);

/** Every model the HUD shows a portrait of. */
export const PORTRAITS = [...UNIT_ORDER, ...MERC_ORDER, ...KEEPERS.map(k => k.id)];
/** Gravekeepers are drawn through the same rig as units; this is the id their view is kept under. */
export const keeperKey = (owner: number, slot: number): number => -(owner * 2 + slot + 1);
const KEEPER_SCALE = 0.95;
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
  cantor: { kind: "lightning", color: PAL.storm }, hq: { kind: "beam", color: 0 }, tower: { kind: "beam", color: 0 },
};
const MELEE: Record<string, number> = { titan: 0xffd27a, rider: 0xdfe6ff, ogre: 0xcdbf9f, countess: 0xff3b4f, shade: PAL.ghost, colossus: 0xcdbf9f, headsman: 0xffffff, gargoyle: 0xc8ccd8, hound: 0xe2d7bc };
export const shotKind = (unit: string): Shot | "melee" => SHOTS[unit]?.kind ?? "melee";
interface Particle { sprite: THREE.Sprite; vx: number; vy: number; vz: number; born: number; life: number; s0: number; s1: number; grav: number }
interface Flight { mesh: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; born: number; life: number; arc: number; beam: boolean; onEnd?: () => void }

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
  private dist = 60; private lastEmber = 0; private hqScale = 1;
  camX = 30; // camera target along the lanes, world units
  camZ = MID_Z; // ...and across them
  lanes = 1;    // lanes of the current battlefield
  private world = new THREE.Group(); // everything that depends on the number of lanes

  init(mount: HTMLElement): void {
    const r = this.renderer;
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.4;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.append(r.domElement, this.overlay);
    Object.assign(this.overlay.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
    this.scene.background = new THREE.Color(0x090b14);
    this.scene.fog = new THREE.FogExp2(0x0e0f16, 0.006);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.6, 0.85);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.scene.add(new THREE.HemisphereLight(0xa9afc4, 0x2a2622, 1.15));
    const m = this.moon; m.castShadow = true; m.shadow.mapSize.set(2048, 2048);
    Object.assign(m.shadow.camera, { left: -58, right: 58, top: 44, bottom: -44, near: 1, far: 160 });
    m.shadow.bias = -0.0006; m.shadow.normalBias = 0.04;
    this.scene.add(m, m.target, this.world);
    this.buildWorld();
    this.resize();
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

    // building ground: a paved, walled precinct in front of the cathedral in every lane, with a gate toward each neighbouring lane
    const zoneLen = W(MAP.zoneCols * MAP.cell), yardTex = new THREE.CanvasTexture(courtyardTile(40, 12));
    yardTex.wrapS = yardTex.wrapT = THREE.RepeatWrapping; yardTex.repeat.set((zoneLen + 1.2) / 12, (LANE_W + 1.2) / 12); yardTex.colorSpace = THREE.SRGBColorSpace; yardTex.anisotropy = 8;
    const yardMat = new THREE.MeshStandardMaterial({ map: yardTex, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let l = 0; l < n; l++) for (const team of [0, 1] as const) {
      const rear = W(MAP.zoneStart), x0 = team === 0 ? rear : LANE_LEN - rear - zoneLen;
      const yard = new THREE.Mesh(new THREE.PlaneGeometry(zoneLen + 1.2, LANE_W + 1.2), yardMat);
      yard.rotation.x = -Math.PI / 2; yard.position.set(x0 + zoneLen / 2, 0.03, LZ(l) + MID_Z); yard.receiveShadow = true; s.add(yard);
      const wall = precinctModel(team, zoneLen, LANE_W, l > 0, l < n - 1), g = new THREE.Group();
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
    const el = this.renderer.domElement.parentElement!, w = el.clientWidth, h = el.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    this.renderer.setSize(w, h); this.composer.setSize(w, h); this.bloom.resolution.set(w, h);
    this.overlay.width = w * dpr; this.overlay.height = h * dpr;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    // Far enough to show the whole lane depth, and at least ~46 units of lane width on narrow windows.
    this.dist = Math.max(74, 104 / this.camera.aspect);
    this.clampCam();
  }
  private halfWidth(): number { return this.camera.aspect * Math.tan((FOV * Math.PI) / 360) * this.dist; }
  clampCam(): void {
    const hw = this.halfWidth() - 9;
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
  }
  reset(): void {
    for (const v of this.units.values()) this.scene.remove(v.root);
    for (const d of this.dying) this.scene.remove(d.root);
    for (const b of this.buildings.values()) this.scene.remove(b);
    for (const p of this.particles) this.scene.remove(p.sprite);
    for (const sh of this.shots) this.scene.remove(sh.mesh);
    this.units.clear(); this.buildings.clear(); this.dying = []; this.particles = []; this.shots = []; this.prev.clear();
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
      } else if (e.t === "leave") {
        for (let i = 0; i < 8; i++) this.spark(W(e.x) + rnd(0.8), 0.4 + Math.random() * 1.6, Zy(e.y) + rnd(0.8), i % 2 ? 0xe9c56b : 0x8d8a92, 600 + Math.random() * 300, 0.5, 1.6, rnd(1), 1.2, rnd(1), 0, now);
      } else if (e.t === "heal") {
        const v = this.units.get(e.id); if (v) v.lastAttack = now;
        const from = new THREE.Vector3(W(e.x1), 1.3, Zy(e.y1)), to = new THREE.Vector3(W(e.x2), 0.7, Zy(e.y2));
        this.shoot(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.heal).multiplyScalar(1.6), transparent: true, toneMapped: false })), from, to, now, 260, 0, true);
        for (let i = 0; i < 4; i++) this.spark(to.x + rnd(0.6), 0.3 + Math.random() * 0.6, to.z + rnd(0.6), PAL.heal, 600 + Math.random() * 300, 0.45, 0.08, 0, 1.4, 0, 0, now);
      } else if (e.t === "death") {
        if (e.unit === "tower") for (let i = 0; i < 26; i++) this.spark(W(e.x) + rnd(2), 0.5 + Math.random() * 4, Zy(e.y) + rnd(2), i % 5 ? 0x6d6050 : 0xffb060, 900 + Math.random() * 700, 1.4, 4.5, rnd(5), 1 + Math.random() * 3, rnd(5), -4, now);
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

    // units
    const seen = new Set<number>(), byId = new Map<number, GameState["units"][number]>();
    for (const u of s.units) byId.set(u.id, u);
    const ease = Math.min(1, dt * 0.012);
    // Gravekeepers are posed by the same code as soldiers: they walk, turn and swing a spade, but are not units.
    const walkers = s.keepers.map(k => ({ id: keeperKey(k.owner, k.slot), type: KEEPERS[k.slot].id, team: k.team, lane: k.lane, x: k.x, y: k.y, target: 0, dotUntil: 0, slowUntil: 0 }));
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

    this.composer.render();

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
  }
}
