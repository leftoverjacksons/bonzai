# Bonzai

A turn-based mobile browser game about tending a fast-growing, fantastical bonsai as it climbs through ancient ruins (Atlantis, Angkor, Maya).

Status: pre-production. The design document is in progress; the pages under `studies/` are rendering experiments, not game code.

## Pages

- `index.html`: hub page
- `docs/DESIGN.md`: design document (start here)
- `grow/`: bonsai prototype v2, the current direction (`sim.js`: bonsai growth rules, cards and procedural ruins; every setting in `GCFG`, species overrides in `SPECIES`: temple fig and juniper)
- `play/`: rules prototype v0, kept for comparison (`sim.js` holds the rules and every tunable number in `CFG`)
- `tests/`: `node tests/grow.test.mjs` (determinism, and how careless, random and careful players fare), `node tests/sim.test.mjs` (v0 rules)
- `studies/3d/`: three.js study: enclosed ruin shaft, per-run culture blend, day/night cycle (current direction)
- `studies/color/`: 2.5D colour and lighting study across three strata
- `studies/ink/`: 2.5D ink-wash study, compared with flat 2D and generic 3D

Everything is plain HTML, CSS and JavaScript with no build step. Open any `index.html` in a browser, or serve the folder with any static server (for example `npx serve .`).

## Hosting

Served by GitHub Pages from the repository root (Settings → Pages → Deploy from a branch → this branch, `/ (root)`). `.nojekyll` disables Jekyll processing.
