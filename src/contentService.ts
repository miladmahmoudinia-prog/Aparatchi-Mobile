import * as FileSystem from 'expo-file-system/legacy';
import { CATALOG, VERIFIED_IRANIAN_SCHEDULE } from './data';
import { REMOTE_CONTENT_URL } from './config';
import {
  CatalogItem,
  CatalogPerson,
  CatalogPayload,
  FeaturedPerson,
  DayId,
  DownloadFile,
  DownloadSection,
  LatestEpisode,
  MediaLanguage,
  OperatorAccessKind,
  ScheduleEntry,
} from './types';

export type LoadedContent = CatalogPayload & {
  source: 'remote' | 'cache' | 'local';
};

const LOCAL_PAYLOAD: CatalogPayload = {
  version: '0.2.0-local',
  updatedAt: '۱۴۰۵/۰۵/۰۵',
  items: CATALOG,
  iranianSchedule: VERIFIED_IRANIAN_SCHEDULE,
  weeklySchedule: [],
  featuredPeople: [],
};

const REMOTE_CACHE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}aparatchi-catalog-cache.json`
  : '';

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


const DAY_ALIASES: Record<string, DayId> = {
  saturday: 'saturday', شنبه: 'saturday',
  sunday: 'sunday', یکشنبه: 'sunday',
  monday: 'monday', دوشنبه: 'monday',
  tuesday: 'tuesday', سهشنبه: 'tuesday', 'سه‌شنبه': 'tuesday',
  wednesday: 'wednesday', چهارشنبه: 'wednesday',
  thursday: 'thursday', پنجشنبه: 'thursday',
  friday: 'friday', جمعه: 'friday',
};

const normalizeDayId = (value: unknown): DayId | null => {
  const key = asString(value).toLowerCase().replace(/[\s_-]+/g, '');
  return DAY_ALIASES[key] || null;
};

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

const normalizePersonRole = (value: unknown, fallback: CatalogPerson['role'] | null = null) => {
  const text = asString(value).toLowerCase();
  if (/director|کارگردان|directing/.test(text)) return 'director' as const;
  if (/actor|actress|cast|بازیگر|هنرپیشه/.test(text)) return 'actor' as const;
  return fallback;
};

const normalizePersonImage = (value: unknown, source: 'tmdb' | 'upera' = 'upera') => {
  const raw = asString(value).trim();
  if (!raw || /default|placeholder|no[-_ ]?image/i.test(raw)) return '';
  if (/^https?:\/\//i.test(raw)) {
    const httpsUrl = raw.replace(/^http:\/\//i, 'https://');
    return source === 'tmdb'
      ? httpsUrl.replace(
          /(https:\/\/image\.tmdb\.org\/t\/p\/)(?:original|w\d+)/i,
          '$1w185',
        )
      : httpsUrl;
  }
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (raw.startsWith('/')) {
    if (source === 'tmdb') return `https://image.tmdb.org/t/p/w185${raw}`;
    if (/^\/(?:s3|uploads?|images?|storage|media)\//i.test(raw)) return `https://thumb.upera.tv${raw}`;
    return `https://thumb.upera.tv/s3/actors/${raw.replace(/^\/+/, '')}`;
  }
  if (/\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(raw)) {
    return source === 'tmdb'
      ? `https://image.tmdb.org/t/p/w185/${raw.replace(/^\/+/, '')}`
      : `https://thumb.upera.tv/s3/actors/${raw.replace(/^\/+/, '')}`;
  }
  return '';
};

const personSourceEntries = (
  value: unknown,
  fallbackRole: CatalogPerson['role'] | null = null,
): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => personSourceEntries(entry, fallbackRole));
  }
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const hasName = Boolean(record.name || record.nameFa || record.name_fa || record.title);
  if (hasName) return [{ ...record, __fallbackRole: fallbackRole }];

  return [
    ...personSourceEntries(record.cast, 'actor'),
    ...personSourceEntries(record.actors, 'actor'),
    ...personSourceEntries(record.directors, 'director'),
    ...personSourceEntries(record.director, 'director'),
    ...personSourceEntries(record.casts, 'actor'),
    ...personSourceEntries(record.persons, fallbackRole),
    ...personSourceEntries(record.artists, fallbackRole),
    ...personSourceEntries(record.crew, fallbackRole),
    ...personSourceEntries(record.credits, fallbackRole),
    ...personSourceEntries(record.data, fallbackRole),
    ...personSourceEntries(record.items, fallbackRole),
  ];
};

