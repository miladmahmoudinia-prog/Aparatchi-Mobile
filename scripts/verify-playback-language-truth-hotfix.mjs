import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('App.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

assert.ok(!source.includes("const counterpart: MediaLanguage = known === 'dubbed' ? 'subtitled' : 'dubbed';"), 'The app must never invent the opposite media language.');
assert.ok(source.includes('const conflictedUrls = new Set('), 'Same URL cannot be exposed as both dubbed and subtitled.');
assert.ok(source.includes('if (explicit.size > 0)'), 'Unknown media must stay out of language-labelled choices when real language evidence exists.');
assert.ok(source.includes("label: 'پخش آنلاین',\n      sources: [source]"), 'A stream with no file-level language evidence must use a neutral playback label.');
assert.ok(source.includes("title: 'لینک‌های دریافت'"), 'Unknown downloads must remain neutral.');
assert.ok(!source.includes('نسخه اصلی'), 'The mobile UI must not expose a fabricated original-version bucket.');
assert.equal(pkg.version, '0.14.1');
assert.equal(app.expo.version, '0.14.1');
assert.ok(Number(app.expo.android.versionCode) >= 20);

console.log('Playback language truth invariants verified.');
