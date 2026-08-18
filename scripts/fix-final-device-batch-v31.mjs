import fs from 'node:fs';

const path = 'App.tsx';
let src = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = src.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly 1 match, got ${count}`);
  src = src.replace(oldText, newText);
}

function replaceCount(oldText, newText, expected, label) {
  const count = src.split(oldText).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, got ${count}`);
  src = src.split(oldText).join(newText);
}

replaceOnce(
`  const posterBadges = itemPosterBadges(item);
  const latestEpisode = item.type === 'series' ? newestEpisodeGroup(item) : null;
  const latestEpisodeMeta = latestEpisode || item.latestEpisode || null;
  const posterNameFa = /[A-Za-z]/.test(item.nameFa || '') && item.collectionNameFa
    ? \`${'${item.collectionNameFa}'}${'${item.collectionOrder ? ` ${toPersianDigits(item.collectionOrder)}` : \'\'}'}\`
    : item.nameFa;`,
`  const posterBadges = itemPosterBadges(item);
  // Prefer compact catalog metadata. Sorting every episode group while a poster
  // is being mounted makes taps feel delayed on large series shelves.
  const latestEpisodeMeta = item.latestEpisode || (item.type === 'series' ? newestEpisodeGroup(item) : null);
  // A movie/series title must never be replaced by its collection label.
  const posterNameFa = String(item.nameFa || '').trim() || item.name;`,
'poster fast metadata + own title',
);

replaceOnce(
`    <Pressable onPress={onOpen} unstable_pressDelay={0} hitSlop={7} style={({ pressed }) => [styles.posterCard, { width }, pressed && styles.posterCardPressed]}>`,
`    <Pressable
      onPress={onOpen}
      unstable_pressDelay={0}
      hitSlop={12}
      pressRetentionOffset={{ top: 24, right: 24, bottom: 24, left: 24 }}
      android_ripple={{ color: 'rgba(216,180,90,0.12)', borderless: false }}
      style={({ pressed }) => [styles.posterCard, { width }, pressed && styles.posterCardPressed]}
    >`,
'poster press target',
);

replaceOnce(
`  const openNestedDetail = useCallback((nextItem: CatalogItem) => {
    const current = navigationStateRef.current.selectedItem;
    if (current && String(current.id) !== String(nextItem.id)) {
      detailHistoryRef.current = [...detailHistoryRef.current.slice(-19), current];
    }
    setSelectedItem(nextItem);
  }, []);

  const closeOrBackDetail = useCallback(() => {`,
`  const openNestedDetail = useCallback((nextItem: CatalogItem) => {
    const current = navigationStateRef.current.selectedItem;
    if (current && String(current.id) !== String(nextItem.id)) {
      detailHistoryRef.current = [...detailHistoryRef.current.slice(-19), current];
    }
    setSelectedItem(nextItem);
  }, []);

  // Related cards are a replacement of the current detail, not a navigation
  // stack. One Back always returns to the screen that originally opened detail.
  const openRelatedDetail = useCallback((nextItem: CatalogItem) => {
    detailHistoryRef.current = [];
    setSelectedItem(nextItem);
  }, []);

  const closeOrBackDetail = useCallback(() => {`,
'related detail navigation',
);
replaceOnce('        onOpenRelated={openNestedDetail}', '        onOpenRelated={openRelatedDetail}', 'related handler');

const previewPattern = /  const categoryPreviewItems = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[categoryPreviewPool\]\);/;
const previewMatches = src.match(previewPattern);
if (!previewMatches) throw new Error('category preview block not found');
src = src.replace(previewPattern, `  const categoryPreviewItems = useMemo(() => {
    const result = new Map<SearchFilter, CatalogItem>();
    const scoreByFilter = new Map<SearchFilter, number>();
    const previewFilters = CATEGORY_CARDS.map((card) => card.filter);

    for (const item of categoryPreviewPool) {
      if (!hasFastCategoryArtwork(item)) continue;
      const keys = item.categoryKeys || [];
      for (const filter of previewFilters) {
        const matches = SERVER_CATEGORY_FILTERS.has(filter) && keys.length
          ? keys.includes(filter)
          : fastCatalogFilterMatch(item, filter);
        if (!matches) continue;
        const score = categoryPreviewScore(item);
        if (score <= (scoreByFilter.get(filter) ?? Number.NEGATIVE_INFINITY)) continue;
        result.set(filter, item);
        scoreByFilter.set(filter, score);
      }
    }

    // The first 1200 rows keep Categories fast. Only filters with no artwork
    // get one bounded fallback scan over the complete catalog, so Kids,
    // Programs and Iranian Series never fall back to a blank icon card merely
    // because their first matching poster is older than the preview window.
    const missing = new Set(previewFilters.filter((filter) => !result.has(filter)));
    if (missing.size) {
      for (const item of usableCatalog) {
        if (!hasFastCategoryArtwork(item)) continue;
        const keys = item.categoryKeys || [];
        for (const filter of [...missing]) {
          if (keys.includes(filter) || fastCatalogFilterMatch(item, filter)) {
            result.set(filter, item);
            missing.delete(filter);
          }
        }
        if (!missing.size) break;
      }
    }
    return result;
  }, [categoryPreviewPool, usableCatalog]);`);

