import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function buildDetailPreviews(payload, targetRoot = root) {
  const buckets = Array.from({length: 64}, () => ({}));
  let count = 0;
  for (const item of payload.items || []) {
    if (!item.detailPath || (!item.overview && !item.people?.length)) continue;
    const key = `${item.type}:${item.id}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    buckets[hash % 64][key] = {detailPath:item.detailPath, overview:item.overview || '', people:item.people || []};
    count++;
  }
  const dir = path.join(targetRoot, 'src/detail-previews');
  await fs.mkdir(dir, {recursive:true});
  await Promise.all(buckets.map((bucket, i) => fs.writeFile(path.join(dir, `${i}.json`), JSON.stringify(bucket))));
  // Static literal requires let Metro bundle all chunks without evaluating
  // any chunk until the user opens a title belonging to it.
  const source = `const buckets = [\n${buckets.map((_,i) => `  () => require('./detail-previews/${i}.json'),`).join('\n')}\n];\nexport function readDetailPreview(key: string): any {\n  let hash = 0;\n  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;\n  return buckets[hash % 64]()[key] || null;\n}\n`;
  await fs.writeFile(path.join(targetRoot, 'src/detailPreviews.generated.ts'), source);
  return count;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const payload = JSON.parse(await fs.readFile(path.join(root, 'src/catalogBootstrap.json'), 'utf8'));
  console.log(`Prepared lazy detail previews for ${await buildDetailPreviews(payload)} titles`);
}
