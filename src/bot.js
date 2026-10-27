// A simple driver for the menu's background ride, the trailer and the tests:
// heads for the next thing worth grabbing and swerves around obstacles and
// people crossing (where they will be when the cart gets there).
import { OBSTACLES } from './world.js';

export function botSteer(g, skill = 1) {
  const c = g.cart;
  const w = g.world;
  const ents = w.entities;
  let targetX = w.center(c.y + 4);
  let best = -Infinity;
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 11; i++) {
    const e = ents[i];
    const dy = e.y - c.y;
    if (dy < 0.6 || e.taken || e.kind !== 'item') continue;
    const reach = Math.abs(e.x - c.x) / Math.max(dy, 0.5);
    if (reach > 1.4) continue;
    const want = (e.type === 'eggs' ? 3 : e.type === 'melon' ? 2.4 : e.type === 'balloon' ? 2 : 1.5) - dy * 0.12 - reach;
    if (want > best) { best = want; targetX = e.x; }
  }
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 7; i++) {
    const e = ents[i];
    if (e.kind !== 'obstacle' || e.knocked || e.gone || e.y < c.y - 0.3) continue;
    const o = OBSTACLES[e.type];
    if (!o.solid && e.type !== 'pothole') continue;
    let ex = e.x;
    if (e.type === 'walker') {
      if (!e.going && e.y - c.y > e.wake) continue;
      ex = e.x - e.side * e.speed * ((e.y - c.y) / Math.max(c.v, 1));
    }
    const need = o.r + 1.0;
    if (Math.abs(targetX - ex) < need) {
      const side = Math.abs(c.x - ex) > 0.05 ? Math.sign(c.x - ex) : 1;
      const lim = w.halfWidth(e.y) - 0.6;
      const cx = w.center(e.y);
      let nx = ex + side * need;
      if (Math.abs(nx - cx) > lim) nx = ex - side * need;
      targetX = nx;
    }
  }
  const err = targetX - c.x - c.vx * 0.12;
  const dead = 0.12 + (1 - skill) * 0.4;
  return Math.abs(err) < dead ? 0 : Math.max(-1, Math.min(1, err * 1.6));
}
