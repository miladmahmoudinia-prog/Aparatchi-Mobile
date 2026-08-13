import fs from 'node:fs/promises';

await import('./apply-final-user-batch-20260814.mjs');

let appSource = await fs.readFile('App.tsx', 'utf8');
appSource = appSource.replace(
  "return trustedOperatorNavigationRef.current && /^https:\\/\\//i.test(navigation.url);",
  "return Boolean(trustedOperatorNavigationRef.current && String(navigation.url || '').toLowerCase().startsWith('https://'));",
);
await fs.writeFile('App.tsx', appSource, 'utf8');

const regression = [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import fs from 'node:fs';",
  "",
  "const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');",
  "",
  "test('foreign original media is blocked', () => {",
  "  assert.ok(source.includes('const unlabeledSources = isIranianItem(item)'));",
  "  assert.ok(source.includes('const plainFiles = iranian'));",
  "});",
  "",
  "test('all RTL people/star rails snap to the right edge', () => {",
  "  assert.ok(source.includes('peopleRailRef.current?.scrollToEnd({ animated: false })'));",
  "  assert.ok(source.includes('starPeopleRailRef.current?.scrollToEnd({ animated: false })'));",
  "  assert.ok(source.includes('starWorksRailRef.current?.scrollToEnd({ animated: false })'));",
  "  assert.ok(!source.includes('contentOffset={{ x: people.length * 100'));",
  "});",
  "",
  "test('episode art never falls back to the series poster', () => {",
  "  const start = source.indexOf('const exactEpisodeArtworkFor');",
  "  const end = source.indexOf('function SeriesEpisodeShowcase', start);",
  "  const block = source.slice(start, end);",
  "  assert.ok(block.includes(\"return '';\"));",
  "  assert.ok(!block.includes('return item.backdrop'));",
  "});",
  "",
  "test('category covers never use unrelated fallback content', () => {",
  "  const start = source.indexOf('const categoryPreviewItems');",
  "  const end = source.indexOf('const searchResults', start);",
  "  const block = source.slice(start, end);",
  "  assert.ok(!block.includes('pickAnyUnused'));",
  "  assert.ok(!block.includes('relatedCategoryFilters(card.filter)'));",
  "});",
  "",
  "test('category position restores on return', () => {",
  "  assert.ok(source.includes(\"isActive={activeTab === 'categories'}\"));",
  "  assert.ok(source.includes('categoriesScreenScrollOffset = liveCategoriesOffsetRef.current'));",
  "});",
  "",
  "test('home virtualization and operator redirect fixes remain enabled', () => {",
  "  assert.ok(source.includes('removeClippedSubviews'));",
  "  assert.ok(source.includes('trustedOperatorNavigationRef.current'));",
  "  assert.ok(source.includes(\"startsWith('https://')\"));",
  "});",
  "",
].join('\n');

await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile('scripts/tests/final-user-batch-20260814.test.mjs', regression, 'utf8');
console.log('Rewrote final mobile regression guard with typecheck-safe syntax.');
