import * as THREE from 'three';
import { generate, DIRS, S, HW } from './maze.js';
import { layout } from './layout.js';
import { LEVELS } from './levels.js';
import { makePlayer, placePlayer, stepPlayer, cellOf, delta, blockedIn, EYE, SPEED } from './physics.js';
import { makeTextures } from './textures.js';
import { buildWorld } from './build.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xcfc4a8, 0.02);
const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 700);
scene.add(camera);
const ambient = new THREE.AmbientLight(0xffffff, 2.7);
scene.add(ambient);
const lantern = new THREE.PointLight(0xfff0d0, 9, 0, 1.6);
camera.add(lantern);

const tx = makeTextures();
const sound = new Sound();
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// --- sky -------------------------------------------------------------------
const skyGeo = new THREE.SphereGeometry(500, 32, 20);
skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -10;
scene.add(sky);
function paintSky(top, bottom) {
  const a = new THREE.Color(top), b = new THREE.Color(bottom), c = new THREE.Color();
  const p = skyGeo.attributes.position, col = skyGeo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const t = Math.pow(THREE.MathUtils.clamp(p.getY(i) / 500 * 0.5 + 0.5, 0, 1), 0.8);
    c.copy(b).lerp(a, t); col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// --- orientation gizmo -----------------------------------------------------
const gizmoScene = new THREE.Scene();
const gizmoCam = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
gizmoCam.position.set(0, 0, 4.4);
const gizmoMats = [0, 0, 1, 1, 2, 2].map(() => new THREE.MeshBasicMaterial());
const gizmo = new THREE.Group();
const gizmoCube = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), gizmoMats);
const gizmoEdges = new THREE.LineSegments(new THREE.EdgesGeometry(gizmoCube.geometry), new THREE.LineBasicMaterial({ color: 0x1b1712 }));
const gizmoWeight = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd08a12 }));
gizmo.add(gizmoCube, gizmoEdges, gizmoWeight);
gizmoScene.add(gizmo);

// --- game state ------------------------------------------------------------
const world = new THREE.Group();
scene.add(world);
const G = {
  mode: 'menu', idx: 0, level: null, phys: null, built: null, cfg: null,
  pl: makePlayer(), qb: new THREE.Quaternion(), yaw: 0, pitch: 0,
  keysLeft: new Set(), keyObjs: new Map(), orbs: [], exitObj: null, stars: [],
  time: 0, flips: 0, hints: 0, inversions: 0, hintT: 0, hintPts: null, hintLen: 0,
  lastStep: 0, lastPrint: 0, printN: 0, exitWarned: false, locked: false, bob: 0, t: 0,
};
const save = (() => { try { return JSON.parse(localStorage.getItem('escher-mazes')) || {}; } catch { return {}; } })();
save.unlocked ??= 0; save.best ??= {};
const persist = () => { try { localStorage.setItem('escher-mazes', JSON.stringify(save)); } catch { /* private mode */ } };

const input = { keys: new Set(), jump: false, moveX: 0, moveY: 0 };
const qR = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), qPitch = new THREE.Quaternion(), qT = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);

// Base orientation: the player's "up", including a ramp roll in progress.
function baseQuat() {
  const t = G.pl.trans;
  if (!t) return qR.copy(G.qb);
  const axis = V(DIRS[t.f]).cross(V(DIRS[t.w]));
  return qR.setFromAxisAngle(axis, t.theta).multiply(G.qb);
}
function snapQuat(q) {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  for (let i = 0; i < 16; i++) m.elements[i] = Math.round(m.elements[i]);
  q.setFromRotationMatrix(m);
}

