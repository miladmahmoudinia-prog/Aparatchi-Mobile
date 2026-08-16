import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const app = await fs.readFile(new URL('../App.tsx', import.meta.url), 'utf8');

assert.match(app, /item\.availableLanguages\?\.includes\(language\) \|\|\s*\(item\.downloads \|\| \[\]\)/, 'availableLanguages remains authoritative after detail hydration');
assert.doesNotMatch(app, /item\.detailLoaded !== true && item\.availableLanguages/, 'badge truth must not disappear after detailLoaded');
assert.match(app, /const episodeShowcaseLabel = \(_item: CatalogItem, group: DownloadSection, quran: boolean\)[\s\S]*return `\$\{noun\} \$\{toPersianDigits\(Number\(group\.episodeNumber \|\| 0\)\)\}`;/, 'episode showcase is number-only');
assert.doesNotMatch(app, /cleanMediaLabel\(group\.subtitle\) \|\|\s*`\$\{toPersianDigits\(languageGroups/, 'episode accordion must not show source subtitle/code');
assert.doesNotMatch(app, /در حال آماده‌کردن پخش و قسمت‌ها/, 'detail hydration should be silent instead of blocking-looking loader');
assert.ok(
  app.includes('const exactEpisodeArtworkFor =') && app.includes('assets\\/media\\/episodes\\/'),
  'episode cards only accept exact generated episode frames',
);

console.log(JSON.stringify({
  dubbedOnlyBadgeSurvivesDetail: true,
  episodeLabelsNumberOnly: true,
  silentDetailHydration: true,
  exactEpisodeArtworkOnly: true,
}, null, 2));
