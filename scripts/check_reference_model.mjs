// Compare our independent kernel against the selected pure classes in the
// locally retained public artifact. Nothing imports/executes the application,
// renderer, network client or its bootstrap. The VM has no IO capabilities.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const root=new URL('../',import.meta.url);
const artifact=new URL('analysis/aviamasters-reference/index.js',root);
const source=await fs.readFile(artifact,'utf8');
const start=source.indexOf('const xw=2147483648,ww=1103515245,Sw=12345;class EA');
const end=source.indexOf('const Dw=yw(SA,',start);
assert.ok(start>=0 && end>start,'Reference class boundaries changed; inspect the selected artifact again');
const selected=source.slice(start,end);
const parsed=ts.createSourceFile('selected.js',selected,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
assert.equal(parsed.parseDiagnostics.length,0);
assert.deepEqual(parsed.statements.filter(ts.isClassDeclaration).map(node=>node.name.text),['EA','Ow','At']);
assert.ok(!/\b(import|fetch|window|document|process|require)\b/.test(selected),'The pure reference slice must not acquire application capabilities');
const {Reference}=vm.runInNewContext(`const yh=(o,k,v)=>{o[k]=v;};${selected};({Reference:Ow})`,{}, {timeout:1000});
const output=new URL('frontend/node_modules/.tmp/reference-model-test.mjs',root);
await fs.writeFile(output,ts.transpileModule(await fs.readFile(new URL('frontend/src/lib/flight-model.ts',root),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023},
}).outputText);
try {
  const {FlightModel,advanceVertical,createFlightOrientation}=await import(output.href);
  const classSource=await fs.readFile(new URL('analysis/aviamasters-reference/classes.js',root),'utf8');
  const classAst=ts.createSourceFile('classes.js',classSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const planeClass=classAst.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='Cs');
  const setPos=planeClass?.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(classAst)==='setPos');
  assert.ok(setPos,'Reference plane orientation method changed');
  const referencePlane=vm.runInNewContext(`const s={data:{currentMultiplier:1}};({${setPos.getText(classAst)}})`,{}, {timeout:1000});
  Object.assign(referencePlane,{y:0,x:0,body:{rotation:0,rSpeed:0},rPhase:0});
  const orientation=createFlightOrientation();
  for(let tick=1;tick<=1000;tick++) {
    const velocity=[-110,-40,0,20,60,78][Math.floor((tick-1)/37)%6];
    referencePlane.setPos(referencePlane.y+velocity/6,-20,false,false);
    referencePlane.body.rotation+=referencePlane.body.rSpeed;
    const angle=orientation.advanceTo(tick,()=>velocity);
    assert.ok(Math.abs(angle-referencePlane.body.rotation*180/Math.PI)<1e-9,'Production rotation spring must match the actual reference method');
  }
  const projectedPlane={setPos:referencePlane.setPos,y:0,x:0,body:{rotation:0,rSpeed:0},rPhase:0};
  const projectedOrientation=createFlightOrientation();
  for(let tick=1;tick<=400;tick++) {
    const target=[-1.3,-.7,.2,1.2][Math.floor((tick-1)/43)%4];
    projectedPlane.setPos(projectedPlane.y+Math.tan(target)*20,-20,false,false);
    projectedPlane.body.rotation+=projectedPlane.body.rSpeed;
    const angle=projectedOrientation.advanceTo(tick,()=>0,undefined,()=>target);
    assert.ok(Math.abs(angle-projectedPlane.body.rotation*180/Math.PI)<1e-9,'Mapped ocean geometry must retain the reference rotation response');
  }
  for(const velocity of [-110,-78,-40,-20,0,20,60,78])for(const ticks of [1,4,30,120,200]) {
    const reference=new Reference();reference.seed(0);reference.bonuses=[];
    reference.playerY=-1000000;reference.ySpeed=velocity;
    for(let tick=0;tick<ticks;tick++)reference.update();
    assert.deepEqual(advanceVertical(-1000000,velocity,ticks),{y:reference.playerY,velocity:reference.ySpeed},'Production closed form must match actual reference tick updates');
  }
  const stateHash=model=>{
    const values=[model.value,model.y,model.vx,model.vy,model.shipX,model.distance,Number(model.finished),Number(model.landed)];
    for(const object of model.objects) values.push(object.x,object.y,Number(object.rocket),object.respawns);
    const buffer=Buffer.alloc(values.length*8);
    values.forEach((value,index)=>buffer.writeDoubleLE(value,index*8));
    return buffer;
  };
  const hashes=[];
  let ticks=0,contacts=0,wins=0,losses=0;
  const seeds=[0,1,2,3,42,123,999,2147483647,2147483648,4294967295];
  seeds.push(-1,-2147483648,900719925474);
  for(let seed=4;seed<500;seed++) if(!seeds.includes(seed))seeds.push(seed);
  for(let seed=1000;seed<1200;seed++) seeds.push(seed);
  const compare=(actual,expected,seed)=>{
    for(const [local,original] of [['value','win'],['y','playerY'],['vx','xSpeed'],['vy','ySpeed'],['shipX','shipX'],['distance','distance'],['finished','isFinished'],['landed','landed']]) {
      assert.equal(actual[local],expected[original],`seed ${seed}, tick ${actual.tick}, ${local}`);
    }
    assert.equal(actual.resultMultiplier,expected.getTotalWinMultiplier());
    for(const [index,object] of actual.objects.entries()) {
      const original=expected.bonuses[index];
      for(const [local,key] of [['x','x'],['y','y'],['rocket','isRocket'],['respawns','currentRespawn']]) {
        assert.equal(object[local],original[key],`seed ${seed}, tick ${actual.tick}, object ${index} ${local}`);
      }
    }
  };
  for(const seed of seeds) {
    const reference=new Reference(); reference.seed(seed);
    const model=new FlightModel(seed);
    const digest=createHash('sha256').update(stateHash(model));
    compare(model,reference,seed);
    while(!reference.isFinished) {
      assert.ok(model.tick<100000,'Unexpected unbounded reference round');
      reference.update(); contacts+=model.step().length; ticks++;
      compare(model,reference,seed);
      digest.update(stateHash(model));
    }
    hashes.push([seed,'reference',model.tick,digest.digest('hex')]);
    if(model.landed)wins++; else losses++;
    const dive=new FlightModel(seed,'dive');
    const diveDigest=createHash('sha256').update(stateHash(dive));
    assert.equal(dive.y,-6000); assert.equal(dive.vy,78);
    while(!dive.finished && dive.tick<100000) {dive.step();diveDigest.update(stateHash(dive));}
    assert.ok(dive.finished,'Downward layout must terminate');
    hashes.push([seed,'dive',dive.tick,diveDigest.digest('hex')]);
  }
  const python=process.platform==='win32' ? new URL('.stake/venv/Scripts/python.exe',root) : new URL('.stake/venv/bin/python',root);
  const result=spawnSync(fileURLToPath(python),[fileURLToPath(new URL('scripts/reference_model_hashes.py',root))],{input:JSON.stringify(seeds),encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stderr || String(result.error));
  const mathHashes=JSON.parse(result.stdout);
  assert.equal(mathHashes.length,hashes.length);
  hashes.forEach((expected,index)=>assert.deepEqual(mathHashes[index],expected,`Python/frontend divergence for seed ${expected[0]}, ${expected[1]}`));
  assert.ok(wins && losses && contacts);
  console.log(`PASS: ${seeds.length} seeds, ${ticks} exact ticks, ${contacts} contacts; ${wins} landings / ${losses} misses. Every position, velocity, field respawn, multiplier and braking tick matches the retained reference.`);
} finally { await fs.unlink(output); }
