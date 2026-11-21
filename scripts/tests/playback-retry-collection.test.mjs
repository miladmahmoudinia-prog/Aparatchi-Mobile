import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const body = app.split('const retryNetworkPlayback = useCallback(async () => {')[1].split('\n  }, [activeSource.url, player]);')[0];
function harness({ connected = true, local = false, fail = false } = {}) {
  const calls = [];
  const context = {
    playbackRetryInFlightRef: { current: false }, activeSource: { url: local ? 'file:///movie.mp4' : 'https://example.com/movie.mp4' },
    isSafeHttpUrl: url => url.startsWith('https:'), internetIsReachable: async () => connected,
    setNetworkOffline: x => calls.push(['offline', x]), setPlaybackError: x => calls.push(['error', x]),
    setPlaybackAttempt: () => {}, setFirstFrameReady: () => {}, latestTimeRef: { current: 42 },
    player: { pause() {}, async replaceAsync(url) { calls.push(['replace', url]); if (fail) throw Error('failed'); }, play() { calls.push(['play']); } },
  };
  return { context, calls, retry: vm.runInNewContext(`async () => {${body}\n}`, context) };
}
test('double retry replaces once and restores position', async () => {
  const h = harness(); await Promise.all([h.retry(), h.retry()]);
  assert.equal(h.calls.filter(x => x[0] === 'replace').length, 1);
  assert.equal(h.context.player.currentTime, 42);
  assert.equal(h.context.playbackRetryInFlightRef.current, false);
});
test('offline does not replace source', async () => {
  const h = harness({ connected: false }); await h.retry();
  assert.deepEqual(h.calls, [['offline', true]]);
  assert.equal(h.context.playbackRetryInFlightRef.current, false);
});
test('failed local source is reloaded even offline', async () => {
  const h = harness({ connected: false, local: true }); await h.retry();
  assert.ok(h.calls.some(x => x[0] === 'replace'));
  assert.ok(h.calls.some(x => x[0] === 'play'));
});
test('failed replacement releases retry lock', async () => {
  const h = harness({ fail: true }); await h.retry(); await h.retry();
  assert.equal(h.calls.filter(x => x[0] === 'replace').length, 2);
  assert.ok(h.calls.some(x => x[0] === 'error' && x[1]));
});
const collectionBody = app.split('const localizedCollectionTitleFa = (')[1].split(') => {')[1].split('\n};')[0];
const registry = JSON.parse(readFileSync(new URL('../../src/reviewedCollectionTitles.json', import.meta.url)));
const title = vm.runInNewContext(`(collectionId, members) => {${collectionBody.replace(' as Record<string, string>', '')}\n}`, { reviewedCollectionTitles: registry });
test('reviewed identity wins over phonetic upstream labels in both ID formats', () => {
  for (const id of ['tmdb:334996', 'collection:tmdb:334996']) {
    assert.equal(title(id, [{ collectionNameFa: 'کالکشن سون آو باتمان' }]), 'پسر بتمن');
  }
});
test('collection never borrows member title', () => {
  assert.equal(title('tmdb:new', [{ collectionNameFa: 'حدسی', nameFa: 'فیلم', collectionName: 'Original Collection' }]), 'Original Collection');
  assert.equal(title('', [{ nameFa: 'فیلم' }]), 'مجموعه فیلم‌ها');
});
