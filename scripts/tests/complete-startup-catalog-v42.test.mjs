import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');
const refresh = fs.readFileSync('scripts/refresh-bundled-bootstrap.mjs', 'utf8');
const bootstrap = JSON.parse(fs.readFileSync('src/catalogBootstrap.json', 'utf8'));

test('bundled startup navigation is complete, unique and uncapped', () => {
  assert.ok(bootstrap.items.length > 1000, 'bundled catalog unexpectedly tiny');
  assert.equal(new Set(bootstrap.items.map((item) => `${item.type}:${item.id}`)).size, bootstrap.items.length);
  assert.ok(bootstrap.items.some((item) => item.categoryKeys?.includes('iranian-series')));
  assert.ok(fs.statSync('src/catalogBootstrap.json').size < 10_000_000);
});

test('release refresh accepts only manifest-declared complete title counts', () => {
  assert.ok(refresh.includes('bootstrapItemCount !== clientItemCount'));
  assert.ok(refresh.includes('value.items.length !== Number(manifest.bootstrapItemCount)'));
  assert.ok(!refresh.includes('items.length < 100'));
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
  assert.ok(reload.indexOf('await loadLiveContent(contentRef.current)') < reload.indexOf('loadBootstrapContent().then'));
  assert.ok(!reload.includes('loadContent('));
});
