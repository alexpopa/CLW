/**
 * Balance data. ALL numbers live here so they can be tuned without touching logic.
 * Distances are in milli-units (1 world unit = 1000) so the sim uses integers only (determinism).
 * Times are in ticks. Starting values follow docs/COLONIAL_LINE_WARS.md Part III; they are
 * original placeholder values, not statistics copied from any existing game.
 */
export const TICK_RATE = 20; // sim ticks per second
export const UNIT = 1000;    // milli-units per world unit
const sec = (s: number) => Math.round(s * TICK_RATE);

export type UnitRole = "front" | "ranged" | "support" | "siege";
export interface UnitDef {
  id: string; name: string; tier: number; role: UnitRole;
  blurb: string;
  cost: number;            // one-time cost of the production building
  hp: number; armor: number;
  damage: number;          // per attack (before armor)
  heal: number;            // per pulse; healers have damage 0
  interval: number;        // ticks between attacks/heals
  range: number;           // milli-units
  splash: number;          // radius in milli-units, 0 = single target
  speed: number;           // milli-units per tick
  structure?: boolean;     // immobile defence (guard tower): cannot be built, healed or pushed
}

export const UNITS: Record<string, UnitDef> = {
  arbalester: { id: "arbalester", name: "Arbalester", tier: 1, role: "ranged", blurb: "Cheap crossbow infantry. Strong in numbers behind a shield wall.",
    cost: 125, hp: 90, armor: 0, damage: 11, heal: 0, interval: sec(1), range: 6 * UNIT, splash: 0, speed: 300 },
  oathguard: { id: "oathguard", name: "Oathguard", tier: 1, role: "front", blurb: "Shield-bearing knight on foot. Soaks damage for the line behind.",
    cost: 160, hp: 240, armor: 1, damage: 9, heal: 0, interval: sec(1), range: 1500, splash: 0, speed: 300 },
  zealot: { id: "zealot", name: "Pyre Zealot", tier: 1, role: "front", blurb: "Swings a burning censer that scorches every foe nearby. Weak against armor.",
    cost: 185, hp: 140, armor: 0, damage: 5, heal: 0, interval: sec(0.5), range: 3 * UNIT, splash: 2500, speed: 300 },
  doctor: { id: "doctor", name: "Plague Doctor", tier: 2, role: "support", blurb: "Mends wounded allies. Does not fight.",
    cost: 270, hp: 125, armor: 0, damage: 0, heal: 12, interval: sec(1), range: 5 * UNIT, splash: 0, speed: 300 },
  dreadknight: { id: "dreadknight", name: "Dreadknight", tier: 2, role: "front", blurb: "Heavy armored lancer. Fast, hard to kill, hits hard.",
    cost: 335, hp: 330, armor: 2, damage: 22, heal: 0, interval: sec(1), range: 2500, splash: 0, speed: 350 },
  trebuchet: { id: "trebuchet", name: "Trebuchet", tier: 2, role: "siege", blurb: "Hurls stones a very long way, crushing whole clusters. Slow and fragile up close.",
    cost: 550, hp: 230, armor: 1, damage: 72, heal: 0, interval: sec(2), range: 14 * UNIT, splash: 3500, speed: 220 },
  // Guard tower: two stand on each team's home shrine and two more at the front of its building ground. Lives in the unit list so it is targeted,
  // damaged and counted as shrine presence by the ordinary rules; it never moves.
  tower: { id: "tower", name: "Guard Tower", tier: 0, role: "ranged", blurb: "Shoots attackers, who must stop and bring it down before they can pass.",
    cost: 0, hp: 2400, armor: 2, damage: 24, heal: 0, interval: sec(0.6), range: 9 * UNIT, splash: 0, speed: 0, structure: true },
};
/** Units a player can build, in hotkey order. */
export const UNIT_ORDER = ["arbalester", "oathguard", "zealot", "doctor", "dreadknight", "trebuchet"] as const;

/** Lane geometry. One lane is a horizontal strip; team 0 at x=0, team 1 at x=laneLength. */
export const MAP = {
  laneLength: 480 * UNIT,
  cell: 1 * UNIT,            // placement grid step (not drawn); buildings snap to it
  footprint: 2,              // a building covers footprint x footprint cells, so neighbours can be staggered
  zoneCols: 24, zoneRows: 24, // laneWidth = zoneRows * cell; room for 144 buildings
  zoneStart: 20 * UNIT,      // distance from the team's own lane end to the rear of its zone
  hqOffset: 8 * UNIT,        // HQ centre distance from the lane end
  hqRadius: 4 * UNIT,
  beaconX: [120 * UNIT, 240 * UNIT, 360 * UNIT], // 25% / 50% / 75%; first and last are the home shrines
  captureRadius: 5 * UNIT,   // along the lane
  towerAhead: 3 * UNIT,      // guard towers stand this far in front of their home shrine
  towerY: [7 * UNIT, 17 * UNIT],
  baseTowerAhead: 3 * UNIT,  // base towers stand this far in front of the building ground...
  baseTowerY: [3 * UNIT, 21 * UNIT], // ...near the top and bottom edges of the lane
};
export const LANE_WIDTH = MAP.zoneRows * MAP.cell;

/** Incremental lane-investment tiers: pay `cost`, gain `bonus` income per controlled beacon in that lane. */
export const INVEST_TIERS = [
  { cost: 180, bonus: 5 },
  { cost: 300, bonus: 8 },
  { cost: 480, bonus: 12 },
  { cost: 700, bonus: 16 },
];

/** Research that unlocks a unit tier, keyed by the tier it unlocks. Sequential. */
export const RESEARCH: Record<number, { cost: number; ticks: number }> = {
  2: { cost: 400, ticks: sec(30) },
};

export const RULES = {
  startCredits: 350,
  baseIncome: 32,                 // per income tick, per player
  beaconIncome: 4,                // per controlled beacon per income tick
  incomeIntervalTicks: sec(10),
  waveIntervalTicks: sec(30),     // synchronized production wave; first wave at 30 s
  buildTicks: sec(2),             // construction time
  sellRefundFreshPct: 75,         // before the building's first wave
  sellRefundUsedPct: 25,          // after it has produced
  acquireRange: 9 * UNIT,         // units notice enemies at max(this, weapon range + acquirePad)
  acquirePad: 2 * UNIT,
  unitSpacing: 750,               // units push apart when closer than this
  separationStep: 60,             // max push per tick, per unit
  healerHoldRange: 9 * UNIT,      // healers stop advancing when an enemy is this close
  hqHp: 4500,
  hqDamage: 18, hqInterval: sec(0.75), hqRange: 10 * UNIT, // weak defensive gun
  overtimeTick: sec(25 * 60),     // sudden death: HQ guns shut down and HQs take extra damage
  overtimeHqDamageMult: 3,
};

/** Autopilot AI tuning (see ai.ts). */
export const AI = {
  thinkTicks: sec(2),
  /** Desired army mix per profile; the AI builds whichever unlocked unit is most under-represented. */
  profiles: [
    { arbalester: 3, oathguard: 2, zealot: 1, doctor: 1, dreadknight: 2, trebuchet: 1 },
    { arbalester: 2, oathguard: 2, zealot: 2, doctor: 1, dreadknight: 3, trebuchet: 1 },
  ] as Record<string, number>[],
  researchAtBuildings: 5,         // start saving for research once it owns this many buildings
  investBuildingsPerLevel: 3,     // needs this many buildings per investment level before investing again
  investMinBeacons: 2,
};
