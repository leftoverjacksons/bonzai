// Bonzai prototype v2: bonsai rules.
// The tree grows by itself from buds, toward light, with apical dominance and self-shading; left alone it gets leggy,
// crowded and starved. One forced card per turn (Cut, Pinch, Wire) is the gardener's work.
// Pure and deterministic: the same seed and the same moves always give the same tree.

// Species: temple fig (Ficus). Vigorous, buds readily behind cuts. Other species will be other settings (docs/DESIGN.md §4.10).

export const GCFG = {
  SEG: 0.12,            // metres per growth segment
  R_TIP: 0.012,         // twig radius
  PIPE: 2.2,            // pipe model exponent for branch thickness
  YIELD: 0.3,           // metres of growth one fully lit, uncrowded shoot pays for per turn
  ROOT_ENERGY: 0.12,    // from the roots each turn, day or night
  NIGHT_RULES: false,   // off (2026-10-14): real trees keep growing at night, mostly on sugar made by day; night is visual only for now
  NIGHT_LIGHT: 0.08,    // night energy as a fraction of day, when NIGHT_RULES is on
  APICAL: 2.6,          // per metre of height: how strongly higher shoots win energy
  MAX_EXT: 0.3,         // most one shoot can extend in a turn
  MIN_SHARE: 0.05,      // a shoot getting less than this by day is starving
  TROPISM: 0.14,        // upward bias
  PHOTO: 0.3,           // bend toward light
  CROWD_R: 0.42,        // shoots closer than this, at or above, shade each other
  CROWD_K: 0.5,
  SHADE_L: 0.4,         // below this light a shoot is in shade
  LEGGY: 1.0,           // unbranched run (m) before a shoot weakens and starts to sag
  SAG: 0.35,
  SNAP: 1.8,            // unbranched run (m) at which it snaps off
  NATURAL_RUN: 0.6,     // a strong shoot this long may break a side bud by itself
  NATURAL_BREAK: 0.05,  // chance per turn
  BUD_ANGLE: 0.95,      // dormant buds point this far (rad) off the shoot
  H_BLOCKED: -0.3, H_SHADE: -0.08, H_STARVE: -0.12, H_LEGGY: -0.07, H_HEAL: 0.1,
  SHADE_GRACE: 2,       // turns in shade before it starts to cost health (shade now counts every turn, day and night)
  DIEBACK_NODES: 3,
  REBUD: 0.5,           // fig: chance a bud wakes behind die-back
  WIRE_RANGE: 2.0,      // a guy wire reaches this far from its tie point to a ring
  WIRE_STEP: 0.12,      // radians a wired branch bends per turn, for thin wood
  WIRE_MAX: 0.9,        // most a wire bends a thin branch in total (radians)
  WIRE_FLEX_R: 0.04,    // branch radius (m) at which it bends half as much: thick wood is stiff
  WIRE_SET: 4,          // turns until the bend has set and the wire comes off
  HAND: 3,              // cards per hand; all must be played, in any order; never three the same
  DECK: {cut:0.38, pinch:0.38, wire:0.12, root:0.12},
  SENSE_R: 0.8,         // shoots sense brighter space this far away
  SENSE: 0.8,           // how much that wider sense steers, relative to open sky at the tip
  SLIDE_SPEED: 0.35,    // a shoot creeping along stone grows at this fraction of its speed
  STONE_GRACE: 2,       // turns against stone before a fully blocked shoot starts losing health
  THICKEN: 0.006,       // most a branch's radius can grow per turn (m)
  REACH: 2.3,           // the tree's horizontal domain (radius)
  HALF: 2.6,            // half-width of a module footprint (inner wall face)
  WALL_T: 0.36,
  CELL: 0.43,           // wall block size
  SKY_LEN: 2.6,         // light is local: stone further than this does not shade
  AMBIENT: 0.22,        // bounced light everywhere
  HYDRAULIC: 0.15,      // each stratum up, a shoot grows this fraction slower: water is harder to lift (floor 0.4)
  STRATUM_H: 8,         // height of a stratum (difficulty band), m; working value until it is judged by playing
  TURNS_PER_DAY: 12,
  START_HOUR: 8,
  SUN_AZ0: 0.25,
};
const G = GCFG, TAU = Math.PI*2;
GCFG.BARE_BUDS = true;   // buds on bare wood (behind the foliage) can wake
GCFG.FOLIAGE_N = 3;      // nodes behind a living tip that carry foliage
GCFG.JIN = false;        // a branch left with no foliage dies and stays as silver deadwood
GCFG.TRUNK_BEND = 1;     // how far the starting trunk curves
GCFG.TRUNK_WAVE = 1;     // how many turns its curve makes
GCFG.JIN_DELAY = 0;      // turns a bare branch takes to die (it browns meanwhile)
GCFG.ETIOLATE = false;   // in poor light, shoots stretch and stop branching
GCFG.TWIG_DROP = 8;      // turns until thin dead twigs (radius under TWIG_R) break off; thicker deadwood stays
GCFG.TWIG_R = 0.025;
const BASE = {...GCFG};

// Species: each is a set of overrides on the base settings (the base is the temple fig), plus its own card texts.
export const SPECIES = {
  fig: {name:'Temple fig', latin:'Ficus religiosa', blurb:'Fast and forgiving. Buds wake behind every cut, so prune hard and it regrows.', cfg:{}},
  juniper: {name:'Juniper', latin:'Juniperus chinensis', blurb:'Slow, tough and stiff. Bare wood never regrows: a branch without foliage dies to silver deadwood. Plan every cut.',
    cfg:{
      BARE_BUDS:false, JIN:true, REBUD:0, TRUNK_BEND:2.4, TRUNK_WAVE:1.7,
      WIRE_STEP:0.08, WIRE_MAX:1.2, WIRE_FLEX_R:0.07, WIRE_SET:9,
      // compact and bushy: short segments, slow extension, frequent branching near the tips, a long leafy stretch
      SEG:0.08, YIELD:0.2, MAX_EXT:0.07, MIN_SHARE:0.03, APICAL:1.8, NATURAL_BREAK:0.2, NATURAL_RUN:0.2, FOLIAGE_N:5, TROPISM:0.07,
      H_BLOCKED:-0.18, H_STARVE:-0.08, H_SHADE:-0.07, H_HEAL:0.06, SHADE_GRACE:3,
      JIN_DELAY:3, ETIOLATE:true,
      SAG:0.15, SNAP:2.6,
      DECK:{cut:0.3, pinch:0.3, wire:0.28, root:0.12},
    },
    cards:{
      cut:'Cut a branch anywhere. Everything beyond is removed. A bud wakes only if foliage remains just behind the cut; otherwise the stub dies to deadwood.',
      root:'Wake a dormant bud within the foliage. Juniper buds on bare wood will not wake.',
      wire:'Tie a guy wire from a point on a branch to an iron ring. Juniper bends even where it is old and thick, but slowly, and takes long to set.',
    }},
};
let current = 'fig';
export function setSpecies(id){
  if (!SPECIES[id]) id = 'fig';
  for (const k of Object.keys(GCFG)) delete GCFG[k];
  Object.assign(GCFG, BASE, SPECIES[id].cfg);
  current = id;
}
export const cardText = (card, species=current) => SPECIES[species]?.cards?.[card] ?? CARDS[card].text;

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

