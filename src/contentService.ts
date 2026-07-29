import { CATALOG, VERIFIED_IRANIAN_SCHEDULE } from './data';
import { REMOTE_CONTENT_URL } from './config';
import {
  CatalogItem,
  CatalogPayload,
  DayId,
  DownloadFile,
  DownloadSection,
  LatestEpisode,
  MediaLanguage,
  OperatorAccessKind,
  ScheduleEntry,
} from './types';

export type LoadedContent = CatalogPayload & {
  source: 'remote' | 'local';
};

const LOCAL_PAYLOAD: CatalogPayload = {
  version: '0.2.0-local',
  updatedAt: '۱۴۰۵/۰۵/۰۵',
  items: CATALOG,
  iranianSchedule: VERIFIED_IRANIAN_SCHEDULE,
  weeklySchedule: [],
};

const DAY_IDS: DayId[] = [
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
];

const LANGUAGE_ORDER: MediaLanguage[] = ['dubbed', 'subtitled'];

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : fallback;

const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const asBoolean = (value: unknown) =>
  value === true || value === 1 || value === '1' || value === 'true';

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map((entry) => asString(entry)).filter(Boolean))]
    : [];

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

const normalizeCountryCode = (value: unknown) => {
  const code = asString(value).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : '';
};

const countryObjectValues = (value: unknown) => {
  if (!Array.isArray(value)) return [] as Record<string, unknown>[];
  return value.filter(
    (entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'),
  );
};

const normalizeCountryMetadata = (item: Record<string, unknown>) => {
  const objectCountries = countryObjectValues(
    item.countries ?? item.productionCountries ?? item.production_countries,
  );

  const countryCodes = [
    ...stringArray(item.countryCodes ?? item.country_codes),
    ...objectCountries.map((country) =>
      asString(country.code ?? country.iso_3166_1 ?? country.country_code),
    ),
  ]
    .map(normalizeCountryCode)
    .filter(Boolean);

  const countryLabels = [
    ...stringArray(item.countryLabels ?? item.country_labels),
    ...objectCountries.map((country) =>
      asString(country.nameFa ?? country.name_fa ?? country.titleFa ?? country.title_fa),
    ),
  ].filter(Boolean);

  const countryNames = [
    ...stringArray(item.countryNames ?? item.country_names),
    ...objectCountries.map((country) => asString(country.name ?? country.title)),
  ].filter(Boolean);

  const uniqueCodes = [...new Set(countryCodes)];
  const uniqueLabels = [...new Set([
    ...countryLabels,
    ...uniqueCodes.map((code) => COUNTRY_LABELS_FA[code]).filter(Boolean),
  ])];

  return {
    countryCodes: uniqueCodes,
    countryLabels: uniqueLabels,
    countryNames: [...new Set(countryNames)],
  };
};

const itemTimestamp = (item: CatalogItem) => {
  const value =
    item.updatedAt ||
    item.sourceUpdatedAt ||
    item.createdAt ||
    item.sourceCreatedAt ||
    '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const newestFirst = (items: CatalogItem[]) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const dateDifference = itemTimestamp(b.item) - itemTimestamp(a.item);
      return dateDifference || a.index - b.index;
    })
    .map(({ item }) => item);

const isMp4Url = (url: string) => /\.mp4(?:$|[?#])/i.test(url);
const isPlayableUrl = (url: string) => /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url);

const isOperatorMode = (mode?: DownloadFile['mode']) =>
  mode === 'operator-play' || mode === 'operator-download';

const isOperatorPortalUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const trustedHost = /(^|\.)upera\.tv$/i.test(parsed.hostname);
    const trustedPath = /^\/(?:stream|download)\/(?:movie|series|episode)\//i.test(parsed.pathname);
    return trustedHost && trustedPath;
  } catch {
    return false;
  }
};

