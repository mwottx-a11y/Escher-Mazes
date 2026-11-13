// First-person walker physics with gravity along any of the six axes.
// Plain arrays, no rendering code, so the tests can drive it headlessly.
import { DIRS, S, HW, RAMP_R, perp } from './maze.js';

export const PR = 0.35, PH = 1.7, EYE = 1.5;
export const GRAV = 20, JUMP = 4.6, SPEED = 5.2, FLIP_T = 0.62, MAX_FALL = 22;

export function makePlayer() {
  return { pos: [0, 0, 0], vel: [0, 0, 0], g: 3, grounded: false, drop: 0, trans: null, flip: null, walked: 0, landed: 0 };
}

// Feet on the floor of a room, standing in its middle.
export function placePlayer(pl, level, state) {
  const { c, g } = level.unstate(state), cc = level.center(c);
  for (let i = 0; i < 3; i++) { pl.pos[i] = cc[i] + DIRS[g][i] * HW; pl.vel[i] = 0; }
  pl.g = g; pl.grounded = true; pl.drop = 0; pl.trans = null; pl.flip = null;
}

export function bodyCenter(pl) { return pl.pos.map((v, i) => v - DIRS[pl.g][i] * PH / 2); }
export function eyePos(pl, up = null) {
  const u = up || DIRS[pl.g].map((v) => -v);
  return pl.pos.map((v, i) => v + u[i] * EYE);
}
export function cellOf(pl, level) {
  const b = bodyCenter(pl), q = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    q[i] = Math.floor(b[i] / S);
    if (level.wrap) q[i] = ((q[i] % level.n[i]) + level.n[i]) % level.n[i];
    else q[i] = Math.max(0, Math.min(level.n[i] - 1, q[i]));
  }
  return level.idx(q[0], q[1], q[2]);
}

// Shortest offset from b to a, respecting the wrap-around of endless levels.
export function delta(level, a, b) {
  return a.map((v, i) => {
    let d = v - b[i];
    if (level.wrap) d -= level.size[i] * Math.round(d / level.size[i]);
    return d;
  });
}

function overlaps(world, cen, he, box) {
  for (let k = 0; k < 3; k++) {
    let d = cen[k] - box.c[k];
    if (world.level.wrap) d -= world.level.size[k] * Math.round(d / world.level.size[k]);
    if (Math.abs(d) >= he[k] + box.h[k] - 1e-7) return false;
  }
  return true;
}

function halfExtents(g) { const he = [PR, PR, PR]; he[g >> 1] = PH / 2; return he; }

// Would the player intersect anything solid in the given phase?
export function blockedIn(pl, world, phase) {
  const cen = bodyCenter(pl), he = halfExtents(pl.g);
  for (const b of world.colliders) if ((b.mask >> phase) & 1 && overlaps(world, cen, he, b)) return true;
  return false;
}

function moveAxis(pl, world, i, dx) {
  if (dx === 0) return false;
  const L = world.level, he = halfExtents(pl.g);
  pl.pos[i] += dx;
  const cen = bodyCenter(pl);
  let hit = false;
  for (const b of world.colliders) {
    if (!((b.mask >> world.phase) & 1) || !overlaps(world, cen, he, b)) continue;
    let d = cen[i] - b.c[i];
    if (L.wrap) d -= L.size[i] * Math.round(d / L.size[i]);
    const fix = -Math.sign(dx) * (he[i] + b.h[i]) - d;
    cen[i] += fix; pl.pos[i] += fix;
    hit = true;
  }
  return hit;
}

