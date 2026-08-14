import fs from 'node:fs/promises';

const replaceOnce = (source, from, to, label) => {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing patch marker: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Non-unique patch marker: ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
};

// ---- public payload transport type ----
let types = await fs.readFile('src/types.ts', 'utf8');
types = replaceOnce(
  types,
  `export type CatalogPayload = {\n`,
  `export type PersonWorkRef = string | number;\n\nexport type CatalogPayload = {\n`,
  'PersonWorkRef type',
);
types = replaceOnce(
  types,
  `  /** Compact reverse lookup: person identity key -> catalog item IDs. */\n  peopleWorks?: Record<string, string[]>;\n`,
  `  /** Compact reverse lookup: person identity key -> item index (remote) or legacy item ID. */\n  peopleWorks?: Record<string, PersonWorkRef[]>;\n`,
  'peopleWorks payload type',
);
await fs.writeFile('src/types.ts', types);

// ---- catalog parser: preserve numeric indexes instead of re-expanding them ----
let service = await fs.readFile('src/contentService.ts', 'utf8');
service = replaceOnce(
  service,
  `  OperatorAccessKind,\n  ScheduleEntry,\n`,
  `  OperatorAccessKind,\n  PersonWorkRef,\n  ScheduleEntry,\n`,
  'content service PersonWorkRef import',
);
service = replaceOnce(
  service,
  `const normalizePeopleWorks = (value: unknown): Record<string, string[]> => {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};\n  const entries: Array<[string, string[]]> = [];\n  for (const [rawKey, rawIds] of Object.entries(value as Record<string, unknown>)) {\n    const key = asString(rawKey);\n    const ids = [...new Set(stringArray(rawIds).map((id) => asString(id)).filter(Boolean))];\n    if (key && ids.length) entries.push([key, ids]);\n  }\n  return Object.fromEntries(entries);\n};`,
  `const normalizePeopleWorks = (value: unknown): Record<string, PersonWorkRef[]> => {\n  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};\n  const entries: Array<[string, PersonWorkRef[]]> = [];\n  for (const [rawKey, rawRefs] of Object.entries(value as Record<string, unknown>)) {\n    const key = asString(rawKey);\n    if (!key || !Array.isArray(rawRefs) || !rawRefs.length) continue;\n    const refs: PersonWorkRef[] = [];\n    const seen = new Set<string>();\n    for (const rawRef of rawRefs) {\n      const ref: PersonWorkRef | null = typeof rawRef === 'number' && Number.isInteger(rawRef) && rawRef >= 0\n        ? rawRef\n        : asString(rawRef) || null;\n      if (ref === null) continue;\n      const identity = typeof ref === 'number' ? \`i:\${ref}\` : \`s:\${ref}\`;\n      if (seen.has(identity)) continue;\n      seen.add(identity);\n      refs.push(ref);\n    }\n    if (refs.length) entries.push([key, refs]);\n  }\n  return Object.fromEntries(entries);\n};`,
  'numeric peopleWorks normalization',
);
await fs.writeFile('src/contentService.ts', service);

// ---- UI: resolve refs lazily only when actor search/profile actually needs them ----
let app = await fs.readFile('App.tsx', 'utf8');
app = replaceOnce(
  app,
  `import { CatalogItem, CatalogPerson, DayId, DownloadFile, DownloadSection, FeaturedPerson, ImdbTop100, ImdbTopEntry, MediaLanguage, ScheduleEntry } from './src/types';`,
  `import { CatalogItem, CatalogPerson, DayId, DownloadFile, DownloadSection, FeaturedPerson, ImdbTop100, ImdbTopEntry, MediaLanguage, PersonWorkRef, ScheduleEntry } from './src/types';`,
  'App PersonWorkRef import',
);

