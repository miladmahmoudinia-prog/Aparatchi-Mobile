import fs from 'node:fs/promises';

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};

const replaceRegexOnce = (source, pattern, replacement, label) => {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one match, found ${matches.length}`);
  return source.replace(pattern, replacement);
};

let app = await fs.readFile('App.tsx', 'utf8');

app = replaceOnce(
  app,
  `const catalogOverviewFor = (item: CatalogItem) => {\n  const overview = String(item.overview || '').replace(/\\s+/g, ' ').trim();\n  if (!isMissingCatalogOverview(overview)) return overview;\n  return 'خلاصهٔ معتبر این عنوان هنوز در منابع موجود ثبت نشده است. با تکمیل اطلاعات کاتالوگ، این بخش به‌صورت خودکار به‌روزرسانی می‌شود.';\n};`,
  `const catalogOverviewFor = (item: CatalogItem) => {\n  const overview = String(item.overview || '').replace(/\\s+/g, ' ').trim();\n  // Never flash provider placeholders or raw English copy in a Persian detail\n  // page. The whole Story section stays hidden until a real Persian synopsis\n  // is present, then appears naturally when detail hydration completes.\n  if (!isMissingCatalogOverview(overview) && hasPersianScript(overview)) return overview;\n  return '';\n};`,
  'hide invalid/non-Persian synopsis',
);

app = replaceOnce(
  app,
  `                <Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : \`داستان ${'${item.nameFa}'}\`}</Text>\n                <Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>`,
  `                {catalogOverviewFor(item) ? (\n                  <>\n                    <Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : \`داستان ${'${item.nameFa}'}\`}</Text>\n                    <Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>\n                  </>\n                ) : null}`,
  'hide loading-detail story block until valid synopsis',
);

app = replaceOnce(
  app,
  `            <Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : \`داستان ${'${item.nameFa}'}\`}</Text><Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>`,
  `            {catalogOverviewFor(item) ? (\n              <>\n                <Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : \`داستان ${'${item.nameFa}'}\`}</Text>\n                <Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>\n              </>\n            ) : null}`,
  'hide hydrated-detail story block until valid synopsis',
);

app = replaceRegexOnce(
  app,
  /const catalogItemTimestamp = \(item: CatalogItem\) => \{[\s\S]*?\n\};\n\nconst sortForCatalogFilter/,
  `const catalogItemTimestamp = (item: CatalogItem) => {\n  // Metadata enrichment must not pin an old title at the front. Movies are\n  // ordered by when Aparatchi/source actually discovered them; series may move\n  // forward only for a meaningful episode/content update.\n  const value = item.type === 'series'\n    ? (item.meaningfulUpdatedAt || item.sourceCreatedAt || item.createdAt || '')\n    : (item.sourceCreatedAt || item.createdAt || '');\n  const timestamp = Date.parse(value);\n  return Number.isFinite(timestamp) ? timestamp : 0;\n};\n\nconst sortForCatalogFilter`,
  'mobile freshness ordering',
);

app = replaceOnce(
  app,
  `      const firstContent = await loadContent(initialLoad);`,
  `      let foregroundBootstrapUsed = false;\n      let firstContent: LoadedContent;\n      if (!initialLoad && force && online) {\n        // A foreground reopen should refresh from the compact current bootstrap\n        // before the large index. This prevents a stale cached Home/IMDb frame\n        // from being visible for several seconds after returning to the app.\n        const bootstrapContent = await loadBootstrapContent();\n        if (bootstrapContent?.items.length) {\n          firstContent = bootstrapContent;\n          foregroundBootstrapUsed = true;\n        } else {\n          firstContent = await loadContent(false);\n        }\n      } else {\n        firstContent = await loadContent(initialLoad);\n      }`,
  'foreground bootstrap-first refresh',
);

app = replaceRegexOnce(
  app,
  /        \/\/ Bootstrap failed: prefer the already-resolved local\/persisted catalog[\s\S]*?        return;\n      \}\n\n      const firstApplied = applyContent\(firstContent\);/,
  `        // If the compact bootstrap is temporarily unavailable, do not reveal\n        // stale persisted Home while the already-started full remote request is\n        // still capable of succeeding. Only fall back to cache after that remote\n        // attempt actually settles.\n        try {\n          const freshContent = await freshContentPromise;\n          if (freshContent.source === 'remote' && applyContent(freshContent)) {\n            dismissStartup();\n            return;\n          }\n        } catch {\n          // Fall through to the persisted emergency fallback below.\n        }\n        if (applyContent(firstContent)) dismissStartup();\n        return;\n      }\n\n      const firstApplied = applyContent(firstContent);`,
  'cold start remote-before-stale fallback',
);

app = replaceOnce(
  app,
  `      if (firstApplied) {\n        dismissStartup();\n        if (initialLoad && firstContent.source === 'local') {`,
  `      if (firstApplied) {\n        dismissStartup();\n        if (foregroundBootstrapUsed) {\n          // Bootstrap is already current and safe to reveal; enrich the same\n          // catalog with the full index without blocking the foreground reopen.\n          void loadContent(false)\n            .then((freshContent) => {\n              if (freshContent.source !== 'local') applyBackgroundFullContent(freshContent);\n            })\n            .catch(() => undefined);\n          return;\n        }\n        if (initialLoad && firstContent.source === 'local') {`,
  'background full index after foreground bootstrap',
);

app = replaceOnce(
  app,
  `  const [activeTab, setActiveTab] = useState<MainTab>('home');\n  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');`,
  `  const [activeTab, setActiveTab] = useState<MainTab>('home');\n  const [categoriesMounted, setCategoriesMounted] = useState(false);\n  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');`,
  'persistent categories scene state',
);

