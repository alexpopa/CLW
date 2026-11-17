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
/**
 * Every ability is automatic and data-driven: the fields below are read by sim.ts, never special-cased by unit id.
 * `ability` is the player-facing text ("Name: what it does").
 */
export interface UnitDef {
  id: string; name: string; tier: number; role: UnitRole;
  blurb: string; ability: string;
  cost: number;            // one-time cost of the production building
  hp: number; armor: number;
  damage: number;          // per attack (before armor); 0 = does not fight (support)
  heal: number;            // per pulse; healers have damage 0
  interval: number;        // ticks between attacks/heals
  range: number;           // milli-units
  splash: number;          // radius in milli-units, 0 = single target
  speed: number;           // milli-units per tick
  structure?: boolean;     // immobile defence (guard tower): cannot be built, healed or pushed
  summoned?: boolean;      // only ever created by another unit's ability; cannot be built
  merc?: boolean;          // a mercenary: hired once for `cost`, marches to the middle of the lane and leaves; cannot be built
  free?: boolean;          // known from the start: needs no research
  flying?: boolean;        // only attackers with `air` can hit it; does not hold shrines
  air?: boolean;           // its attacks can hit flying units
  count?: number;          // units mustered per wave (default 1)
  ward?: number;           // extra damage reduction against attacks from beyond melee reach
  dot?: { dmg: number; ticks: number };       // on hit: armor-ignoring damage once a second for `ticks`
  slow?: { pct: number; ticks: number };      // on hit: target moves and attacks this much slower
  frenzy?: number;         // attack interval shrinks by up to this % as health falls to zero
  charge?: number;         // first strike against each new foe deals this % of normal damage
  sunder?: number;         // each hit strips 1 armor from the target, up to this much
  pierce?: boolean;        // ignores armor
  leech?: number;          // heals itself for this % of damage dealt
  maim?: number;           // bonus damage equal to this % of the target's full health (not structures)
  ramp?: { pct: number; max: number };        // +pct% damage per consecutive hit on one target, up to max hits
  chain?: { jumps: number; radius: number; falloff: number }; // attack leaps to further foes, losing falloff% each leap
  line?: { length: number; width: number };   // attack skewers every foe along a line through the target
  bonus?: { flying?: number; armored?: number; structure?: number }; // +% damage against that kind of target (armored = armor 2+)
  minRange?: number;       // cannot attack foes nearer than this
  veil?: number;           // cannot be targeted from farther than this unless revealed
  reveal?: number;         // reveals veiled foes within this distance
  aura?: { radius: number; armor: number; regen: number }; // allies in radius gain armor and regenerate health each second
  raise?: { unit: string; radius: number; cooldown: number }; // when a mortal dies in radius, raises `unit` for its own side
  spawnOnDeath?: { unit: string; count: number };
  life?: number;           // ticks before a summoned unit crumbles
}

const base = { armor: 0, heal: 0, splash: 0, speed: 300 };
const U = (d: Omit<UnitDef, keyof typeof base> & Partial<UnitDef>): UnitDef => ({ ...base, ...d });

