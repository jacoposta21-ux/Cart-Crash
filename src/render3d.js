// The 3D view: a camera behind the cart, the town built section by section,
// and everything that moves (the cart and its pile, things on the road,
// people, pigeons, dogs, traffic lights, trains, the checkout, coins, flying
// debris and little effects). Sky, light and scenery follow the track.
import * as THREE from '../vendor/three/three.module.min.js';
import { itemHeight, stackHeight, wanted, lightPhase, trainSpan, railBarrierDown, crowdPeople } from './game.js';
import { OBSTACLES, SECTION, LIGHT_STOP, RAIL_STOP } from './world.js';
import { buildSection } from './town.js';
import {
  makeItem, makeBalloon, makeCart, makeObstacle, makeWalker, animateWalker, makePigeon, makeDog, animateDog,
  makeShadow, mat, BASKET_Y, HANDLE, makeRider, poseRider, makeTrafficLight, LAMP_ON, makeRailBarrier, makeTrain, makeCop, makeCoin,
} from './models.js';
import { TRACKS } from './tracks.js';

const VIEW_AHEAD = 115;

export function createRenderer(canvas, fxLayer) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  // Phones: a little less resolution keeps the ride smooth.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(TRACKS.borgo.sky);
  scene.fog = new THREE.Fog(TRACKS.borgo.fog, 45, VIEW_AHEAD + 10);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  const hemi = new THREE.HemisphereLight('#e6f4ff', '#d9b98f', 1.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 1.7);
  scene.add(sun, sun.target);
  // Stars around the camera (only on the Rainbow Road).
  const starPos = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 1.6 - 0.6), r = 300;
    starPos.push(Math.cos(a) * Math.sin(b) * r, Math.cos(b) * r, Math.sin(a) * Math.sin(b) * r);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false }),
  );
  stars.visible = false;
  scene.add(stars);

  const R = {
    renderer, scene, camera, sun, hemi, stars, fxLayer,
    sections: new Map(),
    objs: new Map(),
    cart: null,
    pile: new Map(),
    balloons: [],
    dogs: new Map(),
    cops: new Map(),
    checkout: null,
    dropping: new Set(),
    label: (s) => s,
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
  R.baseFov = W / H < 0.8 ? 74 : W / H < 1.2 ? 66 : 58;
  R.camera.fov = R.baseFov + (R.wide || 0) * 12;
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
  for (const d of R.dogs.values()) R.scene.remove(d);
  R.dogs.clear();
  for (const p of R.cops.values()) R.scene.remove(p);
  R.cops.clear();
  if (R.checkout) { R.scene.remove(R.checkout); R.checkout = null; }
  R.dropping.clear();
  R.pile.clear();
  R.balloons = [];
  R.broken.clear();
  R.game = g;
  // The track's sky and light.
  const T = g.world.track || TRACKS.borgo;
  R.scene.background.set(T.sky);
  R.scene.fog.color.set(T.fog);
  R.scene.fog.near = T.fogNear;
  R.hemi.color.set(T.hemi[0]); R.hemi.groundColor.set(T.hemi[1]); R.hemi.intensity = T.hemi[2];
  R.sun.color.set(T.sun[0]); R.sun.intensity = T.sun[1];
  R.stars.visible = T.theme === 'rainbow';
  // The cart: root follows the road, body leans and spins, pile sits in the basket.
  const root = new THREE.Group();
  const body = makeCart(g.cartType);
  const pile = new THREE.Group();
  body.add(pile);
  const rider = makeRider();
  rider.position.set(0, 0.26, 1.02);
  body.add(rider);
  const shadow = makeShadow(0.8);
  shadow.scale.set(1.3, 1, 2.1);
  root.add(shadow, body);
  R.scene.add(root);
  R.cart = { root, body, pile, shadow, rider, cheer: 0 };
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
        if (e.item === 'balloon') {
          text(R, g, c.x, c.y, 2.6, '', label('pickup', e), 'meh');
        } else {
          text(R, g, c.x, c.y, 2.6, e.wanted ? '✓' : '+5s', label('pickup', e), e.wanted ? 'good' : 'bad');
          burst(R, g, e.x, e.y, 0.6, e.wanted ? 14 : 6, e.wanted ? ['#3ddc84', '#ffffff', '#ffd23f'] : ['#ffffff', '#cccccc'], 3);
        }
        if (e.wanted) R.cart.cheer = 1;
        break;
      case 'drop': R.dropping.add(e.item.id); text(R, g, c.x, c.y, 2.4, '', label('drop', e), 'meh'); break;
      case 'crowdhit':
        bump(R, 0.55);
        burst(R, g, e.x, e.y, 1, 16, ['#d8ccb4', '#ffffff', '#ffd23f'], 4);
        text(R, g, c.x, c.y, 3.6, label('crowdhit', e), '', 'bad big');
        break;
      case 'caught': bump(R, 0.35); text(R, g, c.x, c.y, 3.2, label('caught', e), '', 'bad big'); break;
      case 'bite': bump(R, 0.35); text(R, g, c.x, c.y, 3.2, label('bite', e), '', 'bad big'); break;
      case 'listdone': R.cart.cheer = 1.5; burst(R, g, c.x, c.y, 2.5, 30, ['#3ddc84', '#ffd23f', '#ffffff', '#3fb6ff'], 5); break;
      case 'checkout':
        R.cart.cheer = 3;
        burst(R, g, c.x, c.y + 2, 3, 60, ['#ff4f6d', '#ffcf3a', '#3fb6ff', '#8f6bff', '#3ddc84'], 7);
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
      case 'coin': burst(R, g, e.x, e.y, 0.5 + e.h, 6, ['#ffcc1a', '#fff3b0'], 2.5); break;
      case 'falling': text(R, g, c.x, c.y, 2.4, label('falling', e), '', 'bad big'); break;
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
  syncDogs(R, g);
  syncCops(R, g);
  syncCheckout(R, g);
  updateDebris(R, g, dt);
  updateParts(R, dt);

  // Camera: behind and above the cart, higher when the pile grows, looking down the hill.
  const H = Math.min(6, stackHeight(g));
  const portrait = R.W / R.H < 0.8;
  // After the last crash the camera rises and pulls back to show the mess.
  const out = g.over && !g.won ? Math.min(1, g.overT / 1.2) : 0;
  // Close behind the rider: the camera sits just above his cap and climbs with the pile.
  // A tall pile would hide the road, so the camera climbs above it and looks down more.
  // With a dog or the warden on your heels the view widens and pulls back to show them.
  const chased = g.dogs.some((d) => d.state === 'chase') || g.cops.some((p) => p.state === 'chase');
  R.wide = (R.wide || 0) + ((chased ? 1 : 0) - (R.wide || 0)) * Math.min(1, dt * 3);
  if (Math.abs(R.camera.fov - (R.baseFov + R.wide * 12)) > 0.05) { R.camera.fov = R.baseFov + R.wide * 12; R.camera.updateProjectionMatrix(); }
  const back = (portrait ? 4.4 : 3.9) + H * 0.4 + out * 3 + R.wide * 0.9;
  const up = (portrait ? 3.0 : 2.75) + H * 0.8 + out * 3 + R.wide * 0.8;
  const ground = R.cartElev;
  const lookY = c.y + (portrait ? 9 : 7) - out * 6;
  const wantPos = v3.set(c.x * 0.85 + w.center(c.y - back) * 0.15, ground + up, -(c.y - back));
  // Far off (a new ride, a jump in time): go straight there instead of flying through the houses.
  if (Number.isNaN(R.camPos.x) || dt === 0 || R.camPos.distanceToSquared(wantPos) > 144) R.camPos.copy(wantPos); else R.camPos.lerp(wantPos, Math.min(1, dt * 6));
  // Do not dip below the road behind (stairs drop fast).
  R.camPos.y = Math.max(R.camPos.y, w.elevation(c.y - back) + 1.5);
  const look = new THREE.Vector3(c.x * 0.7 + w.center(lookY) * 0.3, w.elevation(lookY) + 0.9 - H * 0.1, -lookY);
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
  if (R.stars.visible) R.stars.position.copy(R.camera.position);
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
const ringMat = new THREE.MeshBasicMaterial({ color: '#3ddc84', transparent: true, opacity: 0.95, depthWrite: false });
const junkRingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
const arrowGeo = new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI);
const stringMat = new THREE.LineBasicMaterial({ color: '#5a4e48' });

