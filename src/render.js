// Draws the town, the road, what lies on it and the cart with its pile.
// Top-down with a little height: things stand up toward the top of the screen,
// so the pile grows up the screen as it would seen from behind the cart.
import { OBSTACLES, STEP_LENGTH, TRACK_LENGTH, hash2 } from './track.js';
import { RIM, ITEMS, itemHeight } from './game.js';
import { drawItem, drawBalloon, BALLOON_COLORS } from './draw-items.js';

const GROUND = { street: '#e8dcc2', sidewalk: '#9fc46b', stairs: '#d9c7a4', market: '#d8c4a0', finish: '#e8dcc2' };
const ROAD = { street: '#5b5f6b', sidewalk: '#dcc9a5', stairs: '#d4c09c', market: '#bba183', finish: '#e2cfab' };
const WALLS = ['#f2c27b', '#ef8f6b', '#f6e0b5', '#e9a2a2', '#b7d3c9', '#f3d27a', '#d7b8e0', '#f0b48a'];
const ROOFS = ['#c8553d', '#b4472f', '#d26a3e', '#a8432f', '#8e5b4a', '#c0603f'];
const AWNINGS = [['#e63946', '#fff'], ['#2a9d8f', '#fff'], ['#f4a261', '#fff'], ['#457b9d', '#fff'], ['#6a994e', '#fff']];

export function createView() {
  return { W: 0, H: 0, s: 40, cartSy: 0, camX: 0, shake: 0, debris: [], parts: [], texts: [], decals: [], t: 0, reduceShake: false };
}

/** Fits the world to the canvas: about 8.5 units across on a phone, ~14 units tall on a wide screen. */
export function resizeView(view, W, H) {
  view.W = W;
  view.H = H;
  view.s = Math.max(18, Math.min(W / 8.6, H / 13.5));
  view.cartSy = H * 0.76;
}

// ---------- effects (fed by game events) ----------
export function onEvents(view, g, events, label) {
  const c = g.cart;
  for (const e of events) {
    switch (e.type) {
      case 'pickup': {
        view.texts.push({ x: c.x, y: c.y, z: 1.6, text: `+${e.value}`, sub: label('pickup', e), color: '#ffffff', life: 1.1 });
        for (let i = 0; i < 8; i++) view.parts.push({ kind: 'star', x: e.x, y: e.y, z: 0.5, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 3 + c.v * 0.6, vz: 2 + Math.random() * 3, life: 0.5 });
        break;
      }
      case 'fall': {
        const it = e.item;
        view.debris.push({ it, x: c.x + e.side * 0.2, y: c.y, z: (e.height ?? 1) + 0.6, vx: e.side * (2.5 + Math.random() * 2.5), vy: c.v * 0.55, vz: 2 + Math.random() * 2, rot: 0, vr: e.side * (5 + Math.random() * 6), life: 6 });
        view.texts.push({ x: c.x, y: c.y, z: 2.2, text: `−${ITEMS[it.type].value}`, sub: label('fall', e), color: '#ffd5d5', life: 1, bad: true });
        break;
      }
      case 'break':
        view.decals.push({ kind: 'yolk', x: c.x + (Math.random() - 0.5) * 0.6, y: c.y - 0.3, r: 0.5 });
        view.texts.push({ x: c.x, y: c.y, z: 2, text: `−${ITEMS.eggs.value}`, sub: label('break', e), color: '#fff2a8', life: 1.1, bad: true });
        bump(view, 6);
        break;
      case 'crash': bump(view, 12); dust(view, e.x, e.y, 10); break;
      case 'pop':
        view.texts.push({ x: c.x, y: c.y, z: 3, text: `−${ITEMS.balloon.value}`, sub: label('pop', e), color: '#ffd5d5', life: 1, bad: true });
        for (let i = 0; i < 10; i++) view.parts.push({ kind: 'confetti', x: c.x, y: c.y, z: 3, vx: (Math.random() - 0.5) * 6, vy: c.v * 0.7, vz: Math.random() * 3, life: 0.8, color: BALLOON_COLORS[i % 5] });
        break;
      case 'curb': bump(view, 4); dust(view, c.x + e.side * 0.4, c.y, 5); break;
      case 'bump': if (e.cause === 'pothole') { bump(view, 7); dust(view, c.x, c.y, 6); } else if (e.cause === 'stairs') bump(view, 2.5); break;
      case 'land': if (e.impact > 4) { bump(view, Math.min(9, e.impact)); dust(view, c.x, c.y, 8); } break;
      case 'finish':
        for (let i = 0; i < 70; i++) view.parts.push({ kind: 'confetti', x: c.x + (Math.random() - 0.5) * 8, y: c.y + 3 + Math.random() * 4, z: 4 + Math.random() * 3, vx: (Math.random() - 0.5) * 3, vy: c.v * 0.5, vz: Math.random() * 2, life: 2.5, color: BALLOON_COLORS[i % 5] });
        break;
      default: break;
    }
  }
}

