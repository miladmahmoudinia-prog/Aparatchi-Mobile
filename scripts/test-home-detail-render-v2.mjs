import fs from 'node:fs/promises';

const [app, service, entry] = await Promise.all([
  fs.readFile('App.tsx', 'utf8'),
  fs.readFile('src/contentService.ts', 'utf8'),
  fs.readFile('index.ts', 'utf8'),
]);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const homeStart = app.indexOf('const HomeScreen = memo(function HomeScreen');
const homeEnd = app.indexOf('type CategoryCardConfig', homeStart);
assert(homeStart >= 0 && homeEnd > homeStart, 'HomeScreen block not found');
const home = app.slice(homeStart, homeEnd);
assert(home.includes('const eagerRows = useMemo(() => rows.slice(0, 4), [rows]);'), 'Home first rails are not eager');
assert(home.includes('const deferredRows = useMemo(() => rows.slice(4), [rows]);'), 'Home deferred rows missing');
assert(home.includes('{eagerRows.map((row) => ('), 'Home eager rows are not mounted in the header tree');
assert(home.includes('data={deferredRows}'), 'Outer Home FlatList still owns the first rails');
assert(!home.includes('data={rows}'), 'Home still virtualizes every row behind the tall header');

const detailStart = app.indexOf('function DetailModal({');
const detailEnd = app.indexOf('function PersonProfileModal({', detailStart);
assert(detailStart >= 0 && detailEnd > detailStart, 'DetailModal block not found');
const detail = app.slice(detailStart, detailEnd);
assert(detail.includes("const detailBodyReady = Boolean(item && (!item.detailPath || item.detailLoaded === true));"), 'Detail readiness is not derived from hydration truth');
assert(!detail.includes('setDetailBodyReady'), 'Detail still uses delayed mutable ready state');
assert(!detail.includes('InteractionManager.runAfterInteractions'), 'Detail visibility is still gated by InteractionManager');
assert(!detail.includes('summaryFallback'), 'Detail still reveals an incomplete summary on a timer');

assert(service.includes('const resolveStableDetailPath = async'), 'Stable detail pointer resolver missing');
assert(service.includes('const detailPath = await resolveStableDetailPath(summary, summaryDetailPath);'), 'Detail does not resolve the current pointer first');
assert(service.includes('_aparatchi_pointer=${Date.now()}'), 'Mutable stable pointer is not cache-busted');
assert(service.includes('detailPath: summaryDetailPath, detailLoaded: true'), 'Hydrated item can be downgraded by a stale summary path');
assert(service.includes('stableDetailPointerCache'), 'Stable pointer lookup is not bounded by an in-memory TTL cache');

assert(!entry.includes('globalThis.fetch ='), 'Entry point still monkeypatches global fetch');
assert(!entry.includes('globalThis.setTimeout ='), 'Entry point still monkeypatches global timers');
assert(!entry.includes('HomeAwareFlatList'), 'Entry point still relies on a React Native export monkeypatch');
assert(entry.includes("import App from './App';"), 'Entry point is not back to the standard App registration path');

console.log(JSON.stringify({
  homeFirstRails: 'eager-header-tree',
  homeLaterRails: 'virtualized',
  detailReady: 'derived-from-detailLoaded',
  stableDetailPointer: 'resolved-before-cache',
  entryPointMonkeypatches: false,
}, null, 2));
