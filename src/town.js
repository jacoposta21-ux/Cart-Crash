// The static scenery around each section of road, built as one mesh per section
// (vertex colours, flat shading): road, curbs, steps, houses with roofs,
// shutters and washing, market stalls, trees, lamps and flower pots. Each
// track has its theme: the Old Town; the Mountain (chalets, ski slopes, a
// frozen lake, snow and pines); the Sea (wooden piers over the water from
// island to island, boats, beach huts); the Volcano (a jungle trail, rope
// bridges over a chasm, lava in the gaps); the Rainbow Road (a rainbow in
// space). Gaps in the road (src/world.js) are left open. buildBackdrop() makes
// the far scenery: mountains, islands, the volcano.
import * as THREE from '../vendor/three/three.module.min.js';
import { hash2, STEP_LENGTH } from './world.js';

const THEMES = {
  town: {
    walls: ['#f2c27b', '#ef8f6b', '#f6e0b5', '#e9a2a2', '#b7d3c9', '#f3d27a', '#d7b8e0', '#f0b48a', '#fbe3c8'],
    roofs: ['#c8553d', '#b4472f', '#d26a3e', '#a8432f', '#c0603f'],
    shutters: ['#2f7d5b', '#3a6ea5', '#7a3b2e', '#2f7d5b'],
    awnings: ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#6a994e'],
    road: { street: '#5b5f6b', sidewalk: '#dcc9a5', stairs: '#d6c4a2', market: '#bba183' },
    band: { street: '#efe3cb', sidewalk: '#b8a382', stairs: '#c4ae8a', market: '#cdb593' },
    ground: '#e2d3b5', lawn: '#9fc46b', kerb: '#d7d1c3', stripe: '#d0bd9a', riser: '#a8957a', nose: '#efe4cc', stairWall: '#b9a27f',
    stall: ['#ff6b35', '#ffd23f', '#7bc043', '#e63946', '#8f6bff'], flat: 0.3, washing: 0.22, tree: 'round',
  },
  alpine: {
    walls: ['#8b5a2b', '#a0632f', '#7a4a24', '#f1e6d0', '#b5763b'],
    roofs: ['#f7fbff', '#eef5fb'],
    shutters: ['#b02e2e', '#2f6b3a', '#b02e2e'],
    awnings: ['#c1121f', '#2f6b3a', '#c1121f'],
    road: { street: '#6f7884', sidewalk: '#e9f1f7', stairs: '#d8e2ea', market: '#c7cfd6' },
    band: { street: '#f4f8fb', sidewalk: '#c9d6e0', stairs: '#c3cfd9', market: '#e7eef4' },
    ground: '#f4f8fb', lawn: '#f4f8fb', kerb: '#dfe8ef', stripe: '#cbd6df', riser: '#9aa8b4', nose: '#f8fbfd', stairWall: '#b4c1cc',
    stall: ['#c1121f', '#ffd23f', '#7bc043', '#f4f8fb', '#8b5a2b'], flat: 0, washing: 0, tree: 'pine',
  },
};

const tmp = new THREE.Color();

class Builder {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, color) {
    tmp.set(color);
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(tmp.r, tmp.g, tmp.b);
  }
  /** Four corners counter-clockwise seen from the side that should be lit. */
  quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  /** Axis-aligned box centred on (x, z), standing on y. */
  box(x, y, z, w, h, d, color, rotY = 0) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const p = (dx, dy, dz) => [x + dx * c + dz * s, y + dy, z - dx * s + dz * c];
    const W = w / 2, D = d / 2;
    const v = [p(-W, 0, -D), p(W, 0, -D), p(W, 0, D), p(-W, 0, D), p(-W, h, -D), p(W, h, -D), p(W, h, D), p(-W, h, D)];
    this.quad(v[3], v[2], v[6], v[7], color); // +z
    this.quad(v[1], v[0], v[4], v[5], color); // -z
    this.quad(v[2], v[1], v[5], v[6], color); // +x
    this.quad(v[0], v[3], v[7], v[4], color); // -x
    this.quad(v[7], v[6], v[5], v[4], color); // top
  }
  /** A low-poly blob (octahedron) for tree tops and fruit. */
  blob(x, y, z, r, color, sy = 1) {
    const t = [x, y + r * sy, z], b = [x, y - r * sy, z];
    const ring = [[x + r, y, z], [x, y, z - r], [x - r, y, z], [x, y, z + r]];
    for (let i = 0; i < 4; i++) {
      const a = ring[i], c = ring[(i + 1) % 4];
      this.tri(a, c, t, color);
      this.tri(c, a, b, color);
    }
  }
  /** A low-poly cone (pine tree tiers). */
  cone(x, y, z, r, h, color, n = 6) {
    const top = [x, y + h, z];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      this.tri([x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(b) * r, y, z + Math.sin(b) * r], top, color);
    }
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
}

// Double sided: with flat shading the lighting does not depend on the triangles' winding.
export const townMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

/** World point (x across, y down the road, h above the ground at y) → three.js coordinates. */
export function makePoint(world) {
  return (x, y, h = 0) => [x, world.elevation(y) + h, -y];
}