function bump(view, px) { if (!view.reduceShake) view.shake = Math.max(view.shake, px); }
function dust(view, x, y, n) {
  for (let i = 0; i < n; i++) view.parts.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 0.8, y, z: 0.1, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: Math.random() * 1.5, life: 0.6 });
}

function updateEffects(view, g, dt) {
  view.t += dt;
  view.shake = Math.max(0, view.shake - dt * 40);
  const fall = (p) => { p.vz -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; };
  for (const d of view.debris) {
    if (d.z > 0) {
      fall(d);
      d.rot += d.vr * dt;
      if (d.z <= 0) { d.z = 0; d.vx = 0; d.vy = 0; d.vr = 0; }
    }
    d.life -= dt;
  }
  view.debris = view.debris.filter((d) => d.y > g.cart.y - 30 && d.life > 0);
  for (const p of view.parts) {
    if (p.kind === 'dust') { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; } else fall(p);
    p.life -= dt;
  }
  view.parts = view.parts.filter((p) => p.life > 0);
  for (const t of view.texts) { t.z += dt * 1.8; t.life -= dt; }
  view.texts = view.texts.filter((t) => t.life > 0);
  view.decals = view.decals.filter((d) => d.y > g.cart.y - 30);
}

// ---------- drawing ----------
export function render(ctx, view, g, dt, text = (s) => s) {
  updateEffects(view, g, dt);
  const { W, H, s } = view;
  const c = g.cart;
  const tr = g.track;
  // The camera follows the road ahead and, partly, the cart.
  const wantX = tr.center(c.y + 3) * 0.55 + c.x * 0.45;
  view.camX += (wantX - view.camX) * Math.min(1, dt * 4);
  if (!Number.isFinite(view.camX) || dt === 0) view.camX = wantX;
  const camY = c.y;
  const sx = (x) => W / 2 + (x - view.camX) * s;
  const sy = (y) => view.cartSy - (y - camY) * s;
  const yFar = camY + view.cartSy / s + 2;
  const yNear = camY - (H - view.cartSy) / s - 2;

  ctx.save();
  if (view.shake > 0) ctx.translate((Math.random() - 0.5) * view.shake, (Math.random() - 0.5) * view.shake);

  drawGround(ctx, view, tr, sx, sy, yNear, yFar);
  drawSides(ctx, view, tr, sx, sy, yNear, yFar);

  for (const d of view.decals) drawDecal(ctx, d, sx, sy, s);

  // Everything standing on the road, far to near.
  const list = [];
  for (const e of tr.entities) {
    if (e.y < yNear || e.y > yFar) continue;
    if (e.kind === 'item' && e.taken) continue;
    list.push({ y: e.y, draw: () => drawEntity(ctx, e, sx(e.x), sy(e.y), s, view.t) });
  }
  for (const d of view.debris) list.push({ y: d.y, draw: () => drawDebris(ctx, d, sx, sy, s) });
  list.push({ y: c.y, draw: () => drawCart(ctx, g, sx(c.x), sy(c.y), s, view.t) });
  list.sort((a, b) => b.y - a.y);
  for (const o of list) o.draw();

  drawFinishArch(ctx, tr, sx, sy, s, text);
  drawParticles(ctx, view, sx, sy, s);
  drawTexts(ctx, view, sx, sy, s, text);
  drawSpeedLines(ctx, view, g);
  ctx.restore();
}

