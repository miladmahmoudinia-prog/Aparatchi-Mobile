import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const required = [
  'function RelatedTitlesSection({',
  'relatedCatalogItems(item, catalog, 5)',
  'const displayedRelated = useMemo(() => [...related].reverse(), [related]);',
  'data={displayedRelated}',
  'initialScrollIndex={displayedRelated.length - 1}',
  'getItemLayout=',
  '<Text style={styles.relatedTitlesTitle}>مرتبط‌ها</Text>',
  '<RelatedTitlesSection item={item} catalog={catalog} onOpen={onOpenRelated} />',
  'relatedTitlePoster:',
];
for (const marker of required) {
  if (!app.includes(marker)) throw new Error(`Missing related-title marker: ${marker}`);
}

const relatedStart = app.indexOf('function RelatedTitlesSection({');
const relatedEnd = app.indexOf('function DetailModal({', relatedStart);
if (relatedStart < 0 || relatedEnd <= relatedStart) throw new Error('RelatedTitlesSection block not found.');
const relatedBlock = app.slice(relatedStart, relatedEnd);
if (relatedBlock.includes('scrollToEnd') || relatedBlock.includes('inverted={true}')) {
  throw new Error('Related titles must use deterministic reverse-data/right-start positioning only.');
}

if (!app.includes("candidate.id !== item.id && candidate.type === item.type")) {
  throw new Error('Related titles must exclude the current item and keep the same content type.');
}

console.log(JSON.stringify({
  section: 'related-titles',
  maxItems: 5,
  sameTypeOnly: true,
  excludesCurrentTitle: true,
  startsFromRight: true,
  scrollDirection: 'left',
  rtlMode: 'reverse-data-right-start',
}, null, 2));
