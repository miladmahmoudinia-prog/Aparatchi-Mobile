import fs from 'node:fs/promises';

const firstInstallSource = `import assert from 'node:assert/strict';
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
`;

const deviceStartupSource = `import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('cold start overlays the fresh Home snapshot on the complete cached navigation catalog', async () => {
  const source = await fs.readFile('App.tsx', 'utf8');
  assert.ok(source.includes('const bootstrapIds = new Set'));
  assert.ok(source.includes('...bootstrapContent.items,'));
  assert.ok(source.includes('...firstContent.items.filter((item) =>'));
  assert.ok(source.includes('bootstrapApplied = Boolean(startupContent && applyContent(startupContent));'));
});

test('detail hydration cannot replace already visible poster or backdrop artwork', async () => {
  const source = await fs.readFile('App.tsx', 'utf8');
  assert.ok(source.includes('const visiblePoster = current.poster || current.posterFallback'));
  assert.ok(source.includes('const visibleBackdrop = current.backdrop || current.backdropFallback || visiblePoster'));
  assert.ok(source.includes('backdrop: current.backdrop || visibleBackdrop'));
});

test('startup bootstrap is accepted only when it belongs to the manifest client revision', async () => {
  const source = await fs.readFile('src/contentService.ts', 'utf8');
  assert.ok(source.includes('bootstrapRecord.clientRevision'));
  assert.ok(source.includes('payloadClientRevision !== manifest.clientRevision'));
  const revisionGuard = source.indexOf('payloadClientRevision !== manifest.clientRevision');
  const parsePayload = source.indexOf('const parsed = parsePayload(rawBootstrap)', revisionGuard);
  assert.ok(revisionGuard >= 0 && parsePayload > revisionGuard, 'revision guard must run before bootstrap parsing/application');
});
`;

await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile('scripts/tests/first-install-freshness-v33.test.mjs', firstInstallSource, 'utf8');
await fs.writeFile('scripts/tests/device-startup-detail-stability-v32.test.mjs', deviceStartupSource, 'utf8');
console.log('Rewrote v33 startup regressions with literal syntax-safe assertions.');
