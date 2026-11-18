import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const app = await fs.readFile('App.tsx', 'utf8');

test('open Detail keeps its visible banner/overview and extends cast without replacing it', () => {
  const helpers = app.slice(app.indexOf('const personName ='), app.indexOf('const personRoleTitle ='));
  const declaration = (name) => {
    const start = app.indexOf(`const ${name} =`);
    return app.slice(start, app.indexOf(';', start) + 1);
  };
  const merge = app.slice(app.indexOf('const mergeOpenDetailSnapshot ='), app.indexOf('const STARTUP_MIN_VISIBLE_MS'));
  const context = vm.createContext({});
  vm.runInContext(ts.transpileModule(declaration('normalizeComparableText') + declaration('optimizedImageUrl') + helpers + merge + '\nglobalThis.merge = mergeOpenDetailSnapshot;', {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, context);
  const current = {id: 'one', poster: 'old-poster', backdrop: 'old-banner', overview: 'Visible text', people: [{name: 'Actor', role: 'actor'}]};
  const incoming = {id: 'one', poster: 'new-poster', backdrop: 'new-banner', overview: 'New text', people: [{name: 'Actor', role: 'actor', tmdbId: 42}, {name: 'Director', role: 'director'}], downloads: [{id: 'episode-2'}]};
  const before = JSON.stringify([current, incoming]);
  const result = context.merge(current, incoming);
  assert.equal(result.poster, current.poster);
  assert.equal(result.backdrop, current.backdrop);
  assert.equal(result.overview, current.overview);
  assert.equal(result.people.length, 2);
  assert.equal(result.people[0].tmdbId, 42);
  assert.equal(result.downloads, incoming.downloads);
  assert.equal(JSON.stringify([current, incoming]), before);
  const empty = context.merge({id: 'one'}, incoming);
  assert.equal(empty.poster, incoming.poster);
  assert.equal(empty.overview, incoming.overview);
});

test('every Detail replacement path uses the stable visible snapshot', () => {
  assert.ok(!app.includes('setSelectedItem(refreshedSummary)'));
  assert.ok(app.includes('return mergeOpenDetailSnapshot(current, fullItem);'));
  assert.ok(app.includes('return mergeOpenDetailSnapshot(current, currentItem);'));
});

test('background full-index refresh expands a one-episode preview without replacing the visible snapshot', () => {
  const effectStart = app.indexOf('const currentItem = content.items.find(');
  const effectEnd = app.indexOf('}, [content.items, selectedItem]);', effectStart);
  const effect = app.slice(effectStart, effectEnd);
  assert.ok(effect.includes('selectedItem.detailPath === currentItem.detailPath'));
  assert.ok(effect.includes('currentEpisodeCount <= selectedEpisodeCount'));
  assert.ok(effect.includes('return mergeOpenDetailSnapshot(current, currentItem);'));
  assert.ok(!effect.includes('selectedItem.detailLoaded === true'), 'same-path protection must also cover the pre-hydration first paint');
});