const operatorAccessFromFiles = (files: DownloadFile[]): OperatorAccessKind | null => {
  const hasStream = files.some((file) => file.mode === 'operator-play');
  const hasDownload = files.some((file) => file.mode === 'operator-download');
  if (hasStream && hasDownload) return 'both';
  if (hasStream) return 'stream';
  if (hasDownload) return 'download';
  return null;
};

const detectMediaLanguage = (...values: unknown[]): MediaLanguage | null => {
  const text = values.map((value) => asString(value)).filter(Boolean).join(' ');
  if (!text) return null;

  if (
    /زیر\s*نویس|subtitle|subbed|soft\s*sub|hard\s*sub|\bsub\b|\.vtt\b|\.srt\b/i.test(text)
  ) {
    return 'subtitled';
  }

  if (
    /دوبله|dubbed|\bdub\b|persian\s*audio|farsi\s*audio|دو\s*زبانه|dual\s*audio|فارسی|persian|farsi/i.test(text)
  ) {
    return 'dubbed';
  }

  return null;
};

const languageTitle = (language: MediaLanguage) =>
  language === 'dubbed' ? 'دوبله فارسی' : 'زیرنویس فارسی';

const qualityRank = (file: DownloadFile) => {
  const text = `${file.quality} ${file.label || ''}`;
  const match = text.match(/(2160|1440|1080|720|480|360)/i);
  let rank = match ? Number(match[1]) : 0;

  if (/hq\s*1080/i.test(text)) rank = 1180;
  if (/blu[\s._-]*ray|bluray/i.test(text)) rank += 100000;
  if (/remux/i.test(text)) rank += 110000;

  return rank;
};

const sortFiles = (files: DownloadFile[]) =>
  [...files].sort((a, b) => {
    const languageDifference =
      LANGUAGE_ORDER.indexOf(a.language || 'subtitled') -
      LANGUAGE_ORDER.indexOf(b.language || 'subtitled');
    if (languageDifference) return languageDifference;

    const qualityDifference = qualityRank(a) - qualityRank(b);
    if (qualityDifference) return qualityDifference;

    return a.quality.localeCompare(b.quality, 'fa');
  });

