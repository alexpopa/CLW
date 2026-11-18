import * as THREE from "three";
import { MAP, courtDepth, hqBox } from "@lw/sim";
import { PAL, box, crossGeo, cyl, deadTree, merge, paint, place, plate, spire } from "./models";
import type { G } from "./models";
import { LANE_W, laneZ } from "./layout";

/**
 * The churchyard that fills a team game's cathedral court: paved walks from every lane's building ground to the
 * cathedral, and around them earth with dead trees, thorn bushes, fenced grave plots, a crypt, statues, braziers and a
 * dry fountain. Presentation only: nothing here exists in the sim, and nothing stands where an army walks.
 *
 * Everything is laid out for team 0's court (x from the back wall to the rear of the building grounds); team 1's court
 * is the same yard mirrored along the lanes by the caller.
 */
export interface Churchyard {
  /** Where the paving shows through the earth (world x, z): one walk per lane and the cathedral's apron. */
  walks: [number, number][][];
  /** The court's floor in world units: x from x0 to x1, z from z0 to z1. */
  x0: number; x1: number; z0: number; z1: number;
  lit: G; glow: G;
  /** Brazier flames, for the caller to light (world x, y, z). */
  flames: [number, number, number][];
}

const STONE_OLD = 0x8a8c96; // weathered statuary
const EARTH = 0x2b2721;
const LEAF = [0x3e4a35, 0x4a5640, 0x343d2d, 0x524e3a] as const;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Distance from (x, z) to a convex polygon of either winding (0 inside). */
function polyDist(poly: [number, number][], x: number, z: number): number {
  let pos = 0, neg = 0, best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]!, [bx, bz] = poly[(i + 1) % poly.length]!;
    const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
    if (ex * (z - az) - ez * (x - ax) >= 0) pos++; else neg++;
  }
  return pos === poly.length || neg === poly.length ? 0 : best;
}

// ---- pieces -------------------------------------------------------------------------------------------------------

const turn = (g: G, x: number, z: number, ry: number): G => g.rotateY(ry).translate(x, 0, z);

function bush(parts: G[], r: () => number, x: number, z: number, s: number): void {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.7 * s, rad = (0.6 + r() * 0.45) * s;
    const g = paint(new THREE.IcosahedronGeometry(rad, 0), LEAF[Math.floor(r() * LEAF.length)]!);
    parts.push(g.scale(1, 0.72, 1).rotateY(r() * 3).translate(x + Math.cos(a) * d, rad * 0.55, z + Math.sin(a) * d));
  }
  for (let i = 0; i < 4; i++) { // thorny twigs poking out
    const a = r() * Math.PI * 2;
    parts.push(cyl(0.02, 0.05, 0.9 * s, 3, PAL.ink, x + Math.cos(a) * 0.5 * s, 0.7 * s, z + Math.sin(a) * 0.5 * s, { rz: Math.cos(a) * 0.7, rx: -Math.sin(a) * 0.7 }));
  }
}

function headstone(parts: G[], r: () => number, x: number, z: number, ry: number): void {
  const roll = r(), lean = (r() - 0.5) * 0.25, g: G[] = [];
  if (roll < 0.4) g.push(box(0.8, 1.0, 0.2, PAL.stoneLo, 0, 0.5, 0), cyl(0.4, 0.4, 0.2, 8, PAL.stoneLo, 0, 1.0, 0, { rx: Math.PI / 2 }));
  else if (roll < 0.65) g.push(...crossGeo(PAL.stoneLo, 0, 0, 0, 1.4, { ry: Math.PI / 2 }));
  else if (roll < 0.82) g.push(box(0.5, 1.5, 0.5, PAL.stone, 0, 0.75, 0), spire(0.25, 0.6, PAL.stone, 0, 1.5, 0)); // a small obelisk
  else g.push(box(0.9, 0.18, 1.8, PAL.stoneLo, 0, 0.09, 0.6)); // a slab laid flat
  const m = merge(g).rotateZ(lean); parts.push(turn(m, x, z, ry));
}

