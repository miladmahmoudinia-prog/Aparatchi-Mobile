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
`        <Image\n          source={{ uri: remoteUrl }}\n          style={StyleSheet.absoluteFill}\n          contentFit={contentFit}\n          cachePolicy="memory-disk"\n          transition={transition}\n          recyclingKey={\`${imageKind}:\${String(primary || fallback || remoteUrl)}\`}\n          onError={handleRemoteError}\n        />`,
  'stable CatalogArtwork image instance',
);

const horizontalAnchor = `      horizontal\n      data={items}`;
if (source.includes(horizontalAnchor) && !source.includes(`      horizontal\n      removeClippedSubviews={false}\n      data={items}`)) {
  source = source.replace(horizontalAnchor, `      horizontal\n      removeClippedSubviews={false}\n      data={items}`);
}

const relatedAnchor = `        horizontal\n        data={[...related].reverse()}`;
if (source.includes(relatedAnchor) && !source.includes(`        horizontal\n        removeClippedSubviews={false}\n        data={[...related].reverse()}`)) {
  source = source.replace(relatedAnchor, `        horizontal\n        removeClippedSubviews={false}\n        data={[...related].reverse()}`);
}

const peopleAnchor = `      horizontal\n      data={[...people].reverse()}`;
if (source.includes(peopleAnchor) && !source.includes(`      horizontal\n      removeClippedSubviews={false}\n      data={[...people].reverse()}`)) {
  source = source.replace(peopleAnchor, `      horizontal\n      removeClippedSubviews={false}\n      data={[...people].reverse()}`);
}

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
  assert.ok(block.includes('recyclingKey={'));
  assert.ok(block.includes('String(primary || fallback || remoteUrl)'));
  assert.ok(!block.includes('key={remoteUrl}'));
});

test('main horizontal catalog does not clip edge posters on Android', () => {
  const start = source.indexOf('const HorizontalCatalog');
  const end = source.indexOf('const StarPersonButton', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('removeClippedSubviews={false}'));
  assert.ok(block.includes('initialNumToRender={4}'));
  assert.ok(block.includes('maxToRenderPerBatch={4}'));
});

test('related and people rails keep edge cards mounted', () => {
  const relatedStart = source.indexOf('function RelatedTitlesSection');
  const relatedEnd = source.indexOf('function DetailModal', relatedStart);
  assert.ok(source.slice(relatedStart, relatedEnd).includes('removeClippedSubviews={false}'));
  const peopleStart = source.indexOf('function PeopleSection');
  const peopleEnd = source.indexOf('const HorizontalCatalog', peopleStart);
  assert.ok(source.slice(peopleStart, peopleEnd).includes('removeClippedSubviews={false}'));
});
`;
await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile(testPath, testSource, 'utf8');

console.log('Poster remount/clipping jitter repair applied.');