export const UNITS: Record<string, UnitDef> = {
  // ---------- Tier I ----------
  arbalester: U({ id: "arbalester", name: "Arbalester", tier: 1, role: "ranged", free: true,
    blurb: "Cheap crossbow infantry. Strong in numbers behind a shield wall.",
    ability: "Skyward Bolts: can shoot flying foes.",
    cost: 140, hp: 80, damage: 11, interval: sec(1), range: 6 * UNIT, air: true }),
  oathguard: U({ id: "oathguard", name: "Oathguard", tier: 1, role: "front", free: true,
    blurb: "Shield-bearing knight on foot. Soaks damage for the line behind.",
    ability: "Shield Wall: takes 2 less damage from every ranged attack.",
    cost: 190, hp: 280, armor: 1, damage: 9, interval: sec(1), range: 1500, ward: 2 }),
  zealot: U({ id: "zealot", name: "Pyre Zealot", tier: 1, role: "front", free: true,
    blurb: "Swings a burning censer that scorches every foe nearby. Weak against armor.",
    ability: "Immolate: foes it scorches keep burning for 2 damage a second, through any armor.",
    cost: 150, hp: 110, damage: 5, interval: sec(0.5), range: 3 * UNIT, splash: 2500, dot: { dmg: 2, ticks: sec(2) } }),
  hound: U({ id: "hound", name: "Grave Hounds", tier: 1, role: "front",
    blurb: "A pair of starved hounds. Fast and frail: they run down archers and war engines.",
    ability: "Pack: each kennel looses two hounds every wave.",
    cost: 135, hp: 112, damage: 8, interval: sec(0.6), range: 1200, speed: 420, count: 2 }),
  flagellant: U({ id: "flagellant", name: "Flagellant", tier: 1, role: "front",
    blurb: "Unarmored penitent with a barbed scourge. Hits hard and dies fast.",
    ability: "Frenzy: strikes faster the more it bleeds, up to twice as fast near death.",
    cost: 170, hp: 215, damage: 16, interval: sec(1), range: 1500, speed: 320, frenzy: 50 }),
  hexbinder: U({ id: "hexbinder", name: "Hexbinder", tier: 1, role: "ranged",
    blurb: "Hedge witch who flings curses. Little damage, but her victims crawl.",
    ability: "Leaden Curse: foes she hits move and attack 45% slower for 2 seconds. Can curse flying foes.",
    cost: 180, hp: 120, damage: 12, interval: sec(1.2), range: 7 * UNIT, air: true, slow: { pct: 45, ticks: sec(2) } }),

  // ---------- Tier II ----------
  doctor: U({ id: "doctor", name: "Plague Doctor", tier: 2, role: "support",
    blurb: "Follows the line and keeps it standing. Does not fight.",
    ability: "Mend: restores 16 health a second to the nearest wounded ally, on foot or on the wing.",
    cost: 120, hp: 125, damage: 0, heal: 16, interval: sec(1), range: 5 * UNIT }),
  dreadknight: U({ id: "dreadknight", name: "Dreadknight", tier: 2, role: "front",
    blurb: "Heavy armored lancer. Fast, hard to kill, and terrible on the charge.",
    ability: "Lance Charge: its first strike against each new foe deals triple damage.",
    cost: 365, hp: 350, armor: 2, damage: 20, interval: sec(1), range: 2500, speed: 340, charge: 300}),
  gargoyle: U({ id: "gargoyle", name: "Gargoyle", tier: 2, role: "ranged",
    blurb: "Stone-skinned flyer that drops on its prey. Swords and lances cannot reach it.",
    ability: "Flight: only foes that can strike the air may harm it. Claws flyers and walkers alike.",
    cost: 315, hp: 270, armor: 1, damage: 17, interval: sec(1), range: 1500, speed: 320, flying: true, air: true }),
  witchhunter: U({ id: "witchhunter", name: "Witch Hunter", tier: 2, role: "ranged",
    blurb: "Marksman with silvered shot and a hooded lantern. The answer to wings and shadows.",
    ability: "Silver Shot: two and a half times its damage to flying foes. Lantern: reveals veiled foes within 11.",
    cost: 310, hp: 160, damage: 26, interval: sec(1.5), range: 8 * UNIT, air: true, bonus: { flying: 150 }, reveal: 11 * UNIT }),
  penitent: U({ id: "penitent", name: "Iron Penitent", tier: 2, role: "front",
    blurb: "Giant sealed in a riveted cage, swinging a great maul. Slow and nearly unbreakable.",
    ability: "Sunder: every blow strips 1 armor from its victim, up to 4.",
    cost: 405, hp: 480, armor: 2, damage: 23, interval: sec(1.2), range: 1500, speed: 280, sunder: 4 }),
  necromancer: U({ id: "necromancer", name: "Necromancer", tier: 2, role: "ranged",
    blurb: "Casts withering bolts from the rear and makes soldiers of the fallen.",
    ability: "Raise Dead: when anyone on foot dies within 10, a Skeleton rises to fight for the Necromancer (once every 3 seconds).",
    cost: 445, hp: 165, damage: 16, interval: sec(1.2), range: 7 * UNIT, air: true, raise: { unit: "skeleton", radius: 10 * UNIT, cooldown: sec(3) } }),
  trebuchet: U({ id: "trebuchet", name: "Trebuchet", tier: 2, role: "siege",
    blurb: "Hurls stones a very long way, crushing whole clusters and breaking walls. Helpless up close.",
    ability: "Siege Stones: half again as much damage to towers and the cathedral, from beyond their reach. Cannot hit foes nearer than 4 or in the air.",
    cost: 470, hp: 180, armor: 1, damage: 32, interval: sec(3), range: 13 * UNIT, splash: 2200, speed: 220, minRange: 4 * UNIT, bonus: { structure: 50 } }),
  shade: U({ id: "shade", name: "Shade", tier: 2, role: "front",
    blurb: "A murderer's ghost with twin sickles. Slips past the line to gut whoever stands behind it.",
    ability: "Veil: cannot be targeted from farther than 2 unless revealed. Ghost Blades: ignore armor.",
    cost: 515, hp: 265, damage: 33, interval: sec(0.8), range: 1500, speed: 360, veil: 2 * UNIT, pierce: true }),

  // ---------- Tier III ----------
  colossus: U({ id: "colossus", name: "Bone Colossus", tier: 3, role: "front",
    blurb: "A walking ossuary. Its scything arms mow down whole ranks.",
    ability: "Cleave: hits every foe around its target. Ossuary: collapses into four Skeletons when slain.",
    cost: 955, hp: 900, armor: 2, damage: 30, interval: sec(1.5), range: 2500, splash: 2000, speed: 240, spawnOnDeath: { unit: "skeleton", count: 4 } }),
  wyrm: U({ id: "wyrm", name: "Ash Wyrm", tier: 3, role: "ranged",
    blurb: "Great winged serpent that bathes one victim in fire until nothing is left.",
    ability: "Searing Breath: +25% damage for each consecutive hit on the same foe, up to +200%. Flies.",
    cost: 1140, hp: 700, armor: 1, damage: 12, interval: sec(0.5), range: 5 * UNIT, speed: 300, flying: true, air: true, ramp: { pct: 25, max: 8 } }),
  cantor: U({ id: "cantor", name: "Tempest Cantor", tier: 3, role: "ranged",
    blurb: "Her hymn calls down lightning that leaps from soldier to soldier.",
    ability: "Chain Lightning: each strike leaps to 4 more foes within 4, losing a quarter of its force per leap. Strikes the air too.",
    cost: 725, hp: 200, damage: 33, interval: sec(1.5), range: 8 * UNIT, air: true, chain: { jumps: 4, radius: 4 * UNIT, falloff: 25 } }),
  reliquary: U({ id: "reliquary", name: "Reliquary", tier: 3, role: "support",
    blurb: "A saint's bones borne in a gilded ark. Those who march beside it do not fall easily.",
    ability: "Sanctuary: allies within 7 gain 3 armor and regain 15 health a second. Does not fight.",
    cost: 260, hp: 520, armor: 2, damage: 0, interval: sec(1), range: 5 * UNIT, speed: 280, aura: { radius: 7 * UNIT, armor: 3, regen: 15 } }),
  countess: U({ id: "countess", name: "Crimson Countess", tier: 3, role: "front",
    blurb: "Vampire duelist. Every wound she deals closes one of her own.",
    ability: "Blood Feast: her heavy blade heals her for two fifths of the damage it deals.",
    cost: 950, hp: 800, armor: 1, damage: 75, interval: sec(1.5), range: 1500, speed: 340, leech: 40 }),
  ballista: U({ id: "ballista", name: "Impaler", tier: 3, role: "siege",
    blurb: "A great ballista whose iron stake runs through everything in its path, in the lane or above it.",
    ability: "Impale: skewers every foe in a line 14 long. Two and a half times its damage to flying foes.",
    cost: 615, hp: 210, armor: 1, damage: 42, interval: sec(2.5), range: 12 * UNIT, speed: 240, air: true, line: { length: 14 * UNIT, width: 900 }, bonus: { flying: 150 } }),
  lich: U({ id: "lich", name: "Pale Lich", tier: 3, role: "ranged",
    blurb: "Dead sorcerer-king. His grave-frost bursts among the enemy and freezes them where they stand.",
    ability: "Grave Frost: bursts in an area, ignores armor, and slows everyone caught by 40% for 3 seconds.",
    cost: 745, hp: 200, damage: 18, interval: sec(1.5), range: 8 * UNIT, splash: 2200, air: true, pierce: true, slow: { pct: 40, ticks: sec(3) } }),
  headsman: U({ id: "headsman", name: "Headsman", tier: 3, role: "front",
    blurb: "The executioner. The greater the foe, the deeper the axe bites.",
    ability: "Execute: every blow deals bonus damage equal to 10% of its victim's full health.",
    cost: 815, hp: 850, armor: 2, damage: 44, interval: sec(1.4), range: 1800, maim: 10}),

  // ---------- Tier IV: raised by the Undertaker only ----------
  titan: U({ id: "titan", name: "Belfry Titan", tier: 4, role: "front",
    blurb: "A cathedral tower torn loose and walking, its great bell swinging in its chest.",
    ability: "Death Knell: each toll crushes every foe around its target and leaves them 30% slower for 2 seconds.",
    cost: 2000, hp: 2300, armor: 3, damage: 55, interval: sec(1.8), range: 2800, splash: 2800, speed: 220, slow: { pct: 30, ticks: sec(2) } }),
  seraph: U({ id: "seraph", name: "Ashen Seraph", tier: 4, role: "ranged",
    blurb: "A burnt angel on six wings. Its lance of cinders bursts among walkers and flyers alike.",
    ability: "Cinder Lance: bursts in an area, ignores armor, strikes ground and air. Flies.",
    cost: 2400, hp: 950, armor: 2, damage: 36, interval: sec(1), range: 7 * UNIT, splash: 1800, speed: 300, flying: true, air: true, pierce: true }),
  rider: U({ id: "rider", name: "Pale Rider", tier: 4, role: "front",
    blurb: "Death on a bone horse. It rides down the strongest thing in its way and grows fat on it.",
    ability: "Reaping Charge: its first strike on each new foe deals triple damage. Harvest: heals for 30% of the damage it deals, and each blow takes 4% of the victim's full health.",
    cost: 1900, hp: 1350, armor: 2, damage: 58, interval: sec(0.9), range: 2500, speed: 380, charge: 300, leech: 30, maim: 4 }),
  hellmouth: U({ id: "hellmouth", name: "Hellmouth", tier: 4, role: "siege",
    blurb: "A bronze bombard cast as a screaming maw. What it spits keeps burning.",
    ability: "Brimstone: a huge burning blast; those caught burn for 6 a second for 4 seconds. Double damage to towers and the cathedral. Cannot hit foes nearer than 5 or in the air.",
    cost: 1950, hp: 520, armor: 2, damage: 85, interval: sec(3.5), range: 15 * UNIT, splash: 3000, speed: 200, minRange: 5 * UNIT, dot: { dmg: 6, ticks: sec(4) }, bonus: { structure: 100 } }),

  // ---------- mercenaries: hired by the Undertaker, march to the middle of the lane and are gone ----------
  gallowglass: U({ id: "gallowglass", name: "Gallowglass", tier: 0, role: "front", merc: true,
    blurb: "Two mailed axemen from across the sea. They hold a line for as long as they are paid to.",
    ability: "Sellswords: a pair, hired once. They fight to the middle shrine and leave.",
    cost: 90, hp: 300, armor: 2, damage: 20, interval: sec(1), range: 1600, count: 2 }),
  marksman: U({ id: "marksman", name: "Free Marksmen", tier: 0, role: "ranged", merc: true,
    blurb: "Three poachers with long guns. They shoot whatever walks or flies.",
    ability: "Sellswords: three, hired once. Strike ground and air.",
    cost: 100, hp: 110, damage: 18, interval: sec(1.2), range: 7 * UNIT, air: true, count: 3 }),
  fireeater: U({ id: "fireeater", name: "Fire-Eater", tier: 0, role: "front", merc: true,
    blurb: "A carnival fire-breather gone to war. A swarm is only kindling.",
    ability: "Sellsword, hired once. Breathes fire over an area; those caught burn for 4 a second for 3 seconds.",
    cost: 110, hp: 280, damage: 9, interval: sec(0.5), range: 3500, splash: 2800, dot: { dmg: 4, ticks: sec(3) } }),
  ogre: U({ id: "ogre", name: "Shackled Ogre", tier: 0, role: "front", merc: true,
    blurb: "Bought from a debtor's pit, still dragging its chains. It flattens whatever stands closest.",
    ability: "Sellsword, hired once. Its chain sweeps every foe around its target.",
    cost: 210, hp: 1400, armor: 1, damage: 50, interval: sec(1.5), range: 2500, splash: 2000, speed: 260 }),

  // ---------- not buildable ----------
  skeleton: U({ id: "skeleton", name: "Skeleton", tier: 0, role: "front", summoned: true,
    blurb: "Raised by a Necromancer or shed by a Bone Colossus.", ability: "Brittle: crumbles after 40 seconds.",
    cost: 0, hp: 90, damage: 10, interval: sec(1), range: 1500, life: sec(40) }),
  // Guard tower: two stand on each team's home shrine and two more at the front of its building ground. Lives in the unit list so it is targeted,
  // damaged and counted as shrine presence by the ordinary rules; it never moves.
  tower: U({ id: "tower", name: "Guard Tower", tier: 0, role: "ranged", structure: true,
    blurb: "Shoots attackers, who must stop and bring it down before they can pass.", ability: "Watchfire: strikes foes on the ground and in the air.",
    cost: 0, hp: 2400, armor: 2, damage: 24, interval: sec(0.6), range: 9 * UNIT, speed: 0, air: true }),
  // Cathedral bastion: the two that guard the front of each building ground, the cathedral's last wall. Half again a guard tower's
  // stone, thicker walls and a heavier shot, so a lane that breaks through still has to bring a real army to reach the doors.
  bastion: U({ id: "bastion", name: "Cathedral Bastion", tier: 0, role: "ranged", structure: true,
    blurb: "The cathedral's last wall. Attackers must stop and bring it down before they reach the chantries and the doors.",
    ability: "Watchfire: strikes foes on the ground and in the air.",
    cost: 0, hp: 3600, armor: 3, damage: 26, interval: sec(0.6), range: 10 * UNIT, speed: 0, air: true }),
};
/** Units a player can build, grouped by tier in hotkey order. */
export const UNIT_ORDER = [
  "arbalester", "oathguard", "zealot", "hound", "flagellant", "hexbinder",
  "doctor", "dreadknight", "gargoyle", "witchhunter", "penitent", "necromancer", "trebuchet", "shade",
  "colossus", "wyrm", "cantor", "reliquary", "countess", "ballista", "lich", "headsman",
  "titan", "seraph", "rider", "hellmouth",
] as const;
/** Mercenary bands the Undertaker can hire, in menu order. */
export const MERC_ORDER = ["gallowglass", "marksman", "fireeater", "ogre"] as const;
export const MAX_TIER = 4;
/** Each player has two gravekeepers who do the building. Slot 0 is the Sexton, slot 1 the Undertaker. */
export const KEEPERS = [
  { id: "sexton", name: "Sexton", blurb: "Gravedigger of the parish. Raises chantries of the first three tiers, and can step through the grave to any ground his side holds.", minTier: 1, maxTier: 3, mercs: false, teleport: true },
  { id: "undertaker", name: "Undertaker", blurb: "Keeps the ledger of the dead. Raises the great chantries of the fourth tier, which the Sexton cannot, and hires mercenaries.", minTier: 4, maxTier: 4, mercs: true, teleport: false },
] as const;
export const unitsOfTier = (tier: number): string[] => UNIT_ORDER.filter(id => UNITS[id]!.tier === tier);

