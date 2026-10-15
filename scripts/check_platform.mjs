// Platform contracts exercised without contacting an RGS or placing live plays.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const source = await fs.readFile(new URL('../frontend/src/lib/platform.ts', import.meta.url), 'utf8');
const {formatAmount, clientLaunch, initialBet, loadReplay, sessionError, GAME_TITLE} = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText).toString('base64'));
for (const [currency, expected] of Object.entries({USD:'$10.00',EUR:'€10.00',CAD:'CA$10.00',MXN:'MX$10.00',JPY:'¥10',XSC:'10.00 SC',XGC:'10.00 GC',XEC:'10.00 SC'})) assert.equal(formatAmount(10000000,currency), expected);
for(const amount of [1,10,50,500,5000,9999,10001]) {
  for(const code of ['USD','EUR','JPY','XSC','XGC']) {
    const numeric = Number(formatAmount(amount,code).replace(/[^\d.-]/g,''));
    assert.equal(numeric,amount/1000000,`${code} must preserve ${amount} micro-units`);
  }
}
assert.equal(formatAmount(5000,'USD'),'$0.005');
assert.equal(formatAmount(-5000,'USD'),'-$0.005');
assert.throws(()=>formatAmount(NaN,'USD'));
assert.equal(new URL(clientLaunch('https://game.invalid/?sessionID=test&rgs_url=https%3A%2F%2Frgs.invalid&device=tablet&lang=zz').url).searchParams.get('rgs_url'),'rgs.invalid');
assert.equal(initialBet({defaultBetLevel:100000,betLevels:[50000,100000,150000]}, {active:true,amount:150000}),150000);
assert.equal(initialBet({defaultBetLevel:100000,betLevels:[50000,100000,150000]},null),100000);
assert.throws(()=>initialBet({defaultBetLevel:100000,betLevels:[100000]}, {active:true}));
const originalFetch=globalThis.fetch;
const requests=[];
let payload, fail=false;
globalThis.fetch=async(url,options)=>{ requests.push({url,options}); return fail ? new Response('',{status:500}) : Response.json(payload); };
try {
  for (const [mode,file] of [['base','demo-books.json'],['depth_300','demo-books-depth_300.json'],['depth_600','demo-books-depth_600.json']]) {
    const books=JSON.parse(await fs.readFile(new URL('../frontend/public/'+file,import.meta.url),'utf8'));
    const cases=[books.find(book=>book.payoutMultiplier===0), books.find(book=>book.payoutMultiplier>0),books.reduce((a,b)=>a.payoutMultiplier>b.payoutMultiplier?a:b)];
    for(const book of cases) {
      payload={payoutMultiplier:book.payoutMultiplier/100,costMultiplier:1,state:book.events};
      const replay=await loadReplay(`https://game.invalid/?replay=true&game=deep_dive&version=3&mode=${mode}&event=${book.id}&rgs_url=rgs.invalid&currency=EUR&amount=5000000&lang=fr`);
      assert.equal(replay.amount,5000000); assert.equal(replay.currency,'EUR'); assert.equal(replay.round.mode,mode);
      assert.equal(replay.round.active,false); assert.equal(replay.round.payout,5000000*book.payoutMultiplier/100);
      assert.deepEqual(replay.round.state,book.events);
      assert.ok(requests.at(-1).url.endsWith(`/bet/replay/deep_dive/3/${mode}/${book.id}`));
    }
  }
  payload.costMultiplier=100;
  const expensive=await loadReplay('https://game.invalid/?game=deep_dive&version=3&mode=base&event=1&rgs_url=https%3A%2F%2Frgs.invalid&currency=XGC&amount=50000&social=true');
  assert.equal(formatAmount(expensive.amount*expensive.costMultiplier,expensive.currency),'5.00 GC');
  for(const amount of ['','NaN','-5','0','1.5']) {
    assert.equal((await loadReplay(`https://game.invalid/?game=deep_dive&version=3&mode=base&event=1&rgs_url=rgs.invalid&amount=${amount}`)).amount,1000000);
  }
  assert.equal((await loadReplay('https://game.invalid/?game=deep_dive&version=3&mode=base&event=1&rgs_url=rgs.invalid&social=true&currency=USD')).currency,'XSC');
  fail=true; await assert.rejects(loadReplay('https://game.invalid/?game=deep_dive&version=3&mode=base&event=1&rgs_url=rgs.invalid'));
  fail=false; payload={}; await assert.rejects(loadReplay('https://game.invalid/?game=deep_dive&version=3&mode=base&event=1&rgs_url=rgs.invalid'));
  await assert.rejects(loadReplay('https://game.invalid/?rgs_url=rgs.invalid'));
  assert.ok(requests.every(request=>!request.url.includes('/wallet/') && !request.options?.method),'replay makes GET requests only');
  const restricted=/\b(bet|bets|betting|stake|money|cash|credit|credits|buy|purchase|pay|paid|pays|wager)\b/i;
  for(const cause of [new Error('Bet amount invalid'),new Error('ERR_IPB'),new Error('ERR_GLE'),new Error('[object Object]')]) assert.doesNotMatch(sessionError(cause),restricted);
  assert.doesNotMatch(GAME_TITLE,/megaways|xways|enhanced|boosted|rtp|gates of|bonanza|olympus|rush|kraken|waylanders/i);
  console.log('PASS: exact currency precision, SC/GC, scheme/tablet normalization, active stake restoration, real replay loss/win/max fixtures in every mode, replay cost/optional parameters/errors, no wallet calls, safe error wording and title.');
} finally { globalThis.fetch=originalFetch; }
