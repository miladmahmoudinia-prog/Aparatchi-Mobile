import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const write = (path, value) => fs.writeFile(path, value, 'utf8');

function mustReplace(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Missing patch target: ${label}`);
  return text.replace(before, after);
}

function mustRegex(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`Missing regex patch target: ${label}`);
  pattern.lastIndex = 0;
  return text.replace(pattern, replacement);
}

let source = await read('App.tsx');

// 1) Detail cast/crew rail: use the same proven physical-end strategy as the
// Stars rails. Do not stack FlatList inverted + RTL direction + row-reverse.
source = mustRegex(
  source,
  /(\<FlatList\s*\n\s*horizontal\s*\n)\s*inverted\s*\n\s*data=\{people\}/m,
  `$1        data={[...people].reverse()}\n        contentOffset={{ x: people.length * 100, y: 0 }}`,
  'detail people RTL rail',
);
source = mustReplace(
  source,
  `peopleRail: { minHeight: 159, direction: 'rtl' },`,
  `peopleRail: { minHeight: 159 },`,
  'people rail direction style',
);
source = mustReplace(
  source,
  `peopleList: { flexDirection: 'row-reverse', gap: 12, paddingHorizontal: 1, paddingBottom: 2 },`,
  `peopleList: { flexDirection: 'row', gap: 12, paddingHorizontal: 1, paddingBottom: 2 },`,
  'people list row direction',
);

// 2) Episode artwork: only a frame generated from the episode video itself is
// accepted as episode-specific artwork. Any Upera still/mirror that cannot be
// proven exact falls back to this same series' backdrop/poster, never another
// title's image.
source = mustReplace(
  source,
  `function PlayerEpisodesOverlay({`,
  `const exactEpisodeArtworkFor = (group: DownloadSection, item: CatalogItem) => {\n  const artwork = String(group.artwork || '').trim();\n  const exactGeneratedFrame = /(?:^|\\/)assets\\/media\\/episodes\\/[a-f0-9]{24}\\.jpg(?:$|[?#])/i.test(artwork);\n  if (exactGeneratedFrame && isSafeHttpUrl(artwork) && !isPlaceholderUrl(artwork)) return artwork;\n  return item.backdrop || item.poster || item.backdropFallback || item.posterFallback || '';\n};\n\nfunction PlayerEpisodesOverlay({`,
  'exact episode artwork validator',
);
source = mustReplace(
  source,
  `const artwork = group.artwork || '';`,
  `const artwork = exactEpisodeArtworkFor(group, item);`,
  'episode showcase exact artwork',
);
source = mustReplace(
  source,
  `<CatalogArtwork primary={group.artwork || ''} style={styles.playerEpisodeArtwork} contentFit="cover" imageKind="backdrop" />`,
  `<CatalogArtwork primary={exactEpisodeArtworkFor(group, item)} style={styles.playerEpisodeArtwork} contentFit="cover" imageKind="backdrop" />`,
  'player episode exact artwork',
);

// 3) Cold first install: remove the deliberate five-second minimum hold. The
// bundled/home shell is already ready; remote refresh continues in background.
source = mustReplace(source, `const minimumVisibleMs = 5000;`, `const minimumVisibleMs = 850;`, 'startup minimum hold');
source = mustReplace(source, `setTimeout(dismissStartup, 5000)`, `setTimeout(dismissStartup, 1200)`, 'startup fallback hold');

// 4) Player controls: coherent Rubika-like chrome, fullscreen lock, 10-second
// seek, mute/volume and fullscreen controls in one bottom row. All chrome uses
// the existing common visibility timer so timeline and controls fade together.
source = mustReplace(
  source,
  `  const [networkOffline, setNetworkOffline] = useState(false);\n  const [currentTime, setCurrentTime] = useState(Math.max(0, Number(request.resumeAt || 0)));`,
  `  const [networkOffline, setNetworkOffline] = useState(false);\n  const [controlsLocked, setControlsLocked] = useState(false);\n  const [isMuted, setIsMuted] = useState(false);\n  const [playerVolume, setPlayerVolume] = useState(1);\n  const [currentTime, setCurrentTime] = useState(Math.max(0, Number(request.resumeAt || 0)));`,
  'player lock and volume state',
);
source = mustReplace(
  source,
  `  const player = useVideoPlayer(initialSource.url, (instance) => {\n    instance.timeUpdateEventInterval = 0.5;\n    instance.play();\n  });`,
  `  const player = useVideoPlayer(initialSource.url, (instance) => {\n    instance.timeUpdateEventInterval = 0.5;\n    instance.play();\n  });\n\n  useEffect(() => {\n    const controlledPlayer = player as typeof player & { muted: boolean; volume: number };\n    controlledPlayer.muted = isMuted || playerVolume <= 0;\n    controlledPlayer.volume = Math.max(0, Math.min(1, playerVolume));\n  }, [isMuted, player, playerVolume]);`,
  'player volume synchronization',
);
source = mustReplace(
  source,
  `    if (!firstFrameReady || settingsOpen || episodesOpen) return;\n    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3200);\n  }, [clearControlsTimer, episodesOpen, firstFrameReady, settingsOpen]);`,
  `    if (!firstFrameReady || settingsOpen || episodesOpen || controlsLocked) return;\n    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3200);\n  }, [clearControlsTimer, controlsLocked, episodesOpen, firstFrameReady, settingsOpen]);`,
  'player auto-hide lock awareness',
);
source = mustReplace(
  source,
  `  const handleBack = () => {\n    if (episodesOpen) {`,
  `  const handleBack = () => {\n    if (controlsLocked) {\n      setControlsLocked(false);\n      setControlsVisible(true);\n      return;\n    }\n    if (episodesOpen) {`,
  'player back unlock first',
);
source = mustReplace(
  source,
  `  const seekBy = (seconds: number) => seekTo(Number(player.currentTime || latestTimeRef.current || 0) + seconds);\n\n  const switchQuality`,
  `  const seekBy = (seconds: number) => seekTo(Number(player.currentTime || latestTimeRef.current || 0) + seconds);\n\n  const toggleMute = () => {\n    setIsMuted((current) => !current);\n    revealControls();\n  };\n\n  const adjustVolume = (delta: number) => {\n    const next = Math.max(0, Math.min(1, playerVolume + delta));\n    setPlayerVolume(next);\n    setIsMuted(next <= 0);\n    revealControls();\n  };\n\n  const lockPlayerControls = () => {\n    if (!landscape) return;\n    clearControlsTimer();\n    setSettingsOpen(false);\n    setEpisodesOpen(false);\n    setQualityExpanded(false);\n    setControlsLocked(true);\n    setControlsVisible(false);\n  };\n\n  const unlockPlayerControls = () => {\n    setControlsLocked(false);\n    setControlsVisible(true);\n  };\n\n  const switchQuality`,
  'player volume and lock helpers',
);
source = mustReplace(
  source,
  `  const toggleSurfaceControls = () => {\n    if (controlsVisible) hideControls();\n    else revealControls();\n  };\n\n  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;\n  const chromeVisible = !settingsOpen && !episodesOpen && (!firstFrameReady || switchingQuality || controlsVisible);`,
  `  const toggleSurfaceControls = () => {\n    if (controlsLocked) return;\n    if (controlsVisible) hideControls();\n    else revealControls();\n  };\n\n  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;\n  const chromeVisible = !controlsLocked && !settingsOpen && !episodesOpen && (!firstFrameReady || switchingQuality || controlsVisible);`,
  'player chrome lock behavior',
);
source = mustReplace(
  source,
  `    setQualityExpanded(false);\n    setControlsVisible(true);\n    clearControlsTimer();`,
  `    setQualityExpanded(false);\n    if (!targetLandscape) setControlsLocked(false);\n    setControlsVisible(true);\n    clearControlsTimer();`,
  'unlock when returning portrait',
);

source = mustReplace(
  source,
  `            <View style={[styles.nativePlayerTopBar, !landscape && styles.playerDetachedBar, topBarStyle]}>\n              <Pressable onPress={closePlayer} unstable_pressDelay={0} hitSlop={10} style={styles.nativePlayerTopButton} accessibilityLabel="بستن پخش‌کننده">\n                <Ionicons name="close" color="#fff" size={22} />\n              </Pressable>\n              <Text numberOfLines={1} style={styles.nativePlayerTitle}>{request.title}</Text>\n              <Pressable onPress={toggleOrientation} style={styles.nativePlayerTopButton} accessibilityLabel={landscape ? 'کوچک‌نمایی و بازگشت به حالت عمودی' : 'بزرگ‌نمایی و ورود به حالت افقی'}>\n                <Ionicons name={landscape ? 'contract-outline' : 'expand-outline'} color="#fff" size={21} />\n              </Pressable>\n            </View>`,
  `            <View style={[styles.nativePlayerTopBar, !landscape && styles.playerDetachedBar, topBarStyle]}>\n              {landscape ? (\n                <Pressable onPress={lockPlayerControls} style={styles.nativePlayerTopButton} accessibilityLabel="قفل کنترل‌ها">\n                  <Ionicons name="lock-closed-outline" color="#fff" size={20} />\n                </Pressable>\n              ) : <View style={{ width: 38, height: 38 }} />}\n              <Text numberOfLines={1} style={styles.nativePlayerTitle}>{request.title}</Text>\n              <Pressable onPress={closePlayer} unstable_pressDelay={0} hitSlop={10} style={styles.nativePlayerTopButton} accessibilityLabel="بستن پخش‌کننده">\n                <Ionicons name="arrow-forward" color="#fff" size={23} />\n              </Pressable>\n            </View>`,
  'organized player top bar',
);
source = source.replace(/seekBy\(-15\)/g, 'seekBy(-10)').replace(/seekBy\(15\)/g, 'seekBy(10)');
source = source.replace(/پانزده ثانیه عقب/g, 'ده ثانیه عقب').replace(/پانزده ثانیه جلو/g, 'ده ثانیه جلو');
source = source.replace(/<Text style=\{styles\.playerSkipText\}>۱۵<\/Text>/g, '<Text style={styles.playerSkipText}>۱۰</Text>');

const oldBottomTools = `              <View style={styles.playerBottomTools}>\n                {playerEpisodeGroups.length ? (\n                  <Pressable\n                    onPress={() => {\n                      clearControlsTimer();\n                      setControlsVisible(true);\n                      setSettingsOpen(false);\n                      setEpisodesOpen(true);\n                    }}\n                    style={styles.playerToolButton}\n                  >\n                    <Ionicons name="albums-outline" color="#fff" size={18} />\n                    <Text style={styles.playerToolText}>قسمت‌ها</Text>\n                  </Pressable>\n                ) : null}\n                <Pressable\n                  onPress={() => {\n                    clearControlsTimer();\n                    setControlsVisible(true);\n                    setQualityExpanded(false);\n                    setSettingsOpen(true);\n                  }}\n                  style={styles.playerToolButton}\n                >\n                  <Ionicons name="settings-outline" color="#fff" size={18} />\n                  <Text style={styles.playerToolText}>تنظیمات</Text>\n                </Pressable>\n              </View>`;
const newBottomTools = `              <View style={styles.playerBottomTools}>\n                <Pressable\n                  onPress={() => {\n                    clearControlsTimer();\n                    setControlsVisible(true);\n                    setQualityExpanded(false);\n                    setSettingsOpen(true);\n                  }}\n                  style={styles.playerControlIcon}\n                  accessibilityLabel="تنظیمات"\n                >\n                  <Ionicons name="settings-outline" color="#fff" size={22} />\n                </Pressable>\n                <Pressable onPress={toggleOrientation} style={styles.playerControlIcon} accessibilityLabel={landscape ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}>\n                  <Ionicons name={landscape ? 'contract-outline' : 'expand-outline'} color="#fff" size={22} />\n                </Pressable>\n                {playerEpisodeGroups.length ? (\n                  <Pressable\n                    onPress={() => {\n                      clearControlsTimer();\n                      setControlsVisible(true);\n                      setSettingsOpen(false);\n                      setEpisodesOpen(true);\n                    }}\n                    style={styles.playerControlIcon}\n                    accessibilityLabel="قسمت‌ها"\n                  >\n                    <Ionicons name="albums-outline" color="#fff" size={21} />\n                  </Pressable>\n                ) : null}\n                <View style={styles.playerControlSpacer} />\n                <Pressable onPress={() => adjustVolume(-0.1)} style={styles.playerControlIcon} accessibilityLabel="کم کردن صدا">\n                  <Ionicons name="remove-circle-outline" color="#fff" size={21} />\n                </Pressable>\n                <Pressable onPress={toggleMute} style={styles.playerControlIcon} accessibilityLabel={isMuted ? 'وصل کردن صدا' : 'قطع کردن صدا'}>\n                  <Ionicons name={isMuted || playerVolume <= 0 ? 'volume-mute' : 'volume-high'} color="#fff" size={22} />\n                </Pressable>\n                <Pressable onPress={() => adjustVolume(0.1)} style={styles.playerControlIcon} accessibilityLabel="زیاد کردن صدا">\n                  <Ionicons name="add-circle-outline" color="#fff" size={21} />\n                </Pressable>\n              </View>`;
source = mustReplace(source, oldBottomTools, newBottomTools, 'organized player bottom tools');

source = mustReplace(
  source,
  `        {episodesOpen && item?.type === 'series' ? (`,
  `        {controlsLocked ? (\n          <Pressable\n            onPress={unlockPlayerControls}\n            style={[styles.playerLockedButton, { left: safeLeft, top: Math.max(12, insets.top + 8) }]}\n            accessibilityLabel="باز کردن قفل کنترل‌ها"\n          >\n            <Ionicons name="lock-closed" color="#fff" size={20} />\n            <Text style={styles.playerLockedText}>باز کردن قفل</Text>\n          </Pressable>\n        ) : null}\n\n        {episodesOpen && item?.type === 'series' ? (`,
  'locked player unlock button',
);
source = mustReplace(
  source,
  `playerBottomTools: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },`,
  `playerBottomTools: { marginTop: 6, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },`,
  'compact player bottom tools style',
);
source = mustReplace(
  source,
  `playerLockedButton: { position: 'absolute', left: 24, top: '45%', minHeight: 50, paddingHorizontal: 15, borderRadius: 16, zIndex: 40, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(5,7,10,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' },`,
  `playerLockedButton: { position: 'absolute', minHeight: 42, paddingHorizontal: 12, borderRadius: 13, zIndex: 60, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(5,7,10,0.90)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' },`,
  'top fullscreen lock style',
);

await write('App.tsx', source);

// Publish a distinguishable APK for this user-visible batch.
const pkg = JSON.parse(await read('package.json'));
pkg.version = '0.15.0';
await write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const app = JSON.parse(await read('app.json'));
app.expo.version = '0.15.0';
app.expo.android.versionCode = 20;
await write('app.json', `${JSON.stringify(app, null, 2)}\n`);

const lock = JSON.parse(await read('package-lock.json'));
lock.version = '0.15.0';
if (lock.packages?.['']) lock.packages[''].version = '0.15.0';
await write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

if (source.includes('const minimumVisibleMs = 5000;')) throw new Error('Legacy five-second startup hold survived.');
if (source.includes('primary={group.artwork ||')) throw new Error('Unsafe raw episode artwork survived.');
if (!source.includes('controlsLocked')) throw new Error('Player lock patch did not apply.');

console.log('Applied latest reported mobile fixes and bumped Android build to v0.15.0 (20).');
