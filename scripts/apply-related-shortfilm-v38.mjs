import fs from 'node:fs';

const appPath = 'App.tsx';
let app = fs.readFileSync(appPath, 'utf8');

const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing anchor: ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
};

app = replaceOnce(
  app,
  "  | 'documentaries'\n  | 'wildlife'",
  "  | 'documentaries'\n  | 'short-films'\n  | 'wildlife'",
  'short-film search filter',
);

app = replaceOnce(
  app,
  "const RELATED_GENERIC_CATEGORY_KEYS = new Set([\n  'movies', 'series', 'iranian-movies', 'foreign-movies', 'iranian-series', 'foreign-series',\n  'latest', 'updated', 'mobile-operator',\n]);\n\nconst relatedCatalogItems = (item: CatalogItem, catalog: CatalogItem[], limit = 5) => {",
  `const RELATED_GENERIC_CATEGORY_KEYS = new Set([\n  'movies', 'series', 'iranian-movies', 'foreign-movies', 'iranian-series', 'foreign-series',\n  'latest', 'updated', 'mobile-operator',\n]);\nconst RELATED_GENERIC_GENRES = new Set(['درام', 'drama']);\nconst relatedStableHash = (value: string) => {\n  let hash = 2166136261;\n  for (let index = 0; index < value.length; index += 1) {\n    hash ^= value.charCodeAt(index);\n    hash = Math.imul(hash, 16777619);\n  }\n  return hash >>> 0;\n};\n\nconst relatedCatalogItems = (item: CatalogItem, catalog: CatalogItem[], limit = 5, selectionSeed = 0) => {`,
  'related helper header',
);

const relatedStart = app.indexOf('const relatedCatalogItems = (item: CatalogItem, catalog: CatalogItem[], limit = 5, selectionSeed = 0) => {');
const relatedEnd = app.indexOf('\n};\n\nconst titleLayoutMetrics', relatedStart);
if (relatedStart < 0 || relatedEnd < 0) throw new Error('Missing related function block');
const relatedReplacement = `const relatedCatalogItems = (item: CatalogItem, catalog: CatalogItem[], limit = 5, selectionSeed = 0) => {\n  const sourceGenres = new Set((item.genres || []).map(normalizeComparableText).filter(Boolean));\n  const sourceCategories = new Set((item.categoryKeys || []).filter((key) => !RELATED_GENERIC_CATEGORY_KEYS.has(key)));\n  const sourceCountries = new Set((item.countryCodes || []).map((code) => String(code).toUpperCase()));\n  const sourcePeople = new Set((item.people || []).map((person) =>\n    person.tmdbId ? \`tmdb:\${person.tmdbId}\` : normalizeComparableText(person.nameFa || person.name || ''),\n  ).filter(Boolean));\n  const sourceYear = Number(item.year || 0);\n\n  const ranked = catalog\n    .filter((candidate) => candidate.id !== item.id && candidate.type === item.type)\n    .filter((candidate) => candidate.type !== 'series' || isSeriesPublished(candidate))\n    .map((candidate) => {\n      const candidateGenres = (candidate.genres || []).map(normalizeComparableText).filter(Boolean);\n      const sharedGenres = candidateGenres.filter((genre) => sourceGenres.has(genre));\n      const meaningfulGenres = sharedGenres.filter((genre) => !RELATED_GENERIC_GENRES.has(genre));\n      const sharedCategories = (candidate.categoryKeys || []).filter(\n        (key) => !RELATED_GENERIC_CATEGORY_KEYS.has(key) && sourceCategories.has(key),\n      );\n      const sharedCountries = (candidate.countryCodes || []).map((code) => String(code).toUpperCase()).filter((code) => sourceCountries.has(code));\n      const sharedPeople = (candidate.people || []).map((person) =>\n        person.tmdbId ? \`tmdb:\${person.tmdbId}\` : normalizeComparableText(person.nameFa || person.name || ''),\n      ).filter((key) => key && sourcePeople.has(key));\n      const yearDistance = sourceYear > 0 && Number(candidate.year || 0) > 0\n        ? Math.abs(sourceYear - Number(candidate.year || 0))\n        : 99;\n      let score = meaningfulGenres.length * 6 + (sharedGenres.length - meaningfulGenres.length);\n      score += sharedCategories.length * 5 + sharedCountries.length * 2 + sharedPeople.length * 7;\n      if (yearDistance <= 3) score += 2;\n      else if (yearDistance <= 8) score += 1;\n      if (item.collectionId && candidate.collectionId === item.collectionId) score += 40;\n      if (item.ir === candidate.ir) score += 1;\n      if (item.isAnimation === candidate.isAnimation) score += 1;\n      if (item.isAnime === candidate.isAnime) score += 1;\n      const jitter = (relatedStableHash(\`${item.id}:\${candidate.id}:\${selectionSeed}\`) % 10000) / 10000;\n      const dominantGenre = meaningfulGenres[0] || sharedGenres[0] || '';\n      const dominantCategory = sharedCategories[0] || '';\n      const dominantCountry = sharedCountries[0] || '';\n      return { candidate, score, jitter, dominantGenre, dominantCategory, dominantCountry, meaningfulGenres, sharedPeople, yearDistance };\n    })\n    .sort((a, b) => b.score - a.score || b.jitter - a.jitter);\n\n  const selected: CatalogItem[] = [];\n  const used = new Set<string>();\n  const genreCounts = new Map<string, number>();\n  const categoryCounts = new Map<string, number>();\n  const countryCounts = new Map<string, number>();\n  const take = (entry: (typeof ranked)[number], enforceDiversity: boolean) => {\n    if (selected.length >= limit || used.has(entry.candidate.id)) return false;\n    if (enforceDiversity) {\n      if (entry.dominantGenre && (genreCounts.get(entry.dominantGenre) || 0) >= 2) return false;\n      if (entry.dominantCategory && (categoryCounts.get(entry.dominantCategory) || 0) >= 2) return false;\n      if (entry.dominantCountry && (countryCounts.get(entry.dominantCountry) || 0) >= 3) return false;\n    }\n    selected.push(entry.candidate);\n    used.add(entry.candidate.id);\n    if (entry.dominantGenre) genreCounts.set(entry.dominantGenre, (genreCounts.get(entry.dominantGenre) || 0) + 1);\n    if (entry.dominantCategory) categoryCounts.set(entry.dominantCategory, (categoryCounts.get(entry.dominantCategory) || 0) + 1);\n    if (entry.dominantCountry) countryCounts.set(entry.dominantCountry, (countryCounts.get(entry.dominantCountry) || 0) + 1);\n    return true;\n  };\n\n  // Exact franchise/collection relations always win.\n  ranked.filter((entry) => item.collectionId && entry.candidate.collectionId === item.collectionId)\n    .forEach((entry) => take(entry, true));\n\n  // Prefer genuinely strong relations, but never let one broad tag such as\n  // "Drama" consume the entire rail.\n  ranked.filter((entry) => entry.score >= 5).forEach((entry) => take(entry, true));\n\n  // Fill with varied same-format titles before allowing repeated broad-tag hits.\n  ranked\n    .filter((entry) => !used.has(entry.candidate.id))\n    .sort((a, b) => {\n      const aDiverse = Number(a.meaningfulGenres.length > 0 || a.sharedPeople.length > 0 || a.yearDistance <= 8);\n      const bDiverse = Number(b.meaningfulGenres.length > 0 || b.sharedPeople.length > 0 || b.yearDistance <= 8);\n      return bDiverse - aDiverse || b.jitter - a.jitter;\n    })\n    .forEach((entry) => take(entry, true));\n\n  // Only if the catalog is too small do we relax the diversity caps.\n  ranked.forEach((entry) => take(entry, false));\n  return selected.slice(0, Math.max(0, limit));\n};`;
app = app.slice(0, relatedStart) + relatedReplacement + app.slice(relatedEnd + 3);

