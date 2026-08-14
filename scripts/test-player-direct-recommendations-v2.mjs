import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');

const requireMarker = (marker, label) => {
  if (!app.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
};

requireMarker('const playRecommendedMovieInsidePlayer = async (summary: CatalogItem) => {', 'direct recommendation helper');
requireMarker('const hydrated = await loadCatalogItemDetail(summary).catch(() => null);', 'detail hydration');
requireMarker('const versions = playableVersionsFor(item, null);', 'playable version resolution');
requireMarker("versions.find((candidate) => candidate.language === 'dubbed')", 'dub preference');
requireMarker("versions.find((candidate) => candidate.language === 'subtitled')", 'subtitle fallback');
requireMarker('onRecommendationSelect={(nextItem) => playRecommendedMovieInsidePlayer(nextItem)}', 'root direct player callback');
requireMarker('void onRecommendationSelect(recommendation);', 'player recommendation invocation');
requireMarker('onProgress(request, position, safeDuration, false);', 'current movie progress persistence');

const recommendationStart = app.indexOf('{movieEndRecommendations.map((recommendation) => (');
const recommendationEnd = app.indexOf('))}', recommendationStart);
const recommendationBlock = app.slice(recommendationStart, recommendationEnd > recommendationStart ? recommendationEnd : recommendationStart + 2500);
if (recommendationBlock.includes('closePlayer();')) {
  throw new Error('Movie recommendation still closes the player before switching.');
}

const rootMarker = `onRecommendationSelect={(nextItem) => playRecommendedMovieInsidePlayer(nextItem)}`;
if (!app.includes(rootMarker)) throw new Error('Recommendation still navigates to detail instead of direct playback.');

console.log(JSON.stringify({
  directPlayback: true,
  playerStaysOpen: true,
  detailHydration: true,
  noVisibleDetailNavigationBeforePlayback: true,
  currentProgressSaved: true,
}, null, 2));
