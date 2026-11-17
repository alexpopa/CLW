import * as THREE from "three";
import { PAL, TEAM, ball, box, crossGeo, cyl, leg, merge, paint, place, plate, spire } from "./kit";
import type { G, ModelDef, Pal, Part } from "./kit";
import { ROSTER } from "./roster";

export * from "./kit";

const BUILDERS: Record<string, (t: Pal) => ModelDef> = {
  // Guard tower: a round keep with a crenellated crown, a slate cap and a brazier that fires on intruders.
  // Authored at world size (the renderer does not shrink it like the soldiers).
  tower: t => ({
    height: 6.4,
    body: merge([
      cyl(1.25, 1.45, 0.5, 8, PAL.stoneLo, 0, 0.25, 0), cyl(0.95, 1.15, 3.4, 8, PAL.stone, 0, 2.2, 0),
      cyl(1.02, 1.02, 0.16, 8, t.lo, 0, 2.5, 0), cyl(1.25, 0.98, 0.5, 8, PAL.stoneHi, 0, 4.15, 0),
      ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return box(0.42, 0.5, 0.42, PAL.stoneHi, Math.cos(a) * 1.08, 4.62, Math.sin(a) * 1.08, { ry: -a }); }),
      cyl(0, 0.82, 1.5, 8, PAL.roof, 0, 5.35, 0), box(0.06, 0.5, 0.06, PAL.gold, 0, 6.3, 0), box(0.3, 0.06, 0.06, PAL.gold, 0, 6.38, 0),
      box(0.06, 0.9, 0.5, t.main, 0.99, 3.1, 0), box(0.5, 0.9, 0.06, t.main, 0, 3.1, 0.99),
    ]),
    glow: merge([box(0.07, 0.6, 0.2, PAL.candle, 1.06, 1.7, 0), box(0.2, 0.6, 0.07, PAL.candle, 0, 1.7, 1.06), box(0.2, 0.6, 0.07, PAL.candle, 0, 1.7, -1.06)]),
    weapon: { pivot: [0, 4.5, 0], anim: "raise", geo: cyl(0.3, 0.2, 0.2, 6, PAL.ink, 0, 0, 0), glow: ball(0.26, t.glow, 0, 0.25, 0, 0) },
  }),
  arbalester: t => ({
    height: 2.6,
    body: merge([
      box(0.45, 0.9, 0.7, PAL.cloth, 0, 1.45, 0), box(0.52, 0.72, 0.5, t.main, 0, 1.42, 0), box(0.54, 0.1, 0.72, PAL.leather, 0, 1.12, 0),
      box(0.5, 0.2, 0.74, t.lo, 0, 1.86, 0),
      ball(0.22, PAL.bone, 0.02, 2.14, 0), cyl(0.44, 0.44, 0.06, 10, PAL.steel, 0, 2.27, 0), cyl(0.16, 0.3, 0.22, 8, PAL.steelHi, 0, 2.4, 0),
      cyl(0.1, 0.1, 0.62, 6, PAL.leather, -0.32, 1.62, -0.1, { rz: 0.3 }), box(0.2, 0.2, 0.2, PAL.cloth, 0, 1.72, -0.42),
    ]),
    legs: [leg(PAL.dark, PAL.leather, 0.19), leg(PAL.dark, PAL.leather, -0.19)],
    parts: [{ motion: "cape", pivot: [-0.25, 1.9, 0], amp: 0.8, geo: merge([box(0.06, 0.8, 0.7, t.lo, -0.03, -0.4, 0, { rz: -0.08 }), box(0.07, 0.12, 0.72, t.main, -0.02, -0.06, 0)]) }],
    weapon: { pivot: [0.05, 1.74, 0.42], anim: "recoil", geo: merge([
      box(0.56, 0.2, 0.2, PAL.cloth, 0.25, -0.08, 0), box(0.95, 0.1, 0.12, PAL.wood, 0.62, -0.1, 0),
      box(0.08, 0.08, 1.05, PAL.steelHi, 1.02, -0.1, 0), box(0.3, 0.04, 0.04, PAL.bone, 1.12, -0.04, 0) ]) },
  }),
  oathguard: t => ({
    height: 3,
    body: merge([
      box(0.58, 0.98, 0.84, PAL.steel, 0, 1.5, 0), box(0.64, 0.8, 0.42, t.main, 0, 1.46, 0), box(0.62, 0.1, 0.86, PAL.leather, 0, 1.14, 0),
      ball(0.27, PAL.steelHi, 0, 1.98, 0.42, 0), ball(0.27, PAL.steelHi, 0, 1.98, -0.42, 0),
      box(0.48, 0.52, 0.48, PAL.steelHi, 0.02, 2.3, 0), box(0.03, 0.07, 0.34, PAL.ink, 0.27, 2.34, 0), box(0.5, 0.05, 0.06, PAL.gold, 0.02, 2.3, 0.25),
      box(0.78, 1.15, 0.1, t.main, 0.22, 1.42, 0.52), box(0.82, 0.08, 0.12, PAL.gold, 0.22, 1.98, 0.52), box(0.82, 0.08, 0.12, PAL.gold, 0.22, 0.86, 0.52),
      box(0.12, 0.8, 0.04, PAL.bone, 0.22, 1.44, 0.59), box(0.5, 0.12, 0.04, PAL.bone, 0.22, 1.58, 0.59),
    ]),
    legs: [leg(PAL.steel, PAL.steel, 0.21), leg(PAL.steel, PAL.steel, -0.21)],
    parts: [
      { motion: "cape", pivot: [-0.32, 1.96, 0], geo: merge([box(0.08, 1.2, 0.78, t.lo, -0.05, -0.6, 0, { rz: -0.06 }), box(0.09, 0.14, 0.8, PAL.gold, -0.03, -0.06, 0)]) },
      { motion: "sway", pivot: [-0.04, 2.56, 0], amp: 0.5, geo: merge([box(0.12, 0.4, 0.1, t.main, -0.1, 0.16, 0, { rz: 0.6 }), box(0.1, 0.3, 0.08, t.lo, -0.3, 0.22, 0, { rz: 1.1 })]) },
    ],
    weapon: { pivot: [-0.05, 1.86, 0.2], anim: "swing", geo: merge([
      box(0.2, 0.5, 0.2, PAL.steel, 0, 0.22, 0), cyl(0.045, 0.045, 0.85, 6, PAL.wood, 0.12, 0.8, 0, { rz: -0.3 }), ball(0.2, PAL.steelHi, 0.25, 1.2, 0, 0) ]) },
  }),
  zealot: t => ({
    height: 2.9, gait: "shuffle",
    body: merge([
      cyl(0.28, 0.58, 1.78, 8, PAL.robe, 0, 0.89, 0), box(0.07, 1.3, 0.28, t.main, 0.42, 1.02, 0, { rz: 0.165 }), box(0.08, 0.06, 0.3, PAL.gold, 0.5, 0.5, 0),
      cyl(0.43, 0.45, 0.07, 8, PAL.bone, 0, 1.06, 0), cyl(0.3, 0.3, 0.3, 8, PAL.robe, 0, 1.86, 0),
      cyl(0, 0.36, 0.8, 8, PAL.robe, -0.06, 2.3, 0, { rz: 0.22 }), ball(0.2, PAL.ink, 0.1, 2.04, 0, 1),
    ]),
    glow: merge([ball(0.045, PAL.flame, 0.27, 2.06, 0.08, 0), ball(0.045, PAL.flame, 0.27, 2.06, -0.08, 0)]),
    parts: [{ motion: "sway", pivot: [-0.2, 1.1, -0.4], amp: 0.8, geo: merge([box(0.03, 0.5, 0.03, PAL.ink, 0, -0.25, 0), box(0.2, 0.26, 0.14, PAL.leather, 0, -0.6, 0), box(0.1, 0.16, 0.03, PAL.bone, 0, -0.6, 0.08)]) }],
    weapon: { pivot: [0.1, 1.62, 0.42], anim: "thrust",
      geo: merge([box(0.5, 0.24, 0.24, PAL.robe, 0.2, -0.06, 0), cyl(0.04, 0.04, 2.3, 5, PAL.wood, 0.5, 0.45, 0, { rz: -0.45 }), cyl(0.16, 0.1, 0.18, 6, PAL.gold, 1.0, 1.12, 0)]),
      glow: cyl(0, 0.15, 0.44, 6, PAL.flame, 1.0, 1.42, 0) },
  }),
  doctor: t => ({
    height: 3,
    body: merge([
      cyl(0.3, 0.5, 1.28, 8, PAL.coat, 0, 1.3, 0), cyl(0.34, 0.34, 0.15, 8, t.main, 0, 1.92, 0), box(0.06, 0.7, 0.2, t.lo, -0.36, 1.55, 0.1, { rz: 0.1 }),
      box(0.22, 0.32, 0.3, PAL.leather, -0.1, 1.08, 0.46),
      ball(0.21, PAL.bone, 0, 2.16, 0), cyl(0, 0.11, 0.52, 6, PAL.bone, 0.42, 2.1, 0, { rz: -Math.PI / 2 }),
      cyl(0.52, 0.52, 0.05, 12, PAL.hat, 0, 2.34, 0), cyl(0.22, 0.26, 0.4, 10, PAL.hat, 0, 2.55, 0), cyl(0.27, 0.27, 0.09, 10, t.main, 0, 2.41, 0),
    ]),
    glow: ball(0.04, PAL.heal, 0.19, 2.2, 0.1, 0),
    legs: [leg(PAL.dark, PAL.leather, 0.18), leg(PAL.dark, PAL.leather, -0.18)],
    parts: [{ motion: "cape", pivot: [-0.3, 1.6, 0], amp: 0.7, geo: merge([box(0.06, 1.0, 0.34, PAL.coat, -0.03, -0.5, 0.2, { rz: -0.1 }), box(0.06, 1.0, 0.34, PAL.coat, -0.03, -0.5, -0.2, { rz: -0.1 })]) }],
    weapon: { pivot: [0.1, 1.66, 0.42], anim: "raise",
      geo: merge([box(0.46, 0.2, 0.2, PAL.coat, 0.2, -0.05, 0), cyl(0.04, 0.04, 2.7, 5, PAL.wood, 0.45, -0.25, 0), box(0.3, 0.05, 0.05, PAL.wood, 0.58, 1.08, 0),
        box(0.22, 0.05, 0.22, PAL.gold, 0.68, 0.98, 0), box(0.22, 0.05, 0.22, PAL.gold, 0.68, 0.68, 0)]),
      glow: box(0.16, 0.25, 0.16, PAL.heal, 0.68, 0.83, 0) },
  }),
  dreadknight: t => ({
    height: 3.9, gait: "gallop",
    body: merge([
      box(2.0, 0.8, 0.7, PAL.horse, 0, 1.38, 0), box(0.42, 1.0, 0.42, PAL.horse, 1.0, 1.98, 0, { rz: -0.5 }), box(0.72, 0.34, 0.34, PAL.horse, 1.44, 2.32, 0, { rz: -0.4 }),
      box(0.56, 0.1, 0.38, PAL.steelHi, 1.48, 2.5, 0, { rz: -0.4 }),
      box(1.72, 0.8, 0.8, t.main, -0.05, 1.22, 0), box(1.74, 0.09, 0.82, PAL.gold, -0.05, 1.56, 0), box(0.5, 0.5, 0.5, t.lo, 0.9, 1.5, 0),
      box(0.12, 0.5, 0.03, PAL.bone, 0.3, 1.2, 0.41), box(0.34, 0.12, 0.03, PAL.bone, 0.3, 1.3, 0.41),
      box(0.46, 0.82, 0.62, PAL.steel, -0.05, 2.22, 0), box(0.5, 0.7, 0.3, t.main, -0.05, 2.2, 0),
      box(0.24, 0.72, 0.2, PAL.steel, 0.08, 1.62, 0.44), box(0.24, 0.72, 0.2, PAL.steel, 0.08, 1.62, -0.44),
      ball(0.22, PAL.steelHi, -0.05, 2.62, 0.36, 0), ball(0.22, PAL.steelHi, -0.05, 2.62, -0.36, 0),
      box(0.42, 0.46, 0.42, PAL.steelHi, -0.03, 2.9, 0), box(0.03, 0.07, 0.3, PAL.ink, 0.19, 2.94, 0),
      cyl(0, 0.07, 0.46, 5, PAL.bone, -0.03, 3.3, 0.2, { rx: 0.35 }), cyl(0, 0.07, 0.46, 5, PAL.bone, -0.03, 3.3, -0.2, { rx: -0.35 }),
    ]),
    glow: ball(0.05, PAL.flame, 1.52, 2.42, 0.18, 0),
    parts: [
      { motion: "cape", pivot: [-0.3, 2.56, 0], geo: merge([box(0.08, 1.1, 0.64, t.lo, -0.05, -0.55, 0, { rz: -0.1 }), box(0.09, 0.14, 0.66, PAL.gold, -0.03, -0.06, 0)]) },
      { motion: "tail", pivot: [-1.0, 1.66, 0], amp: 0.6, geo: merge([box(0.14, 0.9, 0.16, PAL.ink, -0.14, -0.42, 0, { rz: -0.35 }), box(0.1, 0.4, 0.12, PAL.ink, -0.34, -0.9, 0, { rz: -0.2 })]) },
    ],
    legs: [
      { pivot: [0.78, 1.05, 0], geo: merge([box(0.2, 1.05, 0.2, PAL.horse, 0, -0.52, 0.23), box(0.2, 1.05, 0.2, PAL.horse, 0, -0.52, -0.23)]) },
      { pivot: [-0.78, 1.05, 0], geo: merge([box(0.2, 1.05, 0.2, PAL.horse, 0, -0.52, 0.23), box(0.2, 1.05, 0.2, PAL.horse, 0, -0.52, -0.23)]) },
    ],
    weapon: { pivot: [0.1, 2.36, 0.44], anim: "lance", geo: merge([
      box(0.5, 0.2, 0.2, PAL.steel, 0.2, -0.05, 0), cyl(0.05, 0.05, 3.6, 6, PAL.bone, 1.1, -0.02, 0, { rz: -Math.PI / 2 + 0.06 }),
      cyl(0, 0.1, 0.44, 6, PAL.steelHi, 3.1, 0.1, 0, { rz: -Math.PI / 2 + 0.06 }), box(0.55, 0.32, 0.03, t.main, 2.4, 0.26, 0) ]) },
  }),
  trebuchet: t => {
    const arm = merge([box(4.3, 0.2, 0.2, PAL.woodHi, -1.2, 0, 0), box(0.75, 0.75, 0.6, PAL.stone, 0.85, -0.5, 0), ball(0.24, PAL.stoneHi, -3.3, -0.45, 0, 0)]);
    arm.rotateZ(0.45);
    const wheels: Part[] = [-1.1, 1.1].flatMap(x => [-0.85, 0.85].map((z): Part => ({ motion: "wheel", pivot: [x, 0.46, z], amp: 0.46,
      geo: merge([cyl(0.46, 0.46, 0.2, 10, PAL.wood, 0, 0, 0, { rx: Math.PI / 2 }), box(0.86, 0.1, 0.24, PAL.woodHi, 0, 0, 0), box(0.1, 0.86, 0.24, PAL.woodHi, 0, 0, 0)]) })));
    return {
      height: 4.2, gait: "roll", parts: wheels,
      body: merge([
        box(3.3, 0.2, 0.25, PAL.wood, 0, 0.55, 0.7), box(3.3, 0.2, 0.25, PAL.wood, 0, 0.55, -0.7), box(0.25, 0.2, 1.6, PAL.wood, 1.3, 0.55, 0), box(0.25, 0.2, 1.6, PAL.wood, -1.3, 0.55, 0),
        ...[-0.6, 0.6].flatMap(z => [box(0.18, 2.7, 0.18, PAL.wood, -0.55, 1.75, z, { rz: -0.4 }), box(0.18, 2.7, 0.18, PAL.wood, 0.55, 1.75, z, { rz: 0.4 }), box(1.1, 0.14, 0.14, PAL.woodHi, 0, 1.4, z)]),
        cyl(0.08, 0.08, 1.5, 6, PAL.steel, 0, 2.9, 0, { rx: Math.PI / 2 }),
        box(0.62, 0.95, 0.04, t.main, -1.0, 1.55, 0.84), box(0.7, 0.07, 0.07, PAL.woodHi, -1.0, 2.05, 0.84), box(0.1, 0.5, 0.03, PAL.bone, -1.0, 1.6, 0.87), box(0.34, 0.1, 0.03, PAL.bone, -1.0, 1.7, 0.87),
      ]),
      weapon: { pivot: [0, 2.9, 0], anim: "sling", geo: arm },
    };
  },
};

