// The static town around each section of road, built as one mesh per section
// (vertex colours, flat shading): road, curbs, steps, houses with tiled roofs,
// shutters and washing, market stalls, trees, lamps and flower pots.
import * as THREE from '../vendor/three/three.module.min.js';
import { hash2, STEP_LENGTH } from './world.js';

const WALLS = ['#f2c27b', '#ef8f6b', '#f6e0b5', '#e9a2a2', '#b7d3c9', '#f3d27a', '#d7b8e0', '#f0b48a', '#fbe3c8'];
const ROOFS = ['#c8553d', '#b4472f', '#d26a3e', '#a8432f', '#c0603f'];
const SHUTTERS = ['#2f7d5b', '#3a6ea5', '#7a3b2e', '#2f7d5b'];
const AWNINGS = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#6a994e'];
const ROAD = { street: '#5b5f6b', sidewalk: '#dcc9a5', stairs: '#d6c4a2', market: '#bba183' };
const BAND = { street: '#efe3cb', sidewalk: '#b8a382', stairs: '#c4ae8a', market: '#cdb593' };

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
    const stripe = kind === 'stairs' ? (i % 2 ? '#d0bd9a' : ROAD.stairs) : ROAD[kind];
    B.quad(pt(c0 - h0, y0, e0), pt(c0 + h0, y0, e0), pt(c1 + h1, y1, e1), pt(c1 - h1, y1, e1), stripe);
    if (kind === 'street' && Math.floor(y0 / 3) % 2 === 0) {
      B.quad(pt(c0 - 0.07, y0, e0, 0.01), pt(c0 + 0.07, y0, e0, 0.01), pt(c1 + 0.07, y1, e1, 0.01), pt(c1 - 0.07, y1, e1, 0.01), '#f6f1e3');
    }
    if (kind === 'stairs') {
      // The riser down to the next tread, with a light edge on the nose.
      const e2 = world.elevation(y1 + 0.01);
      if (i < ys.length - 2 || y1 < s.end) B.quad(pt(c1 - h1, y1, e2), pt(c1 + h1, y1, e2), pt(c1 + h1, y1, e1), pt(c1 - h1, y1, e1), '#a8957a');
      B.quad(pt(c1 - h1, y1 - 0.08, e1, 0.005), pt(c1 + h1, y1 - 0.08, e1, 0.005), pt(c1 + h1, y1, e1, 0.005), pt(c1 - h1, y1, e1, 0.005), '#efe4cc');
    }
    for (const side of [-1, 1]) {
      const a0 = c0 + side * h0, a1 = c1 + side * h1;
      const b0 = c0 + side * (h0 + band), b1 = c1 + side * (h1 + band);
      const f0 = c0 + side * (h0 + far), f1 = c1 + side * (h1 + far);
      const q = (p1, p2, p3, p4, col) => (side < 0 ? B.quad(p2, p1, p4, p3, col) : B.quad(p1, p2, p3, p4, col));
      // kerb face, kerb top / sidewalk, then the ground out to the houses
      q(pt(a0, y0, e0), pt(a0, y0, e0, curb), pt(a1, y1, e1, curb), pt(a1, y1, e1), kind === 'street' ? '#d7d1c3' : BAND[kind]);
      q(pt(a0, y0, e0, curb), pt(b0, y0, e0, curb), pt(b1, y1, e1, curb), pt(a1, y1, e1, curb), BAND[kind]);
      q(pt(b0, y0, e0, curb), pt(f0, y0, e0, curb), pt(f1, y1, e1, curb), pt(b1, y1, e1, curb), kind === 'sidewalk' ? '#9fc46b' : '#e2d3b5');
      if (kind === 'stairs') {
        // the side walls of the stairs step down too
        const e2 = world.elevation(y1 + 0.01);
        q(pt(b1, y1, e2, curb), pt(f1, y1, e2, curb), pt(f1, y1, e1, curb), pt(b1, y1, e1, curb), '#b9a27f');
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
      const wall = WALLS[Math.floor(h * WALLS.length)];
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
      const roof = ROOFS[Math.floor(hash2(k, side * 7) * ROOFS.length)];
      if (roofType < 0.7) {
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
      const shutter = SHUTTERS[Math.floor(hash2(k, side * 11) * SHUTTERS.length)];
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
        const fruit = ['#ff6b35', '#ffd23f', '#7bc043', '#e63946', '#8f6bff'];
        for (let i = 0; i < 6; i++) {
          const yy = ya + 1 + i * (yb - ya - 2) / 5;
          for (let j = 0; j < 2; j++) B.blob(xc - 0.35 + j * 0.7, em + 1.0, -yy, 0.2, fruit[(k + i + j) % 5]);
        }
        const aw = AWNINGS[Math.floor(hash2(k, side * 3) * AWNINGS.length)];
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
        // A tree.
        const xt = edge(ym, kind === 'street' ? 0.9 : 1.1);
        B.box(xt, em, -ym, 0.22, 1.4, 0.22, '#7a5230');
        B.blob(xt, em + 2.0, -ym, 1.0, '#4f8a3a', 0.9);
        B.blob(xt + 0.35, em + 2.5, -ym + 0.2, 0.6, '#6aa84f');
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
    if (hash2(k, 99) < 0.22 && kind !== 'market') {
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
