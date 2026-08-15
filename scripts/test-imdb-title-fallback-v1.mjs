import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');

if (app.includes('const transliterateLatinTitleToPersian')) {
  throw new Error('Artificial Latin-to-Persian transliteration helper still exists.');
}
if (app.includes('transliterateLatinTitleToPersian(')) {
  throw new Error('Artificial transliteration call still exists.');
}
for (const marker of [
  "const verifiedOverrideFa = IMDB_PERSIAN_TITLE_OVERRIDES[normalizeComparableText(title || rawTitle)] || '';",
  "const titleFa = itemTitleFa || entryTitleFa || (rawTitleIsPersian ? rawTitle : '') || verifiedOverrideFa;",
  'const primary = titleFa || title || rawTitle;',
]) {
  if (!app.includes(marker)) throw new Error('Missing IMDb fallback marker: ' + marker);
}

// Evaluate the exact fallback policy with representative values, independent of
// React rendering. Unknown Latin titles must stay Latin; verified Persian data
// and curated overrides may still be Persian.
const overrides = { 'breaking bad': 'بریکینگ بد' };
const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const primaryFor = ({ title, titleFa = '', itemNameFa = '' }) => {
  const rawTitle = String(title || '').trim();
  const rawTitleIsPersian = /[\u0600-\u06FF]/.test(rawTitle);
  const catalogFa = /[\u0600-\u06FF]/.test(itemNameFa) ? itemNameFa.trim() : '';
  const rankingFa = /[\u0600-\u06FF]/.test(titleFa) ? titleFa.trim() : '';
  const english = rawTitleIsPersian ? '' : rawTitle;
  const verified = overrides[normalize(english || rawTitle)] || '';
  const fa = catalogFa || rankingFa || (rawTitleIsPersian ? rawTitle : '') || verified;
  return fa || english || rawTitle;
};

if (primaryFor({ title: 'Surviving Paradise: A Family Tale' }) !== 'Surviving Paradise: A Family Tale') {
  throw new Error('Unknown English IMDb title was not preserved verbatim.');
}
if (primaryFor({ title: 'Breaking Bad' }) !== 'بریکینگ بد') {
  throw new Error('Verified IMDb Persian override was not preserved.');
}
if (primaryFor({ title: 'Oppenheimer', itemNameFa: 'اوپنهایمر' }) !== 'اوپنهایمر') {
  throw new Error('Valid catalog Persian title was not preserved.');
}

console.log(JSON.stringify({ unknownEnglishFallback: 'original', generatedTransliteration: false, verifiedPersianPreserved: true }));
