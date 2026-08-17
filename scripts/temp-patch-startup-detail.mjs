import fs from 'node:fs';

const appPath = 'App.tsx';
let source = fs.readFileSync(appPath, 'utf8');

const countOccurrences = (text, needle) => text.split(needle).length - 1;
const assertExactlyOnce = (label, needle) => {
  const count = countOccurrences(source, needle);
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  }
};
const replaceExactlyOnce = (label, before, after) => {
  assertExactlyOnce(label, before);
  source = source.replace(before, after);
};

if (countOccurrences(source, 'const STARTUP_MIN_VISIBLE_MS = 5000;') !== 1) {
  throw new Error('startup guard: STARTUP_MIN_VISIBLE_MS must remain exactly 5000');
}

replaceExactlyOnce(
  'detail readiness',
  "  const detailBodyReady = Boolean(item && (!item.detailPath || item.detailLoaded === true));",
  `  const detailBodyReady = Boolean(\n    item && (\n      !item.detailPath ||\n      item.detailLoaded === true ||\n      Boolean(item.streamUrl) ||\n      (item.downloads?.length || 0) > 0\n    ),\n  );`,
);

replaceExactlyOnce(
  'background full-catalog helper insertion',
  `      return true;\n    };\n\n    try {\n      // First try the fast bundled/persisted catalog. When it is empty, keep`,
  `      return true;\n    };\n\n    // Bootstrap already carries the complete navigation catalog plus compact\n    // actionable media. When the larger index arrives later with the same\n    // catalog identity/order, merge only its supplemental top-level data and\n    // retain the bootstrap item objects so Home/detail do not visibly jump.\n    const applyBackgroundFullContent = (nextContent: LoadedContent) => {\n      const visibleContent = visibleLoadedContent(nextContent);\n      if (!visibleContent.items.length) return false;\n\n      const currentContent = contentRef.current;\n      const sameCatalog =\n        currentContent.items.length === visibleContent.items.length &&\n        currentContent.items.every((currentItem, index) => {\n          const incomingItem = visibleContent.items[index];\n          return Boolean(\n            incomingItem &&\n            currentItem.id === incomingItem.id &&\n            currentItem.type === incomingItem.type\n          );\n        });\n\n      if (!sameCatalog) {\n        // loadedContentRevision intentionally omits the item list. If artifacts\n        // raced and identity/order really changed, force the full truth through.\n        if (loadedContentRevision(nextContent) === contentRevisionRef.current) {\n          contentRevisionRef.current = '';\n        }\n        return applyContent(nextContent);\n      }\n\n      const mergedContent: LoadedContent = {\n        ...visibleContent,\n        items: currentContent.items,\n      };\n      contentRevisionRef.current = loadedContentRevision(nextContent);\n      contentRef.current = mergedContent;\n      startTransition(() => setContent(mergedContent));\n      lastContentLoadRef.current = Date.now();\n      setContentReady(true);\n      setContentResolved(true);\n      return true;\n    };\n\n    try {\n      // First try the fast bundled/persisted catalog. When it is empty, keep`,
);

replaceExactlyOnce(
  'cold-start bootstrap ordering',
  `      // On an online cold start, bundled/persisted/bootstrap catalogs are fallback\n      // only. Keep the branded cover up while the current Raw-first full index is\n      // already downloading; normally reveal Home once that full truth is ready.\n      // This prevents a visible bootstrap -> full-catalog jump after the splash.\n      if (initialLoad && online && firstContent.source !== 'remote') {\n        const freshContentPromise = loadContent(false);\n        const bootstrapContentPromise = loadBootstrapContent().then((bootstrapContent) => {\n          if (bootstrapContent?.items.length) startupFallbackContentRef.current = bootstrapContent;\n          return bootstrapContent;\n        });\n        let fallbackContent = firstContent;\n\n        try {\n          const freshContent = await freshContentPromise;\n          if (freshContent.source === 'remote' && applyContent(freshContent)) {\n            dismissStartup();\n            return;\n          }\n          fallbackContent = freshContent;\n        } catch {\n          // The current full index failed; use the current bootstrap below.\n        }\n\n        const bootstrapContent = await bootstrapContentPromise;\n        const bootstrapApplied = Boolean(bootstrapContent && applyContent(bootstrapContent));\n        if (!bootstrapApplied) applyContent(fallbackContent);\n        dismissStartup();\n        return;\n      }`,
  `      // On an online cold start, start the large full index immediately but do\n      // not make first paint wait for it. The compact bootstrap is the complete\n      // navigation catalog and is bounded to arrive quickly; the full index then\n      // enriches supplemental data in the background without replacing the same\n      // item list. This keeps the existing five-second startup cover useful.\n      if (initialLoad && online && firstContent.source !== 'remote') {\n        const freshContentPromise = loadContent(false);\n        const bootstrapContentPromise = loadBootstrapContent().then((bootstrapContent) => {\n          if (bootstrapContent?.items.length) startupFallbackContentRef.current = bootstrapContent;\n          return bootstrapContent;\n        });\n\n        let bootstrapApplied = false;\n        try {\n          const bootstrapContent = await bootstrapContentPromise;\n          bootstrapApplied = Boolean(bootstrapContent && applyContent(bootstrapContent));\n        } catch {\n          // The full catalog is already in flight and remains the fallback below.\n        }\n\n        if (bootstrapApplied) {\n          dismissStartup();\n          void freshContentPromise\n            .then((freshContent) => {\n              if (freshContent.source === 'remote') applyBackgroundFullContent(freshContent);\n            })\n            .catch(() => undefined);\n          return;\n        }\n\n        // Bootstrap failed: prefer the already-resolved local/persisted catalog\n        // immediately instead of blocking first paint on the large network index.\n        if (applyContent(firstContent)) {\n          dismissStartup();\n          void freshContentPromise\n            .then((freshContent) => {\n              if (freshContent.source === 'remote') applyBackgroundFullContent(freshContent);\n            })\n            .catch(() => undefined);\n          return;\n        }\n\n        // Only a genuinely empty fallback is allowed to wait for the in-flight\n        // full index, because there is otherwise nothing truthful to reveal.\n        try {\n          const freshContent = await freshContentPromise;\n          if (!applyContent(freshContent)) {\n            setContentReady(false);\n            setContentResolved(true);\n          }\n        } catch {\n          setContentReady(false);\n          setContentResolved(true);\n        } finally {\n          dismissStartup();\n        }\n        return;\n      }`,
);

if (countOccurrences(source, 'const STARTUP_MIN_VISIBLE_MS = 5000;') !== 1) {
  throw new Error('startup guard changed unexpectedly');
}
if (source.includes('const detailBodyReady = Boolean(item && (!item.detailPath || item.detailLoaded === true));')) {
  throw new Error('old detail readiness gate is still present');
}
if (!source.includes("if (freshContent.source === 'remote') applyBackgroundFullContent(freshContent);")) {
  throw new Error('background full-catalog merge is missing');
}
if (!source.includes('(item.downloads?.length || 0) > 0')) {
  throw new Error('compact detail media readiness is missing');
}

fs.writeFileSync(appPath, source, 'utf8');
console.log('Guarded App.tsx patch applied successfully.');
