// Cross-check every Python-generated book through the frontend contract and motion.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = path.join(root, 'frontend/node_modules/.tmp');
await fs.mkdir(temp, { recursive: true });
const outputs = [];
try {
  for (const name of ['books', 'flight']) {
    const source = await fs.readFile(path.join(root, `frontend/src/lib/${name}.ts`), 'utf8');
    const output = path.join(temp, `${name}-routes-test.mjs`);
    await fs.writeFile(output, ts.transpileModule(source, { compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023} }).outputText);
    outputs.push(output);
  }
  const { readEvents } = await import(pathToFileURL(outputs[0]));
  const { flightPosition } = await import(pathToFileURL(outputs[1]));
  const books = JSON.parse(await fs.readFile(path.join(root, 'frontend/public/demo-books.json'), 'utf8'));
  let zeroCount = 0;
  const items = new Set();
  const fieldSignatures = new Set();
  for (const book of books) {
    const events = readEvents(book.events);
    assert.equal(events.at(-1).amount, book.payoutMultiplier);
    const steps = events.filter(event => event.type === 'diveStep');
    const scenery = steps[0].scenery;
    assert.ok(scenery.length >= 60);
    assert.equal(new Set(scenery.map(object => object.id)).size, scenery.length);
    fieldSignatures.add(JSON.stringify(scenery));
    for (const object of scenery) {
      if (!['bubble','treasure','chest','pearl','mine'].includes(object.item)) continue;
      for (const offset of [-18,-15,-12,-9,-6,-3,0,3,6,9,12,15,18]) {
        const at = object.distance + offset;
        let depth = at < 0 ? steps[0].depth : steps.at(-1).depth;
        for (let i = 1; i < steps.length && at >= 0; i++) {
          if (at <= steps[i].distance) {
            const before = steps[i-1];
            const t = (at - before.distance) / (steps[i].distance - before.distance);
            depth = flightPosition(before, steps[i], t, ['bubble','treasure','chest','pearl'].includes(before.item), before.item === 'mine').depth;
            break;
          }
        }
        assert.ok(Math.abs(depth - object.depth) >= 20 - 1e-9, 'scenery overlaps the swept submarine path');
      }
    }
    assert.equal(steps.at(-1).depth, 100);
    for (let i = 1; i < steps.length; i++) {
      const before = steps[i - 1], step = steps[i];
      assert.ok(step.distance - before.distance >= 52, 'encounters too close horizontally');
      const bounce = ['bubble', 'treasure', 'chest', 'pearl'].includes(before.item);
      const mineDive = before.item === 'mine';
      const end = flightPosition(before, step, 1, bounce, mineDive);
      assert.ok(Math.abs(end.depth - step.depth) < 1e-9);
      assert.equal(end.distance, step.distance);
      if (bounce) assert.ok(flightPosition(before, step, .5, true).depth < (before.depth + step.depth) / 2);
      if (mineDive) assert.ok(flightPosition(before, step, .5, false, true).depth > (before.depth + step.depth) / 2, 'mine must bounce downward');
      for (const t of [.1, .3, .5, .7, .9]) assert.ok(flightPosition(before, step, t, bounce, mineDive).depth < 100, 'premature ground contact');
      items.add(step.item);
    }
    if (book.payoutMultiplier === 0) {
      zeroCount++;
      assert.ok(steps.some(step => step.multiplier >= 1000), 'losing route must have a rewarding opening');
      assert.ok(steps.filter(step => step.item === 'mine').length >= 8);
    }
  }
  assert.equal(zeroCount, 60);
  assert.equal(fieldSignatures.size, books.length, 'scenery must vary between books');
  assert.equal(books.reduce((sum, book) => sum + book.payoutMultiplier, 0), 9600);
  for (const name of ['bubble', 'treasure', 'chest', 'pearl', 'mine', 'wreck', 'ground']) assert.ok(items.has(name));
  const invalid = structuredClone(books[0].events); invalid[2].multiplier++;
  assert.throws(() => readEvents(invalid), /mismatch/);
  const premature = structuredClone(books[0].events); premature[2].depth = 100;
  assert.throws(() => readEvents(premature), /ground contact/);
  console.log('PASS: 100 exact routes, wider encounter spacing, 100 unique scenery fields, swept-path collision clearance, all mechanics, ground finishes and unchanged 96% weighted return.');
} finally { for (const output of outputs) await fs.unlink(output); }
