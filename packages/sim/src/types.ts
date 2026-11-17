export type PlayerId = number; // slot index 0..(2*teamSize-1)
export type TeamId = 0 | 1;  // team 0 owns the left end of every lane, team 1 the right end

/** A rite (`unit` null: opens `tier`) or a study (unlocks `unit`, which belongs to `tier`). */
export interface ResearchState { tier: number; unit: string | null; startTick: number; doneTick: number }
export interface PlayerState {
  id: PlayerId; team: TeamId;
  lane: number;               // default lane
  credits: number;
  tier: number;               // highest tier opened by a rite
  unlocked: string[];         // units this player may build, in the order they were learned
  research: ResearchState | null; // one research at a time
  mercReady: number;          // tick from which the next mercenary band may be hired
  stormReady: number;         // tick from which the next Storm of Wrath may be called
  vultureReady: number;       // tick from which the Ossuary Vultures may be sent again
  fogUsed: boolean;           // the Deadly Fog has been called: once a match, never again
  invest: number[];           // personal investment level per lane
  isAI: boolean;
}
/** A permanent production building: spawns one unit of `unit` every wave. */
export interface BuildingState {
  id: number; owner: PlayerId; team: TeamId; lane: number;
  col: number; row: number;   // cell in the team's production zone (col 0 = rear, nearest own HQ)
  unit: string;
  hp: number;                 // a chantry can be razed: see CHANTRY_HP in data.ts
  readyTick: number;          // tick it was raised (it musters from the next wave on)
  produced: boolean;          // has spawned at least once (affects sell refund)
}
export interface UnitState {
  id: number; type: string; owner: PlayerId; team: TeamId; lane: number;
  x: number; y: number;       // milli-units
  hp: number;
  cooldown: number;           // ticks until next attack/heal
  target: number;             // id of the unit currently engaged, 0 = none
  slowUntil: number; slowPct: number; // slowed while tick < slowUntil
  dotUntil: number; dotFrom: number; dotDmg: number; // burning until dotUntil: bitten once a second, counted from dotFrom
  sunder: number;             // armor stripped from this unit
  ramp: number;               // consecutive hits on lastHit (Searing Breath)
  lastHit: number;            // id of the unit it last struck
  abilityCd: number;          // ticks until its ability (Raise Dead) is ready again
  expire: number;             // tick at which a summoned unit crumbles, 0 = never
}
/** A chantry a keeper has been told to raise and is walking to. It is paid for when ordered and refunded if it cannot be built. */
export interface KeeperJob { unit: string; lane: number; col: number; row: number }
/**
 * A gravekeeper: the player's builder. Walks the building ground of its own team (any lane of it, so in team
 * games it can cross to an ally's lane), never the lane itself. Not a unit: it cannot fight or be harmed.
 */
export interface KeeperState {
  owner: PlayerId; team: TeamId; slot: 0 | 1;   // slot 0 = Sexton, slot 1 = Undertaker (see KEEPERS in data.ts)
  lane: number; x: number; y: number;           // where it stands
  tlane: number; tx: number; ty: number;        // where it was told to go (used when it has no job)
  jobs: KeeperJob[];                            // build orders, first is current
}
/** A Storm of Wrath raging against the enemies of `team`: it strikes every `stormInterval` counted from `from`, and ends at `until`. */
export interface StormState { owner: PlayerId; team: TeamId; from: number; until: number }
/**
 * A Deadly Fog of `team` in `lane`: it rolls out from the team's own lane end, counted from `from`, to `RULES.fogReach`,
 * stands a while and lifts. Every enemy soldier it covers dies.
 */
export interface FogState { owner: PlayerId; team: TeamId; lane: number; from: number }
/**
 * A flight of Ossuary Vultures of `team` over `lane`: two birds abreast at `x`, flying from their own home shrine to the
 * enemy's and gone when they reach it. They are not units: nothing can strike them. `cd` is each bird's wait before its next urn.
 */
export interface FlightState { owner: PlayerId; team: TeamId; lane: number; x: number; cd: [number, number] }
/** A skull urn in the air: it bursts at (`x`, `y`) of `lane` at tick `at`, on the enemies of `team`. */
export interface UrnState { team: TeamId; lane: number; x: number; y: number; at: number }
export interface BeaconState { id: number; lane: number; x: number; owner: TeamId | null }
export interface TeamState { hqHp: number; hqCooldown: number }

