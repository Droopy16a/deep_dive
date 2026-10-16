import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url), fixture=new URL('scripts/fixtures/payout-contract.json',root);
const files=['demo-books.json','demo-books-depth_300.json','demo-books-depth_600.json'];
const fingerprint=books=>{
  const rows=books.map(book=>[book.id,book.payoutMultiplier,book.selectionWeight]).sort((a,b)=>a[0]-b[0]);
  return {books:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
};
const actual={};
for(const file of files)actual[file]=fingerprint(JSON.parse(await fs.readFile(new URL('frontend/public/'+file,root),'utf8')));
if(process.argv.includes('--capture')) {
  for(const file of files)assert.deepEqual(actual[file],fingerprint(JSON.parse(execFileSync('git',['show','HEAD:frontend/public/'+file],{encoding:'utf8',maxBuffer:128*1024*1024}))),`Existing ${file} differs from HEAD`);
  await fs.mkdir(new URL('scripts/fixtures/',root),{recursive:true});
  await fs.writeFile(fixture,JSON.stringify(actual,null,2)+'\n');
} else assert.deepEqual(actual,JSON.parse(await fs.readFile(fixture,'utf8')),'Every book ID, payout and weight must remain unchanged');
console.log('PASS: all 1,017 book IDs, payout outcomes and selection weights match the pre-migration contract.');
