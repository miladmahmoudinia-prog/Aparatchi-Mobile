import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('first install has no mandatory five-second startup minimum', async () => {
  const app = await fs.readFile('App.tsx', 'utf8');
  assert.ok(app.includes('const STARTUP_MIN_VISIBLE_MS = 0;'));
  assert.ok(!app.includes('const STARTUP_MIN_VISIBLE_MS = 5000;'));
});

test('bootstrap mirrors race instead of stacking timeout costs', async () => {
  const service = await fs.readFile('src/contentService.ts', 'utf8');
  const start = service.indexOf('export async function loadBootstrapContent');
  const end = service.indexOf('const readCachedContent', start);
  const bootstrap = service.slice(start, end);
  assert.ok(bootstrap.includes('const controllers = candidates.map'));
  assert.ok(bootstrap.includes('candidates.forEach((candidate, index) => {'));
  assert.ok(!bootstrap.includes('for (const candidate of candidates)'));
  assert.ok(bootstrap.includes('payloadClientRevision !== manifest.clientRevision'));
  assert.ok(bootstrap.includes('const manifestPromise = fetchRemoteManifest().catch(() => null);'));
  assert.ok(bootstrap.indexOf('const manifestPromise =') < bootstrap.indexOf('candidates.forEach((candidate, index) => {'));
});

test('first install keeps a real bundled fallback without flashing stale Home', async () => {
  const app = await fs.readFile('App.tsx', 'utf8');
  const bundled = JSON.parse(await fs.readFile('src/catalogBootstrap.json', 'utf8'));
  const start = app.indexOf('if (hasBundledCatalog) {');
  const end = app.indexOf('} else {', start);
  const block = app.slice(start, end);
  assert.ok(bundled.items.length >= 100);
  assert.ok(!block.includes('dismissStartup();'));
  assert.ok(block.includes('void reloadContent(false);'));
});

test('manifest Raw and CDN requests start together with a bounded source-truth window', async () => {
  const service = await fs.readFile('src/contentService.ts', 'utf8');
  assert.ok(service.includes('const rawPromise = firstValidManifest(rawCandidates);'));
  assert.ok(service.includes('const mirrorPromise = firstValidManifest(mirrorCandidates);'));
  assert.ok(service.includes('setTimeout(() => resolve(null), 2200)'));
  assert.ok(service.includes('candidateTime < cachedTime'));
});
