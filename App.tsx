import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, DAYS } from './src/data';
import { loadVerifiedForeignSchedule } from './src/foreignSchedule';
import { loadContent, LoadedContent } from './src/contentService';
import { checkIranNetworkAccess, IranAccessStatus } from './src/ipAccess';
import { CatalogItem, DayId, DownloadFile, DownloadSection, MediaLanguage, ScheduleEntry } from './src/types';
import {
  DownloadRecord,
  cancelDownload,
  loadDownloadRecords,
  pauseDownload,
  removeDownloadedFile,
  runDownload,
  saveDownloadedFileToGallery,
  saveDownloadRecords,
} from './src/downloadManager';

type MainTab = 'home' | 'search' | 'favorites' | 'downloads';
type ScheduleFilter = 'all' | 'iranian' | 'foreign';
type SearchFilter =
  | 'all'
  | 'movie'
  | 'series'
  | MediaLanguage
  | 'latest'
  | 'updated'
  | 'iranian-movies'
  | 'foreign-movies'
  | 'iranian-series'
  | 'foreign-series'
  | 'animation-movies'
  | 'animation-series'
  | 'programs'
  | 'documentaries';

const TODAY_BY_JS_DAY: Record<number, DayId> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const toPersianDigits = (value: string | number) =>
  String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

const isSafeHttpUrl = (url?: string) => Boolean(url && /^https?:\/\//i.test(url));

const isPlaceholderUrl = (url?: string) =>
  Boolean(url && (/example\.com/i.test(url) || /replace-with/i.test(url)));

const isDirectMediaUrl = (url: string) =>
  /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url);

const showNetworkAccessAlert = (status: IranAccessStatus) => {
  Alert.alert(
    status === 'blocked' ? 'فیلترشکن را خاموش کنید' : 'بررسی اتصال انجام نشد',
    status === 'blocked'
      ? 'برای پخش و دانلود فیلم‌ها، فیلترشکن خود را خاموش کنید.'
      : 'اینترنت را بررسی کنید و از صفحه جزئیات، «بررسی دوباره» را بزنید.',
  );
};

const downloadModeFor = (file: DownloadFile) =>
  file.mode === 'play' ? 'play' : 'download';

const LANGUAGE_ORDER: MediaLanguage[] = ['dubbed', 'subtitled'];

const languageTitle = (language: MediaLanguage) =>
  language === 'dubbed' ? 'دوبله فارسی' : 'زیرنویس فارسی';

const shareCatalogItem = async (item: CatalogItem) => {
  try {
    await Share.share({
      title: item.nameFa,
      message: [item.nameFa, item.name].filter(Boolean).join('\n'),
    });
  } catch {
    Alert.alert('اشتراک‌گذاری', 'اشتراک‌گذاری انجام نشد. دوباره تلاش کنید.');
  }
};

const itemLanguages = (item: CatalogItem): MediaLanguage[] => {
  const available = item.availableLanguages || [];
  if (available.length) {
    return LANGUAGE_ORDER.filter((language) => available.includes(language));
  }

  return LANGUAGE_ORDER.filter((language) =>
    (item.downloads || []).some((section) =>
      section.files.some((file) => file.mode !== 'play' && file.language === language),
    ),
  );
};

const itemLanguageBadge = (item: CatalogItem) => {
  const languages = itemLanguages(item);
  if (languages.includes('dubbed') && languages.includes('subtitled')) {
    return 'دوبله + زیرنویس';
  }
  if (languages.includes('dubbed')) return 'دوبله';
  if (languages.includes('subtitled')) return 'زیرنویس';
  return '';
};

const cleanMediaLabel = (value?: string) =>
  String(value || '')
    .replace(/نسخه\s*اصلی/gi, '')
    .replace(/original\s*(?:version|audio)?/gi, '')
    .replace(/^[\s•|\-–—]+|[\s•|\-–—]+$/g, '')
    .trim();

const cleanQualityLabel = (value?: string) => {
  const cleaned = cleanMediaLabel(value);
  if (!cleaned || /^کیفیت\s*اصلی$/i.test(cleaned)) return 'کیفیت فایل';
  return cleaned;
};

const qualityRank = (file: DownloadFile) => {
  const text = `${file.quality} ${file.label || ''}`;
  const match = text.match(/(2160|1440|1080|720|480|360)/i);
  let rank = match ? Number(match[1]) : 0;
  if (/hq\s*1080/i.test(text)) rank = 1180;
  if (/blu[\s._-]*ray|bluray/i.test(text)) rank += 100000;
  if (/remux/i.test(text)) rank += 110000;
  return rank;
};

const sortedDownloadFiles = (files: DownloadFile[]) =>
  [...files]
    .filter((file) => downloadModeFor(file) === 'download')
    .sort((a, b) => qualityRank(a) - qualityRank(b));


type PlaybackSource = {
  id: string;
  url: string;
  quality: string;
  rank: number;
};

type PlayableVersion = {
  language: MediaLanguage;
  sources: PlaybackSource[];
  defaultSource: PlaybackSource;
};

type VideoRequest = {
  title: string;
  sources: PlaybackSource[];
  initialSourceId: string;
};

