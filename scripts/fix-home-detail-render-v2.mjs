import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const write = (path, content) => fs.writeFile(path, content, 'utf8');

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};

let app = await read('App.tsx');

app = replaceOnce(
  app,
  "  const rows = useMemo(() => buildHomeCatalogRows(catalog), [catalog]);\n  const newest = rows[0]?.items || [];",
  "  const rows = useMemo(() => buildHomeCatalogRows(catalog), [catalog]);\n  const newest = rows[0]?.items || [];\n  // The first Home rails must exist in the native tree on the very first frame.\n  // Keeping only the later rails virtualized avoids the Android blank-until-scroll\n  // regression without turning the whole Home catalog into an eager render.\n  const eagerRows = useMemo(() => rows.slice(0, 4), [rows]);\n  const deferredRows = useMemo(() => rows.slice(4), [rows]);",
  'Home eager/deferred rows',
);

const homeStart = app.indexOf('const HomeScreen = memo(function HomeScreen');
const homeEnd = app.indexOf('type CategoryCardConfig', homeStart);
if (homeStart < 0 || homeEnd < 0) throw new Error('HomeScreen block not found');
let home = app.slice(homeStart, homeEnd);

home = replaceOnce(
  home,
  "      <ImdbTop100Section\n        ranking={imdbTop100}\n        catalog={catalog}\n        onOpen={onOpen}\n      />\n    </>\n  ), [catalog, imdbTop100, isActive, newest, onOpen]);",
  "      <ImdbTop100Section\n        ranking={imdbTop100}\n        catalog={catalog}\n        onOpen={onOpen}\n      />\n      {eagerRows.map((row) => (\n        <HomeCatalogSection\n          key={`home-eager-${row.filter}`}\n          row={row}\n          featuredPeople={featuredPeople}\n          catalog={catalog}\n          onOpen={onOpen}\n          onBrowse={onBrowse}\n        />\n      ))}\n    </>\n  ), [catalog, eagerRows, featuredPeople, imdbTop100, isActive, newest, onBrowse, onOpen]);",
  'Home eager rows in header',
);
home = replaceOnce(home, '        data={rows}', '        data={deferredRows}', 'Home deferred FlatList data');
app = app.slice(0, homeStart) + home + app.slice(homeEnd);

const detailStart = app.indexOf('function DetailModal({');
const detailEnd = app.indexOf('function PersonProfileModal({', detailStart);
if (detailStart < 0 || detailEnd < 0) throw new Error('DetailModal block not found');
let detail = app.slice(detailStart, detailEnd);
const detailStateStart = detail.indexOf('  const [detailBodyReady, setDetailBodyReady] = useState(false);');
const detailGuard = detail.indexOf('  if (!item) return null;', detailStateStart);
if (detailStateStart < 0 || detailGuard < 0) throw new Error('Detail ready state/effect block not found');
const detailReplacement = `  // catalog-index is only a summary. Never render that summary as if its media\n  // were complete. As soon as the selected detail object is hydrated React\n  // renders the real actions/episodes directly; no InteractionManager/scroll\n  // event is allowed to gate their visibility.\n  const detailBodyReady = Boolean(item && (!item.detailPath || item.detailLoaded === true));\n  const [downloadSheetOpen, setDownloadSheetOpen] = useState(false);\n  const [downloadInitialGroup, setDownloadInitialGroup] = useState<string | null>(null);\n\n  useEffect(() => {\n    setDownloadSheetOpen(false);\n    setDownloadInitialGroup(null);\n  }, [item?.id, visible]);\n`;
detail = detail.slice(0, detailStateStart) + detailReplacement + detail.slice(detailGuard);
app = app.slice(0, detailStart) + detail + app.slice(detailEnd);
await write('App.tsx', app);

let service = await read('src/contentService.ts');

service = replaceOnce(
  service,
  "const detailMemoryCache = new Map<string, CatalogItem>();\nconst detailRequestCache = new Map<string, Promise<CatalogItem | null>>();",
  "const detailMemoryCache = new Map<string, CatalogItem>();\nconst detailRequestCache = new Map<string, Promise<CatalogItem | null>>();\nconst stableDetailPointerCache = new Map<string, { path: string; expiresAt: number }>();",
  'stable detail pointer memory cache',
);

