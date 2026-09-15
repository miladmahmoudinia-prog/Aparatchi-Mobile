import { harness as artworkHarness } from './helpers/artwork-harness.mjs';
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
    commitCatalogWhenIdle: (run) => run(),
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
  const h = artworkHarness(), urls = ['poster-A', 'poster-B', 'poster-C'];
  const initial = h.render(urls);
  initial.finish('poster-A', false);
  initial.finish('poster-A', false);
  assert.deepEqual([...h.render(urls).sources], ['poster-B'], 'duplicate error must not skip the next candidate');
  h.render(urls).finish('poster-B', true);
  initial.finish('poster-A', false);
  assert.deepEqual([...h.render(urls).sources], ['poster-B']);
  h.render(['replacement']);
  initial.finish('poster-A', true);
  assert.deepEqual([...h.render(['replacement']).sources], ['replacement']);
});

test('poster timeout stops after load and never cancels its last remaining source', () => {
  const h = artworkHarness();
  h.render(['single']); h.tick();
  assert.deepEqual([...h.render(['single']).sources], ['single']);
  const loaded = h.render(['one', 'two']); loaded.finish('one', true);
  h.render(['one', 'two']); h.tick();
  assert.deepEqual([...h.render(['one', 'two']).sources], ['one']);
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

test('native splash remains until the React startup artwork is committed', () => {
  assert.ok(app.includes('SplashScreen.preventAutoHideAsync()'));
  assert.ok(app.includes('SplashScreen.hideAsync()'));
  assert.ok(app.indexOf('SplashScreen.preventAutoHideAsync()') < app.indexOf('function AppContent()'));
});
