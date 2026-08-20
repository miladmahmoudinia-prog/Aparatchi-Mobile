import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx','utf8');
const service = fs.readFileSync('src/contentService.ts','utf8');

test('cold start reveals bundled/cache bootstrap before remote work', () => {
  const effectStart = app.indexOf('if (hasBundledCatalog) {');
  const effectEnd = app.indexOf('} else {', effectStart);
  const effect = app.slice(effectStart, effectEnd);
  assert.ok(effect.indexOf('dismissStartup();') >= 0);
  assert.ok(effect.indexOf('dismissStartup();') < effect.indexOf('void reloadContent(false);'));

  const start = app.indexOf('if (initialLoad && online)');
  const end = app.indexOf('const firstApplied = applyContent(firstContent);', start);
  const block = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(block.indexOf('await loadBootstrapContent()') >= 0);
  assert.ok(app.includes('const cachedBootstrap = initialLoad ? await loadCachedBootstrapContent() : null;'));
  assert.ok(!block.includes('firstContent = await loadContent(true)'));
  assert.ok(block.includes('loadContent(false)'));
  assert.ok(!block.includes('loadContent(false, true)'));
  assert.ok(block.includes('InteractionManager.runAfterInteractions'));
});

test('changed manifest skips parsing the stale full-index cache', () => {
  assert.ok(service.includes('const metadataMatches = Boolean('));
  assert.ok(service.includes('const cachedCandidate = metadataMatches || !manifest.clientRevision'));
  assert.ok(service.includes('const resolveCachedContent = async () =>'));
});

test('manifest cannot downgrade below already accepted catalog and Raw gets bounded truth window', () => {
  assert.ok(service.includes('candidateTime < cachedTime'));
  assert.ok(service.includes('setTimeout(() => resolve(null), 2200)'));
});

test('summary rows preserve a small people preview for first detail paint', () => {
  assert.ok(service.includes('const normalizeSummaryPeoplePreview ='));
  assert.ok(service.includes('const summaryPeople = normalizeSummaryPeoplePreview(item.people, id);'));
  assert.ok(service.includes('...(summaryPeople.length ? { people: summaryPeople } : {})'));
  assert.ok(service.includes('if (output.length >= 8) break;'));
});

test('detail hero never paints poster as a temporary backdrop', () => {
  assert.ok(!app.includes('fallback={item.poster} preview={item.poster} style={StyleSheet.absoluteFill}'));
  assert.ok(app.includes('primary={item.backdrop || item.backdropFallback || item.poster}'));
  assert.ok(app.includes('fallback={item.backdropFallback || item.poster}'));
});
