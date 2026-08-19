import fs from 'node:fs';

const appPath = 'App.tsx';
const servicePath = 'src/contentService.ts';
let app = fs.readFileSync(appPath, 'utf8');
let service = fs.readFileSync(servicePath, 'utf8');

const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing anchor for ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
};

// 1) Detail hero: never paint the portrait poster as a temporary backdrop.
// That was the visible "background image changes after opening" in the device video.
app = replaceOnce(
  app,
  '<CatalogArtwork primary={item.backdrop} fallback={item.poster} preview={item.poster} style={StyleSheet.absoluteFill} contentFit="cover" imageKind="backdrop" />',
  '<CatalogArtwork primary={item.backdrop || item.backdropFallback || item.poster} fallback={item.backdropFallback || item.poster} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} imageKind="backdrop" />',
  'stable detail hero artwork',
);

// 2) Cold online start: current revision-bound bootstrap must win before any
// multi-megabyte persisted index is read/parsed on the JS thread.
const startupStart = app.indexOf('      let foregroundBootstrapUsed = false;');
const startupEnd = app.indexOf('      const firstApplied = applyContent(firstContent);', startupStart);
if (startupStart < 0 || startupEnd < 0) throw new Error('Missing startup selection block');
const newStartupSelection = `      let foregroundBootstrapUsed = false;\n      let firstContent: LoadedContent;\n\n      if (initialLoad && online) {\n        // A true cold start must never parse the previous multi-megabyte cache\n        // before asking for the current revision-bound bootstrap. That old path\n        // blocked Android's JS thread and could reveal an older Home after Splash.\n        let bootstrapContent: LoadedContent | null = null;\n        try {\n          bootstrapContent = await loadBootstrapContent();\n        } catch {\n          bootstrapContent = null;\n        }\n\n        if (bootstrapContent?.items.length) {\n          startupFallbackContentRef.current = bootstrapContent;\n          if (applyContent(bootstrapContent)) {\n            dismissStartup();\n            // The bootstrap already contains the complete navigation catalog.\n            // Fetch/parse the larger index only after first paint and bypass the\n            // old disk cache entirely; merge it without rebuilding visible rails.\n            InteractionManager.runAfterInteractions(() => {\n              void loadContent(false, true)\n                .then((freshContent) => {\n                  if (freshContent.source === 'remote') applyBackgroundFullContent(freshContent);\n                })\n                .catch(() => undefined);\n            });\n            return;\n          }\n        }\n\n        // If bootstrap mirrors are unavailable, try source truth directly. Only\n        // after both current-network paths fail may the old disk cache be parsed.\n        try {\n          const freshContent = await loadContent(false, true);\n          if (freshContent.source === 'remote' && applyContent(freshContent)) {\n            dismissStartup();\n            return;\n          }\n        } catch {\n          // Persisted cache is the emergency offline fallback below.\n        }\n        firstContent = await loadContent(true);\n      } else if (!initialLoad && force && online) {\n        const bootstrapContent = await loadBootstrapContent();\n        if (bootstrapContent?.items.length) {\n          firstContent = bootstrapContent;\n          foregroundBootstrapUsed = true;\n        } else {\n          firstContent = await loadContent(false);\n        }\n      } else {\n        firstContent = await loadContent(initialLoad);\n      }\n\n`;
app = app.slice(0, startupStart) + newStartupSelection + app.slice(startupEnd);

