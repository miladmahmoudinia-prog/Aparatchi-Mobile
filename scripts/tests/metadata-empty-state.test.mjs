import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('people section is hidden when no real cast or crew exists', () => {
  const start = source.indexOf('function PeopleSection');
  const end = source.indexOf('const HorizontalCatalog', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('if (!people.length) return null'));
  assert.ok(!block.includes('اطلاعات معتبر عوامل و بازیگران'));
  assert.ok(!block.includes('این بخش با اطلاعات معتبر کاتالوگ تکمیل می‌شود'));
  assert.ok(!block.includes('styles.peopleEmptyState'));
});

test('real cast rail remains available and starts from the right edge with deterministic RTL', () => {
  const start = source.indexOf('function PeopleSection');
  const end = source.indexOf('const HorizontalCatalog', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('const displayedPeople = useMemo(() => [...people].reverse(), [people]);'));
  assert.ok(block.includes('data={displayedPeople}'));
  assert.ok(block.includes('initialScrollIndex={displayedPeople.length - 1}'));
  assert.ok(block.includes('getItemLayout='));
  assert.ok(block.includes('removeClippedSubviews={false}'));
  assert.ok(!block.includes('scrollToEnd'));
});

test('people list is built only from real actor/director catalog records', () => {
  const start = source.indexOf('function PeopleSection');
  const end = source.indexOf('const HorizontalCatalog', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('item.people || []'));
  assert.ok(block.includes("person.role !== 'director' && person.role !== 'actor'"));
  assert.ok(block.includes('optimizedImageUrl(person.image'));
});
