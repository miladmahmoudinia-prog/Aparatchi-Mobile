import fs from 'node:fs/promises';

const outputPath = new URL('../src/catalogBootstrap.json', import.meta.url);
const sources = [
  'https://raw.githubusercontent.com/miladmahmoudinia-prog/Aparatchi-Content/main/catalog-bootstrap.json',
  'https://cdn.jsdelivr.net/gh/miladmahmoudinia-prog/Aparatchi-Content@main/catalog-bootstrap.json',
];

const validate = (raw) => {
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.items) || value.items.length < 100) {
    throw new Error('Bundled bootstrap is missing the practical Home catalog');
  }
  if (!String(value.clientRevision || '').trim()) {
    throw new Error('Bundled bootstrap has no client revision');
  }
  return value;
};

let freshRaw = '';
for (const source of sources) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${source}?build=${Date.now()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const candidate = await response.text();
    validate(candidate);
    freshRaw = candidate;
    break;
  } catch (error) {
    console.warn(`Startup bootstrap source failed: ${source}`, error?.message || error);
  } finally {
    clearTimeout(timeout);
  }
}

if (freshRaw) {
  await fs.writeFile(outputPath, `${freshRaw.trim()}\n`, 'utf8');
  const value = validate(freshRaw);
  console.log(JSON.stringify({ bundledItems: value.items.length, clientRevision: value.clientRevision }));
} else {
  const current = await fs.readFile(outputPath, 'utf8');
  const value = validate(current);
  console.warn(JSON.stringify({ bundledFallbackItems: value.items.length, clientRevision: value.clientRevision }));
}