function makeEntityObj(R, g, e) {
  const root = new THREE.Group();
  if (e.kind === 'item') {
    const inner = makeItem(e);
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
    // A green arrow over the things still on the list.
    const arrow = new THREE.Mesh(arrowGeo, mat('#3ddc84', { basic: true }));
    root.add(makeShadow(0.4), ring, inner, arrow);
    root.userData = { inner, ring, arrow };
  } else if (e.kind === 'dropped') {
    const inner = makeItem(e.item);
    inner.rotation.set(0.2, hashf(e.id, 4) * 6, 1.3);
    inner.position.y = 0.15;
    root.add(makeShadow(0.35), inner);
    root.userData = { inner };
  } else if (e.kind === 'light') {
    root.add(buildCrossing(g, e));
  } else if (e.kind === 'rail') {
    root.add(buildRail(g, e));
  } else if (e.kind === 'obstacle') {
    const inner = e.type === 'walker' ? makeWalker(e.look) : makeObstacle(e.type);
    const o = OBSTACLES[e.type];
    if (o.solid) root.add(makeShadow(o.r * 1.2));
    root.add(inner);
    root.userData = { inner };
  } else if (e.kind === 'coin') {
    const inner = makeCoin();
    root.add(inner);
    root.userData = { inner };
  } else if (e.kind === 'pigeons') {
    const birds = [];
    for (let i = 0; i < e.n; i++) {
      const p = makePigeon(g.world.track?.birds || 'pigeon');
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
      const obj = makeEntityObj(R, g, e);
      if (!obj) continue;
      R.scene.add(obj);
      o = { obj, e };
      R.objs.set(e.id, o);
    }
    seen.add(e.id);
    const obj = o.obj;
    const ud = obj.userData;
    obj.position.copy(worldPos(g, e.x, e.y));
    if (e.kind === 'coin') {
      ud.inner.position.y = 0.45 + e.h + Math.sin(R.t * 4 + e.id) * 0.06;
      ud.inner.rotation.y = R.t * 3.5 + e.id * 0.4;
    } else if (e.kind === 'item') {
      ud.inner.position.y = (e.type === 'balloon' ? 0.9 : 0.12) + Math.sin(R.t * 3 + e.id) * 0.08;
      ud.inner.rotation.y = R.t * 1.6 + e.id;
      const want = e.type !== 'balloon' && wanted(g, e.type === 'goods' ? e.goods : e.type);
      ud.ring.material = want ? ringMat : junkRingMat;
      ud.ring.scale.setScalar(1 + Math.sin(R.t * 5 + e.id) * 0.08 * (want ? 1.5 : 0.5));
      ud.arrow.visible = want;
      ud.arrow.position.y = 1.35 + Math.sin(R.t * 6 + e.id) * 0.12;
      ud.arrow.rotation.y = R.t * 3;
    } else if (e.kind === 'light') {
      obj.rotation.x = -Math.atan(SECTION[w.sectionAt(e.y).kind].drop);
      updateCrossing(R, g, e, obj);
    } else if (e.kind === 'rail') {
      obj.rotation.x = -Math.atan(SECTION[w.sectionAt(e.y).kind].drop);
      updateRail(R, g, e, obj);
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
        if (e.mode === 'along') inner.rotation.y = Math.PI;
        else inner.rotation.y = e.going ? (e.side > 0 ? Math.PI / 2 : -Math.PI / 2) : (e.side > 0 ? Math.PI / 2 + 0.4 : -Math.PI / 2 - 0.4);
        animateWalker(inner, (e.walk || 0) * 5.5, e.going);
        if (!e.going && e.mode !== 'along') obj.position.y += 0.14;
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
  if (Math.abs(ground - R.cartElev) > 2) R.cartElev = ground; // a jump in time, not a stair
  if (dt === 0) R.cartElev = ground;
  root.position.set(c.x, R.cartElev, -c.y);
  // Point down the road, lean into turns, spin on oil, tip over at the end.
  const ahead = w.center(c.y + 2) - w.center(c.y);
  root.rotation.y = -Math.atan2(ahead + c.vx * 0.05, 2) * 0.8;
  body.position.y = c.z + (g.cart.v > 1 ? Math.abs(Math.sin(R.t * 18)) * 0.015 : 0);
  body.rotation.y = Math.sin(c.spin) * 0.5;
  body.rotation.z = -c.vx * 0.012 - c.flip * 1.6;
  body.position.x = c.flip * 0.5;
  shadow.scale.set(1.3 * Math.max(0.4, 1 - c.z * 0.2), 1, 2.1 * Math.max(0.4, 1 - c.z * 0.2));
  shadow.visible = !(c.fall > 0);
  shadow.position.set(0, 0.02, 0.25);
  R.cart.cheer = Math.max(0, R.cart.cheer - dt * 1.5);
  poseRider(R.cart.rider, {
    lean: Math.max(-1, Math.min(1, c.vx / 5)), crouch: c.braking ? 1 : 0, air: Math.min(1, c.z * 1.5),
    cheer: Math.min(1, R.cart.cheer), fall: c.flip, t: R.t,
  });

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
      if (R.dropping.has(it.id)) {
        // Dropped on purpose: it just tumbles off the back (the road shows it from now on).
        R.dropping.delete(it.id);
        R.debris.push({ obj, v: new THREE.Vector3(0, 1.5, 3 + c.v * 0.2), spin: new THREE.Vector3(4, 0, 0), life: 0.35 });
      } else R.debris.push({ obj, v: new THREE.Vector3(side * (2 + Math.random() * 2.5), 2.5 + Math.random() * 2, c.v * 0.35 + (Math.random() - 0.5) * 2), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, side * 6), life: 4, broken });
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
    {
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

function syncDogs(R, g) {
  const live = new Set(g.dogs);
  for (const [d, obj] of R.dogs) if (!live.has(d)) { R.scene.remove(obj); R.dogs.delete(d); }
  for (const d of g.dogs) {
    let obj = R.dogs.get(d);
    if (!obj) {
      obj = new THREE.Group();
      const body = makeDog(d.look);
      obj.add(makeShadow(0.45), body);
      obj.userData.body = body;
      R.scene.add(obj);
      R.dogs.set(d, obj);
    }
    obj.position.copy(worldPos(g, d.x, d.y));
    const body = obj.userData.body;
    if (d.state === 'eat') {
      obj.rotation.y = Math.PI;
      body.userData.head.rotation.x = 0.6 + Math.sin(R.t * 12) * 0.15;
      animateDog(body, 0);
    } else {
      body.userData.head.rotation.x = 0;
      // Running down the hill after the cart (the model faces -z), or trotting off to the side.
      obj.rotation.y = d.state === 'leave' ? -Math.PI / 2 * Math.sign(d.x - g.world.center(d.y) || 1) : -Math.atan2(g.cart.x - d.x, 4) * 0.6;
      animateDog(body, d.run * 16);
    }
  }
}

function syncCops(R, g) {
  const live = new Set(g.cops);
  for (const [p, obj] of R.cops) if (!live.has(p)) { R.scene.remove(obj); R.cops.delete(p); }
  for (const p of g.cops) {
    let obj = R.cops.get(p);
    if (!obj) {
      obj = new THREE.Group();
      const body = makeCop();
      obj.add(makeShadow(0.4), body);
      obj.userData.body = body;
      R.scene.add(obj);
      R.cops.set(p, obj);
    }
    obj.position.copy(worldPos(g, p.x, p.y));
    const body = obj.userData.body;
    body.rotation.y = p.state === 'chase' ? -Math.atan2(g.cart.x - p.x, 4) * 0.5 : Math.PI;
    animateWalker(body, p.run * 12, p.state === 'chase');
    if (p.state === 'chase') body.rotation.x = -0.25; // leaning into the run
    // one arm up, whistling
    if (p.state === 'chase') body.userData.armR.rotation.x = -2.6 + Math.sin(R.t * 14) * 0.2;
  }
}

// ---------- zebra crossing with traffic lights ----------
function buildCrossing(g, e) {
  const grp = new THREE.Group();
  const w = g.world;
  const hw = w.halfWidth(e.y);
  const white = mat('#f4f1e8');
  for (let x = -hw + 0.4; x < hw - 0.2; x += 1.0) grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 3), white).translateX(x).translateY(0.02).translateZ(-1));
  const stop = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.03, 0.35), white);
  stop.position.set(0, 0.02, LIGHT_STOP);
  grp.add(stop);
  const lights = [];
  for (const side of [-1, 1]) {
    const tl = makeTrafficLight();
    tl.position.set(side * (hw + 0.5), 0.14, LIGHT_STOP - 0.3);
    grp.add(tl);
    lights.push(tl);
  }
  const crowd = [];
  for (let i = 0; i < e.crowd; i++) {
    const p = makeWalker((e.id * 7 + i * 13) % 64);
    p.visible = false;
    grp.add(p);
    crowd.push(p);
  }
  grp.userData = { lights, crowd, hw };
  return grp;
}

