import fs from 'node:fs/promises';

const read = (file) => fs.readFile(file, 'utf8');
const write = (file, value) => fs.writeFile(file, value, 'utf8');

function mustReplace(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error(`Missing patch target: ${label}`);
  return text.replace(before, after);
}

let source = await read('App.tsx');

// 1) Foreign media truth: only Persian dub/subtitle may appear. Never manufacture
// an "original"/neutral choice and never fall back to an unlabeled stream URL.
source = mustReplace(source,
`  const unlabeledSources = playbackSourcesForFiles(files.filter((file) => !file.language));
  if (unlabeledSources.length) {
    versions.push({
      label: 'پخش آنلاین',
      sources: unlabeledSources,
      defaultSource: defaultPlaybackSource(unlabeledSources),
    });
  }`,
`  const unlabeledSources = isIranianItem(item)
    ? playbackSourcesForFiles(files.filter((file) => !file.language))
    : [];
  if (unlabeledSources.length) {
    versions.push({
      label: 'پخش آنلاین',
      sources: unlabeledSources,
      defaultSource: defaultPlaybackSource(unlabeledSources),
    });
  }`,
  'foreign neutral playback removal');
source = mustReplace(source,
`  if (
    item.streamUrl &&
    isSafeHttpUrl(item.streamUrl) &&
    isDirectMediaUrl(item.streamUrl) &&
    !isPlaceholderUrl(item.streamUrl)
  ) {`,
`  if (
    isIranianItem(item) &&
    item.streamUrl &&
    isSafeHttpUrl(item.streamUrl) &&
    isDirectMediaUrl(item.streamUrl) &&
    !isPlaceholderUrl(item.streamUrl)
  ) {`,
  'foreign streamUrl fallback removal');
source = mustReplace(source,
`const languageSectionsForFiles = (
  files: DownloadFile[],
  idPrefix: string,
  _iranian = false,
): DownloadSection[] => {`,
`const languageSectionsForFiles = (
  files: DownloadFile[],
  idPrefix: string,
  iranian = false,
): DownloadSection[] => {`,
  'language section Iranian flag');
source = mustReplace(source,
`  const plainFiles = sortedDownloadFiles(reconciled.filter((file) => !file.language));
  if (plainFiles.length) {`,
`  const plainFiles = iranian
    ? sortedDownloadFiles(reconciled.filter((file) => !file.language))
    : [];
  if (plainFiles.length) {`,
  'foreign original downloads removal');

// 2) Episode cards must never lie with a repeated series poster. Exact generated
// frame or a neutral placeholder only; the Content job fills the exact frames.
source = mustReplace(source,
`  if (exactGeneratedFrame) return artwork;
  return item.backdrop || item.poster || item.backdropFallback || item.posterFallback || '';`,
`  if (exactGeneratedFrame) return artwork;
  return '';`,
  'exact episode artwork only');

// 3) Cast/crew rail: stay physically at the right edge instead of guessing a
// pixel contentOffset, which landed in the middle on different phone widths.
source = mustReplace(source,
`  if (!people.length) return null;

  return (`,
`  const peopleRailRef = useRef<FlatList<CatalogPerson>>(null);
  if (!people.length) return null;

  return (`,
  'people rail ref');
source = mustReplace(source,
`      <FlatList
        horizontal
        data={[...people].reverse()}
        contentOffset={{ x: people.length * 100, y: 0 }}`, 
`      <FlatList
        ref={peopleRailRef}
        horizontal
        data={[...people].reverse()}
        onContentSizeChange={() => peopleRailRef.current?.scrollToEnd({ animated: false })}`, 
  'people rail right edge');

// 4) Stars and their works use the same right-edge strategy.
source = mustReplace(source,
`  const displayedPeople = useMemo(() => [...resolvedPeople].reverse(), [resolvedPeople]);`,
`  const displayedPeople = useMemo(() => [...resolvedPeople].reverse(), [resolvedPeople]);
  const starPeopleRailRef = useRef<FlatList<FeaturedPerson>>(null);
  const starWorksRailRef = useRef<FlatList<CatalogItem>>(null);`,
  'star rail refs');