// 3) Summary/index rows already contain a small cast preview. Keep it instead
// of discarding people until the one-title detail shard finishes downloading.
const summaryPeopleHelper = `const normalizeSummaryPeoplePreview = (value: unknown, ownerId: string): CatalogPerson[] => {\n  if (!Array.isArray(value)) return [];\n  const output: CatalogPerson[] = [];\n  const seen = new Set<string>();\n  for (const raw of value.slice(0, 12)) {\n    if (!raw || typeof raw !== 'object') continue;\n    const person = raw as Record<string, unknown>;\n    const role = normalizePersonRole(\n      person.role ?? person.job ?? person.roleLabel ?? person.role_label ?? person.department,\n      null,\n    );\n    if (!role) continue;\n    const nameFa = asString(person.nameFa ?? person.name_fa ?? person.name ?? person.title);\n    const name = asString(person.name ?? person.nameFa ?? person.name_fa ?? person.title, nameFa);\n    if (!nameFa && !name) continue;\n    const tmdbId = asNumber(person.tmdbId ?? person.tmdb_id, 0);\n    const rawId = asString(person.id ?? person.personId ?? person.person_id ?? person.tmdbId ?? person.tmdb_id);\n    const normalizedName = (name || nameFa).toLowerCase().normalize('NFKC').replace(/[^a-z0-9\\u0600-\\u06ff]+/g, '-');\n    const id = rawId\n      ? (rawId.startsWith(\`\${role}-\`) ? rawId : \`\${role}-\${rawId}\`)\n      : \`\${role}-summary-\${ownerId}-\${normalizedName}\`;\n    const identity = tmdbId > 0 ? \`\${role}:tmdb:\${tmdbId}\` : \`\${role}:name:\${normalizedName}\`;\n    if (seen.has(identity)) continue;\n    seen.add(identity);\n    const source = asString(person.source).toLowerCase() === 'tmdb' || tmdbId > 0 ? 'tmdb' : 'upera';\n    const image = normalizePersonImage(\n      person.image ?? person.profile_path ?? person.profilePath ?? person.photo ?? person.avatar,\n      source,\n    );\n    output.push({\n      id,\n      nameFa: nameFa || name,\n      ...(name ? { name } : {}),\n      role,\n      roleLabel: asString(person.roleLabel ?? person.role_label, role === 'director' ? 'کارگردان' : 'بازیگر'),\n      ...(image ? { image } : {}),\n      ...(tmdbId > 0 ? { tmdbId } : {}),\n      ...(source ? { source } : {}),\n      order: asNumber(person.order ?? person.castOrder ?? person.cast_order, output.length),\n    });\n    if (output.length >= 8) break;\n  }\n  return output;\n};\n\n`;
if (!service.includes('const normalizeSummaryPeoplePreview =')) {
  const anchor = 'const personSourceEntries = (';
  const at = service.indexOf(anchor);
  if (at < 0) throw new Error('Missing summary-people insertion anchor');
  service = service.slice(0, at) + summaryPeopleHelper + service.slice(at);
}

service = replaceOnce(
  service,
  `    const summaryDownloads = Array.isArray(item.downloads)\n      ? normalizeDownloads(item.downloads, iranian)\n      : [];\n    const rawSummaryStreamUrl = asString(item.streamUrl);`,
  `    const summaryDownloads = Array.isArray(item.downloads)\n      ? normalizeDownloads(item.downloads, iranian)\n      : [];\n    const summaryPeople = normalizeSummaryPeoplePreview(item.people, id);\n    const rawSummaryStreamUrl = asString(item.streamUrl);`,
  'summary people declaration',
);
service = replaceOnce(
  service,
  `      overview: asString(item.overview),\n      genres: stringArray(item.genres),\n      ...(Number.isFinite(rate) ? { rate } : {}),`,
  `      overview: asString(item.overview),\n      genres: stringArray(item.genres),\n      ...(summaryPeople.length ? { people: summaryPeople } : {}),\n      ...(Number.isFinite(rate) ? { rate } : {}),`,
  'summary people return',
);

// 4) A forced network read must not parse the old disk catalog first.
service = replaceOnce(
  service,
  `  await readCacheMetadata();\n  const cached = await readCachedContent();\n  let manifest: RemoteCatalogManifest | null = null;`,
  `  await readCacheMetadata();\n  const cached = forceRemote ? null : await readCachedContent();\n  let manifest: RemoteCatalogManifest | null = null;`,
  'force remote cache bypass',
);

