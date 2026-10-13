// Bonzai growth prototype v1.
// The tree grows by itself toward light (space colonization, Runions et al. 2007) inside a procedurally stacked ruin.
// Pure and deterministic: the same seed and the same number of turns always give the same tree.

export const GCFG = {
  SEG: 0.13,            // metres per growth step
  INFL: 0.9,            // how far a light point can attract the tree
  KILL: 0.22,           // a light point is used up when the tree comes this close
  ITER_DAY: 3,          // growth steps per turn by day
  ITER_NIGHT: 1,        // growth steps per turn by night
  BUDGET: 70,           // most new segments per growth step
  TROPISM: 0.22,        // upward bias
  PERSIST: 0.32,        // tendency to keep the current heading
  MAX_CHILDREN: 3,
  BRANCH_DOT: 0.88,     // a new shoot must differ this much from existing ones
  OLD_WOOD_TURNS: 8,    // after this many turns, wood only sprouts if light is strong
  R_TIP: 0.011,         // radius of a twig tip
  PIPE: 2.3,            // pipe model exponent
  REACH: 2.3,           // the tree's horizontal domain (radius)
  HALF: 2.6,            // half-width of a module footprint (inner wall face)
  WALL_T: 0.36,
  CELL: 0.43,           // wall block size
  SKY_LEN: 7,           // how far light rays look for stone
  POINTS: 3000,         // light point candidates per 3.2 m of module height
  TURNS_PER_DAY: 12,
  START_HOUR: 8,
  SUN_AZ0: 0.25,
};
const G = GCFG, TAU = Math.PI*2;

export function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export function hashInt(...ns){ let h = 2166136261; for (const n of ns){ h ^= (n|0); h = Math.imul(h, 16777619); h ^= h>>>13; } return h>>>0; }
export const STYLES = ['Atlantis', 'Angkor', 'Maya'];
export function blendFromSeed(seed){
  const R = mulberry32(hashInt(seed, 7));
  const raw = [0,1,2].map(() => -Math.log(1 - R()*0.999));
  const s = raw[0] + raw[1] + raw[2];
  return raw.map(x => x/s);
}
const pickStyle = (w, u) => u < w[0] ? 0 : u < w[0]+w[1] ? 1 : 2;
export const hourOf = turn => (G.START_HOUR + turn*24/G.TURNS_PER_DAY) % 24;
export const dayOf = turn => Math.floor((G.START_HOUR + turn*24/G.TURNS_PER_DAY)/24) + 1;
export const isDay = turn => { const h = hourOf(turn); return h >= 6 && h < 18; };

