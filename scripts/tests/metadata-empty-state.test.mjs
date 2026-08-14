import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('placeholder and blank overviews get an honest visible fallback', () => {
  assert.ok(source.includes('const isMissingCatalogOverview'));
  assert.ok(source.includes('const catalogOverviewFor'));
  assert.ok(source.includes('خلاصهٔ معتبر این عنوان هنوز در منابع موجود ثبت نشده است'));
  assert.ok(source.includes('{catalogOverviewFor(item)}'));
  assert.ok(!source.includes('style={styles.detailOverview}>{item.overview}</Text>'));
});

test('people section never disappears just because metadata is unavailable', () => {
  const start = source.indexOf('function PeopleSection');
  const end = source.indexOf('const HorizontalCatalog', start);
  const block = source.slice(start, end);
  assert.ok(!block.includes('if (!people.length) return null'));
  assert.ok(block.includes('if (!people.length) {'));
  assert.ok(block.includes('اطلاعات معتبر عوامل و بازیگران این عنوان هنوز در منابع موجود پیدا نشده است'));
  assert.ok(block.includes('styles.peopleEmptyState'));
});

test('real cast rail keeps the verified right-edge start behavior', () => {
  const start = source.indexOf('function PeopleSection');
  const end = source.indexOf('const HorizontalCatalog', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('data={[...people].reverse()}'));
  assert.ok(block.includes('peopleRailRef.current?.scrollToEnd({ animated: false })'));
});

test('empty state does not invent cast names or plot text', () => {
  const start = source.indexOf('function PeopleSection');
  const end = source.indexOf('const HorizontalCatalog', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('این بخش خودکار به‌روزرسانی می‌شود'));
  assert.ok(!block.includes('نامشخص'));
});
