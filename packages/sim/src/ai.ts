import { AI, INVEST_TIERS, MAP, RESEARCH, UNITS, UNIT_ORDER } from "./data";
import { beaconsHeld, canBuild, hqX } from "./sim";
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
function pickCell(s: GameState, me: PlayerId, unit: string): { col: number; row: number } | null {
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

/**
 * Autopilot AI. Stateless: decides from the game state alone, plays by the same rules as a human.
 * Priorities: defend when threatened → research once established → invest when holding beacons →
 * otherwise keep adding production toward its profile's army mix.
 */
export function simpleAI(s: GameState, me: PlayerId): Command[] {
  const p = s.players[me]!;
  if (s.tick % AI.thinkTicks !== (me * 7) % AI.thinkTicks) return [];
  const mine = s.buildings.filter(b => b.owner === me);

  // Next unit: the unlocked type furthest below its share in the profile.
  const profile = AI.profiles[me % AI.profiles.length]!;
  let want: string | null = null, wantScore = Infinity;
  for (const id of UNIT_ORDER) {
    if (UNITS[id]!.tier > p.tier || !profile[id]) continue;
    const score = mine.filter(b => b.unit === id).length / profile[id]!;
    if (score < wantScore) { want = id; wantScore = score; }
  }
  const build = (unit: string): Command[] => {
    const cell = pickCell(s, me, unit);
    return cell && p.credits >= UNITS[unit]!.cost ? [{ type: "build", unit, ...cell }] : [];
  };

  // Threatened = enemies have pushed past our nearest beacon. Spend on army, not on the future.
  const myHq = hqX(p.team);
  const threatLine = Math.abs(MAP.beaconX[0]! - MAP.hqOffset);
  const threatened = s.units.some(u => u.team !== p.team && u.lane === p.lane && Math.abs(u.x - myHq) < threatLine);
  if (!threatened) {
    const research = RESEARCH[p.tier + 1];
    if (research && !p.research && mine.length >= AI.researchAtBuildings)
      return p.credits >= research.cost ? [{ type: "research" }] : []; // save up
    const level = p.invest[p.lane] ?? 0;
    const tier = INVEST_TIERS[level];
    if (tier && beaconsHeld(s, p.team, p.lane) >= AI.investMinBeacons && mine.length >= AI.investBuildingsPerLevel * (level + 1))
      return p.credits >= tier.cost ? [{ type: "invest" }] : [];
  }
  return want ? build(want) : [];
}
