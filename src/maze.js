// Pure maze model: generation, state graph and solver. No rendering code here,
// so the same module runs in the browser and in the node tests.
//
// The maze is a 3D grid of cubic rooms separated by thin walls. A walker is
// described by (cell, gravity, phase): which room they are in, which of the six
// room faces they are standing on, and whether the world is in its "day" or
// "night" phase. Curved ramps let the walker roll gravity from a floor onto an
// adjacent wall, which is what turns the world by 90 degrees.

export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const S = 4;            // room size
export const T = 0.3;          // wall thickness
export const HW = S / 2 - T / 2; // room centre to inner wall surface
export const RAMP_R = 1.1;     // radius of a gravity ramp

export const axisOf = (d) => d >> 1;
export const perp = (g) => [0, 1, 2, 3, 4, 5].filter((d) => (d >> 1) !== (g >> 1));

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (a, n) => ((a % n) + n) % n;

export class Level {
  constructor(nx, ny, nz, wrap) {
    this.n = [nx, ny, nz];
    this.wrap = !!wrap;
    this.count = nx * ny * nz;
    this.W = new Uint8Array(this.count * 6).fill(3); // wall mask: bit0 = day, bit1 = night
    this.G = new Uint8Array(this.count * 6);         // grille (see-through) flag
    this.R = new Uint8Array(this.count * 36);        // ramp between faces f and w
    this.RF = new Uint8Array(this.count * 6);        // number of ramps resting on a face
    this.Tg = new Uint8Array(this.count);            // day/night orb in this room
    this.keys = [];
    this.exit = -1;
    this.start = 0; // state index
    this.size = [nx * S, ny * S, nz * S];
  }

  idx(x, y, z) { return x + this.n[0] * (y + this.n[1] * z); }
  xyz(c) {
    const [nx, ny] = this.n;
    return [c % nx, Math.floor(c / nx) % ny, Math.floor(c / (nx * ny))];
  }
  center(c) { const q = this.xyz(c); return [(q[0] + 0.5) * S, (q[1] + 0.5) * S, (q[2] + 0.5) * S]; }

  nb(c, d) {
    const q = this.xyz(c), v = DIRS[d];
    for (let i = 0; i < 3; i++) {
      q[i] += v[i];
      if (this.wrap) q[i] = mod(q[i], this.n[i]);
      else if (q[i] < 0 || q[i] >= this.n[i]) return -1;
    }
    return this.idx(q[0], q[1], q[2]);
  }

  isWall(c, d, p) { return (this.W[c * 6 + d] >> p) & 1; }
  setFace(c, d, m) {
    this.W[c * 6 + d] = m;
    const n = this.nb(c, d);
    if (n >= 0) this.W[n * 6 + (d ^ 1)] = m;
  }
  hasRamp(c, f, w) { return this.R[c * 36 + f * 6 + w] === 1; }
  _rf(c, d, k) {
    this.RF[c * 6 + d] += k;
    const n = this.nb(c, d);
    if (n >= 0) this.RF[n * 6 + (d ^ 1)] += k;
  }
  addRamp(c, f, w) {
    if (this.hasRamp(c, f, w)) return false;
    this.R[c * 36 + f * 6 + w] = 1; this.R[c * 36 + w * 6 + f] = 1;
    this._rf(c, f, 1); this._rf(c, w, 1);
    return true;
  }
  removeRamp(c, f, w) {
    if (!this.hasRamp(c, f, w)) return;
    this.R[c * 36 + f * 6 + w] = 0; this.R[c * 36 + w * 6 + f] = 0;
    this._rf(c, f, -1); this._rf(c, w, -1);
  }

  state(c, g, p) { return (c * 6 + g) * 2 + p; }
  unstate(s) { return { c: Math.floor(s / 12), g: (s >> 1) % 6, p: s & 1 }; }

  // Fall along gravity until there is a floor. -1 means an endless fall.
  settle(c, g, p) {
    let k = 0;
    while (!this.isWall(c, g, p)) {
      c = this.nb(c, g);
      if (c < 0 || ++k > 64) return -1;
    }
    return this.state(c, g, p);
  }

  moves(s) {
    const { c, g, p } = this.unstate(s), out = [];
    for (const d of perp(g)) {
      if (!this.isWall(c, d, p)) {
        out.push({ to: this.settle(this.nb(c, d), g, p), type: 'walk', d });
      } else if (this.hasRamp(c, g, d)) {
        out.push({ to: this.state(c, d, p), type: 'ramp', d });
      }
    }
    if (this.Tg[c]) out.push({ to: this.settle(c, g, p ^ 1), type: 'toggle', d: -1 });
    return out;
  }

