import fs from 'node:fs/promises';

const service = await fs.readFile('src/contentService.ts', 'utf8');
const app = await fs.readFile('App.tsx', 'utf8');

const requireMarker = (source, marker, label) => {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
};

requireMarker(service, 'aparatchi-catalog-index-v3-cache.json', 'v3 catalog cache');
requireMarker(service, 'loadContent(preferCache = false, forceRemote = false)', 'forced catalog refresh API');
requireMarker(service, 'if (!forceRemote && manifest && cached && manifestMatchesCachedContent(manifest, cached))', 'manifest force bypass');
requireMarker(service, "if (!forceRemote && cacheMetadata.etag)", 'conditional request force bypass');
requireMarker(service, '_aparatchi_force=', 'forced request cache bust');
requireMarker(service, 'const controllers = candidates.map(() => new AbortController());', 'parallel detail controllers');
requireMarker(service, 'new Promise<{ parsed: CatalogItem; raw: string } | null>', 'first valid detail race');
requireMarker(service, 'setTimeout(() => controller.abort(), 6_000)', 'bounded detail timeout');

requireMarker(app, 'const refreshed = await loadContent(false, true);', 'stale-index recovery');
requireMarker(app, 'activeSummary = refreshedSummary;', 'refreshed detail path adoption');
requireMarker(app, 'fullItem = await loadCatalogItemDetail(activeSummary);', 'refreshed detail retry');
if (app.includes('return fullItem || { ...current, detailLoaded: true };')) {
  throw new Error('Failed detail hydration is still being falsely marked as loaded.');
}

console.log(JSON.stringify({
  cacheGeneration: 'v3',
  forcedIndexRecovery: true,
  parallelDetailMirrors: true,
  falseLoadedState: false,
}, null, 2));