// --- dynamic props ---------------------------------------------------------
const gold = new THREE.MeshLambertMaterial({ color: 0xe0a528, emissive: 0x8a5a08, emissiveIntensity: 0.9 });
function makeTribar() {
  const g = new THREE.Group(), box = (x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), gold); m.position.set(x, y, z); g.add(m);
  };
  box(0, -0.27, -0.27, 0.68, 0.14, 0.14); box(0.27, 0, -0.27, 0.14, 0.68, 0.14); box(0.27, 0.27, 0, 0.14, 0.14, 0.68);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 6, 40), new THREE.MeshBasicMaterial({ color: 0xe0a528 }));
  g.add(halo); g.userData.halo = halo;
  return g;
}
function makeExit() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), new THREE.MeshLambertMaterial({ color: 0x2a241c, emissive: 0xffffff, emissiveIntensity: 0 }));
  g.add(core);
  const rings = [0.78, 0.92, 1.06].map((r, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 48), new THREE.MeshLambertMaterial({ color: 0x2a241c, emissive: 0xe0a528, emissiveIntensity: 0 }));
    m.rotation.set(i * 1.1, i * 0.7, 0); g.add(m); return m;
  });
  const light = new THREE.PointLight(0xffe2a0, 0, 14, 1.5);
  g.add(light);
  g.userData = { core, rings, light };
  return g;
}
function makeOrb() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 28, 18), new THREE.MeshBasicMaterial({ map: tx.orb }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.02, 6, 40), new THREE.MeshBasicMaterial({ color: 0x8a8fb0 }));
  g.add(ball, ring); g.userData = { ball, ring };
  return g;
}
function makeAvatar() {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x2a241c });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.05, 12), m); body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), m); head.position.y = 1.3;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 14), m); hat.position.y = 1.58;
  g.add(body, head, hat);
  return g;
}
const hintMat = new THREE.MeshBasicMaterial({ color: 0xf0a020, transparent: true, opacity: 0.95, fog: false });
const hintDots = Array.from({ length: 44 }, () => new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), hintMat));
const PRINTS = 500;
const printMat = new THREE.MeshBasicMaterial({ color: 0x2a241c, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
let prints = null;
const avatar = makeAvatar();

function makeStars(level, pal) {
  const out = [], r = Math.random;
  const light = new THREE.MeshLambertMaterial({ color: pal.tone[1], flatShading: true, fog: false });
  const line = new THREE.LineBasicMaterial({ color: pal.trim, fog: false });
  const geos = [new THREE.OctahedronGeometry(1), new THREE.IcosahedronGeometry(1), new THREE.DodecahedronGeometry(1), new THREE.TetrahedronGeometry(1.2)];
  const cen = V(level.size).multiplyScalar(0.5);
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group(), geo = geos[i % geos.length], sc = 1.5 + r() * 4;
    const parts = i % geos.length === 3 ? [0, Math.PI / 2] : [0];
    for (const rot of parts) { // two tetrahedra make Escher's stellated octahedron
      const m = new THREE.Mesh(geo, light), e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), line);
      m.rotation.y = rot; e.rotation.y = rot; g.add(m, e);
    }
    const dir = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    g.position.copy(cen).addScaledVector(dir, 34 + r() * 55);
    g.scale.setScalar(sc);
    g.userData.spin = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.5);
    world.add(g); out.push(g);
  }
  return out;
}

// --- level loading ---------------------------------------------------------
function clearWorld() {
  world.traverse((o) => { if (o.geometry && !o.userData.keep) o.geometry.dispose(); });
  world.clear();
}

function applyPalette(p) {
  const pal = G.cfg.pal[Math.min(p, G.cfg.pal.length - 1)], m = G.built.mats;
  for (let a = 0; a < 3; a++) { m.wall[a].color.setHex(pal.tone[a]); m.trim[a].color.setHex(pal.trim).lerp(new THREE.Color(pal.tone[a]), 0.45); }
  scene.fog.color.setHex(pal.fog); scene.fog.density = pal.dens;
  renderer.setClearColor(pal.fog);
  paintSky(pal.sky[0], pal.sky[1]);
  gizmoMats.forEach((gm, i) => gm.color.setHex(pal.tone[i >> 1]));
  const night = p === 1;
  document.body.classList.toggle('night', night);
  ambient.intensity = night ? 2.3 : 2.7;
  printMat.color.setHex(night ? 0xd8d4f0 : 0x2a241c);
  G.built.setPhase(p);
}