app = replaceOnce(
  app,
  "  if (isKidsItem(item) && !isAnimatedItem(item)) return 'محتوای کودک';\n  if (isDocumentaryItem(item)) {",
  "  if (isKidsItem(item) && !isAnimatedItem(item)) return 'محتوای کودک';\n  if (item.contentKind === 'short-film' || hasCategory(item, 'short-films')) return 'فیلم کوتاه';\n  if (isDocumentaryItem(item)) {",
  'short-film media label',
);

app = replaceOnce(
  app,
  "    programs: 'برنامه‌ها و مسابقه‌ها', kids: 'کودکان', religious: 'مذهبی و مناسبتی', documentaries: 'مستندها', wildlife: 'حیات وحش', collections: 'کالکشن‌ها',",
  "    programs: 'برنامه‌ها و مسابقه‌ها', kids: 'کودکان', religious: 'مذهبی و مناسبتی', documentaries: 'مستندها', 'short-films': 'فیلم کوتاه', wildlife: 'حیات وحش', collections: 'کالکشن‌ها',",
  'short-film filter title',
);

app = replaceOnce(
  app,
  "    case 'documentaries': return isDocumentaryItem(item) && !isWildlifeDocumentaryItem(item);\n    case 'wildlife':",
  "    case 'documentaries': return isDocumentaryItem(item) && !isWildlifeDocumentaryItem(item);\n    case 'short-films': return item.contentKind === 'short-film' || hasCategory(item, 'short-films');\n    case 'wildlife':",
  'short-film filter match',
);

app = replaceOnce(
  app,
  "  'programs', 'kids', 'religious', 'documentaries', 'wildlife',\n]);",
  "  'programs', 'kids', 'religious', 'documentaries', 'short-films', 'wildlife',\n]);",
  'server short-film category',
);

