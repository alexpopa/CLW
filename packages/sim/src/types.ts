export type PlayerId = number; // slot index 0..(2*teamSize-1)
export type TeamId = 0 | 1;  // team 0 owns the left end of every lane, team 1 the right end

export interface ResearchState { tier: number; startTick: number; doneTick: number }
export interface PlayerState {
  id: PlayerId; team: TeamId;
  lane: number;               // default lane
  credits: number;
  tier: number;               // highest unlocked unit tier
  research: ResearchState | null;
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
}
export interface BeaconState { id: number; lane: number; x: number; owner: TeamId | null }
export interface TeamState { hqHp: number; hqCooldown: number }

/** Transient per-tick events for presentation (effects, sounds). Replaced on every step(). */
export type SimEvent =
  | { t: "shot"; id: number; unit: string; team: TeamId; x1: number; y1: number; x2: number; y2: number } // unit "hq" (id 0) = headquarters
  | { t: "heal"; id: number; team: TeamId; x1: number; y1: number; x2: number; y2: number }
  | { t: "death"; unit: string; team: TeamId; x: number; y: number }
  | { t: "capture"; beacon: number; team: TeamId }
  | { t: "wave" }
  | { t: "researched"; player: PlayerId; tier: number };

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
  | { type: "research" };

export interface TimedCommand { player: PlayerId; cmd: Command }

export interface GameConfig { teamSize: 1 | 2 | 3; seed: number; lanes?: number; aiSlots?: PlayerId[] }