function updateCrossing(R, g, e, obj) {
  const grp = obj.children[0];
  const { lights, crowd } = grp.userData;
  obj.position.x = g.world.center(e.y);
  const phase = e.disabled ? 'green' : lightPhase(g, e);
  for (const tl of lights) for (const k of ['red', 'yellow', 'green']) tl.userData.lamps[k].color.set(k === phase ? LAMP_ON[k] : '#333333');
  // During the red, a crowd crosses from both sides (the same people the cart can run into).
  const people = crowdPeople(g, e);
  crowd.forEach((p, i) => {
    const q = people[i];
    if (!q) { p.visible = false; return; }
    p.visible = q.visible;
    p.position.set(q.x - obj.position.x, 0, -(q.y - e.y));
    p.rotation.set(0, q.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    if (q.knocked) {
      const k = Math.min(1.2, g.t - q.knocked.t);
      p.position.x += q.knocked.dir * 2.2 * k;
      p.position.y = Math.max(0, 3 * k - 3 * k * k);
      p.rotation.z = -q.knocked.dir * Math.min(1.4, k * 4);
      animateWalker(p, 0, false);
      return;
    }
    if (e.crowdHit && g.cart.y > e.y - LIGHT_STOP) p.rotation.z = Math.sin(i + R.t * 9) * 0.2; // shaking fists
    animateWalker(p, q.phase, q.walking);
  });
}

// ---------- level crossing ----------
function buildRail(g, e) {
  const grp = new THREE.Group();
  const hw = g.world.halfWidth(e.y);
  const len = hw * 2 + 40;
  const steel = mat('#8c939c'), wood = mat('#6b4f36');
  for (const z of [-0.72, 0.72]) grp.add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.1), steel).translateY(0.07).translateZ(z));
  for (let x = -len / 2; x < len / 2; x += 0.65) grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 2.3), wood).translateX(x).translateY(0.02));
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 3.2), mat('#9a948a'));
  ballast.position.y = 0.0;
  grp.add(ballast);
  const stop = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.03, 0.35), mat('#f4f1e8'));
  stop.position.set(0, 0.03, RAIL_STOP);
  grp.add(stop);
  const barriers = [];
  for (const side of [-1, 1]) {
    const b = makeRailBarrier();
    b.position.set(side * (hw + 0.4), 0.14, side < 0 ? RAIL_STOP - 0.6 : -RAIL_STOP + 0.6);
    b.rotation.y = side < 0 ? 0 : Math.PI;
    grp.add(b);
    barriers.push(b);
  }
  const train = makeTrain();
  train.visible = false;
  grp.add(train);
  grp.userData = { barriers, train };
  return grp;
}