function loadLevel(i) {
  clearWorld();
  const cfg = LEVELS[i], level = generate(cfg), lay = layout(level);
  Object.assign(G, { idx: i, cfg, level, phys: { level, colliders: lay.colliders, phase: 0 }, built: buildWorld(lay, tx) });
  world.add(G.built.group);

  G.keysLeft = new Set(level.keys); G.keyObjs.clear();
  for (const c of level.keys) { const k = makeTribar(); k.position.copy(V(level.center(c))); world.add(k); G.keyObjs.set(c, k); }
  G.exitObj = makeExit(); G.exitObj.position.copy(V(level.center(level.exit))); world.add(G.exitObj);
  G.orbs = [];
  for (let c = 0; c < level.count; c++) if (level.Tg[c]) { const o = makeOrb(); o.position.copy(V(level.center(c))); world.add(o); G.orbs.push(o); }
  for (const d of hintDots) { d.visible = false; d.userData.keep = true; world.add(d); }
  prints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.13, 10), printMat, PRINTS);
  prints.count = 0; prints.frustumCulled = false; world.add(prints);
  avatar.traverse((o) => { o.userData.keep = true; });
  world.add(avatar); avatar.visible = false;
  G.stars = level.wrap ? [] : makeStars(level, cfg.pal[0]);
  sky.visible = !level.wrap;

  placePlayer(G.pl, level, level.start);
  G.qb.identity(); G.pitch = 0; G.yaw = 0;
  const first = level.moves(level.start).find((m) => m.type === 'walk') || level.moves(level.start)[0];
  if (first && first.d >= 0) { const d = DIRS[first.d]; G.yaw = Math.atan2(-d[0], -d[2]); }
  Object.assign(G, { time: 0, flips: 0, hints: 0, inversions: 0, hintT: 0, lastStep: 0, lastPrint: 0, printN: 0, exitWarned: false });
  G.pl.walked = 0;
  applyPalette(0);

  $('lname').textContent = cfg.name; $('lyear').textContent = `${'I II III IV V'.split(' ')[i]} · ${cfg.year}`;
  updateHud();
  banner(`<h2>${cfg.name}</h2><p>${cfg.quote}<br>— M.C. Escher</p>`, 5200);
  clearTimeout(tipTimer); clearTimeout(toastTimer); $('toast').classList.remove('on');
  tipTimer = setTimeout(() => { if (G.idx === i && G.mode === 'playing') toast(cfg.tip, 7000); }, 5600);
}