  // BFS over states. opts.noToggle restricts the walker to a single phase.
  reach(from, opts = {}) {
    const N = this.count * 12;
    const dist = new Int32Array(N).fill(-1), prev = new Int32Array(N).fill(-1), via = new Array(N);
    const order = [from];
    let bad = false;
    dist[from] = 0;
    for (let i = 0; i < order.length; i++) {
      const s = order[i];
      for (const m of this.moves(s)) {
        if (opts.noToggle && m.type === 'toggle') continue;
        if (m.to < 0) { bad = true; continue; }
        if (dist[m.to] < 0) { dist[m.to] = dist[s] + 1; prev[m.to] = s; via[m.to] = m; order.push(m.to); }
      }
    }
    return { dist, prev, via, order, bad };
  }

  // A level is sound when nothing reachable can fall forever and every
  // reachable state can get back to the start (so there are no soft locks).
  // Returns the number of reachable rooms, or 0 if unsound.
  verify() {
    const { c, g, p } = this.unstate(this.start);
    if (this.settle(c, g, p) !== this.start) return 0;
    const f = this.reach(this.start);
    if (f.bad) return 0;
    const N = this.count * 12;
    const rev = new Map();
    for (const s of f.order) for (const m of this.moves(s)) {
      if (!rev.has(m.to)) rev.set(m.to, []);
      rev.get(m.to).push(s);
    }
    const seen = new Uint8Array(N); seen[this.start] = 1;
    const q = [this.start];
    for (let i = 0; i < q.length; i++) for (const s of rev.get(q[i]) || []) if (!seen[s]) { seen[s] = 1; q.push(s); }
    if (q.length !== f.order.length) return 0;
    return this.cellsOf(f.order).size;
  }

  cellsOf(states) { const set = new Set(); for (const s of states) set.add(Math.floor(s / 12)); return set; }

  // Shortest list of moves from a state to the nearest room in `targets`.
  solve(from, targets) {
    const f = this.reach(from);
    let best = -1;
    for (const s of f.order) if (targets.has(Math.floor(s / 12))) { best = s; break; }
    if (best < 0) return null;
    const path = [];
    for (let s = best; s !== from; s = f.prev[s]) path.push({ from: f.prev[s], ...f.via[s] });
    return path.reverse();
  }
}