/** Lane geometry. One lane is a horizontal strip; team 0 at x=0, team 1 at x=laneLength. */
export const MAP = {
  laneLength: 480 * UNIT,
  cell: 1 * UNIT,            // placement grid step (not drawn); buildings snap to it
  footprint: 2,              // a building covers footprint x footprint cells, so neighbours can be staggered
  zoneCols: 36, zoneRows: 24, // laneWidth = zoneRows * cell; room for 216 buildings
  zoneStart: 16 * UNIT,      // distance from the team's own lane end to the rear of its zone: the ground begins at the cathedral steps
  hqOffset: 8 * UNIT,        // HQ centre distance from the lane end
  hqRadius: 4 * UNIT,
  beaconX: [120 * UNIT, 240 * UNIT, 360 * UNIT], // 25% / 50% / 75%; first and last are the home shrines
  captureRadius: 5 * UNIT,   // along the lane
  shrineTower: "tower",      // what guards the home shrine
  baseTower: "bastion",      // what guards the front of the building ground: the cathedral's last wall
  towerAhead: 3 * UNIT,      // guard towers stand this far in front of their home shrine
  towerY: [7 * UNIT, 17 * UNIT],
  baseTowerAhead: 3 * UNIT,  // base towers stand this far in front of the building ground...
  baseTowerY: [3 * UNIT, 21 * UNIT], // ...near the top and bottom edges of the lane
};
export const LANE_WIDTH = MAP.zoneRows * MAP.cell;

