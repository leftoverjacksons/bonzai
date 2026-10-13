# Bonzai

A turn-based mobile browser game about tending a fast-growing, fantastical bonsai as it climbs through ancient ruins (Atlantis, Angkor, Maya).

Status: pre-production. The design document is in progress; the pages under `studies/` are rendering experiments, not game code.

## Pages

- `index.html`: hub page
- `studies/color/`: 2.5D colour and lighting study across three strata
- `studies/ink/`: 2.5D ink-wash study, compared with flat 2D and generic 3D

Everything is plain HTML, CSS and JavaScript with no build step. Open any `index.html` in a browser, or serve the folder with any static server (for example `npx serve .`).

## Hosting

Served by GitHub Pages from the repository root (Settings → Pages → Deploy from a branch → this branch, `/ (root)`). `.nojekyll` disables Jekyll processing.
