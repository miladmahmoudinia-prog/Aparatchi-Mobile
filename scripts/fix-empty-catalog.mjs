import fs from 'node:fs/promises';

const path = 'src/contentService.ts';
let source = await fs.readFile(path, 'utf8');

const alreadyFixed =
  source.includes('const acceptedCatalog = selectedCatalog || staleFallbackCatalog;') &&
  source.includes('const acceptedManifest = catalogMatchesManifest ? manifest : null;');

if (!alreadyFixed) {
  const loadStart = source.indexOf('export async function loadContent(');
  const candidateStart = source.indexOf(
    '    let response: Awaited<ReturnType<typeof fetch>> | null = null;',
    loadStart,
  );
  const memoryMarker = '    memoryContent = parsed;\n';
  const candidateEnd = source.indexOf(memoryMarker, candidateStart);

  if (loadStart < 0 || candidateStart < 0 || candidateEnd < 0) {
    throw new Error('Could not locate current catalog mirror block safely.');
  }

  const replacement = `    type CatalogCandidateResult = {\n      response: Awaited<ReturnType<typeof fetch>>;\n      rawText: string;\n      parsed: CatalogPayload;\n      matchesManifest: boolean;\n    };\n    let selectedCatalog: CatalogCandidateResult | null = null;\n    let staleFallbackCatalog: CatalogCandidateResult | null = null;\n    let lastCatalogError: unknown = null;\n\n    for (const candidate of remoteRepositoryUrlCandidates(remoteUrl)) {\n      const controller = new AbortController();\n      const timeout = setTimeout(() => controller.abort(), 60_000);\n      const catalogBaseRequestUrl = catalogRevision\n        ? \`\${candidate}\${candidate.includes('?') ? '&' : '?'}revision=\${encodeURIComponent(catalogRevision.slice(0, 24))}\`\n        : candidate;\n      const catalogRequestUrl = forceRemote\n        ? \`\${catalogBaseRequestUrl}\${catalogBaseRequestUrl.includes('?') ? '&' : '?'}_aparatchi_force=\${Date.now()}\`\n        : catalogBaseRequestUrl;\n      try {\n        const nextResponse = await fetch(catalogRequestUrl, {\n          headers: requestHeaders,\n          signal: controller.signal,\n        });\n\n        if (nextResponse.status === 304) {\n          if (cached) return { ...cached, source: 'remote' };\n          cacheMetadata = {};\n          if (REMOTE_CACHE_META_URI) {\n            void FileSystem.writeAsStringAsync(REMOTE_CACHE_META_URI, '{}').catch(() => undefined);\n          }\n          lastCatalogError = new Error('Remote catalog returned 304 without a local cache');\n          continue;\n        }\n\n        if (!nextResponse.ok) {\n          lastCatalogError = new Error(\`Catalog HTTP \${nextResponse.status} from \${candidate}\`);\n          continue;\n        }\n\n        const nextRawText = await nextResponse.text();\n        let nextRawPayload: unknown;\n        try {\n          nextRawPayload = JSON.parse(nextRawText);\n        } catch (error) {\n          lastCatalogError = error;\n          continue;\n        }\n\n        const nextParsed = parsePayload(nextRawPayload);\n        if (!nextParsed || !nextParsed.items.length) {\n          lastCatalogError = new Error(\`Invalid/empty catalog payload from \${candidate}\`);\n          continue;\n        }\n\n        const matchesManifest =\n          !manifest?.catalogUpdatedAt || nextParsed.updatedAt === manifest.catalogUpdatedAt;\n        const candidateResult: CatalogCandidateResult = {\n          response: nextResponse,\n          rawText: nextRawText,\n          parsed: nextParsed,\n          matchesManifest,\n        };\n\n        if (matchesManifest) {\n          selectedCatalog = candidateResult;\n          break;\n        }\n\n        if (!staleFallbackCatalog) staleFallbackCatalog = candidateResult;\n        lastCatalogError = new Error(\`Catalog and manifest are temporarily out of sync at \${candidate}\`);\n      } catch (error) {\n        lastCatalogError = error;\n      } finally {\n        clearTimeout(timeout);\n      }\n    }\n\n    const acceptedCatalog = selectedCatalog || staleFallbackCatalog;\n    if (!acceptedCatalog) {\n      throw lastCatalogError instanceof Error\n        ? lastCatalogError\n        : new Error('Catalog is unavailable from all mirrors');\n    }\n\n    const {\n      response,\n      rawText,\n      parsed,\n      matchesManifest: catalogMatchesManifest,\n    } = acceptedCatalog;\n    const acceptedManifest = catalogMatchesManifest ? manifest : null;\n`;

  source = `${source.slice(0, candidateStart)}${replacement}${source.slice(candidateEnd)}`;

  const oldMeta = `      ...(manifest?.revision ? { manifestRevision: manifest.clientRevision || manifest.revision } : {}),\n      ...(manifest?.catalogVersion ? { catalogVersion: manifest.catalogVersion } : {}),\n      ...(manifest?.catalogUpdatedAt ? { catalogUpdatedAt: manifest.catalogUpdatedAt } : {}),`;
  const newMeta = `      ...(acceptedManifest?.revision\n        ? { manifestRevision: acceptedManifest.clientRevision || acceptedManifest.revision }\n        : {}),\n      ...(acceptedManifest?.catalogVersion ? { catalogVersion: acceptedManifest.catalogVersion } : {}),\n      ...(acceptedManifest?.catalogUpdatedAt ? { catalogUpdatedAt: acceptedManifest.catalogUpdatedAt } : {}),`;

  if (!source.includes(oldMeta)) {
    throw new Error('Could not locate manifest cache metadata block.');
  }
  source = source.replace(oldMeta, newMeta);

  const finalFallback = `    return {\n      ...unavailableLocalPayload(),\n      source: 'local',\n    };`;
  const safeFallback = `    return {\n      ...normalizedLocalPayload(),\n      source: 'local',\n    };`;
  const acceptedIndex = source.indexOf('const acceptedCatalog = selectedCatalog || staleFallbackCatalog;');
  const fallbackIndex = source.indexOf(finalFallback, acceptedIndex);
  if (fallbackIndex < 0) {
    throw new Error('Could not locate final empty-catalog fallback.');
  }
  source = `${source.slice(0, fallbackIndex)}${safeFallback}${source.slice(fallbackIndex + finalFallback.length)}`;

  await fs.writeFile(path, source, 'utf8');
}

const verified = await fs.readFile(path, 'utf8');
for (const marker of [
  'const acceptedCatalog = selectedCatalog || staleFallbackCatalog;',
  'if (!staleFallbackCatalog) staleFallbackCatalog = candidateResult;',
  'const acceptedManifest = catalogMatchesManifest ? manifest : null;',
]) {
  if (!verified.includes(marker)) {
    throw new Error(`Missing empty-catalog recovery marker: ${marker}`);
  }
}

const loadStart = verified.indexOf('export async function loadContent(');
const detailStart = verified.indexOf('const detailCacheUriFor', loadStart);
const loadBlock = verified.slice(loadStart, detailStart);
if (loadBlock.includes("throw new Error('Catalog and manifest are temporarily out of sync');")) {
  throw new Error('Strict manifest mismatch still empties the catalog.');
}
if (!loadBlock.includes('...normalizedLocalPayload(),')) {
  throw new Error('Remote failure still falls back to an empty local payload.');
}

console.log('Empty-catalog recovery now validates every mirror and preserves usable content.');
