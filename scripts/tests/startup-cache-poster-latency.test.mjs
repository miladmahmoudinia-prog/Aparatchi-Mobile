import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');
const start = app.indexOf('const reloadContent = async');
const reloadSource = app.slice(start, app.indexOf('\n  useEffect(() => {', start));
const snapshot = (revision) => ({ clientRevision: revision, items: [{ id: revision }], source: 'cache' });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness(overrides = {}) {
  const events = [];
  const context = {
    Date,
    contentLoadInFlightRef: { current: false },
    lastContentLoadRef: { current: 0 },
    contentRef: { current: snapshot('bundled') },
    contentRevisionRef: { current: 'bundled' },
    startupFallbackContentRef: { current: null },
    internetIsReachable: async () => true,
    loadedContentRevision: (value) => value.clientRevision,
    visibleLoadedContent: (value) => value,
    startTransition: (run) => run(),
    syncEpisodeAlerts: async () => {},
    setContent: (value) => events.push(['content', value.clientRevision]),
    setContentReady: (value) => events.push(['ready', value]),
    setContentResolved: () => {},
    setContentLoading: () => {},
    setContentOffline: () => {},
    loadCachedBootstrapContent: async () => null,
    loadCachedLiveContent: async () => snapshot('cached'),
    loadLiveContent: async () => snapshot('remote'),
    loadBootstrapContent: async () => null,
    ...overrides,
  };
  context.dismissStartup = () => events.push(['reveal', context.contentRef.current.clientRevision]);
  const reload = vm.runInNewContext(stripTypeScriptTypes(reloadSource) + '\nreloadContent;', context);
  return { reload, context, events };
}

test('disk growth is restored before reveal without waiting for network state', async () => {
  const network = deferred();
  const h = harness({ internetIsReachable: () => network.promise });
  const running = h.reload();
  await flush();
  assert.deepEqual(h.events.filter(([kind]) => kind === 'reveal'), [['reveal', 'cached']]);
  assert.equal(h.context.contentRef.current.clientRevision, 'cached');
  network.resolve(true);
  await running;
  assert.equal(h.context.contentRef.current.clientRevision, 'remote');
});

test('complete fallback cache becomes the base for cumulative live changes', async () => {
  let seenBase;
  const h = harness({
    loadCachedBootstrapContent: async () => snapshot('complete-cache'),
    loadCachedLiveContent: async (base) => { seenBase = base; return null; },
    internetIsReachable: async () => false,
  });
  await h.reload();
  assert.equal(seenBase.clientRevision, 'complete-cache');
  assert.equal(h.context.contentRef.current.clientRevision, 'complete-cache');
  assert.equal(h.events.find(([kind]) => kind === 'reveal')[1], 'complete-cache');
});

test('resume/manual refresh cannot duplicate an active bootstrap fallback', async () => {
  const fallback = deferred();
  let liveCalls = 0;
  let bootstrapCalls = 0;
  const h = harness({
    loadLiveContent: async () => { liveCalls++; return null; },
    loadBootstrapContent: () => { bootstrapCalls++; return fallback.promise; },
  });
  const running = h.reload();
  await flush();
  await h.reload(true);
  assert.equal(liveCalls, 1);
  assert.equal(bootstrapCalls, 1);
  assert.equal(h.context.contentLoadInFlightRef.current, true);
  fallback.resolve(snapshot('fallback'));
  await running;
  assert.equal(h.context.contentLoadInFlightRef.current, false);
  assert.equal(h.context.contentRef.current.clientRevision, 'fallback');
});

test('failed refresh retains usable content and releases the refresh lock', async () => {
  const h = harness({
    loadLiveContent: async () => null,
    loadBootstrapContent: async () => { throw new Error('offline'); },
  });
  await h.reload();
  assert.equal(h.context.contentRef.current.clientRevision, 'cached');
  assert.equal(h.context.contentLoadInFlightRef.current, false);
  assert.equal(h.events.filter(([kind]) => kind === 'ready').at(-1)[1], true);
});