app = replaceOnce(
  app,
  `const personWorksFor = (\n  person: CatalogPerson,\n  catalog: CatalogItem[],\n  peopleWorks: Record<string, string[]> = {},\n) => {\n  const catalogById = new Map(catalog.map((item) => [String(item.id), item] as const));\n  const indexed = [...new Set(personWorkKeysFor(person).flatMap((key) => peopleWorks[key] || []))]\n    .map((id) => catalogById.get(String(id)))\n    .filter((item): item is CatalogItem => Boolean(item));`,
  `const personWorksFor = (\n  person: CatalogPerson,\n  catalog: CatalogItem[],\n  peopleWorks: Record<string, PersonWorkRef[]> = {},\n) => {\n  const refs = [...new Set(personWorkKeysFor(person).flatMap((key) => peopleWorks[key] || []))];\n  const needsIdLookup = refs.some((ref) => typeof ref === 'string');\n  const catalogById = needsIdLookup\n    ? new Map(catalog.map((item) => [String(item.id), item] as const))\n    : null;\n  const indexed = refs\n    .map((ref) => typeof ref === 'number' ? catalog[ref] : catalogById?.get(String(ref)))\n    .filter((item): item is CatalogItem => Boolean(item));`,
  'personWorksFor numeric refs',
);

// Query actor names lazily after debounce. Numeric refs stay compact in memory
// until the user actually searches for a person.
const helperMarker = `const personAge = (person: CatalogPerson) => {`;
app = replaceOnce(
  app,
  helperMarker,
  `const peopleWorkItemIdsMatchingQuery = (\n  peopleWorks: Record<string, PersonWorkRef[]> | undefined,\n  catalog: CatalogItem[],\n  normalizedQuery: string,\n) => {\n  const matched = new Set<string>();\n  if (!normalizedQuery || !peopleWorks) return matched;\n  for (const [key, refs] of Object.entries(peopleWorks)) {\n    if (!key.startsWith('name:')) continue;\n    if (!normalizeComparableText(key.slice(5)).includes(normalizedQuery)) continue;\n    for (const ref of refs) {\n      const id = typeof ref === 'number' ? catalog[ref]?.id : String(ref || '');\n      if (id) matched.add(String(id));\n    }\n  }\n  return matched;\n};\n\n${helperMarker}`,
  'actor query helper',
);

// Categories inline search: no per-item cast payload required.
app = replaceOnce(
  app,
  `const CategoriesScreen = memo(function CategoriesScreen({\n  catalog,\n  onBrowse,\n  onOpen,\n  isActive,\n}: {\n  catalog: CatalogItem[];\n  onBrowse: (filter: SearchFilter) => void;\n  onOpen: (item: CatalogItem) => void;\n  isActive: boolean;\n}) {`,
  `const CategoriesScreen = memo(function CategoriesScreen({\n  catalog,\n  peopleWorks,\n  onBrowse,\n  onOpen,\n  isActive,\n}: {\n  catalog: CatalogItem[];\n  peopleWorks?: Record<string, PersonWorkRef[]>;\n  onBrowse: (filter: SearchFilter) => void;\n  onOpen: (item: CatalogItem) => void;\n  isActive: boolean;\n}) {`,
  'Categories peopleWorks prop',
);
app = replaceOnce(
  app,
  `  const searchResults = useMemo(() => {\n    if (!deferredQuery) return [];\n    return sortForCatalogFilter(\n      usableCatalog.filter((item) => normalizeComparableText([\n        item.nameFa,\n        item.name,\n        ...(item.genres || []),\n        ...(item.countryLabels || []),\n        ...(item.countryNames || []),\n        ...(item.people || []).flatMap((person) => [person.nameFa, person.name || '']),\n      ].join(' ')).includes(deferredQuery)),\n      'latest',\n    ).slice(0, 50);\n  }, [deferredQuery, usableCatalog]);`,
  `  const categoryActorMatches = useMemo(\n    () => peopleWorkItemIdsMatchingQuery(peopleWorks, usableCatalog, deferredQuery),\n    [deferredQuery, peopleWorks, usableCatalog],\n  );\n  const searchResults = useMemo(() => {\n    if (!deferredQuery) return [];\n    return sortForCatalogFilter(\n      usableCatalog.filter((item) =>\n        categoryActorMatches.has(String(item.id)) ||\n        normalizeComparableText([\n          item.nameFa,\n          item.name,\n          ...(item.genres || []),\n          ...(item.countryLabels || []),\n          ...(item.countryNames || []),\n        ].join(' ')).includes(deferredQuery),\n      ),\n      'latest',\n    ).slice(0, 50);\n  }, [categoryActorMatches, deferredQuery, usableCatalog]);`,
  'Categories actor search',
);

