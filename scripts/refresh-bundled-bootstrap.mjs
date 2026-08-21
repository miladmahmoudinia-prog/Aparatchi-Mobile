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

const [manifestRaw, freshRaw] = await Promise.all([
  fetchCurrent('catalog-manifest.json'),
  fetchCurrent('catalog-bootstrap.json'),
]);

if (manifestRaw && freshRaw) {
  const manifest = parseManifest(manifestRaw);
  const value = validate(freshRaw, manifest);
  await fs.writeFile(outputPath, `${freshRaw.trim()}\n`, 'utf8');
  console.log(JSON.stringify({ bundledItems: value.items.length, clientRevision: value.clientRevision }));
} else {
  const current = await fs.readFile(outputPath, 'utf8');
  const value = validate(current, null);
  if (process.env.CI === 'true' || process.env.CI === '1') {
    throw new Error(`Refusing to package stale startup catalog ${value.clientRevision}: fresh Content artifacts were unavailable`);
  }
  console.warn(JSON.stringify({ bundledFallbackItems: value.items.length, clientRevision: value.clientRevision }));
}