export function solidsNear(g, y0, y1){
  const out = [];
  for (const m of g.modules) if (m.y1 >= y0 && m.y0 <= y1) for (const o of m.solids) out.push(o);
  return out;
}
// Where rain goes (visual only). A grid of columns over the ruins; in each column, the stone intervals [bottom, top].
// Rain from the sky lands on each column's topmost surface. Water on a wet surface runs off its edges: where the
// neighbouring column is open just below the surface, it drips from the underside of that stone down to the next
// surface below in the neighbouring column, which becomes wet in turn, so water cascades level by level.
// Returns the topmost surface per column and the drip lines: [x, z, along-x?, y from, y to] per edge.
export function waterMap(g, half=4, cell=0.1, ground=-0.75){
  const n = Math.round(2*half/cell), cols = Array.from({length:n*n}, () => []);
  for (const m of g.modules) for (const o of m.solids){
    const ext = o.kind === 'column' ? o.r : Math.hypot(o.hx, o.hz);
    const i0 = Math.max(0, Math.floor((o.cx - ext + half)/cell)), i1 = Math.min(n-1, Math.floor((o.cx + ext + half)/cell));
    const k0 = Math.max(0, Math.floor((o.cz - ext + half)/cell)), k1 = Math.min(n-1, Math.floor((o.cz + ext + half)/cell));
    for (let k=k0;k<=k1;k++) for (let i=i0;i<=i1;i++){
      if (insideSolid(o, -half + (i+0.5)*cell, o.cy, -half + (k+0.5)*cell, 0)) cols[k*n+i].push([o.cy - o.hy, o.cy + o.hy]);
    }
  }
  // merge each column's intervals; highest first
  for (let c=0;c<cols.length;c++){
    const iv = cols[c].sort((a, b) => a[0] - b[0]), out = [];
    for (const v of iv){ const l = out[out.length-1]; if (l && v[0] <= l[1] + 0.02) l[1] = Math.max(l[1], v[1]); else out.push([v[0], v[1]]); }
    cols[c] = out.reverse();
  }
  const top = new Float32Array(n*n);
  for (let c=0;c<cols.length;c++) top[c] = cols[c].length ? cols[c][0][1] : ground;
  const free = (c, y) => !cols[c].some(v => y >= v[0] && y <= v[1]);
  const below = (c, y) => { for (const v of cols[c]) if (v[1] < y) return v[1]; return ground; };
  const wet = new Set(), queue = [], emit = [];
  const wetAt = (c, j) => { const key = c*64 + j; if (!wet.has(key)){ wet.add(key); queue.push([c, j]); } };
  for (let c=0;c<cols.length;c++) if (cols[c].length) wetAt(c, 0);
  const D = [[1,0],[-1,0],[0,1],[0,-1]];
  while (queue.length){
    const [c, j] = queue.pop(), v = cols[c][j], i = c % n, k = (c - i)/n;
    for (const [di, dk] of D){
      const ni = i + di, nk = k + dk;
      if (ni < 0 || nk < 0 || ni >= n || nk >= n) continue;
      const nc = nk*n + ni;
      const same = cols[nc].findIndex(w => Math.abs(w[1] - v[1]) < 0.03);
      if (same >= 0){ wetAt(nc, same); continue; }  // the same flat surface: water spreads
      if (!free(nc, v[1] - 0.03)) continue;          // a wall rises beside it: water stays
      const to = below(nc, v[0]), tj = cols[nc].findIndex(w => w[1] === to);
      emit.push(-half + (i + 0.5 + di*0.5)*cell, -half + (k + 0.5 + dk*0.5)*cell, di === 0 ? 1 : 0, v[0], to);
      if (tj >= 0) wetAt(nc, tj);
    }
  }
  return {half, cell, n, top, emit:new Float32Array(emit), ground};
}