/** A fenced plot of graves, `w` by `d`, its gate toward +z before turning by `ry`. */
function gravePlot(parts: G[], r: () => number, x: number, z: number, w: number, d: number, ry: number): void {
  const g: G[] = [], hw = w / 2, hd = d / 2;
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    g.push(box(len, 0.08, 0.08, PAL.ink, cx, 1.0, cz, { ry: -a }), box(len, 0.08, 0.08, PAL.ink, cx, 0.3, cz, { ry: -a }));
    const n = Math.round(len / 0.6);
    for (let i = 0; i <= n; i++) { const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t; g.push(cyl(0.035, 0.035, 1.2, 4, PAL.ink, px, 0.6, pz), cyl(0, 0.08, 0.28, 4, PAL.ink, px, 1.32, pz)); }
  };
  rail(-hw, -hd, hw, -hd); rail(-hw, -hd, -hw, hd); rail(hw, -hd, hw, hd); rail(-hw, hd, -1, hd); rail(1, hd, hw, hd);
  for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [-1, hd], [1, hd]] as const) g.push(box(0.36, 1.5, 0.36, PAL.stoneLo, px, 0.75, pz), spire(0.2, 0.4, PAL.stoneLo, px, 1.5, pz));
  const rows = Math.max(1, Math.floor((d - 1.5) / 2.2)), cols = Math.max(1, Math.floor((w - 1) / 1.5));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    if (r() < 0.18) continue;
    const gx = -hw + (w / cols) * (j + 0.5) + (r() - 0.5) * 0.3, gz = -hd + 0.7 + i * 2.2;
    headstone(g, r, gx, gz, (r() - 0.5) * 0.2);
    if (r() < 0.75) g.push(box(0.8, 0.16, 1.4, EARTH, gx, 0.06, gz + 0.95)); // the mound before it
  }
  parts.push(turn(merge(g), x, z, ry));
}

/** A mausoleum: a pitched-roof vault with a dark door toward +z, a lantern by it. */
function crypt(parts: G[], glow: G[], x: number, z: number, ry: number): void {
  const g: G[] = [box(4.4, 0.4, 5.6, PAL.stoneLo, 0, 0.2, 0), box(3.6, 3, 4.6, PAL.stone, 0, 1.9, -0.2)];
  const roof = new THREE.Shape(); roof.moveTo(-2.2, 0); roof.lineTo(2.2, 0); roof.lineTo(0, 1.7); roof.closePath();
  g.push(place(paint(new THREE.ExtrudeGeometry(roof, { depth: 5.2, bevelEnabled: false }), PAL.roof), 0, 3.4, -2.75));
  const ped = new THREE.Shape(); ped.moveTo(-1.9, 0); ped.lineTo(1.9, 0); ped.lineTo(0, 1.4); ped.closePath();
  g.push(place(paint(new THREE.ExtrudeGeometry(ped, { depth: 0.3, bevelEnabled: false }), PAL.stoneHi), 0, 3.4, 2.1));
  g.push(box(4.0, 0.2, 5.0, PAL.stoneHi, 0, 3.45, -0.2), ...crossGeo(PAL.stoneHi, 0, 4.75, 2.2, 1.2, { ry: Math.PI / 2 }));
  g.push(plate([[-0.75, 0], [0.75, 0], [0.75, 1.7], [0, 2.4], [-0.75, 1.7]], 0.1, 0x120e10, 0, 0.4, 2.12)); // the door
  for (const sx of [-1, 1]) g.push(cyl(0.22, 0.26, 2.9, 8, PAL.stoneHi, sx * 1.35, 1.85, 2.3), box(0.6, 0.25, 0.6, PAL.stoneHi, sx * 1.35, 3.3, 2.3));
  g.push(box(0.9, 0.3, 0.9, PAL.stoneLo, 1.3, 0.15, 3.2), box(0.08, 0.6, 0.08, PAL.ink, 1.3, 0.6, 3.2)); // a lantern on a step
  parts.push(turn(merge(g), x, z, ry));
  glow.push(turn(box(0.24, 0.3, 0.24, PAL.candle, 1.3, 1.05, 3.2), x, z, ry));
}

/** A weathered statue on a plinth: a hooded mourner or a winged watcher, facing +z. */
function statue(parts: G[], x: number, z: number, ry: number, winged: boolean): void {
  const g: G[] = [box(1.4, 0.3, 1.4, PAL.stoneLo, 0, 0.15, 0), box(1.1, 1.5, 1.1, PAL.stone, 0, 1.05, 0), box(1.3, 0.2, 1.3, PAL.stoneHi, 0, 1.9, 0)];
  g.push(cyl(0.3, 0.55, 2.0, 8, STONE_OLD, 0, 3.0, 0), cyl(0.22, 0.3, 0.35, 8, STONE_OLD, 0, 4.1, 0));
  g.push(place(paint(new THREE.IcosahedronGeometry(0.3, 1), STONE_OLD), 0, 4.45, 0.02), cyl(0.05, 0.36, 0.55, 8, STONE_OLD, 0, 4.55, -0.05)); // head under a hood
  g.push(box(0.5, 0.22, 0.3, STONE_OLD, 0, 3.6, 0.32)); // hands folded
  if (winged) for (const sx of [-1, 1]) g.push(plate([[0, 0], [sx * 1.3, 0.9], [sx * 1.5, 1.8], [sx * 0.9, 1.2], [sx * 0.4, 0.4]], 0.1, STONE_OLD, sx * 0.15, 3.0, -0.3, { ry: sx * 0.35 }));
  parts.push(turn(merge(g), x, z, ry));
}

