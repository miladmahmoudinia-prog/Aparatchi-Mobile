import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const app = await fs.readFile('App.tsx', 'utf8');

assert.match(app, /void reloadContent\(false\);/, 'bundled first install starts the real refresh immediately');
assert.doesNotMatch(app, /initialRefreshTimer = setTimeout\(reloadContentWhenIdle, 650\);/, 'first install is no longer gated behind InteractionManager');
assert.match(app, /startupFallbackTimer = setTimeout\(dismissStartup, 2000\);/, 'anti-stuck startup fallback is bounded to two seconds');

const detailStart = app.indexOf('function DetailModal({');
const detailEnd = app.indexOf('function PersonProfileModal({', detailStart);
assert.ok(detailStart >= 0 && detailEnd > detailStart, 'DetailModal block exists');
const detail = app.slice(detailStart, detailEnd);
assert.match(detail, /const downloadGroups = item\.downloads \|\| \[\];/, 'movie summary downloads are usable before full detail hydration');
assert.match(detail, /const hasPlayableStream = playableVersionsFor\(item\)\.length > 0;/, 'movie summary playback is usable before full detail hydration');
assert.doesNotMatch(detail, /const downloadGroups = detailBodyReady \?/, 'download actions are not hydration-gated');
assert.doesNotMatch(detail, /const hasPlayableStream = detailBodyReady \?/, 'playback actions are not hydration-gated');

const loadingStart = detail.indexOf('{!detailBodyReady ? (');
const loadedStart = detail.indexOf(') : (', loadingStart);
assert.ok(loadingStart >= 0 && loadedStart > loadingStart, 'loading detail branch exists');
const loadingBranch = detail.slice(loadingStart, loadedStart + 5);
assert.match(loadingBranch, /item\.type === 'movie' && \(hasPlayableStream \|\| primaryOperatorPlayFile \|\| hasDownloads\)/,
  'loading detail branch renders immediate movie actions when compact media exists');
assert.match(loadingBranch, /setDownloadSheetOpen\(true\)/, 'immediate movie download button opens the normal download sheet');
assert.match(loadingBranch, /onStream\(item\)/, 'immediate movie play button uses the normal player path');

const reconcileStart = app.indexOf('const reconcileUperaMediaFiles');
const reconcileEnd = app.indexOf('\nconst ', reconcileStart + 20);
const reconcile = app.slice(reconcileStart, reconcileEnd);
assert.match(reconcile, /language: undefined/, 'contradictory same-URL language media is preserved neutrally');
assert.doesNotMatch(reconcile, /prepared\.filter\(\(file\) => !conflictedUrls\.has/, 'contradictory media is no longer deleted wholesale');

console.log(JSON.stringify({
  startupIdleGateRemoved: true,
  emergencyFallbackMs: 2000,
  immediateMovieActions: true,
  neutralConflictFallback: true,
}, null, 2));
