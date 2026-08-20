import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');

test('end cards wait until final five seconds and persist at end', () => {
  assert.match(app, /const movieEndOverlayStart = Math\.max\(0, duration - 5\);/);
  assert.doesNotMatch(app, /duration - 120/);
  const uses = app.match(/currentTime >= movieEndOverlayStart/g) || [];
  assert.equal(uses.length, 2);
  assert.doesNotMatch(app, /currentTime >= movieEndOverlayStart &&\s*currentTime < duration/);
});

test('movie and next episode overlays are constrained to the video frame and landscape safe area', () => {
  assert.match(app, /styles\.movieEndRecommendations,\s*frameRect,/);
  assert.match(app, /styles\.nextEpisodeOverlay,\s*frameRect,/);
  assert.match(app, /paddingRight: safeRight/);
  assert.match(app, /movieEndRecommendationPoster: \{ width: 72, height: 98/);
  assert.match(app, /nextEpisodeArtwork: \{ width: 132, height: 78/);
});

test('next episode can use unique remote episode artwork without reusing series art', () => {
  assert.match(app, /const seriesArtwork = new Set\(\[/);
  assert.match(app, /return seriesArtwork\.has\(artwork\) \? '' : artwork;/);
});

test('related detail does not build a back stack', () => {
  assert.match(app, /const openRelatedDetail = useCallback/);
  assert.match(app, /onOpenRelated=\{openRelatedDetail\}/);
});

test('poster interaction stays light and has a generous press target', () => {
  assert.match(app, /const latestEpisodeMeta = item\.latestEpisode \|\| \(item\.type === 'series' \? newestEpisodeGroup\(item\) : null\);/);
  assert.match(app, /pressRetentionOffset=\{\{ top: 24, right: 24, bottom: 24, left: 24 \}\}/);
  assert.match(app, /const posterNameFa = String\(item\.nameFa \|\| ''\)\.trim\(\) \|\| item\.name;/);
});

test('category cards keep fast preview scan but backfill missing artwork from full catalog', () => {
  assert.match(app, /const categoryPreviewPool = useMemo\(\s*\(\) => usableCatalog\.slice\(0, 1200\)/);
  assert.match(app, /const missing = new Set\(previewFilters\.filter\(\(filter\) => !result\.has\(filter\)\)\);/);
  assert.match(app, /for \(const item of usableCatalog\)/);
});

test('exact collection pixel restore remains installed', () => {
  assert.match(app, /let collectionBrowserScrollSnapshot: GridScrollSnapshot = \{ offset: 0 \};/);
  assert.match(app, /anchorId: group\.id,/);
  assert.match(app, /snapshot\.offset \+ \(nextRow - previousRow\) \* folderRowHeight/);
  assert.match(app, /scrollToOffset\(\{ offset, animated: false \}\)/);
  assert.doesNotMatch(app, /contentOffset=\{\{ x: 0, y: collectionBrowserScrollOffset \}\}/);
  assert.match(app, /onScroll=\{rememberCollectionFolderOffset\}/);
});