Object.assign(BUILDERS, ROSTER);

const cache = new Map<string, ModelDef>();
export function unitModel(id: string, team: 0 | 1): ModelDef {
  const key = `${id}:${team}`;
  let m = cache.get(key);
  if (!m) { m = BUILDERS[id]!(TEAM[team]); cache.set(key, m); }
  return m;
}
/** The whole model at rest in one geometry (wings half raised): for statues and portraits. */
export function wholeModel(id: string, team: 0 | 1): { lit: G; glow: G | null } {
  const m = unitModel(id, team), at = (g: G, p: [number, number, number]) => g.clone().translate(p[0], p[1], p[2]);
  const glow = [m.glow?.clone(), m.weapon.glow && at(m.weapon.glow, m.weapon.pivot)].filter((g): g is G => !!g);
  for (const p of m.parts ?? []) if (p.glow) glow.push(at(p.glow, p.pivot));
  return { lit: merge([m.body.clone(), at(m.weapon.geo, m.weapon.pivot), ...(m.legs ?? []).map(l => at(l.geo, l.pivot)), ...(m.parts ?? []).map(p => at(p.motion === "wing" ? p.geo.clone().rotateX(-(p.side ?? 1) * 0.55) : p.geo, p.pivot))]), glow: glow.length ? merge(glow) : null };
}

