import fs from 'node:fs/promises';

const file = 'scripts/apply-first-install-freshness-v33.mjs';
let source = await fs.readFile(file, 'utf8');
const before = source;
source = source.replace(
  /^    const requestUrl = .*_aparatchi_manifest=.*;$/m,
  "    const requestUrl = candidate + separator + '_aparatchi_manifest=' + Date.now();",
);
if (source === before) throw new Error('v33 requestUrl syntax marker not found');
await fs.writeFile(file, source, 'utf8');
console.log('Normalized v33 nested requestUrl syntax.');