/** Transient per-tick events for presentation (effects, sounds). Replaced on every step(). Positions are within `lane`. */
export type SimEvent =
  | { t: "shot"; id: number; unit: string; team: TeamId; to: number; chantry?: number; lane: number; x1: number; y1: number; x2: number; y2: number } // unit "hq" (id 0) = headquarters; to = struck unit id, 0 = cathedral, or the chantry whose building id is `chantry`
  | { t: "arc"; team: TeamId; from: number; to: number; lane: number; x1: number; y1: number; x2: number; y2: number }   // one leap of chain lightning
  | { t: "raise"; team: TeamId; lane: number; x: number; y: number }
  | { t: "heal"; id: number; team: TeamId; lane: number; x1: number; y1: number; x2: number; y2: number }
  | { t: "death"; unit: string; team: TeamId; lane: number; x: number; y: number }
  | { t: "razed"; building: number; unit: string; owner: PlayerId; team: TeamId; lane: number; x: number; y: number } // a chantry is destroyed
  | { t: "capture"; beacon: number; team: TeamId }
  | { t: "wave" }
  | { t: "built"; player: PlayerId; slot: 0 | 1; unit: string; lane: number; x: number; y: number }
  | { t: "teleport"; player: PlayerId; slot: 0 | 1; fromLane: number; fromX: number; fromY: number; lane: number; x: number; y: number }
  | { t: "hired"; player: PlayerId; unit: string }
  | { t: "storm"; player: PlayerId; team: TeamId }   // a storm is called by `team`
  | { t: "fog"; player: PlayerId; team: TeamId; lane: number }   // a Deadly Fog is called by `team` in `lane`
  | { t: "vultures"; player: PlayerId; team: TeamId; lane: number }   // a flight of Ossuary Vultures sets out
  | { t: "urn"; owner: PlayerId; bird: 0 | 1; team: TeamId; lane: number; x1: number; y1: number; x2: number; y2: number } // a bird lets an urn fall from (x1, y1) on (x2, y2)
  | { t: "burst"; team: TeamId; lane: number; x: number; y: number }  // an urn bursts
  | { t: "bolt"; team: TeamId; struck: number }      // one volley of a storm of `team`: `struck` enemy soldiers were hit
  | { t: "leave"; unit: string; team: TeamId; lane: number; x: number; y: number }   // a mercenary's contract ends
  | { t: "researched"; player: PlayerId; tier: number; unit: string | null };

export interface GameState {
  tick: number;
  rngState: number;
  nextId: number;
  teamSize: 1 | 2 | 3;
  laneCount: number;
  players: PlayerState[];
  teams: [TeamState, TeamState];
  beacons: BeaconState[];
  buildings: BuildingState[];
  keepers: KeeperState[];
  storms: StormState[];
  fogs: FogState[];
  flights: FlightState[];
  urns: UrnState[];
  units: UnitState[];
  events: SimEvent[];
  winner: TeamId | null;
}

/** Everything a player can do. The ONLY way to change state besides step(). Must be serializable. */
export type Command =
  | { type: "build"; keeper: 0 | 1; unit: string; col: number; row: number; lane?: number } // queue a chantry for that keeper to raise
  | { type: "move"; keeper: 0 | 1; x: number; y: number; lane?: number }                    // walk there (drops its queue, refunded)
  | { type: "teleport"; keeper: 0 | 1; x: number; y: number; lane?: number }                // a gravekeeper steps through the grave to any of his team's ground (drops his queue, refunded)
  | { type: "storm" }                                                                      // call the Storm of Wrath (tier III, costly, long cooldown)
  | { type: "fog" }                                                                        // call the Deadly Fog down the Sexton's lane (free, once a match)
  | { type: "vultures" }                                                                   // send the Ossuary Vultures down the lane the Sexton stands in (tier II, free, long rest)
  | { type: "hire"; unit: string }                                                          // a mercenary band, through the Undertaker
  | { type: "sell"; buildingId: number }
  | { type: "invest"; lane?: number }
  | { type: "research"; unit?: string }; // no unit = the next rite (opens a tier); unit = study that unit

export interface TimedCommand { player: PlayerId; cmd: Command }

/** `lanes` defaults to one lane per player of a team. */
export interface GameConfig { teamSize: 1 | 2 | 3; seed: number; lanes?: number; aiSlots?: PlayerId[] }
