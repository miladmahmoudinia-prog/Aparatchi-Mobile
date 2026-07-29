import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useEffect, useMemo, useState } from 'react';
import { COLORS, DAYS } from './src/data';
import { loadVerifiedForeignSchedule } from './src/foreignSchedule';
import { loadContent, LoadedContent } from './src/contentService';
import { CatalogItem, DayId, DownloadFile, DownloadSection, MediaLanguage, ScheduleEntry } from './src/types';
import {
  DownloadRecord,
  downloadToApp,
  loadDownloadRecords,
  removeDownloadedFile,
  saveDownloadRecords,
} from './src/downloadManager';

type MainTab = 'home' | 'search' | 'favorites' | 'downloads';
type ScheduleFilter = 'all' | 'iranian' | 'foreign';
type SearchFilter = 'all' | 'movie' | 'series' | MediaLanguage;

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

const downloadModeFor = (file: DownloadFile) =>
  file.mode === 'play' ? 'play' : 'download';

const LANGUAGE_ORDER: MediaLanguage[] = ['dubbed', 'subtitled'];

const languageTitle = (language: MediaLanguage) =>
  language === 'dubbed' ? 'دوبله فارسی' : 'زیرنویس فارسی';

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
          <View style={styles.notificationDot} />
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

function Hero({
  item,
  onOpen,
  favorite,
  onFavorite,
}: {
  item: CatalogItem;
  onOpen: () => void;
  favorite: boolean;
  onFavorite: () => void;
}) {
  return (
    <View style={styles.hero}>
      <Image source={{ uri: item.backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={280} />
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
        <Text style={styles.heroTitle}>{item.nameFa}</Text>
        <Text style={styles.heroEnglish}>{item.name}</Text>
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
        <View style={styles.heroButtons}>
          <Pressable onPress={onOpen} style={styles.primaryButton}>
            <Ionicons name="play" color="#fff" size={18} />
            <Text style={styles.primaryButtonText}>مشاهده و دریافت</Text>
          </Pressable>
          <Pressable onPress={onFavorite} style={styles.roundButton}>
            <Ionicons name={favorite ? 'bookmark' : 'bookmark-outline'} color={favorite ? COLORS.gold : '#fff'} size={21} />
          </Pressable>
        </View>
      </View>
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
  onOpenItem,
}: {
  catalog: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
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

  const allEntries = useMemo(
    () => [...iranianSchedule, ...foreignEntries],
    [iranianSchedule, foreignEntries],
  );

  const dayEntries = allEntries.filter(
    (entry) =>
      entry.day === selectedDay && (filter === 'all' || entry.region === filter),
  );

  return (
    <View style={styles.scheduleSection}>
      <View style={styles.scheduleHeader}>
        <View>
          <Text style={styles.eyebrow}>برنامه دقیق انتشار</Text>
          <Text style={styles.sectionTitle}>این هفته چی میاد؟</Text>
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
                {count ? `${toPersianDigits(count)} عنوان` : 'بدون برنامه'}
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

      {loadingForeign && filter !== 'iranian' ? (
        <View style={styles.scheduleLoading}>
          <ActivityIndicator color={COLORS.gold} size="small" />
          <Text style={styles.scheduleLoadingText}>در حال آماده‌سازی برنامه هفتگی…</Text>
        </View>
      ) : null}

      <View style={styles.scheduleList}>
        {dayEntries.map((entry) => {
          const item = catalog.find((candidate) => candidate.id === entry.itemId);
          if (!item) return null;
          return <ScheduleCard key={entry.id} entry={entry} onOpen={() => onOpenItem(item)} />;
        })}
        {!loadingForeign && !dayEntries.length ? (
          <View style={styles.scheduleEmpty}>
            <Ionicons name="calendar-outline" color={COLORS.muted} size={28} />
            <Text style={styles.scheduleEmptyTitle}>برای این روز برنامه‌ای ثبت نشده است</Text>
            <Text style={styles.scheduleEmptyText}>روز دیگری را انتخاب کنید.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function PosterCard({
  item,
  onOpen,
}: {
  item: CatalogItem;
  onOpen: () => void;
}) {
  const languageBadge = itemLanguageBadge(item);
  const latestEpisode = item.type === 'series' ? newestEpisodeGroup(item) : null;

  return (
    <Pressable onPress={onOpen} style={styles.posterCard}>
      <View style={styles.posterImageWrap}>
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
  onReloadContent,
  onOpen,
  onSearch,
  favorites,
  toggleFavorite,
}: {
  catalog: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
  onReloadContent: () => void;
  onOpen: (item: CatalogItem) => void;
  onSearch: () => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
}) {
  const hero = catalog[0];
  const movies = catalog.filter((item) => item.type === 'movie');
  const series = catalog.filter((item) => item.type === 'series');
  const seriesWithEpisodes = series.filter((item) =>
    (item.downloads || []).some(isEpisodeSection),
  );
  const freshEpisodeSeries = [...seriesWithEpisodes].sort(
    (a, b) => latestEpisodeTimestamp(b) - latestEpisodeTimestamp(a),
  );
  const featuredSeries = seriesWithEpisodes.length ? seriesWithEpisodes : series;

  if (!hero) {
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
      <Header
        onSearch={onSearch}
        onNotifications={() => Alert.alert('اعلان‌ها', 'اعلان قسمت‌های جدید در نسخه بعد فعال می‌شود.')}
      />

      <Hero
        item={hero}
        onOpen={() => onOpen(hero)}
        favorite={favorites.includes(hero.id)}
        onFavorite={() => toggleFavorite(hero.id)}
      />
      <WeeklySchedule catalog={catalog} iranianSchedule={iranianSchedule} onOpenItem={onOpen} />

      <View style={styles.catalogSection}>
        <SectionTitle eyebrow="تازه‌های آرشیو" title="جدیدترین فیلم‌ها" action="مشاهده همه" onAction={onSearch} />
        <HorizontalCatalog items={movies} onOpen={onOpen} />
      </View>

      {freshEpisodeSeries.length ? (
        <View style={styles.catalogSection}>
          <SectionTitle eyebrow="تازه‌ترین انتشارها" title="قسمت‌های تازه" action="مشاهده همه" onAction={onSearch} />
          <HorizontalCatalog items={freshEpisodeSeries} onOpen={onOpen} />
        </View>
      ) : null}

      {featuredSeries.length ? (
        <View style={styles.catalogSection}>
          <SectionTitle eyebrow="پیشنهاد برای تماشا" title="سریال‌های منتخب" action="مشاهده همه" onAction={onSearch} />
          <HorizontalCatalog items={featuredSeries} onOpen={onOpen} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function SearchScreen({ catalog, onOpen }: { catalog: CatalogItem[]; onOpen: (item: CatalogItem) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');

  const results = catalog.filter((item) => {
    const normalized = query.trim().toLowerCase();
    const matchesQuery =
      !normalized ||
      item.nameFa.includes(normalized) ||
      item.name.toLowerCase().includes(normalized);
    const matchesFilter =
      filter === 'all' ||
      item.type === filter ||
      ((filter === 'dubbed' || filter === 'subtitled') && itemLanguages(item).includes(filter));

    return matchesQuery && matchesFilter;
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.tabScreenContent}>
      <View style={styles.simpleHeader}>
        <Logo />
        <Text style={styles.simpleHeaderTitle}>جست‌وجو</Text>
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
      <View style={styles.searchFilters}>
        {([
          ['all', 'همه'],
          ['movie', 'فیلم'],
          ['series', 'سریال'],
          ['dubbed', 'دوبله فارسی'],
          ['subtitled', 'زیرنویس فارسی'],
        ] as const).map(([id, label]) => (
          <Pressable key={id} onPress={() => setFilter(id)} style={[styles.filterChip, filter === id && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filter === id && styles.filterChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.resultCount}>{toPersianDigits(results.length)} نتیجه</Text>
      <View style={styles.searchGrid}>
        {results.map((item) => <PosterCard key={item.id} item={item} onOpen={() => onOpen(item)} />)}
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
  onDelete,
}: {
  downloads: DownloadRecord[];
  onPlay: (record: DownloadRecord) => void;
  onDelete: (record: DownloadRecord) => void;
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
            لینک مستقیم هر کیفیت از صفحه فیلم یا سریال داخل خود برنامه دانلود می‌شود و اینجا باقی می‌ماند.
          </Text>
        </View>
      ) : (
        <View style={styles.downloadLibrary}>
          {downloads.map((record) => (
            <View key={record.id} style={styles.downloadLibraryCard}>
              <View style={styles.downloadLibraryInfo}>
                <Text numberOfLines={1} style={styles.downloadLibraryTitle}>{record.title}</Text>
                <Text style={styles.downloadLibraryMeta}>
                  {[record.subtitle, record.quality].filter(Boolean).join(' • ')}
                </Text>
                {record.status === 'downloading' ? (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(record.progress * 100)}%` }]} />
                  </View>
                ) : null}
                <Text style={styles.downloadLibraryStatus}>
                  {record.status === 'completed'
                    ? 'آماده پخش داخل اپ'
                    : record.status === 'downloading'
                      ? `${toPersianDigits(Math.round(record.progress * 100))}٪ در حال دریافت`
                      : record.error || 'دریافت ناموفق بود'}
                </Text>
              </View>
              <View style={styles.downloadLibraryActions}>
                {record.status === 'completed' && record.localUri ? (
                  <Pressable onPress={() => onPlay(record)} style={styles.downloadLibraryPlay}>
                    <Ionicons name="play" color="#fff" size={18} />
                  </Pressable>
                ) : null}
                <Pressable onPress={() => onDelete(record)} style={styles.downloadLibraryDelete}>
                  <Ionicons name="trash-outline" color={COLORS.muted} size={18} />
                </Pressable>
              </View>
            </View>
          ))}
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
}: {
  group: DownloadSection;
  open: boolean;
  onToggle: () => void;
  onOpenFile: (file: DownloadFile) => void;
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
          {files.map((file) => {
            const label = cleanMediaLabel(file.label);
            return (
              <View key={file.id} style={styles.qualityRow}>
                <View style={styles.qualityInfo}>
                  <Text style={styles.qualityName}>{cleanQualityLabel(file.quality)}</Text>
                  <Text style={styles.qualityMeta}>
                    {[label, file.size].filter(Boolean).join(' • ') || 'لینک مستقیم MP4'}
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
}: {
  group: DownloadSection;
  open: boolean;
  openLanguage: string | null;
  onToggle: (defaultLanguageId: string | null) => void;
  onToggleLanguage: (id: string) => void;
  onOpenFile: (file: DownloadFile) => void;
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
}: {
  item: CatalogItem;
  openGroup: string | null;
  openLanguage: string | null;
  onToggleEpisode: (id: string, defaultLanguageId: string | null) => void;
  onToggleLanguage: (id: string) => void;
  onOpenFile: (file: DownloadFile) => void;
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
  onStream: (item: CatalogItem) => void;
  onDownload: (item: CatalogItem, file: DownloadFile) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openLanguage, setOpenLanguage] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setOpenGroup(null);
      setOpenLanguage(null);
      return;
    }

    if (item.type === 'series') {
      const firstEpisode = newestEpisodeGroup(item);
      const firstLanguage = firstEpisode
        ? languageSectionsForFiles(firstEpisode.files, firstEpisode.id)[0]
        : null;
      setOpenGroup(firstEpisode?.id || null);
      setOpenLanguage(firstLanguage?.id || null);
      return;
    }

    const firstLanguageGroup = (item.downloads || [])
      .filter((group) => !isEpisodeSection(group) && sortedDownloadFiles(group.files).length > 0)
      .sort((a, b) =>
        LANGUAGE_ORDER.indexOf(a.language || 'subtitled') -
        LANGUAGE_ORDER.indexOf(b.language || 'subtitled'),
      )[0];
    setOpenGroup(firstLanguageGroup?.id || null);
    setOpenLanguage(null);
  }, [item?.id]);

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
                <Text style={styles.detailTitle}>{item.nameFa}</Text>
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
              <Pressable
                onPress={() => item.streamUrl
                  ? onStream(item)
                  : Alert.alert('پخش آنلاین', 'برای این عنوان هنوز لینک پخش موجود نیست.')}
                style={[styles.watchButton, !item.streamUrl && styles.watchButtonDisabled]}
              >
                <Ionicons name="play" color="#fff" size={19} />
                <Text style={styles.watchButtonText}>پخش آنلاین</Text>
              </Pressable>
              <Pressable
                onPress={() => Alert.alert('اشتراک‌گذاری', 'اشتراک‌گذاری مستقیم در نسخه بعد فعال می‌شود.')}
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

            {item.type === 'series' && episodeGroups.length ? (
              <SeriesEpisodeList
                item={item}
                openGroup={openGroup}
                openLanguage={openLanguage}
                onToggleEpisode={(id, defaultLanguageId) => {
                  if (openGroup === id) {
                    setOpenGroup(null);
                    setOpenLanguage(null);
                    return;
                  }
                  setOpenGroup(id);
                  setOpenLanguage(defaultLanguageId);
                }}
                onToggleLanguage={(id) => setOpenLanguage(openLanguage === id ? null : id)}
                onOpenFile={(file) => onDownload(item, file)}
              />
            ) : (
              movieDownloadGroups.map((group) => (
                <DownloadGroup
                  key={group.id}
                  group={group}
                  open={openGroup === group.id}
                  onToggle={() => setOpenGroup(openGroup === group.id ? null : group.id)}
                  onOpenFile={(file) => onDownload(item, file)}
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
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function VideoPlayerModal({
  source,
  title,
  onClose,
}: {
  source: string;
  title: string;
  onClose: () => void;
}) {
  const player = useVideoPlayer(source, (instance) => {
    instance.play();
  });

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
          <Text numberOfLines={1} style={styles.mediaModalTitle}>{title}</Text>
        </View>
        <View style={styles.videoStage}>
          <VideoView
            player={player}
            style={styles.videoView}
            nativeControls
            contentFit="contain"
            allowsPictureInPicture
          />
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
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [videoRequest, setVideoRequest] = useState<{ source: string; title: string } | null>(null);

  const reloadContent = async () => {
    setContentLoading(true);
    const nextContent = await loadContent();
    setContent(nextContent);
    setContentLoading(false);
  };

  useEffect(() => {
    reloadContent();
    loadDownloadRecords().then(setDownloads);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reloadContent();
    });

    return () => subscription.remove();
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  };

  const openStreamInsideApp = (item: CatalogItem) => {
    const url = item.streamUrl;
    if (!url || !isSafeHttpUrl(url) || !isDirectMediaUrl(url) || isPlaceholderUrl(url)) {
      Alert.alert('پخش آنلاین', 'لینک مستقیم و معتبر پخش برای این عنوان ثبت نشده است.');
      return;
    }
    setVideoRequest({ source: url, title: item.nameFa });
  };

  const startDownloadInsideApp = async (item: CatalogItem, file: DownloadFile) => {
    if (!isSafeHttpUrl(file.url) || isPlaceholderUrl(file.url)) {
      Alert.alert('دریافت فایل', 'این لینک نمونه است یا لینک واقعی برای آن ثبت نشده است.');
      return;
    }

    const fileMode = downloadModeFor(file);

    if (fileMode === 'play') {
      setVideoRequest({ source: file.url, title: `${item.nameFa} — ${cleanQualityLabel(file.quality)}` });
      return;
    }

    if (!/\.mp4(?:$|[?#])/i.test(file.url)) {
      Alert.alert('دریافت فایل', 'برای این کیفیت لینک مستقیم MP4 ثبت نشده است.');
      return;
    }

    const recordId = `${item.id}-${file.id}`;
    const existing = downloads.find((record) => record.id === recordId);
    if (existing?.status === 'completed' && existing.localUri) {
      Alert.alert('دریافت فایل', 'این کیفیت قبلاً دانلود شده و در بخش «دریافت‌ها» آماده پخش است.');
      return;
    }
    if (existing?.status === 'downloading') {
      Alert.alert('دریافت فایل', 'این فایل همین حالا در حال دانلود است.');
      return;
    }

    const pending: DownloadRecord = {
      id: recordId,
      itemId: item.id,
      title: item.nameFa,
      subtitle: item.name,
      quality: cleanQualityLabel(file.quality),
      sourceUrl: file.url,
      progress: 0,
      status: 'downloading',
      createdAt: new Date().toISOString(),
    };

    setDownloads((current) => [pending, ...current.filter((record) => record.id !== recordId)]);
    setActiveTab('downloads');
    setSelectedItem(null);

    try {
      const localUri = await downloadToApp({
        id: recordId,
        url: file.url,
        fileName: `${item.name}-${cleanQualityLabel(file.quality)}`,
        onProgress: (progress) => {
          setDownloads((current) => current.map((record) =>
            record.id === recordId ? { ...record, progress } : record,
          ));
        },
      });

      setDownloads((current) => {
        const next = current.map((record) =>
          record.id === recordId
            ? { ...record, localUri, progress: 1, status: 'completed' as const, error: undefined }
            : record,
        );
        saveDownloadRecords(next).catch(() => undefined);
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'دریافت فایل ناموفق بود.';
      setDownloads((current) => {
        const next = current.map((record) =>
          record.id === recordId ? { ...record, status: 'failed' as const, error: message } : record,
        );
        saveDownloadRecords(next).catch(() => undefined);
        return next;
      });
    }
  };

  const deleteDownload = async (record: DownloadRecord) => {
    await removeDownloadedFile(record.localUri).catch(() => undefined);
    setDownloads((current) => {
      const next = current.filter((item) => item.id !== record.id);
      saveDownloadRecords(next).catch(() => undefined);
      return next;
    });
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
            onReloadContent={reloadContent}
            onOpen={setSelectedItem}
            onSearch={() => setActiveTab('search')}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
          />
        ) : null}
        {activeTab === 'search' ? <SearchScreen catalog={content.items} onOpen={setSelectedItem} /> : null}
        {activeTab === 'favorites' ? (
          <FavoritesScreen catalog={content.items} favorites={favorites} onOpen={setSelectedItem} />
        ) : null}
        {activeTab === 'downloads' ? (
          <DownloadsScreen
            downloads={downloads}
            onPlay={(record) => record.localUri && setVideoRequest({ source: record.localUri, title: record.title })}
            onDelete={deleteDownload}
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
        <BottomNavigation active={activeTab} onChange={setActiveTab} />
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
          source={videoRequest.source}
          title={videoRequest.title}
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
  homeContent: { paddingBottom: 28 },
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
  logo: { ...rtlText, color: COLORS.text, fontSize: 23, fontWeight: '900', letterSpacing: -1.2 },
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
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.red,
  },
  contentStatus: { marginHorizontal: 18, marginTop: 12, marginBottom: 2, minHeight: 55, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  contentStatusTextWrap: { flex: 1, alignItems: 'flex-end', marginLeft: 10 },
  contentStatusTitle: { ...rtlText, color: COLORS.text, fontSize: 10, fontWeight: '900' },
  contentStatusMeta: { ...rtlText, color: COLORS.muted, fontSize: 8, marginTop: 4 },
  hero: { height: 465, overflow: 'hidden', justifyContent: 'flex-end' },
  heroContent: { paddingHorizontal: 20, paddingBottom: 34, alignItems: 'flex-end' },
  heroBadgeRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 10 },
  redBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(222,35,66,0.92)' },
  redBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  yearBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.25)' },
  yearBadgeText: { color: COLORS.text, fontSize: 10, fontWeight: '800' },
  heroTitle: { ...rtlText, color: COLORS.text, fontSize: 36, lineHeight: 46, fontWeight: '900', letterSpacing: -1.5 },
  heroEnglish: { color: '#B3B5B7', fontSize: 12, letterSpacing: 1.8, marginTop: -2, marginBottom: 13 },
  heroMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  ratingChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(216,180,90,0.45)', backgroundColor: 'rgba(0,0,0,0.25)' },
  imdb: { color: COLORS.text, fontSize: 8, fontWeight: '900' },
  rating: { color: COLORS.gold, fontSize: 12, fontWeight: '900' },
  metaChip: { color: '#E1E2E3', fontSize: 10, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(0,0,0,0.2)' },
  heroOverview: { ...rtlText, color: '#C5C7CB', fontSize: 12, lineHeight: 21, marginTop: 13, maxWidth: 360 },
  heroButtons: { flexDirection: 'row-reverse', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  primaryButton: { height: 48, flex: 1, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.red, shadowColor: COLORS.red, shadowOpacity: 0.35, shadowRadius: 18, elevation: 5 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  roundButton: { width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(10,12,15,0.65)' },
  scheduleSection: { marginHorizontal: 12, marginTop: -8, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(216,180,90,0.24)', backgroundColor: '#0C0F14', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 6 },
  scheduleHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  eyebrow: { ...rtlText, color: COLORS.red, fontSize: 10, fontWeight: '900', marginBottom: 4 },
  sectionTitle: { ...rtlText, color: COLORS.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.7 },
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
  posterImageWrap: { width: 137, height: 194, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  posterImage: { width: '100%', height: '100%' },
  posterGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 65 },
  posterAccess: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(222,35,66,0.9)' },
  posterAccessText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  posterEpisodeBadge: { position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(7,9,12,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  posterEpisodeText: { color: COLORS.text, fontSize: 8, fontWeight: '900' },
  posterRating: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(7,9,12,0.82)' },
  posterRatingText: { color: COLORS.text, fontSize: 9, fontWeight: '800' },
  posterName: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '800', marginTop: 9, width: '100%' },
  posterEnglish: { color: COLORS.muted, fontSize: 9, marginTop: 3, width: '100%', textAlign: 'right' },
  simpleHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  simpleHeaderTitle: { ...rtlText, color: COLORS.text, fontSize: 19, fontWeight: '900' },
  searchBox: { height: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13, writingDirection: 'rtl' },
  searchFilters: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: 'rgba(222,35,66,0.13)', borderColor: 'rgba(222,35,66,0.45)' },
  filterChipText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  filterChipTextActive: { color: COLORS.text },
  resultCount: { ...rtlText, color: COLORS.muted, fontSize: 10, marginTop: 22, marginBottom: 12 },
  searchGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 20 },
  largeEmpty: { minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38 },
  largeEmptyIcon: { width: 74, height: 74, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.22)' },
  largeEmptyTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 18 },
  largeEmptyText: { ...rtlText, color: COLORS.muted, fontSize: 11, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  detailScreen: { flex: 1, backgroundColor: COLORS.background },
  detailContent: { paddingBottom: 36 },
  detailHero: { height: 435, justifyContent: 'flex-end' },
  detailTopBar: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 66, paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row-reverse', justifyContent: 'space-between' },
  detailCircleButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  detailIdentity: { paddingHorizontal: 18, paddingBottom: 18, flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 15 },
  detailPoster: { width: 100, height: 143, borderRadius: 13, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  detailTitleBlock: { flex: 1, alignItems: 'flex-end', paddingBottom: 4 },
  detailType: { color: COLORS.red, fontSize: 9, fontWeight: '900', marginBottom: 7 },
  detailTitle: { ...rtlText, color: COLORS.text, fontSize: 29, lineHeight: 38, fontWeight: '900', letterSpacing: -1.1 },
  detailEnglish: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
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
  detailSectionTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 26 },
  detailOverview: { ...rtlText, color: '#A8ADB5', fontSize: 12, lineHeight: 23, marginTop: 9 },
  downloadHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  downloadHeaderText: { ...rtlText, color: COLORS.muted, fontSize: 9, marginTop: 6 },
  downloadGroup: { marginTop: 8, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  downloadGroupOpen: { borderColor: 'rgba(216,180,90,0.5)' },
  downloadGroupHead: { minHeight: 72, paddingHorizontal: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  downloadGroupText: { flex: 1, alignItems: 'flex-end' },
  downloadGroupTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900' },
  downloadGroupSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8, marginTop: 5 },
  downloadGroupBadge: { minWidth: 38, height: 36, paddingHorizontal: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(216,180,90,0.4)', backgroundColor: 'rgba(216,180,90,0.08)' },
  downloadGroupBadgeText: { color: COLORS.gold, fontSize: 9, fontWeight: '900' },
  qualityList: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 12 },
  qualityRow: { minHeight: 67, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  qualityInfo: { flex: 1, alignItems: 'flex-end' },
  qualityName: { ...rtlText, color: COLORS.text, fontSize: 14, fontWeight: '900' },
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
  noDownloadsCard: { minHeight: 145, marginTop: 8, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  noDownloadsTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900', marginTop: 9 },
  noDownloadsText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  bottomNavigation: { height: 69, marginBottom: 9, paddingHorizontal: 5, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: 'rgba(16,19,25,0.98)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, elevation: 12 },
  bottomTab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomIconWrap: { width: 37, height: 29, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bottomIconWrapActive: { backgroundColor: 'rgba(222,35,66,0.16)' },
  bottomLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '700', marginTop: 3 },
  bottomLabelActive: { color: COLORS.text },
  downloadLibrary: { gap: 10 },
  downloadLibraryCard: { minHeight: 112, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  downloadLibraryInfo: { flex: 1, alignItems: 'flex-end' },
  downloadLibraryTitle: { ...rtlText, color: COLORS.text, fontSize: 14, fontWeight: '900', width: '100%' },
  downloadLibraryMeta: { ...rtlText, color: COLORS.muted, fontSize: 9, marginTop: 5, width: '100%' },
  downloadLibraryStatus: { ...rtlText, color: COLORS.gold, fontSize: 9, marginTop: 7, width: '100%' },
  downloadLibraryActions: { gap: 8 },
  downloadLibraryPlay: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.red },
  downloadLibraryDelete: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  progressTrack: { width: '100%', height: 6, borderRadius: 4, overflow: 'hidden', backgroundColor: '#080A0E', marginTop: 11 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.gold },
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
