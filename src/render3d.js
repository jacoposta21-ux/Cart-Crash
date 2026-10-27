// The 3D view: a camera behind the cart, the town built section by section,
// and everything that moves (the cart and its pile, things on the road,
// people, pigeons, the dog, flying debris and little effects).
import * as THREE from '../vendor/three/three.module.min.js';
import { GOODS, itemHeight, stackHeight } from './game.js';
import { OBSTACLES } from './world.js';
import { buildSection } from './town.js';
import {
  makeItem, makeBalloon, makeCart, makeObstacle, makeWalker, animateWalker, makePigeon, makeDog, animateDog,
  makeShadow, mat, BASKET_Y, HANDLE,
} from './models.js';

const SKY = '#a8dcf5';
const FOG = '#d6eef8';
const VIEW_AHEAD = 115;

export function createRenderer(canvas, fxLayer) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  // Phones: a little less resolution keeps the ride smooth.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(FOG, 45, VIEW_AHEAD + 10);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight('#e6f4ff', '#d9b98f', 1.9));
  const sun = new THREE.DirectionalLight('#fff1d6', 1.7);
  scene.add(sun, sun.target);

  const R = {
    renderer, scene, camera, sun, fxLayer,
    sections: new Map(),
    objs: new Map(),
    cart: null,
    pile: new Map(),
    balloons: [],
    dog: null,
    debris: [],
    parts: [],
    texts: [],
    shake: 0,
    reduceShake: false,
    camPos: new THREE.Vector3(),
    camLook: new THREE.Vector3(),
    cartElev: 0,
    t: 0,
    game: null,
    broken: new Set(),
    W: 1,
    H: 1,
  };
  return R;
}

export function resizeRenderer(R, W, H) {
  R.W = W; R.H = H;
  R.renderer.setSize(W, H, false);
  R.camera.aspect = W / H;
  // Portrait screens see less to the sides: open the lens a bit more.
  R.camera.fov = W / H < 0.8 ? 74 : W / H < 1.2 ? 66 : 58;
  R.camera.updateProjectionMatrix();
}

/** Starts drawing a new ride (clears everything from the previous one). */
export function setGame(R, g) {
  for (const m of R.sections.values()) { R.scene.remove(m); m.geometry.dispose(); }
  R.sections.clear();
  for (const o of R.objs.values()) R.scene.remove(o.obj);
  R.objs.clear();
  for (const d of R.debris) R.scene.remove(d.obj);
  R.debris = [];
  for (const p of R.parts) R.scene.remove(p.obj);
  R.parts = [];
  for (const tx of R.texts) tx.el.remove();
  R.texts = [];
  if (R.cart) R.scene.remove(R.cart.root);
  if (R.dog) { R.scene.remove(R.dog); R.dog = null; }
  R.pile.clear();
  R.balloons = [];
  R.broken.clear();
  R.game = g;
  // The cart: root follows the road, body leans and spins, pile sits in the basket.
  const root = new THREE.Group();
  const body = makeCart();
  const pile = new THREE.Group();
  body.add(pile);
  const shadow = makeShadow(0.8);
  shadow.scale.set(1.3, 1, 1.7);
  root.add(shadow, body);
  R.scene.add(root);
  R.cart = { root, body, pile, shadow };
  R.cartElev = g.world.elevation(g.cart.y);
  R.camPos.set(NaN, 0, 0);
  R.camLook.set(NaN, 0, 0);
}

const v3 = new THREE.Vector3();

function worldPos(g, x, y, h = 0) {
  return v3.set(x, g.world.elevation(y) + h, -y);
}

