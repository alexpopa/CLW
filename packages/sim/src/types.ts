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
  invest: number[];           // personal investment level per lane
  isAI: boolean;
}
/** A permanent production building: spawns one unit of `unit` every wave. */
export interface BuildingState {
  id: number; owner: PlayerId; team: TeamId; lane: number;
  col: number; row: number;   // cell in the team's production zone (col 0 = rear, nearest own HQ)
  unit: string;
  readyTick: number;          // construction completes at this tick
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
export interface BeaconState { id: number; lane: number; x: number; owner: TeamId | null }
export interface TeamState { hqHp: number; hqCooldown: number }

/** Transient per-tick events for presentation (effects, sounds). Replaced on every step(). */
export type SimEvent =
  | { t: "shot"; id: number; unit: string; team: TeamId; to: number; x1: number; y1: number; x2: number; y2: number } // unit "hq" (id 0) = headquarters; to = struck unit id, 0 = cathedral
  | { t: "arc"; team: TeamId; from: number; to: number; x1: number; y1: number; x2: number; y2: number }   // one leap of chain lightning
  | { t: "raise"; team: TeamId; x: number; y: number }
  | { t: "heal"; id: number; team: TeamId; x1: number; y1: number; x2: number; y2: number }
  | { t: "death"; unit: string; team: TeamId; x: number; y: number }
  | { t: "capture"; beacon: number; team: TeamId }
  | { t: "wave" }
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
  units: UnitState[];
  events: SimEvent[];
  winner: TeamId | null;
}

/** Everything a player can do. The ONLY way to change state besides step(). Must be serializable. */
export type Command =
  | { type: "build"; unit: string; col: number; row: number; lane?: number }
  | { type: "sell"; buildingId: number }
  | { type: "invest"; lane?: number }
  | { type: "research"; unit?: string }; // no unit = the next rite (opens a tier); unit = study that unit

export interface TimedCommand { player: PlayerId; cmd: Command }

export interface GameConfig { teamSize: 1 | 2 | 3; seed: number; lanes?: number; aiSlots?: PlayerId[] }
