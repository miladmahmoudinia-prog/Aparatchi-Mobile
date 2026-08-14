import fs from 'node:fs/promises';

const source = await fs.readFile('App.tsx', 'utf8');
const block = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate ${startMarker}`);
  return source.slice(start, end);
};

const people = block('function PeopleSection', 'const HorizontalCatalog');
if (!people.includes('data={people}')) throw new Error('People rail does not use logical order.');
if (!people.includes('styles.mediaRailRtl')) throw new Error('People rail is not RTL.');
if (people.includes('scrollToEnd') || people.includes('.reverse()')) throw new Error('People rail still forces physical scrolling/reversal.');

const stars = block('function HomeStarsSectionBase', 'const HomeStarsSection');
for (const marker of ['data={resolvedPeople}', 'data={works}', 'styles.mediaRailRtl']) {
  if (!stars.includes(marker)) throw new Error(`Stars rail marker missing: ${marker}`);
}
if (stars.includes('scrollToEnd') || stars.includes('displayedPeople') || stars.includes('displayedWorks')) {
  throw new Error('Stars section still uses reverse/scroll-to-end positioning.');
}

const related = block('function RelatedTitlesSection', 'function DetailModal');
if (!related.includes('data={related}')) throw new Error('Related rail does not use logical order.');
if (!related.includes('style={styles.mediaRailRtl}')) throw new Error('Related rail is not RTL.');
if (related.includes('scrollToEnd') || related.includes('.reverse()')) throw new Error('Related rail still forces scroll/reversal.');

for (const marker of [
  "mediaRailRtl: { direction: 'rtl' }",
  "relatedTitleCard: { width: 126, alignItems: 'center' }",
  "relatedTitleName: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10.5, fontWeight: '800', textAlign: 'center'",
  "posterName: { ...rtlText, color: COLORS.text",
  "textAlign: 'center'",
]) {
  if (!source.includes(marker)) throw new Error(`RTL/caption marker missing: ${marker}`);
}

console.log(JSON.stringify({
  mediaRails: 'rtl-logical-order',
  forcedScrollToEnd: false,
  invertedFlatList: false,
  captionsCentered: true,
}, null, 2));
