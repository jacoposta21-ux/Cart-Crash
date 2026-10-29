// Low-poly models built in code (no model files): the things you grab, the
// carts, obstacles, coins, people, birds and a dog. Every model stands on y = 0.
import * as THREE from '../vendor/three/three.module.min.js';
import { cartOf } from './carts.js';

const mats = new Map();
/** One shared flat-shaded material per colour. */
export function mat(color, opts = {}) {
  const key = `${color}|${opts.opacity ?? 1}|${opts.basic ? 1 : 0}`;
  if (!mats.has(key)) {
    const o = { color, flatShading: !opts.basic };
    if (opts.opacity !== undefined) { o.transparent = true; o.opacity = opts.opacity; o.depthWrite = false; }
    mats.set(key, opts.basic ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial(o));
  }
  return mats.get(key);
}

const geos = new Map();
function geo(key, make) {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
}
const box = (w, h, d) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, n = 10) => geo(`c${rt}|${rb}|${h}|${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const sph = (r, ws = 10, hs = 8) => geo(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cone = (r, h, n = 8) => geo(`k${r}|${h}|${n}`, () => new THREE.ConeGeometry(r, h, n));

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

export const BALLOON_COLORS = ['#ff4f6d', '#ffcf3a', '#3fb6ff', '#8f6bff', '#3ddc84'];

// A melon with stripes: vertex colours by angle around its long axis.
const melonGeo = (() => {
  const g = new THREE.SphereGeometry(0.36, 14, 10);
  g.scale(1.15, 1, 0.95);
  const pos = g.attributes.position;
  const colors = [];
  const dark = new THREE.Color('#1f6e32'), light = new THREE.Color('#3fae55');
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getY(i));
    const c = Math.sin(a * 7) > 0.2 ? dark : light;
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
})();
const melonMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const GOODS_MAKERS = {
  cereal() {
    const g = new THREE.Group();
    g.add(mesh(box(0.42, 0.62, 0.16), mat('#ff7a2f'), 0, 0.31, 0));
    g.add(mesh(box(0.3, 0.2, 0.17), mat('#fff3c4'), 0, 0.32, 0));
    g.add(mesh(box(0.43, 0.1, 0.17), mat('#c0392b'), 0, 0.54, 0));
    return g;
  },
  roll() {
    const g = new THREE.Group();
    const m = mesh(cyl(0.2, 0.2, 0.46, 12), mat('#f6f7ff'), 0, 0.23, 0);
    g.add(m);
    g.add(mesh(cyl(0.07, 0.07, 0.47, 8), mat('#c9b48f'), 0, 0.23, 0));
    return g;
  },
  can() {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.15, 0.15, 0.38, 12), mat('#d62f2f'), 0, 0.19, 0));
    g.add(mesh(cyl(0.155, 0.155, 0.14, 12), mat('#ffe9b0'), 0, 0.2, 0));
    return g;
  },
  bread() {
    const g = new THREE.Group();
    const b = mesh(sph(0.2, 10, 6), mat('#e3a453'), 0, 0.17, 0);
    b.scale.set(2.1, 0.85, 0.9);
    g.add(b);
    return g;
  },
  cheese() {
    const g = new THREE.Group();
    const w = mesh(cyl(0.34, 0.34, 0.32, 3), mat('#ffd23f'), 0, 0.16, 0);
    w.rotation.y = 0.5;
    g.add(w);
    return g;
  },
  soda() {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.13, 0.13, 0.38, 10), mat('#39b54a'), 0, 0.19, 0));
    g.add(mesh(cyl(0.05, 0.12, 0.14, 10), mat('#39b54a'), 0, 0.45, 0));
    g.add(mesh(cyl(0.05, 0.05, 0.05, 8), mat('#e63946'), 0, 0.54, 0));
    g.add(mesh(cyl(0.135, 0.135, 0.1, 10), mat('#ffffff'), 0, 0.22, 0));
    return g;
  },
  pineapple() {
    const g = new THREE.Group();
    const b = mesh(sph(0.2, 8, 6), mat('#f0b429'), 0, 0.24, 0);
    b.scale.set(1, 1.25, 1);
    g.add(b);
    for (let i = 0; i < 4; i++) {
      const l = mesh(cone(0.06, 0.26, 4), mat('#3c9a3c'), Math.cos(i * 1.57) * 0.05, 0.56, Math.sin(i * 1.57) * 0.05);
      l.rotation.set(Math.sin(i * 1.57) * 0.4, 0, -Math.cos(i * 1.57) * 0.4);
      g.add(l);
    }
    return g;
  },
  detergent() {
    const g = new THREE.Group();
    g.add(mesh(box(0.36, 0.46, 0.24), mat('#2f80ed'), 0, 0.23, 0));
    g.add(mesh(cyl(0.07, 0.07, 0.1, 8), mat('#f2994a'), 0.08, 0.5, 0));
    g.add(mesh(box(0.2, 0.16, 0.25), mat('#e8f1ff'), 0, 0.24, 0));
    return g;
  },
};

/** A grabbable thing. it: { type, goods?, color? }. */
export function makeItem(it) {
  const g = new THREE.Group();
  switch (it.type) {
    case 'melon': g.add(mesh(melonGeo, melonMat, 0, 0.36, 0)); break;
    case 'oil':
      g.add(mesh(cyl(0.14, 0.15, 0.42, 10), mat('#c8b400'), 0, 0.21, 0));
      g.add(mesh(cyl(0.155, 0.155, 0.14, 10), mat('#4f7a1f'), 0, 0.2, 0));
      g.add(mesh(cyl(0.05, 0.13, 0.12, 10), mat('#c8b400'), 0, 0.48, 0));
      g.add(mesh(cyl(0.055, 0.055, 0.06, 8), mat('#2b2d42'), 0, 0.57, 0));
      break;
    case 'eggs': {
      g.add(mesh(box(0.62, 0.16, 0.3), mat('#c8a27a'), 0, 0.08, 0));
      for (let i = 0; i < 4; i++) {
        const e = mesh(sph(0.075, 8, 6), mat('#fbf5ea'), -0.22 + i * 0.147, 0.2, 0);
        e.scale.set(1, 1.25, 1);
        g.add(e);
      }
      break;
    }
    case 'balloon': g.add(makeBalloon(it.color ?? 0)); break;
    case 'goods': g.add((GOODS_MAKERS[it.goods] || GOODS_MAKERS.cereal)()); break;
    default: break;
  }
  return g;
}

/** A balloon whose knot sits at y = 0 (the string is drawn separately). */
export function makeBalloon(color) {
  const g = new THREE.Group();
  const b = mesh(sph(0.28, 12, 10), mat(BALLOON_COLORS[color % 5]), 0, 0.34, 0);
  b.scale.set(0.9, 1.1, 0.9);
  g.add(b);
  g.add(mesh(cone(0.05, 0.08, 6), mat(BALLOON_COLORS[color % 5]), 0, 0.03, 0));
  return g;
}

/** A shopping cart (one of src/carts.js), facing -z (down the hill). The basket floor is at BASKET_Y. */
export const BASKET_Y = 0.42;
export function makeCart(type = 'classic') {
  const g = new THREE.Group();
  const look = cartOf(type).colors;
  const steel = mat(look.frame);
  const W = 1.0, D = 1.25, H = 0.62, y0 = BASKET_Y;
  const bar = (w, h, d, x, y, z) => g.add(mesh(box(w, h, d), steel, x, y, z));
  const t = type === 'iron' ? 0.06 : 0.035;
  // Basket frame: bottom and top rectangles, corner posts.
  for (const y of [y0, y0 + H]) {
    bar(W, t, t, 0, y, -D / 2); bar(W, t, t, 0, y, D / 2);
    bar(t, t, D, -W / 2, y, 0); bar(t, t, D, W / 2, y, 0);
  }
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) bar(t, H, t, x, y0 + H / 2, z);
  // Wire mesh: thin bars on the sides and back, a see-through panel behind them.
  for (let i = 1; i < 6; i++) {
    const z = -D / 2 + (i * D) / 6;
    bar(t * 0.6, H, t * 0.6, -W / 2, y0 + H / 2, z); bar(t * 0.6, H, t * 0.6, W / 2, y0 + H / 2, z);
  }
  for (let i = 1; i < 5; i++) { const x = -W / 2 + (i * W) / 5; bar(t * 0.6, H, t * 0.6, x, y0 + H / 2, D / 2); bar(t * 0.6, H, t * 0.6, x, y0 + H / 2, -D / 2); }
  for (const y of [y0 + H / 3, y0 + (2 * H) / 3]) { bar(W, t * 0.6, t * 0.6, 0, y, D / 2); bar(t * 0.6, t * 0.6, D, -W / 2, y, 0); bar(t * 0.6, t * 0.6, D, W / 2, y, 0); }
  const glass = mat('#aeb8c8', { opacity: 0.22 });
  g.add(mesh(box(W, H, 0.01), glass, 0, y0 + H / 2, D / 2));
  g.add(mesh(box(0.01, H, D), glass, -W / 2, y0 + H / 2, 0));
  g.add(mesh(box(0.01, H, D), glass, W / 2, y0 + H / 2, 0));
  g.add(mesh(box(W, 0.02, D), mat(look.base), 0, y0, 0));
  // Chassis and wheels.
  bar(0.05, 0.05, D * 1.05, -0.36, 0.18, 0); bar(0.05, 0.05, D * 1.05, 0.36, 0.18, 0);
  for (const [x, z] of [[-0.4, -0.5], [0.4, -0.5], [-0.4, 0.55], [0.4, 0.55]]) {
    bar(0.03, 0.22, 0.03, x, 0.25, z);
    const wheel = mesh(cyl(0.1, 0.1, 0.06, 10), mat('#26262c'), x, 0.1, z);
    wheel.rotation.z = Math.PI / 2;
    g.add(wheel);
  }
  // A little step at the back for the rider to stand on.
  bar(0.9, 0.04, 0.38, 0, 0.24, D / 2 + 0.3);
  bar(0.04, 0.2, 0.04, -0.4, 0.15, D / 2 + 0.15); bar(0.04, 0.2, 0.04, 0.4, 0.15, D / 2 + 0.15);
  // Handle with the red grip, nearest to the camera.
  bar(t, 0.35, t, -W / 2, y0 + H + 0.1, D / 2 + 0.12);
  bar(t, 0.35, t, W / 2, y0 + H + 0.1, D / 2 + 0.12);
  const grip = mesh(cyl(0.05, 0.05, W + 0.08, 10), mat(look.grip), 0, y0 + H + 0.26, D / 2 + 0.18);
  grip.rotation.z = Math.PI / 2;
  g.add(grip);
  // What makes each cart different to look at.
  if (type === 'iron') {
    // Riveted steel plates on the sides.
    for (const x of [-W / 2 - 0.02, W / 2 + 0.02]) g.add(mesh(box(0.02, H * 0.45, D * 0.96), mat('#3d424c'), x, y0 + H * 0.3, 0));
  } else if (type === 'racer') {
    // Racing stripes and a spoiler.
    for (const x of [-0.12, 0.12]) g.add(mesh(box(0.08, 0.025, D + 0.02), mat('#ffffff'), x, y0 + H + 0.02, 0));
    g.add(mesh(box(W + 0.2, 0.04, 0.22), mat('#2b2d42'), 0, y0 + H + 0.42, D / 2 + 0.05));
    for (const x of [-0.35, 0.35]) g.add(mesh(box(0.04, 0.2, 0.04), mat('#2b2d42'), x, y0 + H + 0.32, D / 2 + 0.05));
  } else if (type === 'jumbo') {
    // Taller blue side boards (more room).
    for (const x of [-W / 2 - 0.02, W / 2 + 0.02]) g.add(mesh(box(0.03, 0.28, D), mat('#3a86ff', { opacity: 0.55 }), x, y0 + H + 0.14, 0));
    g.add(mesh(box(W, 0.28, 0.03), mat('#3a86ff', { opacity: 0.55 }), 0, y0 + H + 0.14, -D / 2 - 0.02));
  } else if (type === 'rocket') {
    // Two boosters under the basket, with flames.
    for (const x of [-0.3, 0.3]) {
      const b = mesh(cyl(0.11, 0.13, 0.9, 10), mat('#8f6bff'), x, 0.33, 0.25);
      b.rotation.x = Math.PI / 2;
      g.add(b);
      const f = mesh(cone(0.1, 0.35, 8), mat('#ff9f1c', { basic: true }), x, 0.33, 0.88);
      f.rotation.x = Math.PI / 2;
      g.add(f);
    }
    for (const x of [-0.5, 0.5]) g.add(mesh(box(0.25, 0.03, 0.4), mat('#ffd23f'), x * 1.25, y0 + 0.1, -0.2));
  }
  return g;
}

/** A coin, standing up (it spins around y). */
const coinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.06, 16).rotateX(Math.PI / 2);
const coinRimGeo = new THREE.TorusGeometry(0.22, 0.025, 4, 16);
export function makeCoin() {
  const g = new THREE.Group();
  g.add(mesh(coinGeo, mat('#ffcc1a'), 0, 0, 0));
  g.add(mesh(coinRimGeo, mat('#f2a900'), 0, 0, 0.035));
  g.add(mesh(coinRimGeo, mat('#f2a900'), 0, 0, -0.035));
  return g;
}
export const HANDLE = new THREE.Vector3(0, BASKET_Y + 0.62 + 0.26, 0.8);

export function makeObstacle(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'cone':
      g.add(mesh(box(0.6, 0.06, 0.6), mat('#ff7b00'), 0, 0.03, 0));
      g.add(mesh(cone(0.24, 0.6, 10), mat('#ff7b00'), 0, 0.36, 0));
      g.add(mesh(cyl(0.12, 0.17, 0.14, 10), mat('#ffffff'), 0, 0.36, 0));
      break;
    case 'bin':
      g.add(mesh(box(0.8, 1.05, 0.75), mat('#2e7d32'), 0, 0.55, 0));
      g.add(mesh(box(0.88, 0.1, 0.82), mat('#1b5e20'), 0, 1.12, 0));
      for (const x of [-0.3, 0.3]) { const w = mesh(cyl(0.1, 0.1, 0.08, 8), mat('#111111'), x, 0.1, 0.38); w.rotation.z = Math.PI / 2; g.add(w); }
      break;
    case 'crate':
      g.add(mesh(box(0.95, 0.75, 0.75), mat('#c08a4a'), 0, 0.38, 0));
      g.add(mesh(box(0.97, 0.08, 0.77), mat('#8a5c2c'), 0, 0.2, 0));
      g.add(mesh(box(0.97, 0.08, 0.77), mat('#8a5c2c'), 0, 0.56, 0));
      for (let i = 0; i < 6; i++) g.add(mesh(sph(0.13, 6, 5), mat(['#ff9f1c', '#e63946', '#7bc043'][i % 3]), -0.3 + (i % 3) * 0.3, 0.82, i < 3 ? -0.15 : 0.15));
      break;
    case 'bollard':
      g.add(mesh(cyl(0.15, 0.17, 0.85, 10), mat('#3a3f4b'), 0, 0.42, 0));
      g.add(mesh(cyl(0.155, 0.155, 0.1, 10), mat('#ffcc00'), 0, 0.62, 0));
      g.add(mesh(sph(0.16, 10, 6), mat('#4b5160'), 0, 0.85, 0));
      break;
    case 'scooter': {
      g.add(mesh(box(0.45, 0.4, 1.2), mat('#5ec8e5'), 0, 0.45, 0));
      g.add(mesh(box(0.4, 0.12, 0.6), mat('#2b2d42'), 0, 0.7, 0.15));
      g.add(mesh(box(0.08, 0.6, 0.08), mat('#555555'), 0, 0.85, -0.55));
      g.add(mesh(box(0.6, 0.06, 0.06), mat('#333333'), 0, 1.15, -0.55));
      for (const z of [-0.5, 0.5]) { const w = mesh(cyl(0.2, 0.2, 0.1, 10), mat('#222222'), 0, 0.2, z); w.rotation.z = Math.PI / 2; g.add(w); }
      g.rotation.y = 0.5;
      break;
    }
    case 'pothole': {
      const p = mesh(cyl(0.5, 0.5, 0.02, 9), mat('#2a2b30'), 0, 0.012, 0);
      p.scale.set(1, 1, 0.7);
      g.add(p);
      const r = mesh(cyl(0.56, 0.56, 0.018, 9), mat('#44454d'), 0, 0.008, 0);
      r.scale.set(1, 1, 0.75);
      g.add(r);
      break;
    }
    case 'puddle': {
      const p = mesh(cyl(0.78, 0.78, 0.02, 14), mat('#2d2a3a'), 0, 0.012, 0);
      p.scale.set(1, 1, 0.6);
      g.add(p);
      const s = mesh(cyl(0.45, 0.45, 0.02, 14), mat('#7fd6ff', { opacity: 0.55 }), -0.1, 0.03, 0);
      s.scale.set(1, 1, 0.4);
      g.add(s);
      const s2 = mesh(cyl(0.3, 0.3, 0.02, 14), mat('#ff7ad9', { opacity: 0.5 }), 0.2, 0.035, 0.05);
      s2.scale.set(1, 1, 0.5);
      g.add(s2);
      break;
    }
    case 'ramp': {
      const shape = new THREE.Shape([new THREE.Vector2(-0.8, 0), new THREE.Vector2(0.8, 0), new THREE.Vector2(0.8, 0.5)]);
      const wedge = new THREE.Mesh(geo('ramp', () => new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: false })), mat('#c99a5b'));
      wedge.rotation.y = Math.PI / 2;
      wedge.position.set(-0.65, 0, 0);
      g.add(wedge);
      const stripe = mesh(box(0.3, 0.02, 0.9), mat('#ffd23f'), 0, 0.27, 0);
      stripe.rotation.x = -0.36;
      g.add(stripe);
      break;
    }
    case 'barrier': {
      // Road-works barrier: two feet and a red-and-white board.
      for (const x of [-0.9, 0.9]) { g.add(mesh(box(0.08, 0.75, 0.08), mat('#555b66'), x, 0.375, 0)); g.add(mesh(box(0.1, 0.06, 0.5), mat('#333842'), x, 0.03, 0)); }
      for (let i = 0; i < 6; i++) g.add(mesh(box(0.31, 0.26, 0.05), mat(i % 2 ? '#ffffff' : '#e63946'), -0.78 + i * 0.31, 0.6, 0));
      break;
    }
    case 'bench': {
      for (let i = 0; i < 3; i++) g.add(mesh(box(1.7, 0.05, 0.13), mat('#a0703f'), 0, 0.46 + (i === 2 ? 0.25 : 0), -0.18 + i * 0.16 + (i === 2 ? 0.02 : 0)));
      for (const x of [-0.7, 0.7]) { g.add(mesh(box(0.06, 0.46, 0.45), mat('#2f3640'), x, 0.23, 0)); g.add(mesh(box(0.06, 0.3, 0.06), mat('#2f3640'), x, 0.6, 0.18)); }
      break;
    }
    case 'boxes': {
      g.add(mesh(box(0.95, 0.42, 0.8), mat('#c89b62'), 0, 0.21, 0));
      g.add(mesh(box(0.6, 0.28, 0.5), mat('#b98a52'), 0.12, 0.56, 0.05));
      g.add(mesh(box(0.97, 0.06, 0.15), mat('#e8d7b0'), 0, 0.3, 0.33));
      break;
    }
    case 'block': {
      // A floating golden block with a star (Rainbow Road).
      g.add(mesh(box(0.95, 0.95, 0.95), mat('#ffb703'), 0, 0.5, 0));
      for (const z of [-0.48, 0.48]) g.add(mesh(box(0.35, 0.35, 0.02), mat('#fff3b0', { basic: true }), 0, 0.5, z));
      for (const x of [-0.48, 0.48]) g.add(mesh(box(0.02, 0.35, 0.35), mat('#fff3b0', { basic: true }), x, 0.5, 0));
      g.add(mesh(box(1.0, 0.06, 1.0), mat('#c77d00'), 0, 0.03, 0));
      break;
    }
    case 'neon': {
      // A low glowing bar across the road (Rainbow Road): jump it.
      for (const x of [-1.05, 1.05]) g.add(mesh(box(0.1, 0.55, 0.1), mat('#ffffff', { basic: true }), x, 0.275, 0));
      const bands = ['#ff4f6d', '#ffcf3a', '#3ddc84', '#3fb6ff', '#8f6bff'];
      for (let i = 0; i < 5; i++) g.add(mesh(box(0.42, 0.14, 0.08), mat(bands[i], { basic: true }), -0.84 + i * 0.42, 0.45, 0));
      break;
    }
    case 'ice': {
      const p = mesh(cyl(1.0, 1.0, 0.02, 14), mat('#bfe6ff', { opacity: 0.8 }), 0, 0.012, 0);
      p.scale.set(1, 1, 0.65);
      g.add(p);
      const s = mesh(cyl(0.5, 0.5, 0.02, 10), mat('#ffffff', { opacity: 0.7 }), 0.2, 0.025, -0.05);
      s.scale.set(1, 1, 0.35);
      g.add(s);
      break;
    }
    case 'pipe': {
      const p = mesh(cyl(0.24, 0.24, 3.0, 12), mat('#f28c28'), 0, 0.24, 0);
      p.rotation.z = Math.PI / 2;
      g.add(p);
      for (const x of [-1.5, 1.5]) { const rim = mesh(cyl(0.27, 0.27, 0.08, 12), mat('#b85f12'), x, 0.24, 0); rim.rotation.z = Math.PI / 2; g.add(rim); }
      break;
    }
    default: break;
  }
  return g;
}

/** The rider: a kid in a hoodie and a backwards cap, standing on the back of the cart. */
export function makeRider() {
  const g = new THREE.Group();
  const hoodie = mat('#ff7a2f'), jeans = mat('#30507a'), skin = mat('#f1c27d'), shoe = mat('#ffffff');
  const hips = new THREE.Group();
  hips.position.set(0, 0.95, 0);
  g.add(hips);
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, x] of [[legL, -0.12], [legR, 0.12]]) {
    leg.position.set(x, 0, 0);
    leg.add(mesh(box(0.16, 0.7, 0.18), jeans, 0, -0.35, 0));
    leg.add(mesh(box(0.17, 0.09, 0.28), shoe, 0, -0.68, -0.05));
    hips.add(leg);
  }
  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(mesh(box(0.46, 0.55, 0.28), hoodie, 0, 0.28, 0));
  torso.add(mesh(box(0.3, 0.16, 0.12), mat('#e8641c'), 0, 0.2, -0.15));
  const head = new THREE.Group();
  head.position.set(0, 0.7, 0);
  head.add(mesh(box(0.28, 0.3, 0.28), skin, 0, 0, 0));
  head.add(mesh(box(0.3, 0.12, 0.3), mat('#e63946'), 0, 0.15, 0));
  head.add(mesh(box(0.22, 0.04, 0.16), mat('#e63946'), 0, 0.11, 0.2)); // the peak, backwards
  head.add(mesh(box(0.3, 0.08, 0.08), mat('#3b2a20'), 0, 0.02, 0.12));
  torso.add(head);
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, x] of [[armL, -0.29], [armR, 0.29]]) {
    arm.position.set(x, 0.5, 0);
    arm.add(mesh(box(0.12, 0.5, 0.13), hoodie, 0, -0.25, 0));
    arm.add(mesh(box(0.1, 0.1, 0.1), skin, 0, -0.53, 0));
    torso.add(arm);
  }
  g.userData = { hips, legL, legR, torso, head, armL, armR };
  return g;
}

/** Pose: lean (-1..1 sideways), crouch (0..1, braking), air (0..1, jumping), cheer (0..1), t (seconds). */
export function poseRider(r, { lean = 0, crouch = 0, air = 0, cheer = 0, fall = 0, t = 0 }) {
  const { hips, legL, legR, torso, head, armL, armR } = r.userData;
  hips.position.y = 0.95 - crouch * 0.22 + air * 0.05;
  hips.rotation.z = -lean * 0.12;
  torso.rotation.x = -0.35 - crouch * 0.35 + air * 0.15;
  torso.rotation.z = -lean * 0.18;
  legL.rotation.x = crouch * 0.5 + air * 0.6; legR.rotation.x = crouch * 0.5 - air * 0.3;
  // Arms on the handle; up in the air when cheering or flying.
  const up = Math.max(cheer, air * 0.8);
  armL.rotation.x = -1.1 * (1 - up) - 3.0 * up; armR.rotation.x = -1.1 * (1 - up) - 3.0 * up + Math.sin(t * 10) * 0.2 * cheer;
  armL.rotation.z = 0.15 * up; armR.rotation.z = -0.15 * up;
  head.rotation.y = lean * 0.3;
  head.rotation.x = 0.25 + crouch * 0.2;
  r.rotation.z = -fall * 1.3;
}

export function makeTrafficLight() {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.07, 0.08, 3.2, 8), mat('#2f3640'), 0, 1.6, 0));
  g.add(mesh(box(0.38, 1.05, 0.3), mat('#1f232b'), 0, 3.6, 0));
  const lamps = {};
  [['red', 3.92], ['yellow', 3.6], ['green', 3.28]].forEach(([name, y]) => {
    const m = new THREE.MeshBasicMaterial({ color: '#333333' });
    const l = new THREE.Mesh(sph(0.12, 10, 8), m);
    l.position.set(0, y, 0.15);
    g.add(l);
    lamps[name] = m;
  });
  // A small one for pedestrians, facing the street.
  g.userData = { lamps };
  return g;
}

export const LAMP_ON = { red: '#ff2a2a', yellow: '#ffcc00', green: '#2bff6a' };

export function makeRailBarrier() {
  const g = new THREE.Group();
  g.add(mesh(box(0.25, 1.1, 0.25), mat('#e8e8e8'), 0, 0.55, 0));
  const arm = new THREE.Group();
  arm.position.set(0, 1.0, 0);
  for (let i = 0; i < 8; i++) arm.add(mesh(box(0.55, 0.1, 0.08), mat(i % 2 ? '#ffffff' : '#e63946'), 0.3 + i * 0.55, 0, 0));
  g.add(arm);
  // Two red lamps that flash in turn.
  const lampA = new THREE.MeshBasicMaterial({ color: '#441111' }), lampB = new THREE.MeshBasicMaterial({ color: '#441111' });
  g.add(mesh(box(0.7, 0.08, 0.08), mat('#222222'), 0, 1.75, 0));
  const a = new THREE.Mesh(sph(0.12, 8, 6), lampA); a.position.set(-0.28, 1.75, 0.08); g.add(a);
  const b = new THREE.Mesh(sph(0.12, 8, 6), lampB); b.position.set(0.28, 1.75, 0.08); g.add(b);
  g.add(mesh(cyl(0.05, 0.05, 1.8, 6), mat('#2f3640'), 0, 0.9, -0.2));
  g.userData = { arm, lampA, lampB };
  return g;
}

/** A regional train: three cars along x, the front at x = 0, running towards +x. */
export function makeTrain() {
  const g = new THREE.Group();
  const carLen = 18.5;
  for (let i = 0; i < 3; i++) {
    const x = -i * (carLen + 0.6) - carLen / 2;
    g.add(mesh(box(carLen, 2.6, 2.9), mat(i === 0 ? '#2a9d8f' : '#f1f1ee'), x, 1.9, 0));
    g.add(mesh(box(carLen, 0.4, 2.95), mat('#2a9d8f'), x, 1.0, 0));
    g.add(mesh(box(carLen - 1, 0.7, 2.96), mat('#26323d'), x, 2.45, 0));
    g.add(mesh(box(carLen, 0.25, 2.7), mat('#9aa3ad'), x, 3.3, 0));
    for (const wx of [-carLen / 2 + 2.5, carLen / 2 - 2.5]) for (const z of [-1.1, 1.1]) {
      const w = mesh(cyl(0.45, 0.45, 0.25, 10), mat('#1d1d22'), x + wx, 0.45, z);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
  // The nose, with headlights.
  g.add(mesh(box(1.2, 2.2, 2.7), mat('#2a9d8f'), 0.4, 1.7, 0));
  g.add(mesh(box(0.1, 0.25, 0.4), mat('#fffbe0', { basic: true }), 1.02, 1.2, -0.8));
  g.add(mesh(box(0.1, 0.25, 0.4), mat('#fffbe0', { basic: true }), 1.02, 1.2, 0.8));
  return g;
}

/** The traffic warden, as on the logo: blue uniform, police cap with a badge, dark glasses, a baton. */
export function makeCop() {
  const look = 4; // no bag, no hat
  const g = makeWalker(look);
  const shirt = mat(SHIRT[look % SHIRT.length]), pants = mat(PANTS[(look >> 2) % PANTS.length]);
  const hair = mat(HAIR[(look >> 3) % HAIR.length]);
  g.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === shirt) o.material = mat('#1f4fa8');
    else if (o.material === pants) o.material = mat('#1a2f66');
    else if (o.material === hair) o.visible = false;
  });
  // cap: crown, band and peak, with a gold badge
  g.add(mesh(box(0.34, 0.14, 0.34), mat('#1a2f66'), 0, 1.83, 0.01));
  g.add(mesh(box(0.31, 0.06, 0.31), mat('#0f1c40'), 0, 1.74, 0.01));
  g.add(mesh(box(0.3, 0.03, 0.14), mat('#0f1c40'), 0, 1.72, -0.2));
  g.add(mesh(box(0.08, 0.08, 0.02), mat('#ffcf3a'), 0, 1.82, -0.17));
  // dark glasses
  g.add(mesh(box(0.3, 0.07, 0.03), mat('#14161c'), 0, 1.62, -0.15));
  // belt with a buckle, and a badge on the chest
  g.add(mesh(box(0.46, 0.07, 0.27), mat('#14161c'), 0, 0.82, 0));
  g.add(mesh(box(0.06, 0.07, 0.02), mat('#ffcf3a'), -0.12, 1.22, -0.14));
  // the baton, in the raised right hand
  const { armR } = g.userData;
  const baton = mesh(cyl(0.035, 0.035, 0.5, 6), mat('#14161c'), 0, -0.62, -0.18);
  baton.rotation.x = Math.PI / 2;
  armR.add(baton);
  return g;
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const SHIRT = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#8f6bff', '#ffd23f', '#6a994e', '#ef476f'];
const PANTS = ['#264653', '#3d405b', '#6b705c', '#1d3557', '#9c6644'];
const HAIR = ['#2b2118', '#6b4423', '#d9b36c', '#9a9a9a', '#e8e8e8', '#b23a48'];

/** Someone crossing the street (legs swing while walking). look: a number picking colours and extras. */
export function makeWalker(look) {
  const g = new THREE.Group();
  const shirt = mat(SHIRT[look % SHIRT.length]), pants = mat(PANTS[(look >> 2) % PANTS.length]);
  const skin = mat(SKIN[(look >> 1) % SKIN.length]), hair = mat(HAIR[(look >> 3) % HAIR.length]);
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, x] of [[legL, -0.11], [legR, 0.11]]) {
    leg.position.set(x, 0.8, 0);
    leg.add(mesh(box(0.15, 0.8, 0.17), pants, 0, -0.4, 0));
    leg.add(mesh(box(0.16, 0.08, 0.26), mat('#2b2d42'), 0, -0.78, -0.04));
    g.add(leg);
  }
  g.add(mesh(box(0.44, 0.6, 0.26), shirt, 0, 1.1, 0));
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, x] of [[armL, -0.28], [armR, 0.28]]) {
    arm.position.set(x, 1.36, 0);
    arm.add(mesh(box(0.11, 0.55, 0.13), shirt, 0, -0.26, 0));
    arm.add(mesh(box(0.1, 0.1, 0.1), skin, 0, -0.56, 0));
    g.add(arm);
  }
  g.add(mesh(box(0.28, 0.3, 0.28), skin, 0, 1.58, 0));
  g.add(mesh(box(0.3, 0.12, 0.3), hair, 0, 1.76, 0.01));
  if (look % 3 === 0) g.add(mesh(box(0.2, 0.28, 0.24), mat('#e9c46a'), 0.3, 0.95, 0)); // a shopping bag
  if (look % 4 === 1) { g.add(mesh(cyl(0.22, 0.22, 0.04, 10), mat('#3d405b'), 0, 1.82, 0)); g.add(mesh(cyl(0.14, 0.15, 0.14, 10), mat('#3d405b'), 0, 1.88, 0)); }
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function animateWalker(g, phase, moving) {
  const { legL, legR, armL, armR } = g.userData;
  const a = moving ? Math.sin(phase) * 0.6 : 0;
  legL.rotation.x = a; legR.rotation.x = -a;
  armL.rotation.x = -a * 0.8; armR.rotation.x = a * 0.8;
}

const BIRDS = {
  pigeon: { body: '#8d99ae', head: '#6d7a92', beak: '#f4a261' },
  gull: { body: '#f4f6f8', head: '#ffffff', beak: '#ffc300', wing: '#9aa5b1' },
  crow: { body: '#2b2d35', head: '#1d1e24', beak: '#4a4a4a' },
};
export function makePigeon(kind = 'pigeon') {
  const look = BIRDS[kind] || BIRDS.pigeon;
  const g = new THREE.Group();
  const b = mesh(sph(0.12, 8, 6), mat(look.body), 0, 0.14, 0);
  b.scale.set(0.9, 0.85, 1.4);
  g.add(b);
  g.add(mesh(sph(0.07, 8, 6), mat(look.head), 0, 0.25, -0.13));
  const beak = mesh(cone(0.025, 0.06, 5), mat(look.beak), 0, 0.24, -0.21);
  beak.rotation.x = -Math.PI / 2;
  g.add(beak);
  const wing = mat(look.wing || look.head);
  const wl = mesh(box(0.25, 0.02, 0.14), wing, -0.13, 0.18, 0.02);
  const wr = mesh(box(0.25, 0.02, 0.14), wing, 0.13, 0.18, 0.02);
  g.add(wl, wr);
  g.userData = { wl, wr };
  return g;
}

export function makeDog(look) {
  const g = new THREE.Group();
  const fur = mat(['#a0522d', '#d2b48c', '#3b2f2f', '#f5f5f5'][look % 4]);
  const dark = mat('#2b2118');
  g.add(mesh(box(0.34, 0.3, 0.7), fur, 0, 0.45, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.68, -0.4);
  head.add(mesh(box(0.28, 0.26, 0.3), fur, 0, 0, 0));
  head.add(mesh(box(0.16, 0.12, 0.16), fur, 0, -0.05, -0.2));
  head.add(mesh(box(0.06, 0.06, 0.04), dark, 0, -0.01, -0.29));
  head.add(mesh(box(0.08, 0.16, 0.06), dark, -0.12, 0.14, 0.02));
  head.add(mesh(box(0.08, 0.16, 0.06), dark, 0.12, 0.14, 0.02));
  g.add(head);
  const tail = mesh(box(0.06, 0.06, 0.3), fur, 0, 0.6, 0.45);
  tail.rotation.x = -0.6;
  g.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.12, -0.25], [0.12, -0.25], [-0.12, 0.25], [0.12, 0.25]]) {
    const l = new THREE.Group();
    l.position.set(x, 0.32, z);
    l.add(mesh(box(0.08, 0.32, 0.08), fur, 0, -0.16, 0));
    g.add(l);
    legs.push(l);
  }
  g.userData = { legs, tail, head };
  return g;
}

export function animateDog(g, phase) {
  const { legs, tail, head } = g.userData;
  legs.forEach((l, i) => { l.rotation.x = Math.sin(phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * 0.8; });
  tail.rotation.y = Math.sin(phase * 2) * 0.6;
  head.position.y = 0.68 + Math.abs(Math.sin(phase)) * 0.04;
}

/** A soft round shadow (sits just above the ground). */
const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });
const shadowGeo = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
export function makeShadow(r = 0.5) {
  const s = new THREE.Mesh(shadowGeo, shadowMat);
  s.scale.set(r * 2, 1, r * 2);
  s.position.y = 0.02;
  s.renderOrder = 1;
  return s;
}
