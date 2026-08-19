import fs from 'node:fs/promises';

const file = 'App.tsx';
let source = await fs.readFile(file, 'utf8');
const replaceOnce = (before, after, label) => {
  if (!source.includes(before)) throw new Error(`Missing v34 App marker: ${label}`);
  source = source.replace(before, after);
};

replaceOnce(
  `const STARTUP_MIN_VISIBLE_MS = 0;\n\nfunction AppContent() {`,
  `const mergeOpenDetailSnapshot = (current: CatalogItem, incoming: CatalogItem): CatalogItem => {\n  // Once Detail is visible, background index/detail hydration may enrich actions\n  // and metadata, but it must not visually replace the artwork/text/people the\n  // user is already looking at. Missing fields are still allowed to fill once.\n  const visiblePoster = current.poster || current.posterFallback || '';\n  const visibleBackdrop = current.backdrop || current.backdropFallback || visiblePoster;\n  const visibleOverview = String(current.overview || '').trim();\n  const visiblePeople = Array.isArray(current.people) && current.people.length ? current.people : null;\n  return {\n    ...incoming,\n    ...(visiblePoster ? {\n      poster: visiblePoster,\n      posterFallback: current.posterFallback || incoming.posterFallback,\n    } : {}),\n    ...(visibleBackdrop ? {\n      backdrop: visibleBackdrop,\n      backdropFallback: current.backdropFallback || incoming.backdropFallback,\n    } : {}),\n    ...(visibleOverview ? { overview: current.overview } : {}),\n    ...(visiblePeople ? { people: visiblePeople } : {}),\n  };\n};\n\nconst STARTUP_MIN_VISIBLE_MS = 0;\n\nfunction AppContent() {`,
  'detail snapshot helper',
);

replaceOnce(
  `          setSelectedItem((current) => {\n            if (!current) return current;\n            if (current.type !== summary.type || String(current.id) !== String(summary.id)) return current;\n            return refreshedSummary;\n          });`,
  `          setSelectedItem((current) => {\n            if (!current) return current;\n            if (current.type !== summary.type || String(current.id) !== String(summary.id)) return current;\n            return mergeOpenDetailSnapshot(current, refreshedSummary);\n          });`,
  'refreshed summary detail snapshot',
);

replaceOnce(
  `        // Keep the artwork that was already visible when Detail opened. The\n        // immutable shard may contain a newer/fallback backdrop, but swapping it\n        // one or two seconds after the screen is mounted looks like a broken\n        // banner. The next fresh catalog open can still adopt new artwork.\n        const visiblePoster = current.poster || current.posterFallback || '';\n        const visibleBackdrop = current.backdrop || current.backdropFallback || visiblePoster;\n        return {\n          ...fullItem,\n          ...(visiblePoster ? {\n            poster: current.poster || visiblePoster,\n            posterFallback: current.posterFallback || fullItem.posterFallback,\n          } : {}),\n          ...(visibleBackdrop ? {\n            backdrop: current.backdrop || visibleBackdrop,\n            backdropFallback: current.backdropFallback || fullItem.backdropFallback,\n          } : {}),\n        };`,
  `        return mergeOpenDetailSnapshot(current, fullItem);`,
  'detail shard hydration snapshot',
);

replaceOnce(
  `      // Keep an already-hydrated detail object until the lightweight index says\n      // its content-addressed detailPath changed. Otherwise every background\n      // catalog refresh would downgrade the open screen back to a summary.\n      if (\n        selectedItem.detailLoaded === true &&\n        selectedItem.detailPath &&\n        selectedItem.detailPath === currentItem.detailPath\n      ) return;\n      setSelectedItem(currentItem);`,
  `      // An open Detail screen owns its first visible snapshot. A background\n      // full-index refresh with the same content-addressed detail must not swap\n      // its banner, overview or cast. Only a genuinely new detailPath may update\n      // the open item, and even then visible fields stay stable until next open.\n      if (\n        selectedItem.detailPath &&\n        selectedItem.detailPath === currentItem.detailPath\n      ) return;\n      setSelectedItem((current) => {\n        if (!current) return currentItem;\n        if (current.type !== currentItem.type || String(current.id) !== String(currentItem.id)) return currentItem;\n        return mergeOpenDetailSnapshot(current, currentItem);\n      });`,
  'background index open-detail sync',
);

await fs.writeFile(file, source, 'utf8');
console.log('Applied v34 first-paint Detail snapshot stability.');