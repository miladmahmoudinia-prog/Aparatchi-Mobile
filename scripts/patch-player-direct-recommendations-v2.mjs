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
const helper = [
  `  const playRecommendedMovieInsidePlayer = async (summary: CatalogItem) => {`,
  `    if (summary.type !== 'movie') return;`,
  ``,
  `    if (!(await internetIsReachable())) {`,
  `      Alert.alert('اتصال اینترنت برقرار نیست', 'برای پخش آنلاین، اینترنت را روشن کنید و دوباره تلاش کنید.');`,
  `      return;`,
  `    }`,
  `    if (await refreshVpnState()) { setVpnWarningVisible(true); return; }`,
  ``,
  `    let item = summary;`,
  `    if (summary.detailPath && summary.detailLoaded !== true) {`,
  `      const hydrated = await loadCatalogItemDetail(summary).catch(() => null);`,
  `      if (hydrated) item = hydrated;`,
  `    }`,
  ``,
  `    const versions = playableVersionsFor(item, null);`,
  `    if (!versions.length) {`,
  `      Alert.alert('پخش آنلاین', 'برای این پیشنهاد لینک پخش آنلاین قابل استفاده پیدا نشد.');`,
  `      return;`,
  `    }`,
  ``,
  `    // Keep the current language when possible, then prefer Persian dub, then`,
  `    // subtitle. No detail-page navigation and no extra version chooser: one tap`,
  `    // switches the existing player directly to the recommended movie.`,
  `    const currentLanguage = videoRequest?.language;`,
  `    const version =`,
  `      (currentLanguage ? versions.find((candidate) => candidate.language === currentLanguage) : undefined) ||`,
  `      versions.find((candidate) => candidate.language === 'dubbed') ||`,
  `      versions.find((candidate) => candidate.language === 'subtitled') ||`,
  `      versions[0];`,
  ``,
  `    setSelectedPerson(null);`,
  `    // Keep the recommended detail behind the modal so closing the player returns`,
  `    // to the movie that is actually playing, without visibly navigating first.`,
  `    setSelectedItem(item);`,
  `    setVideoRequest({`,
  "      title: `${item.nameFa || item.name} — ${version.label}` ,",
  `      sources: version.sources,`,
  `      initialSourceId: version.defaultSource.id,`,
  "      resumeKey: `${item.id}:main:${version.language || 'direct'}` ,",
  `      itemId: item.id,`,
  `      artwork: item.backdrop || item.poster,`,
  `      language: version.language,`,
  `      resumeAt: 0,`,
  `    });`,
  `  };`,
  ``,
].join('\n');
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
