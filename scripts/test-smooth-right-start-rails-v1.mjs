import fs from 'node:fs/promises';

const source = await fs.readFile('App.tsx', 'utf8');
const block = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate ${startMarker}`);
  return source.slice(start, end);
};

if (source.includes('mediaRailRtl')) {
  throw new Error('Scrollable media rails still use direction:rtl styling.');
}
if (source.includes("horizontalCatalogList: { flexGrow: 0, direction: 'rtl' }")) {
  throw new Error('Home poster shelf still changes native scroll direction.');
}

const collection = block('function MovieCollectionSection', 'const CastPersonCard');
for (const marker of [
  'const collectionRailRef = useRef<ScrollView>(null);',
  "collectionRailPositionedRef.current === collectionRailKey",
  'onContentSizeChange={positionCollectionRail}',
  'collectionRailRef.current?.scrollToEnd({ animated: false })',
]) {
  if (!collection.includes(marker)) throw new Error(`Collection right-start marker missing: ${marker}`);
}
if (collection.includes("direction: 'rtl'")) throw new Error('Collection ScrollView still changes native direction.');

const people = block('function PeopleSection', 'const HorizontalCatalog');
for (const marker of [
  'const displayedPeople = useMemo(() => [...people].reverse(), [people]);',
  'data={displayedPeople}',
  'initialScrollIndex={displayedPeople.length - 1}',
  'getItemLayout={(_data, index) => ({ length: 100, offset: 100 * index, index })}',
]) {
  if (!people.includes(marker)) throw new Error(`People rail marker missing: ${marker}`);
}
if (people.includes('scrollToEnd') || people.includes('inverted')) throw new Error('People FlatList still uses imperative/inverted scrolling.');

const homeCatalog = block('const HorizontalCatalog', 'const StarPersonButton');
for (const marker of [
  'const displayedItems = useMemo(() => [...items].reverse(), [items]);',
  'data={displayedItems}',
  'initialScrollIndex={displayedItems.length - 1}',
  'getItemLayout={(_data, index) => ({ length: 148, offset: 148 * index, index })}',
]) {
  if (!homeCatalog.includes(marker)) throw new Error(`Home shelf marker missing: ${marker}`);
}
if (homeCatalog.includes('scrollToEnd') || homeCatalog.includes('inverted')) throw new Error('Home shelf still uses imperative/inverted scrolling.');

const stars = block('function HomeStarsSectionBase', 'const HomeStarsSection');
for (const marker of [
  'const displayedPeople = useMemo(() => [...resolvedPeople].reverse(), [resolvedPeople]);',
  'const displayedWorks = useMemo(() => [...works].reverse(), [works]);',
  'data={displayedPeople}',
  'initialScrollIndex={displayedPeople.length - 1}',
  'data={displayedWorks}',
  'initialScrollIndex={displayedWorks.length - 1}',
  'key={`star-works-${selected.id}`}',
]) {
  if (!stars.includes(marker)) throw new Error(`Stars rail marker missing: ${marker}`);
}
if (stars.includes('scrollToEnd') || stars.includes('inverted')) throw new Error('Stars still use gesture-fighting imperative/inverted scrolling.');

const related = block('function RelatedTitlesSection', 'function DetailModal');
for (const marker of [
  'const displayedRelated = useMemo(() => [...related].reverse(), [related]);',
  'data={displayedRelated}',
  'initialScrollIndex={displayedRelated.length - 1}',
  'getItemLayout={(_data, index) => ({ length: 138, offset: 138 * index, index })}',
]) {
  if (!related.includes(marker)) throw new Error(`Related rail marker missing: ${marker}`);
}
if (related.includes('scrollToEnd') || related.includes('inverted')) throw new Error('Related FlatList still uses imperative/inverted scrolling.');

const episodes = block('function PlayerEpisodesOverlay', 'function VideoPlayerModal');
for (const marker of [
  'const episodeRailRef = useRef<ScrollView>(null);',
  'episodeRailPositionedRef.current === episodeRailKey',
  'onContentSizeChange={positionEpisodeRail}',
  'episodeRailRef.current?.scrollToEnd({ animated: false })',
]) {
  if (!episodes.includes(marker)) throw new Error(`Episode rail marker missing: ${marker}`);
}
if (episodes.includes('styles.mediaRailRtl')) throw new Error('Episode ScrollView still changes native direction.');

const player = block('function VideoPlayerModal', 'function OperatorWebModal');
for (const marker of [
  'const movieRecommendationRailRef = useRef<ScrollView>(null);',
  'movieRecommendationRailPositionedRef.current === movieRecommendationRailKey',
  'onContentSizeChange={positionMovieRecommendationRail}',
  'movieRecommendationRailRef.current?.scrollToEnd({ animated: false })',
]) {
  if (!player.includes(marker)) throw new Error(`Movie recommendation rail marker missing: ${marker}`);
}
if (player.includes('styles.mediaRailRtl')) throw new Error('Player recommendations still change native direction.');

for (const marker of [
  "posterCard: { width: 137, alignItems: 'center' }",
  "posterName: { ...rtlText, color: COLORS.text",
  "width: '100%', textAlign: 'center'",
  "collectionCard: { width: 112, alignItems: 'center' }",
  "collectionMovieName: { ...rtlText, width: '100%'",
  "textAlign: 'center'",
  "personCardName: { ...rtlText, width: '100%'",
  "starWorkTitle: { ...rtlText, width: '100%'",
  "relatedTitleName: { ...rtlText, width: '100%'",
]) {
  if (!source.includes(marker)) throw new Error(`Centered-caption marker missing: ${marker}`);
}

console.log(JSON.stringify({
  nativeScrollDirection: 'ltr-physics',
  logicalStart: 'right',
  flatListImperativeRepositioning: false,
  scrollViewInitialPositioning: 'once-per-content-key',
  captionsCentered: true,
  coveredRails: ['home-posters', 'cast', 'stars', 'star-works', 'related', 'collections', 'player-episodes', 'player-recommendations'],
}, null, 2));