export function buildSection(world, s) {
  const theme = world.track?.theme || 'town';
  if (theme === 'rainbow') return buildRainbow(world, s);
  if (s.kind === 'slope' || s.kind === 'lake') return buildSnow(world, s);
  if (s.kind === 'pier') return buildPier(world, s);
  if (s.kind === 'island') return buildIsland(world, s);
  if (s.kind === 'trail' || s.kind === 'bridge' || theme === 'jungle') return buildJungle(world, s);
  const P = THEMES[theme];
  const B = new Builder();
  const C = (y) => world.center(y), HW = (y) => world.halfWidth(y);
  const kind = s.kind;
  const band = kind === 'street' ? 1.4 : 0.5;
  const curb = kind === 'street' ? 0.14 : 0.35; // sidewalk kerb, or a low wall
  const far = 26;

  // Sample points along the section; stairs get a top and a bottom point at each step edge.
  const ys = [];
  if (kind === 'stairs') {
    for (let k = 0; k <= s.steps; k++) ys.push(s.start + k * STEP_LENGTH);
  } else {
    for (let y = s.start; y < s.end; y += 1.5) ys.push(y);
    ys.push(s.end);
  }
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    // On stairs each tread is flat, at the height of the step it belongs to.
    const e0 = kind === 'stairs' ? world.elevation(y0 + 0.01) : world.elevation(y0);
    const e1 = kind === 'stairs' ? e0 : world.elevation(y1);
    const pt = (x, y, e, h = 0) => [x, e + h, -y];
    const c0 = C(y0), c1 = C(y1), h0 = HW(y0), h1 = HW(y1);
    const stripe = kind === 'stairs' ? (i % 2 ? P.stripe : P.road.stairs) : P.road[kind];
    B.quad(pt(c0 - h0, y0, e0), pt(c0 + h0, y0, e0), pt(c1 + h1, y1, e1), pt(c1 - h1, y1, e1), stripe);
    if (kind === 'street' && Math.floor(y0 / 3) % 2 === 0) {
      B.quad(pt(c0 - 0.07, y0, e0, 0.01), pt(c0 + 0.07, y0, e0, 0.01), pt(c1 + 0.07, y1, e1, 0.01), pt(c1 - 0.07, y1, e1, 0.01), '#f6f1e3');
    }
    if (kind === 'stairs') {
      // The riser down to the next tread, with a light edge on the nose.
      const e2 = world.elevation(y1 + 0.01);
      if (i < ys.length - 2 || y1 < s.end) B.quad(pt(c1 - h1, y1, e2), pt(c1 + h1, y1, e2), pt(c1 + h1, y1, e1), pt(c1 - h1, y1, e1), P.riser);
      B.quad(pt(c1 - h1, y1 - 0.08, e1, 0.005), pt(c1 + h1, y1 - 0.08, e1, 0.005), pt(c1 + h1, y1, e1, 0.005), pt(c1 - h1, y1, e1, 0.005), P.nose);
    }
    for (const side of [-1, 1]) {
      const a0 = c0 + side * h0, a1 = c1 + side * h1;
      const b0 = c0 + side * (h0 + band), b1 = c1 + side * (h1 + band);
      const f0 = c0 + side * (h0 + far), f1 = c1 + side * (h1 + far);
      const q = (p1, p2, p3, p4, col) => (side < 0 ? B.quad(p2, p1, p4, p3, col) : B.quad(p1, p2, p3, p4, col));
      // kerb face, kerb top / sidewalk, then the ground out to the houses
      q(pt(a0, y0, e0), pt(a0, y0, e0, curb), pt(a1, y1, e1, curb), pt(a1, y1, e1), kind === 'street' ? P.kerb : P.band[kind]);
      q(pt(a0, y0, e0, curb), pt(b0, y0, e0, curb), pt(b1, y1, e1, curb), pt(a1, y1, e1, curb), P.band[kind]);
      q(pt(b0, y0, e0, curb), pt(f0, y0, e0, curb), pt(f1, y1, e1, curb), pt(b1, y1, e1, curb), kind === 'sidewalk' ? P.lawn : P.ground);
      if (kind === 'stairs') {
        // the side walls of the stairs step down too
        const e2 = world.elevation(y1 + 0.01);
        q(pt(b1, y1, e2, curb), pt(f1, y1, e2, curb), pt(f1, y1, e1, curb), pt(b1, y1, e1, curb), P.stairWall);
      }
    }
  }

  // ---- houses, both sides ----
  const BLOCK = 6.5;
  const inner = kind === 'street' ? 1.5 : kind === 'market' ? 2.3 : kind === 'stairs' ? 0.7 : 1.8;
  for (let k = Math.floor(s.start / BLOCK); k * BLOCK < s.end; k++) {
    const ya = Math.max(s.start, k * BLOCK) + 0.15, yb = Math.min(s.end, (k + 1) * BLOCK) - 0.15;
    if (yb - ya < 2) continue;
    for (const side of [-1, 1]) {
      const h = hash2(k, side);
      const edge = (y, off) => C(y) + side * (HW(y) + off);
      const depth = 5 + h * 3;
      const floors = 2 + Math.floor(hash2(k, side * 5) * 3);
      const height = floors * 2.8 + 0.6;
      const eMin = Math.min(world.elevation(ya), world.elevation(yb)), eMax = Math.max(world.elevation(ya), world.elevation(yb));
      const bottom = eMin + (kind === 'street' ? 0.14 : 0.35) - 0.6, top = eMax + height;
      const wall = P.walls[Math.floor(h * P.walls.length)];
      const fA = edge(ya, inner), fB = edge(yb, inner), bA = edge(ya, inner + depth), bB = edge(yb, inner + depth);
      // corners in three.js coords
      const v = (x, y, e) => [x, e, -y];
      const Fa0 = v(fA, ya, bottom), Fb0 = v(fB, yb, bottom), Fa1 = v(fA, ya, top), Fb1 = v(fB, yb, top);
      const Ba0 = v(bA, ya, bottom), Bb0 = v(bB, yb, bottom), Ba1 = v(bA, ya, top), Bb1 = v(bB, yb, top);
      const q = (p1, p2, p3, p4, col) => (side < 0 ? B.quad(p1, p2, p3, p4, col) : B.quad(p2, p1, p4, p3, col));
      q(Fa0, Fb0, Fb1, Fa1, wall); // facade on the street
      q(Fb0, Bb0, Bb1, Fb1, wall); // the far end (downhill)
      q(Ba0, Fa0, Fa1, Ba1, wall); // the near end (uphill)
      const roofType = hash2(k, side * 13);
      const roof = P.roofs[Math.floor(hash2(k, side * 7) * P.roofs.length)];
      if (roofType >= P.flat) {
        // Pitched roof with the ridge along the street; a little overhang over the facade.
        const ov = 0.35, rise = 1.6;
        const mA = edge(ya, inner + depth / 2), mB = edge(yb, inner + depth / 2);
        const oA = edge(ya, inner - ov), oB = edge(yb, inner - ov);
        const Ra = v(mA, ya, top + rise), Rb = v(mB, yb, top + rise);
        const Oa = v(oA, ya, top - 0.25), Ob = v(oB, yb, top - 0.25);
        q(Oa, Ob, Rb, Ra, roof);
        q(Ra, Rb, Bb1, Ba1, roof);
        q(Fa1, Ba1, Ra, Ra, wall); // gable ends (degenerate quad = triangle)
        q(Bb1, Fb1, Rb, Rb, wall);
        if (h > 0.5) {
          const yc = ya + (yb - ya) * hash2(k, 3);
          const ec = world.elevation(yc);
          const cxp = edge(yc, inner + depth * 0.65);
          B.box(cxp, Math.max(top, ec + height) + 0.3, -yc, 0.5, 1.6, 0.5, '#8d5b4a');
        }
      } else {
        // Flat terrace: parapet, water tank, washing on a line.
        const T = (x, y, hh = 0) => v(x, y, top + hh);
        q(T(fA, ya, 0.4), T(fB, yb, 0.4), T(fB, yb), T(fA, ya), wall);
        B.quad(...(side < 0 ? [T(fA, ya), T(fB, yb), T(bB, yb), T(bA, ya)] : [T(fB, yb), T(fA, ya), T(bA, ya), T(bB, yb)]), '#e7dccb');
        const yc = (ya + yb) / 2;
        B.box(edge(yc, inner + depth * 0.6), top, -yc, 1.1, 1.1, 1.1, '#5f9ec7');
        const cloth = ['#e63946', '#ffd23f', '#3fb6ff', '#ffffff', '#8f6bff'];
        for (let i = 0; i < 3; i++) {
          const yy = ya + 1 + i * (yb - ya - 2) / 2;
          B.box(edge(yy, inner + 1.2), top + 0.7, -yy, 0.05, 0.6, 0.5, cloth[(k + i) % 5]);
        }
      }
      // Windows with shutters, and a door, on the facade.
      const dir = new THREE.Vector3(fB - fA, 0, -(yb - ya)).normalize();
      const nrm = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side < 0 ? -1 : 1);
      // make sure the normal points at the street
      if (nrm.x * side > 0) nrm.multiplyScalar(-1);
      const shutter = P.shutters[Math.floor(hash2(k, side * 11) * P.shutters.length)];
      const cols = Math.max(2, Math.floor((yb - ya) / 2.2));
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < cols; i++) {
          const t = (i + 0.5) / cols;
          const yy = ya + t * (yb - ya);
          const base = world.elevation(yy) + (kind === 'street' ? 0.14 : 0.35);
          const cx = fA + t * (fB - fA);
          const isDoor = f === 0 && i === Math.floor(h * cols);
          const wy = base + (isDoor ? 0 : 1.0) + f * 2.8;
          const ww = isDoor ? 1.0 : 0.75, wh = isDoor ? 2.1 : 1.25;
          const off = (a, u, hh, push) => [cx + dir.x * u + nrm.x * push, wy + hh, -yy + dir.z * u + nrm.z * push];
          const rect = (u0, u1, h0, h1, push, col) => {
            const p1 = off(0, u0, h0, push), p2 = off(0, u1, h0, push), p3 = off(0, u1, h1, push), p4 = off(0, u0, h1, push);
            if (side < 0) B.quad(p2, p1, p4, p3, col); else B.quad(p1, p2, p3, p4, col);
          };
          if (wy + wh > top - 0.2) continue;
          rect(-ww / 2, ww / 2, 0, wh, 0.03, isDoor ? '#6b3f2a' : '#34505e');
          if (!isDoor) {
            rect(-ww / 2 - 0.36, -ww / 2, 0, wh, 0.05, shutter);
            rect(ww / 2, ww / 2 + 0.36, 0, wh, 0.05, shutter);
            if (f > 0 && hash2(k * 7 + i, f) < 0.35) {
              // a little balcony with flowers
              rect(-ww / 2 - 0.2, ww / 2 + 0.2, -0.1, 0.35, 0.4, '#3b3f4a');
              rect(-ww / 2 - 0.1, ww / 2 + 0.1, 0.35, 0.5, 0.42, ['#e63946', '#ff8fab', '#ffd23f'][(k + f) % 3]);
            }
          }
        }
      }

      // Street furniture in front of the houses.
      const ym = (ya + yb) / 2;
      const em = world.elevation(ym) + curb;
      if (kind === 'market') {
        // Stall: table with fruit and a striped awning.
        const x0 = edge(ym, 0.25), x1 = edge(ym, 1.9);
        const xc = (x0 + x1) / 2;
        B.box(xc, em, -ym, 1.5, 0.85, yb - ya - 1.2, '#8b5e3c');
        const fruit = P.stall;
        for (let i = 0; i < 6; i++) {
          const yy = ya + 1 + i * (yb - ya - 2) / 5;
          for (let j = 0; j < 2; j++) B.blob(xc - 0.35 + j * 0.7, em + 1.0, -yy, 0.2, fruit[(k + i + j) % 5]);
        }
        const aw = P.awnings[Math.floor(hash2(k, side * 3) * P.awnings.length)];
        const n = 6;
        for (let i = 0; i < n; i++) {
          const y2 = ya + 0.4 + (i * (yb - ya - 0.8)) / n, y3 = ya + 0.4 + ((i + 1) * (yb - ya - 0.8)) / n;
          const lo = em + 2.1, hi = em + 2.7;
          const A1 = [edge(y2, 0.1), lo, -y2], A2 = [edge(y3, 0.1), lo, -y3], A3 = [edge(y3, 2.2), hi, -y3], A4 = [edge(y2, 2.2), hi, -y2];
          const col = i % 2 ? aw : '#ffffff';
          if (side < 0) B.quad(A1, A2, A3, A4, col); else B.quad(A2, A1, A4, A3, col);
        }
        for (const yy of [ya + 0.5, yb - 0.5]) B.box(edge(yy, 0.15), em, -yy, 0.08, 2.1, 0.08, '#5c4033');
      } else if (kind === 'sidewalk' || (kind === 'street' && h < 0.3)) {
        tree(B, P.tree, edge(ym, kind === 'street' ? 0.9 : 1.1), em, -ym, k);
      } else if (kind === 'street' && h < 0.7) {
        // A street lamp.
        const xl = edge(ym, 0.6);
        B.box(xl, em, -ym, 0.12, 3.6, 0.12, '#3b3f4a');
        B.box(xl - side * 0.35, em + 3.5, -ym, 0.8, 0.1, 0.1, '#3b3f4a');
        B.box(xl - side * 0.7, em + 3.3, -ym, 0.3, 0.22, 0.3, '#ffe9a8');
      } else if (kind === 'stairs') {
        for (const yy of [ya + 1, yb - 1]) {
          const xp = edge(yy, 0.3);
          const ep = world.elevation(yy) + curb;
          B.box(xp, ep, -yy, 0.45, 0.4, 0.45, '#b5583b');
          B.blob(xp, ep + 0.55, -yy, 0.28, ['#e63946', '#ffd23f', '#f78fb3'][Math.abs(k) % 3]);
        }
      }
    }
    // Now and then a washing line right across the street.
    if (hash2(k, 99) < P.washing && kind !== 'market') {
      const yy = Math.min(yb - 0.5, ya + 2);
      const e = world.elevation(yy) + 7.2;
      const xa = C(yy) - HW(yy) - inner, xb = C(yy) + HW(yy) + inner;
      B.box((xa + xb) / 2, e, -yy, xb - xa, 0.03, 0.03, '#555555');
      const cloth = ['#e63946', '#ffd23f', '#3fb6ff', '#ffffff', '#8f6bff', '#ff8fab'];
      for (let i = 1; i < 8; i++) {
        const x = xa + (i * (xb - xa)) / 8;
        B.box(x, e - 0.55, -yy, 0.35 + hash2(k, i) * 0.25, 0.55, 0.03, cloth[(k + i) % 6]);
      }
    }
  }
  return B.mesh(townMaterial);
}

