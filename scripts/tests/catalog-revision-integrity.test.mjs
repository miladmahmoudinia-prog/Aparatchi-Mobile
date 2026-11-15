import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = fs.readFileSync('src/contentService.ts', 'utf8');
const start = source.indexOf('const manifestMatchesCachedContent =');
const end = source.indexOf('const writeCachedContent', start);
const context = { cacheMetadata: { manifestRevision: 'new' } };
vm.createContext(context);
vm.runInContext(source.slice(start, end).replace(': RemoteCatalogManifest', '').replace(': CatalogPayload', '') + '\nglobalThis.matches = manifestMatchesCachedContent;', context);
test('metadata cannot bless a stale payload with the same catalog date', () => {
  assert.equal(context.matches({clientRevision:'new'}, {clientRevision:'old',items:[{}]}), false);
});
test('matching payload revision and count are accepted', () => {
  assert.equal(context.matches({clientRevision:'new',clientItemCount:1}, {clientRevision:'new',items:[{}]}), true);
});
test('truncated matching-revision payload is rejected', () => {
  assert.equal(context.matches({clientRevision:'new',clientItemCount:2}, {clientRevision:'new',items:[{}]}), false);
});
test('index response matching checks revision even when updatedAt is unchanged', () => {
  const start = source.indexOf('        const matchesManifest =', source.indexOf('export async function loadContent('));
  const end = source.indexOf('        const candidateResult:', start);
  const evaluate = (revision) => vm.runInNewContext(source.slice(start, end) + '\nmatchesManifest;', {
    manifest:{clientRevision:'new',clientItemCount:1,catalogUpdatedAt:'same'},
    nextParsed:{clientRevision:revision,items:[{}],updatedAt:'same'}
  });
  assert.equal(evaluate('old'), false);
  assert.equal(evaluate('new'), true);
});