/**
 * Lane investment (the tithe): each level costs `cost` and adds `bonus` income per controlled beacon in that lane.
 * Owner decisions: every level costs the same, and there is no highest level.
 */
export const INVEST = { cost: 300, bonus: 8 };

/** Rites: research that opens a unit tier, keyed by the tier it opens. Sequential. */
export const RESEARCH: Record<number, { cost: number; ticks: number }> = {
  2: { cost: 400, ticks: sec(30) },
  3: { cost: 800, ticks: sec(45) },
  4: { cost: 1500, ticks: sec(60) },
};
/** Studies: research that unlocks one unit of an open tier, keyed by the unit's tier. One research of any kind at a time. */
export const UNIT_RESEARCH: Record<number, { cost: number; ticks: number }> = {
  1: { cost: 90, ticks: sec(12) },
  2: { cost: 150, ticks: sec(18) },
  3: { cost: 260, ticks: sec(25) },
  4: { cost: 450, ticks: sec(35) },
};

/**
 * Health of a chantry (a production building), by the tier of the unit it sends. Enemy soldiers with nobody left to fight
 * tear down the chantries they pass on their way to the cathedral; a razed chantry is gone, with no refund.
 */
export const CHANTRY_HP: Record<number, number> = { 1: 320, 2: 460, 3: 640, 4: 900 };

