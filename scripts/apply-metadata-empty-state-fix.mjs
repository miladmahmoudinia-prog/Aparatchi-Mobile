import fs from 'node:fs/promises';

const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing patch target: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
`const friendlyNetworkError = (value?: string) => {\n  const text = String(value || '').trim();\n  if (!text) return '';\n  if (isNetworkFailure(text)) {\n    return 'اینترنت قطع است؛ اینترنت را روشن کنید و برای ادامه دوباره بزنید.';\n  }\n  return text;\n};`,
`const friendlyNetworkError = (value?: string) => {\n  const text = String(value || '').trim();\n  if (!text) return '';\n  if (isNetworkFailure(text)) {\n    return 'اینترنت قطع است؛ اینترنت را روشن کنید و برای ادامه دوباره بزنید.';\n  }\n  return text;\n};\n\nconst isMissingCatalogOverview = (value?: string | null) => {\n  const text = String(value || '').replace(/\\s+/g, ' ').trim();\n  if (!text) return true;\n  return /توضیحی\\s*ثبت\\s*نشده|توضیحات?\\s*ثبت\\s*نشده|خلاصه(?:\\s*داستان)?\\s*ثبت\\s*نشده|اطلاعاتی\\s*ثبت\\s*نشده|بدون\\s*توضیح|no\\s+(?:description|overview)|description\\s+not\\s+available/i.test(text);\n};\n\nconst catalogOverviewFor = (item: CatalogItem) => {\n  const overview = String(item.overview || '').replace(/\\s+/g, ' ').trim();\n  if (!isMissingCatalogOverview(overview)) return overview;\n  return 'خلاصهٔ معتبر این عنوان هنوز در منابع موجود ثبت نشده است. با تکمیل اطلاعات کاتالوگ، این بخش به‌صورت خودکار به‌روزرسانی می‌شود.';\n};`,
  'honest overview fallback helper',
);

replaceOnce(
`  const peopleRailRef = useRef<FlatList<CatalogPerson>>(null);\n  if (!people.length) return null;`,
`  const peopleRailRef = useRef<FlatList<CatalogPerson>>(null);\n  if (!people.length) {\n    return (\n      <View style={styles.peopleSection}>\n        <View style={styles.peopleSectionHeader}>\n          <View style={styles.peopleSectionIcon}>\n            <Ionicons name="people-outline" color={COLORS.gold} size={19} />\n          </View>\n          <View style={styles.peopleSectionHeaderText}>\n            <Text style={styles.peopleSectionTitle}>عوامل و بازیگران</Text>\n            <Text style={styles.peopleSectionSubtitle}>این بخش با اطلاعات معتبر کاتالوگ تکمیل می‌شود.</Text>\n          </View>\n        </View>\n        <View style={styles.peopleEmptyState}>\n          <Ionicons name="information-circle-outline" color={COLORS.gold} size={20} />\n          <Text style={styles.peopleEmptyText}>\n            اطلاعات معتبر عوامل و بازیگران این عنوان هنوز در منابع موجود پیدا نشده است؛ بعد از تکمیل منبع، این بخش خودکار به‌روزرسانی می‌شود.\n          </Text>\n        </View>\n      </View>\n    );\n  }`,
  'people section empty state instead of disappearing',
);

replaceOnce(
`<Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : \`داستان \${item.nameFa}\`}</Text><Text style={styles.detailOverview}>{item.overview}</Text>`,
`<Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : \`داستان \${item.nameFa}\`}</Text><Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>`,
  'detail overview fallback rendering',
);

replaceOnce(
`  peopleSectionSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8.5, marginTop: 4 },`,
`  peopleSectionSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8.5, marginTop: 4 },\n  peopleEmptyState: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(216,180,90,0.22)', backgroundColor: 'rgba(216,180,90,0.055)' },\n  peopleEmptyText: { ...rtlText, flex: 1, color: COLORS.muted, fontSize: 10, lineHeight: 20, textAlign: 'right' },`,
  'people empty state styles',
);

await fs.writeFile(appPath, source, 'utf8');

const testPath = 'scripts/tests/metadata-empty-state.test.mjs';
const testSource = `import test from 'node:test';
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
`;
await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile(testPath, testSource, 'utf8');

const appJsonPath = 'app.json';
const appJson = JSON.parse(await fs.readFile(appJsonPath, 'utf8'));
if (appJson?.expo?.version === '0.15.8') appJson.expo.version = '0.15.9';
if (Number(appJson?.expo?.android?.versionCode || 0) < 29) appJson.expo.android.versionCode = 29;
await fs.writeFile(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');

const packagePath = 'package.json';
const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
if (pkg.version === '0.15.8') pkg.version = '0.15.9';
await fs.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log('Applied honest metadata empty-state fix.');
