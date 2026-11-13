import type { UserIdentity } from "@lw/protocol";
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "@fontsource/unifrakturcook/700.css";
import "./hud.css";
import { INVEST_TIERS, LANE_WIDTH, MAP, RESEARCH, RULES, TICK_RATE, UNITS, UNIT_ORDER, beaconsHeld, hqX, incomeOf, investBonus, sellRefund } from "@lw/sim";
import type { GameState } from "@lw/sim";
import { TEAM } from "./models";

/** DOM overlay. Reads GameState, raises intents through callbacks. No rules here. */
export interface HudActions {
  selectUnit(id: string): void;
  invest(): void;
  research(): void;
  sell(): void;
  setSpeed(n: number): void;
  togglePause(): void;
  toggleMute(): boolean;
  panTo(fraction: number): void; // centre the camera on this fraction of the lane
  start(): void;                              // solo match against the autopilot
  hostOnline(name: string): void;
  joinOnline(name: string, code: string): void;
  startOnlineNow(): void;                     // host: stop waiting, play the autopilot on the server
  menu(): void;                               // leave any lobby and return to the title screen
}
export interface HudView { me: number; selectedUnit: string | null; selectedBuilding: number | null; speed: number; paused: boolean; camFrac: [number, number] }

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const secs = (ticks: number) => Math.ceil(ticks / TICK_RATE);
const ROMAN = ["", "I", "II", "III", "IV"];