// ---------- events → effects ----------
export function onEvents(R, g, events, label) {
  for (const e of events) {
    const c = g.cart;
    switch (e.type) {
      case 'pickup':
        text(R, g, c.x, c.y, 2.4, `+${e.value}`, label('pickup', e), 'good');
        burst(R, g, e.x, e.y, 0.6, 10, ['#fff08a', '#ffffff', '#ffd23f'], 3);
        break;
      case 'fall': text(R, g, c.x, c.y, 3, '', label('fall', e), 'bad'); break;
      case 'break':
        R.broken.add(e.item.id);
        text(R, g, c.x, c.y, 2.6, '', label('break', e), 'bad');
        bump(R, 0.15);
        break;
      case 'crash':
        bump(R, 0.45);
        burst(R, g, e.x, e.y, 0.5, 14, ['#d8ccb4', '#bfb39b', '#ffffff'], 4);
        text(R, g, c.x, c.y, 3.4, label('crash', e), '', 'bad big');
        break;
      case 'pop':
        burst(R, g, c.x, c.y, 3.5, 12, ['#ff4f6d', '#ffcf3a', '#3fb6ff', '#8f6bff'], 4);
        break;
      case 'curb': bump(R, 0.12); break;
      case 'bump': if (e.cause === 'pothole') { bump(R, 0.2); burst(R, g, c.x, c.y, 0.2, 6, ['#6b6b6b', '#9a9a9a'], 2); } else if (e.cause === 'stairs') bump(R, 0.05); break;
      case 'land': if (e.impact > 4) { bump(R, Math.min(0.25, e.impact * 0.03)); burst(R, g, c.x, c.y, 0.1, 8, ['#d8ccb4', '#ffffff'], 2.5); } break;
      case 'gameover':
        bump(R, 0.6);
        burst(R, g, c.x, c.y, 1, 40, ['#ff4f6d', '#ffcf3a', '#3fb6ff', '#8f6bff', '#3ddc84'], 6);
        break;
      default: break;
    }
  }
}

function bump(R, amount) { if (!R.reduceShake) R.shake = Math.max(R.shake, amount); }

const partGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
function burst(R, g, x, y, h, n, colors, speed) {
  for (let i = 0; i < n; i++) {
    const obj = new THREE.Mesh(partGeo, mat(colors[i % colors.length], { basic: true }));
    obj.position.copy(worldPos(g, x + (Math.random() - 0.5) * 0.6, y, h));
    R.scene.add(obj);
    R.parts.push({ obj, v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed - g.cart.v * 0.6), life: 0.7 + Math.random() * 0.5, spin: Math.random() * 10 });
  }
}

function text(R, g, x, y, h, big, small, kind) {
  if (!R.fxLayer) return;
  const el = document.createElement('div');
  el.className = `fx ${kind}`;
  if (big) { const b = document.createElement('b'); b.textContent = big; el.append(b); }
  if (small) { const s = document.createElement('span'); s.textContent = small; el.append(s); }
  R.fxLayer.append(el);
  R.texts.push({ el, x, y, h, life: 1.1 });
}

// ---------- the frame ----------
export function render(R, g, dt) {
  R.t += dt;
  const c = g.cart;
  const w = g.world;
  syncSections(R, g);
  syncEntities(R, g);
  syncCart(R, g, dt);
  syncDog(R, g);
  updateDebris(R, g, dt);
  updateParts(R, dt);

  // Camera: behind and above the cart, higher when the pile grows, looking down the hill.
  const H = Math.min(6, stackHeight(g));
  const portrait = R.W / R.H < 0.8;
  // After the last crash the camera rises and pulls back to show the mess.
  const out = g.over ? Math.min(1, g.overT / 1.2) : 0;
  const back = (portrait ? 6.2 : 5.6) + H * 0.35 + out * 3;
  const up = (portrait ? 3.6 : 3.3) + H * 0.5 + out * 3;
  const ground = R.cartElev;
  const lookY = c.y + (portrait ? 10 : 7) - out * 6;
  const wantPos = v3.set(c.x * 0.75 + w.center(c.y - back) * 0.25, ground + up, -(c.y - back));
  // Far off (a new ride, a jump in time): go straight there instead of flying through the houses.
  if (Number.isNaN(R.camPos.x) || dt === 0 || R.camPos.distanceToSquared(wantPos) > 144) R.camPos.copy(wantPos); else R.camPos.lerp(wantPos, Math.min(1, dt * 6));
  // Do not dip below the road behind (stairs drop fast).
  R.camPos.y = Math.max(R.camPos.y, w.elevation(c.y - back) + 1.5);
  const look = new THREE.Vector3(c.x * 0.6 + w.center(lookY) * 0.4, w.elevation(lookY) + 0.8 + H * 0.15, -lookY);
  if (Number.isNaN(R.camLook.x) || dt === 0 || R.camLook.distanceToSquared(look) > 144) R.camLook.copy(look); else R.camLook.lerp(look, Math.min(1, dt * 8));
  if (R.closeup) {
    // A three-quarter close-up of the cart and its pile (for the app icon).
    const mid = ground + BASKET_Y + Math.min(H, 4) * 0.5 + 0.4;
    R.camPos.set(c.x + 2.2, mid + 1.2, -(c.y - 2.6 - H * 0.35));
    R.camLook.set(c.x, mid, -c.y);
  }
  R.camera.position.copy(R.camPos);
  if (R.shake > 0) {
    R.camera.position.x += (Math.random() - 0.5) * R.shake;
    R.camera.position.y += (Math.random() - 0.5) * R.shake;
    R.shake = Math.max(0, R.shake - dt * 1.6);
  }
  R.camera.lookAt(R.camLook);
  // Sun from the front-left, following the ride.
  R.sun.position.set(c.x - 20, ground + 30, -c.y - 10);
  R.sun.target.position.set(c.x, ground, -c.y - 30);
  R.renderer.render(R.scene, R.camera);
  updateTexts(R, g, dt);
}