/** A tree in the theme's style: round (Old Town), palm (Harbour) or pine (Mountain). */
function tree(B, style, x, y, z, k) {
  if (style === 'pine') {
    B.box(x, y, z, 0.25, 0.9, 0.25, '#6b4226');
    for (let i = 0; i < 3; i++) B.cone(x, y + 0.6 + i * 0.85, z, 1.25 - i * 0.32, 1.4, i === 2 ? '#f4f8fb' : '#2f5d3a');
  } else if (style === 'palm') {
    for (let i = 0; i < 5; i++) B.box(x + i * 0.08, y + i * 0.7, z, 0.22, 0.72, 0.22, i % 2 ? '#a07040' : '#8b5e34');
    const top = y + 3.4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + k;
      const dx = Math.cos(a) * 1.4, dz = Math.sin(a) * 1.4;
      B.quad([x + 0.35, top, z], [x + 0.35 + dx, top - 0.6, z + dz + 0.25], [x + 0.35 + dx * 1.05, top - 0.75, z + dz - 0.25], [x + 0.35, top - 0.1, z], i % 2 ? '#3f8f3a' : '#5aa845');
    }
  } else {
    B.box(x, y, z, 0.22, 1.4, 0.22, '#7a5230');
    B.blob(x, y + 2.0, z, 1.0, '#4f8a3a', 0.9);
    B.blob(x + 0.35, y + 2.5, z + 0.2, 0.6, '#6aa84f');
  }
}

