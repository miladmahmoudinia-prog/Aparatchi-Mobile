import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const write = (path, content) => fs.writeFile(path, content, 'utf8');

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  // Use a function replacement so source-code sequences such as $`, $& and $'
  // are copied literally instead of being interpreted by String.replace().
  return source.replace(before, () => after);
};

let app = await read('App.tsx');

app = replaceOnce(
  app,
  "  const pureEpisode = episodeOnlyPattern.test(normalized);",
  "  const bareEpisodeNumberPattern = new RegExp(`^(?:${ordinal}|[۰-۹]+|[٠-٩]+)$`, 'i');\n  const pureEpisode = episodeOnlyPattern.test(normalized);",
  'bare episode number pattern',
);

app = replaceOnce(
  app,
  "    return withoutName !== normalized && episodeOnlyPattern.test(withoutName);",
  "    return withoutName !== normalized && (\n      episodeOnlyPattern.test(withoutName) || bareEpisodeNumberPattern.test(withoutName)\n    );",
  'series-name episode boilerplate',
);

const artworkStart = app.indexOf('const exactEpisodeThumbnailCache = new Map<string, any>();');
const artworkEnd = app.indexOf('function SeriesEpisodeShowcase({', artworkStart);
if (artworkStart < 0 || artworkEnd <= artworkStart) throw new Error('ExactEpisodeArtwork runtime block not found');
const fastArtwork = `function ExactEpisodeArtwork({\n  item,\n  artwork,\n}: {\n  item: CatalogItem;\n  artwork: string;\n}) {\n  // Episode cards are navigation controls, so mounting them must never start\n  // video decoders or thumbnail extraction. Paint artwork already seen on the\n  // detail page immediately, then layer the exact server frame when available.\n  const fallbackArtwork = item.backdrop || item.poster || item.posterFallback || '';\n  const exactArtwork = artwork ? optimizedImageUrl(artwork, 'backdrop') : '';\n\n  return (\n    <View style={styles.episodeShowcaseArtwork}>\n      <CatalogArtwork\n        primary={fallbackArtwork}\n        fallback={item.posterFallback || item.poster || item.backdrop}\n        localFallback={localArtworkForItem(item)}\n        style={StyleSheet.absoluteFill}\n        contentFit=\"cover\"\n        imageKind=\"backdrop\"\n      />\n      {exactArtwork ? (\n        <Image\n          source={{ uri: exactArtwork }}\n          style={StyleSheet.absoluteFill}\n          contentFit=\"cover\"\n          cachePolicy=\"memory-disk\"\n          transition={120}\n        />\n      ) : null}\n    </View>\n  );\n}\n\n`;
app = app.slice(0, artworkStart) + fastArtwork + app.slice(artworkEnd);
app = replaceOnce(
  app,
  '<ExactEpisodeArtwork item={item} group={group} artwork={artwork} />',
  '<ExactEpisodeArtwork item={item} artwork={artwork} />',
  'episode artwork callsite',
);

app = replaceOnce(
  app,
  '<View pointerEvents="box-none" style={styles.nextEpisodeOverlay}>',
  '<View pointerEvents="box-none" style={[styles.nextEpisodeOverlay, frameRect]}>',
  'next episode frame placement',
);
app = replaceOnce(
  app,
  "nextEpisodeOverlay: { ...absoluteFillObject, zIndex: 83, elevation: 83, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 18 },",
  "nextEpisodeOverlay: { position: 'absolute', zIndex: 83, elevation: 83, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12 },",
  'next episode overlay style',
);

const detailStart = app.indexOf('function DetailModal({');
const detailEnd = app.indexOf('function PersonProfileModal({', detailStart);
if (detailStart < 0 || detailEnd <= detailStart) throw new Error('DetailModal block not found');
let detail = app.slice(detailStart, detailEnd);
const preparingStart = detail.indexOf('            {!detailBodyReady ? (');
const readyFragment = '              <>\n            <View style={styles.detailActions}>';
const readyStart = detail.indexOf(readyFragment, preparingStart);
if (preparingStart < 0 || readyStart <= preparingStart) throw new Error('Detail preparing branch not found');
const preparingReplacement = `            {!detailBodyReady ? (\n              <>\n                <View style={styles.genreRow}>\n                  {(item.countryCodes || []).map((code, index) => ({ code, index })).filter(({ code }) => String(code).toUpperCase() !== 'JP').map(({ code, index }) => <Pressable key={\`country-loading-\${code}\`} onPress={() => browseAndClose(countryFilter(code))}><Text style={styles.detailGenre}>{item.countryLabels?.[index] || countryLabel(code, catalog)}</Text></Pressable>)}\n                  {item.genres.map((genre) => <Pressable key={\`genre-loading-\${genre}\`} onPress={() => browseAndClose(genreFilter(genre))}><Text style={styles.detailGenre}>{genre}</Text></Pressable>)}\n                </View>\n                <Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : \`داستان \${item.nameFa}\`}</Text>\n                <Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>\n                <View style={styles.detailPreparing}>\n                  <ActivityIndicator color={COLORS.gold} size=\"small\" />\n                  <Text style={styles.detailPreparingText}>در حال آماده‌کردن پخش و قسمت‌ها…</Text>\n                </View>\n              </>\n            ) : (\n              <>\n`;
detail = detail.slice(0, preparingStart) + preparingReplacement + detail.slice(readyStart + '              <>\n'.length);
app = app.slice(0, detailStart) + detail + app.slice(detailEnd);
app = replaceOnce(
  app,
  "detailPreparing: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10 },",
  "detailPreparing: { minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },",
  'compact detail loading state',
);