const uniqueFiles = (files: DownloadFile[]) => {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.mode || 'download'}:${file.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeDownloadFile = (
  value: unknown,
  index: number,
  sectionContext: string,
): DownloadFile | null => {
  if (!value || typeof value !== 'object') return null;
  const file = value as Record<string, unknown>;
  const url = asString(file.url ?? file.link);
  if (!/^https?:\/\//i.test(url)) return null;

  const requestedMode = asString(file.mode).toLowerCase();
  const explicitOperator = asBoolean(file.operatorOnly) || requestedMode.startsWith('operator-');
  const inferredOperatorMode = /download|دریافت|دانلود/i.test(
    [requestedMode, file.quality, file.label, sectionContext, url].map((entry) => asString(entry)).join(' '),
  )
    ? 'operator-download'
    : 'operator-play';
  const mode: DownloadFile['mode'] = explicitOperator
    ? (requestedMode === 'operator-download' || requestedMode === 'operator-play'
        ? requestedMode
        : inferredOperatorMode)
    : requestedMode === 'play'
      ? 'play'
      : 'download';

  if (isOperatorMode(mode)) {
    if (!isOperatorPortalUrl(url)) return null;
  } else if (mode === 'play' ? !isPlayableUrl(url) : !isMp4Url(url)) {
    return null;
  }

  const quality = asString(
    file.quality,
    isOperatorMode(mode)
      ? mode === 'operator-play' ? 'پخش آنلاین' : 'دریافت'
      : asString(file.label, 'کیفیت اصلی'),
  );
  const label = asString(file.label);
  const language = detectMediaLanguage(sectionContext, quality, label, url);
  const supportedOperators = stringArray(file.supportedOperators);

  return {
    id: asString(file.id, `file-${index}`),
    quality,
    ...(label ? { label } : {}),
    ...(asString(file.size) ? { size: asString(file.size) } : {}),
    url,
    ...(language ? { language } : {}),
    mode,
    ...(isOperatorMode(mode) ? { operatorOnly: true } : {}),
    ...(supportedOperators.length ? { supportedOperators } : {}),
  };
};

const normalizeDownloadSection = (value: unknown, index: number): DownloadSection | null => {
  if (!value || typeof value !== 'object') return null;
  const section = value as Record<string, unknown>;
  const rawTitle = asString(section.title);
  const rawSubtitle = asString(section.subtitle);
  const rawBadge = asString(section.badge);
  const sectionContext = [rawTitle, rawSubtitle, rawBadge].filter(Boolean).join(' ');

  const files = Array.isArray(section.files)
    ? section.files
        .map((file, fileIndex) => normalizeDownloadFile(file, fileIndex, sectionContext))
        .filter((file): file is DownloadFile => Boolean(file))
    : [];

  if (!files.length) return null;

  const seasonNumber = asNumber(section.seasonNumber ?? section.season_number, 0);
  const episodeNumber = asNumber(section.episodeNumber ?? section.episode_number, 0);
  const language = detectMediaLanguage(sectionContext);

  return {
    id: asString(section.id, `section-${index}`),
    title: rawTitle ||
      (episodeNumber > 0
        ? `فصل ${seasonNumber || 1} • قسمت ${episodeNumber}`
        : 'لینک‌های دریافت'),
    ...(rawSubtitle ? { subtitle: rawSubtitle } : {}),
    ...(rawBadge ? { badge: rawBadge } : {}),
    files,
    ...(language ? { language } : {}),
    ...(asString(section.sourceEpisodeId)
      ? { sourceEpisodeId: asString(section.sourceEpisodeId) }
      : {}),
    ...(seasonNumber > 0 ? { seasonNumber } : {}),
    ...(episodeNumber > 0 ? { episodeNumber } : {}),
    ...(asString(section.sourceUpdatedAt)
      ? { sourceUpdatedAt: asString(section.sourceUpdatedAt) }
      : {}),
  };
};

const normalizeDownloads = (value: unknown, iranian: boolean): DownloadSection[] => {
  const rawSections = Array.isArray(value)
    ? value
        .map((section, index) => normalizeDownloadSection(section, index))
        .filter((section): section is DownloadSection => Boolean(section))
    : [];

  if (!rawSections.length) return [];

  const knownLanguages = new Set<MediaLanguage>();
  for (const section of rawSections) {
    if (section.language) knownLanguages.add(section.language);
    for (const file of section.files) {
      if (!isOperatorMode(file.mode) && file.language) knownLanguages.add(file.language);
    }
  }

  const onlyKnownLanguage = knownLanguages.size === 1
    ? [...knownLanguages][0]
    : null;

  const inferredSections = rawSections.map((section) => {
    const languagesInsideSection = new Set(
      section.files
        .filter((file) => !isOperatorMode(file.mode))
        .map((file) => file.language)
        .filter((language): language is MediaLanguage => Boolean(language)),
    );
    const singleLanguageInsideSection = languagesInsideSection.size === 1
      ? [...languagesInsideSection][0]
      : null;

    const fallbackLanguage =
      section.language ||
      singleLanguageInsideSection ||
      onlyKnownLanguage ||
      (iranian ? 'dubbed' : 'subtitled');

    return {
      ...section,
      files: sortFiles(
        uniqueFiles(
          section.files.map((file) => isOperatorMode(file.mode)
            ? file
            : {
                ...file,
                language: file.language || fallbackLanguage,
              }),
        ),
      ),
    };
  });

  const episodeSections = inferredSections
    .filter((section) => (section.episodeNumber || 0) > 0)
    .map((section) => ({
      ...section,
      title: `فصل ${section.seasonNumber || 1} • قسمت ${section.episodeNumber || 0}`,
    }));

  const standaloneFiles = inferredSections
    .filter((section) => (section.episodeNumber || 0) === 0)
    .flatMap((section) => section.files);

  const directStandaloneFiles = standaloneFiles.filter((file) => !isOperatorMode(file.mode));
  const operatorStandaloneFiles = uniqueFiles(
    standaloneFiles.filter((file) => isOperatorMode(file.mode)),
  );

  const languageSections = LANGUAGE_ORDER.flatMap((language) => {
    const files = sortFiles(
      uniqueFiles(directStandaloneFiles.filter((file) => file.language === language)),
    );
    if (!files.length) return [];

    return [{
      id: `language-${language}`,
      title: languageTitle(language),
      subtitle: `${files.filter((file) => file.mode !== 'play').length} کیفیت دانلود مستقیم`,
      badge: language === 'dubbed' ? 'دوبله' : 'زیرنویس',
      language,
      files,
    } satisfies DownloadSection];
  });

  const operatorSections = operatorStandaloneFiles.length
    ? [{
        id: 'operator-mobile-access',
        title: 'ویژه اینترنت همراه',
        subtitle: 'تماشا یا دریافت با اینترنت سیم‌کارت',
        badge: 'همراه',
        files: operatorStandaloneFiles,
      } satisfies DownloadSection]
    : [];

  return [...episodeSections, ...languageSections, ...operatorSections];
};

const compareEpisodeSections = (a: DownloadSection, b: DownloadSection) => {
  const seasonDifference = (b.seasonNumber || 0) - (a.seasonNumber || 0);
  if (seasonDifference) return seasonDifference;
  return (b.episodeNumber || 0) - (a.episodeNumber || 0);
};

const latestEpisodeFromSections = (sections: DownloadSection[]): LatestEpisode | null => {
  const latest = sections
    .filter((section) => (section.episodeNumber || 0) > 0)
    .sort(compareEpisodeSections)[0];

  if (!latest) return null;
  return {
    id: latest.sourceEpisodeId || latest.id,
    seasonNumber: latest.seasonNumber || 1,
    episodeNumber: latest.episodeNumber || 0,
    title: latest.title,
  };
};

const normalizeLatestEpisode = (
  value: unknown,
  sections: DownloadSection[],
): LatestEpisode | null => {
  if (value && typeof value === 'object') {
    const episode = value as Record<string, unknown>;
    const episodeNumber = asNumber(episode.episodeNumber ?? episode.episode_number, 0);
    if (episodeNumber > 0) {
      return {
        id: asString(episode.id, `episode-${episodeNumber}`),
        seasonNumber: asNumber(episode.seasonNumber ?? episode.season_number, 1),
        episodeNumber,
        ...(asString(episode.title) ? { title: asString(episode.title) } : {}),
      };
    }
  }

  return latestEpisodeFromSections(sections);
};

const normalizeCatalogItem = (value: unknown): CatalogItem | null => {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = asString(item.id ?? item.t_id);
  const type = item.type === 'series' || item.type === 'movie' ? item.type : null;
  const nameFa = asString(item.nameFa ?? item.name_fa ?? item.name);
  const name = asString(item.name ?? item.nameFa ?? item.name_fa, nameFa);
  const poster = asString(item.poster);
  const backdrop = asString(item.backdrop, poster);
  const iranian = asBoolean(item.ir);
  const countryMetadata = normalizeCountryMetadata(item);
  if (iranian && !countryMetadata.countryCodes.includes('IR')) {
    countryMetadata.countryCodes.unshift('IR');
  }
  if (iranian && !countryMetadata.countryLabels.includes('ایران')) {
    countryMetadata.countryLabels.unshift('ایران');
  }

  if (!id || !type || !nameFa || !poster) return null;

  const downloads = normalizeDownloads(item.downloads, iranian);
  const episodeSections = downloads.filter((section) => (section.episodeNumber || 0) > 0);
  const seasonNumbers = new Set(
    episodeSections.map((section) => section.seasonNumber || 1),
  );
  const latestEpisode = normalizeLatestEpisode(item.latestEpisode, episodeSections);
  const operatorFiles = downloads.flatMap((section) =>
    section.files.filter((file) => isOperatorMode(file.mode)),
  );
  const directFiles = downloads.flatMap((section) =>
    section.files.filter((file) => !isOperatorMode(file.mode)),
  );
  const derivedOperatorAccess = operatorAccessFromFiles(operatorFiles);
  const rawOperatorAccess = asString(item.operatorAccess);
  const operatorAccess: OperatorAccessKind | null =
    rawOperatorAccess === 'stream' || rawOperatorAccess === 'download' || rawOperatorAccess === 'both'
      ? rawOperatorAccess
      : derivedOperatorAccess;
  const rawAccess = asString(item.access);
  const rate = asNumber(item.rate, Number.NaN);
  const collectionId = asString(item.collectionId ?? item.collection_id);
  const collectionNameFa = asString(
    item.collectionNameFa ?? item.collection_name_fa ?? item.collectionName ?? item.collection_name,
  );
  const collectionName = asString(
    item.collectionName ?? item.collection_name ?? item.collectionNameFa ?? item.collection_name_fa,
    collectionNameFa,
  );
  const collectionOrder = asNumber(
    item.collectionOrder ?? item.collection_order ?? item.collectionPart ?? item.collection_part,
    0,
  );
  const rawStreamUrl = asString(item.streamUrl);
  const streamUrl = rawStreamUrl && isPlayableUrl(rawStreamUrl) ? rawStreamUrl : '';
  const operatorOnly = asBoolean(item.operatorOnly) || Boolean(
    operatorFiles.length && !directFiles.length && !streamUrl,
  );
  const access = rawAccess === 'paid'
    ? 'paid'
    : rawAccess === 'operator' || operatorOnly
      ? 'operator'
      : 'free';
  const availableLanguages = LANGUAGE_ORDER.filter((language) =>
    downloads.some((section) =>
      section.files.some((file) => !isOperatorMode(file.mode) && file.mode !== 'play' && file.language === language),
    ),
  );
  const supportedOperators = [
    ...new Set([
      ...stringArray(item.supportedOperators),
      ...operatorFiles.flatMap((file) => file.supportedOperators || []),
    ]),
  ];
  const categoryKeys = stringArray(item.categoryKeys);
  if (operatorFiles.length && !categoryKeys.includes('mobile-operator')) {
    categoryKeys.push('mobile-operator');
  }

  return {
    id,
    slug: asString(item.slug, `${type}-${id}`),
    type,
    ir: iranian,
    year: asNumber(item.year, new Date().getUTCFullYear()),
    nameFa,
    name,
    ...(asString(item.imdb) ? { imdb: asString(item.imdb) } : {}),
    ...(countryMetadata.countryCodes.length
      ? { countryCodes: countryMetadata.countryCodes }
      : {}),
    ...(countryMetadata.countryLabels.length
      ? { countryLabels: countryMetadata.countryLabels }
      : {}),
    ...(countryMetadata.countryNames.length
      ? { countryNames: countryMetadata.countryNames }
      : {}),
    ...(collectionId ? { collectionId } : {}),
    ...(collectionNameFa ? { collectionNameFa } : {}),
    ...(collectionName ? { collectionName } : {}),
    ...(collectionOrder > 0 ? { collectionOrder } : {}),
    poster,
    backdrop,
    overview: asString(item.overview, 'توضیحی ثبت نشده است.'),
    genres: stringArray(item.genres),
    ...(Number.isFinite(rate) ? { rate } : {}),
    access,
    ...(operatorOnly ? { operatorOnly: true } : {}),
    ...(operatorAccess ? { operatorAccess } : {}),
    ...(supportedOperators.length ? { supportedOperators } : {}),
    ...(streamUrl ? { streamUrl, streamMode: 'video' as const } : {}),
    ...(downloads.length ? { downloads } : {}),
    ...(availableLanguages.length ? { availableLanguages } : {}),
    ...(type === 'series'
      ? {
          episodeCount: asNumber(item.episodeCount, episodeSections.length),
          seasonCount: asNumber(item.seasonCount, seasonNumbers.size),
          latestEpisode,
        }
      : {}),
    ...(asString(item.updateLabel) ? { updateLabel: asString(item.updateLabel) } : {}),
    categoryKeys,
    categoryLabels: stringArray(item.categoryLabels),
    ...(asString(item.contentKind) ? { contentKind: asString(item.contentKind) } : {}),
    isAnimation: asBoolean(item.isAnimation),
    isTalkShow: asBoolean(item.isTalkShow),
    isDocumentary: asBoolean(item.isDocumentary),
    ...(asString(item.createdAt) ? { createdAt: asString(item.createdAt) } : {}),
    ...(asString(item.updatedAt) ? { updatedAt: asString(item.updatedAt) } : {}),
    ...(asString(item.sourceCreatedAt) ? { sourceCreatedAt: asString(item.sourceCreatedAt) } : {}),
    ...(asString(item.sourceUpdatedAt) ? { sourceUpdatedAt: asString(item.sourceUpdatedAt) } : {}),
  };
};

const normalizeScheduleEntry = (value: unknown, index: number): ScheduleEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const day = asString(entry.day) as DayId;
  const itemId = asString(entry.itemId ?? entry.item_id);
  if (!itemId || !DAY_IDS.includes(day)) return null;

  const region = entry.region === 'foreign' ? 'foreign' : 'iranian';
  const episode = asNumber(entry.episode, 0);

  return {
    id: asString(entry.id, `schedule-${itemId}-${day}-${index}`),
    itemId,
    nameFa: asString(entry.nameFa ?? entry.name_fa),
    poster: asString(entry.poster),
    day,
    time: asString(entry.time, '—'),
    ...(episode > 0 ? { episode } : {}),
    region,
    ...(asString(entry.sourceLabel) ? { sourceLabel: asString(entry.sourceLabel) } : {}),
    ...(asString(entry.verifiedAt) ? { verifiedAt: asString(entry.verifiedAt) } : {}),
  };
};

const normalizeSchedule = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry, index) => normalizeScheduleEntry(entry, index))
        .filter((entry): entry is ScheduleEntry => Boolean(entry))
    : [];

