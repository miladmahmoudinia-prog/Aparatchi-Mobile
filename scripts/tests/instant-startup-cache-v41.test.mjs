import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');
const workflow = fs.readFileSync('.github/workflows/android-apk.yml', 'utf8');
const bootstrap = JSON.parse(fs.readFileSync('src/catalogBootstrap.json', 'utf8'));

test('APK carries the complete current startup navigation snapshot', () => {
  assert.ok(bootstrap.items.length > 1000);
  assert.ok(String(bootstrap.clientRevision || '').length >= 32);
  assert.ok(bootstrap.items.some((item) => item.categoryKeys?.includes('iranian-series')));
  assert.ok(fs.statSync('src/catalogBootstrap.json').size < 10_000_000);
});

test('startup is stale-while-revalidate and never network-gated', () => {
  assert.ok(service.includes("import bundledBootstrapJson from './catalogBootstrap.json';"));
  assert.ok(service.includes('export async function loadCachedLiveContent(base: LoadedContent)'));
  assert.ok(app.includes('const cachedLive = initialLoad ? await loadCachedLiveContent(contentRef.current) : null;'));
  const start = app.indexOf('if (hasBundledCatalog) {');
  const end = app.indexOf('} else {', start);
  const block = app.slice(start, end);
  assert.ok(block.indexOf('dismissStartup();') < block.indexOf('void reloadContent(false);'));
});

test('large index cannot steal the startup path', () => {
  const reload = app.slice(app.indexOf('const reloadContent = async'), app.indexOf('useEffect(() => {', app.indexOf('const reloadContent = async')));
  assert.ok(!reload.includes('loadContent('));
  assert.ok(reload.includes('await loadLiveContent(contentRef.current)'));
  assert.ok(service.includes('const metadataMatches = Boolean('));
});

test('release builds refresh their bundled snapshot', () => {
  assert.ok(workflow.includes('node scripts/refresh-bundled-bootstrap.mjs'));
});
