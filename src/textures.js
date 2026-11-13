// Procedural, print-like textures drawn on canvases: nothing is downloaded.
import * as THREE from 'three';
import { rng } from './maze.js';

function tex(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Engraver's hatching: many short strokes, a little uneven.
function hatch(g, s, r, n, alpha, angle = Math.PI / 4, len = 26) {
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s, a = angle + (r() - 0.5) * 0.25, l = len * (0.4 + r());
    g.strokeStyle = `rgba(20,16,10,${alpha * (0.4 + r() * 0.6)})`;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
      if (x + ox < -len || x + ox > s + len || y + oy < -len || y + oy > s + len) continue;
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
    }
  }
}

// Interlocking creatures: a checkerboard whose edges are bent into S-curves,
// so each tile is at once a figure and the gap between its neighbours.
function creatures(g, s, light, dark) {
  const N = 4, Tl = s / N, A = Tl * 0.2;
  const w = (v) => A * Math.sin((v / Tl) * Math.PI * 2);
  g.fillStyle = light; g.fillRect(0, 0, s, s);
  for (let i = -1; i <= N; i++) for (let j = -1; j <= N; j++) {
    const x0 = i * Tl, y0 = j * Tl, on = (i + j) & 1;
    if (on) {
      g.fillStyle = dark; g.beginPath();
      const K = 24;
      for (let k = 0; k <= K; k++) { const x = x0 + (Tl * k) / K; g.lineTo(x, y0 + w(x - x0)); }
      for (let k = 0; k <= K; k++) { const y = y0 + (Tl * k) / K; g.lineTo(x0 + Tl + w(y - y0), y); }
      for (let k = K; k >= 0; k--) { const x = x0 + (Tl * k) / K; g.lineTo(x, y0 + Tl + w(x - x0)); }
      for (let k = K; k >= 0; k--) { const y = y0 + (Tl * k) / K; g.lineTo(x0 + w(y - y0), y); }
      g.fill();
    }
    // an eye and a fin line turn the blob into a creature
    g.fillStyle = on ? light : dark; g.strokeStyle = on ? light : dark; g.lineWidth = 2;
    g.beginPath(); g.arc(x0 + Tl * 0.3, y0 + Tl * 0.42, Tl * 0.035, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x0 + Tl * 0.5, y0 + Tl * 0.62); g.quadraticCurveTo(x0 + Tl * 0.65, y0 + Tl * 0.5, x0 + Tl * 0.82, y0 + Tl * 0.6); g.stroke();
  }
}

export function makeTextures() {
  const r = rng(7);
  const paper = '#f4f0e6', ink = '#8d877b';

  // X-facing surfaces: interlocking creatures
  const tess = tex(512, (g, s) => { creatures(g, s, paper, '#b9b2a4'); hatch(g, s, r, 900, 0.1); });

  // Y-facing surfaces: diamond tiles
  const tiles = tex(256, (g, s) => {
    g.fillStyle = paper; g.fillRect(0, 0, s, s);
    g.fillStyle = '#c9c2b3';
    const h = s / 2;
    for (const [cx, cy] of [[h, 0], [0, h], [s, h], [h, s], [h, h]]) {
      g.beginPath(); g.moveTo(cx, cy - h / 2); g.lineTo(cx + h / 2, cy); g.lineTo(cx, cy + h / 2); g.lineTo(cx - h / 2, cy); g.fill();
    }
    g.strokeStyle = ink; g.lineWidth = 2;
    for (let i = -2; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * h - h / 2, 0); g.lineTo(i * h + s - h / 2, s); g.stroke();
      g.beginPath(); g.moveTo(i * h + h / 2, 0); g.lineTo(i * h - s + h / 2, s); g.stroke();
    }
    hatch(g, s, r, 500, 0.09, -Math.PI / 4);
  });

  // Z-facing surfaces: hatched ashlar blocks
  const stone = tex(256, (g, s) => {
    g.fillStyle = '#ebe6da'; g.fillRect(0, 0, s, s);
    hatch(g, s, r, 1400, 0.16, Math.PI / 3, 20);
    hatch(g, s, r, 500, 0.1, -Math.PI / 5, 16);
    g.strokeStyle = 'rgba(30,24,16,.55)'; g.lineWidth = 2.5;
    const rows = 4, rh = s / rows;
    for (let j = 0; j < rows; j++) {
      g.beginPath(); g.moveTo(0, j * rh); g.lineTo(s, j * rh); g.stroke();
      for (let i = 0; i < 2; i++) { const x = (i + (j % 2) * 0.5) * (s / 2); g.beginPath(); g.moveTo(x, j * rh); g.lineTo(x, (j + 1) * rh); g.stroke(); }
    }
  });

  const trim = tex(128, (g, s) => { g.fillStyle = '#d8d2c6'; g.fillRect(0, 0, s, s); hatch(g, s, r, 500, 0.3, Math.PI / 2.2, 30); });

  // Gravity ramps: bold chevrons pointing up the curve
  const ramp = tex(128, (g, s) => {
    g.fillStyle = '#fff6dc'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#c88a1e';
    for (let k = -1; k < 3; k++) {
      const y = k * (s / 2);
      g.beginPath(); g.moveTo(0, y + s / 4); g.lineTo(s / 2, y); g.lineTo(s, y + s / 4); g.lineTo(s, y + s / 2); g.lineTo(s / 2, y + s / 4); g.lineTo(0, y + s / 2); g.fill();
    }
  });

  // Phase walls: birds for day, the same birds inverted for night
  const birds = (a, b) => tex(256, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s);
    g.fillStyle = b;
    const N = 2, Tl = s / N;
    for (let i = -1; i <= N; i++) for (let j = -1; j <= N; j++) {
      const x = i * Tl + ((j & 1) ? Tl / 2 : 0), y = j * Tl;
      g.beginPath();
      g.moveTo(x, y + Tl * 0.5);
      g.quadraticCurveTo(x + Tl * 0.25, y + Tl * 0.05, x + Tl * 0.5, y + Tl * 0.42);
      g.quadraticCurveTo(x + Tl * 0.75, y + Tl * 0.05, x + Tl, y + Tl * 0.5);
      g.quadraticCurveTo(x + Tl * 0.75, y + Tl * 0.4, x + Tl * 0.56, y + Tl * 0.66);
      g.lineTo(x + Tl * 0.5, y + Tl * 0.95); g.lineTo(x + Tl * 0.44, y + Tl * 0.66);
      g.quadraticCurveTo(x + Tl * 0.25, y + Tl * 0.4, x, y + Tl * 0.5);
      g.fill();
    }
  });

  // Sun-and-moon orb
  const orb = tex(128, (g, s) => {
    g.fillStyle = '#fbf6e6'; g.fillRect(0, 0, s / 2, s);
    g.fillStyle = '#11131f'; g.fillRect(s / 2, 0, s / 2, s);
    g.fillStyle = '#11131f'; g.beginPath(); g.arc(s * 0.25, s / 2, s * 0.07, 0, 7); g.fill();
    g.fillStyle = '#fbf6e6'; g.beginPath(); g.arc(s * 0.75, s / 2, s * 0.07, 0, 7); g.fill();
  }, false);

  return { axis: [tess, tiles, stone], trim, ramp, day: birds('#fffdf5', '#bfc8cf'), night: birds('#0d1020', '#3d4a78'), orb };
}
