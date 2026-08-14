import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (oldText, newText, label) => {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
};

if (source.includes('showNextEpisodeOverlay')) {
  console.log('Series next episode overlay already applied.');
  process.exit(0);
}

replaceOnce(
`  const [playerVolume, setPlayerVolume] = useState(1);\n  const [endRecommendationsDismissed, setEndRecommendationsDismissed] = useState(false);\n  const [currentTime, setCurrentTime] = useState(Math.max(0, Number(request.resumeAt || 0)));`,
`  const [playerVolume, setPlayerVolume] = useState(1);\n  const [endRecommendationsDismissed, setEndRecommendationsDismissed] = useState(false);\n  const [nextEpisodeDismissed, setNextEpisodeDismissed] = useState(false);\n  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(15);\n  const [currentTime, setCurrentTime] = useState(Math.max(0, Number(request.resumeAt || 0)));`,
  'next episode state',
);

replaceOnce(
`  const playerEpisodeGroups = useMemo(() => item?.type === 'series'\n    ? [...(item.downloads || [])]\n        .filter((group) => isEpisodeSection(group) && playableVersionsFor(item, group).length > 0)\n        .sort(compareEpisodeGroupsOldestFirst)\n    : [], [item]);`,
`  const playerEpisodeGroups = useMemo(() => item?.type === 'series'\n    ? [...(item.downloads || [])]\n        .filter((group) => isEpisodeSection(group) && playableVersionsFor(item, group).length > 0)\n        .sort(compareEpisodeGroupsOldestFirst)\n    : [], [item]);\n  const activeEpisodeIndex = request.episodeId\n    ? playerEpisodeGroups.findIndex((group) => group.id === request.episodeId)\n    : -1;\n  const nextEpisodeGroup = activeEpisodeIndex >= 0\n    ? playerEpisodeGroups[activeEpisodeIndex + 1] || null\n    : null;`,
  'next episode lookup',
);

replaceOnce(
`  const movieEndRecommendations = item?.type === 'movie' ? relatedItems.slice(0, 5) : [];\n  const showMovieEndRecommendations = Boolean(`,
`  const movieEndRecommendations = item?.type === 'movie' ? relatedItems.slice(0, 5) : [];\n  const showNextEpisodeOverlay = Boolean(\n    item?.type === 'series' &&\n    nextEpisodeGroup &&\n    firstFrameReady &&\n    !networkOffline &&\n    !settingsOpen &&\n    !episodesOpen &&\n    !nextEpisodeDismissed &&\n    duration >= 180 &&\n    currentTime >= movieEndOverlayStart &&\n    currentTime < duration\n  );\n  const showMovieEndRecommendations = Boolean(`,
  'next episode timing',
);

const chromeMarker = `  const chromeVisible = !controlsLocked && !settingsOpen && !episodesOpen && (!firstFrameReady || switchingQuality || controlsVisible);`;
replaceOnce(
  chromeMarker,
  `  useEffect(() => {\n    if (!showNextEpisodeOverlay || !nextEpisodeGroup) {\n      setNextEpisodeCountdown(15);\n      return;\n    }\n    if (nextEpisodeCountdown <= 0) {\n      const position = Math.max(0, Number(player.currentTime || latestTimeRef.current || 0));\n      const safeDuration = Math.max(0, Number(player.duration || latestDurationRef.current || 0));\n      onProgress(request, position, safeDuration, false);\n      onEpisodeSelect(nextEpisodeGroup, request.language);\n      return;\n    }\n    const timer = setTimeout(() => {\n      setNextEpisodeCountdown((value) => Math.max(0, value - 1));\n    }, 1000);\n    return () => clearTimeout(timer);\n  }, [showNextEpisodeOverlay, nextEpisodeGroup?.id, nextEpisodeCountdown]);\n\n${chromeMarker}`,
  'next episode countdown effect',
);