// ---- structures ----
const lancet = (col: number, x: number, y: number, z: number, w: number, h: number, facing: "z" | "x"): G[] => facing === "z"
  ? [box(w, h, 0.06, col, x, y, z), box(w * 0.72, w * 0.72, 0.06, col, x, y + h / 2, z, { rz: Math.PI / 4 })]
  : [box(0.06, h, w, col, x, y, z), box(0.06, w * 0.72, w * 0.72, col, x, y + h / 2, z, { rx: Math.PI / 4 })];

/** Headquarters: twin-spired cathedral, façade toward the camera, long nave across the lane. */
export function cathedralModel(team: 0 | 1): { lit: G; glow: G } {
  const t = TEAM[team], lit: G[] = [], glow: G[] = [];
  lit.push(box(11.2, 0.5, 17.6, PAL.stoneLo, 0, 0.25, 0), box(9, 8, 14, PAL.stone, 0, 4.5, -1.4));
  const roof = new THREE.Shape(); roof.moveTo(-4.9, 0); roof.lineTo(4.9, 0); roof.lineTo(0, 4.4); roof.closePath();
  lit.push(place(paint(new THREE.ExtrudeGeometry(roof, { depth: 14.6, bevelEnabled: false }), PAL.roof), 0, 8.5, -8.7));
  lit.push(spire(0.5, 2.6, PAL.roof, 0, 12.6, -3));
  for (const sx of [-1, 1]) {
    const x = sx * 3.5;
    lit.push(box(3.2, 13, 3.2, PAL.stone, x, 6.9, 7), box(3.5, 0.4, 3.5, PAL.stoneHi, x, 13.5, 7), box(3.4, 0.3, 3.4, PAL.stoneHi, x, 8.2, 7));
    lit.push(spire(1.6, 6.8, PAL.roof, x, 13.7, 7), ...crossGeo(PAL.gold, x, 20.4, 7, 1.3, { ry: Math.PI / 2 }));
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) lit.push(spire(0.28, 1.7, PAL.stoneHi, x + dx, 13.7, 7 + dz));
    glow.push(...lancet(t.glow, x, 5.2, 8.63, 0.62, 2.3, "z"), ...lancet(PAL.candle, x, 10.6, 8.63, 0.5, 1.7, "z"));
    lit.push(box(1.0, 3.3, 0.07, t.main, x, 2.3, 8.64), box(1.1, 0.12, 0.12, PAL.gold, x, 3.95, 8.66));
    for (const z of [-6.4, -3.6, -0.8, 2]) { // side walls: buttresses and glass
      lit.push(box(0.7, 6.5, 0.9, PAL.stoneHi, sx * 4.8, 3.6, z + 1.4), spire(0.4, 1.3, PAL.stoneHi, sx * 4.8, 6.85, z + 1.4));
      glow.push(...lancet(t.glow, sx * 4.53, 4.6, z, 0.7, 2.6, "x"));
    }
  }
  lit.push(box(3.8, 10.5, 1.2, PAL.stone, 0, 5.7, 7.7));
  const gable = new THREE.Shape(); gable.moveTo(-1.9, 0); gable.lineTo(1.9, 0); gable.lineTo(0, 2.6); gable.closePath();
  lit.push(place(paint(new THREE.ExtrudeGeometry(gable, { depth: 1.2, bevelEnabled: false }), PAL.stoneHi), 0, 10.95, 7.1), ...crossGeo(PAL.gold, 0, 13.4, 7.7, 1.2, { ry: Math.PI / 2 }));
  lit.push(place(paint(new THREE.TorusGeometry(1.6, 0.16, 6, 28), PAL.stoneHi), 0, 7.9, 8.32));
  glow.push(cyl(1.5, 1.5, 0.08, 28, t.glow, 0, 7.9, 8.3, { rx: Math.PI / 2 }));
  for (let i = 0; i < 6; i++) lit.push(box(3, 0.09, 0.1, PAL.stoneLo, 0, 7.9, 8.36, { rz: (i / 6) * Math.PI }));
  lit.push(cyl(0.34, 0.34, 0.12, 12, PAL.stoneLo, 0, 7.9, 8.38, { rx: Math.PI / 2 }));
  lit.push(...lancet(0x120d0b, 0, 1.9, 8.32, 1.9, 2.8, "z"), box(2.5, 0.25, 0.4, PAL.stoneHi, 0, 0.62, 8.5));
  glow.push(box(0.16, 2.2, 0.05, PAL.candle, 0, 1.7, 8.37));
  return { lit: merge(lit), glow: merge(glow) };
}

