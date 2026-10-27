// Drawings of the things you can grab, in canvas paths (no image files).
// Each draws centred on (0, 0) with its base at y = 0 and height s * h,
// where s is the size of one world unit in pixels.

export const BALLOON_COLORS = ['#ff4f6d', '#ffcf3a', '#3fb6ff', '#8f6bff', '#3ddc84'];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function outline(ctx, s) {
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.strokeStyle = 'rgba(40, 24, 18, 0.85)';
  ctx.stroke();
}

const GOODS_DRAW = {
  cereal(ctx, s) {
    const w = s * 0.5, h = s * 0.68;
    rr(ctx, -w / 2, -h, w, h, s * 0.04);
    ctx.fillStyle = '#ff7a2f'; ctx.fill(); outline(ctx, s);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.ellipse(0, -h * 0.55, w * 0.32, h * 0.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-w / 2 + s * 0.04, -h + s * 0.06, w - s * 0.08, h * 0.16);
  },
  roll(ctx, s) {
    const w = s * 0.62, h = s * 0.5;
    rr(ctx, -w / 2, -h, w, h, s * 0.18);
    ctx.fillStyle = '#f4f6ff'; ctx.fill(); outline(ctx, s);
    ctx.fillStyle = '#c9d0ee';
    ctx.beginPath(); ctx.ellipse(w * 0.32, -h / 2, s * 0.08, h * 0.3, 0, 0, 7); ctx.fill();
  },
  can(ctx, s) {
    const w = s * 0.36, h = s * 0.4;
    rr(ctx, -w / 2, -h, w, h, s * 0.05);
    ctx.fillStyle = '#d62f2f'; ctx.fill(); outline(ctx, s);
    ctx.fillStyle = '#ffe9b0'; ctx.fillRect(-w / 2, -h * 0.68, w, h * 0.36);
    ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.arc(0, -h * 0.5, s * 0.06, 0, 7); ctx.fill();
  },
  bread(ctx, s) {
    const w = s * 0.86, h = s * 0.36;
    ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, 7);
    ctx.fillStyle = '#e3a453'; ctx.fill(); outline(ctx, s);
    ctx.strokeStyle = '#a8662a'; ctx.lineWidth = Math.max(1, s * 0.04);
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.22 - s * 0.06, -h * 0.75); ctx.lineTo(i * w * 0.22 + s * 0.06, -h * 0.3); ctx.stroke(); }
  },
  cheese(ctx, s) {
    const w = s * 0.6, h = s * 0.34;
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2, -h * 0.55); ctx.lineTo(-w / 2, -h); ctx.closePath();
    ctx.fillStyle = '#ffd23f'; ctx.fill(); outline(ctx, s);
    ctx.fillStyle = '#e0a800';
    for (const [x, y, r] of [[-0.12, -0.45, 0.05], [0.12, -0.25, 0.04], [0.02, -0.6, 0.035]]) { ctx.beginPath(); ctx.arc(x * s, y * h / 0.6 * 0.6, r * s, 0, 7); ctx.fill(); }
  },
  soda(ctx, s) {
    const w = s * 0.3, h = s * 0.62;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h * 0.62); ctx.quadraticCurveTo(-w / 2, -h * 0.78, -w * 0.18, -h * 0.86);
    ctx.lineTo(-w * 0.18, -h); ctx.lineTo(w * 0.18, -h); ctx.lineTo(w * 0.18, -h * 0.86);
    ctx.quadraticCurveTo(w / 2, -h * 0.78, w / 2, -h * 0.62); ctx.lineTo(w / 2, 0); ctx.closePath();
    ctx.fillStyle = '#39b54a'; ctx.fill(); outline(ctx, s);
    ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2, -h * 0.5, w, h * 0.18);
  },
  pineapple(ctx, s) {
    const w = s * 0.42, h = s * 0.46;
    ctx.fillStyle = '#3c9a3c';
    ctx.beginPath(); ctx.moveTo(-w * 0.3, -h); ctx.lineTo(-w * 0.45, -s * 0.72); ctx.lineTo(-w * 0.08, -h - s * 0.04); ctx.lineTo(0, -s * 0.74); ctx.lineTo(w * 0.1, -h - s * 0.04); ctx.lineTo(w * 0.45, -s * 0.72); ctx.lineTo(w * 0.3, -h); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, 7);
    ctx.fillStyle = '#f0b429'; ctx.fill(); outline(ctx, s);
    ctx.strokeStyle = '#b07610'; ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath(); ctx.moveTo(-w * 0.35, -h * 0.8); ctx.lineTo(w * 0.35, -h * 0.2); ctx.moveTo(w * 0.35, -h * 0.8); ctx.lineTo(-w * 0.35, -h * 0.2); ctx.stroke();
  },
  detergent(ctx, s) {
    const w = s * 0.46, h = s * 0.6;
    rr(ctx, -w / 2, -h * 0.86, w, h * 0.86, s * 0.08);
    ctx.fillStyle = '#2f80ed'; ctx.fill(); outline(ctx, s);
    ctx.fillStyle = '#f2994a'; ctx.fillRect(-w * 0.18, -h, w * 0.36, h * 0.16);
    ctx.fillStyle = '#e8f1ff'; ctx.beginPath(); ctx.arc(0, -h * 0.42, w * 0.22, 0, 7); ctx.fill();
  },
};