function syncSections(R, g) {
  const w = g.world;
  const y = g.cart.y;
  const live = new Set();
  for (const s of w.sections) {
    if (s.end < y - 30 || s.start > y + VIEW_AHEAD + 20) continue;
    live.add(s);
    if (!R.sections.has(s)) {
      const m = buildSection(w, s);
      R.scene.add(m);
      R.sections.set(s, m);
    }
  }
  for (const [s, m] of R.sections) {
    if (!live.has(s)) { R.scene.remove(m); m.geometry.dispose(); R.sections.delete(s); }
  }
}

const ringGeo = new THREE.RingGeometry(0.42, 0.52, 24).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe25a', transparent: true, opacity: 0.85, depthWrite: false });
const stringMat = new THREE.LineBasicMaterial({ color: '#5a4e48' });

function makeEntityObj(e) {
  const root = new THREE.Group();
  if (e.kind === 'item') {
    const inner = makeItem({ type: e.type, goods: GOODS[e.variant % GOODS.length], color: e.variant % 5 });
    if (e.type === 'balloon') {
      inner.position.y = 0.9;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 0.9, 0)]), stringMat);
      root.add(line);
      root.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat('#5a4e48')));
    }
    inner.scale.setScalar(1.25);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.03;
    ring.renderOrder = 2;
    root.add(makeShadow(0.4), ring, inner);
    root.userData = { inner, ring };
  } else if (e.kind === 'obstacle') {
    const inner = e.type === 'walker' ? makeWalker(e.look) : makeObstacle(e.type);
    const o = OBSTACLES[e.type];
    if (o.solid) root.add(makeShadow(o.r * 1.2));
    root.add(inner);
    root.userData = { inner };
  } else if (e.kind === 'pigeons') {
    const birds = [];
    for (let i = 0; i < e.n; i++) {
      const p = makePigeon();
      p.position.set(Math.cos(i * 2.4) * 0.9, 0, Math.sin(i * 2.4) * 0.7);
      p.rotation.y = i * 1.7;
      root.add(p);
      birds.push(p);
    }
    root.userData = { birds };
  } else return null;
  return root;
}

