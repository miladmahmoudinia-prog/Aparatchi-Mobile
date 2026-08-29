import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const app = await fs.readFile('App.tsx', 'utf8');

test('open Detail keeps its visible banner/overview and extends cast without replacing it', () => {
  assert.ok(app.includes('const mergeOpenDetailSnapshot = (current: CatalogItem, incoming: CatalogItem): CatalogItem => {'));
  assert.ok(app.includes("const visiblePoster = current.poster || current.posterFallback || '';"));
  assert.ok(app.includes('const visibleBackdrop = current.backdrop || current.backdropFallback || visiblePoster;'));
  assert.ok(app.includes("const visibleOverview = String(current.overview || '').trim();"));
  assert.ok(app.includes('const visiblePeople = Array.isArray(current.people) && current.people.length ? current.people : null;'));
  assert.ok(app.includes('...(visibleOverview ? { overview: current.overview } : {})'));
  assert.ok(app.includes('const mergedPeople = visiblePeople ? [...visiblePeople] : [];'));
  assert.ok(app.includes('...(mergedPeople.length ? { people: mergedPeople } : {})'));
});

test('every Detail replacement path uses the stable visible snapshot', () => {
  assert.ok(app.includes('return mergeOpenDetailSnapshot(current, refreshedSummary);'));
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