// --- HUD -------------------------------------------------------------------
let toastTimer = 0, bannerTimer = 0, tipTimer = 0;
function toast(msg, ms = 3500) {
  const el = $('toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}
function banner(html, ms) {
  const el = $('banner'); el.innerHTML = html; el.classList.add('on');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => el.classList.remove('on'), ms);
}
function fmt(t) { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function updateHud() {
  const total = G.level.keys.length, got = total - G.keysLeft.size;
  $('keys').textContent = '▲'.repeat(got) + '△'.repeat(total - got);
  $('time').textContent = fmt(G.time);
}
function flash() { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }

// --- overlay screens -------------------------------------------------------
const overlay = $('overlay'), card = $('card');
function show(html) { card.innerHTML = html; overlay.hidden = false; card.querySelector('button:not([disabled])')?.focus(); }
function hideOverlay() { overlay.hidden = true; }
const controlsHtml = `<div class="keys">
  <b>W A S D</b><span>walk (Shift to run)</span><b>Mouse / ← →</b><span>look around</span>
  <b>Space</b><span>jump</span><b>E or click</b><span>use a sun-and-moon orb</span>
  <b>H</b><span>show the way for a moment</span><b>R · M · Esc</b><span>restart · mute · pause</span></div>`;

function showMenu() {
  G.mode = 'menu'; $('hud').hidden = true;
  const chips = LEVELS.map((l, i) => `<button class="small" data-level="${i}" ${i > save.unlocked ? 'disabled' : ''}>${'I II III IV V'.split(' ')[i]} · ${l.name}${save.best[i] ? ' · ' + fmt(save.best[i]) : ''}</button>`).join('');
  show(`<h1>Escher<br>Mazes</h1><p class="sub">five impossible buildings, after M.C. Escher</p>
    <p>Gather the golden tribars, then reach the sphere. No surface is only a wall: step onto a striped curve and the whole world turns to put it under your feet.</p>
    <div class="rule"></div>
    <button data-level="${Math.min(save.unlocked, LEVELS.length - 1)}">${save.unlocked ? 'Continue' : 'Enter'}</button>
    <div class="levels">${chips}</div>${controlsHtml}
    <p class="fine">On a phone or tablet: drag the left half of the screen to walk, the right half to look.</p>`);
}
function showPause() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  show(`<h2>Paused</h2><p class="sub">${G.cfg.name}</p>
    <button data-act="resume">Resume</button><br>
    <button class="small" data-act="restart">Restart level</button><button class="small" data-act="menu">Menu</button>${controlsHtml}`);
}
function showComplete() {
  G.mode = 'complete'; sound.win(); exitLock();
  const i = G.idx, best = save.best[i], isBest = !best || G.time < best;
  if (isBest) save.best[i] = G.time;
  save.unlocked = Math.max(save.unlocked, Math.min(i + 1, LEVELS.length - 1)); persist();
  const stats = `<div class="stats"><div><b>${fmt(G.time)}</b><span>time${isBest && best ? ' · best' : ''}</span></div>
    <div><b>${G.flips}</b><span>world turns</span></div><div><b>${G.hints}</b><span>hints</span></div></div>`;
  if (i + 1 < LEVELS.length) {
    show(`<h2>${G.cfg.name}</h2><p class="sub">solved</p>${stats}<div class="rule"></div>
      <button data-level="${i + 1}">Next: ${LEVELS[i + 1].name}</button><br><button class="small" data-level="${i}">Play again</button><button class="small" data-act="menu">Menu</button>`);
  } else {
    show(`<h1>Fin</h1><p class="sub">you walked out of all five impossible buildings</p>${stats}
      <p>“He who wonders discovers that this in itself is wonder.”</p><div class="rule"></div>
      <button data-act="menu">Back to the gallery</button>`);
  }
}

function startLevel(i) {
  sound.start();
  loadLevel(i);
  hideOverlay(); $('hud').hidden = false; G.mode = 'playing';
  lock();
}
function lock() {
  if (document.body.classList.contains('touch')) return;
  try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* sandboxed frame: drag to look instead */ }
}
function exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

card.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.level !== undefined) startLevel(+b.dataset.level);
  else act(b.dataset.act);
});
function act(a) {
  if (a === 'resume') { hideOverlay(); G.mode = 'playing'; lock(); }
  else if (a === 'restart') startLevel(G.idx);
  else if (a === 'menu') { exitLock(); showMenu(); }
  else if (a === 'pause') { exitLock(); showPause(); }
  else if (a === 'jump') input.jump = true;
  else if (a === 'use') useOrb();
  else if (a === 'hint') showHint();
}

// --- actions ---------------------------------------------------------------
function playerState() {
  const { level, pl, phys } = G, c = cellOf(pl, level);
  return level.settle(c, pl.trans ? pl.trans.w : pl.g, phys.phase);
}
function showHint() {
  if (G.mode !== 'playing') return;
  const { level, pl } = G, s = playerState();
  if (s < 0) return;
  const path = level.solve(s, G.keysLeft.size ? G.keysLeft : new Set([level.exit]));
  if (!path) return;
  const up = DIRS[pl.g].map((v) => -v);
  const pts = [pl.pos.map((v, i) => v + up[i] * 0.9)];
  const add = (p) => { const last = pts[pts.length - 1], d = delta(level, p, last); pts.push(last.map((v, i) => v + d[i])); };
  const stand = (c, g) => level.center(c).map((v, i) => v + DIRS[g][i] * (HW - 0.9));
  for (const m of path.slice(0, 7)) {
    const a = level.unstate(m.from), b = level.unstate(m.to);
    if (m.type === 'toggle') { add(level.center(a.c)); add(stand(b.c, b.g)); continue; }
    if (m.type === 'walk') { const n = level.nb(a.c, m.d); if (n !== b.c) add(stand(n, a.g)); }
    add(stand(b.c, b.g));
  }
  if (!path.length) add(level.center(cellOf(pl, level)));
  G.hintPts = pts; G.hintLen = 0;
  for (let i = 1; i < pts.length; i++) G.hintLen += Math.hypot(...pts[i].map((v, k) => v - pts[i - 1][k]));
  G.hintT = 8; G.hints++; sound.hint();
}
function nearOrb() {
  const { level, pl } = G, c = cellOf(pl, level);
  if (!level.Tg[c] || pl.trans) return false;
  return Math.hypot(...delta(level, eyeArr(), level.center(c))) < 1.7;
}
function useOrb() {
  if (G.mode !== 'playing' || !nearOrb()) return;
  const p = G.phys.phase ^ 1;
  if (blockedIn(G.pl, G.phys, p)) { sound.deny(); toast('Step closer to the orb first.'); return; }
  G.phys.phase = p; G.inversions++;
  applyPalette(p); flash(); sound.invert(p === 1);
  if (G.inversions === 1) toast(p ? 'Night. Pale walls have faded to ghosts; dark ones are solid.' : 'Day again.', 5000);
}
function eyeArr() { const up = V([0, 1, 0]).applyQuaternion(baseQuat()); return G.pl.pos.map((v, i) => v + up.getComponent(i) * EYE); }