function syncEntities(R, g) {
  const w = g.world;
  const c = g.cart;
  const seen = new Set();
  for (const e of w.entities) {
    if (e.y < c.y - 10) continue;
    if (e.y > c.y + VIEW_AHEAD) break;
    if (e.kind === 'dog') continue;
    let o = R.objs.get(e.id);
    if (e.taken || (e.gone && e.type === 'walker')) { if (o) { R.scene.remove(o.obj); R.objs.delete(e.id); } continue; }
    if (!o) {
      const obj = makeEntityObj(e);
      if (!obj) continue;
      R.scene.add(obj);
      o = { obj, e };
      R.objs.set(e.id, o);
    }
    seen.add(e.id);
    const obj = o.obj;
    const ud = obj.userData;
    obj.position.copy(worldPos(g, e.x, e.y));
    if (e.kind === 'item') {
      ud.inner.position.y = (e.type === 'balloon' ? 0.9 : 0.12) + Math.sin(R.t * 3 + e.id) * 0.08;
      ud.inner.rotation.y = R.t * 1.6 + e.id;
      ud.ring.scale.setScalar(1 + Math.sin(R.t * 5 + e.id) * 0.08);
    } else if (e.type === 'walker') {
      const inner = ud.inner;
      if (e.knocked) {
        const t = g.t - e.knockT;
        obj.position.x += e.knockDir * 4 * t;
        obj.position.y += Math.max(0, 5 * t - 9 * t * t);
        obj.position.z -= c.v * 0.4 * t;
        inner.rotation.z = -e.knockDir * Math.min(1.5, t * 5);
        animateWalker(inner, 0, false);
        if (t > 1.4) e.gone = true;
      } else {
        inner.rotation.y = e.going ? (e.side > 0 ? Math.PI / 2 : -Math.PI / 2) : (e.side > 0 ? Math.PI / 2 + 0.4 : -Math.PI / 2 - 0.4);
        animateWalker(inner, (e.walk || 0) * 5.5, e.going);
        if (!e.going) obj.position.y += 0.14;
      }
    } else if (e.kind === 'obstacle' && e.knocked) {
      const t = Math.min(1, g.t - e.knockT);
      const inner = ud.inner;
      inner.position.set(e.knockDir * 1.6 * t, Math.max(0, 2.5 * t - 3 * t * t), 0);
      inner.rotation.z = -e.knockDir * 1.4 * t;
      inner.rotation.x = 0.6 * t;
    } else if (e.kind === 'pigeons') {
      for (const [i, p] of ud.birds.entries()) {
        const { wl, wr } = p.userData;
        if (e.flying) {
          const t = g.t - e.flying;
          p.position.y = t * (3 + i * 0.4);
          p.position.x = Math.cos(i * 2.4) * (0.9 + t * 2.5);
          p.position.z = Math.sin(i * 2.4) * 0.7 - t * 3;
          const f = Math.sin(R.t * 30 + i) * 0.9;
          wl.rotation.z = f; wr.rotation.z = -f;
          p.visible = t < 3;
        } else {
          // peck, peck
          p.rotation.x = Math.max(0, Math.sin(R.t * 4 + i * 1.3)) * 0.5;
        }
      }
    }
  }
  for (const [id, o] of R.objs) {
    if (!seen.has(id)) { R.scene.remove(o.obj); R.objs.delete(id); }
  }
}

