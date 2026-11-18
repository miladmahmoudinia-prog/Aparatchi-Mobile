import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx','utf8');
const service = fs.readFileSync('src/contentService.ts','utf8');

test('cold start restores disk truth before reveal and checks the live delta online', () => {
  const effectStart = app.indexOf('if (hasBundledCatalog) {');
  const effectEnd = app.indexOf('} else {', effectStart);
  const effect = app.slice(effectStart, effectEnd);
  assert.ok(!effect.includes('dismissStartup();'));
  assert.ok(effect.includes('void reloadContent(false);'));

  const start = app.indexOf('if (online) {', app.indexOf('const reloadContent = async'));
  const end = app.indexOf('const firstApplied = applyContent(firstContent);', start);
  const block = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(block.indexOf('await loadLiveContent(contentRef.current)') >= 0);
  const cachedStart = app.indexOf('applyContent(cachedContent);', app.indexOf('const reloadContent = async'));
  const reveal = app.indexOf('dismissStartup();', cachedStart);
  const network = app.indexOf('await onlinePromise', cachedStart);
  assert.ok(cachedStart >= 0 && cachedStart < reveal && reveal < network);
  assert.ok(!block.includes('firstContent = await loadContent(true)'));
  assert.ok(!block.includes('loadContent('));
  assert.ok(!block.includes('loadContent(false, true)'));
  assert.ok(block.includes('firstContent = contentRef.current;'));
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
