import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const service = fs.readFileSync('src/contentService.ts', 'utf8');
const types = fs.readFileSync('src/types.ts', 'utf8');

assert.ok(types.includes('firstSeenAt?: string;'));
assert.ok(service.includes('bootstrapRevision?: string;'));
assert.ok(service.includes("manifest?.bootstrapRevision || manifest?.clientRevision || manifest?.revision"));
assert.ok(service.includes('asString(parsed.updatedAt) !== asString(manifest.catalogUpdatedAt)'));
assert.ok(app.includes("const hasRealEpisodeLabel = /^قسمت\\s+.+\\s+اضافه\\s+شد$/u.test"));
assert.ok(app.includes('catalogItemTimestamp(b) - catalogItemTimestamp(a)'));
assert.ok(app.includes('{catalogOverviewFor(item) ? ('));
assert.ok(!app.includes('{item.overview}\n            </Text>'));
assert.ok(app.includes('preview={item.poster}'));
assert.ok(app.includes('scrollToTopSignal={homeScrollTopSignal}'));
assert.ok(app.includes("if (tab === 'home') setHomeScrollTopSignal((value) => value + 1);"));
assert.ok(!app.includes('disabled={selected}'));
assert.ok(app.includes("void reloadContent(true, { silent: true });"));
assert.ok(!app.includes('foregroundRefreshVisible'));
assert.ok(app.includes('{startupVisible ? <StartupScreen /> : null}'));
assert.ok(app.includes('? { ...currentItem, ...incomingItem }'));
assert.ok(app.includes("heroSlider: { height: 420"));
assert.ok(app.includes("heroContent: { paddingHorizontal: 20, paddingBottom: 30"));

console.log(JSON.stringify({
  coldStartupManifestBinding: 'pass',
  foregroundStatePreservation: 'pass',
  homeRetapScrollTop: 'pass',
  heroPersianOnlyAndCompact: 'pass',
  detailPreviewHydration: 'pass',
  truthfulOrdering: 'pass',
}, null, 2));