source = mustReplace(source,
`      <FlatList
        horizontal
        style={styles.starPeopleRail}
        data={displayedPeople}
        contentOffset={{ x: displayedPeople.length * 66, y: 0 }}`, 
`      <FlatList
        ref={starPeopleRailRef}
        horizontal
        style={styles.starPeopleRail}
        data={displayedPeople}
        onContentSizeChange={() => starPeopleRailRef.current?.scrollToEnd({ animated: false })}`, 
  'stars right edge');
source = mustReplace(source,
`        <FlatList
          horizontal
          style={styles.starWorksRail}
          data={displayedWorks}
          contentOffset={{ x: displayedWorks.length * 113, y: 0 }}`, 
`        <FlatList
          ref={starWorksRailRef}
          horizontal
          style={styles.starWorksRail}
          data={displayedWorks}
          onContentSizeChange={() => starWorksRailRef.current?.scrollToEnd({ animated: false })}`, 
  'star works right edge');

// 5) Categories: exact-category covers only. A missing image becomes the category
// icon; never borrow an unrelated movie merely to fill the card.
source = mustReplace(source,
`  const categoryPreviewPool = useMemo(
    () => sortForCatalogFilter(usableCatalog.slice(0, 900), 'latest'),
    [usableCatalog],
  );`,
`  const categoryPreviewPool = useMemo(
    () => usableCatalog.slice(0, 1200),
    [usableCatalog],
  );`,
  'lighter category preview pool');

const oldPreviewFallback = `    const pickAnyUnused = () => {
      let best: CatalogItem | undefined;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const item of categoryPreviewPool) {
        if (usedItems.has(item.id) || !hasFastCategoryArtwork(item)) continue;
        const artwork = artworkKey(item);
        if (!artwork || usedArtwork.has(artwork)) continue;
        const score = categoryPreviewScore(item);
        if (score > bestScore) {
          best = item;
          bestScore = score;
        }
      }
      return best;
    };

    for (const card of CATEGORY_CARDS) {
      const selected = pickBestUnused(card.filter);
      if (!selected) continue;
      result.set(card.filter, selected);
      usedItems.add(selected.id);
      const artwork = artworkKey(selected);
      if (artwork) usedArtwork.add(artwork);
    }

    // A small category may have only one usable artwork and that same title may
    // already illustrate another shelf. Prefer a relevant reused image over an
    // empty icon card; only then fall back through closely related categories.
    const pickBestAvailable = (filter: SearchFilter) => {
      let best: CatalogItem | undefined;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const item of categoryPreviewPool) {
        if (!matchesCatalogFilter(item, filter) || !hasFastCategoryArtwork(item)) continue;
        const artwork = artworkKey(item);
        if (!artwork) continue;
        const score = categoryPreviewScore(item);
        if (score > bestScore) { best = item; bestScore = score; }
      }
      return best;
    };
    for (const card of CATEGORY_CARDS) {
      if (result.has(card.filter)) continue;
      let selected = pickBestAvailable(card.filter);
      if (!selected) {
        for (const related of relatedCategoryFilters(card.filter)) {
          selected = pickBestAvailable(related);
          if (selected) break;
        }
      }
      selected ||= pickAnyUnused();
      if (selected) result.set(card.filter, selected);
    }`;
