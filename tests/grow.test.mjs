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
    if (card === 'wire'){ const n = pick(ts, R); return {node:n, ring:pick(targets(g, 'wire', 1, n), R)}; }
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
    const n = targets(g, 'wire')[0]; return {node:n, ring:targets(g, 'wire', 1, n)[0]};
  }) || randomMove(g, R);
}
// a gardener's habits: pick the card the tree needs most (cut trouble, tame leggy shoots, wake buds on a thin tree)
function carefulMove(g, R){
  const plan = planTurn(g);
  const info = new Map(plan.info.map(i => [i.s.id, i]));
  const trunkSafe = id => g.nodes[id].y > 0.4 && id > 9;
  // choose the card the tree needs most right now
  const trouble = g.nodes.some(n => n.alive && n.dead && trunkSafe(n.id)) || plan.info.some(i => (i.blockedAhead && !i.slide) || i.s.health < 0.3);
  const leggy = g.shoots.some(s => s.run > 0.8);
  const need = {cut: trouble ? 3 : 0.5, wire: leggy ? 2 : 1, pinch: leggy ? 2.5 : 0.8, root: g.shoots.length < 6 ? 2 : 0.6};
  const i = [...g.hand.keys()].filter(k => !canDiscard(g, k)).sort((a, b) => need[g.hand[b]] - need[g.hand[a]])[0] ?? 0;
  return actionFor(g, i, card => {
    if (card === 'pinch'){
      const s = [...g.shoots].sort((a,b) => (b.run + (info.get(b.id)?.ext||0)*2) - (a.run + (info.get(a.id)?.ext||0)*2))[0] || g.shoots[0];
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
    // tie a few nodes behind a troubled or leggy tip, to the ring that lifts it most
    let best = null, bs = -1e9;
    const ok = new Set(targets(g, 'wire'));
    for (const s of g.shoots){
      let tie = s.node; for (let k=0;k<2 && g.nodes[tie].parent > 2;k++) tie = g.nodes[tie].parent;
      if (!ok.has(tie)) continue;
      const n = g.nodes[tie], it = info.get(s.id), need = (it?.blockedAhead ? 1 : 0) + (it && it.L < 0.4 ? 0.5 : 0) + s.run;
      for (const rid of targets(g, 'wire', 1, tie)){ const r = g.rings[rid]; const sc = need + (r.y - n.y)*0.5 - Math.hypot(r.x-n.x, r.y-n.y, r.z-n.z)*0.2; if (sc > bs){ bs = sc; best = {node:tie, ring:rid}; } }
    }
    if (!best){ const n = [...ok][0]; best = {node:n, ring:targets(g, 'wire', 1, n)[0]}; }
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
