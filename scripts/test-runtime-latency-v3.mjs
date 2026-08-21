import fs from 'node:fs/promises';

const [app, service] = await Promise.all([
  fs.readFile('App.tsx', 'utf8'),
  fs.readFile('src/contentService.ts', 'utf8'),
]);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const artworkStart = app.indexOf('function ExactEpisodeArtwork({');
const artworkEnd = app.indexOf('function SeriesEpisodeShowcase({', artworkStart);
assert(artworkStart >= 0 && artworkEnd > artworkStart, 'ExactEpisodeArtwork block missing');
const artwork = app.slice(artworkStart, artworkEnd);
assert(!artwork.includes('createVideoPlayer('), 'Episode cards still start a video decoder');
assert(!artwork.includes('generateThumbnailsAsync'), 'Episode cards still extract thumbnails while mounting');
assert(artwork.includes("const fallbackArtwork = item.backdrop || item.poster || item.posterFallback || '';"), 'Immediate episode fallback artwork missing');
assert(artwork.includes('primary={fallbackArtwork}'), 'Cached episode fallback is not painted first');
assert(artwork.includes('cachePolicy="memory-disk"'), 'Exact episode frame is not using image cache');
assert(app.includes('<ExactEpisodeArtwork item={item} artwork={artwork} />'), 'Episode showcase still uses the expensive artwork signature');

assert(app.includes('const bareEpisodeNumberPattern = new RegExp'), 'Bare episode-number boilerplate detection missing');
assert(app.includes('episodeOnlyPattern.test(withoutName) || bareEpisodeNumberPattern.test(withoutName)'), 'Repeated series name plus episode number is not stripped');

const detailStart = app.indexOf('function DetailModal({');
const detailEnd = app.indexOf('function PersonProfileModal({', detailStart);
const detail = app.slice(detailStart, detailEnd);
assert(detail.includes("const detailBodyReady = Boolean(item && (!item.detailPath || item.detailLoaded === true));"), 'Media controls can still render from incomplete summary data');
assert(detail.includes('در حال آماده‌کردن پخش و قسمت‌ها…'), 'Detail loading copy does not distinguish media hydration');
assert(detail.includes('<Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>'), 'Summary overview is not visible while media details hydrate');
assert(app.includes('detailPreparing: { minHeight: 72'), 'Detail loading placeholder still reserves a large blank area');

assert(app.includes('style={[styles.nextEpisodeOverlay, frameRect]}'), 'Next episode overlay is not constrained to the video frame');
const nextStyleStart = app.indexOf('nextEpisodeOverlay: {');
const nextStyleEnd = app.indexOf('nextEpisodeCard:', nextStyleStart);
const nextStyle = app.slice(nextStyleStart, nextStyleEnd);
assert(nextStyle.includes("position: 'absolute'"), 'Next episode overlay has no frame-relative positioning');
assert(!nextStyle.includes('absoluteFillObject'), 'Next episode overlay still fills the whole device screen');
assert(app.includes('const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(15);'), '15-second next-episode countdown regressed');

const stableStart = service.indexOf('const fetchStableDetailPointerCandidate');
const stableEnd = service.indexOf('export async function loadCatalogItemDetail', stableStart);
assert(stableStart >= 0 && stableEnd > stableStart, 'Fast stable pointer resolver missing');
const stable = service.slice(stableStart, stableEnd);
assert(stable.includes('const boundedStablePointerPath = async (list: string[], timeoutMs: number)'), 'Bounded stable pointer resolver missing');
assert(stable.includes('const rawPointerPath = await boundedStablePointerPath(rawCandidates, 1800);'), 'Raw pointer is not preferred with a bounded budget');
assert(stable.includes('const currentPath = rawPointerPath || await boundedStablePointerPath(mirrorCandidates, 1800);'), 'CDN pointer is not restricted to Raw-unavailable fallback');
assert(stable.includes('Promise.race(['), 'Stable pointer timeout is not bounded');
assert(!stable.includes('const mirrorPromise = firstValidStableDetailPath(mirrorCandidates, summary);'), 'Stale CDN pointer can still race healthy Raw truth');
assert(!stable.includes('setTimeout(() => resolve(null), 450)'), 'Obsolete 450ms Raw head-start is still active');
assert(!stable.includes('for (const candidate of candidates)'), 'Stable pointer mirrors are still sequential inside a mirror class');
assert(stable.includes('_aparatchi_pointer=${Date.now()}'), 'Mutable stable pointer lost cache busting');

const detailLoaderStart = service.indexOf('export async function loadCatalogItemDetail');
const detailLoader = service.slice(detailLoaderStart);
const exactPath = detailLoader.indexOf('const detailPath = summaryDetailPath;');
const firstFetch = detailLoader.indexOf('const firstValid = await new Promise');
const recoveryGate = detailLoader.indexOf('if (!resolvedDetail) {');
const pointerRecovery = detailLoader.indexOf('await resolveStableDetailPath(summary, detailPath)', recoveryGate);
assert(exactPath >= 0 && exactPath < firstFetch, 'Exact immutable detail path is not the first load path');
assert(recoveryGate > firstFetch && pointerRecovery > recoveryGate, 'Stable pointer is not restricted to failed-shard recovery');

console.log(JSON.stringify({
  episodeArtwork: 'cached-fallback-no-video-decoder',
  episodeTapPath: 'no-thumbnail-work-on-mount',
  episodeLabels: 'series-name-number-boilerplate-hidden',
  detailSummary: 'visible-during-media-hydration',
  stablePointer: 'exact-shard-first-raw-pointer-on-miss',
  nextEpisodeOverlay: 'video-frame',
}, null, 2));