function statLine(id: string): string {
  const d = UNITS[id]!;
  const rate = d.heal > 0 ? `Mends ${Math.round((d.heal * TICK_RATE) / d.interval)}/s` : `Damage ${Math.round((d.damage * TICK_RATE) / d.interval)}/s${d.splash ? " in an area" : ""}`;
  return `Health ${d.hp} · ${rate} · Reach ${d.range / 1000}${d.armor ? ` · Armor ${d.armor}` : ""}`;
}

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
      <canvas id="minimap" title="Click or drag to move along the lane"></canvas>
    </div>
    <div class="tools"><span id="clock" class="num">0:00</span><button id="pause" title="Pause (P)">❚❚</button>${[1, 2, 4].map(n => `<button data-speed="${n}" title="Game speed ×${n}">${ROMAN[n]}</button>`).join("")}<button id="mute" title="Sound">♪</button></div>
  </div>
  <div id="tip"></div>
  <div id="bar">
    <div id="cards">${UNIT_ORDER.map((id, i) => `
      <button class="card" data-unit="${id}" aria-label="${UNITS[id]!.name}"><span class="frame"></span><span class="glassp"></span><img src="${portraits[id] ?? ""}" alt="">
        <span class="plaque"><span class="key">${i + 1}</span><span class="cost num">${UNITS[id]!.cost}</span></span></button>`).join("")}</div>
    <div class="rule"></div>
    <div id="acts">
      <button class="act" id="invest"><span class="key"><b>E</b></span><strong><span>Raise the tithe</span><span class="num" id="investC"></span></strong><em id="investT"></em></button>
      <button class="act" id="research"><span class="key"><b>R</b></span><strong><span id="researchH">The Second Rite</span><span class="num" id="researchC"></span></strong><em id="researchT"></em><i class="fill" id="researchBar"></i></button>
    </div>
  </div>
  <div id="toast"></div>
  <div id="overlay"></div>`;

  let hover: string | null = null; // unit id, "invest" or "research"
  root.querySelectorAll<HTMLButtonElement>(".card").forEach(b => {
    b.onclick = () => act.selectUnit(b.dataset.unit!);
    b.onmouseenter = () => { hover = b.dataset.unit!; };
    b.onmouseleave = () => { hover = null; };
  });
  for (const id of ["invest", "research"]) { $(id).onmouseenter = () => { hover = id; }; $(id).onmouseleave = () => { hover = null; }; }
  root.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach(b => { b.onclick = () => act.setSpeed(Number(b.dataset.speed)); });
  $("pause").onclick = () => act.togglePause();
  $("mute").onclick = () => { $("mute").classList.toggle("on", !act.toggleMute()); };
  $("mute").classList.add("on");
  $("invest").onclick = () => act.invest();
  $("research").onclick = () => act.research();
  $("tip").onclick = e => { if ((e.target as HTMLElement).id === "sell") act.sell(); };

  const mini = $<HTMLCanvasElement>("minimap");
  const pan = (e: PointerEvent) => { const r = mini.getBoundingClientRect(); act.panTo((e.clientX - r.left) / r.width); };
  mini.onpointerdown = e => { mini.setPointerCapture(e.pointerId); pan(e); };
  mini.onpointermove = e => { if (e.buttons & 1) pan(e); };

  let toastTimer = 0;
  const set = (id: string, text: string) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
  const tip = (markup: string | null) => { const el = $("tip"); el.classList.toggle("show", !!markup); if (markup && el.dataset.m !== markup) { el.dataset.m = markup; el.innerHTML = markup; } };

  function drawMinimap(s: GameState, v: HudView): void {
    const w = mini.clientWidth, h = mini.clientHeight, dpr = devicePixelRatio || 1;
    if (mini.width !== Math.round(w * dpr)) { mini.width = Math.round(w * dpr); mini.height = Math.round(h * dpr); }
    const c = mini.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (x: number) => (x / MAP.laneLength) * w, Y = (y: number) => 3 + (y / LANE_WIDTH) * (h - 6);
    const col = (team: number) => TEAM[team as 0 | 1].css;
    c.fillStyle = "#0a090e"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#1b1a22"; c.fillRect(0, h * 0.3, w, h * 0.4);
    for (const team of [0, 1] as const) {
      const zw = MAP.zoneCols * MAP.cell;
      c.globalAlpha = 0.22; c.fillStyle = col(team); c.fillRect(X(team === 0 ? MAP.zoneStart : MAP.laneLength - MAP.zoneStart - zw), 0, X(zw), h);
      c.globalAlpha = 1; c.fillRect(X(hqX(team)) - 4, 2, 8, h - 4);
    }
    for (const b of s.beacons) {
      c.fillStyle = b.owner === null ? "#8a8474" : col(b.owner);
      c.save(); c.translate(X(b.x), h / 2); c.rotate(Math.PI / 4); c.fillRect(-4.5, -4.5, 9, 9); c.restore();
    }
    for (const u of s.units) {
      c.fillStyle = col(u.team);
      if (UNITS[u.type]!.structure) { c.fillRect(X(u.x) - 2, Y(u.y) - 3, 4, 6); c.strokeStyle = "#e2d7bc"; c.lineWidth = 1; c.strokeRect(X(u.x) - 2, Y(u.y) - 3, 4, 6); }
      else c.fillRect(X(u.x) - 1, Y(u.y) - 1, 2.5, 2.5);
    }
    c.strokeStyle = "#e2d7bc"; c.lineWidth = 1.5;
    c.strokeRect(v.camFrac[0] * w + 0.75, 0.75, Math.max(4, (v.camFrac[1] - v.camFrac[0]) * w - 1.5), h - 1.5);
  }

  let menuRender = 0;
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
          <dt>Muster</dt><dd>Choose a unit (keys 1–6) and set its chantry on your ground. Every chantry sends one soldier at each toll of the bell, for the rest of the war.</dd>
          <dt>Shrines</dt><dd>You begin with the shrine nearest your cathedral, guarded by two towers. Claim the others by marching over them; the enemy home shrine falls only after both its towers, and two more towers guard each base. Each shrine you hold pays gold.</dd>
          <dt>Tithe &amp; Rite</dt><dd>Raise the tithe (E) to earn more from every shrine you hold. Perform the Second Rite (R) to unlock stronger units.</dd>
          <dt>Survey</dt><dd>Drag, scroll, use A / D or the arrow keys, or click the map strip. Space returns to your cathedral.</dd>
          <dt>Victory</dt><dd>Bring down the enemy cathedral at the far end of the lane.</dd>
        </dl></details>
        <button id="startBtn">Play singleplayer</button>
        <div class="online"><div class="sub">Multiplayer</div>
          ${hostedAccounts && !user ? `<form id="rgbLogin" class="rgb-login" method="post" action="/auth/challenge">
            <label>Email<input name="email" type="email" autocomplete="username" maxlength="320" required></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
            <button type="submit" class="ghost">Sign in with RGBoner</button>
          </form>` : `
          ${user ? '<div class="row"><span id="rgbPlayer"></span><form method="post" action="/auth/logout"><button class="ghost">Sign out</button></form></div>' : ""}
          <div class="row">${hostedAccounts ? "" : '<input id="olName" maxlength="20" placeholder="Your name" autocomplete="off" spellcheck="false">'}
            <button id="olHost" class="ghost">Host a match</button>
            <input id="olCode" maxlength="4" placeholder="Code" autocomplete="off" spellcheck="false">
            <button id="olJoin" class="ghost">Join</button></div>`}
          <div id="olMsg" role="status"></div></div></div>`;
      $("startBtn").onclick = () => act.start();
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
      $("olHost").onclick = () => act.hostOnline(who());
      const join = () => { const c = code.value.trim().toUpperCase(); if (c.length === 4) act.joinOnline(who(), c); else { msg.textContent = "Enter the four-letter code your opponent was given."; code.focus(); } };
      $("olJoin").onclick = join;
      code.onkeydown = e => { if (e.key === "Enter") join(); };
    },
    /** Waiting room. `code` is null while still connecting. */
    showLobby(code: string | null, status: string): void {
      $("overlay").className = "show";
      $("overlay").innerHTML = `<div class="panel"><h1>Gravemarch</h1><div class="sub">${status}</div><div class="orn"></div>
        ${code ? `<div class="code">${code}</div><p>Give this code to your opponent. The match begins the moment they join.</p>` : `<p>One moment.</p>`}
        <div class="row">${code ? `<button id="olNow" class="ghost">Play the autopilot instead</button>` : ""}<button id="olCancel" class="ghost">Cancel</button></div></div>`;
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
    },

    update(s: GameState, v: HudView): void {
      const p = s.players[v.me]!, foe = (1 - p.team) as 0 | 1;
      set("credits", String(p.credits));
      set("income", `+${incomeOf(s, v.me)}`);
      set("incomeIn", String(secs(RULES.incomeIntervalTicks - (s.tick % RULES.incomeIntervalTicks))));
      const waveLeft = RULES.waveIntervalTicks - (s.tick % RULES.waveIntervalTicks);
      set("waveIn", String(secs(waveLeft)));
      $("bell").style.setProperty("--p", String(100 - (waveLeft / RULES.waveIntervalTicks) * 100));
      $("hq0").style.width = `${(s.teams[p.team].hqHp / RULES.hqHp) * 100}%`; set("hq0t", String(s.teams[p.team].hqHp));
      $("hq1").style.width = `${(s.teams[foe].hqHp / RULES.hqHp) * 100}%`; set("hq1t", String(s.teams[foe].hqHp));
      const t = Math.floor(s.tick / TICK_RATE);
      set("clock", `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
      $("pause").classList.toggle("on", v.paused);
      document.querySelectorAll<HTMLElement>("[data-speed]").forEach(b => b.classList.toggle("on", !v.paused && Number(b.dataset.speed) === v.speed));

      document.querySelectorAll<HTMLButtonElement>(".card").forEach(b => {
        const d = UNITS[b.dataset.unit!]!;
        b.classList.toggle("locked", d.tier > p.tier);
        b.classList.toggle("poor", d.tier <= p.tier && p.credits < d.cost);
        b.classList.toggle("sel", v.selectedUnit === d.id);
      });

      const level = p.invest[p.lane] ?? 0, tier = INVEST_TIERS[level], held = beaconsHeld(s, p.team, p.lane);
      const gain = tier ? tier.bonus * held : 0;
      const payback = tier && gain > 0 ? `repays itself in ${Math.ceil((tier.cost / gain) * (RULES.incomeIntervalTicks / TICK_RATE))}s` : "pays nothing until you hold a shrine";
      set("investC", tier ? String(tier.cost) : "—");
      set("investT", tier ? `+${gain} gold now (${held}/3 shrines)` : `Highest tithe · +${investBonus(level)} per shrine`);
      $("invest").classList.toggle("poor", !!tier && p.credits < tier.cost); $("invest").classList.toggle("done", !tier);

      const next = RESEARCH[p.tier + 1];
      set("researchC", next && !p.research ? String(next.cost) : "");
      set("researchT", p.research ? `Under way · ${secs(p.research.doneTick - s.tick)}s remain` : next ? "Unlocks three stronger units" : "Complete · all units unlocked");
      $("researchBar").style.width = p.research ? `${((s.tick - p.research.startTick) / (p.research.doneTick - p.research.startTick)) * 100}%` : "0%";
      $("research").classList.toggle("poor", !!next && !p.research && p.credits < next.cost); $("research").classList.toggle("done", !next);

      const b = s.buildings.find(q => q.id === v.selectedBuilding);
      const unit = hover && UNITS[hover] ? hover : !hover ? v.selectedUnit : null;
      if (hover === "invest") tip(`<h3>Raise the tithe${tier ? `<span class="num">${tier.cost}</span>` : ""}</h3>
        <p>${tier ? `Every shrine you hold pays you <b>+${tier.bonus}</b> more gold each collection. You hold ${held} of 3, so this ${payback}.` : "Your tithe is as high as it can go."}</p>
        <p class="stats">Tithe level ${level} of ${INVEST_TIERS.length} · currently +${investBonus(level)} per shrine</p>`);
      else if (hover === "research") tip(`<h3>The Second Rite${next ? `<span class="num">${next.cost}</span>` : ""}</h3>
        <p>${next ? `A ${secs(next.ticks)}-second rite that unlocks the ${UNIT_ORDER.filter(u => UNITS[u]!.tier === p.tier + 1).map(u => UNITS[u]!.name).join(", ")}.` : "The rite is complete. Every unit is yours to muster."}</p>`);
      else if (unit) {
        const d = UNITS[unit]!;
        tip(`<h3>${d.name}<span class="num">${d.cost}</span></h3><p>${d.blurb}</p><p class="stats">${statLine(unit)}</p>
          <p class="hint">${d.tier > p.tier ? "Requires the Second Rite." : v.selectedUnit === unit ? "Click anywhere free on your ground to raise its chantry. Esc to cancel." : "Its chantry musters one each wave."}</p>`);
      } else if (b) tip(`<h3>${UNITS[b.unit]!.name} chantry</h3><p>Musters one ${UNITS[b.unit]!.name} at every toll of the bell.</p><p class="stats">${statLine(b.unit)}</p>
          <button id="sell">Tear down · refund ${sellRefund(b.unit, b.produced)} (X)</button>`);
      else tip(null);

      drawMinimap(s, v);
    },
  };
}
export type Hud = ReturnType<typeof createHud>;
