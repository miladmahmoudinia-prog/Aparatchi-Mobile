import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const write = (path, value) => fs.writeFile(path, value, 'utf8');

function mustReplace(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Missing patch target: ${label}`);
  return text.replace(before, after);
}

function replaceBetween(text, start, end, replacement, label) {
  const a = text.indexOf(start);
  if (a < 0) throw new Error(`Missing start marker: ${label}`);
  const b = text.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`Missing end marker: ${label}`);
  return text.slice(0, a) + replacement + text.slice(b);
}

let source = await read('App.tsx');

// Upera exposes Persian dubbed/subtitled variants. Never manufacture a third
// "original" version from an unlabeled row. Reconcile the ambiguity once and
// feed the same normalized files to both playback and download UI.
source = replaceBetween(
  source,
  'const playableVersionsFor = (',
  '\nconst isEpisodeSection = (group: DownloadSection) =>',
  `const reconcileUperaMediaFiles = (files: DownloadFile[]): DownloadFile[] => {
  const prepared = files.map((file) => ({ ...file }));
  const explicit = new Set<MediaLanguage>(
    prepared
      .map((file) => file.language)
      .filter((language): language is MediaLanguage => language === 'dubbed' || language === 'subtitled'),
  );
  const hasUnknown = prepared.some((file) => !file.language);
  if (!hasUnknown) return prepared;

  if (explicit.has('dubbed') && explicit.has('subtitled')) {
    // A third unlabeled quality beside both real Upera variants is a stale or
    // duplicate row, not an "original" edition.
    return prepared.filter((file) => file.language === 'dubbed' || file.language === 'subtitled');
  }

  if (explicit.size === 1) {
    const known = [...explicit][0];
    const counterpart: MediaLanguage = known === 'dubbed' ? 'subtitled' : 'dubbed';
    return prepared.map((file) => file.language ? file : { ...file, language: counterpart });
  }

  return prepared;
};

const filesWithSectionLanguage = (sections: DownloadSection[]) =>
  sections.flatMap((section) => {
    const hint = section.language === 'dubbed' || section.language === 'subtitled'
      ? section.language
      : undefined;
    return (section.files || []).map((file) =>
      file.language || !hint ? file : { ...file, language: hint },
    );
  });

const playableVersionsFor = (
  item: CatalogItem,
  episodeGroup?: DownloadSection | null,
): PlayableVersion[] => {
  const latestGroup = item.type === 'series' ? newestEpisodeGroup(item) : null;
  const targetSections = episodeGroup
    ? [episodeGroup]
    : item.type === 'series'
      ? (latestGroup ? [latestGroup] : [])
      : (item.downloads || []).filter((group) => !isEpisodeSection(group));

  const files = reconcileUperaMediaFiles(filesWithSectionLanguage(targetSections));
  const versions: PlayableVersion[] = LANGUAGE_ORDER.flatMap((language) => {
    const sources = playbackSourcesForFiles(files.filter((file) => file.language === language));
    if (!sources.length) return [];
    return [{
      language,
      label: languageTitle(language),
      sources,
      defaultSource: defaultPlaybackSource(sources),
    }];
  });

  const unlabeledSources = playbackSourcesForFiles(files.filter((file) => !file.language));
  if (unlabeledSources.length) {
    versions.push({
      label: 'پخش آنلاین',
      sources: unlabeledSources,
      defaultSource: defaultPlaybackSource(unlabeledSources),
    });
  }

  if (versions.length) return versions;

  if (
    item.streamUrl &&
    isSafeHttpUrl(item.streamUrl) &&
    isDirectMediaUrl(item.streamUrl) &&
    !isPlaceholderUrl(item.streamUrl)
  ) {
    const source: PlaybackSource = {
      id: \`stream-\${item.id}\`,
      url: item.streamUrl,
      quality: /\\.m3u8(?:$|[?#])/i.test(item.streamUrl) ? 'خودکار' : 'پخش آنلاین',
      rank: 0,
    };
    const languages = itemLanguages(item);
    const language = languages.length === 1 ? languages[0] : undefined;
    return [{
      ...(language ? { language } : {}),
      label: language ? languageTitle(language) : 'پخش آنلاین',
      sources: [source],
      defaultSource: source,
    }];
  }

  return [];
};

const languageSectionsForFiles = (
  files: DownloadFile[],
  idPrefix: string,
  _iranian = false,
): DownloadSection[] => {
  const reconciled = reconcileUperaMediaFiles(files);
  const sections: DownloadSection[] = LANGUAGE_ORDER.flatMap((language) => {
    const languageFiles = sortedDownloadFiles(reconciled.filter((file) => file.language === language));
    if (!languageFiles.length) return [];
    return [{
      id: \`\${idPrefix}-\${language}\`,
      title: languageTitle(language),
      subtitle: \`\${languageFiles.length} کیفیت دانلود مستقیم\`,
      badge: language === 'dubbed' ? 'دوبله' : 'زیرنویس',
      language,
      files: languageFiles,
    }];
  });

  const plainFiles = sortedDownloadFiles(reconciled.filter((file) => !file.language));
  if (plainFiles.length) {
    sections.push({
      id: \`\${idPrefix}-plain\`,
      title: 'لینک‌های دریافت',
      subtitle: \`\${plainFiles.length} کیفیت دانلود مستقیم\`,
      badge: 'دریافت',
      files: plainFiles,
    });
  }
  return sections;
};
`,
  'shared dubbed/subtitled reconciliation',
);

// The visible episode counter/latest badge must refer to a real playable or
// downloadable episode, not a metadata-only shell.
source = mustReplace(
  source,
  `const newestEpisodeGroup = (item?: CatalogItem | null) =>
  [...(item?.downloads || [])]
    .filter(isEpisodeSection)
    .sort(compareEpisodeGroupsNewestFirst)[0] || null;`,
  `const episodeSectionHasUsableMedia = (group: DownloadSection) =>
  (group.files || []).some((file) => {
    if (!isSafeHttpUrl(file.url) || isPlaceholderUrl(file.url)) return false;
    if (isOperatorFile(file)) return isOperatorPortalUrl(file.url);
    if (downloadModeFor(file) === 'purchase') return false;
    return isDirectMediaUrl(file.url) || isDownloadableMediaUrl(file.url);
  });

const newestEpisodeGroup = (item?: CatalogItem | null) =>
  [...(item?.downloads || [])]
    .filter((group) => isEpisodeSection(group) && episodeSectionHasUsableMedia(group))
    .sort(compareEpisodeGroupsNewestFirst)[0] || null;`,
  'usable latest episode only',
);

// A stale legacy ir flag must never pull The Westies back into Iranian series.
source = mustReplace(
  source,
  `const isIranianItem = (item: CatalogItem) => {
  const language = String(item.originalLanguage || '').toLowerCase();`,
  `const isIranianItem = (item: CatalogItem) => {
  const titleText = normalizeComparableText(\`\${item.nameFa || ''} \${item.name || ''}\`);
  if (titleText.includes('the westies') || titleText.includes('وستی ها') || titleText.includes('وستی‌ها')) return false;
  const language = String(item.originalLanguage || '').toLowerCase();`,
  'The Westies foreign safeguard',
);

// Documentary identity beats secondary narrative genres for known/explicit
// documentaries such as Az Be; generic documentary genre still keeps the old
// narrative guard to avoid turning incorrectly-tagged films into documentaries.
source = replaceBetween(
  source,
  'const isDocumentaryItem = (item: CatalogItem) => {',
  '\nconst isWildlifeDocumentaryItem = (item: CatalogItem) => {',
  `const isDocumentaryItem = (item: CatalogItem) => {
  const title = catalogTitleText(item);
  const genres = catalogGenreText(item);
  const knownDocumentary = hasStandaloneTerm(title, ['از بی', 'از به', 'az be']);
  const explicitDocumentary = Boolean(
    item.isDocumentary === true ||
    item.contentKind === 'documentary' ||
    hasCategory(item, 'documentaries')
  );
  if (knownDocumentary || explicitDocumentary) return true;

  const narrative = hasStandaloneTerm(genres, [
    'درام', 'ترسناک', 'وحشت', 'هیجان انگیز', 'اکشن', 'کمدی', 'عاشقانه', 'خانوادگی',
    'جنایی', 'ماجراجویی', 'علمی تخیلی', 'فانتزی',
    'drama', 'horror', 'thriller', 'action', 'comedy', 'romance', 'family', 'crime',
    'adventure', 'science fiction', 'sci-fi', 'fantasy',
  ]);
  if (narrative) return false;
  return item.genres.some((genre) => /مستند|documentary/i.test(genre));
};
`,
  'documentary identity precedence',
);

// Remove delayed post-layout scrolling that visibly left the Stars rail in the
// middle before jumping. Keep the safe reversed-data (non-inverted) strategy,
// but start at the physical end on the very first native layout.
source = mustReplace(
  source,
  `  const [selectedId, setSelectedId] = useState('');
  const peopleRailRef = useRef<FlatList<FeaturedPerson>>(null);
  const worksRailRef = useRef<FlatList<CatalogItem>>(null);`,
  `  const [selectedId, setSelectedId] = useState('');`,
  'remove Stars delayed scroll refs',
);
source = mustReplace(
  source,
  `  useEffect(() => {
    if (!displayedPeople.length) return;
    const frame = requestAnimationFrame(() => peopleRailRef.current?.scrollToEnd({ animated: false }));
    const retry = setTimeout(() => peopleRailRef.current?.scrollToEnd({ animated: false }), 90);
    return () => { cancelAnimationFrame(frame); clearTimeout(retry); };
  }, [displayedPeople.length]);

  useEffect(() => {
    if (!selectedIdForRender) return;
    const frame = requestAnimationFrame(() => {
      worksRailRef.current?.scrollToEnd({ animated: false });
    });
    const retry = setTimeout(() => worksRailRef.current?.scrollToEnd({ animated: false }), 80);
    return () => { cancelAnimationFrame(frame); clearTimeout(retry); };
  }, [selectedIdForRender]);`,
  ``,
  'remove Stars delayed scroll effects',
);
source = mustReplace(
  source,
  `      <FlatList
        ref={peopleRailRef}
        horizontal
        style={styles.starPeopleRail}
        data={displayedPeople}`,
  `      <FlatList
        horizontal
        style={styles.starPeopleRail}
        data={displayedPeople}
        contentOffset={{ x: displayedPeople.length * 66, y: 0 }}`,
  'Stars initial physical-end offset',
);
source = mustReplace(
  source,
  `        <FlatList
          ref={worksRailRef}
          horizontal
          style={styles.starWorksRail}
          data={displayedWorks}`,
  `        <FlatList
          horizontal
          style={styles.starWorksRail}
          data={displayedWorks}
          contentOffset={{ x: displayedWorks.length * 113, y: 0 }}`,
  'Star works initial physical-end offset',
);

// Remove the deliberate black 150ms cover. Tab state now changes immediately;
// lists/images already use their own placeholders and cached rendering.
source = mustReplace(
  source,
  `  const routeTransitionOpacity = useRef(new Animated.Value(0)).current;
  const routeTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
`,
  ``,
  'remove black route transition state',
);
source = replaceBetween(
  source,
  '  const navigateToTab = useCallback((tab: MainTab) => {',
  '\n  const refreshVpnState = async (showProgress = false) => {',
  `  const navigateToTab = useCallback((tab: MainTab) => {
    if (activeTabRef.current === tab) return;
    activeTabRef.current = tab;
    setActiveTab(tab);
  }, []);
`,
  'immediate tab navigation',
);
source = mustReplace(
  source,
  `      <Animated.View pointerEvents="none" style={[styles.routeTransitionCover, { opacity: routeTransitionOpacity }]} />
`,
  ``,
  'remove black route transition view',
);

// Category opening should never sort the entire multi-thousand-item catalog on
// the same JS frame as the bottom-tab tap. Only the bounded preview pool needs
// ranking; browse/search screens do their own filtered work after navigation.
source = mustReplace(
  source,
  `  const categoryPreviewPool = useMemo(
    () => sortForCatalogFilter(usableCatalog, 'latest').slice(0, 900),
    [usableCatalog],
  );`,
  `  const categoryPreviewPool = useMemo(
    () => sortForCatalogFilter(usableCatalog.slice(0, 900), 'latest'),
    [usableCatalog],
  );`,
  'bounded category preview sorting',
);

await write('App.tsx', source);

// This batch changes shipped UI/runtime behavior, so publish a distinguishable
// APK rather than silently replacing v0.13.0 under the same version metadata.
const pkg = JSON.parse(await read('package.json'));
pkg.version = '0.14.0';
await write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const app = JSON.parse(await read('app.json'));
app.expo.version = '0.14.0';
app.expo.android.versionCode = Math.max(19, Number(app.expo.android.versionCode || 0) + 1);
await write('app.json', `${JSON.stringify(app, null, 2)}\n`);

let lock = await read('package-lock.json');
let rootVersionsChanged = 0;
lock = lock.replace(/"version": "0\.13\.0"/g, (match) => {
  if (rootVersionsChanged >= 2) return match;
  rootVersionsChanged += 1;
  return '"version": "0.14.0"';
});
if (rootVersionsChanged !== 2) throw new Error(`Expected 2 package-lock root versions, changed ${rootVersionsChanged}`);
await write('package-lock.json', lock);

// Fail inside the patch step, before npm/Gradle time is spent, if any legacy
// UI fallback survived these targeted replacements.
if (source.includes('نسخه اصلی')) throw new Error('Legacy نسخه اصلی UI text still exists in App.tsx');
if (source.includes('routeTransitionOpacity') || source.includes('routeTransitionTimerRef')) throw new Error('Black route-transition state still exists');

console.log('Applied reported mobile bugfixes and bumped Android build to v0.14.0 (19).');
