import { canBuild, createGame, simpleAI, step, INVEST_TIERS, MAP, RESEARCH, TICK_RATE, UNITS, UNIT_ORDER } from "@lw/sim";
import type { Command, GameState, TimedCommand } from "@lw/sim";
import { Renderer } from "./scene";
import { createHud } from "./hud";
import { Sound } from "./audio";
import { hostedAccounts, matchCredentials, Net } from "./net";

/**
 * Solo: a match vs the autopilot runs the shared sim right here (no server, no account).
 * Online: the match server owns the match; this client sends Commands and replays the server's ticks
 * on its own copy of the sim. Either way: render FROM GameState, send Commands INTO the sim.
 */
const BOT = 1;
const TICK_MS = 1000 / TICK_RATE;
const LANE = MAP.laneLength / 1000;

function start(mount: HTMLElement, hudRoot: HTMLElement): void {
  const view = new Renderer();
  view.init(mount);
  const sound = new Sound();

  let game: GameState = createGame({ teamSize: 1, seed: 1, aiSlots: [BOT] });
  let running = false, paused = false, speed = 1, ended = false;
  let ME = 0;                              // my player slot (always 0 in solo play)
  let net: Net | null = null;              // set while connected to the match server
  let online = false;                      // the current match is server-run
  let inbox: TimedCommand[][] = [];        // server ticks not yet replayed
  let names: string[] = [];
  let pending: Command[] = [];
  let acc = 0, last = performance.now();
  let selectedUnit: string | null = null, selectedBuilding: number | null = null;
  let hoverCell: { col: number; row: number } | null = null;
  const keys = new Set<string>();
  let mouseX = -1, mouseInside = false;

  const me = () => game.players[ME]!;
  const home = () => (me().team === 0 ? 0 : LANE);
  const send = (cmd: Command) => { if (!running || ended) return; if (online) net?.command(cmd); else pending.push(cmd); };
  const begin = (state: GameState, slot: number) => {
    game = state; ME = slot; pending = []; inbox = []; acc = 0; ended = false; running = true; paused = false; speed = online ? 1 : speed;
    selectedUnit = null; selectedBuilding = null;
    view.reset(); view.camX = home(); view.clampCam(); hud.hideOverlay(); sound.play("bell");
    const team = me().team;
    hud.setSide(team, (pics[team] ??= view.portraits(team)));
  };
  const quitOnline = () => { net?.close(); net = null; online = false; };
  /** Connect, then host or join. The lobby and the match arrive as callbacks. */
  let connectionAttempt = 0;
  const goOnline = async (name: string, code: string | null) => {
    const attempt = ++connectionAttempt;
    sound.start(); quitOnline();
    try { localStorage.setItem("lw.name", name); } catch { /* private window */ }
    hud.showLobby(null, code ? "Seeking the match…" : "Reaching the match server…");
    let credentials;
    try {
      credentials = await matchCredentials(name);
    } catch {
      if (attempt === connectionAttempt) hud.showStart("Online matches are currently unavailable.");
      return;
    }
    if (attempt !== connectionAttempt) return;
    if (!credentials) { location.assign("/login"); return; }
    const mine: Net = net = new Net(credentials, code ? { t: "joinLobby", lobbyId: code } : { t: "createLobby", settings: { teamSize: 1, aiFill: false } }, {
      lobby: id => hud.showLobby(id, "Awaiting a challenger"),
      start: (config, slot, who) => { online = true; names = who; begin(createGame(config), slot); hud.toast(`You face ${who[1 - slot] ?? "a stranger"}`); },
      tick: (t, cmds) => { if (online && t === game.tick + inbox.length) inbox.push(cmds); },
      left: slot => hud.toast(`${names[slot] ?? "Your opponent"} has left — the autopilot leads their host`),
      error: msg => { if (!online) { quitOnline(); hud.showStart(msg); } else hud.toast(msg); },
      closed: () => {
        if (net !== mine) return;
        const midMatch = online && running && !ended;
        net = null; online = false;
        if (midMatch) { running = false; hud.showStart("The connection to the match server was lost."); }
        else if (!running || ended) { if (!ended) hud.showStart("No match server could be reached."); }
      },
    });
  };
  const deny = (msg: string) => { hud.toast(msg); sound.play("deny"); };

  const pics: Record<number, Record<string, string>> = { 0: view.portraits(0) }; // card portraits per side
  const hud = createHud(hudRoot, pics[0]!, {
    selectUnit(id) {
      if (UNITS[id]!.tier > me().tier) { deny("Requires the Second Rite"); return; }
      selectedUnit = selectedUnit === id ? null : id; selectedBuilding = null; sound.play("click");
    },
    invest() {
      const tier = INVEST_TIERS[me().invest[me().lane] ?? 0];
      if (!tier) deny("The tithe cannot be raised further");
      else if (me().credits < tier.cost) deny("Not enough gold");
      else { send({ type: "invest" }); sound.play("coin"); }
    },
    research() {
      const next = RESEARCH[me().tier + 1];
      if (!next) deny("All rites are known");
      else if (me().research) deny("The rite is already under way");
      else if (me().credits < next.cost) deny("Not enough gold");
      else { send({ type: "research" }); sound.play("rite"); }
    },
    sell() { if (selectedBuilding !== null) { send({ type: "sell", buildingId: selectedBuilding }); selectedBuilding = null; sound.play("coin"); } },
    setSpeed(n) { if (online) return deny("Time cannot be bent in a shared match"); speed = n; paused = false; sound.play("click"); },
    togglePause() { if (online) return deny("A shared match cannot be paused"); paused = !paused; sound.play("click"); },
    toggleMute() { return sound.toggleMute(); },
    panTo(f) { view.camX = f * LANE; view.clampCam(); },
    start() {
      sound.start(); quitOnline();
      begin(createGame({ teamSize: 1, seed: (Date.now() & 0x7fffffff) || 1, aiSlots: [BOT] }), 0);
    },
    hostOnline(name) { goOnline(name, null); },
    joinOnline(name, code) { goOnline(name, code); },
    startOnlineNow() { net?.startNow(); },
    menu() { connectionAttempt++; quitOnline(); running = false; hud.showStart(); },
  }, hostedAccounts);
  addEventListener("resize", () => view.resize());
  view.camX = 0; view.clampCam();
  hud.showStart();

  // ---- input ----
  const canvas = view.canvas;
  let down: { x: number; cam: number; moved: boolean } | null = null;
  const cellUnder = (e: PointerEvent) => { const w = view.pick(e.clientX, e.clientY); return w && view.cellAt(me().team, w.x, w.y); };
  canvas.addEventListener("pointerdown", e => { if (e.button === 0) { down = { x: e.clientX, cam: view.camX, moved: false }; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener("pointermove", e => {
    if (down) {
      if (Math.abs(e.clientX - down.x) > 5) down.moved = true;
      if (down.moved) { view.camX = down.cam - (e.clientX - down.x) * view.unitsPerPixel(); view.clampCam(); }
    }
    hoverCell = cellUnder(e);
  });
  canvas.addEventListener("pointerup", e => {
    const wasDrag = down?.moved; down = null;
    if (e.button !== 0 || wasDrag || !running) return;
    const cell = cellUnder(e);
    const F = MAP.footprint;
    const existing = cell && game.buildings.find(b => b.team === me().team && b.lane === me().lane
      && cell.at.col >= b.col && cell.at.col < b.col + F && cell.at.row >= b.row && cell.at.row < b.row + F);
    if (existing) { selectedBuilding = existing.owner === ME ? existing.id : null; selectedUnit = null; sound.play("click"); }
    else if (cell && selectedUnit) {
      if (me().credits < UNITS[selectedUnit]!.cost) deny("Not enough gold");
      else if (!canBuild(game, me().team, me().lane, cell.col, cell.row)) deny("No room there");
      else { send({ type: "build", unit: selectedUnit, col: cell.col, row: cell.row }); sound.play("build"); }
    } else selectedBuilding = null;
  });
  canvas.addEventListener("contextmenu", e => { e.preventDefault(); selectedUnit = null; selectedBuilding = null; });
  canvas.addEventListener("wheel", e => { e.preventDefault(); view.camX += (e.deltaX + e.deltaY) * view.unitsPerPixel(); view.clampCam(); }, { passive: false });
  addEventListener("mousemove", e => { mouseX = e.clientX; mouseInside = true; });
  document.addEventListener("mouseleave", () => { mouseInside = false; });
  addEventListener("blur", () => { keys.clear(); mouseInside = false; });
  addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (e.target instanceof HTMLInputElement) return; // typing a name or a code
    keys.add(k);
    if (e.repeat || !running) return;
    const n = Number(k);
    if (n >= 1 && n <= UNIT_ORDER.length) hud.actions.selectUnit(UNIT_ORDER[n - 1]!);
    else if (k === "e") hud.actions.invest();
    else if (k === "r") hud.actions.research();
    else if (k === "x" || k === "delete" || k === "backspace") hud.actions.sell();
    else if (k === "escape") { selectedUnit = null; selectedBuilding = null; }
    else if (k === "p") hud.actions.togglePause();
    else if (k === " ") { e.preventDefault(); view.camX = home(); view.clampCam(); }
  });

  /** One solo tick: my queued commands plus the autopilot's. */
  const tick = (now: number) => {
    const cmds: TimedCommand[] = pending.map(cmd => ({ player: ME, cmd }));
    pending = [];
    for (const cmd of simpleAI(game, BOT)) cmds.push({ player: BOT, cmd });
    apply(cmds, now);
  };
  /** Advance the sim one tick with these commands, then hand the events to the view and the sound. */
  const apply = (cmds: TimedCommand[], now: number) => {
    view.snapshot(game);
    step(game, cmds);
    view.addEvents(game, game.events, now);
    sound.events(game.events, view.camX, me().team);
    for (const e of game.events) {
      if (e.t === "researched" && e.player === ME) hud.toast("The Second Rite is complete — new units await");
      else if (e.t === "capture") hud.toast(e.team === me().team ? "Shrine claimed" : "Shrine lost");
    }
  };

  // ---- main loop ----
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(100, now - last); last = now;
    let pan = 0;
    if (keys.has("a") || keys.has("arrowleft")) pan -= 1;
    if (keys.has("d") || keys.has("arrowright")) pan += 1;
    if (pan === 0 && mouseInside && !down) { if (mouseX <= 6) pan = -1; else if (mouseX >= innerWidth - 6) pan = 1; }
    if (pan) { view.camX += pan * dt * 0.1; view.clampCam(); }

    if (running && !paused && !ended) {
      if (online) {
        // Replay server ticks at the sim's pace; hurry only when several have piled up.
        acc += dt;
        while (inbox.length > 0 && (acc >= TICK_MS || inbox.length > 4) && game.winner === null) { acc = Math.max(0, acc - TICK_MS); apply(inbox.shift()!, now); }
        if (inbox.length === 0) acc = Math.min(acc, TICK_MS);
      } else {
        acc += dt * speed;
        while (acc >= TICK_MS && game.winner === null) { acc -= TICK_MS; tick(now); }
      }
      if (game.winner !== null) {
        ended = true;
        const won = game.winner === me().team;
        view.camX = won ? LANE - home() : home(); view.clampCam();
        sound.play(won ? "victory" : "defeat");
        hud.showEnd(won, game, online);
        quitOnline();
      }
    }
    if (selectedBuilding !== null && !game.buildings.some(b => b.id === selectedBuilding)) selectedBuilding = null;
    view.draw(game, { selectedUnit, hoverCell, selectedBuilding, me: ME }, paused || ended ? 1 : Math.min(1, acc / TICK_MS), now, dt);
    hud.update(game, { me: ME, selectedUnit, selectedBuilding, speed, paused, camFrac: view.viewRange() });
  };
  requestAnimationFrame(frame);

  // debugging/testing handle; the sim remains the only thing that changes state
  (window as unknown as Record<string, unknown>).__lw = { get game() { return game; }, view,
    /** Skip ahead n ticks (for testing in a throttled tab). */
    skip(n: number) { for (let i = 0; i < n && running && !online && game.winner === null; i++) tick(performance.now()); } };
}

const mount = document.getElementById("app"), hudRoot = document.getElementById("hud");
if (!mount || !hudRoot) throw new Error("Missing game container");
try { start(mount, hudRoot); } catch (error) {
  console.error("Could not start the game", error);
  mount.textContent = "The game could not start. Check the browser console for details.";
  mount.style.color = "white";
}