// --- input -----------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  input.keys.add(e.code);
  if (G.mode === 'playing') {
    if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
    if (e.code === 'KeyE' || e.code === 'KeyF') useOrb();
    if (e.code === 'KeyH') showHint();
    if (e.code === 'KeyR') startLevel(G.idx);
    if (e.code === 'KeyP' || (e.code === 'Escape' && !G.locked)) showPause();
    if (e.code.startsWith('Arrow')) e.preventDefault();
  } else if (G.mode === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) act('resume');
  if (e.code === 'KeyM') toast(sound.toggleMute() ? 'Sound off' : 'Sound on', 1200);
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
addEventListener('blur', () => input.keys.clear());
document.addEventListener('pointerlockchange', () => {
  const was = G.locked; G.locked = document.pointerLockElement === canvas;
  if (was && !G.locked && G.mode === 'playing') showPause();
});
let dragging = false;
canvas.addEventListener('mousedown', () => {
  if (G.mode !== 'playing') return;
  if (G.locked) useOrb(); else { dragging = true; lock(); }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (G.mode !== 'playing' || !(G.locked || dragging)) return;
  look(e.movementX * 0.0023, e.movementY * 0.0023);
});
function look(dx, dy) {
  G.yaw -= dx;
  G.pitch = THREE.MathUtils.clamp(G.pitch - dy, -1.45, 1.45);
}
// touch: left half walks, right half looks
const touches = new Map();
canvas.addEventListener('touchstart', (e) => {
  document.body.classList.add('touch'); e.preventDefault();
  for (const t of e.changedTouches) touches.set(t.identifier, { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, move: t.clientX < innerWidth / 2 });
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const s = touches.get(t.identifier); if (!s) continue;
    if (s.move) { input.moveX = THREE.MathUtils.clamp((t.clientX - s.x0) / 50, -1, 1); input.moveY = THREE.MathUtils.clamp((t.clientY - s.y0) / 50, -1, 1); }
    else if (G.mode === 'playing') look((t.clientX - s.x) * 0.006, (t.clientY - s.y) * 0.006);
    s.x = t.clientX; s.y = t.clientY;
  }
}, { passive: false });
const touchEnd = (e) => { for (const t of e.changedTouches) { if (touches.get(t.identifier)?.move) input.moveX = input.moveY = 0; touches.delete(t.identifier); } };
canvas.addEventListener('touchend', touchEnd); canvas.addEventListener('touchcancel', touchEnd);
$('touch').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) act(b.dataset.act); });

