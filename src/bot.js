// A simple driver for the menu's background ride, the trailer and the tests:
// heads for what is still on the list (and skips the rest when the cart is
// filling up), swerves round obstacles and people, jumps the low ones, stops
// at red lights and level crossings, and throws a treat to a dog that is
// about to catch up.
import { OBSTACLES, JUMPABLE, LIGHT_STOP, RAIL_STOP } from './world.js';
import { wanted, isNeeded, stackHeight, MAX_PILE, lightPhase } from './game.js';

export function botSteer(g, skill = 1) {
  const c = g.cart;
  const w = g.world;
  const ents = w.entities;
  const out = { steer: 0, brake: false, jump: false, drop: false };
  const roomy = stackHeight(g) < MAX_PILE - 1.2;
  let targetX = w.center(c.y + 4);
  let best = -Infinity;
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 12; i++) {
    const e = ents[i];
    const dy = e.y - c.y;
    if (dy < 0.6 || e.taken || e.kind !== 'item') continue;
    const key = e.type === 'goods' ? e.goods : e.type;
    const want = wanted(g, key);
    if (!want && !(roomy && e.type === 'balloon')) continue;
    const reach = Math.abs(e.x - c.x) / Math.max(dy, 0.5);
    if (reach > 1.4) continue;
    const score = 3 - dy * 0.12 - reach;
    if (score > best) { best = score; targetX = e.x; }
  }
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 8; i++) {
    const e = ents[i];
    if (e.kind === 'item' && e.y > c.y + 0.5 && !wanted(g, e.type === 'goods' ? e.goods : e.type) && e.type !== 'balloon' && !roomy && Math.abs(targetX - e.x) < 0.9) {
      targetX = e.x + (targetX >= e.x ? 1 : -1) * 1.1; // keep junk out of a full cart
      continue;
    }
    if (e.kind !== 'obstacle' || e.knocked || e.gone || e.y < c.y - 0.3) continue;
    const o = OBSTACLES[e.type];
    if (!o.solid && e.type !== 'pothole') continue;
    let ex = e.x;
    if (e.type === 'walker') {
      if (!e.going && e.y - c.y > e.wake) continue;
      if (e.mode === 'cross') ex = e.x - e.side * e.speed * ((e.y - c.y) / Math.max(c.v, 1));
    }
    const need = (o.w || o.r) + 1.0;
    if (Math.abs(targetX - ex) < need) {
      // Low and in the way: jump it when it is right ahead.
      const tta = (e.y - c.y) / Math.max(c.v, 1);
      if (JUMPABLE.has(e.type) && e.type !== 'cone' && Math.abs(c.x - ex) < need) {
        if (tta < 0.34 && tta > 0.17) out.jump = true;
        continue;
      }
      const side = Math.abs(c.x - ex) > 0.05 ? Math.sign(c.x - ex) : 1;
      const lim = w.halfWidth(e.y) - 0.6;
      const cx = w.center(e.y);
      let nx = ex + side * need;
      if (Math.abs(nx - cx) > lim) nx = ex - side * need;
      targetX = nx;
    }
  }
  // Red lights and trains: stop before the line.
  for (let i = Math.max(0, g.next - 4); i < ents.length && ents[i].y < c.y + 60; i++) {
    const e = ents[i];
    if (e.disabled) continue;
    if (e.kind === 'light' && e.state === 'cycle' && lightPhase(g, e) !== 'green') {
      const gap = e.y - LIGHT_STOP - c.y;
      if (gap > -0.3 && gap < (c.v * c.v) / 22 + 6) out.brake = true;
    }
    if (e.kind === 'rail' && e.state === 'warn' && g.t - e.t0 < 2.4 + 3.4 + 0.4) {
      const gap = e.y - RAIL_STOP - c.y;
      if (gap > -2 && gap < (c.v * c.v) / 22 + 7) out.brake = true;
    }
  }
  // A dog close behind and slowing down: throw it the top thing unless that is on the list.
  for (const d of g.dogs) {
    const treat = ents.some((e) => e.kind === 'dropped' && !e.eaten && e.y > d.y && e.y < c.y);
    if (d.state === 'chase' && !treat && c.y - d.y < 3.5 && g.stack.length) {
      const top = g.stack[g.stack.length - 1];
      if (!isNeeded(g, top) || c.v < 6) out.drop = true;
    }
  }
  const err = targetX - c.x - c.vx * 0.12;
  const dead = 0.12 + (1 - skill) * 0.4;
  out.steer = Math.abs(err) < dead ? 0 : Math.max(-1, Math.min(1, err * 1.6));
  return out;
}