const exportMarker = 'export async function loadCatalogItemDetail(summary: CatalogItem): Promise<CatalogItem | null> {';
const exportIndex = service.indexOf(exportMarker);
if (exportIndex < 0) throw new Error('loadCatalogItemDetail export not found');
const stableHelper = `const resolveStableDetailPath = async (summary: CatalogItem, fallbackPath: string) => {\n  const identityMatch = fallbackPath.match(/(?:^|\\/)([a-f0-9]{12})-[a-f0-9]{12}\\.json$/i);\n  if (!identityMatch) return fallbackPath;\n\n  const identity = identityMatch[1].toLowerCase();\n  const cached = stableDetailPointerCache.get(identity);\n  if (cached && cached.expiresAt > Date.now()) return cached.path;\n\n  const stablePath = \\`catalog-stable/\\${identity}.json\\`;\n  const stableUrl = detailUrlFor(stablePath);\n  if (!stableUrl) return fallbackPath;\n\n  // catalog-stable is mutable. Prefer GitHub Raw (source of truth) over the CDN\n  // for this tiny pointer, then fall back to the CDN on networks where Raw is\n  // unavailable. Immutable detail shards keep the faster existing CDN path.\n  const candidates = remoteRepositoryUrlCandidates(stableUrl).sort((a, b) =>\n    Number(/raw\\.githubusercontent\\.com/i.test(b)) - Number(/raw\\.githubusercontent\\.com/i.test(a)),\n  );\n\n  for (const candidate of candidates) {\n    const controller = new AbortController();\n    const timeout = setTimeout(() => controller.abort(), 2800);\n    try {\n      const separator = candidate.includes('?') ? '&' : '?';\n      const response = await fetch(\n        \\`\\${candidate}\\${separator}_aparatchi_pointer=\\${Date.now()}\\`,\n        {\n          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },\n          signal: controller.signal,\n        },\n      );\n      if (!response.ok) continue;\n      const pointer = await response.json() as Record<string, unknown>;\n      const currentPath = asString(pointer.detailPath);\n      const matchesSummary =\n        asString(pointer.type) === asString(summary.type) &&\n        asString(pointer.id) === asString(summary.id);\n      const pathIsSafe = /^catalog-items\\/[a-f0-9]{12}-[a-f0-9]{12}\\.json$/i.test(currentPath);\n      if (!matchesSummary || !pathIsSafe) continue;\n      stableDetailPointerCache.set(identity, { path: currentPath, expiresAt: Date.now() + 5 * 60_000 });\n      return currentPath;\n    } catch {\n      // Try the next public mirror.\n    } finally {\n      clearTimeout(timeout);\n    }\n  }\n\n  return fallbackPath;\n};\n\n`;
service = service.slice(0, exportIndex) + stableHelper + service.slice(exportIndex);

service = replaceOnce(
  service,
  "export async function loadCatalogItemDetail(summary: CatalogItem): Promise<CatalogItem | null> {\n  const detailPath = asString(summary?.detailPath);\n  if (!detailPath || summary.detailLoaded) return { ...summary, detailLoaded: true };\n\n  const memoryKey = `${summary.type}:${summary.id}:${detailPath}`;",
  "export async function loadCatalogItemDetail(summary: CatalogItem): Promise<CatalogItem | null> {\n  const summaryDetailPath = asString(summary?.detailPath);\n  if (!summaryDetailPath || summary.detailLoaded) return { ...summary, detailLoaded: true };\n\n  // Resolve the mutable stable pointer before trusting a cached/immutable shard.\n  // A cached catalog-index may legally be older than the latest media links.\n  const detailPath = await resolveStableDetailPath(summary, summaryDetailPath);\n  const memoryKey = `${summary.type}:${summary.id}:${detailPath}`;",
  'detail pointer-first load',
);

service = replaceOnce(
  service,
  "      return { ...normalized, detailPath, detailLoaded: true } as CatalogItem;",
  "      // Keep the summary path on the selected object so App does not downgrade\n      // a freshly resolved detail merely because its lightweight index was stale.\n      return { ...normalized, detailPath: summaryDetailPath, detailLoaded: true } as CatalogItem;",
  'preserve summary path on hydrated item',
);

service = service.replace(
  "`${candidate}${separator}v=${encodeURIComponent(targetPath)}&stable=1`,",
  "`${candidate}${separator}v=${encodeURIComponent(targetPath)}&stable=${Date.now()}`,",
);
await write('src/contentService.ts', service);

await write('index.ts', `import { registerRootComponent } from 'expo';\n\nimport App from './App';\n\nregisterRootComponent(App);\n`);

console.log('Applied direct Home rendering + pointer-first detail hydration repair.');
