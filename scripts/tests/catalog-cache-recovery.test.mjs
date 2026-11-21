import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const root = new URL('../../', import.meta.url);
const service = fs.readFileSync(new URL('src/contentService.ts', root), 'utf8');
const app = fs.readFileSync(new URL('App.tsx', root), 'utf8');
const payload = (count = 2, updatedAt = '2026-11-15', clientRevision = 'new') => ({items: Array.from({length:count}, (_, id) => ({id})), updatedAt, clientRevision});
function cacheHarness(stored, metadata = {}, local = payload(3, '2026-11-14')) {
  let disk = JSON.stringify(stored);
  const context = vm.createContext({
    memoryBootstrapContent: null, BOOTSTRAP_CACHE_URI: 'cache', cacheMetadata: metadata,
    LOCAL_PAYLOAD: local,
    parsePayloadCooperatively: async value => value,
    readCacheMetadata: async () => {},
    FileSystem: {getInfoAsync: async () => ({exists: true}), readAsStringAsync: async () => disk,
      writeAsStringAsync: async (_, value) => { disk = value; }},
  });
  let code = service.slice(service.indexOf('const readCachedBootstrapPayload ='), service.indexOf('const readCachedLiveDelta ='));
  code = code.replaceAll(': Promise<CatalogPayload | null>', '').replaceAll(': Promise<LoadedContent | null>', '')
    .replace('rawPayload: string, parsed: CatalogPayload', 'rawPayload, parsed').replace('export async function', 'async function');
  vm.runInContext(code + '\nglobalThis.load = loadCachedBootstrapContent; globalThis.save = writeCachedBootstrapPayload; globalThis.restart = () => { memoryBootstrapContent = null; };', context);
  return context;
}
test('complete newer cache survives missing metadata and legitimate catalog shrink', async () => {
  const ctx = cacheHarness({cacheSchema:1, itemCount:2, payload:payload()});
  assert.equal((await ctx.load()).items.length, 2);
});
test('stale sidecar cannot reject a self-contained cache', async () => {
  const ctx = cacheHarness({cacheSchema:1, itemCount:2, payload:payload()}, {bootstrapItemCount:99, bootstrapClientRevision:'old'});
  assert.equal((await ctx.load()).clientRevision, 'new');
});
test('truncated cache rejected', async () => {
  assert.equal(await cacheHarness({cacheSchema:1,itemCount:3,payload:payload()}).load(), null);
});
test('unverified legacy sample rejected', async () => {
  assert.equal(await cacheHarness(payload()).load(), null);
});
test('verified legacy cache retained', async () => {
  assert.equal((await cacheHarness(payload(), {bootstrapItemCount:2,bootstrapClientRevision:'new'}).load()).clientRevision, 'new');
});
test('legacy mismatched revision rejected', async () => {
  assert.equal(await cacheHarness(payload(), {bootstrapItemCount:2,bootstrapClientRevision:'other'}).load(), null);
});
test('older and undated caches do not replace bundled catalog', async () => {
  for (const date of ['2020-01-01','invalid']) {
    assert.equal(await cacheHarness({cacheSchema:1,itemCount:2,payload:payload(2,date)}).load(), null);
  }
});
test('write then cold restart restores payload without sidecar', async () => {
  const ctx = cacheHarness(null);
  await ctx.save(JSON.stringify(payload()), payload());
  ctx.restart();
  assert.equal((await ctx.load()).clientRevision, 'new');
});
test('remote results wait for cache writes', () => {
  assert.match(service, /await writeCachedBootstrapPayload\(rawBootstrapText, parsed\)/);
  assert.match(service, /await writeCachedLiveDelta\(rawText, live\)/);
});
test('apply guard rejects rollback, accepts equal-time revision and newer content', () => {
  const start = app.indexOf('      // A stale mirror/cache');
  const end = app.indexOf('      const incomingRevision', start);
  const guard = new Function('nextContent', 'contentRef', app.slice(start,end) + '\nreturn true;');
  const current = {current:payload()};
  assert.equal(guard(payload(2,'2020-01-01'),current),false);
  assert.equal(guard(payload(2,'invalid'),current),false);
  assert.equal(guard(payload(),current),true);
  assert.equal(guard(payload(2,'2026-11-16'),current),true);
});
