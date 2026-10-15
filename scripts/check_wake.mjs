import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const source = await fs.readFile(new URL('../frontend/src/lib/wake.ts', import.meta.url), 'utf8');
const output = new URL('../frontend/node_modules/.tmp/wake-test.mjs', import.meta.url);
await fs.writeFile(output, ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText);
try {
  const {buildWake} = await import(output.href);
  const history = [{distance:0,depth:30,pitch:0,time:0},{distance:10,depth:60,pitch:15,time:100},{distance:20,depth:35,pitch:-10,time:200}];
  const view = {width:1200,height:740,subWidth:340,distance:20};
  const first = buildWake(history, view);
  assert.ok(first.path.includes('Q'));
  assert.ok(first.points[1].y > (first.points[0].y+first.points[2].y)/2+40, 'trail retains the previous dive');
  const turned = buildWake([...history.slice(0,-1), {...history.at(-1),pitch:60}], view);
  assert.deepEqual(turned.points.slice(0,2), first.points.slice(0,2), 'old wake must not rotate with current submarine');
  const moved = buildWake(history, {...view,distance:25});
  moved.points.forEach((point,index) => assert.ok(Math.abs(point.x-first.points[index].x+42)<1e-9));
  const half = buildWake(history, {width:600,height:370,subWidth:170,distance:20});
  half.points.forEach((point,index) => {assert.equal(point.x,first.points[index].x/2);assert.equal(point.y,first.points[index].y/2);});
  const deep = buildWake(history,{...view,targetDepth:1000,camera:1});
  const scrolled = buildWake(history,{...view,targetDepth:1000,camera:1.25});
  scrolled.points.forEach((point,index)=>assert.ok(Math.abs(point.y-deep.points[index].y+185)<1e-8));
  assert.equal(buildWake([],view).path,'');
  const many = Array.from({length:1000},(_,index) => ({distance:index/2,depth:30,pitch:0,time:index*10}));
  const bounded = buildWake(many,{...view,distance:499.5});
  assert.ok(bounded.points.length<=128);
  assert.ok(bounded.points.every(point=>point.time>=8590));
  console.log('PASS: wake follows historical curves, stays in world space, scales with viewport and bounds history.');
} finally {await fs.unlink(output);}
