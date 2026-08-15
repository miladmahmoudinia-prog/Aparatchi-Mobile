import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing right-start rail target: ${label}`);
  source = source.replace(before, after);
};

// Collection rail: keep native LTR scroll physics. The content itself is
// row-reverse, so a single initial scrollToEnd puts the logical first movie on
// the right. Guard by content identity so later image/layout updates never pull
// the user's gesture back to the edge.
replaceOnce(
`  const members = collectionMembersFor(item, catalog);\n  if (members.length < 2) return null;`,
`  const members = collectionMembersFor(item, catalog);\n  const collectionRailRef = useRef<ScrollView>(null);\n  const collectionRailPositionedRef = useRef('');\n  const collectionRailKey = members.map((member) => String(member.id)).join('|');\n  const positionCollectionRail = useCallback(() => {\n    if (!collectionRailKey || collectionRailPositionedRef.current === collectionRailKey) return;\n    collectionRailPositionedRef.current = collectionRailKey;\n    requestAnimationFrame(() => collectionRailRef.current?.scrollToEnd({ animated: false }));\n  }, [collectionRailKey]);\n  if (members.length < 2) return null;`,
  'collection initial position',
);
replaceOnce(
`      <ScrollView\n        horizontal\n        style={styles.mediaRailRtl}\n        showsHorizontalScrollIndicator={false}\n        contentContainerStyle={styles.collectionList}`,
`      <ScrollView\n        ref={collectionRailRef}\n        horizontal\n        showsHorizontalScrollIndicator={false}\n        contentContainerStyle={styles.collectionList}\n        onContentSizeChange={positionCollectionRail}`,
  'collection native scroll',
);

// Cast/crew FlatList: reverse data only, then start at its final physical item.
// This keeps the first logical person at the right without entering React
// Native's horizontal RTL/inverted code paths.
replaceOnce(
`  if (!people.length) return null;`,
`  const displayedPeople = useMemo(() => [...people].reverse(), [people]);\n\n  if (!people.length) return null;`,
  'people displayed order',
);
replaceOnce(`        data={people}`, `        data={displayedPeople}`, 'people data');
replaceOnce(`        style={[styles.peopleRail, styles.mediaRailRtl]}`, `        style={styles.peopleRail}`, 'people native direction');
replaceOnce(
`        contentContainerStyle={styles.peopleList}\n        initialNumToRender={4}`,
`        contentContainerStyle={styles.peopleList}\n        initialScrollIndex={displayedPeople.length - 1}\n        getItemLayout={(_data, index) => ({ length: 100, offset: 100 * index, index })}\n        initialNumToRender={4}`,
  'people initial index',
);

// Every Home poster shelf uses the same native-scroll strategy.
replaceOnce(
`  const renderPoster = useCallback(({ item }: { item: CatalogItem }) => (`,
`  const displayedItems = useMemo(() => [...items].reverse(), [items]);\n  const renderPoster = useCallback(({ item }: { item: CatalogItem }) => (`,
  'home catalog displayed order',
);
replaceOnce(`      data={items}`, `      data={displayedItems}`, 'home catalog data');
replaceOnce(
`      contentContainerStyle={styles.horizontalCatalog}\n      initialNumToRender={4}`,
`      contentContainerStyle={styles.horizontalCatalog}\n      initialScrollIndex={displayedItems.length - 1}\n      getItemLayout={(_data, index) => ({ length: 148, offset: 148 * index, index })}\n      initialNumToRender={4}`,
  'home catalog initial index',
);

// Stars: preserve selected logical person/work, but render reversed arrays and
// remount the work rail per selected star so its initial index is applied once.
replaceOnce(
`  const [selectedId, setSelectedId] = useState('');`,
`  const [selectedId, setSelectedId] = useState('');\n  const displayedPeople = useMemo(() => [...resolvedPeople].reverse(), [resolvedPeople]);`,
  'stars people displayed order',
);
replaceOnce(
`  }, [catalog, catalogById, selected]);\n\n  const selectedIdForRender`,
`  }, [catalog, catalogById, selected]);\n  const displayedWorks = useMemo(() => [...works].reverse(), [works]);\n\n  const selectedIdForRender`,
  'stars works displayed order',
);
replaceOnce(
`        style={[styles.starPeopleRail, styles.mediaRailRtl]}\n        data={resolvedPeople}`,
`        style={styles.starPeopleRail}\n        data={displayedPeople}`,
  'stars people native direction',
);
replaceOnce(
`        contentContainerStyle={styles.starsPeopleList}\n        initialNumToRender={10}`,
`        contentContainerStyle={styles.starsPeopleList}\n        initialScrollIndex={displayedPeople.length - 1}\n        getItemLayout={(_data, index) => ({ length: 66, offset: 66 * index, index })}\n        initialNumToRender={10}`,
  'stars people initial index',
);
replaceOnce(
`        <FlatList\n          horizontal\n          style={[styles.starWorksRail, styles.mediaRailRtl]}\n          data={works}`,
`        <FlatList\n          key={\`star-works-${selected.id}\`}\n          horizontal\n          style={styles.starWorksRail}\n          data={displayedWorks}`,
  'stars works native direction',
);
replaceOnce(
`          contentContainerStyle={styles.starWorksList}\n          initialNumToRender={6}`,
`          contentContainerStyle={styles.starWorksList}\n          initialScrollIndex={displayedWorks.length - 1}\n          getItemLayout={(_data, index) => ({ length: 113, offset: 113 * index, index })}\n          initialNumToRender={6}`,
  'stars works initial index',
);