function drawGround(ctx, view, tr, sx, sy, y0, y1) {
  const { W, s } = view;
  const STRIP = 0.5;
  const start = Math.floor(y0 / STRIP) * STRIP;
  const strips = [];
  for (let y = start; y < y1; y += STRIP) {
    const kind = tr.sectionAt(y + STRIP / 2).kind;
    strips.push({ y, kind, top: sy(y + STRIP) - 0.5, bot: sy(y) + 0.5, ca: tr.center(y), cb: tr.center(y + STRIP), ha: tr.halfWidth(y), hb: tr.halfWidth(y + STRIP) });
  }
  // Layer by layer, so no strip paints over the one before it.
  for (const p of strips) { ctx.fillStyle = GROUND[p.kind]; ctx.fillRect(0, p.top, W, p.bot - p.top); }
  for (const { kind, top, bot, ca, cb, ha, hb } of strips) {
    const band = kind === 'street' || kind === 'finish' ? 1.35 : 0.45;
    quad(ctx, sx(ca - ha - band), bot, sx(ca + ha + band), bot, sx(cb + hb + band), top, sx(cb - hb - band), top,
      kind === 'street' || kind === 'finish' ? '#efe3cb' : kind === 'sidewalk' ? '#b39e7c' : kind === 'stairs' ? '#bba684' : '#c9b18f');
  }
  for (const { kind, top, bot, ca, cb, ha, hb } of strips) quad(ctx, sx(ca - ha), bot, sx(ca + ha), bot, sx(cb + hb), top, sx(cb - hb), top, ROAD[kind]);
  for (const { y, kind, top, bot, ca, cb, ha, hb } of strips) {
    if (kind === 'street') {
      for (const side of [-1, 1]) quad(ctx, sx(ca + side * ha), bot, sx(ca + side * (ha + 0.16)), bot, sx(cb + side * (hb + 0.16)), top, sx(cb + side * hb), top, '#d7d1c3');
      if (Math.floor(y / 1.5) % 2 === 0) quad(ctx, sx(ca - 0.07), bot, sx(ca + 0.07), bot, sx(cb + 0.07), top, sx(cb - 0.07), top, '#f6f1e3');
      // the odd patch of repaired asphalt
      const h = hash2(Math.floor(y * 2), 77);
      if (h < 0.05) { ctx.fillStyle = 'rgba(30, 32, 40, 0.18)'; ctx.fillRect(sx(ca + (h * 20 - 0.5) * ha), top, s * 1.2, (bot - top) * 1.4); }
    } else if (kind === 'sidewalk') {
      const k = Math.round(y / STRIP);
      ctx.strokeStyle = 'rgba(120, 96, 64, 0.28)'; ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath(); ctx.moveTo(sx(ca - ha), bot); ctx.lineTo(sx(ca + ha), bot);
      for (let x = -ha + ((k % 2) * 0.5); x < ha; x += 1) { ctx.moveTo(sx(ca + x), bot); ctx.lineTo(sx(cb + x), top); }
      ctx.stroke();
    } else if (kind === 'stairs') {
      const k = Math.floor((y + STRIP) / STEP_LENGTH);
      const yy = k * STEP_LENGTH;
      if (yy > y && yy <= y + STRIP) {
        const t = sy(yy), cc = tr.center(yy), hh = tr.halfWidth(yy);
        ctx.fillStyle = 'rgba(90, 70, 45, 0.45)';
        ctx.fillRect(sx(cc - hh), t, hh * 2 * s, s * 0.2);
        ctx.fillStyle = 'rgba(255, 250, 235, 0.6)';
        ctx.fillRect(sx(cc - hh), t - s * 0.05, hh * 2 * s, s * 0.06);
      }
    } else if (kind === 'market') {
      const k = Math.round(y / STRIP);
      ctx.fillStyle = 'rgba(80, 60, 40, 0.16)';
      for (let i = -7; i <= 7; i++) {
        const off = i * 0.62 + (k % 2) * 0.31;
        if (Math.abs(off) > ha - 0.25) continue;
        ctx.beginPath(); ctx.ellipse(sx(ca + off), (top + bot) / 2, s * 0.25, s * 0.17, 0, 0, 7); ctx.fill();
      }
    }
    if (y <= 4 && y + STRIP > 4) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx(ca - ha), sy(4) - s * 0.1, ha * 2 * s, s * 0.2); }
    if (y + STRIP > TRACK_LENGTH && y < TRACK_LENGTH + 1.5) {
      const n = Math.ceil(ha * 2 / 0.5);
      for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#1e1e24' : '#ffffff';
        ctx.fillRect(sx(ca - ha + i * 0.5), sy(TRACK_LENGTH + (j + 1) * 0.5), 0.5 * s + 1, 0.5 * s + 1);
      }
    }
  }
}