/** Shrine pillar with a brazier bowl; the flame and light are added live. */
export function shrineModel(): G {
  return merge([
    cyl(1.7, 2.0, 0.5, 8, PAL.stoneLo, 0, 0.25, 0), cyl(1.25, 1.45, 0.4, 8, PAL.stone, 0, 0.7, 0), box(1.1, 3.1, 1.1, PAL.stone, 0, 2.45, 0),
    ...lancet(PAL.ink, 0, 2.1, 0.57, 0.5, 1.3, "z"), ball(0.17, PAL.bone, 0, 1.75, 0.6, 0),
    box(1.5, 0.3, 1.5, PAL.stoneHi, 0, 4.15, 0),
    ...[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([x, z]) => spire(0.14, 0.9, PAL.stoneHi, x!, 4.3, z!)),
    cyl(0.95, 0.5, 0.55, 8, PAL.bronze, 0, 4.6, 0), cyl(0.98, 0.98, 0.08, 8, PAL.gold, 0, 4.88, 0),
  ]);
}

/** Production building: a small spired chantry flying the team's banner. */
export function chantryModel(team: 0 | 1): { lit: G; glow: G } {
  const t = TEAM[team];
  return {
    lit: merge([
      box(2.9, 0.3, 2.7, PAL.stoneLo, 0, 0.15, 0), box(2.3, 2.1, 2.1, PAL.stone, 0, 1.35, 0), box(2.5, 0.2, 2.3, PAL.stoneHi, 0, 2.45, 0),
      spire(1.25, 2.0, PAL.roof, 0, 2.55, 0), ...crossGeo(PAL.gold, 0, 4.5, 0, 0.7, { ry: Math.PI / 2 }),
      ...lancet(0x120d0b, -0.35, 1.0, 1.06, 0.8, 1.2, "z"),
      box(0.55, 1.2, 0.05, t.main, 0.72, 1.55, 1.08), box(0.65, 0.08, 0.08, PAL.gold, 0.72, 2.15, 1.09),
      box(0.9, 0.5, 0.9, PAL.stoneLo, 1.9, 0.25, 0.9),
    ]),
    glow: merge([...lancet(t.glow, -1.16, 1.5, 0, 0.4, 0.8, "x"), ...lancet(t.glow, 1.16, 1.5, -0.3, 0.4, 0.8, "x")]),
  };
}

