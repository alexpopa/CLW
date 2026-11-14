import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Original low-poly models built from primitives at load time. One palette for everything.
 * Axes: +x = forward (toward the enemy for team 0), +y = up, +z = toward the camera.
 * Sizes are in world units (a foot soldier is ~2.5 tall).
 */
export const PAL = {
  ink: 0x0b0a0f, dark: 0x3c3a48, cloth: 0x554c5e, robe: 0x4a3d4c, coat: 0x3b3844, hat: 0x24222b,
  steel: 0x6d7180, steelHi: 0xb4b9c6, bone: 0xe2d7bc, gold: 0xc9a24b, bronze: 0x6d5630,
  wood: 0x6e4a30, woodHi: 0x9c7048, leather: 0x5a4330, horse: 0x38343f,
  stone: 0x7a7d8e, stoneHi: 0xa0a4b6, stoneLo: 0x53566a, roof: 0x484b66,
  flame: 0xff8a2a, heal: 0x9fe8b0, candle: 0xffc978,
  skin: 0xb1907a, pale: 0xd8d0cc, blood: 0x8f1626, wine: 0x47121f, rust: 0x6e4b3a, iron: 0x3d414e, fur: 0x2c282e,
  moss: 0x34402f, hex: 0x4a395c, shadow: 0x1b1930, scale: 0x3b2e33, habit: 0xcbc4b6, night: 0x23283f,
  venom: 0x86f07a, frost: 0x9fd8ff, storm: 0xc9a8ff, ember: 0xff5a1f, ghost: 0x8f7bff,
};
export const TEAM = [
  { main: 0x3b78e6, lo: 0x2350a8, glow: 0x6fb0ff, css: "#4f8ff0" },
  { main: 0xd2382f, lo: 0x8e1d18, glow: 0xff7a5a, css: "#e0483c" },
] as const;
export type Pal = (typeof TEAM)[number];
export type G = THREE.BufferGeometry;

const tmpColor = new THREE.Color();
export function paint(g: G, hex: number): G {
  const n = g.index ? g.toNonIndexed() : g;
  tmpColor.set(hex);
  const count = n.attributes.position!.count, arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { arr[i * 3] = tmpColor.r; arr[i * 3 + 1] = tmpColor.g; arr[i * 3 + 2] = tmpColor.b; }
  n.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return n;
}
export interface Rot { rx?: number; ry?: number; rz?: number }
export const place = (g: G, x: number, y: number, z: number, r: Rot = {}): G => {
  if (r.rx) g.rotateX(r.rx); if (r.ry) g.rotateY(r.ry); if (r.rz) g.rotateZ(r.rz);
  return g.translate(x, y, z);
};
export const box = (w: number, h: number, d: number, col: number, x = 0, y = 0, z = 0, r?: Rot): G => place(paint(new THREE.BoxGeometry(w, h, d), col), x, y, z, r);
export const cyl = (rt: number, rb: number, h: number, seg: number, col: number, x = 0, y = 0, z = 0, r?: Rot): G => place(paint(new THREE.CylinderGeometry(rt, rb, h, seg), col), x, y, z, r);
export const ball = (rad: number, col: number, x = 0, y = 0, z = 0, detail = 1): G => place(paint(new THREE.IcosahedronGeometry(rad, detail), col), x, y, z);
/** Four-sided spire aligned with a box of the same footprint. */
export const spire = (half: number, h: number, col: number, x = 0, y = 0, z = 0): G => cyl(0, half * Math.SQRT2, h, 4, col, x, y + h / 2, z, { ry: Math.PI / 4 });
export const merge = (parts: G[]): G => mergeGeometries(parts, false)!;
export const crossGeo = (col: number, x: number, y: number, z: number, s = 1, r?: Rot): G[] => [
  place(paint(new THREE.BoxGeometry(0.14 * s, 1 * s, 0.14 * s), col), x, y + 0.5 * s, z, r),
  place(paint(new THREE.BoxGeometry(0.14 * s, 0.14 * s, 0.6 * s), col), x, y + 0.68 * s, z, r),
];

/** Flat polygon in the x-y plane, `thick` along z: wings, capes, blades, banners. */
export const plate = (pts: [number, number][], thick: number, col: number, x = 0, y = 0, z = 0, r?: Rot): G => {
  const sh = new THREE.Shape();
  pts.forEach(([px, py], i) => (i ? sh.lineTo(px, py) : sh.moveTo(px, py)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  return place(paint(g, col), x, y, z, r);
};

export type WeaponAnim = "recoil" | "swing" | "thrust" | "raise" | "lance" | "sling" | "chop" | "bite" | "cast";
/** How a model carries itself: decides the body's bob, lean and stride (scene.ts). */
export type Gait = "walk" | "shuffle" | "gallop" | "lope" | "stomp" | "float" | "roll" | "fly";
/**
 * A separately animated piece. arm: swings against the legs; wing: flaps (side +1 = camera side); tail: wags;
 * cape: streams behind when moving; head: nods; sway: a hanging thing that swings; bob: hovers in place (and may spin);
 * orbit: circles the model's axis; wheel: turns with distance travelled.
 */
export type Motion = "arm" | "wing" | "tail" | "cape" | "head" | "sway" | "bob" | "orbit" | "wheel";
export interface Part { geo: G; glow?: G; pivot: [number, number, number]; motion: Motion; side?: 1 | -1; amp?: number; speed?: number; phase?: number }
export interface ModelDef {
  body: G;                                  // static geometry
  glow?: G;                                 // unlit, glowing geometry attached to the body
  legs?: { geo: G; pivot: [number, number, number] }[]; // swing in opposite phase
  parts?: Part[];
  weapon: { geo: G; glow?: G; pivot: [number, number, number]; anim: WeaponAnim };
  height: number;
  gait?: Gait;                              // default "walk"
  hover?: number;                           // flying height of the model's origin
  ghost?: boolean;                          // drawn translucent
  aura?: number;                            // radius of a ground halo, in world units
}

export const leg = (col: number, boot: number, z: number, x = 0) => ({ pivot: [x, 1, z] as [number, number, number],
  geo: merge([box(0.3, 1, 0.32, col, 0, -0.5, 0), box(0.44, 0.2, 0.34, boot, 0.07, -0.9, 0)]) });