function drawSides(ctx, view, tr, sx, sy, y0, y1) {
  const { W, s } = view;
  const BLOCK = 6.5;
  for (let k = Math.floor(y0 / BLOCK) - 1; k * BLOCK < y1; k++) {
    const ya = k * BLOCK, yb = ya + BLOCK;
    const kind = tr.sectionAt(ya + BLOCK / 2).kind;
    for (const side of [-1, 1]) {
      const h = hash2(k, side);
      const edge = (y, off) => sx(tr.center(y) + side * (tr.halfWidth(y) + off));
      const inner = kind === 'street' || kind === 'finish' ? 1.45 : kind === 'market' ? 2.1 : kind === 'stairs' ? 0.8 : 1.6;
      const gap = 0.22;
      const outerX = side < 0 ? -10 : W + 10;
      const pa = ya + gap, pb = yb - gap;
      const top = sy(pb), bot = sy(pa);
      const wall = WALLS[Math.floor(h * WALLS.length)];
      const roof = ROOFS[Math.floor(hash2(k, side * 7) * ROOFS.length)];
      const variant = kind === 'market' ? 0 : hash2(k, side * 13);
      const a = edge(pa, inner), b = edge(pb, inner);
      const face = s * 0.55 * side;
      if (variant < 0.62) {
        // Tiled roof: two slopes, the far one in shade, rows of tiles parallel to the street.
        quad(ctx, a, bot, outerX, bot, outerX, top, b, top, roof);
        const r1 = edge(pa, inner + 2.3) + face, r2 = edge(pb, inner + 2.3) + face;
        quad(ctx, r1, bot, outerX, bot, outerX, top, r2, top, 'rgba(60, 20, 10, 0.18)');
        ctx.strokeStyle = 'rgba(60, 20, 10, 0.2)'; ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.beginPath();
        for (let o = 0.45; o < 6; o += 0.45) { ctx.moveTo(edge(pa, inner + o) + face, bot); ctx.lineTo(edge(pb, inner + o) + face, top); }
        ctx.stroke();
        line(ctx, r1, bot, r2, top, 'rgba(255, 235, 210, 0.45)', Math.max(2, s * 0.07));
        if (h > 0.45) {
          const yy = ya + BLOCK * (0.3 + 0.4 * hash2(k, 3));
          const x = edge(yy, inner + 1.2 + h) + face;
          ctx.fillStyle = '#7d4a3a'; ctx.fillRect(x - s * 0.2, sy(yy) - s * 0.55, s * 0.4, s * 0.55);
          ctx.fillStyle = '#4a2c22'; ctx.fillRect(x - s * 0.2, sy(yy) - s * 0.55, s * 0.4, s * 0.1);
        }
      } else if (variant < 0.86) {
        // Flat roof terrace: a parapet, a water tank, plants and the washing.
        quad(ctx, a, bot, outerX, bot, outerX, top, b, top, '#e7dccb');
        quad(ctx, a + face, bot, a + face + side * s * 0.15, bot, b + face + side * s * 0.15, top, b + face, top, wall);
        const yy = (pa + pb) / 2;
        const tx = edge(yy, inner + 2.4) + face;
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(tx + s * 0.1, sy(yy) + s * 0.1, s * 0.5, s * 0.25, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5f9ec7'; ctx.beginPath(); ctx.ellipse(tx, sy(yy), s * 0.45, s * 0.45, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#82bde3'; ctx.beginPath(); ctx.ellipse(tx - s * 0.08, sy(yy) - s * 0.08, s * 0.28, s * 0.28, 0, 0, 7); ctx.fill();
        const l1 = edge(pa + 0.8, inner + 1), l2 = edge(pb - 0.8, inner + 1);
        line(ctx, l1 + face, sy(pa + 0.8), l2 + face, sy(pb - 0.8), 'rgba(80, 80, 80, 0.6)', 1.5);
        const cloth = ['#e63946', '#ffd23f', '#3fb6ff', '#ffffff', '#8f6bff'];
        for (let i = 0; i < 4; i++) {
          const f = (i + 0.5) / 4, cy = pa + 0.8 + f * (pb - pa - 1.6);
          const cx = edge(cy, inner + 1) + face;
          ctx.fillStyle = cloth[(k + i) % 5]; ctx.fillRect(cx - s * 0.18, sy(cy) - s * 0.05, s * 0.36, s * 0.42);
        }
      } else {
        // A little garden behind a wall.
        quad(ctx, a, bot, outerX, bot, outerX, top, b, top, '#8fbf5a');
        quad(ctx, a, bot, a + side * s * 0.2, bot, b + side * s * 0.2, top, b, top, '#c8b38f');
        for (let i = 0; i < 2; i++) {
          const yy = pa + 1.4 + i * 3.2;
          const x = edge(yy, inner + 1.4 + hash2(k, i) * 1.5);
          ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(x + s * 0.2, sy(yy) + s * 0.1, s * 0.8, s * 0.35, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#4f8a3a'; ctx.beginPath(); ctx.arc(x, sy(yy) - s * 0.5, s * 0.75, 0, 7); ctx.fill();
          ctx.fillStyle = '#6aa84f'; ctx.beginPath(); ctx.arc(x - s * 0.2, sy(yy) - s * 0.7, s * 0.4, 0, 7); ctx.fill();
          if (kind !== 'stairs') { ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.arc(x + s * 0.25, sy(yy) - s * 0.35, s * 0.09, 0, 7); ctx.arc(x - s * 0.3, sy(yy) - s * 0.2, s * 0.09, 0, 7); ctx.fill(); }
        }
      }
      if (variant < 0.86) {
        // The facade facing the street: wall, windows with shutters, a door.
        quad(ctx, a, bot, a + face, bot, b + face, top, b, top, wall);
        for (let i = 0; i < 3; i++) {
          const yy = pa + (i + 0.5) * (pb - pa) / 3;
          const x = edge(yy, inner) + face * 0.5;
          if (i === 1 && h < 0.5) { ctx.fillStyle = '#6b3f2a'; ctx.fillRect(x - s * 0.13, sy(yy) - s * 0.35, s * 0.26, s * 0.7); continue; }
          ctx.fillStyle = '#3d6b7d'; ctx.fillRect(x - s * 0.1, sy(yy) - s * 0.28, s * 0.2, s * 0.56);
          ctx.fillStyle = 'rgba(42, 120, 80, 0.9)'; ctx.fillRect(x - s * 0.14, sy(yy) - s * 0.36, s * 0.28, s * 0.07); ctx.fillRect(x - s * 0.14, sy(yy) + s * 0.29, s * 0.28, s * 0.07);
        }
      }
      if (kind === 'market') {
        const [c1, c2] = AWNINGS[Math.floor(hash2(k, side * 3) * AWNINGS.length)];
        const ia = edge(ya + 0.5, 0.25), ib = edge(yb - 0.5, 0.25), oa = edge(ya + 0.5, 1.9), ob = edge(yb - 0.5, 1.9);
        quad(ctx, ia, sy(ya + 0.5), oa, sy(ya + 0.5), ob, sy(yb - 0.5), ib, sy(yb - 0.5), '#8b5e3c');
        const stripes = 6;
        for (let i = 0; i < stripes; i++) {
          const y2 = ya + 0.5 + (i * (BLOCK - 1)) / stripes, y3 = y2 + (BLOCK - 1) / stripes;
          quad(ctx, edge(y2, 0.15), sy(y2) - s * 0.9, edge(y2, 1.9), sy(y2) - s * 0.9, edge(y3, 1.9), sy(y3) - s * 0.9, edge(y3, 0.15), sy(y3) - s * 0.9, i % 2 ? c1 : c2);
        }
        const fruit = ['#ff6b35', '#ffd23f', '#7bc043', '#e63946'];
        for (let i = 0; i < 3; i++) {
          const yy = ya + 1 + i * 1.7;
          const x = edge(yy, 0.75);
          ctx.fillStyle = '#a0703f'; ctx.fillRect(x - s * 0.35, sy(yy) - s * 0.3, s * 0.7, s * 0.3);
          ctx.fillStyle = fruit[(k + i) % 4];
          for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(x - s * 0.2 + j * s * 0.2, sy(yy) - s * 0.36, s * 0.11, 0, 7); ctx.fill(); }
        }
      } else if (kind === 'stairs') {
        for (let i = 0; i < 2; i++) {
          const yy = ya + 1.5 + i * 3;
          const x = edge(yy, 0.35);
          ctx.fillStyle = '#b5583b'; ctx.fillRect(x - s * 0.18, sy(yy) - s * 0.3, s * 0.36, s * 0.3);
          ctx.fillStyle = ['#e63946', '#ffd23f', '#f78fb3'][Math.abs(k) % 3];
          for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(x - s * 0.12 + j * s * 0.12, sy(yy) - s * 0.38, s * 0.08, 0, 7); ctx.fill(); }
        }
      } else if (kind === 'sidewalk') {
        const yy = ya + BLOCK / 2;
        const x = edge(yy, 0.9);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(x + s * 0.15, sy(yy) + s * 0.05, s * 0.6, s * 0.22, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#4f8a3a'; ctx.beginPath(); ctx.arc(x, sy(yy) - s * 0.7, s * 0.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#6aa84f'; ctx.beginPath(); ctx.arc(x - s * 0.15, sy(yy) - s * 0.85, s * 0.32, 0, 7); ctx.fill();
      } else if (kind === 'street' && h < 0.55) {
        const yy = ya + BLOCK / 2;
        const x = edge(yy, 1.05);
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x, sy(yy), s * 0.16, s * 0.08, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#3b3f4a'; ctx.lineWidth = Math.max(2, s * 0.08);
        ctx.beginPath(); ctx.moveTo(x, sy(yy)); ctx.lineTo(x, sy(yy) - s * 1.6); ctx.lineTo(x - side * s * 0.4, sy(yy) - s * 1.7); ctx.stroke();
        ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x - side * s * 0.42, sy(yy) - s * 1.62, s * 0.1, 0, 7); ctx.fill();
      }
    }
  }
}

