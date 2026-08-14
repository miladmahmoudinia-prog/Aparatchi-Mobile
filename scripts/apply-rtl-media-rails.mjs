import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing RTL rail target: ${label}`);
  source = source.replace(before, after);
};

// Cast/crew: logical first item must be physically at the right without forced scrolling.
source = source.replace(`  const peopleRailRef = useRef<FlatList<CatalogPerson>>(null);\n`, '');
replaceOnce(
`      <FlatList\n        ref={peopleRailRef}\n        horizontal\n        data={[...people].reverse()}\n        onContentSizeChange={() => peopleRailRef.current?.scrollToEnd({ animated: false })}`,
`      <FlatList\n        horizontal\n        data={people}`,
  'people rail data',
);
replaceOnce(`        style={styles.peopleRail}`, `        style={[styles.peopleRail, styles.mediaRailRtl]}`, 'people rail style');

// Home stars: remove reverse + scroll-to-end, which could repeatedly pull the rail into the middle.
source = source.replace(/  \/\/ Keep Android out of RTL\/inverted FlatList code paths:[\s\S]*?  const displayedPeople = useMemo\(\(\) => \[\.\.\.resolvedPeople\]\.reverse\(\), \[resolvedPeople\]\);\n/, '');
source = source.replace(`  const starPeopleRailRef = useRef<FlatList<FeaturedPerson>>(null);\n`, '');
source = source.replace(`  const starWorksRailRef = useRef<FlatList<CatalogItem>>(null);\n`, '');
source = source.replace(/  \/\/ Render a reversed data array and stay at the physical end\.[\s\S]*?  const displayedWorks = useMemo\(\(\) => \[\.\.\.works\]\.reverse\(\), \[works\]\);\n/, '');
replaceOnce(
`      <FlatList\n        ref={starPeopleRailRef}\n        horizontal\n        style={styles.starPeopleRail}\n        data={displayedPeople}\n        onContentSizeChange={() => starPeopleRailRef.current?.scrollToEnd({ animated: false })}`,
`      <FlatList\n        horizontal\n        style={[styles.starPeopleRail, styles.mediaRailRtl]}\n        data={resolvedPeople}`,
  'star people rail',
);
replaceOnce(
`        <FlatList\n          ref={starWorksRailRef}\n          horizontal\n          style={styles.starWorksRail}\n          data={displayedWorks}\n          onContentSizeChange={() => starWorksRailRef.current?.scrollToEnd({ animated: false })}`,
`        <FlatList\n          horizontal\n          style={[styles.starWorksRail, styles.mediaRailRtl]}\n          data={works}`,
  'star works rail',
);

// Related titles: five items are small enough to render directly in logical order.
source = source.replace(`  const railRef = useRef<FlatList<CatalogItem>>(null);\n`, '');
replaceOnce(
`      <FlatList\n        ref={railRef}\n        horizontal\n        data={[...related].reverse()}\n        onContentSizeChange={() => railRef.current?.scrollToEnd({ animated: false })}`,
`      <FlatList\n        horizontal\n        style={styles.mediaRailRtl}\n        data={related}`,
  'related rail',
);

// Media ScrollViews that show poster/episode thumbnails should share the same physical direction.
source = source.replace(
`      <ScrollView\n        horizontal\n        showsHorizontalScrollIndicator={false}\n        contentContainerStyle={styles.collectionList}`,
`      <ScrollView\n        horizontal\n        style={styles.mediaRailRtl}\n        showsHorizontalScrollIndicator={false}\n        contentContainerStyle={styles.collectionList}`,
);
source = source.replace(
`        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playerEpisodesRail}>`,
`        <ScrollView horizontal style={styles.mediaRailRtl} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playerEpisodesRail}>`,
);
source = source.replace(
`              <ScrollView\n                horizontal\n                showsHorizontalScrollIndicator={false}\n                contentContainerStyle={styles.movieEndRecommendationsRail}`,
`              <ScrollView\n                horizontal\n                style={styles.mediaRailRtl}\n                showsHorizontalScrollIndicator={false}\n                contentContainerStyle={styles.movieEndRecommendationsRail}`,
);

if (!source.includes(`  mediaRailRtl: { direction: 'rtl' },`)) {
  const anchor = `  horizontalCatalogList: { flexGrow: 0, direction: 'rtl' },`;
  if (!source.includes(anchor)) throw new Error('RTL style anchor not found.');
  source = source.replace(anchor, `  mediaRailRtl: { direction: 'rtl' },\n${anchor}`);
}

// The user explicitly wants captions under poster rails centered, not globally RTL-aligned.
source = source.replace(
  `relatedTitleCard: { width: 126, alignItems: 'flex-end' }`,
  `relatedTitleCard: { width: 126, alignItems: 'center' }`,
);
source = source.replace(
  `relatedTitleName: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10.5, fontWeight: '800', textAlign: 'right', marginTop: 7 }`,
  `relatedTitleName: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10.5, fontWeight: '800', textAlign: 'center', marginTop: 7 }`,
);

await fs.writeFile(path, source, 'utf8');
console.log('Media rails now use deterministic RTL direction without reverse/scrollToEnd jumps.');
