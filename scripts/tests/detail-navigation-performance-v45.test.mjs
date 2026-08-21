import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const [app, service, bootstrap] = await Promise.all([
  fs.readFile('App.tsx', 'utf8'),
  fs.readFile('src/contentService.ts', 'utf8'),
  fs.readFile('src/catalogBootstrap.json', 'utf8').then(JSON.parse),
]);

test('a reopened Detail always starts at the top', () => {
  assert.ok(!app.includes('detailScrollOffsets'));
  assert.ok(!app.includes('detailScrollRef.current?.scrollTo'));
  assert.ok(app.includes('key={`detail-scroll:${item.type}:${item.id}`}'));
  assert.ok(app.includes('}, [item?.id, visible]);'));
});

test('Detail uses provider insets on its first native Modal frame', () => {
  const detailStart = app.indexOf('function DetailModal({');
  const detailEnd = app.indexOf('function PersonProfileModal({', detailStart);
  const detail = app.slice(detailStart, detailEnd);
  assert.ok(detail.includes('const detailInsets = useSafeAreaInsets();'));
  assert.ok(detail.includes('paddingTop: detailInsets.top'));
  assert.ok(!detail.includes('<SafeAreaView style={styles.detailScreen}'));
});

test('poster navigation commits before catalog-wide secondary sections', () => {
  const detailStart = app.indexOf('function DetailModal({');
  const detailEnd = app.indexOf('function PersonProfileModal({', detailStart);
  const detail = app.slice(detailStart, detailEnd);
  assert.ok(detail.includes('InteractionManager.runAfterInteractions(() => setSecondaryDetailReady(true))'));
  assert.ok(detail.includes('{secondaryDetailReady ? ('));
  assert.ok(detail.indexOf('<PeopleSection item={item}') < detail.indexOf('{secondaryDetailReady ? ('), 'cast preview must not wait for secondary work');
  assert.ok(app.includes('onPressIn={() => warmDetailArtwork(item)}'));
});

test('detail loader tries the exact content-addressed shard before stable recovery', () => {
  const start = service.indexOf('export async function loadCatalogItemDetail');
  const loader = service.slice(start);
  const exact = loader.indexOf('const detailPath = summaryDetailPath;');
  const network = loader.indexOf('const firstValid = await new Promise');
  const recovery = loader.indexOf('await resolveStableDetailPath(summary, detailPath)');
  assert.ok(exact >= 0 && network > exact && recovery > network);
});

test('bundled startup catalog has uncapped first-paint detail previews', () => {
  const items = bootstrap.items || [];
  assert.ok(items.length >= 4000);
  assert.ok(items.filter((item) => item.people?.length).length > 3500);
  assert.ok(items.every((item) => !item.people || item.people.length <= 4));
  assert.ok(items.filter((item) => item.type === 'movie' && (item.downloads?.length || item.streamUrl)).length > 4000);
  assert.ok(items.filter((item) => item.type === 'series').every((item) => !item.downloads || item.downloads.length <= 1));
});
