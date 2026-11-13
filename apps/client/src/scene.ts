import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { LANE_WIDTH, MAP, RULES, UNITS, UNIT_ORDER, canBuild, cellCenter, hqX } from "@lw/sim";
import type { GameState, SimEvent, TeamId } from "@lw/sim";
import { PAL, TEAM, box, cathedralModel, chantryModel, cloisterModel, fenceModel, graveyardModel, merge, precinctModel, shrineModel, unitModel, wholeModel } from "./models";
import type { ModelDef } from "./models";
import { courtyardTile, glowTexture, groundTile, runeTexture } from "./textures";

/** Presentation only: a 3D view drawn FROM GameState. No rules here. World: x along the lane, z across it, y up. */
const W = (milli: number) => milli / 1000;
const LANE_LEN = W(MAP.laneLength), LANE_W = W(LANE_WIDTH), MID_Z = LANE_W / 2;
const PITCH = (52 * Math.PI) / 180, FOV = 30;
const NEUTRAL = 0x8a90a6, UNIT_SCALE = 0.8, BUILDING_SCALE = 0.6;
const SHRINE_Z = [-1.8, LANE_W + 1.8]; // shrines flank the lane instead of standing in it
const FOOT = W(MAP.footprint * MAP.cell); // side of a building's footprint
/** Soldiers are drawn at UNIT_SCALE; structures are modelled at world size. */
const scaleOf = (type: string): number => (UNITS[type]?.structure ? 1 : UNIT_SCALE);

