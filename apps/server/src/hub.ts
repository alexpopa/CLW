import { createGame, parseCommand, simpleAI, step, TICK_RATE } from "@lw/sim";
import type { Command, GameConfig, GameState, PlayerId, TimedCommand } from "@lw/sim";
import type { LobbySettings, ServerMsg, UserIdentity } from "@lw/protocol";
import type { SessionStore } from "./auth/types";

/**
 * Lobbies and authoritative matches, independent of the transport so it can be tested without sockets.
 * The server owns the only real GameState. Clients send Commands; every tick the server applies the
 * queued commands (plus the autopilot's for empty seats), then broadcasts exactly what it applied so
 * each client can replay the same tick on its own copy of the deterministic sim.
 */
export interface Conn { send(msg: ServerMsg): void; close(): void }

const TICK_MS = 1000 / TICK_RATE;
const MAX_CATCHUP = 10;        // ticks a match may run in one pump when the process fell behind
const MAX_QUEUED = 16;         // commands one player may queue between two ticks
const MAX_LOBBIES = 200;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L or O: codes are read aloud
const AUTOPILOT = "Autopilot";

interface Client { conn: Conn; user: UserIdentity | null; lobby: Lobby | null; slot: PlayerId; busy: Promise<void> }
interface Match { state: GameState; startedAt: number; queued: Command[][]; ai: Set<PlayerId> }
interface Lobby { id: string; settings: LobbySettings; seats: (Client | null)[]; match: Match | null }

export interface HubOptions { random?: (n: number) => number; now?: () => number }

export class Hub {
  private lobbies = new Map<string, Lobby>();
  private random: (n: number) => number;
  private now: () => number;

  constructor(private sessions: Pick<SessionStore, "resolve">, opts: HubOptions = {}) {
    this.random = opts.random ?? (n => Math.floor(Math.random() * n));
    this.now = opts.now ?? Date.now;
  }

  /** Register a connection. Feed it parsed JSON messages; call onClose when the socket goes away. */
  connect(conn: Conn): { onMessage(raw: unknown): void; onClose(): void } {
    const c: Client = { conn, user: null, lobby: null, slot: 0, busy: Promise.resolve() };
    return {
      // Messages from one client are handled strictly in order, even though sign-in is asynchronous.
      onMessage: raw => { c.busy = c.busy.then(() => this.handle(c, raw)).catch(() => this.fail(c, "internal", "Something went wrong")); },
      onClose: () => { c.busy = c.busy.then(() => this.leave(c)); },
    };
  }

  get lobbyCount(): number { return this.lobbies.size; }

  private fail(c: Client, code: string, message: string): void { c.conn.send({ t: "error", code, message }); }

  private async handle(c: Client, raw: unknown): Promise<void> {
    if (typeof raw !== "object" || raw === null) return;
    const m = raw as Record<string, unknown>;
    if (m.t === "hello") {
      if (c.user) return;
      const user = typeof m.sessionToken === "string" ? await this.sessions.resolve(m.sessionToken) : null;
      if (!user) { this.fail(c, "auth", "Sign-in was not accepted"); c.conn.close(); return; }
      c.user = user; c.conn.send({ t: "welcome", user });
      return;
    }
    if (!c.user) { this.fail(c, "auth", "Say hello first"); return; }

    if (m.t === "createLobby") {
      if (c.lobby) return this.fail(c, "busy", "You are already in a match");
      if (this.lobbies.size >= MAX_LOBBIES) return this.fail(c, "full", "The server is full, try again shortly");
      const s = m.settings as Record<string, unknown> | undefined;
      const size = s?.teamSize;
      if (!s || (size !== 1 && size !== 2 && size !== 3)) return this.fail(c, "unsupported", "Team size must be 1, 2 or 3");
      let id = "";
      do { id = Array.from({ length: 4 }, () => CODE_CHARS[this.random(CODE_CHARS.length)]).join(""); } while (this.lobbies.has(id));
      const lobby: Lobby = { id, settings: { teamSize: size, aiFill: s.aiFill === true }, seats: [c, ...Array.from({ length: size * 2 - 1 }, () => null)], match: null };
      this.lobbies.set(id, lobby); c.lobby = lobby; c.slot = 0;
      if (lobby.settings.aiFill) this.startMatch(lobby); else this.sendLobby(lobby);
    } else if (m.t === "joinLobby") {
      if (c.lobby) return this.fail(c, "busy", "You are already in a match");
      const lobby = typeof m.lobbyId === "string" ? this.lobbies.get(m.lobbyId.trim().toUpperCase()) : undefined;
      if (!lobby) return this.fail(c, "notFound", "No match with that code");
      if (c.user.provider === "rgboner" && lobby.seats.some(seat => seat?.user?.userId === c.user?.userId)) {
        return this.fail(c, "sameAccount", "Join using a different RGBoner account");
      }
      // Fill the two sides evenly: an opponent first, then an ally, and so on.
      const n = lobby.settings.teamSize, order = Array.from({ length: n * 2 }, (_, i) => (i % 2 ? Math.floor(i / 2) + n : i / 2));
      const slot = lobby.match ? -1 : order.find(i => lobby.seats[i] === null) ?? -1;
      if (slot < 0) return this.fail(c, "full", "That match has already begun");
      lobby.seats[slot] = c; c.lobby = lobby; c.slot = slot;
      if (lobby.seats.every(Boolean)) this.startMatch(lobby); else this.sendLobby(lobby);
    } else if (m.t === "start") {
      const lobby = c.lobby;
      if (lobby && !lobby.match && c.slot === 0) this.startMatch(lobby);
    } else if (m.t === "leave") {
      this.leave(c);
    } else if (m.t === "cmd") {
      const match = c.lobby?.match, cmd = parseCommand(m.cmd), q = match?.queued[c.slot];
      if (q && cmd && q.length < MAX_QUEUED) q.push(cmd);
    }
  }