// The highest stone surface at (x, z) between yBot and yTop (or yBot if none): where rain lands.
export function surfaceBelow(g, x, z, yTop, yBot){
  let best = yBot;
  for (const o of solidsNear(g, yBot, yTop)){
    const top = o.cy + o.hy;
    if (top > best && top < yTop && insideSolid(o, x, o.cy, z, 0)) best = top;
  }
  return best;
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

// ---------- world ----------
function ensureWorld(g){
  while (!g.modules.length || g.modules[g.modules.length-1].y1 < g.maxY + 8) addModule(g);
}

// Rings for wiring, attached where a gardener could really tie to: inner wall faces, around columns,
// and hanging under beams and slabs. Only rings inside the tree's reach are kept.
function placeRings(g, m, R){
  const want = Math.max(1, 3 + Math.floor(R()*3) - m.k);
  const cands = m.solids.filter(o => ['wall', 'column', 'beam', 'slab'].includes(o.kind));
  for (let tries=0, made=0; tries<40 && made<want && cands.length; tries++){
    const o = cands[Math.floor(R()*cands.length)];
    let x, y, z, kind, nx, nz;
    if (o.kind === 'column'){
      const l = Math.hypot(o.cx, o.cz) || 1; nx = -o.cx/l; nz = -o.cz/l;
      x = o.cx + nx*(o.r + 0.03); z = o.cz + nz*(o.r + 0.03); y = o.cy + (R()-.5)*1.4*o.hy; kind = 'column';
    } else if (o.kind === 'wall'){
      const lx = (R()-.5)*1.6*o.hx; y = o.cy + (R()-.5)*1.4*o.hy;
      const face = lz => [o.cx + lx*o.c + lz*o.s, o.cz - lx*o.s + lz*o.c];
      const [ax, az] = face(-o.hz), [bx, bz] = face(o.hz);
      [x, z] = Math.hypot(ax, az) < Math.hypot(bx, bz) ? [ax, az] : [bx, bz];
      const l = Math.hypot(x, z) || 1; nx = -x/l; nz = -z/l; x += nx*0.04; z += nz*0.04; kind = 'wall';
    } else {
      const lx = (R()-.5)*1.6*o.hx, lz = (R()-.5)*1.2*o.hz;
      x = o.cx + lx*o.c + lz*o.s; z = o.cz - lx*o.s + lz*o.c; y = o.cy - o.hy - 0.16; kind = 'hang'; nx = 0; nz = 0;
    }
    if (Math.hypot(x, z) > G.REACH - 0.1 || y < 0.5) continue;
    if (g.rings.some(r => Math.hypot(r.x-x, r.y-y, r.z-z) < 0.8)) continue;
    g.rings.push({id:g.rings.length, x, y, z, kind, nx, nz, mod:m.i, used:false, tieY:o.cy - o.hy});
    made++;
  }
}

// ---------- the tree ----------
const V3 = {
  norm(a){ const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
  cross(a, b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; },
};
function budDir(d, phase){
  const a = Math.abs(d[1]) < 0.9 ? [0,1,0] : [1,0,0];
  const u = V3.norm(V3.cross(d, a)), v = V3.cross(d, u);
  const sx = u[0]*Math.cos(phase) + v[0]*Math.sin(phase), sy = u[1]*Math.cos(phase) + v[1]*Math.sin(phase), sz = u[2]*Math.cos(phase) + v[2]*Math.sin(phase);
  const c = Math.cos(G.BUD_ANGLE), s = Math.sin(G.BUD_ANGLE);
  return V3.norm([d[0]*c + sx*s, d[1]*c + sy*s + 0.15, d[2]*c + sz*s]);
}
function addNode(g, x, y, z, parent, d, o={}){
  const id = g.nodes.length;
  g.budPhase += 2.39996;
  const n = {id, x, y, z, parent, children:[], dx:d[0], dy:d[1], dz:d[2], born:g.turn, iter:o.iter ?? 0, r:G.R_TIP, minR:o.minR ?? 0,
    alive:true, dead:false, bud: o.bud === false ? null : budDir(d, g.budPhase)};
  g.nodes.push(n);
  if (parent >= 0){ const p = g.nodes[parent]; p.children.push(id); if (p.main == null) p.main = id; }
  if (y > g.maxY) g.maxY = y;
  if (y > g.peak){ if (stratumOf(y) > stratumOf(g.peak)) ev(g, 'stratum', {k:stratumOf(y)}); g.peak = y; }
  return id;
}
function addShoot(g, node, d, health=1){
  const s = {id:g.shootSeq++, node, d:V3.norm(d), health, run:0, carry:0, blocked:false, sliding:false, stone:0, held:false, share:0, L:1};
  g.shoots.push(s);
  return s;
}
export const shootById = (g, id) => g.shoots.find(s => s.id === id);
export const shootAt = (g, node) => g.shoots.find(s => s.node === node);

// An established bonsai: a thick, curving trunk about a metre tall, a few main branches with side shoots.
function plantBonsai(g){
  const R = mulberry32(hashInt(g.seed, 1));
  const lean = R()*TAU, bend = (0.12 + R()*0.08)*G.TRUNK_BEND, wave = G.TRUNK_WAVE;
  const trunk = [];
  for (let i=0;i<=9;i++){
    const t = i/9;
    const x = Math.sin(t*2.8*wave + lean)*bend*t + Math.cos(lean)*0.05*t;
    const z = Math.cos(t*2.3*wave + lean*1.3)*bend*0.8*t - 0.04*t;
    const prev = trunk.length ? trunk[trunk.length-1] : -1;
    const p = prev >= 0 ? g.nodes[prev] : {x, y:0, z};
    const d = V3.norm([x - p.x, 0.11, z - p.z]);
    trunk.push(addNode(g, x, t*1.0, z, prev, d, {minR: lerp(0.21, 0.065, Math.pow(t, 0.8)), bud: i >= 6, iter:0}));
  }
  const branch = (from, az, len, up, rStart, depth) => {
    let id = from, n = g.nodes[from];
    let d = V3.norm([Math.cos(az), up, Math.sin(az)]);
    const steps = Math.max(2, Math.round(len/0.13));
    for (let k=1;k<=steps;k++){
      d = V3.norm([d[0] + (R()-.5)*0.25, d[1] + (k < steps/2 ? -0.05 : 0.08), d[2] + (R()-.5)*0.25]);
      n = g.nodes[id];
      id = addNode(g, n.x + d[0]*0.13, n.y + d[1]*0.13, n.z + d[2]*0.13, id, d, {minR: lerp(rStart, rStart*0.4, k/steps)});
      if (depth === 0 && k === Math.round(steps*0.6)) branch(id, az + (R()<.5?1:-1)*(0.7 + R()*0.5), len*0.45, 0.25, rStart*0.5, 1);
    }
    addShoot(g, id, [d[0], d[1] + 0.3, d[2]]).run = 0.3;
  };
  let az = lean + Math.PI*0.5;
  for (const [ti, len] of [[3, 0.75], [5, 0.62], [7, 0.48]]){
    branch(trunk[ti], az, len, 0.12, g.nodes[trunk[ti]].minR*0.5, 0);
    az += 2.4 + (R()-.5)*0.4;
  }
  addShoot(g, trunk[9], [0, 1, 0]).run = 0.25;
  if (G.JIN){
    // an old juniper carries a jin: a dead branch, bleached silver, twisting up from the trunk
    const R2 = mulberry32(hashInt(g.seed, 3)), az = lean - Math.PI*0.5 + (R2()-.5);
    let id = trunk[6], d = V3.norm([Math.cos(az), 0.5, Math.sin(az)]);
    for (let k=0;k<5;k++){
      const n = g.nodes[id];
      d = V3.norm([d[0] + (R2()-.5)*0.5, d[1] + 0.12, d[2] + (R2()-.5)*0.5]);
      id = addNode(g, n.x + d[0]*0.11, n.y + d[1]*0.11, n.z + d[2]*0.11, id, d, {minR: lerp(0.035, 0.012, k/4), bud:false});
      g.nodes[id].dead = true;
    }
  }
  for (const n of g.nodes) n.born = -40;
}

export function newGame(seed, species='fig'){
  setSpecies(species);
  const g = {
    seed, species:current, turn:0, blend:blendFromSeed(seed), modules:[], rings:[],
    nodes:[], shoots:[], shootSeq:0, budPhase:0, maxY:0, peak:0,
    hand:[], drawR:mulberry32(hashInt(seed, 2)), log:[], events:[], over:false,
    healthSum:0, healthTurns:0, health:1, lastAdded:[], wires:[],
  };
  plantBonsai(g);
  ensureWorld(g);
  updateRadii(g);
  drawHand(g);
  g.follow = followPoint(g, g.shoots.map(s => s.node));
  g.health = treeHealth(g);
  return g;
}
export function replayGame(seed, log, species='fig'){
  const g = newGame(seed, species);
  for (const a of log){ if (!play(g, a)) break; }
  return g;
}

function skyInfo(g, x, y, z, solids){
  let open = 0, dx = 0, dy = 0, dz = 0;
  for (const d of SKY){
    let hit = false;
    for (const o of solids){ if (rayHits(o, x, y, z, d[0], d[1], d[2], G.SKY_LEN)){ hit = true; break; } }
    if (!hit){ open++; dx += d[0]; dy += d[1]; dz += d[2]; }
  }
  const l = Math.hypot(dx, dy, dz) || 1;
  return {L: G.AMBIENT + (1 - G.AMBIENT)*open/SKY.length, dir: open ? [dx/l, dy/l, dz/l] : [0, 1, 0]};
}

const PROBES = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0.7,0.7,0],[-0.7,0.7,0],[0,0.7,0.7],[0,0.7,-0.7],[0,1,0]];

