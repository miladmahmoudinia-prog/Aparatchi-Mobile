import fs from 'node:fs/promises';

const source = await fs.readFile('App.tsx', 'utf8');

const requireMarker = (marker) => {
  if (!source.includes(marker)) throw new Error(`Missing performance marker: ${marker}`);
};

requireMarker("candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(sourceWithoutProtocol)}&w=190&output=webp`);");
requireMarker('const matchedIds = explicitMatches.length');
requireMarker('? explicitMatches');
requireMarker(': personWorksFor(person, catalog).map((item) => item.id);');
requireMarker('...rows.slice(0, 8).flatMap((row) => row.items.slice(0, 5))');
requireMarker('.slice(0, 45);');
requireMarker('index * 550');
requireMarker('initialNumToRender={4}');
requireMarker('maxToRenderPerBatch={3}');
requireMarker('windowSize={5}');

const resolvedStart = source.indexOf('const resolvedPeople = useMemo');
const resolvedEnd = source.indexOf('const [selectedId', resolvedStart);
const resolvedBlock = source.slice(resolvedStart, resolvedEnd);
const eagerFallback = 'const fallbackMatches = personWorksFor(person, catalog)';
if (resolvedBlock.includes(eagerFallback)) throw new Error('Stars still perform eager full-catalog fallback scans.');

const homeStart = source.indexOf('const HomeScreen = memo');
const homeEnd = source.indexOf('type CategoryCardConfig', homeStart);
const homeBlock = source.slice(homeStart, homeEnd);
if (homeBlock.includes('.slice(0, 36)')) throw new Error('Home still prefetches arbitrary catalog rows.');

const artworkStart = source.indexOf('const catalogArtworkCandidates');
const artworkEnd = source.indexOf('const internetIsReachable', artworkStart);
const artworkBlock = source.slice(artworkStart, artworkEnd);
const tmdbStart = artworkBlock.indexOf('if (isTmdbArtwork)');
const tmdbBlock = artworkBlock.slice(tmdbStart, artworkBlock.indexOf('} else {', tmdbStart));
if (!(tmdbBlock.indexOf('proxied,') < tmdbBlock.indexOf('image.replace'))) {
  throw new Error('TMDB poster proxy is not tried before direct TMDB artwork.');
}

console.log(JSON.stringify({
  tmdbArtwork: 'proxy-first',
  starFallbackLookup: 'lazy',
  homePrefetch: 'visible-shelves-staggered',
  initialShelves: 4,
}, null, 2));