function updateRail(R, g, e, obj) {
  const grp = obj.children[0];
  const { barriers, train } = grp.userData;
  obj.position.x = g.world.center(e.y);
  const down = railBarrierDown(g, e);
  const k = down ? Math.min(1, (g.t - e.t0) / 1.2) : Math.max(0, 1 - (g.t - (e.t0 + 2.4 + 3.4 + 0.6)) / 1.2);
  for (const b of barriers) {
    b.userData.arm.rotation.z = Math.PI / 2 * (1 - (e.state === 'idle' ? 0 : k));
    const on = e.state === 'warn' && down && Math.floor(R.t * 3) % 2 === 0;
    b.userData.lampA.color.set(e.state === 'warn' && down ? (on ? '#ff2020' : '#441111') : '#441111');
    b.userData.lampB.color.set(e.state === 'warn' && down ? (on ? '#441111' : '#ff2020') : '#441111');
  }
  const span = trainSpan(g, e);
  train.visible = Boolean(span);
  if (span) {
    train.position.x = span.front - obj.position.x;
    train.rotation.y = e.dir > 0 ? 0 : Math.PI;
  }
}

// ---------- the checkout ----------
function syncCheckout(R, g) {
  if (g.checkoutY === null && !g.won) {
    if (R.checkout) { R.scene.remove(R.checkout); R.checkout = null; }
    return;
  }
  if (!R.checkout) R.checkout = buildCheckout(R, g, g.checkoutY ?? g.cart.y);
}

