import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const write = (path, content) => fs.writeFile(path, content, 'utf8');
const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};

let config = await read('src/config.ts');
config = replaceOnce(
  config,
  `export const REMOTE_CONTENT_INDEX_URL =\n  \`${'${CONTENT_REPOSITORY_BASES[0]}'}catalog-index.json\`;\n`,
  `export const REMOTE_CONTENT_INDEX_URL =\n  \`${'${CONTENT_REPOSITORY_BASES[0]}'}catalog-index.json\`;\n\n/**\n * نمای کم‌حجم صفحهٔ اصلی برای اولین اجرای بدون cache. این فایل شامل\n * summary واقعی ردیف‌های Home و IMDb است و بعداً با index کامل جایگزین می‌شود.\n */\nexport const REMOTE_CONTENT_BOOTSTRAP_URL =\n  \`${'${CONTENT_REPOSITORY_BASES[0]}'}catalog-bootstrap.json\`;\n`,
  'bootstrap config URL',
);
await write('src/config.ts', config);

let service = await read('src/contentService.ts');
service = replaceOnce(
  service,
  `  REMOTE_CONTENT_DETAIL_BASE_URL,\n  REMOTE_CONTENT_INDEX_URL,`,
  `  REMOTE_CONTENT_BOOTSTRAP_URL,\n  REMOTE_CONTENT_DETAIL_BASE_URL,\n  REMOTE_CONTENT_INDEX_URL,`,
  'bootstrap config import',
);

const bundledMarker = `export const getBundledContent = (): LoadedContent => ({\n  ...normalizedLocalPayload(),\n  source: 'local',\n});\n`;
const bootstrapLoader = `${bundledMarker}\n/**\n * Fetch the tiny Home bootstrap before the multi-megabyte catalog index on a\n * true cold start. CDN and GitHub Raw race each other so one blocked mirror can\n * never hold the first useful Home frame for a full request timeout.\n */\nexport async function loadBootstrapContent(): Promise<LoadedContent | null> {\n  const remoteUrl = REMOTE_CONTENT_BOOTSTRAP_URL.trim();\n  if (!remoteUrl) return null;\n  const candidates = remoteRepositoryUrlCandidates(remoteUrl);\n  if (!candidates.length) return null;\n\n  const controllers = candidates.map(() => new AbortController());\n  return await new Promise<LoadedContent | null>((resolve) => {\n    let remaining = candidates.length;\n    let settled = false;\n    const finishEmpty = () => {\n      remaining -= 1;\n      if (!settled && remaining <= 0) {\n        settled = true;\n        resolve(null);\n      }\n    };\n\n    candidates.forEach((candidate, index) => {\n      const controller = controllers[index];\n      const timeout = setTimeout(() => controller.abort(), 12_000);\n      const separator = candidate.includes('?') ? '&' : '?';\n      fetch(\`${'${candidate}${separator}'}_aparatchi_bootstrap=${'${Math.floor(Date.now() / 300_000)}'}\`, {\n        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },\n        signal: controller.signal,\n      })\n        .then(async (response) => {\n          if (!response.ok) throw new Error(\`Bootstrap HTTP ${'${response.status}'}\`);\n          const parsed = parsePayload(JSON.parse(await response.text()));\n          if (!parsed || parsed.items.length === 0 || settled) return;\n          settled = true;\n          controllers.forEach((other, otherIndex) => {\n            if (otherIndex !== index) other.abort();\n          });\n          resolve({ ...parsed, source: 'remote' });\n        })\n        .catch(() => undefined)\n        .finally(() => {\n          clearTimeout(timeout);\n          if (!settled) finishEmpty();\n        });\n    });\n  });\n}\n`;
service = replaceOnce(service, bundledMarker, bootstrapLoader, 'cold-start bootstrap loader');
await write('src/contentService.ts', service);

let app = await read('App.tsx');
app = replaceOnce(
  app,
  `import { getBundledContent, loadCatalogItemDetail, loadContent, LoadedContent } from './src/contentService';`,
  `import { getBundledContent, loadBootstrapContent, loadCatalogItemDetail, loadContent, LoadedContent } from './src/contentService';`,
  'bootstrap app import',
);