// A shoot that meets stone creeps along it toward the brighter side, if there is a free direction no more than
// about 90° from its heading. Returns that direction, or null if it is truly stuck.
export function slideDir(g, n, d, ldir){
  let hx = ldir[0], hz = ldir[2], hl = Math.hypot(hx, hz);
  if (hl < 0.2){ hx = d[0]; hz = d[2]; hl = Math.hypot(hx, hz) || 1; }
  hx /= hl; hz /= hl;
  const cands = [V3.norm([d[0] + hx*1.5, d[1]*0.3, d[2] + hz*1.5]), V3.norm([hx, 0.1, hz]), V3.norm([d[0], 0, d[2]])];
  for (let k=0;k<8;k++){ const a = k*Math.PI/4; cands.push(V3.norm([Math.cos(a), 0.12, Math.sin(a)])); }
  let best = null, bs = -1e9;
  for (const c of cands){
    if (!isFinite(c[0]) || c[0]*d[0] + c[1]*d[1] + c[2]*d[2] < -0.1) continue;
    if (blockedAt(g, n.x + c[0]*G.SEG, n.y + c[1]*G.SEG, n.z + c[2]*G.SEG) || blockedAt(g, n.x + c[0]*G.SEG*0.5, n.y + c[1]*G.SEG*0.5, n.z + c[2]*G.SEG*0.5)) continue;
    const sc = c[0]*ldir[0] + c[1]*ldir[1] + c[2]*ldir[2] + 0.3*(c[0]*d[0] + c[1]*d[1] + c[2]*d[2]);
    if (sc > bs){ bs = sc; best = c; }
  }
  return best;
}

// What each shoot will do this turn: light, crowding, energy share, extension, and whether stone is right ahead.
export function planTurn(g){
  const day = !G.NIGHT_RULES || isDay(g.turn);
  const info = g.shoots.map(s => {
    const n = g.nodes[s.node];
    const solids = solidsNear(g, n.y - 0.5, n.y + G.SKY_LEN);
    const sk = skyInfo(g, n.x, n.y, n.z, solids);
    let crowd = 0;
    for (const o of g.shoots){ if (o === s) continue; const m = g.nodes[o.node]; if (m.y >= n.y - 0.05 && Math.hypot(m.x-n.x, m.y-n.y, m.z-n.z) < G.CROWD_R) crowd++; }
    const L = sk.L/(1 + G.CROWD_K*crowd);
    // sense brighter space around the tip, so a shoot bends gradually toward a gap that is not straight above it
    let wx = 0, wy = 0, wz = 0;
    for (const p of PROBES){
      const x = n.x + p[0]*G.SENSE_R, y = n.y + p[1]*G.SENSE_R, z = n.z + p[2]*G.SENSE_R;
      if (blockedAt(g, x, y, z, 0)) continue;
      const lp = skyInfo(g, x, y, z, solids).L - sk.L;
      if (lp > 0){ wx += p[0]*lp; wy += p[1]*lp; wz += p[2]*lp; }
    }
    const wl = Math.hypot(wx, wy, wz);
    const k = wl > 1e-6 ? Math.min(1, wl*3)*G.SENSE/wl : 0;
    const ldir = V3.norm([sk.dir[0] + wx*k, sk.dir[1] + wy*k, sk.dir[2] + wz*k]);
    return {s, n, L, crowd, ldir};
  });
  const top = Math.max(0, ...info.map(i => i.n.y));
  let E = G.ROOT_ENERGY;
  for (const i of info) E += G.YIELD*i.L*(day ? 1 : G.NIGHT_LIGHT);
  for (const i of info) i.w = (0.25 + i.L)*Math.exp(G.APICAL*(i.n.y - top));
  // share energy by weight; a shoot can only use so much, the rest flows to the others
  let pool = E, open = info.slice();
  for (let pass=0; pass<4 && open.length && pool > 1e-6; pass++){
    const W = open.reduce((a, i) => a + i.w, 0) || 1;
    const next = [];
    let spent = 0;
    for (const i of open){
      const give = pool*i.w/W, room = G.MAX_EXT - (i.ext || 0);
      const take = Math.min(give, room);
      i.ext = (i.ext || 0) + take; spent += take;
      if (take < give - 1e-9) continue;
      next.push(i);
    }
    pool -= spent; open = next;
    if (spent < 1e-9) break;
  }
  for (const i of info){
    i.ext = (i.ext || 0)*Math.max(0.4, 1 - G.HYDRAULIC*stratumOf(i.n.y));
    if (G.ETIOLATE && i.L < G.SHADE_L) i.ext = Math.min(G.MAX_EXT*1.3, i.ext*1.3);  // stretching toward light
    i.share = i.ext;
    const d = i.s.d;
    i.blockedAhead = blockedAt(g, i.n.x + d[0]*G.SEG, i.n.y + d[1]*G.SEG, i.n.z + d[2]*G.SEG);
    i.slide = i.blockedAhead ? slideDir(g, i.n, d, i.ldir) : null;
  }
  return {info, E, day};
}

