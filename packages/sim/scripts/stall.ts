// Finds soldiers that stand still without fighting while the war goes on: run whole autopilot matches and report them.
import { createGame, simpleAI, step, TICK_RATE, UNITS } from "../src/index";
import type { TimedCommand } from "../src/index";
const LIMIT = 15 * TICK_RATE, seen = new Map<string, number>(), sample = new Map<string, string>();
for (const [size, seeds] of [[1, 6], [2, 2]] as const) for (let seed = 1; seed <= seeds; seed++) {
  const s = createGame({ teamSize: size, seed, aiSlots: Array.from({ length: size * 2 }, (_, i) => i) });
  const still = new Map<number, { x: number; y: number; n: number; acted: number }>();
  for (let t = 0; t < 22 * 60 * TICK_RATE && s.winner === null; t++) {
    const cmds: TimedCommand[] = [];
    for (const p of s.players) for (const cmd of simpleAI(s, p.id)) cmds.push({ player: p.id, cmd });
    step(s, cmds);
    const acted = new Set<number>(); for (const e of s.events) if (e.t === "shot" || e.t === "heal") acted.add(e.id);
    for (const u of s.units) {
      if (UNITS[u.type]!.structure) continue;
      const r = still.get(u.id);
      if (!r || r.x !== u.x || r.y !== u.y || acted.has(u.id)) { still.set(u.id, { x: u.x, y: u.y, n: 0, acted: 0 }); continue; }
      if (++r.n === LIMIT) {
        const foes = s.units.filter(o => o.team !== u.team && o.lane === u.lane).map(o => ({ o, d: Math.round(Math.hypot(o.x - u.x, o.y - u.y)) })).sort((a, b) => a.d - b.d)[0];
        const tgt = s.units.find(o => o.id === u.target);
        seen.set(u.type, (seen.get(u.type) ?? 0) + 1);
        if (!sample.has(u.type)) sample.set(u.type, `seed ${seed} size ${size} t=${Math.round(s.tick / TICK_RATE)}s team ${u.team} at x=${u.x} y=${u.y}; range ${UNITS[u.type]!.range}; target ${tgt ? `${tgt.type} d=${Math.round(Math.hypot(tgt.x - u.x, tgt.y - u.y))} at ${tgt.x},${tgt.y}` : "none"}; nearest foe ${foes ? `${foes.o.type} d=${foes.d} at ${foes.o.x},${foes.o.y}` : "none"}`);
      }
    }
  }
}
for (const [type, n] of seen) console.log(`${type} x${n}: ${sample.get(type)}`);
if (!seen.size) console.log("no soldier stood idle");