// Main search: keep the lightweight title/country index, supplement it with
// peopleWorks only after the user enters a query.
app = replaceOnce(
  app,
  `function SimpleSearchScreen({\n  catalog,\n  onOpen,\n}: {\n  catalog: CatalogItem[];\n  onOpen: (item: CatalogItem) => void;\n}) {`,
  `function SimpleSearchScreen({\n  catalog,\n  peopleWorks,\n  onOpen,\n}: {\n  catalog: CatalogItem[];\n  peopleWorks?: Record<string, PersonWorkRef[]>;\n  onOpen: (item: CatalogItem) => void;\n}) {`,
  'SimpleSearch peopleWorks prop',
);
app = replaceOnce(
  app,
  `          ...(item.countryLabels || []),\n          ...(item.countryNames || []),\n          ...(item.people || []).flatMap((person) => [person.nameFa, person.name || '']),\n`,
  `          ...(item.countryLabels || []),\n          ...(item.countryNames || []),\n`,
  'SimpleSearch lightweight index',
);
app = replaceOnce(
  app,
  `  const results = useMemo(() => {\n    if (!deferredQuery) return [];\n    const matched: CatalogItem[] = [];\n    for (const entry of searchIndex) {\n      if (!entry.text.includes(deferredQuery)) continue;\n      matched.push(entry.item);\n      if (matched.length >= 48) break;\n    }\n    return sortForCatalogFilter(matched, 'latest');\n  }, [deferredQuery, searchIndex]);`,
  `  const actorMatchedIds = useMemo(\n    () => peopleWorkItemIdsMatchingQuery(peopleWorks, catalog, deferredQuery),\n    [catalog, deferredQuery, peopleWorks],\n  );\n  const results = useMemo(() => {\n    if (!deferredQuery) return [];\n    const matched: CatalogItem[] = [];\n    for (const entry of searchIndex) {\n      if (!entry.text.includes(deferredQuery) && !actorMatchedIds.has(String(entry.item.id))) continue;\n      matched.push(entry.item);\n      if (matched.length >= 48) break;\n    }\n    return sortForCatalogFilter(matched, 'latest');\n  }, [actorMatchedIds, deferredQuery, searchIndex]);`,
  'SimpleSearch actor matches',
);
app = replaceOnce(
  app,
  `function SearchScreen(props: {\n  catalog: CatalogItem[];\n  onOpen: (item: CatalogItem) => void;\n  initialFilter: SearchFilter;\n}) {\n  if (props.initialFilter === 'all') return <SimpleSearchScreen catalog={props.catalog} onOpen={props.onOpen} />;`,
  `function SearchScreen(props: {\n  catalog: CatalogItem[];\n  peopleWorks?: Record<string, PersonWorkRef[]>;\n  onOpen: (item: CatalogItem) => void;\n  initialFilter: SearchFilter;\n}) {\n  if (props.initialFilter === 'all') return <SimpleSearchScreen catalog={props.catalog} peopleWorks={props.peopleWorks} onOpen={props.onOpen} />;`,
  'SearchScreen peopleWorks forwarding',
);

// Root wiring.
app = replaceOnce(
  app,
  `<CategoriesScreen catalog={content.items} onBrowse={openCatalogFilter} onOpen={setSelectedItem} isActive={activeTab === 'categories'} />`,
  `<CategoriesScreen catalog={content.items} peopleWorks={content.peopleWorks} onBrowse={openCatalogFilter} onOpen={setSelectedItem} isActive={activeTab === 'categories'} />`,
  'Categories root peopleWorks',
);
app = replaceOnce(
  app,
  `            <SearchScreen\n              catalog={content.items}\n              onOpen={setSelectedItem}\n              initialFilter={searchFilter}\n            />`,
  `            <SearchScreen\n              catalog={content.items}\n              peopleWorks={content.peopleWorks}\n              onOpen={setSelectedItem}\n              initialFilter={searchFilter}\n            />`,
  'Search root peopleWorks',
);

await fs.writeFile('App.tsx', app);

console.log(JSON.stringify({
  numericPeopleRefsKeptCompactInMemory: true,
  actorSearchUsesReverseIndex: true,
  categoriesActorSearchUsesReverseIndex: true,
  legacyStringRefsSupported: true,
}, null, 2));
