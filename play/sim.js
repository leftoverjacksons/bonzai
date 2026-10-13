// Bonzai rules, prototype v0.
// Pure and deterministic: the same seed and the same list of moves always rebuild the same game.
// Space is a grid of cells inside a round shaft; the tree grows one cell per tip per turn.

export const CFG = {
  CELL: 0.4,             // metres per cell (rendering only)
  SHAFT_R: 5.4,          // shaft radius in cells
  CHUNK: 16,             // cells per generated world chunk
  STRATUM_CELLS: 20,     // height band size in cells (8 m); tune by playing
  TURNS_PER_DAY: 12,     // one turn = 2 hours
  START_HOUR: 6,
  SUN_AZ0: 0.25,
  START_SAP: 4,
  SAP_MAX: 12,
  ROOT_INCOME: 1,        // sap per turn from the roots, day and night
  STALL_DRAIN: 1,        // sap per turn lost to each stalled tip
  WITHER_TURNS: 3,       // a tip stuck this many turns in a row dies
  STARVE_TURNS: 4,       // a tip that goes unfed this many turns in a row dies
  UPKEEP_CELLS: 30,      // every this many cells of wood costs 1 sap per turn
  SKY_PER_STRATUM: 2,    // each stratum needs this many more clear cells above for sunlight
  DEFLECT: 0.69,         // how far a blocked tip may turn (cosine; 0.69 is about 45 degrees)
  PRUNE_REFUND: 0.5,     // sap back per removed cell
  WATER_BOOST: 2,        // extra free growth steps
  SAG_RUN: 4,            // sideways cells before an untethered branch sags
  TETHER_SAP: 3,
  TETHER_RANGE: 12,
  LANTERN_TURNS: 8,
  LANTERN_R: 2.6,
  MOON_SAP: 3,
  SKY_CLEAR: 8,          // a cell is sunlit if no stone in this many cells above it
  WINDOW_REACH: 3,
  MAX_TIPS: 14,
  HAND: 3,
  ROCK_EVERY: [9, 7, 6, 5, 4, 3], // turns between rockfalls, by stratum
  GALLERY_M: 4,          // metres a tree must reach to enter the gallery
};

export function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export function hashInt(...ns){ let h = 2166136261; for (const n of ns){ h ^= (n|0); h = Math.imul(h, 16777619); h ^= h>>>13; } return h>>>0; }
const K = (x,y,z) => x + ',' + y + ',' + z;
const TAU = Math.PI*2;

export const DIRS = [];
for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) for (let dz=-1; dz<=1; dz++) if (dx||dy||dz) DIRS.push([dx,dy,dz]);
const len3 = d => Math.hypot(d[0], d[1], d[2]);
const dotN = (a, b) => (a[0]*b[0] + a[1]*b[1] + a[2]*b[2]) / (len3(a)*len3(b) || 1);
const same = (a, b) => a[0]===b[0] && a[1]===b[1] && a[2]===b[2];

export const STYLES = ['Atlantis', 'Angkor', 'Maya'];
export function blendFromSeed(seed){
  const R = mulberry32(hashInt(seed, 7));
  const raw = [0,1,2].map(() => -Math.log(1 - R()*0.999));
  const s = raw[0] + raw[1] + raw[2];
  return raw.map(x => x/s);
}
export const pickStyle = (w, u) => u < w[0] ? 0 : u < w[0]+w[1] ? 1 : 2;

export const hourOf = turn => (CFG.START_HOUR + turn*24/CFG.TURNS_PER_DAY) % 24;
export const dayOf = turn => Math.floor((CFG.START_HOUR + turn*24/CFG.TURNS_PER_DAY) / 24) + 1;
export const isDay = turn => { const h = hourOf(turn); return h >= 6 && h < 18; };
export const sunAz = hour => CFG.SUN_AZ0 + (hour-6)/12*Math.PI;
export const stratumOf = y => Math.floor(y / CFG.STRATUM_CELLS);
export const inside = (x, z) => x*x + z*z <= CFG.SHAFT_R*CFG.SHAFT_R;

