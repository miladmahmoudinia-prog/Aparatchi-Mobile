import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

test('cast is deduplicated by normalized name even when only one copy has tmdb id', () => {
  const helperStart = app.indexOf('const dedupeCatalogPeople =');
  const helperEnd = app.indexOf('const personRoleTitle =', helperStart);
  const helper = app.slice(helperStart, helperEnd);
  assert.ok(helperStart > 0);
  assert.ok(helper.includes('name:${normalizedName}'));
  assert.ok(helper.indexOf('normalizedName') < helper.indexOf('person.tmdbId'));
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
  assert.ok(home.includes('updateCellsBatchingPeriod={16}'));
  assert.ok(home.includes('windowSize={6}'));
  assert.ok(home.includes('removeClippedSubviews={false}'));
});
