import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
test('App TSX parses after loading changes', () => {
  const result = ts.transpileModule(app, {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}, reportDiagnostics: true});
  assert.deepEqual(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
});
function categoryHarness() {
  const source = app.slice(app.indexOf('const categoryPreviewCache ='), app.indexOf('const CategoriesScreen ='));
  const js = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  const context = vm.createContext({setTimeout, CATEGORY_CARDS: [{filter:'strict'}, {filter:'normal'}], STRICT_DYNAMIC_CATEGORY_FILTERS: new Set(['strict']), SERVER_CATEGORY_FILTERS: new Set(['strict','normal']), hasFastCategoryArtwork: i => !!i.poster, fastCatalogFilterMatch: (i,f) => (i.matches || []).includes(f), categoryPreviewScore: i => i.score || 0});
  return vm.runInContext(js + '\nbuildCategoryPreviewItems', context);
}
test('category preview delivers early result, scans beyond first 1200, caches complete result', async () => {
  const build = categoryHarness();
  const catalog = Array.from({length:1201}, (_,id) => ({id}));
  catalog[0] = {id:0, poster:'a', categoryKeys:['normal']};
  catalog[1200] = {id:1200, poster:'b', matches:['strict']};
  const partial = [];
  const result = await build(catalog, () => false, r => partial.push(r));
  assert.equal(partial.length, 1);
  assert.equal(partial[0].get('normal').id, 0);
  assert.equal(result.get('strict').id, 1200);
  assert.equal(await build(catalog, () => false), result);
});
test('strict category cannot be populated by an obsolete server tag during backfill', async () => {
  const build = categoryHarness();
  const result = await build([{poster:'a',categoryKeys:['strict']}], () => false);
  assert.equal(result.has('strict'), false);
});
test('cancelled category scan does not publish or cache incomplete result', async () => {
  const build = categoryHarness();
  const catalog = [{poster:'a',categoryKeys:['normal']}];
  assert.equal(await build(catalog, () => true), null);
  assert.equal((await build(catalog, () => false)).has('normal'), true);
});
test('episode artwork mounts a title fallback underneath the pending exact frame', () => {
  const source = app.slice(app.indexOf('function ExactEpisodeArtwork('), app.indexOf('function SeriesEpisodeShowcase('));
  assert.ok(source.indexOf('<CatalogArtwork') < source.indexOf('{exactArtwork ?'));
  assert.match(source, /fallback=\{item\.backdropFallback \|\| item\.posterFallback\}/);
  assert.match(source, /onError=\{\(\) => setFailure/);
});
test('episode showcase bounds initial mounting and offers more without changing the playback groups', () => {
  const source = app.slice(app.indexOf('function SeriesEpisodeShowcase('), app.indexOf('function DownloadOptionsModal('));
  assert.match(source, /visibleGroups\.slice\(0, visibleCount\)/);
  assert.match(source, /count: visibleCount \+ 12/);
  assert.match(source, /\$\{item.id\}:\$\{visibleSeason\}/);
  assert.match(source, /onPlay\(group\)/);
});
