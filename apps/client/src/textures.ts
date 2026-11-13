/** Procedural textures drawn with Canvas 2D at load time. Original; no external assets. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function tile(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const c = cv.getContext("2d")!; c.lineJoin = "round"; c.lineCap = "round"; draw(c, w, h); return cv;
}
type Ctx = CanvasRenderingContext2D;
/** Draw something that may cross the left/right seam so the tile wraps cleanly. */
const wrap = (w: number, x: number, reach: number, f: (x: number) => void) => { f(x); if (x < reach) f(x + w); if (x > w - reach) f(x - w); };

/**
 * Battlefield floor, tileable along the lane. `px` = pixels per world unit. The tile is `wu` wide
 * and `totalWu` deep; the lane occupies [laneTopWu, laneTopWu + laneWu] with a flagstone road down its middle.
 */
export function groundTile(px: number, wu: number, laneTopWu: number, laneWu: number, totalWu: number): HTMLCanvasElement {
  return tile(wu * px, totalWu * px, (c: Ctx, w, h) => {
    const r = rng(42), top = laneTopWu * px, lh = laneWu * px;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#3a3d49"); g.addColorStop(top / h, "#5a5d6b"); g.addColorStop((top + lh * 0.5) / h, "#666978"); g.addColorStop((top + lh) / h, "#565968"); g.addColorStop(1, "#33353f");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) { // soil grain
      const x = r() * w, y = r() * h, s = 1 + r() * 3;
      c.fillStyle = r() < 0.55 ? `rgba(0,0,0,${0.05 + r() * 0.13})` : `rgba(215,215,235,${0.03 + r() * 0.06})`;
      wrap(w, x, 8, xx => { c.beginPath(); c.ellipse(xx, y, s * 1.8, s * 0.8, r() * 3, 0, Math.PI * 2); c.fill(); });
    }
    for (let i = 0; i < 40; i++) { // damp patches
      const x = r() * w, y = r() * h, rad = px * (1 + r() * 2.5);
      wrap(w, x, rad, xx => { const d = c.createRadialGradient(xx, y, 0, xx, y, rad); d.addColorStop(0, "rgba(10,12,20,0.22)"); d.addColorStop(1, "rgba(10,12,20,0)"); c.fillStyle = d; c.fillRect(xx - rad, y - rad, rad * 2, rad * 2); });
    }
    const roadTop = top + lh * 0.3, roadH = lh * 0.4, rows = 7, rh = roadH / rows;
    for (let row = 0; row < rows; row++) { // flagstones
      let x = -r() * px * 2;
      const edge = row === 0 || row === rows - 1;
      while (x < w) {
        const sw = px * (1.3 + r() * 1.5), y = roadTop + row * rh + (r() - 0.5) * 2;
        if (!(edge && r() < 0.45)) {
          const shade = 118 + Math.floor(r() * 34);
          c.fillStyle = `rgb(${shade},${shade + 2},${shade + 14})`;
          wrap(w, x, sw + 4, xx => {
            c.beginPath(); c.roundRect(xx + 1.5, y + 1.5, sw - 3, rh - 3, 4); c.fill();
            c.strokeStyle = "rgba(0,0,0,0.55)"; c.lineWidth = 1.6; c.stroke();
            c.strokeStyle = "rgba(255,255,255,0.1)"; c.lineWidth = 1; c.beginPath(); c.moveTo(xx + 5, y + 3.5); c.lineTo(xx + sw - 6, y + 3.5); c.stroke();
          });
        }
        x += sw;
      }
    }
    for (let i = 0; i < 160; i++) { // tufts of dead grass
      const x = r() * w, y = r() < 0.7 ? top + (r() < 0.5 ? r() * lh * 0.27 : lh * 0.73 + r() * lh * 0.27) : r() * h;
      c.strokeStyle = `rgba(${80 + r() * 30},${92 + r() * 30},${66 + r() * 20},0.6)`; c.lineWidth = 1.3;
      wrap(w, x, 10, xx => { for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(xx + k * 1.5, y); c.lineTo(xx + k * 3.2, y - 6 - r() * 5); c.stroke(); } });
    }
    for (const y of [top, top + lh]) for (let x = 0; x < w; x += px * 1.1) if (r() > 0.15) { // kerb stones
      c.fillStyle = `rgba(150,153,170,${0.35 + r() * 0.35})`; c.beginPath(); c.roundRect(x + 2, y - 4, px * 0.9, 8, 2); c.fill();
      c.strokeStyle = "rgba(0,0,0,0.4)"; c.lineWidth = 1; c.stroke();
    }
  });
}