replaceOnce(
`const exactEpisodeArtworkFor = (group: DownloadSection, item: CatalogItem) => {
  const artwork = String(group.artwork || '').trim();
  const exactGeneratedFrame = /(?:^|\\/)assets\\/media\\/episodes\\/[a-f0-9]{24}\\.jpg(?:$|[?#])/i.test(artwork);
  if (exactGeneratedFrame) return artwork;
  return '';
};`,
`const exactEpisodeArtworkFor = (group: DownloadSection, item: CatalogItem) => {
  const artwork = optimizedImageUrl(String(group.artwork || '').trim(), 'backdrop');
  if (!artwork) return '';
  const exactGeneratedFrame = /(?:^|\\/)assets\\/media\\/episodes\\/[a-f0-9]{24}\\.jpg(?:$|[?#])/i.test(artwork);
  if (exactGeneratedFrame) return artwork;
  if (!isSafeHttpUrl(artwork) || isPlaceholderUrl(artwork)) return '';

  // Accept a real per-episode remote still while continuing to reject a series
  // poster/backdrop recycled as episode artwork.
  const seriesArtwork = new Set([
    item.poster,
    item.posterFallback,
    item.backdrop,
    item.backdropFallback,
  ].map((value) => optimizedImageUrl(value, 'backdrop')).filter(Boolean));
  return seriesArtwork.has(artwork) ? '' : artwork;
};`,
'episode artwork fallback',
);

replaceOnce(
`  const endCreditsMetadata = item as (CatalogItem & {
    endCreditsStart?: number;
    endCreditsStartSeconds?: number;
    creditsStart?: number;
  }) | null | undefined;
  const declaredCreditsStart = Math.max(0, Number(
    endCreditsMetadata?.endCreditsStartSeconds ??
    endCreditsMetadata?.endCreditsStart ??
    endCreditsMetadata?.creditsStart ??
    0,
  ));
  const movieEndOverlayStart = declaredCreditsStart > 0 && declaredCreditsStart < duration
    ? declaredCreditsStart
    : Math.max(0, duration - 120);`,
`  // Do not cover the actual ending on titles with no credits. End cards appear
  // only in the final five seconds and stay visible after playback completes.
  const movieEndOverlayStart = Math.max(0, duration - 5);`,
'end overlay timing',
);

replaceCount(
`    duration >= 180 &&
    currentTime >= movieEndOverlayStart &&
    currentTime < duration`,
`    duration > 0 &&
    currentTime >= movieEndOverlayStart`,
2,
'end overlay visibility',
);

replaceOnce(
`          <View pointerEvents="box-none" style={[styles.nextEpisodeOverlay, frameRect]}>`,
`          <View
            pointerEvents="box-none"
            style={[
              styles.nextEpisodeOverlay,
              frameRect,
              landscape ? {
                paddingLeft: safeLeft,
                paddingRight: safeRight,
                paddingBottom: Math.max(10, insets.bottom + 8),
              } : null,
            ]}
          >`,
'next episode safe area',
);

replaceOnce(
`          <View pointerEvents="box-none" style={styles.movieEndRecommendations}>`,
`          <View
            pointerEvents="box-none"
            style={[
              styles.movieEndRecommendations,
              frameRect,
              landscape ? {
                paddingLeft: safeLeft,
                paddingRight: safeRight,
                paddingBottom: Math.max(10, insets.bottom + 8),
              } : null,
            ]}
          >`,
'movie recommendation frame',
);

