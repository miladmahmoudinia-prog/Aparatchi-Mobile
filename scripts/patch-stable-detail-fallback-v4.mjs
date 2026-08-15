import fs from 'node:fs/promises';

const path = 'src/contentService.ts';
let source = await fs.readFile(path, 'utf8');

const from = `    if (!firstValid) return null;
    detailMemoryCache.set(memoryKey, firstValid.parsed);
    if (cacheUri) void FileSystem.writeAsStringAsync(cacheUri, firstValid.raw).catch(() => undefined);
    return firstValid.parsed;`;

const to = `    let resolvedDetail = firstValid;

    if (!resolvedDetail) {
      // A CDN may serve an older catalog-index.json after its content-addressed
      // detail shard has already rotated out of the repository. The first 12
      // hex chars in every detail filename are the permanent title identity.
      // Resolve that identity through a tiny stable pointer, then fetch the
      // current immutable detail shard. This works even when the index itself
      // is stale and avoids publishing duplicate full detail JSON files.
      const identityMatch = detailPath.match(/(?:^|\\/)([a-f0-9]{12})-[a-f0-9]{12}\\.json$/i);
      const stablePath = identityMatch ? \`catalog-stable/\${identityMatch[1].toLowerCase()}.json\` : '';

      const fetchFirstRawPath = async (targetPath: string): Promise<string | null> => {
        if (!targetPath || targetPath.includes('..')) return null;
        const targetUrl = detailUrlFor(targetPath);
        if (!targetUrl) return null;
        const mirrors = remoteRepositoryUrlCandidates(targetUrl);
        if (!mirrors.length) return null;

        const mirrorControllers = mirrors.map(() => new AbortController());
        return await new Promise<string | null>((resolve) => {
          let remaining = mirrors.length;
          let settled = false;
          mirrors.forEach((candidate, index) => {
            const controller = mirrorControllers[index];
            const timeout = setTimeout(() => controller.abort(), 6_000);
            void (async () => {
              try {
                const separator = candidate.includes('?') ? '&' : '?';
                const response = await fetch(
                  \`\${candidate}\${separator}v=\${encodeURIComponent(targetPath)}&stable=1\`,
                  {
                    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
                    signal: controller.signal,
                  },
                );
                if (!response.ok) return;
                const raw = await response.text();
                if (settled) return;
                settled = true;
                mirrorControllers.forEach((other, otherIndex) => {
                  if (otherIndex !== index) other.abort();
                });
                resolve(raw);
              } catch {
                // Another public mirror may still succeed.
              } finally {
                clearTimeout(timeout);
                remaining -= 1;
                if (!remaining && !settled) resolve(null);
              }
            })();
          });
        });
      };

      if (stablePath) {
        const pointerRaw = await fetchFirstRawPath(stablePath);
        if (pointerRaw) {
          try {
            const pointer = JSON.parse(pointerRaw) as Record<string, unknown>;
            const pointerType = asString(pointer.type);
            const pointerId = asString(pointer.id);
            const currentDetailPath = asString(pointer.detailPath);
            const pointerMatchesSummary =
              pointerType === asString(summary.type) &&
              pointerId === asString(summary.id);
            const currentPathSafe = /^catalog-items\\/[a-f0-9]{12}-[a-f0-9]{12}\\.json$/i.test(currentDetailPath);

            if (pointerMatchesSummary && currentPathSafe) {
              const currentRaw = await fetchFirstRawPath(currentDetailPath);
              if (currentRaw) {
                const parsed = parseDetail(JSON.parse(currentRaw));
                if (
                  parsed &&
                  asString(parsed.type) === asString(summary.type) &&
                  asString(parsed.id) === asString(summary.id)
                ) {
                  resolvedDetail = { parsed, raw: currentRaw };
                }
              }
            }
          } catch {
            // Invalid/stale pointer: the forced index refresh remains the final fallback.
          }
        }
      }
    }

    if (!resolvedDetail) return null;
    detailMemoryCache.set(memoryKey, resolvedDetail.parsed);
    if (cacheUri) void FileSystem.writeAsStringAsync(cacheUri, resolvedDetail.raw).catch(() => undefined);
    return resolvedDetail.parsed;`;

const index = source.indexOf(from);
if (index < 0) throw new Error('Missing v3 detail-resolution marker.');
if (source.indexOf(from, index + from.length) >= 0) throw new Error('Non-unique v3 detail-resolution marker.');
source = source.slice(0, index) + to + source.slice(index + from.length);
await fs.writeFile(path, source);

console.log(JSON.stringify({
  staleHashedDetailFallback: true,
  stablePointerPathDerivedFromIdentity: true,
  stablePointerIdentityVerified: true,
  stablePointerTargetValidated: true,
  duplicateFullStableDetailsRequired: false,
}, null, 2));
