import fs from 'node:fs/promises';

const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one old marker, found ${count}`);
  return source.replace(before, after);
};

let app = await fs.readFile('App.tsx', 'utf8');
let service = await fs.readFile('src/contentService.ts', 'utf8');
let startupTest = await fs.readFile('scripts/test-startup-projectionist.mjs', 'utf8');

app = replaceOnce(
  app,
  `      const firstContent = await loadContent(initialLoad);\n      const firstApplied = applyContent(firstContent);`,
  `      const firstContent = await loadContent(initialLoad);\n\n      // On an online cold start, a persisted catalog is only a fallback. Never\n      // commit it behind the five-second cover and then reveal stale Home rows.\n      // Resolve the current Raw-first bootstrap first; the complete index starts\n      // at the same time and replaces bootstrap as soon as it is ready.\n      if (initialLoad && online && firstContent.source !== 'remote') {\n        const freshContentPromise = loadContent(false);\n        const bootstrapContent = await loadBootstrapContent();\n        const currentBootstrapApplied = Boolean(bootstrapContent && applyContent(bootstrapContent));\n\n        if (!currentBootstrapApplied) applyContent(firstContent);\n        dismissStartup();\n\n        void freshContentPromise\n          .then((freshContent) => {\n            if (freshContent.source !== 'local') applyContent(freshContent);\n          })\n          .catch(() => undefined);\n        return;\n      }\n\n      const firstApplied = applyContent(firstContent);`,
  'online startup stale-cache gate',
);

app = replaceOnce(
  app,
  `    startupFallbackTimer = setTimeout(dismissStartup, 5000);`,
  `    // Five seconds is the normal minimum, not permission to reveal stale data.\n    // The Raw-first bootstrap has bounded failover; this ten-second timer is only\n    // an emergency escape for a broken network stack.\n    startupFallbackTimer = setTimeout(dismissStartup, 10000);`,
  'startup emergency fallback',
);

app = replaceOnce(
  app,
  `                    {!vpnActive && (hasPlayableStream || primaryOperatorPlayFile) ? <Pressable onPress={() => hasPlayableStream ? onStream(item) : primaryOperatorPlayFile && onOperatorOpen(item, primaryOperatorPlayFile)} style={[styles.watchButton, !hasPlayableStream && styles.operatorWatchButton]}>`,
  `                    {(hasPlayableStream || primaryOperatorPlayFile) ? <Pressable onPress={() => hasPlayableStream ? onStream(item) : primaryOperatorPlayFile && onOperatorOpen(item, primaryOperatorPlayFile)} style={[styles.watchButton, !hasPlayableStream && styles.operatorWatchButton]}>`,
  'loading-detail play action visibility',
);

app = replaceOnce(
  app,
  `              {item.type === 'movie' && !vpnActive && (hasPlayableStream || primaryOperatorPlayFile) ? <Pressable onPress={() => hasPlayableStream ? onStream(item) : primaryOperatorPlayFile && onOperatorOpen(item, primaryOperatorPlayFile)} style={[styles.watchButton, !hasPlayableStream && styles.operatorWatchButton]}>`,
  `              {item.type === 'movie' && (hasPlayableStream || primaryOperatorPlayFile) ? <Pressable onPress={() => hasPlayableStream ? onStream(item) : primaryOperatorPlayFile && onOperatorOpen(item, primaryOperatorPlayFile)} style={[styles.watchButton, !hasPlayableStream && styles.operatorWatchButton]}>`,
  'ready-detail play action visibility',
);

const bootstrapStart = service.indexOf('export async function loadBootstrapContent(): Promise<LoadedContent | null> {');
const bootstrapEnd = service.indexOf('\nconst readCachedContent = async', bootstrapStart);
if (bootstrapStart < 0 || bootstrapEnd < 0) throw new Error('bootstrap loader block not found');
const bootstrapBlock = service.slice(bootstrapStart, bootstrapEnd);
const freshBootstrapBlock = [
  'export async function loadBootstrapContent(): Promise<LoadedContent | null> {',
  '  const remoteUrl = REMOTE_CONTENT_BOOTSTRAP_URL.trim();',
  '  if (!remoteUrl) return null;',
  '  const candidates = [...remoteRepositoryUrlCandidates(remoteUrl)].sort((a, b) =>',
  '    Number(/raw\\.githubusercontent\\.com/i.test(b)) - Number(/raw\\.githubusercontent\\.com/i.test(a))',
  '  );',
  '  if (!candidates.length) return null;',
  '',
  '  // Bootstrap decides what the user sees when the five-second cover disappears.',
  '  // Prefer GitHub Raw source truth and use CDN only as bounded failover; racing',
  '  // mirrors allowed an older jsDelivr object to win even while Raw was current.',
  '  for (const candidate of candidates) {',
  '    const controller = new AbortController();',
  '    const timeout = setTimeout(() => controller.abort(), 3200);',
  "    const separator = candidate.includes('?') ? '&' : '?';",
  '    try {',
  "      const response = await fetch(candidate + separator + '_aparatchi_bootstrap=' + Date.now(), {",
  "        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },",
  '        signal: controller.signal,',
  '      });',
  '      if (!response.ok) continue;',
  '      const parsed = parsePayload(JSON.parse(await response.text()));',
  "      if (parsed?.items.length) return { ...parsed, source: 'remote' };",
  '    } catch {',
  '      // Try the next mirror.',
  '    } finally {',
  '      clearTimeout(timeout);',
  '    }',
  '  }',
  '  return null;',
  '}',
  '',
].join('\n');
if (!bootstrapBlock.includes('const candidates = [...remoteRepositoryUrlCandidates(remoteUrl)].sort')) {
  service = service.slice(0, bootstrapStart) + freshBootstrapBlock + service.slice(bootstrapEnd);
}

service = replaceOnce(
  service,
  `    for (const candidate of remoteRepositoryUrlCandidates(remoteUrl)) {`,
  `    const catalogCandidates = [...remoteRepositoryUrlCandidates(remoteUrl)].sort((a, b) =>\n      Number(/raw\\.githubusercontent\\.com/i.test(b)) - Number(/raw\\.githubusercontent\\.com/i.test(a))\n    );\n    for (const candidate of catalogCandidates) {`,
  'full catalog Raw-first candidate order',
);

startupTest = replaceOnce(
  startupTest,
  `  'startupFallbackTimer = setTimeout(dismissStartup, 5000);',`,
  `  'startupFallbackTimer = setTimeout(dismissStartup, 10000);',`,
  'startup test emergency marker',
);
startupTest = replaceOnce(
  startupTest,
  `  emergencyFallbackMs: 5000,`,
  `  emergencyFallbackMs: 10000,`,
  'startup test reported emergency fallback',
);

await fs.writeFile('App.tsx', app);
await fs.writeFile('src/contentService.ts', service);
await fs.writeFile('scripts/test-startup-projectionist.mjs', startupTest);
console.log('Applied visible-media/fresh-startup v7 repair.');