function ev(g, type, data={}){ g.events.push({type, ...data}); }

function growDir(g, s, ldir){
  const d = s.d;
  const sag = !s.held && s.run > G.LEGGY ? G.SAG*(s.run - G.LEGGY + 0.2) : 0;
  return V3.norm([d[0] + ldir[0]*G.PHOTO, d[1] + G.TROPISM + ldir[1]*G.PHOTO*0.5 - sag, d[2] + ldir[2]*G.PHOTO]);
}

function removeSubtree(g, id){
  const cut = [], stack = [id];
  while (stack.length){ const k = stack.pop(); const n = g.nodes[k]; if (!n.alive) continue; cut.push(k); n.alive = false; for (const c of n.children) stack.push(c); }
  const parent = g.nodes[g.nodes[id].parent];
  if (parent){
    parent.children = parent.children.filter(c => c !== id);
    if (parent.main === id) parent.main = null;
    const c = g.nodes[id];
    parent.cutEnd = V3.norm([c.x - parent.x, c.y - parent.y, c.z - parent.z]);
  }
  const set = new Set(cut);
  g.shoots = g.shoots.filter(s => !set.has(s.node));
  for (const w of g.wires) if (set.has(w.node)){ g.rings[w.ring].used = false; w.gone = true; }
  g.wires = g.wires.filter(w => !w.gone);
  return cut.length;
}
// ---------- guy wires ----------
// A wire runs from a tie point on a branch to a ring. The stretch of branch from where it leaves its parent up to the
// tie point bends toward the ring a little each turn, spread over its joints so it curves rather than hinges; thick
// wood bends less. Everything beyond the tie point swings with it. When the wood has set, the wire comes off.
function sectionOf(g, tie){
  const path = [tie];
  let cur = tie;
  while (g.nodes[cur].parent >= 0 && g.nodes[g.nodes[cur].parent].main === cur && g.nodes[cur].parent !== 0){ cur = g.nodes[cur].parent; path.push(cur); }
  return {pivot: Math.max(0, g.nodes[cur].parent), path: path.reverse()};
}
function subtreeOf(g, id){
  const out = [], stack = [id];
  while (stack.length){ const k = stack.pop(), n = g.nodes[k]; if (!n.alive) continue; out.push(k); for (const c of n.children) stack.push(c); }
  return out;
}
function rotVec(v, k, c, s){
  const d = k[0]*v[0] + k[1]*v[1] + k[2]*v[2];
  return [v[0]*c + (k[1]*v[2] - k[2]*v[1])*s + k[0]*d*(1-c), v[1]*c + (k[2]*v[0] - k[0]*v[2])*s + k[1]*d*(1-c), v[2]*c + (k[0]*v[1] - k[1]*v[0])*s + k[2]*d*(1-c)];
}
function rotateSubtree(g, ids, p, k, ang){
  const c = Math.cos(ang), s = Math.sin(ang), set = new Set(ids);
  for (const id of ids){
    const n = g.nodes[id];
    [n.x, n.y, n.z] = rotVec([n.x - p.x, n.y - p.y, n.z - p.z], k, c, s).map((v, i) => v + [p.x, p.y, p.z][i]);
    [n.dx, n.dy, n.dz] = rotVec([n.dx, n.dy, n.dz], k, c, s);
    if (n.bud) n.bud = rotVec(n.bud, k, c, s);
    if (n.cutEnd) n.cutEnd = rotVec(n.cutEnd, k, c, s);
  }
  for (const sh of g.shoots) if (set.has(sh.node)) sh.d = rotVec(sh.d, k, c, s);
}
export function wireFlex(g, tie){ const r = g.nodes[sectionOf(g, tie).path[0]].r; return 1/(1 + (r/G.WIRE_FLEX_R)**2); }
function bendWires(g){
  for (const w of g.wires){
    w.age++;
    const N = g.nodes, T = N[w.node], J = N[w.pivot], R = g.rings[w.ring];
    const v1 = [T.x - J.x, T.y - J.y, T.z - J.z], v2 = [R.x - J.x, R.y - J.y, R.z - J.z];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2])/(l1*l2))));
    const flex = wireFlex(g, w.node);
    let a = Math.min(G.WIRE_STEP*flex, ang - 0.03, G.WIRE_MAX*flex - w.bent);
    if (a <= 0.002) continue;
    const k = V3.norm(V3.cross(v1, v2));
    if (!isFinite(k[0])) continue;
    const path = sectionOf(g, w.node).path, moved = subtreeOf(g, path[0]);
    const before = moved.map(id => [N[id].x, N[id].y, N[id].z, N[id].dx, N[id].dy, N[id].dz, N[id].bud, N[id].cutEnd]);
    const shootD = g.shoots.map(s => s.d);
    const wasBlocked = new Set(moved.filter(id => blockedAt(g, N[id].x, N[id].y, N[id].z, 0.02)));
    for (let tries=0; tries<3 && a > 0.002; tries++){
      for (let i=0;i<path.length;i++){
        const pv = N[i === 0 ? w.pivot : path[i-1]];
        rotateSubtree(g, subtreeOf(g, path[i]), {x:pv.x, y:pv.y, z:pv.z}, k, a/path.length);
      }
      if (!moved.some(id => !wasBlocked.has(id) && blockedAt(g, N[id].x, N[id].y, N[id].z, 0.02))){ w.bent += a; break; }
      // stone in the way: undo and try a smaller bend
      moved.forEach((id, j) => { const b = before[j], n = N[id]; [n.x, n.y, n.z, n.dx, n.dy, n.dz] = b; n.bud = b[6]; n.cutEnd = b[7]; });
      g.shoots.forEach((s, j) => { s.d = shootD[j]; });
      a *= 0.4;
    }
  }
  for (const w of g.wires) if (w.age >= G.WIRE_SET){ g.rings[w.ring].used = false; w.gone = true; ev(g, 'set', {node:w.node}); }
  g.wires = g.wires.filter(w => !w.gone);
}
// a shoot is held up (no sag, no snapping) while a wire is tied on its branch, at or behind it
function holdShoots(g){
  for (const s of g.shoots){ s.held = g.wires.some(w => isAncestor(g, w.node, s.node)); }
}

