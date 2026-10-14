// Run with: node tests/grow.test.mjs
// Checks replay determinism and measures how three simple players fare under the bonsai rules.
import { newGame, play, replayGame, targets, canPass, shootById, planTurn, score, avgHealth, mulberry32 } from '../grow/sim.js';
import assert from 'node:assert/strict';

function randomMove(g, R){
  if (canPass(g)) return {pass:true};
  const card = g.queue[0], ts = targets(g, card);
  const pick = a => a[Math.floor(R()*a.length)];
  if (card === 'wire'){ const s = pick(ts); return {card, shoot:s, ring:pick(targets(g, 'wire', 1, s))}; }
  if (card === 'pinch') return {card, shoot:pick(ts)};
  return {card, node:pick(ts)};
}
// wastes every card: pinches the weakest shoot, cuts the smallest twig
function carelessMove(g, R){
  if (canPass(g)) return {pass:true};
  const card = g.queue[0];
  if (card === 'pinch'){ const s = [...g.shoots].sort((a,b) => a.health - b.health)[0]; return {card, shoot:s.id}; }
  if (card === 'cut'){ const leaf = g.nodes.filter(n => n.alive && n.id > 2 && !n.children.some(c => g.nodes[c].alive)); return {card, node:(leaf.length ? leaf : g.nodes.filter(n => n.alive && n.id > 2))[0].id}; }
  return randomMove(g, R);
}
// a gardener's habits: pinch a running leader, cut a stuck or dying shoot back by one bud, wire long shoots upward,
// clear dead wood, never cut the trunk
function carefulMove(g, R){
  if (canPass(g)) return {pass:true};
  const card = g.queue[0];
  const plan = planTurn(g);
  const info = new Map(plan.info.map(i => [i.s.id, i]));
  const trunkSafe = id => g.nodes[id].y > 0.4 && id > 9;
  if (card === 'pinch'){
    const s = [...g.shoots].filter(s => s.wire == null).sort((a,b) => (b.run + (info.get(b.id)?.ext||0)*2) - (a.run + (info.get(a.id)?.ext||0)*2))[0] || g.shoots[0];
    return {card, shoot:s.id};
  }
  if (card === 'cut'){
    const dead = g.nodes.find(n => n.alive && n.dead && trunkSafe(n.id));
    if (dead) return {card, node:dead.id};
    const bad = g.shoots.filter(s => info.get(s.id)?.blockedAhead || s.health < 0.3).sort((a,b) => a.health - b.health)[0];
    if (bad && trunkSafe(bad.node)) return {card, node:bad.node};
    // otherwise thin the most crowded, shaded shoot
    const crowded = [...plan.info].filter(i => trunkSafe(i.s.node)).sort((a,b) => (b.crowd - b.L) - (a.crowd - a.L))[0];
    if (crowded) return {card, node:crowded.s.node};
    return {card, node:targets(g, 'cut').slice(-1)[0]};
  }
  const ts = targets(g, 'wire');
  let best = null, bs = -1e9;
  for (const sid of ts){
    const s = shootById(g, sid), n = g.nodes[s.node];
    for (const rid of targets(g, 'wire', 1, sid)){ const r = g.rings[rid]; const sc = (r.y - n.y) + s.run; if (sc > bs){ bs = sc; best = {card, shoot:sid, ring:rid}; } }
  }
  return best || randomMove(g, R);
}

const MAX = 150;
for (const [name, bot] of [['careless', carelessMove], ['random', randomMove], ['careful', carefulMove]]){
  const rows = [];
  let worst = 0;
  for (let seed=1; seed<=12; seed++){
    const g = newGame(seed), R = mulberry32(seed*31);
    while (!g.over && g.turn < MAX){
      const t = performance.now();
      assert.ok(play(g, bot(g, R)), `${name}: move rejected (seed ${seed}, turn ${g.turn})`);
      worst = Math.max(worst, performance.now() - t);
    }
    const r = replayGame(seed, g.log);
    assert.equal(r.nodes.length, g.nodes.length); assert.equal(r.peak, g.peak); assert.equal(r.over, g.over);
    rows.push({turns:g.turn, peak:g.peak, health:avgHealth(g), score:score(g), over:g.over, shoots:g.shoots.length});
  }
  const avg = k => (rows.reduce((a, r) => a + r[k], 0)/rows.length);
  console.log(`${name.padEnd(8)} peak ${avg('peak').toFixed(2)} m · avg health ${(avg('health')*100).toFixed(0)}% · score ${avg('score').toFixed(0)} · turns ${avg('turns').toFixed(0)} · ended ${rows.filter(r => r.over).length}/12 · worst move ${worst.toFixed(0)} ms`);
}
console.log('ok');
