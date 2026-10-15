// Regressions for the previously flat pickups and bombs hit during a climb.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const output=new URL('../frontend/node_modules/.tmp/impact-test.mjs',import.meta.url);
const source=await fs.readFile(new URL('../frontend/src/lib/flight.ts',import.meta.url),'utf8');
await fs.writeFile(output,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText);
try {
  const {integrate,impact}=await import(output.href);
  const physics={version:2,gravity:18,drag:.45,horizontalSpeed:200};
  for(const depth of [8,20,60])for(const incoming of [-40,-10,0,20,70]) {
    for(const item of ['bubble','treasure','chest','pearl']) {
      const velocity=impact(depth,incoming,item,18);
      assert.ok(velocity<0,`${item} must reverse even a fast downward impact`);
      const apex=Math.log((40-velocity)/40)/.45;
      const top=integrate(depth,velocity,apex,physics);
      assert.ok((depth-top.depth)*.012>=.04,'pickup bounce must be visible');
      assert.ok(Math.abs(top.velocity)<1e-10);
      assert.ok(integrate(depth,velocity,apex+.25,physics).velocity>0,'gravity starts the dive after the crest');
      const first=integrate(depth,velocity,.4,physics);
      const partitioned=integrate(first.depth,first.velocity,.6,physics),direct=integrate(depth,velocity,1,physics);
      assert.ok(Math.abs(partitioned.depth-direct.depth)<1e-10);
      assert.ok(Math.abs(partitioned.velocity-direct.velocity)<1e-10);
    }
    const bomb=impact(depth,incoming,'mine',18);
    assert.ok(bomb>=18,'bomb immediately dives even when hit while rising');
    assert.ok(integrate(depth,bomb,.5,physics).depth>depth);
  }
  console.log('PASS: every pickup rises, crests and dives; bombs only dive; motion is frame-rate independent.');
} finally {await fs.unlink(output);}
