import fs from 'node:fs/promises';

const path = 'src/contentService.ts';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (oldText, newText, label) => {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
};

replaceOnce(
`import {\n  REMOTE_CONTENT_DETAIL_BASE_URL,\n  REMOTE_CONTENT_INDEX_URL,\n  REMOTE_CONTENT_MANIFEST_URL,\n  REMOTE_CONTENT_URL,\n} from './config';`,
`import {\n  CONTENT_REPOSITORY_BASES,\n  REMOTE_CONTENT_DETAIL_BASE_URL,\n  REMOTE_CONTENT_INDEX_URL,\n  REMOTE_CONTENT_MANIFEST_URL,\n  REMOTE_CONTENT_URL,\n} from './config';`,
'import mirror list',
);

const assetMarker = `const REMOTE_ASSET_BASE = (() => {\n  const remote = REMOTE_CONTENT_URL.trim();\n  if (!remote) return '';\n  try {\n    return new URL('.', remote).toString();\n  } catch {\n    return '';\n  }\n})();`;
const mirrorHelper = [
  assetMarker,
  '',
  'const remoteRepositoryUrlCandidates = (value: string) => {',
  '  const url = asString(value);',
  '  if (!url) return [] as string[];',
  '',
  "  let relative = '';",
  '  for (const base of CONTENT_REPOSITORY_BASES) {',
  '    if (url.startsWith(base)) {',
  '      relative = url.slice(base.length);',
  '      break;',
  '    }',
  '  }',
  '  if (!relative) return [url];',
  '',
  '  return [...new Set(CONTENT_REPOSITORY_BASES.map((base) => {',
  '    try {',
  '      return new URL(relative, base).toString();',
  '    } catch {',
  '      return `${base}${relative}`;',
  '    }',
  '  }))];',
  '};',
].join('\n');
replaceOnce(assetMarker, mirrorHelper, 'mirror helper');

const manifestStart = source.indexOf('const fetchRemoteManifest = async (): Promise<RemoteCatalogManifest | null> => {');
const manifestEnd = source.indexOf('\nconst manifestMatchesCachedContent = (', manifestStart);
if (manifestStart < 0 || manifestEnd < 0) throw new Error('manifest function markers not found');
const newManifest = [
  'const fetchRemoteManifest = async (): Promise<RemoteCatalogManifest | null> => {',
  '  const manifestUrl = REMOTE_CONTENT_MANIFEST_URL.trim();',
  '  if (!manifestUrl) return null;',
  '  let lastError: unknown = null;',
  '',
  '  for (const candidate of remoteRepositoryUrlCandidates(manifestUrl)) {',
  "    const separator = candidate.includes('?') ? '&' : '?';",
  '    const requestUrl = `${candidate}${separator}_aparatchi_manifest=${Math.floor(Date.now() / 300_000)}`;',
  '    const controller = new AbortController();',
  '    const timeout = setTimeout(() => controller.abort(), 8_000);',
  '    try {',
  '      const response = await fetch(requestUrl, {',
  "        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },",
  '        signal: controller.signal,',
  '      });',
  '      if (!response.ok) {',
  '        lastError = new Error(`Manifest HTTP ${response.status} from ${candidate}`);',
  '        continue;',
  '      }',
  '      const value = await response.json();',
  "      if (!value || typeof value !== 'object') {",
  '        lastError = new Error(`Invalid catalog manifest from ${candidate}`);',
  '        continue;',
  '      }',
  '      const record = value as Record<string, unknown>;',
  '      const revision = asString(record.revision);',
  '      if (!revision) {',
  '        lastError = new Error(`Catalog manifest has no revision from ${candidate}`);',
  '        continue;',
  '      }',
  '      return {',
  '        revision,',
  '        ...(asString(record.clientRevision ?? record.client_revision)',
  '          ? { clientRevision: asString(record.clientRevision ?? record.client_revision) }',
  '          : {}),',
  '        ...(asString(record.catalogVersion ?? record.version)',
  '          ? { catalogVersion: asString(record.catalogVersion ?? record.version) }',
  '          : {}),',
  '        ...(asString(record.catalogUpdatedAt ?? record.updatedAt)',
  '          ? { catalogUpdatedAt: asString(record.catalogUpdatedAt ?? record.updatedAt) }',
  '          : {}),',
  '        ...(asNumber(record.sizeBytes, 0) > 0 ? { sizeBytes: asNumber(record.sizeBytes, 0) } : {}),',
  '        ...(asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) > 0',
  '          ? { clientSizeBytes: asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) }',
  '          : {}),',
  '        ...(asString(record.clientIndex ?? record.client_index)',
  '          ? { clientIndex: asString(record.clientIndex ?? record.client_index) }',
  '          : {}),',
  '        ...(asString(record.detailBase ?? record.detail_base)',
  '          ? { detailBase: asString(record.detailBase ?? record.detail_base) }',
  '          : {}),',
  '      };',
  '    } catch (error) {',
  '      lastError = error;',
  '    } finally {',
  '      clearTimeout(timeout);',
  '    }',
  '  }',
  '',
  "  throw lastError instanceof Error ? lastError : new Error('Catalog manifest is unavailable from all mirrors');",
  '};',
].join('\n');
source = source.slice(0, manifestStart) + newManifest + source.slice(manifestEnd);