export interface ViewState {
  selectedUnit: string | null;
  hoverCell: { col: number; row: number } | null;
  selectedBuilding: number | null;
  me: number;
}
interface UnitView { root: THREE.Group; legs: THREE.Mesh[]; weapon: THREE.Group; def: ModelDef; type: string; team: TeamId; lastAttack: number; born: number }
interface Particle { sprite: THREE.Sprite; vx: number; vy: number; vz: number; born: number; life: number; s0: number; s1: number; grav: number }
interface Shot { mesh: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; born: number; life: number; arc: number; beam: boolean; onEnd?: () => void }

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
  private glowTex = new THREE.CanvasTexture(glowTexture());
  private units = new Map<number, UnitView>();
  private dying: { root: THREE.Group; born: number; structure: boolean }[] = [];
  private buildings = new Map<number, THREE.Group>();
  private shrines: { flames: THREE.Mesh[]; lights: THREE.PointLight[]; runes: THREE.Mesh[]; owner: TeamId | null | undefined }[] = [];
  private hqGlow: THREE.Mesh[] = [];
  private particles: Particle[] = [];
  private shots: Shot[] = [];
  private prev = new Map<number, { x: number; y: number }>();
  private hover!: THREE.Mesh; private range!: THREE.Mesh; private selRing!: THREE.Mesh;
  private ray = new THREE.Raycaster(); private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private dist = 60; private lastEmber = 0;
  camX = 30; // camera target along the lane, world units

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
    this.buildWorld();
    this.resize();
  }
  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m;
  }

  private buildWorld(): void {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xa9afc4, 0x2a2622, 1.15));
    const m = this.moon; m.castShadow = true; m.shadow.mapSize.set(2048, 2048);
    Object.assign(m.shadow.camera, { left: -58, right: 58, top: 44, bottom: -44, near: 1, far: 160 });
    m.shadow.bias = -0.0006; m.shadow.normalBias = 0.04;
    s.add(m, m.target);

    // ground: one texture tile is 48 x 48 world units, lane band in the middle
    const tex = new THREE.CanvasTexture(groundTile(22, 48, 12, LANE_W, 48));
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.set((LANE_LEN + 240) / 48, 1); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(LANE_LEN + 240, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(LANE_LEN / 2, 0, MID_Z); ground.receiveShadow = true; s.add(ground);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(LANE_LEN + 460, 200), new THREE.MeshStandardMaterial({ color: 0x1b1d26, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(LANE_LEN / 2, -0.05, MID_Z); s.add(far);

    const cloister = this.mesh(cloisterModel(-40, LANE_LEN + 40), this.lit); cloister.position.z = -3.2; s.add(cloister);
    s.add(this.mesh(graveyardModel(-30, LANE_LEN + 30, LANE_W + 1.2), this.lit), this.mesh(fenceModel(-40, LANE_LEN + 40, LANE_W + 5.2), this.lit));

    // lamp posts: warm pools of light along both kerbs
    const lamps: THREE.BufferGeometry[] = [], flames: THREE.BufferGeometry[] = [];
    for (let i = 0, x = 32; x <= LANE_LEN - 30; i++, x += 38) {
      const z = i % 2 ? LANE_W + 1 : -1;
      lamps.push(box(0.5, 0.4, 0.5, PAL.stoneLo, x, 0.2, z), box(0.16, 3.6, 0.16, PAL.ink, x, 2, z), box(0.7, 0.1, 0.7, PAL.ink, x, 3.8, z), box(0.5, 0.1, 0.5, PAL.ink, x, 4.5, z));
      flames.push(box(0.36, 0.56, 0.36, PAL.candle, x, 4.15, z));
      const l = new THREE.PointLight(0xffb060, 90, 26, 1.7); l.position.set(x, 4.4, z); s.add(l);
    }
    s.add(this.mesh(merge(lamps), this.lit), new THREE.Mesh(merge(flames), this.glow));

    for (const team of [0, 1] as const) { // cathedrals
      const c = cathedralModel(team), g = new THREE.Group();
      const glow = new THREE.Mesh(c.glow, this.glow.clone());
      g.add(this.mesh(c.lit, this.lit), glow); this.hqGlow[team] = glow;
      const lamp = new THREE.PointLight(TEAM[team].glow, 60, 34, 1.6); lamp.position.set(0, 6, 12); g.add(lamp);
      g.position.set(W(hqX(team)), 0, MID_Z); s.add(g);
    }

    // building ground: a paved, walled precinct in front of each cathedral
    const zoneLen = W(MAP.zoneCols * MAP.cell), yardTex = new THREE.CanvasTexture(courtyardTile(40, 12));
    yardTex.wrapS = yardTex.wrapT = THREE.RepeatWrapping; yardTex.repeat.set((zoneLen + 1.2) / 12, (LANE_W + 1.2) / 12); yardTex.colorSpace = THREE.SRGBColorSpace; yardTex.anisotropy = 8;
    const yardMat = new THREE.MeshStandardMaterial({ map: yardTex, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const team of [0, 1] as const) {
      const rear = W(MAP.zoneStart), x0 = team === 0 ? rear : LANE_LEN - rear - zoneLen;
      const yard = new THREE.Mesh(new THREE.PlaneGeometry(zoneLen + 1.2, LANE_W + 1.2), yardMat);
      yard.rotation.x = -Math.PI / 2; yard.position.set(x0 + zoneLen / 2, 0.02, MID_Z); yard.receiveShadow = true; s.add(yard);
      const wall = precinctModel(team, zoneLen, LANE_W), g = new THREE.Group();
      g.add(this.mesh(wall.lit, this.lit), new THREE.Mesh(wall.glow, this.glow));
      g.position.x = team === 0 ? rear : LANE_LEN - rear; g.scale.x = team === 0 ? 1 : -1; s.add(g);
    }

    // shrines: each checkpoint is a pair standing just outside the lane, one on either edge
    const runeTex = new THREE.CanvasTexture(runeTexture());
    for (const x of MAP.beaconX) {
      const flames: THREE.Mesh[] = [], lights: THREE.PointLight[] = [], runes: THREE.Mesh[] = [];
      for (const z of SHRINE_Z) {
        const g = new THREE.Group(); g.position.set(W(x), 0, z);
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
  }
  /** World units of lane per screen pixel (for drag scrolling). */
  unitsPerPixel(): number { return (this.halfWidth() * 2) / this.renderer.domElement.clientWidth; }
  /** Visible stretch of the lane as fractions [0..1], for the minimap. */
  viewRange(): [number, number] { const hw = this.halfWidth(); return [Math.max(0, (this.camX - hw) / LANE_LEN), Math.min(1, (this.camX + hw) / LANE_LEN)]; }

  private placeCamera(): void {
    const tz = MID_Z + 0.6;
    this.camera.position.set(this.camX, Math.sin(PITCH) * this.dist, tz + Math.cos(PITCH) * this.dist);
    this.camera.lookAt(this.camX, 0, tz);
    this.moon.position.set(this.camX - 26, 46, MID_Z + 30); this.moon.target.position.set(this.camX, 0, MID_Z);
  }

  /** Screen point → lane coordinates in milli-units, or null if it misses the ground. */
  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
    return hit ? { x: hit.x * 1000, y: hit.z * 1000 } : null;
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
    for (const id of UNIT_ORDER) {
      const sc = new THREE.Scene(), model = wholeModel(id, team), h = unitModel(id, team).height;
      sc.add(new THREE.HemisphereLight(0xc4cdea, 0x4a4450, 2));
      const key = new THREE.DirectionalLight(0xfff0d8, 3.4); key.position.set(-3, 5, 6); sc.add(key); const rim = new THREE.DirectionalLight(0x9ab8ff, 2); rim.position.set(4, 3, -5); sc.add(rim);
      const g = new THREE.Group(); g.add(new THREE.Mesh(model.lit, this.lit)); if (model.glow) g.add(new THREE.Mesh(model.glow, this.glow));
      g.rotation.y = -0.5; sc.add(g);
      const cam = new THREE.PerspectiveCamera(24, 220 / 260, 0.1, 100), wide = id === "dreadknight" || id === "trebuchet";
      cam.position.set(0.4, h * 0.62, wide ? 10.5 : 6.6); cam.lookAt(wide ? 0.4 : 0.3, h * 0.52, 0);
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
    for (const e of events) {
      if (e.t === "shot") {
        const from = new THREE.Vector3(W(e.x1), 0.9, W(e.y1)), to = new THREE.Vector3(W(e.x2), 0.7, W(e.y2));
        const v = this.units.get(e.id); if (v) v.lastAttack = now;
        if (e.unit === "arbalester") this.shoot(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: PAL.bone })), from, to, now, 170);
        else if (e.unit === "trebuchet") {
          from.y = 2.8;
          this.shoot(this.mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: 0x55586a, flatShading: true })), from, to, now, 700, 6, false, () => {
            const t = performance.now();
            this.spark(to.x, 0.6, to.z, 0xffd9a0, 260, 2, 9, 0, 0, 0, 0, t);
            for (let i = 0; i < 12; i++) this.spark(to.x + rnd(2), 0.4, to.z + rnd(2), 0x6d6050, 700 + Math.random() * 500, 1.4, 4.5, rnd(6), 2 + Math.random() * 4, rnd(6), -6, t);
          });
        } else if (e.unit === "zealot") {
          for (let i = 0; i < 6; i++) this.spark(from.x, 1.3, from.z, i % 2 ? 0xff7a1a : 0xffc04a, 320 + Math.random() * 200, 0.6, 2.2, (to.x - from.x) * 2.6 + rnd(3), 1 + rnd(2), (to.z - from.z) * 2.6 + rnd(3), 0, now);
        } else if (e.unit === "hq") {
          from.set(W(e.x1), 8, MID_Z + 8.4);
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM[e.team].glow).multiplyScalar(2), transparent: true, toneMapped: false }));
          this.shoot(beam, from, to, now, 200, 0, true);
          this.spark(to.x, 0.7, to.z, TEAM[e.team].glow, 260, 1.2, 3, 0, 0, 0, 0, now);
        } else if (e.unit === "tower") {
          from.y = 4.9;
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM[e.team].glow).multiplyScalar(2), transparent: true, toneMapped: false }));
          this.shoot(beam, from, to, now, 180, 0, true);
          this.spark(to.x, 0.7, to.z, TEAM[e.team].glow, 200, 0.6, 1.5, 0, 0, 0, 0, now);
        } else for (let i = 0; i < 3; i++) this.spark(to.x + rnd(0.3), 0.8 + rnd(0.3), to.z + 0.2, 0xffe2a8, 150 + Math.random() * 120, 0.55, 0.15, rnd(3), 1.5 + rnd(2), rnd(2), -9, now);
      } else if (e.t === "heal") {
        const v = this.units.get(e.id); if (v) v.lastAttack = now;
        const from = new THREE.Vector3(W(e.x1), 1.3, W(e.y1)), to = new THREE.Vector3(W(e.x2), 0.7, W(e.y2));
        this.shoot(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.heal).multiplyScalar(1.6), transparent: true, toneMapped: false })), from, to, now, 260, 0, true);
        for (let i = 0; i < 4; i++) this.spark(to.x + rnd(0.6), 0.3 + Math.random() * 0.6, to.z + rnd(0.6), PAL.heal, 600 + Math.random() * 300, 0.45, 0.08, 0, 1.4, 0, 0, now);
      } else if (e.t === "death") {
        if (e.unit === "tower") for (let i = 0; i < 26; i++) this.spark(W(e.x) + rnd(2), 0.5 + Math.random() * 4, W(e.y) + rnd(2), i % 5 ? 0x6d6050 : 0xffb060, 900 + Math.random() * 700, 1.4, 4.5, rnd(5), 1 + Math.random() * 3, rnd(5), -4, now);
        else for (let i = 0; i < 4; i++) this.spark(W(e.x) + rnd(0.6), 0.3, W(e.y) + rnd(0.6), 0x5d5348, 600 + Math.random() * 300, 0.6, 1.8, rnd(1.2), 1, rnd(1.2), 0, now);
      } else if (e.t === "capture") {
        const b = s.beacons.find(q => q.id === e.beacon)!;
        for (const z of SHRINE_Z) for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; this.spark(W(b.x), 0.6, z, TEAM[e.team].glow, 900, 1.6, 0.3, Math.cos(a) * 9, 3 + Math.random() * 3, Math.sin(a) * 9, -5, now); }
      }
    }
  }

  private makeUnit(type: string, team: TeamId, now: number): UnitView {
    const def = unitModel(type, team), root = new THREE.Group();
    root.add(this.mesh(def.body, this.lit));
    if (def.glow) root.add(new THREE.Mesh(def.glow, this.glow));
    const legs = (def.legs ?? []).map(l => { const m = this.mesh(l.geo, this.lit); m.position.set(...l.pivot); root.add(m); return m; });
    const weapon = new THREE.Group(); weapon.position.set(...def.weapon.pivot);
    weapon.add(this.mesh(def.weapon.geo, this.lit)); if (def.weapon.glow) weapon.add(new THREE.Mesh(def.weapon.glow, this.glow));
    root.add(weapon); this.scene.add(root);
    return { root, legs, weapon, def, type, team, lastAttack: -1e9, born: now };
  }
  private makeBuilding(unit: string, team: TeamId): THREE.Group {
    const g = new THREE.Group(), c = chantryModel(team), whole = wholeModel(unit, team);
    const chapel = this.mesh(c.lit, this.lit), glass = new THREE.Mesh(c.glow, this.glow);
    chapel.position.x = glass.position.x = -0.45;
    const st = this.mesh(whole.lit, this.statue), k = Math.min(0.55, 1.9 / unitModel(unit, team).height);
    st.scale.setScalar(k); st.position.set(1.45, 0.5, 0.9);
    g.add(chapel, glass, st); g.scale.set(team === 0 ? BUILDING_SCALE : -BUILDING_SCALE, BUILDING_SCALE, BUILDING_SCALE); this.scene.add(g);
    return g;
  }

  draw(s: GameState, v: ViewState, alpha: number, now: number, dt: number): void {
    this.placeCamera();
    const myTeam = s.players[v.me]!.team;

    // units
    const seen = new Set<number>();
    for (const u of s.units) {
      seen.add(u.id);
      let view = this.units.get(u.id);
      if (!view) { view = this.makeUnit(u.type, u.team, now); this.units.set(u.id, view); }
      const pr = this.prev.get(u.id) ?? u, moving = pr.x !== u.x || pr.y !== u.y;
      const k0 = scaleOf(u.type), stride = now * 0.02 + u.id * 1.7, grow = k0 === 1 ? 1 : Math.min(1, 0.4 + (now - view.born) / 350);
      view.root.position.set(W(pr.x + (u.x - pr.x) * alpha), moving ? Math.abs(Math.sin(stride)) * 0.05 : 0, W(pr.y + (u.y - pr.y) * alpha));
      view.root.scale.set((u.team === 0 ? 1 : -1) * grow * k0, grow * k0, grow * k0);
      const swing = moving ? Math.sin(stride) * 0.6 : 0;
      view.legs.forEach((l, i) => { l.rotation.z = i % 2 ? -swing : swing; });
      const anim = view.def.weapon.anim, t = (now - view.lastAttack) / (anim === "sling" ? 1300 : 420);
      const k = t >= 1 ? 0 : t < 0.22 ? t / 0.22 : 1 - (t - 0.22) / 0.78, w = view.weapon, px = view.def.weapon.pivot[0];
      w.position.x = px; w.rotation.z = 0;
      if (anim === "recoil") w.position.x = px - 0.3 * k;
      else if (anim === "swing") w.rotation.z = -1.5 * k;
      else if (anim === "thrust") w.rotation.z = -0.55 * k;
      else if (anim === "raise") w.rotation.z = 0.45 * k;
      else if (anim === "lance") w.position.x = px + 0.9 * k;
      else w.rotation.z = -2.2 * k;
    }
    for (const [id, view] of this.units) if (!seen.has(id)) { this.units.delete(id); this.dying.push({ root: view.root, born: now, structure: scaleOf(view.type) === 1 }); }
    this.dying = this.dying.filter(d => {
      const t = (now - d.born) / 1500;
      if (t >= 1) { this.scene.remove(d.root); return false; }
      if (d.structure) { d.root.position.y = -t * 7; d.root.rotation.z = t * 0.25; return true; } // a tower crumbles into the ground
      d.root.rotation.z = Math.min(1, t * 5) * (Math.PI / 2) * Math.sign(d.root.scale.x);
      d.root.position.y = -Math.max(0, t - 0.35) * 1.4;
      return true;
    });

    // buildings rise out of the ground while under construction
    const live = new Set<number>();
    for (const b of s.buildings) {
      live.add(b.id);
      let g = this.buildings.get(b.id);
      if (!g) { g = this.makeBuilding(b.unit, b.team); const p = cellCenter(b.team, b.col, b.row); g.position.set(W(p.x), 0, W(p.y)); this.buildings.set(b.id, g); }
      g.scale.y = BUILDING_SCALE * Math.max(0.08, Math.min(1, 1 - (b.readyTick - s.tick) / RULES.buildTicks));
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
      s.beacons.forEach(b => { if (b.owner !== null) for (const z of SHRINE_Z) this.spark(W(b.x) + (Math.random() - 0.5) * 0.7, 6, z, TEAM[b.owner].glow, 900 + Math.random() * 700, 0.3, 0.05, (Math.random() - 0.5) * 1.2, 2.4 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 0, now); });
    }
    this.hqGlow.forEach((g, team) => { // glass dims as the cathedral falls
      const hp = s.teams[team as TeamId].hqHp / RULES.hqHp;
      (g.material as THREE.MeshBasicMaterial).color.setScalar((0.5 + 1.3 * hp) * (0.94 + Math.sin(now * 0.004 + team) * 0.06));
      if (hp < 0.6 && Math.random() < (0.6 - hp) * 0.5) this.spark(W(hqX(team as TeamId)) + (Math.random() - 0.5) * 8, 9 + Math.random() * 6, MID_Z + (Math.random() - 0.5) * 12, hp < 0.3 ? 0xff6a1a : 0x4a4038, 1400, 2, 6, 0, 3, 0, 0, now);
    });

    // placement and selection markers
    const def = v.selectedUnit ? UNITS[v.selectedUnit] : undefined;
    this.hover.visible = this.range.visible = !!(def && v.hoverCell);
    if (def && v.hoverCell) {
      const p = cellCenter(myTeam, v.hoverCell.col, v.hoverCell.row);
      const ok = canBuild(s, myTeam, s.players[v.me]!.lane, v.hoverCell.col, v.hoverCell.row) && s.players[v.me]!.credits >= def.cost;
      this.hover.position.set(W(p.x), 0.16, W(p.y)); (this.hover.material as THREE.MeshBasicMaterial).color.set(ok ? 0x7dff9a : 0xff5a4a);
      this.range.position.set(W(p.x), 0.17, W(p.y)); this.range.scale.setScalar(W(def.range));
    }
    const sel = s.buildings.find(b => b.id === v.selectedBuilding);
    this.selRing.visible = !!sel;
    if (sel) { const p = cellCenter(sel.team, sel.col, sel.row); this.selRing.position.set(W(p.x), 0.18, W(p.y)); this.selRing.rotation.z = now * 0.001; }

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
      p.set(view.root.position.x, view.def.height * scaleOf(u.type) + 0.3, view.root.position.z).project(this.camera);
      const x = (p.x * 0.5 + 0.5) * cw, y = (-p.y * 0.5 + 0.5) * ch, w = tower ? 44 : view.def.height > 3.5 ? 22 : 16;
      if (x < -20 || x > cw + 20) continue;
      c.fillStyle = "rgba(8,7,11,0.85)"; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
      c.fillStyle = u.team === myTeam ? "#8fd18a" : "#e2685c"; c.fillRect(x - w / 2, y, (w * u.hp) / max, 3);
    }
  }
}
