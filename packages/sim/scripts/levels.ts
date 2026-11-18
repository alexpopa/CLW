/**
 * Pits one AI difficulty against another in whole 1v1 matches, half the games on each side:
 *   ../../node_modules/.bin/tsx scripts/levels.ts [matches] [levelA] [levelB]
 */
import { AI, TICK_RATE, createGame, simpleAI, step } from "../src/index";
import type { TimedCommand } from "../src/index";

const n = Number(process.argv[2] ?? 20), a = Number(process.argv[3] ?? 1), b = Number(process.argv[4] ?? 0);
let aWins = 0, draws = 0, minutes = 0;
for (let seed = 1; seed <= n; seed++) {
  const s = createGame({ teamSize: 1, seed, aiSlots: [0, 1] });
  const aSide = seed % 2; // level A plays side 0 on even seeds, side 1 on odd
  s.players[aSide]!.aiLevel = a; s.players[1 - aSide]!.aiLevel = b;
  while (s.winner === null && s.tick < 60 * 60 * TICK_RATE) {
    const cmds: TimedCommand[] = [];
    for (const p of s.players) for (const cmd of simpleAI(s, p.id)) cmds.push({ player: p.id, cmd });
    step(s, cmds);
  }
  minutes += s.tick / TICK_RATE / 60;
  if (s.winner === null) draws++; else if (s.winner === aSide) aWins++;
}
console.log(`${AI.levels[a]!.name} vs ${AI.levels[b]!.name}: ${aWins}/${n} wins (${draws} unfinished), average ${(minutes / n).toFixed(1)} min`);
