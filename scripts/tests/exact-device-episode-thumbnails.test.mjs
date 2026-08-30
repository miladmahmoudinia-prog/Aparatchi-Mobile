import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

const artworkStart = source.indexOf('function ExactEpisodeArtwork({');
const artworkEnd = source.indexOf('function SeriesEpisodeShowcase({', artworkStart);
const artworkBlock = source.slice(artworkStart, artworkEnd);

test('episode cards never generate video thumbnails while mounting', () => {
  assert.ok(artworkStart >= 0 && artworkEnd > artworkStart);
  assert.ok(!artworkBlock.includes('createVideoPlayer('));
  assert.ok(!artworkBlock.includes('generateThumbnailsAsync'));
  assert.ok(!source.includes('exactEpisodeThumbnailQueue'));
  assert.ok(!source.includes('exactEpisodeThumbnailFailures'));
});

test('episode artwork paints a cached title fallback immediately and overlays exact art when available', () => {
  assert.ok(artworkBlock.includes("const fallbackArtwork = item.backdrop || item.poster || item.posterFallback || '';"));
  assert.ok(artworkBlock.includes('primary={fallbackArtwork}'));
  assert.ok(artworkBlock.includes('localFallback={localArtworkForItem(item)}'));
  assert.ok(artworkBlock.includes("cachePolicy=\"memory-disk\""));
  assert.ok(artworkBlock.includes('{exactArtwork ? ('));
  assert.ok(artworkBlock.includes('<View style={[styles.episodeShowcaseArtwork, style]}>'));
});

test('series episode cards use the lightweight episode artwork helper', () => {
  const start = source.indexOf('function SeriesEpisodeShowcase({');
  const end = source.indexOf('function DownloadOptionsModal({', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('<ExactEpisodeArtwork item={item} artwork={artwork} />'));
});

test('next episode artwork is prefetched and never renders as an empty card', () => {
  assert.ok(source.includes('if (nextEpisodeArtwork) void Image.prefetch(nextEpisodeArtwork)'));
  assert.match(source, /<ExactEpisodeArtwork\s+item=\{item\}\s+artwork=\{nextEpisodeArtwork\}\s+style=\{styles\.nextEpisodeArtwork\}/);
});