// The Rainbow Road: unlit colours (it glows), bands across the road, a dark edge underneath.
export const rainbowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const RAINBOW = ['#ff4f6d', '#ff9f1c', '#ffd23f', '#3ddc84', '#3fb6ff', '#8f6bff'];

function buildRainbow(world, s) {
  const B = new Builder();
  const C = (y) => world.center(y), HW = (y) => world.halfWidth(y);
  const stairs = s.kind === 'stairs';
  const ys = [];
  if (stairs) for (let k = 0; k <= s.steps; k++) ys.push(s.start + k * STEP_LENGTH);
  else { for (let y = s.start; y < s.end; y += 1.5) ys.push(y); ys.push(s.end); }
  const n = RAINBOW.length;
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    const e0 = stairs ? world.elevation(y0 + 0.01) : world.elevation(y0);
    const e1 = stairs ? e0 : world.elevation(y1);
    const pt = (x, y, e, h = 0) => [x, e + h, -y];
    const c0 = C(y0), c1 = C(y1), h0 = HW(y0), h1 = HW(y1);
    for (let j = 0; j < n; j++) {
      const u0 = -1 + (2 * j) / n, u1 = -1 + (2 * (j + 1)) / n;
      B.quad(pt(c0 + u0 * h0, y0, e0), pt(c0 + u1 * h0, y0, e0), pt(c1 + u1 * h1, y1, e1), pt(c1 + u0 * h1, y1, e1), RAINBOW[j]);
    }
    // Glowing white edges, and the underside going down into the dark.
    for (const side of [-1, 1]) {
      const a0 = c0 + side * h0, a1 = c1 + side * h1;
      const b0 = c0 + side * (h0 + 0.12), b1 = c1 + side * (h1 + 0.12);
      B.quad(pt(a0, y0, e0, 0.02), pt(b0, y0, e0, 0.02), pt(b1, y1, e1, 0.02), pt(a1, y1, e1, 0.02), '#ffffff');
      B.quad(pt(b0, y0, e0, 0.02), pt(b0, y0, e0, -0.5), pt(b1, y1, e1, -0.5), pt(b1, y1, e1, 0.02), '#3a2a7a');
    }
    if (stairs) {
      const e2 = world.elevation(y1 + 0.01);
      if (y1 < s.end) for (let j = 0; j < n; j++) {
        const u0 = -1 + (2 * j) / n, u1 = -1 + (2 * (j + 1)) / n;
        B.quad(pt(c1 + u0 * h1, y1, e2), pt(c1 + u1 * h1, y1, e2), pt(c1 + u1 * h1, y1, e1), pt(c1 + u0 * h1, y1, e1), '#ffffff');
      }
    }
    if (Math.floor(y0 / 3) % 2 === 0 && !stairs) {
      // little white dashes in the middle, like a race track
      B.quad(pt(c0 - 0.06, y0, e0, 0.01), pt(c0 + 0.06, y0, e0, 0.01), pt(c1 + 0.06, y1, e1, 0.01), pt(c1 - 0.06, y1, e1, 0.01), '#ffffff');
    }
  }
  // Things floating in space: star crystals near the road, now and then a planet.
  for (let k = Math.floor(s.start / 6); k * 6 < s.end; k++) {
    const yy = k * 6 + 3;
    if (yy < s.start || yy > s.end) continue;
    const e = world.elevation(yy);
    for (const side of [-1, 1]) {
      const h = hash2(k, side * 17);
      if (h < 0.55) {
        const x = C(yy) + side * (HW(yy) + 3 + h * 9);
        B.blob(x, e - 2 + hash2(k, side * 19) * 7, -yy, 0.3 + h * 0.5, RAINBOW[Math.floor(hash2(k, side * 23) * n)], 1.6);
      }
    }
    if (hash2(k, 77) < 0.06) {
      const side = hash2(k, 78) < 0.5 ? -1 : 1;
      const x = C(yy) + side * (28 + hash2(k, 79) * 20);
      const col = ['#ff9f1c', '#8f6bff', '#3fb6ff', '#ff4f6d'][Math.floor(hash2(k, 80) * 4)];
      B.blob(x, e + 6 + hash2(k, 81) * 10, -yy, 6 + hash2(k, 82) * 5, col, 1);
      B.box(x, e + 6 + hash2(k, 81) * 10 - 0.15, -yy, 22, 0.3, 4, '#ffd23f');
    }
  }
  return B.mesh(rainbowMaterial);
}