const newPreviewFallback = `    for (const card of CATEGORY_CARDS) {
      const selected = pickBestUnused(card.filter);
      if (!selected) continue;
      result.set(card.filter, selected);
      usedItems.add(selected.id);
      const artwork = artworkKey(selected);
      if (artwork) usedArtwork.add(artwork);
    }

    // If an exact category has only an artwork already used by another exact
    // category, reuse that exact-category artwork. Never cross category lines.
    const pickBestAvailable = (filter: SearchFilter) => {
      let best: CatalogItem | undefined;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const item of categoryPreviewPool) {
        if (!matchesCatalogFilter(item, filter) || !hasFastCategoryArtwork(item)) continue;
        const artwork = artworkKey(item);
        if (!artwork) continue;
        const score = categoryPreviewScore(item);
        if (score > bestScore) { best = item; bestScore = score; }
      }
      return best;
    };
    for (const card of CATEGORY_CARDS) {
      if (result.has(card.filter)) continue;
      const selected = pickBestAvailable(card.filter);
      if (selected) result.set(card.filter, selected);
    }`;
source = mustReplace(source, oldPreviewFallback, newPreviewFallback, 'exact category artwork fallback');

// 6) Category scroll restoration must run when the tab becomes visible again.
source = mustReplace(source,
`const CategoriesScreen = memo(function CategoriesScreen({
  catalog,
  onBrowse,
  onOpen,
}: {
  catalog: CatalogItem[];
  onBrowse: (filter: SearchFilter) => void;
  onOpen: (item: CatalogItem) => void;
}) {`,
`const CategoriesScreen = memo(function CategoriesScreen({
  catalog,
  onBrowse,
  onOpen,
  isActive,
}: {
  catalog: CatalogItem[];
  onBrowse: (filter: SearchFilter) => void;
  onOpen: (item: CatalogItem) => void;
  isActive: boolean;
}) {`,
  'categories active prop');
source = mustReplace(source,
`  const categoriesListRef = useRef<FlatList<(typeof CATEGORY_CARDS)[number]>>(null);`,
`  const categoriesListRef = useRef<FlatList<(typeof CATEGORY_CARDS)[number]>>(null);
  const liveCategoriesOffsetRef = useRef(categoriesScreenScrollOffset);`,
  'live categories offset');
source = mustReplace(source,
`  useEffect(() => {
    if (deferredQuery || categoriesScreenScrollOffset <= 0) return undefined;`,
`  useEffect(() => {
    if (!isActive || deferredQuery || categoriesScreenScrollOffset <= 0) return undefined;`,
  'restore categories only when active');
source = mustReplace(source,
`  }, [columnCount, deferredQuery]);`,
`  }, [columnCount, deferredQuery, isActive]);`,
  'categories restore dependencies');
source = mustReplace(source,
`  const rememberCategoriesOffset = useCallback((event: any) => {
    if (deferredQuery) return;
    categoriesScreenScrollOffset = Math.max(0, Number(event.nativeEvent.contentOffset.y || 0));
  }, [deferredQuery]);`,
`  const rememberCategoriesOffset = useCallback((event: any) => {
    if (deferredQuery) return;
    const next = Math.max(0, Number(event.nativeEvent.contentOffset.y || 0));
    liveCategoriesOffsetRef.current = next;
    categoriesScreenScrollOffset = next;
  }, [deferredQuery]);`,
  'remember exact category offset');
source = mustReplace(source,
`            onPress={() => onBrowse(card.filter)}`, 
`            onPress={() => {
              categoriesScreenScrollOffset = liveCategoriesOffsetRef.current;
              onBrowse(card.filter);
            }}`, 
  'save category position before browse');
source = mustReplace(source,
`            <CategoriesScreen catalog={content.items} onBrowse={openCatalogFilter} onOpen={setSelectedItem} />`,
`            <CategoriesScreen catalog={content.items} onBrowse={openCatalogFilter} onOpen={setSelectedItem} isActive={activeTab === 'categories'} />`,
  'pass categories active state');

// 7) Home vertical virtualization is safe and removes offscreen poster trees,
// fixing bottom-tab tap latency and main-page scroll jank without hiding content.
source = mustReplace(source,
`        windowSize={4}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="always"`,
`        windowSize={4}
        removeClippedSubviews
        keyboardShouldPersistTaps="always"`,
  'home vertical clipping');