function substep(pl, world, input, dt) {
  const L = world.level;
  if (pl.trans) {
    const t = pl.trans;
    t.u = Math.min(1, t.u + dt / FLIP_T);
    const e = t.u * t.u * (3 - 2 * t.u), th = e * Math.PI / 2, k = Math.min(1, t.u * 3);
    for (let i = 0; i < 3; i++) {
      const arc = t.pivot[i] + RAMP_R * (DIRS[t.f][i] * Math.cos(th) + DIRS[t.w][i] * Math.sin(th));
      pl.pos[i] = t.from[i] + (arc - t.from[i]) * k;
    }
    t.theta = th;
    if (t.u >= 1) {
      for (let i = 0; i < 3; i++) { pl.pos[i] = t.pivot[i] + RAMP_R * DIRS[t.w][i]; pl.vel[i] = 0; }
      pl.g = t.w; pl.grounded = true; pl.drop = 0; pl.trans = null;
      pl.flip = { f: t.f, w: t.w };
    }
    return;
  }

  const g = pl.g, ga = g >> 1, gs = DIRS[g][ga];
  const control = pl.grounded || pl.drop < 0.4;
  const speed = input.speed ?? SPEED;
  for (let i = 0; i < 3; i++) {
    if (i === ga) continue;
    if (!control) { pl.vel[i] = 0; continue; }
    const target = (input.wish[i] || 0) * speed, rate = pl.grounded ? 14 : 4;
    pl.vel[i] += (target - pl.vel[i]) * Math.min(1, rate * dt);
  }
  let vg = pl.vel[ga] * gs + GRAV * dt;
  if (pl.grounded && input.jump) vg = -JUMP;
  if (vg > MAX_FALL) vg = MAX_FALL;
  pl.vel[ga] = vg * gs;

  let moved = 0;
  for (let i = 0; i < 3; i++) {
    if (i === ga) continue;
    const before = pl.pos[i];
    if (moveAxis(pl, world, i, pl.vel[i] * dt)) pl.vel[i] = 0;
    moved += Math.abs(pl.pos[i] - before);
  }
  const before = pl.pos[ga];
  const hit = moveAxis(pl, world, ga, pl.vel[ga] * dt);
  const fell = (pl.pos[ga] - before) * gs;
  const wasGrounded = pl.grounded;
  if (hit) {
    if (vg > 0) { if (!wasGrounded && pl.drop > 1) pl.landed = pl.drop; pl.grounded = true; pl.drop = 0; }
    pl.vel[ga] = 0;
  }
  if (!(hit && vg > 0)) { pl.grounded = false; pl.drop += fell; }
  if (pl.grounded) pl.walked += moved;

  if (L.wrap) for (let i = 0; i < 3; i++) pl.pos[i] = ((pl.pos[i] % L.size[i]) + L.size[i]) % L.size[i];

  // Gravity ramp: walk into the curve and the wall becomes the floor.
  if (pl.grounded) {
    const c = cellOf(pl, L), cc = L.center(c), rel = delta(L, pl.pos, cc);
    const floorGap = HW - (rel[0] * DIRS[g][0] + rel[1] * DIRS[g][1] + rel[2] * DIRS[g][2]);
    if (floorGap < 0.05) for (const w of perp(g)) {
      if (!L.hasRamp(c, g, w)) continue;
      const dw = DIRS[w], along = rel[0] * dw[0] + rel[1] * dw[1] + rel[2] * dw[2];
      const push = input.wish[0] * dw[0] + input.wish[1] * dw[1] + input.wish[2] * dw[2];
      if (HW - along <= RAMP_R + 0.02 && push > 0.35) {
        const pivot = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
          const s = DIRS[g][i] + dw[i];
          pivot[i] = s !== 0 ? pl.pos[i] - rel[i] + s * (HW - RAMP_R) : pl.pos[i];
        }
        pl.trans = { u: 0, theta: 0, f: g, w, pivot, from: pl.pos.slice() };
        pl.vel = [0, 0, 0];
        break;
      }
    }
  }
}

// world: { level, colliders, phase }; input: { wish: [x,y,z], jump, speed }
export function stepPlayer(pl, world, input, dt) {
  let left = Math.min(dt, 0.1);
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 90);
    substep(pl, world, input, h);
    left -= h;
  }
}
