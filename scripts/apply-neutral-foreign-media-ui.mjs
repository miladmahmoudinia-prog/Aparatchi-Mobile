import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing neutral-media UI target: ${label}`);
  source = source.replace(before, after);
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

// Avoid a misleading red language badge inside a neutral download group.
replaceOnce(
`      badge: 'دریافت',\n      files: plainFiles,`,
`      files: plainFiles,`,
  'neutral download group badge',
);

await fs.writeFile(path, source, 'utf8');
console.log('Foreign unlabelled media is now visible through neutral play/download UI without language badges.');
