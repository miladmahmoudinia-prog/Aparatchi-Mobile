import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('catalog artwork keeps a stable image instance across fallback urls', () => {
  const start = source.indexOf('const CatalogArtwork');
  const end = source.indexOf('const localArtworkForItem', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('cachePolicy="memory-disk"'));
  assert.ok(block.includes('transition={transition}'));
  assert.ok(block.includes('recyclingKey={String(primary || fallback || remoteUrl)}'));
  assert.ok(!block.includes('key={remoteUrl}'));
});

test('main horizontal catalog keeps Android edge posters mounted without duplicate props', () => {
  const start = source.indexOf('const HorizontalCatalog');
  const end = source.indexOf('const StarPersonButton', start);
  const block = source.slice(start, end);
  assert.equal((block.match(/removeClippedSubviews={false}/g) || []).length, 1);
  assert.ok(block.includes('initialNumToRender={4}'));
  assert.ok(block.includes('maxToRenderPerBatch={4}'));
});
