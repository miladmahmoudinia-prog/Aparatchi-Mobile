import fs from 'node:fs/promises';

const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');

const helperStart = source.indexOf('const transliterateLatinTitleToPersian = (value: string) => {');
const nextAnchor = source.indexOf('\nconst findImdbTopItem = (', helperStart);
if (helperStart >= 0 && nextAnchor > helperStart) {
  source = source.slice(0, helperStart) + source.slice(nextAnchor + 1);
}

const oldLine = `  const titleFa = itemTitleFa || entryTitleFa || (rawTitleIsPersian ? rawTitle : '') || transliterateLatinTitleToPersian(title || rawTitle);`;
const newLines = `  const verifiedOverrideFa = IMDB_PERSIAN_TITLE_OVERRIDES[normalizeComparableText(title || rawTitle)] || '';\n  // Never invent a Persian-looking label from Latin text. Prefer a real Persian\n  // title from the catalog/ranking or a manually verified override; otherwise\n  // display the original English title unchanged.\n  const titleFa = itemTitleFa || entryTitleFa || (rawTitleIsPersian ? rawTitle : '') || verifiedOverrideFa;`;
if (source.includes(oldLine)) {
  source = source.replace(oldLine, newLines);
} else if (!source.includes('const verifiedOverrideFa = IMDB_PERSIAN_TITLE_OVERRIDES')) {
  throw new Error('IMDb title fallback target not found.');
}

await fs.writeFile(appPath, source, 'utf8');

const testPath = 'scripts/test-imdb-title-fallback-v1.mjs';
await fs.writeFile(testPath, `import fs from 'node:fs/promises';\n\nconst app = await fs.readFile('App.tsx', 'utf8');\n\nif (app.includes('const transliterateLatinTitleToPersian')) {\n  throw new Error('Artificial Latin-to-Persian transliteration helper still exists.');\n}\nif (app.includes('transliterateLatinTitleToPersian(')) {\n  throw new Error('Artificial transliteration call still exists.');\n}\nfor (const marker of [\n  "const verifiedOverrideFa = IMDB_PERSIAN_TITLE_OVERRIDES[normalizeComparableText(title || rawTitle)] || '';",\n  "const titleFa = itemTitleFa || entryTitleFa || (rawTitleIsPersian ? rawTitle : '') || verifiedOverrideFa;",\n  'const primary = titleFa || title || rawTitle;',\n]) {\n  if (!app.includes(marker)) throw new Error('Missing IMDb fallback marker: ' + marker);\n}\n\n// Evaluate the exact fallback policy with representative values, independent of\n// React rendering. Unknown Latin titles must stay Latin; verified Persian data\n// and curated overrides may still be Persian.\nconst overrides = { 'breaking bad': 'بریکینگ بد' };\nconst normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();\nconst primaryFor = ({ title, titleFa = '', itemNameFa = '' }) => {\n  const rawTitle = String(title || '').trim();\n  const rawTitleIsPersian = /[\\u0600-\\u06FF]/.test(rawTitle);\n  const catalogFa = /[\\u0600-\\u06FF]/.test(itemNameFa) ? itemNameFa.trim() : '';\n  const rankingFa = /[\\u0600-\\u06FF]/.test(titleFa) ? titleFa.trim() : '';\n  const english = rawTitleIsPersian ? '' : rawTitle;\n  const verified = overrides[normalize(english || rawTitle)] || '';\n  const fa = catalogFa || rankingFa || (rawTitleIsPersian ? rawTitle : '') || verified;\n  return fa || english || rawTitle;\n};\n\nif (primaryFor({ title: 'Surviving Paradise: A Family Tale' }) !== 'Surviving Paradise: A Family Tale') {\n  throw new Error('Unknown English IMDb title was not preserved verbatim.');\n}\nif (primaryFor({ title: 'Breaking Bad' }) !== 'بریکینگ بد') {\n  throw new Error('Verified IMDb Persian override was not preserved.');\n}\nif (primaryFor({ title: 'Oppenheimer', itemNameFa: 'اوپنهایمر' }) !== 'اوپنهایمر') {\n  throw new Error('Valid catalog Persian title was not preserved.');\n}\n\nconsole.log(JSON.stringify({ unknownEnglishFallback: 'original', generatedTransliteration: false, verifiedPersianPreserved: true }));\n`, 'utf8');

console.log('IMDb title fallback patched: no generated Persian transliteration remains.');