// the best dormant bud on this node or the few just behind it (read-only, used for previews too)
// Nodes carrying foliage: each living tip and the few nodes behind it.
export function foliageSet(g, skip=null){
  const out = new Set();
  for (const s of g.shoots){
    if (skip && skip.has(s.node)) continue;
    let id = s.node;
    for (let k=0; k<=G.FOLIAGE_N && id >= 0; k++){ out.add(id); id = g.nodes[id].parent; }
  }
  return out;
}
// fol: where buds may wake when bare wood cannot (null: anywhere searched)
export function bestBud(g, from, maxBack, avoid=[], fol=null){
  let id = from, best = null, bs = -1e9;
  for (let k=0; k<=maxBack && id >= 0; k++){
    const n = g.nodes[id];
    if (n.bud && n.alive && !n.dead && !shootAt(g, id) && !avoid.includes(id) && (!fol || fol.has(id))){
      const b = n.bud;
      if (!blockedAt(g, n.x + b[0]*G.SEG, n.y + b[1]*G.SEG, n.z + b[2]*G.SEG)){
        const sc = b[1] + n.y*0.05;
        if (sc > bs){ bs = sc; best = n; }
      }
    }
    id = n.parent;
  }
  return best;
}
// Juniper: living wood that no longer leads to any foliage dies and stays as silver deadwood (jin). Returns how many nodes.
// It first browns (dying) for JIN_DELAY turns. Called once per turn (tick) and after a cut (no tick).
function killBare(g, tick=true){
  if (!G.JIN) return 0;
  const live = new Set(g.shoots.map(s => s.node)), has = new Uint8Array(g.nodes.length);
  let n = 0, started = 0;
  for (let id = g.nodes.length - 1; id >= 0; id--){
    const x = g.nodes[id]; if (!x.alive) continue;
    has[id] = live.has(id) || x.children.some(c => has[c]) ? 1 : 0;
    if (has[id] || x.dead){ x.dying = 0; continue; }
    if (!x.dying){ x.dying = 1; x.bud = null; started++; }
    else if (tick) x.dying++;
    if (x.dying > G.JIN_DELAY){ x.dead = true; x.deadT = g.turn; x.dying = 0; n++; }
  }
  if (started) ev(g, 'dying');
  return n;
}
function wakeBud(g, from, maxBack, health, fol=null){
  const best = bestBud(g, from, maxBack, [], fol);
  if (!best) return null;
  const s = addShoot(g, best.id, best.bud, health);
  best.bud = null;
  return s;
}
// what a pinch or cut would do, without doing it
export function previewAction(g, card, target){
  if (card === 'pinch'){
    const s = shootById(g, target); if (!s) return null;
    const a = bestBud(g, s.node, 3), b = a ? bestBud(g, s.node, 3, [a.id]) : null;
    return {removed:[], buds:[a, b].filter(Boolean)};
  }
  if (card === 'root'){ const n = g.nodes[target]; return n && n.bud ? {removed:[], buds:[n]} : null; }
  if (card === 'cut'){
    const removed = [], stack = [target];
    while (stack.length){ const k = stack.pop(); const n = g.nodes[k]; if (!n.alive) continue; removed.push(k); for (const c of n.children) stack.push(c); }
    const gone = new Set(removed);
    const bud = bestBud(g, g.nodes[target].parent, 3, [], G.BARE_BUDS ? null : foliageSet(g, gone));
    // a juniper stub left with no foliage dies: show it with what is removed
    const dies = [];
    if (G.JIN && !bud){
      const live = new Set(g.shoots.filter(s => !gone.has(s.node)).map(s => s.node));
      const has = new Map();
      for (let id = g.nodes.length - 1; id >= 0; id--){
        const n = g.nodes[id]; if (!n.alive || gone.has(id)) continue;
        has.set(id, live.has(id) || n.children.some(c => has.get(c)));
      }
      for (const [id, h] of has) if (!h && !g.nodes[id].dead) dies.push(id);
    }
    return {removed:[...removed, ...dies], buds: bud ? [bud] : [], dies};
  }
  return null;
}

// ---------- cards ----------
export const CARDS = {
  pinch: {name:'Pinch', text:'Stop a shoot. Up to two buds just behind it wake as short shoots: a denser, more compact pad.'},
  cut:   {name:'Cut', text:'Cut a branch anywhere. Everything beyond the cut is removed; a dormant bud just behind it wakes.'},
  wire:  {name:'Wire', text:'Tie a guy wire from a point on a branch to an iron ring. Over the next turns the branch bends toward the ring (thin wood bends more) and does not sag. When the wood has set, the wire comes off.'},
  root:  {name:'Rooting powder', text:'Wake a dormant bud of your choice on old wood. It grows out in its own direction.'},
};
function drawCard(g){
  const r = g.drawR();
  let acc = 0;
  for (const [k, w] of Object.entries(G.DECK)){ acc += w; if (r < acc) return k; }
  return 'cut';
}
function drawHand(g){
  const h = [];
  for (let i=0;i<G.HAND;i++) h.push(drawCard(g));
  while (h.every(c => c === h[0])) h[h.length-1] = drawCard(g);
  g.hand = h;
}
export function targets(g, card, step=0, first=null){
  if (card === 'pinch') return g.shoots.map(s => s.id);
  if (card === 'cut') return g.nodes.filter(n => n.alive && n.id > 2).map(n => n.id);
  if (card === 'root'){ const fol = G.BARE_BUDS ? null : foliageSet(g); return g.nodes.filter(n => n.alive && !n.dead && n.bud && n.y > 0.15 && !shootAt(g, n.id) && (!fol || fol.has(n.id))
    && !blockedAt(g, n.x + n.bud[0]*G.SEG, n.y + n.bud[1]*G.SEG, n.z + n.bud[2]*G.SEG)).map(n => n.id); }
  if (card === 'wire'){
    // step 0: tie points (living branch nodes with a free ring in reach); step 1: rings in reach of tie point `first`
    if (step === 0) return g.nodes.filter(n => n.alive && !n.dead && n.id > 2 && !g.wires.some(w => w.node === n.id)
      && g.rings.some(r => !r.used && Math.hypot(r.x-n.x, r.y-n.y, r.z-n.z) <= G.WIRE_RANGE)).map(n => n.id);
    const n = g.nodes[first]; if (!n || !n.alive || n.dead) return [];
    return g.rings.filter(r => !r.used && Math.hypot(r.x-n.x, r.y-n.y, r.z-n.z) <= G.WIRE_RANGE).map(r => r.id);
  }
  return [];
}
// a card with nothing to act on may be discarded
export const canDiscard = (g, i) => !!g.hand[i] && targets(g, g.hand[i]).length === 0;

