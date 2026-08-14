import fs from 'node:fs/promises';

const replaceOnce = (source, from, to, label) => {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing patch marker: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Non-unique patch marker: ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
};

let service = await fs.readFile('src/contentService.ts', 'utf8');

// New APKs must not inherit an index cache whose content-addressed detail paths
// may already have been retired by older Content revisions.
service = service
  .replace(/aparatchi-catalog-index-v2-cache\.json/g, 'aparatchi-catalog-index-v3-cache.json')
  .replace(/aparatchi-catalog-index-v2-cache-meta\.json/g, 'aparatchi-catalog-index-v3-cache-meta.json');

service = replaceOnce(
  service,
  'export async function loadContent(preferCache = false): Promise<LoadedContent> {',
  'export async function loadContent(preferCache = false, forceRemote = false): Promise<LoadedContent> {',
  'loadContent forceRemote signature',
);

service = replaceOnce(
  service,
  '    if (manifest && cached && manifestMatchesCachedContent(manifest, cached)) {',
  '    if (!forceRemote && manifest && cached && manifestMatchesCachedContent(manifest, cached)) {',
  'manifest cached fast path guard',
);

service = replaceOnce(
  service,
  '    if (cached) return { ...cached, source: \'cache\' };\n  }\n\n  try {\n    const requestHeaders: Record<string, string> = {',
  '    if (cached && !forceRemote) return { ...cached, source: \'cache\' };\n  }\n\n  try {\n    const requestHeaders: Record<string, string> = {',
  'manifest failure force guard',
);

service = replaceOnce(
  service,
  "    if (cacheMetadata.etag) requestHeaders['If-None-Match'] = cacheMetadata.etag;\n    if (cacheMetadata.lastModified) requestHeaders['If-Modified-Since'] = cacheMetadata.lastModified;",
  "    if (!forceRemote && cacheMetadata.etag) requestHeaders['If-None-Match'] = cacheMetadata.etag;\n    if (!forceRemote && cacheMetadata.lastModified) requestHeaders['If-Modified-Since'] = cacheMetadata.lastModified;",
  'conditional request force guard',
);

service = replaceOnce(
  service,
  `      const catalogRequestUrl = catalogRevision
        ? \`${'${candidate}'}\${candidate.includes('?') ? '&' : '?'}revision=\${encodeURIComponent(catalogRevision.slice(0, 24))}\`
        : candidate;`,
  `      const catalogBaseRequestUrl = catalogRevision
        ? \`${'${candidate}'}\${candidate.includes('?') ? '&' : '?'}revision=\${encodeURIComponent(catalogRevision.slice(0, 24))}\`
        : candidate;
      const catalogRequestUrl = forceRemote
        ? \`${'${catalogBaseRequestUrl}'}\${catalogBaseRequestUrl.includes('?') ? '&' : '?'}_aparatchi_force=\${Date.now()}\`
        : catalogBaseRequestUrl;`,
  'forced catalog cache bust',
);

const oldDetailNetwork = `    for (const candidate of remoteRepositoryUrlCandidates(url)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(\`${'${candidate}'}\${candidate.includes('?') ? '&' : '?'}v=\${encodeURIComponent(detailPath)}\`, {
          headers: { Accept: 'application/json', 'Cache-Control': 'public, max-age=31536000, immutable' },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (!response.ok) continue;
        const raw = await response.text();
        const parsed = parseDetail(JSON.parse(raw));
        if (!parsed) continue;
        detailMemoryCache.set(memoryKey, parsed);
        if (cacheUri) void FileSystem.writeAsStringAsync(cacheUri, raw).catch(() => undefined);
        return parsed;
      } catch {
        // Try the next public mirror before giving up on this title.
      }
    }
    return null;`;

