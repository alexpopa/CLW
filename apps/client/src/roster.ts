import { PAL, ball, box, cyl, leg, merge, plate } from "./kit";
import type { G, ModelDef, Pal, Part } from "./kit";

/**
 * The researched units: original low-poly models, authored like the first six (see kit.ts for axes and sizes).
 * Every model wears its team colour somewhere large (cloth, banner, wing) so armies read at a glance.
 */
const HALF = Math.PI / 2;
/** A bat wing lying flat, root at the origin, reaching `span` to the side (`side` +1 = toward the camera). */
const wing = (side: 1 | -1, span: number, chord: number, bone: number, skin: number): G => {
  const r = { rx: side * HALF };
  return merge([
    plate([[0.25, 0], [0.1, span * 0.55], [-0.1, span], [-chord * 0.55, span * 0.8], [-chord * 0.7, span * 0.52], [-chord, span * 0.3], [-chord * 0.75, 0]], 0.05, skin, 0, 0, 0, r),
    box(0.14, 0.14, span * 0.6, bone, 0.2, 0.05, side * span * 0.3), box(0.1, 0.1, span * 0.5, bone, 0.02, 0.05, side * span * 0.76, { ry: side * 0.22 }),
    box(chord * 0.75, 0.07, 0.07, bone, -chord * 0.3, 0.05, side * span * 0.52, { ry: side * 0.5 }),
  ]);
};
const wings = (pivot: [number, number, number], span: number, chord: number, bone: number, skin: number, speed: number, amp = 1): Part[] =>
  ([1, -1] as const).map(side => ({ motion: "wing" as const, side, speed, amp, pivot: [pivot[0], pivot[1], side * pivot[2]] as [number, number, number], geo: wing(side, span, chord, bone, skin) }));
/** Spoked wheel standing on the ground, turning about its axle. */
const wheel = (x: number, z: number, r: number, col = PAL.wood): Part => ({ motion: "wheel", pivot: [x, r, z], amp: r,
  geo: merge([cyl(r, r, 0.16, 10, col, 0, 0, 0, { rx: HALF }), box(r * 1.9, 0.1, 0.2, PAL.woodHi, 0, 0, 0), box(0.1, r * 1.9, 0.2, PAL.woodHi, 0, 0, 0), cyl(0.14, 0.14, 0.26, 6, PAL.steel, 0, 0, 0, { rx: HALF })]) });
/** A ragged hem: a ring of hanging strips below `y` around radius `r`. */
const tatters = (r: number, y: number, len: number, col: number, n = 7): G[] =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return box(0.2, len * (0.7 + (i % 3) * 0.2), 0.06, col, Math.cos(a) * r, y - len / 2, Math.sin(a) * r, { ry: -a + HALF }); });
const skull = (r: number, x: number, y: number, z: number, col = PAL.bone): G[] =>
  [ball(r, col, x, y, z, 1), box(r * 1.1, r * 0.6, r * 1.2, col, x + r * 0.25, y - r * 0.75, z), box(r * 0.2, r * 0.42, r * 0.36, PAL.ink, x + r * 0.9, y + r * 0.05, z + r * 0.42), box(r * 0.2, r * 0.42, r * 0.36, PAL.ink, x + r * 0.9, y + r * 0.05, z - r * 0.42)];

