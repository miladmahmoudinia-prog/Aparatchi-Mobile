import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const write = (path, content) => fs.writeFile(path, content, 'utf8');
const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};

let app = await read('App.tsx');

app = replaceOnce(
  app,
  `  const safe = conflictedUrls.size\n    ? prepared.filter((file) => !conflictedUrls.has(String(file.url || '').trim()))\n    : prepared;`,
  `  const safe = conflictedUrls.size\n    ? (() => {\n        const result: DownloadFile[] = [];\n        const emitted = new Set<string>();\n        for (const file of prepared) {\n          const url = String(file.url || '').trim();\n          if (!conflictedUrls.has(url)) {\n            result.push(file);\n            continue;\n          }\n          if (emitted.has(url)) continue;\n          const sameUrl = prepared.filter((candidate) => String(candidate.url || '').trim() === url);\n          const representative = sameUrl.find((candidate) => String(candidate.mode || 'download') === 'download')\n            || sameUrl.find((candidate) => String(candidate.mode || '') === 'play')\n            || file;\n          if (representative !== file) continue;\n          emitted.add(url);\n          // Conflicting language metadata is ambiguous, but the media itself is\n          // still real. Keep one neutral row rather than making play/download vanish.\n          result.push({ ...representative, language: undefined });\n        }\n        return result;\n      })()\n    : prepared;`,
  'preserve conflicted media neutrally',
);

app = replaceOnce(
  app,
  `  const downloadGroups = detailBodyReady ? item.downloads || [] : [];`,
  `  // Movie summaries now carry a compact actionable media preview. Do not hide\n  // those real links while the richer detail shard is still hydrating.\n  const downloadGroups = item.downloads || [];`,
  'allow summary download groups before hydration',
);

app = replaceOnce(
  app,
  `  const hasPlayableStream = detailBodyReady ? playableVersionsFor(item).length > 0 : false;`,
  `  const hasPlayableStream = playableVersionsFor(item).length > 0;`,
  'allow summary playback before hydration',
);

const oldPreparing = `                <View style={styles.detailPreparing}>\n                  <ActivityIndicator color={COLORS.gold} size=\"small\" />\n                  <Text style={styles.detailPreparingText}>در حال آماده‌کردن پخش و قسمت‌ها…</Text>\n                </View>`;
const newPreparing = `                {item.type === 'movie' && (hasPlayableStream || primaryOperatorPlayFile || hasDownloads) ? (\n                  <View style={styles.detailActions}>\n                    {!vpnActive && (hasPlayableStream || primaryOperatorPlayFile) ? <Pressable onPress={() => hasPlayableStream ? onStream(item) : primaryOperatorPlayFile && onOperatorOpen(item, primaryOperatorPlayFile)} style={[styles.watchButton, !hasPlayableStream && styles.operatorWatchButton]}><Ionicons name={hasPlayableStream ? 'play' : 'phone-portrait-outline'} color=\"#fff\" size={19} /><Text style={styles.watchButtonText}>{hasPlayableStream ? 'پخش آنلاین' : 'پخش با اینترنت همراه'}</Text></Pressable> : null}\n                    {hasDownloads ? (\n                      <Pressable onPress={() => { setDownloadInitialGroup(null); setDownloadSheetOpen(true); }} style={styles.detailDownloadAction}>\n                        <Ionicons name=\"download-outline\" color={COLORS.gold} size={19} />\n                        <Text style={styles.detailDownloadActionText}>دانلود</Text>\n                      </Pressable>\n                    ) : null}\n                    <Pressable onPress={() => void shareCatalogItem(item)} style={styles.detailSecondaryButton}><Ionicons name=\"share-social-outline\" color={COLORS.text} size={20} /></Pressable>\n                  </View>\n                ) : (\n                  <View style={styles.detailPreparing}>\n                    <ActivityIndicator color={COLORS.gold} size=\"small\" />\n                    <Text style={styles.detailPreparingText}>در حال آماده‌کردن پخش و قسمت‌ها…</Text>\n                  </View>\n                )}`;
app = replaceOnce(app, oldPreparing, newPreparing, 'show movie actions from compact summary');

app = replaceOnce(
  app,
  `  if (hasBundledCatalog) {\n    initialRefreshTimer = setTimeout(reloadContentWhenIdle, 650);\n  } else {\n    void reloadContent();\n  }\n  startupFallbackTimer = setTimeout(dismissStartup, 5000);`,
  `  if (hasBundledCatalog) {\n    // The emergency catalog already exists synchronously, so start its real\n    // bootstrap refresh immediately. Waiting for InteractionManager here made\n    // the 5-second anti-stuck timer become the normal first-install path.\n    void reloadContent(false);\n  } else {\n    void reloadContent();\n  }\n  startupFallbackTimer = setTimeout(dismissStartup, 2000);`,
  'remove first-install idle gate',
);

await write('App.tsx', app);

let startupTest = await read('scripts/test-startup-projectionist.mjs');
startupTest = replaceOnce(
  startupTest,
  `  'startupFallbackTimer = setTimeout(dismissStartup, 5000);',`,
  `  'startupFallbackTimer = setTimeout(dismissStartup, 2000);',`,
  'startup fallback marker',
);
startupTest = replaceOnce(
  startupTest,
  `  emergencyFallbackMs: 5000,`,
  `  emergencyFallbackMs: 2000,`,
  'startup fallback report',
);
await write('scripts/test-startup-projectionist.mjs', startupTest);

console.log(JSON.stringify({
  firstInstallRefreshStartsImmediately: true,
  startupFallbackMs: 2000,
  movieActionsCanUseSummaryMedia: true,
  contradictoryMediaRemainsNeutralAndUsable: true,
  noApkBuild: true,
}, null, 2));
