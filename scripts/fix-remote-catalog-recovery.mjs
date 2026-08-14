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
replaceOnce(
  assetMarker,
  `${assetMarker}\n\nconst remoteRepositoryUrlCandidates = (value: string) => {\n  const url = asString(value);\n  if (!url) return [] as string[];\n\n  let relative = '';\n  for (const base of CONTENT_REPOSITORY_BASES) {\n    if (url.startsWith(base)) {\n      relative = url.slice(base.length);\n      break;\n    }\n  }\n  if (!relative) return [url];\n\n  return [...new Set(CONTENT_REPOSITORY_BASES.map((base) => {\n    try {\n      return new URL(relative, base).toString();\n    } catch {\n      return \\`${'${base}'}${'${relative}'}\\`;\n    }\n  }))];\n};`,
  'mirror helper',
);

const manifestStart = source.indexOf('const fetchRemoteManifest = async (): Promise<RemoteCatalogManifest | null> => {');
const manifestEnd = source.indexOf('\nconst manifestMatchesCachedContent = (', manifestStart);
if (manifestStart < 0 || manifestEnd < 0) throw new Error('manifest function markers not found');
const newManifest = `const fetchRemoteManifest = async (): Promise<RemoteCatalogManifest | null> => {\n  const manifestUrl = REMOTE_CONTENT_MANIFEST_URL.trim();\n  if (!manifestUrl) return null;\n  let lastError: unknown = null;\n\n  for (const candidate of remoteRepositoryUrlCandidates(manifestUrl)) {\n    const separator = candidate.includes('?') ? '&' : '?';\n    const requestUrl = \\`${'${candidate}'}${'${separator}'}_aparatchi_manifest=${'${Math.floor(Date.now() / 300_000)}'}\\`;\n    const controller = new AbortController();\n    const timeout = setTimeout(() => controller.abort(), 8_000);\n    try {\n      const response = await fetch(requestUrl, {\n        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },\n        signal: controller.signal,\n      });\n      if (!response.ok) {\n        lastError = new Error(\\`Manifest HTTP ${'${response.status}'} from ${'${candidate}'}\\`);\n        continue;\n      }\n      const value = await response.json();\n      if (!value || typeof value !== 'object') {\n        lastError = new Error(\\`Invalid catalog manifest from ${'${candidate}'}\\`);\n        continue;\n      }\n      const record = value as Record<string, unknown>;\n      const revision = asString(record.revision);\n      if (!revision) {\n        lastError = new Error(\\`Catalog manifest has no revision from ${'${candidate}'}\\`);\n        continue;\n      }\n      return {\n        revision,\n        ...(asString(record.clientRevision ?? record.client_revision)\n          ? { clientRevision: asString(record.clientRevision ?? record.client_revision) }\n          : {}),\n        ...(asString(record.catalogVersion ?? record.version)\n          ? { catalogVersion: asString(record.catalogVersion ?? record.version) }\n          : {}),\n        ...(asString(record.catalogUpdatedAt ?? record.updatedAt)\n          ? { catalogUpdatedAt: asString(record.catalogUpdatedAt ?? record.updatedAt) }\n          : {}),\n        ...(asNumber(record.sizeBytes, 0) > 0 ? { sizeBytes: asNumber(record.sizeBytes, 0) } : {}),\n        ...(asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) > 0\n          ? { clientSizeBytes: asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) }\n          : {}),\n        ...(asString(record.clientIndex ?? record.client_index)\n          ? { clientIndex: asString(record.clientIndex ?? record.client_index) }\n          : {}),\n        ...(asString(record.detailBase ?? record.detail_base)\n          ? { detailBase: asString(record.detailBase ?? record.detail_base) }\n          : {}),\n      };\n    } catch (error) {\n      lastError = error;\n    } finally {\n      clearTimeout(timeout);\n    }\n  }\n\n  throw lastError instanceof Error ? lastError : new Error('Catalog manifest is unavailable from all mirrors');\n};\n`;
source = source.slice(0, manifestStart) + newManifest + source.slice(manifestEnd + 1);

const normalizedMarker = `export const getBundledContent = (): LoadedContent => ({\n  ...normalizedLocalPayload(),\n  source: 'local',\n});`;
replaceOnce(
  normalizedMarker,
  `const unavailableLocalPayload = (): CatalogPayload => ({\n  version: 'bootstrap-unavailable',\n  updatedAt: '',\n  items: [],\n  iranianSchedule: [],\n  weeklySchedule: [],\n  featuredPeople: [],\n  imdbTop100: undefined,\n});\n\nexport const getBundledContent = (): LoadedContent => ({\n  ...unavailableLocalPayload(),\n  source: 'local',\n});`,
  'honest bootstrap payload',
);

replaceOnce(
`  if (preferCache) {\n    await readCacheMetadata();\n    const cached = await readCachedContent();\n    if (cached) return { ...cached, source: 'cache' };\n    return {\n      ...normalizedLocalPayload(),\n      source: 'local',\n    };\n  }`,
`  if (preferCache) {\n    await readCacheMetadata();\n    const cached = await readCachedContent();\n    if (cached) return { ...cached, source: 'cache' };\n    return {\n      ...unavailableLocalPayload(),\n      source: 'local',\n    };\n  }`,
  'cache miss bootstrap',
);

