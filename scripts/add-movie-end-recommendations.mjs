import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (oldText, newText, label) => {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
};

if (source.includes('movieEndRecommendations')) {
  console.log('Movie end recommendations already applied.');
  process.exit(0);
}

const comparableMarker = `const normalizeComparableText = (value?: string) =>\n  String(value || '')\n    .toLowerCase()\n    .normalize('NFKC')\n    .replace(/[يى]/g, 'ی')\n    .replace(/ك/g, 'ک')\n    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')\n    .trim();`;

replaceOnce(
  comparableMarker,
  `${comparableMarker}\n\nconst RELATED_GENERIC_CATEGORY_KEYS = new Set([\n  'movies', 'series', 'iranian-movies', 'foreign-movies', 'iranian-series', 'foreign-series',\n  'latest', 'updated', 'mobile-operator',\n]);\n\nconst relatedCatalogItems = (item: CatalogItem, catalog: CatalogItem[], limit = 5) => {\n  const sourceGenres = new Set((item.genres || []).map(normalizeComparableText).filter(Boolean));\n  const sourceCategories = new Set((item.categoryKeys || []).filter((key) => !RELATED_GENERIC_CATEGORY_KEYS.has(key)));\n  const sourceCountries = new Set((item.countryCodes || []).map((code) => String(code).toUpperCase()));\n\n  const ranked = catalog\n    .filter((candidate) => candidate.id !== item.id && candidate.type === item.type)\n    .filter((candidate) => candidate.type !== 'series' || isSeriesPublished(candidate))\n    .map((candidate) => {\n      const candidateGenres = (candidate.genres || []).map(normalizeComparableText).filter(Boolean);\n      const sharedGenres = candidateGenres.filter((genre) => sourceGenres.has(genre)).length;\n      const sharedCategories = (candidate.categoryKeys || []).filter(\n        (key) => !RELATED_GENERIC_CATEGORY_KEYS.has(key) && sourceCategories.has(key),\n      ).length;\n      const sharedCountries = (candidate.countryCodes || []).filter((code) =>\n        sourceCountries.has(String(code).toUpperCase()),\n      ).length;\n      let score = sharedGenres * 5 + sharedCategories * 4 + sharedCountries * 2;\n      if (item.collectionId && candidate.collectionId === item.collectionId) score += 30;\n      if (item.ir === candidate.ir) score += 1;\n      if (item.isAnimation === candidate.isAnimation) score += 1;\n      if (item.isAnime === candidate.isAnime) score += 1;\n      return { candidate, score };\n    })\n    .sort((a, b) =>\n      b.score - a.score ||\n      Number(b.candidate.rate || 0) - Number(a.candidate.rate || 0) ||\n      Number(b.candidate.year || 0) - Number(a.candidate.year || 0),\n    );\n\n  const strong = ranked.filter((entry) => entry.score > 1);\n  const fallback = ranked.filter((entry) => entry.score <= 1);\n  return [...strong, ...fallback].slice(0, Math.max(0, limit)).map((entry) => entry.candidate);\n};`,
  'related recommendation helper',
);

replaceOnce(
`  onClose,\n  onProgress,\n  onEpisodeSelect,`,
`  onClose,\n  onProgress,\n  onEpisodeSelect,\n  relatedItems,\n  onRecommendationSelect,`,
  'video player props destructure',
);

replaceOnce(
`  onProgress: (request: VideoRequest, position: number, duration: number, completed?: boolean) => void;\n  onEpisodeSelect: (group: DownloadSection, language?: MediaLanguage) => void;\n}) {`,
`  onProgress: (request: VideoRequest, position: number, duration: number, completed?: boolean) => void;\n  onEpisodeSelect: (group: DownloadSection, language?: MediaLanguage) => void;\n  relatedItems: CatalogItem[];\n  onRecommendationSelect: (item: CatalogItem) => void;\n}) {`,
  'video player props type',
);

replaceOnce(
`  const [isMuted, setIsMuted] = useState(false);\n  const [playerVolume, setPlayerVolume] = useState(1);\n  const [currentTime, setCurrentTime] = useState(Math.max(0, Number(request.resumeAt || 0)));`,
`  const [isMuted, setIsMuted] = useState(false);\n  const [playerVolume, setPlayerVolume] = useState(1);\n  const [endRecommendationsDismissed, setEndRecommendationsDismissed] = useState(false);\n  const [currentTime, setCurrentTime] = useState(Math.max(0, Number(request.resumeAt || 0)));`,
  'movie recommendation state',
);

replaceOnce(
`  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;\n  const chromeVisible = !controlsLocked && !settingsOpen && !episodesOpen && (!firstFrameReady || switchingQuality || controlsVisible);`,
`  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;\n  const endCreditsMetadata = item as (CatalogItem & {\n    endCreditsStart?: number;\n    endCreditsStartSeconds?: number;\n    creditsStart?: number;\n  }) | null | undefined;\n  const declaredCreditsStart = Math.max(0, Number(\n    endCreditsMetadata?.endCreditsStartSeconds ??\n    endCreditsMetadata?.endCreditsStart ??\n    endCreditsMetadata?.creditsStart ??\n    0,\n  ));\n  const movieEndOverlayStart = declaredCreditsStart > 0 && declaredCreditsStart < duration\n    ? declaredCreditsStart\n    : Math.max(0, duration - 120);\n  const movieEndRecommendations = item?.type === 'movie' ? relatedItems.slice(0, 5) : [];\n  const showMovieEndRecommendations = Boolean(\n    item?.type === 'movie' &&\n    firstFrameReady &&\n    !networkOffline &&\n    !settingsOpen &&\n    !episodesOpen &&\n    !endRecommendationsDismissed &&\n    duration >= 180 &&\n    currentTime >= movieEndOverlayStart &&\n    currentTime < duration &&\n    movieEndRecommendations.length > 0\n  );\n  const chromeVisible = !controlsLocked && !settingsOpen && !episodesOpen && (!firstFrameReady || switchingQuality || controlsVisible);`,
  'movie recommendation timing',
);

