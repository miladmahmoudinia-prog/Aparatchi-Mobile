import fs from 'node:fs/promises';

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};
const replaceAllCount = (source, before, after, expected, label) => {
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return source.split(before).join(after);
};
const replaceRegexOnce = (source, pattern, replacement, label) => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const count = [...source.matchAll(new RegExp(pattern.source, flags))].length;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(pattern, replacement);
};

let types = await fs.readFile('src/types.ts', 'utf8');
types = replaceOnce(
  types,
  `  updateLabel?: string;\n  meaningfulUpdatedAt?: string;\n  categoryKeys?: string[];`,
  `  updateLabel?: string;\n  meaningfulUpdatedAt?: string;\n  /** زمان اولین کشف واقعی عنوان در آپاراتچی؛ برای ترتیب تازه‌ها. */\n  firstSeenAt?: string;\n  categoryKeys?: string[];`,
  'CatalogItem firstSeenAt type',
);
await fs.writeFile('src/types.ts', types);

let service = await fs.readFile('src/contentService.ts', 'utf8');
service = replaceOnce(
  service,
  `  catalogUpdatedAt?: string;\n  sizeBytes?: number;\n  clientSizeBytes?: number;`,
  `  catalogUpdatedAt?: string;\n  sizeBytes?: number;\n  clientSizeBytes?: number;\n  bootstrapRevision?: string;\n  bootstrapSizeBytes?: number;`,
  'manifest bootstrap fields type',
);
service = replaceAllCount(
  service,
  `      ...(asString(item.createdAt) ? { createdAt: asString(item.createdAt) } : {}),`,
  `      ...(asString(item.firstSeenAt) ? { firstSeenAt: asString(item.firstSeenAt) } : {}),\n      ...(asString(item.createdAt) ? { createdAt: asString(item.createdAt) } : {}),`,
  1,
  'summary firstSeenAt normalization',
);
service = replaceAllCount(
  service,
  `    ...(asString(item.createdAt) ? { createdAt: asString(item.createdAt) } : {}),`,
  `    ...(asString(item.firstSeenAt) ? { firstSeenAt: asString(item.firstSeenAt) } : {}),\n    ...(asString(item.createdAt) ? { createdAt: asString(item.createdAt) } : {}),`,
  1,
  'detail firstSeenAt normalization',
);
service = replaceOnce(
  service,
  `    const requestUrl = \`${'${candidate}${separator}'}_aparatchi_manifest=\${Math.floor(Date.now() / 300_000)}\`;\n    const controller = new AbortController();\n    const timeout = setTimeout(() => controller.abort(), 1800);`,
  `    const requestUrl = \`${'${candidate}${separator}'}_aparatchi_manifest=\${Date.now()}\`;\n    const controller = new AbortController();\n    // Manifest is tiny; allow Raw a bounded extra moment so startup can bind\n    // itself to source truth instead of a several-minutes-stale mirror entry.\n    const timeout = setTimeout(() => controller.abort(), 2800);`,
  'fresh manifest request token',
);
service = replaceOnce(
  service,
  `        ...(asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) > 0\n          ? { clientSizeBytes: asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) }\n          : {}),\n        ...(asString(record.clientIndex ?? record.client_index)`,
  `        ...(asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) > 0\n          ? { clientSizeBytes: asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) }\n          : {}),\n        ...(asString(record.bootstrapRevision ?? record.bootstrap_revision)\n          ? { bootstrapRevision: asString(record.bootstrapRevision ?? record.bootstrap_revision) }\n          : {}),\n        ...(asNumber(record.bootstrapSizeBytes ?? record.bootstrap_size_bytes, 0) > 0\n          ? { bootstrapSizeBytes: asNumber(record.bootstrapSizeBytes ?? record.bootstrap_size_bytes, 0) }\n          : {}),\n        ...(asString(record.clientIndex ?? record.client_index)`,
  'parse bootstrap manifest fields',
);
service = replaceRegexOnce(
  service,
  /\/\*\*\n \* Fetch the tiny Home bootstrap[\s\S]*?export async function loadBootstrapContent\(\): Promise<LoadedContent \| null> \{[\s\S]*?\n\}\n\nconst detailCacheUriFor/,
  `/**\n * Fetch the current Home/navigation bootstrap before the large index. Startup\n * first resolves the tiny manifest and only accepts a bootstrap whose catalog\n * timestamp matches it. This prevents a CDN/Raw race from painting a valid but\n * older Home for several seconds.\n */\nexport async function loadBootstrapContent(): Promise<LoadedContent | null> {\n  const remoteUrl = REMOTE_CONTENT_BOOTSTRAP_URL.trim();\n  if (!remoteUrl) return null;\n\n  let manifest: RemoteCatalogManifest | null = null;\n  try {\n    manifest = await fetchRemoteManifest();\n  } catch {\n    // Both public manifest mirrors can be unavailable; bootstrap still remains\n    // a better emergency source than the bundled catalog in that case.\n  }\n\n  const candidates = [...remoteRepositoryUrlCandidates(remoteUrl)].sort((a, b) =>\n    Number(/raw\\.githubusercontent\\.com/i.test(b)) - Number(/raw\\.githubusercontent\\.com/i.test(a))\n  );\n  const revisionToken = manifest?.bootstrapRevision || manifest?.clientRevision || manifest?.revision || String(Date.now());\n\n  for (const candidate of candidates) {\n    const controller = new AbortController();\n    const timeout = setTimeout(() => controller.abort(), 3600);\n    const separator = candidate.includes('?') ? '&' : '?';\n    try {\n      const response = await fetch(\n        candidate + separator + '_aparatchi_bootstrap=' + encodeURIComponent(revisionToken) + '&t=' + Date.now(),\n        {\n          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },\n          signal: controller.signal,\n        },\n      );\n      if (!response.ok) continue;\n      const parsed = parsePayload(JSON.parse(await response.text()));\n      if (!parsed?.items.length) continue;\n      if (\n        manifest?.catalogUpdatedAt &&\n        asString(parsed.updatedAt) !== asString(manifest.catalogUpdatedAt)\n      ) {\n        // This mirror is serving the previous generated artifact. Never reveal\n        // it just because its JSON is otherwise valid; try the next mirror.\n        continue;\n      }\n      return { ...parsed, source: 'remote' };\n    } catch {\n      // Try another repository mirror.\n    } finally {\n      clearTimeout(timeout);\n    }\n  }\n  return null;\n}\n\nconst detailCacheUriFor`,
  'manifest-bound bootstrap loader',
);
await fs.writeFile('src/contentService.ts', service);

