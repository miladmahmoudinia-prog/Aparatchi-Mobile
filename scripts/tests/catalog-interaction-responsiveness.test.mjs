import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const app = fs.readFileSync('App.tsx', 'utf8');
const start = app.indexOf('const catalogItemsForFilter = async');
const end = app.indexOf('\nconst collectionMembersFor', start);
const source = stripTypeScriptTypes(app.slice(start, end));

const createFilter = () => {
  let clock = 0;
  let yields = 0;
  const context = {
    catalogFilterCache: new WeakMap(),
    fastCatalogFilterMatch: (item, filter) => item.type === filter,
    sortForCatalogFilter: (items) => items,
    Date: { now: () => ++clock },
    setTimeout: (callback) => { yields += 1; queueMicrotask(callback); },
  };
  vm.runInNewContext(`${source}\nglobalThis.filterCatalog = catalogItemsForFilter;`, context);
  return { context, yields: () => yields };
};

test('category filtering yields, preserves order, and reuses cached results', async () => {
  const { context, yields } = createFilter();
  const catalog = Array.from({ length: 120 }, (_, index) => ({ type: index % 2 ? 'series' : 'movie', index }));
  const result = await context.filterCatalog(catalog, 'movie', () => false);
  assert.deepEqual(Array.from(result, (item) => item.index), catalog.filter((item) => item.type === 'movie').map((item) => item.index));
  assert.ok(yields() > 0);
  const yieldCount = yields();
  assert.equal(await context.filterCatalog(catalog, 'movie', () => false), result);
  assert.equal(yields(), yieldCount);
});

test('cancelled filtering does not publish or cache incomplete results', async () => {
  const { context } = createFilter();
  const catalog = Array.from({ length: 120 }, () => ({ type: 'movie' }));
  let checks = 0;
  assert.equal(await context.filterCatalog(catalog, 'movie', () => ++checks > 30), null);
  assert.equal(context.catalogFilterCache.get(catalog)?.has('movie'), false);
});

test('categories are not mounted in the background before the user visits them', () => {
  assert.ok(app.includes("if (activeTab !== 'categories' || categoriesMounted) return undefined;"));
  assert.ok(app.includes('requestAnimationFrame(() => setCategoriesMounted(true))'));
  assert.ok(app.includes('{categoriesMounted ? ('));
});

test('detail opens before loading a preview, and late previews cannot replace another selection', () => {
  const start = app.indexOf('const showDetail = useCallback');
  const end = app.indexOf('const openRootDetail', start);
  const showDetail = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(showDetail.indexOf('setSelectedItem(nextItem)') < showDetail.indexOf('requestAnimationFrame'));
  assert.ok(showDetail.indexOf('loadCatalogItemDetail(nextItem)') < showDetail.indexOf('requestAnimationFrame'));
  assert.ok(showDetail.includes('current === nextItem ? getCatalogItemPreview(current) : current'));
});

test('library membership checks avoid repeatedly scanning the complete catalog', () => {
  const start = app.indexOf('function FavoritesScreen(');
  const end = app.indexOf('function DownloadsScreen(', start);
  const library = app.slice(start, end);
  assert.ok(library.includes('new Set(favorites)'));
  assert.ok(library.includes('new Set(catalog.map((item) => item.id))'));
  assert.ok(!library.includes('catalog.some((item) => item.id === record.itemId)'));
});

test('category artwork selection yields and retains highest-scored and fallback matches', async () => {
  const start = app.indexOf('const buildCategoryPreviewItems = async');
  const end = app.indexOf('\nconst CategoriesScreen', start);
  assert.ok(start >= 0 && end > start);
  const code = stripTypeScriptTypes(app.slice(start, end));
  let clock = 0;
  let yields = 0;
  const context = {
    CATEGORY_CARDS: [{ filter: 'movie' }, { filter: 'series' }],
    STRICT_DYNAMIC_CATEGORY_FILTERS: new Set(),
    SERVER_CATEGORY_FILTERS: new Set(['movie', 'series']),
    hasFastCategoryArtwork: (item) => item.artwork,
    fastCatalogFilterMatch: (item, filter) => item.categoryKeys.includes(filter),
    categoryPreviewScore: (item) => item.score,
    Date: { now: () => ++clock },
    setTimeout: (callback) => { yields += 1; queueMicrotask(callback); },
  };
  vm.runInNewContext(`${code}\nglobalThis.buildPreviews = buildCategoryPreviewItems;`, context);
  const catalog = Array.from({ length: 1201 }, (_, index) => ({
    artwork: true,
    categoryKeys: [index === 1200 ? 'series' : 'movie'],
    score: index,
  }));
  const result = await context.buildPreviews(catalog, () => false);
  assert.equal(result.get('movie'), catalog[1199]);
  assert.equal(result.get('series'), catalog[1200]);
  assert.ok(yields > 0);
  let checks = 0;
  assert.equal(await context.buildPreviews(catalog, () => ++checks > 10), null);
});