const normalizePeople = (item: Record<string, unknown>): CatalogPerson[] => {
  const sources = [
    ...personSourceEntries(item.directors, 'director'),
    ...personSourceEntries(item.director, 'director'),
    ...personSourceEntries(item.actors, 'actor'),
    ...personSourceEntries(item.actor, 'actor'),
    ...personSourceEntries(item.cast, 'actor'),
    ...personSourceEntries(item.casts, 'actor'),
    ...personSourceEntries(item.people),
    ...personSourceEntries(item.credits),
    ...personSourceEntries(item.crew),
  ];

  const seen = new Set<string>();
  const ownerId = asString(item.id ?? item.t_id ?? item.series_id, 'item');
  return sources.flatMap((person, index) => {
    const fallbackRole = person.__fallbackRole as CatalogPerson['role'] | null;
    const role = normalizePersonRole(
      person.role ?? person.job ?? person.department ?? person.known_for_department,
      fallbackRole,
    );
    if (!role) return [];

    const nameFa = asString(
      person.nameFa ?? person.name_fa ?? person.full_name_fa ??
      person.titleFa ?? person.title_fa ?? person.name ?? person.title,
    );
    const name = asString(person.name ?? person.full_name ?? person.title, nameFa);
    if (!nameFa && !name) return [];

    const externalId = asString(
      person.personId ?? person.person_id ?? person.tmdbId ?? person.tmdb_id ??
      person.imdb ?? person.id ?? person.slug,
    );
    const fallbackName = (nameFa || name).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-');
    const fallbackId = `${role}-local-${ownerId}-${fallbackName}`;
    const id = externalId
      ? (externalId.startsWith(`${role}-`) ? externalId : `${role}-${externalId}`)
      : fallbackId;
    if (!id || seen.has(id)) return [];
    seen.add(id);

    const personSource =
      asString(person.source).toLowerCase() === 'tmdb' ||
      asNumber(person.tmdbId ?? person.tmdb_id, 0) > 0
        ? 'tmdb'
        : 'upera';
    const rawPersonImage =
      person.profile_path ?? person.profilePath ??
      person.image ?? person.image_url ?? person.imageUrl ??
      person.profile ?? person.profile_url ?? person.profileUrl ??
      person.profile_image ?? person.profileImage ??
      person.photo ?? person.photo_url ?? person.photoUrl ??
      person.avatar ?? person.thumb ?? person.thumbnail ?? person.poster;
    const image = normalizePersonImage(rawPersonImage, personSource);
    const character = asString(
      person.character ?? person.characterName ?? person.character_name ??
      person.roleName ?? person.role_name ?? person.as,
    );

    return [{
      id,
      nameFa: nameFa || name,
      ...(name ? { name } : {}),
      role,
      roleLabel: asString(person.roleLabel ?? person.role_label, role === 'director' ? 'کارگردان' : 'بازیگر'),
      ...(character ? { character } : {}),
      ...(image ? { image } : {}),
      ...(asNumber(person.tmdbId ?? person.tmdb_id, 0) > 0
        ? { tmdbId: asNumber(person.tmdbId ?? person.tmdb_id, 0) }
        : {}),
      ...(asString(person.source) ? { source: asString(person.source) } : {}),
      ...(asString(person.birthday ?? person.birth_date) ? { birthday: asString(person.birthday ?? person.birth_date) } : {}),
      ...(asString(person.deathday ?? person.death_date) ? { deathday: asString(person.deathday ?? person.death_date) } : {}),
      ...(asString(person.placeOfBirth ?? person.place_of_birth) ? { placeOfBirth: asString(person.placeOfBirth ?? person.place_of_birth) } : {}),
      ...(asString(person.nationality) ? { nationality: asString(person.nationality) } : {}),
      ...(asNumber(person.popularity, 0) > 0 ? { popularity: asNumber(person.popularity, 0) } : {}),
      order: asNumber(person.order ?? person.castOrder ?? person.cast_order, index),
    } satisfies CatalogPerson];
  }).sort((a, b) => {
    const roleDifference = (a.role === 'director' ? 0 : 1) - (b.role === 'director' ? 0 : 1);
    return roleDifference || (a.order || 0) - (b.order || 0);
  }).slice(0, 30);
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
  if (/زیر\s*نویس|subtitle|subbed|soft\s*sub|hard\s*sub|\bsub\b|\.vtt\b|\.srt\b/i.test(text)) return 'subtitled';
  if (/دوبله|dubbed|\bdub\b|persian(?:\s*audio)?|farsi(?:\s*audio)?|فارسی|دو\s*زبانه|dual\s*audio/i.test(text)) return 'dubbed';
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
      : asString(file.label, 'کیفیت فایل'),
  );
  const label = asString(file.label);
  const explicitLanguage = asString(file.language).toLowerCase();
  const detectedLanguage = detectMediaLanguage(quality, label, url);
  const language: MediaLanguage | null = detectedLanguage || (
    explicitLanguage === 'dubbed' || explicitLanguage === 'subtitled'
      ? explicitLanguage
      : null
  );
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
  const explicitLanguage = asString(section.language).toLowerCase();
  const detectedLanguage = detectMediaLanguage(sectionContext);
  const language: MediaLanguage | null = detectedLanguage || (
    explicitLanguage === 'dubbed' || explicitLanguage === 'subtitled'
      ? explicitLanguage
      : null
  );

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
    ? value.map((section, index) => normalizeDownloadSection(section, index)).filter((section): section is DownloadSection => Boolean(section))
    : [];
  if (!rawSections.length) return [];

  const inferPairedLanguages = (files: DownloadFile[]) => {
    const result = uniqueFiles(files).map((file) => ({ ...file }));
    const groups = new Map<string, DownloadFile[]>();
    result.filter((file) => !isOperatorMode(file.mode)).forEach((file) => {
      const qualityKey = `${file.mode || 'download'}:${String(file.quality || '').toLowerCase().replace(/[^0-9a-z]+/g, '')}`;
      groups.set(qualityKey, [...(groups.get(qualityKey) || []), file]);
    });
    groups.forEach((group) => {
      if (group.length !== 2) return;
      const known = group.find((file) => file.language);
      const unknown = group.find((file) => !file.language);
      if (known?.language && unknown) unknown.language = known.language === 'dubbed' ? 'subtitled' : 'dubbed';
    });
    return sortFiles(result);
  };

  const normalizedSections = rawSections.map((section) => {
    const direct = section.files.filter((file) => !isOperatorMode(file.mode));
    const hasFileLanguage = direct.some((file) => Boolean(file.language));
    const files = section.files.map((file) => {
      let nextFile = file;
      if (!isOperatorMode(file.mode) && !file.language && section.language && !hasFileLanguage) {
        nextFile = { ...file, language: section.language };
      }
      if (iranian && nextFile.language === 'dubbed') {
        const { language: _language, ...withoutLanguage } = nextFile;
        return withoutLanguage;
      }
      return nextFile;
    });
    return { ...section, files: inferPairedLanguages(files) };
  });

  const episodeSections = normalizedSections
    .filter((section) => (section.episodeNumber || 0) > 0)
    .map((section) => ({ ...section, title: `فصل ${section.seasonNumber || 1} • قسمت ${section.episodeNumber || 0}` }));

  const standaloneFiles = normalizedSections.filter((section) => (section.episodeNumber || 0) === 0).flatMap((section) => section.files);
  const directStandaloneFiles = inferPairedLanguages(standaloneFiles.filter((file) => !isOperatorMode(file.mode)));
  const operatorStandaloneFiles = uniqueFiles(standaloneFiles.filter((file) => isOperatorMode(file.mode)));

  const languageSections = LANGUAGE_ORDER.flatMap((language) => {
    const files = sortFiles(uniqueFiles(directStandaloneFiles.filter((file) => file.language === language)));
    if (!files.length) return [];
    return [{ id: `language-${language}`, title: languageTitle(language), subtitle: `${files.filter((file) => file.mode !== 'play').length} کیفیت دانلود مستقیم`, badge: language === 'dubbed' ? 'دوبله' : 'زیرنویس', language, files } satisfies DownloadSection];
  });
  const plainFiles = sortFiles(uniqueFiles(directStandaloneFiles.filter((file) => !file.language)));
  const plainSections = iranian && plainFiles.length ? [{ id: 'language-plain', title: 'لینک‌های دریافت', subtitle: `${plainFiles.filter((file) => file.mode !== 'play').length} کیفیت دانلود مستقیم`, files: plainFiles } satisfies DownloadSection] : [];
  const operatorSections = operatorStandaloneFiles.length ? [{ id: 'operator-mobile-access', title: 'ویژه اینترنت همراه', subtitle: 'تماشا یا دریافت با اینترنت سیم‌کارت', badge: 'همراه', files: operatorStandaloneFiles } satisfies DownloadSection] : [];
  return [...episodeSections, ...languageSections, ...plainSections, ...operatorSections];
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
  const posterFallback = asString(item.posterFallback ?? item.poster_fallback);
  const backdropFallback = asString(item.backdropFallback ?? item.backdrop_fallback);
  const poster = asString(item.poster, posterFallback || backdropFallback);
  const backdrop = asString(item.backdrop, backdropFallback || poster);
  const countryMetadata = normalizeCountryMetadata(item);
  const iranian = asBoolean(item.ir) || countryMetadata.countryCodes.includes('IR');
  if (iranian && !countryMetadata.countryCodes.includes('IR')) {
    countryMetadata.countryCodes.unshift('IR');
  }
  if (iranian && !countryMetadata.countryLabels.includes('ایران')) {
    countryMetadata.countryLabels.unshift('ایران');
  }

  if (!id || !type || !nameFa) return null;

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
  const people = normalizePeople(item);
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
  const declaredLanguages = stringArray(item.availableLanguages)
    .filter((language): language is MediaLanguage => language === 'dubbed' || language === 'subtitled');
  const availableLanguages = LANGUAGE_ORDER.filter((language) =>
    declaredLanguages.includes(language) ||
    downloads.some((section) =>
      section.files.some((file) => !isOperatorMode(file.mode) && file.language === language),
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
    ...(asString(item.originalLanguage ?? item.original_language)
      ? { originalLanguage: asString(item.originalLanguage ?? item.original_language).toLowerCase() }
      : {}),
    ...(collectionId ? { collectionId } : {}),
    ...(collectionNameFa ? { collectionNameFa } : {}),
    ...(collectionName ? { collectionName } : {}),
    ...(collectionOrder > 0 ? { collectionOrder } : {}),
    ...(people.length ? { people } : {}),
    poster,
    ...(posterFallback ? { posterFallback } : {}),
    backdrop,
    ...(backdropFallback ? { backdropFallback } : {}),
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
          airDays: stringArray(item.airDays ?? item.air_days ?? item.scheduleDays ?? item.schedule_days)
            .map(normalizeDayId)
            .filter((day): day is DayId => Boolean(day)),
          ...(asString(item.airTime ?? item.air_time ?? item.scheduleTime ?? item.schedule_time)
            ? { airTime: asString(item.airTime ?? item.air_time ?? item.scheduleTime ?? item.schedule_time) }
            : {}),
          ...(asString(item.nextEpisodeAirDate ?? item.next_episode_air_date)
            ? { nextEpisodeAirDate: asString(item.nextEpisodeAirDate ?? item.next_episode_air_date) }
            : {}),
          ...(asNumber(item.nextEpisodeSeasonNumber ?? item.next_episode_season_number, 0) > 0
            ? { nextEpisodeSeasonNumber: asNumber(item.nextEpisodeSeasonNumber ?? item.next_episode_season_number, 0) }
            : {}),
          ...(asNumber(item.nextEpisodeNumber ?? item.next_episode_number, 0) > 0
            ? { nextEpisodeNumber: asNumber(item.nextEpisodeNumber ?? item.next_episode_number, 0) }
            : {}),
          ...(item.isAiring !== undefined || item.is_airing !== undefined
            ? { isAiring: asBoolean(item.isAiring ?? item.is_airing) }
            : {}),
        }
      : {}),
    ...(asString(item.updateLabel) ? { updateLabel: asString(item.updateLabel) } : {}),
    ...(asString(item.meaningfulUpdatedAt) ? { meaningfulUpdatedAt: asString(item.meaningfulUpdatedAt) } : {}),
    categoryKeys,
    categoryLabels: stringArray(item.categoryLabels),
    ...(asString(item.contentKind) ? { contentKind: asString(item.contentKind) } : {}),
    isAnimation: asBoolean(item.isAnimation),
    isAnime: asBoolean(item.isAnime),
    isTalkShow: asBoolean(item.isTalkShow),
    isDocumentary: asBoolean(item.isDocumentary),
    ...(asString(item.createdAt) ? { createdAt: asString(item.createdAt) } : {}),
    ...(asString(item.updatedAt) ? { updatedAt: asString(item.updatedAt) } : {}),
    ...(asString(item.sourceCreatedAt) ? { sourceCreatedAt: asString(item.sourceCreatedAt) } : {}),
    ...(asString(item.sourceUpdatedAt) ? { sourceUpdatedAt: asString(item.sourceUpdatedAt) } : {}),
    ...(asNumber(item.tmdbValidationVersion ?? item.tmdb_validation_version, 0) > 0
      ? { tmdbValidationVersion: asNumber(item.tmdbValidationVersion ?? item.tmdb_validation_version, 0) }
      : {}),
  };
};