let app = await fs.readFile('App.tsx', 'utf8');
app = replaceOnce(
  app,
  `const catalogItemTimestamp = (item: CatalogItem) => {\n  // Metadata enrichment must not pin an old title at the front. Movies are\n  // ordered by when Aparatchi/source actually discovered them; series may move\n  // forward only for a meaningful episode/content update.\n  const value = item.type === 'series'\n    ? (item.meaningfulUpdatedAt || item.sourceCreatedAt || item.createdAt || '')\n    : (item.sourceCreatedAt || item.createdAt || '');\n  const timestamp = Date.parse(value);\n  return Number.isFinite(timestamp) ? timestamp : 0;\n};`,
  `const catalogItemTimestamp = (item: CatalogItem) => {\n  // Repair historical false "updates": an old archive gap may have been filled\n  // today even though the episode itself was published months ago. Only trust a\n  // meaningful timestamp when the label is a real episode addition and the\n  // newest upstream episode timestamp is contemporaneous with Aparatchi's first\n  // discovery. Metadata/TMDB/sync timestamps never participate in ordering.\n  const firstSeenTimestamp = Date.parse(item.firstSeenAt || '') || 0;\n  const newestEpisodeSourceTimestamp = (item.downloads || []).reduce((latest, group) => {\n    if (!(Number(group.episodeNumber || 0) > 0)) return latest;\n    const timestamp = Date.parse(group.sourceUpdatedAt || '') || 0;\n    return Math.max(latest, timestamp);\n  }, 0);\n  const meaningfulTimestamp = Date.parse(item.meaningfulUpdatedAt || '') || 0;\n  const hasRealEpisodeLabel = /^قسمت\\s+.+\\s+اضافه\\s+شد$/u.test(String(item.updateLabel || '').trim());\n  const credibleSeriesUpdate = Boolean(\n    item.type === 'series' &&\n    meaningfulTimestamp > 0 &&\n    hasRealEpisodeLabel &&\n    (firstSeenTimestamp <= 0 || newestEpisodeSourceTimestamp <= 0 || newestEpisodeSourceTimestamp >= firstSeenTimestamp - 6 * 60 * 60 * 1000)\n  );\n  const value = item.type === 'series'\n    ? (credibleSeriesUpdate ? item.meaningfulUpdatedAt : '') || item.firstSeenAt || item.sourceCreatedAt || item.createdAt || ''\n    : item.firstSeenAt || item.sourceCreatedAt || item.createdAt || '';\n  const timestamp = Date.parse(value);\n  return Number.isFinite(timestamp) ? timestamp : 0;\n};`,
  'truthful mobile catalog freshness',
);
app = replaceOnce(
  app,
  `  updatedCandidates\n    .sort((a, b) => {\n      const aTime = Date.parse(a.meaningfulUpdatedAt || a.updatedAt || '') || 0;\n      const bTime = Date.parse(b.meaningfulUpdatedAt || b.updatedAt || '') || 0;\n      return bTime - aTime;\n    })`,
  `  updatedCandidates\n    .sort((a, b) => catalogItemTimestamp(b) - catalogItemTimestamp(a))`,
  'Home updated rail truthful order',
);
app = replaceOnce(
  app,
  `  primary,\n  fallback,\n  localFallback,`,
  `  primary,\n  fallback,\n  preview,\n  localFallback,`,
  'CatalogArtwork preview prop destructure',
);
app = replaceOnce(
  app,
  `  primary?: string;\n  fallback?: string;\n  localFallback?: any;`,
  `  primary?: string;\n  fallback?: string;\n  /** Fast lower layer shown while the preferred remote artwork is decoding. */\n  preview?: string;\n  localFallback?: any;`,
  'CatalogArtwork preview prop type',
);
app = replaceOnce(
  app,
  `      {remoteUrl ? (\n        <Image`,
  `      {preview && isSafeHttpUrl(preview) ? (\n        <Image\n          source={{ uri: optimizedImageUrl(preview, imageKind) || preview }}\n          style={StyleSheet.absoluteFill}\n          contentFit={contentFit}\n          cachePolicy="memory-disk"\n          transition={0}\n          recyclingKey={\`preview:\${preview}\`}\n        />\n      ) : null}\n\n      {remoteUrl ? (\n        <Image`,
  'CatalogArtwork render preview under primary',
);
app = replaceOnce(
  app,
  `            <Text numberOfLines={2} style={styles.heroOverview}>\n              {item.overview}\n            </Text>`,
  `            {catalogOverviewFor(item) ? (\n              <Text numberOfLines={2} style={styles.heroOverview}>\n                {catalogOverviewFor(item)}\n              </Text>\n            ) : null}`,
  'hide non-Persian Hero synopsis',
);
app = replaceOnce(
  app,
  `            <CatalogArtwork primary={item.backdrop} fallback={item.poster} style={StyleSheet.absoluteFill} contentFit="cover" imageKind="backdrop" />`,
  `            <CatalogArtwork primary={item.backdrop} fallback={item.poster} preview={item.poster} style={StyleSheet.absoluteFill} contentFit="cover" imageKind="backdrop" />`,
  'detail hero poster preview',
);
app = replaceOnce(
  app,
  `  initialScrollOffset,\n  onScrollOffset,\n  isActive,`,
  `  initialScrollOffset,\n  onScrollOffset,\n  scrollToTopSignal,\n  isActive,`,
  'HomeScreen scroll signal destructure',
);
app = replaceOnce(
  app,
  `  initialScrollOffset: number;\n  onScrollOffset: (offset: number) => void;\n  isActive: boolean;`,
  `  initialScrollOffset: number;\n  onScrollOffset: (offset: number) => void;\n  scrollToTopSignal: number;\n  isActive: boolean;`,
  'HomeScreen scroll signal type',
);
app = replaceOnce(
  app,
  `  useEffect(() => {\n    if (initialScrollOffset > 0) {\n      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: initialScrollOffset, animated: false }));\n    }\n  }, []);`,
  `  useEffect(() => {\n    if (initialScrollOffset > 0) {\n      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: initialScrollOffset, animated: false }));\n    }\n  }, []);\n\n  useEffect(() => {\n    if (!scrollToTopSignal) return;\n    listRef.current?.scrollToOffset({ offset: 0, animated: true });\n    onScrollOffset(0);\n  }, [onScrollOffset, scrollToTopSignal]);`,
  'HomeScreen scroll to top effect',
);
app = replaceOnce(
  app,
  `            initialScrollOffset={homeScrollOffsetRef.current}\n            onScrollOffset={rememberHomeScrollOffset}\n            isActive={activeTab === 'home'}`,
  `            initialScrollOffset={homeScrollOffsetRef.current}\n            onScrollOffset={rememberHomeScrollOffset}\n            scrollToTopSignal={homeScrollTopSignal}\n            isActive={activeTab === 'home'}`,
  'pass Home scroll signal',
);
app = replaceOnce(
  app,
  `  const [startupVisible, setStartupVisible] = useState(true);\n  const [foregroundRefreshVisible, setForegroundRefreshVisible] = useState(false);`,
  `  const [startupVisible, setStartupVisible] = useState(true);\n  const [homeScrollTopSignal, setHomeScrollTopSignal] = useState(0);`,
  'replace foreground cover state with Home signal',
);
app = replaceOnce(
  app,
  `  const reloadContent = async (force = true) => {\n    if (!force && Date.now() - lastContentLoadRef.current < 2 * 60 * 1000) return;\n    const online = await internetIsReachable();\n    setContentOffline(!online);\n    const initialLoad = lastContentLoadRef.current === 0;\n    const showRefreshIndicator = force && !initialLoad;`,
  `  const reloadContent = async (force = true, options: { silent?: boolean } = {}) => {\n    if (!force && Date.now() - lastContentLoadRef.current < 2 * 60 * 1000) return;\n    const online = await internetIsReachable();\n    setContentOffline(!online);\n    const initialLoad = lastContentLoadRef.current === 0;\n    const showRefreshIndicator = force && !initialLoad && !options.silent;`,
  'silent foreground refresh option',
);
app = replaceOnce(
  app,
  `      const mergedContent: LoadedContent = {\n        ...visibleContent,\n        items: currentContent.items,\n      };`,
  `      const mergedContent: LoadedContent = {\n        ...visibleContent,\n        // Preserve the already-mounted order/identity while enriching every row\n        // with the complete index fields (people preview, backdrop, overview,\n        // firstSeenAt…). This avoids a rail rebuild without freezing summaries.\n        items: currentContent.items.map((currentItem, index) => {\n          const incomingItem = visibleContent.items[index];\n          return incomingItem && incomingItem.id === currentItem.id && incomingItem.type === currentItem.type\n            ? { ...currentItem, ...incomingItem }\n            : currentItem;\n        }),\n      };`,
  'background full index enriches mounted rows',
);
app = replaceOnce(
  app,
  `        if (returningFromBackground) {\n          // Keep stale Home behind the same lightweight cover until the current\n          // bootstrap has been applied. The large index continues in background.\n          setForegroundRefreshVisible(true);\n          void reloadContent(true).finally(() => setForegroundRefreshVisible(false));\n        } else {`,
  `        if (returningFromBackground) {\n          // Returning from Recent Apps must preserve the exact tab/detail/scroll\n          // state. Refresh truth silently; only a true cold start owns Splash.\n          void reloadContent(true, { silent: true });\n        } else {`,
  'silent Recent Apps refresh',
);
app = replaceOnce(
  app,
  `      {startupVisible || foregroundRefreshVisible ? <StartupScreen /> : null}`,
  `      {startupVisible ? <StartupScreen /> : null}`,
  'startup cover only on cold start',
);
app = replaceOnce(
  app,
  `            key={tab.id}\n            disabled={selected}\n            onPressIn={() => onChange(tab.id)}`,
  `            key={tab.id}\n            onPressIn={() => onChange(tab.id)}`,
  'selected bottom tab remains tappable',
);
app = replaceOnce(
  app,
  `  const handleBottomTabChange = useCallback((tab: MainTab) => {\n    setSelectedItem(null);`,
  `  const handleBottomTabChange = useCallback((tab: MainTab) => {\n    if (tab === activeTabRef.current) {\n      if (tab === 'home') setHomeScrollTopSignal((value) => value + 1);\n      return;\n    }\n    setSelectedItem(null);`,
  'Home re-tap scrolls top without remount',
);
app = replaceOnce(
  app,
  `  heroSlider: { height: 448, position: 'relative', overflow: 'hidden', backgroundColor: COLORS.surface },`,
  `  heroSlider: { height: 420, position: 'relative', overflow: 'hidden', backgroundColor: COLORS.surface },`,
  'compact Hero height',
);
app = replaceOnce(
  app,
  `  heroContent: { paddingHorizontal: 20, paddingBottom: 34, alignItems: 'stretch' },`,
  `  heroContent: { paddingHorizontal: 20, paddingBottom: 30, alignItems: 'stretch' },`,
  'raise Hero content modestly',
);
await fs.writeFile('App.tsx', app);

console.log('Applied v12 mobile fixes.');
