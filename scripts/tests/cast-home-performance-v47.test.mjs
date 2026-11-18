import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const app = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

test('cast is deduplicated by normalized name even when only one copy has tmdb id', () => {
  const helperStart = app.indexOf('const personName =');
  const helperEnd = app.indexOf('const personRoleTitle =', helperStart);
  const helper = app.slice(helperStart, helperEnd);
  const normalizeStart = app.indexOf('const normalizeComparableText =');
  const normalizeEnd = app.indexOf(';', normalizeStart) + 1;
  const imageStart = app.indexOf('const optimizedImageUrl =');
  const imageEnd = app.indexOf(';', imageStart) + 1;
  assert.ok(helperStart > 0 && normalizeStart > 0 && imageStart > 0);
  const context = vm.createContext({});
  vm.runInContext(ts.transpileModule(
    app.slice(normalizeStart, normalizeEnd) + app.slice(imageStart, imageEnd) + helper +
    '\nglobalThis.dedupe = dedupeCatalogPeople;',
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText, context);
  for (const reverse of [false, true]) {
    const people = [
      { name: 'Example Actor', nameFa: 'بازيگر', role: 'actor' },
      { name: ' example  actor ', nameFa: 'بازیگر', role: 'actor', tmdbId: 42, image: 'https://example.test/person.jpg' },
    ];
    const before = JSON.stringify(people);
    const result = context.dedupe(reverse ? [...people].reverse() : people);
    assert.equal(result.length, 1);
    assert.equal(result[0].tmdbId, 42);
    assert.equal(result[0].image, people[1].image);
    assert.equal(JSON.stringify(people), before);
  }
  assert.equal(context.dedupe([
    { name: 'First Actor', role: 'actor' },
    { name: 'Second Actor', role: 'actor' },
  ]).length, 2);
  assert.ok(app.includes('dedupeCatalogPeople(item.people || []).sort'));
  assert.ok(app.includes('...(current.people || [])'));
  assert.ok(app.includes('...(incoming.people || [])'));
});

test('opening detail never reparses the full catalog as a recovery step', () => {
  const effectStart = app.indexOf('const summary = selectedItem;');
  const effectEnd = app.indexOf('downloadsRef.current = downloads;', effectStart);
  const effect = app.slice(effectStart, effectEnd);
  assert.ok(!effect.includes('loadContent(false, true)'));
  assert.ok(effect.includes('setTimeout(resolve, 350)'));
});

test('home mounts through stars in the first batch and avoids clipped nested rows', () => {
  const homeStart = app.indexOf('const HomeScreen =');
  const homeEnd = app.indexOf('type CategoryCard', homeStart);
  const home = app.slice(homeStart, homeEnd);
  assert.ok(home.includes('initialNumToRender={4}'));
  const batchDelay = Number(home.match(/updateCellsBatchingPeriod=\{(\d+)\}/)?.[1]);
  const windowSize = Number(home.match(/windowSize=\{(\d+)\}/)?.[1]);
  assert.ok(batchDelay > 0 && batchDelay <= 50);
  assert.ok(windowSize >= 3 && windowSize <= 6);
  assert.ok(home.includes('removeClippedSubviews={false}'));
});
