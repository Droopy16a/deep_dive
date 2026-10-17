// Verify every published depth through frontend parsing and continuous motion.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const outputs=[];
try {
  for(const name of ['books','flight','camera','flight-model']) {
    const output=new URL(`../frontend/node_modules/.tmp/${name}-depth-test.mjs`,import.meta.url);
    const source=await fs.readFile(new URL(`../frontend/src/lib/${name}.ts`,import.meta.url),'utf8');
    await fs.writeFile(output,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText.replace("'./flight'","'./flight-depth-test.mjs'").replace("'./flight-model'","'./flight-model-depth-test.mjs'"));
    outputs.push(output);
  }
  const {readEvents}=await import(outputs[0].href);
  const {positionAtDistance,sampleFlight,flightDuration,integrate,impact}=await import(outputs[1].href);
  const {followCamera,worldY,cameraLimit}=await import(outputs[2].href);
  const {advanceVertical,FlightModel}=await import(outputs[3].href);
  const model=JSON.parse(await fs.readFile(new URL('../frontend/public/math-model.json',import.meta.url),'utf8'));
  assert.deepEqual(model.modes.map(mode=>mode.depth),[100,300,600]);
  let previousChance=1, previousMax=0, totalBooks=0, climbingPickups=0, climbingMines=0;
  for(const mode of model.modes) {
    assert.ok(mode.winProbability<previousChance && mode.maxWin>previousMax);
    previousChance=mode.winProbability;previousMax=mode.maxWin;
    const file=mode.mode==='base'?'demo-books.json':`demo-books-${mode.mode}.json`;
    const books=JSON.parse(await fs.readFile(new URL(`../frontend/public/${file}`,import.meta.url),'utf8'));
    let total=0,weighted=0,winningWeight=0,groundLosses=0,earlyLosses=0;
    const fields=new Set();
    for(const book of books) {
      const events=readEvents(book.events),steps=events.slice(0,-1),last=steps.at(-1);
      assert.equal(events.at(-1).amount,book.payoutMultiplier);
      assert.equal(steps[0].targetDepth,mode.depth);
      assert.equal(steps[0].landingBonus,mode.landingBonus);
      assert.equal(steps[0].physics.verticalScale,1/60,'all difficulties use Easy movement scale');
      assert.equal(steps[0].physics.fieldHeight,mode.depth*60,'difficulty extends the field');
      assert.ok(book.payoutMultiplier===0 || last.item==='ground');
      if(book.payoutMultiplier===0) {
        if(last.item==='ground') {
          groundLosses++;assert.equal(last.depth,100);assert.equal(last.multiplier,0);
          assert.equal(steps.at(-2).item,'mine');assert.equal(steps.at(-2).multiplier,0);
          if(steps[0].physics.version===2)assert.ok((100-steps.at(-2).depth)*mode.depth/100<=12.01);
          assert.ok(steps.slice(0,-2).every(step=>step.multiplier>0));
        } else {
          earlyLosses++;assert.equal(last.item,'mine');assert.ok(last.depth<100);
          assert.ok(steps.slice(0,-1).every(step=>step.multiplier>0));
        }
        let streak=0;for(const step of steps){streak=step.item==='mine'?streak+1:0;assert.ok(streak<=4);}
      } else {
        assert.equal(last.depth,100);
        assert.equal(last.multiplier,steps.at(-2).multiplier*mode.landingBonus);
      }
      const gaps=steps.slice(1).map((step,index)=>({gap:step.distance-steps[index].distance,item:step.item})).filter(step=>step.item!=='ground').map(step=>step.gap);
      assert.ok(Math.min(...gaps)>=8-1e-6 && Math.max(...gaps)/Math.min(...gaps)>1.1);
      const scenery=steps[0].scenery;
      assert.ok(scenery.length>=60);fields.add(JSON.stringify(scenery));
      if(steps[0].physics.version===3) {
        const field=new FlightModel(steps[0].fieldSeed);field.y=-1000000;field.vy=0;
        const expected=new Map();
        const remember=object=>expected.set(`field-${steps[0].fieldSeed}-${object.id}-${object.respawns}`,
          [(field.distance+object.x)/40,(object.y+6000)/60,field.distance/40,
            (field.distance+Math.max(1,Math.ceil(object.x/80))*80)/40]);
        field.objects.forEach(remember);
        while(field.distance/40<=last.distance) {
          const counts=field.objects.map(object=>object.respawns);field.step();
          field.objects.forEach((object,index)=>{if(object.respawns!==counts[index])remember(object);});
        }
        for(const object of scenery.filter(object=>['bubble','treasure','chest','pearl','mine'].includes(object.item))) {
          assert.ok(expected.has(object.id),'functional scenery must come from the native seeded field');
          const actual=[object.distance,object.depth,object.spawnDistance,object.despawnDistance];
          actual.forEach((value,index)=>assert.ok(Math.abs(value-expected.get(object.id)[index])<1e-8,'field positions and lifecycle must match the native generator'));
        }
      }
      for(const object of scenery) {
        if(!['bubble','treasure','chest','pearl','mine'].includes(object.item))continue;
        for(const offset of [-18,0,18]) {
          const at=object.distance+offset;
          const depth=positionAtDistance(steps,at).depth;
          assert.ok(Math.abs(depth-object.depth)>=7.2*100/mode.depth-1e-8,'scenery crosses submarine path');
        }
      }
      for(let i=1;i<steps.length-1;i++) {
        const hit=steps[i], next=steps[i+1], physics=steps[0].physics;
        if(['bubble','treasure','chest','pearl'].includes(hit.item)) {
          assert.ok(hit.velocity<0,'pickups always bounce upward');
          const apex=physics.version===3?-hit.velocity/60:Math.log((physics.gravity/physics.drag-hit.velocity)/(physics.gravity/physics.drag))/physics.drag;
          const top=integrate(hit.depth*mode.depth/100,hit.velocity,apex,physics);
          assert.ok((hit.depth*mode.depth/100-top.depth)*.012>=.04,'bounce is visibly at least 4% of scene height');
          assert.ok(integrate(hit.depth*mode.depth/100,hit.velocity,apex+.2,physics).velocity>0,'gravity brings the submarine back down');
        }
        // A reference rocket adds downward momentum. A steep climb can persist;
        // forcing every mine to reverse velocity was an old, incorrect rule.
        const incoming=integrate(hit.depth*mode.depth/100,hit.velocity,next.time-hit.time,physics);
        if(incoming.velocity<0) {
          if(next.item==='mine')climbingMines++;
          else if(['bubble','treasure','chest','pearl'].includes(next.item))climbingPickups++;
        }
      }
      const duration=flightDuration(steps);assert.ok(last.distance/(duration/1000)<=350+1e-8);let previous=-1,camera=0;
      if(steps[0].physics.version===3)for(const ticks of [0,1,10,20,39]) {
        const at=sampleFlight(steps,(last.touchdownTime+ticks/60)*1000,duration);
        assert.ok(Math.abs(at.distance-last.touchdownDistance-(80*ticks-ticks*(ticks+1))/40)<1e-6,'braking must follow native per-tick distance');
        assert.ok(Math.abs(at.depth-100)<1e-7 && at.grounded,'the hull must remain on the seabed while braking');
      }
      for(let elapsed=0;elapsed<duration;elapsed+=33) {
        const point=sampleFlight(steps,elapsed,duration);
        assert.ok(point.distance>=previous && point.depth>=-1e-8 && point.depth<=100+1e-8);
        if(point.depth===100) assert.ok(point.distance>=(last.touchdownDistance??last.distance)-1e-4);
        camera=followCamera(camera,point.depth,mode.depth,33);
        const screenY=.364+worldY(point.depth,mode.depth)-camera;
        assert.ok(screenY>=.2139 && screenY<=.8441,'vessel stays visible with the vertical camera');
        assert.ok(camera>=0 && camera<=cameraLimit(mode.depth));
        previous=point.distance;
      }
      assert.ok(Math.abs(sampleFlight(steps,duration,duration).depth-last.depth)<1e-9);
      if(last.item==='ground') {
        camera=followCamera(camera,last.depth,mode.depth,33);
        assert.ok(.364+worldY(last.depth,mode.depth)-camera<.80,'landed submarine clears the balance bar');
      }
      total+=book.selectionWeight;weighted+=book.selectionWeight*book.payoutMultiplier;
      if(book.payoutMultiplier>0)winningWeight+=book.selectionWeight;
    }
    assert.ok(groundLosses>0 && earlyLosses===0,'all value-zero books coast to the seabed');
    assert.equal(weighted,Math.round(mode.rtp*total*100));
    assert.equal(winningWeight/total,mode.winProbability);
    assert.equal(Math.max(...books.map(book=>book.payoutMultiplier)),mode.maxWin*100);
    for(const outcome of mode.outcomes) {
      const matches=books.filter(book=>book.payoutMultiplier===outcome.multiplier);
      assert.equal(matches.length,outcome.books);
      assert.equal(matches.reduce((sum,book)=>sum+book.selectionWeight,0),outcome.weight);
    }
    assert.equal(fields.size,books.length);
    const groundFailure=structuredClone(books.find(book=>book.payoutMultiplier===0 && book.events.at(-2).item==='ground').events);
    groundFailure.at(-3).depth=50;
    assert.throws(()=>readEvents(groundFailure),/first zero mine|nearby zero mine|physical trajectory/);
    const moving=books.find(book=>book.payoutMultiplier>0).events.slice(0,-1);
    const physics=moving[0].physics;
    for(let i=1;i<moving.length;i++) {
      const before=moving[i-1],after=moving[i],dt=after.time-before.time;
      const incoming=integrate(before.depth*mode.depth/100,before.velocity,dt,physics);
      assert.ok(Math.abs(incoming.depth-after.depth*mode.depth/100)<1e-6);
      if(after.item!=='ground')assert.ok(Math.abs(impact(incoming.depth,incoming.velocity,after.item,physics)-after.velocity)<1e-6);
      if(physics.version===3 && after.item!=='ground') {
        const native=advanceVertical(before.depth*mode.depth/100/physics.verticalScale-6000,before.velocity,dt*60);
        assert.ok(Math.abs(native.y-(after.depth*mode.depth/100/physics.verticalScale-6000))<1e-6,'book contact must match native tick displacement');
      }
      // Moving a future collectible cannot pull the vessel toward it.
      const middle=(before.distance+after.distance)/2;
      const changed=structuredClone(moving);changed[i].depth+=5;
      assert.deepEqual(positionAtDistance(moving,middle),positionAtDistance(changed,middle));
    }
    const tampered=structuredClone(moving);tampered[1].velocity+=1;
    const tamperedEvents=[...tampered,books.find(book=>book.payoutMultiplier>0).events.at(-1)];
    assert.throws(()=>readEvents(tamperedEvents),/contact impulse/);
    const invalid=structuredClone(books.find(book=>book.payoutMultiplier>0).events);
    invalid.at(-2).landingBonus++;
    assert.throws(()=>readEvents(invalid),/landing bonus/);
    for(const key of ['touchdownTime','touchdownDistance']) {
      const missing=structuredClone(books.find(book=>book.payoutMultiplier>0).events);
      delete missing.at(-2)[key];
      assert.throws(()=>readEvents(missing),/timeline|touchdown|braking/,'missing braking metadata must be rejected');
    }
    const failed=structuredClone(books.find(book=>book.payoutMultiplier===0).events);
    failed.splice(-1,0,{...failed.at(-2),item:'bubble',distance:failed.at(-2).distance+60,multiplier:100});
    failed.at(-1).amount=100;failed.forEach((event,index)=>event.index=index);
    assert.throws(()=>readEvents(failed),/first zero mine/);
    totalBooks+=books.length;
  }
  assert.ok(climbingPickups>0,'routes must include pickup chains during a climb');
  assert.ok(climbingMines>0,'mines must interrupt climbs rather than wait for the crest');
  console.log(`PASS: ${totalBooks} books across all 3 difficulty depths; ${climbingPickups} climbing pickups and ${climbingMines} climb-interrupting mines; exact RTP/odds/bonuses, force-driven motion, irregular gaps and collision-clear props.`);
} finally {for(const output of outputs)await fs.unlink(output);}
