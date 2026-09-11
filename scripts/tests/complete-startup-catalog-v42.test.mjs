import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');
const refresh = fs.readFileSync('scripts/refresh-bundled-bootstrap.mjs', 'utf8');
const bootstrap = JSON.parse(fs.readFileSync('src/catalogStartup.json', 'utf8'));

test('bundled startup navigation is compact, unique and shelf-complete', () => {
  assert.ok(bootstrap.items.length >= 100 && bootstrap.items.length <= 240);
  assert.equal(new Set(bootstrap.items.map((item) => `${item.type}:${item.id}`)).size, bootstrap.items.length);
  assert.ok(bootstrap.items.some((item) => item.categoryKeys?.includes('iranian-series')));
  assert.ok(fs.statSync('src/catalogStartup.json').size < 900_000);
});

test('release refresh accepts only manifest-declared complete title counts', () => {
  assert.ok(refresh.includes('bootstrapItemCount !== clientItemCount'));
  assert.ok(refresh.includes('value.items.length !== Number(manifest.bootstrapItemCount)'));
  assert.ok(refresh.includes('MAX_STARTUP_BYTES = 900_000'));
});

test('runtime rejects truncated remote and legacy sampled caches', () => {
  assert.ok(service.includes('manifest.clientItemCount !== manifest.bootstrapItemCount'));
  assert.ok(service.includes('parsed.items.length !== manifest.bootstrapItemCount'));
  assert.ok(service.includes('cached.items.length < LOCAL_PAYLOAD.items.length'));
  assert.ok(service.includes('declaredItemCount !== itemOrder.length'));
  assert.ok(service.includes('if (!item) return null;'));
});

test('startup, resume and manual refresh use live delta before complete-bootstrap fallback', () => {
  const start = app.indexOf('const reloadContent = async');
  const end = app.indexOf('useEffect(() => {', start);
  const reload = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(reload.includes('await loadLiveContent(contentRef.current)'));
  assert.ok(reload.indexOf('await loadLiveContent(contentRef.current)') < reload.indexOf('await loadBootstrapContent()'));
  assert.ok(!reload.includes('loadContent('));
});

test('home keeps legitimate cross-shelf and free/operator editions', () => {
  const start = app.indexOf('const buildHomeCatalogRows =');
  const end = app.indexOf('\nconst HomeCatalogSection', start);
  const homeRows = app.slice(start, end);
  assert.ok(homeRows.includes('Repetition across different shelves is intentional'));
  assert.ok(!homeRows.includes('shelfIdentity'));
  assert.ok(!homeRows.includes('dedupeShelf'));
});