app = replaceOnce(
  app,
  `  const [contentLoading, setContentLoading] = useState(false);\n  const [contentOffline, setContentOffline] = useState(false);\n  const [startupVisible, setStartupVisible] = useState(true);`,
  `  const [contentLoading, setContentLoading] = useState(false);\n  const [contentOffline, setContentOffline] = useState(false);\n  const [startupVisible, setStartupVisible] = useState(true);\n  const [foregroundRefreshVisible, setForegroundRefreshVisible] = useState(false);`,
  'foreground freshness gate state',
);

app = replaceOnce(
  app,
  `  const startupFallbackContentRef = useRef<LoadedContent | null>(null);\n  const vpnCheckSequenceRef = useRef(0);`,
  `  const startupFallbackContentRef = useRef<LoadedContent | null>(null);\n  const backgroundedAtRef = useRef<number | null>(null);\n  const vpnCheckSequenceRef = useRef(0);`,
  'background timestamp ref',
);

app = replaceOnce(
  app,
  `    const subscription = AppState.addEventListener('change', (state) => {\n      if (state === 'active') {\n        reloadContentWhenIdle();\n        void refreshVpnState();\n      }\n    });`,
  `    const subscription = AppState.addEventListener('change', (state) => {\n      if (state === 'active') {\n        const backgroundedAt = backgroundedAtRef.current;\n        backgroundedAtRef.current = null;\n        const returningFromBackground = Boolean(\n          startupDismissedRef.current &&\n          backgroundedAt &&\n          Date.now() - backgroundedAt >= 2500\n        );\n        if (returningFromBackground) {\n          // Keep stale Home behind the same lightweight cover until the current\n          // bootstrap has been applied. The large index continues in background.\n          setForegroundRefreshVisible(true);\n          void reloadContent(true).finally(() => setForegroundRefreshVisible(false));\n        } else {\n          reloadContentWhenIdle();\n        }\n        void refreshVpnState();\n      } else if (state === 'background' || state === 'inactive') {\n        if (backgroundedAtRef.current === null) backgroundedAtRef.current = Date.now();\n      }\n    });`,
  'foreground immediate freshness gate',
);

app = replaceOnce(
  app,
  `        {activeTab === 'categories' || (activeTab === 'search' && searchReturnTab === 'categories') ? (\n          <View\n            pointerEvents={activeTab === 'categories' ? 'auto' : 'none'}\n            style={[styles.tabScene, activeTab !== 'categories' && styles.tabSceneHidden]}\n          >\n            <CategoriesScreen catalog={content.items} peopleWorks={content.peopleWorks} onBrowse={openCatalogFilter} onOpen={openRootDetail} isActive={activeTab === 'categories'} />\n          </View>\n        ) : null}`,
  `        {categoriesMounted || activeTab === 'categories' || (activeTab === 'search' && searchReturnTab === 'categories') ? (\n          <View\n            pointerEvents={activeTab === 'categories' ? 'auto' : 'none'}\n            style={[styles.tabScene, activeTab !== 'categories' && styles.tabSceneHidden]}\n          >\n            <CategoriesScreen catalog={content.items} peopleWorks={content.peopleWorks} onBrowse={openCatalogFilter} onOpen={openRootDetail} isActive={activeTab === 'categories'} />\n          </View>\n        ) : null}`,
  'keep categories scene mounted after warmup',
);

app = replaceOnce(
  app,
  `  const reloadHomeContent = useCallback(() => { void reloadContent(true); }, [content.items.length, dismissStartup]);\n  const openMainMenu = useCallback(() => setMenuOpen(true), []);`,
  `  const reloadHomeContent = useCallback(() => { void reloadContent(true); }, [content.items.length, dismissStartup]);\n  const openMainMenu = useCallback(() => setMenuOpen(true), []);\n\n  useEffect(() => {\n    if (startupVisible || categoriesMounted || !content.items.length) return;\n    const task = InteractionManager.runAfterInteractions(() => setCategoriesMounted(true));\n    return () => task.cancel();\n  }, [categoriesMounted, content.items.length, startupVisible]);`,
  'warm categories scene after startup',
);

app = replaceOnce(
  app,
  `      {startupVisible ? <StartupScreen /> : null}`,
  `      {startupVisible || foregroundRefreshVisible ? <StartupScreen /> : null}`,
  'reuse startup cover for foreground freshness',
);

await fs.writeFile('App.tsx', app, 'utf8');

let service = await fs.readFile('src/contentService.ts', 'utf8');
const oldOverview = `overview: asString(item.overview, 'توضیحی ثبت نشده است.'),`;
const overviewCount = service.split(oldOverview).length - 1;
if (overviewCount !== 2) throw new Error(`overview normalization: expected 2 matches, found ${overviewCount}`);
service = service.split(oldOverview).join(`overview: asString(item.overview),`);

service = replaceOnce(
  service,
  `  const languageCode = languageCountry[originalLanguage];\n  if (languageCode && !codes.includes(languageCode)) codes = [languageCode, ...codes];`,
  `  const languageCode = languageCountry[originalLanguage];\n  // Language may fill missing country metadata, but must never override an\n  // explicit provider/TMDB country list (the old behavior created false IR/KR).\n  if (languageCode && !codes.length) codes = [languageCode];`,
  'mobile country normalization authority',
);
await fs.writeFile('src/contentService.ts', service, 'utf8');

console.log(JSON.stringify({
  startupFreshnessGate: true,
  coldStartNoStaleRevealBeforeRemoteSettles: true,
  foregroundBootstrapFirst: true,
  invalidOverviewHidden: true,
  nonPersianOverviewHidden: true,
  categoriesWarmMounted: true,
  metadataUpdatesDoNotPinOldTitles: true,
  countryNormalizationFixed: true,
}, null, 2));