// 8) Genuine operator portals may redirect to HTTPS CDN/session hosts. Trust the
// verified Upera/redl entry URL, then allow its HTTPS redirect chain.
source = mustReplace(source,
`  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);`,
`  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const trustedOperatorNavigationRef = useRef(isTrustedOperatorHostUrl(request.url));`,
  'operator redirect state');
source = mustReplace(source,
`              onShouldStartLoadWithRequest={(navigation) =>
                isTrustedOperatorHostUrl(navigation.url)
              }`,
`              onShouldStartLoadWithRequest={(navigation) => {
                if (isTrustedOperatorHostUrl(navigation.url)) {
                  trustedOperatorNavigationRef.current = true;
                  return true;
                }
                return trustedOperatorNavigationRef.current && /^https:\/\//i.test(navigation.url);
              }}`, 
  'operator HTTPS redirects');

// Version the APK so the corrected build is unmistakable.
let pkg = await read('package.json');
pkg = pkg.replace(/"version": "0\.15\.3"/, '"version": "0.15.4"');
let app = await read('app.json');
app = app.replace(/"version": "0\.15\.3"/, '"version": "0.15.4"');
app = app.replace(/"versionCode": 23/, '"versionCode": 24');

const regression = `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('foreign original/neutral media is not exposed', () => {
  assert.ok(source.includes('const unlabeledSources = isIranianItem(item)'));
  assert.ok(source.includes('isIranianItem(item) &&\\n    item.streamUrl'));
  assert.ok(source.includes('const plainFiles = iranian'));
});

test('detail cast and stars start at the physical right edge', () => {
  assert.ok(!source.includes('contentOffset={{ x: people.length * 100'));
  assert.ok(!source.includes('contentOffset={{ x: displayedPeople.length * 66'));
  assert.ok(!source.includes('contentOffset={{ x: displayedWorks.length * 113'));
  assert.ok(source.includes('peopleRailRef.current?.scrollToEnd({ animated: false })'));
  assert.ok(source.includes('starPeopleRailRef.current?.scrollToEnd({ animated: false })'));
  assert.ok(source.includes('starWorksRailRef.current?.scrollToEnd({ animated: false })'));
});

test('episode cards never reuse the series poster as an episode still', () => {
  const start = source.indexOf('const exactEpisodeArtworkFor');
  const end = source.indexOf('function SeriesEpisodeShowcase', start);
  const block = source.slice(start, end);
  assert.ok(block.includes("return '';"));
  assert.ok(!block.includes('return item.backdrop'));
});

test('category artwork never falls through to unrelated categories', () => {
  const start = source.indexOf('const categoryPreviewItems');
  const end = source.indexOf('const searchResults', start);
  const block = source.slice(start, end);
  assert.ok(!block.includes('pickAnyUnused'));
  assert.ok(!block.includes('relatedCategoryFilters(card.filter)'));
});

test('category scroll restores whenever category tab becomes active', () => {
  assert.ok(source.includes('isActive={activeTab === \'categories\'}'));
  assert.ok(source.includes('if (!isActive || deferredQuery || categoriesScreenScrollOffset <= 0)'));
  assert.ok(source.includes('categoriesScreenScrollOffset = liveCategoriesOffsetRef.current'));
});

test('operator webview accepts verified HTTPS redirect chain', () => {
  assert.ok(source.includes('trustedOperatorNavigationRef.current && /^https:\\\/\\\\//i.test(navigation.url)'));
});

test('home uses vertical clipping for responsive scrolling', () => {
  assert.ok(source.includes('windowSize={4}\\n        removeClippedSubviews\\n        keyboardShouldPersistTaps="always"'));
});
`;
await fs.mkdir('scripts/tests', { recursive: true });
await write('scripts/tests/final-user-batch-20260814.test.mjs', regression);

await write('App.tsx', source);
await write('package.json', pkg);
await write('app.json', app);
console.log('Applied final 2026-08-14 mobile regression/performance/navigation patch.');