function syncCart(R, g, dt) {
  const c = g.cart;
  const w = g.world;
  const { root, body, pile, shadow } = R.cart;
  // Smooth the ground height so stairs feel like bumps, not teleports.
  const ground = w.elevation(c.y);
  R.cartElev += (ground - R.cartElev) * Math.min(1, dt * 22);
  if (dt === 0) R.cartElev = ground;
  root.position.set(c.x, R.cartElev, -c.y);
  // Point down the road, lean into turns, spin on oil, tip over at the end.
  const ahead = w.center(c.y + 2) - w.center(c.y);
  root.rotation.y = -Math.atan2(ahead + c.vx * 0.05, 2) * 0.8;
  body.position.y = c.z + (g.cart.v > 1 ? Math.abs(Math.sin(R.t * 18)) * 0.015 : 0);
  body.rotation.y = Math.sin(c.spin) * 0.5;
  body.rotation.z = -c.vx * 0.012 - c.flip * 1.6;
  body.position.x = c.flip * 0.5;
  shadow.scale.set(1.3 * Math.max(0.4, 1 - c.z * 0.2), 1, 1.7 * Math.max(0.4, 1 - c.z * 0.2));
  shadow.position.y = 0.02;

  // The pile: one model per thing in the stack, bending with the tilt.
  const current = new Set(g.stack);
  for (const [it, obj] of R.pile) {
    if (!current.has(it)) {
      // It fell (or broke): it leaves the cart and flies off.
      obj.updateWorldMatrix(true, false);
      obj.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
      pile.remove(obj);
      R.scene.add(obj);
      const side = Math.sign(g.tilt) || (Math.random() < 0.5 ? -1 : 1);
      const broken = R.broken.has(it.id);
      if (broken) obj.scale.multiplyScalar(0.6);
      R.debris.push({ obj, v: new THREE.Vector3(side * (2 + Math.random() * 2.5), 2.5 + Math.random() * 2, c.v * 0.35 + (Math.random() - 0.5) * 2), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, side * 6), life: 4, broken });
      if (broken) splat(R, g, c.x + (Math.random() - 0.5) * 0.6, c.y - 0.5);
      R.pile.delete(it);
    }
  }
  const tilt = g.tilt;
  const shiver = g.wobble > 0.7 ? Math.sin(R.t * 40) * 0.025 * g.wobble : 0;
  let base = 0;
  g.stack.forEach((it) => {
    let obj = R.pile.get(it);
    if (!obj) { obj = makeItem(it); pile.add(obj); R.pile.set(it, obj); }
    const jx = (hashf(it.id, 1) - 0.5) * 0.28, jz = (hashf(it.id, 2) - 0.5) * 0.4;
    const b = base;
    const lean = tilt + shiver;
    obj.position.set(Math.sin(lean) * b * (1 + 0.1 * b) + jx * Math.min(1, 0.4 + b), BASKET_Y + 0.03 + b, jz * (b < 0.6 ? 1 : 0.5));
    obj.rotation.set(0, (hashf(it.id, 3) - 0.5) * 1.2, -lean * (0.5 + 0.12 * b));
    base += itemHeight(it);
  });

  // Balloons on strings from the handle, floating above the pile.
  while (R.balloons.length > g.balloons.length) {
    const b = R.balloons.pop();
    body.remove(b.obj, b.line);
    if (g.over) {
      b.obj.updateWorldMatrix(true, false);
      b.obj.matrixWorld.decompose(b.obj.position, b.obj.quaternion, b.obj.scale);
      R.scene.add(b.obj);
      R.debris.push({ obj: b.obj, v: new THREE.Vector3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2), spin: new THREE.Vector3(), life: 4, floats: true });
    }
  }
  while (R.balloons.length < g.balloons.length) {
    const data = g.balloons[R.balloons.length];
    const obj = makeBalloon(data.color);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([HANDLE, HANDLE]), stringMat);
    body.add(obj, line);
    R.balloons.push({ obj, line });
  }
  const n = R.balloons.length;
  const top = BASKET_Y + Math.max(1.3, stackHeight(g) + 0.8);
  R.balloons.forEach((b, i) => {
    const spread = (i - (n - 1) / 2) * 0.45;
    const x = spread + Math.sin(R.t * 2.1 + i) * 0.12 - c.vx * 0.03;
    const y = top + (i % 2) * 0.35 + Math.sin(R.t * 3 + i * 1.7) * 0.07;
    const z = 0.5 + Math.cos(R.t * 1.7 + i) * 0.1 + (i % 3) * 0.15;
    b.obj.position.set(x, y, z);
    const p = b.line.geometry.attributes.position;
    p.setXYZ(0, (i % 2 ? 0.45 : -0.45), HANDLE.y, HANDLE.z);
    p.setXYZ(1, x, y, z);
    p.needsUpdate = true;
    b.line.geometry.computeBoundingSphere();
  });
}

