import { describe, expect, it } from "vitest";
import { createGame, step, TICK_RATE } from "@lw/sim";
import type { GameState } from "@lw/sim";
import type { ServerMsg } from "@lw/protocol";
import { guestSessions } from "./auth/guest";
import { Hub } from "./hub";

const TICK_MS = 1000 / TICK_RATE;
/** A fake browser: records what the server sends and replays ticks on its own sim, as the real client does. */
function player(hub: Hub) {
  const got: ServerMsg[] = [];
  let game: GameState | null = null, closed = false;
  const io = hub.connect({
    send: m => {
      got.push(m);
      if (m.t === "gameStart") game = createGame(m.config);
      else if (m.t === "tick" && game) { expect(m.tick).toBe(game.tick); step(game, m.cmds); }
    },
    close: () => { closed = true; },
  });
  const settle = () => new Promise<void>(r => setTimeout(r, 0));
  return {
    got, io, settle,
    get game() { return game!; }, get closed() { return closed; },
    async say(msg: unknown) { io.onMessage(msg); await settle(); },
    last<T extends ServerMsg["t"]>(t: T) { return got.filter(m => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined; },
  };
}
function setup() {
  let now = 0, n = 0;
  const hub = new Hub(guestSessions(), { now: () => now, random: k => (n++ * 7) % k });
  return { hub, run(ticks: number) { for (let i = 0; i < ticks; i++) { now += TICK_MS; hub.pump(); } } };
}

describe("match server", () => {
  it("two guests meet by code, play, and both replay exactly the server's match", async () => {
    const { hub, run } = setup();
    const a = player(hub), b = player(hub);
    await a.say({ t: "hello", sessionToken: "guest:Ada <b>" });
    await b.say({ t: "hello", sessionToken: "guest:Brom" });
    expect(a.last("welcome")!.user).toMatchObject({ displayName: "Ada b", provider: "guest" });

    await a.say({ t: "createLobby", settings: { teamSize: 1, aiFill: false } });
    const code = a.last("lobby")!.lobbyId;
    expect(code).toMatch(/^[A-Z]{4}$/);
    await b.say({ t: "joinLobby", lobbyId: code.toLowerCase() });
    expect(a.last("gameStart")).toMatchObject({ yourSlot: 0, names: ["Ada b", "Brom"] });
    expect(b.last("gameStart")).toMatchObject({ yourSlot: 1 });
    expect(a.last("gameStart")!.config.aiSlots).toEqual([]);

    await a.say({ t: "cmd", cmd: { type: "build", keeper: 0, lane: 0, unit: "arbalester", col: 20, row: 10 }, clientSeq: 1 });
    await b.say({ t: "cmd", cmd: { type: "build", keeper: 0, lane: 0, unit: "oathguard", col: 20, row: 4, credits: 99999 }, clientSeq: 1 });
    await b.say({ t: "cmd", cmd: { type: "build", keeper: 0, lane: 0, unit: "__proto__", col: 0, row: 0 }, clientSeq: 2 }); // dropped
    await b.say({ t: "cmd", cmd: { type: "sell", buildingId: 1 }, clientSeq: 3 });                     // not theirs: no effect
    run(40 * TICK_RATE);
    expect(a.game.tick).toBe(40 * TICK_RATE);
    expect([...a.game.buildings].sort((x, y) => x.owner - y.owner).map(x => [x.owner, x.unit])).toEqual([[0, "arbalester"], [1, "oathguard"]]);
    expect(a.game.units.filter(u => u.type !== "tower").length).toBe(2); // one wave from each side
    expect(JSON.stringify(a.game)).toBe(JSON.stringify(b.game));
  });

  it("a player who drops is replaced by the autopilot, and the match still ends", async () => {
    const { hub, run } = setup();
    const a = player(hub), b = player(hub);
    await a.say({ t: "hello", sessionToken: "guest:Ada" }); await b.say({ t: "hello", sessionToken: "guest:Brom" });
    await a.say({ t: "createLobby", settings: { teamSize: 1, aiFill: false } });
    await b.say({ t: "joinLobby", lobbyId: a.last("lobby")!.lobbyId });
    run(20);
    b.io.onClose(); await b.settle();
    expect(a.last("playerLeft")).toEqual({ t: "playerLeft", slot: 1 });
    run(60 * TICK_RATE);
    expect(a.game.buildings.some(x => x.owner === 1)).toBe(true); // the autopilot is building for the empty seat
    a.io.onClose(); await a.settle();
    expect(hub.lobbyCount).toBe(0);
  });

  it("the host can start alone against the autopilot; strangers and bad input are refused", async () => {
    const { hub, run } = setup();
    const a = player(hub), c = player(hub), d = player(hub);
    await c.say({ t: "createLobby", settings: { teamSize: 1, aiFill: true } });
    expect(c.last("error")!.code).toBe("auth");
    await d.say({ t: "hello", sessionToken: "not-a-guest-token" });
    expect(d.closed).toBe(true);

    await a.say({ t: "hello", sessionToken: "guest:   " });
    expect(a.last("welcome")!.user.displayName).toBe("Wanderer");
    await a.say({ t: "createLobby", settings: { teamSize: 3, aiFill: true } });
    expect(a.last("error")!.code).toBe("unsupported");
    await a.say({ t: "joinLobby", lobbyId: "ZZZZ" });
    expect(a.last("error")!.code).toBe("notFound");
    await a.say({ t: "createLobby", settings: { teamSize: 1, aiFill: true } });
    expect(a.last("gameStart")).toMatchObject({ yourSlot: 0, names: ["Wanderer", "Autopilot"] });
    expect(a.last("gameStart")!.config.aiSlots).toEqual([1]);
    for (const junk of [null, 7, "x", {}, { t: "cmd" }, { t: "cmd", cmd: { type: "win" } }]) await a.say(junk);
    run(10);
    expect(a.game.tick).toBe(10);
  });
});
