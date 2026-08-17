import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');

assert.ok(app.includes("if (!isMissingCatalogOverview(overview) && hasPersianScript(overview)) return overview;"));
assert.ok(app.includes("return '';\n};\n\nconst scheduleTimeValue"));
assert.ok(!app.includes('خلاصهٔ معتبر این عنوان هنوز در منابع موجود ثبت نشده است.'));
assert.ok(!service.includes("overview: asString(item.overview, 'توضیحی ثبت نشده است.'),"));
assert.ok(app.includes('foregroundBootstrapUsed = true'));
assert.ok(app.includes('const freshContent = await freshContentPromise;'));
assert.ok(app.includes('setForegroundRefreshVisible(true)'));
assert.ok(app.includes('startupVisible || foregroundRefreshVisible ? <StartupScreen /> : null'));
assert.ok(app.includes('categoriesMounted || activeTab === \'categories\''));
assert.ok(app.includes("Date.now() - backgroundedAt >= 2500"));
assert.ok(service.includes('if (languageCode && !codes.length) codes = [languageCode];'));

const freshnessBlock = app.match(/const catalogItemTimestamp = \(item: CatalogItem\) => \{([\s\S]*?)\n\};\n\nconst sortForCatalogFilter/);
assert.ok(freshnessBlock, 'catalogItemTimestamp block not found');
assert.ok(!freshnessBlock[1].includes('item.updatedAt'));
assert.ok(!freshnessBlock[1].includes('item.sourceUpdatedAt'));
assert.ok(freshnessBlock[1].includes('item.meaningfulUpdatedAt'));

const placeholderStoryCount = (app.match(/\{catalogOverviewFor\(item\) \? \(/g) || []).length;
assert.equal(placeholderStoryCount, 2, 'both detail story blocks must be conditional');

console.log(JSON.stringify({
  startupFreshnessRegression: 'pass',
  synopsisVisibilityRegression: 'pass',
  categoryWarmMountRegression: 'pass',
  orderingRegression: 'pass',
  countryNormalizationRegression: 'pass',
}, null, 2));