const parsePayload = (value: unknown): CatalogPayload | null => {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.items)) return null;

  const items = payload.items
    .map(normalizeCatalogItem)
    .filter((item): item is CatalogItem => Boolean(item));
  if (!items.length) return null;

  return {
    version: asString(payload.version, 'remote'),
    updatedAt: asString(payload.updatedAt, new Date().toISOString()),
    items: newestFirst(items),
    iranianSchedule: normalizeSchedule(payload.iranianSchedule),
    weeklySchedule: normalizeSchedule(payload.weeklySchedule),
  };
};

const normalizedLocalPayload = (): CatalogPayload => {
  const items = LOCAL_PAYLOAD.items
    .map((item) => normalizeCatalogItem(item))
    .filter((item): item is CatalogItem => Boolean(item));

  return {
    ...LOCAL_PAYLOAD,
    items: newestFirst(items),
  };
};

export async function loadContent(): Promise<LoadedContent> {
  const remoteUrl = REMOTE_CONTENT_URL.trim();
  if (!remoteUrl) {
    return {
      ...normalizedLocalPayload(),
      source: 'local',
    };
  }

  try {
    const separator = remoteUrl.includes('?') ? '&' : '?';
    const response = await fetch(`${remoteUrl}${separator}v=${Date.now()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const parsed = parsePayload(await response.json());
    if (!parsed) throw new Error('Invalid catalog payload');

    return { ...parsed, source: 'remote' };
  } catch {
    return {
      ...normalizedLocalPayload(),
      source: 'local',
    };
  }
}