export const CARDS = {
  water:   {name:'Water',          target:'tip',  text:`A tip grows ${CFG.WATER_BOOST} extra cells this turn, free.`},
  prune:   {name:'Prune',          target:'wood', text:'Cut a branch. Get sap back for what you remove; a bud forms at the cut.'},
  root:    {name:'Rooting powder', target:'bud',  text:'A new tip sprouts from old wood.'},
  bend:    {name:'Bend',           target:'tip',  then:'dir',    text:'Point a tip in a new direction.'},
  tether:  {name:'Tether',         target:'tip',  then:'anchor', text:`Tie a tip to an iron ring. It grows toward it and won't sag. +${CFG.TETHER_SAP} sap on arrival.`},
  lantern: {name:'Lantern',        target:'tip',  text:`Lights around a tip for ${CFG.LANTERN_TURNS} turns, even at night.`},
  moon:    {name:'Moonbloom',      target:null,   text:`Night only. +${CFG.MOON_SAP} sap.`},
  shears:  {name:'Shears',         target:'wood', forced:true, text:'Forced. You must cut something this turn.'},
};

// ---------- game creation ----------
export function newGame(seed){
  const g = {
    seed, turn:0, sap:CFG.START_SAP, over:false, warn:false,
    nodes:[], occ:new Map(), tips:[], tipSeq:0, anchors:[], windows:[], lanterns:[], chunks:[], rocks:[],
    hand:[], log:[], events:[], maxY:0, peak:0, blend:blendFromSeed(seed), drawR:mulberry32(hashInt(seed, 2)),
    nextRock:null, litCache:new Map(), stats:{cut:0, tied:0, stalls:0},
  };
  let prev = addNode(g, 0, 0, 0, -1);
  for (let y=1; y<=3; y++) prev = addNode(g, 0, y, 0, prev);
  addTip(g, prev, [0,1,0]);
  addTip(g, 2, [1,1,0]);
  ensureChunks(g);
  scheduleRock(g);
  fillHand(g);
  return g;
}

export function replay(seed, log){
  const g = newGame(seed);
  for (const a of log){ if (!play(g, a)) break; }
  return g;
}

function addNode(g, x, y, z, parent){
  const id = g.nodes.length;
  g.nodes.push({id, x, y, z, parent, children:[], born:g.turn, alive:true});
  if (parent >= 0) g.nodes[parent].children.push(id);
  g.occ.set(K(x,y,z), {t:'wood', id});
  if (y > g.maxY) g.maxY = y;
  if (y > g.peak) g.peak = y;
  return id;
}
function addTip(g, node, h){
  const t = {id:g.tipSeq++, node, h:h.slice(), stalled:false, stuck:0, hunger:0, hrun:0, tether:null, boost:0, tied:false};
  g.tips.push(t);
  return t;
}
export const tipById = (g, id) => g.tips.find(t => t.id === id);
export const tipAt = (g, node) => g.tips.find(t => t.node === node);

// ---------- world ----------
export function blocked(g, x, y, z){ return y < 1 || !inside(x, z) || g.occ.has(K(x,y,z)); }
export const stoneAt = (g, x, y, z) => { const o = g.occ.get(K(x,y,z)); return !!o && o.t === 'stone'; };

