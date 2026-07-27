import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { WebView } from 'react-native-webview';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { COLORS, DAYS } from './src/data';
import { loadVerifiedForeignSchedule } from './src/foreignSchedule';
import { loadContent, LoadedContent } from './src/contentService';
import { CatalogItem, DayId, DownloadFile, DownloadSection, ScheduleEntry } from './src/types';
import {
  DownloadRecord,
  downloadToApp,
  loadDownloadRecords,
  removeDownloadedFile,
  saveDownloadRecords,
} from './src/downloadManager';

type MainTab = 'home' | 'search' | 'favorites' | 'downloads';
type ScheduleFilter = 'all' | 'iranian' | 'foreign';

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
  /\.(m3u8|mp4|m4v|mov|webm|mkv|ts)(?:$|[?#])/i.test(url);

const downloadModeFor = (file: DownloadFile) =>
  file.mode || (isDirectMediaUrl(file.url) ? 'download' : 'web');

const streamModeFor = (item: CatalogItem) =>
  item.streamMode || (item.streamUrl && isDirectMediaUrl(item.streamUrl) ? 'video' : 'web');

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
        <View style={styles.verifiedPill}>
          <Ionicons name="shield-checkmark" color={COLORS.gold} size={14} />
          <Text style={styles.verifiedText}>فقط برنامه تأییدشده</Text>
        </View>
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
          <Text style={styles.scheduleLoadingText}>بررسی قسمت‌های بعدی سریال‌های خارجی…</Text>
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
            <Text style={styles.scheduleEmptyTitle}>برنامه تأییدشده‌ای برای این روز نداریم</Text>
            <Text style={styles.scheduleEmptyText}>
              عنوان تمام‌شده یا برنامه‌ای که قسمت بعدی مشخص ندارد نمایش داده نمی‌شود.
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.scheduleFootnote}>
        برنامه ایرانی از فایل محتوای قابل‌به‌روزرسانی و برنامه خارجی از داده قسمت بعدی TVmaze بررسی می‌شود.
      </Text>
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
  return (
    <Pressable onPress={onOpen} style={styles.posterCard}>
      <View style={styles.posterImageWrap}>
        <Image source={{ uri: item.poster }} style={styles.posterImage} contentFit="cover" transition={220} />
        <LinearGradient colors={['transparent', 'rgba(7,9,12,0.88)']} style={styles.posterGradient} />
        <View style={styles.posterAccess}>
          <Text style={styles.posterAccessText}>
            {item.access === 'free' ? 'رایگان' : item.access === 'operator' ? 'اپراتوری' : 'خرید'}
          </Text>
        </View>
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.horizontalCatalog}
    >
      {items.map((item) => (
        <PosterCard key={item.id} item={item} onOpen={() => onOpen(item)} />
      ))}
    </ScrollView>
  );
}

function HomeScreen({
  catalog,
  iranianSchedule,
  contentSource,
  contentUpdatedAt,
  onReloadContent,
  onOpen,
  onSearch,
  favorites,
  toggleFavorite,
}: {
  catalog: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
  contentSource: 'remote' | 'local';
  contentUpdatedAt: string;
  onReloadContent: () => void;
  onOpen: (item: CatalogItem) => void;
  onSearch: () => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
}) {
  const hero = catalog.find((item) => item.id === 'land-of-sometimes') || catalog[0];
  const movies = catalog.filter((item) => item.type === 'movie');
  const series = catalog.filter((item) => item.type === 'series');

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

      <Pressable onPress={onReloadContent} style={styles.contentStatus}>
        <View style={styles.contentStatusTextWrap}>
          <Text style={styles.contentStatusTitle}>
            {contentSource === 'remote' ? 'اطلاعات آنلاین فعال است' : 'اطلاعات داخلی اپ نمایش داده می‌شود'}
          </Text>
          <Text style={styles.contentStatusMeta}>آخرین به‌روزرسانی: {contentUpdatedAt}</Text>
        </View>
        <Ionicons
          name={contentSource === 'remote' ? 'cloud-done-outline' : 'cloud-offline-outline'}
          color={contentSource === 'remote' ? COLORS.blue : COLORS.gold}
          size={21}
        />
      </Pressable>

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

      <View style={styles.catalogSection}>
        <SectionTitle eyebrow="قسمت‌های تازه" title="سریال‌های منتخب" action="مشاهده همه" onAction={onSearch} />
        <HorizontalCatalog items={series} onOpen={onOpen} />
      </View>
    </ScrollView>
  );
}

