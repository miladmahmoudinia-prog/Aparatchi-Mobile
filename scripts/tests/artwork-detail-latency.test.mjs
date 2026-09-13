import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
const app = fs.readFileSync('App.tsx', 'utf8');
const source = app.slice(app.indexOf('const successfulArtworkUrls ='), app.indexOf('const PersonAvatar ='));
function harness() {
  const slots = []; const timers = new Map(); let cursor = 0, seq = 0;
  const effects = [];
  const context = {
    useMemo: (fn, deps) => { const i = cursor++; const old = slots[i]; if (!old || deps.some((v,j) => v !== old.deps[j])) slots[i] = {deps, value: fn()}; return slots[i].value; },
    useState: (initial) => { const i = cursor++; if (!slots[i]) slots[i] = {value: initial}; return [slots[i].value, (fn) => { slots[i].value = fn(slots[i].value); }]; },
    useRef: (initial) => { const i = cursor++; return slots[i] ||= {current: initial}; },
    useEffect: (fn, deps) => { const i = cursor++; const old = slots[i]; if (!old || deps.some((v,j) => v !== old.deps[j])) { old?.cleanup?.(); effects.push(() => { slots[i] = {deps, cleanup: fn()}; }); } },
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, {fn, ms}); return id; },
    clearTimeout: id => timers.delete(id),
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(source+'\nglobalThis.hook = useArtworkSources;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  return {
    render: urls => { cursor = 0; const result = context.hook(urls); effects.splice(0).forEach(fn => fn()); return result; },
    tick: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(t => {assert.equal(t.ms,700); t.fn();}); },
  };
}
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
