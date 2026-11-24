import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const config = fs.readFileSync('src/config.ts', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');

test('hourly catalog growth uses a cumulative uncapped live artifact', () => {
  assert.ok(config.includes('catalog-live-v2.json'));
  assert.ok(service.includes('export const mergeLiveCatalogDelta'));
  assert.ok(service.includes('for (const key of itemOrder)'));
  assert.ok(service.includes('declaredItemCount !== itemOrder.length'));
  assert.ok(!service.includes('itemOrder.slice('));
  assert.ok(!service.includes('upserts.slice('));
});

test('live refresh is applied before the multi-megabyte compatibility fallback', () => {
  const start = app.indexOf('const reloadContent = async');
  const end = app.indexOf('useEffect(() => {', start);
  const reload = app.slice(start, end);
  assert.ok(reload.includes('await refreshRestoredCatalog(contentRef.current)'));
  assert.ok(service.includes('(await loadLiveContent(base, manifest)) || loadBootstrapContent(base.updatedAt, verified)'));
  assert.ok(reload.includes('await loadCachedLiveContent(cachedBase)'));
});

test('background episode checks use the same small live update path', () => {
  const notifications = fs.readFileSync('src/notificationManager.ts', 'utf8');
  assert.ok(notifications.includes('const refresh = prepareLiveContent(Promise.resolve(true))'));
  assert.ok(notifications.includes('await refresh(base)'));
  assert.ok(!notifications.includes('await loadBootstrapContent()'));
});
