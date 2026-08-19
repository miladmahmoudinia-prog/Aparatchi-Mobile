import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx','utf8');
const service = fs.readFileSync('src/contentService.ts','utf8');

test('online cold start asks for current bootstrap before any persisted full-index fallback', () => {
  const start = app.indexOf('if (initialLoad && online)');
  const end = app.indexOf('const firstApplied = applyContent(firstContent);', start);
  const block = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(block.indexOf('await loadBootstrapContent()') >= 0);
  assert.ok(block.indexOf('await loadBootstrapContent()') < block.indexOf('firstContent = await loadContent(true)'));
  assert.ok(block.includes('loadContent(false, true)'));
  assert.ok(block.includes('InteractionManager.runAfterInteractions'));
});

test('forced current-index fetch bypasses full persisted cache parsing', () => {
  assert.ok(service.includes('const cached = forceRemote ? null : await readCachedContent();'));
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