test('a cold offline install reveals its complete bundle without a remote fetch', async () => {
  const h = harness({
    internetIsReachable: async () => false,
    loadCachedLiveContent: async () => null,
    loadLiveContent: async () => { assert.fail('offline network request'); },
  });
  await h.reload();
  assert.equal(h.events.find(([kind]) => kind === 'reveal')[1], 'bundled');
});

test('late mirror bodies are discarded before expensive JSON parsing', () => {
  for (const [body, parse] of [
    ['const rawText = await response.text();', 'const live = JSON.parse(rawText)'],
    ['const rawBootstrapText = await response.text();', 'const rawBootstrap = JSON.parse(rawBootstrapText)'],
  ]) {
    const from = service.indexOf(body, body.includes('rawText') ? service.indexOf('export async function loadLiveContent') : 0);
    const to = service.indexOf(parse, from);
    assert.ok(from >= 0 && to > from);
    assert.ok(service.slice(from, to).includes('if (settled) return;'));
  }
});

test('poster fallback ignores duplicate and late events, and successful images stay loaded', () => {
  const from = app.indexOf('const finishAttempt = useCallback');
  const to = app.indexOf('\n  useEffect(() => {', from);
  let attempt = { identity: 'poster-A', stage: 0, loaded: false };
  const context = {
    artworkIdentity: 'poster-A', artworkIdentityRef: { current: 'poster-A' }, stage: 0,
    useCallback: (fn) => fn, setAttempt: (update) => { attempt = update(attempt); },
  };
  const finish = vm.runInNewContext(stripTypeScriptTypes(app.slice(from, to)) + '\nfinishAttempt;', context);
  finish(false);
  finish(false);
  assert.equal(attempt.stage, 1, 'late duplicate error must not skip the next candidate');
  context.stage = 1;
  finish(true);
  finish(false);
  assert.equal(attempt.loaded, true);
  assert.equal(attempt.stage, 1);
  context.artworkIdentityRef.current = 'poster-B';
  finish(false);
  assert.equal(attempt.identity, 'poster-A', 'old callback must not mutate the replacement poster');
});

test('poster timeout stops after load and never cancels its last remaining source', () => {
  const from = app.indexOf('    // A hanging origin may never emit onError promptly.');
  const to = app.indexOf('\n  }, [remoteUrl', from);
  const source = '(function () {\n' + app.slice(from, to) + '\n})()';
  for (const [loaded, stage, expected] of [[false, 0, 1], [true, 0, 0], [false, 1, 0]]) {
    let timers = 0;
    let advance;
    const context = { remoteUrl: 'https://example.test/poster', loaded, stage, candidates: ['a', 'b'],
      setTimeout: (fn, ms) => { timers++; advance = fn; assert.equal(ms, 2500); return 1; },
      clearTimeout: () => {}, finishAttempt: (success) => assert.equal(success, false) };
    vm.runInNewContext(source, context);
    assert.equal(timers, expected);
    advance?.();
  }
});

test('the reported operator movie skips provider default artwork before its real poster', () => {
  const from = app.indexOf('const isPlaceholderUrl =');
  const to = app.indexOf('\n\nconst internetIsReachable', from);
  const context = { isSafeHttpUrl: (url) => /^https?:\/\//i.test(url) };
  const candidates = vm.runInNewContext(stripTypeScriptTypes(app.slice(from, to)) + '\ncatalogArtworkCandidates;', context);
  assert.equal(candidates('https://thumb.upera.tv/s3/posters/default.jpg').length, 0);
  const actual = candidates('https://thumb.upera.tv/s3/posters/JfIqVB8KSsv0h6WL2HiA.jpg');
  assert.equal(actual.length, 2);
  assert.ok(actual[0].startsWith('https://wsrv.nl/'));
  assert.equal(actual[1], 'https://thumb.upera.tv/s3/posters/JfIqVB8KSsv0h6WL2HiA.jpg');
});