const styleReplacements = new Map([
  ["  nextEpisodeOverlay: { position: 'absolute', zIndex: 83, elevation: 83, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12 },", "  nextEpisodeOverlay: { position: 'absolute', zIndex: 83, elevation: 83, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },"],
  ["  nextEpisodeCard: { width: '100%', maxWidth: 610, minHeight: 142, flexDirection: 'row-reverse', alignItems: 'center', gap: 13, padding: 13, borderRadius: 18, backgroundColor: 'rgba(10,12,16,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },", "  nextEpisodeCard: { width: '100%', maxWidth: 520, minHeight: 112, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: 'rgba(10,12,16,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },"],
  ["  nextEpisodeCardLandscape: { maxWidth: 720, minHeight: 134 },", "  nextEpisodeCardLandscape: { maxWidth: 560, minHeight: 108 },"],
  ["  nextEpisodeClose: { position: 'absolute', top: 9, left: 9, zIndex: 3, width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },", "  nextEpisodeClose: { position: 'absolute', top: 8, left: 8, zIndex: 3, width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },"],
  ["  nextEpisodeArtwork: { width: 178, height: 104, borderRadius: 12, backgroundColor: COLORS.surfaceStrong },", "  nextEpisodeArtwork: { width: 132, height: 78, borderRadius: 11, backgroundColor: COLORS.surfaceStrong },"],
  ["  nextEpisodeTitle: { ...rtlText, color: '#fff', fontSize: 14, lineHeight: 22, fontWeight: '900', textAlign: 'right' },", "  nextEpisodeTitle: { ...rtlText, color: '#fff', fontSize: 12.5, lineHeight: 19, fontWeight: '900', textAlign: 'right' },"],
  ["  nextEpisodePlayButton: { minWidth: 154, height: 42, marginTop: 11, paddingHorizontal: 18, borderRadius: 21, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.gold },", "  nextEpisodePlayButton: { minWidth: 128, height: 36, marginTop: 8, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.gold },"],
  ["  movieEndRecommendations: { ...absoluteFillObject, zIndex: 82, elevation: 82, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 18 },", "  movieEndRecommendations: { position: 'absolute', zIndex: 82, elevation: 82, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },"],
  ["  movieEndRecommendationsCard: { width: '100%', maxWidth: 610, padding: 14, borderRadius: 18, backgroundColor: 'rgba(10,12,16,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },", "  movieEndRecommendationsCard: { width: '100%', maxWidth: 540, padding: 10, borderRadius: 16, backgroundColor: 'rgba(10,12,16,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },"],
  ["  movieEndRecommendationsCardLandscape: { maxWidth: 760, padding: 12 },", "  movieEndRecommendationsCardLandscape: { maxWidth: 620, padding: 9 },"],
  ["  movieEndRecommendationsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },", "  movieEndRecommendationsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },"],
  ["  movieEndRecommendationsTitle: { ...rtlText, color: '#fff', fontSize: 15.5, fontWeight: '900' },", "  movieEndRecommendationsTitle: { ...rtlText, color: '#fff', fontSize: 14, fontWeight: '900' },"],
  ["  movieEndRecommendationsClose: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },", "  movieEndRecommendationsClose: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },"],
  ["  movieEndRecommendationsRail: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 1 },", "  movieEndRecommendationsRail: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 1 },"],
  ["  movieEndRecommendationItem: { width: 92, alignItems: 'center' },", "  movieEndRecommendationItem: { width: 72, alignItems: 'center' },"],
  ["  movieEndRecommendationPoster: { width: 92, height: 126, borderRadius: 11, backgroundColor: COLORS.surfaceStrong },", "  movieEndRecommendationPoster: { width: 72, height: 98, borderRadius: 10, backgroundColor: COLORS.surfaceStrong },"],
  ["  movieEndRecommendationName: { ...rtlText, width: '100%', color: '#fff', fontSize: 9.5, fontWeight: '800', textAlign: 'center', marginTop: 6 },", "  movieEndRecommendationName: { ...rtlText, width: '100%', color: '#fff', fontSize: 9, fontWeight: '800', textAlign: 'center', marginTop: 5 },"],
]);
for (const [oldText, newText] of styleReplacements) replaceOnce(oldText, newText, `style: ${oldText.slice(2, 34)}`);

fs.writeFileSync(path, src);
console.log('final device batch v31 applied');
