import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import { harness } from './helpers/artwork-harness.mjs';
test('slow artwork retains the original request while a bounded second route starts', () => {
  const h = harness(), urls = ['slow','fast','third'];
  assert.deepEqual([...h.render(urls).sources], ['slow']);
  h.tick(); const raced = h.render(urls);
  assert.deepEqual([...raced.sources], ['slow','fast']);
  raced.finish('fast',true);
  assert.deepEqual([...h.render(urls).sources], ['fast']);
  raced.finish('slow',false);
  assert.deepEqual([...h.render(urls).sources], ['fast']);
});
test('failed routes advance without more than two active images and exhausted sources stop', () => {
  const h = harness(), urls = ['a','b','c']; h.render(urls); h.tick();
  h.render(urls).finish('a',false);
  assert.deepEqual([...h.render(urls).sources], ['b','c']);
  h.render(urls).finish('b',false); h.render(urls).finish('c',false);
  assert.equal(h.render(urls).sources.length, 0);
});
test('late image completion cannot paint an old title into a recycled cell', () => {
  const h = harness(); const old = h.render(['old']); h.render(['new']); old.finish('old',true);
  assert.deepEqual([...h.render(['new']).sources], ['new']);
});
test('cached series detail still enforces the newest playable episode and immutable path', () => {
  const service = fs.readFileSync('src/contentService.ts','utf8');
  const snippet = service.slice(service.indexOf('const detailSatisfiesSummary ='),service.indexOf('export async function loadCatalogItemDetail'));
  const context = { detailMemoryCache: new Map(), asString: v => String(v || '') }; vm.createContext(context);
  vm.runInContext(ts.transpileModule(snippet.replace('export function','function')+'\nglobalThis.getCached = getCachedCatalogItemDetail;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  const summary = {id:'s',type:'series',detailPath:'immutable-A',latestEpisode:{seasonNumber:1,episodeNumber:4}};
  const detail = {...summary,downloads:[{seasonNumber:1,episodeNumber:3,files:[{url:'stream'}]}]};
  context.detailMemoryCache.set('series:s:immutable-A', detail);
  assert.equal(context.getCached(summary), null);
  detail.downloads[0].episodeNumber = 4;
  assert.equal(context.getCached(summary), detail);
  assert.equal(context.getCached({...summary,detailPath:'immutable-B'}), null);
});
