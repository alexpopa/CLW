import type { ClientMsg, ServerMsg } from "@lw/protocol";
import type { Command, GameConfig, TimedCommand } from "@lw/sim";

/**
 * Connection to the match server (apps/server). The server owns the match: this only forwards the
 * player's Commands and hands back the ticks the server applied, for the local sim to replay.
 */
export interface NetHandlers {
  lobby(code: string, seated: number, seats: number): void;                                   // waiting for an opponent
  start(config: GameConfig, slot: number, names: string[]): void;
  tick(tick: number, cmds: TimedCommand[]): void;
  left(slot: number): void;
  error(message: string): void;                                // the server refused something; still connected
  closed(): void;                                              // connection lost or never made
}

/** Where the match server lives: VITE_SERVER_URL at build time, else port 8788 on the host serving the page. */
function serverUrl(): string {
  const set = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SERVER_URL;
  return set || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:8788`;
}

export const hostedAccounts = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_RGBONER_ACCOUNTS === "true";

export async function matchCredentials(name: string): Promise<{ url: string; token: string } | null> {
  if (!hostedAccounts) return { url: serverUrl(), token: `guest:${name}` };
  const response = await fetch("/auth/match-ticket", { method: "POST" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Online matches are currently unavailable.");
  const ticket: { serverUrl: string; token: string } = await response.json();
  return { url: ticket.serverUrl, token: ticket.token };
}

export class Net {
  private ws: WebSocket;
  private seq = 0;
  private done = false;

  /** `first` is sent once the server has accepted the player's name. */
  constructor(credentials: { url: string; token: string }, first: ClientMsg, private on: NetHandlers) {
    this.ws = new WebSocket(credentials.url);
    this.ws.onopen = () => this.send({ t: "hello", sessionToken: credentials.token });
    this.ws.onmessage = e => {
      let m: ServerMsg;
      try { m = JSON.parse(String(e.data)) as ServerMsg; } catch { return; }
      if (m.t === "welcome") this.send(first);
      else if (m.t === "lobby") on.lobby(m.lobbyId, m.slots.filter(Boolean).length, m.slots.length);
      else if (m.t === "gameStart") on.start(m.config, m.yourSlot, m.names);
      else if (m.t === "tick") on.tick(m.tick, m.cmds);
      else if (m.t === "playerLeft") on.left(m.slot);
      else if (m.t === "error") on.error(m.message);
    };
    this.ws.onclose = () => { if (!this.done) { this.done = true; on.closed(); } };
  }

  private send(msg: ClientMsg): void { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }
  command(cmd: Command): void { this.send({ t: "cmd", cmd, clientSeq: ++this.seq }); }
  startNow(): void { this.send({ t: "start" }); }
  /** Leave quietly: no `closed` callback. */
  close(): void { this.done = true; this.ws.close(); }
}