export const RULES = {
  startCredits: 350,
  baseIncome: 32,                 // per income tick, per player
  beaconIncome: 4,                // per controlled beacon per income tick
  incomeIntervalTicks: sec(10),
  waveIntervalTicks: sec(30),     // synchronized production wave; first wave at 30 s
  keeperSpeed: 450,               // gravekeepers walk at this many milli-units per tick
  keeperReach: 2500,              // a keeper raises a chantry once this close to its centre; the chantry stands at once
  keeperQueue: 8,                 // build orders one keeper can have waiting
  mercCooldownTicks: sec(6),      // pause between two hirings
  mercApproachPad: 40,           // step inside attack range so a hired band can clear foes and reach midfield
  mercAhead: 3 * UNIT,            // mercenaries appear this far in front of the base towers
  // The Storm of Wrath: any player who has opened `stormTier` may call it. For `stormTicks` lightning strikes every enemy
  // soldier on the whole board (every lane, ground and air; not towers) for `stormDamage` each `stormInterval`, through armor.
  // Storms stack: two at once strike twice as hard.
  stormTier: 3, stormCost: 500, stormCooldownTicks: sec(150), stormTicks: sec(10), stormInterval: sec(1), stormDamage: 9,
  // The Deadly Fog: a last resort, free, once a match for each player. It rolls out of the caster's cathedral down one
  // lane, reaching `fogReach` from the lane end (halfway between the home shrine and the middle one) after `fogRollTicks`,
  // stands for `fogHoldTicks` and lifts. Every enemy soldier it covers dies, whatever it is; towers and cathedrals do not.
  fogReach: 180 * UNIT, fogRollTicks: sec(18), fogHoldTicks: sec(5),
  // The Ossuary Vultures: any player who has opened `vultureTier` may send them, free, then waits `vultureCooldownTicks`.
  // Two birds fly abreast (at `vultureY` across the lane) down the lane his Sexton stands in, from his side's home shrine
  // to the enemy's, at `vultureSpeed`, and are gone. They never stop and cannot be struck. Each lets a skull urn fall on
  // the nearest enemy ground soldier within `vultureSight`, at most one per `vultureUrnTicks`; the urn lands
  // `vultureFallTicks` later where he stood and deals `vultureDamage`, through armor, to every enemy ground soldier
  // within `vultureRadius`. Flyers, towers and cathedrals are spared.
  vultureTier: 2, vultureCooldownTicks: sec(120), vultureSpeed: 500, vultureY: [7 * UNIT, 17 * UNIT], vultureSight: 10 * UNIT,
  vultureUrnTicks: sec(2), vultureFallTicks: sec(0.7), vultureDamage: 110, vultureRadius: 6 * UNIT,
  sellRefundFreshPct: 75,         // before the building's first wave
  sellRefundUsedPct: 25,          // after it has produced
  acquireRange: 9 * UNIT,         // units notice enemies at max(this, weapon range + acquirePad)
  acquirePad: 2 * UNIT,
  meleeReach: 3 * UNIT,           // attackers with more range than this are "ranged" (for Shield Wall)
  unitSpacing: 750,               // units push apart when closer than this
  separationStep: 60,             // max push per tick, per unit
  healerHoldRange: 9 * UNIT,      // healers stop advancing when an enemy is this close
  hqHp: 4500,                     // per lane: a cathedral besieged from three lanes has three times this
  hqDamage: 18, hqInterval: sec(0.75), hqRange: 10 * UNIT, // weak defensive gun
  overtimeTick: sec(25 * 60),     // sudden death: HQ guns shut down and HQs take extra damage
  overtimeHqDamageMult: 3,
  overtimeDecay: 8,               // ...and crumble by this much a second, times (1 + shrines the enemy holds), so even a deadlock ends
};

