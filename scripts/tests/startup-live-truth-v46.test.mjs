import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');

test('online cold start never reveals a build-time count before live growth is merged', () => {
  const reloadStart = app.indexOf('const reloadContent = async');
  const effectStart = app.indexOf('useEffect(() => {', reloadStart);
  const reload = app.slice(reloadStart, effectStart);
  const cachedStart = reload.indexOf('if (cachedLive?.items.length) {');
  const onlineStart = reload.indexOf('if (online) {', cachedStart);
  const liveStart = reload.indexOf('liveContent = await loadLiveContent(contentRef.current)', onlineStart);
  const liveApplied = reload.indexOf('if (applyContent(liveContent)) {', liveStart);
  const liveDismissed = reload.indexOf('dismissStartup();', liveApplied);

  assert.ok(cachedStart >= 0 && onlineStart > cachedStart);
  assert.ok(!reload.slice(cachedStart, onlineStart).includes('dismissStartup();'));
  assert.ok(liveStart > onlineStart && liveApplied > liveStart && liveDismissed > liveApplied);
});

test('offline cold start still falls back to the complete bundled catalog', () => {
  const reloadStart = app.indexOf('const reloadContent = async');
  const effectStart = app.indexOf('useEffect(() => {', reloadStart);
  const reload = app.slice(reloadStart, effectStart);
  assert.ok(reload.includes('firstContent = cachedLive || contentRef.current;'));
  assert.ok(reload.includes('const firstApplied = applyContent(firstContent);'));
  assert.ok(reload.includes('if (firstApplied) {\n        dismissStartup();'));
});
