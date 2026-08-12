import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const write = (path, value) => fs.writeFile(path, value, 'utf8');

function replaceBetween(text, start, end, replacement, label) {
  const a = text.indexOf(start);
  if (a < 0) throw new Error(`Missing start marker: ${label}`);
  const b = text.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`Missing end marker: ${label}`);
  return text.slice(0, a) + replacement + text.slice(b);
}

function mustReplace(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Missing patch target: ${label}`);
  return text.replace(before, after);
}

let source = await read('App.tsx');

source = replaceBetween(
  source,
  'const reconcileUperaMediaFiles = (files: DownloadFile[]): DownloadFile[] => {',
  '\nconst filesWithSectionLanguage = (sections: DownloadSection[]) =>',
  `const reconcileUperaMediaFiles = (files: DownloadFile[]): DownloadFile[] => {
  const prepared = files.map((file) => ({ ...file }));

  // A single media URL cannot truthfully be both the dubbed and subtitled
  // edition in this player: selecting either button would play the same stream.
  // Treat such stale catalog conflicts as ambiguous and remove them from the
  // language chooser; a neutral item.streamUrl fallback can still play media.
  const languagesByUrl = new Map<string, Set<MediaLanguage>>();
  for (const file of prepared) {
    if (!file.url || (file.language !== 'dubbed' && file.language !== 'subtitled')) continue;
    const key = String(file.url).trim();
    if (!key) continue;
    const languages = languagesByUrl.get(key) || new Set<MediaLanguage>();
    languages.add(file.language);
    languagesByUrl.set(key, languages);
  }
  const conflictedUrls = new Set(
    [...languagesByUrl.entries()]
      .filter(([, languages]) => languages.has('dubbed') && languages.has('subtitled'))
      .map(([url]) => url),
  );
  const safe = conflictedUrls.size
    ? prepared.filter((file) => !conflictedUrls.has(String(file.url || '').trim()))
    : prepared;

  const explicit = new Set<MediaLanguage>(
    safe
      .map((file) => file.language)
      .filter((language): language is MediaLanguage => language === 'dubbed' || language === 'subtitled'),
  );
  const hasUnknown = safe.some((file) => !file.language);
  if (!hasUnknown) return safe;

  if (explicit.size > 0) {
    // Never manufacture the missing language. An unlabeled Upera row is not
    // proof of a dubbed/subtitled counterpart, so only positively identified
    // rows participate in the language-labelled playback/download UI.
    return safe.filter((file) => file.language === 'dubbed' || file.language === 'subtitled');
  }

  // With no language evidence at all, keep the media available under a neutral
  // «پخش آنلاین / لینک‌های دریافت» label instead of guessing.
  return safe;
};
`,
  'strict Upera media reconciliation',
);

source = mustReplace(
  source,
  `    const languages = itemLanguages(item);
    const language = languages.length === 1 ? languages[0] : undefined;
    return [{
      ...(language ? { language } : {}),
      label: language ? languageTitle(language) : 'پخش آنلاین',
      sources: [source],
      defaultSource: source,
    }];`,
  `    return [{
      label: 'پخش آنلاین',
      sources: [source],
      defaultSource: source,
    }];`,
  'neutral unverified stream fallback',
);

if (source.includes("const counterpart: MediaLanguage = known === 'dubbed' ? 'subtitled' : 'dubbed';")) {
  throw new Error('Legacy counter-language fabrication still exists in App.tsx');
}
if (!source.includes('const conflictedUrls = new Set(')) {
  throw new Error('Same-URL cross-language protection was not installed');
}
if (!source.includes('if (explicit.size > 0)')) {
  throw new Error('Ambiguous unlabeled media is not being excluded from language variants');
}
if (!source.includes("label: 'پخش آنلاین',\n      sources: [source]")) {
  throw new Error('Unverified stream fallback is not neutral');
}

await write('App.tsx', source);

const pkg = JSON.parse(await read('package.json'));
pkg.version = '0.14.1';
await write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const app = JSON.parse(await read('app.json'));
app.expo.version = '0.14.1';
app.expo.android.versionCode = Math.max(20, Number(app.expo.android.versionCode || 0) + 1);
await write('app.json', `${JSON.stringify(app, null, 2)}\n`);

const lock = JSON.parse(await read('package-lock.json'));
lock.version = '0.14.1';
if (lock.packages?.['']) lock.packages[''].version = '0.14.1';
await write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

const verify = `import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('App.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

assert.ok(!source.includes("const counterpart: MediaLanguage = known === 'dubbed' ? 'subtitled' : 'dubbed';"), 'The app must never invent the opposite media language.');
assert.ok(source.includes('const conflictedUrls = new Set('), 'Same URL cannot be exposed as both dubbed and subtitled.');
assert.ok(source.includes('if (explicit.size > 0)'), 'Unknown media must stay out of language-labelled choices when real language evidence exists.');
assert.ok(source.includes("label: 'پخش آنلاین',\\n      sources: [source]"), 'A stream with no file-level language evidence must use a neutral playback label.');
assert.ok(source.includes("title: 'لینک‌های دریافت'"), 'Unknown downloads must remain neutral.');
assert.ok(!source.includes('نسخه اصلی'), 'The mobile UI must not expose a fabricated original-version bucket.');
assert.equal(pkg.version, '0.14.1');
assert.equal(app.expo.version, '0.14.1');
assert.ok(Number(app.expo.android.versionCode) >= 20);

console.log('Playback language truth invariants verified.');
`;
await write('scripts/verify-playback-language-truth-hotfix.mjs', verify);

console.log('Applied playback-language truth hotfix and bumped Android to v0.14.1.');