/** Ruined cloister along the far edge of the lane: pointed arches between pinnacled piers. */
export function cloisterModel(fromX: number, toX: number): G {
  const bay = 10, parts: G[] = [];
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(bay, 0); shape.lineTo(bay, 8.4); shape.lineTo(0, 8.4); shape.closePath();
  const hole = new THREE.Path(); hole.moveTo(2.3, 0.9); hole.lineTo(2.3, 4.2); hole.quadraticCurveTo(2.5, 6.2, 5, 7.2); hole.quadraticCurveTo(7.5, 6.2, 7.7, 4.2); hole.lineTo(7.7, 0.9); hole.closePath();
  shape.holes.push(hole);
  const wall = paint(new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false, curveSegments: 5 }), PAL.stone);
  for (let x = fromX, i = 0; x < toX; x += bay, i++) {
    parts.push(wall.clone().translate(x, 0, -0.45), box(1.3, 9.8, 1.7, PAL.stoneHi, x, 4.9, 0), spire(0.65, 2, PAL.roof, x, 9.8, 0), box(bay, 0.35, 1.3, PAL.stoneHi, x + bay / 2, 8.5, 0));
    parts.push(box(0.26, 6, 0.3, PAL.stoneHi, x + 5, 3.9, 0));
    for (let k = 0; k < 5; k++) parts.push(box(1, 0.7, 1.0, PAL.stone, x + 1 + k * 2, 9, 0));
  }
  return merge(parts);
}