app = replaceOnce(
  app,
  "  { filter: 'documentaries', title: 'مستندها' },\n];",
  "  { filter: 'documentaries', title: 'مستندها' },\n  { filter: 'short-films', title: 'فیلم کوتاه' },\n];",
  'home short-film row',
);

app = replaceOnce(
  app,
  "  { filter: 'documentaries', title: 'مستندها', subtitle: 'آثار مستند', icon: 'camera-outline' },\n  { filter: 'wildlife'",
  "  { filter: 'documentaries', title: 'مستندها', subtitle: 'آثار مستند', icon: 'camera-outline' },\n  { filter: 'short-films', title: 'فیلم کوتاه', subtitle: 'فیلم‌های کوتاه و آثار جشنواره‌ای', icon: 'film-outline' },\n  { filter: 'wildlife'",
  'category short-film card',
);

app = replaceOnce(
  app,
  "    documentaries: ['movie', 'series'],\n    wildlife:",
  "    documentaries: ['movie', 'series'],\n    'short-films': ['movie', 'documentaries'],\n    wildlife:",
  'short-film related category fallback',
);

app = replaceOnce(
  app,
  "  const related = useMemo(() => relatedCatalogItems(item, catalog, 5), [item, catalog]);",
  "  const related = useMemo(() => relatedCatalogItems(item, catalog, 5, selectionSeed), [item, catalog, selectionSeed]);",
  'related selection seed usage',
);

app = replaceOnce(
  app,
  "  onOpen,\n}: {\n  item: CatalogItem;\n  catalog: CatalogItem[];\n  onOpen: (item: CatalogItem) => void;\n}) {\n  const related = useMemo(() => relatedCatalogItems(item, catalog, 5, selectionSeed)",
  "  onOpen,\n  selectionSeed,\n}: {\n  item: CatalogItem;\n  catalog: CatalogItem[];\n  onOpen: (item: CatalogItem) => void;\n  selectionSeed: number;\n}) {\n  const related = useMemo(() => relatedCatalogItems(item, catalog, 5, selectionSeed)",
  'related selection seed prop',
);

app = replaceOnce(
  app,
  "  const [downloadSheetOpen, setDownloadSheetOpen] = useState(false);\n  const [downloadInitialGroup, setDownloadInitialGroup] = useState<string | null>(null);",
  "  const [downloadSheetOpen, setDownloadSheetOpen] = useState(false);\n  const [downloadInitialGroup, setDownloadInitialGroup] = useState<string | null>(null);\n  const [relatedSelectionSeed, setRelatedSelectionSeed] = useState(0);",
  'detail related seed state',
);

app = replaceOnce(
  app,
  "  useEffect(() => {\n    setDownloadSheetOpen(false);\n    setDownloadInitialGroup(null);\n  }, [item?.id, visible]);",
  "  useEffect(() => {\n    setDownloadSheetOpen(false);\n    setDownloadInitialGroup(null);\n    if (visible && item?.id) setRelatedSelectionSeed((seed) => seed + 1);\n  }, [item?.id, visible]);",
  'detail related seed lifecycle',
);

app = replaceOnce(
  app,
  "            <RelatedTitlesSection item={item} catalog={catalog} onOpen={onOpenRelated} />",
  "            <RelatedTitlesSection item={item} catalog={catalog} onOpen={onOpenRelated} selectionSeed={relatedSelectionSeed} />",
  'detail related seed prop usage',
);

fs.writeFileSync(appPath, app);

const test = `import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport test from 'node:test';\n\nconst app = fs.readFileSync('App.tsx', 'utf8');\n\ntest('short films have a dedicated browse category and detail label', () => {\n  assert.ok(app.includes("| 'short-films'"));\n  assert.ok(app.includes("{ filter: 'short-films', title: 'فیلم کوتاه'"));\n  assert.ok(app.includes("case 'short-films': return item.contentKind === 'short-film' || hasCategory(item, 'short-films')"));\n  assert.ok(app.includes("return 'فیلم کوتاه'"));\n});\n\ntest('related rail diversifies broad genres and rotates per detail opening', () => {\n  assert.ok(app.includes("const RELATED_GENERIC_GENRES = new Set(['درام', 'drama'])"));\n  assert.ok(app.includes('genreCounts.get(entry.dominantGenre)'));\n  assert.ok(app.includes('sharedPeople.length * 7'));\n  assert.ok(app.includes('setRelatedSelectionSeed((seed) => seed + 1)'));\n  assert.ok(app.includes('relatedCatalogItems(item, catalog, 5, selectionSeed)'));\n});\n`;
fs.writeFileSync('scripts/tests/related-shortfilm-v38.test.mjs', test);
console.log('Applied Mobile related/short-film v38');