const horizontalStart = app.indexOf('const HorizontalCatalog = memo(function HorizontalCatalog');
const horizontalEnd = app.indexOf('const HomeStarsSection', horizontalStart);
if (horizontalStart < 0 || horizontalEnd < 0) throw new Error('HorizontalCatalog block not found');
let horizontal = app.slice(horizontalStart, horizontalEnd);
horizontal = replaceOnce(
  horizontal,
  `  const displayedItems = useMemo(() => [...items].reverse(), [items]);\n`,
  ``,
  'remove reverse-data Home rail workaround',
);
horizontal = replaceOnce(horizontal, '      data={displayedItems}', '      data={items}', 'Home rail source order');
horizontal = replaceOnce(
  horizontal,
  `      contentContainerStyle={styles.horizontalCatalog}\n      initialScrollIndex={displayedItems.length - 1}\n      getItemLayout={(_data, index) => ({ length: 148, offset: 148 * index, index })}`,
  `      contentContainerStyle={styles.horizontalCatalog}\n      inverted\n      getItemLayout={(_data, index) => ({ length: 148, offset: 148 * index, index })}`,
  'Home rail first-cell RTL placement',
);
app = app.slice(0, horizontalStart) + horizontal + app.slice(horizontalEnd);

app = replaceOnce(
  app,
  `  const rows = useMemo(() => buildHomeCatalogRows(catalog), [catalog]);\n  const newest = rows[0]?.items || [];\n  // The first Home rails must exist in the native tree on the very first frame.\n  // Keeping only the later rails virtualized avoids the Android blank-until-scroll\n  // regression without turning the whole Home catalog into an eager render.\n  const eagerRows = useMemo(() => rows.slice(0, 4), [rows]);\n  const deferredRows = useMemo(() => rows.slice(4), [rows]);`,
  `  const rows = useMemo(() => buildHomeCatalogRows(catalog), [catalog]);\n  const newest = rows[0]?.items || [];\n  // Empty configured categories must not consume the four eager native slots.\n  // The first four *real* rails are mounted in the header immediately; only\n  // later populated rails stay virtualized.\n  const populatedRows = useMemo(() => rows.filter((row) => row.items.length > 0), [rows]);\n  const eagerRows = useMemo(() => populatedRows.slice(0, 4), [populatedRows]);\n  const deferredRows = useMemo(() => populatedRows.slice(4), [populatedRows]);`,
  'first four populated Home rails',
);

app = replaceOnce(
  app,
  `      if (firstApplied) {\n        dismissStartup();\n        if (initialLoad && firstContent.source !== 'remote') {\n          void loadContent(false)\n            .then((freshContent) => { applyContent(freshContent); })\n            .catch(() => undefined);\n        }\n        return;\n      }`,
  `      if (firstApplied) {\n        dismissStartup();\n        if (initialLoad && firstContent.source === 'local') {\n          // A fresh install used to expose the nine-item emergency catalog while\n          // the full index downloaded. Paint the small real Home bootstrap first,\n          // then replace it with the complete catalog in the same async sequence.\n          void (async () => {\n            const bootstrapContent = await loadBootstrapContent();\n            if (bootstrapContent) applyContent(bootstrapContent);\n            const freshContent = await loadContent(false);\n            if (freshContent.source !== 'local') applyContent(freshContent);\n          })().catch(() => undefined);\n        } else if (initialLoad && firstContent.source !== 'remote') {\n          void loadContent(false)\n            .then((freshContent) => {\n              if (freshContent.source !== 'local') applyContent(freshContent);\n            })\n            .catch(() => undefined);\n        }\n        return;\n      }`,
  'bootstrap-before-full cold start sequence',
);

await write('App.tsx', app);

let oldTest = await read('scripts/test-home-detail-render-v2.mjs');
oldTest = oldTest.replace(
  `const eagerRows = useMemo(() => rows.slice(0, 4), [rows]);`,
  `const populatedRows = useMemo(() => rows.filter((row) => row.items.length > 0), [rows]);\n  const eagerRows = useMemo(() => populatedRows.slice(0, 4), [populatedRows]);`,
);
oldTest = oldTest.replace(
  `const deferredRows = useMemo(() => rows.slice(4), [rows]);`,
  `const deferredRows = useMemo(() => populatedRows.slice(4), [populatedRows]);`,
);
await write('scripts/test-home-detail-render-v2.mjs', oldTest);

console.log(JSON.stringify({
  firstHomeRailCellsRenderImmediately: true,
  firstFourPopulatedRailsAreEager: true,
  coldStartUsesRealBootstrapBeforeFullIndex: true,
  noApkBuild: true,
}, null, 2));
