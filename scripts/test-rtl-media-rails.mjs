import fs from 'node:fs/promises';

const source = await fs.readFile('App.tsx', 'utf8');
const block = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate ${startMarker}`);
  return source.slice(start, end);
};

const requireMarkers = (name, text, markers) => {
  for (const marker of markers) {
    if (!text.includes(marker)) throw new Error(`${name} marker missing: ${marker}`);
  }
};

const rejectMarkers = (name, text, markers) => {
  for (const marker of markers) {
    if (text.includes(marker)) throw new Error(`${name} still contains unwanted positioning marker: ${marker}`);
  }
};

// Horizontal Android lists are kept in a deterministic right-start position by
// reversing only the small displayed array and starting at its final index.
// This avoids broad native direction/inverted behavior that previously caused
// edge cards to disappear or rails to open in the middle.
const people = block('function PeopleSection', 'const HorizontalCatalog');
requireMarkers('People rail', people, [
  'const displayedPeople = useMemo(() => [...people].reverse(), [people]);',
  'data={displayedPeople}',
  'initialScrollIndex={displayedPeople.length - 1}',
  'getItemLayout=',
  'removeClippedSubviews={false}',
]);
rejectMarkers('People rail', people, ['scrollToEnd', 'inverted={true}']);

const stars = block('function HomeStarsSectionBase', 'const HomeStarsSection');
requireMarkers('Stars people rail', stars, [
  'const displayedPeople = useMemo(() => [...resolvedPeople].reverse(), [resolvedPeople]);',
  'data={displayedPeople}',
  'initialScrollIndex={displayedPeople.length - 1}',
]);
requireMarkers('Stars works rail', stars, [
  'const displayedWorks = useMemo(() => [...works].reverse(), [works]);',
  'data={displayedWorks}',
  'initialScrollIndex={displayedWorks.length - 1}',
]);
rejectMarkers('Stars rails', stars, ['scrollToEnd', 'inverted={true}']);

const related = block('function RelatedTitlesSection', 'function DetailModal');
requireMarkers('Related rail', related, [
  'const displayedRelated = useMemo(() => [...related].reverse(), [related]);',
  'data={displayedRelated}',
  'initialScrollIndex={displayedRelated.length - 1}',
  'getItemLayout=',
]);
rejectMarkers('Related rail', related, ['scrollToEnd', 'inverted={true}']);

for (const marker of [
  "relatedTitleCard: { width: 126, alignItems: 'center' }",
  "relatedTitleName: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10.5, fontWeight: '800', textAlign: 'center'",
  "posterName: { ...rtlText, color: COLORS.text",
  "textAlign: 'center'",
]) {
  if (!source.includes(marker)) throw new Error(`RTL/caption marker missing: ${marker}`);
}

console.log(JSON.stringify({
  mediaRails: 'reverse-data-right-start',
  forcedScrollToEnd: false,
  invertedFlatList: false,
  captionsCentered: true,
}, null, 2));