// ---------- the newer worlds: one road drawer, then each place's own scenery ----------

/** Sample points along a section (each stair edge on stairs), with the gaps' edges added. */
function samples(world, s, stepLen = 1.5) {
  const ys = [];
  if (s.kind === 'stairs') for (let k = 0; k <= s.steps; k++) ys.push(s.start + k * STEP_LENGTH);
  else { for (let y = s.start; y < s.end; y += stepLen) ys.push(y); ys.push(s.end); }
  const gaps = world.gapsIn(s.start, s.end);
  for (const g of gaps) for (const y of [g.y, g.y + g.len]) if (y > s.start && y < s.end) ys.push(y);
  ys.sort((a, b) => a - b);
  return { ys: ys.filter((y, i) => i === 0 || y - ys[i - 1] > 0.01), gaps };
}
const inGap = (gaps, y0, y1) => gaps.some((g) => (y0 + y1) / 2 > g.y && (y0 + y1) / 2 < g.y + g.len);

/**
 * The road surface (with stairs and gaps), its two edges and the ground to the
 * sides. color(i, y0) gives the road colour of a strip; side(B, pt, y0, y1, e0, e1, a, b, sideSign) draws the sides.
 */
function road(B, world, s, { color, edge = null, riser = '#9a8f80', step = 1.5, sideFn = null, deck = true }) {
  const { ys, gaps } = samples(world, s, step);
  const stairs = s.kind === 'stairs';
  const C = (y) => world.center(y), HW = (y) => world.halfWidth(y);
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    const e0 = stairs ? world.elevation(y0 + 0.01) : world.elevation(y0);
    const e1 = stairs ? e0 : world.elevation(y1);
    const pt = (x, y, e, h = 0) => [x, e + h, -y];
    const c0 = C(y0), c1 = C(y1), h0 = HW(y0), h1 = HW(y1);
    const gap = inGap(gaps, y0, y1);
    if (!gap && deck) {
      B.quad(pt(c0 - h0, y0, e0), pt(c0 + h0, y0, e0), pt(c1 + h1, y1, e1), pt(c1 - h1, y1, e1), color(i, y0));
      if (stairs) {
        const e2 = world.elevation(y1 + 0.01);
        if (y1 < s.end) B.quad(pt(c1 - h1, y1, e2), pt(c1 + h1, y1, e2), pt(c1 + h1, y1, e1), pt(c1 - h1, y1, e1), riser);
      }
      if (edge) for (const sd of [-1, 1]) {
        // the edge of the deck, seen from the side
        const a0 = c0 + sd * h0, a1 = c1 + sd * h1;
        B.quad(pt(a0, y0, e0, 0.02), pt(a0, y0, e0, -0.35), pt(a1, y1, e1, -0.35), pt(a1, y1, e1, 0.02), edge);
      }
    }
    if (sideFn) sideFn({ pt, y0, y1, e0, e1, c0, c1, h0, h1, gap, i });
  }
  return gaps;
}

