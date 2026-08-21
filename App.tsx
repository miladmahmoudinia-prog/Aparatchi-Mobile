Warning: truncated output (original token count: 122580)
Total output lines: 10045

import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Network from 'expo-network';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, createVideoPlayer, useVideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as WebBrowser from 'expo-web-browser';
import AparatchiCustomTab from './modules/aparatchi-custom-tab/src';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  FlatList,
  InteractionManager,
  Linking,
  Modal,
  PanResponder,
  Platform,
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
import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, DAYS } from './src/data';
import { loadVerifiedForeignSchedule } from './src/foreignSchedule';
import { getBundledContent, loadBootstrapContent, loadCachedLiveContent, loadCatalogItemDetail, loadContent, loadLiveContent, LoadedContent } from './src/contentService';
import { checkVpnActive } from './src/ipAccess';
import {
  checkMobileOperatorAccess,
  MobileOperatorAccessStatus,
} from './src/operatorAccess';
import { CatalogItem, CatalogPerson, DayId, DownloadFile, DownloadSection, FeaturedPerson, ImdbTop100, ImdbTopEntry, MediaLanguage, PersonWorkRef, ScheduleEntry } from './src/types';
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
  | 'indian-series'
  | 'anime-movies'
  | 'anime-series'
  | 'animation-movies'
  | 'animation-series'
  | 'programs'
  | 'kids'
  | 'religious'
  | 'documentaries'
  | 'short-films'
  | 'wildlife'
  | 'collections'
  | 'mobile-operator'
  | CountrySearchFilter
  | GenreSearchFilter
  | YearSearchFilter;

// Lightweight in-memory navigation hooks for screens that keep their own nested state.
// This avoids pushing extra router state into the large catalog tree and keeps Back instant.
let collectionBrowserBackHandler: (() => boolean) | null = null;
let collectionBrowserSelectedId: string | null = null;
let collectionBrowserScrollOffset = 0;

const hasPersianScript = (value?: string | null) => /[\u0600-\u06FF]/.test(String(value || ''));

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


const optimizedImageUrl = (
  value?: string,
  _kind: 'poster' | 'backdrop' | 'person' = 'poster',
) => String(value || '').trim().replace(/^http:\/\//i, 'https://');


const personImageCandidates = (value?: string) => {
  const image = optimizedImageUrl(value, 'person');
  if (!image) return [];

  const candidates: string[] = [];
  const sourceWithoutProtocol = image.replace(/^https?:\/\//i, '');
  const isTmdb = /^https?:\/\/image\.tmdb\.org\//i.test(image);
  const isUpera = /^https?:\/\/thumb\.upera\.tv\//i.test(image);

  if (isTmdb) {
    candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(sourceWithoutProtocol)}&w=190&output=webp`);
    candidates.push(image.replace(/\/t\/p\/(?:original|w\d+)\//i, '/t/p/w185/'));
    candidates.push(image);
  } else if (isUpera) {
    candidates.push(image);
    candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(sourceWithoutProtocol)}&w=190&output=webp`);
  } else {
    candidates.push(image);
  }
  return [...new Set(candidates)];
};

const catalogArtworkCandidates = (
  value?: string,
  kind: 'poster' | 'backdrop' = 'poster',
) => {
  const image = optimizedImageUrl(value, kind);
  if (!isSafeHttpUrl(image) || isPlaceholderUrl(image)) return [];

  const candidates: string[] = [];
  const sourceWithoutProtocol = image.replace(/^https?:\/\//i, '');
  const targetWidth = kind === 'poster' ? 320 : 640;
  const proxied = `https://wsrv.nl/?url=${encodeURIComponent(sourceWithoutProtocol)}&w=${targetWidth}&output=webp`;
  const isUperaArtwork = /^https?:\/\/thumb\.upera\.tv\//i.test(image);
  const isTmdbArtwork = /^https?:\/\/image\.tmdb\.org\//i.test(image);

  if (isUperaArtwork) {
    candidates.push(image, proxied);
  } else if (isTmdbArtwork) {
    const tmdbWidth = kind === 'poster' ? 'w342' : 'w780';
    candidates.push(
      proxied,
      image.replace(/\/t\/p\/(?:original|w\d+)\//i, `/t/p/${tmdbWidth}/`),
      image,
    );
  } else {
    candidates.push(image);
  }
  return [...new Set(candidates)];
};

const internetIsReachable = async () => {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
};

const isNetworkFailure = (value?: string) =>
  /unable to resolve host|no address associated|network request failed|internet|offline|socket|connection/i.test(
    String(value || '').trim(),
  );

const friendlyNetworkError = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (isNetworkFailure(text)) {
    return 'اینترنت قطع است؛ اینترنت را روشن کنید و برای ادامه دوباره بزنید.';
  }
  return text;
};

const isMissingCatalogOverview = (value?: string | null) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return true;
  return /توضیحی\s*ثبت\s*نشده|توضیحات?\s*ثبت\s*نشده|خلاصه(?:\s*داستان)?\s*ثبت\s*نشده|اطلاعاتی\s*ثبت\s*نشده|بدون\s*توضیح|no\s+(?:description|overview)|description\s+not\s+available/i.test(text);
};

const catalogOverviewFor = (item: CatalogItem) => {
  const overview = String(item.overview || '').replace(/\s+/g, ' ').trim();
  // Never flash provider placeholders or raw English copy in a Persian detail
  // page. The whole Story section stays hidden until a real Persian synopsis
  // is present, then appears naturally when detail hydration completes.
  if (!isMissingCatalogOverview(overview) && hasPersianScript(overview)) return overview;
  return '';
};

const scheduleTimeValue = (value?: string) => {
  const text = String(value || '').trim();
  if (!text || /نامشخص|اعلام\s*نشده|unknown|tbd/i.test(text)) return '';
  return text;
};


type CatalogPublicationMetadata = {
  publicationStatus?: 'published' | 'building-archive' | string;
  archiveComplete?: boolean;
  archivePendingEpisodeCount?: number;
  archivePendingEpisodes?: unknown[];
  sourceEpisodeCount?: number;
  archiveAuditStatus?: 'pending' | 'checked' | 'blocked' | string;
  archiveEpisodeDiscoveryComplete?: boolean;
};

const catalogPublicationMetadata = (item: CatalogItem) =>
  item as CatalogItem & CatalogPublicationMetadata;

const isSeriesPublished = (item: CatalogItem) => {
  if (item.type !== 'series') return true;
  const metadata = catalogPublicationMetadata(item);
  if (metadata.publicationStatus === 'published' || metadata.archiveComplete === true) return true;

  // Older catalogs sometimes kept a stale numeric pending count after a full,
  // successful audit. An explicit empty pending list is the trustworthy result.
  const explicitlyAuditedComplete = Boolean(
    metadata.archiveAuditStatus === 'checked' &&
    metadata.archiveEpisodeDiscoveryComplete !== false &&
    Array.isArray(metadata.archivePendingEpisodes) &&
    metadata.archivePendingEpisodes.length === 0 &&
    (item.downloads || []).length > 0,
  );
  if (explicitlyAuditedComplete) return true;

  // Legacy one-episode records must not leak into the public catalog. A series
  // is visible only after an explicit archive audit/publish decision above.
  return false;
};

const isCurrentScheduleSeries = (item?: CatalogItem | null) => {
  if (!item || item.type !== 'series' || !isSeriesPublished(item)) return false;
  if (item.isAiring === true) return true;
  const nextEpisodeTimestamp = Date.parse(String(item.nextEpisodeAirDate || ''));
  return Number.isFinite(nextEpisodeTimestamp) &&
    nextEpisodeTimestamp >= Date.now() - 2 * 24 * 60 * 60 * 1000;
};

const isDirectMediaUrl = (url: string) =>
  /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url);

const isDownloadableMediaUrl = (url: string) =>
  /\.(?:mp4|m4v|mov|webm|mkv)(?:$|[?#])/i.test(url);



const normalizeComparableText = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();

const RELATED_GENERIC_CATEGORY_KEYS = new Set([
  'movies', 'series', 'iranian-movies', 'foreign-movies', 'iranian-series', 'foreign-series',
  'latest', 'updated', 'mobile-operator',
]);
const RELATED_GENERIC_GENRES = new Set(['درام', 'drama']);
const relatedStableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const relatedCatalogItems = (item: CatalogItem, catalog: CatalogItem[], limit = 5, selectionSeed = 0) => {
  const sourceGenres = new Set((item.genres || []).map(normalizeComparableText).filter(Boolean));
  const sourceCategories = new Set((item.categoryKeys || []).filter((key) => !RELATED_GENERIC_CATEGORY_KEYS.has(key)));
  const sourceCountries = new Set((item.countryCodes || []).map((code) => String(code).toUpperCase()));
  const sourcePeople = new Set((item.people || []).map((person) =>
    person.tmdbId ? `tmdb:${person.tmdbId}` : normalizeComparableText(person.nameFa || person.name || ''),
  ).filter(Boolean));
  const sourceYear = Number(item.year || 0);

  const ranked = catalog
    .filter((candidate) => candidate.id !== item.id && candidate.type === item.type)
    .filter((candidate) => candidate.type !== 'series' || isSeriesPublished(candidate))
    .map((candidate) => {
      const candidateGenres = (candidate.genres || []).map(normalizeComparableText).filter(Boolean);
      const sharedGenres = candidateGenres.filter((genre) => sourceGenres.has(genre));
      const meaningfulGenres = sharedGenres.filter((genre) => !RELATED_GENERIC_GENRES.has(genre));
      const sharedCategories = (candidate.categoryKeys || []).filter(
        (key) => !RELATED_GENERIC_CATEGORY_KEYS.has(key) && sourceCategories.has(key),
      );
      const sharedCountries = (candidate.countryCodes || []).map((code) => String(code).toUpperCase()).filter((code) => sourceCountries.has(code));
      const sharedPeople = (candidate.people || []).map((person) =>
        person.tmdbId ? `tmdb:${person.tmdbId}` : normalizeComparableText(person.nameFa || person.name || ''),
      ).filter((key) => key && sourcePeople.has(key));
      const yearDistance = sourceYear > 0 && Number(candidate.year || 0) > 0
        ? Math.abs(sourceYear - Number(candidate.year || 0))
        : 99;
      let score = meaningfulGenres.length * 6 + (sharedGenres.length - meaningfulGenres.length);
      score += sharedCategories.length * 5 + sharedCountries.length * 2 + sharedPeople.length * 7;
      if (yearDistance <= 3) score += 2;
      else if (yearDistance <= 8) score += 1;
      if (item.collectionId && candidate.collectionId === item.collectionId) score += 40;
      if (item.ir === candidate.ir) score += 1;
      if (item.isAnimation === candidate.isAnimation) score += 1;
      if (item.isAnime === candidate.isAnime) score += 1;
      const jitter = (relatedStableHash(String(item.id) + ':' + String(candidate.id) + ':' + String(selectionSeed)) % 10000) / 10000;
      const dominantGenre = meaningfulGenres[0] || sharedGenres[0] || '';
      const dominantCategory = sharedCategories[0] || '';
      const dominantCountry = sharedCountries[0] || '';
      return { candidate, score, jitter, dominantGenre, dominantCategory, dominantCountry, meaningfulGenres, sharedPeople, yearDistance };
    })
    .sort((a, b) => b.score - a.score || b.jitter - a.jitter);

  const selected: CatalogItem[] = [];
  const used = new Set<string>();
  const genreCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const take = (entry: (typeof ranked)[number], enforceDiversity: boolean) => {
    if (selected.length >= limit || used.has(entry.candidate.id)) return false;
    if (enforceDiversity) {
      if (entry.dominantGenre && (genreCounts.get(entry.dominantGenre) || 0) >= 2) return false;
      if (entry.dominantCategory && (categoryCounts.get(entry.dominantCategory) || 0) >= 2) return false;
      if (entry.dominantCountry && (countryCounts.get(entry.dominantCountry) || 0) >= 3) return false;
    }
    selected.push(entry.candidate);
    used.add(entry.candidate.id);
    if (entry.dominantGenre) genreCounts.set(entry.dominantGenre, (genreCounts.get(entry.dominantGenre) || 0) + 1);
    if (entry.dominantCategory) categoryCounts.set(entry.dominantCategory, (categoryCounts.get(entry.dominantCategory) || 0) + 1);
    if (entry.dominantCountry) countryCounts.set(entry.dominantCountry, (countryCounts.get(entry.dominantCountry) || 0) + 1);
    return true;
  };

  // Exact franchise/collection relations always win.
  ranked.filter((entry) => item.collectionId && entry.candidate.collectionId === item.collectionId)
    .forEach((entry) => take(entry, true));

  // Prefer genuinely strong relations, but never let one broad tag such as
  // "Drama" consume the entire rail.
  ranked.filter((entry) => entry.score >= 5).forEach((entry) => take(entry, true));

  // Fill with varied same-format titles before allowing repeated broad-tag hits.
  ranked
    .filter((entry) => !used.has(entry.candidate.id))
    .sort((a, b) => {
      const aDiverse = Number(a.meaningfulGenres.length > 0 || a.sharedPeople.length > 0 || a.yearDistance <= 8);
      const bDiverse = Number(b.meaningfulGenres.length > 0 || b.sharedPeople.length > 0 || b.yearDistance <= 8);
      return bDiverse - aDiverse || b.jitter - a.jitter;
    })
    .forEach((entry) => take(entry, true));

  // Only if the catalog is too small do we relax the diversity caps.
  ranked.forEach((entry) => take(entry, false));
  return selected.slice(0, Math.max(0, limit));
};

const titleLayoutMetrics = (value?: string) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').filter(Boolean) : [];
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
  return {
    characters: text.length,
    words: words.length,
    longestWord,
  };
};

const adaptiveTitleStyle = (value: string, context: 'hero' | 'detail') => {
  const { characters, words, longestWord } = titleLayoutMetrics(value);

  // Word count controls the main size step; character count and a very long
  // token only nudge it down. Short titles stay bold and longer Persian titles
  // remain inside the same clean two-line title area.
  if (context === 'hero') {
    if (words <= 2 && characters <= 16 && longestWord <= 11) return { fontSize: 31, lineHeight: 38, letterSpacing: -1.0 };
    if (words <= 3 && characters <= 24 && longestWord <= 13) return { fontSize: 27, lineHeight: 34, letterSpacing: -0.86 };
    if (words <= 4 && characters <= 31) return { fontSize: 23, lineHeight: 30, letterSpacing: -0.66 };
    if (words <= 6 && characters <= 44) return { fontSize: 20, lineHeight: 27, letterSpacing: -0.48 };
    if (characters <= 62) return { fontSize: 18, lineHeight: 24, letterSpacing: -0.34 };
    return { fontSize: 16, lineHeight: 22, letterSpacing: -0.24 };
  }

  if (words <= 2 && characters <= 18 && longestWord <= 12) return { fontSize: 27, lineHeight: 34, letterSpacing: -0.8 };
  if (words <= 3 && characters <= 27 && longestWord <= 14) return { fontSize: 24, lineHeight: 31, letterSpacing: -0.62 };
  if (words <= 4 && characters <= 36) return { fontSize: 21, lineHeight: 28, letterSpacing: -0.46 };
  if (words <= 6 && characters <= 50) return { fontSize: 18.5, lineHeight: 25, letterSpacing: -0.32 };
  return { fontSize: 16.5, lineHeight: 22, letterSpacing: -0.22 };
};

const adaptiveTitleLines = (_value: string) => 2;

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

const inferredScheduleFromCatalog = (catalog: CatalogItem[]): ScheduleEntry[] =>
  catalog.flatMap((item) => {
    if (!isCurrentScheduleSeries(item)) return [];

    const overrideDay = SCHEDULE_DAY_OVERRIDES.find(({ pattern }) =>
      pattern.test(normalizeComparableText(item.nameFa)),
    )?.day;
    const explicitDay = item.airDays?.find((day) => DAY_INDEX.includes(day));
    const nextEpisodeDay = dayFromDateValue(item.nextEpisodeAirDate);
    const day = overrideDay || explicitDay || nextEpisodeDay;

    if (!day) return [];

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
      sourceLabel: item.nextEpisodeAirDate ? 'برنامه رسمی پخش' : 'برنامه ثبت‌شده',
      verifiedAt: item.nextEpisodeAirDate || item.updatedAt || '',
    } satisfies ScheduleEntry];
  });

