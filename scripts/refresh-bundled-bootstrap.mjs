import fs from 'node:fs/promises';

const outputPath = new URL('../src/catalogBootstrap.json', import.meta.url);
const repositoryBases = [
  'https://raw.githubusercontent.com/miladmahmoudinia-prog/Aparatchi-Content/main/',
  'https://cdn.jsdelivr.net/gh/miladmahmoudinia-prog/Aparatchi-Content@main/',
];

const fetchCurrent = async (fileName) => {
  for (const base of repositoryBases) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${base}${fileName}?build=${Date.now()}`, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      console.warn(`Startup catalog source failed: ${base}${fileName}`, error?.message || error);
    } finally {
      clearTimeout(timeout);
    }
  }
  return '';
};

const parseManifest = (raw) => {
  const value = JSON.parse(raw);
  const clientItemCount = Number(value?.clientItemCount || 0);
  const bootstrapItemCount = Number(value?.bootstrapItemCount || 0);
  if (!(clientItemCount > 0) || bootstrapItemCount !== clientItemCount) {
    throw new Error('Content manifest does not declare one complete startup row per client title');
  }
  return value;
};

const validate = (raw, manifest) => {
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.items) || !value.items.length) {
    throw new Error('Bundled startup catalog is empty');
  }
  if (!String(value.clientRevision || '').trim()) {
    throw new Error('Bundled startup catalog has no client revision');
  }
  if (manifest) {
    if (value.clientRevision !== manifest.clientRevision) {
      throw new Error('Startup catalog and manifest revisions differ');
    }
    if (value.items.length !== Number(manifest.bootstrapItemCount)) {
      throw new Error(`Startup catalog is truncated: ${value.items.length}/${manifest.bootstrapItemCount}`);
    }
  }
  return value;
};

// Keep the APK's synchronous startup payload small enough for low-memory
// Android devices. Full episode lists remain in the remote detail shards and
// hydrate as soon as a series opens; the bundled snapshot only needs the newest
// playable episode so Home can mount without parsing thousands of media URLs.
const compactForApkStartup = (value) => ({
  ...value,
  items: value.items.map((item) => {
    // Story and cast belong to the detail shard, not the synchronous Home
    // payload. Removing them saves several megabytes and avoids the launch
    // freeze seen on older/low-memory Android phones.
    const { overview: _overview, people: _people, ...startupItem } = item || {};
    if (startupItem?.type !== 'series' || !Array.isArray(startupItem.downloads) || startupItem.downloads.length <= 1) return startupItem;
    const newestEpisode = [...startupItem.downloads]
      .filter((group) => Number(group?.episodeNumber || 0) > 0)
      .sort((a, b) =>
        Number(b?.seasonNumber || 0) - Number(a?.seasonNumber || 0) ||
        Number(b?.episodeNumber || 0) - Number(a?.episodeNumber || 0),
      )[0];
    return { ...startupItem, downloads: newestEpisode ? [newestEpisode] : [] };
  }),
});

const [manifestRaw, freshRaw] = await Promise.all([
  fetchCurrent('catalog-manifest.json'),
  fetchCurrent('catalog-bootstrap.json'),
]);

if (manifestRaw && freshRaw) {
  const manifest = parseManifest(manifestRaw);
  const value = validate(freshRaw, manifest);
  const compact = compactForApkStartup(value);
  const serialized = `${JSON.stringify(compact)}\n`;
  await fs.writeFile(outputPath, serialized, 'utf8');
  console.log(JSON.stringify({ bundledItems: compact.items.length, bundledBytes: Buffer.byteLength(serialized), clientRevision: compact.clientRevision }));
} else {
  const current = await fs.readFile(outputPath, 'utf8');
  const value = validate(current, null);
  if (process.env.CI === 'true' || process.env.CI === '1') {
    throw new Error(`Refusing to package stale startup catalog ${value.clientRevision}: fresh Content artifacts were unavailable`);
  }
  console.warn(JSON.stringify({ bundledFallbackItems: value.items.length, clientRevision: value.clientRevision }));
}
