import fs from 'node:fs/promises';

const replaceRequired = (text, pattern, replacement, label) => {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Patch target not found: ${label}`);
  return next;
};

const replaceOptional = (text, pattern, replacement, label) => {
  const next = text.replace(pattern, replacement);
  if (next === text) console.log(`Already applied or not needed: ${label}`);
  return next;
};

let app = await fs.readFile('App.tsx', 'utf8');

// A dubbed-only stream is dubbed even when its download link has not been
// discovered yet. Do not label it as the original version merely because the
// source file itself has no explicit language field.
app = replaceRequired(
  app,
  /  const unlabeledSources = playbackSourcesForFiles\(files\.filter\(\(file\) => !file\.language\)\);\n  if \(unlabeledSources\.length\) \{\n    versions\.push\(\{\n      label: item\.ir \? 'پخش آنلاین' : 'نسخه اصلی',\n      sources: unlabeledSources,\n      defaultSource: defaultPlaybackSource\(unlabeledSources\),\n    \}\);\n  \}/,
  `  const unlabeledSources = playbackSourcesForFiles(files.filter((file) => !file.language));\n  if (unlabeledSources.length) {\n    const inferredLanguages = itemLanguages(item);\n    const inferredLanguage = inferredLanguages.length === 1 ? inferredLanguages[0] : undefined;\n    versions.push({\n      ...(inferredLanguage ? { language: inferredLanguage } : {}),\n      label: inferredLanguage\n        ? languageTitle(inferredLanguage)\n        : (item.ir ? 'پخش آنلاین' : 'نسخه اصلی'),\n      sources: unlabeledSources,\n      defaultSource: defaultPlaybackSource(unlabeledSources),\n    });\n  }`,
  'unlabeled player language',
);

app = replaceRequired(
  app,
  /const meaningfulUpdateLabel = \(item: CatalogItem\) => \{\n  const label = String\(item\.updateLabel \|\| ''\)\.trim\(\);\n  if \(!label\) return '';\n  return \/قسمت\|فصل\|دوبله\|زیر\\s\*نویس\|subtitle\|dubbed\|کیفیت\|quality\/i\.test\(label\) \? label : '';\n\};/,
  `const meaningfulUpdateLabel = (item: CatalogItem) => {\n  const label = String(item.updateLabel || '').trim();\n  if (!label) return '';\n  if (/^(?:سریال|عنوان)\\s+جدید$/i.test(label)) return label;\n  return /قسمت|فصل|دوبله|زیر\\s*نویس|subtitle|dubbed|کیفیت|quality/i.test(label) ? label : '';\n};`,
  'updated-feed new-series label',
);

// Persian collection name on the first line, original/English name below it.
app = replaceRequired(
  app,
  /  const members = collectionMembersFor\(item, catalog\);\n  if \(members\.length < 2\) return null;/,
  `  const members = collectionMembersFor(item, catalog);\n  if (members.length < 2) return null;\n  const rawCollectionFa = String(item.collectionNameFa || '').trim();\n  const rawCollectionEn = String(item.collectionName || '').trim();\n  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)\n    ? rawCollectionFa\n    : \`مجموعه \${String(members[0]?.nameFa || item.nameFa || 'فیلم‌ها').trim()}\`;\n  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn)\n    ? rawCollectionEn\n    : '';`,
  'collection bilingual vars',
);
app = replaceRequired(
  app,
  /          <Text style=\{styles\.collectionTitle\}>\n            \{item\.collectionNameFa \|\| item\.collectionName \|\| 'این مجموعه'\}\n          <\/Text>\n          \{item\.collectionName \? \(\n            <Text style=\{styles\.collectionEnglish\}>\{item\.collectionName\}<\/Text>\n          \) : null\}/,
  `          <Text style={styles.collectionTitle}>{collectionTitleFa}</Text>\n          {collectionTitleEn ? (\n            <Text style={styles.collectionEnglish}>{collectionTitleEn}</Text>\n          ) : null}`,
  'collection bilingual render',
);

