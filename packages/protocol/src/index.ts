import type { Command, GameConfig, GameState, PlayerId, TimedCommand } from "@lw/sim";

/** Authenticated identity, provider-agnostic. Whatever the IdP is (ChatGPT/OIDC/dev), the game sees only this. */
export interface UserIdentity { userId: string; displayName: string; avatarUrl?: string; provider: string }

export interface LobbySettings { teamSize: 1 | 2 | 3; aiFill: boolean }
/** One seat of a lobby: a player, an autopilot at a difficulty (index into the sim's AI.levels), or open for someone to join. */
export type LobbySeat = { user: UserIdentity; ready: boolean } | { ai: number } | null;

/** Which side and lane a seat plays: the first `teamSize` seats are the left team, lane by lane, then the right team. */
export const seatOf = (slot: number, teamSize: number): { team: 0 | 1; lane: number } => ({ team: slot < teamSize ? 0 : 1, lane: slot % teamSize });
/** Longest chat line the server relays. */
export const CHAT_MAX = 200;

/** Client -> Server */
export type ClientMsg =
  | { t: "hello"; sessionToken: string } // guest play: "guest:<display name>"
  | { t: "createLobby"; settings: LobbySettings }
  | { t: "joinLobby"; lobbyId: string; slot?: PlayerId }
  | { t: "ready"; ready: boolean }
  | { t: "seat"; slot: PlayerId; from?: PlayerId } // before the match, move a player to a seat (seat = team and lane, see seatOf).
                                         // Anyone may move themselves to an open seat; the host may move anyone, autopilots too, and a taken seat swaps.
  | { t: "bot"; slot: PlayerId; level: number | null } // host only: put an autopilot at that difficulty in a seat no player holds, or open it (null)
  | { t: "chat"; text: string }          // lobby chat: relayed to the others in the lobby, never stored
  | { t: "start" }                       // host only, once every seated player is ready; open seats get an Easy autopilot
  | { t: "leave" }
  | { t: "cmd"; cmd: Command; clientSeq: number };

/** Server -> Client. Lockstep-lite: server is authoritative, broadcasts command batches per tick,
 *  clients run the same @lw/sim; periodic full snapshots correct drift. */
export type ServerMsg =
  | { t: "welcome"; user: UserIdentity }
  | { t: "lobby"; lobbyId: string; settings: LobbySettings; yourSlot: PlayerId; host: PlayerId; slots: LobbySeat[] }
  | { t: "chat"; slot: PlayerId; name: string; text: string }     // one lobby chat line; `slot` is the speaker's seat when it was said
  | { t: "gameStart"; config: GameConfig; yourSlot: PlayerId; names: string[] } // names[slot]; an autopilot seat is named by its difficulty, e.g. "Hard autopilot"
  | { t: "playerLeft"; slot: PlayerId }  // that seat is now played by the autopilot
  | { t: "tick"; tick: number; cmds: TimedCommand[] }
  | { t: "snapshot"; state: GameState }
  | { t: "gameOver"; winner: 0 | 1 }
  | { t: "error"; code: string; message: string };
