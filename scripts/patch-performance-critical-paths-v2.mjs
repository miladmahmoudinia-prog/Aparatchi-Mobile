import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (from, to, label) => {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Patch marker not found: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) {
    throw new Error(`Patch marker is not unique: ${label}`);
  }
  source = source.slice(0, index) + to + source.slice(index + from.length);
};

const replaceRegexOnce = (pattern, replacement, label) => {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Expected one ${label} block, found ${matches.length}`);
  source = source.replace(pattern, replacement);
};

// 1) Never do disk/network detail work during press-in. Navigation must commit
// immediately; the existing selectedItem hydration effect loads the detail shard
// after the destination is already visible.
const eagerDetailPress = ' onPressIn={() => { if (item.detailPath) void loadCatalogItemDetail(item); }}';
const eagerCount = source.split(eagerDetailPress).length - 1;
if (eagerCount < 2) throw new Error(`Expected at least 2 eager detail press handlers, found ${eagerCount}`);
source = source.split(eagerDetailPress).join('');

// 2) Content already writes trustworthy categoryKeys. The old STRICT condition
// accidentally disabled the O(1) path for every server category and forced a
// full classification pass on each “مشاهده همه” tap.
replaceOnce(
  "if (SERVER_CATEGORY_FILTERS.has(filter) && (item.categoryKeys || []).length && !STRICT_DYNAMIC_CATEGORY_FILTERS.has(filter)) {\n    return (item.categoryKeys || []).includes(filter);\n  }",
  "if (SERVER_CATEGORY_FILTERS.has(filter) && (item.categoryKeys || []).length) {\n    return (item.categoryKeys || []).includes(filter);\n  }",
  'server category fast path',
);

// 3) Featured people from Content are authoritative. Only derive from the full
// catalog on legacy/empty payloads.
replaceOnce(
  '    for (const person of [...people, ...deriveFeaturedPeople(catalog)]) {',
  '    const starCandidates = people.length ? people : deriveFeaturedPeople(catalog);\n    for (const person of starCandidates) {',
  'featured people fallback',
);

// 4) Precomputing works for every star caused dozens of catalog scans/sorts at
// Home mount. Resolve only the selected star.
replaceRegexOnce(
  /  const worksByPersonId = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[catalog, catalogById, resolvedPeople\]\);\n\n  const selected = resolvedPeople\.find\(\(person\) => person\.id === selectedId\) \|\| resolvedPeople\[0\];\n  const works = selected \? \(worksByPersonId\.get\(selected\.id\) \|\| \[\]\) : \[\];/,
  `  const selected = resolvedPeople.find((person) => person.id === selectedId) || resolvedPeople[0];
  const works = useMemo(() => {
    if (!selected) return [];
    const explicitIds = new Set(selected.itemIds || []);
    const explicitMatched = [...explicitIds]
      .map((itemId) => catalogById.get(String(itemId)))
      .filter((item): item is CatalogItem => Boolean(item));
    const matched = explicitMatched.length ? explicitMatched : personWorksFor(selected, catalog);
    return sortForCatalogFilter(matched, 'latest').slice(0, 18);
  }, [catalog, catalogById, selected]);`,
  'selected-star works',
);

// 5) Category cover selection used to scan 1,200 items once or twice for every
// card. Do one bounded pass and use server category keys wherever possible.
replaceRegexOnce(
  /  const categoryPreviewItems = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[categoryPreviewPool\]\);/,
  `  const categoryPreviewItems = useMemo(() => {
    const result = new Map<SearchFilter, CatalogItem>();
    const scoreByFilter = new Map<SearchFilter, number>();
    const previewFilters = CATEGORY_CARDS.map((card) => card.filter);

    for (const item of categoryPreviewPool) {
      if (!hasFastCategoryArtwork(item)) continue;
      const keys = item.categoryKeys || [];
      for (const filter of previewFilters) {
        const matches = SERVER_CATEGORY_FILTERS.has(filter) && keys.length
          ? keys.includes(filter)
          : fastCatalogFilterMatch(item, filter);
        if (!matches) continue;
        const score = categoryPreviewScore(item);
        if (score <= (scoreByFilter.get(filter) ?? Number.NEGATIVE_INFINITY)) continue;
        result.set(filter, item);
        scoreByFilter.set(filter, score);
      }
    }
    return result;
  }, [categoryPreviewPool]);`,
  'category preview selection',
);

// 6) expo-image already loads the visible cards. A second 45-image prefetch wave
// competed for bandwidth and JS callbacks, making the actually visible posters
// arrive later on slower mobile networks.
replaceRegexOnce(
  /\n  useEffect\(\(\) => \{\n    \/\/ Use the 10-second branded startup window to warm the artwork actually[\s\S]*?\n  \}, \[newest, rows\]\);\n/,
  '\n  // Visible artwork is loaded and cached by expo-image itself. Avoid a parallel\n  // prefetch flood so taps and the first on-screen posters get priority.\n',
  'home artwork prefetch',
);

await fs.writeFile(path, source);
console.log(JSON.stringify({
  eagerDetailPressHandlersRemoved: eagerCount,
  serverCategoryFastPath: true,
  starFallbackOnlyWhenNeeded: true,
  selectedStarWorksOnly: true,
  categoryPreviewSinglePass: true,
  homePrefetchFloodRemoved: true,
}, null, 2));
