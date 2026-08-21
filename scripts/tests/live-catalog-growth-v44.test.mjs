import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const config = fs.readFileSync('src/config.ts', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');

test('hourly catalog growth uses a cumulative uncapped live artifact', () => {
  assert.ok(config.includes('catalog-live.json'));
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
  const live = reload.indexOf('await loadLiveContent(contentRef.current)');
  const full = reload.indexOf('loadBootstrapContent().then');
  assert.ok(live >= 0 && full > live);
  assert.ok(reload.includes('await loadCachedLiveContent(contentRef.current)'));
});

test('background episode checks use the same small live update path', () => {
  const notifications = fs.readFileSync('src/notificationManager.ts', 'utf8');
  assert.ok(notifications.includes('loadLiveContent(cached || bundled)'));
  assert.ok(!notifications.includes('await loadBootstrapContent()'));
});