function ensureChunks(g){
  while (g.chunks.length*CFG.CHUNK < g.maxY + 28) genChunk(g, g.chunks.length);
}
function genChunk(g, ci){
  const R = mulberry32(hashInt(g.seed, 100+ci));
  const y0 = ci*CFG.CHUNK, s = stratumOf(y0), SR = CFG.SHAFT_R;
  const c = {ci, y0, segs:[], stones:[], windows:[], anchors:[]};
  const place = (x, y, z) => {
    if (!inside(x, z) || y < 1) return;
    if (ci === 0 && (y < 6 || (x*x + z*z < 6 && y < 12))) return; // keep the start fair
    const k = K(x,y,z);
    if (g.occ.has(k)) return;
    g.occ.set(k, {t:'stone'});
    c.stones.push([x,y,z]);
  };
  // wall ring: style per segment; windows let light in
  const pWin = Math.max(0.15, 0.55 - 0.08*s);
  for (let k=0; k<10; k++){
    const a = (k+0.5)/10*TAU;
    const style = pickStyle(g.blend, R());
    let win = null;
    if (R() < pWin){
      const wy = y0 + 2 + Math.floor(R()*(CFG.CHUNK-4));
      win = {x:Math.round(Math.cos(a)*(SR-0.6)), y:wy, z:Math.round(Math.sin(a)*(SR-0.6)), a, k, ci};
      c.windows.push(win); g.windows.push(win);
    }
    c.segs.push({k, a, style, win});
  }
  // ledges growing out of the walls
  const nLedge = 2 + Math.min(5, s);
  for (let i=0; i<nLedge; i++){
    const a = R()*TAU, span = 0.5 + R()*0.6, y = y0 + 1 + Math.floor(R()*(CFG.CHUNK-2));
    const depth = 1 + (R() < 0.3 + 0.1*s ? 1 : 0);
    for (let x=-6; x<=6; x++) for (let z=-6; z<=6; z++){
      const r = Math.hypot(x, z);
      let da = Math.abs(Math.atan2(z, x) - a) % TAU; if (da > Math.PI) da = TAU - da;
      if (r > SR - depth - 0.6 && da < span/2) place(x, y, z);
    }
  }
  // beams across the shaft, each broken by a gap that narrows with height
  const nBeam = ci === 0 ? 1 : Math.min(5, 1 + s);
  for (let i=0; i<nBeam; i++){
    const y = y0 + 1 + Math.floor(R()*(CFG.CHUNK-2)), alongX = R() < 0.5, off = -3 + Math.floor(R()*7);
    const gap = Math.max(1, 3 - Math.floor(s/2)), at = -4 + Math.floor(R()*(9-gap));
    for (let t=-6; t<=6; t++){
      if (t >= at && t < at+gap) continue;
      if (alongX) place(t, y, off); else place(off, y, t);
    }
  }
  // fallen blocks
  for (let i=0; i<Math.min(5, s); i++){
    const x = -3 + Math.floor(R()*7), z = -3 + Math.floor(R()*7), y = y0 + 1 + Math.floor(R()*(CFG.CHUNK-2));
    place(x,y,z); place(x+1,y,z); place(x,y,z+1); place(x+1,y,z+1);
  }
  // iron rings to tether to
  for (let i=0; i<3; i++){
    const a = R()*TAU, y = y0 + 2 + Math.floor(R()*(CFG.CHUNK-3));
    const x = Math.round(Math.cos(a)*(SR-0.5)), z = Math.round(Math.sin(a)*(SR-0.5));
    if (!inside(x, z) || g.occ.has(K(x,y,z))) continue;
    const an = {id:g.anchors.length, x, y, z, a, used:false};
    g.anchors.push(an); c.anchors.push(an);
  }
  g.chunks.push(c);
}

// ---------- light ----------
export function lit(g, x, y, z){
  for (const l of g.lanterns) if (Math.hypot(l.x-x, l.y-y, l.z-z) <= CFG.LANTERN_R) return true;
  if (!isDay(g.turn)) return false;
  const k = K(x,y,z);
  const c = g.litCache.get(k);
  if (c !== undefined) return c;
  let v = true;
  const clear = CFG.SKY_CLEAR + CFG.SKY_PER_STRATUM*stratumOf(y);
  for (let j=1; j<=clear; j++) if (stoneAt(g, x, y+j, z)){ v = false; break; }
  if (!v){
    const az = sunAz(hourOf(g.turn));
    for (const w of g.windows){
      if (Math.abs(w.y - y) > 1 || Math.cos(w.a - az) < 0.25) continue;
      const dx = x - w.x, dz = z - w.z;
      const inward = -(dx*Math.cos(w.a) + dz*Math.sin(w.a)), lateral = Math.abs(-dx*Math.sin(w.a) + dz*Math.cos(w.a));
      if (inward >= -0.5 && inward <= CFG.WINDOW_REACH + 0.5 && lateral <= 1.2){ v = true; break; }
    }
  }
  g.litCache.set(k, v);
  return v;
}
export const woodCount = g => { let n = 0; for (const x of g.nodes) if (x.alive) n++; return n; };
export const upkeep = g => Math.floor(woodCount(g)/CFG.UPKEEP_CELLS);
export function income(g){
  let n = CFG.ROOT_INCOME;
  for (const t of g.tips){ const p = g.nodes[t.node]; if (lit(g, p.x, p.y, p.z)) n++; }
  return n;
}

