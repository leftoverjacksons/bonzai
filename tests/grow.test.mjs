// Run with: node tests/grow.test.mjs
import { newWorld, growTurn, replayWorld, GCFG } from '../grow/sim.js';
import assert from 'node:assert/strict';
for (const seed of [1, 2, 3]){
  const t0 = performance.now();
  const g = newWorld(seed);
  const rows = [];
  let worst = 0;
  for (let t=1; t<=40; t++){
    const a = performance.now(); const added = growTurn(g); worst = Math.max(worst, performance.now()-a);
    if (t % 5 === 0) rows.push(`t${t}: h=${g.maxY.toFixed(2)}m nodes=${g.nodes.length} +${added.length} tips=${g.nodes.filter(n=>!n.children.length).length} trunkR=${g.nodes[0].r.toFixed(3)} mods=${g.modules.map(m=>m.type[0]).join('')}`);
  }
  console.log(`seed ${seed}: ${(performance.now()-t0).toFixed(0)} ms total, worst turn ${worst.toFixed(0)} ms, points ${g.points.length}`);
  rows.forEach(r => console.log('  ' + r));
  const r = replayWorld(seed, 40);
  assert.equal(r.nodes.length, g.nodes.length); assert.equal(r.maxY, g.maxY);
}
console.log('ok');
