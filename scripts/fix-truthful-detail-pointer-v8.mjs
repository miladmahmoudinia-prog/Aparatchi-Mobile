import fs from 'node:fs/promises';

const file = 'src/contentService.ts';
let source = await fs.readFile(file, 'utf8');

const startMarker = `  // Start Raw and CDN pointer reads together. Give the source-of-truth Raw URL\n`;
const endMarker = `\n  if (currentPath) {\n    stableDetailPointerCache.set(identity, { path: currentPath, expiresAt: Date.now() + 5 * 60_000 });`;

if (!source.includes('const rawPointerPath = await boundedStablePointerPath(rawCandidates, 1800);')) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Expected old stable-detail pointer race was not found.');

  const replacement = `  // The stable pointer decides which immutable detail shard is truthful. A stale\n  // CDN pointer can legitimately reference an older shard that still exists, so\n  // "first valid wins" is not safe here. Prefer GitHub Raw source truth with a\n  // bounded wait, and consult mirrors only when Raw is unavailable.\n  const candidates = remoteRepositoryUrlCandidates(stableUrl);\n  const rawCandidates = candidates.filter((candidate) => /raw\\.githubusercontent\\.com/i.test(candidate));\n  const mirrorCandidates = candidates.filter((candidate) => !/raw\\.githubusercontent\\.com/i.test(candidate));\n  const boundedStablePointerPath = async (list: string[], timeoutMs: number) => {\n    if (!list.length) return null;\n    return await Promise.race([\n      firstValidStableDetailPath(list, summary),\n      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),\n    ]);\n  };\n\n  const rawPointerPath = await boundedStablePointerPath(rawCandidates, 1800);\n  const currentPath = rawPointerPath || await boundedStablePointerPath(mirrorCandidates, 1800);\n`;

  source = source.slice(0, start) + replacement + source.slice(end);
}

await fs.writeFile(file, source);
console.log('Applied truthful detail pointer v8 repair.');