function apply(g, a){
  const card = g.hand[a.i];
  if (!card) return false;
  if (a.discard) return canDiscard(g, a.i);
  if (a.card !== card) return false;
  if (card === 'pinch'){
    const s = shootById(g, a.shoot); if (!s) return false;
    g.shoots = g.shoots.filter(x => x !== s);
    let woke = 0, from = s.node;
    for (let k=0; k<2; k++){ const w = wakeBud(g, from, 3, Math.max(0.65, s.health)); if (w){ woke++; w.run = 0; } }
    ev(g, 'pinch', {woke});
    return true;
  }
  if (card === 'cut'){
    if (!targets(g, 'cut').includes(a.node)) return false;
    const parent = g.nodes[a.node].parent;
    const removed = removeSubtree(g, a.node);
    const w = wakeBud(g, parent, 3, 0.8, G.BARE_BUDS ? null : foliageSet(g));
    if (w) w.run = 0;
    killBare(g, false);
    ev(g, 'cut', {removed, woke: w ? 1 : 0});
    return true;
  }
  if (card === 'root'){
    if (!targets(g, 'root').includes(a.node)) return false;
    const n = g.nodes[a.node];
    addShoot(g, n.id, n.bud, 0.9);
    n.bud = null;
    ev(g, 'root');
    return true;
  }
  if (card === 'wire'){
    if (!targets(g, 'wire').includes(a.node) || !targets(g, 'wire', 1, a.node).includes(a.ring)) return false;
    g.wires.push({node:a.node, ring:a.ring, pivot:sectionOf(g, a.node).pivot, age:0, bent:0});
    g.rings[a.ring].used = true;
    ev(g, 'wire');
    return true;
  }
  return false;
}

// One move: play card i from the hand (or discard it if it has nothing to act on), then the tree grows.
export function play(g, a){
  if (g.over) return false;
  g.events = [];
  if (!apply(g, a)) return false;
  g.log.push(a);
  growTurn(g);
  drawHand(g);  // pick one of three: the other two go, and three new cards come
  return true;
}

// ---------- growth turn ----------
function growTurn(g){
  bendWires(g);
  holdShoots(g);
  const plan = planTurn(g), shootsBefore = g.shoots.length;
  const R = mulberry32(hashInt(g.seed, 700 + g.turn));
  const added = [];
  for (const i of plan.info){
    const s = i.s;
    if (!g.shoots.includes(s)) continue;
    s.L = i.L; s.share = i.share; s.blocked = false; s.sliding = false;
    s.carry += i.ext;
    let k = 0;
    while (s.carry >= G.SEG){
      const n = g.nodes[s.node];
      const d = growDir(g, s, i.ldir);
      const x = n.x + d[0]*G.SEG, y = n.y + d[1]*G.SEG, z = n.z + d[2]*G.SEG;
      let gd = d, gx = x, gy = y, gz = z, cost = G.SEG;
      if (blockedAt(g, x, y, z) || blockedAt(g, n.x + d[0]*G.SEG*0.5, n.y + d[1]*G.SEG*0.5, n.z + d[2]*G.SEG*0.5)){
        const sl = slideDir(g, n, d, i.ldir);
        if (!sl){ s.blocked = true; s.carry = 0; break; }
        if (!s.sliding && s.stone === 0) ev(g, 'slide', {shoot:s.id});
        s.sliding = true;
        gd = sl; gx = n.x + sl[0]*G.SEG; gy = n.y + sl[1]*G.SEG; gz = n.z + sl[2]*G.SEG; cost = G.SEG/G.SLIDE_SPEED;
        if (s.carry < cost){ s.carry = Math.min(s.carry, cost); break; }
      }
      s.carry -= cost;
      const id = addNode(g, gx, gy, gz, s.node, gd, {iter:k++});
      added.push(id);
      s.node = id; s.d = gd; s.run += G.SEG;
    }
    if (s.carry > G.SEG/G.SLIDE_SPEED) s.carry = G.SEG/G.SLIDE_SPEED;
    s.stone = (s.blocked || s.sliding) ? s.stone + 1 : 0;
    // a strong shoot occasionally breaks a side bud on its own
    const dim = G.ETIOLATE && i.L < G.SHADE_L;  // a stretching shoot in poor light does not branch
    if (!s.blocked && i.ext >= G.MAX_EXT*0.83 && s.run >= G.NATURAL_RUN && R() < G.NATURAL_BREAK && !dim){
      let back = s.node; for (let k=0;k<2;k++) back = g.nodes[back].parent;
      const w = wakeBud(g, back, 2, Math.max(0.7, s.health*0.9));
      if (w){ s.run = Math.min(s.run, G.NATURAL_RUN*0.5 + 0.1); ev(g, 'branch'); }
    }
  }
  // health: stone, shade, hunger and legginess hurt; light and food heal
  const day = plan.day;
  for (const i of plan.info){
    const s = i.s;
    if (!g.shoots.includes(s)) continue;
    let dh = 0;
    if (s.blocked && s.stone > G.STONE_GRACE){ dh += G.H_BLOCKED; ev(g, 'blocked', {shoot:s.id}); }
    s.shade = i.L < G.SHADE_L ? (s.shade || 0) + 1 : 0;
    if (day && s.shade > G.SHADE_GRACE) dh += G.H_SHADE;
    if (day && i.ext < G.MIN_SHARE) dh += G.H_STARVE;
    if (!s.held && s.run > G.LEGGY) dh += G.H_LEGGY;
    if (dh === 0 && day && !s.blocked) dh = G.H_HEAL;
    s.health = Math.max(0, Math.min(1, s.health + dh));
    if (!s.held && s.run > G.SNAP){
      // the unbranched run breaks off at its base
      let id = s.node, len = 0;
      while (len < s.run - 0.05 && g.nodes[id].parent >= 0){ id = g.nodes[id].parent; len += G.SEG; }
      const child = g.nodes[id].children.find(c => isAncestor(g, c, s.node)) ?? s.node;
      removeSubtree(g, child);
      ev(g, 'snap');
      continue;
    }
    if (s.health <= 0){
      // die-back: the last few segments turn to dead wood; a fig often re-buds just behind
      let id = s.node;
      for (let k=0; k<G.DIEBACK_NODES && id > 2; k++){ const n = g.nodes[id]; if (n.children.some(c => g.nodes[c].alive && !g.nodes[c].dead)) break; n.dead = true; n.deadT = g.turn; n.bud = null; id = n.parent; }
      g.shoots = g.shoots.filter(x => x !== s);
      ev(g, 'dieback');
      if (R() < G.REBUD){ const w = wakeBud(g, id, 2, 0.55); if (w) ev(g, 'rebud'); }
    }
  }
  if (killBare(g)) ev(g, 'jin');
  // thin dead twigs break off after a while; thicker deadwood (jin) stays
  for (const n of g.nodes){
    if (!n.alive || !n.dead || n.parent < 0) continue;
    const p = g.nodes[n.parent];
    if (p.dead || n.r >= G.TWIG_R || g.turn - (n.deadT ?? -99) < G.TWIG_DROP) continue;
    const pc = p.cutEnd; removeSubtree(g, n.id); p.cutEnd = pc;  // a twig falling leaves no cut face
  }
  g.turn++;
  g.maxY = 0; for (const n of g.nodes) if (n.alive && !n.dead && n.y > g.maxY) g.maxY = n.y;
  updateRadii(g);
  ensureWorld(g);
  g.lastAdded = added;
  g.health = treeHealth(g);
  g.healthSum += g.health; g.healthTurns++;
  g.follow = followPoint(g, g.shoots.map(s => s.node));
  if (!g.shoots.length){ g.over = true; ev(g, 'over'); }
  else if (g.shoots.length === 1 && shootsBefore > 1) ev(g, 'last');  // the warning before the run can end (§4.6)
  else if (g.health < 0.3) ev(g, 'weak');
}
function isAncestor(g, a, b){ let id = b; while (id >= 0){ if (id === a) return true; id = g.nodes[id].parent; } return false; }
function followPoint(g, ids){
  const ns = ids.map(id => g.nodes[id]).filter(n => n && n.alive);
  if (!ns.length) return g.follow || {x:0, y:0.6, z:0};
  const ys = ns.map(n => n.y).sort((a,b) => b-a), cut = ys[Math.floor(ys.length*0.6)];
  let x=0, y=0, z=0, k=0;
  for (const n of ns) if (n.y >= cut){ x += n.x; y += n.y; z += n.z; k++; }
  return {x:x/k, y:y/k, z:z/k};
}
export function treeHealth(g){
  if (!g.shoots.length) return 0;
  const mean = g.shoots.reduce((a, s) => a + s.health, 0)/g.shoots.length;
  return mean*Math.min(1, g.shoots.length/5);
}
export const avgHealth = g => g.healthTurns ? g.healthSum/g.healthTurns : g.health;
export const score = g => Math.round(g.peak*100*avgHealth(g));

