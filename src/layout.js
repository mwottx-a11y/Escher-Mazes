// Turns a Level into boxes: wall slabs, edge beams, corner posts and ramps.
// Pure data, used by both the renderer and the physics.
import { DIRS, S, T, HW } from './maze.js';

const mod = (a, n) => ((a % n) + n) % n;
export const RAMP_BOX = 0.66;

// The face on the negative side of room (x,y,z) along `a`. Returns
// wallMask | grille << 2, or 0 when there is nothing there.
function faceAt(L, a, x, y, z) {
  const q = [x, y, z], n = L.n;
  for (let i = 0; i < 3; i++) {
    if (i === a) continue;
    if (L.wrap) q[i] = mod(q[i], n[i]);
    else if (q[i] < 0 || q[i] >= n[i]) return 0;
  }
  let d = a * 2 + 1;
  if (L.wrap) q[a] = mod(q[a], n[a]);
  else {
    if (q[a] < 0 || q[a] > n[a]) return 0;
    if (q[a] === n[a]) { q[a]--; d = a * 2; }
  }
  const c = L.idx(q[0], q[1], q[2]);
  return L.W[c * 6 + d] | (L.G[c * 6 + d] << 2);
}

export function layout(L) {
  const n = L.n, hi = (i) => (L.wrap ? n[i] - 1 : n[i]);
  const slabs = [], beams = [], corners = [], ramps = [], colliders = [];
  const beamSet = new Set();
  const bkey = (a, q) => {
    const p = q.slice();
    for (let i = 0; i < 3; i++) if (L.wrap) p[i] = mod(p[i], n[i]);
    return a + ':' + p.join(',');
  };

  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    // slabs perpendicular to a
    for (let i = 0; i <= hi(a); i++) for (let j = 0; j < n[b]; j++) for (let k = 0; k < n[c]; k++) {
      const q = [0, 0, 0]; q[a] = i; q[b] = j; q[c] = k;
      const code = faceAt(L, a, q[0], q[1], q[2]);
      if (!(code & 3)) continue;
      const cen = [0, 0, 0], h = [0, 0, 0];
      cen[a] = i * S; cen[b] = (j + 0.5) * S; cen[c] = (k + 0.5) * S;
      h[a] = T / 2; h[b] = HW; h[c] = HW;
      slabs.push({ axis: a, c: cen, h, mask: code & 3, grille: (code >> 2) & 1 });
      colliders.push({ c: cen, h, mask: code & 3 });
    }
    // beams running along a, on the lattice line (j,k)
    for (let i = 0; i < n[a]; i++) for (let j = 0; j <= hi(b); j++) for (let k = 0; k <= hi(c); k++) {
      const q = [0, 0, 0]; q[a] = i; q[b] = j; q[c] = k;
      const q2 = q.slice(); q2[c] = k - 1;
      const q3 = q.slice(); q3[b] = j - 1;
      const any = faceAt(L, b, ...q) | faceAt(L, b, ...q2) | faceAt(L, c, ...q) | faceAt(L, c, ...q3);
      if (!(any & 3)) continue;
      beamSet.add(bkey(a, q));
      const cen = [0, 0, 0], h = [T / 2, T / 2, T / 2];
      cen[a] = (i + 0.5) * S; cen[b] = j * S; cen[c] = k * S; h[a] = HW;
      beams.push({ axis: a, c: cen, h });
      colliders.push({ c: cen, h, mask: 3 });
    }
  }
  for (let i = 0; i <= hi(0); i++) for (let j = 0; j <= hi(1); j++) for (let k = 0; k <= hi(2); k++) {
    let any = false;
    for (let a = 0; a < 3 && !any; a++) for (const o of [0, -1]) {
      const q = [i, j, k]; q[a] += o;
      if (!L.wrap && (q[a] < 0 || q[a] >= n[a])) continue;
      if (beamSet.has(bkey(a, q))) { any = true; break; }
    }
    if (!any) continue;
    const cen = [i * S, j * S, k * S], h = [T / 2, T / 2, T / 2];
    corners.push({ c: cen, h });
    colliders.push({ c: cen, h, mask: 3 });
  }

  for (let cell = 0; cell < L.count; cell++) for (let f = 0; f < 6; f++) for (let w = f + 1; w < 6; w++) {
    if (!L.hasRamp(cell, f, w)) continue;
    const cc = L.center(cell);
    ramps.push({ cell, f, w, c: cc });
    const cen = [0, 0, 0], h = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const s = DIRS[f][i] + DIRS[w][i];
      cen[i] = cc[i] + s * (HW - RAMP_BOX / 2);
      h[i] = s !== 0 ? RAMP_BOX / 2 : HW;
    }
    colliders.push({ c: cen, h, mask: 3 });
  }
  return { slabs, beams, corners, ramps, colliders };
}
