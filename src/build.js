// Builds the static meshes of a level from its layout.
import * as THREE from 'three';
import { DIRS, S, T, HW, RAMP_R } from './maze.js';

class Buckets {
  constructor() { this.b = {}; }
  get(name) { return (this.b[name] ||= { p: [], n: [], uv: [] }); }

  // Axis-aligned box; each face goes to the bucket of its normal's axis, which
  // gives every orientation its own tone, like the three shades of an Escher cube.
  box(prefix, c, h, perAxis = true) {
    for (let a = 0; a < 3; a++) {
      if (h[a] === 0) continue;
      const b = (a + 1) % 3, d = (a + 2) % 3;
      const bk = this.get(perAxis ? prefix + a : prefix);
      for (const sgn of [1, -1]) {
        const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        if (sgn < 0) quad.reverse();
        const v = quad.map(([u, w]) => {
          const p = [0, 0, 0];
          p[a] = c[a] + sgn * h[a]; p[b] = c[b] + u * h[b]; p[d] = c[d] + w * h[d];
          return p;
        });
        for (const i of [0, 1, 2, 0, 2, 3]) {
          bk.p.push(...v[i]);
          const nn = [0, 0, 0]; nn[a] = sgn; bk.n.push(...nn);
          bk.uv.push(v[i][b] / S, v[i][d] / S);
        }
      }
    }
  }

  mesh(name, material) {
    const bk = this.b[name];
    if (!bk || !bk.p.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bk.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bk.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
    return new THREE.Mesh(geo, material);
  }
}

function grille(B, slab) {
  const a = slab.axis, b = (a + 1) % 3, d = (a + 2) % 3, bw = 0.42, bar = 0.07;
  const piece = (ob, od, hb, hd, depth) => {
    const c = slab.c.slice(), h = [0, 0, 0];
    c[b] += ob; c[d] += od; h[a] = depth; h[b] = hb; h[d] = hd;
    B.box('trim', c, h);
  };
  piece(0, HW - bw / 2, HW, bw / 2, T / 2); piece(0, -(HW - bw / 2), HW, bw / 2, T / 2);
  piece(HW - bw / 2, 0, bw / 2, HW - bw, T / 2); piece(-(HW - bw / 2), 0, bw / 2, HW - bw, T / 2);
  for (const o of [-0.62, 0.62]) { piece(o, 0, bar, HW - bw, bar); piece(0, o, HW - bw, bar, bar); }
}

function ramp(B, rp) {
  const f = DIRS[rp.f], w = DIRS[rp.w];
  const a = [f[1] * w[2] - f[2] * w[1], f[2] * w[0] - f[0] * w[2], f[0] * w[1] - f[1] * w[0]];
  const bk = B.get('ramp'), N = 10;
  const at = (th, s, rad = RAMP_R) => [0, 1, 2].map((i) =>
    rp.c[i] + (f[i] + w[i]) * (HW - RAMP_R) + rad * (f[i] * Math.cos(th) + w[i] * Math.sin(th)) + a[i] * s * HW);
  const corner = (s) => [0, 1, 2].map((i) => rp.c[i] + (f[i] + w[i]) * HW + a[i] * s * HW);
  const tri = (pts, uvs, nrm) => pts.forEach((p, i) => { bk.p.push(...p); bk.n.push(...nrm); bk.uv.push(...uvs[i]); });
  for (let k = 0; k < N; k++) {
    const t0 = (k / N) * Math.PI / 2, t1 = ((k + 1) / N) * Math.PI / 2, tm = (t0 + t1) / 2;
    const nrm = [0, 1, 2].map((i) => -(f[i] * Math.cos(tm) + w[i] * Math.sin(tm)));
    const p00 = at(t0, -1), p01 = at(t0, 1), p10 = at(t1, -1), p11 = at(t1, 1);
    const v0 = (k / N) * 2, v1 = ((k + 1) / N) * 2;
    tri([p00, p01, p11], [[0, v0], [3, v0], [3, v1]], nrm);
    tri([p00, p11, p10], [[0, v0], [3, v1], [0, v1]], nrm);
    for (const s of [-1, 1]) tri([corner(s), at(t0, s), at(t1, s)], [[0.5, 0.12], [0.5, 0.12], [0.5, 0.12]], a.map((v) => v * s));
  }
}

export function buildWorld(lay, tx) {
  const B = new Buckets();
  for (const s of lay.slabs) {
    if (s.mask === 1) B.box('day', s.c, s.h, false);
    else if (s.mask === 2) B.box('night', s.c, s.h, false);
    else if (s.grille) grille(B, s);
    else B.box('wall', s.c, s.h);
  }
  for (const b of lay.beams) B.box('trim', b.c, b.h);
  for (const c of lay.corners) B.box('trim', c.c, c.h);
  for (const r of lay.ramps) ramp(B, r);

  const group = new THREE.Group();
  const mats = { wall: [], trim: [] };
  for (let a = 0; a < 3; a++) {
    mats.wall[a] = new THREE.MeshLambertMaterial({ map: tx.axis[a] });
    mats.trim[a] = new THREE.MeshLambertMaterial({ map: tx.trim });
    for (const kind of ['wall', 'trim']) { const m = B.mesh(kind + a, mats[kind][a]); if (m) group.add(m); }
  }
  mats.ramp = new THREE.MeshLambertMaterial({ map: tx.ramp, side: THREE.DoubleSide, emissive: 0x7a5410, emissiveIntensity: 0.6 });
  const rm = B.mesh('ramp', mats.ramp); if (rm) group.add(rm);

  // Phase walls: solid in their own phase, a faint ghost in the other.
  const phase = [];
  ['day', 'night'].forEach((name, p) => {
    const solid = new THREE.MeshLambertMaterial({ map: tx[name], emissive: p ? 0x1a2a66 : 0x555555, emissiveIntensity: 0.35 });
    const ghost = new THREE.MeshBasicMaterial({ map: tx[name], transparent: true, opacity: 0.13, depthWrite: false });
    const mesh = B.mesh(name, solid);
    if (mesh) { group.add(mesh); phase[p] = { mesh, solid, ghost }; }
  });
  const setPhase = (p) => phase.forEach((ph, i) => {
    if (!ph) return;
    ph.mesh.material = i === p ? ph.solid : ph.ghost;
    ph.mesh.renderOrder = i === p ? 0 : 5;
  });
  setPhase(0);
  return { group, mats, setPhase };
}