function hashf(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const splatGeo = new THREE.CircleGeometry(0.45, 10).rotateX(-Math.PI / 2);
const yolkGeo = new THREE.CircleGeometry(0.16, 10).rotateX(-Math.PI / 2);
function splat(R, g, x, y) {
  const grp = new THREE.Group();
  const white = new THREE.Mesh(splatGeo, mat('#fffaf0', { basic: true }));
  const yolk = new THREE.Mesh(yolkGeo, mat('#ffb703', { basic: true }));
  yolk.position.y = 0.005;
  grp.add(white, yolk);
  grp.position.copy(worldPos(g, x, y, 0.03));
  grp.scale.set(1, 1, 0.7);
  R.scene.add(grp);
  R.debris.push({ obj: grp, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 8, decal: true });
}

function syncDog(R, g) {
  const d = g.dog;
  if (!d) { if (R.dog) { R.scene.remove(R.dog); R.dog = null; } return; }
  if (!R.dog) {
    R.dog = new THREE.Group();
    const body = makeDog(d.look);
    R.dog.add(makeShadow(0.45), body);
    R.dog.userData.body = body;
    R.scene.add(R.dog);
  }
  R.dog.position.copy(worldPos(g, d.x, d.y));
  R.dog.rotation.y = d.t > 0 ? -Math.atan2(g.cart.x - d.x, 4) * 0.6 : Math.PI;
  animateDog(R.dog.userData.body, d.run * 16);
}

function updateDebris(R, g, dt) {
  for (const d of R.debris) {
    d.life -= dt;
    if (d.decal) continue;
    if (d.floats) { d.obj.position.addScaledVector(d.v, dt); continue; }
    d.v.y -= 16 * dt;
    d.obj.position.addScaledVector(d.v, dt);
    const ground = g.world.elevation(-d.obj.position.z) + 0.05;
    if (d.obj.position.y < ground) {
      d.obj.position.y = ground;
      d.v.set(d.v.x * 0.3, Math.abs(d.v.y) * 0.25, d.v.z * 0.3);
      d.spin.multiplyScalar(0.4);
      if (d.v.length() < 0.6) d.v.set(0, 0, 0);
    } else {
      d.obj.rotation.x += d.spin.x * dt; d.obj.rotation.y += d.spin.y * dt; d.obj.rotation.z += d.spin.z * dt;
    }
  }
  R.debris = R.debris.filter((d) => {
    const keep = d.life > 0 && -d.obj.position.z > g.cart.y - 25;
    if (!keep) R.scene.remove(d.obj);
    return keep;
  });
}

function updateParts(R, dt) {
  for (const p of R.parts) {
    p.life -= dt;
    p.v.y -= 9 * dt;
    p.obj.position.addScaledVector(p.v, dt);
    p.obj.rotation.x += p.spin * dt;
    p.obj.rotation.y += p.spin * dt;
    p.obj.scale.setScalar(Math.max(0.01, Math.min(1, p.life * 2)));
  }
  R.parts = R.parts.filter((p) => { if (p.life <= 0) R.scene.remove(p.obj); return p.life > 0; });
}

function updateTexts(R, g, dt) {
  for (const tx of R.texts) {
    tx.life -= dt;
    tx.h += dt * 1.4;
    const p = worldPos(g, g.cart.x, g.cart.y, tx.h).project(R.camera);
    const x = (p.x * 0.5 + 0.5) * R.W, y = (-p.y * 0.5 + 0.5) * R.H;
    tx.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    tx.el.style.opacity = String(Math.min(1, tx.life * 2.5));
  }
  R.texts = R.texts.filter((tx) => { if (tx.life <= 0) tx.el.remove(); return tx.life > 0; });
}

// ---------- icons (the same 3D models, rendered once to images) ----------
const iconCache = new Map();
let iconRenderer = null;
export function itemIcon(type, goods = 'cereal') {
  const key = `${type}|${goods}`;
  if (iconCache.has(key)) return iconCache.get(key);
  let url = '';
  try {
    if (!iconRenderer) {
      iconRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      iconRenderer.setSize(128, 128, false);
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#c9a77a', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4);
    sun.position.set(-1, 2, 2);
    scene.add(sun);
    const it = makeItem({ type, goods, color: 0 });
    scene.add(it);
    const box = new THREE.Box3().setFromObject(it);
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62;
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 20);
    cam.position.set(mid.x + 1.2, mid.y + 1.0, mid.z + 3);
    cam.lookAt(mid);
    iconRenderer.render(scene, cam);
    url = iconRenderer.domElement.toDataURL('image/png');
  } catch { url = ''; }
  iconCache.set(key, url);
  return url;
}
