// Regressions for the previously flat pickups and bombs hit during a climb.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const output=new URL('../frontend/node_modules/.tmp/impact-test.mjs',import.meta.url);
const modelOutput=new URL('../frontend/node_modules/.tmp/impact-model-test.mjs',import.meta.url);
const source=await fs.readFile(new URL('../frontend/src/lib/flight.ts',import.meta.url),'utf8');
await fs.writeFile(modelOutput,ts.transpileModule(await fs.readFile(new URL('../frontend/src/lib/flight-model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText);
await fs.writeFile(output,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText.replace("'./flight-model'","'./impact-model-test.mjs'"));
try {
  const {integrate,impact,flightPitch}=await import(output.href);
  // Orientation must follow the actual world-space pixel tangent on wide
  // and tall layouts, including the depth-dependent hull placement offset.
  for(const view of [{width:1400,height:700,subWidth:340},{width:390,height:740,subWidth:190}]) {
    for(const target of [100,300,600])for(const velocity of [-10,0,10]) {
      const dt=.0001, dx=200*dt*view.width*.007;
      const dy=velocity*dt*(view.height*.012-view.subWidth*46/(420*target));
      const expected=Math.max(-24,Math.min(32,Math.atan2(dy,dx)*180/Math.PI));
      assert.ok(Math.abs(flightPitch(velocity,200,target,view)-expected)<1e-10);
    }
  }
  const physics={version:2,gravity:18,drag:.45,horizontalSpeed:200};
  for(const target of [100,300,600]) {
    const native={version:3,gravity:1,drag:0,horizontalSpeed:120,verticalScale:target/6000};
    const depth=2000*native.verticalScale;
    for(const velocity of [-110,-78,-40,0,20,60,78]) {
      const nextVelocity=velocity<60?velocity+1:velocity;
      const next=integrate(depth,velocity,1/60,native);
      assert.ok(Math.abs(next.depth-depth-nextVelocity*native.verticalScale)<1e-9);
      assert.equal(next.velocity,nextVelocity);
      const first=integrate(depth,velocity,.1,native);
      const split=integrate(first.depth,first.velocity,.2,native),direct=integrate(depth,velocity,.3,native);
      assert.ok(Math.abs(split.depth-direct.depth)<1e-9);
      assert.equal(split.velocity,direct.velocity);
    }
    assert.equal(impact(depth,-100,'mine',native),-80,'rockets add downward momentum without forcibly reversing a steep climb');
    for(const item of ['bubble','treasure','chest','pearl'])assert.equal(impact(depth,60,item,native),-40,'reference lift is shared by all pickup denominations');
  }
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
  console.log('PASS: recovered tick gravity and shared pickup lift at all depths; rockets preserve momentum; legacy-book compatibility, responsive orientation and frame-rate independence.');
} finally {await fs.unlink(output);await fs.unlink(modelOutput);}