/** A tall iron brazier on a stone foot; its flame goes to `flames`. */
function brazier(parts: G[], glow: G[], flames: [number, number, number][], x: number, z: number): void {
  parts.push(box(1.0, 0.4, 1.0, PAL.stoneLo, x, 0.2, z), cyl(0.18, 0.24, 2.4, 6, PAL.ink, x, 1.6, z), cyl(0.7, 0.3, 0.45, 8, PAL.iron, x, 2.95, z));
  glow.push(cyl(0, 0.45, 0.9, 6, PAL.flame, x, 3.55, z), cyl(0, 0.25, 0.6, 6, PAL.candle, x, 3.45, z));
  flames.push([x, 3.6, z]);
}

/** A dry, stagnant fountain: an octagonal basin with a column and a bowl. */
function fountain(parts: G[], x: number, z: number): void {
  parts.push(cyl(2.6, 2.7, 0.2, 8, PAL.stoneLo, x, 0.1, z), cyl(2.3, 2.3, 0.06, 8, 0x2e3747, x, 0.42, z)); // footing, stagnant water
  for (let i = 0; i < 8; i++) { // the basin's eight low walls
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, rr = 2.35, len = 2 * 2.55 * Math.tan(Math.PI / 8);
    parts.push(box(len, 0.75, 0.4, PAL.stone, x + Math.cos(a) * rr, 0.45, z + Math.sin(a) * rr, { ry: -a + Math.PI / 2 }));
    parts.push(box(len + 0.05, 0.1, 0.55, PAL.stoneHi, x + Math.cos(a) * rr, 0.86, z + Math.sin(a) * rr, { ry: -a + Math.PI / 2 }));
  }
  parts.push(cyl(0.35, 0.45, 2.0, 8, PAL.stone, x, 1.4, z), cyl(1.1, 0.4, 0.4, 8, PAL.stoneHi, x, 2.55, z), cyl(0.15, 0.2, 0.8, 6, PAL.stone, x, 3.1, z), place(paint(new THREE.IcosahedronGeometry(0.25, 0), PAL.stoneHi), x, 3.6, z));
}

/** A ruined arch: two piers, one broken, a pointed head that survives on one side, rubble at its foot. */
function ruinedArch(parts: G[], r: () => number, x: number, z: number, ry: number): void {
  const g: G[] = [box(1.1, 5.4, 1.1, PAL.stone, -2.2, 2.7, 0), box(1.1, 2.2, 1.1, PAL.stone, 2.2, 1.1, 0), spire(0.55, 1.0, PAL.roof, -2.2, 5.4, 0)];
  g.push(plate([[-1.65, 0], [-0.6, 0], [-0.6, 1.0], [-1.0, 1.6], [-1.65, 1.9]], 0.9, PAL.stone, 0, 4.2, 0));
  for (let i = 0; i < 9; i++) g.push(box(0.4 + r() * 0.6, 0.3 + r() * 0.4, 0.4 + r() * 0.6, r() < 0.5 ? PAL.stone : PAL.stoneLo, 1 + r() * 3, 0.15, (r() - 0.5) * 3, { ry: r() * 3, rz: (r() - 0.5) * 0.4 }));
  parts.push(turn(merge(g), x, z, ry));
}

function rubble(parts: G[], r: () => number, x: number, z: number): void {
  for (let i = 0; i < 4 + r() * 4; i++) parts.push(box(0.3 + r() * 0.5, 0.2 + r() * 0.35, 0.3 + r() * 0.5, r() < 0.5 ? PAL.stone : PAL.stoneLo, x + (r() - 0.5) * 2, 0.12, z + (r() - 0.5) * 2, { ry: r() * 3, rx: (r() - 0.5) * 0.4 }));
}

// ---- layout -------------------------------------------------------------------------------------------------------

