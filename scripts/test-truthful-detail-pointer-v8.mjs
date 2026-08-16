import fs from 'node:fs/promises';

const service = await fs.readFile('src/contentService.ts', 'utf8');
const start = service.indexOf('const resolveStableDetailPath = async');
const end = service.indexOf('export async function loadCatalogItemDetail', start);
if (start < 0 || end < 0) throw new Error('Stable detail resolver not found.');
const block = service.slice(start, end);

const required = [
  'const boundedStablePointerPath = async (list: string[], timeoutMs: number)',
  'const rawPointerPath = await boundedStablePointerPath(rawCandidates, 1800);',
  'const currentPath = rawPointerPath || await boundedStablePointerPath(mirrorCandidates, 1800);',
];
for (const marker of required) {
  if (!block.includes(marker)) throw new Error(`Missing v8 marker: ${marker}`);
}
if (block.includes('const mirrorPromise = firstValidStableDetailPath(mirrorCandidates, summary);')) {
  throw new Error('Old Raw/CDN stable-pointer race is still active.');
}
if (block.includes('setTimeout(() => resolve(null), 450)')) {
  throw new Error('Old 450ms Raw head-start is still active.');
}

console.log(JSON.stringify({
  detailPointerSourceOfTruth: 'github-raw-first',
  rawPointerBudgetMs: 1800,
  cdnOnlyAfterRawUnavailable: true,
  staleCdnCanBeatHealthyRaw: false,
}, null, 2));