function drawEntity(ctx, e, x, y, s, t) {
  if (e.kind === 'item') {
    const bob = Math.sin(t * 4 + e.id) * s * 0.06;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.36, s * 0.12, 0, 0, 7); ctx.fill();
    // a pulsing ring on the ground so pickups read at a glance
    const pulse = 0.5 + 0.5 * Math.sin(t * 5 + e.id);
    ctx.strokeStyle = `rgba(255, 226, 90, ${0.55 + 0.35 * pulse})`;
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath(); ctx.ellipse(x, y, s * (0.48 + 0.06 * pulse), s * (0.2 + 0.03 * pulse), 0, 0, 7); ctx.stroke();
    ctx.save();
    ctx.translate(x, y - s * 0.05 + bob);
    if (e.type === 'balloon') {
      ctx.strokeStyle = '#6b5b53'; ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-s * 0.1, -s * 0.4, 0, -s * 0.7); ctx.stroke();
      drawBalloon(ctx, 0, -s * 0.98, s * 1.1, BALLOON_COLORS[e.variant % 5]);
    } else {
      drawItem(ctx, { type: e.type, goods: GOODS_BY_VARIANT[e.variant % GOODS_BY_VARIANT.length] }, s * 0.95);
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (e.knocked) { ctx.translate(e.knockDir * s * 0.5, -s * 0.2); ctx.rotate(e.knockDir * 1.2); ctx.globalAlpha = 0.8; }
  switch (e.type) {
    case 'cone':
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.34, s * 0.12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff7b00'; ctx.fillRect(-s * 0.32, -s * 0.08, s * 0.64, s * 0.08);
      ctx.beginPath(); ctx.moveTo(-s * 0.22, -s * 0.08); ctx.lineTo(0, -s * 0.72); ctx.lineTo(s * 0.22, -s * 0.08); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.28); ctx.lineTo(-s * 0.08, -s * 0.46); ctx.lineTo(s * 0.08, -s * 0.46); ctx.lineTo(s * 0.15, -s * 0.28); ctx.fill();
      break;
    case 'bin':
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.16, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.roundRect(-s * 0.4, -s * 1.05, s * 0.8, s * 1.05, s * 0.06); ctx.fill();
      ctx.fillStyle = '#1b5e20'; ctx.fillRect(-s * 0.46, -s * 1.15, s * 0.92, s * 0.16);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-s * 0.28, 0, s * 0.08, 0, 7); ctx.arc(s * 0.28, 0, s * 0.08, 0, 7); ctx.fill();
      break;
    case 'crate':
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-s * 0.5, -s * 0.05, s * 1.0, s * 0.12);
      ctx.fillStyle = '#c08a4a'; ctx.fillRect(-s * 0.48, -s * 0.9, s * 0.96, s * 0.9);
      ctx.strokeStyle = '#7a5025'; ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.strokeRect(-s * 0.48, -s * 0.9, s * 0.96, s * 0.9);
      ctx.beginPath(); ctx.moveTo(-s * 0.48, -s * 0.9); ctx.lineTo(s * 0.48, 0); ctx.moveTo(-s * 0.48, -s * 0.45); ctx.lineTo(s * 0.48, -s * 0.45); ctx.stroke();
      ctx.fillStyle = '#ff9f1c';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-s * 0.25 + i * s * 0.25, -s * 0.95, s * 0.13, 0, 7); ctx.fill(); }
      break;
    case 'bollard':
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.26, s * 0.1, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a3f4b'; ctx.fillRect(-s * 0.16, -s * 0.85, s * 0.32, s * 0.85);
      ctx.fillStyle = '#ffcc00'; ctx.fillRect(-s * 0.16, -s * 0.62, s * 0.32, s * 0.1);
      ctx.fillStyle = '#4b5160'; ctx.beginPath(); ctx.arc(0, -s * 0.85, s * 0.17, Math.PI, 0); ctx.fill();
      break;
    case 'scooter':
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.55, s * 0.15, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-s * 0.36, -s * 0.12, s * 0.13, 0, 7); ctx.arc(s * 0.36, -s * 0.12, s * 0.13, 0, 7); ctx.fill();
      ctx.fillStyle = '#5ec8e5'; ctx.beginPath(); ctx.roundRect(-s * 0.45, -s * 0.5, s * 0.9, s * 0.32, s * 0.14); ctx.fill();
      ctx.fillStyle = '#2b2d42'; ctx.fillRect(-s * 0.2, -s * 0.6, s * 0.4, s * 0.1);
      ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath(); ctx.moveTo(s * 0.32, -s * 0.45); ctx.lineTo(s * 0.4, -s * 0.85); ctx.lineTo(s * 0.2, -s * 0.88); ctx.stroke();
      break;
    case 'pothole':
      ctx.fillStyle = '#2a2b30';
      ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.5, s * 0.3, 0.1, 0, 7); ctx.fill();
      ctx.fillStyle = '#44454d'; ctx.beginPath(); ctx.ellipse(-s * 0.06, -s * 0.12, s * 0.34, s * 0.16, 0.1, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.05); ctx.lineTo(s * 0.7, s * 0.05); ctx.moveTo(-s * 0.45, 0); ctx.lineTo(-s * 0.62, -s * 0.15); ctx.stroke();
      break;
    case 'puddle': {
      ctx.fillStyle = '#2d2a3a';
      ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.78, s * 0.42, 0, 0, 7); ctx.fill();
      const grad = ctx.createLinearGradient(-s * 0.6, 0, s * 0.6, 0);
      grad.addColorStop(0, 'rgba(255, 80, 200, 0.5)'); grad.addColorStop(0.5, 'rgba(80, 220, 255, 0.5)'); grad.addColorStop(1, 'rgba(255, 230, 80, 0.5)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(-s * 0.05, -s * 0.1, s * 0.5, s * 0.2, 0.2 + Math.sin(t * 2) * 0.1, 0, 7); ctx.fill();
      break;
    }
    case 'ramp':
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-s * 0.65, -s * 0.05, s * 1.3, s * 0.15);
      ctx.fillStyle = '#c99a5b';
      ctx.beginPath(); ctx.moveTo(-s * 0.62, 0); ctx.lineTo(s * 0.62, 0); ctx.lineTo(s * 0.55, -s * 1.1); ctx.lineTo(-s * 0.55, -s * 1.1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a6432'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 2; i++) { const yy = -s * (0.3 + i * 0.42); ctx.beginPath(); ctx.moveTo(-s * 0.22, yy); ctx.lineTo(0, yy - s * 0.2); ctx.lineTo(s * 0.22, yy); ctx.lineTo(s * 0.12, yy); ctx.lineTo(0, yy - s * 0.1); ctx.lineTo(-s * 0.12, yy); ctx.fill(); }
      break;
    default: break;
  }
  ctx.restore();
}