// ---------- growth ----------
// Where a tip will grow next, or null if it is stuck. Keeps its heading when it can,
// bends up to 45° toward light, and deflects around obstacles up to about 60°.
export function chooseMove(g, tip){
  const n = g.nodes[tip.node];
  let h = tip.h, sag = false;
  if (tip.tether != null){
    const a = g.anchors[tip.tether];
    h = [Math.sign(a.x-n.x), Math.sign(a.y-n.y), Math.sign(a.z-n.z)];
    if (!h[0] && !h[1] && !h[2]) h = [0,1,0];
  } else if (tip.hrun >= CFG.SAG_RUN && h[1] <= 0){
    sag = true; h = [h[0], -1, h[2]];
  }
  const primaryFree = !blocked(g, n.x+h[0], n.y+h[1], n.z+h[2]);
  const min = primaryFree ? 0.69 : CFG.DEFLECT;
  let best = null, bs = -1e9;
  for (const d of DIRS){
    if (d[1] < 0 && !sag && !(tip.tether != null && h[1] < 0)) continue;
    const x = n.x+d[0], y = n.y+d[1], z = n.z+d[2];
    if (blocked(g, x, y, z)) continue;
    const dot = dotN(d, h);
    if (dot < min) continue;
    const sc = dot + (same(d,h) ? 0.2 : 0) + (lit(g, x, y, z) ? 0.6 : 0) + (d[1] > 0 ? 0.05 : 0);
    if (sc > bs){ bs = sc; best = d; }
  }
  return best ? {d:best, x:n.x+best[0], y:n.y+best[1], z:n.z+best[2], sag} : null;
}

function step(g, tip, m){
  const id = addNode(g, m.x, m.y, m.z, tip.node);
  tip.node = id; tip.stalled = false;
  if (m.d[1] > 0) tip.hrun = 0; else tip.hrun++;
  if (tip.tether == null) tip.h = m.sag ? [m.d[0], 0, m.d[2]] : m.d.slice();
  if (m.sag) ev(g, 'sag', {tip:tip.id});
  if (tip.tether != null){
    const a = g.anchors[tip.tether];
    if (Math.max(Math.abs(a.x-m.x), Math.abs(a.y-m.y), Math.abs(a.z-m.z)) <= 1){
      a.used = true; tip.tether = null; tip.tied = true; tip.h = [0,1,0]; tip.hrun = 0;
      g.sap = Math.min(CFG.SAP_MAX, g.sap + CFG.TETHER_SAP); g.stats.tied++;
      ev(g, 'tied', {tip:tip.id});
    }
  }
}

function bestOpenDir(g, node){
  const n = g.nodes[node];
  const r = Math.hypot(n.x, n.z) || 1, ox = n.x/r, oz = n.z/r;
  let best = null, bs = -1e9;
  DIRS.forEach((d, i) => {
    if (d[1] < 0 || blocked(g, n.x+d[0], n.y+d[1], n.z+d[2])) return;
    const sc = (d[0]*ox + d[2]*oz)*0.6 + d[1]*0.5 + (lit(g, n.x+d[0], n.y+d[1], n.z+d[2]) ? 0.5 : 0) + ((hashInt(g.seed, node, i) % 100)/1000);
    if (sc > bs){ bs = sc; best = d; }
  });
  return best;
}

function ev(g, type, data={}){ g.events.push({type, ...data}); }

// ---------- cards ----------
function fillHand(g){ while (g.hand.length < CFG.HAND) g.hand.push(drawCard(g)); }
function drawCard(g){
  const day = isDay(g.turn), s = stratumOf(g.maxY);
  const w = {water:3, prune:2, root:2.5, bend:3, tether:2, lantern: day ? 1 : 2, moon: day ? 0 : 2.5, shears: 0.5 + 0.4*s};
  let total = 0; for (const k in w) total += w[k];
  let r = g.drawR()*total;
  for (const k in w){ r -= w[k]; if (r < 0) return k; }
  return 'water';
}