export const ROSTER: Record<string, (t: Pal) => ModelDef> = {
  // ---------- Tier I ----------
  // Grave hound: a starved wolfhound, ribs showing, in a spiked team collar.
  hound: t => ({
    height: 1.7, gait: "lope",
    body: merge([
      box(1.25, 0.5, 0.46, PAL.fur, 0, 1.0, 0, { rz: 0.06 }), box(0.6, 0.62, 0.52, PAL.fur, 0.42, 1.06, 0), box(0.5, 0.36, 0.38, PAL.fur, -0.5, 0.98, 0),
      ...[-0.25, -0.05, 0.15].flatMap(x => [box(0.06, 0.4, 0.03, PAL.bone, x, 0.98, 0.25, { rz: 0.2 }), box(0.06, 0.4, 0.03, PAL.bone, x, 0.98, -0.25, { rz: 0.2 })]),
      ...[-0.3, 0, 0.3].map(x => cyl(0, 0.07, 0.2, 4, PAL.ink, x, 1.34, 0)),
      box(0.16, 0.5, 0.5, t.main, 0.72, 1.22, 0, { rz: -0.35 }), cyl(0, 0.05, 0.2, 4, PAL.steelHi, 0.78, 1.52, 0),
    ]),
    legs: [
      { pivot: [0.45, 0.85, 0], geo: merge([box(0.13, 0.85, 0.13, PAL.fur, 0, -0.42, 0.2), box(0.13, 0.85, 0.13, PAL.fur, 0, -0.42, -0.2), box(0.22, 0.1, 0.15, PAL.ink, 0.05, -0.82, 0.2), box(0.22, 0.1, 0.15, PAL.ink, 0.05, -0.82, -0.2)]) },
      { pivot: [-0.5, 0.85, 0], geo: merge([box(0.15, 0.85, 0.13, PAL.fur, 0, -0.42, 0.2, { rz: -0.15 }), box(0.15, 0.85, 0.13, PAL.fur, 0, -0.42, -0.2, { rz: -0.15 }), box(0.22, 0.1, 0.15, PAL.ink, 0.1, -0.82, 0.2), box(0.22, 0.1, 0.15, PAL.ink, 0.1, -0.82, -0.2)]) },
    ],
    parts: [{ motion: "tail", pivot: [-0.72, 1.05, 0], amp: 1.3, geo: merge([box(0.5, 0.09, 0.09, PAL.fur, -0.24, 0.06, 0, { rz: -0.35 }), box(0.3, 0.07, 0.07, PAL.ink, -0.56, 0.2, 0, { rz: -0.6 })]) }],
    weapon: { pivot: [0.82, 1.3, 0], anim: "bite",
      geo: merge([box(0.5, 0.36, 0.4, PAL.fur, 0.18, 0.06, 0), box(0.46, 0.16, 0.26, PAL.fur, 0.56, 0.04, 0), box(0.4, 0.1, 0.24, PAL.ink, 0.52, -0.14, 0, { rz: -0.22 }),
        box(0.05, 0.1, 0.22, PAL.bone, 0.72, -0.07, 0), cyl(0, 0.08, 0.3, 4, PAL.fur, 0.06, 0.36, 0.14, { rz: 0.3 }), cyl(0, 0.08, 0.3, 4, PAL.fur, 0.06, 0.36, -0.14, { rz: 0.3 })]),
      glow: merge([ball(0.05, t.glow, 0.4, 0.14, 0.17, 0), ball(0.05, t.glow, 0.4, 0.14, -0.17, 0)]) },
  }),
  // Flagellant: bare-backed penitent in a sack hood, crowned with candles, swinging a barbed scourge.
  flagellant: t => ({
    height: 2.8,
    body: merge([
      box(0.48, 0.92, 0.72, PAL.skin, 0.04, 1.46, 0, { rz: -0.12 }), box(0.5, 0.12, 0.74, PAL.leather, 0, 1.06, 0),
      ...[1.3, 1.52, 1.74].map(y => box(0.03, 0.05, 0.5, PAL.blood, -0.21 + (y - 1.3) * 0.12, y, 0)),
      box(0.07, 0.75, 0.5, t.main, 0.3, 0.72, 0, { rz: 0.1 }), box(0.07, 0.6, 0.5, t.lo, -0.3, 0.76, 0, { rz: -0.1 }),
      cyl(0.24, 0.3, 0.5, 7, PAL.cloth, 0.12, 2.1, 0), cyl(0, 0.24, 0.4, 7, PAL.cloth, 0.04, 2.5, 0, { rz: 0.5 }),
      box(0.03, 0.06, 0.12, PAL.ink, 0.37, 2.14, 0.1), box(0.03, 0.06, 0.12, PAL.ink, 0.37, 2.14, -0.1),
      cyl(0.3, 0.3, 0.05, 8, PAL.iron, 0.12, 2.34, 0), ...[0.22, -0.22].map(z => box(0.06, 0.16, 0.06, PAL.bone, 0.12, 2.44, z)),
      box(0.2, 0.2, 0.2, PAL.skin, 0.06, 1.8, -0.44),
    ]),
    glow: merge([ball(0.05, PAL.candle, 0.12, 2.56, 0.22, 0), ball(0.05, PAL.candle, 0.12, 2.56, -0.22, 0)]),
    legs: [leg(PAL.skin, PAL.leather, 0.19), leg(PAL.skin, PAL.leather, -0.19)],
    parts: [{ motion: "arm", side: -1, pivot: [0.06, 1.8, -0.44], geo: merge([box(0.18, 0.62, 0.18, PAL.skin, 0.06, -0.3, 0, { rz: 0.3 }), box(0.14, 0.14, 0.14, PAL.skin, 0.2, -0.62, 0)]) }],
    weapon: { pivot: [0.06, 1.8, 0.44], anim: "swing",
      geo: merge([box(0.2, 0.6, 0.2, PAL.skin, 0.08, 0.2, 0, { rz: -0.4 }), cyl(0.04, 0.04, 0.5, 5, PAL.wood, 0.3, 0.62, 0, { rz: -0.5 }),
        ...[-0.14, 0, 0.14].flatMap((z, i) => [box(0.04, 0.75, 0.04, PAL.iron, 0.52 + i * 0.05, 1.15, z, { rz: -0.3 + i * 0.1, rx: z }), box(0.1, 0.1, 0.1, PAL.steelHi, 0.66 + i * 0.1, 1.5, z * 1.6)])]) },
  }),
  // Hexbinder: a bent hedge witch under a crooked hat, with a charm-hung staff.
  hexbinder: t => ({
    height: 3, gait: "shuffle",
    body: merge([
      cyl(0.3, 0.62, 1.7, 8, PAL.hex, 0, 0.85, 0), ...tatters(0.6, 0.3, 0.3, PAL.hex),
      cyl(0.36, 0.5, 0.5, 8, t.main, 0.03, 1.66, 0), box(0.1, 0.9, 0.34, t.lo, 0.36, 1.25, 0, { rz: 0.2 }),
      ball(0.2, PAL.pale, 0.16, 2.04, 0), cyl(0, 0.06, 0.3, 4, PAL.pale, 0.42, 2.0, 0, { rz: -HALF - 0.3 }),
      box(0.1, 0.5, 0.42, PAL.steelHi, -0.06, 1.86, 0, { rz: 0.2 }),
      cyl(0.58, 0.6, 0.05, 10, PAL.hat, 0.12, 2.24, 0, { rz: -0.1 }), cyl(0.14, 0.3, 0.5, 8, PAL.hat, 0.1, 2.5, 0), cyl(0, 0.15, 0.55, 6, PAL.hat, -0.1, 2.9, 0, { rz: 0.8 }),
      cyl(0.31, 0.31, 0.08, 8, t.main, 0.1, 2.32, 0),
    ]),
    glow: merge([ball(0.035, PAL.storm, 0.34, 2.08, 0.08, 0), ball(0.035, PAL.storm, 0.34, 2.08, -0.08, 0)]),
    parts: [{ motion: "sway", pivot: [0.62, 2.32, 0.42], amp: 1.2, geo: merge([box(0.03, 0.4, 0.03, PAL.ink, 0, -0.2, 0), ...skull(0.11, 0, -0.5, 0), box(0.03, 0.26, 0.03, PAL.ink, 0.1, -0.13, 0), box(0.1, 0.14, 0.03, PAL.gold, 0.1, -0.32, 0)]) }],
    weapon: { pivot: [0.12, 1.62, 0.42], anim: "cast",
      geo: merge([box(0.5, 0.2, 0.2, PAL.hex, 0.2, -0.04, 0), cyl(0.05, 0.035, 2.6, 5, PAL.wood, 0.46, 0.0, 0, { rz: -0.08 }), box(0.3, 0.06, 0.06, PAL.wood, 0.55, 1.22, 0, { rz: 0.5 }), box(0.26, 0.06, 0.06, PAL.wood, 0.44, 1.26, 0, { rz: -0.6 })]),
      glow: ball(0.14, PAL.storm, 0.52, 1.46, 0, 1) },
  }),

  // ---------- Tier II ----------
  // Gargoyle: horned stone beast on bat wings, a rune burning in its chest.
  gargoyle: t => ({
    height: 2.4, gait: "fly", hover: 3.1,
    body: merge([
      box(0.8, 0.95, 0.85, PAL.stone, 0, 1.3, 0, { rz: -0.5 }), box(0.6, 0.6, 0.6, PAL.stoneLo, -0.4, 0.9, 0, { rz: -0.3 }),
      box(0.5, 0.5, 0.56, PAL.stoneHi, 0.52, 1.82, 0), box(0.36, 0.2, 0.36, PAL.stoneLo, 0.8, 1.68, 0), box(0.05, 0.1, 0.3, PAL.bone, 0.95, 1.6, 0),
      cyl(0, 0.1, 0.5, 5, PAL.stoneLo, 0.42, 2.26, 0.2, { rz: 0.5, rx: 0.3 }), cyl(0, 0.1, 0.5, 5, PAL.stoneLo, 0.42, 2.26, -0.2, { rz: 0.5, rx: -0.3 }),
      box(0.3, 0.42, 0.9, t.main, -0.3, 0.72, 0, { rz: -0.3 }), box(0.34, 0.08, 0.94, PAL.gold, -0.2, 0.94, 0, { rz: -0.3 }),
      ...[0.26, -0.26].flatMap(z => [box(0.24, 0.6, 0.22, PAL.stoneLo, -0.1, 0.5, z, { rz: 0.5 }), box(0.22, 0.5, 0.2, PAL.stone, 0.08, 0.14, z, { rz: -0.5 }), box(0.34, 0.1, 0.26, PAL.ink, 0.3, -0.06, z)]),
    ]),
    glow: merge([ball(0.05, t.glow, 0.78, 1.9, 0.16, 0), ball(0.05, t.glow, 0.78, 1.9, -0.16, 0), box(0.06, 0.34, 0.1, t.glow, 0.42, 1.36, 0, { rz: -0.5 }), box(0.06, 0.1, 0.34, t.glow, 0.46, 1.42, 0, { rz: -0.5 })]),
    parts: [
      ...wings([-0.2, 1.75, 0.34], 2.3, 1.5, PAL.stoneLo, t.lo, 9),
      { motion: "tail", pivot: [-0.7, 0.8, 0], geo: merge([box(0.8, 0.14, 0.14, PAL.stone, -0.38, -0.12, 0, { rz: 0.35 }), cyl(0, 0.14, 0.34, 4, PAL.stoneLo, -0.86, -0.3, 0, { rz: HALF + 0.35 })]) },
    ],
    weapon: { pivot: [0.3, 1.56, 0.5], anim: "swing",
      geo: merge([box(0.24, 0.24, 0.24, PAL.stoneHi, 0, 0, 0), box(0.2, 0.7, 0.2, PAL.stone, 0.2, 0.26, 0, { rz: -0.7 }), ...[-0.1, 0, 0.1].map(z => cyl(0, 0.05, 0.3, 4, PAL.ink, 0.56, 0.62, z, { rz: -1.2 }))]) },
  }),
  // Witch hunter: long coat, tall buckled hat, a hooded lantern at the hip and a silver-barrelled gun.
  witchhunter: t => ({
    height: 3.1,
    body: merge([
      cyl(0.3, 0.46, 1.25, 8, PAL.coat, 0, 1.3, 0), box(0.5, 0.2, 0.74, PAL.coat, 0, 1.88, 0), box(0.14, 0.36, 0.5, PAL.hat, -0.14, 2.06, 0),
      box(0.05, 1.1, 0.16, t.main, 0.36, 1.36, 0.06, { rz: 0.1 }), box(0.56, 0.09, 0.8, PAL.leather, 0, 1.18, 0), box(0.1, 0.14, 0.18, PAL.gold, 0.4, 1.18, 0),
      box(0.56, 0.08, 0.1, PAL.leather, 0.02, 1.56, 0.36, { rx: 0.6 }),
      ball(0.2, PAL.pale, 0.03, 2.16, 0), box(0.24, 0.16, 0.36, t.main, 0.1, 2.02, 0),
      cyl(0.56, 0.56, 0.05, 12, PAL.hat, 0, 2.34, 0), cyl(0.2, 0.26, 0.56, 10, PAL.hat, 0, 2.62, 0), cyl(0.27, 0.27, 0.1, 10, PAL.leather, 0, 2.42, 0), box(0.06, 0.12, 0.14, PAL.gold, 0.27, 2.42, 0),
    ]),
    legs: [leg(PAL.dark, PAL.leather, 0.18), leg(PAL.dark, PAL.leather, -0.18)],
    parts: [
      { motion: "cape", pivot: [-0.3, 1.94, 0], geo: merge([box(0.07, 1.5, 0.84, t.lo, -0.06, -0.75, 0, { rz: -0.1 }), box(0.08, 0.2, 0.86, t.main, -0.02, -0.08, 0)]) },
      { motion: "sway", pivot: [0.1, 1.2, -0.5], geo: merge([box(0.03, 0.3, 0.03, PAL.ink, 0, -0.15, 0), box(0.24, 0.06, 0.24, PAL.ink, 0, -0.3, 0), box(0.24, 0.06, 0.24, PAL.ink, 0, -0.62, 0), cyl(0, 0.16, 0.14, 4, PAL.ink, 0, -0.22, 0)]), glow: box(0.16, 0.24, 0.16, PAL.candle, 0, -0.46, 0) },
    ],
    weapon: { pivot: [0.08, 1.78, 0.42], anim: "recoil",
      geo: merge([box(0.56, 0.2, 0.2, PAL.coat, 0.24, -0.06, 0), box(0.5, 0.16, 0.12, PAL.wood, 0.5, -0.12, 0, { rz: -0.2 }), cyl(0.045, 0.055, 1.5, 6, PAL.steelHi, 1.3, -0.04, 0, { rz: -HALF }),
        box(0.1, 0.12, 0.14, PAL.gold, 0.72, 0.03, 0), cyl(0.08, 0.06, 0.1, 6, PAL.steelHi, 2.06, -0.04, 0, { rz: -HALF })]) },
  }),
  // Iron Penitent: a giant riveted into a cage, chains trailing, with a two-handed maul.
  penitent: t => ({
    height: 3.8, gait: "stomp",
    body: merge([
      box(0.9, 1.25, 1.2, PAL.rust, 0, 1.95, 0), box(0.96, 0.14, 1.26, PAL.iron, 0, 1.5, 0), box(0.96, 0.14, 1.26, PAL.iron, 0, 2.4, 0),
      ...[-0.4, 0, 0.4].map(z => box(0.06, 1.1, 0.1, PAL.iron, 0.47, 1.95, z)), ...[1.7, 2.1].flatMap(y => [-0.5, -0.17, 0.17, 0.5].map(z => ball(0.05, PAL.steelHi, 0.49, y, z, 0))),
      box(0.08, 1.5, 0.62, t.main, 0.5, 1.5, 0), box(0.1, 0.1, 0.66, PAL.gold, 0.5, 2.22, 0), box(0.1, 0.46, 0.1, PAL.bone, 0.56, 1.7, 0), box(0.1, 0.1, 0.34, PAL.bone, 0.56, 1.8, 0),
      ball(0.42, PAL.iron, 0, 2.62, 0.72, 0), ball(0.42, PAL.iron, 0, 2.62, -0.72, 0), cyl(0, 0.12, 0.34, 4, PAL.steelHi, 0, 3.04, 0.76), cyl(0, 0.12, 0.34, 4, PAL.steelHi, 0, 3.04, -0.76),
      ball(0.24, PAL.skin, 0.06, 2.98, 0, 1),
      cyl(0.4, 0.4, 0.07, 8, PAL.iron, 0.06, 2.74, 0), cyl(0.4, 0.34, 0.07, 8, PAL.iron, 0.06, 3.3, 0),
      ...Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return box(0.05, 0.56, 0.05, PAL.iron, 0.06 + Math.cos(a) * 0.38, 3.02, Math.sin(a) * 0.38); }),
      box(0.08, 0.2, 0.08, PAL.bone, 0.06, 3.44, 0),
    ]),
    glow: ball(0.07, PAL.candle, 0.06, 3.6, 0, 0),
    legs: [
      { pivot: [0, 1.4, 0.34], geo: merge([box(0.46, 1.4, 0.46, PAL.rust, 0, -0.7, 0), box(0.6, 0.3, 0.5, PAL.iron, 0.08, -1.25, 0), box(0.5, 0.12, 0.5, PAL.iron, 0, -0.5, 0)]) },
      { pivot: [0, 1.4, -0.34], geo: merge([box(0.46, 1.4, 0.46, PAL.rust, 0, -0.7, 0), box(0.6, 0.3, 0.5, PAL.iron, 0.08, -1.25, 0), box(0.5, 0.12, 0.5, PAL.iron, 0, -0.5, 0)]) },
    ],
    parts: [
      { motion: "sway", pivot: [-0.46, 2.4, 0.4], amp: 0.7, geo: merge(Array.from({ length: 5 }, (_, i) => box(0.1, 0.2, 0.06, i % 2 ? PAL.steel : PAL.iron, 0, -0.1 - i * 0.2, 0, { ry: i % 2 ? HALF : 0 }))) },
      { motion: "sway", pivot: [-0.46, 2.4, -0.4], amp: 0.7, phase: 1.4, geo: merge(Array.from({ length: 6 }, (_, i) => box(0.1, 0.2, 0.06, i % 2 ? PAL.steel : PAL.iron, 0, -0.1 - i * 0.2, 0, { ry: i % 2 ? HALF : 0 }))) },
    ],
    weapon: { pivot: [0.1, 2.5, 0.78], anim: "chop",
      geo: merge([box(0.34, 0.9, 0.34, PAL.rust, 0.14, -0.3, 0, { rz: 0.5 }), box(0.3, 0.3, 0.3, PAL.iron, 0.4, -0.66, 0), cyl(0.06, 0.06, 2.9, 6, PAL.wood, 0.42, 0.5, 0, { rz: -0.12 }),
        box(0.9, 0.62, 0.62, PAL.iron, 0.58, 1.8, 0), box(0.14, 0.7, 0.7, PAL.steelHi, 0.96, 1.8, 0), box(0.14, 0.7, 0.7, PAL.steelHi, 0.2, 1.8, 0), cyl(0, 0.12, 0.34, 4, PAL.steelHi, 0.58, 2.26, 0)]) },
  }),
  // Necromancer: gaunt robed figure with a horned cowl, a ghost-fire skull in one hand and a crystal scythe-staff.
  necromancer: t => ({
    height: 3.3, gait: "shuffle",
    body: merge([
      cyl(0.26, 0.52, 1.9, 8, PAL.ink, 0, 0.95, 0), ...tatters(0.5, 0.25, 0.26, PAL.moss, 8),
      box(0.06, 1.5, 0.3, t.main, 0.4, 1.1, 0, { rz: 0.14 }), box(0.07, 0.07, 0.34, PAL.gold, 0.5, 0.42, 0), box(0.07, 0.2, 0.2, PAL.bone, 0.36, 1.56, 0),
      box(0.56, 0.22, 0.9, PAL.moss, 0, 1.92, 0), cyl(0, 0.16, 0.5, 4, PAL.moss, 0, 2.16, 0.46, { rx: 0.5 }), cyl(0, 0.16, 0.5, 4, PAL.moss, 0, 2.16, -0.46, { rx: -0.5 }),
      ...skull(0.19, 0.08, 2.3, 0), cyl(0.3, 0.34, 0.5, 8, PAL.ink, -0.06, 2.3, 0),
      cyl(0, 0.07, 0.6, 4, PAL.bone, -0.1, 2.82, 0.2, { rx: 0.3, rz: 0.3 }), cyl(0, 0.07, 0.6, 4, PAL.bone, -0.1, 2.82, -0.2, { rx: -0.3, rz: 0.3 }),
    ]),
    glow: merge([ball(0.04, PAL.venom, 0.25, 2.32, 0.08, 0), ball(0.04, PAL.venom, 0.25, 2.32, -0.08, 0)]),
    parts: [
      { motion: "bob", pivot: [0.62, 1.7, -0.5], amp: 0.8, geo: merge(skull(0.15, 0, 0, 0)), glow: merge([cyl(0, 0.16, 0.42, 6, PAL.venom, -0.02, 0.3, 0), ball(0.04, PAL.venom, 0.14, 0.01, 0.06, 0), ball(0.04, PAL.venom, 0.14, 0.01, -0.06, 0)]) },
      { motion: "cape", pivot: [-0.26, 1.96, 0], amp: 0.8, geo: plate([[0, 0.42], [0, -0.42], [-0.3, -0.6], [-1.6, -0.5], [-1.35, -0.2], [-1.7, 0.05], [-1.3, 0.3], [-1.55, 0.55]], 0.06, PAL.moss, 0, 0, 0, { rx: HALF, rz: HALF - 0.15 }) },
    ],
    weapon: { pivot: [0.1, 1.72, 0.44], anim: "cast",
      geo: merge([box(0.5, 0.18, 0.18, PAL.ink, 0.2, -0.04, 0), cyl(0.045, 0.045, 3.0, 5, PAL.bone, 0.46, 0.1, 0),
        plate([[0, 0], [0.9, 0.16], [1.2, -0.2], [0.8, 0], [0, -0.16]], 0.05, PAL.steelHi, 0.44, 1.5, 0), box(0.14, 0.14, 0.14, PAL.gold, 0.46, 1.5, 0)]),
      glow: cyl(0, 0.13, 0.36, 4, PAL.venom, 0.46, 1.8, 0) },
  }),
  // Shade: a hooded, footless ghost trailing rags, with a sickle in each hand.
  shade: t => {
    const sickle = (): G => merge([box(0.16, 0.5, 0.16, PAL.shadow, 0.1, 0.16, 0, { rz: -0.6 }), cyl(0.035, 0.035, 0.5, 5, PAL.ink, 0.36, 0.42, 0, { rz: -0.4 }),
      plate([[0, 0], [0.3, 0.42], [0.72, 0.42], [0.98, 0.1], [0.66, 0.26], [0.32, 0.24]], 0.04, PAL.steelHi, 0.42, 0.6, 0)]);
    return {
      height: 2.9, gait: "float", ghost: true,
      body: merge([
        cyl(0.34, 0.12, 1.5, 8, PAL.shadow, -0.06, 1.05, 0, { rz: -0.14 }), box(0.56, 0.5, 0.84, PAL.shadow, 0.04, 1.8, 0),
        cyl(0.3, 0.36, 0.5, 8, PAL.night, 0.1, 2.24, 0), cyl(0, 0.3, 0.5, 8, PAL.night, -0.02, 2.66, 0, { rz: 0.5 }), box(0.06, 0.34, 0.36, PAL.ink, 0.36, 2.22, 0),
        box(0.07, 0.9, 0.24, t.main, 0.34, 1.5, 0, { rz: 0.08 }), box(0.6, 0.08, 0.88, t.lo, 0.04, 2.02, 0),
      ]),
      glow: merge([ball(0.05, t.glow, 0.4, 2.26, 0.09, 0), ball(0.05, t.glow, 0.4, 2.26, -0.09, 0)]),
      parts: [
        ...[0.26, 0, -0.26].map((z, i): Part => ({ motion: "cape", pivot: [-0.2, 1.3 - i * 0.14, z], amp: 1.3, phase: i * 1.7,
          geo: plate([[0, 0.13], [0, -0.13], [-0.9 - i * 0.15, -0.05], [-0.6, 0.02], [-1.1 - i * 0.2, 0.12]], 0.05, i === 1 ? PAL.night : PAL.shadow, 0, 0, 0, { rx: HALF, rz: HALF - 0.3 }) })),
        { motion: "arm", side: -1, amp: 0.5, pivot: [0.1, 1.86, -0.46], geo: sickle() },
      ],
      weapon: { pivot: [0.1, 1.86, 0.46], anim: "swing", geo: sickle() },
    };
  },

  // ---------- Tier III ----------
  // Bone Colossus: an ossuary on legs. Horned skull, a soul-fire caged in its ribs, a scythe of fused bone for each arm.
  colossus: t => {
    const arm = (): G => merge([ball(0.5, PAL.bone, 0, 0, 0, 1), box(0.4, 1.7, 0.4, PAL.bone, 0.3, -0.8, 0, { rz: 0.35 }), ...skull(0.3, 0.62, -1.62, 0),
      box(0.3, 1.5, 0.3, PAL.stoneHi, 1.2, -1.75, 0, { rz: 1.1 }), plate([[0, 0], [0.7, 0.5], [1.9, 0.5], [2.7, -0.2], [1.8, 0.14], [0.8, 0.1]], 0.1, PAL.bone, 1.8, -1.4, 0)]);
    const legGeo = (): G => merge([box(0.5, 1.5, 0.5, PAL.bone, 0, -0.75, 0), ...skull(0.3, 0.14, -1.5, 0), box(0.42, 1.4, 0.42, PAL.stoneHi, 0, -2.3, 0), box(0.9, 0.3, 0.7, PAL.bone, 0.14, -2.95, 0)]);
    return {
      height: 7, gait: "stomp",
      body: merge([
        box(1.3, 0.6, 1.6, PAL.bone, 0, 3.2, 0), ...[3.7, 4.1, 4.5, 4.9].map(y => box(0.4, 0.3, 0.4, PAL.stoneHi, -0.3, y, 0)),
        ...[3.9, 4.3, 4.7, 5.1].flatMap((y, i) => [1, -1].flatMap(sd => [
          box(1.3 - i * 0.06, 0.14, 0.14, PAL.bone, 0.3, y, sd * (0.95 - i * 0.05)), box(0.14, 0.14, 0.9 - i * 0.05, PAL.bone, -0.36, y, sd * 0.5), box(0.14, 0.14, 0.5, PAL.bone, 0.96, y, sd * 0.7),
        ])),
        box(0.6, 0.3, 2.6, PAL.bone, 0, 5.5, 0), box(0.1, 2.0, 0.9, t.main, 1.06, 3.3, 0), box(0.12, 0.14, 0.96, PAL.gold, 1.06, 4.28, 0), box(0.1, 0.5, 0.9, t.lo, 1.06, 2.1, 0),
        box(0.12, 0.7, 0.14, PAL.bone, 1.12, 3.5, 0), box(0.12, 0.14, 0.5, PAL.bone, 1.12, 3.66, 0),
        ...skull(0.62, 0.3, 6.2, 0), cyl(0, 0.18, 1.1, 5, PAL.stoneHi, 0.1, 6.9, 0.6, { rx: 0.7, rz: 0.2 }), cyl(0, 0.18, 1.1, 5, PAL.stoneHi, 0.1, 6.9, -0.6, { rx: -0.7, rz: 0.2 }),
        ...[1, -1].flatMap(sd => skull(0.36, 0, 5.9, sd * 1.36)),
      ]),
      glow: merge([ball(0.48, t.glow, 0.3, 4.4, 0, 1), ball(0.11, t.glow, 0.86, 6.24, 0.26, 0), ball(0.11, t.glow, 0.86, 6.24, -0.26, 0)]),
      legs: [{ pivot: [0, 3.1, 0.55], geo: legGeo() }, { pivot: [0, 3.1, -0.55], geo: legGeo() }],
      parts: [
        { motion: "arm", side: -1, amp: 0.5, pivot: [0.1, 5.4, -1.4], geo: arm() },
        { motion: "sway", pivot: [-0.5, 3.4, 0], amp: 0.5, geo: merge([box(0.08, 1.3, 1.1, t.lo, -0.04, -0.65, 0), ...[-0.4, 0, 0.4].map(z => box(0.08, 0.3, 0.26, t.main, -0.04, -1.4, z))]) },
      ],
      weapon: { pivot: [0.1, 5.4, 1.4], anim: "chop", geo: arm() },
    };
  },
  // Ash Wyrm: a long winged serpent with a furnace in its throat.
  wyrm: t => {
    const seg = (x: number, y: number, s: number, rz = 0): G[] => [box(1.0, 0.7 * s, 0.8 * s, PAL.scale, x, y, 0, { rz }), box(0.9, 0.16, 0.5 * s, PAL.ember, x, y - 0.3 * s, 0, { rz }), cyl(0, 0.12 * s, 0.4 * s, 4, PAL.ink, x, y + 0.5 * s, 0, { rz })];
    return {
      height: 2.6, gait: "fly", hover: 3.6,
      body: merge([
        ...seg(0.9, 1.55, 1.1, 0.25), ...seg(0, 1.4, 1.25), ...seg(-0.95, 1.5, 1.1, -0.2), ...seg(-1.85, 1.75, 0.9, -0.3),
        box(1.3, 0.14, 1.0, t.main, 0, 1.86, 0), box(1.34, 0.08, 1.04, PAL.gold, 0, 1.8, 0), box(0.6, 0.5, 0.05, t.main, 0, 1.5, 0.52), box(0.6, 0.5, 0.05, t.main, 0, 1.5, -0.52),
        ...[0.3, -0.3].flatMap(z => [box(0.2, 0.6, 0.2, PAL.scale, 0.5, 0.9, z, { rz: 0.4 }), ...[-0.08, 0.08].map(dz => cyl(0, 0.04, 0.26, 4, PAL.ink, 0.72, 0.56, z + dz, { rz: -2.4 }))]),
      ]),
      glow: merge([box(0.5, 0.06, 0.3, PAL.ember, 0.4, 1.02, 0), box(0.5, 0.06, 0.3, PAL.ember, -0.5, 1.0, 0)]),
      parts: [
        ...wings([0.1, 1.9, 0.44], 3.0, 2.1, PAL.scale, t.lo, 6, 0.8),
        { motion: "tail", pivot: [-2.3, 1.9, 0], amp: 0.9, geo: merge([box(1.2, 0.4, 0.4, PAL.scale, -0.55, 0.08, 0, { rz: -0.15 }), box(1.0, 0.24, 0.24, PAL.scale, -1.5, 0.26, 0, { rz: -0.2 }), plate([[0, 0], [-0.6, 0.4], [-0.4, 0], [-0.6, -0.4]], 0.06, PAL.ember, -1.95, 0.36, 0, { rx: HALF })]) },
      ],
      weapon: { pivot: [1.35, 1.8, 0], anim: "bite",
        geo: merge([box(0.8, 0.4, 0.4, PAL.scale, 0.3, 0.14, 0, { rz: 0.5 }), box(0.9, 0.44, 0.6, PAL.scale, 0.95, 0.5, 0), box(0.7, 0.2, 0.44, PAL.scale, 1.6, 0.5, 0), box(0.9, 0.14, 0.44, PAL.ink, 1.35, 0.2, 0, { rz: -0.22 }),
          ...[0.24, -0.24].map(z => cyl(0, 0.09, 0.7, 5, PAL.bone, 0.45, 0.95, z, { rz: 0.9 })), ...[0, 1, 2].flatMap(i => [0.2, -0.2].map(z => cyl(0, 0.035, 0.14, 4, PAL.bone, 1.3 + i * 0.22, 0.34, z, { rz: Math.PI })))]),
        glow: merge([ball(0.07, PAL.flame, 1.25, 0.66, 0.31, 0), ball(0.07, PAL.flame, 1.25, 0.66, -0.31, 0), box(0.5, 0.1, 0.3, PAL.flame, 1.4, 0.32, 0, { rz: -0.1 })]) },
    };
  },
  // Tempest Cantor: veiled priestess under a storm halo, a hymnal floating open before her.
  cantor: t => ({
    height: 3.5, gait: "shuffle",
    body: merge([
      cyl(0.3, 0.6, 1.9, 10, PAL.habit, 0, 0.95, 0), cyl(0.62, 0.64, 0.1, 10, PAL.gold, 0, 0.1, 0),
      box(0.07, 1.6, 0.34, t.main, 0.42, 1.05, 0, { rz: 0.15 }), box(0.08, 0.08, 0.38, PAL.gold, 0.53, 0.34, 0), box(0.09, 0.4, 0.1, PAL.gold, 0.4, 1.3, 0), box(0.09, 0.1, 0.3, PAL.gold, 0.4, 1.4, 0),
      cyl(0.4, 0.5, 0.36, 10, t.main, 0, 1.84, 0), cyl(0.42, 0.42, 0.06, 10, PAL.gold, 0, 1.68, 0),
      ball(0.2, PAL.pale, 0.05, 2.24, 0), cyl(0.26, 0.32, 0.6, 8, PAL.habit, -0.06, 2.2, 0), box(0.2, 0.6, 0.5, PAL.habit, -0.26, 1.86, 0, { rz: -0.2 }),
      cyl(0.16, 0.26, 0.5, 4, PAL.habit, -0.02, 2.72, 0, { ry: Math.PI / 4 }), cyl(0, 0.16, 0.26, 4, PAL.gold, -0.02, 3.1, 0, { ry: Math.PI / 4 }),
      box(0.2, 0.2, 0.2, PAL.habit, 0.04, 1.8, -0.44),
    ]),
    glow: merge([
      ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return box(0.05, 0.12, 0.3, PAL.storm, -0.3, 2.5 + Math.sin(a) * 0.74, Math.cos(a) * 0.74, { rx: -a }); }),
      ...[0, 1, 2, 3, 4, 5].map(i => { const a = (i / 6) * Math.PI * 2 + 0.26; return cyl(0, 0.05, 0.3, 4, PAL.storm, -0.3, 2.5 + Math.sin(a) * 0.98, Math.cos(a) * 0.98, { rx: HALF - a }); }),
    ]),
    parts: [
      { motion: "bob", pivot: [0.74, 1.72, -0.2], amp: 0.6, geo: merge([box(0.34, 0.06, 0.5, PAL.leather, 0, 0, 0, { rz: 0.5 }), box(0.3, 0.04, 0.22, PAL.bone, 0.0, 0.05, 0.12, { rz: 0.5, rx: -0.2 }), box(0.3, 0.04, 0.22, PAL.bone, 0.0, 0.05, -0.12, { rz: 0.5, rx: 0.2 })]), glow: box(0.2, 0.02, 0.3, PAL.storm, -0.03, 0.09, 0, { rz: 0.5 }) },
      { motion: "arm", side: -1, amp: 0.3, pivot: [0.04, 1.8, -0.44], geo: box(0.18, 0.6, 0.18, PAL.habit, 0.22, 0.0, 0, { rz: -1.1 }) },
    ],
    weapon: { pivot: [0.08, 1.8, 0.46], anim: "cast",
      geo: merge([box(0.2, 0.62, 0.2, PAL.habit, 0.14, 0.24, 0, { rz: -0.5 }), cyl(0.04, 0.04, 2.5, 5, PAL.gold, 0.4, 0.5, 0), cyl(0.24, 0.24, 0.05, 10, PAL.gold, 0.4, 1.9, 0, { rx: HALF }),
        cyl(0.12, 0.2, 0.26, 6, PAL.bronze, 0.4, 1.86, 0)]),
      glow: merge([cyl(0, 0.07, 0.5, 4, PAL.storm, 0.4, 2.36, 0), box(0.04, 0.3, 0.04, PAL.storm, 0.56, 2.2, 0, { rz: -0.7 }), box(0.04, 0.3, 0.04, PAL.storm, 0.24, 2.2, 0, { rz: 0.7 })]) },
  }),
  // Reliquary: a gilded ark on a bier, drawn by two hooded bearers, candles burning around a saint's skull behind glass.
  reliquary: t => {
    const bearer = (x: number, z: number): G[] => [cyl(0.2, 0.34, 1.0, 6, PAL.robe, x, 1.5, z), cyl(0.2, 0.24, 0.34, 6, PAL.robe, x + 0.04, 2.16, z), cyl(0, 0.2, 0.3, 6, PAL.robe, x - 0.02, 2.46, z, { rz: 0.4 }),
      ball(0.12, PAL.ink, x + 0.14, 2.14, z, 0), box(0.5, 0.1, 0.1, PAL.robe, x - 0.2, 1.66, z)];
    return {
      height: 4.4, gait: "roll", aura: 7,
      body: merge([
        ...bearer(1.9, 0.5), ...bearer(1.9, -0.5), box(1.9, 0.08, 0.08, PAL.wood, 0.85, 1.62, 0.5), box(1.9, 0.08, 0.08, PAL.wood, 0.85, 1.62, -0.5),
        box(2.6, 0.22, 1.5, PAL.wood, -0.6, 0.95, 0), box(2.7, 0.1, 1.6, PAL.gold, -0.6, 1.1, 0),
        box(1.8, 1.1, 1.1, PAL.bronze, -0.6, 1.7, 0), box(1.9, 0.12, 1.2, PAL.gold, -0.6, 2.28, 0), box(1.9, 0.12, 1.2, PAL.gold, -0.6, 1.2, 0),
        ...[-1.45, 0.25].flatMap(x => [0.52, -0.52].map(z => box(0.14, 1.1, 0.14, PAL.gold, x, 1.7, z))),
        plate([[-1.0, 0], [1.0, 0], [0, 0.85]], 1.24, PAL.gold, -0.6, 2.34, 0, { ry: HALF }), box(1.94, 0.1, 0.1, PAL.candle, -0.6, 3.2, 0),
        box(0.1, 0.9, 0.1, PAL.gold, -0.6, 3.6, 0), box(0.1, 0.1, 0.5, PAL.gold, -0.6, 3.76, 0),
        box(1.3, 0.9, 0.05, t.main, -0.6, 1.3, 0.78), box(1.36, 0.08, 0.08, PAL.gold, -0.6, 1.76, 0.8), box(0.1, 0.5, 0.04, PAL.bone, -0.6, 1.34, 0.82), box(0.34, 0.1, 0.04, PAL.bone, -0.6, 1.44, 0.82),
        box(1.3, 0.9, 0.05, t.main, -0.6, 1.3, -0.78), ...[-1.7, 0.5].flatMap(x => [0.6, -0.6].map(z => box(0.08, 0.3, 0.08, PAL.bone, x, 1.3, z))),
        ...skull(0.2, -0.6, 1.72, 0.48),
      ]),
      glow: merge([box(0.7, 0.6, 0.04, PAL.heal, -0.6, 1.76, 0.57), ...[-1.7, 0.5].flatMap(x => [0.6, -0.6].map(z => ball(0.07, PAL.candle, x, 1.52, z, 0))), ball(0.12, PAL.heal, -0.6, 4.14, 0, 0)]),
      legs: [
        { pivot: [1.9, 1, 0.5], geo: merge([box(0.2, 1, 0.22, PAL.robe, 0, -0.5, 0), box(0.32, 0.14, 0.24, PAL.leather, 0.05, -0.93, 0), box(0.2, 1, 0.22, PAL.robe, 0, -0.5, -1.0)]) },
        { pivot: [1.9, 1, -0.5], geo: merge([box(0.2, 1, 0.22, PAL.robe, 0.01, -0.5, 0.14), box(0.32, 0.14, 0.24, PAL.leather, 0.05, -0.93, 0.14), box(0.2, 1, 0.22, PAL.robe, 0.01, -0.5, 0.86)]) },
      ],
      parts: [wheel(-1.4, 0.86, 0.62), wheel(-1.4, -0.86, 0.62), wheel(0.2, 0.86, 0.62), wheel(0.2, -0.86, 0.62),
        { motion: "sway", pivot: [-1.94, 2.5, 0], geo: merge([box(0.03, 0.6, 0.03, PAL.ink, 0, -0.3, 0), cyl(0.12, 0.16, 0.2, 6, PAL.gold, 0, -0.68, 0)]), glow: ball(0.07, PAL.flame, 0, -0.56, 0, 0) }],
      weapon: { pivot: [-1.94, 2.5, 0], anim: "raise", geo: box(0.5, 0.08, 0.08, PAL.gold, 0.22, 0, 0) },
    };
  },
  // Crimson Countess: a vampire duellist in black plate and a blood-red gown, high collar fanned behind her head.
  countess: t => ({
    height: 3.5, gait: "float",
    body: merge([
      cyl(0.24, 0.66, 1.5, 10, PAL.blood, 0, 0.75, 0), cyl(0.68, 0.7, 0.08, 10, PAL.ink, 0, 0.06, 0), box(0.06, 1.2, 0.3, PAL.wine, 0.46, 0.7, 0, { rz: 0.28 }),
      box(0.42, 0.8, 0.66, PAL.iron, 0, 1.86, 0), box(0.46, 0.5, 0.36, PAL.blood, 0.02, 1.9, 0), cyl(0.27, 0.25, 0.12, 8, t.main, 0, 1.46, 0), box(0.1, 0.16, 0.16, PAL.gold, 0.26, 1.46, 0),
      ball(0.22, PAL.iron, 0, 2.24, 0.4, 0), ball(0.22, PAL.iron, 0, 2.24, -0.4, 0), cyl(0, 0.08, 0.3, 4, PAL.steelHi, 0, 2.5, 0.44), cyl(0, 0.08, 0.3, 4, PAL.steelHi, 0, 2.5, -0.44),
      ball(0.2, PAL.pale, 0.05, 2.56, 0), box(0.3, 0.3, 0.42, PAL.ink, -0.1, 2.66, 0), ball(0.16, PAL.ink, -0.2, 2.86, 0, 0),
      plate([[-0.56, 0], [0.56, 0], [0.8, 0.8], [0.4, 0.62], [0, 0.95], [-0.4, 0.62], [-0.8, 0.8]], 0.05, PAL.wine, -0.22, 2.24, 0, { ry: HALF }),
      ...[0.16, 0, -0.16].map(z => cyl(0, 0.035, 0.2, 4, PAL.gold, 0.02, 2.86, z)), box(0.3, 0.05, 0.4, PAL.gold, 0.0, 2.76, 0),
    ]),
    glow: merge([ball(0.035, PAL.ember, 0.24, 2.6, 0.08, 0), ball(0.035, PAL.ember, 0.24, 2.6, -0.08, 0)]),
    parts: [
      { motion: "cape", pivot: [-0.24, 2.2, 0], geo: merge([plate([[0, 0.5], [0, -0.5], [-1.0, -0.8], [-2.0, -0.62], [-1.8, -0.3], [-2.1, 0], [-1.8, 0.3], [-2.0, 0.62], [-1.0, 0.8]], 0.06, t.main, 0, 0, 0, { rx: HALF, rz: HALF - 0.12 }),
        plate([[0, 0.46], [0, -0.46], [-0.9, -0.72], [-1.7, -0.5], [-1.7, 0.5], [-0.9, 0.72]], 0.05, t.lo, 0.05, 0, 0, { rx: HALF, rz: HALF - 0.12 })]) },
      { motion: "arm", side: -1, amp: 0.4, pivot: [0, 2.14, -0.44], geo: merge([box(0.16, 0.7, 0.16, PAL.iron, 0.14, -0.3, 0, { rz: 0.5 }), ...[-0.06, 0.06].map(z => cyl(0, 0.03, 0.22, 4, PAL.steelHi, 0.4, -0.66, z, { rz: Math.PI + 0.5 }))]) },
    ],
    weapon: { pivot: [0.04, 2.14, 0.44], anim: "thrust",
      geo: merge([box(0.5, 0.16, 0.16, PAL.iron, 0.2, -0.06, 0), cyl(0.12, 0.12, 0.04, 8, PAL.gold, 0.5, -0.02, 0, { rz: HALF - 0.5 }), box(0.06, 0.34, 0.06, PAL.gold, 0.5, -0.02, 0, { rz: 0.5 }),
        plate([[0, 0.05], [2.0, 0.012], [2.2, 0], [2.0, -0.012], [0, -0.05]], 0.04, PAL.steelHi, 0.52, 0, 0, { rz: 0.5 })]) },
  }),
  // Impaler: a great wheeled ballista behind a team-coloured mantlet, an iron stake on the rail.
  ballista: t => ({
    height: 3, gait: "roll",
    body: merge([
      box(3.0, 0.2, 0.24, PAL.wood, -0.1, 0.74, 0.6), box(3.0, 0.2, 0.24, PAL.wood, -0.1, 0.74, -0.6), box(0.24, 0.2, 1.4, PAL.wood, 1.1, 0.74, 0), box(0.24, 0.2, 1.4, PAL.wood, -1.3, 0.74, 0),
      box(0.3, 1.1, 0.3, PAL.wood, 0.3, 1.3, 0), box(0.24, 1.0, 0.24, PAL.wood, -0.9, 1.1, 0, { rz: -0.4 }),
      box(3.6, 0.22, 0.3, PAL.woodHi, 0.1, 1.9, 0, { rz: 0.1 }), box(3.6, 0.06, 0.1, PAL.iron, 0.1, 2.03, 0, { rz: 0.1 }),
      ...[1, -1].flatMap(sd => [box(0.2, 0.2, 1.3, PAL.woodHi, 1.35, 2.04, sd * 0.7, { ry: sd * 0.4 }), box(0.16, 0.16, 0.8, PAL.bone, 0.95, 2.04, sd * 1.56, { ry: sd * 0.95 }),
        box(2.1, 0.03, 0.03, PAL.bone, -0.3, 2.0, sd * 0.92, { ry: -sd * 0.5 }), box(0.3, 0.34, 0.2, PAL.iron, 1.4, 2.04, sd * 0.2)]),
      cyl(0.3, 0.3, 0.3, 8, PAL.iron, -1.5, 1.8, 0, { rx: HALF }), box(0.06, 0.6, 0.06, PAL.steel, -1.5, 1.8, 0.2, { rz: 0.6 }),
      box(0.12, 1.5, 1.9, t.main, 1.75, 1.3, 0, { rz: -0.14 }), box(0.14, 0.12, 1.96, PAL.gold, 1.86, 2.0, 0), box(0.14, 0.9, 0.14, PAL.bone, 1.84, 1.36, 0, { rz: -0.14 }), box(0.14, 0.14, 0.6, PAL.bone, 1.86, 1.56, 0),
      ...[0.9, -0.9].map(z => cyl(0, 0.12, 0.36, 4, PAL.steelHi, 1.9, 2.24, z)),
      cyl(0.2, 0.32, 0.9, 6, PAL.robe, -2.0, 1.3, 0.3), cyl(0, 0.24, 0.4, 6, PAL.robe, -2.0, 2.1, 0.3, { rz: -0.3 }), ball(0.12, PAL.ink, -1.9, 1.86, 0.3, 0), box(0.24, 0.9, 0.3, PAL.robe, -2.0, 0.45, 0.3),
    ]),
    parts: [wheel(0.6, 0.86, 0.6), wheel(0.6, -0.86, 0.6), wheel(-1.0, 0.86, 0.6), wheel(-1.0, -0.86, 0.6)],
    weapon: { pivot: [0.2, 2.16, 0], anim: "recoil",
      geo: merge([cyl(0.06, 0.06, 3.0, 6, PAL.iron, 0.2, 0, 0, { rz: HALF - 0.1 }), cyl(0, 0.16, 0.6, 4, PAL.steelHi, 1.95, 0.18, 0, { rz: HALF - 0.1 }),
        plate([[0, 0], [-0.5, 0.2], [-0.4, 0], [-0.5, -0.2]], 0.03, t.main, -1.2, -0.14, 0, { rz: 0.1 })]) },
  }),
  // Pale Lich: a crowned, legless king of bone in rotting state robes, ice circling him.
  lich: t => ({
    height: 3.7, gait: "float",
    body: merge([
      cyl(0.36, 0.2, 1.5, 8, PAL.night, -0.04, 1.1, 0, { rz: -0.1 }), ...tatters(0.26, 0.5, 0.5, PAL.night, 6),
      box(0.07, 1.3, 0.36, t.main, 0.36, 1.3, 0, { rz: 0.06 }), box(0.08, 0.08, 0.4, PAL.gold, 0.4, 0.7, 0), box(0.09, 0.2, 0.2, PAL.frost, 0.4, 1.6, 0, { rx: Math.PI / 4 }),
      ...[1.9, 2.06, 2.22].map(y => box(0.5, 0.07, 0.62, PAL.bone, 0.06, y, 0)), box(0.14, 0.5, 0.14, PAL.bone, -0.1, 2.06, 0),
      box(0.6, 0.24, 1.3, PAL.pale, 0, 2.42, 0), box(0.64, 0.1, 1.34, t.lo, 0, 2.3, 0),
      ...[0.62, -0.62].flatMap(z => [cyl(0, 0.14, 0.6, 4, PAL.frost, -0.06, 2.84, z, { rx: z > 0 ? 0.4 : -0.4 }), cyl(0, 0.1, 0.4, 4, PAL.frost, 0.14, 2.7, z * 1.1, { rx: z > 0 ? 0.7 : -0.7 })]),
      ...skull(0.22, 0.08, 2.84, 0), cyl(0.27, 0.24, 0.14, 8, PAL.gold, 0.04, 3.04, 0),
      ...Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return cyl(0, 0.06, 0.34, 4, PAL.gold, 0.04 + Math.cos(a) * 0.24, 3.26, Math.sin(a) * 0.24); }),
      box(0.2, 0.2, 0.2, PAL.night, 0, 2.3, -0.56),
    ]),
    glow: merge([ball(0.05, PAL.frost, 0.27, 2.86, 0.09, 0), ball(0.05, PAL.frost, 0.27, 2.86, -0.09, 0), ball(0.1, PAL.frost, 0.2, 2.06, 0, 0)]),
    parts: [
      { motion: "orbit", pivot: [0, 1.5, 0], speed: 1.3, geo: merge([0, 1, 2].map(i => { const a = (i / 3) * Math.PI * 2; return cyl(0, 0.13, 0.5, 4, PAL.stoneHi, Math.cos(a) * 1.15, i * 0.3, Math.sin(a) * 1.15, { rx: 0.4 }); })),
        glow: merge([0, 1, 2].map(i => { const a = (i / 3) * Math.PI * 2; return cyl(0.13, 0, 0.3, 4, PAL.frost, Math.cos(a) * 1.15, i * 0.3 - 0.4, Math.sin(a) * 1.15, { rx: 0.4 }); })) },
      { motion: "cape", pivot: [-0.3, 2.36, 0], geo: plate([[0, 0.6], [0, -0.6], [-1.3, -0.8], [-2.2, -0.5], [-1.9, -0.2], [-2.3, 0.1], [-1.9, 0.4], [-2.1, 0.7], [-1.3, 0.8]], 0.06, PAL.night, 0, 0, 0, { rx: HALF, rz: HALF - 0.15 }) },
      { motion: "arm", side: -1, amp: 0.3, pivot: [0, 2.3, -0.56], geo: merge([box(0.1, 0.6, 0.1, PAL.bone, 0.16, -0.2, 0, { rz: 0.8 }), ...[-0.08, 0, 0.08].map(z => box(0.2, 0.03, 0.03, PAL.bone, 0.5, -0.42, z, { rz: -0.5 }))]) },
    ],
    weapon: { pivot: [0.06, 2.3, 0.6], anim: "cast",
      geo: merge([box(0.1, 0.6, 0.1, PAL.bone, 0.16, 0.0, 0, { rz: -0.9 }), cyl(0.05, 0.05, 3.2, 5, PAL.iron, 0.44, 0.0, 0), ...[0, 1, 2, 3].map(i => { const a = (i / 4) * Math.PI * 2; return box(0.05, 0.5, 0.05, PAL.iron, 0.44 + Math.cos(a) * 0.14, 1.78, Math.sin(a) * 0.14, { rz: -Math.cos(a) * 0.3, rx: Math.sin(a) * 0.3 }); })]),
      glow: merge([cyl(0, 0.16, 0.34, 4, PAL.frost, 0.44, 1.98, 0), cyl(0.16, 0, 0.3, 4, PAL.frost, 0.44, 1.66, 0)]) },
  }),
  // Headsman: a hulking executioner in a pointed hood and a team-coloured apron, with a bearded axe as tall as a man.
  headsman: t => ({
    height: 3.6, gait: "stomp",
    body: merge([
      box(0.66, 1.1, 1.0, PAL.skin, 0, 1.92, 0), box(0.7, 0.14, 1.04, PAL.leather, 0, 1.42, 0), box(0.12, 0.2, 0.22, PAL.steelHi, 0.36, 1.42, 0),
      box(0.74, 0.1, 0.16, PAL.leather, 0, 2.1, 0.2, { rx: 0.75 }), box(0.74, 0.1, 0.16, PAL.leather, 0, 2.1, -0.2, { rx: -0.75 }), cyl(0.12, 0.12, 0.08, 8, PAL.steelHi, 0.36, 2.1, 0, { rz: HALF }),
      box(0.08, 1.2, 0.74, t.main, 0.36, 0.9, 0, { rz: 0.06 }), box(0.1, 0.1, 0.78, t.lo, 0.42, 0.36, 0), box(0.07, 0.9, 0.7, PAL.leather, -0.34, 1.0, 0, { rz: -0.06 }),
      ball(0.32, PAL.skin, 0, 2.5, 0.56, 0), ball(0.32, PAL.skin, 0, 2.5, -0.56, 0), box(0.3, 0.12, 0.4, PAL.iron, 0, 2.7, 0.56),
      cyl(0.3, 0.36, 0.56, 8, PAL.ink, 0.04, 2.76, 0), cyl(0, 0.3, 0.7, 8, PAL.ink, 0.0, 3.36, 0, { rz: 0.12 }), box(0.4, 0.3, 0.6, PAL.ink, 0.02, 2.46, 0),
      box(0.03, 0.06, 0.12, PAL.bone, 0.34, 2.82, 0.12), box(0.03, 0.06, 0.12, PAL.bone, 0.34, 2.82, -0.12),
    ]),
    legs: [
      { pivot: [0, 1.36, 0.28], geo: merge([box(0.4, 1.36, 0.42, PAL.dark, 0, -0.68, 0), box(0.56, 0.36, 0.46, PAL.leather, 0.07, -1.18, 0)]) },
      { pivot: [0, 1.36, -0.28], geo: merge([box(0.4, 1.36, 0.42, PAL.dark, 0, -0.68, 0), box(0.56, 0.36, 0.46, PAL.leather, 0.07, -1.18, 0)]) },
    ],
    parts: [{ motion: "arm", side: -1, amp: 0.6, pivot: [0, 2.44, -0.6], geo: merge([box(0.28, 0.9, 0.28, PAL.skin, 0.1, -0.4, 0, { rz: 0.25 }), box(0.3, 0.3, 0.3, PAL.leather, 0.24, -0.86, 0)]) }],
    weapon: { pivot: [0.06, 2.44, 0.62], anim: "chop",
      geo: merge([box(0.28, 0.8, 0.28, PAL.skin, 0.12, -0.26, 0, { rz: 0.45 }), box(0.3, 0.3, 0.3, PAL.leather, 0.34, -0.6, 0), cyl(0.06, 0.06, 3.0, 6, PAL.wood, 0.36, 0.56, 0, { rz: -0.1 }),
        plate([[0, 0.3], [0.5, 0.56], [1.0, 0.3], [1.1, -0.5], [0.8, -1.0], [0.5, -0.5], [0, -0.3]], 0.07, PAL.steelHi, 0.5, 1.7, 0), plate([[0, 0.16], [-0.44, 0.3], [-0.5, -0.2], [0, -0.16]], 0.06, PAL.iron, 0.44, 1.72, 0),
        cyl(0, 0.07, 0.3, 4, PAL.steelHi, 0.5, 2.2, 0)]) },
  }),

  // ---------- summoned ----------
  // Skeleton: a risen soldier in a scrap of its side's colours, rusted blade in hand.
  skeleton: t => ({
    height: 2.5,
    body: merge([
      box(0.14, 0.9, 0.14, PAL.bone, -0.04, 1.45, 0), ...[1.3, 1.48, 1.66, 1.84].map((y, i) => box(0.4, 0.07, 0.56 - i * 0.02, PAL.bone, 0.04, y, 0)), box(0.36, 0.14, 0.5, PAL.bone, 0, 1.04, 0),
      box(0.3, 0.1, 0.84, PAL.bone, 0, 1.94, 0), ...skull(0.2, 0.06, 2.22, 0),
      box(0.06, 0.6, 0.4, t.main, 0.24, 0.84, 0, { rz: 0.1 }), box(0.3, 0.3, 0.3, t.lo, 0, 1.96, -0.44),
    ]),
    glow: merge([ball(0.035, t.glow, 0.24, 2.24, 0.08, 0), ball(0.035, t.glow, 0.24, 2.24, -0.08, 0)]),
    legs: [
      { pivot: [0, 1, 0.16], geo: merge([box(0.12, 1, 0.12, PAL.bone, 0, -0.5, 0), box(0.3, 0.1, 0.16, PAL.bone, 0.08, -0.95, 0)]) },
      { pivot: [0, 1, -0.16], geo: merge([box(0.12, 1, 0.12, PAL.bone, 0, -0.5, 0), box(0.3, 0.1, 0.16, PAL.bone, 0.08, -0.95, 0)]) },
    ],
    parts: [{ motion: "arm", side: -1, pivot: [0, 1.92, -0.44], geo: merge([box(0.1, 0.7, 0.1, PAL.bone, 0.08, -0.34, 0, { rz: 0.25 }), box(0.14, 0.12, 0.14, PAL.bone, 0.2, -0.7, 0)]) }],
    weapon: { pivot: [0, 1.92, 0.44], anim: "swing",
      geo: merge([box(0.1, 0.6, 0.1, PAL.bone, 0.1, 0.22, 0, { rz: -0.5 }), box(0.3, 0.07, 0.07, PAL.bronze, 0.32, 0.52, 0), plate([[0, 0.07], [1.0, 0.07], [1.2, 0], [1.0, -0.05], [0.6, -0.07], [0.5, -0.02], [0, -0.07]], 0.04, PAL.rust, 0.3, 0.56, 0, { rz: 1.2 })]) },
  }),
};
