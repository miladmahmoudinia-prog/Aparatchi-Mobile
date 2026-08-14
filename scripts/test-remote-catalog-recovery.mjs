import fs from 'node:fs/promises';

const config = await fs.readFile('src/config.ts', 'utf8');
const service = await fs.readFile('src/contentService.ts', 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(config.includes('cdn.jsdelivr.net/gh/miladmahmoudinia-prog/Aparatchi-Content@main/'), 'primary CDN mirror missing');
assert(config.includes('raw.githubusercontent.com/miladmahmoudinia-prog/Aparatchi-Content/main/'), 'GitHub Raw fallback missing');
assert(service.includes('remoteRepositoryUrlCandidates'), 'mirror candidate helper missing');
assert(service.includes("version: 'bootstrap-unavailable'"), 'honest empty bootstrap missing');
assert(service.includes('Catalog is unavailable from all mirrors'), 'catalog mirror loop missing');
assert(service.includes('Try the next public mirror before giving up on this title.'), 'detail mirror loop missing');

const base = 'https://cdn.jsdelivr.net/gh/miladmahmoudinia-prog/Aparatchi-Content@main/';
const manifestResponse = await fetch(`${base}catalog-manifest.json?health=${Date.now()}`, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(15000),
});
assert(manifestResponse.ok, `CDN manifest unavailable: HTTP ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
assert(Number(manifest.clientSizeBytes || 0) > 1_000_000, 'manifest reports an unexpectedly tiny client catalog');

const indexResponse = await fetch(`${base}catalog-index.json?health=${Date.now()}`, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(60000),
});
assert(indexResponse.ok, `CDN catalog unavailable: HTTP ${indexResponse.status}`);
const index = await indexResponse.json();
assert(Array.isArray(index.items), 'catalog index has no items array');
assert(index.items.length > 100, `catalog index unexpectedly contains only ${index.items.length} items`);

const detailItem = index.items.find((item) => item && typeof item.detailPath === 'string' && item.detailPath);
assert(detailItem, 'catalog index has no detailPath');
const detailResponse = await fetch(`${base}${detailItem.detailPath}?health=${Date.now()}`, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(15000),
});
assert(detailResponse.ok, `CDN detail unavailable: HTTP ${detailResponse.status}`);
const detail = await detailResponse.json();
assert(String(detail.id) === String(detailItem.id), 'detail id does not match summary id');

console.log(JSON.stringify({
  manifestClientSizeBytes: manifest.clientSizeBytes,
  catalogItems: index.items.length,
  detailSample: detailItem.nameFa || detailItem.name || detailItem.id,
  detailHasDownloads: Array.isArray(detail.downloads) && detail.downloads.length > 0,
}, null, 2));