const normalizeFeaturedPeople = (value: unknown): FeaturedPerson[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const role = normalizePersonRole(record.role, 'actor');
    if (role !== 'actor') return [];
    const name = asString(record.name ?? record.nameFa ?? record.name_fa);
    const nameFa = asString(record.nameFa ?? record.name_fa, name);
    const tmdbId = asNumber(record.tmdbId ?? record.tmdb_id, 0);
    const id = asString(record.id, tmdbId > 0 ? `actor-tmdb-${tmdbId}` : `featured-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const image = record.profile_path
      ? normalizePersonImage(record.profile_path, 'tmdb')
      : normalizePersonImage(record.image ?? record.imageUrl ?? record.image_url, asString(record.source) === 'tmdb' ? 'tmdb' : 'upera');
    const itemIds = stringArray(record.itemIds ?? record.item_ids);
    if (!image || !itemIds.length) return [];
    return [{
      id,
      nameFa: nameFa || name,
      name,
      role: 'actor' as const,
      roleLabel: 'بازیگر',
      image,
      ...(tmdbId > 0 ? { tmdbId } : {}),
      ...(asString(record.birthday ?? record.birth_date) ? { birthday: asString(record.birthday ?? record.birth_date) } : {}),
      ...(asString(record.deathday ?? record.death_date) ? { deathday: asString(record.deathday ?? record.death_date) } : {}),
      ...(asString(record.placeOfBirth ?? record.place_of_birth) ? { placeOfBirth: asString(record.placeOfBirth ?? record.place_of_birth) } : {}),
      ...(asString(record.nationality) ? { nationality: asString(record.nationality) } : {}),
      ...(asNumber(record.popularity, 0) > 0 ? { popularity: asNumber(record.popularity, 0) } : {}),
      itemIds,
      workCount: asNumber(record.workCount ?? record.work_count, itemIds.length),
      region: record.region === 'iranian' ? 'iranian' : 'foreign',
      source: asString(record.source, 'tmdb'),
      order: index,
    } satisfies FeaturedPerson];
  }).slice(0, 24);
};

const normalizeScheduleEntry = (value: unknown, index: number): ScheduleEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const day = normalizeDayId(entry.day);
  const itemId = asString(entry.itemId ?? entry.item_id);
  if (!itemId || !day || !DAY_IDS.includes(day)) return null;

  const region = entry.region === 'foreign' ? 'foreign' : 'iranian';
  const season = asNumber(entry.season, 0);
  const episode = asNumber(entry.episode, 0);

  return {
    id: asString(entry.id, `schedule-${itemId}-${day}-${index}`),
    itemId,
    nameFa: asString(entry.nameFa ?? entry.name_fa),
    poster: asString(entry.poster),
    day,
    ...(asString(entry.time) && !/نامشخص|اعلام\s*نشده|unknown|tbd/i.test(asString(entry.time))
      ? { time: asString(entry.time) }
      : {}),
    ...(season > 0 ? { season } : {}),
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
    featuredPeople: normalizeFeaturedPeople(payload.featuredPeople ?? payload.featured_people),
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

const readCachedContent = async (): Promise<CatalogPayload | null> => {
  if (!REMOTE_CACHE_URI) return null;
  try {
    const info = await FileSystem.getInfoAsync(REMOTE_CACHE_URI);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(REMOTE_CACHE_URI);
    return parsePayload(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeCachedContent = async (payload: unknown) => {
  if (!REMOTE_CACHE_URI) return;
  try {
    await FileSystem.writeAsStringAsync(REMOTE_CACHE_URI, JSON.stringify(payload));
  } catch {
    // A cache write failure must never prevent the freshly fetched catalog from opening.
  }
};

export async function loadContent(preferCache = false): Promise<LoadedContent> {
  const remoteUrl = REMOTE_CONTENT_URL.trim();
  if (!remoteUrl) {
    return {
      ...normalizedLocalPayload(),
      source: 'local',
    };
  }

  if (preferCache) {
    const cached = await readCachedContent();
    if (cached) return { ...cached, source: 'cache' };
  }

  try {
    const refreshSeparator = remoteUrl.includes('?') ? '&' : '?';
    const requestUrl = `${remoteUrl}${refreshSeparator}_aparatchi_refresh=${Math.floor(Date.now() / 60_000)}`;
    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const rawPayload = await response.json();
    const parsed = parsePayload(rawPayload);
    if (!parsed) throw new Error('Invalid catalog payload');

    void writeCachedContent(rawPayload);
    return { ...parsed, source: 'remote' };
  } catch {
    const cached = await readCachedContent();
    if (cached) return { ...cached, source: 'cache' };
    return {
      ...normalizedLocalPayload(),
      source: 'local',
    };
  }
}