  private members(lobby: Lobby): Client[] { return lobby.seats.filter((s): s is Client => s !== null); }

  private sendLobby(lobby: Lobby): void {
    const slots = lobby.seats.map(s => (s ? { user: s.user!, ready: true } : null));
    for (const m of this.members(lobby)) m.conn.send({ t: "lobby", lobbyId: lobby.id, settings: lobby.settings, yourSlot: m.slot, slots });
  }

  private startMatch(lobby: Lobby): void {
    const ai = new Set<PlayerId>();
    lobby.seats.forEach((s, i) => { if (!s) ai.add(i); });
    const config: GameConfig = { teamSize: lobby.settings.teamSize, seed: 1 + this.random(0x7ffffffe), aiSlots: [...ai] };
    lobby.match = { state: createGame(config), startedAt: this.now(), queued: lobby.seats.map(() => []), ai };
    const names = lobby.seats.map(s => s?.user?.displayName ?? AUTOPILOT);
    for (const m of this.members(lobby)) m.conn.send({ t: "gameStart", config, yourSlot: m.slot, names });
  }

  /** A player left or dropped. Before the match their seat simply empties; during it the autopilot takes over. */
  private leave(c: Client): void {
    const lobby = c.lobby;
    if (!lobby) return;
    c.lobby = null;
    if (lobby.seats[c.slot] === c) lobby.seats[c.slot] = null;
    const rest = this.members(lobby);
    if (rest.length === 0) { this.lobbies.delete(lobby.id); return; }
    if (lobby.match) {
      lobby.match.ai.add(c.slot); lobby.match.queued[c.slot] = [];
      for (const m of rest) m.conn.send({ t: "playerLeft", slot: c.slot });
    } else {
      // Keep the host seat filled so someone can still start the match.
      if (!lobby.seats[0]) { const next = rest[0]!; lobby.seats[next.slot] = null; lobby.seats[0] = next; next.slot = 0; }
      this.sendLobby(lobby);
    }
  }

  /** Advance every running match to the present. Call often (several times per tick). */
  pump(): void {
    const now = this.now();
    for (const lobby of this.lobbies.values()) {
      const match = lobby.match;
      if (!match) continue;
      const due = Math.floor((now - match.startedAt) / TICK_MS), s = match.state;
      for (let n = 0; s.tick < due && n < MAX_CATCHUP && s.winner === null; n++) {
        const cmds: TimedCommand[] = [];
        match.queued.forEach((q, player) => { for (const cmd of q) cmds.push({ player, cmd }); q.length = 0; });
        for (const player of match.ai) for (const cmd of simpleAI(s, player)) cmds.push({ player, cmd });
        const tick = s.tick;
        step(s, cmds);
        for (const m of this.members(lobby)) m.conn.send({ t: "tick", tick, cmds });
      }
      if (s.tick < due - TICK_RATE * 2) match.startedAt = now - s.tick * TICK_MS; // fell far behind: do not spiral
      if (s.winner !== null) {
        for (const m of this.members(lobby)) { m.conn.send({ t: "gameOver", winner: s.winner }); m.lobby = null; }
        this.lobbies.delete(lobby.id);
      }
    }
  }
}
