import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('catalog artwork uses memory+disk cache and soft transition', () => {
  const start = source.indexOf('const CatalogArtwork');
  const end = source.indexOf('const localArtworkForItem', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('cachePolicy="memory-disk"'));
  assert.ok(block.includes('transition = 160'));
  assert.ok(block.includes('recyclingKey={remoteUrl}'));
});

test('main poster cards do not pop in with zero-duration transition', () => {
  const start = source.indexOf('const PosterCard');
  const end = source.indexOf('function MovieCollectionSection', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('transition={160}'));
  assert.ok(!block.includes('transition={0}'));
});

test('horizontal shelves render posters in smaller progressive batches', () => {
  const start = source.indexOf('const HorizontalCatalog');
  const end = source.indexOf('const StarPersonButton', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('initialNumToRender={4}'));
  assert.ok(block.includes('maxToRenderPerBatch={4}'));
  assert.ok(block.includes('updateCellsBatchingPeriod={50}'));
  assert.ok(block.includes('windowSize={4}'));
});

test('collection posters share the same memory-disk cache behavior', () => {
  const start = source.indexOf('function MovieCollectionSection');
  const end = source.indexOf('const CastPersonCard', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('cachePolicy="memory-disk"'));
  assert.ok(block.includes('recyclingKey='));
  assert.ok(block.includes('collection:'));
});