export function drawItem(ctx, it, s) {
  switch (it.type) {
    case 'melon': {
      const w = s * 0.82, h = s * 0.72;
      ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, 7);
      ctx.fillStyle = '#2f9e44'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = '#1b6b2c'; ctx.lineWidth = s * 0.08;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * w * 0.2, -h / 2, w * 0.06, h * 0.55, 0, 0, 7); ctx.stroke(); }
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, 7); outline(ctx, s);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-w * 0.2, -h * 0.72, w * 0.12, h * 0.08, -0.5, 0, 7); ctx.fill();
      break;
    }
    case 'oil': {
      const w = s * 0.32, h = s * 0.62;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h * 0.55); ctx.lineTo(-w * 0.16, -h * 0.82); ctx.lineTo(-w * 0.16, -h);
      ctx.lineTo(w * 0.16, -h); ctx.lineTo(w * 0.16, -h * 0.82); ctx.lineTo(w / 2, -h * 0.55); ctx.lineTo(w / 2, 0); ctx.closePath();
      ctx.fillStyle = '#c8b400'; ctx.fill(); outline(ctx, s);
      ctx.fillStyle = '#6b8e23'; ctx.fillRect(-w / 2, -h * 0.45, w, h * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-w * 0.32, -h * 0.52, w * 0.12, h * 0.45);
      break;
    }
    case 'eggs': {
      const w = s * 0.72, h = s * 0.3;
      ctx.fillStyle = '#fbf5ea';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-w * 0.36 + i * w * 0.24, -h * 0.82, s * 0.1, s * 0.12, 0, 0, 7); ctx.fill(); outline(ctx, s * 0.7); }
      rr(ctx, -w / 2, -h * 0.62, w, h * 0.62, s * 0.05);
      ctx.fillStyle = '#c8a27a'; ctx.fill(); outline(ctx, s);
      ctx.strokeStyle = '#9b7550'; ctx.lineWidth = Math.max(1, s * 0.025);
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w / 2 + i * w / 4, -h * 0.6); ctx.lineTo(-w / 2 + i * w / 4, -h * 0.1); ctx.stroke(); }
      break;
    }
    case 'balloon': drawBalloon(ctx, 0, -s * 0.5, s, BALLOON_COLORS[(it.color ?? it.variant ?? 0) % 5]); break;
    case 'goods': (GOODS_DRAW[it.goods] || GOODS_DRAW.cereal)(ctx, s); break;
    default: break;
  }
}

export function drawBalloon(ctx, x, y, s, color) {
  const r = s * 0.3;
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r, 0, 0, 7);
  ctx.fillStyle = color; ctx.fill(); outline(ctx, s * 0.8);
  ctx.beginPath(); ctx.moveTo(x - s * 0.05, y + r + s * 0.04); ctx.lineTo(x, y + r - s * 0.02); ctx.lineTo(x + s * 0.05, y + r + s * 0.04); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.16, r * 0.26, -0.4, 0, 7); ctx.fill();
}

/** A small standalone icon (for the menu legend and the end screen). */
export function itemIcon(type, px = 48, goods = 'cereal') {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(px * dpr);
  c.style.width = c.style.height = `${px}px`;
  c.setAttribute('aria-hidden', 'true');
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const s = px * (type === 'eggs' || type === 'melon' ? 1.05 : 1.2);
  ctx.translate(px / 2, type === 'balloon' ? px * 0.9 : px * 0.5 + s * 0.3);
  if (type === 'balloon') {
    ctx.strokeStyle = '#6b5b53'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-4, -px * 0.2, 0, -px * 0.36); ctx.stroke();
    drawBalloon(ctx, 0, -px * 0.56, px * 1.05, BALLOON_COLORS[0]);
  } else drawItem(ctx, { type, goods }, s);
  return c;
}
