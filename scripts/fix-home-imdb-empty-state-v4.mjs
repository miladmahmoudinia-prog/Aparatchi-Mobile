import fs from 'node:fs/promises';

const path = 'App.tsx';
let app = await fs.readFile(path, 'utf8');
const before = `  const rankingReady = Boolean(ranking?.movies?.length || ranking?.series?.length);\n\n  const topThree = entries.slice(0, 3);\n  const previewRows = entries.slice(3, 5);\n\n  return (`;
const after = `  const rankingReady = Boolean(ranking?.movies?.length || ranking?.series?.length);\n\n  // The emergency bundled catalog has no IMDb payload. Do not show a large\n  // indefinite loader while the real bootstrap/full index is resolving; mount\n  // the section atomically as soon as truthful ranking data exists.\n  if (!rankingReady || entries.length === 0) return null;\n\n  const topThree = entries.slice(0, 3);\n  const previewRows = entries.slice(3, 5);\n\n  return (`;
const count = app.split(before).length - 1;
if (count !== 1) throw new Error(`IMDb empty-state marker expected once, found ${count}`);
app = app.replace(before, after);
await fs.writeFile(path, app, 'utf8');
console.log('IMDb section now mounts only when ranking data is ready.');