/** Graves, crosses and dead trees scattered along both lane edges (deterministic). */
export function graveyardModel(fromX: number, toX: number, zNear: number): G {
  let s = 1234;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const parts: G[] = [];
  const tree = (x: number, z: number, h: number) => {
    const branch = (p: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number) => {
      const end = p.clone().addScaledVector(dir, len), g = paint(new THREE.CylinderGeometry(rad * 0.65, rad, len, 5), PAL.ink);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)).translate((p.x + end.x) / 2, (p.y + end.y) / 2, (p.z + end.z) / 2);
      parts.push(g);
      if (len > 1.1) for (let i = 0; i < 2; i++) branch(end, dir.clone().add(new THREE.Vector3(r() - 0.5, r() * 0.3, r() - 0.5).multiplyScalar(1.5)).normalize(), len * 0.68, rad * 0.62);
    };
    branch(new THREE.Vector3(x, 0, z), new THREE.Vector3((r() - 0.5) * 0.2, 1, 0).normalize(), h, 0.32);
  };
  for (let x = fromX; x < toX; x += 3.2) {
    for (const z0 of [-1.6, zNear]) {
      const z = z0 + (z0 < 0 ? r() * 1.2 - 0.4 : r() * 3), xx = x + r() * 2.4, roll = r();
      if (roll < 0.34) parts.push(box(0.8, 1.15, 0.22, PAL.stoneLo, xx, 0.55, z, { rz: (r() - 0.5) * 0.3 }), cyl(0.4, 0.4, 0.22, 8, PAL.stoneLo, xx, 1.1, z, { rx: Math.PI / 2 }));
      else if (roll < 0.52) parts.push(...crossGeo(PAL.stoneLo, xx, 0, z, 1.5, { ry: Math.PI / 2 }));
      else if (roll < 0.6) tree(xx, z + (z0 < 0 ? 0 : 1.5), 2.6 + r() * 1.6);
    }
  }
  return merge(parts);
}

