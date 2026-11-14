import { AI, INVEST_TIERS, MAP, UNITS, UNIT_ORDER } from "./data";
import { beaconsHeld, canBuild, hqX, isUnlocked, researchOffer } from "./sim";
import type { Command, GameState, PlayerId } from "./types";

const F = MAP.footprint;
const SLOT_COLS = Math.floor(MAP.zoneCols / F);
const SLOT_ROWS = Math.floor(MAP.zoneRows / F);
const ROWS_CENTER_OUT = Array.from({ length: SLOT_ROWS }, (_, i) => i)
  .sort((a, b) => Math.abs(a - (SLOT_ROWS - 1) / 2) - Math.abs(b - (SLOT_ROWS - 1) / 2) || a - b);

/**
 * Front-line units go in the front columns, ranged in the middle, support and siege at the rear.
 * The AI builds in building-sized slots; every other column is shifted one cell so its rows are staggered.
 */
export function pickCell(s: GameState, me: PlayerId, unit: string): { col: number; row: number } | null {
  const p = s.players[me]!;
  const last = SLOT_COLS - 1;
  const role = UNITS[unit]!.role;
  const start = role === "front" ? last : role === "ranged" ? Math.floor(last / 2) + 1 : 0;
  const cols = Array.from({ length: SLOT_COLS }, (_, i) => i).sort((a, b) => Math.abs(a - start) - Math.abs(b - start) || b - a);
  for (const c of cols) for (const r of ROWS_CENTER_OUT) {
    const col = c * F, row = r * F + (c % 2);
    if (canBuild(s, p.team, p.lane, col, row)) return { col, row };
  }
  return null;
}

/** Which way of playing (index into AI.profiles) the autopilot in this seat uses this match: fixed by the match seed. */
export function aiProfile(s: GameState, me: PlayerId): number {
  let h = (s.rngState ^ Math.imul(me + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % AI.profiles.length;
}

/**
 * Autopilot AI. Stateless: decides from the game state alone, plays by the same rules as a human.
 * Priorities: defend when threatened → answer enemy flyers → research the next step of its profile once
 * established → invest when holding beacons → otherwise keep adding production toward its profile's army mix.
 */
export function simpleAI(s: GameState, me: PlayerId): Command[] {
  const p = s.players[me]!;
  if (s.tick % AI.thinkTicks !== (me * 7) % AI.thinkTicks) return [];
  const mine = s.buildings.filter(b => b.owner === me);
  const profile = AI.profiles[aiProfile(s, me)]!;
  const build = (unit: string): Command[] => {
    const cell = pickCell(s, me, unit);
    return cell && p.credits >= UNITS[unit]!.cost ? [{ type: "build", unit, ...cell }] : [];
  };

  // Next unit: the unlocked type furthest below its share in the profile.
  let want: string | null = null, wantScore = Infinity;
  for (const id of UNIT_ORDER) {
    if (!isUnlocked(p, id) || !profile.mix[id]) continue;
    const score = mine.filter(b => b.unit === id).length / profile.mix[id]!;
    if (score < wantScore) { want = id; wantScore = score; }
  }
  // Enemy wings overhead and too few of ours can reach them: build the best anti-air it knows.
  const enemyFlies = s.buildings.some(b => b.team !== p.team && b.lane === p.lane && UNITS[b.unit]!.flying);
  if (enemyFlies && mine.filter(b => UNITS[b.unit]!.air).length * AI.antiAirShare < mine.length + 1) {
    const answers = UNIT_ORDER.filter(id => isUnlocked(p, id) && UNITS[id]!.air && !UNITS[id]!.flying);
    const best = answers.find(id => UNITS[id]!.bonus?.flying) ?? answers[0];
    if (best) want = best;
  }

  // Threatened = enemies have pushed past our nearest beacon. Spend on army, not on the future.
  const myHq = hqX(p.team);
  const threatLine = Math.abs(MAP.beaconX[0]! - MAP.hqOffset);
  const threatened = s.units.some(u => u.team !== p.team && u.lane === p.lane && Math.abs(u.x - myHq) < threatLine);
  if (!threatened) {
    // Research: the first step of the profile's order that is still to do.
    const done = p.unlocked.length - UNIT_ORDER.filter(id => UNITS[id]!.free).length + (p.tier - 1);
    const next = profile.tech.find(t => (typeof t === "number" ? t > p.tier : !isUnlocked(p, t)));
    const offer = next === undefined ? null : researchOffer(p, typeof next === "number" ? undefined : next);
    if (offer && !p.research && mine.length >= AI.researchAtBuildings + Math.floor((AI.buildingsPer2Research * done) / 2))
      return p.credits >= offer.cost ? [{ type: "research", ...(offer.unit ? { unit: offer.unit } : {}) }] : []; // save up
    const level = p.invest[p.lane] ?? 0;
    const tier = INVEST_TIERS[level];
    if (tier && beaconsHeld(s, p.team, p.lane) >= AI.investMinBeacons && mine.length >= AI.investBuildingsPerLevel * (level + 1))
      return p.credits >= tier.cost ? [{ type: "invest" }] : [];
  }
  return want ? build(want) : [];
}