const newDetailNetwork = `    const candidates = remoteRepositoryUrlCandidates(url);
    if (!candidates.length) return null;

    // Detail shards are small. Start CDN and Raw together and keep the first
    // valid response. Sequential 10-second mirror timeouts made a healthy title
    // look link-less whenever the first mirror was slow or temporarily stale.
    const controllers = candidates.map(() => new AbortController());
    const firstValid = await new Promise<{ parsed: CatalogItem; raw: string } | null>((resolve) => {
      let remaining = candidates.length;
      let settled = false;

      candidates.forEach((candidate, index) => {
        const controller = controllers[index];
        const timeout = setTimeout(() => controller.abort(), 6_000);
        void (async () => {
          try {
            const separator = candidate.includes('?') ? '&' : '?';
            const response = await fetch(
              \`${'${candidate}'}\${separator}v=\${encodeURIComponent(detailPath)}\`,
              {
                headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
                signal: controller.signal,
              },
            );
            if (!response.ok) return;
            const raw = await response.text();
            const parsed = parseDetail(JSON.parse(raw));
            if (!parsed || settled) return;
            settled = true;
            controllers.forEach((other, otherIndex) => {
              if (otherIndex !== index) other.abort();
            });
            resolve({ parsed, raw });
          } catch {
            // Another mirror may still succeed.
          } finally {
            clearTimeout(timeout);
            remaining -= 1;
            if (!remaining && !settled) resolve(null);
          }
        })();
      });
    });

    if (!firstValid) return null;
    detailMemoryCache.set(memoryKey, firstValid.parsed);
    if (cacheUri) void FileSystem.writeAsStringAsync(cacheUri, firstValid.raw).catch(() => undefined);
    return firstValid.parsed;`;
service = replaceOnce(service, oldDetailNetwork, newDetailNetwork, 'parallel detail mirrors');

await fs.writeFile('src/contentService.ts', service);

let app = await fs.readFile('App.tsx', 'utf8');
const oldHydration = `  useEffect(() => {
    const summary = selectedItem;
    if (!summary?.detailPath || summary.detailLoaded === true) return undefined;

    let cancelled = false;
    void (async () => {
      let fullItem = await loadCatalogItemDetail(summary);
      if (!fullItem && !cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        fullItem = await loadCatalogItemDetail(summary);
      }
      if (cancelled) return;
      setSelectedItem((current) => {
        if (!current) return current;
        if (current.type !== summary.type || String(current.id) !== String(summary.id)) return current;
        if (current.detailPath !== summary.detailPath) return current;
        // Never leave a title behind an endless spinner. A later reopen retries
        // the immutable detail shard, while the summary remains usable now.
        return fullItem || { ...current, detailLoaded: true };
      });
    })().catch(() => undefined);

    return () => { cancelled = true; };
  }, [selectedItem?.detailLoaded, selectedItem?.detailPath, selectedItem?.id, selectedItem?.type]);`;

const newHydration = `  useEffect(() => {
    const summary = selectedItem;
    if (!summary?.detailPath || summary.detailLoaded === true) return undefined;

    let cancelled = false;
    void (async () => {
      let activeSummary = summary;
      let fullItem = await loadCatalogItemDetail(activeSummary);

      if (!fullItem && !cancelled) {
        // A cached lightweight index can outlive a content-addressed detail shard.
        // Force one direct index refresh (bypassing manifest/cache short-circuits),
        // then retry using the refreshed detailPath for the same title.
        const refreshed = await loadContent(false, true);
        if (cancelled) return;
        const refreshedSummary = refreshed.items.find((candidate) =>
          candidate.type === summary.type && String(candidate.id) === String(summary.id),
        );
        if (refreshedSummary) {
          setContent(refreshed);
          activeSummary = refreshedSummary;
          setSelectedItem((current) => {
            if (!current) return current;
            if (current.type !== summary.type || String(current.id) !== String(summary.id)) return current;
            return refreshedSummary;
          });
          fullItem = await loadCatalogItemDetail(activeSummary);
        }
      }

      if (!fullItem && !cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        fullItem = await loadCatalogItemDetail(activeSummary);
      }
      if (cancelled || !fullItem) return;

      setSelectedItem((current) => {
        if (!current) return current;
        if (current.type !== activeSummary.type || String(current.id) !== String(activeSummary.id)) return current;
        if (current.detailPath !== activeSummary.detailPath) return current;
        return fullItem;
      });
    })().catch(() => undefined);

    return () => { cancelled = true; };
  }, [selectedItem?.detailLoaded, selectedItem?.detailPath, selectedItem?.id, selectedItem?.type]);`;

app = replaceOnce(app, oldHydration, newHydration, 'selected detail hydration recovery');
await fs.writeFile('App.tsx', app);

console.log(JSON.stringify({
  catalogCacheVersion: 3,
  forceRemoteRecovery: true,
  detailMirrorsParallel: true,
  detailMirrorTimeoutMs: 6000,
  failedDetailMarkedLoaded: false,
  staleIndexRecovery: true,
}, null, 2));
