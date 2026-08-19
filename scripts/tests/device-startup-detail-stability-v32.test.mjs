import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('cold online start resolves current bootstrap before persisted full-index fallback', async () => {
  const source = await fs.readFile('App.tsx', 'utf8');
  const start = source.indexOf('if (initialLoad && online)');
  const end = source.indexOf('const firstApplied = applyContent(firstContent);', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(block.includes('bootstrapContent = await loadBootstrapContent();'));
  assert.ok(block.includes('firstContent = await loadContent(true);'));
  assert.ok(block.indexOf('bootstrapContent = await loadBootstrapContent();') < block.indexOf('firstContent = await loadContent(true);'));
  assert.ok(block.includes('loadContent(false, true)'));
});

test('detail hydration cannot replace already visible poster or backdrop artwork', async () => {
  const source = await fs.readFile('App.tsx', 'utf8');
  assert.ok(source.includes('const mergeOpenDetailSnapshot = (current: CatalogItem, incoming: CatalogItem): CatalogItem => {'));
  assert.ok(source.includes('const visiblePoster = current.poster || current.posterFallback'));
  assert.ok(source.includes('const visibleBackdrop = current.backdrop || current.backdropFallback || visiblePoster'));
  assert.ok(source.includes('backdrop: visibleBackdrop'));
  assert.ok(source.includes('return mergeOpenDetailSnapshot(current, fullItem);'));
});

test('startup bootstrap is accepted only when it belongs to the manifest client revision', async () => {
  const source = await fs.readFile('src/contentService.ts', 'utf8');
  assert.ok(source.includes('bootstrapRecord.clientRevision'));
  assert.ok(source.includes('payloadClientRevision !== manifest.clientRevision'));
  const revisionGuard = source.indexOf('payloadClientRevision !== manifest.clientRevision');
  const parsePayload = source.indexOf('const parsed = parsePayload(rawBootstrap)', revisionGuard);
  assert.ok(revisionGuard >= 0 && parsePayload > revisionGuard, 'revision guard must run before bootstrap parsing/application');
});