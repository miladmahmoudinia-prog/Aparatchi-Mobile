import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('missing episode art is generated from the exact episode playback URL on device', () => {
  assert.ok(source.includes("createVideoPlayer(exactSource)"));
  assert.ok(source.includes("player.generateThumbnailsAsync([requestedTime], { maxWidth: 640 })"));
  assert.ok(source.includes("playableVersionsFor(item, group)"));
  assert.ok(source.includes("exactEpisodeThumbnailQueue"));
  assert.ok(source.includes("player.release()"));
});

test('episode card never falls back to series poster or unrelated artwork', () => {
  const start = source.indexOf('function ExactEpisodeArtwork({');
  const end = source.indexOf('function SeriesEpisodeShowcase({', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('primary=""'));
  assert.ok(!block.includes('item.poster'));
  assert.ok(!block.includes('item.backdrop'));
});

test('episode thumbnail work is serialized and cached for performance', () => {
  assert.ok(source.includes('const exactEpisodeThumbnailCache = new Map'));
  assert.ok(source.includes('let exactEpisodeThumbnailQueue: Promise<void> = Promise.resolve()'));
  assert.ok(source.includes('exactEpisodeThumbnailQueue = exactEpisodeThumbnailQueue'));
});