// Replace ONLY personWorksFor. The previous patch used PersonProfileModal as the
// end marker and accidentally swallowed unrelated components (including
// DetailModal). The immediate top-level closing marker keeps every component.
const personStart = app.indexOf('const personWorksFor = (person: CatalogPerson, catalog: CatalogItem[]) => {');
if (personStart < 0) throw new Error('Could not locate personWorksFor');
const personClose = app.indexOf('\n};', personStart);
if (personClose < 0) throw new Error('Could not locate personWorksFor closing marker');
const personEnd = personClose + '\n};'.length;
const oldPersonFunction = app.slice(personStart, personEnd);
const fallbackStart = oldPersonFunction.indexOf('  const identityNames =');
const fallbackEnd = oldPersonFunction.lastIndexOf('\n};');
if (fallbackStart < 0 || fallbackEnd < 0) throw new Error('Could not extract person matcher fallback');
const fallbackBody = oldPersonFunction.slice(fallbackStart, fallbackEnd);
const personReplacement = `const personWorkKeysFor = (person: CatalogPerson) => {\n  const keys: string[] = [];\n  if (person.tmdbId) keys.push(\`tmdb:\${Number(person.tmdbId)}\`);\n  for (const value of [person.name, person.nameFa, personName(person)]) {\n    const normalized = normalizeComparableText(String(value || ''));\n    if (normalized) keys.push(\`name:\${normalized}\`);\n  }\n  return [...new Set(keys)];\n};\n\nconst personWorksFor = (\n  person: CatalogPerson,\n  catalog: CatalogItem[],\n  peopleWorks: Record<string, string[]> = {},\n) => {\n  const catalogById = new Map(catalog.map((item) => [String(item.id), item] as const));\n  const indexed = [...new Set(personWorkKeysFor(person).flatMap((key) => peopleWorks[key] || []))]\n    .map((id) => catalogById.get(String(id)))\n    .filter((item): item is CatalogItem => Boolean(item));\n  if (indexed.length) return sortForCatalogFilter(indexed, 'latest');\n\n${fallbackBody}\n};`;
app = app.slice(0, personStart) + personReplacement + app.slice(personEnd);

const profileStart = app.indexOf('function PersonProfileModal({');
const profileEnd = app.indexOf('\nfunction ', profileStart + 1);
if (profileStart < 0 || profileEnd < 0) throw new Error('Could not locate PersonProfileModal block');
let profile = app.slice(profileStart, profileEnd);
profile = replaceRequired(profile, /  catalog,\n  visible,/, '  catalog,\n  peopleWorks,\n  visible,', 'person modal destructuring');
profile = replaceRequired(profile, /  catalog: CatalogItem\[\];\n  visible: boolean;/, '  catalog: CatalogItem[];\n  peopleWorks: Record<string, string[]>;\n  visible: boolean;', 'person modal props');
profile = replaceRequired(
  profile,
  /  const works = useMemo\(\n    \(\) => person \? personWorksFor\(person, catalog\) : \[\],\n    \[catalog, person\],\n  \);/,
  `  const works = useMemo(\n    () => person ? personWorksFor(person, catalog, peopleWorks) : [],\n    [catalog, peopleWorks, person],\n  );`,
  'person indexed works',
);
app = app.slice(0, profileStart) + profile + app.slice(profileEnd);
app = replaceRequired(
  app,
  /        person=\{selectedPerson\}\n        catalog=\{content\.items\}\n        visible=/,
  `        person={selectedPerson}\n        catalog={content.items}\n        peopleWorks={content.peopleWorks || {}}\n        visible=`,
  'person modal invocation',
);

// Category tiles may only borrow art from the exact category. Never show a
// random unrelated poster. With no valid category art, use that category's icon.
app = replaceRequired(
  app,
  /      let selected: CatalogItem \| undefined;\n      for \(const filter of \[card\.filter, \.\.\.relatedCategoryFilters\(card\.filter\)\]\) \{\n        selected = pickBestUnused\(filter\);\n        if \(selected\) break;\n      \}\n      if \(!selected\) selected = pickAnyUnused\(\);\n      if \(!selected\) continue;/,
  `      const selected = pickBestUnused(card.filter);\n      if (!selected) continue;`,
  'exact category artwork',
);
app = replaceRequired(
  app,
  /<Ionicons name="film-outline" color="rgba\(216,180,90,0\.55\)" size=\{58\} \/>/,
  '<Ionicons name={card.icon} color="rgba(216,180,90,0.55)" size={58} />',
  'category-specific fallback icon',
);

// Restore category scroll after virtualized layout/images settle.
app = replaceRequired(
  app,
  /    const retry = setTimeout\(\(\) => \{\n      categoriesListRef\.current\?\.scrollToOffset\(\{ offset: categoriesScreenScrollOffset, animated: false \}\);\n    \}, 90\);\n    return \(\) => \{ cancelAnimationFrame\(frame\); clearTimeout\(retry\); \};/,
  `    const retry = setTimeout(() => {\n      categoriesListRef.current?.scrollToOffset({ offset: categoriesScreenScrollOffset, animated: false });\n    }, 120);\n    const settle = setTimeout(() => {\n      categoriesListRef.current?.scrollToOffset({ offset: categoriesScreenScrollOffset, animated: false });\n    }, 420);\n    return () => { cancelAnimationFrame(frame); clearTimeout(retry); clearTimeout(settle); };`,
  'categories scroll restore',
);