/** Autopilot AI tuning (see ai.ts). */
export const AI = {
  thinkTicks: sec(2),
  /**
   * Each profile is a way to play: `tech` is the order it researches in (a number is the rite that opens that tier,
   * a name is a unit study) and `mix` the army it builds toward (it builds whichever unlocked unit is most under-represented).
   */
  profiles: [
    { name: "host of the dead", // a skeleton tide behind heavy iron, then the colossus
      tech: ["flagellant", 2, "penitent", "necromancer", "witchhunter", "doctor", 3, "colossus", "lich", "headsman", "ballista", 4, "titan"],
      mix: { arbalester: 3, oathguard: 2, zealot: 1, flagellant: 2, penitent: 2, necromancer: 2, doctor: 1, witchhunter: 1, colossus: 2, lich: 2, ballista: 1, headsman: 1, titan: 1 } },
    { name: "hunt and sky", // hounds and cavalry early, wings and lightning late
      tech: ["hound", 2, "dreadknight", "gargoyle", "hexbinder", "shade", 3, "wyrm", "cantor", "countess", "trebuchet", 4, "seraph"],
      mix: { arbalester: 5, oathguard: 2, zealot: 1, hound: 1, hexbinder: 2, dreadknight: 2, gargoyle: 1, trebuchet: 1, shade: 1, wyrm: 1, cantor: 2, countess: 1, seraph: 1 } },
    { name: "siege line", // curses and engines behind a wall of iron, under a saint's protection
      tech: ["hexbinder", 2, "trebuchet", "penitent", "witchhunter", "doctor", 3, "ballista", "reliquary", "cantor", "colossus", 4, "hellmouth"],
      mix: { arbalester: 3, oathguard: 3, zealot: 1, hexbinder: 2, trebuchet: 2, penitent: 2, witchhunter: 1, doctor: 1, ballista: 2, reliquary: 1, cantor: 1, colossus: 1, hellmouth: 1 } },
    { name: "blood court", // fast killers early, the countess and her headsman late
      tech: ["flagellant", 2, "dreadknight", "doctor", "shade", "hound", 3, "countess", "headsman", "wyrm", "reliquary", 4, "rider"],
      mix: { arbalester: 6, oathguard: 2, zealot: 1, flagellant: 2, hound: 1, shade: 1, dreadknight: 2, doctor: 2, countess: 2, headsman: 1, wyrm: 1, reliquary: 1, rider: 1 } },
  ] as { name: string; tech: (string | number)[]; mix: Record<string, number> }[],
  researchAtBuildings: 3,         // first research once it owns this many buildings...
  buildingsPer2Research: 3,       // ...and this many more for every two researches after that
  antiAirShare: 3,                // when the enemy fields flyers, at least 1 building in this many must be able to hit them
  mercReserve: 200,               // when threatened it hires mercenaries only with this much gold to spare
  stormMinFoes: 16,               // calls the storm once this many enemy soldiers are on the board...
  stormReserve: 250,              // ...and it has this much gold to spare
  vultureMinFoes: 5,              // sends the vultures once this many enemy ground soldiers are in its Sexton's lane
  fogMinFoes: 10,                 // calls the fog down its lane once this many enemy soldiers stand where it will roll...
  fogHqPct: 50,                   // ...or any at all once the cathedral is below this share of its health
  investBuildingsPerLevel: 3,     // needs this many buildings per investment level before investing again
  investMinBeacons: 2,
};
