import fs from 'node:fs/promises';

const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing patch target: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "  transition = 0,\n  imageKind = 'poster',",
  "  transition = 160,\n  imageKind = 'poster',",
  'CatalogArtwork soft default transition',
);

replaceOnce(
`          style={styles.posterImage}\n          contentFit="cover"\n          transition={0}\n        />`,
`          style={styles.posterImage}\n          contentFit="cover"\n          transition={160}\n        />`,
  'poster cards fade in',
);

replaceOnce(
`        style={styles.starWorkPoster}\n        imageKind="poster"\n        transition={0}\n      />`,
`        style={styles.starWorkPoster}\n        imageKind="poster"\n        transition={160}\n      />`,
  'star works fade in',
);

replaceOnce(
`      initialNumToRender={6}\n      maxToRenderPerBatch={6}\n      updateCellsBatchingPeriod={35}\n      windowSize={5}`,
`      initialNumToRender={4}\n      maxToRenderPerBatch={4}\n      updateCellsBatchingPeriod={50}\n      windowSize={4}`,
  'progressive horizontal poster batching',
);

replaceOnce(
`                  style={styles.collectionPoster}\n                  contentFit="cover"\n                  transition={180}\n                />`,
`                  style={styles.collectionPoster}\n                  contentFit="cover"\n                  cachePolicy="memory-disk"\n                  recyclingKey={\`collection:\${member.id}:\${member.poster}\`}\n                  transition={180}\n                />`,
  'collection poster cache',
);

await fs.writeFile(appPath, source, 'utf8');

const testPath = 'scripts/tests/smooth-poster-loading.test.mjs';
const testSource = `import test from 'node:test';
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
`;
await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile(testPath, testSource, 'utf8');

const appJsonPath = 'app.json';
const appJson = JSON.parse(await fs.readFile(appJsonPath, 'utf8'));
if (appJson?.expo?.version === '0.15.6') appJson.expo.version = '0.15.7';
if (Number(appJson?.expo?.android?.versionCode || 0) < 27) appJson.expo.android.versionCode = 27;
await fs.writeFile(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');

const packagePath = 'package.json';
const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
if (pkg.version === '0.15.6') pkg.version = '0.15.7';
await fs.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log('Applied smooth progressive poster loading fix.');
