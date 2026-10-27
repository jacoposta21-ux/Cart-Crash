// A simple driver for the menu's background ride, the trailer and the tests:
// heads for the next thing worth grabbing and swerves around obstacles.
import { OBSTACLES } from './track.js';

export function botSteer(g, skill = 1) {
  const c = g.cart;
  const tr = g.track;
  const ents = tr.entities;
  let targetX = tr.center(c.y + 4);
  let best = -Infinity;
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 11; i++) {
    const e = ents[i];
    const dy = e.y - c.y;
    if (dy < 0.6 || e.taken || e.knocked || e.kind !== 'item') continue;
    const reach = Math.abs(e.x - c.x) / Math.max(dy, 0.5);
    if (reach > 1.4) continue;
    const want = (e.type === 'eggs' ? 3 : e.type === 'melon' ? 2.4 : e.type === 'balloon' ? 2 : 1.5) - dy * 0.12 - reach;
    if (want > best) { best = want; targetX = e.x; }
  }
  // Swerve around what is close ahead.
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 5.5; i++) {
    const e = ents[i];
    if (e.kind !== 'obstacle' || e.knocked || e.y < c.y) continue;
    const o = OBSTACLES[e.type];
    if (!o.solid && e.type !== 'pothole') continue;
    const dx = targetX - e.x;
    const need = o.r + 0.95;
    if (Math.abs(dx) < need) {
      const side = Math.abs(c.x - e.x) > 0.05 ? Math.sign(c.x - e.x) : 1;
      const lim = tr.halfWidth(e.y) - 0.6;
      const cx = tr.center(e.y);
      let nx = e.x + side * need;
      if (Math.abs(nx - cx) > lim) nx = e.x - side * need;
      targetX = nx;
    }
  }
  const err = targetX - c.x - c.vx * 0.12;
  const dead = 0.12 + (1 - skill) * 0.4;
  return Math.abs(err) < dead ? 0 : Math.max(-1, Math.min(1, err * 1.6));
}
