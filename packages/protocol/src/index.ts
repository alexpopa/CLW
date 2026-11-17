import type { Command, GameConfig, GameState, PlayerId, TimedCommand } from "@lw/sim";

/** Authenticated identity, provider-agnostic. Whatever the IdP is (ChatGPT/OIDC/dev), the game sees only this. */
export interface UserIdentity { userId: string; displayName: string; avatarUrl?: string; provider: string }

export interface LobbySettings { teamSize: 1 | 2 | 3; aiFill: boolean }

/** Which side and lane a seat plays: the first `teamSize` seats are the left team, lane by lane, then the right team. */
export const seatOf = (slot: number, teamSize: number): { team: 0 | 1; lane: number } => ({ team: slot < teamSize ? 0 : 1, lane: slot % teamSize });

/** Client -> Server */
export type ClientMsg =
  | { t: "hello"; sessionToken: string } // guest play: "guest:<display name>"
  | { t: "createLobby"; settings: LobbySettings }
  | { t: "joinLobby"; lobbyId: string; slot?: PlayerId }
  | { t: "ready"; ready: boolean }
  | { t: "seat"; slot: PlayerId }        // move to that empty seat before the match (seat = team and lane, see seatOf)
  | { t: "start" }                       // host only, once every seated player is ready; empty seats are filled by the autopilot
  | { t: "leave" }
  | { t: "cmd"; cmd: Command; clientSeq: number };

/** Server -> Client. Lockstep-lite: server is authoritative, broadcasts command batches per tick,
 *  clients run the same @lw/sim; periodic full snapshots correct drift. */
export type ServerMsg =
  | { t: "welcome"; user: UserIdentity }
  | { t: "lobby"; lobbyId: string; settings: LobbySettings; yourSlot: PlayerId; host: PlayerId; slots: ({ user: UserIdentity; ready: boolean } | "ai" | null)[] }
  | { t: "gameStart"; config: GameConfig; yourSlot: PlayerId; names: string[] } // names[slot]; the autopilot's seat is "Autopilot"
  | { t: "playerLeft"; slot: PlayerId }  // that seat is now played by the autopilot
  | { t: "tick"; tick: number; cmds: TimedCommand[] }
  | { t: "snapshot"; state: GameState }
  | { t: "gameOver"; winner: 0 | 1 }
  | { t: "error"; code: string; message: string };