/** Sea water: a wide plane below the road, in bands. */
function water(B, a, y0, y1, e0, e1, depth = 1.6) {
  const { c0, c1 } = a;
  const col = Math.floor(y0 / 4.5) % 3 ? '#2f8fd1' : '#3aa0de';
  B.quad([c0 - 70, e0 - depth, -y0], [c0 + 70, e0 - depth, -y0], [c1 + 70, e1 - depth, -y1], [c1 - 70, e1 - depth, -y1], col);
}

function boat(B, xb, water, yy, k) {
  const hull = ['#e63946', '#1f5f8b', '#ffffff', '#f4a261', '#2a9d8f'][Math.floor(hash2(k, 44) * 5)];
  B.box(xb, water - 0.3, -yy, 1.8, 0.8, 4.2, hull);
  B.box(xb, water + 0.5, -yy, 1.9, 0.12, 4.3, '#f4f1ea');
  B.box(xb, water + 0.55, -yy + 0.6, 1.2, 0.9, 1.3, '#f4f1ea');
  B.box(xb, water + 0.55, -yy - 0.6, 0.1, 4.2, 0.1, '#6b4226');
  B.quad([xb, water + 1.2, -yy - 0.65], [xb, water + 4.4, -yy - 0.65], [xb, water + 1.4, -yy - 2.4], [xb, water + 1.2, -yy - 2.4], hash2(k, 45) < 0.5 ? '#ffffff' : '#ffd23f');
}

/** The Sea: a wooden pier over the water (no rails: mind the edge), posts, boats and buoys. */
function buildPier(world, s) {
  const B = new Builder();
  road(B, world, s, {
    step: 0.75,
    color: (i) => (i % 2 ? '#a9784a' : '#94673d'),
    edge: '#5c3d22',
    sideFn: (a) => {
      water(B, a, a.y0, a.y1, a.e0, a.e1);
      if (a.i % 4 === 0 && !a.gap) for (const sd of [-1, 1]) B.box(a.c0 + sd * (a.h0 + 0.12), a.e0 - 1.8, -a.y0, 0.24, 2.0, 0.24, '#5c3d22');
    },
  });
  for (let k = Math.floor(s.start / 6.5); k * 6.5 < s.end; k++) {
    const yy = k * 6.5 + 3;
    if (yy < s.start || yy > s.end) continue;
    const e = world.elevation(yy);
    const side = hash2(k, 71) < 0.5 ? -1 : 1;
    if (hash2(k, 72) < 0.35) boat(B, world.center(yy) + side * (world.halfWidth(yy) + 5 + hash2(k, 73) * 8), e - 1.6, yy, k);
    else if (hash2(k, 74) < 0.5) {
      const xb = world.center(yy) + side * (world.halfWidth(yy) + 3 + hash2(k, 75) * 5);
      B.blob(xb, e - 1.5, -yy, 0.35, k % 2 ? '#e63946' : '#ffffff', 1.2);
    }
  }
  return B.mesh(townMaterial);
}

/** The Sea: an island with a sandy road, the beach, palms, huts and umbrellas, then the water. */
function buildIsland(world, s) {
  const B = new Builder();
  road(B, world, s, {
    color: (i) => (i % 2 ? '#e8d3a2' : '#e2cb96'),
    sideFn: (a) => {
      const { pt, y0, y1, e0, e1, c0, c1, h0, h1 } = a;
      for (const sd of [-1, 1]) {
        const q = (p1, p2, p3, p4, col) => (sd < 0 ? B.quad(p2, p1, p4, p3, col) : B.quad(p1, p2, p3, p4, col));
        q(pt(c0 + sd * h0, y0, e0), pt(c0 + sd * (h0 + 12), y0, e0, 0.02), pt(c1 + sd * (h1 + 12), y1, e1, 0.02), pt(c1 + sd * h1, y1, e1), '#f2dfb0');
        q(pt(c0 + sd * (h0 + 12), y0, e0, 0.02), pt(c0 + sd * (h0 + 16), y0, e0, -1.2), pt(c1 + sd * (h1 + 16), y1, e1, -1.2), pt(c1 + sd * (h1 + 12), y1, e1, 0.02), '#d9c08a');
      }
      water(B, a, y0, y1, e0, e1, 1.0);
    },
  });
  for (let k = Math.floor(s.start / 6.5); k * 6.5 < s.end; k++) {
    const ya = Math.max(s.start, k * 6.5) + 0.5, yb = Math.min(s.end, (k + 1) * 6.5) - 0.5;
    if (yb - ya < 2) continue;
    for (const side of [-1, 1]) {
      const h = hash2(k, side * 3);
      const ym = (ya + yb) / 2;
      const e = world.elevation(ym);
      const edge = (y, off) => world.center(y) + side * (world.halfWidth(y) + off);
      if (h < 0.4) tree(B, 'palm', edge(ym, 1.5 + h * 4), e, -ym, k);
      else if (h < 0.7) {
        // a beach hut with a thatched roof
        const x = edge(ym, 3.5);
        B.box(x, e, -ym, 2.6, 2.0, 3.0, ['#f4a261', '#3fa7d6', '#ffffff', '#e76f51'][k % 4]);
        B.box(x, e + 2.0, -ym, 3.2, 0.5, 3.6, '#c9a35c');
        B.box(x - side * 1.31, e, -ym, 0.04, 1.6, 0.9, '#6b4226');
      } else if (h < 0.85) {
        const x = edge(ym, 2.0);
        B.box(x, e, -ym, 0.06, 2.0, 0.06, '#f4f1ea');
        B.cone(x, e + 1.8, -ym, 1.0, 0.45, ['#e63946', '#3fa7d6', '#ffd166'][k % 3], 8);
        B.box(x + 0.4, e + 0.02, -ym + 0.3, 0.7, 0.04, 1.6, '#ff8fab');
      }
    }
  }
  return B.mesh(townMaterial);
}

