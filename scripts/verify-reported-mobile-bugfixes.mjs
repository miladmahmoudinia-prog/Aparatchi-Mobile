import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('App.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

assert.ok(!source.includes('نسخه اصلی'), 'The mobile UI must never fabricate a نسخه اصلی bucket.');
assert.ok(!source.includes('routeTransitionOpacity'), 'The black route-transition overlay must be removed.');
assert.ok(!source.includes('routeTransitionTimerRef'), 'The delayed route transition timer must be removed.');
assert.ok(source.includes('reconcileUperaMediaFiles'), 'Playback/download language reconciliation must be centralized.');
assert.ok(source.includes("title: 'لینک‌های دریافت'"), 'Unclassified downloads must have a neutral label.');
assert.ok(source.includes("label: 'پخش آنلاین'"), 'Unclassified playback must have a neutral label.');
assert.ok(source.includes("titleText.includes('the westies')"), 'The Westies must have a mobile foreign-identity safeguard.');
assert.ok(source.includes("'از بی', 'از به', 'az be'"), 'Az Be documentary safeguard must exist.');
assert.ok(source.includes('contentOffset={{ x: displayedPeople.length * 66, y: 0 }}'), 'Stars rail must start at the physical end without a delayed jump.');
assert.ok(source.includes('contentOffset={{ x: displayedWorks.length * 113, y: 0 }}'), 'Star works rail must start at the physical end without a delayed jump.');
assert.ok(!source.includes('peopleRailRef.current?.scrollToEnd'), 'Stars rail must not use delayed scrollToEnd.');
assert.ok(!source.includes('worksRailRef.current?.scrollToEnd'), 'Works rail must not use delayed scrollToEnd.');
assert.ok(source.includes("sortForCatalogFilter(usableCatalog.slice(0, 900), 'latest')"), 'Category preview must not sort the full catalog before navigation.');
assert.equal(pkg.version, '0.14.0');
assert.equal(app.expo.version, '0.14.0');
assert.equal(app.expo.android.versionCode, 19);

console.log('Reported mobile bugfix invariants verified.');
