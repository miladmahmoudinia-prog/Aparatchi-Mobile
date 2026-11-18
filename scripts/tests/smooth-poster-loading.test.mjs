import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('catalog artwork uses separately keyed racing images with native caching', () => {
  const start = source.indexOf('const CatalogArtwork');
  const end = source.indexOf('const localArtworkForItem', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('cachePolicy="memory-disk"'));
  assert.ok(block.includes('transition={transition}'));
  assert.ok(block.includes('recyclingKey={String(primary || fallback || remoteUrl)}'));
  assert.ok(block.includes('const { sources, finish } = useArtworkSources(candidates)'));
  assert.ok(block.includes('sources.map((remoteUrl)'));
  assert.ok(block.includes('key={remoteUrl}'));
  assert.ok(block.includes('finish(remoteUrl, true)'));
  assert.ok(block.includes('finish(remoteUrl, false)'));
});

test('main horizontal catalog keeps Android edge posters mounted without duplicate props', () => {
  const start = source.indexOf('const HorizontalCatalog');
  const end = source.indexOf('const StarPersonButton', start);
  const block = source.slice(start, end);
  assert.equal((block.match(/removeClippedSubviews={false}/g) || []).length, 1);
  assert.ok(block.includes('initialNumToRender={4}'));
  const batch = Number(block.match(/maxToRenderPerBatch=\{(\d+)\}/)?.[1]);
  assert.ok(batch >= 1 && batch <= 4);
});


test('home vertical list keeps nested poster rails attached while scrolling', () => {
  const start = source.indexOf('const HomeScreen = memo(function HomeScreen');
  const end = source.indexOf('type CategoryCardConfig', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(block.includes('removeClippedSubviews={false}'));
  assert.ok(block.includes('initialNumToRender={4}'));
  const batch = Number(block.match(/maxToRenderPerBatch=\{(\d+)\}/)?.[1]);
  const window = Number(block.match(/windowSize=\{(\d+)\}/)?.[1]);
  assert.ok(batch >= 1 && batch <= 3);
  assert.ok(window >= 3 && window <= 6);
  assert.equal(block.match(/Image\.prefetch\(/g)?.length, 1);
  assert.match(block, /\]\.slice\(0, 6\);\s*if \(urls\.length\) void Image\.prefetch\(urls\)/);
});
