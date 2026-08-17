import fs from 'node:fs/promises';

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};

let app = await fs.readFile('App.tsx', 'utf8');

app = replaceOnce(
  app,
  `const hasSpecificCountry = (item: CatalogItem, code: string, originalLanguage: string) => {\n  const countryCodes = (item.countryCodes || []).map((value) => String(value).toUpperCase());\n  const language = String(item.originalLanguage || '').toLowerCase();\n  const primaryCountry = countryCodes[0] || '';\n  if (primaryCountry) return primaryCountry === code;\n  return language === originalLanguage;\n};`,
  `const hasSpecificCountry = (item: CatalogItem, code: string, originalLanguage: string) => {\n  const countryCodes = (item.countryCodes || []).map((value) => String(value).toUpperCase());\n  const language = String(item.originalLanguage || '').toLowerCase();\n  const primaryCountry = countryCodes[0] || '';\n  // Co-production credits are not a nationality shelf. When TMDB provides an\n  // original language, it is the strongest identity signal; primary country is\n  // only the fallback for old rows with no language metadata.\n  if (language) return language === originalLanguage;\n  return primaryCountry === code;\n};`,
  'regional identity prefers original language',
);

app = replaceOnce(
  app,
  `    case 'foreign-series': return item.type === 'series' && !isIranianItem(item) && !isKoreanItem(item) && !isIndianItem(item) && !isAnimatedItem(item) && !isProgramItem(item) && !isKidsItem(item) && !isReligiousItem(item) && !isDocumentaryItem(item);`,
  `    case 'foreign-series': return item.type === 'series' && !isIranianItem(item) && !isKoreanItem(item) && !isAnimatedItem(item) && !isProgramItem(item) && !isKidsItem(item) && !isReligiousItem(item) && !isDocumentaryItem(item);`,
  'Indian series belongs to foreign series fallback',
);

app = replaceOnce(
  app,
  `    case 'indian-series': return item.type === 'series' && isIndianItem(item) && !isAnimatedItem(item) && !isDocumentaryItem(item) && !isProgramItem(item) && !isKidsItem(item) && !isReligiousItem(item);`,
  `    case 'indian-series': return false;`,
  'disable removed Indian series filter',
);

app = replaceOnce(
  app,
  `  'korean-movies', 'korean-series', 'indian-movies', 'indian-series',\n  'anime-movies', 'anime-series', 'animation-movies', 'animation-series',`,
  `  'korean-movies', 'korean-series', 'indian-movies',\n  'anime-movies', 'anime-series', 'animation-movies', 'animation-series',`,
  'remove Indian series from server category filters',
);
app = replaceOnce(
  app,
  `  'korean-movies', 'korean-series', 'indian-movies', 'indian-series',\n  'anime-movies', 'anime-series', 'animation-movies', 'animation-series',`,
  `  'korean-movies', 'korean-series', 'indian-movies',\n  'anime-movies', 'anime-series', 'animation-movies', 'animation-series',`,
  'remove Indian series from strict filters',
);

app = replaceOnce(
  app,
  `  { filter: 'indian-movies', title: 'فیلم‌های هندی' },\n  { filter: 'indian-series', title: 'سریال‌های هندی' },\n  { filter: 'anime-movies', title: 'انیمه‌های سینمایی' },`,
  `  { filter: 'indian-movies', title: 'فیلم‌های هندی' },\n  { filter: 'anime-movies', title: 'انیمه‌های سینمایی' },`,
  'remove Indian series Home rail',
);

app = replaceOnce(
  app,
  `  { filter: 'indian-movies', title: 'فیلم‌های هندی', subtitle: 'سینمای هند', icon: 'location-outline' },\n  { filter: 'indian-series', title: 'سریال‌های هندی', subtitle: 'مجموعه‌های هند', icon: 'tv-outline' },\n  { filter: 'collections', title: 'کالکشن‌ها', subtitle: 'قسمت‌های یک مجموعه', icon: 'layers-outline' },`,
  `  { filter: 'indian-movies', title: 'فیلم‌های هندی', subtitle: 'سینمای هند', icon: 'location-outline' },\n  { filter: 'collections', title: 'کالکشن‌ها', subtitle: 'قسمت‌های یک مجموعه', icon: 'layers-outline' },`,
  'remove Indian series category card',
);

app = replaceOnce(
  app,
  `    'indian-movies': ['movie'],\n    'indian-series': ['series'],\n    collections: ['movie', 'series'],`,
  `    'indian-movies': ['movie'],\n    collections: ['movie', 'series'],`,
  'remove Indian series related category',
);

await fs.writeFile('App.tsx', app);
console.log('Applied v13 regional Mobile cleanup.');