/**
 * The wall of the cathedral close: a tall buttressed curtain running across the lanes (along z, from z0 to z1) at x = 0.
 * The cathedral stands in it; where a lane ends beside the cathedral rather than at it, a chapel stands in the wall instead.
 */
export function curtainModel(z0: number, z1: number): G {
  const len = z1 - z0, mid = (z0 + z1) / 2, parts: G[] = [box(0.9, 3.4, len, PAL.stone, 0, 1.7, mid), box(1.15, 0.2, len + 0.1, PAL.stoneHi, 0, 3.5, mid)];
  const n = Math.max(1, Math.round(len / 4.5));
  for (let i = 0; i <= n; i++) { const z = z0 + (len * i) / n; parts.push(box(1.5, 4.2, 1.1, PAL.stoneLo, 0, 2.1, z), spire(0.5, 0.9, PAL.roof, 0, 4.2, z)); }
  for (let i = 0; i < n; i++) parts.push(box(1.0, 0.5, 1.2, PAL.stone, 0, 3.85, z0 + (len * (i + 0.5)) / n)); // merlons
  return merge(parts);
}
/** A chapel of the cathedral close, its lit door and windows facing the lane (+x). It is the cathedral's face in an outer lane. */
export function chapelModel(team: 0 | 1): { lit: G; glow: G } {
  const t = TEAM[team], lit: G[] = [box(5, 0.4, 8.4, PAL.stoneLo, 0, 0.2, 0), box(4, 6, 7, PAL.stone, 0, 3.4, 0), box(4.3, 0.3, 7.3, PAL.stoneHi, 0, 6.5, 0),
    spire(2.3, 4.6, PAL.roof, 0, 6.6, 0), ...crossGeo(PAL.gold, 0, 11.1, 0, 1.1), ...lancet(0x120d0b, 2.02, 1.7, 0, 1.6, 2.4, "x"), box(0.5, 0.25, 2.4, PAL.stoneHi, 2.2, 0.55, 0)];
  const glow: G[] = [box(0.05, 1.9, 0.14, PAL.candle, 2.06, 1.5, 0), cyl(0.7, 0.7, 0.06, 16, t.glow, 2.04, 5.2, 0, { rz: Math.PI / 2 })];
  for (const sz of [-1, 1]) {
    lit.push(box(1.1, 7.4, 1.1, PAL.stoneLo, 1.7, 3.7, sz * 3.6), spire(0.55, 1.5, PAL.roof, 1.7, 7.4, sz * 3.6), box(0.5, 2.2, 0.06, t.main, 2.1, 3.3, sz * 2.3));
    glow.push(...lancet(t.glow, 2.03, 3.2, sz * 2.3, 0.6, 2, "x"));
  }
  return { lit: merge(lit), glow: merge(glow) };
}

