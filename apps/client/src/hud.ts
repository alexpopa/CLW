import type { UserIdentity } from "@lw/protocol";
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "@fontsource/unifrakturcook/700.css";
import "./hud.css";
import { INVEST, KEEPERS, LANE_WIDTH, MAP, MAX_TIER, MERC_ORDER, RULES, TICK_RATE, UNITS, UNIT_ORDER, UNIT_RESEARCH, beaconsHeld, hqMax, hqX, incomeOf, investBonus, isUnlocked, researchOffer, sellRefund, fogFront, stormBlock, unitsOfTier } from "@lw/sim";
import type { GameState, PlayerState } from "@lw/sim";
import { TEAM } from "./models";
import { LANE_GAP, LANE_PITCH, LANE_W, fieldZ } from "./layout";

/** DOM overlay. Reads GameState, raises intents through callbacks. No rules here. */
export interface HudActions {
  selectKeeper(slot: 0 | 1): void;            // choose which gravekeeper takes the orders
  selectUnit(id: string): void;               // pick it for building, study it if it is not yet known, or hire it if it is a mercenary band
  setTier(tier: number): void;                // show that tier's cards
  invest(lane?: number): void;                // raise the tithe on that lane (my own if not given)
  research(): void;
  storm(): void;                              // call the Storm of Wrath
  vultures(): void;                           // send the Ossuary Vultures down the Sexton's lane (no button on a desktop: 0)
  fog(): void;                                // call the Deadly Fog down the lane in view
  teleport(): void;                           // arm the Sexton's teleport
  home(): void;                               // look at my own cathedral
  cancel(): void;                             // back out one step (what Esc does)
  sell(): void;
  setSpeed(n: number): void;
  togglePause(): void;
  toggleMute(): boolean;
  panTo(fx: number, fz: number): void;        // centre the camera on this point of the minimap (fractions of the whole field)
  start(size?: 1 | 2 | 3): void;              // solo match: the autopilot fills every other seat (no size = the same as last time)
  hostOnline(name: string, size: 1 | 2 | 3): void;
  joinOnline(name: string, code: string): void;
  startOnlineNow(): void;                     // host: stop waiting, play the autopilot on the server
  menu(): void;                               // leave any lobby and return to the title screen
}
export interface HudView { me: number; keeper: 0 | 1 | null; tier: number; selectedUnit: string | null; selectedBuilding: number | null; speed: number; paused: boolean;
  fogLane: number;                            // the lane the Deadly Fog would roll down: the one in view
  teleport: boolean;                          // the Sexton's teleport is armed: the next click on friendly ground sends him there
  camRect: [number, number, number, number];  // the part of the field on screen, as fractions [x0, x1, z0, z1]
  names: string[] }                           // display name per seat (online), empty in solo play

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const secs = (ticks: number) => Math.ceil(ticks / TICK_RATE);
const ROMAN = ["", "I", "II", "III", "IV"];
export const RITE = ["", "", "The Second Rite", "The Third Rite", "The Fourth Rite"];
/** The tab after the last tier holds the mercenaries. */
/** The mercenaries share the page of the last tier: the Undertaker's one page, great chantries above and bands for hire below. */
export const MERC_TAB = MAX_TIER;
const TABS = Array.from({ length: MAX_TIER }, (_, i) => i + 1);
/** The cards of one tab, in menu order. */
export const tabUnits = (tab: number): string[] => (tab === MERC_TAB ? [...unitsOfTier(tab), ...MERC_ORDER] : unitsOfTier(tab));
/** Cards sit in two staggered rows that mirror the keyboard: the first on Q W E R T, the second under it on A S D F G. */
const ROW_KEYS = ["qwert", "asdfg"];
export const cardSlot = (tab: number, i: number): { row: number; col: number; key: string } => {
  const n = tabUnits(tab).length, per = n > 5 ? Math.ceil(n / 2) : n, row = i < per ? 0 : 1, col = row ? i - per : i;
  return { row, col, key: ROW_KEYS[row]![col] ?? "" };
};
export const cardByKey = (tab: number, key: string): string | undefined => tabUnits(tab).find((_, i) => cardSlot(tab, i).key === key);
/** The bottom letter row picks the chosen keeper's tabs, in order. */
export const TAB_KEYS = ["z", "x", "c"];
const tabOf = (id: string): number => (UNITS[id]!.merc ? MERC_TAB : UNITS[id]!.tier);

function statLine(id: string): string {
  const d = UNITS[id]!;
  const rate = d.heal > 0 ? `Mends ${Math.round((d.heal * TICK_RATE) / d.interval)}/s` : d.damage === 0 ? "Does not fight"
    : `Damage ${Math.round((d.damage * TICK_RATE) / d.interval)}/s${d.splash || d.line || d.chain ? " to many" : ""}`;
  const tags = [d.flying ? "Flies" : "", d.damage > 0 ? (d.air ? "Strikes ground and air" : "Strikes ground only") : "", d.count ? `${d.count} per wave` : ""].filter(Boolean);
  return `Health ${d.hp} · ${rate} · Reach ${d.range / 1000}${d.armor ? ` · Armor ${d.armor}` : ""}${tags.length ? `<br>${tags.join(" · ")}` : ""}`;
}
/** "Name: text" → the ability line of a tooltip, one line per ability. */
const abilityLines = (id: string): string => UNITS[id]!.ability.split(/(?<=\.) (?=[A-Z][A-Za-z ]+:)/).map(a => {
  const i = a.indexOf(":"); return `<p class="ability"><b>${a.slice(0, i)}.</b>${a.slice(i + 1)}</p>`;
}).join("");