const playbackQualityLabel = (file: DownloadFile) => {
  const text = `${file.quality || ''} ${file.label || ''}`;
  if (/\.m3u8(?:$|[?#])/i.test(file.url) && !/(2160|1440|1080|720|480|360)/i.test(text)) {
    return 'خودکار';
  }
  return cleanQualityLabel(file.quality || file.label);
};

const playbackSourcesForLanguage = (
  files: DownloadFile[],
  language: MediaLanguage,
): PlaybackSource[] => {
  const seen = new Set<string>();
  const sources = files
    .filter(
      (file) =>
        file.language === language &&
        isSafeHttpUrl(file.url) &&
        isDirectMediaUrl(file.url) &&
        !isPlaceholderUrl(file.url),
    )
    .flatMap((file) => {
      if (seen.has(file.url)) return [];
      seen.add(file.url);
      return [{
        id: file.id,
        url: file.url,
        quality: playbackQualityLabel(file),
        rank: qualityRank(file),
      } satisfies PlaybackSource];
    })
    .sort((a, b) => {
      const aAuto = a.quality === 'خودکار';
      const bAuto = b.quality === 'خودکار';
      if (aAuto !== bAuto) return aAuto ? 1 : -1;
      return a.rank - b.rank;
    });

  return sources;
};

const defaultPlaybackSource = (sources: PlaybackSource[]) => {
  const exact480 = sources.find((source) => /(^|\D)480(?:p|\D|$)/i.test(source.quality));
  if (exact480) return exact480;

  const numeric = sources.filter((source) => source.rank > 0 && source.rank < 100000);
  if (numeric.length) {
    return [...numeric].sort((a, b) => {
      const distance = Math.abs(a.rank - 480) - Math.abs(b.rank - 480);
      return distance || a.rank - b.rank;
    })[0];
  }

  return sources[0];
};

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

  const files = targetSections.flatMap((section) => section.files || []);
  const versions = LANGUAGE_ORDER.flatMap((language) => {
    const sources = playbackSourcesForLanguage(files, language);
    if (!sources.length) return [];
    return [{
      language,
      sources,
      defaultSource: defaultPlaybackSource(sources),
    } satisfies PlayableVersion];
  });

  if (versions.length) return versions;

  const languages = itemLanguages(item);
  if (
    languages.length === 1 &&
    item.streamUrl &&
    isSafeHttpUrl(item.streamUrl) &&
    isDirectMediaUrl(item.streamUrl) &&
    !isPlaceholderUrl(item.streamUrl)
  ) {
    const source: PlaybackSource = {
      id: `stream-${item.id}-${languages[0]}`,
      url: item.streamUrl,
      quality: /\.m3u8(?:$|[?#])/i.test(item.streamUrl) ? 'خودکار' : 'پخش آنلاین',
      rank: 0,
    };
    return [{
      language: languages[0],
      sources: [source],
      defaultSource: source,
    }];
  }

  return [];
};

const languageSectionsForFiles = (
  files: DownloadFile[],
  idPrefix: string,
): DownloadSection[] =>
  LANGUAGE_ORDER.flatMap((language) => {
    const languageFiles = sortedDownloadFiles(
      files.filter((file) => file.language === language),
    );
    if (!languageFiles.length) return [];

    return [{
      id: `${idPrefix}-${language}`,
      title: languageTitle(language),
      subtitle: `${languageFiles.length} کیفیت دانلود مستقیم`,
      badge: language === 'dubbed' ? 'دوبله' : 'زیرنویس',
      language,
      files: languageFiles,
    }];
  });

const isEpisodeSection = (group: DownloadSection) =>
  Number(group.episodeNumber || 0) > 0;

const compareEpisodeGroupsNewestFirst = (a: DownloadSection, b: DownloadSection) => {
  const seasonDifference = Number(b.seasonNumber || 0) - Number(a.seasonNumber || 0);
  if (seasonDifference) return seasonDifference;
  return Number(b.episodeNumber || 0) - Number(a.episodeNumber || 0);
};

const newestEpisodeGroup = (item?: CatalogItem | null) =>
  [...(item?.downloads || [])]
    .filter(isEpisodeSection)
    .sort(compareEpisodeGroupsNewestFirst)[0] || null;

const latestEpisodeTimestamp = (item: CatalogItem) => {
  const latestGroup = newestEpisodeGroup(item);
  const value =
    latestGroup?.sourceUpdatedAt ||
    item.updatedAt ||
    item.sourceUpdatedAt ||
    item.createdAt ||
    item.sourceCreatedAt ||
    '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const catalogItemTimestamp = (item: CatalogItem) => {
  const value =
    item.updatedAt ||
    item.sourceUpdatedAt ||
    item.createdAt ||
    item.sourceCreatedAt ||
    '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const hasCategory = (item: CatalogItem, key: string) =>
  Boolean(item.categoryKeys?.includes(key));

const isAnimationItem = (item: CatalogItem) =>
  Boolean(
    item.isAnimation ||
    item.contentKind === 'animation-movie' ||
    item.contentKind === 'animation-series' ||
    hasCategory(item, 'animation-movies') ||
    hasCategory(item, 'animation-series') ||
    item.genres.some((genre) => /انیمیشن|animation/i.test(genre)),
  );

const isProgramItem = (item: CatalogItem) =>
  Boolean(
    item.isTalkShow ||
    item.contentKind === 'talk-show' ||
    hasCategory(item, 'talk-shows') ||
    item.genres.some((genre) => /تاک[‌\s-]*شو|talk[\s_-]*show|رئالیتی|reality/i.test(genre)),
  );

const isDocumentaryItem = (item: CatalogItem) =>
  Boolean(
    item.isDocumentary ||
    item.contentKind === 'documentary' ||
    hasCategory(item, 'documentaries') ||
    item.genres.some((genre) => /مستند|documentary/i.test(genre)),
  );

const filterTitle = (filter: SearchFilter) => {
  const titles: Record<SearchFilter, string> = {
    all: 'همه محتوا',
    movie: 'همه فیلم‌ها',
    series: 'همه سریال‌ها',
    dubbed: 'دوبله فارسی',
    subtitled: 'زیرنویس فارسی',
    latest: 'جدیدترین‌ها',
    updated: 'به‌روزشده‌ها',
    'iranian-movies': 'فیلم‌های ایرانی',
    'foreign-movies': 'فیلم‌های خارجی',
    'iranian-series': 'سریال‌های ایرانی',
    'foreign-series': 'سریال‌های خارجی',
    'animation-movies': 'انیمیشن‌های سینمایی',
    'animation-series': 'انیمیشن‌های سریالی',
    programs: 'تاک‌شوها و برنامه‌ها',
    documentaries: 'مستندها',
  };
  return titles[filter];
};

const matchesCatalogFilter = (item: CatalogItem, filter: SearchFilter) => {
  switch (filter) {
    case 'all':
    case 'latest':
      return true;
    case 'movie':
    case 'series':
      return item.type === filter;
    case 'dubbed':
    case 'subtitled':
      return itemLanguages(item).includes(filter);
    case 'updated':
      return Boolean(item.updateLabel || (item.type === 'series' && newestEpisodeGroup(item)));
    case 'iranian-movies':
      return item.type === 'movie' && item.ir;
    case 'foreign-movies':
      return item.type === 'movie' && !item.ir;
    case 'iranian-series':
      return item.type === 'series' && item.ir;
    case 'foreign-series':
      return item.type === 'series' && !item.ir;
    case 'animation-movies':
      return item.type === 'movie' && isAnimationItem(item);
    case 'animation-series':
      return item.type === 'series' && isAnimationItem(item);
    case 'programs':
      return isProgramItem(item);
    case 'documentaries':
      return isDocumentaryItem(item);
    default:
      return true;
  }
};

const sortForCatalogFilter = (items: CatalogItem[], filter: SearchFilter) => {
  if (filter === 'updated') {
    return [...items].sort((a, b) => {
      const aEpisodeUpdate = a.type === 'series' && newestEpisodeGroup(a) ? 1 : 0;
      const bEpisodeUpdate = b.type === 'series' && newestEpisodeGroup(b) ? 1 : 0;
      const episodeDifference = bEpisodeUpdate - aEpisodeUpdate;
      if (episodeDifference) return episodeDifference;
      return latestEpisodeTimestamp(b) - latestEpisodeTimestamp(a);
    });
  }

  return [...items].sort((a, b) => catalogItemTimestamp(b) - catalogItemTimestamp(a));
};

function Logo() {
  return (
    <View style={styles.logoWrap}>
      <Text style={styles.logo}>آپاراتچی</Text>
      <Text style={styles.logoTag}>دنیای فیلم و سریال</Text>
    </View>
  );
}

function Header({
  onSearch,
  onNotifications,
}: {
  onSearch: () => void;
  onNotifications: () => void;
}) {
  return (
    <View style={styles.header}>
      <Logo />
      <View style={styles.headerActions}>
        <Pressable onPress={onNotifications} style={styles.iconButton}>
          <Ionicons name="notifications-outline" color={COLORS.text} size={20} />
        </Pressable>
        <Pressable onPress={onSearch} style={styles.iconButton}>
          <Ionicons name="search-outline" color={COLORS.text} size={21} />
        </Pressable>
      </View>
    </View>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? (
        <Pressable onPress={onAction} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-back" color={COLORS.gold} size={15} />
        </Pressable>
      ) : null}
    </View>
  );
}

function HeroSlide({
  item,
  onOpen,
}: {
  item: CatalogItem;
  onOpen: () => void;
}) {
  return (
    <View style={styles.hero}>
      <Image
        source={{ uri: item.backdrop || item.poster }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={240}
      />
      <LinearGradient
        colors={['rgba(7,9,12,0.04)', 'rgba(7,9,12,0.54)', COLORS.background]}
        locations={[0.15, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(7,9,12,0.92)', 'rgba(7,9,12,0.1)']}
        start={{ x: 1, y: 0.5 }}
        end={{ x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.heroContent}>
        <View style={styles.heroBadgeRow}>
          <View style={styles.redBadge}>
            <Text style={styles.redBadgeText}>{item.type === 'movie' ? 'فیلم سینمایی' : 'سریال'}</Text>
          </View>
          <View style={styles.yearBadge}>
            <Text style={styles.yearBadgeText}>{toPersianDigits(item.year)}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.heroTitle}>{item.nameFa}</Text>
        <Text numberOfLines={1} style={styles.heroEnglish}>{item.name}</Text>
        <View style={styles.heroMeta}>
          {typeof item.rate === 'number' ? (
            <View style={styles.ratingChip}>
              <Text style={styles.imdb}>IMDb</Text>
              <Text style={styles.rating}>{toPersianDigits(item.rate)}</Text>
            </View>
          ) : null}
          {item.genres.slice(0, 2).map((genre) => (
            <Text key={genre} style={styles.metaChip}>
              {genre}
            </Text>
          ))}
        </View>
        <Text numberOfLines={2} style={styles.heroOverview}>
          {item.overview}
        </Text>
        <Pressable onPress={onOpen} style={styles.primaryButton}>
          <Ionicons name="play" color="#fff" size={18} />
          <Text style={styles.primaryButtonText}>مشاهده و دریافت</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HeroSlider({
  items,
  onOpen,
}: {
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const safeItems = items.slice(0, 5);
  const activeItem = safeItems[activeIndex] || safeItems[0];

  useEffect(() => {
    if (safeItems.length <= 1) return;
    const timer = setTimeout(() => {
      const nextIndex = (activeIndex + 1) % safeItems.length;
      Animated.timing(fade, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setActiveIndex(nextIndex);
        Animated.timing(fade, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }).start();
      });
    }, 5200);

    return () => clearTimeout(timer);
  }, [activeIndex, fade, safeItems.length]);

  useEffect(() => {
    if (activeIndex >= safeItems.length) setActiveIndex(0);
  }, [activeIndex, safeItems.length]);

  const selectSlide = (index: number) => {
    if (index === activeIndex) return;
    Animated.timing(fade, {
      toValue: 0,
      duration: 170,
      useNativeDriver: true,
    }).start(() => {
      setActiveIndex(index);
      Animated.timing(fade, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }).start();
    });
  };

  if (!activeItem) return null;

  return (
    <View style={styles.heroSlider}>
      <Animated.View style={[styles.heroSlide, { opacity: fade }]}>
        <HeroSlide item={activeItem} onOpen={() => onOpen(activeItem)} />
      </Animated.View>
      {safeItems.length > 1 ? (
        <View style={styles.heroDots}>
          {safeItems.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityLabel={`اسلاید ${toPersianDigits(index + 1)}`}
              onPress={() => selectSlide(index)}
              style={[styles.heroDot, activeIndex === index && styles.heroDotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ScheduleCard({
  entry,
  onOpen,
}: {
  entry: ScheduleEntry;
  onOpen: () => void;
}) {
  return (
    <Pressable onPress={onOpen} style={styles.scheduleCard}>
      <Image source={{ uri: entry.poster }} style={styles.schedulePoster} contentFit="cover" transition={180} />
      <View style={styles.scheduleCardBody}>
        <View style={styles.scheduleSourceRow}>
          <Text style={styles.scheduleRegion}>{entry.region === 'iranian' ? 'ایرانی' : 'خارجی'}</Text>
          <View style={styles.liveDot} />
        </View>
        <Text numberOfLines={1} style={styles.scheduleName}>
          {entry.nameFa}
        </Text>
        <Text style={styles.scheduleEpisode}>
          {entry.episode ? `قسمت ${toPersianDigits(entry.episode)}` : 'قسمت جدید'}
        </Text>
      </View>
      <View style={styles.scheduleTimeWrap}>
        <Text style={styles.scheduleTime}>{entry.time}</Text>
        <Ionicons name="chevron-back" color={COLORS.muted} size={15} />
      </View>
    </Pressable>
  );
}

function WeeklySchedule({
  catalog,
  iranianSchedule,
  weeklySchedule,
  onOpenItem,
}: {
  catalog: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
  weeklySchedule: ScheduleEntry[];
  onOpenItem: (item: CatalogItem) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<DayId>(TODAY_BY_JS_DAY[new Date().getDay()]);
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const [foreignEntries, setForeignEntries] = useState<ScheduleEntry[]>([]);
  const [loadingForeign, setLoadingForeign] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoadingForeign(true);
    loadVerifiedForeignSchedule(catalog)
      .then((entries) => {
        if (mounted) setForeignEntries(entries);
      })
      .finally(() => {
        if (mounted) setLoadingForeign(false);
      });
    return () => {
      mounted = false;
    };
  }, [catalog]);

  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [String(item.id), item])),
    [catalog],
  );

  const allEntries = useMemo(() => {
    const merged = new Map<string, ScheduleEntry>();

    const addEntry = (entry: ScheduleEntry) => {
      const item = catalogById.get(String(entry.itemId));
      if (!item || item.type !== 'series') return;

      const normalized: ScheduleEntry = {
        ...entry,
        itemId: String(item.id),
        nameFa: item.nameFa || entry.nameFa,
        poster: item.poster || entry.poster,
        region: item.ir ? 'iranian' : 'foreign',
      };

      const key = `${normalized.itemId}:${normalized.day}:${normalized.region}`;
      merged.set(key, normalized);
    };

    // نتیجهٔ آنلاین خارجی نقش پشتیبان دارد؛ برنامهٔ داخل کاتالوگ اولویت بالاتری دارد.
    foreignEntries.forEach(addEntry);
    iranianSchedule.forEach(addEntry);
    weeklySchedule.forEach(addEntry);

    return [...merged.values()].sort((a, b) => {
      const timeDiff = String(a.time || '').localeCompare(String(b.time || ''), 'fa');
      if (timeDiff) return timeDiff;
      return String(a.nameFa || '').localeCompare(String(b.nameFa || ''), 'fa');
    });
  }, [catalogById, foreignEntries, iranianSchedule, weeklySchedule]);

  const dayEntries = allEntries.filter(
    (entry) =>
      entry.day === selectedDay && (filter === 'all' || entry.region === filter),
  );
  const scheduleLoading = loadingForeign && filter !== 'iranian';

  return (
    <View style={styles.scheduleSection}>
      <View style={styles.scheduleHeader}>
        <View>
          <Text style={styles.eyebrow}>زمان‌بندی پخش</Text>
          <Text style={styles.sectionTitle}>برنامه هفتگی سریال‌ها</Text>
        </View>
        <Ionicons name="calendar-outline" color={COLORS.gold} size={22} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daysRow}
      >
        {DAYS.map((day) => {
          const count = allEntries.filter((entry) => entry.day === day.id).length;
          const active = day.id === selectedDay;
          return (
            <Pressable
              key={day.id}
              onPress={() => setSelectedDay(day.id)}
              style={[styles.dayButton, active && styles.dayButtonActive]}
            >
              <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>{day.label}</Text>
              <Text style={[styles.dayCount, active && styles.dayCountActive]}>
                {count ? `${toPersianDigits(count)} عنوان` : 'برنامه‌ای نداریم'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.segment}>
        {([
          ['all', 'همه'],
          ['iranian', 'ایرانی'],
          ['foreign', 'خارجی'],
        ] as const).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setFilter(id)}
            style={[styles.segmentButton, filter === id && styles.segmentButtonActive]}
          >
            <Text style={[styles.segmentText, filter === id && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {scheduleLoading ? (
        <View style={styles.scheduleLoading}>
          <ActivityIndicator color={COLORS.gold} size="small" />
          <Text style={styles.scheduleLoadingText}>در حال دریافت برنامه سریال‌ها…</Text>
        </View>
      ) : null}

      <View style={styles.scheduleList}>
        {dayEntries.map((entry) => {
          const item = catalog.find((candidate) => candidate.id === entry.itemId);
          if (!item) return null;
          return <ScheduleCard key={entry.id} entry={entry} onOpen={() => onOpenItem(item)} />;
        })}
        {!scheduleLoading && !dayEntries.length ? (
          <View style={styles.scheduleEmpty}>
            <Ionicons name="calendar-outline" color={COLORS.muted} size={28} />
            <Text style={styles.scheduleEmptyTitle}>برای این روز برنامه‌ای نداریم</Text>
            <Text style={styles.scheduleEmptyText}>می‌توانید روز دیگری را انتخاب کنید.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PosterCard({
  item,
  onOpen,
  width = 137,
}: {
  item: CatalogItem;
  onOpen: () => void;
  width?: number;
}) {
  const languageBadge = itemLanguageBadge(item);
  const latestEpisode = item.type === 'series' ? newestEpisodeGroup(item) : null;

  return (
    <Pressable onPress={onOpen} style={[styles.posterCard, { width }]}>
      <View style={[styles.posterImageWrap, { width, height: Math.round(width * 1.42) }]}>
        <Image source={{ uri: item.poster }} style={styles.posterImage} contentFit="cover" transition={220} />
        <LinearGradient colors={['transparent', 'rgba(7,9,12,0.88)']} style={styles.posterGradient} />
        {languageBadge ? (
          <View style={styles.posterAccess}>
            <Text style={styles.posterAccessText}>{languageBadge}</Text>
          </View>
        ) : null}
        {latestEpisode ? (
          <View style={styles.posterEpisodeBadge}>
            <Text style={styles.posterEpisodeText}>
              قسمت {toPersianDigits(latestEpisode.episodeNumber || 0)}
            </Text>
          </View>
        ) : null}
        {typeof item.rate === 'number' ? (
          <View style={styles.posterRating}>
            <Ionicons name="star" color={COLORS.gold} size={11} />
            <Text style={styles.posterRatingText}>{toPersianDigits(item.rate)}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.posterName}>{item.nameFa}</Text>
      <Text numberOfLines={1} style={styles.posterEnglish}>{item.name || toPersianDigits(item.year)}</Text>
    </Pressable>
  );
}

function HorizontalCatalog({
  items,
  onOpen,
}: {
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  return (
    <FlatList
      horizontal
      inverted
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <PosterCard item={item} onOpen={() => onOpen(item)} />
      )}
      showsHorizontalScrollIndicator={false}
      style={styles.horizontalCatalogList}
      contentContainerStyle={styles.horizontalCatalog}
    />
  );
}

function HomeScreen({
  catalog,
  iranianSchedule,
  weeklySchedule,
  onReloadContent,
  onOpen,
  onBrowse,
}: {
  catalog: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
  weeklySchedule: ScheduleEntry[];
  onReloadContent: () => void;
  onOpen: (item: CatalogItem) => void;
  onBrowse: (filter: SearchFilter) => void;
}) {
  const newest = sortForCatalogFilter(catalog, 'latest');
  const updated = sortForCatalogFilter(
    catalog.filter((item) => matchesCatalogFilter(item, 'updated')),
    'updated',
  );

  const rows: {
    filter: SearchFilter;
    eyebrow: string;
    title: string;
    items: CatalogItem[];
  }[] = [
    {
      filter: 'latest',
      eyebrow: 'تازه‌های تماشا',
      title: 'جدیدترین‌ها',
      items: newest,
    },
    {
      filter: 'updated',
      eyebrow: 'قسمت‌ها و نسخه‌های تازه',
      title: 'به‌روزشده‌ها',
      items: updated,
    },
    {
      filter: 'iranian-movies',
      eyebrow: 'سینمای ایران',
      title: 'فیلم‌های ایرانی',
      items: newest.filter((item) => matchesCatalogFilter(item, 'iranian-movies')),
    },
    {
      filter: 'foreign-movies',
      eyebrow: 'سینمای جهان',
      title: 'فیلم‌های خارجی',
      items: newest.filter((item) => matchesCatalogFilter(item, 'foreign-movies')),
    },
    {
      filter: 'iranian-series',
      eyebrow: 'سریال‌های داخلی',
      title: 'سریال‌های ایرانی',
      items: newest.filter((item) => matchesCatalogFilter(item, 'iranian-series')),
    },
    {
      filter: 'foreign-series',
      eyebrow: 'سریال‌های جهان',
      title: 'سریال‌های خارجی',
      items: newest.filter((item) => matchesCatalogFilter(item, 'foreign-series')),
    },
    {
      filter: 'animation-movies',
      eyebrow: 'برای همه سنین',
      title: 'انیمیشن‌های سینمایی',
      items: newest.filter((item) => matchesCatalogFilter(item, 'animation-movies')),
    },
    {
      filter: 'animation-series',
      eyebrow: 'ماجراهای دنباله‌دار',
      title: 'انیمیشن‌های سریالی',
      items: newest.filter((item) => matchesCatalogFilter(item, 'animation-series')),
    },
    {
      filter: 'programs',
      eyebrow: 'گفت‌وگو و سرگرمی',
      title: 'تاک‌شوها و برنامه‌ها',
      items: newest.filter((item) => matchesCatalogFilter(item, 'programs')),
    },
    {
      filter: 'documentaries',
      eyebrow: 'واقعیت تماشایی',
      title: 'مستندها',
      items: newest.filter((item) => matchesCatalogFilter(item, 'documentaries')),
    },
    {
      filter: 'dubbed',
      eyebrow: 'با صدای فارسی',
      title: 'دوبله فارسی',
      items: newest.filter((item) => matchesCatalogFilter(item, 'dubbed')),
    },
    {
      filter: 'subtitled',
      eyebrow: 'با زیرنویس فارسی',
      title: 'زیرنویس فارسی',
      items: newest.filter((item) => matchesCatalogFilter(item, 'subtitled')),
    },
  ];

  if (!newest.length) {
    return (
      <View style={[styles.screen, styles.contentUnavailable]}>
        <Ionicons name="cloud-offline-outline" color={COLORS.gold} size={42} />
        <Text style={styles.largeEmptyTitle}>فهرست محتوا خالی است</Text>
        <Pressable onPress={onReloadContent} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>تلاش دوباره</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.homeContent}
      showsVerticalScrollIndicator={false}
    >
      <Header
        onSearch={() => onBrowse('all')}
        onNotifications={() => Alert.alert('اعلان‌ها', 'فعلاً اعلان جدیدی ندارید.')}
      />

      <HeroSlider items={newest.slice(0, 5)} onOpen={onOpen} />

      {rows.map((row) => (
        row.items.length ? (
          <View key={row.filter} style={styles.catalogSection}>
            <SectionTitle
              eyebrow={row.eyebrow}
              title={row.title}
              action="مشاهده همه"
              onAction={() => onBrowse(row.filter)}
            />
            <HorizontalCatalog items={row.items.slice(0, 12)} onOpen={onOpen} />
          </View>
        ) : null
      ))}

      <WeeklySchedule
        catalog={catalog}
        iranianSchedule={iranianSchedule}
        weeklySchedule={weeklySchedule}
        onOpenItem={onOpen}
      />
    </ScrollView>
  );
}

function SearchScreen({
  catalog,
  onOpen,
  initialFilter,
}: {
  catalog: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
  initialFilter: SearchFilter;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>(initialFilter);
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    setFilter(initialFilter);
    setQuery('');
  }, [initialFilter]);

  const normalizedQuery = query.trim().toLowerCase();
  const results = sortForCatalogFilter(
    catalog.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        item.nameFa.toLowerCase().includes(normalizedQuery) ||
        item.name.toLowerCase().includes(normalizedQuery);
      return matchesQuery && matchesCatalogFilter(item, filter);
    }),
    filter,
  );

  const basicFilters: { id: SearchFilter; label: string }[] = [
    { id: 'all', label: 'همه' },
    { id: 'movie', label: 'فیلم' },
    { id: 'series', label: 'سریال' },
    { id: 'dubbed', label: 'دوبله فارسی' },
    { id: 'subtitled', label: 'زیرنویس فارسی' },
  ];
  const visibleFilters = basicFilters.some((entry) => entry.id === initialFilter)
    ? basicFilters
    : [{ id: initialFilter, label: filterTitle(initialFilter) }, ...basicFilters];

  const columnCount = screenWidth >= 720 ? 5 : screenWidth >= 590 ? 4 : screenWidth >= 480 ? 3 : 2;
  const gridGap = 12;
  const cardWidth = Math.floor(
    (screenWidth - 32 - gridGap * (columnCount - 1)) / columnCount,
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.tabScreenContent}>
      <View style={styles.simpleHeader}>
        <Logo />
        <Text numberOfLines={1} style={styles.simpleHeaderTitle}>{filterTitle(filter)}</Text>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" color={COLORS.muted} size={21} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="نام فارسی یا انگلیسی…"
          placeholderTextColor="#646A74"
          style={styles.searchInput}
          textAlign="right"
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.searchFilters}
      >
        {visibleFilters.map(({ id, label }) => (
          <Pressable
            key={id}
            onPress={() => setFilter(id)}
            style={[styles.filterChip, filter === id && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, filter === id && styles.filterChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.resultCount}>{toPersianDigits(results.length)} نتیجه</Text>
      <View style={[styles.searchGrid, { columnGap: gridGap }]}>
        {results.map((item) => (
          <PosterCard
            key={item.id}
            item={item}
            width={cardWidth}
            onOpen={() => onOpen(item)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function FavoritesScreen({
  catalog,
  favorites,
  onOpen,
}: {
  catalog: CatalogItem[];
  favorites: string[];
  onOpen: (item: CatalogItem) => void;
}) {
  const items = catalog.filter((item) => favorites.includes(item.id));
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.tabScreenContent}>
      <View style={styles.simpleHeader}>
        <Logo />
        <Text style={styles.simpleHeaderTitle}>نشان‌شده‌ها</Text>
      </View>
      {!items.length ? (
        <View style={styles.largeEmpty}>
          <View style={styles.largeEmptyIcon}>
            <Ionicons name="bookmark-outline" color={COLORS.gold} size={34} />
          </View>
          <Text style={styles.largeEmptyTitle}>فهرستت هنوز خالی است</Text>
          <Text style={styles.largeEmptyText}>فیلم‌ها و سریال‌های مورد علاقه‌ات را نشان کن تا اینجا بمانند.</Text>
        </View>
      ) : (
        <View style={styles.searchGrid}>
          {items.map((item) => <PosterCard key={item.id} item={item} onOpen={() => onOpen(item)} />)}
        </View>
      )}
    </ScrollView>
  );
}

function DownloadsScreen({
  downloads,
  onPlay,
  onPause,
  onResume,
  onMenu,
}: {
  downloads: DownloadRecord[];
  onPlay: (record: DownloadRecord) => void;
  onPause: (record: DownloadRecord) => void;
  onResume: (record: DownloadRecord) => void;
  onMenu: (record: DownloadRecord) => void;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.tabScreenContent}>
      <View style={styles.simpleHeader}>
        <Logo />
        <Text style={styles.simpleHeaderTitle}>دریافت‌ها</Text>
      </View>
      {!downloads.length ? (
        <View style={styles.largeEmpty}>
          <View style={styles.largeEmptyIcon}>
            <Ionicons name="cloud-download-outline" color={COLORS.gold} size={36} />
          </View>
          <Text style={styles.largeEmptyTitle}>هنوز فایلی دریافت نشده</Text>
          <Text style={styles.largeEmptyText}>
            فایل‌های دریافتی همراه با وضعیت و درصد پیشرفت در این بخش نگه‌داری می‌شوند.
          </Text>
        </View>
      ) : (
        <View style={styles.downloadLibrary}>
          {downloads.map((record) => {
            const percent = Math.round(record.progress * 100);
            const canPlay = record.status === 'completed' && Boolean(record.localUri);
            const canResume = record.status === 'paused' || record.status === 'failed';

            return (
              <View key={record.id} style={styles.downloadLibraryCard}>
                <View style={styles.downloadLibraryInfo}>
                  <Text numberOfLines={1} style={styles.downloadLibraryTitle}>{record.title}</Text>
                  <Text style={styles.downloadLibraryMeta}>
                    {[record.subtitle, record.quality].filter(Boolean).join(' • ')}
                  </Text>
                  {record.status !== 'completed' ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${percent}%` }]} />
                    </View>
                  ) : null}
                  <Text style={styles.downloadLibraryStatus}>
                    {record.status === 'completed'
                      ? 'دانلود کامل شده و آماده پخش است'
                      : record.status === 'downloading'
                        ? `${toPersianDigits(percent)}٪ در حال دریافت`
                        : record.status === 'paused'
                          ? `${toPersianDigits(percent)}٪ متوقف شده`
                          : record.error || 'دریافت ناموفق بود'}
                  </Text>
                </View>

                <View style={styles.downloadLibraryActions}>
                  {record.status === 'downloading' ? (
                    <Pressable onPress={() => onPause(record)} style={styles.downloadLibraryControl}>
                      <Ionicons name="pause" color={COLORS.text} size={18} />
                    </Pressable>
                  ) : null}
                  {canResume ? (
                    <Pressable onPress={() => onResume(record)} style={styles.downloadLibraryControl}>
                      <Ionicons name="play" color={COLORS.text} size={18} />
                    </Pressable>
                  ) : null}
                  {canPlay ? (
                    <Pressable onPress={() => onPlay(record)} style={styles.downloadLibraryPlay}>
                      <Ionicons name="play" color="#fff" size={18} />
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => onMenu(record)} style={styles.downloadLibraryMenu}>
                    <Ionicons name="ellipsis-vertical" color={COLORS.muted} size={20} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function DownloadGroup({
  group,
  open,
  onToggle,
  onOpenFile,
  onPlay,
}: {
  group: DownloadSection;
  open: boolean;
  onToggle: () => void;
  onOpenFile: (file: DownloadFile) => void;
  onPlay?: () => void;
}) {
  const files = sortedDownloadFiles(group.files);
  if (!files.length) return null;

  return (
    <View style={[styles.downloadGroup, open && styles.downloadGroupOpen]}>
      <Pressable onPress={onToggle} style={styles.downloadGroupHead}>
        <View style={styles.downloadGroupText}>
          <Text style={styles.downloadGroupTitle}>{group.title}</Text>
          <Text style={styles.downloadGroupSubtitle}>
            {group.subtitle || `${toPersianDigits(files.length)} کیفیت دانلود مستقیم`}
          </Text>
        </View>
        <View style={styles.downloadGroupBadge}>
          <Text style={styles.downloadGroupBadgeText}>
            {group.badge || (group.language === 'dubbed' ? 'دوبله' : 'زیرنویس')}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} color={COLORS.gold} size={19} />
      </Pressable>
      {open ? (
        <View style={styles.qualityList}>
          {onPlay ? (
            <Pressable onPress={onPlay} style={styles.languagePlayButton}>
              <Ionicons name="play" color="#fff" size={17} />
              <Text style={styles.languagePlayButtonText}>پخش آنلاین این نسخه</Text>
            </Pressable>
          ) : null}
          {files.map((file) => {
            const label = cleanMediaLabel(file.label);
            return (
              <View key={file.id} style={styles.qualityRow}>
                <View style={styles.qualityInfo}>
                  <Text style={styles.qualityName}>{cleanQualityLabel(file.quality)}</Text>
                  <Text style={styles.qualityMeta}>
                    {[label, file.size].filter(Boolean).join(' • ') || 'فایل آماده دریافت'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onOpenFile(file)}
                  style={styles.downloadButton}
                >
                  <Ionicons name="download-outline" color="#fff" size={16} />
                  <Text style={styles.downloadButtonText}>دریافت</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function EpisodeDownloadGroup({
  group,
  open,
  openLanguage,
  onToggle,
  onToggleLanguage,
  onOpenFile,
  onPlayLanguage,
}: {
  group: DownloadSection;
  open: boolean;
  openLanguage: string | null;
  onToggle: (defaultLanguageId: string | null) => void;
  onToggleLanguage: (id: string) => void;
  onOpenFile: (file: DownloadFile) => void;
  onPlayLanguage: (language: MediaLanguage) => void;
}) {
  const languageGroups = languageSectionsForFiles(group.files, group.id);
  if (!languageGroups.length) return null;

  return (
    <View style={[styles.episodeGroup, open && styles.episodeGroupOpen]}>
      <Pressable
        onPress={() => onToggle(languageGroups[0]?.id || null)}
        style={styles.episodeGroupHead}
      >
        <View style={styles.episodeGroupText}>
          <Text style={styles.episodeGroupTitle}>
            قسمت {toPersianDigits(group.episodeNumber || 0)}
          </Text>
          <Text numberOfLines={1} style={styles.episodeGroupSubtitle}>
            {cleanMediaLabel(group.subtitle) || `${toPersianDigits(languageGroups.length)} نسخه قابل دریافت`}
          </Text>
        </View>
        <View style={styles.episodeNumberBadge}>
          <Text style={styles.episodeNumberBadgeText}>E{toPersianDigits(group.episodeNumber || 0)}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} color={COLORS.gold} size={19} />
      </Pressable>
      {open ? (
        <View style={styles.episodeLanguageList}>
          {languageGroups.map((languageGroup) => (
            <DownloadGroup
              key={languageGroup.id}
              group={languageGroup}
              open={openLanguage === languageGroup.id}
              onToggle={() => onToggleLanguage(languageGroup.id)}
              onOpenFile={onOpenFile}
              onPlay={playbackSourcesForLanguage(group.files, languageGroup.language!).length
                ? () => onPlayLanguage(languageGroup.language!)
                : undefined}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SeriesEpisodeList({
  item,
  openGroup,
  openLanguage,
  onToggleEpisode,
  onToggleLanguage,
  onOpenFile,
  onPlayLanguage,
}: {
  item: CatalogItem;
  openGroup: string | null;
  openLanguage: string | null;
  onToggleEpisode: (id: string, defaultLanguageId: string | null) => void;
  onToggleLanguage: (id: string) => void;
  onOpenFile: (file: DownloadFile) => void;
  onPlayLanguage: (group: DownloadSection, language: MediaLanguage) => void;
}) {
  const episodeGroups = [...(item.downloads || [])]
    .filter((group) => isEpisodeSection(group) && languageSectionsForFiles(group.files, group.id).length > 0)
    .sort(compareEpisodeGroupsNewestFirst);

  const seasons = episodeGroups.reduce<Record<number, DownloadSection[]>>((result, group) => {
    const seasonNumber = Number(group.seasonNumber || 1);
    if (!result[seasonNumber]) result[seasonNumber] = [];
    result[seasonNumber].push(group);
    return result;
  }, {});

  return (
    <View style={styles.seriesEpisodes}>
      {Object.entries(seasons)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([seasonNumber, groups]) => (
          <View key={seasonNumber} style={styles.seasonBlock}>
            <View style={styles.seasonTitleRow}>
              <Text style={styles.seasonTitle}>فصل {toPersianDigits(seasonNumber)}</Text>
              <Text style={styles.seasonCount}>{toPersianDigits(groups.length)} قسمت</Text>
            </View>
            {groups.map((group) => (
              <EpisodeDownloadGroup
                key={group.id}
                group={group}
                open={openGroup === group.id}
                openLanguage={openLanguage}
                onToggle={(defaultLanguageId) => onToggleEpisode(group.id, defaultLanguageId)}
                onToggleLanguage={onToggleLanguage}
                onOpenFile={onOpenFile}
                onPlayLanguage={(language) => onPlayLanguage(group, language)}
              />
            ))}
          </View>
        ))}
    </View>
  );
}

function DetailModal({
  item,
  visible,
  onClose,
  favorite,
  onFavorite,
  onStream,
  onDownload,
}: {
  item: CatalogItem | null;
  visible: boolean;
  onClose: () => void;
  favorite: boolean;
  onFavorite: () => void;
  onStream: (item: CatalogItem, episodeGroup?: DownloadSection | null, language?: MediaLanguage) => void;
  onDownload: (item: CatalogItem, file: DownloadFile) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openLanguage, setOpenLanguage] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<IranAccessStatus | 'checking'>('checking');

  const verifyNetworkAccess = async (forceRefresh = false) => {
    setAccessStatus('checking');
    const result = await checkIranNetworkAccess(forceRefresh);
    setAccessStatus(result.status);
  };

  useEffect(() => {
    setOpenGroup(null);
    setOpenLanguage(null);
    if (visible && item?.id) {
      void verifyNetworkAccess(false);
    }
  }, [item?.id, visible]);

  if (!item) return null;
  const downloadGroups = item.downloads || [];
  const episodeGroups = downloadGroups.filter(
    (group) => isEpisodeSection(group) && languageSectionsForFiles(group.files, group.id).length > 0,
  );
  const movieDownloadGroups = downloadGroups
    .filter((group) => !isEpisodeSection(group) && sortedDownloadFiles(group.files).length > 0)
    .sort((a, b) =>
      LANGUAGE_ORDER.indexOf(a.language || 'subtitled') -
      LANGUAGE_ORDER.indexOf(b.language || 'subtitled'),
    );
  const hasDownloads = item.type === 'series'
    ? episodeGroups.length > 0
    : movieDownloadGroups.length > 0;
  const latestEpisode = newestEpisodeGroup(item);
  const hasPlayableStream = playableVersionsFor(item).length > 0;
  const accessAllowed = accessStatus === 'allowed';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView
        style={styles.detailScreen}
        edges={['top', 'right', 'bottom', 'left']}
      >
        <StatusBar style="light" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
          <View style={styles.detailHero}>
            <Image source={{ uri: item.backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={['rgba(7,9,12,0.06)', COLORS.background]} style={StyleSheet.absoluteFill} />
            <View style={styles.detailTopBar}>
              <Pressable onPress={onClose} style={styles.detailCircleButton}>
                <Ionicons name="arrow-forward" color="#fff" size={21} />
              </Pressable>
              <Pressable onPress={onFavorite} style={styles.detailCircleButton}>
                <Ionicons name={favorite ? 'bookmark' : 'bookmark-outline'} color={favorite ? COLORS.gold : '#fff'} size={21} />
              </Pressable>
            </View>
            <View style={styles.detailIdentity}>
              <Image source={{ uri: item.poster }} style={styles.detailPoster} contentFit="cover" />
              <View style={styles.detailTitleBlock}>
                <Text style={styles.detailType}>{item.type === 'movie' ? 'فیلم سینمایی' : 'سریال'}</Text>
                <Text numberOfLines={2} style={styles.detailTitle}>{item.nameFa}</Text>
                <Text style={styles.detailEnglish}>{item.name}</Text>
                <View style={styles.detailMeta}>
                  <Text style={styles.detailMetaText}>{toPersianDigits(item.year)}</Text>
                  {typeof item.rate === 'number' ? <Text style={styles.detailMetaText}>IMDb {toPersianDigits(item.rate)}</Text> : null}
                  {item.type === 'series' && latestEpisode ? (
                    <Text style={styles.detailMetaText}>
                      تا قسمت {toPersianDigits(latestEpisode.episodeNumber || 0)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.detailBody}>
            <View style={styles.detailActions}>
              {item.type === 'movie' && accessAllowed ? (
                <Pressable
                  onPress={() => hasPlayableStream
                    ? onStream(item)
                    : Alert.alert('پخش آنلاین', 'پخش این عنوان فعلاً در دسترس نیست.')}
                  style={[styles.watchButton, !hasPlayableStream && styles.watchButtonDisabled]}
                >
                  <Ionicons name="play" color="#fff" size={19} />
                  <Text style={styles.watchButtonText}>پخش آنلاین</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => void shareCatalogItem(item)}
                style={styles.detailSecondaryButton}
              >
                <Ionicons name="share-social-outline" color={COLORS.text} size={20} />
              </Pressable>
            </View>

            <View style={styles.genreRow}>
              {item.genres.map((genre) => <Text key={genre} style={styles.detailGenre}>{genre}</Text>)}
            </View>

            <Text style={styles.detailSectionTitle}>داستان {item.nameFa}</Text>
            <Text style={styles.detailOverview}>{item.overview}</Text>

            <View style={styles.downloadHeader}>
              <View>
                <Text style={styles.detailSectionTitle}>
                  {item.type === 'series' ? 'فصل‌ها و قسمت‌ها' : 'لینک‌های دریافت'}
                </Text>
                <Text style={styles.downloadHeaderText}>
                  {item.type === 'series'
                    ? 'قسمت را باز کنید؛ دوبله و زیرنویس هر قسمت جدا نمایش داده می‌شوند.'
                    : 'دوبله و زیرنویس جدا هستند؛ با باز شدن یکی، بخش دیگر بسته می‌شود.'}
                </Text>
              </View>
              <Ionicons
                name={item.type === 'series' ? 'albums-outline' : 'cloud-download-outline'}
                color={COLORS.gold}
                size={24}
              />
            </View>

            {!accessAllowed ? (
              <View style={styles.networkAccessCard}>
                {accessStatus === 'checking' ? (
                  <>
                    <ActivityIndicator color={COLORS.gold} size="small" />
                    <Text style={styles.networkAccessTitle}>در حال بررسی اتصال…</Text>
                    <Text style={styles.networkAccessText}>لطفاً چند لحظه صبر کنید.</Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name={accessStatus === 'blocked' ? 'shield-outline' : 'cloud-offline-outline'}
                      color={COLORS.gold}
                      size={27}
                    />
                    <Text style={styles.networkAccessTitle}>
                      {accessStatus === 'blocked' ? 'فیلترشکن را خاموش کنید' : 'بررسی اتصال انجام نشد'}
                    </Text>
                    <Text style={styles.networkAccessText}>
                      {accessStatus === 'blocked'
                        ? 'برای پخش و دانلود فیلم‌ها، فیلترشکن خود را خاموش کنید.'
                        : 'اینترنت را بررسی کنید و دوباره تلاش کنید.'}
                    </Text>
                    <Pressable
                      onPress={() => void verifyNetworkAccess(true)}
                      style={styles.networkRetryButton}
                    >
                      <Ionicons name="refresh" color="#fff" size={17} />
                      <Text style={styles.networkRetryButtonText}>بررسی دوباره</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : (
              <>
                {item.type === 'series' && episodeGroups.length ? (
                  <SeriesEpisodeList
                    item={item}
                    openGroup={openGroup}
                    openLanguage={openLanguage}
                    onToggleEpisode={(id) => {
                      if (openGroup === id) {
                        setOpenGroup(null);
                        setOpenLanguage(null);
                        return;
                      }
                      setOpenGroup(id);
                      setOpenLanguage(null);
                    }}
                    onToggleLanguage={(id) => setOpenLanguage(openLanguage === id ? null : id)}
                    onOpenFile={(file) => onDownload(item, file)}
                    onPlayLanguage={(group, language) => onStream(item, group, language)}
                  />
                ) : (
                  movieDownloadGroups.map((group) => (
                    <DownloadGroup
                      key={group.id}
                      group={group}
                      open={openGroup === group.id}
                      onToggle={() => setOpenGroup(openGroup === group.id ? null : group.id)}
                      onOpenFile={(file) => onDownload(item, file)}
                      onPlay={group.language && playableVersionsFor(item).some((version) => version.language === group.language)
                        ? () => onStream(item, null, group.language)
                        : undefined}
                    />
                  ))
                )}

                {!hasDownloads ? (
                  <View style={styles.noDownloadsCard}>
                    <Ionicons name="link-outline" color={COLORS.muted} size={25} />
                    <Text style={styles.noDownloadsTitle}>
                      {item.type === 'series' ? 'هنوز قسمتی برای نمایش نیست' : 'لینک دریافت موجود نیست'}
                    </Text>
                    <Text style={styles.noDownloadsText}>بعداً دوباره بررسی کنید.</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function VideoPlayerModal({
  request,
  onClose,
}: {
  request: VideoRequest;
  onClose: () => void;
}) {
  const initialSource =
    request.sources.find((source) => source.id === request.initialSourceId) ||
    request.sources[0];
  const [activeSource, setActiveSource] = useState(initialSource);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [switchingQuality, setSwitchingQuality] = useState(false);
  const player = useVideoPlayer(initialSource.url, (instance) => {
    instance.play();
  });

  const switchQuality = async (nextSource: PlaybackSource) => {
    if (nextSource.id === activeSource.id || switchingQuality) {
      setQualityMenuOpen(false);
      return;
    }

    const currentTime = Number(player.currentTime || 0);
    setSwitchingQuality(true);
    setQualityMenuOpen(false);
    try {
      player.pause();
      await player.replaceAsync(nextSource.url);
      if (currentTime > 0) player.currentTime = currentTime;
      setActiveSource(nextSource);
      player.play();
    } catch {
      Alert.alert('کیفیت پخش', 'تغییر کیفیت انجام نشد. دوباره تلاش کنید.');
      player.play();
    } finally {
      setSwitchingQuality(false);
    }
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <SafeAreaView
        style={styles.mediaModal}
        edges={['top', 'right', 'bottom', 'left']}
      >
        <StatusBar style="light" />
        <View style={styles.mediaModalHeader}>
          <Pressable onPress={onClose} style={styles.mediaCloseButton}>
            <Ionicons name="close" color="#fff" size={23} />
          </Pressable>
          <Text numberOfLines={1} style={styles.mediaModalTitle}>{request.title}</Text>
          <Pressable
            onPress={() => request.sources.length > 1 && setQualityMenuOpen(true)}
            style={[styles.playerQualityButton, request.sources.length <= 1 && styles.playerQualityButtonDisabled]}
          >
            <Ionicons name="settings-outline" color={COLORS.gold} size={18} />
            <Text style={styles.playerQualityButtonText}>{activeSource.quality}</Text>
          </Pressable>
        </View>
        <View style={styles.videoStage}>
          <VideoView
            player={player}
            style={styles.videoView}
            nativeControls
            contentFit="contain"
            allowsPictureInPicture
          />
          {switchingQuality ? (
            <View style={styles.qualitySwitchLoading}>
              <ActivityIndicator color={COLORS.gold} size="large" />
              <Text style={styles.qualitySwitchLoadingText}>در حال تغییر کیفیت…</Text>
            </View>
          ) : null}
          {qualityMenuOpen ? (
            <View style={styles.playerQualityOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setQualityMenuOpen(false)} />
              <View style={styles.playerQualityCard}>
                <View style={styles.playerQualityHeader}>
                  <Text style={styles.playerQualityTitle}>کیفیت پخش</Text>
                  <Text style={styles.playerQualityDescription}>کیفیت پیش‌فرض ۴۸۰p است.</Text>
                </View>
                {request.sources.map((source) => {
                  const selected = source.id === activeSource.id;
                  return (
                    <Pressable
                      key={source.id}
                      onPress={() => switchQuality(source)}
                      style={[styles.playerQualityOption, selected && styles.playerQualityOptionSelected]}
                    >
                      <Text style={[styles.playerQualityOptionText, selected && styles.playerQualityOptionTextSelected]}>
                        {source.quality}
                      </Text>
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        color={selected ? COLORS.gold : COLORS.muted}
                        size={20}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function BottomNavigation({
  active,
  onChange,
}: {
  active: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  const tabs: { id: MainTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'home', label: 'خانه', icon: 'home-outline' },
    { id: 'search', label: 'جست‌وجو', icon: 'search-outline' },
    { id: 'favorites', label: 'نشان‌شده', icon: 'bookmark-outline' },
    { id: 'downloads', label: 'دریافت‌ها', icon: 'download-outline' },
  ];

  return (
    <View style={styles.bottomNavigation}>
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <Pressable key={tab.id} onPress={() => onChange(tab.id)} style={styles.bottomTab}>
            <View style={[styles.bottomIconWrap, selected && styles.bottomIconWrapActive]}>
              <Ionicons
                name={selected ? (tab.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : tab.icon}
                color={selected ? COLORS.text : COLORS.muted}
                size={20}
              />
            </View>
            <Text style={[styles.bottomLabel, selected && styles.bottomLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const downloadsRef = useRef<DownloadRecord[]>([]);
  const [videoRequest, setVideoRequest] = useState<VideoRequest | null>(null);

  const reloadContent = async () => {
    setContentLoading(true);
    const nextContent = await loadContent();
    setContent(nextContent);
    setContentLoading(false);
  };

  useEffect(() => {
    reloadContent();
    loadDownloadRecords().then(setDownloads);

    const warningTimer = setTimeout(() => {
      Alert.alert(
        'پخش و دانلود',
        'برای پخش و دانلود فیلم‌ها، فیلترشکن خود را خاموش کنید.',
        [{ text: 'متوجه شدم' }],
      );
    }, 650);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reloadContent();
    });

    return () => {
      clearTimeout(warningTimer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    downloadsRef.current = downloads;
    const timer = setTimeout(() => {
      saveDownloadRecords(downloads).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [downloads]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  };

  const openCatalogFilter = (filter: SearchFilter) => {
    setSearchFilter(filter);
    setActiveTab('search');
  };

  const openStreamInsideApp = async (
    item: CatalogItem,
    episodeGroup: DownloadSection | null = null,
    _requestedLanguage?: MediaLanguage,
  ) => {
    const access = await checkIranNetworkAccess();
    if (access.status !== 'allowed') {
      showNetworkAccessAlert(access.status);
      return;
    }

    const versions = playableVersionsFor(item, episodeGroup);
    if (!versions.length) {
      Alert.alert('پخش آنلاین', 'پخش این نسخه فعلاً در دسترس نیست.');
      return;
    }

    const playVersion = (version: PlayableVersion) => {
      const episodeLabel = episodeGroup
        ? ` — فصل ${toPersianDigits(episodeGroup.seasonNumber || 1)}، قسمت ${toPersianDigits(episodeGroup.episodeNumber || 0)}`
        : '';
      setVideoRequest({
        title: `${item.nameFa}${episodeLabel} — ${languageTitle(version.language)}`,
        sources: version.sources,
        initialSourceId: version.defaultSource.id,
      });
    };

    if (versions.length === 1) {
      playVersion(versions[0]);
      return;
    }

    const dubbed = versions.find((version) => version.language === 'dubbed');
    const subtitled = versions.find((version) => version.language === 'subtitled');

    Alert.alert(
      'انتخاب نسخه پخش',
      'نسخه دوبله را می‌خواهید یا زیرنویس؟',
      [
        ...(dubbed ? [{ text: 'دوبله فارسی', onPress: () => playVersion(dubbed) }] : []),
        ...(subtitled ? [{ text: 'زیرنویس فارسی', onPress: () => playVersion(subtitled) }] : []),
        { text: 'انصراف', style: 'cancel' },
      ],
    );
  };

  const playDownloadedRecord = (record: DownloadRecord) => {
    if (!record.localUri) return;
    const source: PlaybackSource = {
      id: record.id,
      url: record.localUri,
      quality: record.quality || 'فایل ذخیره‌شده',
      rank: 0,
    };
    setVideoRequest({ title: record.title, sources: [source], initialSourceId: source.id });
  };

  const executeDownload = async (record: DownloadRecord) => {
    const runningRecord: DownloadRecord = {
      ...record,
      status: 'downloading',
      error: undefined,
    };

    setDownloads((current) => current.map((item) =>
      item.id === record.id ? runningRecord : item,
    ));

    try {
      const result = await runDownload({
        record: runningRecord,
        onProgress: ({ progress, bytesWritten, totalBytes }) => {
          setDownloads((current) => current.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  progress,
                  bytesWritten,
                  totalBytes,
                  destinationUri: item.destinationUri || runningRecord.destinationUri,
                }
              : item,
          ));
        },
      });

      if (result.paused || !result.localUri) return;

      setDownloads((current) => current.map((item) =>
        item.id === record.id
          ? {
              ...item,
              localUri: result.localUri,
              destinationUri: result.localUri,
              resumeData: undefined,
              progress: 1,
              status: 'completed' as const,
              error: undefined,
            }
          : item,
      ));
    } catch (error) {
      const stillExists = downloadsRef.current.some((item) => item.id === record.id);
      if (!stillExists) return;
      const message = 'دریافت فایل انجام نشد. دوباره تلاش کنید.';
      setDownloads((current) => current.map((item) =>
        item.id === record.id
          ? { ...item, status: 'failed' as const, error: message }
          : item,
      ));
    }
  };

  const startDownloadInsideApp = async (item: CatalogItem, file: DownloadFile) => {
    const access = await checkIranNetworkAccess();
    if (access.status !== 'allowed') {
      showNetworkAccessAlert(access.status);
      return;
    }

    if (!isSafeHttpUrl(file.url) || isPlaceholderUrl(file.url)) {
      Alert.alert('دریافت فایل', 'این فایل فعلاً در دسترس نیست.');
      return;
    }

    const fileMode = downloadModeFor(file);

    if (fileMode === 'play') {
      const source: PlaybackSource = { id: file.id, url: file.url, quality: cleanQualityLabel(file.quality), rank: qualityRank(file) };
      setVideoRequest({ title: `${item.nameFa} — ${cleanQualityLabel(file.quality)}`, sources: [source], initialSourceId: source.id });
      return;
    }

    if (!/\.mp4(?:$|[?#])/i.test(file.url)) {
      Alert.alert('دریافت فایل', 'دریافت این کیفیت فعلاً در دسترس نیست.');
      return;
    }

    const recordId = `${item.id}-${file.id}`;
    const existing = downloadsRef.current.find((record) => record.id === recordId);
    if (existing?.status === 'completed' && existing.localUri) {
      Alert.alert('دریافت فایل', 'این کیفیت قبلاً دانلود شده و در بخش «دریافت‌ها» آماده پخش است.');
      return;
    }
    if (existing?.status === 'downloading') {
      Alert.alert('دریافت فایل', 'این فایل همین حالا در حال دانلود است.');
      return;
    }
    if (existing && (existing.status === 'paused' || existing.status === 'failed')) {
      setActiveTab('downloads');
      setSelectedItem(null);
      void executeDownload(existing);
      return;
    }

    const pending: DownloadRecord = {
      id: recordId,
      itemId: item.id,
      title: item.nameFa,
      subtitle: item.name,
      quality: cleanQualityLabel(file.quality),
      sourceUrl: file.url,
      fileName: `${item.name}-${cleanQualityLabel(file.quality)}`,
      progress: 0,
      status: 'downloading',
      createdAt: new Date().toISOString(),
    };

    setDownloads((current) => [pending, ...current.filter((record) => record.id !== recordId)]);
    setActiveTab('downloads');
    setSelectedItem(null);
    void executeDownload(pending);
  };

  const pauseDownloadRecord = async (record: DownloadRecord) => {
    try {
      const snapshot = await pauseDownload(record.id);
      if (!snapshot) {
        Alert.alert('توقف دانلود', 'این دانلود در حال حاضر فعال نیست.');
        return;
      }
      setDownloads((current) => current.map((item) =>
        item.id === record.id
          ? {
              ...item,
              status: 'paused' as const,
              destinationUri: snapshot.destinationUri,
              resumeData: snapshot.resumeData,
              error: undefined,
            }
          : item,
      ));
    } catch (error) {
      Alert.alert('توقف دانلود', 'توقف دانلود انجام نشد. دوباره تلاش کنید.');
    }
  };

  const resumeDownloadRecord = (record: DownloadRecord) => {
    void executeDownload(record);
  };

  const deleteDownloadNow = async (record: DownloadRecord) => {
    await cancelDownload(record.id).catch(() => undefined);
    await removeDownloadedFile(record.localUri, record.destinationUri).catch(() => undefined);
    setDownloads((current) => current.filter((item) => item.id !== record.id));
  };

  const confirmDeleteDownload = (record: DownloadRecord) => {
    Alert.alert(
      'حذف فایل',
      'این فایل از حافظه برنامه حذف شود؟',
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => void deleteDownloadNow(record) },
      ],
    );
  };

  const saveDownloadInGallery = async (record: DownloadRecord) => {
    try {
      await saveDownloadedFileToGallery(record.localUri);
      Alert.alert('ذخیره شد', 'ویدئو در گالری گوشی ذخیره شد.');
    } catch (error) {
      Alert.alert('ذخیره در گالری', 'ذخیره فایل انجام نشد. دسترسی گالری را بررسی کنید.');
    }
  };

  const showDownloadMenu = (record: DownloadRecord) => {
    const completed = record.status === 'completed' && Boolean(record.localUri);
    Alert.alert(
      record.title,
      [record.subtitle, record.quality].filter(Boolean).join(' • '),
      [
        ...(completed ? [{ text: 'پخش فایل', onPress: () => playDownloadedRecord(record) }] : []),
        ...(completed ? [{ text: 'ذخیره در گالری', onPress: () => void saveDownloadInGallery(record) }] : []),
        { text: 'حذف فایل', style: 'destructive', onPress: () => confirmDeleteDownload(record) },
        { text: 'انصراف', style: 'cancel' },
      ],
    );
  };

  if (!content) {
    return (
      <SafeAreaView
        style={styles.initialLoading}
        edges={['top', 'right', 'bottom', 'left']}
      >
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.gold} size="large" />
        <Text style={styles.initialLoadingTitle}>در حال آماده‌سازی آپاراتچی…</Text>
        <Text style={styles.initialLoadingText}>در حال دریافت تازه‌ترین فیلم‌ها و سریال‌ها…</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'right', 'left']}
      >
        {activeTab === 'home' ? (
          <HomeScreen
            catalog={content.items}
            iranianSchedule={content.iranianSchedule}
            weeklySchedule={content.weeklySchedule || []}
            onReloadContent={reloadContent}
            onOpen={setSelectedItem}
            onBrowse={openCatalogFilter}
          />
        ) : null}
        {activeTab === 'search' ? (
          <SearchScreen
            catalog={content.items}
            onOpen={setSelectedItem}
            initialFilter={searchFilter}
          />
        ) : null}
        {activeTab === 'favorites' ? (
          <FavoritesScreen catalog={content.items} favorites={favorites} onOpen={setSelectedItem} />
        ) : null}
        {activeTab === 'downloads' ? (
          <DownloadsScreen
            downloads={downloads}
            onPlay={playDownloadedRecord}
            onPause={pauseDownloadRecord}
            onResume={resumeDownloadRecord}
            onMenu={showDownloadMenu}
          />
        ) : null}
        {contentLoading ? (
          <View pointerEvents="none" style={styles.refreshIndicator}>
            <ActivityIndicator color={COLORS.gold} size="small" />
          </View>
        ) : null}
      </SafeAreaView>
      <SafeAreaView
        style={styles.bottomNavigationSafeArea}
        edges={['right', 'bottom', 'left']}
      >
        <BottomNavigation
          active={activeTab}
          onChange={(tab) => {
            if (tab === 'search') setSearchFilter('all');
            setActiveTab(tab);
          }}
        />
      </SafeAreaView>
      <DetailModal
        item={selectedItem}
        visible={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        favorite={selectedItem ? favorites.includes(selectedItem.id) : false}
        onFavorite={() => selectedItem && toggleFavorite(selectedItem.id)}
        onStream={openStreamInsideApp}
        onDownload={startDownloadInsideApp}
      />
      {videoRequest ? (
        <VideoPlayerModal
          request={videoRequest}
          onClose={() => setVideoRequest(null)}
        />
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppContent />
    </SafeAreaProvider>
  );
}

const rtlText = {
  writingDirection: 'rtl' as const,
  textAlign: 'right' as const,
  includeFontPadding: false,
};

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  bottomNavigationSafeArea: { backgroundColor: COLORS.background, paddingHorizontal: 10, paddingTop: 6 },
  screen: { flex: 1, backgroundColor: COLORS.background },
  initialLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, backgroundColor: COLORS.background },
  initialLoadingTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 16 },
  initialLoadingText: { ...rtlText, color: COLORS.muted, fontSize: 10, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  refreshIndicator: { position: 'absolute', top: 14, left: 14, width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,19,25,0.94)', borderWidth: 1, borderColor: COLORS.border },
  contentUnavailable: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  retryButton: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.red },
  retryButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  homeContent: { paddingBottom: 34 },
  tabScreenContent: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 18 },
  header: {
    height: 66,
    paddingHorizontal: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(7,9,12,0.98)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  logoWrap: { alignItems: 'flex-end' },
  logo: { ...rtlText, color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  logoTag: { ...rtlText, color: COLORS.gold, fontSize: 8, fontWeight: '700', marginTop: -1 },
  headerActions: { flexDirection: 'row', gap: 9 },
  iconButton: {
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contentStatus: { marginHorizontal: 18, marginTop: 12, marginBottom: 2, minHeight: 55, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  contentStatusTextWrap: { flex: 1, alignItems: 'flex-end', marginLeft: 10 },
  contentStatusTitle: { ...rtlText, color: COLORS.text, fontSize: 10, fontWeight: '900' },
  contentStatusMeta: { ...rtlText, color: COLORS.muted, fontSize: 8, marginTop: 4 },
  heroSlider: { height: 448, position: 'relative', overflow: 'hidden', backgroundColor: COLORS.surface },
  heroSlide: { flex: 1 },
  hero: { flex: 1, overflow: 'hidden', justifyContent: 'flex-end' },
  heroDots: { position: 'absolute', bottom: 13, left: 0, right: 0, zIndex: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.34)' },
  heroDotActive: { width: 23, backgroundColor: COLORS.red },
  heroContent: { paddingHorizontal: 20, paddingBottom: 34, alignItems: 'flex-end' },
  heroBadgeRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 10 },
  redBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(222,35,66,0.92)' },
  redBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  yearBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.25)' },
  yearBadgeText: { color: COLORS.text, fontSize: 10, fontWeight: '800' },
  heroTitle: { ...rtlText, color: COLORS.text, fontSize: 32, lineHeight: 41, fontWeight: '900', letterSpacing: -1.1, maxWidth: '94%' },
  heroEnglish: { color: '#A4A8AE', fontSize: 10.5, letterSpacing: 1, marginTop: 1, marginBottom: 12, width: '100%', textAlign: 'right' },
  heroMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  ratingChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(216,180,90,0.45)', backgroundColor: 'rgba(0,0,0,0.25)' },
  imdb: { color: COLORS.text, fontSize: 8, fontWeight: '900' },
  rating: { color: COLORS.gold, fontSize: 12, fontWeight: '900' },
  metaChip: { color: '#E1E2E3', fontSize: 10, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(0,0,0,0.2)' },
  heroOverview: { ...rtlText, color: '#BEC2C8', fontSize: 11.5, lineHeight: 20, marginTop: 12, maxWidth: 360 },
  heroButtons: { flexDirection: 'row-reverse', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  primaryButton: { height: 48, alignSelf: 'stretch', marginTop: 16, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.red, shadowColor: COLORS.red, shadowOpacity: 0.35, shadowRadius: 18, elevation: 5 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  roundButton: { width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(10,12,15,0.65)' },
  scheduleSection: { marginHorizontal: 12, marginTop: 34, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(216,180,90,0.24)', backgroundColor: '#0C0F14', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 6 },
  scheduleHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  eyebrow: { ...rtlText, color: COLORS.red, fontSize: 10, fontWeight: '900', marginBottom: 4 },
  sectionTitle: { ...rtlText, color: COLORS.text, fontSize: 18, lineHeight: 27, fontWeight: '900', letterSpacing: -0.45 },
  verifiedPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.22)' },
  verifiedText: { color: '#C9B174', fontSize: 8, fontWeight: '800' },
  daysRow: { flexDirection: 'row-reverse', gap: 7, paddingVertical: 14 },
  dayButton: { minWidth: 76, height: 57, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#101319' },
  dayButtonActive: { borderColor: 'rgba(216,180,90,0.62)', backgroundColor: 'rgba(216,180,90,0.12)' },
  dayLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  dayLabelActive: { color: COLORS.text },
  dayCount: { color: '#5E646D', fontSize: 8, marginTop: 5 },
  dayCountActive: { color: COLORS.gold },
  segment: { flexDirection: 'row-reverse', gap: 4, padding: 4, borderRadius: 11, backgroundColor: '#07090C', marginBottom: 10 },
  segmentButton: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentButtonActive: { backgroundColor: COLORS.surfaceStrong },
  segmentText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  segmentTextActive: { color: COLORS.text },
  scheduleLoading: { minHeight: 48, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 9 },
  scheduleLoadingText: { ...rtlText, color: COLORS.muted, fontSize: 10 },
  scheduleList: { gap: 7 },
  scheduleCard: { minHeight: 72, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 7, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  schedulePoster: { width: 48, height: 58, borderRadius: 8, backgroundColor: COLORS.surfaceStrong },
  scheduleCardBody: { flex: 1, alignItems: 'flex-end' },
  scheduleSourceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  scheduleRegion: { color: COLORS.blue, fontSize: 8, fontWeight: '800' },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.red },
  scheduleName: { ...rtlText, color: COLORS.text, fontSize: 13, fontWeight: '900', marginTop: 5 },
  scheduleEpisode: { ...rtlText, color: COLORS.muted, fontSize: 9, marginTop: 3 },
  scheduleTimeWrap: { alignItems: 'center', gap: 5 },
  scheduleTime: { color: COLORS.gold, fontSize: 12, fontWeight: '900' },
  scheduleEmpty: { minHeight: 135, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  scheduleEmptyTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '800', marginTop: 8 },
  scheduleEmptyText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 16, marginTop: 5, textAlign: 'center' },
  scheduleFootnote: { ...rtlText, color: '#5E646D', fontSize: 8, lineHeight: 15, marginTop: 11 },
  catalogSection: { marginTop: 30 },
  sectionTitleRow: { paddingHorizontal: 18, flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, paddingBottom: 2 },
  sectionActionText: { color: COLORS.gold, fontSize: 10, fontWeight: '800' },
  horizontalCatalogList: { direction: 'ltr' },
  horizontalCatalog: { gap: 11, paddingHorizontal: 18, paddingTop: 14 },
  posterCard: { width: 137, alignItems: 'flex-end' },
  posterImageWrap: { width: 137, height: 194, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: COLORS.surface },
  posterImage: { width: '100%', height: '100%' },
  posterGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 65 },
  posterAccess: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(222,35,66,0.9)' },
  posterAccessText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  posterEpisodeBadge: { position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(7,9,12,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  posterEpisodeText: { color: COLORS.text, fontSize: 8, fontWeight: '900' },
  posterRating: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(7,9,12,0.82)' },
  posterRatingText: { color: COLORS.text, fontSize: 9, fontWeight: '800' },
  posterName: { ...rtlText, color: COLORS.text, fontSize: 11, lineHeight: 18, fontWeight: '700', letterSpacing: -0.15, marginTop: 8, width: '100%' },
  posterEnglish: { color: '#777D87', fontSize: 8.5, lineHeight: 14, marginTop: 1, width: '100%', textAlign: 'right' },
  simpleHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  simpleHeaderTitle: { ...rtlText, color: COLORS.text, fontSize: 18, lineHeight: 27, fontWeight: '900', letterSpacing: -0.35 },
  searchBox: { height: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13, writingDirection: 'rtl' },
  searchFilters: { flexDirection: 'row-reverse', gap: 8, paddingTop: 13, paddingBottom: 2 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: 'rgba(222,35,66,0.13)', borderColor: 'rgba(222,35,66,0.45)' },
  filterChipText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  filterChipTextActive: { color: COLORS.text },
  resultCount: { ...rtlText, color: COLORS.muted, fontSize: 10, marginTop: 22, marginBottom: 12 },
  searchGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-start', rowGap: 20 },
  largeEmpty: { minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38 },
  largeEmptyIcon: { width: 74, height: 74, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.22)' },
  largeEmptyTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 18 },
  largeEmptyText: { ...rtlText, color: COLORS.muted, fontSize: 11, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  detailScreen: { flex: 1, backgroundColor: COLORS.background },
  detailContent: { paddingBottom: 36 },
  detailHero: { height: 410, justifyContent: 'flex-end' },
  detailTopBar: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 66, paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row-reverse', justifyContent: 'space-between' },
  detailCircleButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  detailIdentity: { paddingHorizontal: 18, paddingBottom: 16, flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 14 },
  detailPoster: { width: 94, height: 134, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  detailTitleBlock: { flex: 1, alignItems: 'flex-end', paddingBottom: 4 },
  detailType: { color: COLORS.red, fontSize: 9, fontWeight: '900', marginBottom: 7 },
  detailTitle: { ...rtlText, color: COLORS.text, fontSize: 26, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8, width: '100%' },
  detailEnglish: { color: '#8B9099', fontSize: 10, lineHeight: 16, marginTop: 2, width: '100%', textAlign: 'right' },
  detailMeta: { flexDirection: 'row-reverse', gap: 7, marginTop: 11 },
  detailMetaText: { color: '#CFD1D4', fontSize: 9, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(7,9,12,0.55)' },
  detailBody: { paddingHorizontal: 18 },
  detailActions: { flexDirection: 'row-reverse', gap: 10 },
  watchButton: { height: 50, flex: 1, borderRadius: 14, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.red },
  watchButtonDisabled: { opacity: 0.48 },
  watchButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  detailSecondaryButton: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  genreRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, marginTop: 17 },
  detailGenre: { color: '#C5C8CD', fontSize: 9, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  detailSectionTitle: { ...rtlText, color: COLORS.text, fontSize: 16, lineHeight: 25, fontWeight: '900', letterSpacing: -0.25, marginTop: 25 },
  detailOverview: { ...rtlText, color: '#AEB3BB', fontSize: 11.5, lineHeight: 22, marginTop: 9 },
  downloadHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  downloadHeaderText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 17, marginTop: 5 },
  downloadGroup: { marginTop: 8, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  downloadGroupOpen: { borderColor: 'rgba(216,180,90,0.5)' },
  downloadGroupHead: { minHeight: 72, paddingHorizontal: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  downloadGroupText: { flex: 1, alignItems: 'flex-end' },
  downloadGroupTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900' },
  downloadGroupSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8, marginTop: 5 },
  downloadGroupBadge: { minWidth: 38, height: 36, paddingHorizontal: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(216,180,90,0.4)', backgroundColor: 'rgba(216,180,90,0.08)' },
  downloadGroupBadgeText: { color: COLORS.gold, fontSize: 9, fontWeight: '900' },
  qualityList: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 12 },
  languagePlayButton: { minHeight: 44, marginTop: 10, marginBottom: 3, borderRadius: 11, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.red },
  languagePlayButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  qualityRow: { minHeight: 67, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  qualityInfo: { flex: 1, alignItems: 'flex-end' },
  qualityName: { ...rtlText, color: COLORS.text, fontSize: 13, lineHeight: 20, fontWeight: '900' },
  qualityMeta: { ...rtlText, color: COLORS.muted, fontSize: 8, marginTop: 4 },
  downloadButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.blue },
  downloadButtonText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  downloadEmptyRow: { minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  downloadEmptyText: { ...rtlText, color: COLORS.muted, fontSize: 9 },
  seriesEpisodes: { gap: 18 },
  seasonBlock: { gap: 7 },
  episodeGroup: { borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#0D1015' },
  episodeGroupOpen: { borderColor: 'rgba(216,180,90,0.45)' },
  episodeGroupHead: { minHeight: 72, paddingHorizontal: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  episodeGroupText: { flex: 1, alignItems: 'flex-end' },
  episodeGroupTitle: { ...rtlText, color: COLORS.text, fontSize: 13, fontWeight: '900' },
  episodeGroupSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8, marginTop: 5, maxWidth: '100%' },
  episodeNumberBadge: { minWidth: 42, height: 36, paddingHorizontal: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(222,35,66,0.12)', borderWidth: 1, borderColor: 'rgba(222,35,66,0.35)' },
  episodeNumberBadgeText: { color: COLORS.red, fontSize: 9, fontWeight: '900' },
  episodeLanguageList: { paddingHorizontal: 9, paddingBottom: 9, borderTopWidth: 1, borderTopColor: COLORS.border },
  seasonTitleRow: { minHeight: 38, paddingHorizontal: 4, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  seasonTitle: { ...rtlText, color: COLORS.text, fontSize: 14, fontWeight: '900' },
  seasonCount: { color: COLORS.gold, fontSize: 9, fontWeight: '800' },
  networkAccessCard: { minHeight: 170, marginTop: 8, paddingHorizontal: 24, paddingVertical: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(216,180,90,0.32)' },
  networkAccessTitle: { ...rtlText, color: COLORS.text, fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 11 },
  networkAccessText: { ...rtlText, color: COLORS.muted, fontSize: 10, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  networkRetryButton: { minWidth: 138, height: 42, marginTop: 16, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.red },
  networkRetryButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  noDownloadsCard: { minHeight: 145, marginTop: 8, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  noDownloadsTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900', marginTop: 9 },
  noDownloadsText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  bottomNavigation: { height: 69, marginBottom: 9, paddingHorizontal: 5, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: 'rgba(16,19,25,0.98)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, elevation: 12 },
  bottomTab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomIconWrap: { width: 37, height: 29, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bottomIconWrapActive: { backgroundColor: 'rgba(222,35,66,0.16)' },
  bottomLabel: { color: COLORS.muted, fontSize: 8.5, fontWeight: '700', marginTop: 3 },
  bottomLabelActive: { color: COLORS.text },
  downloadLibrary: { gap: 10 },
  downloadLibraryCard: { minHeight: 112, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  downloadLibraryInfo: { flex: 1, alignItems: 'flex-end' },
  downloadLibraryTitle: { ...rtlText, color: COLORS.text, fontSize: 14, fontWeight: '900', width: '100%' },
  downloadLibraryMeta: { ...rtlText, color: COLORS.muted, fontSize: 9, marginTop: 5, width: '100%' },
  downloadLibraryStatus: { ...rtlText, color: COLORS.gold, fontSize: 9, marginTop: 7, width: '100%' },
  downloadLibraryActions: { gap: 8 },
  downloadLibraryPlay: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.red },
  downloadLibraryControl: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.12)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.38)' },
  downloadLibraryMenu: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  progressTrack: { width: '100%', height: 6, borderRadius: 4, overflow: 'hidden', backgroundColor: '#080A0E', marginTop: 11 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.gold },
  playerQualityButton: { minWidth: 82, height: 38, paddingHorizontal: 9, borderRadius: 11, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.30)' },
  playerQualityButtonDisabled: { opacity: 0.55 },
  playerQualityButtonText: { color: COLORS.text, fontSize: 10, fontWeight: '900' },
  qualitySwitchLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
  qualitySwitchLoadingText: { ...rtlText, color: COLORS.text, fontSize: 11, fontWeight: '800', marginTop: 12 },
  playerQualityOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.56)', paddingHorizontal: 24 },
  playerQualityCard: { width: '100%', maxWidth: 330, borderRadius: 18, padding: 14, backgroundColor: '#101319', borderWidth: 1, borderColor: COLORS.border },
  playerQualityHeader: { alignItems: 'flex-end', paddingHorizontal: 4, paddingBottom: 10 },
  playerQualityTitle: { ...rtlText, color: COLORS.text, fontSize: 15, fontWeight: '900' },
  playerQualityDescription: { ...rtlText, color: COLORS.muted, fontSize: 9, marginTop: 5 },
  playerQualityOption: { minHeight: 48, paddingHorizontal: 12, marginTop: 7, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0B0E13', borderWidth: 1, borderColor: COLORS.border },
  playerQualityOptionSelected: { borderColor: 'rgba(216,180,90,0.58)', backgroundColor: 'rgba(216,180,90,0.07)' },
  playerQualityOptionText: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  playerQualityOptionTextSelected: { color: COLORS.gold },
  mediaModal: { flex: 1, backgroundColor: '#000' },
  webModal: { flex: 1, backgroundColor: COLORS.background },
  mediaModalHeader: { height: 62, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#080A0E', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mediaCloseButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong },
  mediaModalTitle: { ...rtlText, flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '900' },
  videoStage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  videoView: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  webView: { flex: 1, backgroundColor: '#fff' },
  webLoading: { ...StyleSheet.absoluteFillObject, top: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.72)' },

});