await write('App.tsx', app);

let service = await read('src/contentService.ts');
const stableStart = service.indexOf('const resolveStableDetailPath = async (summary: CatalogItem, fallbackPath: string) => {');
const stableEnd = service.indexOf('\nexport async function loadCatalogItemDetail', stableStart);
if (stableStart < 0 || stableEnd <= stableStart) throw new Error('Stable detail resolver block not found');
const fastStableResolver = `const fetchStableDetailPointerCandidate = async (candidate: string, summary: CatalogItem) => {\n  const controller = new AbortController();\n  const timeout = setTimeout(() => controller.abort(), 1800);\n  try {\n    const separator = candidate.includes('?') ? '&' : '?';\n    const response = await fetch(\n      \`\${candidate}\${separator}_aparatchi_pointer=\${Date.now()}\`,\n      {\n        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },\n        signal: controller.signal,\n      },\n    );\n    if (!response.ok) return null;\n    const pointer = await response.json() as Record<string, unknown>;\n    const currentPath = asString(pointer.detailPath);\n    const matchesSummary =\n      asString(pointer.type) === asString(summary.type) &&\n      asString(pointer.id) === asString(summary.id);\n    const pathIsSafe = /^catalog-items\\/[a-f0-9]{12}-[a-f0-9]{12}\\.json$/i.test(currentPath);\n    return matchesSummary && pathIsSafe ? currentPath : null;\n  } catch {\n    return null;\n  } finally {\n    clearTimeout(timeout);\n  }\n};\n\nconst firstValidStableDetailPath = (candidates: string[], summary: CatalogItem) => {\n  if (!candidates.length) return Promise.resolve<string | null>(null);\n  return new Promise<string | null>((resolve) => {\n    let pending = candidates.length;\n    let settled = false;\n    candidates.forEach((candidate) => {\n      void fetchStableDetailPointerCandidate(candidate, summary).then((path) => {\n        if (settled) return;\n        if (path) {\n          settled = true;\n          resolve(path);\n          return;\n        }\n        pending -= 1;\n        if (pending <= 0) {\n          settled = true;\n          resolve(null);\n        }\n      });\n    });\n  });\n};\n\nconst resolveStableDetailPath = async (summary: CatalogItem, fallbackPath: string) => {\n  const identityMatch = fallbackPath.match(/(?:^|\\/)([a-f0-9]{12})-[a-f0-9]{12}\\.json$/i);\n  if (!identityMatch) return fallbackPath;\n\n  const identity = identityMatch[1].toLowerCase();\n  const cached = stableDetailPointerCache.get(identity);\n  if (cached && cached.expiresAt > Date.now()) return cached.path;\n\n  const stablePath = \`catalog-stable/\${identity}.json\`;\n  const stableUrl = detailUrlFor(stablePath);\n  if (!stableUrl) return fallbackPath;\n\n  // Start Raw and CDN pointer reads together. Give the source-of-truth Raw URL\n  // a short head start, then accept the first valid cache-busted mirror. This\n  // keeps stale-pointer protection without making every first detail open wait\n  // through sequential multi-second network timeouts.\n  const candidates = remoteRepositoryUrlCandidates(stableUrl);\n  const rawCandidates = candidates.filter((candidate) => /raw\\.githubusercontent\\.com/i.test(candidate));\n  const mirrorCandidates = candidates.filter((candidate) => !/raw\\.githubusercontent\\.com/i.test(candidate));\n  const rawPromise = firstValidStableDetailPath(rawCandidates, summary);\n  const mirrorPromise = firstValidStableDetailPath(mirrorCandidates, summary);\n\n  const preferredRaw = await Promise.race([\n    rawPromise,\n    new Promise<null>((resolve) => setTimeout(() => resolve(null), 450)),\n  ]);\n  if (preferredRaw) {\n    stableDetailPointerCache.set(identity, { path: preferredRaw, expiresAt: Date.now() + 5 * 60_000 });\n    return preferredRaw;\n  }\n\n  const currentPath = await new Promise<string | null>((resolve) => {\n    let pending = 2;\n    let settled = false;\n    const accept = (path: string | null) => {\n      if (settled) return;\n      if (path) {\n        settled = true;\n        resolve(path);\n        return;\n      }\n      pending -= 1;\n      if (pending <= 0) {\n        settled = true;\n        resolve(null);\n      }\n    };\n    void rawPromise.then(accept);\n    void mirrorPromise.then(accept);\n  });\n\n  if (currentPath) {\n    stableDetailPointerCache.set(identity, { path: currentPath, expiresAt: Date.now() + 5 * 60_000 });\n    return currentPath;\n  }\n  return fallbackPath;\n};\n`;
service = service.slice(0, stableStart) + fastStableResolver + service.slice(stableEnd);
await write('src/contentService.ts', service);

console.log('Applied episode interaction, next-overlay, detail latency, and episode-label repairs.');