// Related titles are fixed-width and tiny: reverse + initialScrollIndex is
// deterministic and never issues an imperative scroll while the user drags.
replaceOnce(
`  const related = useMemo(() => relatedCatalogItems(item, catalog, 5), [item, catalog]);\n  if (!related.length) return null;`,
`  const related = useMemo(() => relatedCatalogItems(item, catalog, 5), [item, catalog]);\n  const displayedRelated = useMemo(() => [...related].reverse(), [related]);\n  if (!related.length) return null;`,
  'related displayed order',
);
replaceOnce(
`      <FlatList\n        horizontal\n        style={styles.mediaRailRtl}\n        data={related}`,
`      <FlatList\n        horizontal\n        data={displayedRelated}`,
  'related native direction',
);
replaceOnce(
`        contentContainerStyle={styles.relatedTitlesRail}\n        showsHorizontalScrollIndicator={false}`,
`        contentContainerStyle={styles.relatedTitlesRail}\n        initialScrollIndex={displayedRelated.length - 1}\n        getItemLayout={(_data, index) => ({ length: 138, offset: 138 * index, index })}\n        showsHorizontalScrollIndicator={false}`,
  'related initial index',
);

// Player episode rail: ScrollView renders all cards, so one guarded initial
// scroll is sufficient. Keep row-reverse content layout and normal touch physics.
replaceOnce(
`  const visibleGroups = seasons[visibleSeason] || [];\n\n  return (`,
`  const visibleGroups = seasons[visibleSeason] || [];\n  const episodeRailRef = useRef<ScrollView>(null);\n  const episodeRailPositionedRef = useRef('');\n  const episodeRailKey = \`${'${item.id}:${visibleSeason}:'}${'${visibleGroups.map((group) => group.id).join("|")}'}\`;\n  const positionEpisodeRail = useCallback(() => {\n    if (!visibleGroups.length || episodeRailPositionedRef.current === episodeRailKey) return;\n    episodeRailPositionedRef.current = episodeRailKey;\n    requestAnimationFrame(() => episodeRailRef.current?.scrollToEnd({ animated: false }));\n  }, [episodeRailKey, visibleGroups.length]);\n\n  return (`,
  'player episode initial position',
);
replaceOnce(
`        <ScrollView horizontal style={styles.mediaRailRtl} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playerEpisodesRail}>`,
`        <ScrollView\n          ref={episodeRailRef}\n          horizontal\n          showsHorizontalScrollIndicator={false}\n          contentContainerStyle={styles.playerEpisodesRail}\n          onContentSizeChange={positionEpisodeRail}\n        >`,
  'player episode native scroll',
);

// Movie recommendations inside the player: same guarded one-shot positioning.
replaceOnce(
`  const movieEndRecommendations = item?.type === 'movie' ? relatedItems.slice(0, 5) : [];`,
`  const movieEndRecommendations = item?.type === 'movie' ? relatedItems.slice(0, 5) : [];\n  const movieRecommendationRailRef = useRef<ScrollView>(null);\n  const movieRecommendationRailPositionedRef = useRef('');\n  const movieRecommendationRailKey = movieEndRecommendations.map((entry) => entry.id).join('|');\n  const positionMovieRecommendationRail = useCallback(() => {\n    if (!movieRecommendationRailKey || movieRecommendationRailPositionedRef.current === movieRecommendationRailKey) return;\n    movieRecommendationRailPositionedRef.current = movieRecommendationRailKey;\n    requestAnimationFrame(() => movieRecommendationRailRef.current?.scrollToEnd({ animated: false }));\n  }, [movieRecommendationRailKey]);`,
  'movie recommendation initial position',
);
replaceOnce(
`              <ScrollView\n                horizontal\n                style={styles.mediaRailRtl}\n                showsHorizontalScrollIndicator={false}\n                contentContainerStyle={styles.movieEndRecommendationsRail}`,
`              <ScrollView\n                ref={movieRecommendationRailRef}\n                horizontal\n                showsHorizontalScrollIndicator={false}\n                contentContainerStyle={styles.movieEndRecommendationsRail}\n                onContentSizeChange={positionMovieRecommendationRail}`,
  'movie recommendation native scroll',
);

// Remove direction from the scrollable views themselves. RTL remains in text
// and row-reverse content containers where it cannot hijack Android gestures.
source = source.replace(`  mediaRailRtl: { direction: 'rtl' },\n`, '');
replaceOnce(
`  horizontalCatalogList: { flexGrow: 0, direction: 'rtl' },`,
`  horizontalCatalogList: { flexGrow: 0 },`,
  'home scroll direction style',
);

// Captions under media cards stay centered independently of RTL ordering.
replaceOnce(`  posterCard: { width: 137, alignItems: 'flex-end' },`, `  posterCard: { width: 137, alignItems: 'center' },`, 'poster caption alignment');
replaceOnce(`  collectionCard: { width: 112, alignItems: 'stretch' },`, `  collectionCard: { width: 112, alignItems: 'center' },`, 'collection caption alignment');
replaceOnce(
`  collectionMovieName: { ...rtlText, color: COLORS.text, fontSize: 10, lineHeight: 16, fontWeight: '800', marginTop: 7, minHeight: 31 },`,
`  collectionMovieName: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10, lineHeight: 16, fontWeight: '800', marginTop: 7, minHeight: 31, textAlign: 'center' },`,
  'collection title centered',
);

await fs.writeFile(path, source, 'utf8');
console.log('Horizontal media rails now start at the right with native LTR scroll physics and one-shot positioning.');