function SearchScreen({ catalog, onOpen }: { catalog: CatalogItem[]; onOpen: (item: CatalogItem) => void }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | 'movie' | 'series'>('all');

  const results = catalog.filter((item) => {
    const normalized = query.trim().toLowerCase();
    const matchesQuery =
      !normalized ||
      item.nameFa.includes(normalized) ||
      item.name.toLowerCase().includes(normalized);
    return matchesQuery && (type === 'all' || item.type === type);
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
        ] as const).map(([id, label]) => (
          <Pressable key={id} onPress={() => setType(id)} style={[styles.filterChip, type === id && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, type === id && styles.filterChipTextActive]}>{label}</Text>
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
  return (
    <View style={[styles.downloadGroup, open && styles.downloadGroupOpen]}>
      <Pressable onPress={onToggle} style={styles.downloadGroupHead}>
        <View style={styles.downloadGroupText}>
          <Text style={styles.downloadGroupTitle}>{group.title}</Text>
          <Text style={styles.downloadGroupSubtitle}>{group.subtitle || `${toPersianDigits(group.files.length)} کیفیت`}</Text>
        </View>
        <View style={styles.downloadGroupBadge}>
          <Text style={styles.downloadGroupBadgeText}>{group.badge || 'DL'}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} color={COLORS.gold} size={19} />
      </Pressable>
      {open ? (
        <View style={styles.qualityList}>
          {group.files.map((file) => (
            <View key={file.id} style={styles.qualityRow}>
              <View>
                <Text style={styles.qualityName}>{file.quality}</Text>
                <Text style={styles.qualityMeta}>
                  {[file.label, file.size].filter(Boolean).join(' • ') || 'لینک مستقیم'}
                </Text>
              </View>
              <Pressable
                onPress={() => onOpenFile(file)}
                style={styles.downloadButton}
              >
                <Ionicons name={downloadModeFor(file) === 'web' ? 'open-outline' : 'download-outline'} color="#fff" size={16} />
                <Text style={styles.downloadButtonText}>{downloadModeFor(file) === 'web' ? 'بازکردن' : 'دریافت'}</Text>
              </Pressable>
            </View>
          ))}
          {!group.files.length ? (
            <View style={styles.downloadEmptyRow}>
              <Text style={styles.downloadEmptyText}>هنوز لینکی برای این بخش ثبت نشده است.</Text>
            </View>
          ) : null}
        </View>
      ) : null}
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

  useEffect(() => {
    setOpenGroup(item?.downloads?.[0]?.id || null);
  }, [item?.id]);

  if (!item) return null;
  const downloadGroups = item.downloads || [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailScreen}>
        <StatusBar style="light" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
          <View style={styles.detailHero}>
            <Image source={{ uri: item.backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={['rgba(7,9,12,0.06)', COLORS.background]} style={StyleSheet.absoluteFill} />
            <SafeAreaView style={styles.detailTopBar}>
              <Pressable onPress={onClose} style={styles.detailCircleButton}>
                <Ionicons name="arrow-forward" color="#fff" size={21} />
              </Pressable>
              <Pressable onPress={onFavorite} style={styles.detailCircleButton}>
                <Ionicons name={favorite ? 'bookmark' : 'bookmark-outline'} color={favorite ? COLORS.gold : '#fff'} size={21} />
              </Pressable>
            </SafeAreaView>
            <View style={styles.detailIdentity}>
              <Image source={{ uri: item.poster }} style={styles.detailPoster} contentFit="cover" />
              <View style={styles.detailTitleBlock}>
                <Text style={styles.detailType}>{item.type === 'movie' ? 'فیلم سینمایی' : 'سریال'}</Text>
                <Text style={styles.detailTitle}>{item.nameFa}</Text>
                <Text style={styles.detailEnglish}>{item.name}</Text>
                <View style={styles.detailMeta}>
                  <Text style={styles.detailMetaText}>{toPersianDigits(item.year)}</Text>
                  {typeof item.rate === 'number' ? <Text style={styles.detailMetaText}>IMDb {toPersianDigits(item.rate)}</Text> : null}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.detailBody}>
            <View style={styles.detailActions}>
              <Pressable
                onPress={() => item.streamUrl
                  ? onStream(item)
                  : Alert.alert('پخش آنلاین', 'برای این عنوان هنوز لینک پخش در catalog.json ثبت نشده است.')}
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
                <Text style={styles.detailSectionTitle}>لینک‌های دریافت</Text>
                <Text style={styles.downloadHeaderText}>دانلود مستقیم و صفحه خرید، هر دو داخل خود اپ باز می‌شوند.</Text>
              </View>
              <Ionicons name="cloud-download-outline" color={COLORS.gold} size={24} />
            </View>

            {downloadGroups.map((group) => (
              <DownloadGroup
                key={group.id}
                group={group}
                open={openGroup === group.id}
                onToggle={() => setOpenGroup(openGroup === group.id ? null : group.id)}
                onOpenFile={(file) => onDownload(item, file)}
              />
            ))}

            {!downloadGroups.length ? (
              <View style={styles.noDownloadsCard}>
                <Ionicons name="link-outline" color={COLORS.muted} size={25} />
                <Text style={styles.noDownloadsTitle}>لینک دانلود ثبت نشده است</Text>
                <Text style={styles.noDownloadsText}>
                  این عنوان در catalog.json فقط اطلاعات و پوستر دارد و لینک واقعی دانلود برایش وارد نشده است.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
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
      <View style={styles.mediaModal}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.mediaModalHeader}>
          <Pressable onPress={onClose} style={styles.mediaCloseButton}>
            <Ionicons name="close" color="#fff" size={23} />
          </Pressable>
          <Text numberOfLines={1} style={styles.mediaModalTitle}>{title}</Text>
        </SafeAreaView>
        <View style={styles.videoStage}>
          <VideoView
            player={player}
            style={styles.videoView}
            nativeControls
            contentFit="contain"
            allowsPictureInPicture
          />
        </View>
      </View>
    </Modal>
  );
}

function InAppWebModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.webModal}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.mediaModalHeader}>
          <Pressable onPress={onClose} style={styles.mediaCloseButton}>
            <Ionicons name="close" color="#fff" size={23} />
          </Pressable>
          <Text numberOfLines={1} style={styles.mediaModalTitle}>{title}</Text>
        </SafeAreaView>
        <WebView
          source={{ uri: url }}
          style={styles.webView}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
        />
        {loading ? (
          <View pointerEvents="none" style={styles.webLoading}>
            <ActivityIndicator color={COLORS.gold} size="large" />
          </View>
        ) : null}
      </View>
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

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [videoRequest, setVideoRequest] = useState<{ source: string; title: string } | null>(null);
  const [webRequest, setWebRequest] = useState<{ url: string; title: string } | null>(null);

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
    if (!url || !isSafeHttpUrl(url) || isPlaceholderUrl(url)) {
      Alert.alert('پخش آنلاین', 'لینک واقعی و معتبر پخش برای این عنوان ثبت نشده است.');
      return;
    }
    if (streamModeFor(item) === 'video') {
      setVideoRequest({ source: url, title: item.nameFa });
    } else {
      setWebRequest({ url, title: `پخش ${item.nameFa}` });
    }
  };

  const startDownloadInsideApp = async (item: CatalogItem, file: DownloadFile) => {
    if (!isSafeHttpUrl(file.url) || isPlaceholderUrl(file.url)) {
      Alert.alert('دریافت فایل', 'این لینک نمونه است یا لینک واقعی برای آن ثبت نشده است.');
      return;
    }

    if (downloadModeFor(file) === 'web') {
      setWebRequest({ url: file.url, title: `${item.nameFa} — ${file.quality}` });
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
      quality: file.quality,
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
        fileName: `${item.name}-${file.quality}`,
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
      <View style={styles.initialLoading}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.gold} size="large" />
        <Text style={styles.initialLoadingTitle}>در حال آماده‌سازی آپاراتچی…</Text>
        <Text style={styles.initialLoadingText}>فهرست داخلی و اطلاعات آنلاین بررسی می‌شود.</Text>
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        {activeTab === 'home' ? (
          <HomeScreen
            catalog={content.items}
            iranianSchedule={content.iranianSchedule}
            contentSource={content.source}
            contentUpdatedAt={content.updatedAt}
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
      </SafeAreaView>
      <BottomNavigation active={activeTab} onChange={setActiveTab} />
      {contentLoading ? (
        <View pointerEvents="none" style={styles.refreshIndicator}>
          <ActivityIndicator color={COLORS.gold} size="small" />
        </View>
      ) : null}
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
      {webRequest ? (
        <InAppWebModal
          url={webRequest.url}
          title={webRequest.title}
          onClose={() => setWebRequest(null)}
        />
      ) : null}
    </View>
  );
}

const rtlText = {
  writingDirection: 'rtl' as const,
  textAlign: 'right' as const,
};

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  screen: { flex: 1, backgroundColor: COLORS.background },
  initialLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, backgroundColor: COLORS.background },
  initialLoadingTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 16 },
  initialLoadingText: { ...rtlText, color: COLORS.muted, fontSize: 10, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  refreshIndicator: { position: 'absolute', top: Platform.OS === 'android' ? 14 : 52, left: 14, width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,19,25,0.94)', borderWidth: 1, borderColor: COLORS.border },
  contentUnavailable: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  retryButton: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.red },
  retryButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  homeContent: { paddingBottom: 118 },
  tabScreenContent: { paddingHorizontal: 16, paddingBottom: 120, paddingTop: Platform.OS === 'android' ? 22 : 8 },
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
  horizontalCatalog: { flexDirection: 'row-reverse', gap: 11, paddingHorizontal: 18, paddingTop: 14 },
  posterCard: { width: 137, alignItems: 'flex-end' },
  posterImageWrap: { width: 137, height: 194, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  posterImage: { width: '100%', height: '100%' },
  posterGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 65 },
  posterAccess: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(222,35,66,0.9)' },
  posterAccessText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  posterRating: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(7,9,12,0.82)' },
  posterRatingText: { color: COLORS.text, fontSize: 9, fontWeight: '800' },
  posterName: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '800', marginTop: 9, width: '100%' },
  posterEnglish: { color: COLORS.muted, fontSize: 9, marginTop: 3, width: '100%', textAlign: 'right' },
  simpleHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  simpleHeaderTitle: { ...rtlText, color: COLORS.text, fontSize: 19, fontWeight: '900' },
  searchBox: { height: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13, writingDirection: 'rtl' },
  searchFilters: { flexDirection: 'row-reverse', gap: 8, marginTop: 13 },
  filterChip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
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
  detailTopBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 17 : 0, flexDirection: 'row-reverse', justifyContent: 'space-between' },
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
  qualityRow: { minHeight: 67, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  qualityName: { ...rtlText, color: COLORS.text, fontSize: 14, fontWeight: '900' },
  qualityMeta: { ...rtlText, color: COLORS.muted, fontSize: 8, marginTop: 4 },
  downloadButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.blue },
  downloadButtonText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  downloadEmptyRow: { minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  downloadEmptyText: { ...rtlText, color: COLORS.muted, fontSize: 9 },
  noDownloadsCard: { minHeight: 145, marginTop: 8, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  noDownloadsTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900', marginTop: 9 },
  noDownloadsText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  bottomNavigation: { position: 'absolute', left: 10, right: 10, bottom: Platform.OS === 'ios' ? 12 : 9, height: 69, paddingHorizontal: 5, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: 'rgba(16,19,25,0.98)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, elevation: 12 },
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
  mediaModalHeader: { height: Platform.OS === 'android' ? 72 : 92, paddingTop: Platform.OS === 'android' ? 10 : 30, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#080A0E', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mediaCloseButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong },
  mediaModalTitle: { ...rtlText, flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '900' },
  videoStage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  videoView: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  webView: { flex: 1, backgroundColor: '#fff' },
  webLoading: { ...StyleSheet.absoluteFillObject, top: Platform.OS === 'android' ? 72 : 92, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.72)' },

});