function buildCheckout(R, g, y) {
  const grp = new THREE.Group();
  const w = g.world;
  const hw = w.halfWidth(y) + 0.3;
  const red = mat('#e63946'), white = mat('#ffffff');
  for (const side of [-1, 1]) {
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.2, 0.4), red).translateX(side * hw).translateY(3.6));
    // a till with a conveyor belt
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 2.6), white).translateX(side * (hw + 1)).translateY(0.45).translateZ(1.2));
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 2.4), mat('#222222')).translateX(side * (hw + 1)).translateY(0.92).translateZ(1.2));
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), mat('#3d405b')).translateX(side * (hw + 1)).translateY(1.1).translateZ(0.1));
  }
  // The sign, with the word drawn on a canvas.
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 192;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#e63946'; ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = '#ffffff';
  ctx.font = '120px "Lilita One", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(R.label('CHECKOUT'), 512, 104);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.4, 1.1, 0.3), [red, red, red, red, new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
  sign.position.y = 7.4; // high enough for a tall pile (and the camera) to pass under
  grp.add(sign);
  // A checkered finish line.
  for (let i = 0; i < Math.ceil(hw * 4); i++) for (let j = 0; j < 2; j++) {
    const sq = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.5), mat((i + j) % 2 ? '#1e1e24' : '#ffffff'));
    sq.position.set(-hw + 0.25 + i * 0.5, 0.02, -j * 0.5);
    grp.add(sq);
  }
  grp.position.set(w.center(y), w.elevation(y), -y);
  grp.rotation.x = -Math.atan(SECTION[w.sectionAt(y).kind].drop);
  R.scene.add(grp);
  return grp;
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
  return icon(`${type}|${goods}`, () => makeItem({ type, goods, color: 0 }), 128, [1.2, 1.0, 3]);
}

/** A cart from the garage, seen from the front and a little to the side. */
export function cartIcon(type) {
  return icon(`cart|${type}`, () => makeCart(type), 256, [-2.2, 1.6, -2.6]);
}

function icon(key, make, px, view) {
  if (iconCache.has(key)) return iconCache.get(key);
  let url = '';
  try {
    if (!iconRenderer) iconRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    iconRenderer.setSize(px, px, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#c9a77a', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4);
    sun.position.set(-1, 2, 2);
    scene.add(sun);
    const it = make();
    scene.add(it);
    const box = new THREE.Box3().setFromObject(it);
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62;
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 20);
    cam.position.set(mid.x + view[0], mid.y + view[1], mid.z + view[2]);
    cam.lookAt(mid);
    iconRenderer.render(scene, cam);
    url = iconRenderer.domElement.toDataURL('image/png');
  } catch { url = ''; }
  iconCache.set(key, url);
  return url;
}