const loadStart = source.indexOf('export async function loadContent(preferCache = false): Promise<LoadedContent> {');
const requestStart = source.indexOf('    const controller = new AbortController();', loadStart);
const requestEnd = source.indexOf('    // Keep the original response text for the on-device cache.', requestStart);
if (loadStart < 0 || requestStart < 0 || requestEnd < 0) throw new Error('catalog request block markers not found');
const requestBlock = `    const requestHeaders: Record<string, string> = {\n      Accept: 'application/json',\n      'Cache-Control': 'no-cache',\n    };\n    if (cacheMetadata.etag) requestHeaders['If-None-Match'] = cacheMetadata.etag;\n    if (cacheMetadata.lastModified) requestHeaders['If-Modified-Since'] = cacheMetadata.lastModified;\n\n    const catalogRevision = manifest?.clientRevision || manifest?.revision || '';\n    let response: Awaited<ReturnType<typeof fetch>> | null = null;\n    let lastCatalogError: unknown = null;\n\n    for (const candidate of remoteRepositoryUrlCandidates(remoteUrl)) {\n      const controller = new AbortController();\n      const timeout = setTimeout(() => controller.abort(), 60_000);\n      const catalogRequestUrl = catalogRevision\n        ? \\`${'${candidate}'}${'${candidate.includes(\'?\') ? \'&\' : \'?\'}'}revision=${'${encodeURIComponent(catalogRevision.slice(0, 24))}'}\\`\n        : candidate;\n      try {\n        const nextResponse = await fetch(catalogRequestUrl, {\n          headers: requestHeaders,\n          signal: controller.signal,\n        });\n        if (nextResponse.status === 304 && cached) {\n          response = nextResponse;\n          break;\n        }\n        if (!nextResponse.ok) {\n          lastCatalogError = new Error(\\`Catalog HTTP ${'${nextResponse.status}'} from ${'${candidate}'}\\`);\n          continue;\n        }\n        response = nextResponse;\n        break;\n      } catch (error) {\n        lastCatalogError = error;\n      } finally {\n        clearTimeout(timeout);\n      }\n    }\n\n    if (!response) {\n      throw lastCatalogError instanceof Error\n        ? lastCatalogError\n        : new Error('Catalog is unavailable from all mirrors');\n    }\n    if (response.status === 304) {\n      const cached = await readCachedContent();\n      if (cached) return { ...cached, source: 'remote' };\n      cacheMetadata = {};\n      if (REMOTE_CACHE_META_URI) {\n        void FileSystem.writeAsStringAsync(REMOTE_CACHE_META_URI, '{}').catch(() => undefined);\n      }\n      throw new Error('Remote catalog returned 304 without a local cache');\n    }\n`;
source = source.slice(0, requestStart) + requestBlock + source.slice(requestEnd);

const finalFallback = `  } catch {\n    if (cached) return { ...cached, source: 'cache' };\n    return {\n      ...normalizedLocalPayload(),\n      source: 'local',\n    };\n  }\n}`;
const finalFallbackPos = source.indexOf(finalFallback, loadStart);
if (finalFallbackPos < 0) throw new Error('final fallback block not found');
source = source.slice(0, finalFallbackPos) + `  } catch {\n    if (cached) return { ...cached, source: 'cache' };\n    return {\n      ...unavailableLocalPayload(),\n      source: 'local',\n    };\n  }\n}` + source.slice(finalFallbackPos + finalFallback.length);

const detailStart = source.indexOf('export async function loadCatalogItemDetail(summary: CatalogItem): Promise<CatalogItem | null> {');
const detailRequestStart = source.indexOf('    const url = detailUrlFor(detailPath);', detailStart);
const detailRequestEnd = source.indexOf('  })().finally(() => detailRequestCache.delete(memoryKey));', detailRequestStart);
if (detailStart < 0 || detailRequestStart < 0 || detailRequestEnd < 0) throw new Error('detail request markers not found');
const detailBlock = `    const url = detailUrlFor(detailPath);\n    if (!url) return null;\n\n    for (const candidate of remoteRepositoryUrlCandidates(url)) {\n      try {\n        const controller = new AbortController();\n        const timeout = setTimeout(() => controller.abort(), 10_000);\n        const response = await fetch(\\`${'${candidate}'}${'${candidate.includes(\'?\') ? \'&\' : \'?\'}'}v=${'${encodeURIComponent(detailPath)}'}\\`, {\n          headers: { Accept: 'application/json', 'Cache-Control': 'public, max-age=31536000, immutable' },\n          signal: controller.signal,\n        }).finally(() => clearTimeout(timeout));\n        if (!response.ok) continue;\n        const raw = await response.text();\n        const parsed = parseDetail(JSON.parse(raw));\n        if (!parsed) continue;\n        detailMemoryCache.set(memoryKey, parsed);\n        if (cacheUri) void FileSystem.writeAsStringAsync(cacheUri, raw).catch(() => undefined);\n        return parsed;\n      } catch {\n        // Try the next public mirror before giving up on this title.\n      }\n    }\n    return null;\n`;
source = source.slice(0, detailRequestStart) + detailBlock + source.slice(detailRequestEnd);

await fs.writeFile(path, source, 'utf8');
console.log('Remote catalog recovery patch applied.');