replaceOnce(
`        {showMovieEndRecommendations ? (\n          <View pointerEvents="box-none" style={styles.movieEndRecommendations}>`,
`        {showNextEpisodeOverlay && nextEpisodeGroup && item?.type === 'series' ? (\n          <View pointerEvents="box-none" style={styles.nextEpisodeOverlay}>\n            <View style={[styles.nextEpisodeCard, landscape && styles.nextEpisodeCardLandscape]}>\n              <Pressable\n                onPress={() => setNextEpisodeDismissed(true)}\n                style={styles.nextEpisodeClose}\n                accessibilityLabel="بستن پیشنهاد قسمت بعد"\n              >\n                <Ionicons name="close" color="#fff" size={18} />\n              </Pressable>\n              <CatalogArtwork\n                primary={exactEpisodeArtworkFor(nextEpisodeGroup, item)}\n                style={styles.nextEpisodeArtwork}\n                contentFit="cover"\n                imageKind="backdrop"\n              />\n              <View style={styles.nextEpisodeBody}>\n                <Text style={styles.nextEpisodeEyebrow}>قسمت بعدی</Text>\n                <Text numberOfLines={2} style={styles.nextEpisodeTitle}>\n                  {item.nameFa} — فصل {toPersianDigits(nextEpisodeGroup.seasonNumber || 1)}، قسمت {toPersianDigits(nextEpisodeGroup.episodeNumber || 0)}\n                </Text>\n                <Pressable\n                  style={styles.nextEpisodePlayButton}\n                  onPress={() => {\n                    const position = Math.max(0, Number(player.currentTime || latestTimeRef.current || 0));\n                    const safeDuration = Math.max(0, Number(player.duration || latestDurationRef.current || 0));\n                    onProgress(request, position, safeDuration, false);\n                    setNextEpisodeDismissed(true);\n                    onEpisodeSelect(nextEpisodeGroup, request.language);\n                  }}\n                >\n                  <Ionicons name="play" color="#05070A" size={18} />\n                  <Text style={styles.nextEpisodePlayText}>پخش ({toPersianDigits(nextEpisodeCountdown)})</Text>\n                </Pressable>\n              </View>\n            </View>\n          </View>\n        ) : null}\n\n        {showMovieEndRecommendations ? (\n          <View pointerEvents="box-none" style={styles.movieEndRecommendations}>`,
  'next episode overlay jsx',
);

replaceOnce(
`  movieEndRecommendations: { ...absoluteFillObject, zIndex: 82, elevation: 82, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 18 },`,
`  nextEpisodeOverlay: { ...absoluteFillObject, zIndex: 83, elevation: 83, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 18 },\n  nextEpisodeCard: { width: '100%', maxWidth: 610, minHeight: 142, flexDirection: 'row-reverse', alignItems: 'center', gap: 13, padding: 13, borderRadius: 18, backgroundColor: 'rgba(10,12,16,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },\n  nextEpisodeCardLandscape: { maxWidth: 720, minHeight: 134 },\n  nextEpisodeClose: { position: 'absolute', top: 9, left: 9, zIndex: 3, width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },\n  nextEpisodeArtwork: { width: 178, height: 104, borderRadius: 12, backgroundColor: COLORS.surfaceStrong },\n  nextEpisodeBody: { flex: 1, minWidth: 0, alignItems: 'flex-end' },\n  nextEpisodeEyebrow: { ...rtlText, color: COLORS.gold, fontSize: 9.5, fontWeight: '900', marginBottom: 4 },\n  nextEpisodeTitle: { ...rtlText, color: '#fff', fontSize: 14, lineHeight: 22, fontWeight: '900', textAlign: 'right' },\n  nextEpisodePlayButton: { minWidth: 154, height: 42, marginTop: 11, paddingHorizontal: 18, borderRadius: 21, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.gold },\n  nextEpisodePlayText: { ...rtlText, color: '#05070A', fontSize: 11.5, fontWeight: '900' },\n  movieEndRecommendations: { ...absoluteFillObject, zIndex: 82, elevation: 82, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 18 },`,
  'next episode styles',
);

await fs.writeFile(path, source, 'utf8');
console.log('Series next episode overlay patch applied.');