// Valid targets for the current selection, for the interface and for validation.
export function targets(g, card, step=0, first=null){
  const c = CARDS[card];
  if (!c) return [];
  const kind = step === 0 ? c.target : c.then;
  if (kind === 'tip') return g.tips.map(t => t.id);
  if (kind === 'wood') return g.nodes.filter(n => n.alive && n.id !== 0).map(n => n.id);
  if (kind === 'bud') return g.nodes.filter(n => n.alive && !tipAt(g, n.id) && g.tips.length < CFG.MAX_TIPS && bestOpenDir(g, n.id)).map(n => n.id);
  if (kind === 'dir'){
    const t = tipById(g, first); if (!t) return [];
    const n = g.nodes[t.node];
    return DIRS.map((d, i) => i).filter(i => DIRS[i][1] >= 0 && !blocked(g, n.x+DIRS[i][0], n.y+DIRS[i][1], n.z+DIRS[i][2]));
  }
  if (kind === 'anchor'){
    const t = tipById(g, first); if (!t) return [];
    const n = g.nodes[t.node];
    return g.anchors.filter(a => !a.used && Math.hypot(a.x-n.x, a.y-n.y, a.z-n.z) <= CFG.TETHER_RANGE).map(a => a.id);
  }
  return [];
}
export function playable(g, i){
  const card = g.hand[i];
  if (g.over || !card) return false;
  const forced = g.hand.indexOf('shears');
  if (forced >= 0 && forced !== i) return false;
  if (card === 'moon') return !isDay(g.turn);
  return targets(g, card).length > 0;
}

function apply(g, card, a){
  const ok = (list, v) => list.includes(v);
  switch (card){
    case 'water': { if (!ok(targets(g,card), a.t)) return false; tipById(g, a.t).boost += CFG.WATER_BOOST; return true; }
    case 'lantern': { if (!ok(targets(g,card), a.t)) return false; const n = g.nodes[tipById(g, a.t).node]; g.lanterns.push({x:n.x, y:n.y+1, z:n.z, until:g.turn + CFG.LANTERN_TURNS}); g.litCache.clear(); return true; }
    case 'moon': { if (isDay(g.turn)) return false; g.sap = Math.min(CFG.SAP_MAX, g.sap + CFG.MOON_SAP); return true; }
    case 'bend': {
      if (!ok(targets(g,card), a.t) || !ok(targets(g,card,1,a.t), a.t2)) return false;
      const t = tipById(g, a.t); t.h = DIRS[a.t2].slice(); t.hrun = 0; t.tether = null; t.stalled = false; return true;
    }
    case 'tether': {
      if (!ok(targets(g,card), a.t) || !ok(targets(g,card,1,a.t), a.t2)) return false;
      const t = tipById(g, a.t); t.tether = a.t2; t.hrun = 0; t.stalled = false; return true;
    }
    case 'root': {
      if (!ok(targets(g,card), a.t)) return false;
      addTip(g, a.t, bestOpenDir(g, a.t)); return true;
    }
    case 'prune': case 'shears': {
      if (!ok(targets(g,card), a.t)) return false;
      const cut = [], stack = [a.t];
      while (stack.length){ const id = stack.pop(); cut.push(id); for (const c of g.nodes[id].children) stack.push(c); }
      const cutSet = new Set(cut);
      for (const id of cut){ const n = g.nodes[id]; n.alive = false; g.occ.delete(K(n.x,n.y,n.z)); }
      const parent = g.nodes[g.nodes[a.t].parent];
      parent.children = parent.children.filter(c => c !== a.t);
      g.tips = g.tips.filter(t => !cutSet.has(t.node));
      if (!tipAt(g, parent.id) && g.tips.length < CFG.MAX_TIPS){ const d = bestOpenDir(g, parent.id); if (d) addTip(g, parent.id, d); }
      g.maxY = 0; for (const n of g.nodes) if (n.alive && n.y > g.maxY) g.maxY = n.y;
      g.sap = Math.min(CFG.SAP_MAX, g.sap + Math.ceil(cut.length*CFG.PRUNE_REFUND));
      g.stats.cut += cut.length; g.litCache.clear();
      ev(g, 'cut', {n:cut.length});
      return true;
    }
  }
  return false;
}

// One move: play card i (with targets t, t2) or discard it, then the turn resolves.
export function play(g, a){
  if (g.over) return false;
  const card = g.hand[a.i];
  if (!card) return false;
  const forced = g.hand.indexOf('shears');
  if (forced >= 0 && forced !== a.i) return false;
  if (a.discard && card === 'shears' && targets(g, 'shears').length) return false;
  g.events = [];
  if (!a.discard && !apply(g, card, a)) return false;
  g.hand.splice(a.i, 1);
  g.log.push(a);
  endTurn(g);
  return true;
}

