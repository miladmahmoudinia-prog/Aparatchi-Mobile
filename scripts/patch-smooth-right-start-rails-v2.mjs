import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// v1 contains the complete source transformation. Its generated TSX key must
// remain literal `${selected.id}` text; otherwise the patcher's own template
// literal tries to evaluate `selected` while the patch script is running.
const v1Path = 'scripts/patch-smooth-right-start-rails-v1.mjs';
const raw = await fs.readFile(v1Path, 'utf8');
const fixed = raw.replace('${selected.id}', '\\${selected.id}');
if (fixed === raw) throw new Error('Expected star-works interpolation target was not found in v1 patcher.');

const tempPath = path.resolve('.github', '.tmp-smooth-right-start-rails-v2.mjs');
await fs.writeFile(tempPath, fixed, 'utf8');
try {
  await import(`${pathToFileURL(tempPath).href}?run=${Date.now()}`);
} finally {
  await fs.rm(tempPath, { force: true });
}
