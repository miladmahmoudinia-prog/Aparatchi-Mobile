import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const required = [
  'function RelatedTitlesSection({',
  'relatedCatalogItems(item, catalog, 5)',
  'data={[...related].reverse()}',
  'scrollToEnd({ animated: false })',
  '<Text style={styles.relatedTitlesTitle}>مرتبط‌ها</Text>',
  '<RelatedTitlesSection item={item} catalog={catalog} onOpen={onOpenRelated} />',
  'relatedTitlePoster:',
];
for (const marker of required) {
  if (!app.includes(marker)) throw new Error(`Missing related-title marker: ${marker}`);
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
}, null, 2));
