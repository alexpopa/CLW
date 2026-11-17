import { canPlan, createGame, isUnlocked, researchOffer, simpleAI, step, stormBlock, vultureBlock, INVEST, KEEPERS, MAP, RULES, TICK_RATE, UNITS } from "@lw/sim";
import type { Command, GameState, TimedCommand } from "@lw/sim";
import { Renderer } from "./scene";
import { fieldZ, laneAt } from "./layout";
import { RITE, TAB_KEYS, cardByKey, createHud } from "./hud";
import { Sound } from "./audio";
import { hostedAccounts, matchCredentials, Net } from "./net";

/**
 * Solo: a match vs the autopilot runs the shared sim right here (no server, no account).
 * Online: the match server owns the match; this client sends Commands and replays the server's ticks
 * on its own copy of the sim. Either way: render FROM GameState, send Commands INTO the sim.
 */
const TICK_MS = 1000 / TICK_RATE;
const LANE = MAP.laneLength / 1000;

function start(mount: HTMLElement, hudRoot: HTMLElement): void {
  const view = new Renderer();
  view.init(mount);
  const sound = new Sound();

  let game: GameState = createGame({ teamSize: 1, seed: 1, aiSlots: [1] });
  let soloSize: 1 | 2 | 3 = 1;             // team size of the last solo match, for "March again"
  let teleporting = false;                 // T was pressed: the next click on friendly ground sends the Sexton there
  let running = false, paused = false, speed = 1, ended = false;
  let ME = 0;                              // my player slot (always 0 in solo play)
  let net: Net | null = null;              // set while connected to the match server
  let online = false;                      // the current match is server-run
  let inbox: TimedCommand[][] = [];        // server ticks not yet replayed
  let names: string[] = [];
  let pending: Command[] = [];
  let acc = 0, last = performance.now();
  let selectedUnit: string | null = null, selectedBuilding: number | null = null;
  let tierTab = 1;                         // which tier's cards the bar shows (the mercenaries share the last tier's page)
  let selectedKeeper: 0 | 1 | null = null; // the gravekeeper taking orders; the build menu shows only while one is chosen
  /** Tabs the chosen keeper offers: the Sexton tiers I-III, the Undertaker those plus tier IV and the mercenaries. */
  const tabs = (): number[] => { const k = selectedKeeper === null ? null : KEEPERS[selectedKeeper]; return k ? Array.from({ length: k.maxTier - k.minTier + 1 }, (_, i) => k.minTier + i) : []; };
  let hoverCell: { col: number; row: number; lane: number } | null = null;
  const keys = new Set<string>();
  let mouseX = -1, mouseY = -1, mouseInside = false;

  const me = () => game.players[ME]!;
  const home = () => (me().team === 0 ? 0 : LANE);
  const send = (cmd: Command) => { if (!running || ended) return; if (online) net?.command(cmd); else pending.push(cmd); };
  const begin = (state: GameState, slot: number) => {
    game = state; ME = slot; pending = []; inbox = []; acc = 0; ended = false; running = true; paused = false; speed = online ? 1 : speed;
    selectedUnit = null; selectedBuilding = null; tierTab = 1; selectedKeeper = null; teleporting = false;
    view.reset(); view.layout(state.laneCount); view.lookAt(me().lane, home()); hud.hideOverlay(); sound.play("bell");
    const team = me().team;
    hud.setSide(team, (pics[team] ??= view.portraits(team)));
  };
  const quitOnline = () => { net?.close(); net = null; online = false; };
  /** Connect, then host or join. The lobby and the match arrive as callbacks. */
  let connectionAttempt = 0;
  const goOnline = async (name: string, code: string | null, size: 1 | 2 | 3 = 1) => {
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
    if (!credentials) { hud.clearAccount(); hud.showStart("Sign in to play online."); return; }
    const mine: Net = net = new Net(credentials, code ? { t: "joinLobby", lobbyId: code } : { t: "createLobby", settings: { teamSize: size, aiFill: false } }, {
      lobby: (id, seated, seats) => hud.showLobby(id, seats === 2 ? "Awaiting a challenger" : `${seats / 2}v${seats / 2} · ${seated} of ${seats} seats taken`),
      start: (config, slot, who) => {
        online = true; names = who; begin(createGame(config), slot);
        const foes = game.players.filter(p => p.team !== me().team).map(p => who[p.id] ?? "a stranger");
        hud.toast(`You face ${foes.join(", ")}`);
      },
      tick: (t, cmds) => { if (online && t === game.tick + inbox.length) inbox.push(cmds); },
      left: slot => hud.toast(`${names[slot] ?? "A player"} has left — the autopilot leads their host`),
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
    selectKeeper(slot) {
      selectedKeeper = slot; selectedBuilding = null; teleporting = false; sound.play("click");
      if (!tabs().includes(tierTab)) tierTab = tabs()[0]!; // each keeper has his own tabs
      if (selectedUnit && !tabs().includes(UNITS[selectedUnit]!.tier)) selectedUnit = null;
    },
    selectUnit(id) {
      const p = me(), d = UNITS[id]!;
      if (selectedKeeper === null) return;
      if (d.merc) {
        if (!KEEPERS[selectedKeeper].mercs) deny("Only the Undertaker hires mercenaries");
        else if (game.tick < p.mercReady) deny("The last band is still signing on");
        else if (p.credits < d.cost) deny("Not enough gold");
        else { send({ type: "hire", unit: id }); sound.play("coin"); hud.toast(`${d.name} hired`); }
        return;
      }
      if (!tabs().includes(d.tier)) { deny(`Only the ${KEEPERS.find(q => q.minTier <= d.tier && d.tier <= q.maxTier)!.name} can raise it`); return; }
      if (isUnlocked(p, id)) { selectedUnit = selectedUnit === id ? null : id; selectedBuilding = null; sound.play("click"); return; }
      const offer = researchOffer(p, id);
      if (!offer) deny(`Sealed until ${RITE[d.tier]}`);
      else if (p.research) deny(p.research.unit === id ? "Your scholars are already studying it" : "Your scholars are busy");
      else if (p.credits < offer.cost) deny(`Studying the ${d.name} costs ${offer.cost} gold`);
      else { send({ type: "research", unit: id }); sound.play("study"); hud.toast(`Studying the ${d.name}`); }
    },
    setTier(tier) { if (tabs().includes(tier)) { tierTab = tier; selectedUnit = null; sound.play("click"); } },
    invest(lane = me().lane) {
      if (!running) return;
      if (me().credits < INVEST.cost) deny("Not enough gold");
      else { send({ type: "invest", lane }); sound.play("coin"); }
    },
    research() {
      const next = researchOffer(me());
      if (!next) deny("Every rite is complete");
      else if (me().research) deny(me().research!.unit ? "Your scholars are busy with a study" : "The rite is already under way");
      else if (me().credits < next.cost) deny("Not enough gold");
      else { send({ type: "research" }); sound.play("rite"); }
    },
    storm() {
      const block = stormBlock(game, me());
      if (block === "tier") deny("The storm answers only after The Third Rite");
      else if (block === "resting") deny(`The sky is still resting: ${Math.ceil((me().stormReady - game.tick) / TICK_RATE)}s`);
      else if (block === "gold") deny(`The storm costs ${RULES.stormCost} gold`);
      else send({ type: "storm" });
    },
    vultures() { // no button and no timer for these (owner decision): the key answers or it does not
      if (!running) return;
      const block = vultureBlock(game, me());
      if (block === "tier") deny("The vultures answer only after The Second Rite");
      else if (block === "resting") deny("The vultures have not yet returned");
      else send({ type: "vultures" });
    },
    fog() {
      if (!running) return;
      if (me().fogUsed) deny("The fog comes but once in a war");
      else send({ type: "fog" });
    },
    teleport() { // arm the Sexton's teleport: he is chosen, and the next click on friendly ground (or on the map's ground) sends him
      if (!running) return;
      const slot = selectedKeeper !== null && KEEPERS[selectedKeeper]!.teleport ? selectedKeeper : KEEPERS.findIndex(q => q.teleport) as 0 | 1;
      if (selectedKeeper !== slot) hud.actions.selectKeeper(slot);
      selectedUnit = null; teleporting = true;
    },
    home() { view.lookAt(me().lane, home()); },
    cancel() { if (teleporting) teleporting = false; else if (selectedUnit || selectedBuilding !== null) { selectedUnit = null; selectedBuilding = null; } else selectedKeeper = null; },
    sell() { if (selectedBuilding !== null) { send({ type: "sell", buildingId: selectedBuilding }); selectedBuilding = null; sound.play("coin"); } },
    setSpeed(n) { if (online) return deny("Time cannot be bent in a shared match"); speed = n; paused = false; sound.play("click"); },
    togglePause() { if (online) return deny("A shared match cannot be paused"); paused = !paused; sound.play("click"); },
    toggleMute() { return sound.toggleMute(); },
    panTo(fx, fz) {
      view.panTo(fx, fz);
      if (teleporting) { const [f0, f1] = fieldZ(view.lanes); teleportTo({ x: fx * MAP.laneLength, ...laneAt(f0 + fz * (f1 - f0), view.lanes) }); } // aiming on the map works too
    },
    start(size) {
      sound.start(); quitOnline();
      soloSize = size ?? soloSize;
      // I take the first seat; the autopilot plays my allies and every enemy.
      begin(createGame({ teamSize: soloSize, seed: (Date.now() & 0x7fffffff) || 1, aiSlots: Array.from({ length: soloSize * 2 - 1 }, (_, i) => i + 1) }), 0);
    },
    hostOnline(name, size) { goOnline(name, null, size); },
    joinOnline(name, code) { goOnline(name, code); },
    startOnlineNow() { net?.startNow(); },
    menu() { connectionAttempt++; quitOnline(); running = false; hud.showStart(); },
  }, hostedAccounts);
  addEventListener("resize", () => view.resize());
  view.camX = 0; view.clampCam();
  hud.showStart();
  if (hostedAccounts) {
    fetch("/me", { cache: "no-store" }).then(async response => {
      if (response.ok) {
        const user = await response.json();
        if (!running && connectionAttempt === 0) hud.showStart(undefined, user);
      }
    }).catch(() => {});
  }

  // ---- input ----
  const canvas = view.canvas;
  let down: { x: number; y: number; camX: number; camZ: number; moved: boolean } | null = null;
  /** The cell of my side's building ground under the pointer, in whichever lane that is. */
  const cellUnder = (e: PointerEvent) => { const w = view.pick(e.clientX, e.clientY), c = w && view.cellAt(me().team, w.x, w.y); return w && c ? { ...c, lane: w.lane } : null; };
  // fingers on the glass: one drags the view (or taps), two pinch it nearer or farther
  const fingers = new Map<number, { x: number; y: number }>();
  let pinch: { span: number; zoom: number } | null = null, pinched = false, touching = false;
  // a dragged view keeps gliding when the finger lifts, and slows to a stop
  let fling: { vx: number; vz: number } | null = null, lastMove = { t: 0, camX: 0, camZ: 0, vx: 0, vz: 0 };
  const span = () => { const [a, b] = [...fingers.values()]; return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 1; };
  addEventListener("pointerdown", e => { touching = e.pointerType !== "mouse"; if (touching) mouseInside = false; }, true);
  document.addEventListener("gesturestart", e => e.preventDefault()); // Safari's own page zoom
  canvas.addEventListener("pointerdown", e => {
    fling = null;
    if (e.pointerType !== "mouse") { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (fingers.size === 2) { pinch = { span: span(), zoom: view.zoom }; pinched = true; down = null; return; } }
    if (e.button === 0) { down = { x: e.clientX, y: e.clientY, camX: view.camX, camZ: view.camZ, moved: false }; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener("pointercancel", e => { fingers.delete(e.pointerId); pinch = null; down = null; if (!fingers.size) pinched = false; });
  canvas.addEventListener("pointermove", e => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && fingers.size === 2) { view.setZoom((pinch.zoom * pinch.span) / span()); return; }
    if (down) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) down.moved = true;
      if (down.moved) {
        view.camX = down.camX - (e.clientX - down.x) * view.unitsPerPixel(); view.camZ = down.camZ - (e.clientY - down.y) * view.unitsPerPixel() * 1.3; view.clampCam();
        const t = performance.now(), gap = t - lastMove.t;
        if (gap > 0 && gap < 120) lastMove = { t, camX: view.camX, camZ: view.camZ, vx: 0.6 * (view.camX - lastMove.camX) / gap + 0.4 * lastMove.vx, vz: 0.6 * (view.camZ - lastMove.camZ) / gap + 0.4 * lastMove.vz };
        else lastMove = { t, camX: view.camX, camZ: view.camZ, vx: 0, vz: 0 };
      }
      if (e.pointerType !== "mouse") return; // a dragging finger has no cursor to place under
    }
    hoverCell = cellUnder(e);
  });
  type Spot = { x: number; y: number; lane: number };
  /** Send the chosen keeper walking to a point on the ground (the sim keeps him on the building ground). */
  const walkTo = (w: Spot) => { if (selectedKeeper === null) return; send({ type: "move", keeper: selectedKeeper, x: Math.round(w.x), y: Math.round(w.y), lane: w.lane }); selectedUnit = null; sound.play("click"); };
  /** The Sexton steps through the grave to that spot (any lane of my side's ground). */
  const teleportTo = (w: Spot) => {
    const slot = selectedKeeper ?? KEEPERS.findIndex(k => k.teleport) as 0 | 1;
    teleporting = false;
    send({ type: "teleport", keeper: slot, x: Math.round(w.x), y: Math.round(w.y), lane: w.lane }); sound.play("raise");
  };
  canvas.addEventListener("pointerup", e => {
    const wasDrag = down?.moved; down = null;
    fingers.delete(e.pointerId); pinch = null;
    if (e.pointerType !== "mouse") hoverCell = null; // no cursor to follow
    if (pinched) { if (!fingers.size) pinched = false; return; } // a pinch is never a tap
    if (wasDrag && e.pointerType !== "mouse" && performance.now() - lastMove.t < 80 && Math.hypot(lastMove.vx, lastMove.vz) > 0.004) fling = { vx: lastMove.vx, vz: lastMove.vz };
    if (e.button !== 0 || wasDrag || !running) return;
    const w = view.pick(e.clientX, e.clientY), cell = w && view.cellAt(me().team, w.x, w.y);
    if (teleporting) { if (w) teleportTo(w); return; }
    const F = MAP.footprint;
    // clicking a gravekeeper chooses him, unless a chantry is being placed right there
    const near = w && !selectedUnit ? game.keepers.filter(k => k.owner === ME && k.lane === w.lane).map(k => ({ k, d: Math.hypot(k.x - w.x, k.y - w.y) })).sort((a, b) => a.d - b.d)[0] : undefined;
    if (near && near.d < 1700) { hud.actions.selectKeeper(near.k.slot); return; }
    const existing = w && cell && game.buildings.find(b => b.team === me().team && b.lane === w.lane
      && cell.at.col >= b.col && cell.at.col < b.col + F && cell.at.row >= b.row && cell.at.row < b.row + F);
    if (existing) { selectedBuilding = existing.owner === ME ? existing.id : null; selectedUnit = null; sound.play("click"); }
    else if (w && cell && selectedUnit && selectedKeeper !== null) {
      const k = game.keepers.find(q => q.owner === ME && q.slot === selectedKeeper);
      if (me().credits < UNITS[selectedUnit]!.cost) deny("Not enough gold");
      else if (!canPlan(game, me().team, w.lane, cell.col, cell.row)) deny("No room there");
      else if (k && k.jobs.length >= 8) deny("He has enough to do already");
      else { send({ type: "build", keeper: selectedKeeper, unit: selectedUnit, col: cell.col, row: cell.row, lane: w.lane }); sound.play("click"); }
    } else if (w && selectedKeeper !== null && !selectedUnit && selectedBuilding === null) walkTo(w);
    else selectedBuilding = null;
  });
  // right-click: stop placing or aiming, or send the chosen keeper walking
  canvas.addEventListener("contextmenu", e => {
    e.preventDefault();
    const w = view.pick(e.clientX, e.clientY);
    if (teleporting) teleporting = false;
    else if (selectedUnit || selectedBuilding !== null) { selectedUnit = null; selectedBuilding = null; }
    else if (w && running) walkTo(w);
  });
  // the wheel scrolls along the lanes; with several lanes, a vertical wheel moves across them and shift (or a sideways wheel) along
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (e.ctrlKey) { view.setZoom(view.zoom * (1 + Math.max(-0.5, Math.min(0.5, e.deltaY * 0.01)))); return; } // a trackpad pinch
    const k = view.unitsPerPixel();
    if (view.lanes > 1 && !e.shiftKey) { view.camX += e.deltaX * k; view.camZ += e.deltaY * k; } else view.camX += (e.deltaX + e.deltaY) * k;
    view.clampCam();
  }, { passive: false });
  addEventListener("mousemove", e => { if (touching) return; mouseX = e.clientX; mouseY = e.clientY; mouseInside = true; }); // a finger never pushes the screen edge
  document.addEventListener("mouseleave", () => { mouseInside = false; });
  addEventListener("blur", () => { keys.clear(); mouseInside = false; });
  addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  addEventListener("keydown", e => {
    // letters and digits by where the key sits, so the card block is the same hand shape on any layout and Shift does not change it
    const k = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key.toLowerCase();
    if (e.target instanceof HTMLInputElement) return; // typing a name or a code
    keys.add(e.key.toLowerCase());
    if (e.repeat || !running || e.metaKey || e.ctrlKey || e.altKey) return;
    const id = cardByKey(tierTab, k), tab = TAB_KEYS.indexOf(k);
    let open = tabs();
    if (k === "1" || k === "2") hud.actions.selectKeeper(k === "1" ? 0 : 1);
    else if (id) { // Q W E R and A S D F pick, study or hire the cards of the shown tab; with nobody chosen, the keeper who can raise it steps up
      if (selectedKeeper === null) hud.actions.selectKeeper(Math.max(0, KEEPERS.findIndex(q => (UNITS[id]!.merc ? q.mercs : q.minTier <= UNITS[id]!.tier && UNITS[id]!.tier <= q.maxTier))) as 0 | 1);
      hud.actions.selectUnit(id);
    }
    else if (tab >= 0) { // Z X C: the chosen keeper's tabs in order (the Sexton's, if nobody is chosen)
      if (selectedKeeper === null) { hud.actions.selectKeeper(0); open = tabs(); }
      if (open[tab]) hud.actions.setTier(open[tab]!);
    }
    else if (k === "tab") { e.preventDefault(); if (open.length) hud.actions.setTier(open[(open.indexOf(tierTab) + (e.shiftKey ? open.length - 1 : 1)) % open.length]!); }
    else if (k === "3") hud.actions.invest();
    else if (k === "4") hud.actions.research();
    else if (k === "5") hud.actions.storm();
    else if (k === "6") hud.actions.fog();
    else if (k === "0") hud.actions.vultures();
    else if (k === "delete" || k === "backspace") hud.actions.sell();
    else if (k === "t") hud.actions.teleport();
    else if (k === "escape") hud.actions.cancel();
    else if (k === "p") hud.actions.togglePause();
    else if (k === " ") { e.preventDefault(); hud.actions.home(); }
  });

  /** One solo tick: my queued commands plus the autopilot's. */
  const tick = (now: number) => {
    const cmds: TimedCommand[] = pending.map(cmd => ({ player: ME, cmd }));
    pending = [];
    for (const p of game.players) if (p.isAI) for (const cmd of simpleAI(game, p.id)) cmds.push({ player: p.id, cmd });
    apply(cmds, now);
  };
  /** Advance the sim one tick with these commands, then hand the events to the view and the sound. */
  const apply = (cmds: TimedCommand[], now: number) => {
    view.snapshot(game);
    step(game, cmds);
    view.addEvents(game, game.events, now);
    sound.events(game.events, view.camX, me().team);
    for (const e of game.events) {
      if (e.t === "researched" && e.player === ME) {
        if (e.unit) hud.toast(`${UNITS[e.unit]!.name} studied — its chantry may now be raised`);
        else { hud.toast(`${RITE[e.tier]} is complete — choose what to study`); if (tabs().includes(e.tier)) tierTab = e.tier; }
        sound.play("capture");
      }
      else if (e.t === "storm") hud.toast(e.player === ME ? "The storm answers you" : e.team === me().team ? `${names[e.player] ?? "An ally"} calls the Storm of Wrath` : "The enemy calls the Storm of Wrath on your host");
      else if (e.t === "fog") hud.toast(e.player === ME ? "The fog rolls out of your cathedral" : e.team === me().team ? `${names[e.player] ?? "An ally"} calls the Deadly Fog` : "The enemy calls the Deadly Fog: nothing that enters it lives");
      else if (e.t === "razed" && e.owner === ME) hud.toast(`Your ${UNITS[e.unit]!.name} chantry has been razed`);
      else if (e.t === "capture") hud.toast(e.team === me().team ? "Shrine claimed" : "Shrine lost");
    }
  };

  // ---- main loop ----
  let hudTurn = false; // on touch devices the HUD is refreshed every other frame: the frame time goes to the picture
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(100, now - last); last = now;
    let pan = 0, panZ = 0;
    if (keys.has("arrowleft")) pan -= 1;
    if (keys.has("arrowright")) pan += 1;
    if (keys.has("arrowup")) panZ -= 1;
    if (keys.has("arrowdown")) panZ += 1;
    if (mouseInside && !down) {
      if (pan === 0) { if (mouseX <= 6) pan = -1; else if (mouseX >= innerWidth - 6) pan = 1; }
      if (panZ === 0) { if (mouseY <= 6) panZ = -1; else if (mouseY >= innerHeight - 6) panZ = 1; }
    }
    if (pan || panZ) { view.camX += pan * dt * 0.1; view.camZ += panZ * dt * 0.07; view.clampCam(); }
    if (fling) {
      view.camX += fling.vx * dt; view.camZ += fling.vz * dt; view.clampCam();
      const keep = Math.exp(-dt / 300); fling.vx *= keep; fling.vz *= keep;
      if (Math.hypot(fling.vx, fling.vz) < 0.002) fling = null;
    }

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
        view.camX = won ? LANE - home() : home(); view.camZ = (view.lanes - 1) * 16 + 12; view.clampCam();
        sound.play(won ? "victory" : "defeat");
        hud.showEnd(won, game, online);
        quitOnline();
      }
    }
    if (selectedBuilding !== null && !game.buildings.some(b => b.id === selectedBuilding)) selectedBuilding = null;
    view.draw(game, { selectedKeeper, selectedUnit, hoverCell, selectedBuilding, me: ME }, paused || ended ? 1 : Math.min(1, acc / TICK_MS), now, dt);
    if ((hudTurn = !hudTurn) || !touching) hud.update(game, { me: ME, keeper: selectedKeeper, tier: tierTab, selectedUnit, selectedBuilding, speed, paused, teleport: teleporting, camRect: view.viewRect(), names: online ? names : [] });
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
