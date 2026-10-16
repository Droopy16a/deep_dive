// Bounded, resumable native-field search. It never changes the payout table.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const root=new URL('../',import.meta.url);
const source=await fs.readFile(new URL('frontend/src/lib/flight-model.ts',root),'utf8');
const digest=createHash('sha256').update(source).digest('hex');
const output=new URL('frontend/node_modules/.tmp/field-seed-search.mjs',root);
await fs.writeFile(output,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText);
const {FlightModel}=await import(output.href);
const books=JSON.parse(await fs.readFile(new URL('frontend/public/demo-books.json',root),'utf8'));
const targets=[...new Set(books.map(book=>book.payoutMultiplier))].sort((a,b)=>a-b);
const launchVelocity=Number(process.argv[3]??78);
if(!Number.isSafeInteger(launchVelocity)||launchVelocity<0||launchVelocity>110)throw new Error('Choose a bounded downward launch velocity');
const suffix=launchVelocity===78?'':`-v${launchVelocity}`;
const destination=new URL(`analysis/aviamasters-reference/seed-search${suffix}.json`,root);
let report={modelDigest:digest,layout:'dive',launchVelocity,nextSeed:0,targets,matches:Object.fromEntries(targets.map(value=>[value,[]])),minimumPositive:null,maximumTicks:0};
try {
  const previous=JSON.parse(await fs.readFile(destination,'utf8'));
  if(previous.modelDigest!==digest || (previous.launchVelocity??78)!==launchVelocity || JSON.stringify(previous.targets)!==JSON.stringify(targets))throw new Error('Saved search belongs to another model or payout table');
  report=previous;
} catch(error) {if(error.code!=='ENOENT')throw error;}
const count=Number(process.argv[2]??100000);
if(!Number.isSafeInteger(count)||count<1||count>10000000)throw new Error('Choose a bounded search count');
const end=report.nextSeed+count;
async function save() {
  const temporary=new URL(`analysis/aviamasters-reference/seed-search${suffix}.tmp`,root);
  await fs.writeFile(temporary,JSON.stringify(report,null,2)+'\n');
  await fs.rename(temporary,destination);
}
try {
  for(let seed=report.nextSeed;seed<end;seed++) {
    const model=new FlightModel(seed,'dive');
    model.vy=launchVelocity;
    while(!model.finished && model.tick<100000)model.step();
    if(!model.finished)throw new Error(`Unbounded flight seed ${seed}`);
    // Match the reference's final bet rounding, expressed in hundredths.
    const multiplier=model.resultMultiplier;
    const payout=multiplier>=.95?Math.ceil(multiplier*100-.0001):Math.floor(multiplier*100+.0001);
    if(report.matches[payout] && report.matches[payout].length<(payout===0?50:3))report.matches[payout].push(seed);
    if(payout>0)report.minimumPositive=Math.min(report.minimumPositive??Infinity,payout);
    report.maximumTicks=Math.max(report.maximumTicks,model.tick);
    report.nextSeed=seed+1;
    if(report.nextSeed%50000===0) {
      await save();
      console.log(`Scanned ${report.nextSeed} seeds; matched ${targets.filter(value=>report.matches[value].length).length}/${targets.length} required payouts; minimum positive ${report.minimumPositive/100}x.`);
    }
  }
  await save();
  console.log(JSON.stringify({scanned:report.nextSeed,missing:targets.filter(value=>!report.matches[value].length),minimumPositive:report.minimumPositive,maximumTicks:report.maximumTicks}));
} finally {await fs.unlink(output);}
