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
});

test('manifest Raw and CDN requests start together with a bounded Raw preference', async () => {
  const service = await fs.readFile('src/contentService.ts', 'utf8');
  assert.ok(service.includes('const rawPromise = firstValidManifest(rawCandidates);'));
  assert.ok(service.includes('const mirrorPromise = firstValidManifest(mirrorCandidates);'));
  assert.ok(service.includes('setTimeout(() => resolve(null), 900)'));
});