const GOODS_BY_VARIANT = ['cereal', 'roll', 'can', 'bread', 'cheese', 'soda', 'pineapple', 'detergent'];

export function drawCart(ctx, g, x, y, s, t) {
  const c = g.cart;
  const lift = c.z * s;
  // Shadow on the ground, smaller as the cart flies higher.
  const sh = Math.max(0.4, 1 - c.z * 0.25);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.1, s * 0.62 * sh, s * 0.2 * sh, 0, 0, 7); ctx.fill();

  ctx.save();
  ctx.translate(x, y - lift);
  ctx.rotate(Math.sin(c.spin) * 0.45 + c.vx * 0.012);
  const w = s * 1.0, bh = s * RIM;

  // Back wheels and the frame below the basket.
  ctx.fillStyle = '#26262c';
  for (const dx of [-0.42, 0.42]) { ctx.beginPath(); ctx.ellipse(dx * s, s * 0.14, s * 0.09, s * 0.12, 0, 0, 7); ctx.fill(); }
  ctx.strokeStyle = '#8d96a8'; ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath(); ctx.moveTo(-w * 0.42, s * 0.08); ctx.lineTo(w * 0.42, s * 0.08); ctx.stroke();

  // The basket's inside (darker) behind the load.
  ctx.fillStyle = '#5d6475';
  ctx.beginPath(); ctx.moveTo(-w * 0.55, -bh); ctx.lineTo(w * 0.55, -bh); ctx.lineTo(w * 0.47, 0); ctx.lineTo(-w * 0.47, 0); ctx.closePath(); ctx.fill();

  // The pile, bending with the tilt.
  const tilt = g.tilt;
  const shiver = g.wobble > 0.7 ? Math.sin(t * 40) * 0.02 * g.wobble : 0;
  let base = 0.04;
  g.stack.forEach((it, i) => {
    const b = base;
    const off = Math.sin(tilt + shiver) * b * s * (1 + 0.1 * b) + (hash2(i, it.h * 100) - 0.5) * s * 0.18;
    ctx.save();
    ctx.translate(off, -b * s);
    ctx.rotate((tilt + shiver) * (0.5 + 0.12 * b) + (hash2(i, 9) - 0.5) * 0.25);
    drawItem(ctx, it, s);
    ctx.restore();
    base += itemHeight(it);
  });

  // The wire front of the basket over the load.
  ctx.strokeStyle = 'rgba(214, 222, 236, 0.95)';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath(); ctx.moveTo(-w * 0.55, -bh); ctx.lineTo(w * 0.55, -bh); ctx.lineTo(w * 0.47, 0); ctx.lineTo(-w * 0.47, 0); ctx.closePath(); ctx.stroke();
  ctx.lineWidth = Math.max(1, s * 0.025);
  for (let i = 1; i < 6; i++) {
    const f = i / 6;
    ctx.beginPath(); ctx.moveTo(-w * 0.55 + f * w * 1.1, -bh); ctx.lineTo(-w * 0.47 + f * w * 0.94, 0); ctx.stroke();
  }
  for (let j = 1; j < 3; j++) {
    const yy = -bh * j / 3, half = w * (0.47 + 0.08 * j / 3);
    ctx.beginPath(); ctx.moveTo(-half, yy); ctx.lineTo(half, yy); ctx.stroke();
  }
  // Handle with its red grip, nearest to us.
  ctx.strokeStyle = '#8d96a8'; ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath(); ctx.moveTo(-w * 0.5, -bh * 0.2); ctx.lineTo(-w * 0.52, s * 0.3); ctx.moveTo(w * 0.5, -bh * 0.2); ctx.lineTo(w * 0.52, s * 0.3); ctx.stroke();
  ctx.strokeStyle = '#e63946'; ctx.lineWidth = Math.max(3, s * 0.12); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-w * 0.52, s * 0.3); ctx.lineTo(w * 0.52, s * 0.3); ctx.stroke();
  ctx.lineCap = 'butt';

  // Balloons tied to the handle, floating above the pile.
  const n = g.balloons.length;
  if (n) {
    const top = Math.max(1.4, base + 0.9);
    ctx.lineWidth = Math.max(1, s * 0.02);
    g.balloons.forEach((b, i) => {
      const spread = (i - (n - 1) / 2) * 0.42;
      const bx = (spread + Math.sin(t * 2.2 + i) * 0.12 - c.vx * 0.04) * s;
      // Above the pile, but never off the top of the screen.
      const by = Math.max(-(top + (i % 2) * 0.35 + Math.sin(t * 3 + i * 1.7) * 0.06) * s, 110 + (i % 2) * s * 0.35 - (y - lift));
      ctx.strokeStyle = 'rgba(70, 60, 55, 0.8)';
      ctx.beginPath(); ctx.moveTo((i % 2 ? 0.45 : -0.45) * w, s * 0.28); ctx.quadraticCurveTo(bx * 0.4, by * 0.5, bx, by + s * 0.32); ctx.stroke();
      drawBalloon(ctx, bx, by, s * 1.05, BALLOON_COLORS[b.color % 5]);
    });
  }
  // Oil: a slick sheen on the wheels.
  if (c.oil > 0) {
    ctx.fillStyle = 'rgba(120, 220, 255, 0.35)';
    ctx.beginPath(); ctx.ellipse(0, s * 0.14, w * 0.6, s * 0.12, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawDebris(ctx, d, sx, sy, s) {
  const x = sx(d.x), y = sy(d.y);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.3, s * 0.1, 0, 0, 7); ctx.fill();
  ctx.save();
  ctx.translate(x, y - d.z * s);
  ctx.rotate(d.rot);
  // Once it lies on the road it fades: it is gone, not something to grab.
  ctx.globalAlpha = Math.min(d.z > 0 ? 1 : 0.55, d.life);
  drawItem(ctx, d.it, s * (d.z > 0 ? 0.9 : 0.75));
  ctx.restore();
}

function drawDecal(ctx, d, sx, sy, s) {
  if (d.kind !== 'yolk') return;
  const x = sx(d.x), y = sy(d.y);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(x, y, s * d.r, s * d.r * 0.5, 0.3, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffb703';
  ctx.beginPath(); ctx.arc(x + s * 0.05, y, s * 0.15, 0, 7); ctx.fill();
}

function drawFinishArch(ctx, tr, sx, sy, s, text) {
  const y = TRACK_LENGTH + 1.6;
  const top = sy(y);
  if (top < -s * 4 || top > ctx.canvas.height + s * 3) return;
  const c = tr.center(y), hw = tr.halfWidth(y);
  const l = sx(c - hw - 0.3), r = sx(c + hw + 0.3);
  ctx.fillStyle = '#3b3f4a';
  ctx.fillRect(l - s * 0.1, top - s * 3, s * 0.2, s * 3);
  ctx.fillRect(r - s * 0.1, top - s * 3, s * 0.2, s * 3);
  ctx.fillStyle = '#e63946';
  ctx.beginPath(); ctx.roundRect(l, top - s * 3.4, r - l, s * 0.95, s * 0.2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.round(s * 0.62)}px "Lilita One", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text('CHECKOUT'), (l + r) / 2, top - s * 2.9);
}

function drawParticles(ctx, view, sx, sy, s) {
  for (const p of view.parts) {
    const x = sx(p.x), y = sy(p.y) - p.z * s;
    if (p.kind === 'dust') {
      ctx.fillStyle = `rgba(200, 190, 170, ${Math.max(0, p.life)})`;
      ctx.beginPath(); ctx.arc(x, y, s * (0.25 - p.life * 0.15), 0, 7); ctx.fill();
    } else if (p.kind === 'star') {
      ctx.fillStyle = `rgba(255, 240, 150, ${Math.max(0, p.life * 2)})`;
      ctx.fillRect(x - s * 0.05, y - s * 0.05, s * 0.1, s * 0.1);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(x - s * 0.06, y - s * 0.03, s * 0.12, s * 0.07);
    }
  }
}

function drawTexts(ctx, view, sx, sy, s, text) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tx of view.texts) {
    const x = sx(tx.x) + (tx.bad ? s * 0.9 : 0), y = sy(tx.y) - tx.z * s;
    ctx.globalAlpha = Math.min(1, tx.life * 2);
    ctx.font = `${Math.round(s * 0.55)}px "Lilita One", system-ui, sans-serif`;
    ctx.lineWidth = Math.max(3, s * 0.12);
    ctx.strokeStyle = tx.bad ? '#8b1e2d' : '#1d3557';
    const label = tx.text;
    ctx.strokeText(label, x, y);
    ctx.fillStyle = tx.color;
    ctx.fillText(label, x, y);
    if (tx.sub) {
      ctx.font = `${Math.round(s * 0.3)}px "Lilita One", system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.strokeText(tx.sub, x, y + s * 0.42);
      ctx.fillText(tx.sub, x, y + s * 0.42);
    }
  }
  ctx.globalAlpha = 1;
}

function drawSpeedLines(ctx, view, g) {
  const v = g.cart.v;
  if (v < 13) return;
  const a = Math.min(0.35, (v - 13) * 0.06);
  ctx.strokeStyle = `rgba(255,255,255,${a})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const x = (hash2(i, 5) < 0.5 ? hash2(i, 1) * 0.16 : 0.84 + hash2(i, 1) * 0.16) * view.W;
    const y = ((view.t * v * 60 + hash2(i, 2) * view.H) % (view.H + 120)) - 60;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40 + v * 2); ctx.stroke();
  }
}

function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
}

function line(ctx, x1, y1, x2, y2, stroke, w) {
  ctx.strokeStyle = stroke; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