// --- simulation ------------------------------------------------------------
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
function update(dt) {
  const { pl, level, phys } = G, k = input.keys;
  G.time += dt;
  const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
  G.yaw += turn * 2.2 * dt;
  let mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + input.moveX;
  let mz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.moveY;
  const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
  qYaw.setFromAxisAngle(UP, G.yaw);
  qT.copy(baseQuat()).multiply(qYaw);
  fwd.set(0, 0, -1).applyQuaternion(qT); right.set(1, 0, 0).applyQuaternion(qT);
  const wish = [0, 1, 2].map((i) => fwd.getComponent(i) * mz + right.getComponent(i) * mx);
  const run = k.has('ShiftLeft') || k.has('ShiftRight');
  stepPlayer(pl, phys, { wish, jump: input.jump, speed: run ? SPEED * 1.45 : SPEED }, dt);
  input.jump = false;

  if (pl.flip) {
    const axis = V(DIRS[pl.flip.f]).cross(V(DIRS[pl.flip.w]));
    G.qb.premultiply(tmpQ.setFromAxisAngle(axis, Math.PI / 2)); snapQuat(G.qb);
    pl.flip = null; G.flips++;
    if (G.idx === 0 && G.flips === 1) toast('The wall is your floor now. The cube in the corner shows which way the world has turned.', 6000);
  }
  if (pl.trans && pl.trans.u < 0.03 && !pl.trans.sounded) { pl.trans.sounded = true; sound.flip(); }
  if (pl.landed) { sound.land(pl.landed); pl.landed = 0; }
  if (pl.walked - G.lastStep > 2.3) { G.lastStep = pl.walked; sound.step(); }
  if (pl.grounded && !pl.trans && pl.walked - G.lastPrint > 1.25) { G.lastPrint = pl.walked; footprint(); }

  // pickups
  const c = cellOf(pl, level), d = Math.hypot(...delta(level, eyeArr(), level.center(c)));
  if (G.keysLeft.has(c) && d < 1.3) {
    G.keysLeft.delete(c); world.remove(G.keyObjs.get(c)); sound.key(); updateHud();
    toast(G.keysLeft.size ? `Tribar found. ${G.keysLeft.size} to go.` : 'All tribars found. The sphere is awake: find it.', 3500);
  }
  if (c === level.exit && d < 1.5) {
    if (!G.keysLeft.size) showComplete();
    else if (!G.exitWarned) { G.exitWarned = true; sound.deny(); toast(`The sphere sleeps. ${G.keysLeft.size} tribar${G.keysLeft.size > 1 ? 's' : ''} still to find.`); }
  } else G.exitWarned = false;
  $('prompt').classList.toggle('on', nearOrb());
  if (nearOrb()) $('prompt').textContent = document.body.classList.contains('touch') ? 'Tap Use to turn day into night' : 'Press E to turn day into night';
  if (Math.floor(G.time) !== Math.floor(G.time - dt)) updateHud();
}

function footprint() {
  const up = V([0, 1, 0]).applyQuaternion(G.qb);
  tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  tmpM.compose(V(G.pl.pos).addScaledVector(up, 0.012), tmpQ, new THREE.Vector3(1, 1, 1));
  prints.setMatrixAt(G.printN % PRINTS, tmpM);
  G.printN++; prints.count = Math.min(G.printN, PRINTS); prints.instanceMatrix.needsUpdate = true;
}

function animate(dt) {
  const t = (G.t += dt);
  if (!G.level) return;
  for (const k of G.keyObjs.values()) { k.rotation.set(t * 0.7, t * 1.1, 0); k.userData.halo.rotation.set(t * 1.3, 0, t); }
  for (const o of G.orbs) { o.userData.ball.rotation.y = t * 1.5; o.userData.ring.rotation.set(t, t * 0.6, 0); }
  for (const s of G.stars) { s.rotation.x += s.userData.spin.x * dt; s.rotation.y += s.userData.spin.y * dt; }
  if (G.exitObj) {
    const u = G.exitObj.userData, awake = G.keysLeft.size === 0, sp = awake ? 2.2 : 0.35;
    u.rings.forEach((r, i) => { r.rotation.x += dt * sp * (1 + i * 0.3); r.rotation.y += dt * sp * 0.7; r.material.emissiveIntensity = awake ? 1.2 : 0; });
    u.core.material.emissiveIntensity = awake ? 0.85 + Math.sin(t * 4) * 0.15 : 0;
    u.light.intensity = awake ? 40 : 0;
  }
  // hint: a stream of motes flowing along the route
  if (G.hintT > 0) {
    G.hintT -= dt;
    const pts = G.hintPts, spacing = 0.55, flow = (t * 2.2) % spacing;
    hintMat.opacity = Math.min(1, G.hintT);
    hintDots.forEach((dot, i) => {
      let s = i * spacing + flow;
      dot.visible = s < G.hintLen && G.hintT > 0;
      if (!dot.visible) return;
      for (let j = 1; j < pts.length; j++) {
        const seg = Math.hypot(...pts[j].map((v, k) => v - pts[j - 1][k]));
        if (s <= seg) { dot.position.set(...pts[j - 1].map((v, k) => v + (pts[j][k] - v) * (s / seg))); break; }
        s -= seg;
      }
    });
  } else if (hintDots[0].visible) hintDots.forEach((d) => { d.visible = false; });
}

