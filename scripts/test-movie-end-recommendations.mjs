import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const required = [
  'const relatedCatalogItems = (item: CatalogItem, catalog: CatalogItem[], limit = 5)',
  "item?.type === 'movie'",
  'Math.max(0, duration - 120)',
  'endCreditsStartSeconds',
  'movieEndRecommendations.length > 0',
  'فیلم‌های پیشنهادی',
  'onPress={() => setEndRecommendationsDismissed(true)}',
  'onRecommendationSelect(recommendation);',
  'closePlayer();',
  'relatedItems={(() => {',
  "return playerItem?.type === 'movie' ? relatedCatalogItems(playerItem, content.items, 5) : [];",
  'movieEndRecommendations: { ...absoluteFillObject',
];

for (const marker of required) {
  if (!app.includes(marker)) throw new Error(`Missing movie-end recommendation marker: ${marker}`);
}

if (/player\.pause\(\);[\s\S]{0,250}فیلم‌های پیشنهادی/.test(app)) {
  throw new Error('Recommendation overlay must not pause playback when it appears.');
}

console.log(JSON.stringify({
  overlay: 'movie-end-recommendations',
  triggerFallbackSeconds: 120,
  creditsMetadataSupported: true,
  maxRecommendations: 5,
  playbackContinuesBehindOverlay: true,
}, null, 2));