/** The Mountain: a ski slope or the frozen lake, snow banks, pines, fences and flags. */
function buildSnow(world, s) {
  const B = new Builder();
  const lake = s.kind === 'lake';
  road(B, world, s, {
    color: (i) => (lake ? (i % 3 ? '#cfeaf7' : '#bfe1f2') : i % 2 ? '#f7fafd' : '#eef4fa'),
    sideFn: (a) => {
      const { pt, y0, y1, e0, e1, c0, c1, h0, h1, i } = a;
      for (const sd of [-1, 1]) {
        const q = (p1, p2, p3, p4, col) => (sd < 0 ? B.quad(p2, p1, p4, p3, col) : B.quad(p1, p2, p3, p4, col));
        // a snow bank, then snowy ground out to the trees
        q(pt(c0 + sd * h0, y0, e0), pt(c0 + sd * (h0 + 1.2), y0, e0, 0.7), pt(c1 + sd * (h1 + 1.2), y1, e1, 0.7), pt(c1 + sd * h1, y1, e1), '#e3edf5');
        q(pt(c0 + sd * (h0 + 1.2), y0, e0, 0.7), pt(c0 + sd * (h0 + 30), y0, e0, 1.5), pt(c1 + sd * (h1 + 30), y1, e1, 1.5), pt(c1 + sd * (h1 + 1.2), y1, e1, 0.7), '#f4f8fb');
        if (!lake && i % 2 === 0) B.box(c0 + sd * (h0 + 0.5), e0 + 0.35, -y0, 0.05, 0.9, 1.4, '#ff8c00'); // the orange safety net
      }
      if (lake && i % 5 === 2) B.quad(pt(c0 - h0 * 0.6, y0, e0, 0.01), pt(c0 + h0 * 0.2, y0, e0, 0.01), pt(c1 + h1 * 0.25, y1, e1, 0.01), pt(c1 - h1 * 0.55, y1, e1, 0.01), '#a9d4ea'); // a crack
    },
  });
  for (let k = Math.floor(s.start / 6); k * 6 < s.end; k++) {
    const yy = k * 6 + 3;
    if (yy < s.start || yy > s.end) continue;
    const e = world.elevation(yy);
    for (const side of [-1, 1]) {
      const h = hash2(k, side * 5);
      const x = world.center(yy) + side * (world.halfWidth(yy) + 3 + h * 10);
      if (h < 0.75) tree(B, 'pine', x, e + 1.0, -yy, k);
      if (h > 0.9) {
        // a little wooden hut
        B.box(x, e + 1.0, -yy, 2.4, 1.8, 2.4, '#8b5a2b');
        B.box(x, e + 2.8, -yy, 2.9, 0.45, 2.9, '#f7fbff');
      }
    }
  }
  return B.mesh(townMaterial);
}

