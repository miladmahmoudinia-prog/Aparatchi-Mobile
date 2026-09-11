import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');
const workflow = fs.readFileSync('.github/workflows/android-apk.yml', 'utf8');
const bootstrap = JSON.parse(fs.readFileSync('src/catalogStartup.json', 'utf8'));

test('APK carries a compact but useful startup navigation snapshot', () => {
  assert.ok(bootstrap.items.length >= 100 && bootstrap.items.length <= 240);
  assert.ok(String(bootstrap.clientRevision || '').length >= 32);
  assert.ok(bootstrap.items.some((item) => item.categoryKeys?.includes('iranian-series')));
  assert.ok(fs.statSync('src/catalogStartup.json').size < 900_000);
});

test('startup reveals compact Home before restoring the full disk catalog', () => {
  assert.ok(service.includes("import bundledBootstrapJson from './catalogStartup.json';"));
  assert.ok(service.includes('export async function loadCachedLiveContent(base: LoadedContent)'));
  assert.ok(app.includes('const cachedLive = initialLoad ? await loadCachedLiveContent(cachedBase) : null;'));
  const start = app.indexOf('if (hasBundledCatalog) {');
  const end = app.indexOf('} else {', start);
  const block = app.slice(start, end);
  assert.ok(block.includes('dismissStartup();'));
  assert.ok(block.includes('setTimeout(reloadContentWhenIdle, 12_000)'));
  const cachedStart = app.indexOf('if (cachedContent?.items.length) {', app.indexOf('const reloadContent = async'));
  const reveal = app.indexOf('if (contentRef.current.items.length) dismissStartup();', cachedStart);
  assert.ok(cachedStart >= 0 && reveal > cachedStart);
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
