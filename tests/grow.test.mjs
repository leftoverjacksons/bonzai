// Run with: node tests/grow.test.mjs
// Checks replay determinism, the hand rule, and how three simple players fare under the bonsai rules, for each species.
import { SPECIES, newGame, play, replayGame, targets, canDiscard, shootById, planTurn, score, avgHealth, mulberry32 } from '../grow/sim.js';
import assert from 'node:assert/strict';

const pick = (a, R) => a[Math.floor(R()*a.length)];
function actionFor(g, i, choose){
  const card = g.hand[i];
  if (canDiscard(g, i)) return {i, discard:true};
  const t = choose(card);
  if (t == null) return null;
  return {i, card, ...t};
}
function randomMove(g, R){
  const i = Math.floor(R()*g.hand.length);
  return actionFor(g, i, card => {
    const ts = targets(g, card);
    if (card === 'wire'){ const s = pick(ts, R); return {shoot:s, ring:pick(targets(g, 'wire', 1, s), R)}; }
    if (card === 'pinch') return {shoot:pick(ts, R)};
    return {node:pick(ts, R)};
  });
}
// wastes every card: plays in hand order on the least useful spot
function carelessMove(g, R){
  return actionFor(g, 0, card => {
    if (card === 'pinch') return {shoot:[...g.shoots].sort((a,b) => a.health - b.health)[0].id};
    if (card === 'cut'){ const leaf = g.nodes.filter(n => n.alive && n.id > 2 && !n.children.some(c => g.nodes[c].alive)); return {node:(leaf.length ? leaf : g.nodes.filter(n => n.alive && n.id > 2))[0].id}; }
    if (card === 'root') return {node:targets(g, 'root')[0]};
    const s = targets(g, 'wire')[0]; return {shoot:s, ring:targets(g, 'wire', 1, s)[0]};
  }) || randomMove(g, R);
}
// a gardener's habits, choosing the order: clear trouble first (cut), then wire, then wake buds, pinch last
function carefulMove(g, R){
  const plan = planTurn(g);
  const info = new Map(plan.info.map(i => [i.s.id, i]));
  const trunkSafe = id => g.nodes[id].y > 0.4 && id > 9;
  const order = ['cut', 'wire', 'root', 'pinch'];
  const i = [...g.hand.keys()].sort((a, b) => order.indexOf(g.hand[a]) - order.indexOf(g.hand[b]))[0];
  return actionFor(g, i, card => {
    if (card === 'pinch'){
      const s = [...g.shoots].filter(s => s.wire == null).sort((a,b) => (b.run + (info.get(b.id)?.ext||0)*2) - (a.run + (info.get(a.id)?.ext||0)*2))[0] || g.shoots[0];
      return {shoot:s.id};
    }
    if (card === 'cut'){
      const dead = g.nodes.find(n => n.alive && n.dead && trunkSafe(n.id));
      if (dead) return {node:dead.id};
      const bad = g.shoots.filter(s => (info.get(s.id)?.blockedAhead && !info.get(s.id)?.slide) || s.health < 0.3).sort((a,b) => a.health - b.health)[0];
      if (bad && trunkSafe(bad.node)) return {node:bad.node};
      const crowded = [...plan.info].filter(i => trunkSafe(i.s.node)).sort((a,b) => (b.crowd - b.L) - (a.crowd - a.L))[0];
      return {node: crowded ? crowded.s.node : targets(g, 'cut').slice(-1)[0]};
    }
    if (card === 'root'){
      const ts = targets(g, 'root').map(id => g.nodes[id]).sort((a,b) => (b.y + b.bud[1]) - (a.y + a.bud[1]));
      return {node:ts[0].id};
    }
    let best = null, bs = -1e9;
    for (const sid of targets(g, 'wire')){
      const s = shootById(g, sid), n = g.nodes[s.node];
      for (const rid of targets(g, 'wire', 1, sid)){ const r = g.rings[rid]; const sc = (r.y - n.y) + s.run; if (sc > bs){ bs = sc; best = {shoot:sid, ring:rid}; } }
    }
    return best;
  }) || randomMove(g, R);
}

// the hand rule: three cards, never all the same
{ const g = newGame(42); for (let k=0;k<60;k++){ assert.equal(new Set(g.hand).size > 1 || g.hand.length < 3, true); play(g, carefulMove(g, mulberry32(k))); if (g.over) break; } }

const MAX = 150;
for (const sp of Object.keys(SPECIES)) for (const [name, bot] of [['careless', carelessMove], ['random', randomMove], ['careful', carefulMove]]){
  const rows = [];
  let worst = 0, slides = 0;
  for (let seed=1; seed<=12; seed++){
    const g = newGame(seed, sp), R = mulberry32(seed*31);
    while (!g.over && g.turn < MAX){
      const t = performance.now();
      assert.ok(play(g, bot(g, R)), `${name}: move rejected (seed ${seed}, turn ${g.turn})`);
      slides += g.events.filter(e => e.type === 'slide').length;
      worst = Math.max(worst, performance.now() - t);
    }
    const r = replayGame(seed, g.log, sp);
    assert.equal(r.nodes.length, g.nodes.length); assert.equal(r.peak, g.peak); assert.equal(r.over, g.over);
    rows.push({turns:g.turn, peak:g.peak, health:avgHealth(g), score:score(g), over:g.over});
  }
  const avg = k => (rows.reduce((a, r) => a + r[k], 0)/rows.length);
  console.log(`${sp.padEnd(8)} ${name.padEnd(8)} peak ${avg('peak').toFixed(2)} m · avg health ${(avg('health')*100).toFixed(0)}% · score ${avg('score').toFixed(0)} · turns ${avg('turns').toFixed(0)} · ended ${rows.filter(r => r.over).length}/12 · slides ${slides} · worst move ${worst.toFixed(0)} ms`);
}
console.log('ok');
