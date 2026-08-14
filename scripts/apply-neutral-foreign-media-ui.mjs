import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (source.includes(before)) {
    source = source.replace(before, after);
    return;
  }
  if (!source.includes(after)) throw new Error(`Missing neutral-media UI target: ${label}`);
};

replaceOnce(
`  const unlabeledSources = isIranianItem(item)\n    ? playbackSourcesForFiles(files.filter((file) => !file.language))\n    : [];`,
`  // Unlabelled source media remains playable for every country. The lack of a\n  // language marker is deliberately neutral and must never create a fake\n  // dubbed/subtitled option.\n  const unlabeledSources = playbackSourcesForFiles(files.filter((file) => !file.language));`,
  'neutral playback sources for foreign titles',
);

replaceOnce(
`  const plainFiles = iranian\n    ? sortedDownloadFiles(reconciled.filter((file) => !file.language))\n    : [];`,
`  // Preserve real downloads whose source did not identify an audio/subtitle\n  // edition. They are shown under a neutral heading instead of being hidden.\n  const plainFiles = sortedDownloadFiles(reconciled.filter((file) => !file.language));`,
  'neutral download files for foreign titles',
);

// Avoid a misleading badge inside a neutral download group. This replacement
// is scoped by the exact two-line block so another files: plainFiles occurrence
// cannot make the patch think it was already applied.
const neutralBadge = `      badge: 'دریافت',\n      files: plainFiles,`;
if (source.includes(neutralBadge)) source = source.replace(neutralBadge, `      files: plainFiles,`);
if (source.includes(neutralBadge)) throw new Error('Neutral download badge remains after patch.');

await fs.writeFile(path, source, 'utf8');
console.log('Foreign unlabelled media is now visible through neutral play/download UI without language badges.');