const bundledMarker = `export const getBundledContent = (): LoadedContent => ({\n  ...normalizedLocalPayload(),\n  source: 'local',\n});`;
const bundledReplacement = [
  'const unavailableLocalPayload = (): CatalogPayload => ({',
  "  version: 'bootstrap-unavailable',",
  "  updatedAt: '',",
  '  items: [],',
  '  iranianSchedule: [],',
  '  weeklySchedule: [],',
  '  featuredPeople: [],',
  '  imdbTop100: undefined,',
  '});',
  '',
  'export const getBundledContent = (): LoadedContent => ({',
  '  ...unavailableLocalPayload(),',
  "  source: 'local',",
  '});',
].join('\n');
replaceOnce(bundledMarker, bundledReplacement, 'honest bootstrap payload');

replaceOnce(
`  if (preferCache) {\n    await readCacheMetadata();\n    const cached = await readCachedContent();\n    if (cached) return { ...cached, source: 'cache' };\n    return {\n      ...normalizedLocalPayload(),\n      source: 'local',\n    };\n  }`,
`  if (preferCache) {\n    await readCacheMetadata();\n    const cached = await readCachedContent();\n    if (cached) return { ...cached, source: 'cache' };\n    return {\n      ...unavailableLocalPayload(),\n      source: 'local',\n    };\n  }`,
  'cache miss bootstrap',
);

const loadStart = source.indexOf('export async function loadContent(preferCache = false): Promise<LoadedContent> {');
const requestStart = source.indexOf('    const controller = new AbortController();', loadStart);
const requestEnd = source.indexOf('    // Keep the original response text for the on-device cache.', requestStart);
if (loadStart < 0 || requestStart < 0 || requestEnd < 0) throw new Error('catalog request block markers not found');
const requestBlock = [
  '    const requestHeaders: Record<string, string> = {',
  "      Accept: 'application/json',",
  "      'Cache-Control': 'no-cache',",
  '    };',
  "    if (cacheMetadata.etag) requestHeaders['If-None-Match'] = cacheMetadata.etag;",
  "    if (cacheMetadata.lastModified) requestHeaders['If-Modified-Since'] = cacheMetadata.lastModified;",
  '',
  "    const catalogRevision = manifest?.clientRevision || manifest?.revision || '';",
  '    let response: Awaited<ReturnType<typeof fetch>> | null = null;',
  '    let lastCatalogError: unknown = null;',
  '',
  '    for (const candidate of remoteRepositoryUrlCandidates(remoteUrl)) {',
  '      const controller = new AbortController();',
  '      const timeout = setTimeout(() => controller.abort(), 60_000);',
  '      const catalogRequestUrl = catalogRevision',
  "        ? `${candidate}${candidate.includes('?') ? '&' : '?'}revision=${encodeURIComponent(catalogRevision.slice(0, 24))}`",
  '        : candidate;',
  '      try {',
  '        const nextResponse = await fetch(catalogRequestUrl, {',
  '          headers: requestHeaders,',
  '          signal: controller.signal,',
  '        });',
  '        if (nextResponse.status === 304 && cached) {',
  '          response = nextResponse;',
  '          break;',
  '        }',
  '        if (!nextResponse.ok) {',
  '          lastCatalogError = new Error(`Catalog HTTP ${nextResponse.status} from ${candidate}`);',
  '          continue;',
  '        }',
  '        response = nextResponse;',
  '        break;',
  '      } catch (error) {',
  '        lastCatalogError = error;',
  '      } finally {',
  '        clearTimeout(timeout);',
  '      }',
  '    }',
  '',
  '    if (!response) {',
  '      throw lastCatalogError instanceof Error',
  '        ? lastCatalogError',
  "        : new Error('Catalog is unavailable from all mirrors');",
  '    }',
  '    if (response.status === 304) {',
  '      const cached = await readCachedContent();',
  "      if (cached) return { ...cached, source: 'remote' };",
  '      cacheMetadata = {};',
  '      if (REMOTE_CACHE_META_URI) {',
  "        void FileSystem.writeAsStringAsync(REMOTE_CACHE_META_URI, '{}').catch(() => undefined);",
  '      }',
  "      throw new Error('Remote catalog returned 304 without a local cache');",
  '    }',
].join('\n') + '\n';
source = source.slice(0, requestStart) + requestBlock + source.slice(requestEnd);

