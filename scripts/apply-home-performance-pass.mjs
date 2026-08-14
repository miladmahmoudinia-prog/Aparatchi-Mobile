import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing performance patch target: ${label}`);
  source = source.replace(before, after);
};

// TMDB is frequently slow/blocked on some target mobile networks. Use the
// already-configured image proxy first, then fall back to TMDB itself.
replaceOnce(
`  if (isTmdb) {\n    candidates.push(image.replace(/\\/t\\/p\\/(?:original|w\\d+)\\//i, '/t/p/w185/'));\n    candidates.push(\`https://wsrv.nl/?url=\${encodeURIComponent(sourceWithoutProtocol)}&w=190&output=webp\`);\n    candidates.push(image);\n  } else if (isUpera) {`,
`  if (isTmdb) {\n    candidates.push(\`https://wsrv.nl/?url=\${encodeURIComponent(sourceWithoutProtocol)}&w=190&output=webp\`);\n    candidates.push(image.replace(/\\/t\\/p\\/(?:original|w\\d+)\\//i, '/t/p/w185/'));\n    candidates.push(image);\n  } else if (isUpera) {`,
  'person image proxy priority',
);

replaceOnce(
`    candidates.push(\n      image.replace(/\\/t\\/p\\/(?:original|w\\d+)\\//i, \`/t/p/\${tmdbWidth}/\`),\n      proxied,\n      image,\n    );`,
`    candidates.push(\n      proxied,\n      image.replace(/\\/t\\/p\\/(?:original|w\\d+)\\//i, \`/t/p/\${tmdbWidth}/\`),\n      image,\n    );`,
  'catalog image proxy priority',
);

// Do not scan the whole catalog for a star when their server-provided itemIds
// are already valid. The old code did both paths eagerly for every star.
replaceOnce(
`      const explicitMatches = [...explicitIds].filter((itemId) => catalogById.has(String(itemId)));\n      const fallbackMatches = personWorksFor(person, catalog).map((item) => item.id);\n      // Never drop a known star merely because old itemIds went stale after a\n      // catalog refresh. Re-resolve their works by cast/name before filtering.\n      const matchedIds = explicitMatches.length ? explicitMatches : fallbackMatches;`,
`      const explicitMatches = [...explicitIds].filter((itemId) => catalogById.has(String(itemId)));\n      // Only scan the catalog when the server-provided ids are stale/missing.\n      // This avoids dozens of full-catalog passes every time the stars shelf mounts.\n      const matchedIds = explicitMatches.length\n        ? explicitMatches\n        : personWorksFor(person, catalog).map((item) => item.id);`,
  'lazy star fallback lookup',
);

// Warm exactly the artwork users are about to see, in small batches. The old
// prefetch used catalog.slice(0, 36), which often had little overlap with Home.
const oldPrefetch = `  useEffect(() => {\n    // Warm the disk cache for the first visible shelves without waiting for\n    // every <Image> to mount. This keeps initial scroll/taps responsive and\n    // prevents poster placeholders from lingering on ordinary mobile data.\n    const urls = catalog\n      .slice(0, 36)\n      .map((item) => catalogArtworkCandidates(item.poster || item.backdrop || item.posterFallback, 'poster')[0])\n      .filter((url): url is string => Boolean(url));\n    if (urls.length) void Image.prefetch([...new Set(urls)]).catch(() => undefined);\n  }, [catalog]);`;
const newPrefetch = `  useEffect(() => {\n    // Use the 10-second branded startup window to warm the artwork actually\n    // visible on Home. Small staggered batches avoid saturating mobile data.\n    const visibleCandidates = [\n      ...newest.slice(0, 5),\n      ...rows.slice(0, 8).flatMap((row) => row.items.slice(0, 5)),\n    ];\n    const urls = [...new Set(visibleCandidates\n      .map((item) => catalogArtworkCandidates(item.poster || item.backdrop || item.posterFallback, 'poster')[0])\n      .filter((url): url is string => Boolean(url)))]\n      .slice(0, 45);\n    const batches = [urls.slice(0, 15), urls.slice(15, 30), urls.slice(30, 45)].filter((batch) => batch.length);\n    const timers = batches.map((batch, index) => setTimeout(() => {\n      void Image.prefetch(batch).catch(() => undefined);\n    }, index * 550));\n    return () => timers.forEach(clearTimeout);\n  }, [newest, rows]);`;
replaceOnce(oldPrefetch, newPrefetch, 'home visible artwork prefetch');

// Render enough shelves behind the 10-second startup cover to make the first
// scroll immediately useful, while still keeping the stars-heavy row deferred.
source = source.replace('        initialNumToRender={2}\n        maxToRenderPerBatch={2}\n        updateCellsBatchingPeriod={45}\n        windowSize={4}',
                        '        initialNumToRender={4}\n        maxToRenderPerBatch={3}\n        updateCellsBatchingPeriod={40}\n        windowSize={5}');

await fs.writeFile(path, source, 'utf8');
console.log('Home performance pass applied: proxy-first TMDB images, useful prefetch batches, and lazy star catalog lookup.');
