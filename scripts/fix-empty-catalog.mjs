import fs from 'node:fs/promises';

const replaceExactlyOnce = async (path, oldText, newText, alreadyText) => {
  let source = await fs.readFile(path, 'utf8');
  if (alreadyText && source.includes(alreadyText)) {
    console.log(`${path}: already fixed`);
    return false;
  }
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
  await fs.writeFile(path, source, 'utf8');
  console.log(`${path}: fixed`);
  return true;
};

await replaceExactlyOnce(
  'App.tsx',
  `  items: (loaded.items || []).filter(\n    loaded.source === 'remote' || loaded.source === 'cache'\n      ? isSeriesPublished\n      : itemHasUsableContent,\n  ),`,
  `  items: (loaded.items || []).filter(\n    loaded.source === 'remote' || loaded.source === 'cache'\n      ? isSeriesPublished\n      : () => true,\n  ),`,
  `      : () => true,\n  ),`,
);

await replaceExactlyOnce(
  'src/contentService.ts',
  '    const timeout = setTimeout(() => controller.abort(), 45_000);',
  `    // Home is already rendered from bundled/cache data, so a slow catalog refresh must not\n    // be killed while the full public index is still downloading on a mobile connection.\n    const timeout = setTimeout(() => controller.abort(), 120_000);`,
  'controller.abort(), 120_000',
);

for (const path of ['package.json', 'app.json']) {
  let source = await fs.readFile(path, 'utf8');
  source = source.replace(/"version": "0\.15\.2"/, '"version": "0.15.3"');
  if (path === 'app.json') source = source.replace(/"versionCode": 22/, '"versionCode": 23');
  await fs.writeFile(path, source, 'utf8');
}

console.log('Empty-catalog recovery patch applied.');
