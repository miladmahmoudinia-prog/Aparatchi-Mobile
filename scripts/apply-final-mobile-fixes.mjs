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

const patchFunction = (source, name, nextName, transform) => {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const end = source.indexOf(`\nfunction ${nextName}(`, start + 1);
  if (end < 0) throw new Error(`Next function not found after ${name}: ${nextName}`);
  const before = source.slice(start, end);
  const after = transform(before);
  if (after === before) throw new Error(`Function patch produced no change: ${name}`);
  return source.slice(0, start) + after + source.slice(end);
};

let app = await fs.readFile('App.tsx', 'utf8');

// A dubbed-only stream is dubbed even when its download link has not been
// discovered yet. Do not label it as the original version just because the
// source file itself was unlabeled.
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

// Persian line first, English line second. Never repeat the English collection
// name in the Persian title slot.
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

// Replace the old per-card people scan with the compact server reverse index,
// while keeping the old ID/name matcher as a cache compatibility fallback.
const personStart = app.indexOf('const personWorksFor = (person: CatalogPerson, catalog: CatalogItem[]) => {');
const personEnd = app.indexOf('\n\nfunction PersonProfileModal(', personStart);
if (personStart < 0 || personEnd < 0) throw new Error('Could not locate personWorksFor');
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

// Category tiles can only borrow artwork from the exact category. If that
// category has no suitable artwork, keep the designed fallback instead of an
// unrelated movie poster.
app = replaceRequired(
  app,
  /      let selected: CatalogItem \| undefined;\n      for \(const filter of \[card\.filter, \.\.\.relatedCategoryFilters\(card\.filter\)\]\) \{\n        selected = pickBestUnused\(filter\);\n        if \(selected\) break;\n      \}\n      if \(!selected\) selected = pickAnyUnused\(\);\n      if \(!selected\) continue;/,
  `      const selected = pickBestUnused(card.filter);\n      if (!selected) continue;`,
  'exact category artwork',
);

// Restore category scroll after layout settles. This prevents Back from jumping
// to the top/bottom after images finish measuring.
app = replaceRequired(
  app,
  /    const retry = setTimeout\(\(\) => \{\n      categoriesListRef\.current\?\.scrollToOffset\(\{ offset: categoriesScreenScrollOffset, animated: false \}\);\n    \}, 90\);\n    return \(\) => \{ cancelAnimationFrame\(frame\); clearTimeout\(retry\); \};/,
  `    const retry = setTimeout(() => {\n      categoriesListRef.current?.scrollToOffset({ offset: categoriesScreenScrollOffset, animated: false });\n    }, 120);\n    const settle = setTimeout(() => {\n      categoriesListRef.current?.scrollToOffset({ offset: categoriesScreenScrollOffset, animated: false });\n    }, 420);\n    return () => { cancelAnimationFrame(frame); clearTimeout(retry); clearTimeout(settle); };`,
  'categories scroll restore',
);

// Do the same for category/genre/updated list screens.
const listStart = app.indexOf('function CatalogListScreen({');
const listEnd = app.indexOf('\nfunction SimpleSearchScreen(', listStart);
if (listStart < 0 || listEnd < 0) throw new Error('Could not locate CatalogListScreen block');
let listBlock = app.slice(listStart, listEnd);
listBlock = replaceOptional(
  listBlock,
  /    const retry = setTimeout\(\(\) => \{\n      listRef\.current\?\.scrollToOffset\(\{ offset, animated: false \}\);\n    \}, 90\);\n    return \(\) => \{ cancelAnimationFrame\(frame\); clearTimeout\(retry\); \};/,
  `    const retry = setTimeout(() => {\n      listRef.current?.scrollToOffset({ offset, animated: false });\n    }, 120);\n    const settle = setTimeout(() => {\n      listRef.current?.scrollToOffset({ offset, animated: false });\n    }, 420);\n    return () => { cancelAnimationFrame(frame); clearTimeout(retry); clearTimeout(settle); };`,
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

// Remote payload: compute the map once beside featuredPeople and expose it.
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

// Bundled/local payload remains compatible when the map is absent.
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
