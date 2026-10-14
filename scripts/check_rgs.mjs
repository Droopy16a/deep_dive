// Exercise our adapter through the real pinned SDK; no external server/bets.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'frontend/src/lib/session.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
  .replaceAll('import.meta.env.BASE_URL', "'./'");
const temp = path.join(root, 'frontend/node_modules/.tmp/session-smoke.mjs');
await fs.mkdir(path.dirname(temp), { recursive: true });
await fs.writeFile(temp, output);
const { createSession } = await import(pathToFileURL(temp).href);
globalThis.window = new EventTarget();
const originalInterval = globalThis.setInterval;
globalThis.setInterval = () => 0; // Avoid SDK background balance polling in this test.
const calls = [];
const books = JSON.parse(await fs.readFile(path.join(root, 'frontend/public/demo-books.json'), 'utf8'));
const jurisdiction = { minimumRoundDuration: 0 };
let active = false;
let fail = false;
globalThis.fetch = async (url, options) => {
  if (url === './demo-books.json') return Response.json(books);
  const body = JSON.parse(options.body);
  const endpoint = new URL(url).pathname;
  calls.push({ endpoint, body, url });
  if (fail && endpoint === '/wallet/play') return Response.json({ error: 'ERR_TEST' }, { status: 400 });
  if (endpoint === '/wallet/authenticate') return Response.json({
    balance: { amount: 100_000_000, currency: 'USD' },
    config: { minBet: 1_000_000, maxBet: 5_000_000, stepBet: 1_000_000,
      defaultBetLevel: 1_000_000, betLevels: [1_000_000, 2_000_000, 5_000_000], jurisdiction },
    round: active ? { betID: 1, active: true, mode: 'base', state: books[0].events } : null,
  });
  if (endpoint === '/wallet/play') return Response.json({ balance: { amount: 99_000_000, currency: 'USD' },
    round: { betID: 1, active: true, mode: 'base', state: books[0].events, payoutMultiplier: 2 } });
  if (endpoint === '/wallet/end-round') return Response.json({ balance: { amount: 101_000_000, currency: 'USD' } });
  throw new Error(`Unexpected endpoint: ${endpoint}`);
};
try {
  const url = 'https://example.invalid/game?sessionID=test-only&rgs_url=rgs.example.invalid&lang=en';
  const session = await createSession(url);
  await assert.rejects(session.play(1_000_000), /not authenticated/);
  const auth = await session.authenticate();
  const result = await session.play(auth.config.betLevels[0]);
  assert.equal(result.round.active, true);
  await assert.rejects(session.play(1_000_000), /already active/);
  assert.equal((await session.endRound()).balance.amount, 101_000_000);
  assert.deepEqual(calls.map(c => c.endpoint), ['/wallet/authenticate', '/wallet/play', '/wallet/end-round']);
  assert.deepEqual(calls[1].body, { sessionID: 'test-only', mode: 'base', amount: 1_000_000 });
  assert.equal(calls[0].url, 'https://rgs.example.invalid/wallet/authenticate');
  active = true;
  const resume = await createSession(url);
  assert.equal((await resume.authenticate()).round.active, true);
  await assert.rejects(resume.play(1_000_000), /already active/);
  await resume.endRound();
  active = false;
  fail = true;
  await assert.rejects(session.play(1_000_000));
  fail = false;
  await session.play(1_000_000);
  await session.endRound();
  await assert.rejects(createSession('https://example.invalid/?sessionID=partial'), /both/);
  const demo = await createSession('http://localhost/');
  await demo.authenticate();
  for (let i = 0; i < 5; i++) {
    const played = await demo.play(1_000_000);
    const ended = await demo.endRound();
    assert.equal(ended.balance.amount, played.balance.amount + played.round.payout);
  }
  console.log('PASS: SDK lifecycle, integer amounts, runtime RGS host, double-bet guard, active-round recovery, API rejection, partial URL rejection, demo settlement.');
} finally {
  globalThis.setInterval = originalInterval;
  await fs.unlink(temp);
}
