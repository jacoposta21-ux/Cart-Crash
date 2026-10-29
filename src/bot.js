// A simple driver for the menu's background ride, the trailer and the tests:
// heads for what is still on the list and steers clear of the rest (extras cost
// time at the checkout, so it drops any that land on top), swerves round obstacles and people, jumps the low ones, stops
// at red lights and crossings, jumps gaps and waves (gliding with a balloon
// when it must), keeps rolling with something on its heels, and throws a treat
// to a dog that is about to catch up.
import { OBSTACLES, JUMPABLE, LIGHT_STOP, RAIL_STOP } from './world.js';
import { wanted, isNeeded, lightPhase, crossTime, RAIL_WARN } from './game.js';

/**
 * opts.greedy: grab anything in reach and keep extras; opts.runReds: no stopping
 * at lights (both for the trailer's staged race). opts.target: where to head
 * when there is nothing to grab (versus: a rival to bump into).
 */
export function botSteer(g, skill = 1, opts = {}) {
  const c = g.cart;
  const w = g.world;
  const ents = w.entities;
  const out = { steer: 0, brake: false, jump: false, drop: false };
  let targetX = w.center(c.y + 4);
  let best = -Infinity;
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 12; i++) {
    const e = ents[i];
    const dy = e.y - c.y;
    if (dy < 0.6 || e.taken || e.kind !== 'item') continue;
    const key = e.type === 'goods' ? e.goods : e.type;
    const want = g.versus ? e.vs : wanted(g, key);
    if (!want && !opts.greedy) continue;
    const reach = Math.abs(e.x - c.x) / Math.max(dy, 0.5);
    if (reach > 1.4) continue;
    const score = 3 - dy * 0.12 - reach;
    if (score > best) { best = score; targetX = e.x; }
  }
  if (best === -Infinity && opts.target !== undefined) targetX = opts.target;
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 8; i++) {
    const e = ents[i];
    if (!opts.greedy && !g.versus && e.kind === 'item' && e.y > c.y + 0.5 && (e.type === 'balloon' || !wanted(g, e.type === 'goods' ? e.goods : e.type)) && Math.abs(targetX - e.x) < 0.9) {
      targetX = e.x + (targetX >= e.x ? 1 : -1) * 1.1; // keep extras out of the cart
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
    // (the brake stops in v²/30 m: start a little before that, to stop just short of the line)
    if (!opts.runReds && e.kind === 'light' && e.state === 'cycle' && lightPhase(g, e) !== 'green') {
      const gap = e.y - LIGHT_STOP - c.y;
      if (gap > -0.3 && gap < (c.v * c.v) / 26 + 1.5) out.brake = true;
    }
    if (e.kind === 'rail' && e.state === 'warn' && g.t - e.t0 < RAIL_WARN + crossTime(g, e) + 0.4) {
      const gap = e.y - RAIL_STOP - c.y;
      if (gap > -2 && gap < (c.v * c.v) / 26 + 2) out.brake = true;
    }
  }
  // A dog close behind and slowing down: throw it the top thing unless that is on the list.
  for (const d of g.dogs) {
    const treat = ents.some((e) => e.kind === 'dropped' && !e.eaten && e.y > d.y && e.y < c.y);
    if (d.state === 'chase' && !treat && c.y - d.y < 3.5 && g.stack.length && !g.versus) {
      const top = g.stack[g.stack.length - 1];
      if (!isNeeded(g, top) || c.v < 6) out.drop = true;
    }
  }
  // Gaps: aim for the ramp, or jump at the edge; over the gap and sinking, glide with a balloon.
  const airborne = c.z > 0.02;
  for (let i = Math.max(0, g.next - 3); i < ents.length && ents[i].y < c.y + 14; i++) {
    const e = ents[i];
    if (e.kind === 'gap') {
      const tta = (e.y - c.y) / Math.max(c.v, 1);
      const ramp = ents.find((q) => q.type === 'ramp' && q.y < e.y && q.y > e.y - 5);
      if (ramp && tta > 0.4 && Math.abs(targetX - ramp.x) < 2.5) targetX = ramp.x;
      if (!airborne && tta > 0 && tta < 0.12) out.jump = true;
      if (airborne && c.vz < 0 && c.y > e.y - 1 && c.y < e.y + e.len && c.z < 1.2 && c.glide <= 0) out.jump = true;
      if (tta > -0.5 && tta < 2) out.brake = false;
    }
    if (e.kind === 'wave' && e.going && !e.hit && !airborne) {
      const tta = (e.y - c.y) / Math.max(c.v, 1);
      if (tta > 0.12 && tta < 0.3 && Math.abs(e.x - c.x) < 3) out.jump = true;
    }
  }
  // Red light already run, or something rolling after us: keep the speed up.
  if (g.cops.some((p) => p.state === 'chase') || g.rollers.some((q) => q.gap < 12)) out.brake = false;
  // An extra on top of the pile: throw it away.
  const top = g.stack[g.stack.length - 1];
  if (!opts.greedy && !g.versus && top && !isNeeded(g, top) && !g.dogs.some((d) => d.state === 'chase')) out.drop = true;
  const err = targetX - c.x - c.vx * 0.12;
  const dead = 0.12 + (1 - skill) * 0.4;
  out.steer = Math.abs(err) < dead ? 0 : Math.max(-1, Math.min(1, err * 1.6));
  return out;
}

/**
 * Ways to drive: 'bot' plays well; 'trailer' drives the staged race of the
 * trailer (it grabs anything, runs the red, and lets the dog chase a little first).
 */
export const POLICIES = {
  bot: (g) => botSteer(g),
  trailer: (g) => {
    const out = botSteer(g, 1, { greedy: true, runReds: true });
    // let the dog chase for a moment before it gets its treat
    if (out.drop && g.dogs.some((d) => d.state === 'chase' && d.t < 1.6)) out.drop = false;
    // and let the warden close in for a moment, then get away
    if (g.cops.some((p) => p.state === 'chase' && p.t > 3 && p.t < 3.4)) out.brake = true;
    return out;
  },
};
