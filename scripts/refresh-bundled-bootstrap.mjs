import fs from 'node:fs/promises';

// Keep the code-split startup snapshot intentionally small. Importing the full
// 8–12 MB catalog makes Hermes parse thousands of objects before React can draw
// even the splash screen. The complete catalog is still fetched/cached after
// Home is interactive.
const outputPath = new URL('../src/catalogStartup.json', import.meta.url);
const MAX_ITEMS_PER_HOME_SHELF = 10;
const MAX_STARTUP_ITEMS = 240;
const MAX_STARTUP_BYTES = 900_000;
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

const startupSnapshot = (full) => {
  const selected = new Map();
  const add = (item) => {
    if (!item || selected.size >= MAX_STARTUP_ITEMS) return;
    const key = String(item.id || item.contentId || item.imdbId || '').trim();
    if (key && !selected.has(key)) selected.set(key, item);
  };

  // First titles are the server's newest-first feed. They guarantee an
  // immediately useful first screen even if old content lacks categoryKeys.
  full.items.slice(0, 36).forEach(add);

  const counts = new Map();
  for (const item of full.items) {
    for (const key of Array.isArray(item.categoryKeys) ? item.categoryKeys : []) {
      const count = counts.get(key) || 0;
      if (count >= MAX_ITEMS_PER_HOME_SHELF) continue;
      add(item);
      counts.set(key, count + 1);
    }
  }

  const referencedIds = new Set();
  for (const schedule of [full.iranianSchedule, full.weeklySchedule]) {
    for (const row of Array.isArray(schedule) ? schedule : []) {
      for (const value of [row.itemId, row.catalogItemId, row.id]) {
        if (value) referencedIds.add(String(value));
      }
    }
  }
  for (const entry of full.imdbTop100?.entries || []) {
    for (const value of [entry.itemId, entry.catalogItemId]) {
      if (value) referencedIds.add(String(value));
    }
  }
  for (const item of full.items) {
    if (referencedIds.has(String(item.id))) add(item);
  }

  const value = {
    ...full,
    items: [...selected.values()],
    featuredPeople: (full.featuredPeople || []).slice(0, 24),
    peopleWorks: {},
  };
  const raw = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(raw) > MAX_STARTUP_BYTES) {
    throw new Error(`Compact startup catalog is too large: ${Buffer.byteLength(raw)} bytes`);
  }
  return { value, raw };
};

const [manifestRaw, freshRaw] = await Promise.all([
  fetchCurrent('catalog-manifest.json'),
  fetchCurrent('catalog-bootstrap.json'),
]);

if (manifestRaw && freshRaw) {
  const manifest = parseManifest(manifestRaw);
  const full = validate(freshRaw, manifest);
  const startup = startupSnapshot(full);
  await fs.writeFile(outputPath, startup.raw, 'utf8');
  console.log(JSON.stringify({
    bundledItems: startup.value.items.length,
    fullItems: full.items.length,
    bundledBytes: Buffer.byteLength(startup.raw),
    clientRevision: startup.value.clientRevision,
  }));
} else {
  const current = await fs.readFile(outputPath, 'utf8');
  const value = validate(current, null);
  if (process.env.CI === 'true' || process.env.CI === '1') {
    throw new Error(`Refusing to package stale startup catalog ${value.clientRevision}: fresh Content artifacts were unavailable`);
  }
  console.warn(JSON.stringify({ bundledFallbackItems: value.items.length, clientRevision: value.clientRevision }));
}