/** Wrought-iron fence along the near edge. */
export function fenceModel(fromX: number, toX: number, z: number): G {
  const parts: G[] = [box(toX - fromX, 0.12, 0.12, PAL.ink, (fromX + toX) / 2, 1.5, z), box(toX - fromX, 0.12, 0.12, PAL.ink, (fromX + toX) / 2, 0.4, z)];
  for (let x = fromX; x < toX; x += 0.8) parts.push(cyl(0.05, 0.05, 2, 4, PAL.ink, x, 1, z), cyl(0, 0.12, 0.4, 4, PAL.ink, x, 2.2, z));
  for (let x = fromX; x < toX; x += 8) parts.push(box(0.5, 2.8, 0.5, PAL.stoneLo, x, 1.4, z), spire(0.3, 0.7, PAL.stoneLo, x, 2.8, z));
  return merge(parts);
}

/**
 * Precinct wall around a team's building ground, in local coordinates: x runs from the rear (0) to
 * the front (len), z across the lane (0..depth). A low buttressed wall closes both sides and runs `back`
 * further to the cathedral close; the rear is open, so the ground runs straight up to the cathedral steps and
 * an enemy who breaks through has a clear road to it. The front is open for the army, flanked by the base towers.
 */
export function precinctModel(team: 0 | 1, len: number, depth: number, gateFar = false, gateNear = false, back = 0): { lit: G; glow: G } {
  const t = TEAM[team], lit: G[] = [], glow: G[] = [], h = 1.1, th = 0.5, m = 0.9; // m = margin outside the ground
  const run = (x0: number, x1: number, z: number) => {
    lit.push(box(x1 - x0, h, th, PAL.stone, (x0 + x1) / 2, h / 2, z), box(x1 - x0 + 0.1, 0.14, th + 0.2, PAL.stoneHi, (x0 + x1) / 2, h + 0.07, z));
    for (let x = x0 + 2; x < x1 - 1; x += 4) lit.push(box(0.7, h + 0.5, th + 0.5, PAL.stoneLo, x, (h + 0.5) / 2, z), spire(0.36, 0.5, PAL.stoneHi, x, h + 0.5, z));
  };
  // a side that faces another lane's ground has a gate in the middle for the gravekeepers
  const side = (z: number, gate: boolean) => {
    if (!gate) return run(-back, len + 0.5, z);
    const g0 = len / 2 - 3.2, g1 = len / 2 + 3.2;
    run(-back, g0, z); run(g1, len + 0.5, z);
    for (const x of [g0, g1]) { lit.push(box(0.9, 2.6, 0.9, PAL.stoneLo, x, 1.3, z), spire(0.45, 0.9, PAL.roof, x, 2.6, z)); glow.push(ball(0.16, PAL.candle, x, 2.2, z + (z < 0 ? -0.5 : 0.5), 0)); }
  };
  side(-m, gateFar); side(depth + m, gateNear);
  for (const [x, z] of [[len + 0.5, -m], [len + 0.5, depth + m]] as const) { // corner piers with braziers
    lit.push(box(1.1, 2.4, 1.1, PAL.stoneLo, x, 1.2, z), box(1.3, 0.2, 1.3, PAL.stoneHi, x, 2.5, z), cyl(0.5, 0.3, 0.3, 6, PAL.ink, x, 2.75, z));
    glow.push(ball(0.3, PAL.flame, x, 3.0, z, 0));
  }
  for (let x = 4; x < len; x += 8) { // banners on the far wall, facing the camera
    if (gateFar && Math.abs(x - len / 2) < 4) continue;
    lit.push(box(0.08, 2.6, 0.08, PAL.ink, x, 1.3 + h * 0.4, -m + 0.3), box(1.0, 1.5, 0.05, t.main, x, h + 0.75, -m + 0.36), box(1.0, 0.3, 0.05, t.lo, x, h + 0.02, -m + 0.36),
      box(0.4, 0.08, 0.06, PAL.gold, x, h + 0.95, -m + 0.4), box(0.08, 0.6, 0.06, PAL.gold, x, h + 0.85, -m + 0.4));
  }
  return { lit: merge(lit), glow: merge(glow) };
}