const downloadModeFor = (file: DownloadFile): NonNullable<DownloadFile['mode']> =>
  file.mode || 'download';

const isOperatorFile = (file: DownloadFile) => {
  const mode = downloadModeFor(file);
  return mode === 'operator-play' || mode === 'operator-download';
};

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
    const decodedPath = decodeURIComponent(parsed.pathname || '');
    if (!/(^|\.)upera\.tv$/i.test(parsed.hostname)) return false;
    return /^\/stream\/(?:movie|episode)\/[^/?#]+\/?$/i.test(decodedPath);
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
    (item.supportedOperators || []).length ||
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

const itemPosterBadges = (item: CatalogItem) => {
  const badges: Array<{ id: string; label: string; kind: 'language' | 'operator' }> = [];

  if (!isIranianItem(item)) {
    const languages = itemLanguages(item);
    if (languages.includes('dubbed') && languages.includes('subtitled')) {
      badges.push({ id: 'language', label: 'دوبله فارسی + زیرنویس فارسی', kind: 'language' });
    } else if (languages.includes('dubbed')) {
      badges.push({ id: 'language', label: 'دوبله فارسی', kind: 'language' });
    } else if (languages.includes('subtitled')) {
      badges.push({ id: 'language', label: 'زیرنویس فارسی', kind: 'language' });
    }
  }

  if (itemHasOperatorAccess(item)) {
    badges.push({ id: 'operator', label: 'ویژه همراه', kind: 'operator' });
  }

  return badges;
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
  'IR', 'KR', 'IN', 'US', 'TR', 'CN', 'GB', 'FR', 'DE', 'ES', 'IT', 'CA', 'AU', 'RU',
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
    // Aparatchi exposes only real downloadable media. Purchase/subscription
    // portals are intentionally never rendered as download options.
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

const reconcileUperaMediaFiles = (files: DownloadFile[]): DownloadFile[] => {
  const prepared = files.map((file) => ({ ...file }));

  // A single media URL cannot truthfully be both the dubbed and subtitled
  // edition in this player: selecting either button would play the same stream.
  // Treat such stale catalog conflicts as ambiguous and remove them from the
  // language chooser; a neutral item.streamUrl fallback can still play media.
  const languagesByUrl = new Map<string, Set<MediaLanguage>>();
  for (const file of prepared) {
    if (!file.url || (file.language !== 'dubbed' && file.language !== 'subtitled')) continue;
    const key = String(file.url).trim();
    if (!key) continue;
    const languages = languagesByUrl.get(key) || new Set<MediaLanguage>();
    languages.add(file.language);
    languagesByUrl.set(key, languages);
  }
  const conflictedUrls = new Set(
    [...languagesByUrl.entries()]
      .filter(([, languages]) => languages.has('dubbed') && languages.has('subtitled'))
      .map(([url]) => url),
  );
  const safe = conflictedUrls.size
    ? (() => {
        const result: DownloadFile[] = [];
        const emitted = new Set<string>();
        for (const file of prepared) {
          const url = String(file.url || '').trim();
          if (!conflictedUrls.has(url)) {
            result.push(file);
            continue;
          }
          if (emitted.has(url)) continue;
          const sameUrl = prepared.filter((candidate) => String(candidate.url || '').trim() === url);
          const representative = sameUrl.find((candidate) => String(candidate.mode || 'download') === 'download')
            || sameUrl.find((candidate) => String(candidate.mode || '') === 'play')
            || file;
          if (representative !== file) continue;
          emitted.add(url);
          // Conflicting language metadata is ambiguous, but the media itself is
          // still real. Keep one neutral row rather than making play/download vanish.
          result.push({ ...representative, language: undefined });
        }
        return result;
      })()
    : prepared;

  const explicit = new Set<MediaLanguage>(
    safe
      .map((file) => file.language)
      .filter((language): language is MediaLanguage => language === 'dubbed' || language === 'subtitled'),
  );
  const hasUnknown = safe.some((file) => !file.language);
  if (!hasUnknown) return safe;

  if (explicit.size > 0) {
    // Never manufacture the missing language. An unlabeled Upera row is not
    // proof of a dubbed/subtitled counterpart, so only positively identified
    // rows participate in the language-labelled playback/download UI.
    return safe.filter((file) => file.language === 'dubbed' || file.language === 'subtitled');
  }

  // With no language evidence at all, keep the media available under a neutral
  // «پخش آنلاین / لینک‌های دریافت» label instead of guessing.
  return safe;
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

  // Unlabelled source media remains playable for every country. The lack of a
  // language marker is deliberately neutral and must never create a fake
  // dubbed/subtitled option.
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
    isIranianItem(item) &&
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
    return [{
      label: 'پخش آنلاین',
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
  const reconciled = reconcileUperaMediaFiles(files);
  const sections: DownloadSection[] = LANGUAGE_ORDER.flatMap((language) => {
    const languageFiles = sortedDownloadFiles(reconciled.filter((file) => file.language === language));
    if (!languageFiles.length) return [];
    return [{
      id: `${idPrefix}-${language}`,
      title: languageTitle(language),
      subtitle: `${languageFiles.length} کیفیت دانلود مستقیم`,
      badge: language === 'dubbed' ? 'دوبله فارسی' : 'زیرنویس فارسی',
      language,
      files: languageFiles,
    }];
  });

  // Preserve real downloads whose source did not identify an audio/subtitle
  // edition. They are shown under a neutral heading instead of being hidden.
  const plainFiles = sortedDownloadFiles(reconciled.filter((file) => !file.language));
  if (plainFiles.length) {
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

const sortableEpisodeNumber = (value: unknown) => {
  const normalized = String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const match = normalized.match(/\d+/);
  const number = match ? Number(match[0]) : 0;
  return Number.isFinite(number) && number > 0 ? number : Number.POSITIVE_INFINITY;
};

const compareSortableEpisodeNumber = (left: unknown, right: unknown) => {
  const a = sortableEpisodeNumber(left);
  const b = sortableEpisodeNumber(right);
  if (a === b) return 0;
  if (!Number.isFinite(a)) return 1;
  if (!Number.isFinite(b)) return -1;
  return a - b;
};

const compareEpisodeGroupsOldestFirst = (a: DownloadSection, b: DownloadSection) => {
  const seasonDifference = compareSortableEpisodeNumber(a.seasonNumber, b.seasonNumber);
  if (seasonDifference) return seasonDifference;
  const episodeDifference = compareSortableEpisodeNumber(a.episodeNumber, b.episodeNumber);
  if (episodeDifference) return episodeDifference;
  return String(a.title || '').localeCompare(String(b.title || ''), 'fa', { numeric: true });
};

const episodeSectionHasUsableMedia = (group: DownloadSection) =>
  (group.files || []).some((file) => {
    if (!isSafeHttpUrl(file.url) || isPlaceholderUrl(file.url)) return false;
    if (isOperatorFile(file)) return isOperatorPortalUrl(file.url);
    if (downloadModeFor(file) === 'purchase') return false;
    return isDirectMediaUrl(file.url) || isDownloadableMediaUrl(file.url);
  });

const newestEpisodeGroup = (item?: CatalogItem | null) =>
  [...(item?.downloads || [])]
    .filter((group) => isEpisodeSection(group) && episodeSectionHasUsableMedia(group))
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
  // Repair historical false "updates": an old archive gap may have been filled
  // today even though the episode itself was published months ago. Only trust a
  // meaningful timestamp when the label is a real episode addition and the
  // newest upstream episode timestamp is contemporaneous with Aparatchi's first
  // discovery. Metadata/TMDB/sync timestamps never participate in ordering.
  const firstSeenTimestamp = Date.parse(item.firstSeenAt || '') || 0;
  const newestEpisodeSourceTimestamp = (item.downloads || []).reduce((latest, group) => {
    if (!(Number(group.episodeNumber || 0) > 0)) return latest;
    const timestamp = Date.parse(group.sourceUpdatedAt || '') || 0;
    return Math.max(latest, timestamp);
  }, 0);
  const meaningfulTimestamp = Date.parse(item.meaningfulUpdatedAt || '') || 0;
  const hasRealEpisodeLabel = /^قسمت\s+.+\s+اضافه\s+شد$/u.test(String(item.updateLabel || '').trim());
  const credibleSeriesUpdate = Boolean(
    item.type === 'series' &&
    meaningfulTimestamp > 0 &&
    hasRealEpisodeLabel &&
    (firstSeenTimestamp <= 0 || newestEpisodeSourceTimestamp <= 0 || newestEpisodeSourceTimestamp >= firstSeenTimestamp - 6 * 60 * 60 * 1000)
  );
  const value = item.type === 'series'
    ? (credibleSeriesUpdate ? item.meaningfulUpdatedAt : '') || item.firstSeenAt || item.sourceCreatedAt || item.createdAt || ''
    : item.firstSeenAt || item.sourceCreatedAt || item.createdAt || '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const hasCategory = (item: CatalogItem, key: string) =>
  Boolean(item.categoryKeys?.includes(key));

const isIranianItem = (item: CatalogItem) => {
  const titleText = normalizeComparableText(`${item.nameFa || ''} ${item.name || ''}`);
  if (titleText.includes('the westies') || titleText.includes('وستی ها') || titleText.includes('وستی‌ها')) return false;
  const language = String(item.originalLanguage || '').toLowerCase();
  const countryCodes = (item.countryCodes || []).map((value) => String(value).toUpperCase());
  const primaryCountry = countryCodes[0] || '';
  // Explicit production-country metadata is stronger than stale language/ir
  // flags. Language is only a fallback when no country was supplied at all.
  if (primaryCountry) return primaryCountry === 'IR';
  if (language) return language === 'fa';
  return Boolean(item.ir);
};

const hasSpecificCountry = (item: CatalogItem, code: string, originalLanguage: string) => {
  const countryCodes = (item.countryCodes || []).map((value) => String(value).toUpperCase());
  const language = String(item.originalLanguage || '').toLowerCase();
  const primaryCountry = countryCodes[0] || '';
  // Co-production credits are not a nationality shelf. When TMDB provides an
  // original language, it is the strongest identity signal; primary country is
  // only the fallback for old rows with no language metadata.
  if (language) return language === originalLanguage;
  return primaryCountry === code;
};

const isKoreanItem = (item: CatalogItem) =>
  hasSpecificCountry(item, 'KR', 'ko');

const INDIAN_LANGUAGES = new Set(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'ur']);
const isIndianItem = (item: CatalogItem) => {
  const countryCodes = (item.countryCodes || []).map((value) => String(value).toUpperCase());
  const language = String(item.originalLanguage || '').toLowerCase();
  const primaryCountry = countryCodes[0] || '';
  if (primaryCountry) return primaryCountry === 'IN';
  return INDIAN_LANGUAGES.has(language);
};

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

const hasForcedLiveActionIdentity = (item: CatalogItem) => {
  const title = normalizeComparableText([item.nameFa, item.name].join(' '));
  return [
    'عشق احتمالی', 'muhtemel ask', 'muhtemel aşk',
    'خاله نسرین', 'aunt nasrin', 'ترانه های کودکانه خاله نسرین',
  ].some((term) => title.includes(normalizeComparableText(term)));
};

const isAnimeItem = (item: CatalogItem) => {
  if (hasForcedLiveActionIdentity(item)) return false;
  if (Number(item.tmdbValidationVersion || 0) >= 3) {
    return item.isAnimation === true && item.isAnime === true;
  }
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

const isAnimatedItem = (item: CatalogItem) => {
  if (hasForcedLiveActionIdentity(item)) return false;
  if (Number(item.tmdbValidationVersion || 0) >= 3) return item.isAnimation === true;
  return Boolean(
    item.isAnimation ||
    isAnimeItem(item) ||
    item.contentKind === 'animation-movie' ||
    item.contentKind === 'animation-series' ||
    hasCategory(item, 'animation-movies') ||
    hasCategory(item, 'animation-series')
  );
};

const isAnimationItem = (item: CatalogItem) => isAnimatedItem(item) && !isAnimeItem(item);

const mediaKindLabel = (item: CatalogItem) => {
  if (isQuranItem(item)) return 'مجموعه قرآنی';
  if (isReligiousItem(item)) {
    if (item.contentKind === 'religious-program' || item.contentKind === 'quran-program') return 'برنامه مذهبی';
    return item.type === 'movie' ? 'فیلم مذهبی' : 'سریال مذهبی';
  }
  if (isKidsItem(item) && !isAnimatedItem(item)) return 'محتوای کودک';
  if (item.contentKind === 'short-film' || hasCategory(item, 'short-films')) return 'فیلم کوتاه';
  if (isDocumentaryItem(item)) {
    return item.type === 'series' ? 'مستند سریالی' : 'مستند';
  }
  if (isAnimeItem(item)) {
    return item.type === 'movie' ? 'انیمه سینمایی' : 'انیمه سریالی';
  }
  if (isAnimationItem(item)) {
    return item.type === 'movie' ? 'انیمیشن سینمایی' : 'انیمیشن سریالی';
  }
  if (isProgramItem(item)) return 'برنامه و مسابقه';
  return item.type === 'movie' ? 'فیلم سینمایی' : 'سریال';
};

const itemHasUsableContent = (item: CatalogItem) => {
  if (!isSeriesPublished(item)) return false;

  const iranian = isIranianItem(item);
  const hasStream = isSafeHttpUrl(item.streamUrl) && isDirectMediaUrl(item.streamUrl || '');
  if (iranian && hasStream) return true;

  // This runs while a large catalog is admitted into the UI. Avoid allocating a
  // flattened copy of every episode/file: repeating that work across Home and
  // category filters was enough to block Android's JS thread and swallow taps.
  let hasDirect = false;
  for (const section of item.downloads || []) {
    for (const file of section.files || []) {
      if (isOperatorFile(file)) {
        if (isSafeHttpUrl(file.url) && isOperatorPortalUrl(file.url)) return true;
        continue;
      }
      if (!isSafeHttpUrl(file.url) || isPlaceholderUrl(file.url)) continue;
      if (downloadModeFor(file) === 'purchase') continue;
      if (isDirectMediaUrl(file.url) || isDownloadableMediaUrl(file.url)) {
        hasDirect = true;
        return true;
      }
    }
  }

  return hasDirect || hasStream;
};

const visibleLoadedContent = (loaded: LoadedContent): LoadedContent => ({
  ...loaded,
  // Remote/cache catalogs are already validated by the Content job. Rewalking
  // every quality of every episode on the phone is O(all media files) and was
  // the biggest JS-thread spike as the library grew. Keep only the cheap
  // publication gate here; the small bundled fallback still gets the stricter
  // legacy media validation.
  items: (loaded.items || []).filter(
    loaded.source === 'remote' || loaded.source === 'cache'
      ? isSeriesPublished
      : () => true,
  ),
});

// Avoid rebuilding the whole app tree every time the periodic catalog check
// returns the exact same payload. Parsing a large catalog and replacing its
// array reference was enough to make every home row, star card and image list
// render again even when nothing had changed.
const loadedContentRevision = (loaded: LoadedContent) => [
  String(loaded.clientRevision || ''),
  String(loaded.version || ''),
  String(loaded.updatedAt || ''),
  String((loaded.items || []).length),
  String((loaded.iranianSchedule || []).length),
  String((loaded.weeklySchedule || []).length),
  String((loaded.featuredPeople || []).length),
  String(loaded.imdbTop100?.updatedAt || ''),
  String((loaded.imdbTop100?.movies || []).length),
  String((loaded.imdbTop100?.series || []).length),
].join('|');

const catalogTitleText = (item: CatalogItem) => normalizeComparableText([
  item.nameFa,
  item.name,
].join(' '));

const catalogGenreText = (item: CatalogItem) => normalizeComparableText([
  ...(item.genres || []),
].join(' '));

const catalogMetadataText = (item: CatalogItem) => normalizeComparableText([
  item.contentKind || '',
  ...(item.categoryKeys || []),
  ...(item.categoryLabels || []),
].join(' '));

const hasStandaloneTerm = (text: string, terms: string[]) => {
  const padded = ` ${normalizeComparableText(text)} `;
  return terms.some((term) => padded.includes(` ${normalizeComparableText(term)} `));
};

const isReligiousItem = (item: CatalogItem) => {
  const title = catalogTitleText(item);
  const genres = catalogGenreText(item);
  const metadata = catalogMetadataText(item);
  const explicitKind = ['religious-program', 'quran-program', 'religious-movie', 'religious-series'].includes(String(item.contentKind || ''));
  const strongTitle = hasStandaloneTerm(title, [
    'قرآن', 'قرآنی', 'ترتیل', 'تلاوت', 'ادعیه', 'دعا', 'دعای', 'مذهبی',
    'مداحی', 'نوحه', 'زیارت', 'عاشورا', 'کربلا', 'پیامبر', 'نبی', 'امام',
    'quran', 'recitation', 'religious',
  ]);
  const strongGenre = hasStandaloneTerm(genres, ['مذهبی', 'religious']);
  const explicitCategory = Boolean(
    hasCategory(item, 'quran') ||
    (hasCategory(item, 'religious') && (strongTitle || strongGenre)),
  );
  return explicitKind || explicitCategory || strongTitle || strongGenre ||
    hasStandaloneTerm(metadata, ['quran-program', 'religious-program']);
};

const isQuranItem = (item: CatalogItem) => {
  const text = `${catalogTitleText(item)} ${catalogGenreText(item)} ${catalogMetadataText(item)}`;
  return hasCategory(item, 'quran') || hasStandaloneTerm(text, [
    'قرآن', 'قرآنی', 'ترتیل', 'تلاوت', 'quran', 'recitation',
  ]);
};

const isKidsItem = (item: CatalogItem) => {
  if (isAnimatedItem(item)) return false;
  const title = catalogTitleText(item);
  const metadata = catalogMetadataText(item);
  const explicitKind = Number(item.tmdbValidationVersion || 0) >= 7 && item.contentKind === 'children-program';
  const programTitle = hasStandaloneTerm(title, [
    'برنامه کودک', 'برنامه کودکان', 'برنامه کودکانه', 'ترانه کودک', 'ترانه های کودک',
    'ترانه کودکانه', 'سرود کودک', 'قصه کودک', 'خاله نسرین', 'aunt nasrin',
    'songs for kids', 'children s songs', 'childrens songs', 'nursery rhyme', 'nursery rhymes',
    'kids show', 'children s program', 'childrens program', 'preschool show',
  ]);
  // A narrative film merely containing "children/kids" in its title or Family
  // genre is still a film; the Kids shelf is only for actual child programs.
  return Boolean(explicitKind || programTitle || (hasCategory(item, 'kids') && hasStandaloneTerm(metadata, ['children-program'])));
};

const isProgramItem = (item: CatalogItem) => {
  const title = catalogTitleText(item);
  const genres = catalogGenreText(item);
  const metadata = catalogMetadataText(item);
  const trustedKind = Number(item.tmdbValidationVersion || 0) >= 7;
  const explicitKind = Boolean(
    item.isTalkShow ||
    (trustedKind && (
      item.contentKind === 'talk-show' ||
      item.contentKind === 'reality-competition' ||
      item.contentKind === 'program' ||
      item.contentKind === 'children-program'
    )),
  );
  const explicitProgram = hasStandaloneTerm(`${title} ${genres}`, [
    'تاک شو', 'تاک‌شو', 'رئالیتی شو', 'رئالیتی‌شو', 'مسابقه تلویزیونی', 'مسابقه مافیا',
    'talk show', 'reality show', 'reality tv', 'game show', 'talent show', 'competition show',
  ]);
  const explicitCategory = Boolean(
    (hasCategory(item, 'talk-shows') || hasCategory(item, 'programs') || hasCategory(item, 'reality')) &&
    hasStandaloneTerm(metadata, ['talk-show', 'reality-competition', 'programs', 'reality']),
  );
  return explicitKind || explicitProgram || explicitCategory;
};

const isDocumentaryItem = (item: CatalogItem) => {
  const title = catalogTitleText(item);
  const genres = catalogGenreText(item);
  const knownDocumentary = hasStandaloneTerm(title, ['از بی', 'از به', 'az be']);
  const explicitDocumentary = Boolean(
    item.isDocumentary === true ||
    item.contentKind === 'documentary' ||
    hasCategory(item, 'documentaries')
  );
  const narrative = hasStandaloneTerm(genres, [
    'درام', 'ترسناک', 'وحشت', 'هیجان انگیز', 'اکشن', 'کمدی', 'عاشقانه', 'خانوادگی',
    'جنایی', 'ماجراجویی', 'علمی تخیلی', 'فانتزی',
    'drama', 'horror', 'thriller', 'action', 'comedy', 'romance', 'family', 'crime',
    'adventure', 'science fiction', 'sci-fi', 'fantasy',
  ]);
  const trustedNarrative = Number(item.tmdbValidationVersion || 0) >= 7 && narrative;
  if (trustedNarrative) return false;
  if (knownDocumentary || explicitDocumentary) return true;
  if (narrative) return false;
  return item.genres.some((genre) => /مستند|documentary/i.test(genre));
};

const isWildlifeDocumentaryItem = (item: CatalogItem) => {
  if (!isDocumentaryItem(item)) return false;
  if (item.isWildlife === true && Number(item.tmdbValidationVersion || 0) >= 7) return true;
  const text = `${catalogTitleText(item)} ${catalogGenreText(item)} ${String(item.overview || '')}`;
  const strong = hasStandaloneTerm(text, [
    'حیات وحش', 'جانوران وحشی', 'حیوانات وحشی', 'دنیای حیوانات', 'دنیای جانوران',
    'حیات جانوری', 'زیستگاه حیوانات', 'wildlife', 'wild animals', 'animal kingdom',
    'natural history', 'nature documentary', 'marine life', 'ocean life', 'planet earth', 'our planet',
    'leopard', 'leopards', 'cheetah', 'cheetahs', 'lion', 'lions', 'tiger', 'tigers',
    'wolf', 'wolves', 'bear', 'bears', 'shark', 'sharks', 'whale', 'whales', 'dolphin', 'dolphins',
    'elephant', 'elephants', 'gorilla', 'gorillas', 'penguin', 'penguins',
    'bumblebee', 'bumblebees', 'squirrel', 'squirrels', 'rodent', 'rodents',
    'snake', 'snakes', 'crocodile', 'crocodiles', 'alligator', 'alligators',
    'پلنگ', 'یوزپلنگ', 'شیرها', 'ببرها', 'گرگ ها', 'خرس ها', 'کوسه', 'نهنگ', 'دلفین', 'فیل ها', 'گوریل', 'پنگوئن',
    'زنبور', 'زنبورها', 'سنجاب', 'سنجاب ها', 'سنجاب‌ها', 'سمور', 'سمورها', 'موش صحرایی', 'جوندگان',
    'مار', 'مارها', 'تمساح', 'تمساح‌ها', 'کروکودیل', 'کروکودیل‌ها',
  ]);
  if (strong) return true;
  const habitat = hasStandaloneTerm(text, ['طبیعت', 'جنگل', 'اقیانوس', 'دریا', 'ساوانا', 'زیست بوم', 'nature', 'forest', 'ocean', 'sea', 'savanna', 'ecosystem', 'habitat']);
  const animals = hasStandaloneTerm(text, ['حیوان', 'حیوانات', 'جانور', 'جانوران', 'گونه', 'شکارچی', 'animal', 'animals', 'species', 'predator', 'fauna']);
  return habitat && animals;
};

const meaningfulUpdateLabel = (item: CatalogItem) => {
  const label = String(item.updateLabel || '').trim();
  if (!label) return '';
  if (/^(?:سریال|عنوان)\s+جدید$/i.test(label)) return label;
  return /قسمت|فصل|دوبله|زیر\s*نویس|subtitle|dubbed|کیفیت|quality/i.test(label) ? label : '';
};

const isUpdatedEpisodicItem = (item: CatalogItem) => Boolean(
  meaningfulUpdateLabel(item) && (
    item.type === 'series' ||
    item.contentKind === 'anime-series' ||
    item.contentKind === 'animation-series' ||
    hasCategory(item, 'anime-series') ||
    hasCategory(item, 'animation-series')
  )
);

const filterTitle = (filter: SearchFilter) => {
  const countryCode = countryCodeFromFilter(filter);
  if (countryCode) return `آثار ${countryLabel(countryCode)}`;
  const genre = genreFromFilter(filter);
  if (genre) return `آثار ${genre}`;
  const year = yearFromFilter(filter);
  if (year) return `آثار سال ${toPersianDigits(year)}`;

  const titles: Record<string, string> = {
    all: 'همه محتوا', movie: 'همه فیلم‌ها', series: 'همه سریال‌ها',
    dubbed: 'آثار دوبله فارسی', subtitled: 'آثار زیرنویس فارسی',
    latest: 'جدیدترین‌ها', updated: 'به‌روزشده‌ها',
    'iranian-movies': 'فیلم‌های ایرانی', 'foreign-movies': 'فیلم‌های خارجی',
    'iranian-series': 'سریال‌های ایرانی', 'foreign-series': 'سریال‌های خارجی',
    'korean-movies': 'فیلم‌های کره‌ای', 'korean-series': 'سریال‌های کره‌ای', 'indian-movies': 'فیلم‌های هندی', 'indian-series': 'سریال‌های هندی',
    'anime-movies': 'انیمه‌های سینمایی', 'anime-series': 'انیمه‌های سریالی',
    'animation-movies': 'انیمیشن‌های سینمایی', 'animation-series': 'انیمیشن‌های سریالی',
    programs: 'برنامه‌ها و مسابقه‌ها', kids: 'کودکان', religious: 'مذهبی و مناسبتی', documentaries: 'مستندها', 'short-films': 'فیلم کوتاه', wildlife: 'حیات وحش', collections: 'کالکشن‌ها',
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
    case 'movie': return item.type === 'movie' && !isDocumentaryItem(item) && !isProgramItem(item) && !isKidsItem(item);
    case 'series': return item.type === 'series' && !isAnimatedItem(item) && !isDocumentaryItem(item) && !isProgramItem(item) && !isKidsItem(item) && !isReligiousItem(item);
    case 'dubbed':
      return !isIranianItem(item) && itemLanguages(item).includes('dubbed');
    case 'subtitled':
      return !isIranianItem(item) && itemLanguages(item).includes('subtitled');
    case 'updated': return isUpdatedEpisodicItem(item);
    case 'iranian-movies': return item.type === 'movie' && isIranianItem(item) && !isAnimatedItem(item) && !isDocumentaryItem(item);
    case 'foreign-movies': return item.type === 'movie' && !isIranianItem(item) && !isKoreanItem(item) && !isIndianItem(item) && !isAnimatedItem(item) && !isDocumentaryItem(item) && !isProgramItem(item) && !isKidsItem(item);
    case 'iranian-series': return item.type === 'series' && isIranianItem(item) && !isAnimatedItem(item) && !isProgramItem(item) && !isKidsItem(item) && !isReligiousItem(item) && !isDocumentaryItem(item);
    case 'foreign-series': return item.type === 'series' && !isIranianItem(item) && !isKoreanItem(item) && !isAnimatedItem(item) && !isProgramItem(item) && !isKidsItem(item) && !isReligiousItem(item) && !isDocumentaryItem(item);
    case 'korean-movies': return item.type === 'movie' && isKoreanItem(item) && !isAnimatedItem(item) && !isDocumentaryItem(item);
    case 'korean-series': return item.type === 'series' && isKoreanItem(item) && !isAnimatedItem(item) && !isProgramItem(item) && !isKidsItem(item) && !isReligiousItem(item) && !isDocumentaryItem(item);
    case 'indian-movies': return item.type === 'movie' && isIndianItem(item) && !isAnimatedItem(item) && !isDocumentaryItem(item) && !isProgramItem(item) && !isKidsItem(item);
    case 'indian-series': return false;
    case 'anime-movies': return item.type === 'movie' && isAnimeItem(item);
    case 'anime-series': return item.type === 'series' && isAnimeItem(item);
    case 'animation-movies': return item.type === 'movie' && isAnimationItem(item);
    case 'animation-series': return item.type === 'series' && isAnimationItem(item);
    case 'programs': return isProgramItem(item) && !isKidsItem(item) && !isReligiousItem(item);
    case 'kids': return isKidsItem(item);
    case 'religious': return isReligiousItem(item);
    case 'documentaries': return isDocumentaryItem(item) && !isWildlifeDocumentaryItem(item);
    case 'short-films': return item.contentKind === 'short-film' || hasCategory(item, 'short-films');
    case 'wildlife': return isWildlifeDocumentaryItem(item);
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
const catalogListScrollOffsets = new Map<string, number>();
let categoriesScreenScrollOffset = 0;
const SERVER_CATEGORY_FILTERS = new Set<SearchFilter>([
  'iranian-movies', 'foreign-movies', 'iranian-series', 'foreign-series',
  'korean-movies', 'korean-series', 'indian-movies',
  'anime-movies', 'anime-series', 'animation-movies', 'animation-series',
  'programs', 'kids', 'religious', 'documentaries', 'short-films', 'wildlife',
]);
const STRICT_DYNAMIC_CATEGORY_FILTERS = new Set<SearchFilter>([
  'iranian-movies', 'foreign-movies', 'iranian-series', 'foreign-series',
  'korean-movies', 'korean-series', 'indian-movies',
  'anime-movies', 'anime-series', 'animation-movies', 'animation-series',
  'programs', 'kids', 'religious', 'documentaries', 'wildlife', 'collections',
]);

const fastCatalogFilterMatch = (item: CatalogItem, filter: SearchFilter) => {
  if (filter === 'all' || filter === 'latest') return true;
  if (filter === 'movie' || filter === 'series') return matchesCatalogFilter(item, filter);
  if (filter === 'updated') return isUpdatedEpisodicItem(item);
  if (filter === 'mobile-operator') return itemHasOperatorAccess(item);
  if (SERVER_CATEGORY_FILTERS.has(filter) && (item.categoryKeys || []).length) {
    return (item.categoryKeys || []).includes(filter);
  }
  return matchesCatalogFilter(item, filter);
};

const catalogItemsForFilter = (catalog: CatalogItem[], filter: SearchFilter) => {
  let cache = catalogFilterCache.get(catalog);
  if (!cache) {
    cache = new Map<SearchFilter, CatalogItem[]>();
    catalogFilterCache.set(catalog, cache);
  }
  const cached = cache.get(filter);
  if (cached) return cached;

  // The server already writes the catalog newest-first and provides categoryKeys.
  // Keep that order for browse/search instead of sorting the whole archive after
  // every "مشاهده همه" tap. Only the episode-update feed has its own timestamp.
  const filtered = catalog.filter((item) => fastCatalogFilterMatch(item, filter));
  const result = filter === 'updated' ? sortForCatalogFilter(filtered, filter) : filtered;
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

const personWorkKeysFor = (person: CatalogPerson) => {
  const keys: string[] = [];
  if (person.tmdbId) keys.push(`tmdb:${Number(person.tmdbId)}`);
  for (const value of [person.name, person.nameFa, personName(person)]) {
    const normalized = normalizeComparableText(String(value || ''));
    if (normalized) keys.push(`name:${normalized}`);
  }
  return [...new Set(keys)];
};

const personWorksFor = (
  person: CatalogPerson,
  catalog: CatalogItem[],
  peopleWorks: Record<string, PersonWorkRef[]> = {},
) => {
  const refs = [...new Set(personWorkKeysFor(person).flatMap((key) => peopleWorks[key] || []))];
  const needsIdLookup = refs.some((ref) => typeof ref === 'string');
  const catalogById = needsIdLookup
    ? new Map(catalog.map((item) => [String(item.id), item] as const))
    : null;
  const indexed = refs
    .map((ref) => typeof ref === 'number' ? catalog[ref] : catalogById?.get(String(ref)))
    .filter((item): item is CatalogItem => Boolean(item));
  if (indexed.length) return sortForCatalogFilter(indexed, 'latest');

  const identityNames = [person.name, person.nameFa, personName(person)]
    .map((value) => normalizeComparableText(String(value || '')))
    .filter(Boolean);
  const identityNameSet = new Set(identityNames);

  return sortForCatalogFilter(
    catalog.filter((item) => item.people?.some((candidate) => {
      if (candidate.id === person.id) return true;
      if (person.tmdbId && candidate.tmdbId && Number(candidate.tmdbId) === Number(person.tmdbId)) return true;
      const candidateNames = [candidate.name, candidate.nameFa, personName(candidate)]
        .map((value) => normalizeComparableText(String(value || '')))
        .filter(Boolean);
      return candidateNames.some((name) => identityNameSet.has(name));
    })),
    'latest',
  );
};

const peopleWorkItemIdsMatchingQuery = (
  peopleWorks: Record<string, PersonWorkRef[]> | undefined,
  catalog: CatalogItem[],
  normalizedQuery: string,
) => {
  const matched = new Set<string>();
  if (!normalizedQuery || !peopleWorks) return matched;
  for (const [key, refs] of Object.entries(peopleWorks)) {
    if (!key.startsWith('name:')) continue;
    if (!normalizeComparableText(key.slice(5)).includes(normalizedQuery)) continue;
    for (const ref of refs) {
      const id = typeof ref === 'number' ? catalog[ref]?.id : String(ref || '');
      if (id) matched.add(String(id));
    }
  }
  return matched;
};

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
  for (let index = 0; result.length < 80 && (index < iranian.length || index < foreign.length); index += 1) {
    if (foreign[index]) result.push(foreign[index]);
    if (result.length < 80 && iranian[index]) result.push(iranian[index]);
  }
  return result;
};

const PersonAvatar = memo(function PersonAvatar({ person, style }: { person: CatalogPerson; style: any }) {
  const candidates = useMemo(() => personImageCandidates(person.image), [person.image]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [person.id, person.tmdbId, person.image]);

  const initials = personName(person)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const image = candidates[candidateIndex] || '';

  if (!image) {
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
      key={`${person.tmdbId || person.id}:${candidateIndex}:${image}`}
      source={{ uri: image }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      recyclingKey={`person:${person.tmdbId || person.id}:${candidateIndex}`}
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
});

const CatalogArtwork = memo(function CatalogArtwork({
  primary,
  fallback,
  preview,
  localFallback,
  style,
  contentFit = 'cover',
  transition = 160,
  imageKind = 'poster',
}: {
  primary?: string;
  fallback?: string;
  /** Fast lower layer shown while the preferred remote artwork is decoding. */
  preview?: string;
  localFallback?: any;
  style: any;
  contentFit?: 'cover' | 'contain';
  transition?: number;
  imageKind?: 'poster' | 'backdrop';
}) {
  const candidates = useMemo(() => [...new Set([
    ...catalogArtworkCandidates(primary, imageKind),
    ...catalogArtworkCandidates(fallback, imageKind),
  ])], [fallback, imageKind, primary]);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    setStage(0);
  }, [candidates.join('|')]);

  const remoteUrl = candidates[stage] || '';

  const handleRemoteError = () => {
    setStage((current) => current + 1);
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

      {preview && isSafeHttpUrl(preview) ? (
        <Image
          source={{ uri: optimizedImageUrl(preview, imageKind) || preview }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          transition={0}
          recyclingKey={`preview:${preview}`}
        />
      ) : null}

      {remoteUrl ? (
        <Image
          source={{ uri: remoteUrl }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          transition={transition}
          recyclingKey={String(primary || fallback || remoteUrl)}
          onError={handleRemoteError}
        />
      ) : null}
    </View>
  );
});

const warmDetailArtwork = (item: CatalogItem) => {
  const url = catalogArtworkCandidates(
    item.backdrop || item.backdropFallback || item.poster,
    'backdrop',
  )[0];
  if (url) void Image.prefetch(url).catch(() => undefined);
};

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
        <Pressable onPress={onMenu} hitSlop={10} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]} accessibilityLabel="منوی دسته‌بندی">
          <Ionicons name="menu" color={COLORS.text} size={24} />
        </Pressable>
        <Logo />
      </View>
      <View style={styles.headerActions}>
        <Pressable onPress={onNotifications} hitSlop={10} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
          <Ionicons name="notifications-outline" color={COLORS.text} size={20} />
        </Pressable>
        <Pressable onPress={onSearch} hitSlop={10} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
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
        <Pressable onPress={onAction} unstable_pressDelay={0} hitSlop={18} android_ripple={{ color: 'rgba(216,180,90,0.12)', borderless: false }} style={({ pressed }) => [styles.sectionAction, pressed && styles.sectionActionPressed]}>
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
        <View style={styles.heroIdentityRow}>
          <CatalogArtwork
            primary={item.poster}
            fallback={item.posterFallback || item.backdropFallback || item.backdrop}
            localFallback={localArtworkForItem(item)}
            style={styles.heroPoster}
            contentFit="cover"
            transition={0}
            imageKind="poster"
          />
          <View style={styles.heroTextBlock}>
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
              adjustsFontSizeToFit
              minimumFontScale={0.78}
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
            {catalogOverviewFor(item) ? (
              <Text numberOfLines={2} style={styles.heroOverview}>
                {catalogOverviewFor(item)}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable onPress={onOpen} hitSlop={8} style={styles.primaryButton}>
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
  isActive = true,
}: {
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
  isActive?: boolean;
}) {
  const safeItems = useMemo(() => items.slice(0, 5), [items]);
  const loopItems = useMemo(() => {
    if (safeItems.length <= 1) return safeItems;
    return [safeItems[safeItems.length - 1], ...safeItems, safeItems[0]];
  }, [safeItems]);
  const [activeIndex, setActiveIndex] = useState(0);
  const sliderRef = useRef<FlatList<CatalogItem>>(null);
  const physicalIndexRef = useRef(safeItems.length > 1 ? 1 : 0);
  const draggingRef = useRef(false);
  const { width: screenWidth } = useWindowDimensions();
  const sliderWidth = Math.max(1, screenWidth);
  const pauseUntilRef = useRef(0);
  const sliderKey = useMemo(() => safeItems.map((item) => `${item.type}:${item.id}`).join('|'), [safeItems]);

  const jumpToPhysicalIndex = useCallback((index: number, animated: boolean) => {
    physicalIndexRef.current = index;
    sliderRef.current?.scrollToOffset({ offset: index * sliderWidth, animated });
  }, [sliderWidth]);

  useEffect(() => {
    const initialPhysicalIndex = safeItems.length > 1 ? 1 : 0;
    setActiveIndex(0);
    physicalIndexRef.current = initialPhysicalIndex;
    const frame = requestAnimationFrame(() => jumpToPhysicalIndex(initialPhysicalIndex, false));
    return () => cancelAnimationFrame(frame);
  }, [jumpToPhysicalIndex, sliderKey, safeItems.length]);

  useEffect(() => {
    const urls = safeItems
      .slice(0, 3)
      .map((item) => optimizedImageUrl(item.backdrop || item.poster, 'backdrop'))
      .filter((url): url is string => Boolean(isSafeHttpUrl(url)));
    if (urls.length) void Image.prefetch(urls).catch(() => undefined);
  }, [safeItems]);

  const settlePhysicalIndex = useCallback((rawIndex: number) => {
    if (safeItems.length <= 1) {
      physicalIndexRef.current = 0;
      setActiveIndex(0);
      return;
    }

    if (rawIndex <= 0) {
      const lastRealPhysicalIndex = safeItems.length;
      physicalIndexRef.current = lastRealPhysicalIndex;
      setActiveIndex(safeItems.length - 1);
      requestAnimationFrame(() => jumpToPhysicalIndex(lastRealPhysicalIndex, false));
      return;
    }

    if (rawIndex >= safeItems.length + 1) {
      physicalIndexRef.current = 1;
      setActiveIndex(0);
      requestAnimationFrame(() => jumpToPhysicalIndex(1, false));
      return;
    }

    physicalIndexRef.current = rawIndex;
    setActiveIndex(rawIndex - 1);
  }, [jumpToPhysicalIndex, safeItems.length]);

  useEffect(() => {
    if (safeItems.length <= 1) return undefined;
    const timer = setInterval(() => {
      if (!isActive || draggingRef.current || Date.now() < pauseUntilRef.current) return;
      jumpToPhysicalIndex(physicalIndexRef.current + 1, true);
    }, 5200);
    return () => clearInterval(timer);
  }, [isActive, jumpToPhysicalIndex, safeItems.length]);

  if (!safeItems.length) return null;

  return (
    <View style={styles.heroSlider}>
      <FlatList
        ref={sliderRef}
        data={loopItems}
        initialScrollIndex={safeItems.length > 1 ? 1 : 0}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => `${index}:${item.type}:${item.id}`}
        getItemLayout={(_, index) => ({ length: sliderWidth, offset: sliderWidth * index, index })}
        onScrollBeginDrag={() => {
          draggingRef.current = true;
          pauseUntilRef.current = Date.now() + 7000;
        }}
        onScrollEndDrag={() => { draggingRef.current = false; }}
        onMomentumScrollEnd={(event) => {
          draggingRef.current = false;
          const index = Math.round(event.nativeEvent.contentOffset.x / sliderWidth);
          settlePhysicalIndex(index);
        }}
        onScrollToIndexFailed={({ index }) => {
          requestAnimationFrame(() => jumpToPhysicalIndex(index, false));
        }}
        renderItem={({ item }) => (
          <View style={[styles.heroSlide, { width: sliderWidth }]}>
            <HeroSlide item={item} onOpen={() => onOpen(item)} />
          </View>
        )}
        removeClippedSubviews={false}
        windowSize={3}
        initialNumToRender={safeItems.length > 1 ? 3 : 1}
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
                jumpToPhysicalIndex(index + 1, true);
              }}
              hitSlop={8}
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
  const [schedulePage, setSchedulePage] = useState(0);
  const [scheduleCardsWidth, setScheduleCardsWidth] = useState(0);
  const schedulePauseUntilRef = useRef(0);

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

  useEffect(() => {
    let mounted = true;
    setLoadingForeign(true);
    // The catalog schedule is authoritative. TVmaze is only a bounded fallback
    // for foreign series that do not already have a known broadcast day.
    loadVerifiedForeignSchedule(
      catalog,
      [...inferredEntries, ...iranianSchedule, ...weeklySchedule],
    )
      .then((entries) => {
        if (mounted) setForeignEntries(entries);
      })
      .finally(() => {
        if (mounted) setLoadingForeign(false);
      });
    return () => {
      mounted = false;
    };
  }, [catalog, inferredEntries, iranianSchedule, weeklySchedule]);

  const allEntries = useMemo(() => {
    const merged = new Map<string, ScheduleEntry>();

    const addEntry = (entry: ScheduleEntry) => {
      const item = catalogById.get(String(entry.itemId)) || catalogByName.get(normalizeComparableText(entry.nameFa));
      // Weekly schedule must only contain real, currently airing catalog
      // series. Stale static entries and completed shows are ignored.
      if (!item || !isCurrentScheduleSeries(item)) return;

      const normalized: ScheduleEntry = {
        ...entry,
        itemId: String(item.id),
        nameFa: item.nameFa || entry.nameFa,
        poster: item.poster || entry.poster,
        region: isIranianItem(item) ? 'iranian' : 'foreign',
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
  // On normal phones a single wider card is clearer and leaves a protected
  // navigation gutter for the arrows. Wider screens can show two cards.
  const schedulePageSize = scheduleViewportWidth < 430 ? 1 : 2;
  const schedulePageCount = Math.max(1, Math.ceil(dayEntries.length / schedulePageSize));
  const visibleScheduleEntries = dayEntries.slice(
    schedulePage * schedulePageSize,
    schedulePage * schedulePageSize + schedulePageSize,
  );

  useEffect(() => {
    setSchedulePage(0);
  }, [selectedDay, filter, dayEntries.length]);

  useEffect(() => {
    if (schedulePage >= schedulePageCount) {
      setSchedulePage(Math.max(0, schedulePageCount - 1));
    }
  }, [schedulePage, schedulePageCount]);

  const pauseScheduleRotation = useCallback(() => {
    schedulePauseUntilRef.current = Date.now() + 8_000;
  }, []);

  useEffect(() => {
    if (!isActive || schedulePageCount <= 1) return undefined;
    const timer = setInterval(() => {
      if (Date.now() < schedulePauseUntilRef.current) return;
      setSchedulePage((page) => (page + 1) % schedulePageCount);
    }, 5_000);
    return () => clearInterval(timer);
  }, [isActive, schedulePageCount, selectedDay, filter, dayEntries.length]);

  const schedulePagerPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      schedulePageCount > 1 && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: pauseScheduleRotation,
    onPanResponderRelease: (_event, gesture) => {
      pauseScheduleRotation();
      if (Math.abs(gesture.dx) < 42) return;
      setSchedulePage((page) => gesture.dx < 0
        ? Math.min(schedulePageCount - 1, page + 1)
        : Math.max(0, page - 1));
    },
    onPanResponderTerminate: pauseScheduleRotation,
  }), [pauseScheduleRotation, schedulePageCount]);

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
              onPress={() => { pauseScheduleRotation(); setSelectedDay(day.id); }}
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
            onPress={() => { pauseScheduleRotation(); setFilter(id); }}
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
        <>
          <View style={styles.schedulePagerMeta}>
            <Text style={styles.schedulePagerCount}>
              {toPersianDigits(schedulePage + 1)} از {toPersianDigits(schedulePageCount)}
            </Text>
            <Text style={styles.schedulePagerHint}>
              {toPersianDigits(dayEntries.length)} عنوان برای این روز
            </Text>
          </View>
          <View style={styles.schedulePagerRow} {...schedulePagerPanResponder.panHandlers}>
            <Pressable
              accessibilityLabel="عناوین بعدی برنامه هفتگی"
              disabled={schedulePage >= schedulePageCount - 1}
              onPress={() => { pauseScheduleRotation(); setSchedulePage((page) => Math.min(schedulePageCount - 1, page + 1)); }}
              style={({ pressed }) => [
                styles.scheduleArrowButton,
                schedulePage >= schedulePageCount - 1 && styles.scheduleArrowButtonDisabled,
                pressed && schedulePage < schedulePageCount - 1 && styles.scheduleArrowButtonPressed,
              ]}
            >
              <LinearGradient
                colors={['rgba(216,180,90,0.28)', 'rgba(216,180,90,0.06)']}
                style={styles.scheduleArrowGradient}
              >
                <Ionicons name="chevron-back" color={COLORS.gold} size={23} />
              </LinearGradient>
            </Pressable>

            <View
              style={styles.schedulePageCards}
              onLayout={(event) => setScheduleCardsWidth(event.nativeEvent.layout.width)}
            >
              {visibleScheduleEntries.map((entry) => {
                const item = catalogById.get(String(entry.itemId)) || catalogByName.get(normalizeComparableText(entry.nameFa));
                const availableWidth = scheduleCardsWidth > 0
                  ? scheduleCardsWidth
                  : Math.max(190, scheduleViewportWidth - 150);
                const compact = schedulePageSize > 1;
                const cardWidth = visibleScheduleEntries.length > 1
                  ? Math.max(112, (availableWidth - 8) / 2)
                  : Math.max(180, availableWidth);
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
            </View>

            <Pressable
              accessibilityLabel="عناوین قبلی برنامه هفتگی"
              disabled={schedulePage <= 0}
              onPress={() => { pauseScheduleRotation(); setSchedulePage((page) => Math.max(0, page - 1)); }}
              style={({ pressed }) => [
                styles.scheduleArrowButton,
                schedulePage <= 0 && styles.scheduleArrowButtonDisabled,
                pressed && schedulePage > 0 && styles.scheduleArrowButtonPressed,
              ]}
            >
              <LinearGradient
                colors={['rgba(216,180,90,0.28)', 'rgba(216,180,90,0.06)']}
                style={styles.scheduleArrowGradient}
              >
                <Ionicons name="chevron-forward" color={COLORS.gold} size={23} />
              </LinearGradient>
            </Pressable>
          </View>
        </>
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

const PosterCard = memo(function PosterCard({
  item,
  onOpen,
  width = 137,
}: {
  item: CatalogItem;
  onOpen: () => void;
  width?: number;
}) {
  const posterBadges = itemPosterBadges(item);
  // Prefer compact catalog metadata. Sorting every episode group while a poster
  // is being mounted makes taps feel delayed on large series shelves.
  const latestEpisodeMeta = item.latestEpisode || (item.type === 'series' ? newestEpisodeGroup(item) : null);
  // A movie/series title must never be replaced by its collection label.
  const posterNameFa = String(item.nameFa || '').trim() || item.name;

  return (
    <Pressable
      onPress={onOpen}
      onPressIn={() => warmDetailArtwork(item)}
      unstable_pressDelay={0}
      hitSlop={12}
      pressRetentionOffset={{ top: 24, right: 24, bottom: 24, left: 24 }}
      android_ripple={{ color: 'rgba(216,180,90,0.12)', borderless: false }}
      style={({ pressed }) => [styles.posterCard, { width }, pressed && styles.posterCardPressed]}
    >
      <View style={[styles.posterImageWrap, { width, height: Math.round(width * 1.42) }]}>
        <CatalogArtwork
          primary={item.poster}
          fallback={item.posterFallback || item.backdropFallback || item.backdrop}
          localFallback={localArtworkForItem(item)}
          style={styles.posterImage}
          contentFit="cover"
          transition={160}
        />
        <LinearGradient colors={['transparent', 'rgba(7,9,12,0.88)']} style={styles.posterGradient} />
        {posterBadges.length ? (
          <View pointerEvents="none" style={styles.posterAccessStack}>
            {posterBadges.map((badge) => (
              <View
                key={badge.id}
                style={[
                  styles.posterAccess,
                  badge.kind === 'operator' && styles.posterOperatorAccess,
                ]}
              >
                <Text
                  style={[
                    styles.posterAccessText,
                    badge.kind === 'operator' && styles.posterOperatorAccessText,
                  ]}
                >
                  {badge.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {item.type === 'series' && (latestEpisodeMeta || Number(item.episodeCount || 0) > 0) ? (
          <View style={styles.posterEpisodeBadge}>
            <Text style={styles.posterEpisodeText}>
              {Number(item.seasonCount || 0) > 1 && latestEpisodeMeta
                ? `فصل ${toPersianDigits(latestEpisodeMeta.seasonNumber || item.seasonCount || 1)} - قسمت ${toPersianDigits(latestEpisodeMeta.episodeNumber || 0)}`
                : `قسمت ${toPersianDigits(latestEpisodeMeta?.episodeNumber || item.episodeCount || 0)}`}
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
      <Text numberOfLines={1} style={styles.posterName}>{posterNameFa}</Text>
      <Text numberOfLines={1} style={styles.posterEnglish}>{item.name || toPersianDigits(item.year)}</Text>
    </Pressable>
  );
});

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
  const collectionRailRef = useRef<ScrollView>(null);
  const collectionRailPositionedRef = useRef('');
  const collectionRailKey = members.map((member) => String(member.id)).join('|');
  const positionCollectionRail = useCallback(() => {
    if (!collectionRailKey || collectionRailPositionedRef.current === collectionRailKey) return;
    collectionRailPositionedRef.current = collectionRailKey;
    requestAnimationFrame(() => collectionRailRef.current?.scrollToEnd({ animated: false }));
  }, [collectionRailKey]);
  if (members.length < 2) return null;
  const rawCollectionFa = String(item.collectionNameFa || '').trim();
  const rawCollectionEn = String(item.collectionName || '').trim();
  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)
    ? rawCollectionFa
    : `مجموعه ${String(members[0]?.nameFa || item.nameFa || 'فیلم‌ها').trim()}`;
  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn)
    ? rawCollectionEn
    : '';

  return (
    <View style={styles.collectionSection}>
      <View style={styles.collectionHeader}>
        <View style={styles.collectionHeaderIcon}>
          <Ionicons name="film-outline" color={COLORS.gold} size={19} />
        </View>
        <View style={styles.collectionHeaderText}>
          <Text style={styles.collectionEyebrow}>مجموعه فیلم‌ها</Text>
          <Text style={styles.collectionTitle}>{collectionTitleFa}</Text>
          {collectionTitleEn ? (
            <Text style={styles.collectionEnglish}>{collectionTitleEn}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={collectionRailRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.collectionList}
        onContentSizeChange={positionCollectionRail}
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
                  cachePolicy="memory-disk"
                  recyclingKey={`collection:${member.id}:${member.poster}`}
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

const CastPersonCard = memo(function CastPersonCard({
  person,
  onOpen,
}: {
  person: CatalogPerson;
  onOpen: (person: CatalogPerson) => void;
}) {
  return (
    <Pressable onPress={() => onOpen(person)} style={styles.personCard} hitSlop={8}>
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
});

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

  const displayedPeople = useMemo(() => [...people].reverse(), [people]);

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
      <FlatList
        horizontal
        data={displayedPeople}
        keyExtractor={(person) => person.tmdbId
          ? `tmdb:${person.tmdbId}:${person.role}`
          : `person:${normalizeComparableText(personName(person))}:${person.role}`}
        renderItem={({ item: person }) => <CastPersonCard person={person} onOpen={onOpen} />}
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        style={styles.peopleRail}
        contentContainerStyle={styles.peopleList}
        initialScrollIndex={displayedPeople.length - 1}
        getItemLayout={(_data, index) => ({ length: 100, offset: 100 * index, index })}
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={60}
        windowSize={4}
        removeClippedSubviews={false}
      />
    </View>
  );
}

const HorizontalCatalog = memo(function HorizontalCatalog({
  items,
  onOpen,
}: {
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const renderPoster = useCallback(({ item }: { item: CatalogItem }) => (
    <PosterCard item={item} onOpen={() => onOpen(item)} />
  ), [onOpen]);

  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderPoster}
      showsHorizontalScrollIndicator={false}
      style={styles.horizontalCatalogList}
      contentContainerStyle={styles.horizontalCatalog}
      inverted
      getItemLayout={(_data, index) => ({ length: 148, offset: 148 * index, index })}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      updateCellsBatchingPeriod={50}
      windowSize={4}
      removeClippedSubviews={false}
      nestedScrollEnabled
      keyboardShouldPersistTaps="always"
    />
  );
});

const StarPersonButton = memo(function StarPersonButton({
  person,
  active,
  onSelect,
}: {
  person: FeaturedPerson;
  active: boolean;
  onSelect: (personId: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect(person.id)}
      unstable_pressDelay={0}
      style={styles.starPersonCard}
      hitSlop={10}
    >
      <View style={[styles.starPersonAvatarWrap, active && styles.starPersonAvatarActive]}>
        <PersonAvatar person={person} style={styles.starPersonAvatar} />
      </View>
      <Text numberOfLines={1} style={[styles.starPersonName, active && styles.starPersonNameActive]}>
        {personName(person)}
      </Text>
    </Pressable>
  );
});

const StarWorkPosterCard = memo(function StarWorkPosterCard({
  item,
  onOpen,
}: {
  item: CatalogItem;
  onOpen: (item: CatalogItem) => void;
}) {
  return (
    <Pressable onPress={() => onOpen(item)} unstable_pressDelay={0} style={styles.starWorkCard} hitSlop={10}>
      <CatalogArtwork
        primary={item.poster}
        fallback={item.posterFallback || item.backdrop}
        localFallback={localArtworkForItem(item)}
        style={styles.starWorkPoster}
        imageKind="poster"
        transition={160}
      />
      <Text numberOfLines={2} style={styles.starWorkTitle}>{item.nameFa}</Text>
    </Pressable>
  );
});

function HomeStarsSectionBase({
  people,
  catalog,
  onOpen,
}: {
  people: FeaturedPerson[];
  catalog: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [String(item.id), item] as const)),
    [catalog],
  );
  const resolvedPeople = useMemo(() => {
    const merged = new Map<string, FeaturedPerson>();
    const explicitPriority = new Map<string, number>();
    people.forEach((person, index) => {
      const key = person.tmdbId
        ? `tmdb:${person.tmdbId}`
        : `name:${normalizeComparableText(personName(person))}`;
      if (key && !explicitPriority.has(key)) explicitPriority.set(key, index);
    });

    const starCandidates = people.length ? people : deriveFeaturedPeople(catalog);
    for (const person of starCandidates) {
      if (person.role !== 'actor' || !personName(person)) continue;
      const key = person.tmdbId
        ? `tmdb:${person.tmdbId}`
        : `name:${normalizeComparableText(personName(person))}`;
      const explicitIds = new Set(person.itemIds || []);
      const explicitMatches = [...explicitIds].filter((itemId) => catalogById.has(String(itemId)));
      // Only scan the catalog when the server-provided ids are stale/missing.
      // This avoids dozens of full-catalog passes every time the stars shelf mounts.
      const matchedIds = explicitMatches.length
        ? explicitMatches
        : personWorksFor(person, catalog).map((item) => item.id);
      if (!matchedIds.length) continue;
      const current = merged.get(key);
      const nextIds = [...new Set([...(current?.itemIds || []), ...matchedIds])];
      const next: FeaturedPerson = {
        ...(current || person),
        ...person,
        itemIds: nextIds,
        workCount: nextIds.length,
        image: isSafeHttpUrl(person.image) ? person.image : current?.image,
      };
      merged.set(key, next);
    }
    return [...merged.entries()]
      .sort(([aKey, a], [bKey, b]) => {
        const aExplicit = explicitPriority.has(aKey);
        const bExplicit = explicitPriority.has(bKey);
        if (aExplicit !== bExplicit) return aExplicit ? -1 : 1;
        if (aExplicit && bExplicit) return (explicitPriority.get(aKey) || 0) - (explicitPriority.get(bKey) || 0);
        return Number(isSafeHttpUrl(b.image)) - Number(isSafeHttpUrl(a.image)) ||
          Number(b.popularity || 0) - Number(a.popularity || 0) ||
          Number(b.workCount || 0) - Number(a.workCount || 0);
      })
      .map(([, person]) => person)
      .slice(0, 60);
  }, [catalog, catalogById, people]);
  const [selectedId, setSelectedId] = useState('');
  const displayedPeople = useMemo(() => [...resolvedPeople].reverse(), [resolvedPeople]);

  useEffect(() => {
    if (!resolvedPeople.length) return;
    if (!resolvedPeople.some((person) => person.id === selectedId)) setSelectedId(resolvedPeople[0].id);
  }, [resolvedPeople, selectedId]);

  const selected = resolvedPeople.find((person) => person.id === selectedId) || resolvedPeople[0];
  const works = useMemo(() => {
    if (!selected) return [];
    const explicitIds = new Set(selected.itemIds || []);
    const explicitMatched = [...explicitIds]
      .map((itemId) => catalogById.get(String(itemId)))
      .filter((item): item is CatalogItem => Boolean(item));
    const matched = explicitMatched.length ? explicitMatched : personWorksFor(selected, catalog);
    return sortForCatalogFilter(matched, 'latest').slice(0, 18);
  }, [catalog, catalogById, selected]);
  const displayedWorks = useMemo(() => [...works].reverse(), [works]);

  const selectedIdForRender = selected?.id || '';
  const selectPerson = useCallback((personId: string) => {
    setSelectedId((current) => current === personId ? current : personId);
  }, []);


  const renderStarPerson = useCallback(({ item: person }: { item: FeaturedPerson }) => (
    <StarPersonButton
      person={person}
      active={person.id === selectedIdForRender}
      onSelect={selectPerson}
    />
  ), [selectPerson, selectedIdForRender]);
  const renderStarWork = useCallback(({ item }: { item: CatalogItem }) => (
    <StarWorkPosterCard item={item} onOpen={onOpen} />
  ), [onOpen]);

  if (!selected || !works.length) return null;
  const birthday = formatPersonBirthday(selected.birthday);
  const age = personAge(selected);
  const location = selected.nationality || selected.placeOfBirth || '';

  return (
    <LinearGradient
      colors={['rgba(18,27,45,0.98)', 'rgba(35,17,31,0.96)', 'rgba(11,15,24,0.98)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.starsSection}
    >
      <View style={styles.starsHeader}>
        <View style={styles.starsHeaderIcon}>
          <Ionicons name="sparkles-outline" color={COLORS.gold} size={17} />
        </View>
        <View style={styles.starsHeaderText}>
          <Text style={styles.starsTitle}>ستارگان</Text>
          <Text style={styles.starsSubtitle}>بازیگران محبوب ایرانی و خارجی</Text>
        </View>
      </View>

      <FlatList
        horizontal
        style={styles.starPeopleRail}
        data={displayedPeople}
        keyExtractor={(person) => person.tmdbId ? `tmdb:${person.tmdbId}` : person.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.starsPeopleList}
        initialScrollIndex={displayedPeople.length - 1}
        getItemLayout={(_data, index) => ({ length: 66, offset: 66 * index, index })}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={32}
        windowSize={7}
        removeClippedSubviews={false}
        nestedScrollEnabled
        renderItem={renderStarPerson}
      />

      <View style={styles.starDetailsRow}>
        <View style={styles.starMiniProfileCard}>
          <View style={styles.starMiniProfileAvatarWrap}>
            <PersonAvatar person={selected} style={styles.starMiniProfileAvatar} />
          </View>
          <View style={styles.starMiniProfileInfo}>
            <Text numberOfLines={2} style={styles.starMiniProfileName}>{personName(selected)}</Text>
            <View style={styles.starMiniFacts}>
              {birthday ? <Text numberOfLines={1} style={styles.starMiniFactText}>{birthday}</Text> : null}
              {age > 0 ? <Text numberOfLines={1} style={styles.starMiniFactText}>{toPersianDigits(age)} ساله</Text> : null}
              {location ? <Text numberOfLines={2} style={styles.starMiniLocation}>{location}</Text> : null}
            </View>
          </View>
        </View>

        <FlatList
          key={`star-works-${selected.id}`}
          horizontal
          style={styles.starWorksRail}
          data={displayedWorks}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.starWorksList}
          initialScrollIndex={displayedWorks.length - 1}
          getItemLayout={(_data, index) => ({ length: 113, offset: 113 * index, index })}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={35…62580 tokens truncated…rogress: 1,
              status: 'completed' as const,
              responseStatus: result.responseStatus,
              mimeType: result.mimeType,
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

    if (fileMode === 'purchase') {
      Alert.alert('دریافت فایل', 'لینک‌های خرید در آپاراتچی نمایش داده نمی‌شوند.');
      return;
    }

    if (fileMode === 'play') {
      if (!(await internetIsReachable())) {
        Alert.alert(
          'اتصال اینترنت برقرار نیست',
          'برای پخش آنلاین، اینترنت را روشن کنید و دوباره تلاش کنید.',
          [
            { text: 'انصراف', style: 'cancel' },
            { text: 'تلاش دوباره', onPress: () => void startDownloadInsideApp(item, file, episodeGroup) },
          ],
        );
        return;
      }
      const source: PlaybackSource = { id: file.id, url: file.url, quality: cleanQualityLabel(file.quality), rank: resolutionRank(file) };
      setVideoRequest({
        title: `${item.nameFa} — ${cleanQualityLabel(file.quality)}`,
        sources: [source],
        initialSourceId: source.id,
        resumeKey: `${item.id}:main:${file.language || 'direct'}`,
        itemId: item.id,
        artwork: episodeGroup ? episodeGroup.artwork : (item.backdrop || item.poster),
        language: file.language,
      });
      return;
    }

    if (!isDownloadableMediaUrl(file.url)) {
      Alert.alert('دریافت فایل', 'دریافت مستقیم این کیفیت فعلاً در دسترس نیست.');
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
      setDownloadsReturnItem(item);
      setDownloadsReturnTab(activeTabRef.current === 'downloads' ? 'home' : activeTabRef.current);
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
      artwork: episodeGroup ? episodeGroup.artwork : (item.backdrop || item.poster),
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
    setDownloadsReturnItem(item);
    setDownloadsReturnTab(activeTabRef.current === 'downloads' ? 'home' : activeTabRef.current);
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

  // Cold installs render the interactive Home shell immediately. Catalog/cache
  // restoration continues in the background; there is no second full-screen
  // blocker after the native splash.

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'right', 'left']}
      >
        <View
          pointerEvents={activeTab === 'home' ? 'auto' : 'none'}
          style={[styles.tabScene, activeTab !== 'home' && styles.tabSceneHidden]}
        >
          <HomeScreen
            catalog={content.items}
            imdbTop100={content.imdbTop100}
            featuredPeople={content.featuredPeople || []}
            onReloadContent={reloadHomeContent}
            onOpen={openRootDetail}
            onBrowse={openCatalogFilter}
            onMenu={openMainMenu}
            initialScrollOffset={homeScrollOffsetRef.current}
            onScrollOffset={rememberHomeScrollOffset}
            scrollToTopSignal={homeScrollTopSignal}
            isActive={activeTab === 'home'}
            contentResolved={contentResolved}
            contentOffline={contentOffline}
          />
        </View>
        {categoriesMounted || activeTab === 'categories' || (activeTab === 'search' && searchReturnTab === 'categories') ? (
          <View
            pointerEvents={activeTab === 'categories' ? 'auto' : 'none'}
            style={[styles.tabScene, activeTab !== 'categories' && styles.tabSceneHidden]}
          >
            <CategoriesScreen catalog={content.items} peopleWorks={content.peopleWorks} onBrowse={openCatalogFilter} onOpen={openRootDetail} isActive={activeTab === 'categories'} />
          </View>
        ) : null}
        {activeTab === 'search' ? (
          <View style={styles.tabScene}>
            <SearchScreen
              catalog={content.items}
              peopleWorks={content.peopleWorks}
              onOpen={openRootDetail}
              initialFilter={searchFilter}
            />
          </View>
        ) : null}
        {activeTab === 'favorites' ? (
          <View style={styles.tabScene}>
            <FavoritesScreen
              catalog={content.items}
              favorites={favorites}
              watchHistory={watchHistory}
              onOpen={openRootDetail}
              onOpenHistory={openWatchHistoryRecord}
              onRemoveHistory={removeWatchHistory}
              onClearHistory={confirmClearWatchHistory}
            />
          </View>
        ) : null}
        {activeTab === 'downloads' ? (
          <View style={styles.tabScene}>
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
      <View
        style={[
          styles.bottomNavigationSafeArea,
          { paddingBottom: Math.max(appInsets.bottom, 8) },
        ]}
      >
        <BottomNavigation
          active={activeTab}
          onChange={handleBottomTabChange}
        />
      </View>
      {videoRequest ? <View pointerEvents="none" style={styles.playerRouteBackdrop} /> : null}
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
        onCategories={() => handleBottomTabChange('categories')}
        onHome={() => handleBottomTabChange('home')}
      />
      <DetailModal
        item={selectedItem}
        catalog={content.items}
        visible={Boolean(selectedItem)}
        onClose={closeOrBackDetail}
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
        onOpenRelated={openRelatedDetail}
        onOpenPerson={setSelectedPerson}
        onBrowse={openCatalogFilter}
        vpnActive={vpnActive}
        onVpnRetry={() => { void refreshVpnState(false); }}
      />
      <PersonProfileModal
        person={selectedPerson}
        catalog={content.items}
        peopleWorks={content.peopleWorks || {}}
        visible={Boolean(selectedPerson)}
        onClose={() => setSelectedPerson(null)}
        onOpenItem={(nextItem) => {
          setSelectedPerson(null);
          openNestedDetail(nextItem);
        }}
      />
      {videoRequest ? (
        <VideoPlayerModal
          request={videoRequest}
          item={
            selectedItem && selectedItem.id === videoRequest.itemId && selectedItem.detailLoaded === true
              ? selectedItem
              : content.items.find((item) => item.id === videoRequest.itemId) || null
          }
          onClose={() => setVideoRequest(null)}
          onProgress={updateWatchProgress}
          relatedItems={(() => {
            const playerItem =
              selectedItem && selectedItem.id === videoRequest.itemId
                ? selectedItem
                : content.items.find((candidate) => candidate.id === videoRequest.itemId);
            return playerItem?.type === 'movie' ? relatedCatalogItems(playerItem, content.items, 5) : [];
          })()}
          onRecommendationSelect={(nextItem) => playRecommendedMovieInsidePlayer(nextItem)}
          onEpisodeSelect={(group, language) => {
            const item =
              selectedItem && selectedItem.id === videoRequest.itemId && selectedItem.detailLoaded === true
                ? selectedItem
                : content.items.find((candidate) => candidate.id === videoRequest.itemId);
            if (item) void openStreamInsideApp(item, group, language);
          }}
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
      {startupVisible ? <StartupScreen /> : null}
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

const absoluteFillObject = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  tabScene: { flex: 1 },
  tabSceneHidden: { display: 'none' },
  routeTransitionCover: { ...absoluteFillObject, zIndex: 850, elevation: 850, backgroundColor: '#05070A' },
  playerRouteBackdrop: { ...absoluteFillObject, zIndex: 900, elevation: 1000, backgroundColor: '#000' },
  globalMenuButton: { position: 'absolute', top: 10, right: 14, zIndex: 30, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,21,28,0.96)', borderWidth: 1, borderColor: COLORS.border },
  bottomNavigationSafeArea: { backgroundColor: COLORS.background, paddingHorizontal: 10, paddingTop: 6, zIndex: 120, elevation: 30 },
  screen: { flex: 1, backgroundColor: COLORS.background },
  initialLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, backgroundColor: COLORS.background },
  startupProjectionistScene: { width: 340, height: 270, position: 'relative', overflow: 'hidden', borderRadius: 28, backgroundColor: '#090A0D', borderWidth: 1, borderColor: 'rgba(216,180,90,0.22)' },
  startupCurtainLeft: { position: 'absolute', zIndex: 8, left: -22, top: 0, bottom: 0, width: 70, borderTopRightRadius: 42, borderBottomRightRadius: 42, backgroundColor: 'rgba(74,15,22,0.60)', transform: [{ rotate: '2deg' }] },
  startupCurtainRight: { position: 'absolute', zIndex: 8, right: -22, top: 0, bottom: 0, width: 70, borderTopLeftRadius: 42, borderBottomLeftRadius: 42, backgroundColor: 'rgba(74,15,22,0.60)', transform: [{ rotate: '-2deg' }] },
  startupCurtainTop: { position: 'absolute', zIndex: 9, top: -24, left: 0, right: 0, height: 58, borderBottomLeftRadius: 42, borderBottomRightRadius: 42, backgroundColor: 'rgba(68,13,20,0.72)' },
  startupProjectionBeam: { position: 'absolute', zIndex: 2, left: 90, top: 103, width: 205, height: 78, borderRadius: 39, overflow: 'hidden', transform: [{ rotate: '-9deg' }] },
  startupCinemaScreenFrame: { position: 'absolute', zIndex: 4, top: 38, right: 35, width: 190, height: 112, padding: 7, borderRadius: 10, backgroundColor: '#17130E', borderWidth: 1, borderColor: 'rgba(216,180,90,0.44)' },
  startupCinemaScreen: { flex: 1, borderRadius: 5, overflow: 'hidden' },
  startupCinemaScreenGlow: { ...absoluteFillObject, borderRadius: 5, backgroundColor: '#FFF4C8' },
  startupScreenFilmMark: { position: 'absolute', alignSelf: 'center', top: 40, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(52,44,31,0.08)', borderWidth: 1, borderColor: 'rgba(52,44,31,0.12)' },
  startupProjectionFloor: { position: 'absolute', zIndex: 1, left: 0, right: 0, bottom: 0, height: 66, backgroundColor: 'rgba(0,0,0,0.52)', borderTopWidth: 1, borderTopColor: 'rgba(216,180,90,0.10)' },
  startupOperator: { position: 'absolute', zIndex: 6, left: 32, bottom: 37, width: 72, height: 98 },
  startupOperatorHead: { position: 'absolute', top: 0, left: 24, width: 29, height: 31, borderRadius: 15, backgroundColor: '#17191D', borderWidth: 1, borderColor: 'rgba(216,180,90,0.16)' },
  startupOperatorNeck: { position: 'absolute', top: 27, left: 33, width: 12, height: 10, borderRadius: 4, backgroundColor: '#17191D' },
  startupOperatorBody: { position: 'absolute', left: 12, bottom: 0, width: 53, height: 65, borderTopLeftRadius: 21, borderTopRightRadius: 21, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: '#111318', borderWidth: 1, borderColor: 'rgba(216,180,90,0.12)' },
  startupOperatorArm: { position: 'absolute', zIndex: 7, right: -4, top: 44, width: 43, height: 13, borderRadius: 7, backgroundColor: '#17191D', transform: [{ rotate: '-16deg' }] },
  startupProjector: { position: 'absolute', zIndex: 7, left: 82, bottom: 35, width: 95, height: 110 },
  startupProjectorReel: { position: 'absolute', top: 0, width: 50, height: 50, borderRadius: 25, backgroundColor: '#25262A', borderWidth: 3, borderColor: '#A98A48', alignItems: 'center', justifyContent: 'center' },
  startupProjectorReelBack: { left: 0 },
  startupProjectorReelFront: { right: 0 },
  startupReelHole: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#090A0D' },
  startupReelHole0: { top: 7, left: 20 },
  startupReelHole1: { top: 20, right: 7 },
  startupReelHole2: { bottom: 7, left: 20 },
  startupReelHole3: { top: 20, left: 7 },
  startupReelHub: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.gold },
  startupProjectorBody: { position: 'absolute', left: 8, top: 42, width: 78, height: 42, borderRadius: 10, backgroundColor: '#202126', borderWidth: 1, borderColor: 'rgba(216,180,90,0.38)' },
  startupProjectorVent: { position: 'absolute', left: 12, top: 13, width: 26, height: 12, borderTopWidth: 2, borderBottomWidth: 2, borderColor: 'rgba(216,180,90,0.32)' },
  startupProjectorLens: { position: 'absolute', right: -19, top: 10, width: 25, height: 22, borderTopRightRadius: 11, borderBottomRightRadius: 11, backgroundColor: '#34353A', borderWidth: 1, borderColor: 'rgba(216,180,90,0.52)', alignItems: 'center', justifyContent: 'center' },
  startupProjectorLensGlass: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E7C96F', opacity: 0.9 },
  startupProjectorNeck: { position: 'absolute', top: 83, left: 42, width: 10, height: 11, backgroundColor: '#292A2F' },
  startupProjectorStand: { position: 'absolute', top: 92, left: 44, width: 6, height: 16, backgroundColor: '#3A3B40' },
  startupProjectorFoot: { position: 'absolute', bottom: 0, left: 30, width: 34, height: 5, borderRadius: 3, backgroundColor: '#4A4B50' },
  startupCinemaBrand: { ...rtlText, color: '#F4EFE5', fontSize: 29, lineHeight: 38, fontWeight: '900', marginTop: 20, textShadowColor: 'rgba(216,180,90,0.18)', textShadowRadius: 12 },
  startupCinemaTagline: { ...rtlText, width: 320, color: COLORS.gold, fontSize: 10.5, lineHeight: 20, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  startupCinemaFilmStrip: { height: 30, marginTop: 20, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 2, borderBottomWidth: 2, borderColor: 'rgba(216,180,90,0.58)' },
  startupCinemaFilmFrame: { width: 31, height: 19, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(216,180,90,0.48)', backgroundColor: 'rgba(216,180,90,0.07)' },
  startupCinemaLoadingText: { ...rtlText, color: '#8E929B', fontSize: 9.5, marginTop: 10, textAlign: 'center' },
  startupLogoMark: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(212,175,95,0.10)', borderWidth: 1, borderColor: 'rgba(212,175,95,0.32)' },
  startupBrand: { ...rtlText, color: COLORS.text, fontSize: 27, lineHeight: 36, fontWeight: '900', marginTop: 15 },
  startupSpinner: { marginTop: 18 },
  startupOverlay: { ...absoluteFillObject, zIndex: 5000, elevation: 5000, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#05070A' },
  startupProjectorBeam: { position: 'absolute', width: 420, height: 170, borderRadius: 210, opacity: 0.12, backgroundColor: '#E8C875', transform: [{ rotate: '-18deg' }, { translateX: 90 }] },
  startupTagline: { color: COLORS.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 5 },
  startupFilmStrip: { height: 34, marginTop: 28, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 3, borderBottomWidth: 3, borderColor: 'rgba(212,175,95,0.62)' },
  startupFilmFrame: { width: 38, height: 22, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(212,175,95,0.5)', backgroundColor: 'rgba(212,175,95,0.08)' },
  startupLoadingText: { ...rtlText, color: COLORS.muted, fontSize: 10, marginTop: 10 },
  initialLoadingTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 16 },
  initialLoadingText: { ...rtlText, color: COLORS.muted, fontSize: 10, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  initialLoadingTrack: { width: 190, height: 5, marginTop: 15, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.10)' },
  initialLoadingFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.gold },
  refreshIndicator: { position: 'absolute', top: 14, left: 14, width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,19,25,0.94)', borderWidth: 1, borderColor: COLORS.border },
  contentUnavailable: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  homeColdSkeleton: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 120 },
  homeColdSkeletonSection: { marginBottom: 30 },
  homeColdSkeletonHeading: { width: 128, height: 22, borderRadius: 9, backgroundColor: '#151922', alignSelf: 'flex-end', marginBottom: 14 },
  homeColdSkeletonRail: { flexDirection: 'row-reverse', gap: 12 },
  homeColdSkeletonCard: { width: 112, height: 168, borderRadius: 16, backgroundColor: '#11151D', borderWidth: 1, borderColor: '#1D2330' },
  retryButton: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.red },
  retryButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  homeScroll: { flex: 1 },
  homeContent: { paddingBottom: 12 },
  homeListFooter: { height: 28 },
  imdbSection: { marginHorizontal: 18, marginTop: 26, marginBottom: 8, padding: 15, borderRadius: 22, backgroundColor: '#0D1015', borderWidth: 1, borderColor: 'rgba(216,180,90,0.34)' },
  imdbSectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  imdbSectionIcon: { width: 58, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5C518' },
  imdbLogoText: { color: '#111', fontSize: 14, fontWeight: '900', letterSpacing: -0.5 },
  imdbSectionHeaderText: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  imdbSectionEyebrow: { ...rtlText, color: COLORS.red, fontSize: 8, fontWeight: '900' },
  imdbSectionTitle: { ...rtlText, color: COLORS.text, fontSize: 19, lineHeight: 28, fontWeight: '900', marginTop: 2 },
  imdbSectionSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8, lineHeight: 15, marginTop: 3 },
  imdbLoadingState: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 9 },
  imdbLoadingText: { ...rtlText, color: COLORS.muted, fontSize: 10 },
  imdbTabs: { minHeight: 45, marginTop: 14, padding: 4, borderRadius: 13, flexDirection: 'row-reverse', gap: 5, backgroundColor: '#080A0E', borderWidth: 1, borderColor: COLORS.border },
  imdbTab: { flex: 1, borderRadius: 9, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  imdbTabActive: { backgroundColor: '#F5C518' },
  imdbTabText: { color: COLORS.muted, fontSize: 9.5, fontWeight: '900' },
  imdbTabTextActive: { color: '#090B0F' },
  imdbPodiumRow: { marginTop: 14, flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 9 },
  imdbPodiumCard: { minWidth: 0, flex: 1, alignItems: 'center' },
  imdbPosterBlock: { width: '100%', alignItems: 'stretch' },
  imdbPosterBlockCompact: { width: 68, flexShrink: 0 },
  imdbPosterWrap: { width: '100%', aspectRatio: 0.68, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  imdbPosterWrapCompact: { width: 68, height: 98, aspectRatio: undefined, flexShrink: 0 },
  imdbPoster: { width: '100%', height: '100%' },
  imdbPosterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#181C23' },
  imdbRankBadge: { alignSelf: 'flex-end', minWidth: 21, height: 21, paddingHorizontal: 5, marginBottom: 4, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' },
  imdbRankBadgeText: { color: '#111', fontSize: 8, fontWeight: '900' },
  imdbPodiumTitle: { ...rtlText, width: '100%', minHeight: 32, color: COLORS.text, fontSize: 9, lineHeight: 15, fontWeight: '900', textAlign: 'center', marginTop: 7 },
  imdbPodiumEnglish: { width: '100%', minHeight: 22, color: COLORS.muted, fontSize: 6.8, lineHeight: 10.5, textAlign: 'center', marginTop: 2 },
  imdbRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  imdbRatingText: { color: '#F4C84D', fontSize: 9, fontWeight: '900' },
  imdbAvailability: { color: COLORS.muted, fontSize: 7, fontWeight: '800', marginTop: 4 },
  imdbAvailabilityReady: { color: '#65C58A' },
  imdbPreviewList: { marginTop: 12, gap: 6 },
  imdbPreviewRow: { minHeight: 53, paddingHorizontal: 11, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#11151C', borderWidth: 1, borderColor: COLORS.border },
  imdbPreviewRank: { width: 24, color: COLORS.gold, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  imdbPreviewText: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  imdbPreviewTitle: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10.5, fontWeight: '900' },
  imdbPreviewEnglish: { width: '100%', color: '#9197A0', fontSize: 7.2, textAlign: 'right', marginTop: 3 },
  imdbPreviewMeta: { ...rtlText, width: '100%', color: COLORS.muted, fontSize: 7.5, marginTop: 5 },
  imdbFullButton: { minHeight: 47, marginTop: 12, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5C518' },
  imdbFullButtonText: { color: '#090B0F', fontSize: 10, fontWeight: '900' },
  imdbFullScreen: { flex: 1, backgroundColor: COLORS.background },
  imdbFullHeader: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#080A0E' },
  imdbFullHeaderText: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  imdbFullTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900' },
  imdbFullSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8.5, marginTop: 4 },
  imdbFullHeaderLogo: { width: 48, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5C518' },
  imdbFullTabs: { marginHorizontal: 14, marginTop: 12 },
  imdbFullList: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 28, gap: 9 },
  imdbFullRow: { minHeight: 116, padding: 8, borderRadius: 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  imdbFullRowText: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  imdbFullRowTitle: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 12.5, lineHeight: 20, fontWeight: '900' },
  imdbFullRowEnglish: { width: '100%', color: '#969CA5', fontSize: 8, textAlign: 'right', marginTop: 3 },
  imdbFullRowMeta: { ...rtlText, width: '100%', color: COLORS.gold, fontSize: 8.5, marginTop: 6 },
  imdbFullAvailabilityBadge: { minHeight: 25, marginTop: 8, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.border },
  imdbFullAvailabilityBadgeReady: { backgroundColor: 'rgba(101,197,138,0.09)', borderColor: 'rgba(101,197,138,0.32)' },
  imdbFullAvailabilityText: { color: COLORS.muted, fontSize: 7.5, fontWeight: '900' },
  imdbFullAvailabilityTextReady: { color: '#65C58A' },
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
  starsSection: { marginTop: 22, marginBottom: 9, marginHorizontal: 10, paddingTop: 15, paddingBottom: 14, borderWidth: 1, borderRadius: 22, overflow: 'hidden', borderColor: 'rgba(226,188,102,0.44)', shadowColor: '#7C3754', shadowOpacity: 0.28, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 5 },
  starsHeader: { paddingHorizontal: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  starsHeaderIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.09)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.32)' },
  starsHeaderText: { flex: 1, alignItems: 'flex-end' },
  starsTitle: { ...rtlText, color: COLORS.text, fontSize: 17, lineHeight: 23, fontWeight: '900', letterSpacing: -0.4 },
  starsSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8, lineHeight: 13, marginTop: 1 },
  starChooserRow: { marginTop: 11, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  starDetailsRow: { height: 184, marginTop: 8, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  starMiniProfileCard: { width: 104, height: 184, padding: 6, borderRadius: 15, overflow: 'hidden', alignItems: 'stretch', backgroundColor: '#11151C', borderWidth: 1, borderColor: 'rgba(216,180,90,0.32)' },
  starMiniProfileAvatarWrap: { width: '100%', height: 108, borderRadius: 11, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: 'rgba(216,180,90,0.42)' },
  starMiniProfileAvatar: { width: '100%', height: '100%' },
  starMiniProfileInfo: { minWidth: 0, alignItems: 'flex-end', paddingHorizontal: 2, paddingTop: 6 },
  starMiniProfileName: { width: '100%', color: COLORS.text, fontSize: 10.5, lineHeight: 15, fontWeight: '900', textAlign: 'right', writingDirection: 'ltr' },
  starMiniFacts: { width: '100%', marginTop: 5, gap: 2 },
  starMiniFactText: { width: '100%', color: '#D4D7DD', fontSize: 7.3, lineHeight: 11, fontWeight: '800', textAlign: 'right' },
  starMiniLocation: { width: '100%', color: COLORS.gold, fontSize: 7.1, lineHeight: 11, fontWeight: '800', textAlign: 'right' },
  starPeopleRail: { height: 82, flexGrow: 0, marginTop: 10, minWidth: 0 },
  starsPeopleList: { gap: 8, paddingLeft: 14, paddingRight: 14, paddingVertical: 3 },
  starPersonCard: { width: 58, alignItems: 'center' },
  starPersonAvatarWrap: { width: 53, height: 53, borderRadius: 27, padding: 1.5, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong, borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.12)' },
  starPersonAvatarActive: { borderWidth: 2.2, borderColor: COLORS.red, shadowColor: COLORS.red, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  starPersonAvatar: { width: '100%', height: '100%', borderRadius: 25 },
  starPersonName: { width: '100%', minHeight: 21, color: COLORS.muted, fontSize: 7.1, lineHeight: 10, fontWeight: '800', textAlign: 'center', marginTop: 5, writingDirection: 'ltr' },
  starPersonNameActive: { color: COLORS.text },
  starWorksRail: { flex: 1, height: 184, minWidth: 0 },
  starWorksList: { gap: 9, paddingHorizontal: 1, paddingTop: 0, paddingBottom: 1 },
  starWorkCard: { width: 104 },
  starWorkPoster: { width: 104, height: 142, borderRadius: 13, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  starWorkTitle: { ...rtlText, width: '100%', minHeight: 29, marginTop: 6, color: COLORS.text, fontSize: 8.2, lineHeight: 13, fontWeight: '800', textAlign: 'center' },
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
  iconButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  contentStatus: { marginHorizontal: 18, marginTop: 12, marginBottom: 2, minHeight: 55, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  contentStatusTextWrap: { flex: 1, alignItems: 'flex-end', marginLeft: 10 },
  contentStatusTitle: { ...rtlText, color: COLORS.text, fontSize: 10, fontWeight: '900' },
  contentStatusMeta: { ...rtlText, color: COLORS.muted, fontSize: 8, marginTop: 4 },
  heroSlider: { height: 420, position: 'relative', overflow: 'hidden', backgroundColor: COLORS.surface },
  heroSlide: { flex: 1 },
  hero: { flex: 1, overflow: 'hidden', justifyContent: 'flex-end' },
  heroDots: { position: 'absolute', bottom: 13, left: 0, right: 0, zIndex: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.34)' },
  heroDotActive: { width: 23, backgroundColor: COLORS.red },
  heroContent: { paddingHorizontal: 20, paddingBottom: 30, alignItems: 'stretch' },
  heroIdentityRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 13 },
  heroPoster: { width: 105, height: 150, borderRadius: 14, overflow: 'hidden', flexShrink: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', backgroundColor: COLORS.surfaceStrong },
  heroTextBlock: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
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
  schedulePagerMeta: { marginTop: 7, marginBottom: 7, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  schedulePagerCount: { ...rtlText, color: COLORS.gold, fontSize: 9, fontWeight: '900' },
  schedulePagerHint: { ...rtlText, color: COLORS.muted, fontSize: 8.5 },
  schedulePagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  schedulePageCards: { flex: 1, minWidth: 0, overflow: 'hidden', flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'stretch', gap: 8, paddingHorizontal: 1 },
  scheduleArrowButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(216,180,90,0.46)', backgroundColor: '#11151B', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8, elevation: 4, zIndex: 3 },
  scheduleArrowGradient: { width: '100%', height: '100%', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scheduleArrowButtonPressed: { transform: [{ scale: 0.94 }], opacity: 0.88 },
  scheduleArrowButtonDisabled: { opacity: 0.20, elevation: 0 },
  scheduleCard: { minHeight: 72, flexShrink: 1, overflow: 'hidden', flexDirection: 'row-reverse', alignItems: 'center', gap: 9, padding: 7, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
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
  sectionAction: { minWidth: 112, minHeight: 48, paddingHorizontal: 13, borderRadius: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(216,180,90,0.07)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.22)', overflow: 'hidden' },
  sectionActionPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  sectionActionText: { color: COLORS.gold, fontSize: 10.5, fontWeight: '900' },
  collectionSection: { marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 13 },
  collectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  collectionHeaderIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(213,175,86,0.08)', borderWidth: 1, borderColor: 'rgba(213,175,86,0.28)' },
  collectionHeaderText: { flex: 1, alignItems: 'flex-end' },
  collectionEyebrow: { ...rtlText, color: COLORS.gold, fontSize: 8.5, fontWeight: '900', marginBottom: 2 },
  collectionTitle: { ...rtlText, color: COLORS.text, fontSize: 15, fontWeight: '900' },
  collectionEnglish: { color: COLORS.muted, fontSize: 8.5, marginTop: 2, textAlign: 'right' },
  collectionList: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 1, paddingBottom: 3 },
  collectionCard: { width: 112, alignItems: 'center' },
  collectionPosterWrap: { width: 112, height: 159, overflow: 'hidden', borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  collectionPosterCurrent: { borderColor: COLORS.gold, borderWidth: 1.5 },
  collectionPoster: { width: '100%', height: '100%' },
  collectionOrderBadge: { position: 'absolute', top: 7, right: 7, minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.88)', borderWidth: 1, borderColor: 'rgba(213,175,86,0.5)' },
  collectionOrderText: { color: COLORS.gold, fontSize: 10, fontWeight: '900' },
  collectionCurrentBadge: { position: 'absolute', left: 7, right: 7, bottom: 25, minHeight: 23, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(132,18,39,0.92)' },
  collectionCurrentText: { ...rtlText, color: '#fff', fontSize: 7.5, fontWeight: '900', textAlign: 'center' },
  collectionYear: { position: 'absolute', right: 8, bottom: 7, color: '#fff', fontSize: 8.5, fontWeight: '900' },
  collectionMovieName: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10, lineHeight: 16, fontWeight: '800', marginTop: 7, minHeight: 31, textAlign: 'center' },
  horizontalCatalogList: { flexGrow: 0 },
  horizontalCatalog: { gap: 11, paddingHorizontal: 18, paddingTop: 14 },
  posterCard: { width: 137, alignItems: 'center' },
  posterCardPressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  posterImageWrap: { width: 137, height: 194, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: COLORS.surface },
  posterImage: { width: '100%', height: '100%' },
  catalogArtworkContainer: { overflow: 'hidden', backgroundColor: '#141820' },
  catalogArtworkFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#141820' },
  posterGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 65 },
  posterAccessStack: { position: 'absolute', top: 8, right: 8, alignItems: 'flex-end', gap: 4, maxWidth: '88%' },
  posterAccess: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(222,35,66,0.92)' },
  posterAccessText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  posterOperatorAccess: { backgroundColor: 'rgba(0,153,204,0.96)', borderWidth: 1, borderColor: 'rgba(116,231,255,0.96)' },
  posterOperatorAccessText: { color: '#FFFFFF' },
  posterEpisodeBadge: { position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(7,9,12,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  posterEpisodeText: { color: COLORS.text, fontSize: 8, fontWeight: '900' },
  posterRating: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(7,9,12,0.82)' },
  posterRatingText: { color: COLORS.text, fontSize: 9, fontWeight: '800' },
  posterName: { ...rtlText, color: COLORS.text, fontSize: 11, lineHeight: 18, fontWeight: '700', letterSpacing: -0.15, marginTop: 8, width: '100%', textAlign: 'center' },
  posterEnglish: { color: '#777D87', fontSize: 8.5, lineHeight: 14, marginTop: 1, width: '100%', textAlign: 'center' },
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
  searchGridRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 12 },
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
  detailPreparing: { minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  detailPreparingText: { ...rtlText, color: COLORS.muted, fontSize: 9.5, fontWeight: '800' },
  detailActions: { flexDirection: 'row-reverse', gap: 10 },
  watchButton: { height: 50, flex: 1, borderRadius: 14, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.red },
  watchButtonDisabled: { opacity: 0.48 },
  watchButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  detailDownloadAction: { minWidth: 92, height: 50, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row-reverse', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.46)' },
  detailDownloadActionText: { color: COLORS.gold, fontSize: 10.5, fontWeight: '900' },
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
  episodeShowcase: { marginTop: 9 },
  episodeShowcaseHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  episodeShowcaseTitleWrap: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  episodeShowcaseSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 8.5, lineHeight: 16, marginTop: 4 },
  episodeShowcaseSeasons: { flexDirection: 'row-reverse', gap: 7, paddingTop: 12, paddingBottom: 2 },
  episodeShowcaseSeason: { minWidth: 78, minHeight: 37, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  episodeShowcaseSeasonActive: { backgroundColor: 'rgba(216,180,90,0.12)', borderColor: 'rgba(216,180,90,0.62)' },
  episodeShowcaseSeasonText: { color: COLORS.muted, fontSize: 8.5, fontWeight: '900' },
  episodeShowcaseSeasonTextActive: { color: COLORS.gold },
  episodeShowcaseRail: { gap: 10, paddingTop: 13, paddingBottom: 5 },
  episodeShowcaseCard: { width: '100%', minHeight: 132, borderRadius: 16, overflow: 'hidden', flexDirection: 'row-reverse', alignItems: 'stretch', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  episodeShowcaseArtworkWrap: { flex: 1, aspectRatio: 16 / 9, minHeight: 132, overflow: 'hidden', backgroundColor: COLORS.surfaceStrong },
  episodeShowcaseArtwork: { width: '100%', height: '100%' },
  episodeShowcaseArtworkShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3,5,8,0.46)' },
  episodeShowcaseArtworkForeground: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  episodeShowcasePlay: { position: 'absolute', left: '50%', top: '50%', width: 42, height: 42, marginLeft: -21, marginTop: -21, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(222,35,66,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  episodeShowcaseNumber: { ...rtlText, position: 'absolute', right: 12, left: 12, bottom: 11, color: '#fff', fontSize: 11.5, lineHeight: 19, fontWeight: '900', textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  episodeShowcaseCardFooter: { display: 'none' },
  episodeShowcaseCardText: { display: 'none' },
  episodeShowcaseCardTitle: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 9.5, lineHeight: 16, fontWeight: '900' },
  episodeShowcaseDownloadButton: { width: 54, minHeight: 132, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,10,14,0.96)', borderLeftWidth: 1, borderLeftColor: 'rgba(216,180,90,0.28)' },
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
  downloadSheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.70)' },
  downloadSheet: { width: '100%', maxHeight: '86%', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden', backgroundColor: '#0B0E13', borderTopWidth: 1, borderColor: 'rgba(216,180,90,0.36)' },
  downloadSheetHandle: { width: 48, height: 4, marginTop: 9, marginBottom: 5, borderRadius: 3, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.24)' },
  downloadSheetHeader: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  downloadSheetClose: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong },
  downloadSheetHeaderText: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  downloadSheetTitle: { ...rtlText, color: COLORS.text, fontSize: 15, fontWeight: '900' },
  downloadSheetSubtitle: { ...rtlText, width: '100%', color: COLORS.muted, fontSize: 8.5, marginTop: 4 },
  downloadSheetIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,180,90,0.08)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.28)' },
  downloadSheetContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 26 },
  networkAccessCard: { minHeight: 170, marginTop: 8, paddingHorizontal: 24, paddingVertical: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(216,180,90,0.32)' },
  networkAccessTitle: { ...rtlText, color: COLORS.text, fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 11 },
  networkAccessText: { ...rtlText, color: COLORS.muted, fontSize: 10, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  networkRetryButton: { minWidth: 138, height: 42, marginTop: 16, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.red },
  networkRetryButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  noDownloadsCard: { minHeight: 145, marginTop: 8, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  noDownloadsTitle: { ...rtlText, color: COLORS.text, fontSize: 12, fontWeight: '900', marginTop: 9 },
  noDownloadsText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  bottomNavigation: { height: 69, marginBottom: 0, paddingHorizontal: 5, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: 'rgba(16,19,25,0.98)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, elevation: 18 },
  bottomTab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  bottomTabPressed: { opacity: 0.62, transform: [{ scale: 0.97 }] },
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
  qualitySwitchLoading: { ...absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
  qualitySwitchLoadingText: { ...rtlText, color: COLORS.text, fontSize: 11, fontWeight: '800', marginTop: 12 },
  playerQualityOverlay: { ...absoluteFillObject, zIndex: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.64)', paddingHorizontal: 12 },
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
  operatorBrowserLaunchOverlay: { ...absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(3,5,8,0.92)' },
  operatorBrowserLaunchCard: { width: '100%', maxWidth: 390, paddingHorizontal: 24, paddingVertical: 28, borderRadius: 22, alignItems: 'center', backgroundColor: '#0E1218', borderWidth: 1, borderColor: 'rgba(216,180,90,0.34)' },
  operatorBrowserBrandIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14, backgroundColor: 'rgba(216,180,90,0.09)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.3)' },
  operatorBrowserLaunchTitle: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 18 },
  operatorBrowserLaunchText: { ...rtlText, color: COLORS.text, fontSize: 11.5, lineHeight: 21, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  operatorBrowserLaunchHint: { ...rtlText, color: COLORS.muted, fontSize: 9.5, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  operatorBrowserLaunchActions: { marginTop: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
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
  peopleRail: { minHeight: 159 },
  peopleList: { flexDirection: 'row', gap: 12, paddingHorizontal: 1, paddingBottom: 2 },
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
  playerOrientationCover: { ...absoluteFillObject, zIndex: 220, elevation: 220, backgroundColor: '#000' },
  detailCircleButtonPlaceholder: { width: 46, height: 46 },
  videoViewPreparing: { opacity: 0 },
  playerPreparingOverlay: { ...absoluteFillObject, zIndex: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  playerPreparingSpinner: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playerFramePortal: { position: 'absolute', zIndex: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  relatedTitlesSection: { marginTop: 22, marginBottom: 8 },
  relatedTitlesHeader: { minHeight: 36, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, marginBottom: 12, paddingHorizontal: 4 },
  relatedTitlesAccent: { width: 34, height: 2, borderRadius: 2, backgroundColor: COLORS.red },
  relatedTitlesTitle: { ...rtlText, color: COLORS.text, fontSize: 18, fontWeight: '900' },
  relatedTitlesRail: { flexDirection: 'row', gap: 12, paddingHorizontal: 2, paddingBottom: 5 },
  relatedTitleCard: { width: 126, alignItems: 'center' },
  relatedTitlePoster: { width: 126, height: 178, borderRadius: 14, backgroundColor: COLORS.surfaceStrong },
  relatedTitleName: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10.5, fontWeight: '800', textAlign: 'center', marginTop: 7 },
  relatedTitleRate: { position: 'absolute', left: 7, top: 148, height: 24, paddingHorizontal: 7, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(5,7,10,0.86)' },
  relatedTitleRateText: { color: '#fff', fontSize: 8.5, fontWeight: '900' },
  playerOfflineOverlay: { position: 'absolute', zIndex: 95, elevation: 95, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.78)' },
  nextEpisodeOverlay: { position: 'absolute', zIndex: 83, elevation: 83, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  nextEpisodeCard: { width: '100%', maxWidth: 520, minHeight: 112, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: 'rgba(10,12,16,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  nextEpisodeCardLandscape: { maxWidth: 560, minHeight: 108 },
  nextEpisodeClose: { position: 'absolute', top: 8, left: 8, zIndex: 3, width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },
  nextEpisodeArtwork: { width: 132, height: 78, borderRadius: 11, backgroundColor: COLORS.surfaceStrong },
  nextEpisodeBody: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  nextEpisodeEyebrow: { ...rtlText, color: COLORS.gold, fontSize: 9.5, fontWeight: '900', marginBottom: 4 },
  nextEpisodeTitle: { ...rtlText, color: '#fff', fontSize: 12.5, lineHeight: 19, fontWeight: '900', textAlign: 'right' },
  nextEpisodePlayButton: { minWidth: 128, height: 36, marginTop: 8, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.gold },
  nextEpisodePlayText: { ...rtlText, color: '#05070A', fontSize: 11.5, fontWeight: '900' },
  movieEndRecommendations: { position: 'absolute', zIndex: 82, elevation: 82, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  movieEndRecommendationsCard: { width: '100%', maxWidth: 540, padding: 10, borderRadius: 16, backgroundColor: 'rgba(10,12,16,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  movieEndRecommendationsCardLandscape: { maxWidth: 620, padding: 9 },
  movieEndRecommendationsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  movieEndRecommendationsHeaderText: { flex: 1, alignItems: 'flex-end' },
  movieEndRecommendationsTitle: { ...rtlText, color: '#fff', fontSize: 14, fontWeight: '900' },
  movieEndRecommendationsSubtitle: { ...rtlText, color: COLORS.muted, fontSize: 9.5, marginTop: 2 },
  movieEndRecommendationsClose: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },
  movieEndRecommendationsRail: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 1 },
  movieEndRecommendationItem: { width: 72, alignItems: 'center' },
  movieEndRecommendationPoster: { width: 72, height: 98, borderRadius: 10, backgroundColor: COLORS.surfaceStrong },
  movieEndRecommendationName: { ...rtlText, width: '100%', color: '#fff', fontSize: 9, fontWeight: '800', textAlign: 'center', marginTop: 5 },
  playerOfflineCard: { width: '100%', maxWidth: 340, padding: 20, borderRadius: 18, alignItems: 'center', backgroundColor: '#11151C', borderWidth: 1, borderColor: 'rgba(216,180,90,0.36)' },
  playerOfflineTitle: { ...rtlText, color: COLORS.text, fontSize: 17, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  playerOfflineText: { ...rtlText, color: COLORS.muted, fontSize: 10, lineHeight: 18, marginTop: 7, textAlign: 'center' },
  playerOfflineActions: { marginTop: 16, flexDirection: 'row-reverse', gap: 9 },
  playerOfflineRetry: { minWidth: 130, height: 44, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.red },
  playerOfflineRetryText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  playerOfflineCancel: { minWidth: 82, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceStrong, borderWidth: 1, borderColor: COLORS.border },
  playerOfflineCancelText: { color: COLORS.text, fontSize: 10, fontWeight: '800' },
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
  webLoading: { ...absoluteFillObject, top: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.72)' },

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
  collectionFolderCard: { aspectRatio: 0.72, borderRadius: 18, overflow: 'hidden', justifyContent: 'space-between', padding: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  collectionFolderIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,9,12,0.82)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.34)' },
  collectionFolderText: { width: '100%', alignItems: 'center' },
  collectionFolderTitle: { ...rtlText, color: '#fff', textAlign: 'center', fontSize: 13, lineHeight: 20, fontWeight: '900', width: '100%' },
  collectionFolderEnglish: { color: COLORS.muted, textAlign: 'center', fontSize: 8.5, lineHeight: 13, marginTop: 2, width: '100%', writingDirection: 'ltr' },
  collectionFolderCount: { color: COLORS.gold, textAlign: 'center', fontSize: 10, marginTop: 4 },
  collectionMemberHeaderTitle: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  categoryGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-start', marginTop: 16, marginBottom: 24 },
  categoryCard: { minHeight: 176, padding: 13, borderRadius: 18, overflow: 'hidden', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(216,180,90,0.25)' },
  categoryCardPressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  categoryTextShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%' },
  categoryFallbackArt: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  categoryCardIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,10,14,0.78)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.38)' },
  categoryCardTextWrap: { width: '100%', alignItems: 'flex-end', paddingHorizontal: 9, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(5,7,10,0.74)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  categoryCardTitle: { ...rtlText, color: '#FFFFFF', fontSize: 12.5, fontWeight: '900', width: '100%', textShadowColor: 'rgba(0,0,0,0.98)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 7 },
  categoryCardSubtitle: { ...rtlText, color: '#E1E4E8', fontSize: 8.2, lineHeight: 15, marginTop: 4, width: '100%', textShadowColor: 'rgba(0,0,0,0.98)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  dynamicChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 11, marginBottom: 22 },
  dynamicChip: { minHeight: 37, paddingHorizontal: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  dynamicChipPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
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
  playerControlsLayer: { ...absoluteFillObject, zIndex: 12 },
  playerTopGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 78 },
  playerBottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 112 },
  playerOverlayHeader: { position: 'absolute', top: 7, right: 9, left: 9, minHeight: 42, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerOverlayHeaderLandscape: { right: 16, left: 16, minHeight: 48 },
  playerCenterZone: { ...absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
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
  playerTimeSpacer: { flex: 1 },
  playerVersionText: { ...rtlText, minWidth: 0, flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 8.5, textAlign: 'center' },
  playerBottomTools: { marginTop: 6, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  playerControlRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5 },
  playerControlIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  playerControlSpacer: { flex: 1 },
  playerTimeSeparator: { color: 'rgba(255,255,255,0.48)', fontSize: 9 },
  playerSettingsOverlay: { ...absoluteFillObject, zIndex: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.42)' },
  playerSettingsFrameOverlay: { position: 'absolute', zIndex: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.78)' },
  playerEpisodesFrame: { position: 'absolute', zIndex: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.74)' },
  playerEpisodesCard: { width: '100%', overflow: 'hidden', borderRadius: 16, backgroundColor: 'rgba(13,16,21,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  playerEpisodesCardPortrait: { maxWidth: 420, maxHeight: '66%', padding: 12 },
  playerEpisodesCardLandscape: { maxWidth: 900, maxHeight: '76%', padding: 13 },
  playerEpisodesHeader: { minHeight: 42, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  playerEpisodesHeaderText: { minWidth: 0, flex: 1, alignItems: 'flex-end' },
  playerEpisodesTitle: { ...rtlText, width: '100%', color: '#fff', fontSize: 12.5, fontWeight: '900' },
  playerEpisodesSubtitle: { ...rtlText, width: '100%', color: 'rgba(255,255,255,0.58)', fontSize: 7.8, marginTop: 4 },
  playerEpisodesSeasons: { flexDirection: 'row-reverse', gap: 6, paddingTop: 9, paddingBottom: 2 },
  playerEpisodesSeason: { minWidth: 70, minHeight: 32, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  playerEpisodesSeasonActive: { backgroundColor: 'rgba(216,180,90,0.15)', borderColor: 'rgba(216,180,90,0.58)' },
  playerEpisodesSeasonText: { color: 'rgba(255,255,255,0.65)', fontSize: 8, fontWeight: '900' },
  playerEpisodesSeasonTextActive: { color: COLORS.gold },
  playerEpisodesRail: { flexDirection: 'row-reverse', gap: 9, paddingTop: 11, paddingBottom: 2 },
  playerEpisodeCard: { width: 172, padding: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  playerEpisodeCardLandscape: { width: 205 },
  playerEpisodeCardActive: { backgroundColor: 'rgba(216,180,90,0.09)', borderColor: COLORS.gold },
  playerEpisodeArtworkWrap: { width: '100%', aspectRatio: 16 / 9, borderRadius: 9, overflow: 'hidden', backgroundColor: '#05070A' },
  playerEpisodeArtwork: { width: '100%', height: '100%' },
  playerEpisodePlay: { position: 'absolute', left: 8, bottom: 8, width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(222,35,66,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.48)' },
  playerEpisodePlayActive: { backgroundColor: 'rgba(216,180,90,0.94)' },
  playerEpisodeTitle: { ...rtlText, width: '100%', color: '#fff', fontSize: 9.5, fontWeight: '900', marginTop: 7 },
  playerEpisodeMeta: { ...rtlText, width: '100%', color: 'rgba(255,255,255,0.55)', fontSize: 7.2, marginTop: 4 },
  playerSettingsCard: { width: 270, maxWidth: '90%', maxHeight: '84%', padding: 9, borderRadius: 13, backgroundColor: 'rgba(16,19,25,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  playerSettingsCardPortrait: { width: '100%', maxWidth: 320, maxHeight: '56%' },
  playerSettingsCardLandscape: { width: 290, maxWidth: '52%', maxHeight: '82%' },
  playerSettingsHeader: { minHeight: 30, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  playerSettingsTitle: { ...rtlText, color: '#fff', fontSize: 12, fontWeight: '900' },
  playerSettingsRow: { minHeight: 44, marginTop: 7, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  playerSettingsRowExpanded: { borderColor: 'rgba(216,180,90,0.50)', backgroundColor: 'rgba(216,180,90,0.08)' },
  playerSettingsRowPressed: { opacity: 0.84 },
  playerSettingsRowMain: { minWidth: 0, flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  playerSettingsRowTitle: { ...rtlText, color: '#fff', fontSize: 9.2, fontWeight: '900' },
  playerSettingsRowValue: { color: COLORS.gold, fontSize: 8.5, fontWeight: '900', writingDirection: 'ltr' },
  playerSettingsClose: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  playerSettingsLabel: { ...rtlText, color: COLORS.muted, fontSize: 8.5, fontWeight: '800', marginTop: 9, marginBottom: 6 },
  playerSettingsOptions: { marginTop: 10, flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', gap: 7 },
  playerSettingsQualityScroll: { marginTop: 7, flexGrow: 0 },
  playerSettingsQualityList: { gap: 5, paddingBottom: 1 },
  playerSettingsQualityOption: { minHeight: 38, paddingHorizontal: 11, borderRadius: 9, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  playerSettingsQualityOptionActive: { borderColor: 'rgba(216,180,90,0.65)', backgroundColor: 'rgba(216,180,90,0.12)' },
  playerSettingsQualityOptionPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  playerSettingsQualityOptionText: { flex: 1, color: '#D8DBE0', fontSize: 9.5, fontWeight: '800', textAlign: 'right', writingDirection: 'ltr' },
  playerSettingsQualityOptionTextActive: { color: COLORS.gold },
  playerSingleQualityText: { ...rtlText, color: COLORS.muted, fontSize: 9, lineHeight: 17, textAlign: 'center', marginTop: 10, marginBottom: 4 },
  playerSettingChip: { minHeight: 29, minWidth: 52, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  playerSettingChipActive: { backgroundColor: 'rgba(216,180,90,0.14)', borderColor: 'rgba(216,180,90,0.72)' },
  playerSettingChipText: { color: '#D2D5DA', fontSize: 9.5, fontWeight: '800' },
  playerSettingChipTextActive: { color: COLORS.gold },
  playerSettingsEmpty: { ...rtlText, color: COLORS.muted, fontSize: 8.5, lineHeight: 16, textAlign: 'center', marginTop: 9 },
  playerToolButton: { minWidth: 72, minHeight: 42, paddingHorizontal: 10, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(8,10,14,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  playerToolText: { color: '#fff', fontSize: 8.5, fontWeight: '900' },
  playerLockedButton: { position: 'absolute', minHeight: 42, paddingHorizontal: 12, borderRadius: 13, zIndex: 60, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(5,7,10,0.90)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' },
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
  sideMenuItemText: { ...rtlText, flex: 1, color: COLORS.text, fontSize: 10.5, fontWeight: '800' },
  sideMenuChildren: { marginTop: 5, marginRight: 12, gap: 6, borderRightWidth: 1, borderRightColor: 'rgba(216,180,90,0.2)', paddingRight: 10 },
  sideMenuNestedAccordion: { gap: 5 },
  sideMenuNestedHeader: { backgroundColor: '#0F131A' },
  sideMenuGrandchildren: { marginRight: 10, gap: 5 },
  sideMenuLeaf: { minHeight: 46, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, backgroundColor: 'rgba(17,21,28,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sideMenuLeafDeep: { minHeight: 42, backgroundColor: 'rgba(8,10,14,0.72)' },
  sideMenuLeafDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gold },
  sideMenuLeafText: { ...rtlText, flex: 1, color: '#E6E8EC', fontSize: 9.5, fontWeight: '800' },


});
