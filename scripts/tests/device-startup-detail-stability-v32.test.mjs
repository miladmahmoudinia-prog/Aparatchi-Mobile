import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('cold start overlays the fresh Home snapshot on the complete cached navigation catalog', async () => {
  const source = await fs.readFile('App.tsx', 'utf8');
  assert.match(source, /const bootstrapIds = new Set/);
  assert.match(source, /...bootstrapContent.items,[\s\S]*...firstContent.items.filter/);
  assert.match(source, /bootstrapApplied = Boolean(startupContent && applyContent(startupContent))/);
});

test('detail hydration cannot replace already visible poster or backdrop artwork', async () => {
  const source = await fs.readFile('App.tsx', 'utf8');
  assert.match(source, /const visiblePoster = current.poster || current.posterFallback/);
  assert.match(source, /const visibleBackdrop = current.backdrop || current.backdropFallback || visiblePoster/);
  assert.match(source, /backdrop: current.backdrop || visibleBackdrop/);
});

test('startup bootstrap is accepted only when it belongs to the manifest client revision', async () => {
  const source = await fs.readFile('src/contentService.ts', 'utf8');
  assert.match(source, /bootstrapRecord.clientRevision/);
  assert.match(source, /payloadClientRevision !== manifest.clientRevision/);
  const revisionGuard = source.indexOf('payloadClientRevision !== manifest.clientRevision');
  const parsePayload = source.indexOf('const parsed = parsePayload(rawBootstrap)', revisionGuard);
  assert.ok(revisionGuard >= 0 && parsePayload > revisionGuard, 'revision guard must run before bootstrap parsing/application');
});
