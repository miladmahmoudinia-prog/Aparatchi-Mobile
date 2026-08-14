import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

// Keep the already-approved projectionist artwork; this script also owns its
// startup timing so future reruns cannot restore the old sub-second splash.
if (!source.includes('startupProjectionistScene')) {
  throw new Error('Projectionist startup scene is missing; refusing to replace the approved artwork.');
}

source = source.replace('const minimumVisibleMs = 850;', 'const minimumVisibleMs = 10000;');
source = source.replace('startupFallbackTimer = setTimeout(dismissStartup, 1200);', 'startupFallbackTimer = setTimeout(dismissStartup, 15000);');

if (!source.includes('const minimumVisibleMs = 10000;')) {
  throw new Error('Could not enforce 10-second startup minimum.');
}
if (!source.includes('startupFallbackTimer = setTimeout(dismissStartup, 15000);')) {
  throw new Error('Could not move emergency startup fallback after the ready window.');
}

await fs.writeFile(path, source, 'utf8');
console.log('Projectionist startup preserved with a 10-second minimum and 15-second emergency fallback.');
