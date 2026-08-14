import fs from 'node:fs/promises';

const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');

const emptyBlock = `  const peopleRailRef = useRef<FlatList<CatalogPerson>>(null);\n  if (!people.length) {\n    return (\n      <View style={styles.peopleSection}>\n        <View style={styles.peopleSectionHeader}>\n          <View style={styles.peopleSectionIcon}>\n            <Ionicons name="people-outline" color={COLORS.gold} size={19} />\n          </View>\n          <View style={styles.peopleSectionHeaderText}>\n            <Text style={styles.peopleSectionTitle}>عوامل و بازیگران</Text>\n            <Text style={styles.peopleSectionSubtitle}>این بخش با اطلاعات معتبر کاتالوگ تکمیل می‌شود.</Text>\n          </View>\n        </View>\n        <View style={styles.peopleEmptyState}>\n          <Ionicons name="information-circle-outline" color={COLORS.gold} size={20} />\n          <Text style={styles.peopleEmptyText}>\n            اطلاعات معتبر عوامل و بازیگران این عنوان هنوز در منابع موجود پیدا نشده است؛ بعد از تکمیل منبع، این بخش خودکار به‌روزرسانی می‌شود.\n          </Text>\n        </View>\n      </View>\n    );\n  }`;

const compactBlock = `  const peopleRailRef = useRef<FlatList<CatalogPerson>>(null);\n  if (!people.length) return null;`;

if (source.includes(emptyBlock)) {
  source = source.replace(emptyBlock, compactBlock);
} else if (!source.includes(compactBlock)) {
  throw new Error('PeopleSection empty-state target not found.');
}

source = source.replace(
  `\n  peopleEmptyState: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(216,180,90,0.22)', backgroundColor: 'rgba(216,180,90,0.055)' },\n  peopleEmptyText: { ...rtlText, flex: 1, color: COLORS.muted, fontSize: 10, lineHeight: 20, textAlign: 'right' },`,
  '',
);

await fs.writeFile(appPath, source, 'utf8');

const testPath = 'scripts/tests/metadata-empty-state.test.mjs';
const testSource = `import test from 'node:test';
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

test('real cast rail remains available and starts from the right edge', () => {
  const start = source.indexOf('function PeopleSection');
  const end = source.indexOf('const HorizontalCatalog', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('data={[...people].reverse()}'));
  assert.ok(block.includes('peopleRailRef.current?.scrollToEnd({ animated: false })'));
});

test('people list is built only from real actor/director catalog records', () => {
  const start = source.indexOf('function PeopleSection');
  const end = source.indexOf('const HorizontalCatalog', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('item.people || []'));
  assert.ok(block.includes("person.role !== 'director' && person.role !== 'actor'"));
  assert.ok(block.includes('optimizedImageUrl(person.image'));
});
`;
await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile(testPath, testSource, 'utf8');

console.log('Empty cast/crew placeholders removed; PeopleSection now renders only real metadata.');
