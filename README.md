# Escher Mazes

A first-person 3D maze game built with three.js, after the prints of M.C. Escher.
Five impossible buildings in which no surface is only a wall: step onto a striped
curve and the whole world turns 90° to put that wall under your feet.

## Play

No build step. Serve the folder and open it:

```sh
npm start          # python3 -m http.server 8080
# then open http://localhost:8080
```

(Any static file server works. Opening `index.html` straight from disk does not,
because browsers block ES modules on `file://`.)

| Input | Action |
| --- | --- |
| W A S D | walk (Shift to run) |
| Mouse, or ← → | look |
| Space | jump |
| E or click | use a sun-and-moon orb |
| H | show the way for a few seconds |
| R / M / Esc | restart level / mute / pause |

On phones and tablets: a floating stick under your left thumb walks, your right thumb
looks, a tap uses an orb, and there are Jump / Hint / Pause buttons. Portrait and
landscape both work, and the game lowers its own resolution if the device struggles.

### Put it on your home screen

The game is an installable web app (manifest, icons, offline cache). Host the folder
on any HTTPS static host, for example GitHub Pages: *Settings → Pages → Deploy from a
branch → this branch, `/ (root)`*. Then open the Pages URL on your phone and choose
**Add to Home Screen** (Safari: Share menu; Chrome: ⋮ menu). It launches full-screen
from its own icon and keeps working offline.

**Goal:** collect the golden tribars, then reach the sphere.

## The five levels

1. **Relativity** – a small building that teaches the gravity ramps.
2. **Belvedere** – open lattice walls and missing floors: leaps of faith that always land somewhere.
3. **Day and Night** – orbs invert the world; some walls are solid only by day, others only by night.
4. **Cubic Space Division** – a world with no outside. It repeats forever in every direction, and the distant figure you can see is you.
5. **Metamorphosis** – all of it at once.

Things that keep it fair: every surface is toned by the world axis it faces (the
three shades of an Escher cube), the cube in the corner shows how the world is
currently turned, you leave footprints, and `H` draws the route to the next goal.

## How it works

- `src/maze.js` – the maze model. A walker is a state *(room, which face is the floor, day/night)*.
  Levels are grown from a seed by simulating a walker, then loosened with extra openings, ramps and
  phase walls. Every change is kept only if the level stays *sound*: nothing reachable can fall
  forever, and every reachable state can get back to the start, so you can never be soft-locked.
- `src/layout.js` – turns the model into boxes (walls, beams, ramps) for both rendering and collision.
- `src/physics.js` – axis-aligned first-person physics with gravity along any of six directions.
- `src/build.js`, `src/textures.js`, `src/audio.js` – meshes, canvas-drawn textures and synthesised sound. No asset files.
- `src/game.js` – the game loop, HUD and rendering (endless levels are drawn by re-rendering the building at many offsets).

## Tests

```sh
npm test
```

Generates all five levels and has a bot play each one to completion through the real
physics, which proves the solver's idea of the maze matches the world you collide with.

three.js r160 is vendored in `vendor/` (MIT licence).
