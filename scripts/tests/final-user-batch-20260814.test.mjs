import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('foreign unlabelled media stays available through neutral UI without a fake language edition', () => {
  assert.ok(source.includes('const unlabeledSources = playbackSourcesForFiles(files.filter((file) => !file.language));'));
  assert.ok(source.includes('const plainFiles = sortedDownloadFiles(reconciled.filter((file) => !file.language));'));
});

test('all RTL people/star rails start from the right edge deterministically', () => {
  const peopleRightEdgeStarts = source.match(/initialScrollIndex=\{displayedPeople\.length - 1\}/g) || [];
  assert.ok(peopleRightEdgeStarts.length >= 2);
  assert.ok(source.includes('initialScrollIndex={displayedWorks.length - 1}'));
  assert.ok(!source.includes('contentOffset={{ x: people.length * 100'));
});

test('episode art never falls back to the series poster', () => {
  const start = source.indexOf('const exactEpisodeArtworkFor');
  const end = source.indexOf('function SeriesEpisodeShowcase', start);
  const block = source.slice(start, end);
  assert.ok(block.includes("return '';"));
  assert.ok(!block.includes('return item.backdrop'));
});

test('category covers never use unrelated fallback content', () => {
  const start = source.indexOf('const categoryPreviewItems');
  const end = source.indexOf('const searchResults', start);
  const block = source.slice(start, end);
  assert.ok(!block.includes('pickAnyUnused'));
  assert.ok(!block.includes('relatedCategoryFilters(card.filter)'));
});

test('category position restores on return', () => {
  assert.ok(source.includes("isActive={activeTab === 'categories'}"));
  assert.ok(source.includes('categoriesScreenScrollOffset = liveCategoriesOffsetRef.current'));
});

test('home virtualization and trusted operator URL guards remain enabled', () => {
  assert.ok(source.includes('removeClippedSubviews'));
  assert.ok(source.includes('const isTrustedOperatorHostUrl = (url?: string) => {'));
  assert.ok(source.includes("parsed.protocol === 'https:'"));
  assert.ok(source.includes('const isOperatorPortalUrl = (url?: string) => {'));
});