/** Soft radial dot used for flames, sparks, smoke and motes. */
export function glowTexture(): HTMLCanvasElement {
  return tile(64, 64, c => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
}

/** Rune circle laid on the ground under a shrine; white so it can be tinted. */
export function runeTexture(): HTMLCanvasElement {
  return tile(512, 512, c => {
    c.translate(256, 256); c.strokeStyle = "#fff";
    c.lineWidth = 9; c.beginPath(); c.arc(0, 0, 238, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 196, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, 100, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 16; i++) { c.save(); c.rotate((i / 16) * Math.PI * 2); c.lineWidth = 5; c.beginPath(); c.moveTo(-10, -226); c.lineTo(0, -205); c.lineTo(10, -226); c.stroke(); c.restore(); }
    c.lineWidth = 4; c.beginPath(); for (let i = 0; i < 8; i++) { const a = ((i * 3) / 8) * Math.PI * 2; c.lineTo(Math.cos(a) * 196, Math.sin(a) * 196); } c.closePath(); c.stroke();
  });
}

/**
 * Consecrated building ground: worn flagstones laid on the diagonal with a darker inlaid band,
 * warmer and paler than the lane so the area reads as paved cathedral precinct. Tileable both ways;
 * one tile is `wu` world units square. The paving ignores the hidden placement grid on purpose.
 */
export function courtyardTile(px: number, wu: number): HTMLCanvasElement {
  return tile(wu * px, wu * px, (c: Ctx, w, h) => {
    const r = rng(7), n = 6, step = w / n; // n diamonds per tile side
    c.fillStyle = "#2b2823"; c.fillRect(0, 0, w, h); // mortar
    for (let i = -1; i <= n * 2; i++) for (let j = -1; j <= n; j++) {
      const cx = (i * step) / 2, cy = j * step + (i % 2 ? step / 2 : 0), half = step / 2 - 1.6;
      const band = (i + j * 2) % 6 === 0, v = band ? 100 + r() * 14 : 122 + r() * 30;
      c.fillStyle = band ? `rgb(${v + 10},${v},${v - 6})` : `rgb(${v + 8},${v + 2},${v - 10})`;
      c.beginPath(); c.moveTo(cx, cy - half); c.lineTo(cx + half, cy); c.lineTo(cx, cy + half); c.lineTo(cx - half, cy); c.closePath(); c.fill();
      c.strokeStyle = "rgba(255,244,220,0.10)"; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - half + 3, cy - 1); c.lineTo(cx, cy - half + 3); c.stroke();
      if (r() < 0.16) { // a cracked or chipped stone
        c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 1.2; c.beginPath();
        c.moveTo(cx - half * 0.5, cy + (r() - 0.5) * half * 0.5); c.lineTo(cx + (r() - 0.5) * half * 0.4, cy + (r() - 0.5) * half * 0.4); c.lineTo(cx + half * 0.5, cy + (r() - 0.5) * half * 0.5); c.stroke();
      }
    }
    for (let i = 0; i < 1500; i++) { // grit and moss in the joints
      const x = r() * w, y = r() * h, s = 0.6 + r() * 2;
      c.fillStyle = r() < 0.6 ? `rgba(0,0,0,${0.05 + r() * 0.12})` : r() < 0.5 ? `rgba(86,104,70,${0.10 + r() * 0.14})` : `rgba(255,240,215,${0.03 + r() * 0.05})`;
      c.beginPath(); c.ellipse(x, y, s * 1.6, s * 0.8, r() * 3, 0, Math.PI * 2); c.fill();
    }
  });
}
