import fs from 'node:fs/promises';

const appPath = 'App.tsx';
const testPath = 'scripts/tests/smooth-poster-loading.test.mjs';

let source = await fs.readFile(appPath, 'utf8');
const homeStart = source.indexOf('const HomeScreen = memo(function HomeScreen');
const homeEnd = source.indexOf('type CategoryCardConfig', homeStart);
if (homeStart < 0 || homeEnd < 0) throw new Error('HomeScreen block not found');

const homeBefore = source.slice(homeStart, homeEnd);
if (!homeBefore.includes('removeClippedSubviews={false}')) {
  const target = '        windowSize={5}\n        removeClippedSubviews\n        keyboardShouldPersistTaps="always"';
  const replacement = '        windowSize={5}\n        removeClippedSubviews={false}\n        keyboardShouldPersistTaps="always"';
  if (!homeBefore.includes(target)) {
    throw new Error('Home FlatList clipping target not found');
  }
  const patchedHome = homeBefore.replace(target, replacement);
  source = `${source.slice(0, homeStart)}${patchedHome}${source.slice(homeEnd)}`;
  await fs.writeFile(appPath, source, 'utf8');
}

let testSource = await fs.readFile(testPath, 'utf8');
const regressionName = 'home vertical list keeps nested poster rails attached while scrolling';
if (!testSource.includes(regressionName)) {
  testSource += `\n\ntest('${regressionName}', () => {\n  const start = source.indexOf('const HomeScreen = memo(function HomeScreen');\n  const end = source.indexOf('type CategoryCardConfig', start);\n  const block = source.slice(start, end);\n  assert.ok(start >= 0 && end > start);\n  assert.ok(block.includes('removeClippedSubviews={false}'));\n  assert.ok(block.includes('initialNumToRender={4}'));\n  assert.ok(block.includes('maxToRenderPerBatch={3}'));\n  assert.ok(block.includes('windowSize={5}'));\n  assert.ok(!block.includes('Image.prefetch('));\n});\n`;
  await fs.writeFile(testPath, testSource, 'utf8');
}

console.log('Home poster lifecycle repair applied without changing Home virtualization window/batching.');
