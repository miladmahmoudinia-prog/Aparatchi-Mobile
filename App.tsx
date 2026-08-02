import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { WebView } from 'react-native-webview';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Linking,
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
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, DAYS } from './src/data';
import { loadVerifiedForeignSchedule } from './src/foreignSchedule';
import { getBundledContent, loadContent, LoadedContent } from './src/contentService';
import { checkVpnActive } from './src/ipAccess';
import {
  checkMobileOperatorAccess,
  MobileOperatorAccessStatus,
} from './src/operatorAccess';
import { CatalogItem, CatalogPerson, DayId, DownloadFile, DownloadSection, FeaturedPerson, MediaLanguage, ScheduleEntry } from './src/types';
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
import {
  WatchHistoryRecord,
  WatchProgressRecord,
  loadLibraryState,
  saveLibraryState,
} from './src/libraryManager';
import {
  initializeEpisodeAlertSystem,
  setSeriesEpisodeAlert,
  syncEpisodeAlerts,
} from './src/notificationManager';

type MainTab = 'home' | 'categories' | 'search' | 'favorites' | 'downloads';
type ScheduleFilter = 'all' | 'iranian' | 'foreign';
type PersonRoleFilter = 'all' | 'actor' | 'director';
type CountrySearchFilter = `country:${string}`;
type GenreSearchFilter = `genre:${string}`;
type YearSearchFilter = `year:${number}`;
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
  | 'korean-movies'
  | 'korean-series'
  | 'indian-movies'
  | 'japanese-movies'
  | 'anime-movies'
  | 'anime-series'
  | 'animation-movies'
  | 'animation-series'
  | 'programs'
  | 'documentaries'
  | 'collections'
  | 'mobile-operator'
  | CountrySearchFilter
  | GenreSearchFilter
  | YearSearchFilter;

type CatalogDeepLink = {
  id: string;
  type: CatalogItem['type'];
};

const catalogItemDeepLink = (item: CatalogItem) =>
  `aparatchi://content/${item.type}/${encodeURIComponent(String(item.id))}`;