function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
function shuffle(r, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function build(cfg, seed) {
  const r = rng(seed);
  const L = new Level(cfg.size[0], cfg.size[1], cfg.size[2], cfg.wrap);
  const U = new Uint8Array(L.count * 6); // faces the spanning tree stands on
  const visited = new Uint8Array(L.count);
  const vertBias = cfg.vertBias ?? 1.5;

  // 1. Grow a spanning tree the way a walker would explore it, laying a ramp
  //    whenever the next room is "up" relative to the walker's gravity.
  const c0 = Math.floor(r() * L.count);
  visited[c0] = 1; U[c0 * 6 + 3] = 1;
  L.start = L.state(c0, 3, 0);
  const active = [{ c: c0, g: 3 }];
  while (active.length) {
    const i = r() < 0.8 ? active.length - 1 : Math.floor(r() * active.length);
    const { c, g } = active[i];
    const opts = [];
    let total = 0;
    for (let d = 0; d < 6; d++) {
      const n = L.nb(c, d);
      if (n < 0 || visited[n] || L.W[c * 6 + d] !== 3 || U[c * 6 + d] || L.RF[c * 6 + d]) continue;
      if (axisOf(d) !== axisOf(g)) { opts.push({ d, w: -1, wt: 1 }); total += 1; }
      else if (d === (g ^ 1)) {
        for (const w of perp(g)) if (L.W[c * 6 + w] === 3) { opts.push({ d, w, wt: vertBias / 4 }); total += vertBias / 4; }
      }
    }
    if (!opts.length) { active.splice(i, 1); continue; }
    let x = r() * total, o = opts[0];
    for (const cand of opts) { x -= cand.wt; if (x <= 0) { o = cand; break; } }
    const n = L.nb(c, o.d);
    visited[n] = 1;
    if (o.w < 0) {
      L.setFace(c, o.d, 0);
      U[n * 6 + g] = 1;
      active.push({ c: n, g });
    } else {
      L.addRamp(c, g, o.w);
      U[c * 6 + o.w] = 1;
      L.setFace(c, o.d, 0);
      U[n * 6 + o.w] = 1;
      active.push({ c, g: o.w }, { c: n, g: o.w });
    }
  }
  let cover = L.verify();
  if (!cover) return null;

  const interior = [];
  for (let c = 0; c < L.count; c++) for (const d of [0, 2, 4]) if (L.nb(c, d) >= 0) interior.push([c, d]);

  // 2. Knock out extra walls for loops, shortcuts and leaps of faith.
  let left = cfg.extraOpen ?? 0;
  for (const [c, d] of shuffle(r, interior.slice())) {
    if (left <= 0) break;
    if (L.W[c * 6 + d] !== 3 || L.RF[c * 6 + d]) continue;
    L.setFace(c, d, 0);
    if (L.verify() >= cover) left--; else L.setFace(c, d, 3);
  }

  // 3. Extra ramps: more ways to turn the world over.
  left = cfg.extraRamps ?? 0;
  for (let tries = 0; tries < 400 && left > 0; tries++) {
    const c = Math.floor(r() * L.count), f = Math.floor(r() * 6), w = pick(r, perp(f));
    if (L.W[c * 6 + f] !== 3 || L.W[c * 6 + w] !== 3 || L.hasRamp(c, f, w)) continue;
    L.addRamp(c, f, w);
    const v = L.verify();
    if (v >= cover) { left--; cover = v; } else L.removeRamp(c, f, w);
  }

  // 4. Day and night: some walls exist in only one phase, orbs flip the phase.
  let dayOnly = null;
  if (cfg.phases) {
    const cells = shuffle(r, [...Array(L.count).keys()].filter((c) => c !== c0));
    for (const c of cells.slice(0, cfg.phases.toggles)) L.Tg[c] = 1;
    left = cfg.phases.swaps;
    for (const [c, d] of shuffle(r, interior.slice())) {
      if (left <= 0) break;
      if (L.RF[c * 6 + d]) continue;
      const old = L.W[c * 6 + d];
      L.setFace(c, d, r() < 0.5 ? 1 : 2);
      if (L.verify() >= cover) left--; else L.setFace(c, d, old);
    }
    if (left > 0) return null;
    dayOnly = L.cellsOf(L.reach(L.start, { noToggle: true }).order);
    if (dayOnly.size > cover * 0.7) return null; // the orbs must actually matter
  }

  // 5. Exit in the most remote room, tribars spread far apart.
  const f = L.reach(L.start);
  const cellDist = new Map();
  for (const s of f.order) { const c = Math.floor(s / 12); if (!cellDist.has(c)) cellDist.set(c, f.dist[s]); }
  let cand = [...cellDist.keys()].filter((c) => c !== c0 && !L.Tg[c]);
  const far = dayOnly ? cand.filter((c) => !dayOnly.has(c)) : cand;
  const pool = far.length ? far : cand;
  L.exit = pool.reduce((a, b) => (cellDist.get(b) > cellDist.get(a) ? b : a));
  cand = cand.filter((c) => c !== L.exit);
  if (cand.length < cfg.keys) return null;
  const gridDist = (a, b) => {
    const p = L.xyz(a), q = L.xyz(b); let s = 0;
    for (let i = 0; i < 3; i++) { let d = Math.abs(p[i] - q[i]); if (L.wrap) d = Math.min(d, L.n[i] - d); s += d; }
    return s;
  };
  const chosen = [c0, L.exit];
  while (L.keys.length < cfg.keys) {
    let best = -1, bestScore = -1;
    for (const c of cand) {
      if (L.keys.includes(c)) continue;
      const score = Math.min(...chosen.map((o) => gridDist(c, o))) + r() * 0.9;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    L.keys.push(best); chosen.push(best);
  }

  // 6. Grilles: walls you can see through but not pass.
  for (let c = 0; c < L.count; c++) for (let d = 0; d < 6; d++) {
    const n = L.nb(c, d);
    if (n >= 0 && d % 2 === 1) continue; // each interior face once
    if (L.W[c * 6 + d] === 3 && !L.RF[c * 6 + d] && r() < (cfg.grille ?? 0)) {
      L.G[c * 6 + d] = 1;
      if (n >= 0) L.G[n * 6 + (d ^ 1)] = 1;
    }
  }

  L.cover = cover;
  L.seed = seed;
  return L;
}

// Deterministic: tries seed, seed+1, ... until the level is sound.
export function generate(cfg) {
  for (let i = 0; i < 500; i++) {
    const L = build(cfg, cfg.seed + i * 7919);
    if (L && L.cover >= L.count * (cfg.minCover ?? 0.9)) return L;
  }
  throw new Error('could not generate level ' + cfg.name);
}