// Bootstrap needs only tiny metadata so it can reject a manifest that is older
// than the last catalog this device already accepted.
service = replaceOnce(
  service,
  `export async function loadBootstrapContent(): Promise<LoadedContent | null> {\n  const remoteUrl = REMOTE_CONTENT_BOOTSTRAP_URL.trim();\n  if (!remoteUrl) return null;`,
  `export async function loadBootstrapContent(): Promise<LoadedContent | null> {\n  const remoteUrl = REMOTE_CONTENT_BOOTSTRAP_URL.trim();\n  if (!remoteUrl) return null;\n  await readCacheMetadata();`,
  'bootstrap metadata freshness gate',
);

const revisionAnchor = `      const revision = asString(record.revision);\n      if (!revision) return null;\n      return {`;
const revisionReplacement = `      const revision = asString(record.revision);\n      if (!revision) return null;\n      const candidateUpdatedAt = asString(record.catalogUpdatedAt ?? record.updatedAt);\n      const cachedUpdatedAt = asString(cacheMetadata.catalogUpdatedAt);\n      if (candidateUpdatedAt && cachedUpdatedAt) {\n        const candidateTime = Date.parse(candidateUpdatedAt);\n        const cachedTime = Date.parse(cachedUpdatedAt);\n        if (Number.isFinite(candidateTime) && Number.isFinite(cachedTime) && candidateTime < cachedTime) {\n          return null;\n        }\n      }\n      return {`;
service = replaceOnce(service, revisionAnchor, revisionReplacement, 'manifest downgrade guard');
service = service.replace(
  `new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),`,
  `new Promise<null>((resolve) => setTimeout(() => resolve(null), 2200)),`,
);
service = service.replace(
  '// preference window; a blocked Raw host must never add seconds to cold start.',
  '// truth window; a stale CDN manifest must never beat a healthy Raw response.',
);

fs.writeFileSync(appPath, app);
fs.writeFileSync(servicePath, service);

const regression = `import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport test from 'node:test';\n\nconst app = fs.readFileSync('App.tsx','utf8');\nconst service = fs.readFileSync('src/contentService.ts','utf8');\n\ntest('online cold start asks for current bootstrap before any persisted full-index fallback', () => {\n  const start = app.indexOf('if (initialLoad && online)');\n  const end = app.indexOf('const firstApplied = applyContent(firstContent);', start);\n  const block = app.slice(start, end);\n  assert.ok(start >= 0 && end > start);\n  assert.ok(block.indexOf('await loadBootstrapContent()') >= 0);\n  assert.ok(block.indexOf('await loadBootstrapContent()') < block.indexOf('firstContent = await loadContent(true)'));\n  assert.ok(block.includes('loadContent(false, true)'));\n  assert.ok(block.includes('InteractionManager.runAfterInteractions'));\n});\n\ntest('forced current-index fetch bypasses full persisted cache parsing', () => {\n  assert.ok(service.includes('const cached = forceRemote ? null : await readCachedContent();'));\n});\n\ntest('manifest cannot downgrade below already accepted catalog and Raw gets bounded truth window', () => {\n  assert.ok(service.includes('candidateTime < cachedTime'));\n  assert.ok(service.includes('setTimeout(() => resolve(null), 2200)'));\n});\n\ntest('summary rows preserve a small people preview for first detail paint', () => {\n  assert.ok(service.includes('const normalizeSummaryPeoplePreview ='));\n  assert.ok(service.includes('const summaryPeople = normalizeSummaryPeoplePreview(item.people, id);'));\n  assert.ok(service.includes('...(summaryPeople.length ? { people: summaryPeople } : {})'));\n  assert.ok(service.includes('if (output.length >= 8) break;'));\n});\n\ntest('detail hero never paints poster as a temporary backdrop', () => {\n  assert.ok(!app.includes('fallback={item.poster} preview={item.poster} style={StyleSheet.absoluteFill}'));\n  assert.ok(app.includes('primary={item.backdrop || item.backdropFallback || item.poster}'));\n  assert.ok(app.includes('fallback={item.backdropFallback || item.poster}'));\n});\n`;
fs.mkdirSync('scripts/tests', { recursive: true });
fs.writeFileSync('scripts/tests/device-root-v37.test.mjs', regression);
console.log('Applied device root fix v37');
