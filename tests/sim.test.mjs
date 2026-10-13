// Run with: node tests/sim.test.mjs
import { newGame, play, replay, targets, playable, CARDS, peakM as heightM, mulberry32 } from '../play/sim.js';
import assert from 'node:assert/strict';

function randomMove(g, R){
  const order = [0,1,2].sort(() => R() - 0.5);
  for (const i of order){
    if (!playable(g, i)) continue;
    const card = g.hand[i], c = CARDS[card];
    if (!c.target) return {i};
    const ts = targets(g, card); if (!ts.length) continue;
    const t = ts[Math.floor(R()*ts.length)];
    if (!c.then) return {i, t};
    const t2s = targets(g, card, 1, t); if (!t2s.length) continue;
    return {i, t, t2: t2s[Math.floor(R()*t2s.length)]};
  }
  const forced = g.hand.indexOf('shears');
  return {i: forced >= 0 ? forced : 0, discard: true};
}
// a simple player: water the highest tip, bend stalled tips upward, never prune
function greedyMove(g, R){
  const top = [...g.tips].sort((a,b) => g.nodes[b.node].y - g.nodes[a.node].y)[0];
  for (let i=0;i<g.hand.length;i++){
    if (!playable(g, i)) continue;
    const card = g.hand[i];
    if (card === 'shears'){ const ts = targets(g, card); return {i, t: ts[ts.length-1]}; }
    if (card === 'moon') return {i};
    if (card === 'water' && top) return {i, t: top.id};
    if (card === 'bend'){
      const st = g.tips.find(t => t.stalled) || top;
      if (st){ const ds = targets(g, card, 1, st.id); const up = ds.find(d => d === 22) ?? ds[0]; if (up != null) return {i, t: st.id, t2: up}; }
    }
    if (card === 'root' && g.tips.length < 4){ const ts = targets(g, card); if (ts.length) return {i, t: ts[Math.floor(R()*ts.length)]}; }
  }
  return randomMove(g, R);
}

for (const [name, bot] of [['random', randomMove], ['greedy', greedyMove]]){
  const heights = [], turns = [];
  for (let s=1; s<=40; s++){
    const g = newGame(s), R = mulberry32(s*99);
    let guard = 0;
    while (!g.over && guard++ < 400){
      const ok = play(g, bot(g, R));
      assert.ok(ok, `move rejected (seed ${s}, turn ${g.turn})`);
    }
    // replay must rebuild the identical game
    const r = replay(s, g.log);
    assert.equal(r.nodes.length, g.nodes.length); assert.equal(r.maxY, g.maxY); assert.equal(r.sap, g.sap); assert.equal(r.over, g.over);
    heights.push(heightM(g)); turns.push(g.turn);
  }
  const avg = a => (a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);
  console.log(`${name}: height avg ${avg(heights)} m (min ${Math.min(...heights)}, max ${Math.max(...heights)}); turns avg ${avg(turns)}; capped runs ${turns.filter(t=>t>=400).length}`);
}
console.log('ok');
