import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const output = new URL('../frontend/node_modules/.tmp/playback-test.mjs', import.meta.url);
const source = await fs.readFile(new URL('../frontend/src/lib/playback.ts', import.meta.url),'utf8');
await fs.writeFile(output, ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText);
try {
  const {createPlaybackClock} = await import(output.href);
  for(const [speed,rate] of [.5,1,4,10].entries())assert.equal(createPlaybackClock(100000,speed,true).advance(1000,speed).end,1000*rate);
  const native=createPlaybackClock(100000,1,true);
  assert.equal(native.advance(1000,1).end,1000);
  const change=native.advance(16,3);
  assert.equal(change.start,1000);assert.equal(change.at(0),1000);assert.equal(change.end,1160);
  const rates = [0,1,2,3].map(speed => createPlaybackClock(10000,speed).advance(1000,speed).end/1000);
  assert.ok(rates[0]<1/1.5 && rates[1]<1 && rates[3]>1/.38);
  assert.equal(rates[2],1/.65);
  const steady = createPlaybackClock(10000,1);
  const start = steady.advance(1000,1).end;
  assert.ok(Math.abs(start - 1000/1.35)<1e-8);
  const faster = steady.advance(16,3);
  assert.equal(faster.start,start);
  assert.ok(faster.end>start+16/1.35 && faster.end<start+16/.24,'speed blends instead of jumping');
  assert.equal(faster.at(0),start);
  assert.equal(faster.at(16),faster.end);
  const slower = steady.advance(16,0);
  assert.equal(slower.start,faster.end);
  assert.ok(slower.end>slower.start);
  const fine = createPlaybackClock(100000,1), coarse = createPlaybackClock(100000,1);
  let value;
  for(let i=0;i<60;i++) value=fine.advance(16,3).end;
  assert.ok(Math.abs(value-coarse.advance(960,3).end)<1e-8,'blend must not depend on frame rate');
  const mixed = createPlaybackClock(10000,0);
  let previous=0, contacts=0;
  for(let tick=0;tick<2000;tick++) {
    const frame=mixed.advance(16,[0,3,1,2][Math.floor(tick/20)%4]);
    assert.equal(frame.start,previous);
    assert.ok(frame.end>=previous && frame.end<=10000);
    while(contacts<100 && (contacts+1)*100<=frame.end) contacts++;
    previous=frame.end;
  }
  assert.equal(previous,10000); assert.equal(contacts,100);
  console.log('PASS: live speed changes preserve progress, blend smoothly, retain all contacts and settle at the exact endpoint.');
} finally {await fs.unlink(output);}
