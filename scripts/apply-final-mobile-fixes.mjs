import fs from 'node:fs/promises';

const replaceOnce = (text, search, replacement, label) => {
  if (typeof search === 'string') {
    const first = text.indexOf(search);
    if (first < 0) throw new Error(`Patch target not found: ${label}`);
    if (text.indexOf(search, first + search.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
    return text.slice(0, first) + replacement + text.slice(first + search.length);
  }
  const flags = search.flags.includes('g') ? search.flags : `${search.flags}g`;
  const matches = [...text.matchAll(new RegExp(search.source, flags))];
  if (matches.length !== 1) throw new Error(`Patch target count for ${label}: ${matches.length}`);
  return text.replace(search, replacement);
};

let app = await fs.readFile('App.tsx', 'utf8');

// If the server tells us an item has exactly one language, unlabeled HLS/direct
// playback belongs to that language too. This fixes dubbed streams showing as
// "نسخه اصلی" and also keeps the dubbed badge independent from download links.
app = replaceOnce(
  app,
  `  const unlabeledSources = playbackSourcesForFiles(files.filter((file) => !file.language));\n  if (unlabeledSources.length) {\n    versions.push({\n      label: item.ir ? 'پخش آنلاین' : 'نسخه اصلی',\n      sources: unlabeledSources,\n      defaultSource: defaultPlaybackSource(unlabeledSources),\n    });\n  }`,
  `  const unlabeledSources = playbackSourcesForFiles(files.filter((file) => !file.language));\n  if (unlabeledSources.length) {\n    const inferredLanguages = itemLanguages(item);\n    const inferredLanguage = inferredLanguages.length === 1 ? inferredLanguages[0] : undefined;\n    versions.push({\n      ...(inferredLanguage ? { language: inferredLanguage } : {}),\n      label: inferredLanguage\n        ? languageTitle(inferredLanguage)\n        : (item.ir ? 'پخش آنلاین' : 'نسخه اصلی'),\n      sources: unlabeledSources,\n      defaultSource: defaultPlaybackSource(unlabeledSources),\n    });\n  }`,
  'unlabeled player language',
);

app = replaceOnce(
  app,
  `const meaningfulUpdateLabel = (item: CatalogItem) => {\n  const label = String(item.updateLabel || '').trim();\n  if (!label) return '';\n  return /قسمت|فصل|دوبله|زیر\\s*نویس|subtitle|dubbed|کیفیت|quality/i.test(label) ? label : '';\n};`,
  `const meaningfulUpdateLabel = (item: CatalogItem) => {\n  const label = String(item.updateLabel || '').trim();\n  if (!label) return '';\n  if (/^(?:سریال|عنوان)\\s+جدید$/i.test(label)) return label;\n  return /قسمت|فصل|دوبله|زیر\\s*نویس|subtitle|dubbed|کیفیت|quality/i.test(label) ? label : '';\n};`,
  'updated-feed new-series label',
);

// Collection headings should never use an English string on the Persian line.
app = replaceOnce(
  app,
  `  const members = collectionMembersFor(item, catalog);\n  if (members.length < 2) return null;`,
  `  const members = collectionMembersFor(item, catalog);\n  if (members.length < 2) return null;\n  const rawCollectionFa = String(item.collectionNameFa || '').trim();\n  const rawCollectionEn = String(item.collectionName || '').trim();\n  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)\n    ? rawCollectionFa\n    : \`مجموعه \${String(members[0]?.nameFa || item.nameFa || 'فیلم‌ها').trim()}\`;\n  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn)\n    ? rawCollectionEn\n    : '';`,
  'collection bilingual heading vars',
);
app = replaceOnce(
  app,
  `          <Text style={styles.collectionTitle}>\n            {item.collectionNameFa || item.collectionName || 'این مجموعه'}\n          </Text>\n          {item.collectionName ? (\n            <Text style={styles.collectionEnglish}>{item.collectionName}</Text>\n          ) : null}`,
  `          <Text style={styles.collectionTitle}>{collectionTitleFa}</Text>\n          {collectionTitleEn ? (\n            <Text style={styles.collectionEnglish}>{collectionTitleEn}</Text>\n          ) : null}`,
  'collection bilingual heading render',
);

// Build person work lists from the compact server reverse index first. Keep the
// previous ID/name scan as a compatibility fallback for cached old indexes.
const personStart = app.indexOf('const personWorksFor = (person: CatalogPerson, catalog: CatalogItem[]) => {');
const personEnd = app.indexOf('\n\nfunction PersonProfileModal(', personStart);
if (personStart < 0 || personEnd < 0) throw new Error('Could not locate personWorksFor');
const previousPersonFunction = app.slice(personStart, personEnd);
const fallbackBodyStart = previousPersonFunction.indexOf('  const identityNames =');
if (fallbackBodyStart < 0) throw new Error('Could not locate existing person matcher body');
const fallbackBody = previousPersonFunction.slice(fallbackBodyStart, previousPersonFunction.lastIndexOf('\n};'));
const personReplacement = `const personWorkKeysFor = (person: CatalogPerson) => {\n  const keys: string[] = [];\n  if (person.tmdbId) keys.push(\`tmdb:\${Number(person.tmdbId)}\`);\n  for (const value of [person.name, person.nameFa, personName(person)]) {\n    const normalized = normalizeComparableText(String(value || ''));\n    if (normalized) keys.push(\`name:\${normalized}\`);\n  }\n  return [...new Set(keys)];\n};\n\nconst personWorksFor = (\n  person: CatalogPerson,\n  catalog: CatalogItem[],\n  peopleWorks: Record<string, string[]> = {},\n) => {\n  const catalogById = new Map(catalog.map((item) => [String(item.id), item] as const));\n  const indexed = [...new Set(\n    personWorkKeysFor(person).flatMap((key) => peopleWorks[key] || []),\n  )]\n    .map((id) => catalogById.get(String(id)))\n    .filter((item): item is CatalogItem => Boolean(item));\n  if (indexed.length) return sortForCatalogFilter(indexed, 'latest');\n\n${fallbackBody}\n};`;
app = app.slice(0, personStart) + personReplacement + app.slice(personEnd);

app = replaceOnce(
  app,
  `  catalog,\n  visible,`,
  `  catalog,\n  peopleWorks,\n  visible,`,
  'person modal destructuring peopleWorks',
);
app = replaceOnce(
  app,
  `  catalog: CatalogItem[];\n  visible: boolean;`,
  `  catalog: CatalogItem[];\n  peopleWorks: Record<string, string[]>;\n  visible: boolean;`,
  'person modal peopleWorks prop type',
);
app = replaceOnce(
  app,
  `  const works = useMemo(\n    () => person ? personWorksFor(person, catalog) : [],\n    [catalog, person],\n  );`,
  `  const works = useMemo(\n    () => person ? personWorksFor(person, catalog, peopleWorks) : [],\n    [catalog, peopleWorks, person],\n  );`,
  'person profile indexed works',
);
app = replaceOnce(
  app,
  `        person={selectedPerson}\n        catalog={content.items}`,
  `        person={selectedPerson}\n        catalog={content.items}\n        peopleWorks={content.peopleWorks || {}}`,
  'person modal invocation peopleWorks',
);

// Category cards may only borrow art from their exact category. If that category
// has no valid art yet, leave its designed fallback instead of showing a random
// unrelated title.
app = replaceOnce(
  app,
  `      let selected: CatalogItem | undefined;\n      for (const filter of [card.filter, ...relatedCategoryFilters(card.filter)]) {\n        selected = pickBestUnused(filter);\n        if (selected) break;\n      }\n      if (!selected) selected = pickAnyUnused();\n      if (!selected) continue;`,
  `      const selected = pickBestUnused(card.filter);\n      if (!selected) continue;`,
  'exact category preview art',
);

// Restore scroll again after virtualized content has settled, so Back returns to
// the exact previous position instead of jumping after images/layout arrive.
app = replaceOnce(
  app,
  `    const retry = setTimeout(() => {\n      categoriesListRef.current?.scrollToOffset({ offset: categoriesScreenScrollOffset, animated: false });\n    }, 90);\n    return () => { cancelAnimationFrame(frame); clearTimeout(retry); };`,
  `    const retry = setTimeout(() => {\n      categoriesListRef.current?.scrollToOffset({ offset: categoriesScreenScrollOffset, animated: false });\n    }, 120);\n    const settle = setTimeout(() => {\n      categoriesListRef.current?.scrollToOffset({ offset: categoriesScreenScrollOffset, animated: false });\n    }, 420);\n    return () => { cancelAnimationFrame(frame); clearTimeout(retry); clearTimeout(settle); };`,
  'categories exact scroll restore',
);
app = replaceOnce(
  app,
  `    const retry = setTimeout(() => {\n      listRef.current?.scrollToOffset({ offset, animated: false });\n    }, 90);\n    return () => { cancelAnimationFrame(frame); clearTimeout(retry); };`,
  `    const retry = setTimeout(() => {\n      listRef.current?.scrollToOffset({ offset, animated: false });\n    }, 120);\n    const settle = setTimeout(() => {\n      listRef.current?.scrollToOffset({ offset, animated: false });\n    }, 420);\n    return () => { cancelAnimationFrame(frame); clearTimeout(retry); clearTimeout(settle); };`,
  'catalog exact scroll restore',
);

await fs.writeFile('App.tsx', app, 'utf8');

let types = await fs.readFile('src/types.ts', 'utf8');
types = replaceOnce(
  types,
  `  featuredPeople?: FeaturedPerson[];\n  imdbTop100?: ImdbTop100;`,
  `  featuredPeople?: FeaturedPerson[];\n  /** Compact reverse lookup: person identity key -> catalog item IDs. */\n  peopleWorks?: Record<string, string[]>;\n  imdbTop100?: ImdbTop100;`,
  'CatalogPayload peopleWorks type',
);
types = replaceOnce(
  types,
  '  /** تصویر همان قسمت؛ در نبود آن اپ از پس‌زمینهٔ خود عنوان استفاده می‌کند. */',
  '  /** تصویر همان قسمت؛ اگر هنوز آماده نیست UI فقط placeholder سبک نشان می‌دهد. */',
  'episode artwork comment',
);
await fs.writeFile('src/types.ts', types, 'utf8');

let service = await fs.readFile('src/contentService.ts', 'utf8');
const peopleWorksNormalizer = `\nconst normalizePeopleWorks = (value: unknown): Record<string, string[]> => {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};\n  const entries: Array<[string, string[]]> = [];\n  for (const [rawKey, rawIds] of Object.entries(value as Record<string, unknown>)) {\n    const key = asString(rawKey);\n    const ids = [...new Set(stringArray(rawIds).map((id) => asString(id)).filter(Boolean))];\n    if (key && ids.length) entries.push([key, ids]);\n  }\n  return Object.fromEntries(entries);\n};\n`;
const payloadMarker = '\nconst normalizePayload = (payload: CatalogPayload): CatalogPayload => {';
if (!service.includes(payloadMarker)) throw new Error('Could not locate normalizePayload');
service = service.replace(payloadMarker, `${peopleWorksNormalizer}${payloadMarker}`);
service = replaceOnce(
  service,
  `    featuredPeople: normalizeFeaturedPeople(payload.featuredPeople),\n    imdbTop100: normalizeImdbTop100(payload.imdbTop100),`,
  `    featuredPeople: normalizeFeaturedPeople(payload.featuredPeople),\n    peopleWorks: normalizePeopleWorks(payload.peopleWorks),\n    imdbTop100: normalizeImdbTop100(payload.imdbTop100),`,
  'normalizePayload peopleWorks',
);
await fs.writeFile('src/contentService.ts', service, 'utf8');

console.log('Final Mobile stability patches applied.');
