import fs from 'node:fs/promises';

const source = await fs.readFile('App.tsx', 'utf8');

const requireMarker = (marker) => {
  if (!source.includes(marker)) throw new Error(`Missing performance marker: ${marker}`);
};

// Artwork fallbacks stay resilient, but interaction work must never wait on
// background detail/network reads.
requireMarker("candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(sourceWithoutProtocol)}&w=190&output=webp`);");
if (/onPressIn=\{\(\) => \{ if \(item\.detailPath\) void loadCatalogItemDetail\(item\); \}\}/.test(source)) {
  throw new Error('Poster/Hero press-in still starts detail I/O before navigation.');
}

// Server category keys are the O(1) browse path. Do not fall back to expensive
// title/country/genre classification when the server already classified an item.
requireMarker("if (SERVER_CATEGORY_FILTERS.has(filter) && (item.categoryKeys || []).length) {");
if (source.includes("SERVER_CATEGORY_FILTERS.has(filter) && (item.categoryKeys || []).length && !STRICT_DYNAMIC_CATEGORY_FILTERS.has(filter)")) {
  throw new Error('Server category fast path is still disabled by the strict-filter condition.');
}

// The server-provided featuredPeople list is authoritative. Deriving a second
// list from every catalog item's cast and precomputing works for ~60 people made
// Home mount and bottom-tab taps block the JS thread.
requireMarker('const starCandidates = people.length ? people : deriveFeaturedPeople(catalog);');
if (source.includes('for (const person of [...people, ...deriveFeaturedPeople(catalog)])')) {
  throw new Error('Stars still derive the whole catalog even when server people exist.');
}
if (source.includes('const worksByPersonId = useMemo')) {
  throw new Error('Stars still precompute works for every person instead of only the selected star.');
}
requireMarker('const works = useMemo(() => {');

// Category covers should use a single bounded pass, not two full scans per card.
requireMarker('const previewFilters = CATEGORY_CARDS.map((card) => card.filter);');
if (source.includes('const pickBestUnused = (filter: SearchFilter) =>')) {
  throw new Error('Category screen still performs per-card full-catalog scans.');
}
if (source.includes('const pickBestAvailable = (filter: SearchFilter) =>')) {
  throw new Error('Category screen still performs a second per-card full-catalog scan.');
}

// Home images already mount through expo-image. A parallel 45-image prefetch
// flood competes with the images actually visible to the user.
const homeStart = source.indexOf('const HomeScreen = memo');
const homeEnd = source.indexOf('type CategoryCardConfig', homeStart);
const homeBlock = source.slice(homeStart, homeEnd);
if (homeBlock.includes('Image.prefetch(')) {
  throw new Error('Home still launches a redundant image prefetch flood.');
}

requireMarker('initialNumToRender={4}');
requireMarker('maxToRenderPerBatch={3}');
requireMarker('windowSize={5}');

console.log(JSON.stringify({
  detailIoOnPressIn: false,
  serverCategoryKeys: 'fast-path',
  starCatalogScan: 'server-list-or-fallback-only',
  starWorks: 'selected-only',
  categoryPreview: 'single-bounded-pass',
  homePrefetchFlood: false,
}, null, 2));
