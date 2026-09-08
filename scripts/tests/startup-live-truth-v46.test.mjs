import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');

test('cold start restores cached growth before reveal and refreshes live growth afterwards', () => {
  const reloadStart = app.indexOf('const reloadContent = async');
  const effectStart = app.indexOf('useEffect(() => {', reloadStart);
  const reload = app.slice(reloadStart, effectStart);
  const cachedStart = reload.indexOf('if (cachedContent?.items.length) {');
  const onlineStart = reload.indexOf('if (online) {', cachedStart);
  const liveStart = reload.indexOf('liveContent = await loadLiveContent(contentRef.current)', onlineStart);
  const liveApplied = reload.indexOf('if (applyContent(liveContent)) {', liveStart);
  const liveDismissed = reload.indexOf('dismissStartup();', liveApplied);

  assert.ok(cachedStart >= 0 && onlineStart > cachedStart);
  assert.ok(reload.indexOf('applyContent(cachedContent);', cachedStart) < reload.indexOf('if (contentRef.current.items.length) dismissStartup();'));
  assert.ok(liveStart > onlineStart && liveApplied > liveStart && liveDismissed > liveApplied);
});

test('offline cold start still falls back to the complete bundled catalog', () => {
  const reloadStart = app.indexOf('const reloadContent = async');
  const effectStart = app.indexOf('useEffect(() => {', reloadStart);
  const reload = app.slice(reloadStart, effectStart);
  assert.ok(reload.includes('firstContent = contentRef.current;'));
  assert.ok(reload.includes('const firstApplied = applyContent(firstContent);'));
  assert.ok(reload.includes('if (firstApplied) {\n        dismissStartup();'));
});