// Same restoration for category/genre/updated result lists. Match the actual
// multiline cleanup block used by App.tsx.
const listStart = app.indexOf('function CatalogListScreen({');
const listEnd = app.indexOf('\nfunction SimpleSearchScreen(', listStart);
if (listStart < 0 || listEnd < 0) throw new Error('Could not locate CatalogListScreen block');
let listBlock = app.slice(listStart, listEnd);
listBlock = replaceRequired(
  listBlock,
  /    const retry = setTimeout\(\(\) => \{\n      listRef\.current\?\.scrollToOffset\(\{ offset, animated: false \}\);\n    \}, 90\);\n    return \(\) => \{\n      cancelAnimationFrame\(frame\);\n      clearTimeout\(retry\);\n    \};/,
  `    const retry = setTimeout(() => {\n      listRef.current?.scrollToOffset({ offset, animated: false });\n    }, 120);\n    const settle = setTimeout(() => {\n      listRef.current?.scrollToOffset({ offset, animated: false });\n    }, 420);\n    return () => {\n      cancelAnimationFrame(frame);\n      clearTimeout(retry);\n      clearTimeout(settle);\n    };`,
  'catalog list scroll restore',
);
app = app.slice(0, listStart) + listBlock + app.slice(listEnd);

await fs.writeFile('App.tsx', app, 'utf8');

let types = await fs.readFile('src/types.ts', 'utf8');
types = replaceRequired(
  types,
  /  featuredPeople\?: FeaturedPerson\[\];\n  imdbTop100\?: ImdbTop100;/,
  `  featuredPeople?: FeaturedPerson[];\n  /** Compact reverse lookup: person identity key -> catalog item IDs. */\n  peopleWorks?: Record<string, string[]>;\n  imdbTop100?: ImdbTop100;`,
  'CatalogPayload peopleWorks type',
);
types = replaceOptional(
  types,
  '  /** تصویر همان قسمت؛ در نبود آن اپ از پس‌زمینهٔ خود عنوان استفاده می‌کند. */',
  '  /** تصویر همان قسمت؛ اگر آماده نیست UI فقط placeholder سبک نشان می‌دهد. */',
  'episode artwork contract',
);
await fs.writeFile('src/types.ts', types, 'utf8');

let service = await fs.readFile('src/contentService.ts', 'utf8');
if (!service.includes('const normalizePeopleWorks =')) {
  const normalizer = `\nconst normalizePeopleWorks = (value: unknown): Record<string, string[]> => {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};\n  const entries: Array<[string, string[]]> = [];\n  for (const [rawKey, rawIds] of Object.entries(value as Record<string, unknown>)) {\n    const key = asString(rawKey);\n    const ids = [...new Set(stringArray(rawIds).map((id) => asString(id)).filter(Boolean))];\n    if (key && ids.length) entries.push([key, ids]);\n  }\n  return Object.fromEntries(entries);\n};\n`;
  service = replaceRequired(
    service,
    /\nconst normalizedLocalPayload = \(\): CatalogPayload => \{/,
    `${normalizer}\nconst normalizedLocalPayload = (): CatalogPayload => {`,
    'people works normalizer',
  );
}
service = replaceRequired(
  service,
  /  const featuredPeople = normalizeFeaturedPeople\(payload\.featuredPeople \?\? payload\.featured_people\);\n  const updatedAt =/,
  `  const featuredPeople = normalizeFeaturedPeople(payload.featuredPeople ?? payload.featured_people);\n  const peopleWorks = normalizePeopleWorks(payload.peopleWorks ?? payload.people_works);\n  const updatedAt =`,
  'remote peopleWorks value',
);
service = replaceRequired(
  service,
  /    featuredPeople,\n    imdbTop100: normalizeImdbTop100\(payload\.imdbTop100 \?\? payload\.imdb_top_100, items, updatedAt\),/,
  `    featuredPeople,\n    peopleWorks,\n    imdbTop100: normalizeImdbTop100(payload.imdbTop100 ?? payload.imdb_top_100, items, updatedAt),`,
  'remote peopleWorks payload',
);
service = replaceOptional(
  service,
  /  const featuredPeople = normalizeFeaturedPeople\(LOCAL_PAYLOAD\.featuredPeople\);\n\n  return \{/,
  `  const featuredPeople = normalizeFeaturedPeople(LOCAL_PAYLOAD.featuredPeople);\n  const peopleWorks = normalizePeopleWorks(LOCAL_PAYLOAD.peopleWorks);\n\n  return {`,
  'local peopleWorks value',
);
service = replaceOptional(
  service,
  /    items,\n    featuredPeople,\n    imdbTop100: normalizeImdbTop100\(LOCAL_PAYLOAD\.imdbTop100, items, LOCAL_PAYLOAD\.updatedAt\),/,
  `    items,\n    featuredPeople,\n    peopleWorks,\n    imdbTop100: normalizeImdbTop100(LOCAL_PAYLOAD.imdbTop100, items, LOCAL_PAYLOAD.updatedAt),`,
  'local peopleWorks payload',
);
await fs.writeFile('src/contentService.ts', service, 'utf8');

console.log('Final Mobile stability patches applied.');
