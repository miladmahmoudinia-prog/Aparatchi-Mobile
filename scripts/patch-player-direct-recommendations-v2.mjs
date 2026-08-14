import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (from, to, label) => {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing patch marker: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Non-unique patch marker: ${label}`);
  source = source.slice(0, index) + to + source.slice(index + from.length);
};

replaceOnce(
  `  onRecommendationSelect: (item: CatalogItem) => void;`,
  `  onRecommendationSelect: (item: CatalogItem) => void | Promise<void>;`,
  'recommendation callback type',
);

replaceOnce(
  `                    onPress={() => {\n                      setEndRecommendationsDismissed(true);\n                      onRecommendationSelect(recommendation);\n                      closePlayer();\n                    }}`,
  `                    onPress={() => {\n                      const position = Math.max(0, Number(player.currentTime || latestTimeRef.current || 0));\n                      const safeDuration = Math.max(0, Number(player.duration || latestDurationRef.current || 0));\n                      onProgress(request, position, safeDuration, false);\n                      setEndRecommendationsDismissed(true);\n                      void onRecommendationSelect(recommendation);\n                    }}`,
  'recommendation press action',
);

const insertBefore = `  const playDownloadedRecord = (record: DownloadRecord) => {`;
const helper = `  const playRecommendedMovieInsidePlayer = async (summary: CatalogItem) => {\n    if (summary.type !== 'movie') return;\n\n    if (!(await internetIsReachable())) {\n      Alert.alert('اتصال اینترنت برقرار نیست', 'برای پخش آنلاین، اینترنت را روشن کنید و دوباره تلاش کنید.');\n      return;\n    }\n    if (await refreshVpnState()) { setVpnWarningVisible(true); return; }\n\n    let item = summary;\n    if (summary.detailPath && summary.detailLoaded !== true) {\n      const hydrated = await loadCatalogItemDetail(summary).catch(() => null);\n      if (hydrated) item = hydrated;\n    }\n\n    const versions = playableVersionsFor(item, null);\n    if (!versions.length) {\n      Alert.alert('پخش آنلاین', 'برای این پیشنهاد لینک پخش آنلاین قابل استفاده پیدا نشد.');\n      return;\n    }\n\n    // Keep the current language when possible, then prefer Persian dub, then\n    // subtitle. No detail-page navigation and no extra version chooser: one tap\n    // switches the existing player directly to the recommended movie.\n    const currentLanguage = videoRequest?.language;\n    const version =\n      (currentLanguage ? versions.find((candidate) => candidate.language === currentLanguage) : undefined) ||\n      versions.find((candidate) => candidate.language === 'dubbed') ||\n      versions.find((candidate) => candidate.language === 'subtitled') ||\n      versions[0];\n\n    setSelectedPerson(null);\n    // Keep the recommended detail behind the modal so closing the player returns\n    // to the movie that is actually playing, without visibly navigating first.\n    setSelectedItem(item);\n    setVideoRequest({\n      title: \`${item.nameFa || item.name} — \${version.label}\`,\n      sources: version.sources,\n      initialSourceId: version.defaultSource.id,\n      resumeKey: \`${item.id}:main:\${version.language || 'direct'}\`,\n      itemId: item.id,\n      artwork: item.backdrop || item.poster,\n      language: version.language,\n      resumeAt: 0,\n    });\n  };\n\n`;
replaceOnce(insertBefore, helper + insertBefore, 'direct recommendation helper insertion');

replaceOnce(
  `          onRecommendationSelect={(nextItem) => {\n            setSelectedPerson(null);\n            setSelectedItem(nextItem);\n          }}`,
  `          onRecommendationSelect={(nextItem) => playRecommendedMovieInsidePlayer(nextItem)}`,
  'root recommendation callback',
);

await fs.writeFile(path, source);
console.log(JSON.stringify({
  closesPlayerOnRecommendation: false,
  navigatesToDetailBeforePlayback: false,
  hydratesRecommendation: true,
  directPlayback: true,
  keepsCurrentLanguageWhenPossible: true,
}, null, 2));
