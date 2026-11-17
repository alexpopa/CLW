import { LANE_WIDTH, MAP, RULES, TICK_RATE, UNITS } from "./data";
import { pickCell } from "./ai";
import { addUnit, chantryHp, createGame, step } from "./sim";
import type { GameState, TeamId } from "./types";

/**
 * Combat test harness (docs/COLONIAL_LINE_WARS.md §34): pits two armies against each other in an empty lane,
 * without playing a match. An army is a list of production buildings ("3 arbalester chantries, 2 oathguard...");
 * `waves` is how many musters of each side meet. Used by balance.test.ts and scripts/balance.ts.
 */
export type Army = Record<string, number>;
export interface ClashResult {
  winner: TeamId | null;           // null: both sides still stand (or both fell) when time ran out
  left: [number, number];          // fraction of each army's gold value still alive (health-weighted), 0..1
  margin: number;                  // left[0] - left[1]: +1 = side 0 untouched and side 1 wiped out
  seconds: number;
  cost: [number, number];          // gold cost of each side's buildings
}
export const armyCost = (a: Army): number => Object.entries(a).reduce((sum, [id, n]) => sum + UNITS[id]!.cost * n, 0);
/** The largest army of one unit type that `gold` buys (at least one building). */
export const massOf = (unit: string, gold: number): Army => ({ [unit]: Math.max(1, Math.round(gold / UNITS[unit]!.cost)) });

/** Room each soldier gets in the line-up: about what an army has once it has marched from staggered chantries. */
const SPACING = 1500;
/** Line an army up facing the enemy: shortest reach in front, each rank a little behind the last. */
function deploy(s: GameState, army: Army, team: TeamId, waves: number, frontX: number): void {
  const dir = team === 0 ? -1 : 1; // which way "behind" is
  const ids = Object.keys(army).filter(id => army[id]! > 0).sort((a, b) => UNITS[a]!.range - UNITS[b]!.range || (a < b ? -1 : 1));
  const perRank = Math.floor((LANE_WIDTH - 2000) / SPACING);
  let slot = 0;
  for (const id of ids) {
    if (slot % perRank) slot += perRank - (slot % perRank); // each unit type starts a fresh rank
    const n = army[id]! * waves * (UNITS[id]!.count ?? 1);
    for (let i = 0; i < n; i++, slot++) {
      const rank = Math.floor(slot / perRank), file = slot % perRank;
      // fill each rank from the middle outwards so small groups stand together
      const y = LANE_WIDTH / 2 + (file % 2 ? 1 : -1) * Math.ceil(file / 2) * SPACING;
      addUnit(s, id, team, team, 0, frontX + dir * rank * SPACING, y);
    }
  }
}
const valueLeft = (s: GameState, team: TeamId, army: Army, waves: number): number => {
  let alive = 0;
  for (const u of s.units) {
    const d = UNITS[u.type]!;
    if (u.team === team && !d.summoned && army[u.type]) alive += (d.cost / (d.count ?? 1)) * (u.hp / d.hp);
  }
  return alive / (armyCost(army) * waves);
};

export function clash(a: Army, b: Army, opts: { waves?: number; gap?: number; maxSeconds?: number } = {}): ClashResult {
  const waves = opts.waves ?? 1, gap = (opts.gap ?? 30) * 1000, mid = MAP.laneLength / 2;
  const s = createGame({ teamSize: 1, seed: 1 });
  s.units = [];
  for (const b0 of s.beacons) b0.owner = null;
  deploy(s, a, 0, waves, mid - gap / 2);
  deploy(s, b, 1, waves, mid + gap / 2);
  // Interleave the two armies so neither acts first as a block.
  const mine = s.units.filter(u => u.team === 0), theirs = s.units.filter(u => u.team === 1);
  s.units = [];
  for (let i = 0; i < Math.max(mine.length, theirs.length); i++) { if (mine[i]) s.units.push(mine[i]!); if (theirs[i]) s.units.push(theirs[i]!); }
  const real = (team: TeamId) => s.units.some(u => u.team === team && !UNITS[u.type]!.summoned);
  const limit = (opts.maxSeconds ?? 120) * TICK_RATE;
  let t = 0;
  while (t < limit && real(0) && real(1) && s.winner === null) { step(s); t++; }
  const left: [number, number] = [valueLeft(s, 0, a, waves), valueLeft(s, 1, b, waves)];
  return { winner: real(0) === real(1) ? null : real(0) ? 0 : 1, left, margin: left[0] - left[1], seconds: Math.round(t / TICK_RATE), cost: [armyCost(a) * waves, armyCost(b) * waves] };
}

export interface StreamResult {
  winner: TeamId | null;
  score: number;                   // share of the enemy's stone (towers + cathedral) broken by side 0, minus the same for side 1: -1..+1
  broken: [number, number];        // share of the ENEMY's towers and cathedral each side destroyed, 0..1
  minutes: number;
}
/**
 * The same two armies as standing production on the real lane: towers, shrines, cathedral guns and a fresh wave
 * every 30 seconds, but no economy. Shows what a one-off clash cannot: reinforcement, travel time, towers.
 */
export function stream(a: Army, b: Army, maxMinutes = 10): StreamResult {
  const s = createGame({ teamSize: 1, seed: 1 });
  const armies = [a, b];
  for (const team of [0, 1] as const) {
    // Front-line chantries first, so they take the front columns, as a player would place them.
    const ids = Object.keys(armies[team]!).sort((x, y) => UNITS[x]!.range - UNITS[y]!.range || (x < y ? -1 : 1));
    for (const id of ids) for (let i = 0; i < armies[team]![id]!; i++) {
      const cell = pickCell(s, team, id);
      if (cell) s.buildings.push({ id: s.nextId++, owner: team, team, lane: 0, ...cell, unit: id, hp: chantryHp(id), readyTick: 0, produced: false });
    }
  }
  const stone = 2 * (UNITS[MAP.shrineTower]!.hp + UNITS[MAP.baseTower]!.hp) + RULES.hqHp;
  const broken = (team: TeamId): number => { // how much of `team`'s stone is gone
    let left = s.teams[team].hqHp;
    for (const u of s.units) if (u.team === team && UNITS[u.type]!.structure) left += u.hp;
    return 1 - left / stone;
  };
  const limit = maxMinutes * 60 * TICK_RATE;
  while (s.tick < limit && s.winner === null) step(s);
  const out: [number, number] = [broken(1), broken(0)];
  return { winner: s.winner, score: out[0] - out[1], broken: out, minutes: Math.round(s.tick / TICK_RATE / 6) / 10 };
}
