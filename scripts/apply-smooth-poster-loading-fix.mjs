import fs from 'node:fs/promises';

const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing patch target: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
`        <Image\n          key={remoteUrl}\n          source={{ uri: remoteUrl }}\n          style={StyleSheet.absoluteFill}\n          contentFit={contentFit}\n          cachePolicy="memory-disk"\n          transition={transition}\n          recyclingKey={remoteUrl}\n          onError={handleRemoteError}\n        />`,
`        <Image\n          source={{ uri: remoteUrl }}\n          style={StyleSheet.absoluteFill}\n          contentFit={contentFit}\n          cachePolicy="memory-disk"\n          transition={transition}\n          recyclingKey={String(primary || fallback || remoteUrl)}\n          onError={handleRemoteError}\n        />`,
  'stable CatalogArtwork image instance',
);

// The main shelves already opt out of Android clipping. Do not inject a second
// prop; only verify that the guard remains present after the image fix.
await fs.writeFile(appPath, source, 'utf8');

const testPath = 'scripts/tests/smooth-poster-loading.test.mjs';
const testSource = `import test from 'node:test';
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
  assert.equal((block.match(/removeClippedSubviews=\{false\}/g) || []).length, 1);
  assert.ok(block.includes('initialNumToRender={4}'));
  assert.ok(block.includes('maxToRenderPerBatch={4}'));
});
`;
await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile(testPath, testSource, 'utf8');

console.log('Poster remount jitter repair applied without changing the established shelf layout.');