export function createHud(root: HTMLElement, portraits: Record<string, string>, act: HudActions, hostedAccounts = false) {
  root.innerHTML = `
  <div id="top">
    <div class="purse"><div class="coin"></div><div><div id="credits" class="num">0</div><div id="incomeLine"><span id="income" class="num">+0</span> gold in <span id="incomeIn">0</span>s</div></div></div>
    <div class="midcol">
      <div class="duel">
        <div class="hp me"><div class="cap"><span>Your cathedral</span><b id="hq0t" class="num"></b></div><div class="glass"><i id="hq0"></i></div></div>
        <div id="bell" title="Time until every building musters its next unit"><span id="waveIn" class="num">30</span><small class="cap">next wave</small></div>
        <div class="hp foe"><div class="cap"><span>Enemy cathedral</span><b id="hq1t" class="num"></b></div><div class="glass"><i id="hq1"></i></div></div>
      </div>
    </div>
    <div class="tools"><span id="clock" class="num">0:00</span><button id="pause" title="Pause (P)">❚❚</button>${[1, 2, 4].map(n => `<button data-speed="${n}" title="Game speed ×${n}">${ROMAN[n]}</button>`).join("")}<button id="mute" title="Sound">♪</button></div>
  </div>
  <div id="dock">
  <div id="tip"></div>
  <div id="touchbar"><button id="tbVult">Vultures</button><button id="tbTele">Teleport</button><button id="tbHome">Cathedral</button><button id="tbCancel">Cancel</button></div>
  <div id="bar">
    <div id="keepers">${KEEPERS.map((k, i) => `<button class="keeper" data-keeper="${i}" aria-label="${k.name}"><img src="${portraits[k.id] ?? ""}" alt=""><span class="key">${i + 1}</span><b>${k.name}</b></button>`).join("")}</div>
    <div id="build">
      <div id="tiers">${TABS.map(t => `<button class="tier" data-tier="${t}" title="Tier ${ROMAN[t]} units"><b>${ROMAN[t]}</b><small></small></button>`).join("")}</div>
      <div id="cards" data-tier="1">${[...UNIT_ORDER, ...MERC_ORDER].map(id => ({ id, at: cardSlot(tabOf(id), tabUnits(tabOf(id)).indexOf(id)) })).map(({ id, at }) => `
        <button class="card${at.row ? " low" : ""}" style="grid-row:${at.row + 1};grid-column:${at.col + 1}" data-unit="${id}" data-tier="${tabOf(id)}" aria-label="${UNITS[id]!.name}"><span class="frame"></span><span class="glassp"></span><img src="${portraits[id] ?? ""}" alt="">
          <i class="prog"></i><span class="seal"></span>
          <span class="plaque"><span class="key">${at.key.toUpperCase()}</span><span class="cost num"></span></span></button>`).join("")}</div>
    </div>
    <div class="rule"></div>
    <div id="acts">
      <button class="act" id="invest"><span class="key"><b>3</b></span><strong><span>Raise the tithe</span><span class="num" id="investC"></span></strong><em id="investT"></em></button>
      <button class="act" id="research"><span class="key"><b>4</b></span><strong><span id="researchH">The Second Rite</span><span class="num" id="researchC"></span></strong><em id="researchT"></em><i class="fill" id="researchBar"></i></button>
      <button class="act" id="storm"><span class="key"><b>5</b></span><strong><span>Storm of Wrath</span><span class="num" id="stormC"></span></strong><em id="stormT"></em><i class="fill" id="stormBar"></i></button>
      <button class="act" id="fog"><span class="key"><b>6</b></span><strong><span>Deadly Fog</span><span class="num">Once</span></strong><em id="fogT"></em><i class="fill" id="fogBar"></i></button>
    </div>
  </div>
  </div>
  <div id="mapbox"><div id="titheL"></div><canvas id="minimap" title="Click or drag to look there"></canvas></div>
  <div id="toast"></div>
  <div id="overlay"></div>`;

  let hover: string | null = null; // unit id, "invest", "research" or "keeper0" / "keeper1" (a mouse only: fingers do not hover)
  let peek: string | null = null;  // touch: the card whose notes are open, waiting for a second tap to study or hire it
  let me: PlayerState | null = null;
  // Fingers or a mouse: whichever was used last. Touch gets its own buttons, no hovering, and a look before it spends gold.
  let touch = matchMedia("(pointer:coarse)").matches;
  root.classList.toggle("touch", touch);
  addEventListener("pointerdown", e => { touch = e.pointerType !== "mouse"; root.classList.toggle("touch", touch); if (touch) hover = null; }, true);
  const hovers = (el: HTMLElement, what: string) => {
    el.onpointerenter = e => { if (e.pointerType === "mouse") hover = what; };
    el.onpointerleave = () => { hover = null; };
  };
  root.querySelectorAll<HTMLButtonElement>(".keeper").forEach(b => {
    b.onclick = () => { peek = null; act.selectKeeper(Number(b.dataset.keeper) as 0 | 1); };
    hovers(b, `keeper${b.dataset.keeper}`);
  });
  root.querySelectorAll<HTMLButtonElement>(".card").forEach(b => {
    const id = b.dataset.unit!;
    b.onclick = () => {
      // a card that costs gold the moment it is pressed (a study, a hiring) first shows what it is
      if (touch && me && (UNITS[id]!.merc || !isUnlocked(me, id)) && peek !== id) { peek = id; return; }
      peek = null; act.selectUnit(id);
    };
    hovers(b, id);
  });
  for (const id of ["invest", "research", "storm", "fog"]) hovers($(id), id);
  root.querySelectorAll<HTMLButtonElement>(".tier").forEach(b => { b.onclick = () => { peek = null; act.setTier(Number(b.dataset.tier)); }; });
  $("tbVult").onclick = () => act.vultures();
  $("titheL").onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-lane]"); if (b) act.invest(Number(b.dataset.lane)); };
  $("titheL").addEventListener("pointerover", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-lane]"); if (b && e.pointerType === "mouse") hover = `tithe${b.dataset.lane}`; });
  $("titheL").addEventListener("pointerout", () => { if (hover?.startsWith("tithe")) hover = null; });
  $("tbTele").onclick = () => { peek = null; act.teleport(); };
  $("tbHome").onclick = () => act.home();
  $("tbCancel").onclick = () => { if (peek) peek = null; else act.cancel(); };
  root.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach(b => { b.onclick = () => act.setSpeed(Number(b.dataset.speed)); });
  $("pause").onclick = () => act.togglePause();
  $("mute").onclick = () => { $("mute").classList.toggle("on", !act.toggleMute()); };
  $("mute").classList.add("on");
  $("invest").onclick = () => act.invest();
  $("research").onclick = () => act.research();
  $("storm").onclick = () => act.storm();
  $("fog").onclick = () => act.fog();
  $("tip").onclick = e => {
    const id = (e.target as HTMLElement).id;
    if (id === "sell") act.sell();
    else if (peek) { const unit = peek; peek = null; if (id === "confirm") act.selectUnit(unit); } // anywhere else on the note closes it
  };

  const mini = $<HTMLCanvasElement>("minimap");
  const pan = (e: PointerEvent) => { const r = mini.getBoundingClientRect(); act.panTo((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
  mini.onpointerdown = e => { mini.setPointerCapture(e.pointerId); pan(e); };
  mini.onpointermove = e => { if (e.buttons & 1) pan(e); };

  let toastTimer = 0;
  const set = (id: string, text: string) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
  const tip = (markup: string | null) => {
    const el = $("tip");
    if (markup && touch) markup = markup.replace(/Esc or right-click to cancel\./, "Cancel stops it.").replace(/ Esc to cancel\./, "").replace(/Right-click sends him walking/, "With no unit chosen, a tap on the ground sends him walking")
      .replace(/Press \d or click him/, "Tap him").replace(/Press T, then click,/, "Tap Teleport, then the ground,").replace(/ \(or Shift\+3\)/, "").replace(/ \(Del\)/, "").replace(/\bClick\b/g, "Tap").replace(/\bclick\b/g, "tap").replace(/\bclicking\b/g, "tapping");
    el.classList.toggle("show", !!markup);
    if (markup && el.dataset.m !== markup) { el.dataset.m = markup; el.innerHTML = markup; }
  };

  /** The whole battlefield from above: every lane, its shrines, towers, armies and keepers, and a frame for what the screen shows. */
  function drawMinimap(s: GameState, v: HudView): void {
    const [f0, f1] = fieldZ(s.laneCount), depth = f1 - f0;
    const w = mini.clientWidth, want = Math.round(Math.min(190, 30 + 46 * s.laneCount) * Math.min(1, w / 220)), dpr = devicePixelRatio || 1;
    if (mini.clientHeight !== want) mini.style.height = `${want}px`;
    const h = want;
    if (mini.width !== Math.round(w * dpr) || mini.height !== Math.round(h * dpr)) { mini.width = Math.round(w * dpr); mini.height = Math.round(h * dpr); }
    const c = mini.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (x: number) => (x / MAP.laneLength) * w, Z = (lane: number, y: number) => ((lane * LANE_PITCH + y / 1000 - f0) / depth) * h;
    const col = (team: number) => TEAM[team as 0 | 1].css, me = s.players[v.me]!;
    c.fillStyle = "#0a090e"; c.fillRect(0, 0, w, h);
    const zw = MAP.zoneCols * MAP.cell, laneH = (LANE_W / depth) * h;
    for (let l = 0; l < s.laneCount; l++) {
      const top = Z(l, 0);
      c.fillStyle = l === me.lane ? "#24222e" : "#1b1a22"; c.fillRect(0, top, w, laneH);
      for (const team of [0, 1] as const) { c.globalAlpha = 0.25; c.fillStyle = col(team); c.fillRect(X(team === 0 ? MAP.zoneStart : MAP.laneLength - MAP.zoneStart - zw), top, X(zw), laneH); }
      c.globalAlpha = 1;
    }
    for (const team of [0, 1] as const) { c.fillStyle = col(team); c.fillRect(X(hqX(team)) - 4, (LANE_GAP / 2 / depth) * h, 8, h - (LANE_GAP / depth) * h); }
    for (const b of s.beacons) {
      c.fillStyle = b.owner === null ? "#8a8474" : col(b.owner);
      c.save(); c.translate(X(b.x), Z(b.lane, LANE_WIDTH / 2)); c.rotate(Math.PI / 4); c.fillRect(-4, -4, 8, 8); c.restore();
    }
    for (const f of s.fogs) { // the bank itself, as far as it has rolled
      const front = fogFront(s, f), x = f.team === 0 ? 0 : MAP.laneLength - front;
      c.globalAlpha = 0.45; c.fillStyle = "#7dffa0"; c.fillRect(X(x), Z(f.lane, 0), X(front), laneH); c.globalAlpha = 1;
    }
    for (const u of s.units) {
      c.fillStyle = col(u.team);
      const x = X(u.x), z = Z(u.lane, u.y);
      if (UNITS[u.type]!.structure) { c.fillRect(x - 2, z - 3, 4, 6); c.strokeStyle = "#e2d7bc"; c.lineWidth = 1; c.strokeRect(x - 2, z - 3, 4, 6); }
      else c.fillRect(x - 1, z - 1, 2.5, 2.5);
    }
    for (const k of s.keepers) { // mine are bright, allies' dimmer
      if (k.team !== me.team) continue;
      c.fillStyle = k.owner === v.me ? "#8dffb0" : "#5a9a70";
      c.beginPath(); c.arc(X(k.x), Z(k.lane, k.y), k.owner === v.me ? 3 : 2, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = "#e2d7bc"; c.lineWidth = 1.5;
    const [x0, x1, z0, z1] = v.camRect;
    c.strokeRect(x0 * w + 0.75, z0 * h + 0.75, Math.max(4, (x1 - x0) * w - 1.5), Math.max(4, (z1 - z0) * h - 1.5));
  }

  let menuRender = 0;
  let size: 1 | 2 | 3 = 1; // team size chosen on the title screen
  let account: UserIdentity | undefined;
  return {
    actions: act,
    toast(msg: string): void {
      const el = $("toast"); el.textContent = msg; el.classList.add("show");
      clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove("show"), 2600);
    },
    clearAccount(): void { account = undefined; },
    showStart(notice?: string, user?: UserIdentity): void {
      if (user) account = user;
      user = account;
      const render = ++menuRender;
      $("overlay").className = "show";
      $("overlay").innerHTML = `<div class="panel"><h1>Gravemarch</h1><div class="sub">A war of lines</div><div class="orn"></div>
        <details class="rules"><summary>How to play</summary><dl>
          <dt>Gravekeepers</dt><dd>Your two gravekeepers do the building. Press 1 for the Sexton or 2 for the Undertaker (or click them), choose a unit with its letter (the cards sit like the keys: Q W E R above, A S D F below; Z X C switch the Sexton's tier), then click your ground: he walks there and the chantry stands at once. Keep clicking to queue more. Right-click sends him walking. The Sexton raises tiers I to III; the Undertaker raises tier IV and hires mercenaries, with a short wait between bands.</dd>
          <dt>Muster</dt><dd>Every chantry sends its soldier at each toll of the bell, for the rest of the war. Mercenaries are hired once: they fight as far as the middle shrine and leave.</dd>
          <dt>Shrines</dt><dd>You begin with the shrine nearest your cathedral, guarded by two towers. Claim the others by marching over them; the enemy home shrine falls only after both its towers, and two more towers guard each base. Each shrine you hold pays gold.</dd>
          <dt>Study</dt><dd>You begin knowing three units. Click any other card of an open tier to study it; your scholars learn one thing at a time. The Rites (4) open the higher tiers (Z X C or Tab to browse them), whose units must each be studied in turn.</dd>
          <dt>Counters</dt><dd>Every unit has its own gift and its own bane: flyers shrug off swords, fire clears swarms, lanterns unmask shades. Hover a card to read it.</dd>
          <dt>Storm</dt><dd>Once The Third Rite is done you may call the Storm of Wrath (5): for a price, lightning strikes every enemy soldier on the field for ten seconds. Then the sky must rest.</dd>
          <dt>Vultures</dt><dd>Once The Second Rite is done, 0 sends the Ossuary Vultures: two carrion birds fly the lane your Sexton stands in, from your home shrine to the enemy's, dropping skull urns that burst over a wide ground. They cost nothing, cannot be harmed, and need a long rest between flights.</dd>
          <dt>Fog</dt><dd>Once in the whole war you may call the Deadly Fog (6). It costs nothing: it rolls slowly out of your cathedral, halfway to the middle shrine, and every enemy soldier it touches dies. In team games it rolls down the lane you are looking at.</dd>
          <dt>Tithe</dt><dd>Raise the tithe (3) to earn more from every shrine your side holds in a lane. Every level costs the same and you may raise it as often as you can pay. The plus beside each lane of the map raises it on that lane, your own or an ally's; it only ever raises your own income.</dd>
          <dt>Team games</dt><dd>In 2v2 and 3v3 every player has a lane, and all share one cathedral. Your keepers may build in any lane of your side: the Undertaker walks there, the Sexton steps through the grave (T, then click the ground or the map).</dd>
          <dt>Survey</dt><dd>Drag, scroll, use the arrow keys, or click the map in the corner. Space returns to your cathedral.</dd>
          <dt>Touch</dt><dd>Drag to look around and pinch to zoom. Tap a keeper, a card, then your ground. A card that costs gold at once shows its notes first: tap again to pay. Teleport, Cathedral and Cancel sit above the bar.</dd>
          <dt>Victory</dt><dd>Bring down the enemy cathedral at the far end of the lane.</dd>
        </dl></details>
        <div class="sizes" role="group" aria-label="Team size">${([1, 2, 3] as const).map(n => `<button class="ghost size${n === size ? " on" : ""}" data-size="${n}">${n}v${n}<small>${n === 1 ? "one lane" : `${n} lanes`}</small></button>`).join("")}</div>
        <button id="startBtn">Play singleplayer</button>
        <div class="sub fill" id="fillNote"></div>
        <div class="online"><div class="sub">Multiplayer</div>
          ${hostedAccounts && !user ? `<form id="rgbLogin" class="rgb-login" method="post" action="/auth/challenge">
            <label>Email<input name="email" type="email" autocomplete="username" maxlength="320" required></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
            <button type="submit" class="ghost">Sign in with RGBoner</button>
            <a class="rgb-register" href="https://retrogameboner.com/login?mode=register" target="_blank" rel="noopener noreferrer">Create an RGBoner account</a>
          </form>` : `
          ${user ? '<div class="row"><span id="rgbPlayer"></span><form method="post" action="/auth/logout"><button class="ghost">Sign out</button></form></div>' : ""}
          <div class="row">${hostedAccounts ? "" : '<input id="olName" maxlength="20" placeholder="Your name" autocomplete="off" spellcheck="false">'}
            <button id="olHost" class="ghost">Host a match</button>
            <input id="olCode" maxlength="4" placeholder="Code" autocomplete="off" spellcheck="false">
            <button id="olJoin" class="ghost">Join</button></div>`}
          <div id="olMsg" role="status"></div></div></div>`;
      $("startBtn").onclick = () => act.start(size);
      const note = () => { $("fillNote").textContent = size === 1 ? "You against the autopilot" : `You, ${size - 1} allied ${size === 2 ? "autopilot" : "autopilots"} and ${size} against you`; };
      root.querySelectorAll<HTMLButtonElement>(".size").forEach(b => { b.onclick = () => {
        size = Number(b.dataset.size) as 1 | 2 | 3;
        root.querySelectorAll(".size").forEach(o => o.classList.toggle("on", o === b)); note();
      }; });
      note();
      const msg = $("olMsg");
      msg.textContent = notice ?? "";
      if (hostedAccounts && !user) {
        const form = $<HTMLFormElement>("rgbLogin");
        const button = form.querySelector("button")!;
        const overlay = $("overlay");
        const visible = () => menuRender === render && overlay.classList.contains("show") && form.isConnected;
        form.onsubmit = async event => {
          event.preventDefault();
          button.disabled = true;
          msg.textContent = "Signing in…";
          const data = new FormData(form);
          try {
            const flow = await fetch("/auth/challenge", { method: "POST" });
            if (!flow.ok) throw new Error("Sign-in is temporarily unavailable.");
            const { endpoint, challenge } = await flow.json();
            const response = await fetch(endpoint, {
              method: "POST", credentials: "omit", redirect: "error",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: data.get("email"), password: data.get("password"), challenge }),
            });
            if (!response.ok) {
              const result = await response.json().catch(() => null);
              throw new Error(result?.error ?? "Sign-in is temporarily unavailable.");
            }
            const { assertion } = await response.json();
            const complete = await fetch("/auth/complete", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assertion }),
            });
            if (!complete.ok) throw new Error("Could not complete sign-in. Try again.");
            const account = await fetch("/me", { cache: "no-store" });
            if (!account.ok) throw new Error("Could not load your account. Try again.");
            const player: UserIdentity = await account.json();
            if (visible()) this.showStart(undefined, player);
          } catch (error) {
            if (visible()) msg.textContent = error instanceof Error ? error.message : "Sign-in is temporarily unavailable.";
          } finally {
            button.disabled = false;
          }
        };
        return;
      }
      if (user) $("rgbPlayer").textContent = user.displayName;
      const name = root.querySelector<HTMLInputElement>("#olName"), code = $<HTMLInputElement>("olCode");
      try { if (name) name.value = localStorage.getItem("lw.name") ?? ""; } catch { /* private window */ }
      msg.textContent = notice ?? "";
      const who = () => name?.value.trim() || "Wanderer";
      $("olHost").onclick = () => act.hostOnline(who(), size);
      const join = () => { const c = code.value.trim().toUpperCase(); if (c.length === 4) act.joinOnline(who(), c); else { msg.textContent = "Enter the four-letter code your opponent was given."; code.focus(); } };
      $("olJoin").onclick = join;
      code.onkeydown = e => { if (e.key === "Enter") join(); };
    },
    /** Waiting room. `code` is null while still connecting. */
    showLobby(code: string | null, status: string): void {
      $("overlay").className = "show";
      $("overlay").innerHTML = `<div class="panel"><h1>Gravemarch</h1><div class="sub">${status}</div><div class="orn"></div>
        ${code ? `<div class="code">${code}</div><p>Give this code to the other players. The match begins the moment every seat is taken.</p>` : `<p>One moment.</p>`}
        <div class="row">${code ? `<button id="olNow" class="ghost">Begin now · the autopilot takes the empty seats</button>` : ""}<button id="olCancel" class="ghost">Cancel</button></div></div>`;
      $("olCancel").onclick = () => act.menu();
      if (code) $("olNow").onclick = () => act.startOnlineNow();
    },
    showEnd(won: boolean, s: GameState, online = false): void {
      const t = Math.floor(s.tick / TICK_RATE);
      $("overlay").className = "show";
      $("overlay").innerHTML = `<div class="panel ${won ? "won" : "lost"}"><h1>${won ? "Victory" : "Ruin"}</h1><div class="sub">${won ? "The enemy cathedral has fallen" : "Your cathedral has fallen"}</div><div class="orn"></div>
        <p>The war lasted ${Math.floor(t / 60)} minutes and ${t % 60} seconds.</p><button id="startBtn">${online ? "Return" : "March again"}</button></div>`;
      $("startBtn").onclick = () => (online ? act.menu() : act.start());
    },
    hideOverlay(): void { $("overlay").className = ""; },
    /** Dress the HUD in the player's colours: card portraits and which cathedral bar is theirs. */
    setSide(team: 0 | 1, pics: Record<string, string>): void {
      root.classList.toggle("red", team === 1);
      root.querySelectorAll<HTMLButtonElement>(".card").forEach(b => { const img = b.querySelector("img"); if (img) img.src = pics[b.dataset.unit!] ?? ""; });
      root.querySelectorAll<HTMLButtonElement>(".keeper").forEach(b => { const img = b.querySelector("img"); if (img) img.src = pics[KEEPERS[Number(b.dataset.keeper)]!.id] ?? ""; });
    },

    update(s: GameState, v: HudView): void {
      const p = s.players[v.me]!, foe = (1 - p.team) as 0 | 1;
      me = p;
      if (peek && (v.keeper === null || tabOf(peek) !== v.tier || v.selectedUnit)) peek = null;
      $("tbTele").classList.toggle("on", v.teleport);
      $("tbCancel").style.display = peek || v.teleport || v.selectedUnit || v.selectedBuilding !== null || v.keeper !== null ? "" : "none";
      set("credits", String(p.credits));
      set("income", `+${incomeOf(s, v.me)}`);
      set("incomeIn", String(secs(RULES.incomeIntervalTicks - (s.tick % RULES.incomeIntervalTicks))));
      const waveLeft = RULES.waveIntervalTicks - (s.tick % RULES.waveIntervalTicks);
      set("waveIn", String(secs(waveLeft)));
      $("bell").style.setProperty("--p", String(100 - (waveLeft / RULES.waveIntervalTicks) * 100));
      $("hq0").style.width = `${(s.teams[p.team].hqHp / hqMax(s)) * 100}%`; set("hq0t", String(s.teams[p.team].hqHp));
      $("hq1").style.width = `${(s.teams[foe].hqHp / hqMax(s)) * 100}%`; set("hq1t", String(s.teams[foe].hqHp));
      const t = Math.floor(s.tick / TICK_RATE);
      set("clock", `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
      $("pause").classList.toggle("on", v.paused);
      document.querySelectorAll<HTMLElement>("[data-speed]").forEach(b => b.classList.toggle("on", !v.paused && Number(b.dataset.speed) === v.speed));

      const studying = p.research?.unit ?? null, busy = p.research ? (s.tick - p.research.startTick) / (p.research.doneTick - p.research.startTick) : 0;
      $("cards").dataset.tier = String(v.tier);
      $("build").classList.toggle("open", v.keeper !== null);
      const low = v.keeper === null ? 1 : KEEPERS[v.keeper].minTier, top = v.keeper === null ? 0 : KEEPERS[v.keeper].maxTier;
      document.querySelectorAll<HTMLButtonElement>(".keeper").forEach(b => {
        const slot = Number(b.dataset.keeper), k = s.keepers.find(q => q.owner === v.me && q.slot === slot);
        b.classList.toggle("sel", v.keeper === slot); b.classList.toggle("busy", !!k && k.jobs.length > 0);
        b.dataset.jobs = k && k.jobs.length ? String(k.jobs.length) : "";
        b.classList.toggle("armed", v.teleport && v.keeper === slot);
        b.dataset.rest = KEEPERS[slot]!.teleport ? "T" : "";
      });
      let shown = 0;
      document.querySelectorAll<HTMLButtonElement>(".tier").forEach(b => {
        const t = Number(b.dataset.tier), mine = t >= low && t <= top;
        b.style.display = mine ? "" : "none";
        if (mine) b.dataset.key = (TAB_KEYS[shown++] ?? "").toUpperCase();
        b.classList.toggle("on", t === v.tier); b.classList.toggle("shut", t > p.tier);
        const small = b.querySelector("small")!, text = t > p.tier ? "sealed" : `${unitsOfTier(t).filter(id => isUnlocked(p, id)).length}/${unitsOfTier(t).length}`;
        if (small.textContent !== text) small.textContent = text;
      });
      $("tiers").style.display = shown > 1 ? "" : "none"; // a keeper with a single page needs no tabs
      document.querySelectorAll<HTMLButtonElement>(".card").forEach(b => {
        const d = UNITS[b.dataset.unit!]!, cost = b.querySelector(".cost")!, seal = b.querySelector(".seal")!, prog = b.querySelector<HTMLElement>(".prog")!;
        let costText: string, sealText: string;
        if (d.merc) { // a band for hire: no study, only gold and a short wait between hirings
          const wait = p.mercReady - s.tick;
          for (const c of ["locked", "unstudied", "sel"]) b.classList.remove(c);
          b.classList.toggle("studying", wait > 0); b.classList.toggle("poor", p.credits < d.cost);
          costText = String(d.cost); sealText = wait > 0 ? `${secs(wait)}s` : "";
          prog.style.height = wait > 0 ? `${(wait / RULES.mercCooldownTicks) * 100}%` : "0";
        } else {
          const known = isUnlocked(p, d.id), open = d.tier <= p.tier, study = UNIT_RESEARCH[d.tier]!;
          b.classList.toggle("locked", !open);
          b.classList.toggle("unstudied", open && !known);
          b.classList.toggle("studying", studying === d.id);
          b.classList.toggle("poor", known ? p.credits < d.cost : open && studying !== d.id && p.credits < study.cost);
          b.classList.toggle("sel", v.selectedUnit === d.id);
          costText = known ? String(d.cost) : open ? `✦ ${study.cost}` : "—";
          sealText = known ? "" : !open ? ROMAN[d.tier]! : studying === d.id ? `${secs(p.research!.doneTick - s.tick)}s` : "Study";
          prog.style.height = studying === d.id ? `${busy * 100}%` : "0";
        }
        if (cost.textContent !== costText) cost.textContent = costText;
        if (seal.textContent !== sealText) seal.textContent = sealText;
      });

      // The tithe: the bar's button raises it on my own lane; the plus beside each lane of the map raises it there.
      const iLane = hover?.startsWith("tithe") ? Number(hover.slice(5)) : p.lane, plus = $("titheL"), laneOwner = (l: number) => s.players.find(q => q.team === p.team && q.lane === l);
      const laneName = (l: number) => l === p.lane ? "your lane" : `${v.names[laneOwner(l)?.id ?? -1] ?? "your ally"}'s lane`;
      if (plus.childElementCount !== s.laneCount) {
        const [f0, f1] = fieldZ(s.laneCount);
        plus.innerHTML = Array.from({ length: s.laneCount }, (_, l) => `<button data-lane="${l}" style="top:${(((l * LANE_PITCH + LANE_W / 2 - f0) / (f1 - f0)) * 100).toFixed(1)}%" aria-label="Raise the tithe on lane ${ROMAN[l + 1]}"><b>+</b><i></i></button>`).join("");
      }
      plus.querySelectorAll<HTMLElement>("button").forEach(el => {
        const l = Number(el.dataset.lane), lv = p.invest[l] ?? 0;
        el.classList.toggle("poor", p.credits < INVEST.cost);
        if (el.dataset.lv !== String(lv)) { el.dataset.lv = String(lv); el.querySelector("i")!.textContent = lv ? String(lv) : ""; }
      });
      const level = p.invest[iLane] ?? 0, tier = INVEST, held = beaconsHeld(s, p.team, iLane);
      const gain = tier.bonus * held;
      const payback = gain > 0 ? `repays itself in ${Math.ceil((tier.cost / gain) * (RULES.incomeIntervalTicks / TICK_RATE))}s` : "pays nothing until you hold a shrine";
      set("investC", String(tier.cost));
      set("investT", `+${gain} gold now (${held}/3 shrines)`);
      $("invest").classList.toggle("poor", p.credits < tier.cost);

      const next = researchOffer(p), rite = p.research && !p.research.unit;
      set("researchH", rite ? RITE[p.research!.tier]! : next ? RITE[next.tier]! : "The Rites");
      set("researchC", next && !p.research ? String(next.cost) : "");
      set("researchT", rite ? `Under way · ${secs(p.research!.doneTick - s.tick)}s remain` : p.research ? `Studying the ${UNITS[p.research.unit!]!.name} · ${secs(p.research.doneTick - s.tick)}s`
        : next ? `Opens tier ${ROMAN[next.tier]}: ${unitsOfTier(next.tier).length} units to study` : "Complete · every tier is open");
      $("researchBar").style.width = rite ? `${busy * 100}%` : "0%";
      $("research").classList.toggle("poor", !!next && (!!p.research || p.credits < next.cost)); $("research").classList.toggle("done", !next);

      const block = stormBlock(s, p), rest = p.stormReady - s.tick, strikes = RULES.stormTicks / RULES.stormInterval;
      const mine = s.storms.filter(q => q.team === p.team).length, theirs = s.storms.length - mine;
      set("stormC", String(RULES.stormCost));
      set("stormT", mine ? `Raging · ${mine > 1 ? `${mine} storms` : "the enemy burns"}` : block === "tier" ? "Sealed until The Third Rite" : rest > 0 ? `The sky rests · ${secs(rest)}s` : "Lightning on every enemy");
      $("stormBar").style.width = rest > 0 ? `${100 - (rest / RULES.stormCooldownTicks) * 100}%` : "0%";
      $("storm").classList.toggle("poor", block === "gold"); $("storm").classList.toggle("done", block === "tier" || block === "resting");
      $("storm").classList.toggle("raging", mine > 0); root.classList.toggle("stormed", theirs > 0);

      const myFog = s.fogs.find(q => q.owner === v.me), fogLeft = myFog ? RULES.fogRollTicks + RULES.fogHoldTicks - (s.tick - myFog.from) : 0;
      const theirFog = s.fogs.some(q => q.team !== p.team), fogSecs = secs(RULES.fogRollTicks);
      set("fogT", myFog ? (fogFront(s, myFog) < RULES.fogReach ? "Rolling out · nothing lives in it" : `Standing · ${secs(fogLeft)}s`) : p.fogUsed ? "Spent · it comes but once" : s.laneCount > 1 ? `Death down ${laneName(v.fogLane)}` : "Death rolls from your cathedral");
      $("fogBar").style.width = myFog ? `${Math.max(0, (fogLeft / (RULES.fogRollTicks + RULES.fogHoldTicks)) * 100)}%` : "0%";
      $("fog").classList.toggle("done", p.fogUsed && !myFog); $("fog").classList.toggle("rolling", !!myFog); $("fog").classList.toggle("ready", !p.fogUsed);
      root.classList.toggle("fogged", theirFog);

      const b = s.buildings.find(q => q.id === v.selectedBuilding);
      const unit = hover && UNITS[hover] ? hover : !hover ? peek ?? v.selectedUnit : null;
      const go = (label: string) => (touch && peek === unit ? `<button id="confirm">${label}</button>` : "");
      if (v.teleport && !hover) tip(`<h3>Through the grave<span class="num">T</span></h3><p>Click any ground your side holds, in any lane, here or on the map: the Sexton is there at once.</p><p class="hint">Esc or right-click to cancel. He may step again as often as you like; his queued chantries are refunded each time.</p>`);
      else if (hover === "invest" || hover?.startsWith("tithe")) tip(`<h3>Raise the tithe${tier ? `<span class="num">${tier.cost}</span>` : ""}</h3>
        <p>Every shrine your side holds in ${laneName(iLane)} pays you <b>+${tier.bonus}</b> more gold each collection. It holds ${held} of 3, so this ${payback}.</p>
        <p class="stats">Tithe level ${level} on ${laneName(iLane)} · currently +${investBonus(level)} per shrine</p>
        <p class="hint">Every level costs the same, and there is no highest level. ${s.laneCount > 1 ? "The plus beside each lane of the map raises it there, your own lane or an ally's; 3 raises it on your own. The tithe is yours alone: it raises only your income from that lane's shrines, never your ally's." : "Press 3, or the plus beside the map."}</p>`);
      else if (hover === "research") tip(`<h3>${next ? RITE[next.tier] : "The Rites"}${next ? `<span class="num">${next.cost}</span>` : ""}</h3>
        <p>${next ? `A ${secs(next.ticks)}-second rite that opens tier ${ROMAN[next.tier]}. Its units still have to be studied one by one: ${unitsOfTier(next.tier).map(u => UNITS[u]!.name).join(", ")}.` : "Every rite is complete. Any unit may be studied."}</p>
        <p class="hint">Your scholars work on one rite or study at a time.</p>`);
      else if (hover === "storm") tip(`<h3>Storm of Wrath<span class="num">${RULES.stormCost}</span></h3>
        <p>For ${secs(RULES.stormTicks)} seconds lightning falls on <b>every enemy soldier on the whole field</b>, in every lane, on the ground and in the air: ${RULES.stormDamage} damage a second to each, ${strikes * RULES.stormDamage} in all, through any armor. Towers and cathedrals are spared.</p>
        <p class="stats">It thins a swarm and softens the great; it will not win a battle alone. Storms called together strike together.</p>
        <p class="hint">${block === "tier" ? "Sealed until The Third Rite is complete." : `The sky rests ${secs(RULES.stormCooldownTicks)} seconds between your storms.`}</p>`);
      else if (hover === "fog") tip(`<h3>Deadly Fog<span class="num">Once</span></h3>
        <p>A last resort. A killing fog pours out of your cathedral and rolls slowly down ${s.laneCount > 1 ? `<b>${laneName(v.fogLane)}</b>` : "the lane"}, as far as halfway between your shrine and the middle one. <b>Every enemy soldier it touches dies</b>, the greatest like the least, on the ground and in the air. Towers and cathedrals are spared.</p>
        <p class="stats">It takes ${fogSecs} seconds to roll out and stands ${secs(RULES.fogHoldTicks)} more; whatever marches into it meanwhile dies too. It costs nothing.</p>
        <p class="hint">${p.fogUsed ? "You have called it. It will not come again this war." : `It comes once in the whole war: keep it for the hour the gates are about to fall.${s.laneCount > 1 ? " It rolls down the lane you are looking at." : ""}`}</p>`);
      else if (hover === "keeper0" || hover === "keeper1") {
        const slot = Number(hover.slice(6)), k = KEEPERS[slot]!, mine = s.keepers.find(q => q.owner === v.me && q.slot === slot);
        tip(`<h3>${k.name}<span class="num">${slot + 1}</span></h3><p>${k.blurb}</p>
          <p class="stats">${mine && mine.jobs.length ? `${mine.jobs.length} ${mine.jobs.length === 1 ? "chantry" : "chantries"} on order` : "Awaiting orders"}</p>
          <p class="hint">Press ${slot + 1} or click him, choose a unit, then click your ground${s.laneCount > 1 ? " or an ally's" : ""}. Right-click sends him walking and cancels his orders.${KEEPERS[slot]!.teleport ? " Press T, then click, to send him anywhere on your side's ground at once." : ""}</p>`);
      } else if (unit && UNITS[unit]!.merc) {
        const d = UNITS[unit]!;
        tip(`<h3>${d.name}<span class="num">${d.cost}</span></h3><p>${d.blurb}</p>${abilityLines(unit)}<p class="stats">${statLine(unit)}</p>
          <p class="hint">Click to hire. They form up in front of your towers at once, fight as far as the middle of the lane, and leave.</p>${go(`Hire · ${d.cost}`)}`);
      } else if (unit) {
        const d = UNITS[unit]!, known = isUnlocked(p, unit), open = d.tier <= p.tier, study = UNIT_RESEARCH[d.tier]!;
        tip(`<h3>${d.name}<span class="num">${d.cost}</span></h3><p>${d.blurb}</p>${abilityLines(unit)}<p class="stats">${statLine(unit)}</p>
          <p class="hint">${!open ? `Sealed until ${RITE[d.tier]}.` : studying === unit ? "Your scholars are studying it now."
            : !known ? `Click to study it: ${study.cost} gold, ${secs(study.ticks)} seconds.${p.research ? " Your scholars are busy until the current work is done." : ""}`
            : d.tier > top ? "Only the Undertaker can raise it."
            : v.selectedUnit === unit ? "Click anywhere free on your ground: your keeper walks there and raises it. Keep clicking to queue more. Esc to cancel." : `Its chantry musters ${d.count ? ["", "one", "two", "three"][d.count] : "one"} each wave.`}</p>${open && !known && studying !== unit ? go(`Study · ${study.cost}`) : ""}`);
      } else if (b) tip(`<h3>${UNITS[b.unit]!.name} chantry</h3><p>Musters at every toll of the bell.</p>${abilityLines(b.unit)}<p class="stats">${statLine(b.unit)}</p>
          <button id="sell">Tear down · refund ${sellRefund(b.unit, b.produced)} (Del)</button>`);
      else tip(null);

      drawMinimap(s, v);
    },
  };
}
export type Hud = ReturnType<typeof createHud>;