/** The Volcano: a jungle trail (or temple steps), lava in the gaps, rope bridges over the chasm. */
function buildJungle(world, s) {
  const B = new Builder();
  const bridge = s.kind === 'bridge';
  const stairs = s.kind === 'stairs';
  const gaps = road(B, world, s, {
    step: bridge ? 0.6 : 1.5,
    color: (i) => (bridge ? (i % 2 ? '#a9784a' : '#8d6238') : stairs ? (i % 2 ? '#9b948c' : '#8a837b') : i % 2 ? '#9b6b43' : '#916240'),
    deck: !bridge, // a bridge's planks are drawn one by one (they fall: src/render3d.js)
    riser: '#6f6860',
    sideFn: (a) => {
      const { pt, y0, y1, e0, e1, c0, c1, h0, h1, gap, i } = a;
      if (bridge) {
        // ropes under the deck, posts at the sides, and far below the lava
        if (i % 4 === 0) for (const sd of [-1, 1]) B.box(c0 + sd * (h0 + 0.08), e0 - 0.2, -y0, 0.14, 0.7, 0.14, '#5c3d22');
        B.quad([c0 - 60, e0 - 16, -y0], [c0 + 60, e0 - 16, -y0], [c1 + 60, e1 - 16, -y1], [c1 - 60, e1 - 16, -y1], i % 3 ? '#ff6a00' : '#ff9a1f');
        return;
      }
      for (const sd of [-1, 1]) {
        const q = (p1, p2, p3, p4, col) => (sd < 0 ? B.quad(p2, p1, p4, p3, col) : B.quad(p1, p2, p3, p4, col));
        // jungle floor rising a little at the sides
        q(pt(c0 + sd * h0, y0, e0), pt(c0 + sd * (h0 + 1.5), y0, e0, 0.5), pt(c1 + sd * (h1 + 1.5), y1, e1, 0.5), pt(c1 + sd * h1, y1, e1), '#5a8f3c');
        q(pt(c0 + sd * (h0 + 1.5), y0, e0, 0.5), pt(c0 + sd * (h0 + 30), y0, e0, 2), pt(c1 + sd * (h1 + 30), y1, e1, 2), pt(c1 + sd * (h1 + 1.5), y1, e1, 0.5), '#3e7b3a');
      }
      if (gap) {
        // a lava river: the walls of the cut and the glowing lava below
        for (const sd of [-1, 1]) B.quad(pt(c0 + sd * h0, y0, e0), pt(c0 + sd * h0, y0, e0, -2.4), pt(c1 + sd * h1, y1, e1, -2.4), pt(c1 + sd * h1, y1, e1), '#4a3b35');
        B.quad(pt(c0 - h0 - 2, y0, e0, -2), pt(c0 + h0 + 2, y0, e0, -2), pt(c1 + h1 + 2, y1, e1, -2), pt(c1 - h1 - 2, y1, e1, -2), '#ff6a00');
      }
    },
  });
  for (const g of gaps) {
    // the near and far walls of a lava cut
    const e = world.elevation(g.y), e2 = world.elevation(g.y + g.len);
    const c = world.center(g.y), c2 = world.center(g.y + g.len), h = world.halfWidth(g.y);
    if (g.lava) {
      B.quad([c - h, e, -g.y], [c + h, e, -g.y], [c + h, e - 2.4, -g.y], [c - h, e - 2.4, -g.y], '#4a3b35');
      B.quad([c2 - h, e2, -g.y - g.len], [c2 + h, e2, -g.y - g.len], [c2 + h, e2 - 2.4, -g.y - g.len], [c2 - h, e2 - 2.4, -g.y - g.len], '#4a3b35');
      B.quad([c - h, e - 2, -g.y], [c + h, e - 2, -g.y], [c2 + h, e2 - 2, -g.y - g.len], [c2 - h, e2 - 2, -g.y - g.len], '#ff8a1f');
    }
  }
  if (!bridge) for (let k = Math.floor(s.start / 5); k * 5 < s.end; k++) {
    const yy = k * 5 + 2.5;
    if (yy < s.start || yy > s.end) continue;
    const e = world.elevation(yy);
    for (const side of [-1, 1]) {
      const h = hash2(k, side * 9);
      const x = world.center(yy) + side * (world.halfWidth(yy) + 2.5 + h * 6);
      if (h < 0.55) {
        // a jungle tree: tall trunk, big leaves
        B.box(x, e, -yy, 0.4, 5 + h * 4, 0.4, '#5c4033');
        B.blob(x, e + 5.5 + h * 4, -yy, 2.2, '#2f6b2f', 0.7);
        B.blob(x + 1, e + 4.8 + h * 4, -yy + 0.8, 1.4, '#3f8f3a', 0.7);
      } else if (h < 0.8) {
        // ferns
        for (let j = 0; j < 4; j++) B.blob(x + j * 0.5 - 1, e + 0.8, -yy + (j % 2) * 0.7, 0.9, j % 2 ? '#4f9a3a' : '#3e7b3a', 0.6);
      } else if (stairs || h > 0.93) {
        // temple ruins
        B.box(x, e, -yy, 1.2, 3.2, 1.2, '#8a837b');
        B.box(x, e + 3.2, -yy, 1.6, 0.4, 1.6, '#6f6860');
      }
    }
  }
  return B.mesh(townMaterial);
}

// ---------- far scenery, around the camera ----------
const farMat = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
export function buildBackdrop(theme) {
  const g = new THREE.Group();
  const cone = (x, z, r, h, col, snow) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), farMat(col));
    m.position.set(x, h / 2 - 30, z);
    g.add(m);
    if (snow) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.38, 7), farMat(snow));
      cap.position.set(x, h - h * 0.19 - 30 + 0.5, z);
      g.add(cap);
    }
  };
  if (theme === 'alpine') {
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (i - 6.5) * 0.24;
      cone(Math.cos(a) * 280, Math.sin(a) * 280, 60 + (i * 37) % 50, 120 + (i * 53) % 90, i % 2 ? '#7f93ab' : '#6d829c', '#f7fbff');
    }
  } else if (theme === 'jungle') {
    cone(40, -300, 160, 170, '#5a3d31');
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(22, 30, 8, 10), farMat('#ff6a00'));
    crater.position.set(40, 136, -300);
    g.add(crater);
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(18 + i * 4, 8, 6), farMat(i % 2 ? '#7d6e66' : '#94857c'));
      puff.position.set(40 + i * 9, 160 + i * 18, -300 - i * 6);
      g.add(puff);
    }
    for (let i = 0; i < 8; i++) cone(-260 + i * 75, -250 - (i % 3) * 20, 50, 60 + (i % 3) * 25, '#3e6b34');
  } else if (theme === 'sea') {
    for (let i = 0; i < 6; i++) {
      const isl = new THREE.Mesh(new THREE.SphereGeometry(40 + (i % 3) * 15, 10, 6), farMat(i % 2 ? '#5f9e57' : '#4f8a4a'));
      isl.scale.set(1.6, 0.35, 1);
      isl.position.set(-250 + i * 100, -32, -270 - (i % 2) * 30);
      g.add(isl);
    }
  } else return null;
  return g;
}