const finalFallback = `  } catch {\n    if (cached) return { ...cached, source: 'cache' };\n    return {\n      ...normalizedLocalPayload(),\n      source: 'local',\n    };\n  }\n}`;
const finalFallbackPos = source.indexOf(finalFallback, loadStart);
if (finalFallbackPos < 0) throw new Error('final fallback block not found');
const finalReplacement = `  } catch {\n    if (cached) return { ...cached, source: 'cache' };\n    return {\n      ...unavailableLocalPayload(),\n      source: 'local',\n    };\n  }\n}`;
source = source.slice(0, finalFallbackPos) + finalReplacement + source.slice(finalFallbackPos + finalFallback.length);

const detailStart = source.indexOf('export async function loadCatalogItemDetail(summary: CatalogItem): Promise<CatalogItem | null> {');
const detailRequestStart = source.indexOf('    const url = detailUrlFor(detailPath);', detailStart);
const detailRequestEnd = source.indexOf('  })().finally(() => detailRequestCache.delete(memoryKey));', detailRequestStart);
if (detailStart < 0 || detailRequestStart < 0 || detailRequestEnd < 0) throw new Error('detail request markers not found');
const detailBlock = [
  '    const url = detailUrlFor(detailPath);',
  '    if (!url) return null;',
  '',
  '    for (const candidate of remoteRepositoryUrlCandidates(url)) {',
  '      try {',
  '        const controller = new AbortController();',
  '        const timeout = setTimeout(() => controller.abort(), 10_000);',
  "        const response = await fetch(`${candidate}${candidate.includes('?') ? '&' : '?'}v=${encodeURIComponent(detailPath)}`, {",
  "          headers: { Accept: 'application/json', 'Cache-Control': 'public, max-age=31536000, immutable' },",
  '          signal: controller.signal,',
  '        }).finally(() => clearTimeout(timeout));',
  '        if (!response.ok) continue;',
  '        const raw = await response.text();',
  '        const parsed = parseDetail(JSON.parse(raw));',
  '        if (!parsed) continue;',
  '        detailMemoryCache.set(memoryKey, parsed);',
  '        if (cacheUri) void FileSystem.writeAsStringAsync(cacheUri, raw).catch(() => undefined);',
  '        return parsed;',
  '      } catch {',
  '        // Try the next public mirror before giving up on this title.',
  '      }',
  '    }',
  '    return null;',
].join('\n') + '\n';
source = source.slice(0, detailRequestStart) + detailBlock + source.slice(detailRequestEnd);

await fs.writeFile(path, source, 'utf8');
console.log('Remote catalog recovery patch applied.');