// Branch thickness follows the pipe model, but wood only ever thickens, and only a little each turn,
// so the tree never visibly reshapes.
export function updateRadii(g){
  const N = g.nodes;
  for (let i=N.length-1; i>=0; i--){
    const n = N[i];
    if (!n.alive) continue;
    const kids = n.children.filter(c => N[c].alive);
    let t = G.R_TIP;
    if (kids.length){ let s = 0; for (const c of kids) s += Math.pow(N[c].rt, G.PIPE); t = Math.pow(s, 1/G.PIPE); }
    n.rt = Math.max(t, n.minR);
    if (n.r0 == null || g.turn === 0) n.r = Math.max(n.r || 0, n.rt);
    else if (n.rt > n.r) n.r = Math.min(n.rt, n.r + G.THICKEN);
    n.r0 = n.r;
  }
}
export const heightM = g => +g.maxY.toFixed(2);
// strata: each band is a little harder (smaller openings, fewer windows and rings); stratum 0 is unchanged
export const stratumOf = y => Math.max(0, Math.floor(y/G.STRATUM_H));
const ease = (k, step) => Math.max(0, 1 - step*k);
const lerp = (a, b, t) => a + (b - a)*t;

function addModule(g){
  const i = g.modules.length;
  const R = mulberry32(hashInt(g.seed, 100 + i));
  const y0 = i === 0 ? -0.75 : g.modules[i-1].y1;
  let type;
  if (i === 0) type = 'court';
  else if (i % 2 === 1) type = R() < 0.55 ? 'chamber' : 'tower';
  else type = R() < 0.65 ? 'terrace' : 'court';
  const style = pickStyle(g.blend, R());
  const k = stratumOf(y0);
  const m = {i, type, style, y0, y1:y0, k, solids:[], vis:{blocks:[], balusters:[], glow:[], vines:[], windows:[]}, holes:[]};
  // every upper module stands on a floor with an opening for the tree, unless the one below has a ceiling,
  // and on four corner piers, so the ruin reads as one structure
  const below = g.modules[i-1];
  if (i > 0 && below.type !== 'chamber'){
    const n = Math.round(2*G.HALF/0.52), w = 3 + Math.floor(R()*2) - (k >= 2 ? 1 : 0), hx = Math.floor((n - w)/2) + Math.round((R()-.5)*3), hz = Math.floor((n - w)/2) + Math.round((R()-.5)*3);
    const holes = [{x0:hx, x1:hx+w, z0:hz, z1:hz+w}];
    if (R() < 0.5*ease(k, 0.3)){ const x = Math.floor(R()*(n-2)), z = Math.floor(R()*(n-2)); holes.push({x0:x, x1:x+2, z0:z, z1:z+1}); }
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
  placeRings(g, m, R);
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
      if (R() < Math.max(0.4, 0.8 - 0.1*m.k)) ops.push(opening(R, len, h, 0.8, 1.4, 0.8, 1.2));
      if (R() < 0.25) ops.push(opening(R, len, h, 0.9, 1.2, 1.5, 2.0, true));
      wall(m, R, k*Math.PI/2, G.HALF + G.WALL_T/2, len, m.y0, h, ops);
    }
    const n = Math.round(2*G.HALF/0.52);
    const hx = 1 + Math.floor(R()*(n-4)), hz = 1 + Math.floor(R()*(n-4));
    const holes = [{x0:hx, x1:hx + 2 + (R()<0.5?1:0), z0:hz, z1:hz + 2 + (R()<0.5?1:0)}];
    if (R() < 0.6*ease(m.k, 0.3)){ const x = Math.floor(R()*(n-1)), z = Math.floor(R()*(n-1)); holes.push({x0:x, x1:x+1+(R()<.4?1:0), z0:z, z1:z+1}); }
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

