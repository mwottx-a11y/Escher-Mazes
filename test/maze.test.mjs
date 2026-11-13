// Generates every level and then plays it to completion with a simple bot that
// uses the real physics, proving the walkable model and the collision world agree.
// Run with: node test/maze.test.mjs
import assert from 'node:assert/strict';
import { generate, DIRS, perp } from '../src/maze.js';
import { layout } from '../src/layout.js';
import { LEVELS } from '../src/levels.js';
import { makePlayer, placePlayer, stepPlayer, cellOf, eyePos, delta, blockedIn } from '../src/physics.js';

function play(cfg) {
  const level = generate(cfg);
  assert.equal(level.verify(), level.cover, 'level is sound');
  const world = { level, colliders: layout(level).colliders, phase: 0 };
  const pl = makePlayer();
  placePlayer(pl, level, level.start);
  const keys = new Set(level.keys);
  let wish = [0, 0, 0], flips = 0, toggles = 0;
  const dt = 1 / 60;
  for (let tick = 0; tick < 60 * 60 * 20; tick++) {
    if (pl.flip) { flips++; pl.flip = null; }
    const c = cellOf(pl, level), cc = level.center(c);
    const off = delta(level, pl.pos, cc), eye = delta(level, eyePos(pl), cc);
    const near = Math.hypot(...eye) < 1.3;
    if (near && keys.has(c)) keys.delete(c);
    if (near && !keys.size && c === level.exit) {
      return { level, seconds: tick * dt, flips, toggles };
    }
    if (!pl.trans && pl.grounded && level.isWall(c, pl.g, world.phase)) {
      const targets = keys.size ? keys : new Set([level.exit]);
      const plan = level.solve(level.state(c, pl.g, world.phase), targets);
      assert.ok(plan, 'a route exists from every state the bot reaches');
      const m = plan[0];
      wish = [0, 0, 0];
      const toward = (d, k) => { for (let i = 0; i < 3; i++) wish[i] += DIRS[d][i] * k; };
      const centre = (skipAxis) => {
        for (const d of perp(pl.g)) {
          if ((d >> 1) === skipAxis || d % 2) continue;
          const o = off[d >> 1];
          wish[d >> 1] += Math.max(-1, Math.min(1, -o * 2));
        }
      };
      if (!m || m.type === 'toggle') {
        centre(-1);
        if (m && Math.hypot(...eye) < 1.0 && !blockedIn(pl, world, world.phase ^ 1)) { world.phase ^= 1; toggles++; }
      } else { toward(m.d, 1); centre(m.d >> 1); }
      const len = Math.hypot(...wish);
      if (len > 1) wish = wish.map((v) => v / len);
    }
    stepPlayer(pl, world, { wish, jump: false }, dt);
  }
  assert.fail(`${cfg.name}: bot did not finish (keys left ${keys.size})`);
}

for (const cfg of LEVELS) {
  const r = play(cfg);
  const L = r.level;
  let ramps = 0; for (let i = 0; i < L.R.length; i++) ramps += L.R[i]; ramps /= 2;
  console.log(`ok  ${cfg.name.padEnd(22)} seed ${String(L.seed).padEnd(6)} rooms ${L.cover}/${L.count}  ramps ${ramps}  ` +
    `bot: ${r.seconds.toFixed(0)}s, ${r.flips} flips, ${r.toggles} inversions`);
  // determinism
  const again = generate(cfg);
  assert.deepEqual([...again.W], [...L.W]);
  assert.deepEqual(again.keys, L.keys);
}
console.log('all levels generated and completed');