// ---------- solids: boxes rotated about the vertical axis, and columns ----------
function solid(kind, cx, cy, cz, hx, hy, hz, ry=0, extra={}){
  return {kind, cx, cy, cz, hx, hy, hz, ry, c:Math.cos(ry), s:Math.sin(ry), ...extra};
}
function insideSolid(o, x, y, z, m){
  if (Math.abs(y - o.cy) > o.hy + m) return false;
  const dx = x - o.cx, dz = z - o.cz;
  if (o.kind === 'column') return dx*dx + dz*dz <= (o.r+m)*(o.r+m);
  const lx = dx*o.c - dz*o.s, lz = dx*o.s + dz*o.c;
  return Math.abs(lx) <= o.hx + m && Math.abs(lz) <= o.hz + m;
}
function rayHits(o, ox, oy, oz, dx, dy, dz, maxT){
  const px = ox - o.cx, pz = oz - o.cz;
  const lox = px*o.c - pz*o.s, loz = px*o.s + pz*o.c, loy = oy - o.cy;
  const ldx = dx*o.c - dz*o.s, ldz = dx*o.s + dz*o.c, ldy = dy;
  let t0 = 0, t1 = maxT;
  const ax = [[lox, ldx, o.hx], [loy, ldy, o.hy], [loz, ldz, o.hz]];
  for (const [p, d, h] of ax){
    if (Math.abs(d) < 1e-9){ if (p < -h || p > h) return false; continue; }
    let a = (-h - p)/d, b = (h - p)/d;
    if (a > b){ const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}

// ---------- world ----------
export function newWorld(seed){
  const g = {
    seed, turn:0, blend:blendFromSeed(seed),
    modules:[], points:[], pgrid:new Map(),
    nodes:[], ngrid:new Map(), maxY:0, lastAdded:[], stall:0,
  };
  // trunk seedling standing on the plinth
  const R = mulberry32(hashInt(seed, 1));
  const lean = R()*TAU;
  let prev = addNode(g, 0, 0, 0, -1, 0, 1, 0);
  for (let i=1;i<=4;i++){
    const t = i/4;
    prev = addNode(g, Math.cos(lean)*0.08*t*t, i*0.13, Math.sin(lean)*0.08*t*t, prev, 0, 1, 0);
  }
  ensureWorld(g);
  updateRadii(g);
  g.follow = nodePos(g.nodes[prev]);
  return g;
}
export const nodePos = n => ({x:n.x, y:n.y, z:n.z});

function key(x, y, z, cell){ return Math.floor(x/cell) + ',' + Math.floor(y/cell) + ',' + Math.floor(z/cell); }
function addNode(g, x, y, z, parent, dx, dy, dz, iter=0){
  const id = g.nodes.length;
  const n = {id, x, y, z, parent, children:[], dx, dy, dz, born:g.turn, iter, r:G.R_TIP};
  g.nodes.push(n);
  if (parent >= 0) g.nodes[parent].children.push(id);
  const k = key(x, y, z, G.INFL);
  let b = g.ngrid.get(k); if (!b) g.ngrid.set(k, b = []); b.push(id);
  if (y > g.maxY) g.maxY = y;
  return id;
}

export function solidsNear(g, y0, y1){
  const out = [];
  for (const m of g.modules) if (m.y1 >= y0 && m.y0 <= y1) for (const o of m.solids) out.push(o);
  return out;
}
export function blockedAt(g, x, y, z, m=0.05){
  if (y < 0.02 || Math.hypot(x, z) > G.REACH + 0.15) return true;
  for (const o of solidsNear(g, y-1, y+1)) if (insideSolid(o, x, y, z, m)) return true;
  return false;
}

// fixed set of sky directions, cosine-weighted over the upper hemisphere
const SKY = [];
{ const R = mulberry32(99); for (let i=0;i<12;i++){ const u = (i+R())/12, phi = i*2.39996; const r = Math.sqrt(u), y = Math.sqrt(1-u); SKY.push([r*Math.cos(phi), y, r*Math.sin(phi)]); } }
export function skyLight(g, x, y, z, solids){
  solids = solids || solidsNear(g, y-0.5, y + G.SKY_LEN);
  let open = 0;
  for (const d of SKY){
    let hit = false;
    for (const o of solids){ if (rayHits(o, x, y, z, d[0], d[1], d[2], G.SKY_LEN)){ hit = true; break; } }
    if (!hit) open++;
  }
  return open/SKY.length;
}

function ensureWorld(g){
  while (!g.modules.length || g.modules[g.modules.length-1].y1 < g.maxY + 8) addModule(g);
  // light points for a module are made once the module above exists, so its shade counts
  for (let i=0;i<g.modules.length-1;i++){
    const m = g.modules[i];
    if (!m.pointsMade && m.y0 < g.maxY + 4) makePoints(g, m);
  }
}

function addModule(g){
  const i = g.modules.length;
  const R = mulberry32(hashInt(g.seed, 100 + i));
  const y0 = i === 0 ? -0.75 : g.modules[i-1].y1;
  let type;
  if (i === 0) type = 'court';
  else if (i % 2 === 1) type = R() < 0.55 ? 'chamber' : 'tower';
  else type = R() < 0.65 ? 'terrace' : 'court';
  const style = pickStyle(g.blend, R());
  const m = {i, type, style, y0, y1:y0, solids:[], vis:{blocks:[], balusters:[], glow:[], vines:[], windows:[]}, holes:[], pointsMade:false};
  // every upper module stands on a floor with an opening for the tree, unless the one below has a ceiling,
  // and on four corner piers, so the ruin reads as one structure
  const below = g.modules[i-1];
  if (i > 0 && below.type !== 'chamber'){
    const n = Math.round(2*G.HALF/0.52), w = 3 + Math.floor(R()*2), hx = Math.floor((n - w)/2) + Math.round((R()-.5)*3), hz = Math.floor((n - w)/2) + Math.round((R()-.5)*3);
    const holes = [{x0:hx, x1:hx+w, z0:hz, z1:hz+w}];
    if (R() < 0.5){ const x = Math.floor(R()*(n-2)), z = Math.floor(R()*(n-2)); holes.push({x0:x, x1:x+2, z0:z, z1:z+1}); }
    slabWithHoles(m, R, y0 - 0.3, holes, 0.3);
  }
  GEN[type](m, R, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    const c = G.HALF + 0.35;
    m.solids.push(solid('pier', sx*c, (y0 + m.y1)/2, sz*c, 0.42, (m.y1 - y0)/2, 0.42));
  }
  if (i === 0){
    m.solids.push(solid('plinth', 0, -0.175, 0, 0.7, 0.175, 0.7), solid('plinth', 0, -0.55, 0, 1.0, 0.2, 1.0));
  }
  g.modules.push(m);
}

// A wall in the frame of one side: centre at distance d along angle a, running along the tangent.
// Visual blocks per cell; solids merged into vertical runs of cells. Openings are rectangles in (u, v).
function wall(m, R, a, d, len, y0, h, openings=[], o={}){
  const nx = Math.cos(a), nz = Math.sin(a), tx = -Math.sin(a), tz = Math.cos(a);
  const ry = Math.atan2(-tz, tx);
  const cols = Math.max(1, Math.round(len/G.CELL)), cw = len/cols;
  const rows = Math.max(1, Math.round(h/G.CELL)), ch = h/rows;
  const isOpen = (u, v) => openings.some(op => u > op.u0 && u < op.u1 && v > op.v0 && v < op.v1);
  for (let c=0;c<cols;c++){
    const u = -len/2 + cw*(c+0.5);
    const top = rows - (o.broken && R() < 0.4 ? 1 + Math.floor(R()*3) : 0);
    let run = -1;
    const flush = (r) => {
      if (run < 0) return;
      const v0 = run*ch, v1 = r*ch;
      m.solids.push(solid('wall', nx*d + tx*u, y0 + (v0+v1)/2, nz*d + tz*u, cw/2, (v1-v0)/2, G.WALL_T/2, ry));
      run = -1;
    };
    for (let r=0;r<rows;r++){
      const v = ch*(r+0.5);
      if (r >= top || isOpen(u, v)){ flush(r); continue; }
      if (run < 0) run = r;
      m.vis.blocks.push({cx:nx*d + tx*u + (R()-.5)*0.02, cy:y0 + v, cz:nz*d + tz*u + (R()-.5)*0.02, w:cw-0.02, h:ch-0.02, d:G.WALL_T*(0.88+R()*0.24), ry: ry + (R()-.5)*0.04,
        tint: m.style === 2 && R() < 0.3});
    }
    flush(top);
  }
  for (const op of openings){
    const cu = (op.u0+op.u1)/2, cv = (op.v0+op.v1)/2;
    const w = {x:nx*d + tx*cu, y:y0 + cv, z:nz*d + tz*cu, a, ry, nx, nz, wu:op.u1-op.u0, wv:op.v1-op.v0, style:m.style};
    if (op.v1 - op.v0 < h*0.95) m.vis.windows.push(w);
    if (m.style === 1 && op.v0 > 0.1) m.vis.balusters.push(w);
    if (m.style === 0) m.vis.glow.push({x:w.x, y:y0 + op.v0, z:w.z, ry, len:w.wu, kind:'sill'});
  }
}
function opening(R, len, h, wMin, wMax, hMin, hMax, floor=false){
  const w = wMin + R()*(wMax-wMin), hh = hMin + R()*(hMax-hMin);
  const u0 = -len/2 + 0.3 + R()*(len - w - 0.6), v0 = floor ? 0 : 0.5 + R()*Math.max(0.01, h - hh - 0.8);
  return {u0, u1:u0+w, v0, v1:v0+hh};
}
function column(m, R, x, z, y0, h, r=0.17){
  m.solids.push(solid('column', x, y0 + h/2, z, r, h/2, r, 0, {r, style:m.style, fluted: m.style === 0}));
}
function slabWithHoles(m, R, y, holes, thick=0.32){
  // the ceiling as rows of cells, merged along x; holes are cell rectangles
  const n = Math.round(2*G.HALF/0.52), cs = 2*G.HALF/n;
  for (const h of holes) m.holes.push({x0:-G.HALF + h.x0*cs, x1:-G.HALF + h.x1*cs, z0:-G.HALF + h.z0*cs, z1:-G.HALF + h.z1*cs, y});
  const isHole = (ix, iz) => holes.some(h => ix >= h.x0 && ix < h.x1 && iz >= h.z0 && iz < h.z1);
  for (let iz=0; iz<n; iz++){
    let run = -1;
    for (let ix=0; ix<=n; ix++){
      const solidCell = ix < n && !isHole(ix, iz);
      if (solidCell && run < 0) run = ix;
      if (!solidCell && run >= 0){
        const x0 = -G.HALF + run*cs, x1 = -G.HALF + ix*cs, zc = -G.HALF + (iz+0.5)*cs;
        m.solids.push(solid('slab', (x0+x1)/2, y + thick/2 + (R()-.5)*0.03, zc, (x1-x0)/2, thick/2, cs/2 - 0.01));
        run = -1;
      }
    }
  }
}

const GEN = {
  court(m, R){
    const h = 3.0; m.y1 = m.y0 + h;
    // low broken parapets around the courtyard
    for (let k=0;k<4;k++){
      const a = k*Math.PI/2 + 0.0;
      const len = 2*G.HALF + 2*G.WALL_T;
      const wh = 0.45 + R()*1.1;
      const gap = opening(R, len, wh, 0.8, 1.6, wh, wh, true);
      wall(m, R, a, G.HALF + G.WALL_T/2, len, m.y0 + (m.i === 0 ? 0 : 0), wh + (m.i === 0 ? 0.75 : 0), [gap], {broken:true});
    }
    const nCol = 2 + Math.floor(R()*3);
    for (let i=0;i<nCol;i++){
      const a = R()*TAU, r = 1.9 + R()*0.3;
      const ch = (m.i === 0 ? 0.75 : 0) + 1.2 + R()*(h - 1.2);
      column(m, R, Math.cos(a)*r, Math.sin(a)*r, m.y0, ch);
    }
    // fallen blocks
    for (let i=0;i<1 + Math.floor(R()*2);i++){
      const a = R()*TAU, r = 1.3 + R()*0.8, s = 0.2 + R()*0.18, base = m.i === 0 ? -0.75 : m.y0;
      m.solids.push(solid('block', Math.cos(a)*r, base + s, Math.sin(a)*r, s*1.5, s, s, R()*3));
    }
    // a lintel fallen across the space at mid height
    if (m.i > 0 && R() < 0.6){
      const ang = R()*Math.PI, off = (R()-.5)*1.6;
      m.solids.push(solid('beam', -Math.sin(ang)*off, m.y0 + 1.2 + R()*1.2, Math.cos(ang)*off, G.HALF, 0.13, 0.15, ang + (R()-.5)*0.2));
    }
  },
  chamber(m, R){
    const h = 3.2; m.y1 = m.y0 + h + 0.32;
    const len = 2*G.HALF + 2*G.WALL_T;
    for (let k=0;k<4;k++){
      const ops = [];
      if (R() < 0.8) ops.push(opening(R, len, h, 0.8, 1.4, 0.8, 1.2));
      if (R() < 0.25) ops.push(opening(R, len, h, 0.9, 1.2, 1.5, 2.0, true));
      wall(m, R, k*Math.PI/2, G.HALF + G.WALL_T/2, len, m.y0, h, ops);
    }
    const n = Math.round(2*G.HALF/0.52);
    const hx = 1 + Math.floor(R()*(n-4)), hz = 1 + Math.floor(R()*(n-4));
    const holes = [{x0:hx, x1:hx + 2 + (R()<0.5?1:0), z0:hz, z1:hz + 2 + (R()<0.5?1:0)}];
    if (R() < 0.6){ const x = Math.floor(R()*(n-1)), z = Math.floor(R()*(n-1)); holes.push({x0:x, x1:x+1+(R()<.4?1:0), z0:z, z1:z+1}); }
    slabWithHoles(m, R, m.y0 + h, holes);
    if (R() < 0.6){ const a = R()*TAU, r = 1.4 + R()*0.6; column(m, R, Math.cos(a)*r, Math.sin(a)*r, m.y0, h, 0.2); }
    if (R() < 0.5){
      const ang = R()*Math.PI, off = (R()-.5)*1.8;
      m.solids.push(solid('beam', -Math.sin(ang)*off, m.y0 + h*(0.45 + R()*0.25), Math.cos(ang)*off, G.HALF, 0.12, 0.14, ang));
    }
    if (m.style === 0) m.vis.glow.push({band:true, y:m.y0 + h - 0.05});
  },
  tower(m, R){
    const h = 3.6; m.y1 = m.y0 + h;
    const ap = G.HALF + G.WALL_T/2, len = 2*G.HALF*Math.tan(Math.PI/8) + 0.16;
    for (let k=0;k<8;k++){
      const ops = R() < 0.4 ? [opening(R, len, h, 0.6, 1.0, 0.9, 1.4)] : [];
      wall(m, R, k*Math.PI/4 + Math.PI/8, ap, len, m.y0, h, ops, {broken:true});
    }
    // a collapsed floor: two fragments clinging to the walls
    const fy = m.y0 + h*(0.45 + R()*0.15), a = R()*TAU;
    for (const da of [0, Math.PI*(0.8 + R()*0.4)]){
      const aa = a + da, r = 1.7;
      m.solids.push(solid('slab', Math.cos(aa)*r, fy, Math.sin(aa)*r, 0.9 + R()*0.4, 0.15, 0.8 + R()*0.4, -aa));
    }
    if (m.style === 0) m.vis.glow.push({band:true, y:m.y0 + 0.9});
  },
  terrace(m, R){
    const h = 3.2; m.y1 = m.y0 + h;
    const sides = [0,1,2,3].sort(() => R() - 0.5);
    // stepped platforms rising outward on one or two sides
    for (let s=0; s<1 + (R()<0.5?1:0); s++){
      const a = sides[s]*Math.PI/2, nx = Math.cos(a), nz = Math.sin(a), ry = Math.atan2(-nz, -nz === 0 ? 1 : 0);
      for (let k=0;k<3;k++){
        const inner = G.HALF - 0.45*(k+1), outer = G.HALF + 0.3, top = 0.35*(3-k);
        const mid = (inner + outer)/2, half = (outer - inner)/2;
        const box = Math.abs(nx) > 0.5
          ? solid('step', nx*mid, m.y0 + top/2, 0, half, top/2, G.HALF + 0.3)
          : solid('step', 0, m.y0 + top/2, nz*mid, G.HALF + 0.3, top/2, half);
        m.solids.push(box);
      }
    }
    // a colonnade on another side, with an architrave if the columns stand
    { const a = sides[2]*Math.PI/2, nx = Math.cos(a), nz = Math.sin(a), tx = -nz, tz = nx, d = G.HALF - 0.3;
      const ch = h*0.82, whole = R() < 0.6;
      for (const u of [-1.7, 0, 1.7]){
        const hh = whole ? ch : 0.8 + R()*(ch - 0.8);
        column(m, R, nx*d + tx*u, nz*d + tz*u, m.y0, hh, 0.18);
      }
      if (whole) m.solids.push(solid('beam', nx*d, m.y0 + ch + 0.14, nz*d, 2.1, 0.14, 0.24, Math.atan2(-tz, tx)));
    }
    // a broken bridge across the open space
    { const ang = R()*Math.PI, off = (R()-.5)*1.8, gap = -1 + R()*2, y = m.y0 + h*(0.5 + R()*0.2);
      const tx = Math.cos(ang), tz = Math.sin(ang), nx = -Math.sin(ang), nz = Math.cos(ang), ry = Math.atan2(-tz, tx);
      const a0 = -G.HALF, a1 = gap - 0.35, b0 = gap + 0.35, b1 = G.HALF;
      m.solids.push(solid('beam', nx*off + tx*(a0+a1)/2, y, nz*off + tz*(a0+a1)/2, (a1-a0)/2, 0.12, 0.3, ry));
      m.solids.push(solid('beam', nx*off + tx*(b0+b1)/2, y - 0.08, nz*off + tz*(b0+b1)/2, (b1-b0)/2, 0.12, 0.3, ry + 0.06));
    }
    // an overhanging slab shading one corner
    { const cx = (R()<.5?-1:1)*1.4, cz = (R()<.5?-1:1)*1.4;
      m.solids.push(solid('slab', cx, m.y0 + h - 0.15, cz, 1.1, 0.15, 0.95, (R()-.5)*0.4)); }
    // a low parapet on the remaining side
    { const len = 2*G.HALF + 2*G.WALL_T; wall(m, R, sides[3]*Math.PI/2, G.HALF + G.WALL_T/2, len, m.y0, 0.9, [opening(R, len, 0.9, 1.0, 1.6, 0.9, 0.9, true)], {broken:true}); }
  },
};

function makePoints(g, m){
  m.pointsMade = true;
  const R = mulberry32(hashInt(g.seed, 900 + m.i));
  const y0 = Math.max(0.15, m.y0 + 0.1), y1 = m.y1 - 0.05;
  const solids = solidsNear(g, y0 - 1, y1 + G.SKY_LEN);
  const local = solidsNear(g, y0 - 0.5, y1 + 1.2);
  const n = Math.round(G.POINTS*(y1 - y0)/3.2);
  for (let i=0;i<n;i++){
    const r = G.REACH*Math.sqrt(R()), a = R()*TAU;
    const x = Math.cos(a)*r, z = Math.sin(a)*r, y = y0 + R()*(y1 - y0);
    if (local.some(o => insideSolid(o, x, y, z, 0.12))) continue;
    const L = skyLight(g, x, y, z, solids);
    if (R() > 0.03 + 0.95*Math.pow(L, 1.6)) continue;
    addPoint(g, x, y, z, L);
  }
  // light pours down through every opening in a floor or ceiling: fill the shaft beneath it
  const above = g.modules[m.i+1];
  for (const h of [...m.holes, ...(above ? above.holes : [])]){
    const area = (h.x1 - h.x0)*(h.z1 - h.z0);
    for (let i=0; i<Math.round(160*area); i++){
      const x = lerp(h.x0 + 0.08, h.x1 - 0.08, R()), z = lerp(h.z0 + 0.08, h.z1 - 0.08, R());
      const y = h.y - 1.6 + R()*2.1;
      if (y < 0.15 || Math.hypot(x, z) > G.REACH) continue;
      if (local.some(o => insideSolid(o, x, y, z, 0.1))) continue;
      addPoint(g, x, y, z, 1);
    }
  }
}
const lerp = (a, b, t) => a + (b - a)*t;
function addPoint(g, x, y, z, L){
  const p = {x, y, z, alive:true, L};
  g.points.push(p);
  const k = key(x, y, z, G.INFL);
  let b = g.pgrid.get(k); if (!b) g.pgrid.set(k, b = []); b.push(p);
}

// ---------- growth ----------
function nearestNode(g, p){
  const cx = Math.floor(p.x/G.INFL), cy = Math.floor(p.y/G.INFL), cz = Math.floor(p.z/G.INFL);
  let best = -1, bd = G.INFL*G.INFL;
  for (let ix=cx-1; ix<=cx+1; ix++) for (let iy=cy-1; iy<=cy+1; iy++) for (let iz=cz-1; iz<=cz+1; iz++){
    const b = g.ngrid.get(ix + ',' + iy + ',' + iz); if (!b) continue;
    for (const id of b){ const n = g.nodes[id]; const d = (n.x-p.x)**2 + (n.y-p.y)**2 + (n.z-p.z)**2; if (d < bd){ bd = d; best = id; } }
  }
  return best;
}
function killPoints(g, n){
  const cx = Math.floor(n.x/G.INFL), cy = Math.floor(n.y/G.INFL), cz = Math.floor(n.z/G.INFL), k2 = G.KILL*G.KILL;
  for (let ix=cx-1; ix<=cx+1; ix++) for (let iy=cy-1; iy<=cy+1; iy++) for (let iz=cz-1; iz<=cz+1; iz++){
    const b = g.pgrid.get(ix + ',' + iy + ',' + iz); if (!b) continue;
    for (const p of b) if (p.alive && (p.x-n.x)**2 + (p.y-n.y)**2 + (p.z-n.z)**2 < k2) p.alive = false;
  }
}

function step(g, iter){
  const acc = new Map();
  const reach = g.maxY + G.INFL + 0.05;
  for (const p of g.points){
    if (!p.alive || p.y > reach) continue;
    const id = nearestNode(g, p); if (id < 0) continue;
    const n = g.nodes[id];
    const dx = p.x-n.x, dy = p.y-n.y, dz = p.z-n.z, l = Math.hypot(dx,dy,dz) || 1;
    let a = acc.get(id); if (!a) acc.set(id, a = {x:0, y:0, z:0, k:0, L:0});
    a.x += dx/l; a.y += dy/l; a.z += dz/l; a.k++; a.L += p.L;
  }
  const cands = [...acc.entries()].sort((A, B) => B[1].k - A[1].k || A[0] - B[0]).slice(0, G.BUDGET);
  const added = [];
  for (const [id, a] of cands){
    const n = g.nodes[id];
    if (n.children.length >= G.MAX_CHILDREN) continue;
    if (n.children.length && g.turn - n.born > G.OLD_WOOD_TURNS && a.k < 4) continue;
    let dx = a.x/a.k + n.dx*G.PERSIST, dy = a.y/a.k + n.dy*G.PERSIST + G.TROPISM, dz = a.z/a.k + n.dz*G.PERSIST;
    let l = Math.hypot(dx,dy,dz) || 1; dx /= l; dy /= l; dz /= l;
    if (n.children.some(c => { const m = g.nodes[c]; return m.dx*dx + m.dy*dy + m.dz*dz > G.BRANCH_DOT; })) continue;
    let x = n.x + dx*G.SEG, y = n.y + dy*G.SEG, z = n.z + dz*G.SEG;
    if (blockedAt(g, x, y, z) || blockedAt(g, n.x + dx*G.SEG*0.5, n.y + dy*G.SEG*0.5, n.z + dz*G.SEG*0.5)){
      // try once to slide along the obstacle, toward the side with more light
      const sx = dx - dy*0.0, sy = dy*0.2, sz = dz; l = Math.hypot(sx, sy, sz) || 1;
      x = n.x + sx/l*G.SEG; y = n.y + sy/l*G.SEG; z = n.z + sz/l*G.SEG;
      if (blockedAt(g, x, y, z)) continue;
      dx = sx/l; dy = sy/l; dz = sz/l;
    }
    const nid = addNode(g, x, y, z, id, dx, dy, dz, iter);
    added.push(nid);
  }
  for (const id of added) killPoints(g, g.nodes[id]);
  return added;
}

export function updateRadii(g){
  const N = g.nodes;
  for (let i=N.length-1; i>=0; i--){
    const n = N[i];
    if (!n.children.length){ n.r = G.R_TIP; continue; }
    let s = 0; for (const c of n.children) s += Math.pow(N[c].r, G.PIPE);
    n.r = Math.pow(s, 1/G.PIPE);
  }
  // a little extra girth at the base, like a bonsai's root flare
  for (let i=0;i<Math.min(5, N.length);i++) N[i].r = Math.max(N[i].r, 0.05) * (1 + (4-i)*0.08);
}

// One turn: the whole tree grows by itself for a few steps (fewer at night).
export function growTurn(g){
  const iters = isDay(g.turn) ? G.ITER_DAY : G.ITER_NIGHT;
  g.turn++;
  const added = [];
  for (let k=0; k<iters; k++){
    const a = step(g, k);
    added.push(...a);
    if (!a.length) break;
    ensureWorld(g);
  }
  updateRadii(g);
  ensureWorld(g);
  g.lastAdded = added;
  g.stall = added.length ? 0 : g.stall + 1;
  if (added.length){
    const ys = added.map(id => g.nodes[id].y).sort((a,b) => b-a);
    const cut = ys[Math.floor(ys.length*0.3)];
    let x=0, y=0, z=0, k=0;
    for (const id of added){ const n = g.nodes[id]; if (n.y >= cut){ x += n.x; y += n.y; z += n.z; k++; } }
    g.follow = {x:x/k, y:y/k, z:z/k};
  }
  return added;
}

export function replayWorld(seed, turns){ const g = newWorld(seed); for (let i=0;i<turns;i++) growTurn(g); return g; }
export const heightM = g => +g.maxY.toFixed(2);