// --- rendering -------------------------------------------------------------
const frustum = new THREE.Frustum(), box = new THREE.Box3(), pm = new THREE.Matrix4();
function render() {
  const w = innerWidth, h = innerHeight;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
  renderer.clear();
  if (G.level) {
    const { pl, level } = G;
    qYaw.setFromAxisAngle(UP, G.yaw); qPitch.setFromAxisAngle(RIGHT, G.pitch);
    const base = baseQuat(), up = new THREE.Vector3(0, 1, 0).applyQuaternion(base);
    camera.quaternion.copy(base).multiply(qYaw).multiply(qPitch);
    const bob = pl.grounded && !pl.trans ? Math.sin(pl.walked * 2.7) * 0.035 : 0;
    G.bob += (bob - G.bob) * 0.3;
    camera.position.copy(V(pl.pos)).addScaledVector(up, EYE + G.bob);
    camera.fov = 78 + (pl.trans ? Math.sin(pl.trans.u * Math.PI) * 9 : 0);
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);

    if (!level.wrap) {
      world.position.set(0, 0, 0);
      renderer.render(scene, camera);
    } else {
      // Endless space: draw the same building again and again in every direction.
      avatar.position.copy(V(pl.pos)); avatar.quaternion.copy(base).multiply(qYaw);
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const far = 1.6 / scene.fog.density, sz = level.size, list = [];
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
        box.min.set(i * sz[0], j * sz[1], k * sz[2]); box.max.set((i + 1) * sz[0], (j + 1) * sz[1], (k + 1) * sz[2]);
        const dist = box.distanceToPoint(camera.position);
        if (dist > far || !frustum.intersectsBox(box)) continue;
        list.push([dist, i, j, k]);
      }
      list.sort((a, b) => a[0] - b[0]); list.length = Math.min(list.length, 48);
      for (const [, i, j, k] of list) {
        world.position.set(i * sz[0], j * sz[1], k * sz[2]);
        avatar.visible = !!(i || j || k);
        renderer.render(scene, camera);
      }
      G.passes = list.length;
    }

    // orientation cube
    const gs = Math.round(Math.min(120, w * 0.22));
    renderer.clearDepth(); renderer.setScissorTest(true);
    renderer.setScissor(w - gs - 6, 6, gs, gs); renderer.setViewport(w - gs - 6, 6, gs, gs);
    gizmo.quaternion.copy(camera.quaternion).invert();
    const gd = pl.trans ? V(DIRS[pl.trans.f]).lerp(V(DIRS[pl.trans.w]), pl.trans.u).normalize() : V(DIRS[pl.g]);
    gizmoWeight.position.copy(gd).multiplyScalar(0.95);
    renderer.render(gizmoScene, gizmoCam);
  }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.mode === 'playing') update(dt);
  else if (G.mode === 'menu') G.yaw += dt * 0.12;
  animate(dt);
  render();
  requestAnimationFrame(frame);
}

// A slowly turning backdrop behind the menu.
loadLevel(0);
clearTimeout(bannerTimer); $('banner').classList.remove('on');
showMenu();
requestAnimationFrame(frame);
addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'playing') { exitLock(); showPause(); } });

window.__escher = { G, tick: update, startLevel, showHint, useOrb, input, frame: (dt) => { update(dt); animate(dt); render(); } };
