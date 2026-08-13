import fs from 'node:fs/promises';

const path = 'src/contentService.ts';
let source = await fs.readFile(path, 'utf8');

const oldTimeout = '    const timeout = setTimeout(() => controller.abort(), 12_000);';
const newTimeout = `    // The catalog is large enough that a valid refresh can exceed 12 seconds on mobile networks.\n    // Startup already paints bundled/cache content first, so let the background refresh finish.\n    const timeout = setTimeout(() => controller.abort(), 45_000);`;

const matches = source.split(oldTimeout).length - 1;
if (matches === 1) {
  source = source.replace(oldTimeout, newTimeout);
} else if (source.includes('controller.abort(), 45_000')) {
  console.log('Catalog refresh timeout already fixed.');
} else {
  throw new Error(`Expected one 12-second catalog timeout, found ${matches}.`);
}

await fs.writeFile(path, source, 'utf8');
console.log('Catalog refresh timeout fixed.');
