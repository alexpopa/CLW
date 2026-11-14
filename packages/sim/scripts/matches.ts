/**
 * Plays whole autopilot-vs-autopilot matches and reports how they went:
 *   ../../node_modules/.bin/tsx scripts/matches.ts [matches]
 * The seed decides which AI profile each side plays; mirrors are left out of the profile tally.
 */
import { AI, TICK_RATE, UNITS, aiProfile, createGame, simpleAI, step } from "../src/index";
import type { TimedCommand } from "../src/index";

const n = Number(process.argv[2] ?? 12);
const sideWins = [0, 0], profileWins = AI.profiles.map(() => 0), profileGames = AI.profiles.map(() => 0), built: Record<string, number> = {};
let minutes = 0;
for (let seed = 1; seed <= n; seed++) {
  const s = createGame({ teamSize: 1, seed, aiSlots: [0, 1] });
  const prof = [aiProfile(s, 0), aiProfile(s, 1)];
  while (s.winner === null && s.tick < 60 * 60 * TICK_RATE) {
    const cmds: TimedCommand[] = [];
    for (const p of s.players) for (const cmd of simpleAI(s, p.id)) cmds.push({ player: p.id, cmd });
    step(s, cmds);
  }
  for (const b of s.buildings) built[b.unit] = (built[b.unit] ?? 0) + 1;
  minutes += s.tick / TICK_RATE / 60;
  if (s.winner === null) { console.log(`seed ${seed}: no winner`); continue; }
  sideWins[s.winner]!++;
  if (prof[0] !== prof[1]) { profileWins[prof[s.winner]!]!++; profileGames[prof[0]!]!++; profileGames[prof[1]!]!++; }
  console.log(`seed ${seed}: ${AI.profiles[prof[0]!]!.name} vs ${AI.profiles[prof[1]!]!.name}: side ${s.winner} wins at ${(s.tick / TICK_RATE / 60).toFixed(1)} min; tiers ${s.players.map(p => p.tier)}; units known ${s.players.map(p => p.unlocked.length)}`);
}
console.log(`\nside wins ${sideWins}, average ${(minutes / n).toFixed(1)} min`);
console.log(AI.profiles.map((p, i) => `${p.name}: ${profileWins[i]}/${profileGames[i]}`).join(", "));
console.log("chantries standing at the end: " + Object.entries(built).sort((a, b) => b[1] - a[1]).map(([id, c]) => `${UNITS[id]!.name} ${c}`).join(", "));