const parseCatalogDeepLink = (url?: string | null): CatalogDeepLink | null => {
  if (!url) return null;
  const match = url.match(/^aparatchi:\/\/content\/(movie|series)\/([^/?#]+)/i);
  if (!match) return null;

  try {
    return {
      type: match[1].toLowerCase() as CatalogItem['type'],
      id: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
};

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


const isDirectTmdbImageUrl = (value?: string) =>
  Boolean(value && /^https?:\/\/image\.tmdb\.org\/t\/p\//i.test(value));

const optimizedImageUrl = (
  value?: string,
  _kind: 'poster' | 'backdrop' | 'person' = 'poster',
) => {
  const url = String(value || '').trim().replace(/^http:\/\//i, 'https://');
  if (!url || isDirectTmdbImageUrl(url)) return '';
  return url;
};

const scheduleTimeValue = (value?: string) => {
  const text = String(value || '').trim();
  if (!text || /نامشخص|اعلام\s*نشده|unknown|tbd/i.test(text)) return '';
  return text;
};

const isDirectMediaUrl = (url: string) =>
  /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url);



const normalizeComparableText = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();

const titleVisualScore = (value?: string) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  const latinCharacters = (text.match(/[A-Za-z0-9]/g) || []).length;
  const wideCharacters = (text.match(/[آأإابتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]/g) || []).length;
  return text.length + Math.max(0, words - 3) * 2 + latinCharacters * 0.15 + wideCharacters * 0.08;
};

const adaptiveTitleStyle = (value: string, context: 'hero' | 'detail') => {
  const score = titleVisualScore(value);
  if (context === 'hero') {
    if (score <= 20) return { fontSize: 32, lineHeight: 41, letterSpacing: -1.1 };
    if (score <= 34) return { fontSize: 28, lineHeight: 36, letterSpacing: -0.95 };
    if (score <= 50) return { fontSize: 24, lineHeight: 31, letterSpacing: -0.75 };
    if (score <= 68) return { fontSize: 21, lineHeight: 28, letterSpacing: -0.55 };
    return { fontSize: 19, lineHeight: 25, letterSpacing: -0.4 };
  }
  if (score <= 22) return { fontSize: 26, lineHeight: 34, letterSpacing: -0.8 };
  if (score <= 38) return { fontSize: 23, lineHeight: 30, letterSpacing: -0.65 };
  if (score <= 56) return { fontSize: 20, lineHeight: 27, letterSpacing: -0.5 };
  return { fontSize: 18, lineHeight: 24, letterSpacing: -0.35 };
};

const adaptiveTitleLines = (value: string) => titleVisualScore(value) > 46 ? 3 : 2;

function useDebouncedText(value: string, delay = 240) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}


const DAY_INDEX: DayId[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SCHEDULE_DAY_OVERRIDES: Array<{ pattern: RegExp; day: DayId }> = [
  { pattern: /(^|\s)بدنام($|\s)/i, day: 'friday' },
];

const localDayId = (date = new Date()): DayId =>
  TODAY_BY_JS_DAY[date.getDay()] || 'saturday';

const dayFromDateValue = (value?: string): DayId | null => {
  if (!value) return null;
  const raw = String(value).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const timestamp = Date.parse(dateOnly ? `${raw}T12:00:00` : raw);
  if (!Number.isFinite(timestamp)) return null;
  return localDayId(new Date(timestamp));
};

const inferredScheduleFromCatalog = (catalog: CatalogItem[]): ScheduleEntry[] => {
  const now = Date.now();
  return catalog.flatMap((item) => {
    if (item.type !== 'series') return [];

    const overrideDay = SCHEDULE_DAY_OVERRIDES.find(({ pattern }) =>
      pattern.test(normalizeComparableText(item.nameFa)),
    )?.day;
    const explicitDay = item.airDays?.find((day) => DAY_INDEX.includes(day));
    const nextEpisodeDay = dayFromDateValue(item.nextEpisodeAirDate);
    const recentTimestampValue =
      item.meaningfulUpdatedAt || item.sourceUpdatedAt || item.updatedAt || item.sourceCreatedAt || item.createdAt;
    const recentTimestamp = Date.parse(String(recentTimestampValue || ''));
    const recentlyUpdated = Number.isFinite(recentTimestamp) && now - recentTimestamp <= 45 * 24 * 60 * 60 * 1000;
    const recentDay = recentlyUpdated ? DAY_INDEX[new Date(recentTimestamp).getDay()] : null;
    const day = overrideDay || explicitDay || nextEpisodeDay || recentDay;

    if (!day || (!item.isAiring && !item.nextEpisodeAirDate && !recentlyUpdated && !overrideDay)) return [];

    return [{
      id: `catalog-schedule-${item.id}-${day}`,
      itemId: String(item.id),
      nameFa: item.nameFa,
      poster: item.poster,
      day,
      time: scheduleTimeValue(item.airTime),
      ...(item.nextEpisodeSeasonNumber ? { season: item.nextEpisodeSeasonNumber } : {}),
      ...(item.nextEpisodeNumber ? { episode: item.nextEpisodeNumber } : {}),
      region: isIranianItem(item) ? 'iranian' : 'foreign',
      sourceLabel: item.nextEpisodeAirDate ? 'برنامه رسمی پخش' : 'بر اساس آخرین به‌روزرسانی',
      verifiedAt: item.nextEpisodeAirDate || String(recentTimestampValue || ''),
    } satisfies ScheduleEntry];
  });
};

const downloadModeFor = (file: DownloadFile): NonNullable<DownloadFile['mode']> =>
  file.mode || 'download';

const isOperatorFile = (file: DownloadFile) =>
  downloadModeFor(file) === 'operator-play' ||
  downloadModeFor(file) === 'operator-download';

const isTrustedOperatorHostUrl = (url?: string) => {
  if (!url) return false;
  if (url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (
      /(^|\.)upera\.tv$/i.test(parsed.hostname) ||
      /(^|\.)redl\.ink$/i.test(parsed.hostname)
    );
  } catch {
    return false;
  }
};

const isOperatorPortalUrl = (url?: string) => {
  if (!url || !isTrustedOperatorHostUrl(url)) return false;
  try {
    const parsed = new URL(url);
    if (/(^|\.)redl\.ink$/i.test(parsed.hostname)) return true;
    const decodedPath = decodeURIComponent(parsed.pathname || '');
    return /\/(?:stream|watch|play|download)(?:\/|$)/i.test(decodedPath) &&
      /\/(?:movie|series|episode)(?:\/|$)/i.test(decodedPath);
  } catch {
    return false;
  }
};

const operatorFilesFor = (files: DownloadFile[]) =>
  files.filter((file) => isOperatorFile(file) && isOperatorPortalUrl(file.url));

const itemHasOperatorAccess = (item: CatalogItem) =>
  Boolean(
    item.operatorOnly ||
    item.operatorAccess ||
    item.access === 'operator' ||
    item.categoryKeys?.includes('mobile-operator') ||
    (item.downloads || []).some((section) => operatorFilesFor(section.files).length > 0),
  );

const LANGUAGE_ORDER: MediaLanguage[] = ['dubbed', 'subtitled'];

const languageTitle = (language: MediaLanguage) =>
  language === 'dubbed' ? 'دوبله فارسی' : 'زیرنویس فارسی';

const shareCatalogItem = async (item: CatalogItem) => {
  try {
    const appLink = catalogItemDeepLink(item);
    await Share.share({
      title: item.nameFa,
      message: [
        item.nameFa,
        item.name,
        'مشاهده در اپ آپاراتچی:',
        appLink,
      ].filter(Boolean).join('\n'),
    });
  } catch {
    Alert.alert('اشتراک‌گذاری', 'اشتراک‌گذاری انجام نشد. دوباره تلاش کنید.');
  }
};

const itemLanguages = (item: CatalogItem): MediaLanguage[] =>
  LANGUAGE_ORDER.filter((language) =>
    item.availableLanguages?.includes(language) ||
    (item.downloads || []).some((section) =>
      section.files.some((file) =>
        !isOperatorFile(file) && file.language === language
      ),
    ),
  );

const itemLanguageBadge = (item: CatalogItem) => {
  if (itemHasOperatorAccess(item)) return 'ویژه همراه';
  if (isIranianItem(item)) return '';
  const languages = itemLanguages(item);
  if (languages.includes('dubbed') && languages.includes('subtitled')) {
    return 'دوبله + زیرنویس';
  }
  if (languages.includes('dubbed')) return 'دوبله';
  if (languages.includes('subtitled')) return 'زیرنویس';
  return '';
};

const COUNTRY_LABELS_FA: Record<string, string> = {
  IR: 'ایران',
  KR: 'کره جنوبی',
  IN: 'هند',
  US: 'آمریکا',
  GB: 'بریتانیا',
  TR: 'ترکیه',
  JP: 'ژاپن',
  CN: 'چین',
  FR: 'فرانسه',
  DE: 'آلمان',
  ES: 'اسپانیا',
  IT: 'ایتالیا',
  CA: 'کانادا',
  AU: 'استرالیا',
  RU: 'روسیه',
};

const COUNTRY_FILTER_PRIORITY = [
  'IR', 'KR', 'IN', 'US', 'TR', 'JP', 'CN', 'GB', 'FR', 'DE', 'ES', 'IT', 'CA', 'AU', 'RU',
];

const countryFilter = (code: string): CountrySearchFilter =>
  `country:${code.toUpperCase()}`;

const countryCodeFromFilter = (filter: SearchFilter) =>
  filter.startsWith('country:') ? filter.slice('country:'.length).toUpperCase() : '';

const genreFromFilter = (filter: SearchFilter) =>
  filter.startsWith('genre:') ? decodeURIComponent(filter.slice('genre:'.length)) : '';

const yearFromFilter = (filter: SearchFilter) =>
  filter.startsWith('year:') ? Number(filter.slice('year:'.length)) : 0;

const genreFilter = (genre: string): GenreSearchFilter =>
  `genre:${encodeURIComponent(genre)}`;

const yearFilter = (year: number): YearSearchFilter => `year:${year}`;

const countryLabel = (code: string, catalog: CatalogItem[] = []) => {
  const normalizedCode = code.toUpperCase();
  const item = catalog.find((candidate) => candidate.countryCodes?.includes(normalizedCode));
  const index = item?.countryCodes?.indexOf(normalizedCode) ?? -1;
  return (index >= 0 ? item?.countryLabels?.[index] : '') || COUNTRY_LABELS_FA[normalizedCode] || normalizedCode;
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

const resolutionRank = (file: Pick<DownloadFile, 'quality' | 'label'>) => {
  const text = `${file.quality || ''} ${file.label || ''}`;
  const match = text.match(/(2160|1440|1080|720|480|360)/i);
  if (!match) return 0;
  if (/hq\s*1080/i.test(text)) return 1180;
  return Number(match[1]);
};

const downloadSortRank = (file: DownloadFile) => {
  const text = `${file.quality || ''} ${file.label || ''}`;
  let rank = resolutionRank(file);
  if (/blu[\s._-]*ray|bluray/i.test(text)) rank += 100000;
  if (/remux/i.test(text)) rank += 110000;
  return rank;
};

const sortedDownloadFiles = (files: DownloadFile[]) =>
  [...files]
    .filter((file) => downloadModeFor(file) === 'download')
    .sort((a, b) => downloadSortRank(a) - downloadSortRank(b));


type PlaybackSource = {
  id: string;
  url: string;
  quality: string;
  rank: number;
};

type PlayableVersion = {
  language?: MediaLanguage;
  label: string;
  sources: PlaybackSource[];
  defaultSource: PlaybackSource;
};

type VideoRequest = {
  title: string;
  sources: PlaybackSource[];
  initialSourceId: string;
  resumeKey?: string;
  itemId?: string;
  artwork?: string;
  episodeId?: string;
  language?: MediaLanguage;
  downloadId?: string;
  resumeAt?: number;
};

const formatPlaybackTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const value = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  return toPersianDigits(value);
};

const watchProgressPercent = (record: WatchProgressRecord) =>
  record.duration > 0
    ? Math.max(0, Math.min(100, Math.round((record.position / record.duration) * 100)))
    : 0;

const formatStorageSize = (bytes: number) => {
  const safeBytes = Math.max(0, Number(bytes || 0));
  if (safeBytes < 1024) return `${toPersianDigits(Math.round(safeBytes))} بایت`;
  const units = ['کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
  let value = safeBytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${toPersianDigits(value.toFixed(decimals))} ${units[unitIndex]}`;
};

const historyDateLabel = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const day = 24 * 60 * 60 * 1000;
  const difference = Date.now() - timestamp;
  if (difference < day) return 'امروز';
  if (difference < day * 2) return 'دیروز';
  const date = new Date(timestamp);
  return toPersianDigits(
    `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`,
  );
};

type OperatorWebRequest = {
  title: string;
  url: string;
};

type OperatorGateRequest = {
  item: CatalogItem;
  file: DownloadFile;
  status: MobileOperatorAccessStatus | 'checking';
};

const playbackQualityLabel = (file: DownloadFile) => {
  const text = `${file.quality || ''} ${file.label || ''}`;
  if (/\.m3u8(?:$|[?#])/i.test(file.url) && !/(2160|1440|1080|720|480|360)/i.test(text)) {
    return 'خودکار';
  }
  return cleanQualityLabel(file.quality || file.label);
};

const playbackSourcesForFiles = (files: DownloadFile[]): PlaybackSource[] => {
  const seen = new Set<string>();
  return files
    .filter((file) =>
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
        rank: downloadSortRank(file),
      } satisfies PlaybackSource];
    })
    .sort((a, b) => {
      const aAuto = a.quality === 'خودکار';
      const bAuto = b.quality === 'خودکار';
      if (aAuto !== bAuto) return aAuto ? 1 : -1;
      return a.rank - b.rank;
    });
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
  if (item.ir && unlabeledSources.length) {
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
      id: `stream-${item.id}`,
      url: item.streamUrl,
      quality: /\.m3u8(?:$|[?#])/i.test(item.streamUrl) ? 'خودکار' : 'پخش آنلاین',
      rank: 0,
    };
    const languages = itemLanguages(item);
    const language = languages.length === 1 ? languages[0] : undefined;
    if (!language && !item.ir) return [];
    return [{
      language,
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
  iranian = false,
): DownloadSection[] => {
  const sections: DownloadSection[] = LANGUAGE_ORDER.flatMap((language) => {
    const languageFiles = sortedDownloadFiles(files.filter((file) => file.language === language));
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

  const plainFiles = sortedDownloadFiles(files.filter((file) => !file.language));
  if (iranian && plainFiles.length) {
    sections.push({
      id: `${idPrefix}-plain`,
      title: 'لینک‌های دریافت',
      subtitle: `${plainFiles.length} کیفیت دانلود مستقیم`,
      files: plainFiles,
    });
  }
  return sections;
};

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

const isIranianItem = (item: CatalogItem) =>
  Boolean(
    item.ir ||
    item.countryCodes?.includes('IR') ||
    item.originalLanguage === 'fa' ||
    (item.countryLabels || []).some((value) => normalizeComparableText(value) === 'ایران') ||
    (item.countryNames || []).some((value) => /iran/i.test(normalizeComparableText(value))),
  );

const hasSpecificCountry = (item: CatalogItem, code: string, originalLanguage: string) => {
  const countryCodes = (item.countryCodes || []).map((value) => String(value).toUpperCase());
  // وقتی کشور معتبر ثبت شده، زبان یا برچسب قدیمی نباید اثر را وارد کشور دیگری کند.
  if (countryCodes.length) return countryCodes.includes(code);
  return String(item.originalLanguage || '').toLowerCase() === originalLanguage;
};

const isKoreanItem = (item: CatalogItem) =>
  hasSpecificCountry(item, 'KR', 'ko');

const looksLikeAnimeTitle = (item: CatalogItem) => {
  const text = normalizeComparableText([
    item.nameFa,
    item.name,
    item.contentKind || '',
    ...(item.categoryLabels || []),
    ...(item.categoryKeys || []),
  ].join(' '));
  const hasJapaneseScript = /[\u3040-\u30ff\u31f0-\u31ff]/.test(`${item.nameFa} ${item.name}`);
  const knownAnimeFranchise = /(?:انیمه|anime|jujutsu\s*kaisen|جوجوتسو|demon\s*slayer|kimetsu|شیطان\s*کش|attack\s*on\s*titan|one\s*piece|naruto|bleach|my\s*hero\s*academia|chainsaw\s*man|spy\s*[x×]\s*family|solo\s*leveling)/i.test(text);
  return hasJapaneseScript || knownAnimeFranchise;
};

const isAnimeItem = (item: CatalogItem) => {
  const animated = Boolean(
    item.isAnimation ||
    item.genres.some((genre) => /انیمیشن|animation|anime/i.test(genre)) ||
    item.contentKind === 'animation-movie' ||
    item.contentKind === 'animation-series' ||
    hasCategory(item, 'animation-movies') ||
    hasCategory(item, 'animation-series'),
  );
  if (!animated) return false;
  return Boolean(
    item.isAnime ||
    item.contentKind === 'anime-movie' ||
    item.contentKind === 'anime-series' ||
    hasCategory(item, 'anime-movies') ||
    hasCategory(item, 'anime-series') ||
    item.countryCodes?.includes('JP') ||
    item.originalLanguage === 'ja' ||
    (item.countryLabels || []).some((value) => /ژاپن/.test(normalizeComparableText(value))) ||
    (item.countryNames || []).some((value) => /japan/i.test(normalizeComparableText(value))) ||
    looksLikeAnimeTitle(item)
  );
};

const isAnimatedItem = (item: CatalogItem) => Boolean(
  item.isAnimation ||
  isAnimeItem(item) ||
  item.contentKind === 'animation-movie' ||
  item.contentKind === 'animation-series' ||
  hasCategory(item, 'animation-movies') ||
  hasCategory(item, 'animation-series')
);

const isAnimationItem = (item: CatalogItem) => isAnimatedItem(item) && !isAnimeItem(item);

const mediaKindLabel = (item: CatalogItem) => {
  if (isDocumentaryItem(item)) {
    return item.type === 'series' ? 'مستند سریالی' : 'مستند';
  }
  if (isAnimeItem(item)) {
    return item.type === 'movie' ? 'انیمه سینمایی' : 'انیمه سریالی';
  }
  if (isAnimationItem(item)) {
    return item.type === 'movie' ? 'انیمیشن سینمایی' : 'انیمیشن سریالی';
  }
  return item.type === 'movie' ? 'فیلم سینمایی' : 'سریال';
};

const itemHasUsableContent = (item: CatalogItem) => {
  const files = (item.downloads || []).flatMap((section) => section.files || []);
  const hasOperator = files.some((file) =>
    isOperatorFile(file) && isSafeHttpUrl(file.url) && isOperatorPortalUrl(file.url),
  );
  if (hasOperator) return true;

  const directFiles = files.filter((file) =>
    !isOperatorFile(file) &&
    isSafeHttpUrl(file.url) &&
    !isPlaceholderUrl(file.url) &&
    isDirectMediaUrl(file.url),
  );
  const hasStream = isSafeHttpUrl(item.streamUrl) && isDirectMediaUrl(item.streamUrl || '');

  if (isIranianItem(item)) return Boolean(hasStream || directFiles.length);
  const languages = itemLanguages(item);
  return Boolean(
    (hasStream && languages.length) ||
    directFiles.some((file) => Boolean(file.language)),
  );
};

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

const meaningfulUpdateLabel = (item: CatalogItem) => {
  const label = String(item.updateLabel || '').trim();
  if (!label) return '';
  return /قسمت|فصل|دوبله|زیر\s*نویس|subtitle|dubbed|کیفیت|quality/i.test(label) ? label : '';
};

const filterTitle = (filter: SearchFilter) => {
  const countryCode = countryCodeFromFilter(filter);
  if (countryCode) return `آثار ${countryLabel(countryCode)}`;
  const genre = genreFromFilter(filter);
  if (genre) return `آثار ${genre}`;
  const year = yearFromFilter(filter);
  if (year) return `آثار سال ${toPersianDigits(year)}`;

  const titles: Record<string, string> = {
    all: 'همه محتوا', movie: 'همه فیلم‌ها', series: 'همه سریال‌ها',
    dubbed: 'دوبله فارسی', subtitled: 'زیرنویس فارسی',
    latest: 'جدیدترین‌ها', updated: 'به‌روزشده‌ها',
    'iranian-movies': 'فیلم‌های ایرانی', 'foreign-movies': 'فیلم‌های خارجی',
    'iranian-series': 'سریال‌های ایرانی', 'foreign-series': 'سریال‌های خارجی',
    'korean-movies': 'فیلم‌های کره‌ای', 'korean-series': 'سریال‌های کره‌ای', 'indian-movies': 'فیلم‌های هندی', 'japanese-movies': 'فیلم‌های ژاپنی',
    'anime-movies': 'انیمه‌های سینمایی', 'anime-series': 'انیمه‌های سریالی',
    'animation-movies': 'انیمیشن‌های سینمایی', 'animation-series': 'انیمیشن‌های سریالی',
    programs: 'تاک‌شوها و برنامه‌ها', documentaries: 'مستندها', collections: 'کالکشن‌ها',
    'mobile-operator': 'ویژه اینترنت همراه',
  };
  return titles[filter] || 'همه محتوا';
};

const matchesCatalogFilter = (item: CatalogItem, filter: SearchFilter) => {
  const countryCode = countryCodeFromFilter(filter);
  if (countryCode) return Boolean(item.countryCodes?.includes(countryCode));
  const genre = genreFromFilter(filter);
  if (genre) return item.genres.some((value) => normalizeComparableText(value) === normalizeComparableText(genre));
  const year = yearFromFilter(filter);
  if (year) return Number(item.year) === year;

  switch (filter) {
    case 'all': case 'latest': return true;
    case 'movie': case 'series': return item.type === filter;
    case 'dubbed':
      return !isIranianItem(item) && itemLanguages(item).includes('dubbed');
    case 'subtitled':
      return !isIranianItem(item) && itemLanguages(item).includes('subtitled');
    case 'updated': return Boolean(meaningfulUpdateLabel(item));
    case 'iranian-movies': return item.type === 'movie' && isIranianItem(item) && !isAnimatedItem(item) && !isDocumentaryItem(item);
    case 'foreign-movies': return item.type === 'movie' && !isIranianItem(item) && !isAnimatedItem(item) && !isDocumentaryItem(item);
    case 'iranian-series': return item.type === 'series' && isIranianItem(item) && !isAnimatedItem(item) && !isProgramItem(item) && !isDocumentaryItem(item);
    case 'foreign-series': return item.type === 'series' && !isIranianItem(item) && !isAnimatedItem(item) && !isProgramItem(item) && !isDocumentaryItem(item);
    case 'korean-movies': return item.type === 'movie' && isKoreanItem(item) && !isAnimatedItem(item) && !isDocumentaryItem(item);
    case 'korean-series': return item.type === 'series' && isKoreanItem(item) && !isAnimatedItem(item) && !isProgramItem(item) && !isDocumentaryItem(item);
    case 'indian-movies': return item.type === 'movie' && hasSpecificCountry(item, 'IN', 'hi') && !isAnimatedItem(item);
    case 'japanese-movies': return item.type === 'movie' && hasSpecificCountry(item, 'JP', 'ja') && !isAnimatedItem(item);
    case 'anime-movies': return item.type === 'movie' && isAnimeItem(item);
    case 'anime-series': return item.type === 'series' && isAnimeItem(item);
    case 'animation-movies': return item.type === 'movie' && isAnimationItem(item);
    case 'animation-series': return item.type === 'series' && isAnimationItem(item);
    case 'programs': return isProgramItem(item);
    case 'documentaries': return isDocumentaryItem(item);
    case 'collections': return item.type === 'movie' && Boolean(item.collectionId);
    case 'mobile-operator': return itemHasOperatorAccess(item);
    default: return true;
  }
};

const sortForCatalogFilter = (items: CatalogItem[], filter: SearchFilter) => {
  if (filter === 'updated') {
    return [...items].sort((a, b) => {
      const aTime = Date.parse(a.meaningfulUpdatedAt || a.updatedAt || '') || 0;
      const bTime = Date.parse(b.meaningfulUpdatedAt || b.updatedAt || '') || 0;
      return bTime - aTime;
    });
  }
  return [...items].sort((a, b) => catalogItemTimestamp(b) - catalogItemTimestamp(a));
};


const catalogFilterCache = new WeakMap<CatalogItem[], Map<SearchFilter, CatalogItem[]>>();

const catalogItemsForFilter = (catalog: CatalogItem[], filter: SearchFilter) => {
  let cache = catalogFilterCache.get(catalog);
  if (!cache) {
    cache = new Map<SearchFilter, CatalogItem[]>();
    catalogFilterCache.set(catalog, cache);
  }
  const cached = cache.get(filter);
  if (cached) return cached;

  const result = sortForCatalogFilter(
    catalog.filter((item) => itemHasUsableContent(item) && matchesCatalogFilter(item, filter)),
    filter,
  );
  cache.set(filter, result);
  return result;
};

const collectionMembersFor = (item: CatalogItem, catalog: CatalogItem[]) => {
  if (item.type !== 'movie' || !item.collectionId) return [];

  return catalog
    .filter((candidate) =>
      candidate.type === 'movie' &&
      candidate.collectionId === item.collectionId,
    )
    .sort((a, b) => {
      const aOrder = Number(a.collectionOrder || 0);
      const bOrder = Number(b.collectionOrder || 0);
      if (aOrder > 0 && bOrder > 0 && aOrder !== bOrder) return aOrder - bOrder;
      if (a.year !== b.year) return a.year - b.year;
      return a.id.localeCompare(b.id);
    });
};

const personName = (person: CatalogPerson) => person.name || person.nameFa || 'Unknown';

const personRoleTitle = (person: CatalogPerson) =>
  person.roleLabel || (person.role === 'director' ? 'کارگردان' : 'بازیگر');

const personInitials = (person: CatalogPerson) =>
  personName(person)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

const personWorksFor = (person: CatalogPerson, catalog: CatalogItem[]) =>
  sortForCatalogFilter(
    catalog.filter((item) => item.people?.some((candidate) => candidate.id === person.id)),
    'latest',
  );

const personAge = (person: CatalogPerson) => {
  if (!person.birthday) return 0;
  const birthday = new Date(`${person.birthday}T12:00:00`);
  const endDate = person.deathday ? new Date(`${person.deathday}T12:00:00`) : new Date();
  if (!Number.isFinite(birthday.getTime()) || !Number.isFinite(endDate.getTime())) return 0;
  let age = endDate.getFullYear() - birthday.getFullYear();
  const beforeBirthday =
    endDate.getMonth() < birthday.getMonth() ||
    (endDate.getMonth() === birthday.getMonth() && endDate.getDate() < birthday.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
};

const formatPersonBirthday = (value?: string) => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-gregory', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return toPersianDigits(value.replace(/-/g, '/'));
  }
};

const deriveFeaturedPeople = (catalog: CatalogItem[]): FeaturedPerson[] => {
  const candidates = new Map<string, { person: CatalogPerson; itemIds: Set<string>; iranian: number; foreign: number; score: number }>();
  for (const item of catalog) {
    for (const person of item.people || []) {
      if (person.role !== 'actor') continue;
      const key = person.tmdbId ? `tmdb:${person.tmdbId}` : `name:${normalizeComparableText(personName(person))}`;
      if (!key) continue;
      const current = candidates.get(key) || { person, itemIds: new Set<string>(), iranian: 0, foreign: 0, score: 0 };
      current.itemIds.add(item.id);
      if (item.ir || item.countryCodes?.includes('IR')) current.iranian += 1;
      else current.foreign += 1;
      current.score += 24 + Math.max(0, 14 - Number(person.order || 0) * 2) + Number(item.rate || 0);
      const currentHasImage = isSafeHttpUrl(current.person.image);
      const nextHasImage = isSafeHttpUrl(person.image);
      if ((!currentHasImage && nextHasImage) || Number(person.popularity || 0) > Number(current.person.popularity || 0)) {
        current.person = person;
      }
      candidates.set(key, current);
    }
  }
  const ranked = [...candidates.values()]
    .map(({ person, itemIds, iranian, foreign, score }) => ({
      ...person,
      nameFa: personName(person),
      name: personName(person),
      itemIds: [...itemIds],
      workCount: itemIds.size,
      region: iranian >= foreign ? 'iranian' as const : 'foreign' as const,
      score:
        score +
        itemIds.size * 34 +
        Number(person.popularity || 0) * 2 +
        (isSafeHttpUrl(person.image) ? 18 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const iranian = ranked.filter((person) => person.region === 'iranian');
  const foreign = ranked.filter((person) => person.region === 'foreign');
  const result: FeaturedPerson[] = [];
  for (let index = 0; result.length < 30 && (index < iranian.length || index < foreign.length); index += 1) {
    if (foreign[index]) result.push(foreign[index]);
    if (result.length < 30 && iranian[index]) result.push(iranian[index]);
  }
  return result;
};

function PersonAvatar({ person, style }: { person: CatalogPerson; style: any }) {
  const image = useMemo(() => optimizedImageUrl(person.image, 'person'), [person.image]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [person.id, person.tmdbId, image]);

  const initials = personName(person)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (!image || failed) {
    return (
      <View style={[style, styles.personImageFallback]}>
        {initials ? (
          <Text style={styles.personImageFallbackText}>{initials}</Text>
        ) : (
          <Ionicons name="person-outline" color={COLORS.gold} size={26} />
        )}
      </View>
    );
  }

  return (
    <Image
      source={{ uri: image }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      recyclingKey={`person:${person.tmdbId || person.id}`}
      onError={() => setFailed(true)}
    />
  );
}

function CatalogArtwork({
  primary,
  fallback,
  localFallback,
  style,
  contentFit = 'cover',
  transition = 80,
  imageKind = 'poster',
}: {
  primary?: string;
  fallback?: string;
  localFallback?: any;
  style: any;
  contentFit?: 'cover' | 'contain';
  transition?: number;
  imageKind?: 'poster' | 'backdrop';
}) {
  const primaryCandidate = optimizedImageUrl(primary, imageKind);
  const fallbackCandidate = optimizedImageUrl(fallback, imageKind);
  const primaryUrl = isSafeHttpUrl(primaryCandidate) && !isPlaceholderUrl(primaryCandidate)
    ? primaryCandidate
    : '';
  const fallbackUrl =
    isSafeHttpUrl(fallbackCandidate) &&
    !isPlaceholderUrl(fallbackCandidate) &&
    fallbackCandidate !== primaryUrl
      ? fallbackCandidate
      : '';
  const [stage, setStage] = useState(primaryUrl ? 0 : fallbackUrl ? 1 : 2);
  useEffect(() => {
    setStage(primaryUrl ? 0 : fallbackUrl ? 1 : 2);
  }, [primaryUrl, fallbackUrl]);

  const remoteUrl = stage === 0 ? primaryUrl : stage === 1 ? fallbackUrl : '';

  const handleRemoteError = () => {
    setStage((current) => current === 0 && fallbackUrl ? 1 : 2);
  };

  return (
    <View style={[style, styles.catalogArtworkContainer]}>
      {localFallback ? (
        <Image
          source={localFallback}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.catalogArtworkFallback]}>
          <Ionicons name="image-outline" color="rgba(216,180,90,0.58)" size={25} />
        </View>
      )}

      {remoteUrl ? (
        <Image
          key={remoteUrl}
          source={{ uri: remoteUrl }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          transition={transition}
          recyclingKey={remoteUrl}
          onError={handleRemoteError}
        />
      ) : null}
    </View>
  );
}

const localArtworkForItem = (_item: CatalogItem) => undefined;


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
  onMenu,
}: {
  onSearch: () => void;
  onNotifications: () => void;
  onMenu: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerBrandRow}>
        <Pressable onPress={onMenu} style={styles.iconButton} accessibilityLabel="منوی دسته‌بندی">
          <Ionicons name="menu" color={COLORS.text} size={24} />
        </Pressable>
        <Logo />
      </View>
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
        <Pressable onPress={onAction} hitSlop={12} style={styles.sectionAction}>
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
      <CatalogArtwork
        key={`${item.type}:${item.id}:${item.backdrop || item.poster}`}
        primary={item.backdrop || item.poster}
        fallback={item.backdropFallback || item.posterFallback || item.poster}
        localFallback={localArtworkForItem(item)}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        imageKind="backdrop"
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
            <Text style={styles.redBadgeText}>{mediaKindLabel(item)}</Text>
          </View>
          <View style={styles.yearBadge}>
            <Text style={styles.yearBadgeText}>{toPersianDigits(item.year)}</Text>
          </View>
        </View>
        <Text
          numberOfLines={adaptiveTitleLines(item.nameFa)}
          adjustsFontSizeToFit={false}
          style={[styles.heroTitle, adaptiveTitleStyle(item.nameFa, 'hero')]}
        >
          {item.nameFa}
        </Text>
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
  const safeItems = useMemo(() => items.slice(0, 5), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const sliderRef = useRef<FlatList<CatalogItem>>(null);
  const { width: screenWidth } = useWindowDimensions();
  const sliderWidth = Math.max(1, screenWidth);
  const pauseUntilRef = useRef(0);
  const sliderKey = useMemo(() => safeItems.map((item) => `${item.type}:${item.id}`).join('|'), [safeItems]);

  useEffect(() => {
    setActiveIndex(0);
    requestAnimationFrame(() => sliderRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [sliderKey]);

  useEffect(() => {
    const urls = safeItems
      .slice(0, 3)
      .map((item) => optimizedImageUrl(item.backdrop || item.poster, 'backdrop'))
      .filter((url): url is string => Boolean(isSafeHttpUrl(url)));
    if (urls.length) void Image.prefetch(urls).catch(() => undefined);
  }, [safeItems]);

  useEffect(() => {
    if (safeItems.length <= 1) return undefined;
    const timer = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      const next = (activeIndex + 1) % safeItems.length;
      sliderRef.current?.scrollToOffset({ offset: next * sliderWidth, animated: true });
      setActiveIndex(next);
    }, 5200);
    return () => clearInterval(timer);
  }, [activeIndex, safeItems.length, sliderWidth]);

  if (!safeItems.length) return null;

  return (
    <View style={styles.heroSlider}>
      <FlatList
        ref={sliderRef}
        data={safeItems}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => `${item.type}:${item.id}`}
        getItemLayout={(_, index) => ({ length: sliderWidth, offset: sliderWidth * index, index })}
        onScrollBeginDrag={() => { pauseUntilRef.current = Date.now() + 7000; }}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / sliderWidth);
          setActiveIndex(Math.max(0, Math.min(safeItems.length - 1, index)));
        }}
        renderItem={({ item }) => (
          <View style={[styles.heroSlide, { width: sliderWidth }]}>
            <HeroSlide item={item} onOpen={() => onOpen(item)} />
          </View>
        )}
        removeClippedSubviews={false}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
      />
      {safeItems.length > 1 ? (
        <View style={styles.heroDots}>
          {safeItems.map((item, index) => (
            <Pressable
              key={`${item.type}:${item.id}`}
              onPress={() => {
                pauseUntilRef.current = Date.now() + 7000;
                setActiveIndex(index);
                sliderRef.current?.scrollToOffset({ offset: index * sliderWidth, animated: true });
              }}
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
  compact = false,
  width,
}: {
  entry: ScheduleEntry;
  onOpen: () => void;
  compact?: boolean;
  width?: number;
}) {
  const episodeLabel = entry.episode
    ? [
        entry.season ? `فصل ${toPersianDigits(entry.season)}` : '',
        `قسمت ${toPersianDigits(entry.episode)}`,
      ].filter(Boolean).join(' • ')
    : '';
  const timeLabel = scheduleTimeValue(entry.time);

  return (
    <Pressable
      onPress={onOpen}
      style={[
        styles.scheduleCard,
        compact && styles.scheduleCardCompact,
        width ? { width } : null,
      ]}
    >
      <CatalogArtwork
        primary={entry.poster}
        style={[styles.schedulePoster, compact && styles.schedulePosterCompact]}
        contentFit="cover"
      />
      <View style={styles.scheduleCardBody}>
        <View style={styles.scheduleSourceRow}>
          <Text style={styles.scheduleRegion}>{entry.region === 'iranian' ? 'ایرانی' : 'خارجی'}</Text>
          <View style={styles.liveDot} />
        </View>
        <Text numberOfLines={2} style={[styles.scheduleName, compact && styles.scheduleNameCompact]}>
          {entry.nameFa}
        </Text>
        {episodeLabel ? (
          <Text numberOfLines={1} style={styles.scheduleEpisode}>{episodeLabel}</Text>
        ) : null}
        {timeLabel ? (
          <Text numberOfLines={1} style={[styles.scheduleTime, compact && styles.scheduleTimeCompact]}>
            {timeLabel}
          </Text>
        ) : null}
      </View>
      {!compact ? <Ionicons name="chevron-back" color={COLORS.muted} size={15} /> : null}
    </Pressable>
  );
}

function WeeklySchedule({
  catalog,
  iranianSchedule,
  weeklySchedule,
  onOpenItem,
  isActive,
}: {
  catalog: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
  weeklySchedule: ScheduleEntry[];
  onOpenItem: (item: CatalogItem) => void;
  isActive: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<DayId>(() => localDayId());
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const [foreignEntries, setForeignEntries] = useState<ScheduleEntry[]>([]);
  const [loadingForeign, setLoadingForeign] = useState(true);
  const { width: scheduleViewportWidth } = useWindowDimensions();
  const daysScrollRef = useRef<ScrollView>(null);

  const selectTodayAndScroll = useCallback((animated = true) => {
    const today = localDayId();
    setSelectedDay(today);
    const index = Math.max(0, DAYS.findIndex((day) => day.id === today));
    const itemWidth = 83;
    const contentWidth = DAYS.length * 76 + (DAYS.length - 1) * 7;
    const visualIndexFromLeft = DAYS.length - 1 - index;
    const itemCenter = visualIndexFromLeft * itemWidth + 38;
    const target = Math.max(
      0,
      Math.min(contentWidth - scheduleViewportWidth, itemCenter - scheduleViewportWidth / 2),
    );
    requestAnimationFrame(() => daysScrollRef.current?.scrollTo({ x: target, animated }));
  }, [scheduleViewportWidth]);

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
  const catalogByName = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    catalog.filter((item) => item.type === 'series').forEach((item) => {
      [item.nameFa, item.name].filter(Boolean).forEach((name) => map.set(normalizeComparableText(name), item));
    });
    return map;
  }, [catalog]);

  const inferredEntries = useMemo(() => inferredScheduleFromCatalog(catalog), [catalog]);

  const allEntries = useMemo(() => {
    const merged = new Map<string, ScheduleEntry>();

    const addEntry = (entry: ScheduleEntry) => {
      const item = catalogById.get(String(entry.itemId)) || catalogByName.get(normalizeComparableText(entry.nameFa));
      const normalized: ScheduleEntry = item?.type === 'series'
        ? {
            ...entry,
            itemId: String(item.id),
            nameFa: item.nameFa || entry.nameFa,
            poster: item.poster || entry.poster,
            region: isIranianItem(item) ? 'iranian' : 'foreign',
          }
        : {
            ...entry,
            itemId: String(entry.itemId || entry.id),
          };

      // Later, more authoritative sources replace fallback entries even when
      // the fallback guessed a different weekday. Keeping the day in the key
      // caused one series to appear on both Sunday and its real broadcast day.
      const key = `${normalized.itemId}:${normalized.region}`;
      merged.set(key, normalized);
    };

    // نتیجهٔ آنلاین خارجی نقش پشتیبان دارد؛ برنامهٔ داخل کاتالوگ اولویت بالاتری دارد.
    foreignEntries.forEach(addEntry);
    inferredEntries.forEach(addEntry);
    iranianSchedule.forEach(addEntry);
    weeklySchedule.forEach(addEntry);

    return [...merged.values()].sort((a, b) => {
      const timeDiff = String(a.time || '').localeCompare(String(b.time || ''), 'fa');
      if (timeDiff) return timeDiff;
      return String(a.nameFa || '').localeCompare(String(b.nameFa || ''), 'fa');
    });
  }, [catalogById, catalogByName, foreignEntries, inferredEntries, iranianSchedule, weeklySchedule]);

  useEffect(() => {
    if (isActive) selectTodayAndScroll(false);
  }, [isActive, selectTodayAndScroll]);

  useEffect(() => {
    const syncToday = () => {
      if (isActive) selectTodayAndScroll(true);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncToday();
    });
    const timer = setInterval(syncToday, 60_000);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [isActive, selectTodayAndScroll]);

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
        ref={daysScrollRef}
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

      {dayEntries.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scheduleHorizontalList}
          style={styles.scheduleHorizontalViewport}
          decelerationRate="fast"
        >
          {dayEntries.map((entry) => {
            const item = catalog.find((candidate) => String(candidate.id) === String(entry.itemId)) || catalogByName.get(normalizeComparableText(entry.nameFa));
            const availableWidth = Math.max(270, scheduleViewportWidth - 52);
            const compact = dayEntries.length > 1;
            const cardWidth = compact
              ? Math.max(148, Math.min(196, (availableWidth - 8) / 2))
              : availableWidth;
            return (
              <ScheduleCard
                key={`${entry.id}:${entry.day}`}
                entry={entry}
                compact={compact}
                width={cardWidth}
                onOpen={() => item ? onOpenItem(item) : Alert.alert('برنامه هفتگی', 'صفحه این سریال هنوز در کاتالوگ پیدا نشده است.')}
              />
            );
          })}
        </ScrollView>
      ) : !scheduleLoading ? (
        <View style={styles.scheduleEmpty}>
          <Ionicons name="calendar-outline" color={COLORS.muted} size={28} />
          <Text style={styles.scheduleEmptyTitle}>برای این روز برنامه‌ای نداریم</Text>
          <Text style={styles.scheduleEmptyText}>می‌توانید روز دیگری را انتخاب کنید.</Text>
        </View>
      ) : null}
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
        <CatalogArtwork
          primary={item.poster}
          fallback={item.posterFallback || item.backdropFallback || item.backdrop}
          localFallback={localArtworkForItem(item)}
          style={styles.posterImage}
          contentFit="cover"
          transition={70}
        />
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

function MovieCollectionSection({
  item,
  catalog,
  onOpen,
}: {
  item: CatalogItem;
  catalog: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const members = collectionMembersFor(item, catalog);
  if (members.length < 2) return null;

  return (
    <View style={styles.collectionSection}>
      <View style={styles.collectionHeader}>
        <View style={styles.collectionHeaderIcon}>
          <Ionicons name="film-outline" color={COLORS.gold} size={19} />
        </View>
        <View style={styles.collectionHeaderText}>
          <Text style={styles.collectionEyebrow}>مجموعه فیلم‌ها</Text>
          <Text style={styles.collectionTitle}>
            {item.collectionNameFa || item.collectionName || 'این مجموعه'}
          </Text>
          {item.collectionName ? (
            <Text style={styles.collectionEnglish}>{item.collectionName}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.collectionList}
      >
        {members.map((member, index) => {
          const current = member.id === item.id;
          const order = Number(member.collectionOrder || index + 1);
          return (
            <Pressable
              key={member.id}
              onPress={() => !current && onOpen(member)}
              style={styles.collectionCard}
            >
              <View style={[styles.collectionPosterWrap, current && styles.collectionPosterCurrent]}>
                <Image
                  source={{ uri: member.poster }}
                  style={styles.collectionPoster}
                  contentFit="cover"
                  transition={180}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(7,9,12,0.9)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.collectionOrderBadge}>
                  <Text style={styles.collectionOrderText}>
                    {toPersianDigits(order)}
                  </Text>
                </View>
                {current ? (
                  <View style={styles.collectionCurrentBadge}>
                    <Text style={styles.collectionCurrentText}>در حال مشاهده</Text>
                  </View>
                ) : null}
                <Text numberOfLines={1} style={styles.collectionYear}>
                  {toPersianDigits(member.year)}
                </Text>
              </View>
              <Text numberOfLines={2} style={styles.collectionMovieName}>
                {member.nameFa}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PeopleSection({
  item,
  onOpen,
}: {
  item: CatalogItem;
  onOpen: (person: CatalogPerson) => void;
}) {
  const people = useMemo(() => {
    const unique = new Map<string, CatalogPerson>();
    for (const person of item.people || []) {
      if (person.role !== 'director' && person.role !== 'actor') continue;
      const identity = person.tmdbId
        ? `tmdb:${person.tmdbId}:${person.role}`
        : `name:${normalizeComparableText(personName(person))}:${person.role}`;
      const current = unique.get(identity);
      if (!current || (!optimizedImageUrl(current.image, 'person') && optimizedImageUrl(person.image, 'person'))) {
        unique.set(identity, person);
      }
    }
    return [...unique.values()].sort((a, b) => {
      const roleDifference = (a.role === 'director' ? 0 : 1) - (b.role === 'director' ? 0 : 1);
      return roleDifference || (a.order || 0) - (b.order || 0) || personName(a).localeCompare(personName(b));
    });
  }, [item.people]);

  if (!people.length) return null;

  return (
    <View style={styles.peopleSection}>
      <View style={styles.peopleSectionHeader}>
        <View style={styles.peopleSectionIcon}>
          <Ionicons name="people-outline" color={COLORS.gold} size={19} />
        </View>
        <View style={styles.peopleSectionHeaderText}>
          <Text style={styles.peopleSectionTitle}>عوامل و بازیگران</Text>
          <Text style={styles.peopleSectionSubtitle}>برای دیدن همه آثار، روی هر نفر بزنید.</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.peopleList}
        directionalLockEnabled
      >
        {people.map((person) => {
          const key = person.tmdbId
            ? `tmdb:${person.tmdbId}:${person.role}`
            : `person:${normalizeComparableText(personName(person))}:${person.role}`;
          return (
            <Pressable key={key} onPress={() => onOpen(person)} style={styles.personCard}>
              <View style={styles.personAvatarWrap}>
                <PersonAvatar person={person} style={styles.personAvatar} />
              </View>
              <Text numberOfLines={2} ellipsizeMode="tail" style={styles.personCardName}>{personName(person)}</Text>
              <Text numberOfLines={1} style={styles.personCardRole}>{personRoleTitle(person)}</Text>
              <View style={styles.personCardCharacterWrap}>
                {person.character ? (
                  <>
                    <Text style={styles.personCardCharacterLabel}>نقش</Text>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={styles.personCardCharacter}>{person.character}</Text>
                  </>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
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
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      updateCellsBatchingPeriod={80}
      windowSize={3}
      removeClippedSubviews
    />
  );
}

function HomeStarsSection({
  people,
  catalog,
  onOpen,
}: {
  people: FeaturedPerson[];
  catalog: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const resolvedPeople = useMemo(() => {
    const merged = new Map<string, FeaturedPerson>();
    for (const person of [...people, ...deriveFeaturedPeople(catalog)]) {
      if (person.role !== 'actor' || !personName(person)) continue;
      const key = person.tmdbId
        ? `tmdb:${person.tmdbId}`
        : `name:${normalizeComparableText(personName(person))}`;
      const explicitIds = new Set(person.itemIds || []);
      const matchedIds = explicitIds.size
        ? catalog.filter((item) => explicitIds.has(item.id)).map((item) => item.id)
        : personWorksFor(person, catalog).map((item) => item.id);
      if (!matchedIds.length) continue;
      const current = merged.get(key);
      const next: FeaturedPerson = {
        ...(current || person),
        ...person,
        itemIds: [...new Set([...(current?.itemIds || []), ...matchedIds])],
        workCount: new Set([...(current?.itemIds || []), ...matchedIds]).size,
        image: isSafeHttpUrl(person.image) ? person.image : current?.image,
      };
      merged.set(key, next);
    }
    return [...merged.values()]
      .sort((a, b) =>
        Number(isSafeHttpUrl(b.image)) - Number(isSafeHttpUrl(a.image)) ||
        Number(b.popularity || 0) - Number(a.popularity || 0) ||
        Number(b.workCount || 0) - Number(a.workCount || 0),
      )
      .slice(0, 32);
  }, [catalog, people]);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!resolvedPeople.length) return;
    if (!resolvedPeople.some((person) => person.id === selectedId)) setSelectedId(resolvedPeople[0].id);
  }, [resolvedPeople, selectedId]);

  const selected = resolvedPeople.find((person) => person.id === selectedId) || resolvedPeople[0];
  const works = useMemo(() => {
    if (!selected) return [];
    const explicitIds = new Set(selected.itemIds || []);
    const matched = explicitIds.size
      ? catalog.filter((item) => explicitIds.has(item.id))
      : personWorksFor(selected, catalog);
    return sortForCatalogFilter(matched, 'latest');
  }, [catalog, selected]);

  if (!selected || !works.length) return null;
  const birthday = formatPersonBirthday(selected.birthday);
  const age = personAge(selected);
  const location = selected.nationality || selected.placeOfBirth || '';

  return (
    <View style={styles.starsSection}>
      <View style={styles.starsHeader}>
        <View style={styles.starsHeaderIcon}>
          <Ionicons name="sparkles-outline" color={COLORS.gold} size={17} />
        </View>
        <View style={styles.starsHeaderText}>
          <Text style={styles.starsTitle}>ستارگان</Text>
          <Text style={styles.starsSubtitle}>بازیگران محبوب ایرانی و خارجی</Text>
        </View>
      </View>

      <View style={styles.starChooserRow}>
        <View style={styles.starMiniProfileCard}>
          <View style={styles.starMiniProfileAvatarWrap}>
            <PersonAvatar person={selected} style={styles.starMiniProfileAvatar} />
          </View>
          <View style={styles.starMiniProfileInfo}>
            <Text numberOfLines={2} style={styles.starMiniProfileName}>{personName(selected)}</Text>
            <View style={styles.starMiniFacts}>
              {birthday ? <Text numberOfLines={1} style={styles.starMiniFactText}>{birthday}</Text> : null}
              {age > 0 ? <Text numberOfLines={1} style={styles.starMiniFactText}>{toPersianDigits(age)} ساله</Text> : null}
              {location ? <Text numberOfLines={1} style={styles.starMiniLocation}>{location}</Text> : null}
            </View>
          </View>
        </View>

        <FlatList
          horizontal
          inverted
          style={styles.starPeopleRail}
          data={resolvedPeople}
          keyExtractor={(person) => person.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.starsPeopleList}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={4}
          renderItem={({ item: person }) => {
            const active = person.id === selected.id;
            return (
              <Pressable onPress={() => setSelectedId(person.id)} style={styles.starPersonCard} hitSlop={5}>
                <View style={[styles.starPersonAvatarWrap, active && styles.starPersonAvatarActive]}>
                  <PersonAvatar person={person} style={styles.starPersonAvatar} />
                </View>
                <Text numberOfLines={1} style={[styles.starPersonName, active && styles.starPersonNameActive]}>
                  {personName(person)}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <FlatList
        horizontal
        inverted
        data={works.slice(0, 18)}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.starWorksList}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={3}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)} style={styles.starWorkCard}>
            <CatalogArtwork
              primary={item.poster}
              fallback={item.posterFallback || item.backdrop}
              localFallback={localArtworkForItem(item)}
              style={styles.starWorkPoster}
              imageKind="poster"
            />
            <Text numberOfLines={2} style={styles.starWorkTitle}>{item.nameFa}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function ContinueWatchingSection({
  records,
  catalog,
  onResume,
  onRemove,
}: {
  records: WatchProgressRecord[];
  catalog: CatalogItem[];
  onResume: (record: WatchProgressRecord) => void;
  onRemove: (id: string) => void;
}) {
  const visibleRecords = records
    .filter((record) => catalog.some((item) => item.id === record.itemId) || record.downloadId)
    .slice(0, 10);

  if (!visibleRecords.length) return null;

  return (
    <View style={styles.continueSection}>
      <SectionTitle
        eyebrow="از همان‌جایی که ماندی"
        title="ادامه تماشا"
      />
      <FlatList
        horizontal
        inverted
        data={visibleRecords}
        keyExtractor={(record) => record.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.continueList}
        renderItem={({ item: record }) => {
          const catalogItem = catalog.find((item) => item.id === record.itemId);
          const artwork = record.artwork || catalogItem?.backdrop || catalogItem?.poster;
          const percent = watchProgressPercent(record);
          return (
            <Pressable onPress={() => onResume(record)} style={styles.continueCard}>
              <View style={styles.continueArtworkWrap}>
                {artwork ? (
                  <Image source={{ uri: artwork }} style={styles.continueArtwork} contentFit="cover" transition={180} />
                ) : (
                  <View style={styles.continueArtworkFallback}>
                    <Ionicons name="film-outline" color={COLORS.gold} size={28} />
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(7,9,12,0.95)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.continuePlayIcon}>
                  <Ionicons name="play" color="#fff" size={17} />
                </View>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    onRemove(record.id);
                  }}
                  hitSlop={8}
                  style={styles.continueRemoveButton}
                >
                  <Ionicons name="close" color="#fff" size={15} />
                </Pressable>
                <View style={styles.continueCardText}>
                  <Text numberOfLines={1} style={styles.continueTitle}>{record.title}</Text>
                  <Text numberOfLines={1} style={styles.continueMeta}>
                    ادامه از {formatPlaybackTime(record.position)}
                  </Text>
                </View>
              </View>
              <View style={styles.continueProgressTrack}>
                <View style={[styles.continueProgressFill, { width: `${percent}%` }]} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function HomeScreen({
  catalog,
  iranianSchedule,
  weeklySchedule,
  featuredPeople,
  watchProgress,
  onReloadContent,
  onOpen,
  onBrowse,
  onResume,
  onRemoveProgress,
  onMenu,
  initialScrollOffset,
  onScrollOffset,
  isActive,
}: {
  catalog: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
  weeklySchedule: ScheduleEntry[];
  featuredPeople: FeaturedPerson[];
  watchProgress: WatchProgressRecord[];
  onReloadContent: () => void;
  onOpen: (item: CatalogItem) => void;
  onBrowse: (filter: SearchFilter) => void;
  onResume: (record: WatchProgressRecord) => void;
  onRemoveProgress: (id: string) => void;
  onMenu: () => void;
  initialScrollOffset: number;
  onScrollOffset: (offset: number) => void;
  isActive: boolean;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const newest = useMemo(() => catalogItemsForFilter(catalog, 'latest'), [catalog]);
  const updated = useMemo(() => catalogItemsForFilter(catalog, 'updated'), [catalog]);
  const [mountedRowCount, setMountedRowCount] = useState(4);

  useEffect(() => {
    if (initialScrollOffset > 0) requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: initialScrollOffset, animated: false }));
  }, []);

  const rows = useMemo<{ filter: SearchFilter; title: string; items: CatalogItem[] }[]>(() => [
    { filter: 'latest', title: 'جدیدترین‌ها', items: newest },
    { filter: 'updated', title: 'به‌روزشده‌ها', items: updated },
    { filter: 'mobile-operator', title: 'ویژه اینترنت همراه', items: catalogItemsForFilter(catalog, 'mobile-operator') },
    { filter: 'iranian-movies', title: 'فیلم‌های ایرانی', items: catalogItemsForFilter(catalog, 'iranian-movies') },
    { filter: 'foreign-movies', title: 'فیلم‌های خارجی', items: catalogItemsForFilter(catalog, 'foreign-movies') },
    { filter: 'iranian-series', title: 'سریال‌های ایرانی', items: catalogItemsForFilter(catalog, 'iranian-series') },
    { filter: 'foreign-series', title: 'سریال‌های خارجی', items: catalogItemsForFilter(catalog, 'foreign-series') },
    { filter: 'korean-movies', title: 'فیلم‌های کره‌ای', items: catalogItemsForFilter(catalog, 'korean-movies') },
    { filter: 'korean-series', title: 'سریال‌های کره‌ای', items: catalogItemsForFilter(catalog, 'korean-series') },
    { filter: 'indian-movies', title: 'فیلم‌های هندی', items: catalogItemsForFilter(catalog, 'indian-movies') },
    { filter: 'japanese-movies', title: 'فیلم‌های ژاپنی', items: catalogItemsForFilter(catalog, 'japanese-movies') },
    { filter: 'anime-movies', title: 'انیمه‌های سینمایی', items: catalogItemsForFilter(catalog, 'anime-movies') },
    { filter: 'anime-series', title: 'انیمه‌های سریالی', items: catalogItemsForFilter(catalog, 'anime-series') },
    { filter: 'animation-movies', title: 'انیمیشن‌های سینمایی', items: catalogItemsForFilter(catalog, 'animation-movies') },
    { filter: 'animation-series', title: 'انیمیشن‌های سریالی', items: catalogItemsForFilter(catalog, 'animation-series') },
    { filter: 'programs', title: 'تاک‌شوها و برنامه‌ها', items: catalogItemsForFilter(catalog, 'programs') },
    { filter: 'documentaries', title: 'مستندها', items: catalogItemsForFilter(catalog, 'documentaries') },
  ], [catalog, newest, updated]);

  useEffect(() => {
    setMountedRowCount((current) => Math.min(Math.max(4, current), rows.length));
    if (mountedRowCount >= rows.length) return undefined;
    const timer = setTimeout(() => {
      setMountedRowCount((current) => Math.min(rows.length, current + 3));
    }, 520);
    return () => clearTimeout(timer);
  }, [mountedRowCount, rows.length]);


  if (!newest.length) return (
    <View style={[styles.screen, styles.contentUnavailable]}>
      <Ionicons name="cloud-offline-outline" color={COLORS.gold} size={42} />
      <Text style={styles.largeEmptyTitle}>فهرست محتوا خالی است</Text>
      <Pressable onPress={onReloadContent} style={styles.retryButton}><Text style={styles.retryButtonText}>تلاش دوباره</Text></Pressable>
    </View>
  );

  return (
    <View style={styles.screen}>
      <Header onMenu={onMenu} onSearch={() => onBrowse('all')} onNotifications={() => Alert.alert('اعلان‌ها', 'فعلاً اعلان جدیدی ندارید.')} />
      <ScrollView
        ref={scrollRef}
        style={styles.homeScroll}
        contentContainerStyle={styles.homeContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={80}
        onScroll={(event) => onScrollOffset(event.nativeEvent.contentOffset.y)}
      >
        <HeroSlider items={newest.slice(0, 5)} onOpen={onOpen} />
        <ContinueWatchingSection records={watchProgress} catalog={catalog} onResume={onResume} onRemove={onRemoveProgress} />
        <WeeklySchedule catalog={catalog} iranianSchedule={iranianSchedule} weeklySchedule={weeklySchedule} onOpenItem={onOpen} isActive={isActive} />
        {rows.slice(0, mountedRowCount).map((row) => row.items.length ? (
          <View key={row.filter}>
            <View style={styles.catalogSection}>
              <SectionTitle title={row.title} action="مشاهده همه" onAction={() => onBrowse(row.filter)} />
              <HorizontalCatalog items={row.items.slice(0, 12)} onOpen={onOpen} />
            </View>
            {row.filter === 'foreign-movies' ? (
              <HomeStarsSection people={featuredPeople} catalog={catalog} onOpen={onOpen} />
            ) : null}
          </View>
        ) : null)}
      </ScrollView>
    </View>
  );
}

type CategoryCardConfig = { filter: SearchFilter; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap };


const stableArtworkHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const categoryPreviewScore = (item: CatalogItem) => {
  const remoteBackdrop = isSafeHttpUrl(item.backdrop) && !isPlaceholderUrl(item.backdrop);
  const remotePoster = isSafeHttpUrl(item.poster) && !isPlaceholderUrl(item.poster);
  const remoteFallback = isSafeHttpUrl(item.backdropFallback) || isSafeHttpUrl(item.posterFallback);
  return (
    (remoteBackdrop ? 180 : 0) +
    (remotePoster ? 90 : 0) +
    (remoteFallback ? 25 : 0) +
    Math.max(0, Math.min(10, Number(item.rate || 0))) * 9 +
    (stableArtworkHash(`${item.type}:${item.id}`) % 1000) / 1000
  );
};

const relatedCategoryFilters = (filter: SearchFilter): SearchFilter[] => {
  const map: Partial<Record<SearchFilter, SearchFilter[]>> = {
    movie: ['foreign-movies', 'iranian-movies'],
    series: ['foreign-series', 'iranian-series'],
    'anime-movies': ['anime-series', 'japanese-movies', 'movie'],
    'anime-series': ['anime-movies', 'japanese-movies', 'series'],
    'animation-movies': ['animation-series', 'movie'],
    'animation-series': ['animation-movies', 'series'],
    'iranian-movies': ['iranian-series', 'movie'],
    'foreign-movies': ['foreign-series', 'movie'],
    'iranian-series': ['iranian-movies', 'series'],
    'foreign-series': ['foreign-movies', 'series'],
    dubbed: ['foreign-movies', 'foreign-series', 'movie'],
    subtitled: ['foreign-movies', 'foreign-series', 'movie'],
    updated: ['series', 'movie'],
    'mobile-operator': ['movie', 'series'],
    'korean-movies': ['korean-series', 'foreign-movies'],
    'korean-series': ['korean-movies', 'foreign-series'],
    'indian-movies': ['foreign-movies', 'movie'],
    'japanese-movies': ['anime-movies', 'foreign-movies'],
    collections: ['movie', 'series'],
    documentaries: ['movie', 'series'],
    programs: ['series', 'foreign-series'],
  };
  return map[filter] || ['movie', 'series'];
};

const hasFastCategoryArtwork = (item: CatalogItem) =>
  [item.backdrop, item.poster, item.backdropFallback, item.posterFallback]
    .some((value) => Boolean(optimizedImageUrl(value, 'backdrop')));

function CategoriesScreen({
  catalog,
  onBrowse,
  onOpen,
}: {
  catalog: CatalogItem[];
  onBrowse: (filter: SearchFilter) => void;
  onOpen: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = normalizeComparableText(useDebouncedText(query, 240));
  const { width: screenWidth } = useWindowDimensions();
  const cards: CategoryCardConfig[] = [
    { filter: 'movie', title: 'همه فیلم‌ها', subtitle: 'سینمایی ایرانی و خارجی', icon: 'film-outline' },
    { filter: 'series', title: 'همه سریال‌ها', subtitle: 'ایرانی، خارجی و در حال پخش', icon: 'tv-outline' },
    { filter: 'anime-movies', title: 'انیمه سینمایی', subtitle: 'آثار ژاپنی سینمایی', icon: 'sparkles-outline' },
    { filter: 'anime-series', title: 'انیمه سریالی', subtitle: 'مجموعه‌های ژاپنی', icon: 'sparkles-outline' },
    { filter: 'animation-movies', title: 'انیمیشن سینمایی', subtitle: 'انیمیشن‌های غیرانیمه', icon: 'color-palette-outline' },
    { filter: 'animation-series', title: 'انیمیشن سریالی', subtitle: 'مجموعه‌های غیرانیمه', icon: 'albums-outline' },
    { filter: 'iranian-movies', title: 'فیلم‌های ایرانی', subtitle: 'سینمای ایران', icon: 'flag-outline' },
    { filter: 'foreign-movies', title: 'فیلم‌های خارجی', subtitle: 'سینمای جهان', icon: 'earth-outline' },
    { filter: 'iranian-series', title: 'سریال‌های ایرانی', subtitle: 'مجموعه‌های داخلی', icon: 'videocam-outline' },
    { filter: 'foreign-series', title: 'سریال‌های خارجی', subtitle: 'مجموعه‌های جهان', icon: 'globe-outline' },
    { filter: 'dubbed', title: 'دوبله فارسی', subtitle: 'فیلم و سریال خارجی دوبله', icon: 'volume-high-outline' },
    { filter: 'subtitled', title: 'زیرنویس فارسی', subtitle: 'فیلم و سریال خارجی زیرنویس', icon: 'chatbox-ellipses-outline' },
    { filter: 'updated', title: 'به‌روزشده‌ها', subtitle: 'قسمت یا نسخه تازه', icon: 'refresh-outline' },
    { filter: 'mobile-operator', title: 'ویژه اینترنت همراه', subtitle: 'محتوای اپراتوری', icon: 'phone-portrait-outline' },
    { filter: 'korean-movies', title: 'فیلم‌های کره‌ای', subtitle: 'سینمای کره جنوبی', icon: 'location-outline' },
    { filter: 'korean-series', title: 'سریال‌های کره‌ای', subtitle: 'مجموعه‌های کره جنوبی', icon: 'tv-outline' },
    { filter: 'indian-movies', title: 'فیلم‌های هندی', subtitle: 'سینمای هند', icon: 'location-outline' },
    { filter: 'japanese-movies', title: 'فیلم‌های ژاپنی', subtitle: 'سینمای ژاپن', icon: 'location-outline' },
    { filter: 'collections', title: 'کالکشن‌ها', subtitle: 'قسمت‌های یک مجموعه', icon: 'layers-outline' },
    { filter: 'documentaries', title: 'مستندها', subtitle: 'آثار مستند', icon: 'camera-outline' },
    { filter: 'programs', title: 'برنامه‌ها و تاک‌شوها', subtitle: 'گفت‌وگو و سرگرمی', icon: 'mic-outline' },
  ];


  const categoryPreviewItems = useMemo(() => {
    const result = new Map<SearchFilter, CatalogItem>();
    const usableCatalog = catalog.filter(itemHasUsableContent);
    const sortedBest = (items: CatalogItem[]) => [...items]
      .filter(hasFastCategoryArtwork)
      .sort((a, b) => categoryPreviewScore(b) - categoryPreviewScore(a));

    for (const card of cards) {
      const candidates = [card.filter, ...relatedCategoryFilters(card.filter)];
      let selected: CatalogItem | undefined;
      for (const filter of candidates) {
        selected = sortedBest(catalogItemsForFilter(usableCatalog, filter))[0];
        if (selected) break;
      }
      if (!selected) selected = sortedBest(usableCatalog)[0];
      if (selected) result.set(card.filter, selected);
    }
    return result;
  }, [catalog]);

  const searchResults = useMemo(() => {
    if (!deferredQuery) return [];
    return sortForCatalogFilter(
      catalog.filter((item) => itemHasUsableContent(item) && normalizeComparableText([
        item.nameFa,
        item.name,
        ...(item.genres || []),
        ...(item.countryLabels || []),
        ...(item.countryNames || []),
        ...(item.people || []).flatMap((person) => [person.nameFa, person.name || '']),
      ].join(' ')).includes(deferredQuery)),
      'latest',
    ).slice(0, 40);
  }, [catalog, deferredQuery]);



  const topGenres = useMemo(() => [...new Set(catalog.flatMap((item) => item.genres || []))].filter(Boolean).slice(0, 14), [catalog]);
  const topCountries = useMemo(() => [...new Set(catalog.flatMap((item) => item.countryCodes || []))].slice(0, 12), [catalog]);
  const years = useMemo(() => [...new Set(catalog.map((item) => item.year))].filter((year) => year > 1900).sort((a,b)=>b-a).slice(0, 12), [catalog]);
  const gridGap = 10;
  const columnCount = screenWidth >= 760 ? 3 : 2;
  const categoryWidth = Math.floor((screenWidth - 32 - gridGap * (columnCount - 1)) / columnCount);
  const posterWidth = Math.max(132, Math.floor((screenWidth - 36 - 12) / 2));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.tabScreenContent} keyboardShouldPersistTaps="handled">
      <View style={styles.simpleHeader}><Logo /><Text style={styles.simpleHeaderTitle}>دسته‌بندی</Text></View>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={21} color={COLORS.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="جست‌وجوی فیلم، سریال یا بازیگر…" placeholderTextColor={COLORS.muted} style={styles.searchInput} textAlign="right" />
        {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" size={19} color={COLORS.muted} /></Pressable> : null}
      </View>

      {deferredQuery ? (
        <>
          <Text style={styles.resultCount}>{toPersianDigits(searchResults.length)} نتیجه</Text>
          {searchResults.length ? (
            <View style={[styles.searchGrid, { columnGap: 12 }]}>
              {searchResults.map((item) => <PosterCard key={item.id} item={item} width={posterWidth} onOpen={() => onOpen(item)} />)}
            </View>
          ) : (
            <View style={styles.searchEmptyState}>
              <View style={styles.largeEmptyIcon}><Ionicons name="search-outline" color={COLORS.gold} size={30} /></View>
              <Text style={styles.largeEmptyTitle}>نتیجه‌ای پیدا نشد</Text>
              <Text style={styles.largeEmptyText}>نام فیلم، سریال یا بازیگر را دوباره بررسی کنید.</Text>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={[styles.categoryGrid, { gap: gridGap }]}>
            {cards.map((card) => {
              return (
                <Pressable
                  key={card.filter}
                  onPress={() => onBrowse(card.filter)}
                  style={[styles.categoryCard, { width: categoryWidth }]}
                >
                  {(() => {
                    const preview = categoryPreviewItems.get(card.filter);
                    return preview ? (
                      <CatalogArtwork
                        primary={preview.poster || preview.backdrop}
                        fallback={preview.posterFallback || preview.backdrop || preview.backdropFallback}
                        style={StyleSheet.absoluteFill}
                        imageKind="poster"
                        transition={0}
                      />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.catalogArtworkFallback]}>
                        <Ionicons name="film-outline" color="rgba(216,180,90,0.55)" size={58} />
                      </View>
                    );
                  })()}
                  <LinearGradient
                    colors={['rgba(6,8,11,0.12)', 'rgba(6,8,11,0.72)', 'rgba(6,8,11,0.98)']}
                    locations={[0, 0.55, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.categoryCardIcon}><Ionicons name={card.icon} color={COLORS.gold} size={22} /></View>
                  <View style={styles.categoryCardTextWrap}>
                    <Text numberOfLines={1} style={styles.categoryCardTitle}>{card.title}</Text>
                    <Text numberOfLines={1} style={styles.categoryCardSubtitle}>{card.subtitle}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <SectionTitle title="ژانرها" /><View style={styles.dynamicChips}>{topGenres.map((genre) => <Pressable key={genre} onPress={() => onBrowse(genreFilter(genre))} style={styles.dynamicChip}><Text style={styles.dynamicChipText}>{genre}</Text></Pressable>)}</View>
          <SectionTitle title="کشورها" /><View style={styles.dynamicChips}>{topCountries.map((code) => <Pressable key={code} onPress={() => onBrowse(countryFilter(code))} style={styles.dynamicChip}><Text style={styles.dynamicChipText}>{countryLabel(code, catalog)}</Text></Pressable>)}</View>
          <SectionTitle title="سال ساخت" /><View style={styles.dynamicChips}>{years.map((year) => <Pressable key={year} onPress={() => onBrowse(yearFilter(year))} style={styles.dynamicChip}><Text style={styles.dynamicChipText}>{toPersianDigits(year)}</Text></Pressable>)}</View>
        </>
      )}
    </ScrollView>
  );
}

function CatalogListScreen({
  catalog,
  onOpen,
  initialFilter,
}: {
  catalog: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
  initialFilter: SearchFilter;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(normalizeComparableText(query));
  const { width: screenWidth } = useWindowDimensions();
  const baseItems = useMemo(
    () => catalogItemsForFilter(catalog, initialFilter),
    [catalog, initialFilter],
  );
  const results = useMemo(() => {
    if (!deferredQuery) return baseItems;
    return baseItems.filter((item) => normalizeComparableText([
      item.nameFa,
      item.name,
      ...(item.genres || []),
      ...(item.countryLabels || []),
      ...(item.countryNames || []),
      ...(item.people || []).flatMap((person) => [person.nameFa, person.name || '']),
    ].join(' ')).includes(deferredQuery));
  }, [baseItems, deferredQuery]);
  const columnCount = screenWidth >= 720 ? 5 : screenWidth >= 590 ? 4 : screenWidth >= 480 ? 3 : 2;
  const gridGap = 12;
  const cardWidth = Math.floor((screenWidth - 32 - gridGap * (columnCount - 1)) / columnCount);

  const header = (
    <View>
      <View style={styles.simpleHeader}>
        <Logo />
        <Text numberOfLines={1} style={styles.simpleHeaderTitle}>{filterTitle(initialFilter)}</Text>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" color={COLORS.muted} size={21} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`جست‌وجو در ${filterTitle(initialFilter)}…`}
          placeholderTextColor="#646A74"
          style={styles.searchInput}
          textAlign="right"
        />
        {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" color={COLORS.muted} size={18} /></Pressable> : null}
      </View>
      <Text style={styles.resultCount}>{toPersianDigits(results.length)} نتیجه</Text>
    </View>
  );

  return (
    <FlatList
      key={`${initialFilter}-${columnCount}`}
      style={styles.screen}
      contentContainerStyle={styles.catalogListContent}
      keyboardShouldPersistTaps="handled"
      data={results}
      numColumns={columnCount}
      keyExtractor={(item) => item.id}
      columnWrapperStyle={columnCount > 1 ? { gap: gridGap, flexDirection: 'row-reverse' } : undefined}
      ListHeaderComponent={header}
      ListEmptyComponent={(
        <View style={styles.searchEmptyState}>
          <View style={styles.largeEmptyIcon}><Ionicons name="search-outline" color={COLORS.gold} size={30} /></View>
          <Text style={styles.largeEmptyTitle}>نتیجه‌ای پیدا نشد</Text>
          <Text style={styles.largeEmptyText}>عبارت جست‌وجو را تغییر دهید.</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <View style={{ width: cardWidth, marginBottom: 16 }}>
          <PosterCard item={item} width={cardWidth} onOpen={() => onOpen(item)} />
        </View>
      )}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={7}
      updateCellsBatchingPeriod={35}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
    />
  );
}

function SimpleSearchScreen({
  catalog,
  onOpen,
}: {
  catalog: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = normalizeComparableText(useDebouncedText(query, 340));
  const { width: screenWidth } = useWindowDimensions();
  const columnCount = screenWidth >= 720 ? 4 : screenWidth >= 520 ? 3 : 2;
  const gap = 12;
  const cardWidth = Math.floor((screenWidth - 32 - gap * (columnCount - 1)) / columnCount);
  const searchIndex = useMemo(
    () => catalog
      .filter(itemHasUsableContent)
      .map((item) => ({
        item,
        text: normalizeComparableText([
          item.nameFa,
          item.name,
          ...(item.genres || []),
          ...(item.countryLabels || []),
          ...(item.countryNames || []),
          ...(item.people || []).flatMap((person) => [person.nameFa, person.name || '']),
        ].join(' ')),
      })),
    [catalog],
  );
  const results = useMemo(() => {
    if (!deferredQuery) return [];
    const matched: CatalogItem[] = [];
    for (const entry of searchIndex) {
      if (!entry.text.includes(deferredQuery)) continue;
      matched.push(entry.item);
      if (matched.length >= 48) break;
    }
    return sortForCatalogFilter(matched, 'latest');
  }, [deferredQuery, searchIndex]);

  return (
    <View style={styles.screen}>
      <View style={styles.simpleSearchHeader}>
        <Logo />
        <Text style={styles.simpleHeaderTitle}>جست‌وجو</Text>
      </View>
      <View style={styles.simpleSearchBoxWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" color={COLORS.muted} size={21} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="نام فیلم، سریال یا بازیگر…"
            placeholderTextColor="#646A74"
            style={styles.searchInput}
            textAlign="right"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={12}>
              <Ionicons name="close-circle" color={COLORS.muted} size={20} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {!deferredQuery ? (
        <View style={styles.searchEmptyState}>
          <View style={styles.largeEmptyIcon}><Ionicons name="search-outline" color={COLORS.gold} size={30} /></View>
          <Text style={styles.largeEmptyTitle}>نام فیلم یا سریال را بنویسید</Text>
          <Text style={styles.largeEmptyText}>جست‌وجو بدون فیلتر و با نمایش سبک نتایج انجام می‌شود.</Text>
        </View>
      ) : results.length ? (
        <FlatList
          key={columnCount}
          data={results}
          numColumns={columnCount}
          keyExtractor={(item) => `${item.type}:${item.id}`}
          contentContainerStyle={styles.simpleSearchResults}
          columnWrapperStyle={columnCount > 1 ? { gap } : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={45}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item }) => (
            <View style={{ width: cardWidth, marginBottom: 19 }}>
              <PosterCard item={item} width={cardWidth} onOpen={() => onOpen(item)} />
            </View>
          )}
          ListHeaderComponent={<Text style={styles.simpleSearchResultCount}>{toPersianDigits(results.length)} نتیجه</Text>}
        />
      ) : (
        <View style={styles.searchEmptyState}>
          <View style={styles.largeEmptyIcon}><Ionicons name="search-outline" color={COLORS.gold} size={30} /></View>
          <Text style={styles.largeEmptyTitle}>نتیجه‌ای پیدا نشد</Text>
          <Text style={styles.largeEmptyText}>املای نام را بررسی کنید.</Text>
        </View>
      )}
    </View>
  );
}

function SearchScreen(props: {
  catalog: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
  initialFilter: SearchFilter;
}) {
  return props.initialFilter === 'all'
    ? <SimpleSearchScreen catalog={props.catalog} onOpen={props.onOpen} />
    : <CatalogListScreen {...props} />;
}

function AdvancedSearchScreen({
  catalog,
  onOpen,
  initialFilter,
}: {
  catalog: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
  initialFilter: SearchFilter;
}) {
  const initialCountry = countryCodeFromFilter(initialFilter);
  const initialGenre = genreFromFilter(initialFilter);
  const initialYear = yearFromFilter(initialFilter);
  const [query, setQuery] = useState('');
  const deferredQuery = useDebouncedText(query, 260);
  const [filter, setFilter] = useState<SearchFilter>((initialCountry || initialGenre || initialYear) ? 'all' : initialFilter);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialCountry || initialGenre || initialYear));
  const [selectedCountry, setSelectedCountry] = useState(initialCountry);
  const [selectedGenre, setSelectedGenre] = useState(initialGenre);
  const [selectedYear, setSelectedYear] = useState<number | null>(initialYear || null);
  const [personQuery, setPersonQuery] = useState('');
  const deferredPersonQuery = useDebouncedText(personQuery, 220);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [personRole, setPersonRole] = useState<PersonRoleFilter>('all');
  const { width: screenWidth } = useWindowDimensions();
  const searchableCatalog = useMemo(() => catalog.filter(itemHasUsableContent), [catalog]);

  useEffect(() => {
    const nextCountry = countryCodeFromFilter(initialFilter);
    const nextGenre = genreFromFilter(initialFilter);
    const nextYear = yearFromFilter(initialFilter);
    setFilter((nextCountry || nextGenre || nextYear) ? 'all' : initialFilter);
    setSelectedCountry(nextCountry);
    setSelectedGenre(nextGenre);
    setSelectedYear(nextYear || null);
    setPersonQuery('');
    setSelectedPersonId('');
    setPersonRole('all');
    setAdvancedOpen(Boolean(nextCountry || nextGenre || nextYear));
    setQuery('');
  }, [initialFilter]);

  const normalizedQuery = normalizeComparableText(deferredQuery);
  const normalizedPersonQuery = normalizeComparableText(deferredPersonQuery);
  const searchReady = Boolean(
    normalizedQuery ||
    filter !== 'all' ||
    selectedCountry ||
    selectedGenre ||
    selectedYear ||
    normalizedPersonQuery ||
    selectedPersonId ||
    personRole !== 'all'
  );

  const availableCountryCodes = useMemo(() => advancedOpen ? [...new Set(
    searchableCatalog.flatMap((item) => item.countryCodes || []),
  )].sort((a, b) => {
    const aIndex = COUNTRY_FILTER_PRIORITY.indexOf(a);
    const bIndex = COUNTRY_FILTER_PRIORITY.indexOf(b);
    if (aIndex >= 0 || bIndex >= 0) {
      if (aIndex < 0) return 1;
      if (bIndex < 0) return -1;
      return aIndex - bIndex;
    }
    return countryLabel(a, catalog).localeCompare(countryLabel(b, catalog), 'fa');
  }) : [], [advancedOpen, catalog]);

  const availableGenres = useMemo(() => {
    if (!advancedOpen) return [];
    const counts = new Map<string, number>();
    for (const item of searchableCatalog) {
      for (const genre of item.genres || []) {
        const cleaned = genre.trim();
        if (!cleaned) continue;
        counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'))
      .map(([genre]) => genre);
  }, [advancedOpen, catalog, searchableCatalog]);

  const availableYears = useMemo(() => advancedOpen ? [...new Set(
    searchableCatalog
      .map((item) => Number(item.year))
      .filter((year) => Number.isFinite(year) && year > 1800),
  )].sort((a, b) => b - a) : [], [advancedOpen, catalog]);

  const availablePeople = useMemo(() => {
    if (!advancedOpen) return [];
    const people = new Map<string, { person: CatalogPerson; count: number }>();
    for (const item of searchableCatalog) {
      for (const person of item.people || []) {
        const current = people.get(person.id);
        people.set(person.id, {
          person: current?.person || person,
          count: (current?.count || 0) + 1,
        });
      }
    }
    return [...people.values()].sort((a, b) =>
      b.count - a.count || personName(a.person).localeCompare(personName(b.person), 'fa'),
    );
  }, [advancedOpen, searchableCatalog]);

  const personSuggestions = useMemo(() => {
    if (!normalizedPersonQuery) return [];
    return availablePeople
      .filter(({ person }) => {
        if (personRole !== 'all' && person.role !== personRole) return false;
        return [person.nameFa, person.name]
          .filter(Boolean)
          .some((name) => String(name).toLowerCase().includes(normalizedPersonQuery));
      })
      .slice(0, 12);
  }, [availablePeople, normalizedPersonQuery, personRole]);

  const results = useMemo(() => {
    if (!searchReady) return [];
    return sortForCatalogFilter(
    searchableCatalog.filter((item) => {
      const searchableText = normalizeComparableText([
        item.nameFa,
        item.name,
        ...(item.genres || []),
        ...(item.countryLabels || []),
        ...(item.countryNames || []),
        ...(item.people || []).flatMap((person) => [person.nameFa, person.name || '']),
      ].join(' '));
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);

      const matchesCountry =
        !selectedCountry || item.countryCodes?.includes(selectedCountry);
      const matchesGenre =
        !selectedGenre || item.genres.includes(selectedGenre);
      const matchesYear =
        !selectedYear || item.year === selectedYear;

      const eligiblePeople = (item.people || []).filter((person) =>
        personRole === 'all' || person.role === personRole,
      );
      const matchesPersonRole = personRole === 'all' || eligiblePeople.length > 0;
      const matchesPerson = selectedPersonId
        ? eligiblePeople.some((person) => person.id === selectedPersonId)
        : !normalizedPersonQuery || eligiblePeople.some((person) =>
          normalizeComparableText(`${person.nameFa} ${person.name || ''}`).includes(normalizedPersonQuery),
        );

      return (
        matchesQuery &&
        matchesCatalogFilter(item, filter) &&
        matchesCountry &&
        matchesGenre &&
        matchesYear &&
        matchesPersonRole &&
        matchesPerson
      );
    }),
    filter,
  ).slice(0, 80);
  }, [
    catalog,
    searchableCatalog,
    searchReady,
    filter,
    normalizedPersonQuery,
    normalizedQuery,
    personRole,
    selectedCountry,
    selectedGenre,
    selectedPersonId,
    selectedYear,
  ]);

  const basicFilters: { id: SearchFilter; label: string }[] = [
    { id: 'all', label: 'همه' },
    { id: 'movie', label: 'فیلم' },
    { id: 'series', label: 'سریال' },
    { id: 'mobile-operator', label: 'ویژه همراه' },
    { id: 'dubbed', label: 'دوبله فارسی' },
    { id: 'subtitled', label: 'زیرنویس فارسی' },
  ];
  const categoryLocked = initialFilter !== 'all';
  const visibleFilters = categoryLocked
    ? []
    : (basicFilters.some((entry) => entry.id === filter) ? basicFilters : [{ id: filter, label: filterTitle(filter) }, ...basicFilters]);

  const activeAdvancedCount = [
    Boolean(selectedCountry),
    Boolean(selectedGenre),
    Boolean(selectedYear),
    Boolean(normalizedPersonQuery || selectedPersonId),
    personRole !== 'all',
  ].filter(Boolean).length;

  const clearAdvancedFilters = () => {
    setSelectedCountry('');
    setSelectedGenre('');
    setSelectedYear(null);
    setPersonQuery('');
    setSelectedPersonId('');
    setPersonRole('all');
  };

  const columnCount = screenWidth >= 720 ? 5 : screenWidth >= 590 ? 4 : screenWidth >= 480 ? 3 : 2;
  const gridGap = 12;
  const cardWidth = Math.floor(
    (screenWidth - 32 - gridGap * (columnCount - 1)) / columnCount,
  );
  const screenTitle = selectedCountry
    ? `آثار ${countryLabel(selectedCountry, catalog)}`
    : selectedGenre || (filter === 'all' ? 'جست‌وجو' : filterTitle(filter));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.tabScreenContent}>
      <View style={styles.simpleHeader}>
        <Logo />
        <Text numberOfLines={1} style={styles.simpleHeaderTitle}>{screenTitle}</Text>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" color={COLORS.muted} size={21} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="نام فیلم، سریال یا شخص…"
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

      <Pressable
        onPress={() => setAdvancedOpen((current) => !current)}
        style={[styles.advancedFilterToggle, advancedOpen && styles.advancedFilterToggleOpen]}
      >
        <View style={styles.advancedFilterToggleMain}>
          <View style={styles.advancedFilterIcon}>
            <Ionicons name="options-outline" color={COLORS.gold} size={19} />
          </View>
          <View style={styles.advancedFilterToggleText}>
            <Text style={styles.advancedFilterTitle}>فیلتر پیشرفته</Text>
            <Text style={styles.advancedFilterHint}>
              {activeAdvancedCount
                ? `${toPersianDigits(activeAdvancedCount)} فیلتر فعال`
                : 'کشور، ژانر، سال، بازیگر و کارگردان'}
            </Text>
          </View>
        </View>
        <View style={styles.advancedFilterToggleSide}>
          {activeAdvancedCount ? (
            <View style={styles.activeFilterBadge}>
              <Text style={styles.activeFilterBadgeText}>{toPersianDigits(activeAdvancedCount)}</Text>
            </View>
          ) : null}
          <Ionicons
            name={advancedOpen ? 'chevron-up' : 'chevron-down'}
            color={COLORS.muted}
            size={18}
          />
        </View>
      </Pressable>

      {advancedOpen ? (
        <View style={styles.advancedFilterPanel}>
          <View style={styles.advancedFilterSection}>
            <Text style={styles.advancedFilterSectionTitle}>کشور سازنده</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.advancedFilterChips}
            >
              <Pressable
                onPress={() => setSelectedCountry('')}
                style={[styles.filterChip, !selectedCountry && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, !selectedCountry && styles.filterChipTextActive]}>همه کشورها</Text>
              </Pressable>
              {availableCountryCodes.map((code) => (
                <Pressable
                  key={code}
                  onPress={() => setSelectedCountry(code)}
                  style={[styles.filterChip, selectedCountry === code && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selectedCountry === code && styles.filterChipTextActive]}>
                    {countryLabel(code, catalog)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.advancedFilterSection}>
            <Text style={styles.advancedFilterSectionTitle}>ژانر</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.advancedFilterChips}
            >
              <Pressable
                onPress={() => setSelectedGenre('')}
                style={[styles.filterChip, !selectedGenre && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, !selectedGenre && styles.filterChipTextActive]}>همه ژانرها</Text>
              </Pressable>
              {availableGenres.map((genre) => (
                <Pressable
                  key={genre}
                  onPress={() => setSelectedGenre(genre)}
                  style={[styles.filterChip, selectedGenre === genre && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selectedGenre === genre && styles.filterChipTextActive]}>{genre}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.advancedFilterSection}>
            <Text style={styles.advancedFilterSectionTitle}>سال انتشار</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.advancedFilterChips}
            >
              <Pressable
                onPress={() => setSelectedYear(null)}
                style={[styles.filterChip, !selectedYear && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, !selectedYear && styles.filterChipTextActive]}>همه سال‌ها</Text>
              </Pressable>
              {availableYears.map((year) => (
                <Pressable
                  key={year}
                  onPress={() => setSelectedYear(year)}
                  style={[styles.filterChip, selectedYear === year && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selectedYear === year && styles.filterChipTextActive]}>
                    {toPersianDigits(year)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.advancedFilterSection}>
            <Text style={styles.advancedFilterSectionTitle}>بازیگر یا کارگردان</Text>
            <View style={styles.personFilterRoleRow}>
              {([
                ['all', 'همه عوامل'],
                ['actor', 'بازیگران'],
                ['director', 'کارگردان‌ها'],
              ] as [PersonRoleFilter, string][]).map(([role, label]) => (
                <Pressable
                  key={role}
                  onPress={() => {
                    setPersonRole(role);
                    setSelectedPersonId('');
                  }}
                  style={[styles.personRoleChip, personRole === role && styles.personRoleChipActive]}
                >
                  <Text style={[styles.personRoleChipText, personRole === role && styles.filterChipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.personFilterSearchBox}>
              <Ionicons name="person-outline" color={COLORS.muted} size={18} />
              <TextInput
                value={personQuery}
                onChangeText={(value) => {
                  setPersonQuery(value);
                  setSelectedPersonId('');
                }}
                placeholder="نام بازیگر یا کارگردان را بنویسید…"
                placeholderTextColor="#646A74"
                style={styles.personFilterInput}
                textAlign="right"
              />
              {personQuery ? (
                <Pressable
                  onPress={() => {
                    setPersonQuery('');
                    setSelectedPersonId('');
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" color={COLORS.muted} size={18} />
                </Pressable>
              ) : null}
            </View>
            {personSuggestions.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.personSuggestions}
              >
                {personSuggestions.map(({ person, count }) => (
                  <Pressable
                    key={person.id}
                    onPress={() => {
                      setSelectedPersonId(person.id);
                      setPersonQuery(personName(person));
                    }}
                    style={[
                      styles.personSuggestionChip,
                      selectedPersonId === person.id && styles.personSuggestionChipActive,
                    ]}
                  >
                    <Text style={styles.personSuggestionName}>{personName(person)}</Text>
                    <Text style={styles.personSuggestionMeta}>
                      {personRoleTitle(person)} • {toPersianDigits(count)} اثر
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>

          {activeAdvancedCount ? (
            <Pressable onPress={clearAdvancedFilters} style={styles.clearAdvancedFiltersButton}>
              <Ionicons name="refresh-outline" color={COLORS.red} size={17} />
              <Text style={styles.clearAdvancedFiltersText}>پاک‌کردن فیلترهای پیشرفته</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {searchReady ? <Text style={styles.resultCount}>{toPersianDigits(results.length)} نتیجه</Text> : null}
      {!searchReady ? (
        <View style={styles.searchEmptyState}>
          <View style={styles.largeEmptyIcon}>
            <Ionicons name="search-outline" color={COLORS.gold} size={30} />
          </View>
          <Text style={styles.largeEmptyTitle}>دنبال چه چیزی می‌گردید؟</Text>
          <Text style={styles.largeEmptyText}>نام فیلم، سریال یا بازیگر را بنویسید تا نتایج نمایش داده شوند.</Text>
        </View>
      ) : results.length ? (
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
      ) : (
        <View style={styles.searchEmptyState}>
          <View style={styles.largeEmptyIcon}>
            <Ionicons name="search-outline" color={COLORS.gold} size={30} />
          </View>
          <Text style={styles.largeEmptyTitle}>نتیجه‌ای پیدا نشد</Text>
          <Text style={styles.largeEmptyText}>عبارت جست‌وجو یا یکی از فیلترها را تغییر دهید.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function FavoritesScreen({
  catalog,
  favorites,
  watchHistory,
  onOpen,
  onOpenHistory,
  onRemoveHistory,
  onClearHistory,
}: {
  catalog: CatalogItem[];
  favorites: string[];
  watchHistory: WatchHistoryRecord[];
  onOpen: (item: CatalogItem) => void;
  onOpenHistory: (record: WatchHistoryRecord) => void;
  onRemoveHistory: (id: string) => void;
  onClearHistory: () => void;
}) {
  const [view, setView] = useState<'favorites' | 'history'>('favorites');
  const items = catalog.filter((item) => favorites.includes(item.id));
  const history = watchHistory
    .filter((record) => catalog.some((item) => item.id === record.itemId) || record.downloadId)
    .slice(0, 100);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.tabScreenContent}>
      <View style={styles.simpleHeader}>
        <Logo />
        <Text style={styles.simpleHeaderTitle}>کتابخانه من</Text>
      </View>

      <View style={styles.libraryTabs}>
        <Pressable
          onPress={() => setView('favorites')}
          style={[styles.libraryTab, view === 'favorites' && styles.libraryTabActive]}
        >
          <Ionicons
            name={view === 'favorites' ? 'bookmark' : 'bookmark-outline'}
            color={view === 'favorites' ? COLORS.gold : COLORS.muted}
            size={17}
          />
          <Text style={[styles.libraryTabText, view === 'favorites' && styles.libraryTabTextActive]}>
            نشان‌شده‌ها ({toPersianDigits(items.length)})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setView('history')}
          style={[styles.libraryTab, view === 'history' && styles.libraryTabActive]}
        >
          <Ionicons
            name={view === 'history' ? 'time' : 'time-outline'}
            color={view === 'history' ? COLORS.gold : COLORS.muted}
            size={17}
          />
          <Text style={[styles.libraryTabText, view === 'history' && styles.libraryTabTextActive]}>
            تاریخچه ({toPersianDigits(history.length)})
          </Text>
        </Pressable>
      </View>

      {view === 'favorites' ? (
        !items.length ? (
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
        )
      ) : (
        <>
          {history.length ? (
            <View style={styles.historyToolbar}>
              <Text style={styles.historyToolbarText}>آخرین {toPersianDigits(history.length)} مورد تماشا</Text>
              <Pressable onPress={onClearHistory} style={styles.historyClearButton}>
                <Ionicons name="trash-outline" color={COLORS.red} size={15} />
                <Text style={styles.historyClearText}>پاک‌کردن تاریخچه</Text>
              </Pressable>
            </View>
          ) : null}
          {!history.length ? (
            <View style={styles.largeEmpty}>
              <View style={styles.largeEmptyIcon}>
                <Ionicons name="time-outline" color={COLORS.gold} size={35} />
              </View>
              <Text style={styles.largeEmptyTitle}>تاریخچه‌ای ثبت نشده</Text>
              <Text style={styles.largeEmptyText}>بعد از حداقل ۱۵ ثانیه تماشا، سابقه پخش اینجا نمایش داده می‌شود.</Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {history.map((record) => {
                const catalogItem = catalog.find((item) => item.id === record.itemId);
                const artwork = record.artwork || catalogItem?.backdrop || catalogItem?.poster;
                const percent = watchProgressPercent(record);
                return (
                  <Pressable key={record.id} onPress={() => onOpenHistory(record)} style={styles.historyCard}>
                    <View style={styles.historyArtworkWrap}>
                      {artwork ? (
                        <Image source={{ uri: artwork }} style={styles.historyArtwork} contentFit="cover" transition={180} />
                      ) : (
                        <View style={styles.historyArtworkFallback}>
                          <Ionicons name="film-outline" color={COLORS.gold} size={23} />
                        </View>
                      )}
                      <View style={styles.historyArtworkPlay}>
                        <Ionicons name={record.completed ? 'refresh' : 'play'} color="#fff" size={14} />
                      </View>
                    </View>
                    <View style={styles.historyBody}>
                      <View style={styles.historyTitleRow}>
                        <Text numberOfLines={1} style={styles.historyTitle}>{record.title}</Text>
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            onRemoveHistory(record.id);
                          }}
                          hitSlop={8}
                          style={styles.historyRemoveButton}
                        >
                          <Ionicons name="close" color={COLORS.muted} size={15} />
                        </Pressable>
                      </View>
                      <Text numberOfLines={1} style={styles.historySubtitle}>
                        {[record.sourceQuality, historyDateLabel(record.updatedAt)].filter(Boolean).join(' • ')}
                      </Text>
                      <Text style={[styles.historyStatus, record.completed && styles.historyStatusCompleted]}>
                        {record.completed
                          ? 'تماشا شده؛ برای مشاهده دوباره بزنید'
                          : `آخرین توقف: ${formatPlaybackTime(record.position)}`}
                      </Text>
                      {!record.completed && record.duration > 0 ? (
                        <View style={styles.historyProgressTrack}>
                          <View style={[styles.historyProgressFill, { width: `${percent}%` }]} />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const downloadLanguageLabel = (language?: MediaLanguage) =>
  language === 'dubbed' ? 'دوبله فارسی' : language === 'subtitled' ? 'زیرنویس فارسی' : '';

const downloadDisplayMeta = (record: DownloadRecord, catalogItem?: CatalogItem) => {
  const matchedGroup = catalogItem?.downloads?.find((group) =>
    (group.files || []).some((file) =>
      file.url === record.sourceUrl || record.id.endsWith(`-${file.id}`),
    ),
  );
  const matchedFile = matchedGroup?.files?.find((file) =>
    file.url === record.sourceUrl || record.id.endsWith(`-${file.id}`),
  );
  const mediaType = record.mediaType || catalogItem?.type;
  const seasonNumber = Number(record.seasonNumber || matchedGroup?.seasonNumber || 0);
  const episodeNumber = Number(record.episodeNumber || matchedGroup?.episodeNumber || 0);
  const language = record.language || matchedFile?.language;
  const artwork = record.artwork || catalogItem?.poster || catalogItem?.backdrop;
  const episodeTitle = record.episodeTitle || cleanMediaLabel(matchedGroup?.subtitle);

  return {
    artwork,
    mediaType,
    seasonNumber,
    episodeNumber,
    language,
    episodeTitle,
    episodeLabel: mediaType === 'series' && episodeNumber > 0
      ? `فصل ${toPersianDigits(seasonNumber || 1)} • قسمت ${toPersianDigits(episodeNumber)}`
      : '',
  };
};

function DownloadsScreen({
  downloads,
  catalog,
  onPlay,
  onPause,
  onResume,
  onMenu,
  onClearIncomplete,
  onClearCompleted,
}: {
  downloads: DownloadRecord[];
  catalog: CatalogItem[];
  onPlay: (record: DownloadRecord) => void;
  onPause: (record: DownloadRecord) => void;
  onResume: (record: DownloadRecord) => void;
  onMenu: (record: DownloadRecord) => void;
  onClearIncomplete: () => void;
  onClearCompleted: () => void;
}) {
  const completedCount = downloads.filter((record) => record.status === 'completed').length;
  const incompleteCount = downloads.length - completedCount;
  const storedBytes = downloads.reduce((total, record) => total + Math.max(0, Number(record.status === 'completed' ? (record.totalBytes || record.bytesWritten || 0) : (record.bytesWritten || 0))), 0);
  const expectedBytes = downloads.reduce((total, record) => total + Math.max(0, Number(record.totalBytes || 0)), 0);
  const remainingBytes = downloads.reduce((total, record) => total + Math.max(0, Number(record.totalBytes || 0) - Number(record.bytesWritten || 0)), 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.tabScreenContent}>
      <View style={styles.simpleHeader}>
        <Logo />
        <Text style={styles.simpleHeaderTitle}>دریافت‌ها</Text>
      </View>
      <View style={styles.storageSummary}>
        <View style={styles.storageSummaryMain}>
          <View style={styles.storageSummaryIcon}>
            <Ionicons name="phone-portrait-outline" color={COLORS.gold} size={23} />
          </View>
          <View style={styles.storageSummaryText}>
            <Text style={styles.storageSummaryTitle}>حافظه مصرف‌شده داخل برنامه</Text>
            <Text style={styles.storageSummaryValue}>{formatStorageSize(storedBytes)}</Text>
          </View>
        </View>
        {expectedBytes > 0 ? <View style={styles.storageTotals}><Text style={styles.storageTotalText}>حجم کل فایل‌ها: {formatStorageSize(expectedBytes)}</Text><Text style={styles.storageTotalText}>باقی‌مانده: {formatStorageSize(remainingBytes)}</Text></View> : null}
        <View style={styles.storageStatsRow}>
          <View style={styles.storageStat}>
            <Text style={styles.storageStatValue}>{toPersianDigits(completedCount)}</Text>
            <Text style={styles.storageStatLabel}>فایل کامل</Text>
          </View>
          <View style={styles.storageStatDivider} />
          <View style={styles.storageStat}>
            <Text style={styles.storageStatValue}>{toPersianDigits(incompleteCount)}</Text>
            <Text style={styles.storageStatLabel}>ناتمام</Text>
          </View>
        </View>
        {downloads.length ? (
          <View style={styles.storageActions}>
            {incompleteCount ? (
              <Pressable onPress={onClearIncomplete} style={styles.storageActionButton}>
                <Ionicons name="close-circle-outline" color={COLORS.muted} size={16} />
                <Text style={styles.storageActionText}>حذف دانلودهای ناتمام</Text>
              </Pressable>
            ) : null}
            {completedCount ? (
              <Pressable onPress={onClearCompleted} style={[styles.storageActionButton, styles.storageActionDanger]}>
                <Ionicons name="trash-outline" color={COLORS.red} size={16} />
                <Text style={[styles.storageActionText, styles.storageActionDangerText]}>حذف فایل‌های کامل</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
            const catalogItem = catalog.find((item) => item.id === record.itemId);
            const display = downloadDisplayMeta(record, catalogItem);
            const languageLabel = downloadLanguageLabel(display.language);
            const compactMeta = [display.episodeLabel, languageLabel, record.quality]
              .filter(Boolean)
              .join(' • ');

            return (
              <View key={record.id} style={styles.downloadLibraryCard}>
                <Pressable
                  disabled={!canPlay}
                  onPress={() => canPlay && onPlay(record)}
                  style={styles.downloadLibraryArtworkWrap}
                >
                  {display.artwork ? (
                    <Image
                      source={{ uri: display.artwork }}
                      style={styles.downloadLibraryArtwork}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={160}
                    />
                  ) : (
                    <View style={styles.downloadLibraryArtworkFallback}>
                      <Ionicons name={display.mediaType === 'series' ? 'tv-outline' : 'film-outline'} color={COLORS.gold} size={24} />
                    </View>
                  )}
                  {canPlay ? (
                    <View style={styles.downloadLibraryArtworkPlay}>
                      <Ionicons name="play" color="#fff" size={15} />
                    </View>
                  ) : null}
                </Pressable>

                <View style={styles.downloadLibraryInfo}>
                  <Text numberOfLines={1} style={styles.downloadLibraryTitle}>{record.title}</Text>
                  {record.subtitle ? (
                    <Text numberOfLines={1} style={styles.downloadLibraryEnglish}>{record.subtitle}</Text>
                  ) : null}
                  {compactMeta ? (
                    <Text numberOfLines={1} style={styles.downloadLibraryMeta}>{compactMeta}</Text>
                  ) : null}
                  {display.episodeTitle && display.episodeTitle !== record.title ? (
                    <Text numberOfLines={1} style={styles.downloadLibraryEpisodeTitle}>{display.episodeTitle}</Text>
                  ) : null}
                  {record.status !== 'completed' ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${percent}%` }]} />
                    </View>
                  ) : null}
                  <Text style={styles.downloadLibraryBytes}>{record.totalBytes ? `${formatStorageSize(record.bytesWritten || 0)} از ${formatStorageSize(record.totalBytes)}` : 'حجم در حال محاسبه'}</Text>
                  <Text style={styles.downloadLibraryStatus}>
                    {record.status === 'completed'
                      ? 'دانلود کامل شده و آماده پخش است'
                      : record.status === 'downloading'
                        ? `${toPersianDigits(percent)}٪ در حال دریافت`
                        : record.status === 'paused'
                          ? record.error || `${toPersianDigits(percent)}٪ متوقف شده`
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
            {group.badge || (group.language === 'dubbed' ? 'دوبله' : group.language === 'subtitled' ? 'زیرنویس' : 'دریافت')}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} color={COLORS.gold} size={19} />
      </Pressable>
      {open ? (
        <View style={styles.qualityList}>
          {onPlay ? (
            <Pressable onPress={onPlay} style={styles.languagePlayButton}>
              <Ionicons name="play" color="#fff" size={17} />
              <Text style={styles.languagePlayButtonText}>پخش آنلاین</Text>
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

function OperatorAccessGroup({
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
  const files = operatorFilesFor(group.files);
  if (!files.length) return null;

  return (
    <View style={[styles.operatorGroup, open && styles.operatorGroupOpen]}>
      <Pressable onPress={onToggle} style={styles.downloadGroupHead}>
        <View style={styles.downloadGroupText}>
          <Text style={styles.downloadGroupTitle}>ویژه اینترنت همراه</Text>
          <Text style={styles.downloadGroupSubtitle}>
            وای‌فای و فیلترشکن را خاموش کنید و با اینترنت سیم‌کارت وارد شوید.
          </Text>
        </View>
        <View style={styles.operatorGroupBadge}>
          <Text style={styles.operatorGroupBadgeText}>همراه</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} color={COLORS.gold} size={19} />
      </Pressable>
      {open ? (
        <View style={styles.operatorActionList}>
          <View style={styles.operatorNotice}>
            <Ionicons name="phone-portrait-outline" color={COLORS.gold} size={20} />
            <Text style={styles.operatorNoticeText}>
              این لینک فقط روی اینترنت همراهِ اپراتورهای پشتیبانی‌شده باز می‌شود.
            </Text>
          </View>
          {files.map((file) => {
            const isPlay = downloadModeFor(file) === 'operator-play';
            return (
              <Pressable
                key={file.id}
                onPress={() => onOpenFile(file)}
                style={styles.operatorActionButton}
              >
                <Ionicons
                  name={isPlay ? 'play' : 'download-outline'}
                  color="#fff"
                  size={17}
                />
                <View style={styles.operatorActionText}>
                  <Text style={styles.operatorActionTitle}>
                    {isPlay ? 'پخش با اینترنت همراه' : 'دریافت با اینترنت همراه'}
                  </Text>
                  <Text style={styles.operatorActionSubtitle}>
                    {cleanMediaLabel(file.label) || 'ویژه همراه اول، ایرانسل، رایتل و اپراتورهای همراه'}
                  </Text>
                </View>
              </Pressable>
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
  onOpenOperator,
  iranian,
}: {
  group: DownloadSection;
  open: boolean;
  openLanguage: string | null;
  onToggle: (defaultLanguageId: string | null) => void;
  onToggleLanguage: (id: string) => void;
  onOpenFile: (file: DownloadFile, group: DownloadSection) => void;
  onPlayLanguage: (language?: MediaLanguage) => void;
  onOpenOperator: (file: DownloadFile) => void;
  iranian: boolean;
}) {
  const languageGroups = languageSectionsForFiles(group.files, group.id, iranian);
  const operatorFiles = operatorFilesFor(group.files);
  if (!languageGroups.length && !operatorFiles.length) return null;
  const operatorGroupId = `${group.id}-operator`;

  return (
    <View style={[styles.episodeGroup, open && styles.episodeGroupOpen]}>
      <Pressable
        onPress={() => onToggle(languageGroups[0]?.id || (operatorFiles.length ? operatorGroupId : null))}
        style={styles.episodeGroupHead}
      >
        <View style={styles.episodeGroupText}>
          <Text style={styles.episodeGroupTitle}>
            قسمت {toPersianDigits(group.episodeNumber || 0)}
          </Text>
          <Text numberOfLines={1} style={styles.episodeGroupSubtitle}>
            {cleanMediaLabel(group.subtitle) ||
              `${toPersianDigits(languageGroups.length + (operatorFiles.length ? 1 : 0))} گزینه پخش یا دریافت`}
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
              onOpenFile={(file) => onOpenFile(file, group)}
              onPlay={playbackSourcesForFiles(group.files.filter((file) => file.language === languageGroup.language)).length
                ? () => onPlayLanguage(languageGroup.language)
                : undefined}
            />
          ))}
          {operatorFiles.length ? (
            <OperatorAccessGroup
              group={group}
              open={openLanguage === operatorGroupId}
              onToggle={() => onToggleLanguage(operatorGroupId)}
              onOpenFile={onOpenOperator}
            />
          ) : null}
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
  onOpenOperator,
}: {
  item: CatalogItem;
  openGroup: string | null;
  openLanguage: string | null;
  onToggleEpisode: (id: string, defaultLanguageId: string | null) => void;
  onToggleLanguage: (id: string) => void;
  onOpenFile: (file: DownloadFile, group: DownloadSection) => void;
  onPlayLanguage: (group: DownloadSection, language?: MediaLanguage) => void;
  onOpenOperator: (file: DownloadFile) => void;
}) {
  const episodeGroups = [...(item.downloads || [])]
    .filter((group) =>
      isEpisodeSection(group) &&
      (
        languageSectionsForFiles(group.files, group.id, item.ir).length > 0 ||
        operatorFilesFor(group.files).length > 0
      ),
    )
    .sort(compareEpisodeGroupsNewestFirst);

  const seasons = episodeGroups.reduce<Record<number, DownloadSection[]>>((result, group) => {
    const seasonNumber = Number(group.seasonNumber || 1);
    if (!result[seasonNumber]) result[seasonNumber] = [];
    result[seasonNumber].push(group);
    return result;
  }, {});

  const seasonNumbers = Object.keys(seasons)
    .map(Number)
    .sort((a, b) => b - a);
  const latestSeason = seasonNumbers[0] || 1;
  const seasonKey = `${item.id}:${seasonNumbers.join(',')}`;
  const [selectedSeason, setSelectedSeason] = useState(latestSeason);

  useEffect(() => {
    setSelectedSeason(latestSeason);
  }, [seasonKey, latestSeason]);

  const visibleSeason = seasons[selectedSeason] ? selectedSeason : latestSeason;
  const visibleGroups = seasons[visibleSeason] || [];

  return (
    <View style={styles.seriesEpisodes}>
      {seasonNumbers.length > 1 ? (
        <View style={styles.seasonSelectorWrap}>
          <View style={styles.seasonSelectorHeader}>
            <Text style={styles.seasonSelectorTitle}>انتخاب فصل</Text>
            <Text style={styles.seasonSelectorMeta}>
              {toPersianDigits(seasonNumbers.length)} فصل
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.seasonSelector}
          >
            {seasonNumbers.map((seasonNumber) => {
              const active = visibleSeason === seasonNumber;
              return (
                <Pressable
                  key={seasonNumber}
                  onPress={() => setSelectedSeason(seasonNumber)}
                  style={[styles.seasonChip, active && styles.seasonChipActive]}
                >
                  <Text style={[styles.seasonChipText, active && styles.seasonChipTextActive]}>
                    فصل {toPersianDigits(seasonNumber)}
                  </Text>
                  <Text style={[styles.seasonChipCount, active && styles.seasonChipCountActive]}>
                    {toPersianDigits(seasons[seasonNumber]?.length || 0)} قسمت
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.seasonBlock}>
        <View style={styles.seasonTitleRow}>
          <Text style={styles.seasonTitle}>فصل {toPersianDigits(visibleSeason)}</Text>
          <Text style={styles.seasonCount}>{toPersianDigits(visibleGroups.length)} قسمت</Text>
        </View>
        {visibleGroups.map((group) => (
          <EpisodeDownloadGroup
            key={group.id}
            group={group}
            open={openGroup === group.id}
            openLanguage={openLanguage}
            onToggle={(defaultLanguageId) => onToggleEpisode(group.id, defaultLanguageId)}
            onToggleLanguage={onToggleLanguage}
            onOpenFile={onOpenFile}
            onPlayLanguage={(language) => onPlayLanguage(group, language)}
            onOpenOperator={onOpenOperator}
            iranian={isIranianItem(item)}
          />
        ))}
      </View>
    </View>
  );
}

function DetailModal({
  item,
  catalog,
  visible,
  onClose,
  favorite,
  onFavorite,
  episodeAlertEnabled,
  episodeAlertBusy,
  onEpisodeAlert,
  onStream,
  onDownload,
  onOperatorOpen,
  onOpenRelated,
  onOpenPerson,
  onBrowse,
  vpnActive,
  onVpnRetry,
}: {
  item: CatalogItem | null;
  catalog: CatalogItem[];
  visible: boolean;
  onClose: () => void;
  favorite: boolean;
  onFavorite: () => void;
  episodeAlertEnabled: boolean;
  episodeAlertBusy: boolean;
  onEpisodeAlert: () => void;
  onStream: (item: CatalogItem, episodeGroup?: DownloadSection | null, language?: MediaLanguage) => void;
  onDownload: (item: CatalogItem, file: DownloadFile, episodeGroup?: DownloadSection) => void;
  onOperatorOpen: (item: CatalogItem, file: DownloadFile) => void;
  onOpenRelated: (item: CatalogItem) => void;
  onOpenPerson: (person: CatalogPerson) => void;
  onBrowse: (filter: SearchFilter) => void;
  vpnActive: boolean;
  onVpnRetry: () => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openLanguage, setOpenLanguage] = useState<string | null>(null);

  useEffect(() => { setOpenGroup(null); setOpenLanguage(null); }, [item?.id, visible]);
  if (!item) return null;

  const downloadGroups = item.downloads || [];
  const directMovieFiles = downloadGroups
    .filter((group) => !isEpisodeSection(group))
    .flatMap((group) => group.files || [])
    .filter((file) => !isOperatorFile(file));
  const movieDownloadGroups = languageSectionsForFiles(directMovieFiles, `movie-${item.id}`, isIranianItem(item));
  const episodeGroups = downloadGroups.filter((group) => isEpisodeSection(group) && (languageSectionsForFiles(group.files, group.id, isIranianItem(item)).length || operatorFilesFor(group.files).length));
  const standaloneOperatorGroups = downloadGroups.filter((group) => !isEpisodeSection(group) && operatorFilesFor(group.files).length > 0);
  const standaloneOperatorPlayFile = standaloneOperatorGroups.flatMap((group) => operatorFilesFor(group.files)).find((file) => downloadModeFor(file) === 'operator-play');
  const hasDownloads = item.type === 'series' ? episodeGroups.length > 0 || standaloneOperatorGroups.length > 0 : movieDownloadGroups.length > 0 || standaloneOperatorGroups.length > 0;
  const latestEpisode = newestEpisodeGroup(item);
  const hasPlayableStream = playableVersionsFor(item).length > 0;

  const browseAndClose = (filter: SearchFilter) => { onClose(); requestAnimationFrame(() => onBrowse(filter)); };

  return (
    <Modal visible={visible} animationType="fade" hardwareAccelerated statusBarTranslucent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.detailScreen} edges={['top','right','bottom','left']}>
        <StatusBar style="light" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
          <View style={styles.detailHero}>
            <Image source={{ uri: item.backdrop || item.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={['rgba(7,9,12,0.06)', COLORS.background]} style={StyleSheet.absoluteFill} />
            <View style={styles.detailTopBar}>
              <Pressable onPress={onClose} style={styles.detailCircleButton}><Ionicons name="arrow-forward" color="#fff" size={21} /></Pressable>
              <View style={styles.detailTopActions}>
                {item.type === 'series' ? <Pressable disabled={episodeAlertBusy} onPress={onEpisodeAlert} style={[styles.detailCircleButton, episodeAlertBusy && styles.detailCircleButtonDisabled]}>{episodeAlertBusy ? <ActivityIndicator color={COLORS.gold} size="small" /> : <Ionicons name={episodeAlertEnabled ? 'notifications' : 'notifications-outline'} color={episodeAlertEnabled ? COLORS.gold : '#fff'} size={21} />}</Pressable> : null}
                <Pressable onPress={onFavorite} style={styles.detailCircleButton}><Ionicons name={favorite ? 'bookmark' : 'bookmark-outline'} color={favorite ? COLORS.gold : '#fff'} size={21} /></Pressable>
              </View>
            </View>
            <View style={styles.detailIdentity}>
              <Image source={{ uri: item.poster }} style={styles.detailPoster} contentFit="cover" />
              <View style={styles.detailTitleBlock}>
                <Text style={styles.detailType}>{mediaKindLabel(item)}</Text>
                {itemHasOperatorAccess(item) ? <View style={styles.detailOperatorBadge}><Ionicons name="phone-portrait-outline" color={COLORS.gold} size={12} /><Text style={styles.detailOperatorBadgeText}>ویژه اینترنت همراه</Text></View> : null}
                <Text
                  numberOfLines={adaptiveTitleLines(item.nameFa)}
                  adjustsFontSizeToFit={false}
                  style={[styles.detailTitle, adaptiveTitleStyle(item.nameFa, 'detail')]}
                >
                  {item.nameFa}
                </Text>
                <Text style={styles.detailEnglish}>{item.name}</Text>
                <View style={styles.detailMeta}>
                  <Pressable onPress={() => browseAndClose(yearFilter(item.year))}><Text style={styles.detailMetaText}>{toPersianDigits(item.year)}</Text></Pressable>
                  {typeof item.rate === 'number' ? <Text style={styles.detailMetaText}>IMDb {toPersianDigits(item.rate)}</Text> : null}
                  {item.type === 'series' && latestEpisode ? <Text style={styles.detailMetaText}>تا قسمت {toPersianDigits(latestEpisode.episodeNumber || 0)}</Text> : null}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.detailBody}>
            <View style={styles.detailActions}>
              {!vpnActive && item.type === 'movie' && (hasPlayableStream || standaloneOperatorPlayFile) ? <Pressable onPress={() => hasPlayableStream ? onStream(item) : standaloneOperatorPlayFile && onOperatorOpen(item, standaloneOperatorPlayFile)} style={[styles.watchButton, !hasPlayableStream && styles.operatorWatchButton]}><Ionicons name={hasPlayableStream ? 'play' : 'phone-portrait-outline'} color="#fff" size={19} /><Text style={styles.watchButtonText}>{hasPlayableStream ? 'پخش آنلاین' : 'پخش با اینترنت همراه'}</Text></Pressable> : null}
              <Pressable onPress={() => void shareCatalogItem(item)} style={styles.detailSecondaryButton}><Ionicons name="share-social-outline" color={COLORS.text} size={20} /></Pressable>
            </View>

            <View style={styles.genreRow}>
              {(item.countryCodes || []).map((code, index) => <Pressable key={`country-${code}`} onPress={() => browseAndClose(countryFilter(code))}><Text style={styles.detailGenre}>{item.countryLabels?.[index] || countryLabel(code, catalog)}</Text></Pressable>)}
              {item.genres.map((genre) => <Pressable key={genre} onPress={() => browseAndClose(genreFilter(genre))}><Text style={styles.detailGenre}>{genre}</Text></Pressable>)}
            </View>

            <Text style={styles.detailSectionTitle}>داستان {item.nameFa}</Text><Text style={styles.detailOverview}>{item.overview}</Text>
            <PeopleSection item={item} onOpen={onOpenPerson} />
            <MovieCollectionSection item={item} catalog={catalog} onOpen={onOpenRelated} />

            <View style={styles.downloadHeader}><View><Text style={styles.detailSectionTitle}>{item.type === 'series' ? 'فصل‌ها و قسمت‌ها' : 'لینک‌های دریافت'}</Text><Text style={styles.downloadHeaderText}>{item.type === 'series' ? 'قسمت را باز کنید؛ گزینه‌های همان قسمت جدا نمایش داده می‌شوند.' : 'نسخه‌های دوبله و زیرنویس به‌صورت جدا نمایش داده می‌شوند.'}</Text></View><Ionicons name={item.type === 'series' ? 'albums-outline' : 'cloud-download-outline'} color={COLORS.gold} size={24} /></View>

            {vpnActive ? (
              <View style={styles.vpnLinksHiddenCard}>
                <View style={styles.vpnLinksHiddenIcon}><Ionicons name="shield-outline" color={COLORS.gold} size={25} /></View>
                <Text style={styles.vpnLinksHiddenTitle}>لینک‌های دانلود مخفی هستند</Text>
                <Text style={styles.vpnLinksHiddenText}>فیلترشکن خود را خاموش کنید و دوباره امتحان کنید.</Text>
                <Pressable onPress={onVpnRetry} style={styles.vpnLinksHiddenButton}>
                  <Ionicons name="refresh-outline" color="#fff" size={18} />
                  <Text style={styles.vpnLinksHiddenButtonText}>بررسی مجدد</Text>
                </Pressable>
              </View>
            ) : !hasDownloads ? <View style={styles.emptyDownloads}><Text style={styles.emptyDownloadsTitle}>لینک قابل استفاده‌ای موجود نیست</Text><Text style={styles.emptyDownloadsText}>در حال حاضر لینک پخش یا دریافت معتبری برای این عنوان ثبت نشده است.</Text></View> : item.type === 'series' ? (
              <SeriesEpisodeList
                item={item}
                openGroup={openGroup}
                openLanguage={openLanguage}
                onToggleEpisode={(id, defaultLanguageId) => { const nextOpen = openGroup === id ? null : id; setOpenGroup(nextOpen); setOpenLanguage(nextOpen ? defaultLanguageId : null); }}
                onToggleLanguage={(id) => setOpenLanguage((current) => current === id ? null : id)}
                onOpenFile={(file, group) => onDownload(item, file, group)}
                onPlayLanguage={(group, language) => onStream(item, group, language)}
                onOpenOperator={(file) => onOperatorOpen(item, file)}
              />
            ) : (
              <View style={styles.movieDownloads}>
                {movieDownloadGroups.map((group) => <DownloadGroup key={group.id} group={group} open={openGroup === group.id} onToggle={() => setOpenGroup((current) => current === group.id ? null : group.id)} onOpenFile={(file) => onDownload(item, file)} />)}
                {standaloneOperatorGroups.map((group) => <OperatorAccessGroup key={`operator-${group.id}`} group={group} open={openGroup === `operator-${group.id}`} onToggle={() => setOpenGroup((current) => current === `operator-${group.id}` ? null : `operator-${group.id}`)} onOpenFile={(file) => onOperatorOpen(item, file)} />)}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PersonProfileModal({
  person,
  catalog,
  visible,
  onClose,
  onOpenItem,
}: {
  person: CatalogPerson | null;
  catalog: CatalogItem[];
  visible: boolean;
  onClose: () => void;
  onOpenItem: (item: CatalogItem) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  if (!person) return null;

  const works = personWorksFor(person, catalog);
  const cardGap = 12;
  const cardWidth = Math.floor((screenWidth - 32 - cardGap) / 2);

  return (
    <Modal visible={visible} animationType="fade" hardwareAccelerated statusBarTranslucent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.personProfileScreen} edges={['top', 'right', 'bottom', 'left']}>
        <StatusBar style="light" />
        <View style={styles.personProfileTopBar}>
          <Pressable onPress={onClose} style={styles.detailCircleButton}>
            <Ionicons name="arrow-forward" color="#fff" size={21} />
          </Pressable>
          <Text numberOfLines={1} style={styles.personProfileTopTitle}>صفحه عوامل</Text>
          <View style={styles.detailCircleButtonPlaceholder} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.personProfileContent}>
          <View style={styles.personProfileHeader}>
            <View style={styles.personProfileAvatarWrap}>
              <PersonAvatar person={person} style={styles.personProfileAvatar} />
            </View>
            <Text style={styles.personProfileName}>{personName(person)}</Text>
            <View style={styles.personProfileRoleBadge}>
              <Ionicons
                name={person.role === 'director' ? 'videocam-outline' : 'person-outline'}
                color={COLORS.gold}
                size={15}
              />
              <Text style={styles.personProfileRoleText}>{personRoleTitle(person)}</Text>
            </View>
          </View>

          <View style={styles.personWorksHeader}>
            <Text style={styles.personWorksTitle}>فیلم‌ها و سریال‌ها</Text>
            <Text style={styles.personWorksCount}>{toPersianDigits(works.length)} عنوان</Text>
          </View>

          {works.length ? (
            <View style={styles.personWorksGrid}>
              {works.map((work) => (
                <PosterCard
                  key={work.id}
                  item={work}
                  width={cardWidth}
                  onOpen={() => onOpenItem(work)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.personWorksEmpty}>
              <Ionicons name="film-outline" color={COLORS.muted} size={27} />
              <Text style={styles.personWorksEmptyTitle}>اثر دیگری در کاتالوگ پیدا نشد</Text>
              <Text style={styles.personWorksEmptyText}>با کامل‌شدن کاتالوگ، آثار بیشتری اینجا نمایش داده می‌شوند.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}


function VideoPlayerModal({
  request,
  onClose,
  onProgress,
}: {
  request: VideoRequest;
  onClose: () => void;
  onProgress: (request: VideoRequest, position: number, duration: number, completed?: boolean) => void;
}) {
  const orderedSources = useMemo(
    () => [...request.sources].sort((a, b) => a.rank - b.rank),
    [request.sources],
  );
  const initialSource = orderedSources.find((source) => source.id === request.initialSourceId) || orderedSources[0];
  const [activeSource, setActiveSource] = useState(initialSource);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'speed' | 'quality' | null>('speed');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [switchingQuality, setSwitchingQuality] = useState(false);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(Math.max(0, Number(request.resumeAt || 0)));
  const [duration, setDuration] = useState(0);
  const [timelineWidth, setTimelineWidth] = useState(1);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = viewportWidth > viewportHeight;
  const portraitFrameHeight = Math.round(viewportWidth * 9 / 16);
  const portraitTopBarHeight = 54;
  const portraitBottomBarHeight = 96;
  const portraitAvailableHeight = Math.max(0, viewportHeight - insets.top - insets.bottom);
  const portraitGroupHeight = portraitTopBarHeight + portraitFrameHeight + portraitBottomBarHeight;
  const portraitGroupTop = Math.max(
    insets.top + 2,
    insets.top + Math.round((portraitAvailableHeight - portraitGroupHeight) / 2),
  );
  const frameTop = landscape ? 0 : portraitGroupTop + portraitTopBarHeight;
  const safeLeft = landscape ? Math.max(72, insets.left + 16) : 12;
  const safeRight = landscape ? Math.max(72, insets.right + 16) : 12;
  const frameRect = landscape
    ? { top: 0, left: 0, width: viewportWidth, height: viewportHeight }
    : { top: frameTop, left: 0, width: viewportWidth, height: portraitFrameHeight };
  const latestTimeRef = useRef(Math.max(0, Number(request.resumeAt || 0)));
  const latestDurationRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qualitySources = useMemo(() => {
    const unique = new Map<string, PlaybackSource>();
    orderedSources.forEach((source) => {
      const qualityMatch = String(source.quality || '').match(/(\d{3,4})\s*p/i);
      if (!qualityMatch) return;
      const label = `${qualityMatch[1]}p`;
      if (!unique.has(label)) unique.set(label, { ...source, quality: label });
    });
    return [...unique.values()].sort((a, b) => {
      const aValue = Number.parseInt(a.quality, 10) || 0;
      const bValue = Number.parseInt(b.quality, 10) || 0;
      return bValue - aValue;
    });
  }, [orderedSources]);

  const player = useVideoPlayer(initialSource.url, (instance) => {
    instance.timeUpdateEventInterval = 0.5;
    instance.playbackRate = 1;
    instance.preservesPitch = true;
    instance.play();
  });

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsTimer();
    if (!firstFrameReady || settingsOpen) return;
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3200);
  }, [clearControlsTimer, firstFrameReady, settingsOpen]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  const hideControls = useCallback(() => {
    if (settingsOpen || !firstFrameReady) return;
    clearControlsTimer();
    setControlsVisible(false);
  }, [clearControlsTimer, firstFrameReady, settingsOpen]);

  useEventListener(player, 'playingChange', ({ isPlaying: nextPlaying }) => {
    setIsPlaying(Boolean(nextPlaying));
  });

  useEventListener(player, 'sourceLoad', ({ duration: loadedDuration }) => {
    const safeDuration = Math.max(0, Number(loadedDuration || player.duration || 0));
    latestDurationRef.current = safeDuration;
    setDuration(safeDuration);
    if (!resumeAppliedRef.current && Number(request.resumeAt || 0) > 0) {
      const maximumResume = safeDuration > 10 ? safeDuration - 5 : Number(request.resumeAt || 0);
      const resumeAt = Math.max(0, Math.min(Number(request.resumeAt || 0), maximumResume));
      player.currentTime = resumeAt;
      latestTimeRef.current = resumeAt;
      setCurrentTime(resumeAt);
      resumeAppliedRef.current = true;
    }
  });

  useEventListener(player, 'timeUpdate', ({ currentTime: nextCurrentTime }) => {
    const position = Math.max(0, Number(nextCurrentTime || 0));
    const safeDuration = Math.max(0, Number(player.duration || latestDurationRef.current || 0));
    latestTimeRef.current = position;
    latestDurationRef.current = safeDuration;
    setCurrentTime(position);
    if (safeDuration > 0) setDuration(safeDuration);
    onProgress(request, position, safeDuration, false);
  });

  useEventListener(player, 'playToEnd', () => {
    const safeDuration = Math.max(0, Number(player.duration || latestDurationRef.current || 0));
    setCurrentTime(safeDuration);
    setIsPlaying(false);
    setControlsVisible(true);
    onProgress(request, safeDuration, safeDuration, true);
  });

  useEffect(() => {
    if (!firstFrameReady || settingsOpen) {
      clearControlsTimer();
      setControlsVisible(true);
      return;
    }
    scheduleControlsHide();
  }, [clearControlsTimer, firstFrameReady, landscape, scheduleControlsHide, settingsOpen]);

  useEffect(
    () => () => {
      clearControlsTimer();
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    },
    [clearControlsTimer],
  );

  const closePlayer = () => {
    const position = Math.max(0, Number(player.currentTime || latestTimeRef.current || 0));
    const safeDuration = Math.max(0, Number(player.duration || latestDurationRef.current || 0));
    clearControlsTimer();
    player.pause();
    onProgress(request, position, safeDuration, false);
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    onClose();
  };

  const handleBack = () => {
    if (settingsOpen) {
      setSettingsOpen(false);
      revealControls();
      return;
    }
    if (landscape) {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
      revealControls();
      return;
    }
    closePlayer();
  };

  const togglePlayback = () => {
    if (player.playing) player.pause();
    else player.play();
    revealControls();
  };

  const seekTo = (nextTime: number) => {
    const safeDuration = Math.max(0, Number(player.duration || latestDurationRef.current || duration || 0));
    const target = Math.max(0, safeDuration > 0 ? Math.min(nextTime, safeDuration) : nextTime);
    player.currentTime = target;
    latestTimeRef.current = target;
    setCurrentTime(target);
    revealControls();
  };

  const seekBy = (seconds: number) => seekTo(Number(player.currentTime || latestTimeRef.current || 0) + seconds);

  const changePlaybackRate = (rate: number) => {
    player.playbackRate = rate;
    player.preservesPitch = true;
    setPlaybackRate(rate);
    revealControls();
  };

  const switchQuality = async (nextSource: PlaybackSource) => {
    if (nextSource.id === activeSource.id || switchingQuality) return;
    const previousTime = Math.max(0, Number(player.currentTime || latestTimeRef.current || 0));
    setSwitchingQuality(true);
    setFirstFrameReady(false);
    clearControlsTimer();
    try {
      player.pause();
      await player.replaceAsync(nextSource.url);
      if (previousTime > 0) player.currentTime = previousTime;
      setActiveSource(nextSource);
      player.play();
    } catch {
      Alert.alert('کیفیت پخش', 'تغییر کیفیت انجام نشد. دوباره تلاش کنید.');
      player.play();
    } finally {
      setSwitchingQuality(false);
      setSettingsOpen(false);
      setControlsVisible(true);
    }
  };

  const toggleOrientation = () => {
    setSettingsOpen(false);
    setControlsVisible(true);
    clearControlsTimer();
    void ScreenOrientation.lockAsync(
      landscape
        ? ScreenOrientation.OrientationLock.PORTRAIT_UP
        : ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => undefined);
  };

  const toggleSurfaceControls = () => {
    if (controlsVisible) hideControls();
    else revealControls();
  };

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const chromeVisible = !firstFrameReady || switchingQuality || settingsOpen || controlsVisible;
  const topBarStyle = landscape
    ? { top: Math.max(8, insets.top + 4), left: safeLeft, right: safeRight }
    : { top: portraitGroupTop, left: 12, right: 12, height: portraitTopBarHeight };
  const bottomPanelStyle = landscape
    ? { left: safeLeft, right: safeRight, bottom: Math.max(8, insets.bottom + 8) }
    : { top: frameTop + portraitFrameHeight + 2, left: 12, right: 12, height: portraitBottomBarHeight };

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleBack}
      supportedOrientations={['portrait', 'landscape']}
      statusBarTranslucent
      navigationBarTranslucent={false}
    >
      <View style={styles.mediaModal}>
        <StatusBar style="light" hidden={landscape} backgroundColor="#000000" />

        <View style={[styles.videoFrame, frameRect]}>
          {request.artwork && !firstFrameReady && optimizedImageUrl(request.artwork, 'backdrop') ? (
            <Image
              source={{ uri: optimizedImageUrl(request.artwork, 'backdrop') }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={0}
            />
          ) : null}
          <VideoView
            player={player}
            style={[styles.videoView, !firstFrameReady && styles.videoViewPreparing]}
            nativeControls={false}
            contentFit="contain"
            allowsPictureInPicture
            fullscreenOptions={{ enable: false }}
            surfaceType="textureView"
            useExoShutter
            onFirstFrameRender={() => {
              setFirstFrameReady(true);
              setControlsVisible(true);
            }}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={toggleSurfaceControls} />
        </View>

        {!firstFrameReady || switchingQuality ? (
          <View style={[styles.playerFramePortal, frameRect]} pointerEvents="none">
            <ActivityIndicator color={COLORS.gold} size="small" />
          </View>
        ) : null}

        {chromeVisible ? (
          <View pointerEvents="box-none" style={styles.playerControlsLayer}>
            {landscape ? (
              <>
                <LinearGradient colors={['rgba(0,0,0,0.82)', 'transparent']} style={styles.playerTopGradient} pointerEvents="none" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={styles.playerBottomGradient} pointerEvents="none" />
              </>
            ) : null}

            <View style={[styles.nativePlayerTopBar, !landscape && styles.playerDetachedBar, topBarStyle]}>
              <Pressable onPress={closePlayer} style={styles.nativePlayerTopButton} accessibilityLabel="بستن پخش‌کننده">
                <Ionicons name="close" color="#fff" size={22} />
              </Pressable>
              <Text numberOfLines={1} style={styles.nativePlayerTitle}>{request.title}</Text>
              <Pressable onPress={toggleOrientation} style={styles.nativePlayerTopButton} accessibilityLabel={landscape ? 'حالت عمودی' : 'حالت افقی'}>
                <Ionicons name={landscape ? 'phone-portrait-outline' : 'phone-landscape-outline'} color="#fff" size={20} />
              </Pressable>
            </View>

            {firstFrameReady && !switchingQuality ? (
              <View pointerEvents="box-none" style={[styles.playerCenterZone, frameRect]}>
                <View style={[styles.playerCenterControls, landscape && styles.playerCenterControlsLandscape]}>
                  <Pressable onPress={() => seekBy(-10)} style={styles.playerRoundButton} accessibilityLabel="ده ثانیه عقب">
                    <Ionicons name="play-back" color="#fff" size={26} />
                    <Text style={styles.playerSkipText}>۱۰</Text>
                  </Pressable>
                  <Pressable onPress={togglePlayback} style={styles.playerPrimaryButton} accessibilityLabel={isPlaying ? 'توقف' : 'پخش'}>
                    <Ionicons name={isPlaying ? 'pause' : 'play'} color="#05070A" size={34} />
                  </Pressable>
                  <Pressable onPress={() => seekBy(10)} style={styles.playerRoundButton} accessibilityLabel="ده ثانیه جلو">
                    <Ionicons name="play-forward" color="#fff" size={26} />
                    <Text style={styles.playerSkipText}>۱۰</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={[styles.playerBottomPanel, !landscape && styles.playerDetachedBottomPanel, bottomPanelStyle]}>
              <Pressable
                style={styles.playerTimelineTrack}
                onLayout={(event) => setTimelineWidth(Math.max(1, event.nativeEvent.layout.width))}
                onPress={(event) => {
                  if (duration <= 0) return;
                  seekTo((Math.max(0, Math.min(timelineWidth, event.nativeEvent.locationX)) / timelineWidth) * duration);
                }}
              >
                <View style={styles.playerTimelineRail} />
                <View style={[styles.playerTimelineFill, { width: `${progress * 100}%` }]} />
                <View style={[styles.playerTimelineThumb, { left: `${progress * 100}%` }]} />
              </Pressable>
              <View style={styles.playerTimeRow}>
                <Text style={styles.playerTimeText}>{formatPlaybackTime(currentTime)}</Text>
                <Text numberOfLines={1} style={styles.playerVersionText}>{activeSource.quality || request.title}</Text>
                <Text style={styles.playerTimeText}>{formatPlaybackTime(duration)}</Text>
              </View>
              <View style={styles.playerBottomTools}>
                <Pressable
                  onPress={() => {
                    clearControlsTimer();
                    setControlsVisible(true);
                    setSettingsSection('speed');
                    setSettingsOpen(true);
                  }}
                  style={styles.playerToolButton}
                >
                  <Ionicons name="settings-outline" color="#fff" size={18} />
                  <Text style={styles.playerToolText}>تنظیمات</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {settingsOpen ? (
          <View style={[styles.playerSettingsFrameOverlay, frameRect]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => {
              setSettingsOpen(false);
              revealControls();
            }} />
            <View style={[styles.playerSettingsCard, landscape && styles.playerSettingsCardLandscape]}>
              <View style={styles.playerSettingsHeader}>
                <Text style={styles.playerSettingsTitle}>تنظیمات پخش</Text>
                <Pressable onPress={() => {
                  setSettingsOpen(false);
                  revealControls();
                }} style={styles.playerSettingsClose}>
                  <Ionicons name="close" color="#fff" size={18} />
                </Pressable>
              </View>

              <Pressable
                onPress={() => setSettingsSection((current) => current === 'speed' ? null : 'speed')}
                style={styles.playerSettingsRow}
              >
                <View style={styles.playerSettingsRowMain}>
                  <Text style={styles.playerSettingsRowTitle}>سرعت ویدئو</Text>
                  <Text style={styles.playerSettingsRowValue}>{playbackRate === 1 ? 'عادی' : `${playbackRate}x`}</Text>
                </View>
                <Ionicons name={settingsSection === 'speed' ? 'chevron-up' : 'chevron-down'} color={COLORS.muted} size={17} />
              </Pressable>
              {settingsSection === 'speed' ? (
                <View style={styles.playerSettingsOptions}>
                  {[0.5, 1, 1.25, 1.5, 2].map((rate) => {
                    const selected = playbackRate === rate;
                    return (
                      <Pressable key={rate} onPress={() => changePlaybackRate(rate)} style={[styles.playerSettingChip, selected && styles.playerSettingChipActive]}>
                        <Text style={[styles.playerSettingChipText, selected && styles.playerSettingChipTextActive]}>{rate === 1 ? 'عادی' : `${rate}x`}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {qualitySources.length > 1 ? (
                <>
                  <Pressable onPress={() => setSettingsSection((current) => current === 'quality' ? null : 'quality')} style={styles.playerSettingsRow}>
                    <View style={styles.playerSettingsRowMain}>
                      <Text style={styles.playerSettingsRowTitle}>کیفیت ویدئو</Text>
                      <Text style={styles.playerSettingsRowValue}>{activeSource.quality || 'خودکار'}</Text>
                    </View>
                    <Ionicons name={settingsSection === 'quality' ? 'chevron-up' : 'chevron-down'} color={COLORS.muted} size={17} />
                  </Pressable>
                  {settingsSection === 'quality' ? (
                    <View style={styles.playerSettingsOptions}>
                      {qualitySources.map((source) => {
                        const activeQuality = String(activeSource.quality || '').match(/(\d{3,4})\s*p/i)?.[1];
                        const selected = source.id === activeSource.id || activeQuality === String(source.quality).replace(/\D/g, '');
                        return (
                          <Pressable key={source.id} onPress={() => void switchQuality(source)} style={[styles.playerSettingChip, selected && styles.playerSettingChipActive]}>
                            <Text style={[styles.playerSettingChipText, selected && styles.playerSettingChipTextActive]}>{source.quality}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}


function OperatorGateModal({
  request,
  onClose,
  onRetry,
}: {
  request: OperatorGateRequest;
  onClose: () => void;
  onRetry: () => void;
}) {
  const isChecking = request.status === 'checking';
  const content = request.status === 'wifi'
    ? {
        icon: 'wifi-outline' as const,
        title: 'این محتوا فقط با اینترنت همراه باز می‌شود',
        text: 'وای‌فای را خاموش کنید و اینترنت سیم‌کارت را روشن کنید، سپس «بررسی دوباره» را بزنید.',
      }
    : request.status === 'vpn'
      ? {
          icon: 'shield-outline' as const,
          title: 'فیلترشکن را خاموش کنید',
          text: 'برای تماشا یا دریافت این محتوا، فیلترشکن را خاموش کنید و با اینترنت سیم‌کارت دوباره تلاش کنید.',
        }
      : request.status === 'offline'
        ? {
            icon: 'cloud-offline-outline' as const,
            title: 'اتصال اینترنت برقرار نیست',
            text: 'اینترنت سیم‌کارت را روشن کنید و دوباره بررسی کنید.',
          }
        : {
            icon: 'phone-portrait-outline' as const,
            title: 'نوع اتصال مشخص نشد',
            text: 'وای‌فای و فیلترشکن را خاموش کنید، اینترنت سیم‌کارت را روشن کنید و دوباره بررسی کنید.',
          };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.operatorGateOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={isChecking ? undefined : onClose} />
        <View style={styles.operatorGateCard}>
          {isChecking ? (
            <>
              <ActivityIndicator color={COLORS.gold} size="large" />
              <Text style={styles.operatorGateTitle}>در حال بررسی اینترنت همراه…</Text>
              <Text style={styles.operatorGateText}>لطفاً چند لحظه صبر کنید.</Text>
            </>
          ) : (
            <>
              <View style={styles.operatorGateIcon}>
                <Ionicons name={content.icon} color={COLORS.gold} size={30} />
              </View>
              <Text style={styles.operatorGateTitle}>{content.title}</Text>
              <Text style={styles.operatorGateText}>{content.text}</Text>
              <View style={styles.operatorGateButtons}>
                <Pressable onPress={onRetry} style={styles.operatorGatePrimaryButton}>
                  <Ionicons name="refresh" color="#fff" size={17} />
                  <Text style={styles.operatorGatePrimaryText}>بررسی دوباره</Text>
                </Pressable>
                <Pressable onPress={onClose} style={styles.operatorGateCancelButton}>
                  <Text style={styles.operatorGateCancelText}>انصراف</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function OperatorWebModal({
  request,
  onClose,
}: {
  request: OperatorWebRequest;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView
        style={styles.operatorWebModal}
        edges={['top', 'right', 'bottom', 'left']}
      >
        <StatusBar style="light" />
        <View style={styles.operatorWebHeader}>
          <Pressable onPress={onClose} style={styles.mediaCloseButton}>
            <Ionicons name="close" color="#fff" size={23} />
          </Pressable>
          <View style={styles.operatorWebTitleWrap}>
            <Text numberOfLines={1} style={styles.operatorWebTitle}>{request.title}</Text>
            <View style={styles.operatorWebBadge}>
              <Ionicons name="phone-portrait-outline" color={COLORS.gold} size={11} />
              <Text style={styles.operatorWebBadgeText}>اینترنت همراه</Text>
            </View>
          </View>
        </View>
        <View style={styles.operatorWebBody}>
          {failed ? (
            <View style={styles.operatorWebError}>
              <Ionicons name="alert-circle-outline" color={COLORS.gold} size={35} />
              <Text style={styles.operatorWebErrorTitle}>صفحه باز نشد</Text>
              <Text style={styles.operatorWebErrorText}>
                وای‌فای و فیلترشکن را خاموش کنید و مطمئن شوید اینترنت سیم‌کارت روشن است.
              </Text>
              <Pressable
                onPress={() => {
                  setFailed(false);
                  setLoading(true);
                }}
                style={styles.operatorGatePrimaryButton}
              >
                <Ionicons name="refresh" color="#fff" size={17} />
                <Text style={styles.operatorGatePrimaryText}>تلاش دوباره</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              source={{ uri: request.url }}
              style={styles.operatorWebView}
              originWhitelist={['https://*']}
              javaScriptEnabled
              domStorageEnabled
              incognito
              startInLoadingState
              onShouldStartLoadWithRequest={(navigation) =>
                isTrustedOperatorHostUrl(navigation.url)
              }
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
              onHttpError={() => {
                setLoading(false);
                setFailed(true);
              }}
              renderLoading={() => (
                <View style={styles.operatorWebLoading}>
                  <ActivityIndicator color={COLORS.gold} size="large" />
                  <Text style={styles.operatorWebLoadingText}>در حال آماده‌سازی پخش…</Text>
                </View>
              )}
            />
          )}
          {loading && !failed ? (
            <View pointerEvents="none" style={styles.operatorWebLoadingBadge}>
              <ActivityIndicator color={COLORS.gold} size="small" />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function VpnBlockModal({
  visible,
  checking,
  onRetry,
  onContinue,
}: {
  visible: boolean;
  checking: boolean;
  onRetry: () => void;
  onContinue: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" hardwareAccelerated onRequestClose={onContinue}>
      <View style={styles.vpnOverlay}>
        <View style={styles.vpnCard}>
          <View style={styles.vpnIconWrap}><Ionicons name="shield-outline" color={COLORS.gold} size={34} /></View>
          <Text style={styles.vpnTitle}>فیلترشکن روشن است</Text>
          <Text style={styles.vpnText}>می‌توانید وارد برنامه شوید؛ اما تا وقتی فیلترشکن روشن باشد، لینک‌های دانلود و پخش آنلاین مخفی می‌مانند.</Text>
          <Pressable disabled={checking} onPress={onRetry} style={[styles.vpnRetryButton, checking && styles.disabledButton]}>
            {checking ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="refresh-outline" color="#fff" size={19} />}
            <Text style={styles.vpnRetryText}>{checking ? 'در حال بررسی…' : 'بررسی دوباره'}</Text>
          </Pressable>
          <Pressable onPress={onContinue} style={styles.vpnContinueButton}>
            <Text style={styles.vpnContinueText}>ورود به اپ</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SideMenuModal({ visible, onClose, onBrowse, onCategories, onHome }: { visible: boolean; onClose: () => void; onBrowse: (filter: SearchFilter) => void; onCategories: () => void; onHome: () => void }) {
  type MenuEntry = {
    key: string;
    title: string;
    filter?: SearchFilter;
    action?: 'categories' | 'home';
    icon?: keyof typeof Ionicons.glyphMap;
    children?: MenuEntry[];
  };

  const [openRoot, setOpenRoot] = useState<string | null>(null);
  const [openChild, setOpenChild] = useState<string | null>(null);
  const entries: MenuEntry[] = [
    {
      key: 'movies', title: 'فیلم‌ها', icon: 'film-outline', children: [
        { key: 'iranian-movies', title: 'فیلم‌های ایرانی', filter: 'iranian-movies', icon: 'flag-outline' },
        {
          key: 'foreign-movies-root', title: 'فیلم‌های خارجی', icon: 'earth-outline', children: [
            { key: 'foreign-movies', title: 'همه فیلم‌های خارجی', filter: 'foreign-movies' },
            { key: 'dubbed', title: 'دوبله فارسی', filter: 'dubbed' },
            { key: 'subtitled', title: 'زیرنویس فارسی', filter: 'subtitled' },
            { key: 'korean-movies', title: 'فیلم‌های کره‌ای', filter: 'korean-movies' },
            { key: 'indian-movies', title: 'فیلم‌های هندی', filter: 'indian-movies' },
            { key: 'japanese-movies', title: 'فیلم‌های ژاپنی', filter: 'japanese-movies' },
          ],
        },
      ],
    },
    {
      key: 'series', title: 'سریال‌ها', icon: 'tv-outline', children: [
        { key: 'iranian-series', title: 'سریال‌های ایرانی', filter: 'iranian-series', icon: 'videocam-outline' },
        { key: 'foreign-series', title: 'سریال‌های خارجی', filter: 'foreign-series', icon: 'globe-outline' },
        { key: 'korean-series', title: 'سریال‌های کره‌ای', filter: 'korean-series', icon: 'location-outline' },
      ],
    },
    {
      key: 'anime', title: 'انیمه', icon: 'sparkles-outline', children: [
        { key: 'anime-movies', title: 'انیمه سینمایی', filter: 'anime-movies' },
        { key: 'anime-series', title: 'انیمه سریالی', filter: 'anime-series' },
      ],
    },
    {
      key: 'animation', title: 'انیمیشن', icon: 'color-palette-outline', children: [
        { key: 'animation-movies', title: 'انیمیشن سینمایی', filter: 'animation-movies' },
        { key: 'animation-series', title: 'انیمیشن سریالی', filter: 'animation-series' },
      ],
    },
    { key: 'updated', title: 'به‌روزشده‌ها', filter: 'updated', icon: 'refresh-outline' },
    { key: 'operator', title: 'ویژه اینترنت همراه', filter: 'mobile-operator', icon: 'phone-portrait-outline' },
    { key: 'schedule', title: 'برنامه هفتگی', action: 'home', icon: 'calendar-outline' },
    { key: 'categories', title: 'همه دسته‌بندی‌ها', action: 'categories', icon: 'grid-outline' },
  ];

  useEffect(() => {
    if (!visible) {
      setOpenRoot(null);
      setOpenChild(null);
    }
  }, [visible]);

  const choose = (entry: MenuEntry) => {
    if (entry.children?.length) return;
    onClose();
    requestAnimationFrame(() => entry.filter
      ? onBrowse(entry.filter)
      : entry.action === 'categories'
        ? onCategories()
        : onHome());
  };

  const renderLeaf = (entry: MenuEntry, depth: 1 | 2) => (
    <Pressable
      key={entry.key}
      onPress={() => choose(entry)}
      style={[styles.sideMenuLeaf, depth === 2 && styles.sideMenuLeafDeep]}
    >
      {entry.icon ? <Ionicons name={entry.icon} color={COLORS.gold} size={17} /> : <View style={styles.sideMenuLeafDot} />}
      <Text style={styles.sideMenuLeafText}>{entry.title}</Text>
      <Ionicons name="chevron-back" color={COLORS.muted} size={14} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" hardwareAccelerated onRequestClose={onClose}>
      <View style={styles.sideMenuOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView style={styles.sideMenuPanel} edges={['top', 'right', 'bottom']}>
          <View style={styles.sideMenuHeader}>
            <Logo />
            <Pressable onPress={onClose} style={styles.iconButton}><Ionicons name="close" color={COLORS.text} size={22} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sideMenuItems} showsVerticalScrollIndicator={false}>
            {entries.map((entry) => {
              if (!entry.children?.length) return renderLeaf(entry, 1);
              const rootOpen = openRoot === entry.key;
              return (
                <View key={entry.key} style={styles.sideMenuAccordion}>
                  <Pressable
                    onPress={() => {
                      setOpenRoot((current) => current === entry.key ? null : entry.key);
                      setOpenChild(null);
                    }}
                    style={[styles.sideMenuItem, rootOpen && styles.sideMenuItemOpen]}
                  >
                    <Ionicons name={entry.icon || 'folder-outline'} color={COLORS.gold} size={20} />
                    <Text style={styles.sideMenuItemText}>{entry.title}</Text>
                    <Ionicons name={rootOpen ? 'chevron-up' : 'chevron-down'} color={COLORS.muted} size={16} />
                  </Pressable>
                  {rootOpen ? (
                    <View style={styles.sideMenuChildren}>
                      {entry.children.map((child) => {
                        if (!child.children?.length) return renderLeaf(child, 1);
                        const childOpen = openChild === child.key;
                        return (
                          <View key={child.key} style={styles.sideMenuNestedAccordion}>
                            <Pressable
                              onPress={() => setOpenChild((current) => current === child.key ? null : child.key)}
                              style={[styles.sideMenuLeaf, styles.sideMenuNestedHeader, childOpen && styles.sideMenuItemOpen]}
                            >
                              <Ionicons name={child.icon || 'folder-open-outline'} color={COLORS.gold} size={17} />
                              <Text style={styles.sideMenuLeafText}>{child.title}</Text>
                              <Ionicons name={childOpen ? 'chevron-up' : 'chevron-down'} color={COLORS.muted} size={14} />
                            </Pressable>
                            {childOpen ? <View style={styles.sideMenuGrandchildren}>{child.children.map((leaf) => renderLeaf(leaf, 2))}</View> : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function BottomNavigation({ active, onChange }: { active: MainTab; onChange: (tab: MainTab) => void }) {
  const tabs: { id: MainTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'home', label: 'خانه', icon: 'home-outline' }, { id: 'categories', label: 'دسته‌بندی', icon: 'grid-outline' },
    { id: 'favorites', label: 'کتابخانه', icon: 'bookmark-outline' }, { id: 'downloads', label: 'دریافت‌ها', icon: 'download-outline' },
  ];
  return <View style={styles.bottomNavigation}>{tabs.map((tab) => { const selected = active === tab.id; return <Pressable key={tab.id} onPress={() => onChange(tab.id)} style={styles.bottomTab}><View style={[styles.bottomIconWrap, selected && styles.bottomIconWrapActive]}><Ionicons name={selected ? (String(tab.icon).replace('-outline','') as keyof typeof Ionicons.glyphMap) : tab.icon} color={selected ? COLORS.text : COLORS.muted} size={20} /></View><Text style={[styles.bottomLabel, selected && styles.bottomLabelActive]}>{tab.label}</Text></Pressable>; })}</View>;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<CatalogPerson | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [watchProgress, setWatchProgress] = useState<WatchProgressRecord[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryRecord[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [episodeAlertSeriesIds, setEpisodeAlertSeriesIds] = useState<string[]>([]);
  const [episodeAlertBusyId, setEpisodeAlertBusyId] = useState<string | null>(null);
  const [content, setContent] = useState<LoadedContent>(() => getBundledContent());
  const [contentLoading, setContentLoading] = useState(false);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const downloadsRef = useRef<DownloadRecord[]>([]);
  const [videoRequest, setVideoRequest] = useState<VideoRequest | null>(null);
  const [operatorWebRequest, setOperatorWebRequest] = useState<OperatorWebRequest | null>(null);
  const [operatorGateRequest, setOperatorGateRequest] = useState<OperatorGateRequest | null>(null);
  const [pendingDeepLink, setPendingDeepLink] = useState<CatalogDeepLink | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [vpnActive, setVpnActive] = useState(false);
  const [vpnWarningVisible, setVpnWarningVisible] = useState(false);
  const [vpnChecking, setVpnChecking] = useState(false);
  const [searchReturnTab, setSearchReturnTab] = useState<MainTab>('home');
  const [searchReturnItem, setSearchReturnItem] = useState<CatalogItem | null>(null);
  const [homeScrollOffset, setHomeScrollOffset] = useState(0);
  const [mountedTabs, setMountedTabs] = useState<MainTab[]>(['home']);
  const lastDeepLinkRef = useRef<{ key: string; receivedAt: number } | null>(null);
  const lastContentLoadRef = useRef(0);
  const vpnCheckSequenceRef = useRef(0);
  const vpnPausingDownloadsRef = useRef(false);
  const activeTabRef = useRef<MainTab>('home');
  const tabHistoryRef = useRef<MainTab[]>(['home']);
  const backNavigationLockedRef = useRef(false);
  const navigationStateRef = useRef({
    activeTab,
    menuOpen,
    operatorGateRequest,
    operatorWebRequest,
    searchReturnItem,
    searchReturnTab,
    selectedItem,
    selectedPerson,
    videoRequest,
    vpnActive,
    vpnWarningVisible,
  });

  activeTabRef.current = activeTab;
  navigationStateRef.current = {
    activeTab,
    menuOpen,
    operatorGateRequest,
    operatorWebRequest,
    searchReturnItem,
    searchReturnTab,
    selectedItem,
    selectedPerson,
    videoRequest,
    vpnActive,
    vpnWarningVisible,
  };

  const navigateToTab = useCallback((tab: MainTab, recordHistory = true) => {
    setMountedTabs((current) => current.includes(tab) ? current : [...current, tab]);
    const currentTab = activeTabRef.current;
    if (currentTab === tab) return;
    if (recordHistory) {
      const history = tabHistoryRef.current;
      if (history[history.length - 1] !== tab) tabHistoryRef.current = [...history, tab].slice(-12);
    }
    activeTabRef.current = tab;
    setActiveTab(tab);
  }, []);

  const refreshVpnState = async (showProgress = false) => {
    const sequence = ++vpnCheckSequenceRef.current;
    if (showProgress) setVpnChecking(true);
    try {
      // Action checks use one fast native lookup. Startup/retry gets two short retries.
      const active = await checkVpnActive(showProgress ? 2 : 0);
      if (sequence === vpnCheckSequenceRef.current) {
        setVpnActive(active);
        if (active && showProgress) setVpnWarningVisible(true);
        if (!active) setVpnWarningVisible(false);
      }
      return active;
    } finally {
      if (showProgress && sequence === vpnCheckSequenceRef.current) setVpnChecking(false);
    }
  };

  const reloadContent = async (force = true) => {
    if (!force && Date.now() - lastContentLoadRef.current < 5 * 60 * 1000) return;
    const initialLoad = lastContentLoadRef.current === 0;
    const showRefreshIndicator = force && !initialLoad;
    if (showRefreshIndicator) setContentLoading(true);
    try {
      // The bundled catalog is already on screen. Read the persisted catalog first,
      // then refresh GitHub in the background without blocking app startup.
      const nextContent = await loadContent(initialLoad);
      setContent(nextContent);
      lastContentLoadRef.current = Date.now();
      if (nextContent.source === 'remote') void syncEpisodeAlerts(nextContent.items, true);

      if (initialLoad && nextContent.source !== 'remote') {
        void loadContent(false).then((freshContent) => {
          if (freshContent.source !== 'remote') return;
          setContent(freshContent);
          lastContentLoadRef.current = Date.now();
          void syncEpisodeAlerts(freshContent.items, true);
        }).catch(() => undefined);
      }
    } finally {
      if (showRefreshIndicator) setContentLoading(false);
    }
  };

  useEffect(() => {
    reloadContent();
    loadDownloadRecords().then(setDownloads);
    loadLibraryState()
      .then((library) => {
        const isLegacyDemoRecord = (record: WatchProgressRecord | WatchHistoryRecord) =>
          /دو\s*جهان\s*یک\s*آرزو/i.test(normalizeComparableText(record.title || ''));
        const watchProgress = library.watchProgress.filter((record) => !isLegacyDemoRecord(record));
        const watchHistory = library.watchHistory.filter((record) => !isLegacyDemoRecord(record));
        setFavorites(library.favorites);
        setWatchProgress(watchProgress);
        setWatchHistory(watchHistory);
        if (
          watchProgress.length !== library.watchProgress.length ||
          watchHistory.length !== library.watchHistory.length
        ) {
          void saveLibraryState({
            favorites: library.favorites,
            watchProgress,
            watchHistory,
          });
        }
      })
      .finally(() => setLibraryLoaded(true));
    initializeEpisodeAlertSystem()
      .then((state) => setEpisodeAlertSeriesIds(state.subscribedSeriesIds))
      .catch(() => undefined);

    void refreshVpnState(true);
    const vpnRetryTimer = setTimeout(() => { void refreshVpnState(); }, 750);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reloadContent(false);
        void refreshVpnState();
      }
    });

    return () => { clearTimeout(vpnRetryTimer); subscription.remove(); };
  }, []);


  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const state = navigationStateRef.current;
      if (backNavigationLockedRef.current) return true;

      const runSmoothBack = (action: () => void) => {
        backNavigationLockedRef.current = true;
        requestAnimationFrame(action);
        setTimeout(() => { backNavigationLockedRef.current = false; }, 220);
      };

      if (state.vpnWarningVisible) { runSmoothBack(() => setVpnWarningVisible(false)); return true; }
      if (state.menuOpen) { runSmoothBack(() => setMenuOpen(false)); return true; }
      if (state.operatorWebRequest) { runSmoothBack(() => setOperatorWebRequest(null)); return true; }
      if (state.operatorGateRequest) { runSmoothBack(() => setOperatorGateRequest(null)); return true; }
      if (state.selectedPerson) { runSmoothBack(() => setSelectedPerson(null)); return true; }
      if (state.videoRequest) { runSmoothBack(() => setVideoRequest(null)); return true; }
      if (state.selectedItem) { runSmoothBack(() => setSelectedItem(null)); return true; }
      if (state.activeTab === 'search') {
        runSmoothBack(() => {
          if (tabHistoryRef.current[tabHistoryRef.current.length - 1] === 'search') {
            tabHistoryRef.current = tabHistoryRef.current.slice(0, -1);
          }
          navigateToTab(state.searchReturnTab, false);
          if (state.searchReturnItem) setSelectedItem(state.searchReturnItem);
          setSearchReturnItem(null);
        });
        return true;
      }

      if (tabHistoryRef.current.length > 1) {
        runSmoothBack(() => {
          const history = tabHistoryRef.current.slice(0, -1);
          tabHistoryRef.current = history;
          navigateToTab(history[history.length - 1] || 'home', false);
        });
        return true;
      }

      if (state.activeTab !== 'home') {
        runSmoothBack(() => navigateToTab('home', false));
        return true;
      }

      Alert.alert(
        'خروج از آپاراتچی',
        'آیا می‌خواهید از آپاراتچی خارج شوید؟',
        [
          { text: 'خیر', style: 'cancel' },
          { text: 'خروج', style: 'destructive', onPress: () => BackHandler.exitApp() },
        ],
      );
      return true;
    });
    return () => subscription.remove();
  }, [navigateToTab]);

  useEffect(() => {
    const queueDeepLink = (url?: string | null) => {
      const deepLink = parseCatalogDeepLink(url);
      if (!deepLink) return;

      const key = `${deepLink.type}:${deepLink.id}`;
      const now = Date.now();
      const previous = lastDeepLinkRef.current;
      if (previous?.key === key && now - previous.receivedAt < 1500) return;

      lastDeepLinkRef.current = { key, receivedAt: now };
      setPendingDeepLink(deepLink);
    };

    void Linking.getInitialURL()
      .then(queueDeepLink)
      .catch(() => undefined);

    const subscription = Linking.addEventListener('url', ({ url }) => queueDeepLink(url));
    const queueNotificationResponse = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string') queueDeepLink(url);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        queueNotificationResponse(response);
        if (response) return Notifications.clearLastNotificationResponseAsync();
        return undefined;
      })
      .catch(() => undefined);
    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(
      queueNotificationResponse,
    );

    return () => {
      subscription.remove();
      notificationSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!content || !pendingDeepLink) return;

    const linkedItem = content.items.find(
      (candidate) =>
        candidate.type === pendingDeepLink.type &&
        String(candidate.id) === pendingDeepLink.id,
    );

    if (linkedItem) {
      setSelectedPerson(null);
      setSelectedItem(linkedItem);
      navigateToTab('home', false);
    } else {
      Alert.alert(
        'لینک آپاراتچی',
        'این عنوان در فهرست فعلی برنامه پیدا نشد. محتوای برنامه را به‌روز کنید و دوباره لینک را باز کنید.',
      );
    }

    setPendingDeepLink(null);
  }, [content, pendingDeepLink]);

  useEffect(() => {
    downloadsRef.current = downloads;
    const timer = setTimeout(() => {
      saveDownloadRecords(downloads).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [downloads]);


  const hasRunningDownloads = downloads.some((record) => record.status === 'downloading');
  useEffect(() => {
    if (!hasRunningDownloads) return undefined;
    let disposed = false;

    const stopForVpn = async () => {
      if (disposed || vpnPausingDownloadsRef.current) return;
      const active = await checkVpnActive(0).catch(() => false);
      if (disposed) return;
      setVpnActive(active);
      if (!active) return;

      vpnPausingDownloadsRef.current = true;
      try {
        const running = downloadsRef.current.filter((record) => record.status === 'downloading');
        const snapshots = new Map<string, Awaited<ReturnType<typeof pauseDownload>>>();
        await Promise.all(running.map(async (record) => {
          const snapshot = await pauseDownload(record.id).catch(() => null);
          snapshots.set(record.id, snapshot);
        }));
        if (disposed) return;
        setDownloads((current) => current.map((record) => {
          if (record.status !== 'downloading') return record;
          const snapshot = snapshots.get(record.id);
          return {
            ...record,
            status: 'paused' as const,
            destinationUri: snapshot?.destinationUri || record.destinationUri,
            resumeData: snapshot?.resumeData || record.resumeData,
            error: 'فیلترشکن روشن شد؛ دانلود متوقف شد. فیلترشکن را خاموش کنید و «ادامه» را بزنید.',
          };
        }));
        setVpnWarningVisible(true);
      } finally {
        vpnPausingDownloadsRef.current = false;
      }
    };

    void stopForVpn();
    const timer = setInterval(() => { void stopForVpn(); }, 3500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [hasRunningDownloads]);

  useEffect(() => {
    if (!libraryLoaded) return undefined;
    const timer = setTimeout(() => {
      saveLibraryState({ favorites, watchProgress, watchHistory }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [favorites, libraryLoaded, watchHistory, watchProgress]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  };

  const toggleEpisodeAlert = async (item: CatalogItem) => {
    if (item.type !== 'series' || episodeAlertBusyId) return;

    const itemId = String(item.id);
    const currentlyEnabled = episodeAlertSeriesIds.includes(itemId);
    setEpisodeAlertBusyId(itemId);
    try {
      const result = await setSeriesEpisodeAlert(item, !currentlyEnabled);
      setEpisodeAlertSeriesIds(result.state.subscribedSeriesIds);

      if (!result.permissionGranted) {
        Alert.alert(
          'اجازه اعلان داده نشد',
          'برای دریافت خبر قسمت‌های جدید، اعلان‌های آپاراتچی را از تنظیمات گوشی فعال کنید.',
        );
      } else {
        Alert.alert(
          result.enabled ? 'اعلان قسمت جدید فعال شد' : 'اعلان قسمت جدید خاموش شد',
          result.enabled
            ? `از این به بعد انتشار قسمت جدید «${item.nameFa}» بررسی می‌شود.`
            : `برای «${item.nameFa}» دیگر اعلان قسمت جدید نمایش داده نمی‌شود.`,
        );
      }
    } catch {
      Alert.alert('اعلان قسمت جدید', 'تنظیم اعلان انجام نشد. دوباره تلاش کنید.');
    } finally {
      setEpisodeAlertBusyId(null);
    }
  };

  const updateWatchProgress = (
    request: VideoRequest,
    position: number,
    duration: number,
    completed = false,
  ) => {
    if (!request.resumeKey || !request.itemId) return;
    const resumeKey = request.resumeKey;
    const itemId = request.itemId;

    const safePosition = Math.max(0, Number(position || 0));
    const safeDuration = Math.max(0, Number(duration || 0));
    const finished = completed || (safeDuration > 0 && safePosition / safeDuration >= 0.94);
    const catalogItem = content?.items.find((item) => item.id === itemId);
    const source = request.sources.find((candidate) => candidate.id === request.initialSourceId) || request.sources[0];
    const updatedAt = new Date().toISOString();

    if (finished || safePosition >= 15) {
      const historyRecord: WatchHistoryRecord = {
        id: resumeKey,
        itemId: itemId,
        title: request.title,
        subtitle: catalogItem?.name,
        artwork: request.artwork || catalogItem?.backdrop || catalogItem?.poster,
        episodeId: request.episodeId,
        language: request.language,
        downloadId: request.downloadId,
        sourceId: source?.id,
        sourceUrl: source?.url,
        sourceQuality: source?.quality,
        position: safePosition,
        duration: safeDuration,
        completed: finished,
        updatedAt,
      };

      setWatchHistory((current) => [
        historyRecord,
        ...current.filter((record) => record.id !== resumeKey),
      ]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 100));
    }

    setWatchProgress((current) => {
      const withoutCurrent = current.filter((record) => record.id !== resumeKey);
      if (finished) return withoutCurrent;
      if (safePosition < 15) return current;

      const nextRecord: WatchProgressRecord = {
        id: resumeKey,
        itemId: itemId,
        title: request.title,
        subtitle: catalogItem?.name,
        artwork: request.artwork || catalogItem?.backdrop || catalogItem?.poster,
        episodeId: request.episodeId,
        language: request.language,
        downloadId: request.downloadId,
        sourceId: source?.id,
        sourceUrl: source?.url,
        sourceQuality: source?.quality,
        position: safePosition,
        duration: safeDuration,
        updatedAt,
      };

      return [nextRecord, ...withoutCurrent]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20);
    });
  };

  const removeWatchProgress = (id: string) => {
    setWatchProgress((current) => current.filter((record) => record.id !== id));
  };

  const removeWatchHistory = (id: string) => {
    setWatchHistory((current) => current.filter((record) => record.id !== id));
  };

  const confirmClearWatchHistory = () => {
    Alert.alert(
      'پاک‌کردن تاریخچه',
      'تمام سابقه تماشای ذخیره‌شده روی این گوشی پاک شود؟ علاقه‌مندی‌ها و فایل‌های دانلودشده حذف نمی‌شوند.',
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'پاک‌کردن', style: 'destructive', onPress: () => setWatchHistory([]) },
      ],
    );
  };

  const resumeWatchRecord = async (record: WatchProgressRecord) => {
    if (record.downloadId) {
      const download = downloadsRef.current.find((candidate) => candidate.id === record.downloadId);
      if (!download?.localUri || download.status !== 'completed') {
        removeWatchProgress(record.id);
        Alert.alert('ادامه تماشا', 'فایل دانلودشده دیگر در حافظه برنامه موجود نیست.');
        return;
      }

      const source: PlaybackSource = {
        id: download.id,
        url: download.localUri,
        quality: download.quality || record.sourceQuality || 'فایل ذخیره‌شده',
        rank: 0,
      };
      setVideoRequest({
        title: download.title,
        sources: [source],
        initialSourceId: source.id,
        resumeKey: record.id,
        itemId: download.itemId,
        artwork: record.artwork,
        downloadId: download.id,
        resumeAt: record.position,
      });
      return;
    }

    // Continuing a remote stream is also a playback action, so verify the
    // Android VPN transport again immediately before opening the player.
    if (await refreshVpnState()) { setVpnWarningVisible(true); return; }

    const item = content?.items.find((candidate) => candidate.id === record.itemId);
    if (!item) {
      removeWatchProgress(record.id);
      Alert.alert('ادامه تماشا', 'این عنوان دیگر در فهرست محتوا موجود نیست.');
      return;
    }

    const episodeGroup = record.episodeId
      ? (item.downloads || []).find((section) => section.id === record.episodeId) || null
      : null;
    const versions = playableVersionsFor(item, episodeGroup);
    const version = versions.find((candidate) => candidate.language === record.language) || versions[0];

    if (!version) {
      setSelectedItem(item);
      Alert.alert('ادامه تماشا', 'لینک پخش این عنوان تغییر کرده است؛ نسخه موردنظر را دوباره انتخاب کنید.');
      return;
    }

    setVideoRequest({
      title: record.title,
      sources: version.sources,
      initialSourceId: version.defaultSource.id,
      resumeKey: record.id,
      itemId: item.id,
      artwork: item.backdrop || item.poster,
      episodeId: episodeGroup?.id,
      language: version.language,
      resumeAt: record.position,
    });
  };

  const openWatchHistoryRecord = (record: WatchHistoryRecord) => {
    if (record.completed) {
      const item = content?.items.find((candidate) => candidate.id === record.itemId);
      if (item) {
        setSelectedItem(item);
        return;
      }
    }
    void resumeWatchRecord(record);
  };

  const openCatalogFilter = (filter: SearchFilter) => {
    setSearchReturnTab(activeTab === 'search' ? 'categories' : activeTab);
    setSearchReturnItem(selectedItem);
    setSelectedItem(null);
    setSelectedPerson(null);
    setSearchFilter(filter);
    navigateToTab('search');
  };

  const openOperatorAccess = async (item: CatalogItem, file: DownloadFile) => {
    if (!isOperatorFile(file) || !isOperatorPortalUrl(file.url)) {
      Alert.alert('اینترنت همراه', 'این لینک فعلاً در دسترس نیست.');
      return;
    }

    setOperatorGateRequest({ item, file, status: 'checking' });

    if (await refreshVpnState()) { setOperatorGateRequest(null); setVpnWarningVisible(true); return; }

    const mobileAccess = await checkMobileOperatorAccess();
    if (mobileAccess.status !== 'allowed') {
      setOperatorGateRequest({ item, file, status: mobileAccess.status });
      return;
    }

    setOperatorGateRequest(null);
    setOperatorWebRequest({
      title: `${item.nameFa} — ${downloadModeFor(file) === 'operator-play' ? 'پخش آنلاین' : 'دریافت'}`,
      url: file.url,
    });
  };

  const openStreamInsideApp = async (
    item: CatalogItem,
    episodeGroup: DownloadSection | null = null,
    requestedLanguage?: MediaLanguage,
  ) => {
    if (await refreshVpnState()) { setVpnWarningVisible(true); return; }

    const versions = playableVersionsFor(item, episodeGroup);
    if (!versions.length) {
      Alert.alert('پخش آنلاین', 'پخش این نسخه فعلاً در دسترس نیست.');
      return;
    }

    const playVersion = (version: PlayableVersion) => {
      const episodeLabel = episodeGroup
        ? ` — فصل ${toPersianDigits(episodeGroup.seasonNumber || 1)}، قسمت ${toPersianDigits(episodeGroup.episodeNumber || 0)}`
        : '';
      const resumeKey = `${item.id}:${episodeGroup?.id || 'main'}:${version.language || 'iranian'}`;
      const previous = watchProgress.find((record) => record.id === resumeKey);
      const openPlayer = (resumeAt = 0) => {
        setVideoRequest({
          title: `${item.nameFa}${episodeLabel} — ${version.label}`,
          sources: version.sources,
          initialSourceId: version.defaultSource.id,
          resumeKey,
          itemId: item.id,
          artwork: item.backdrop || item.poster,
          episodeId: episodeGroup?.id,
          language: version.language,
          resumeAt,
        });
      };

      if (previous?.position && previous.position >= 15) {
        Alert.alert(
          'ادامه تماشا',
          `از زمان ${formatPlaybackTime(previous.position)} ادامه داده شود؟`,
          [
            { text: 'از ابتدا', onPress: () => openPlayer(0) },
            { text: 'ادامه', onPress: () => openPlayer(previous.position) },
            { text: 'انصراف', style: 'cancel' },
          ],
        );
        return;
      }

      openPlayer();
    };

    const requestedVersion = requestedLanguage ? versions.find((version) => version.language === requestedLanguage) : undefined;
    if (requestedVersion || versions.length === 1) {
      playVersion(requestedVersion || versions[0]);
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
        ...(item.ir ? versions.filter((version) => !version.language).map((version) => ({ text: version.label, onPress: () => playVersion(version) })) : []),
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
    const resumeKey = `download:${record.id}`;
    const previous = watchProgress.find((item) => item.id === resumeKey);
    const openPlayer = (resumeAt = 0) => setVideoRequest({
      title: record.title,
      sources: [source],
      initialSourceId: source.id,
      resumeKey,
      itemId: record.itemId,
      artwork: content?.items.find((item) => item.id === record.itemId)?.backdrop ||
        content?.items.find((item) => item.id === record.itemId)?.poster,
      downloadId: record.id,
      resumeAt,
    });

    if (previous?.position && previous.position >= 15) {
      Alert.alert(
        'ادامه تماشا',
        `از زمان ${formatPlaybackTime(previous.position)} ادامه داده شود؟`,
        [
          { text: 'از ابتدا', onPress: () => openPlayer(0) },
          { text: 'ادامه', onPress: () => openPlayer(previous.position) },
          { text: 'انصراف', style: 'cancel' },
        ],
      );
      return;
    }

    openPlayer();
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

      if (result.paused || !result.localUri) {
        setDownloads((current) => current.map((item) =>
          item.id === record.id
            ? {
                ...item,
                status: 'paused' as const,
                destinationUri: result.destinationUri || item.destinationUri || runningRecord.destinationUri,
                resumeData: result.resumeData || item.resumeData,
                error: result.error || 'دانلود متوقف شده است؛ برای ادامه دوباره بزنید.',
              }
            : item,
        ));
        return;
      }

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

  const startDownloadInsideApp = async (item: CatalogItem, file: DownloadFile, episodeGroup?: DownloadSection) => {
    if (isOperatorFile(file)) {
      await openOperatorAccess(item, file);
      return;
    }

    if (await refreshVpnState()) { setVpnWarningVisible(true); return; }

    if (!isSafeHttpUrl(file.url) || isPlaceholderUrl(file.url)) {
      Alert.alert('دریافت فایل', 'این فایل فعلاً در دسترس نیست.');
      return;
    }

    const fileMode = downloadModeFor(file);

    if (fileMode === 'play') {
      const source: PlaybackSource = { id: file.id, url: file.url, quality: cleanQualityLabel(file.quality), rank: resolutionRank(file) };
      setVideoRequest({
        title: `${item.nameFa} — ${cleanQualityLabel(file.quality)}`,
        sources: [source],
        initialSourceId: source.id,
        resumeKey: `${item.id}:main:${file.language || 'direct'}`,
        itemId: item.id,
        artwork: item.backdrop || item.poster,
        language: file.language,
      });
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
      navigateToTab('downloads');
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
      artwork: item.backdrop || item.poster,
      mediaType: item.type,
      seasonNumber: episodeGroup?.seasonNumber,
      episodeNumber: episodeGroup?.episodeNumber,
      episodeTitle: cleanMediaLabel(episodeGroup?.subtitle),
      language: file.language,
      fileName: `${item.name}-${episodeGroup?.seasonNumber ? `S${episodeGroup.seasonNumber}-` : ''}${episodeGroup?.episodeNumber ? `E${episodeGroup.episodeNumber}-` : ''}${cleanQualityLabel(file.quality)}`,
      progress: 0,
      status: 'downloading',
      createdAt: new Date().toISOString(),
    };

    setDownloads((current) => [pending, ...current.filter((record) => record.id !== recordId)]);
    navigateToTab('downloads');
    setSelectedItem(null);
    void executeDownload(pending);
  };

  const pauseDownloadRecord = async (record: DownloadRecord) => {
    try {
      const snapshot = await pauseDownload(record.id);
      setDownloads((current) => current.map((item) =>
        item.id === record.id
          ? {
              ...item,
              status: 'paused' as const,
              destinationUri: snapshot?.destinationUri || item.destinationUri,
              resumeData: snapshot?.resumeData || item.resumeData,
              error: snapshot ? undefined : 'دانلود متوقف شد؛ برای ادامه دوباره بزنید.',
            }
          : item,
      ));
    } catch (error) {
      Alert.alert('توقف دانلود', 'توقف دانلود انجام نشد. دوباره تلاش کنید.');
    }
  };

  const resumeDownloadRecord = async (record: DownloadRecord) => {
    if (await refreshVpnState()) {
      setDownloads((current) => current.map((item) =>
        item.id === record.id
          ? { ...item, status: 'paused' as const, error: 'فیلترشکن روشن است؛ آن را خاموش کنید و دوباره ادامه دهید.' }
          : item,
      ));
      setVpnWarningVisible(true);
      return;
    }
    void executeDownload(record);
  };

  const deleteDownloadNow = async (record: DownloadRecord) => {
    await cancelDownload(record.id).catch(() => undefined);
    await removeDownloadedFile(record.localUri, record.destinationUri).catch(() => undefined);
    setDownloads((current) => current.filter((item) => item.id !== record.id));
    setWatchProgress((current) => current.filter((item) => item.downloadId !== record.id));
    setWatchHistory((current) => current.filter((item) => item.downloadId !== record.id));
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

  const removeDownloadBatch = async (records: DownloadRecord[]) => {
    if (!records.length) return;
    const ids = new Set(records.map((record) => record.id));
    await Promise.all(records.map(async (record) => {
      await cancelDownload(record.id).catch(() => undefined);
      await removeDownloadedFile(record.localUri, record.destinationUri).catch(() => undefined);
    }));
    setDownloads((current) => current.filter((record) => !ids.has(record.id)));
    setWatchProgress((current) => current.filter((record) => !record.downloadId || !ids.has(record.downloadId)));
    setWatchHistory((current) => current.filter((record) => !record.downloadId || !ids.has(record.downloadId)));
  };

  const confirmClearIncompleteDownloads = () => {
    const records = downloadsRef.current.filter((record) => record.status !== 'completed');
    if (!records.length) return;
    Alert.alert(
      'حذف دانلودهای ناتمام',
      `${toPersianDigits(records.length)} دانلود ناتمام و فایل‌های موقت آن‌ها از حافظه برنامه حذف شوند؟`,
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => void removeDownloadBatch(records) },
      ],
    );
  };

  const confirmClearCompletedDownloads = () => {
    const records = downloadsRef.current.filter((record) => record.status === 'completed');
    if (!records.length) return;
    Alert.alert(
      'حذف فایل‌های کامل',
      `${toPersianDigits(records.length)} فایل دانلودشده از حافظه داخلی برنامه حذف شوند؟ نسخه‌هایی که جداگانه در گالری ذخیره شده‌اند باقی می‌مانند.`,
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'حذف همه', style: 'destructive', onPress: () => void removeDownloadBatch(records) },
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

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'right', 'left']}
      >
        {mountedTabs.includes('home') ? (
          <View pointerEvents={activeTab === 'home' ? 'auto' : 'none'} style={[styles.tabScene, activeTab !== 'home' && styles.tabSceneHidden]}>
            <HomeScreen
              catalog={content.items}
              iranianSchedule={content.iranianSchedule}
              weeklySchedule={content.weeklySchedule || []}
              featuredPeople={content.featuredPeople || []}
              watchProgress={watchProgress}
              onReloadContent={() => void reloadContent(true)}
              onOpen={setSelectedItem}
              onBrowse={openCatalogFilter}
              onResume={resumeWatchRecord}
              onRemoveProgress={removeWatchProgress}
              onMenu={() => setMenuOpen(true)}
              initialScrollOffset={homeScrollOffset}
              onScrollOffset={setHomeScrollOffset}
              isActive={activeTab === 'home'}
            />
          </View>
        ) : null}
        {mountedTabs.includes('categories') ? (
          <View pointerEvents={activeTab === 'categories' ? 'auto' : 'none'} style={[styles.tabScene, activeTab !== 'categories' && styles.tabSceneHidden]}>
            <CategoriesScreen catalog={content.items} onBrowse={openCatalogFilter} onOpen={setSelectedItem} />
          </View>
        ) : null}
        {mountedTabs.includes('search') ? (
          <View pointerEvents={activeTab === 'search' ? 'auto' : 'none'} style={[styles.tabScene, activeTab !== 'search' && styles.tabSceneHidden]}>
            <SearchScreen
              catalog={content.items}
              onOpen={setSelectedItem}
              initialFilter={searchFilter}
            />
          </View>
        ) : null}
        {mountedTabs.includes('favorites') ? (
          <View pointerEvents={activeTab === 'favorites' ? 'auto' : 'none'} style={[styles.tabScene, activeTab !== 'favorites' && styles.tabSceneHidden]}>
            <FavoritesScreen
              catalog={content.items}
              favorites={favorites}
              watchHistory={watchHistory}
              onOpen={setSelectedItem}
              onOpenHistory={openWatchHistoryRecord}
              onRemoveHistory={removeWatchHistory}
              onClearHistory={confirmClearWatchHistory}
            />
          </View>
        ) : null}
        {mountedTabs.includes('downloads') ? (
          <View pointerEvents={activeTab === 'downloads' ? 'auto' : 'none'} style={[styles.tabScene, activeTab !== 'downloads' && styles.tabSceneHidden]}>
            <DownloadsScreen
              downloads={downloads}
              catalog={content.items}
              onPlay={playDownloadedRecord}
              onPause={pauseDownloadRecord}
              onResume={resumeDownloadRecord}
              onMenu={showDownloadMenu}
              onClearIncomplete={confirmClearIncompleteDownloads}
              onClearCompleted={confirmClearCompletedDownloads}
            />
          </View>
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
            setSelectedItem(null);
            setSelectedPerson(null);
            setMenuOpen(false);
            setSearchReturnItem(null);
            navigateToTab(tab);
          }}
        />
      </SafeAreaView>
      <VpnBlockModal
        visible={vpnWarningVisible}
        checking={vpnChecking}
        onRetry={() => { void refreshVpnState(true); }}
        onContinue={() => setVpnWarningVisible(false)}
      />
      <SideMenuModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onBrowse={openCatalogFilter}
        onCategories={() => navigateToTab('categories')}
        onHome={() => navigateToTab('home')}
      />
      <DetailModal
        item={selectedItem}
        catalog={content.items}
        visible={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        favorite={selectedItem ? favorites.includes(selectedItem.id) : false}
        onFavorite={() => selectedItem && toggleFavorite(selectedItem.id)}
        episodeAlertEnabled={Boolean(
          selectedItem?.type === 'series' && episodeAlertSeriesIds.includes(String(selectedItem.id)),
        )}
        episodeAlertBusy={Boolean(
          selectedItem?.type === 'series' && episodeAlertBusyId === String(selectedItem.id),
        )}
        onEpisodeAlert={() => selectedItem && void toggleEpisodeAlert(selectedItem)}
        onStream={openStreamInsideApp}
        onDownload={startDownloadInsideApp}
        onOperatorOpen={openOperatorAccess}
        onOpenRelated={setSelectedItem}
        onOpenPerson={setSelectedPerson}
        onBrowse={openCatalogFilter}
        vpnActive={vpnActive}
        onVpnRetry={() => { void refreshVpnState(false); }}
      />
      <PersonProfileModal
        person={selectedPerson}
        catalog={content.items}
        visible={Boolean(selectedPerson)}
        onClose={() => setSelectedPerson(null)}
        onOpenItem={(nextItem) => {
          setSelectedPerson(null);
          setSelectedItem(nextItem);
        }}
      />
      {videoRequest ? (
        <VideoPlayerModal
          request={videoRequest}
          onClose={() => setVideoRequest(null)}
          onProgress={updateWatchProgress}
        />
      ) : null}
      {operatorGateRequest ? (
        <OperatorGateModal
          request={operatorGateRequest}
          onClose={() => setOperatorGateRequest(null)}
          onRetry={() => void openOperatorAccess(operatorGateRequest.item, operatorGateRequest.file)}
        />
      ) : null}
      {operatorWebRequest ? (
        <OperatorWebModal
          request={operatorWebRequest}
          onClose={() => setOperatorWebRequest(null)}
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
  tabScene: { flex: 1 },
  tabSceneHidden: { display: 'none' },
  globalMenuButton: { position: 'absolute', top: 10, right: 14, zIndex: 30, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,21,28,0.96)', borderWidth: 1, borderColor: COLORS.border },
  bottomNavigationSafeArea: { backgroundColor: COLORS.background, paddingHorizontal: 10, paddingTop: 6 },
  screen: { flex: 1, backgroundColor: COLORS.background },
  initialLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, backgroundColor: COLORS.background },
  initialLoadingTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 16 },
  initialLoadingText: { ...rtlText, color: COLORS.muted, fontSize: 10, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  initialLoadingTrack: { width: 190, height: 5, marginTop: 15, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.10)' },
  initialLoadingFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.gold },
  refreshIndicator: { position: 'absolute', top: 14, left: 14, width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,19,25,0.94)', borderWidth: 1, borderColor: COLORS.border },
  contentUnavailable: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  retryButton: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.red },
  retryButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  homeScroll: { flex: 1 },
  homeContent: { paddingBottom: 34 },
  continueSection: { marginTop: 28 },
  continueList: { flexDirection: 'row-reverse', gap: 12, paddingHorizontal: 18, paddingBottom: 3 },
  continueCard: { width: 238, borderRadius: 15, overflow: 'hidden', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  continueArtworkWrap: { width: '100%', height: 134, position: 'relative', overflow: 'hidden', backgroundColor: COLORS.surfaceStrong },
  continueArtwork: { width: '100%', height: '100%' },
  continueArtworkFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151920' },
  continuePlayIcon: { position: 'absolute', left: 12, bottom: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.red },
  continueRemoveButton: { position: 'absolute', top: 9, left: 9, width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  continueCardText: { position: 'absolute', right: 12, left: 56, bottom: 12, alignItems: 'flex-end' },
  continueTitle: { ...rtlText, width: '100%', color: '#fff', fontSize: 12, fontWeight: '900' },
  continueMeta: { ...rtlText, width: '100%', color: '#D4D7DB', fontSize: 8.5, marginTop: 5 },
  continueProgressTrack: { width: '100%', height: 5, backgroundColor: '#090B0F' },
  continueProgressFill: { height: '100%', backgroundColor: COLORS.red },
  starsSection: { marginTop: 22, marginBottom: 5, paddingTop: 13, paddingBottom: 13, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(216,180,90,0.15)', backgroundColor: 'rgba(12,15,20,0.72)' },
  starsHeader: { paddingHorizontal: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  starsHeaderIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.09)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.32)' },
  starsHeaderText: { flex: 1, alignItems: 'flex-end' },
  starsTitle: { ...rtlText, color: COLORS.text, fontSize: 17, lineHeight: 23, fontWeight: '900', letterSpacing: -0.4 },
  starsSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8, lineHeight: 13, marginTop: 1 },
  starChooserRow: { marginTop: 11, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  starMiniProfileCard: { width: 138, minHeight: 92, padding: 7, borderRadius: 15, overflow: 'hidden', flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: '#11151C', borderWidth: 1, borderColor: 'rgba(216,180,90,0.32)' },
  starMiniProfileAvatarWrap: { width: 50, height: 68, borderRadius: 11, overflow: 'hidden', flexShrink: 0, backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: 'rgba(216,180,90,0.42)' },
  starMiniProfileAvatar: { width: '100%', height: '100%' },
  starMiniProfileInfo: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  starMiniProfileName: { width: '100%', color: COLORS.text, fontSize: 10.5, lineHeight: 15, fontWeight: '900', textAlign: 'right', writingDirection: 'ltr' },
  starMiniFacts: { width: '100%', marginTop: 5, gap: 2 },
  starMiniFactText: { width: '100%', color: '#D4D7DD', fontSize: 7.3, lineHeight: 11, fontWeight: '800', textAlign: 'right' },
  starMiniLocation: { width: '100%', color: COLORS.gold, fontSize: 7.1, lineHeight: 11, fontWeight: '800', textAlign: 'right' },
  starPeopleRail: { flex: 1, minWidth: 0 },
  starsPeopleList: { flexDirection: 'row-reverse', gap: 8, paddingLeft: 5, paddingRight: 2, paddingVertical: 3 },
  starPersonCard: { width: 58, alignItems: 'center' },
  starPersonAvatarWrap: { width: 53, height: 53, borderRadius: 27, padding: 1.5, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong, borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.12)' },
  starPersonAvatarActive: { borderWidth: 2.2, borderColor: COLORS.red, shadowColor: COLORS.red, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  starPersonAvatar: { width: '100%', height: '100%', borderRadius: 25 },
  starPersonName: { width: '100%', minHeight: 21, color: COLORS.muted, fontSize: 7.1, lineHeight: 10, fontWeight: '800', textAlign: 'center', marginTop: 5, writingDirection: 'ltr' },
  starPersonNameActive: { color: COLORS.text },
  starWorksList: { flexDirection: 'row-reverse', gap: 9, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 1 },
  starWorkCard: { width: 104 },
  starWorkPoster: { width: 104, height: 145, borderRadius: 13, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  starWorkTitle: { ...rtlText, width: '100%', minHeight: 29, marginTop: 6, color: COLORS.text, fontSize: 8.2, lineHeight: 13, fontWeight: '800', textAlign: 'right' },
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
  scheduleSection: { marginHorizontal: 12, marginTop: 26, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(216,180,90,0.24)', backgroundColor: '#0C0F14', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 6 },
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
  scheduleGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'space-between' },
  scheduleHorizontalViewport: { marginTop: 1, flexGrow: 0 },
  scheduleHorizontalList: { flexDirection: 'row-reverse', gap: 8, paddingVertical: 2, paddingHorizontal: 1 },
  scheduleCard: { minHeight: 72, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, padding: 7, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  scheduleCardCompact: { height: 88, minHeight: 88, alignItems: 'center', padding: 7, gap: 7 },
  schedulePoster: { width: 48, height: 58, borderRadius: 8, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong },
  schedulePosterCompact: { width: 43, height: 58, borderRadius: 8 },
  scheduleCardBody: { minWidth: 0, flex: 1, alignItems: 'flex-end', justifyContent: 'center' },
  scheduleSourceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  scheduleRegion: { color: COLORS.blue, fontSize: 8, fontWeight: '800' },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.red },
  scheduleName: { ...rtlText, color: COLORS.text, fontSize: 13, fontWeight: '900', marginTop: 5 },
  scheduleNameCompact: { fontSize: 10.2, lineHeight: 15, marginTop: 2 },
  scheduleEpisode: { ...rtlText, color: COLORS.muted, fontSize: 9, marginTop: 3 },
  scheduleTimeWrap: { alignItems: 'center', gap: 5 },
  scheduleTime: { ...rtlText, color: COLORS.gold, fontSize: 11, fontWeight: '900', marginTop: 4 },
  scheduleTimeCompact: { fontSize: 7.8, lineHeight: 12 },
  scheduleEmpty: { minHeight: 112, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  scheduleEmptyTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '800', marginTop: 8 },
  scheduleEmptyText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 16, marginTop: 5, textAlign: 'center' },
  scheduleFootnote: { ...rtlText, color: '#5E646D', fontSize: 8, lineHeight: 15, marginTop: 11 },
  catalogSection: { marginTop: 30 },
  sectionTitleRow: { paddingHorizontal: 18, flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionAction: { minWidth: 88, minHeight: 44, paddingHorizontal: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 3 },
  sectionActionText: { color: COLORS.gold, fontSize: 10, fontWeight: '800' },
  collectionSection: { marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 13 },
  collectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  collectionHeaderIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(213,175,86,0.08)', borderWidth: 1, borderColor: 'rgba(213,175,86,0.28)' },
  collectionHeaderText: { flex: 1, alignItems: 'flex-end' },
  collectionEyebrow: { ...rtlText, color: COLORS.gold, fontSize: 8.5, fontWeight: '900', marginBottom: 2 },
  collectionTitle: { ...rtlText, color: COLORS.text, fontSize: 15, fontWeight: '900' },
  collectionEnglish: { color: COLORS.muted, fontSize: 8.5, marginTop: 2, textAlign: 'right' },
  collectionList: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 1, paddingBottom: 3 },
  collectionCard: { width: 112, alignItems: 'stretch' },
  collectionPosterWrap: { width: 112, height: 159, overflow: 'hidden', borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  collectionPosterCurrent: { borderColor: COLORS.gold, borderWidth: 1.5 },
  collectionPoster: { width: '100%', height: '100%' },
  collectionOrderBadge: { position: 'absolute', top: 7, right: 7, minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.88)', borderWidth: 1, borderColor: 'rgba(213,175,86,0.5)' },
  collectionOrderText: { color: COLORS.gold, fontSize: 10, fontWeight: '900' },
  collectionCurrentBadge: { position: 'absolute', left: 7, right: 7, bottom: 25, minHeight: 23, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(132,18,39,0.92)' },
  collectionCurrentText: { ...rtlText, color: '#fff', fontSize: 7.5, fontWeight: '900', textAlign: 'center' },
  collectionYear: { position: 'absolute', right: 8, bottom: 7, color: '#fff', fontSize: 8.5, fontWeight: '900' },
  collectionMovieName: { ...rtlText, color: COLORS.text, fontSize: 10, lineHeight: 16, fontWeight: '800', marginTop: 7, minHeight: 31 },
  horizontalCatalogList: { direction: 'ltr' },
  horizontalCatalog: { gap: 11, paddingHorizontal: 18, paddingTop: 14 },
  posterCard: { width: 137, alignItems: 'flex-end' },
  posterImageWrap: { width: 137, height: 194, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: COLORS.surface },
  posterImage: { width: '100%', height: '100%' },
  catalogArtworkContainer: { overflow: 'hidden', backgroundColor: '#141820' },
  catalogArtworkFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#141820' },
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
  simpleSearchHeader: { minHeight: 82, paddingHorizontal: 20, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  simpleSearchBoxWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  simpleSearchResults: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 34 },
  simpleSearchResultCount: { ...rtlText, width: '100%', color: COLORS.muted, fontSize: 9, marginBottom: 13, textAlign: 'right' },
  searchBox: { height: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13, writingDirection: 'rtl' },
  searchFilters: { flexDirection: 'row-reverse', gap: 8, paddingTop: 13, paddingBottom: 2 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: 'rgba(222,35,66,0.13)', borderColor: 'rgba(222,35,66,0.45)' },
  filterChipText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  filterChipTextActive: { color: COLORS.text },
  advancedFilterToggle: { minHeight: 66, marginTop: 15, paddingHorizontal: 13, borderRadius: 15, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  advancedFilterToggleOpen: { borderColor: 'rgba(213,175,86,0.42)', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  advancedFilterToggleMain: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  advancedFilterIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(213,175,86,0.08)', borderWidth: 1, borderColor: 'rgba(213,175,86,0.22)' },
  advancedFilterToggleText: { flex: 1, alignItems: 'flex-end' },
  advancedFilterTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900' },
  advancedFilterHint: { ...rtlText, color: COLORS.muted, fontSize: 8.5, marginTop: 4 },
  advancedFilterToggleSide: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  activeFilterBadge: { minWidth: 23, height: 23, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.red },
  activeFilterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  advancedFilterPanel: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 13, borderBottomLeftRadius: 15, borderBottomRightRadius: 15, backgroundColor: 'rgba(16,19,24,0.96)', borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(213,175,86,0.34)' },
  advancedFilterSection: { paddingTop: 14 },
  advancedFilterSectionTitle: { ...rtlText, color: '#D8DBE0', fontSize: 10.5, fontWeight: '900', marginBottom: 9 },
  advancedFilterChips: { flexDirection: 'row-reverse', gap: 7, paddingBottom: 2 },
  personFilterRoleRow: { flexDirection: 'row-reverse', gap: 7, marginBottom: 9 },
  personRoleChip: { flex: 1, minHeight: 36, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  personRoleChipActive: { backgroundColor: 'rgba(222,35,66,0.13)', borderColor: 'rgba(222,35,66,0.45)' },
  personRoleChipText: { ...rtlText, color: COLORS.muted, fontSize: 9, fontWeight: '800', textAlign: 'center' },
  personFilterSearchBox: { height: 45, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  personFilterInput: { flex: 1, color: COLORS.text, fontSize: 11, writingDirection: 'rtl' },
  personSuggestions: { flexDirection: 'row-reverse', gap: 8, paddingTop: 9, paddingBottom: 2 },
  personSuggestionChip: { minWidth: 128, maxWidth: 190, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, alignItems: 'flex-end', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  personSuggestionChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(213,175,86,0.08)' },
  personSuggestionName: { ...rtlText, color: COLORS.text, fontSize: 9.5, fontWeight: '900' },
  personSuggestionMeta: { ...rtlText, color: COLORS.muted, fontSize: 7.5, marginTop: 4 },
  clearAdvancedFiltersButton: { height: 42, marginTop: 15, borderRadius: 11, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'rgba(222,35,66,0.07)', borderWidth: 1, borderColor: 'rgba(222,35,66,0.25)' },
  clearAdvancedFiltersText: { ...rtlText, color: COLORS.red, fontSize: 9.5, fontWeight: '900' },
  searchPreparing: { minHeight: 54, marginTop: 14, paddingHorizontal: 14, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  searchPreparingText: { ...rtlText, color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  resultCount: { ...rtlText, color: COLORS.muted, fontSize: 10, marginTop: 22, marginBottom: 12 },
  searchGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-start', rowGap: 20 },
  searchEmptyState: { minHeight: 330, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38 },
  largeEmpty: { minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38 },
  largeEmptyIcon: { width: 74, height: 74, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.22)' },
  largeEmptyTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 18 },
  largeEmptyText: { ...rtlText, color: COLORS.muted, fontSize: 11, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  detailScreen: { flex: 1, backgroundColor: COLORS.background },
  detailContent: { paddingBottom: 36 },
  detailHero: { height: 410, justifyContent: 'flex-end' },
  detailTopBar: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 66, paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row-reverse', justifyContent: 'space-between' },
  detailTopActions: { flexDirection: 'row-reverse', gap: 8 },
  detailCircleButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  detailCircleButtonDisabled: { opacity: 0.62 },
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
  seriesEpisodes: { gap: 14 },
  seasonSelectorWrap: { gap: 9, paddingBottom: 2 },
  seasonSelectorHeader: { minHeight: 28, paddingHorizontal: 4, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  seasonSelectorTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900' },
  seasonSelectorMeta: { color: COLORS.muted, fontSize: 8.5, fontWeight: '800' },
  seasonSelector: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 1, paddingBottom: 2 },
  seasonChip: { minWidth: 94, minHeight: 54, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  seasonChipActive: { backgroundColor: 'rgba(222,35,66,0.15)', borderColor: 'rgba(222,35,66,0.68)' },
  seasonChipText: { ...rtlText, color: COLORS.text, fontSize: 11, fontWeight: '900' },
  seasonChipTextActive: { color: '#fff' },
  seasonChipCount: { color: COLORS.muted, fontSize: 8, fontWeight: '800', marginTop: 4 },
  seasonChipCountActive: { color: COLORS.gold },
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
  downloadLibraryCard: { minHeight: 120, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 8, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  downloadLibraryArtworkWrap: { width: 112, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong },
  downloadLibraryArtwork: { width: '100%', height: '100%' },
  downloadLibraryArtworkFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong },
  downloadLibraryArtworkPlay: { position: 'absolute', left: 7, bottom: 7, width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(222,35,66,0.96)' },
  downloadLibraryInfo: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  downloadLibraryTitle: { ...rtlText, color: COLORS.text, fontSize: 11.5, fontWeight: '900', width: '100%' },
  downloadLibraryEnglish: { width: '100%', color: COLORS.muted, fontSize: 7.8, textAlign: 'right', marginTop: 3 },
  downloadLibraryMeta: { ...rtlText, color: COLORS.gold, fontSize: 8.3, fontWeight: '800', marginTop: 5, width: '100%' },
  downloadLibraryEpisodeTitle: { ...rtlText, color: COLORS.muted, fontSize: 7.5, marginTop: 3, width: '100%' },
  downloadLibraryStatus: { ...rtlText, color: COLORS.gold, fontSize: 8.2, marginTop: 5, width: '100%' },
  downloadLibraryActions: { gap: 6 },
  downloadLibraryControl: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.12)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.38)' },
  downloadLibraryMenu: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  progressTrack: { width: '100%', height: 5, borderRadius: 4, overflow: 'hidden', backgroundColor: '#080A0E', marginTop: 7 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.gold },
  playerDisplayButton: { minWidth: 72, height: 38, paddingHorizontal: 8, borderRadius: 11, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.30)' },
  playerDisplayButtonText: { color: COLORS.text, fontSize: 9, fontWeight: '900' },
  playerQualityButton: { minWidth: 76, height: 38, paddingHorizontal: 8, borderRadius: 11, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.30)' },
  playerQualityButtonDisabled: { opacity: 0.55 },
  playerQualityButtonText: { color: COLORS.text, fontSize: 9.5, fontWeight: '900' },
  qualitySwitchLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
  qualitySwitchLoadingText: { ...rtlText, color: COLORS.text, fontSize: 11, fontWeight: '800', marginTop: 12 },
  playerQualityOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.64)', paddingHorizontal: 12 },
  playerMenuCard: { width: '100%', maxWidth: 430, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, backgroundColor: '#101319', borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  playerMenuBottomSheet: { position: 'absolute', left: 12, right: 12, maxWidth: undefined, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  playerMenuGrabber: { width: 42, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.22)' },
  playerDisplayOption: { minHeight: 76, paddingHorizontal: 12, paddingVertical: 10, marginTop: 7, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#0B0E13', borderWidth: 1, borderColor: COLORS.border },
  playerDisplayOptionText: { flex: 1, alignItems: 'flex-end' },
  playerDisplayOptionTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900' },
  playerDisplayOptionDescription: { ...rtlText, color: COLORS.muted, fontSize: 8.5, lineHeight: 16, marginTop: 4 },
  playerDisplayOptionIcon: { width: 28, alignItems: 'center', justifyContent: 'center', gap: 7 },
  playerQualityHeader: { alignItems: 'flex-end', paddingHorizontal: 4, paddingBottom: 10 },
  playerQualityTitle: { ...rtlText, color: COLORS.text, fontSize: 15, fontWeight: '900' },
  playerQualityDescription: { ...rtlText, color: COLORS.muted, fontSize: 9, marginTop: 5 },
  playerQualityOption: { minHeight: 48, paddingHorizontal: 12, marginTop: 7, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0B0E13', borderWidth: 1, borderColor: COLORS.border },
  playerQualityOptionSelected: { borderColor: 'rgba(216,180,90,0.58)', backgroundColor: 'rgba(216,180,90,0.07)' },
  playerQualityOptionText: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  playerQualityOptionTextSelected: { color: COLORS.gold },
  detailOperatorBadge: { marginBottom: 7, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: 'rgba(216,180,90,0.10)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.36)' },
  detailOperatorBadgeText: { color: COLORS.gold, fontSize: 8, fontWeight: '900' },
  operatorWatchButton: { backgroundColor: '#846A2E' },
  operatorGroup: { marginTop: 8, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(216,180,90,0.34)', backgroundColor: '#10120F' },
  operatorGroupOpen: { borderColor: 'rgba(216,180,90,0.72)' },
  operatorGroupBadge: { minWidth: 44, height: 36, paddingHorizontal: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(216,180,90,0.52)', backgroundColor: 'rgba(216,180,90,0.12)' },
  operatorGroupBadgeText: { color: COLORS.gold, fontSize: 8, fontWeight: '900' },
  operatorActionList: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: 'rgba(216,180,90,0.20)' },
  operatorNotice: { minHeight: 58, marginTop: 11, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: 'rgba(216,180,90,0.07)' },
  operatorNoticeText: { ...rtlText, flex: 1, color: '#C8B779', fontSize: 9, lineHeight: 17 },
  operatorActionButton: { minHeight: 58, marginTop: 9, paddingHorizontal: 13, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#846A2E' },
  operatorActionText: { flex: 1, alignItems: 'flex-end' },
  operatorActionTitle: { ...rtlText, color: '#fff', fontSize: 11, fontWeight: '900' },
  operatorActionSubtitle: { ...rtlText, color: 'rgba(255,255,255,0.72)', fontSize: 8, lineHeight: 15, marginTop: 4 },
  operatorGateOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.76)' },
  operatorGateCard: { width: '100%', maxWidth: 360, minHeight: 250, paddingHorizontal: 24, paddingVertical: 25, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#11140F', borderWidth: 1, borderColor: 'rgba(216,180,90,0.44)' },
  operatorGateIcon: { width: 64, height: 64, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.10)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.32)' },
  operatorGateTitle: { ...rtlText, color: COLORS.text, fontSize: 16, lineHeight: 25, fontWeight: '900', textAlign: 'center', marginTop: 16 },
  operatorGateText: { ...rtlText, color: COLORS.muted, fontSize: 10.5, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  operatorGateButtons: { width: '100%', marginTop: 20, gap: 9 },
  operatorGatePrimaryButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#846A2E' },
  operatorGatePrimaryText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  operatorGateCancelButton: { minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  operatorGateCancelText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  operatorWebModal: { flex: 1, backgroundColor: COLORS.background },
  operatorWebHeader: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#080A0E', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  operatorWebTitleWrap: { flex: 1, alignItems: 'flex-end' },
  operatorWebTitle: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 13, fontWeight: '900' },
  operatorWebBadge: { marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: 'rgba(216,180,90,0.10)' },
  operatorWebBadgeText: { color: COLORS.gold, fontSize: 7.5, fontWeight: '900' },
  operatorWebBody: { flex: 1, backgroundColor: '#fff' },
  operatorWebView: { flex: 1, backgroundColor: '#fff' },
  operatorWebLoading: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  operatorWebLoadingText: { ...rtlText, color: COLORS.text, fontSize: 11, fontWeight: '800', marginTop: 12 },
  operatorWebLoadingBadge: { position: 'absolute', top: 12, left: 12, width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.88)' },
  operatorWebError: { flex: 1, paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  operatorWebErrorTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 14 },
  operatorWebErrorText: { ...rtlText, color: COLORS.muted, fontSize: 10.5, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  peopleSection: { marginTop: 24 },
  peopleSectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 13 },
  peopleSectionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.09)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.3)' },
  peopleSectionHeaderText: { flex: 1, alignItems: 'flex-end' },
  peopleSectionTitle: { ...rtlText, color: COLORS.text, fontSize: 15, fontWeight: '900' },
  peopleSectionSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8.5, marginTop: 4 },
  peopleList: { flexDirection: 'row-reverse', gap: 12, paddingHorizontal: 1, paddingBottom: 2 },
  personCard: { width: 88, height: 157, flexShrink: 0, alignItems: 'center' },
  personAvatarWrap: { width: 70, height: 70, borderRadius: 35, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(216,180,90,0.38)', backgroundColor: COLORS.surface },
  personAvatar: { width: '100%', height: '100%' },
  personAvatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181C23' },
  personAvatarInitials: { color: COLORS.gold, fontSize: 18, fontWeight: '900' },
  personCardName: { ...rtlText, width: '100%', minHeight: 31, color: COLORS.text, fontSize: 9.5, lineHeight: 15, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  personCardRole: { color: COLORS.gold, fontSize: 7.5, fontWeight: '800', marginTop: 2 },
  personCardCharacterWrap: { width: '100%', height: 29, marginTop: 3, paddingHorizontal: 2, alignItems: 'center' },
  personCardCharacterLabel: { color: COLORS.gold, fontSize: 6.6, lineHeight: 10, fontWeight: '800', textAlign: 'center' },
  personCardCharacter: { width: '100%', color: COLORS.muted, fontSize: 6.8, lineHeight: 10.5, textAlign: 'center', writingDirection: 'ltr' },
  personProfileScreen: { flex: 1, backgroundColor: COLORS.background },
  personProfileTopBar: { minHeight: 62, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#080A0E' },
  personProfileTopTitle: { ...rtlText, flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  personProfileTopSpacer: { width: 42, height: 42 },
  personProfileContent: { paddingHorizontal: 16, paddingBottom: 34 },
  personProfileHeader: { alignItems: 'center', paddingTop: 28, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  personProfileAvatarWrap: { width: 112, height: 112, borderRadius: 56, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(216,180,90,0.52)', backgroundColor: COLORS.surface },
  personProfileAvatar: { width: '100%', height: '100%' },
  personProfileAvatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181C23' },
  personProfileInitials: { color: COLORS.gold, fontSize: 30, fontWeight: '900' },
  personProfileName: { ...rtlText, color: COLORS.text, fontSize: 21, lineHeight: 31, fontWeight: '900', textAlign: 'center', marginTop: 15 },
  personProfileEnglish: { color: COLORS.muted, fontSize: 11, textAlign: 'center', marginTop: 5 },
  personProfileRoleBadge: { minHeight: 34, marginTop: 12, paddingHorizontal: 13, borderRadius: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 7, backgroundColor: 'rgba(216,180,90,0.09)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.34)' },
  personProfileRoleText: { color: COLORS.gold, fontSize: 9.5, fontWeight: '900' },
  personWorksHeader: { marginTop: 24, marginBottom: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  personWorksTitle: { ...rtlText, color: COLORS.text, fontSize: 16, fontWeight: '900' },
  personWorksCount: { color: COLORS.gold, fontSize: 9, fontWeight: '900' },
  personWorksGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  personWorksEmpty: { minHeight: 180, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  personWorksEmptyTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  personWorksEmptyText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  mediaModal: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#000' },
  detailCircleButtonPlaceholder: { width: 46, height: 46 },
  videoViewPreparing: { opacity: 0 },
  playerPreparingOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  playerPreparingSpinner: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playerFramePortal: { position: 'absolute', zIndex: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  playerSettingsPortal: { zIndex: 80, backgroundColor: 'rgba(0,0,0,0.42)' },
  playerPreparingText: { ...rtlText, color: '#fff', fontSize: 9.5, fontWeight: '800', marginTop: 9 },
  nativePlayerTopBar: { position: 'absolute', zIndex: 30, minHeight: 42, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.36)', borderRadius: 14 },
  playerDetachedBar: { justifyContent: 'space-between', backgroundColor: '#000', borderRadius: 0 },
  nativePlayerTopButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,7,10,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  playerBottomSettingsButton: { position: 'absolute', zIndex: 46, width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,7,10,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  nativePlayerTitle: { ...rtlText, minWidth: 0, flex: 1, color: '#fff', fontSize: 10.5, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  nativePlayerStatusText: { ...rtlText, color: 'rgba(255,255,255,0.66)', fontSize: 8.5, textAlign: 'center', marginTop: 13 },
  playerScreenCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  videoFrame: { position: 'absolute', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  videoFrameLandscape: { width: '100%', height: '100%' },
  webModal: { flex: 1, backgroundColor: COLORS.background },
  mediaModalHeader: { height: 62, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#080A0E', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mediaCloseButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong },
  mediaModalTitle: { ...rtlText, minWidth: 0, flex: 1, color: COLORS.text, fontSize: 12.5, fontWeight: '900' },
  videoStage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  videoView: { width: '100%', height: '100%', backgroundColor: '#000' },
  webView: { flex: 1, backgroundColor: '#fff' },
  webLoading: { ...StyleSheet.absoluteFillObject, top: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.72)' },

  libraryTabs: { flexDirection: 'row-reverse', gap: 7, padding: 5, marginBottom: 18, borderRadius: 14, backgroundColor: '#090B0F', borderWidth: 1, borderColor: COLORS.border },
  libraryTab: { flex: 1, minHeight: 45, borderRadius: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  libraryTabActive: { backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: 'rgba(216,180,90,0.26)' },
  libraryTabText: { color: COLORS.muted, fontSize: 9.5, fontWeight: '800' },
  libraryTabTextActive: { color: COLORS.text },
  historyToolbar: { minHeight: 44, marginBottom: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  historyToolbarText: { ...rtlText, color: COLORS.muted, fontSize: 9.5, fontWeight: '700' },
  historyClearButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: 'rgba(222,35,66,0.07)', borderWidth: 1, borderColor: 'rgba(222,35,66,0.2)' },
  historyClearText: { color: COLORS.red, fontSize: 8.5, fontWeight: '900' },
  historyList: { gap: 10 },
  historyCard: { minHeight: 94, padding: 8, borderRadius: 15, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  historyArtworkWrap: { width: 116, height: 77, borderRadius: 11, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong },
  historyArtwork: { width: '100%', height: '100%' },
  historyArtworkFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  historyArtworkPlay: { position: 'absolute', left: 7, bottom: 7, width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(222,35,66,0.94)' },
  historyBody: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  historyTitleRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  historyTitle: { ...rtlText, minWidth: 0, flex: 1, color: COLORS.text, fontSize: 11, fontWeight: '900' },
  historyRemoveButton: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong },
  historySubtitle: { width: '100%', color: COLORS.muted, fontSize: 8, textAlign: 'right', marginTop: 4 },
  historyStatus: { ...rtlText, width: '100%', color: COLORS.gold, fontSize: 8.5, fontWeight: '800', marginTop: 7 },
  historyStatusCompleted: { color: '#65C58A' },
  historyProgressTrack: { width: '100%', height: 4, borderRadius: 3, overflow: 'hidden', backgroundColor: '#080A0E', marginTop: 7 },
  historyProgressFill: { height: '100%', backgroundColor: COLORS.red },
  storageSummary: { marginBottom: 18, padding: 15, borderRadius: 17, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(216,180,90,0.24)' },
  storageSummaryMain: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  storageSummaryIcon: { width: 47, height: 47, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.26)' },
  storageSummaryText: { flex: 1, alignItems: 'flex-end' },
  storageSummaryTitle: { ...rtlText, color: COLORS.muted, fontSize: 8.5, fontWeight: '800' },
  storageSummaryValue: { color: COLORS.text, fontSize: 18, fontWeight: '900', marginTop: 5 },
  storageStatsRow: { minHeight: 56, marginTop: 14, flexDirection: 'row-reverse', alignItems: 'center', borderRadius: 12, backgroundColor: '#0B0E13' },
  storageStat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  storageStatValue: { color: COLORS.gold, fontSize: 13, fontWeight: '900' },
  storageStatLabel: { color: COLORS.muted, fontSize: 8, marginTop: 4 },
  storageStatDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  storageActions: { marginTop: 11, flexDirection: 'row-reverse', gap: 8 },
  storageActionButton: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 11, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  storageActionDanger: { backgroundColor: 'rgba(222,35,66,0.06)', borderColor: 'rgba(222,35,66,0.2)' },
  storageActionText: { color: COLORS.muted, fontSize: 7.8, fontWeight: '800' },
  storageActionDangerText: { color: COLORS.red },

  headerBrandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  catalogListContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 112 },
  categoryGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-start', marginTop: 16, marginBottom: 24 },
  categoryCard: { minHeight: 176, padding: 13, borderRadius: 18, overflow: 'hidden', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(216,180,90,0.25)' },
  categoryFallbackArt: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  categoryCardIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,10,14,0.78)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.38)' },
  categoryCardTextWrap: { width: '100%', alignItems: 'flex-end' },
  categoryCardTitle: { ...rtlText, color: COLORS.text, fontSize: 12.5, fontWeight: '900', width: '100%', textShadowColor: 'rgba(0,0,0,0.72)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  categoryCardSubtitle: { ...rtlText, color: '#CDD0D5', fontSize: 8.2, lineHeight: 15, marginTop: 5, width: '100%', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  dynamicChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 11, marginBottom: 22 },
  dynamicChip: { minHeight: 37, paddingHorizontal: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  dynamicChipText: { color: COLORS.text, fontSize: 9.5, fontWeight: '800' },
  personImageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong },
  personImageFallbackText: { color: COLORS.gold, fontSize: 18, fontWeight: '900' },
  movieDownloads: { gap: 9 },
  emptyDownloads: { marginTop: 12, padding: 22, borderRadius: 17, alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  emptyDownloadsTitle: { ...rtlText, color: COLORS.text, fontSize: 13, fontWeight: '900' },
  emptyDownloadsText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  vpnLinksHiddenCard: { marginTop: 12, padding: 22, borderRadius: 18, alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(216,180,90,0.38)' },
  vpnLinksHiddenIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.26)' },
  vpnLinksHiddenTitle: { ...rtlText, color: COLORS.text, fontSize: 14, fontWeight: '900', marginTop: 13 },
  vpnLinksHiddenText: { ...rtlText, color: COLORS.muted, fontSize: 10, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  vpnLinksHiddenButton: { minHeight: 46, marginTop: 17, paddingHorizontal: 24, borderRadius: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.red },
  vpnLinksHiddenButtonText: { color: '#fff', fontSize: 10.5, fontWeight: '900' },
  storageTotals: { marginTop: 13, padding: 11, borderRadius: 11, alignItems: 'flex-end', gap: 5, backgroundColor: 'rgba(216,180,90,0.06)' },
  storageTotalText: { ...rtlText, color: COLORS.text, fontSize: 8.7, fontWeight: '800' },
  downloadLibraryBytes: { ...rtlText, color: COLORS.text, fontSize: 7.6, marginTop: 5, width: '100%' },
  playerControlsLayer: { ...StyleSheet.absoluteFillObject, zIndex: 12 },
  playerTopGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 78 },
  playerBottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 112 },
  playerOverlayHeader: { position: 'absolute', top: 7, right: 9, left: 9, minHeight: 42, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerOverlayHeaderLandscape: { right: 16, left: 16, minHeight: 48 },
  playerCenterZone: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playerCenterControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  playerCenterControlsLandscape: { gap: 34 },
  playerRoundButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,7,10,0.76)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  playerPrimaryButton: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  playerSkipText: { position: 'absolute', color: '#fff', fontSize: 8, fontWeight: '900' },
  playerBottomPanel: { position: 'absolute', zIndex: 14, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 2 },
  playerDetachedBottomPanel: { justifyContent: 'center', backgroundColor: '#000' },
  playerBottomPanelLandscape: { left: 18, right: 18, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8 },
  playerTimelineWrap: { width: '100%' },
  playerTimelineTrack: { width: '100%', height: 20, justifyContent: 'center' },
  playerTimelineRail: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.24)' },
  playerTimelineFill: { position: 'absolute', left: 0, height: 4, borderRadius: 3, backgroundColor: '#fff' },
  playerTimelineThumb: { position: 'absolute', width: 14, height: 14, marginLeft: -7, borderRadius: 7, backgroundColor: '#fff' },
  playerTimeRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  playerTimeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  playerVersionText: { ...rtlText, minWidth: 0, flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 8.5, textAlign: 'center' },
  playerBottomTools: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  playerControlRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5 },
  playerControlIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  playerControlSpacer: { flex: 1 },
  playerTimeSeparator: { color: 'rgba(255,255,255,0.48)', fontSize: 9 },
  playerSettingsOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.42)' },
  playerSettingsFrameOverlay: { position: 'absolute', zIndex: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.58)' },
  playerSettingsCard: { width: 216, maxWidth: '78%', maxHeight: '78%', padding: 8, borderRadius: 13, backgroundColor: 'rgba(16,19,25,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  playerSettingsCardLandscape: { width: 236, maxWidth: '40%', maxHeight: '70%' },
  playerSettingsHeader: { minHeight: 30, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  playerSettingsTitle: { ...rtlText, color: '#fff', fontSize: 12, fontWeight: '900' },
  playerSettingsRow: { minHeight: 42, marginTop: 7, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  playerSettingsRowMain: { minWidth: 0, flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  playerSettingsRowTitle: { ...rtlText, color: '#fff', fontSize: 9.2, fontWeight: '900' },
  playerSettingsRowValue: { color: COLORS.gold, fontSize: 8.5, fontWeight: '900', writingDirection: 'ltr' },
  playerSettingsClose: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  playerSettingsLabel: { ...rtlText, color: COLORS.muted, fontSize: 8.5, fontWeight: '800', marginTop: 9, marginBottom: 6 },
  playerSettingsOptions: { marginTop: 7, flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', gap: 5 },
  playerSettingChip: { minHeight: 29, minWidth: 52, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  playerSettingChipActive: { backgroundColor: 'rgba(216,180,90,0.14)', borderColor: 'rgba(216,180,90,0.72)' },
  playerSettingChipText: { color: '#D2D5DA', fontSize: 9.5, fontWeight: '800' },
  playerSettingChipTextActive: { color: COLORS.gold },
  playerSettingsEmpty: { ...rtlText, color: COLORS.muted, fontSize: 8.5, lineHeight: 16, textAlign: 'center', marginTop: 9 },
  playerToolButton: { minWidth: 72, minHeight: 42, paddingHorizontal: 10, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(8,10,14,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  playerToolText: { color: '#fff', fontSize: 8.5, fontWeight: '900' },
  playerLockedButton: { position: 'absolute', left: 24, top: '45%', minHeight: 50, paddingHorizontal: 15, borderRadius: 16, zIndex: 40, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(5,7,10,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' },
  playerLockedText: { ...rtlText, color: '#fff', fontSize: 9.5, fontWeight: '900' },
  playerMenuCardLandscape: { maxWidth: 460, paddingVertical: 12 },
  playerMenuScroll: { width: '100%' },
  playerMenuScrollContent: { paddingBottom: 6 },
  vpnOverlay: { flex: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,5,8,0.97)' },
  vpnCard: { width: '100%', maxWidth: 420, padding: 24, borderRadius: 22, alignItems: 'center', backgroundColor: '#11151C', borderWidth: 1, borderColor: 'rgba(216,180,90,0.38)' },
  vpnIconWrap: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.28)' },
  vpnTitle: { ...rtlText, color: COLORS.text, fontSize: 19, fontWeight: '900', marginTop: 17, textAlign: 'center' },
  vpnText: { ...rtlText, color: COLORS.muted, fontSize: 10.5, lineHeight: 21, textAlign: 'center', marginTop: 10 },
  vpnRetryButton: { minWidth: 190, minHeight: 50, marginTop: 20, paddingHorizontal: 20, borderRadius: 15, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.red },
  vpnRetryText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  vpnContinueButton: { minWidth: 190, minHeight: 46, marginTop: 10, paddingHorizontal: 20, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  vpnContinueText: { color: COLORS.text, fontSize: 10.5, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  sideMenuOverlay: { flex: 1, flexDirection: 'row-reverse', backgroundColor: 'rgba(0,0,0,0.62)' },
  sideMenuPanel: { width: '82%', maxWidth: 360, height: '100%', backgroundColor: '#0B0E13', borderLeftWidth: 1, borderLeftColor: COLORS.border },
  sideMenuHeader: { minHeight: 75, paddingHorizontal: 16, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sideMenuItems: { padding: 14, gap: 8 },
  sideMenuAccordion: { gap: 6 },
  sideMenuItem: { minHeight: 54, paddingHorizontal: 13, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  sideMenuItemOpen: { borderColor: 'rgba(216,180,90,0.48)', backgroundColor: 'rgba(216,180,90,0.07)' },
  sideMenuItemText: { ...rtlText, flex: 1, color: COLORS.text, fontSize: 10.5, fontWeight: '850' },
  sideMenuChildren: { marginTop: 5, marginRight: 12, gap: 6, borderRightWidth: 1, borderRightColor: 'rgba(216,180,90,0.2)', paddingRight: 10 },
  sideMenuNestedAccordion: { gap: 5 },
  sideMenuNestedHeader: { backgroundColor: '#0F131A' },
  sideMenuGrandchildren: { marginRight: 10, gap: 5 },
  sideMenuLeaf: { minHeight: 46, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, backgroundColor: 'rgba(17,21,28,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sideMenuLeafDeep: { minHeight: 42, backgroundColor: 'rgba(8,10,14,0.72)' },
  sideMenuLeafDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gold },
  sideMenuLeafText: { ...rtlText, flex: 1, color: '#E6E8EC', fontSize: 9.5, fontWeight: '800' },


});