export function churchyard(lanes: number, seed: number): Churchyard {
  const r = seeded(seed), W = (m: number) => m / 1000;
  const back = -W(courtDepth(lanes)), front = W(MAP.zoneStart), near = laneZ(lanes - 1) + LANE_W;
  const hq = hqBox(lanes, 0), hx0 = W(hq.x - hq.rx), hx1 = W(hq.x + hq.rx), hz = W(hq.y), hr = W(hq.ry);
  // the walks: from the whole open rear of each lane's ground to the cathedral's front, and an apron round the cathedral
  const walks: [number, number][][] = [];
  for (let l = 0; l < lanes; l++) walks.push([[front + 1.5, laneZ(l) - 0.4], [front + 1.5, laneZ(l) + LANE_W + 0.4], [hx1, hz + hr], [hx1, hz - hr]]);
  walks.push([[hx0 - 2, hz - hr - 2], [hx1 + 2.5, hz - hr - 2], [hx1 + 2.5, hz + hr + 2], [hx0 - 2, hz + hr + 2]]);

  const lit: G[] = [], glow: G[] = [], flames: [number, number, number][] = [], taken: [number, number, number][] = [];
  const free = (x: number, z: number, rad: number, clear = 1.6): boolean =>
    x - rad > back + 1.4 && x + rad < front && z - rad > 0.6 && z + rad < near - 0.6
    && walks.every(w => polyDist(w, x, z) > rad + clear) && taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > rad + tr + 0.6);
  /** Put something of radius `rad` at (x, z), or as near it as there is room; false if there is none close by. */
  const put = (x: number, z: number, rad: number, build: (x: number, z: number) => void, reach = 6): boolean => {
    for (let d = 0; d <= reach; d += 0.75) for (let k = 0; k < (d ? 10 : 1); k++) {
      const a = (k / 10) * Math.PI * 2 + d, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (free(px, pz, rad)) { taken.push([px, pz, rad]); build(px, pz); return true; }
    }
    return false;
  };

  // the cathedral's flanks: a brazier near each front corner and a row of statues watching over the walks
  for (const s of [-1, 1]) {
    const z = hz + s * (hr + 2.0);
    brazier(lit, glow, flames, hx1 - 2.5, z); taken.push([hx1 - 2.5, z, 0.8]);
    for (const [i, x] of [hx0 + 4, (hx0 + hx1) / 2 - 1].entries()) { statue(lit, x, z + s * 0.4, s < 0 ? 0 : Math.PI, i === 1); taken.push([x, z + s * 0.4, 0.9]); }
  }
  // the side yards beside the cathedral: grave plots, a crypt, a fountain and a ruin, toward the walls
  const far = [0.6, hz - hr - 2.6] as const, nearY = [hz + hr + 2.6, near - 0.6] as const, span = hx1 - back;
  const at = (fx: number, [z0, z1]: readonly [number, number], fz: number) => [back + span * fx, z0 + (z1 - z0) * fz] as const;
  { const [x, z] = at(0.16, far, 0.3); put(x, z, 3.6, (px, pz) => crypt(lit, glow, px, pz, Math.PI / 2)); }
  { const [x, z] = at(0.55, far, 0.4); put(x, z, 3.8, (px, pz) => gravePlot(lit, r, px, pz, 6.2, 5.4, 0)); }
  { const [x, z] = at(0.3, nearY, 0.62); put(x, z, 4.0, (px, pz) => gravePlot(lit, r, px, pz, 6.8, 5.8, Math.PI)); }
  { const [x, z] = at(0.7, nearY, 0.5); put(x, z, 2.9, (px, pz) => fountain(lit, px, pz)); }
  { const [x, z] = at(0.08, nearY, 0.2); put(x, z, 3.2, (px, pz) => ruinedArch(lit, r, px, pz, Math.PI / 2 + 0.3)); }
  // the corners in front of the cathedral, beside the outer walks: a few more graves
  for (const z of [1.5, near - 1.5]) {
    const x = front - 6;
    put(x, z, 2.4, (px, pz) => gravePlot(lit, r, px, pz, 4.2, 3.6, z < hz ? 0 : Math.PI), 8);
  }
  // dead trees and thorn bushes, gathered toward the walls and in clusters
  const spot = (): [number, number] => {
    const x = r() < 0.45 ? back + 1.5 + r() * 5 : back + r() * (front - back);
    const z = r() < 0.5 ? (r() < 0.5 ? 0.8 + r() * 5 : near - 0.8 - r() * 5) : r() * near;
    return [x, z];
  };
  for (let i = 0, made = 0; i < 160 && made < 8 + lanes * 2; i++) {
    const [x, z] = spot();
    if (free(x, z, 1.4)) { taken.push([x, z, 1.4]); deadTree(lit, r, x, z, 2.8 + r() * 2.2, 0.36); made++; }
  }
  for (let i = 0, made = 0; i < 300 && made < 10 + lanes * 4; i++) {
    const [x, z] = spot(), n = 2 + Math.floor(r() * 3);
    if (!free(x, z, 1.2, 1.2)) continue;
    made++;
    for (let k = 0; k < n; k++) {
      const bx = x + (r() - 0.5) * 3, bz = z + (r() - 0.5) * 3, s = 0.7 + r() * 0.6;
      if (free(bx, bz, 0.8 * s, 1.0)) { taken.push([bx, bz, 0.8 * s]); bush(lit, r, bx, bz, s); }
    }
  }
  for (let i = 0, made = 0; i < 80 && made < 6; i++) {
    const [x, z] = spot();
    if (free(x, z, 1.2)) { taken.push([x, z, 1.2]); rubble(lit, r, x, z); made++; }
  }
  return { walks, x0: back, x1: front, z0: -0.9, z1: near + 0.9, lit: merge(lit), glow: merge(glow), flames };
}