replaceOnce(
`        {chromeVisible ? (\n          <View pointerEvents="box-none" style={styles.playerControlsLayer}>`,
`        {showMovieEndRecommendations ? (\n          <View pointerEvents="box-none" style={styles.movieEndRecommendations}>\n            <View style={[styles.movieEndRecommendationsCard, landscape && styles.movieEndRecommendationsCardLandscape]}>\n              <View style={styles.movieEndRecommendationsHeader}>\n                <Pressable\n                  onPress={() => setEndRecommendationsDismissed(true)}\n                  style={styles.movieEndRecommendationsClose}\n                  accessibilityLabel="بستن پیشنهادها"\n                >\n                  <Ionicons name="close" color="#fff" size={18} />\n                </Pressable>\n                <View style={styles.movieEndRecommendationsHeaderText}>\n                  <Text style={styles.movieEndRecommendationsTitle}>فیلم‌های پیشنهادی</Text>\n                  <Text style={styles.movieEndRecommendationsSubtitle}>مشابه همین فیلم</Text>\n                </View>\n              </View>\n              <ScrollView\n                horizontal\n                showsHorizontalScrollIndicator={false}\n                contentContainerStyle={styles.movieEndRecommendationsRail}\n              >\n                {movieEndRecommendations.map((recommendation) => (\n                  <Pressable\n                    key={recommendation.id}\n                    style={styles.movieEndRecommendationItem}\n                    onPress={() => {\n                      setEndRecommendationsDismissed(true);\n                      onRecommendationSelect(recommendation);\n                      closePlayer();\n                    }}\n                  >\n                    <CatalogArtwork\n                      primary={recommendation.poster}\n                      fallback={recommendation.posterFallback}\n                      style={styles.movieEndRecommendationPoster}\n                      contentFit="cover"\n                      imageKind="poster"\n                    />\n                    <Text numberOfLines={1} style={styles.movieEndRecommendationName}>{recommendation.nameFa}</Text>\n                  </Pressable>\n                ))}\n              </ScrollView>\n            </View>\n          </View>\n        ) : null}\n\n        {chromeVisible ? (\n          <View pointerEvents="box-none" style={styles.playerControlsLayer}>`,
  'movie recommendation overlay',
);

replaceOnce(
`          onClose={() => setVideoRequest(null)}\n          onProgress={updateWatchProgress}\n          onEpisodeSelect={(group, language) => {`,
`          onClose={() => setVideoRequest(null)}\n          onProgress={updateWatchProgress}\n          relatedItems={(() => {\n            const playerItem =\n              selectedItem && selectedItem.id === videoRequest.itemId\n                ? selectedItem\n                : content.items.find((candidate) => candidate.id === videoRequest.itemId);\n            return playerItem?.type === 'movie' ? relatedCatalogItems(playerItem, content.items, 5) : [];\n          })()}\n          onRecommendationSelect={(nextItem) => {\n            setSelectedPerson(null);\n            setSelectedItem(nextItem);\n          }}\n          onEpisodeSelect={(group, language) => {`,
  'video player related props',
);

replaceOnce(
`  playerOfflineOverlay: { position: 'absolute', zIndex: 95, elevation: 95, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.78)' },`,
`  playerOfflineOverlay: { position: 'absolute', zIndex: 95, elevation: 95, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.78)' },\n  movieEndRecommendations: { ...absoluteFillObject, zIndex: 82, elevation: 82, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 18 },\n  movieEndRecommendationsCard: { width: '100%', maxWidth: 610, padding: 14, borderRadius: 18, backgroundColor: 'rgba(10,12,16,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },\n  movieEndRecommendationsCardLandscape: { maxWidth: 760, padding: 12 },\n  movieEndRecommendationsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },\n  movieEndRecommendationsHeaderText: { flex: 1, alignItems: 'flex-end' },\n  movieEndRecommendationsTitle: { ...rtlText, color: '#fff', fontSize: 15.5, fontWeight: '900' },\n  movieEndRecommendationsSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 9.5, marginTop: 2 },\n  movieEndRecommendationsClose: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },\n  movieEndRecommendationsRail: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 1 },\n  movieEndRecommendationItem: { width: 92, alignItems: 'center' },\n  movieEndRecommendationPoster: { width: 92, height: 126, borderRadius: 11, backgroundColor: COLORS.surfaceStrong },\n  movieEndRecommendationName: { ...rtlText, width: '100%', color: '#fff', fontSize: 9.5, fontWeight: '800', textAlign: 'center', marginTop: 6 },`,
  'movie recommendation styles',
);

await fs.writeFile(path, source, 'utf8');
console.log('Movie end recommendations patch applied.');