function scheduleRock(g){
  const s = stratumOf(g.maxY), every = CFG.ROCK_EVERY[Math.min(s, CFG.ROCK_EVERY.length-1)];
  const R = mulberry32(hashInt(g.seed, 500 + g.turn));
  let top = g.tips[0] ? g.nodes[g.tips[0].node] : {x:0, z:0};
  for (const t of g.tips){ const n = g.nodes[t.node]; if (n.y > top.y) top = n; }
  let x = top.x - 2 + Math.floor(R()*5), z = top.z - 2 + Math.floor(R()*5);
  if (!inside(x, z)){ x = Math.round(x*0.6); z = Math.round(z*0.6); }
  g.nextRock = {x, z, turn: g.turn + (g.turn === 0 ? 12 : every)};
}
function dropRock(g){
  const {x, z} = g.nextRock;
  let y = g.maxY + 6;
  while (y > 1 && !blocked(g, x, y-1, z)) y--;
  const cells = [];
  for (const [dx,dz] of [[0,0],[1,0],[0,1],[1,1]]){
    if (!blocked(g, x+dx, y, z+dz)){ g.occ.set(K(x+dx,y,z+dz), {t:'stone'}); cells.push([x+dx,y,z+dz]); }
  }
  if (cells.length){ g.rocks.push({cells, turn:g.turn}); ev(g, 'rock', {x, y, z}); g.litCache.clear(); }
}

function endTurn(g){
  const startY = g.maxY;
  g.litCache.clear();
  g.sap = Math.min(CFG.SAP_MAX, g.sap + income(g));
  // the wood must be kept alive; if the sap runs out, every tip weakens
  const up = upkeep(g);
  if (g.sap >= up) g.sap -= up;
  else { g.sap = 0; for (const t of g.tips) t.hunger++; ev(g, 'weak'); }
  for (const t of g.tips) if (t.stalled) g.sap = Math.max(0, g.sap - CFG.STALL_DRAIN);
  // apical dominance: the highest tips are fed first
  const order = [...g.tips].sort((a, b) => g.nodes[b.node].y - g.nodes[a.node].y);
  for (const t of order){
    let free = t.boost; t.boost = 0;
    let steps = 1 + free;
    while (steps-- > 0){
      const m = chooseMove(g, t);
      if (!m){ if (!t.stalled){ t.stalled = true; g.stats.stalls++; ev(g, 'stall', {tip:t.id}); } break; }
      if (free > 0) free--;
      else if (g.sap >= 1) g.sap -= 1;
      else { if (isDay(g.turn)){ t.hunger++; ev(g, 'starve', {tip:t.id}); } break; }
      step(g, t, m); t.hunger = 0;
    }
  }
  g.lanterns = g.lanterns.filter(l => l.until > g.turn + 1);
  if (g.nextRock && g.nextRock.turn <= g.turn){ dropRock(g); scheduleRock(g); }
  const wasDay = isDay(g.turn);
  g.turn++;
  g.litCache.clear();
  if (wasDay !== isDay(g.turn)) ev(g, isDay(g.turn) ? 'dawn' : 'dusk');
  ensureChunks(g);
  if (stratumOf(g.maxY) > stratumOf(startY)) ev(g, 'stratum', {s: stratumOf(g.maxY)});
  // stuck tips wither after a few turns; the branch stays as dead wood
  for (const t of g.tips){
    t.stalled = !chooseMove(g, t);
    t.stuck = t.stalled ? t.stuck + 1 : 0;
    if (t.stuck === CFG.WITHER_TURNS - 1) ev(g, 'wilting', {tip:t.id});
  }
  for (const t of g.tips) if (t.hunger === CFG.STARVE_TURNS - 1) ev(g, 'hungry', {tip:t.id});
  const dies = t => t.stuck >= CFG.WITHER_TURNS || t.hunger >= CFG.STARVE_TURNS;
  const withered = g.tips.filter(dies);
  if (withered.length){ g.tips = g.tips.filter(t => !dies(t)); for (const t of withered){ g.nodes[t.node].dead = true; ev(g, 'wither', {tip:t.id}); } }
  const growable = g.tips.filter(t => !t.stalled).length;
  if (!growable){
    if (g.warn){ g.over = true; ev(g, 'over'); }
    else { g.warn = true; ev(g, 'stuck'); }
  } else {
    g.warn = false;
    if (growable === 1 && g.tips.length > 1) ev(g, 'last');
  }
  fillHand(g);
}

export const heightM = g => +(g.maxY*CFG.CELL).toFixed(1);
export const peakM = g => +(g.peak*CFG.CELL).toFixed(1);
