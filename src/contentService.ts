import * as FileSystem from 'expo-file-system/legacy';
import { CATALOG, VERIFIED_IRANIAN_SCHEDULE } from './data';
import {
  CONTENT_REPOSITORY_BASES,
  REMOTE_CONTENT_DETAIL_BASE_URL,
  REMOTE_CONTENT_INDEX_URL,
  REMOTE_CONTENT_MANIFEST_URL,
  REMOTE_CONTENT_URL,
} from './config';
import {
  CatalogItem,
  CatalogPerson,
  CatalogPayload,
  FeaturedPerson,
  ImdbTop100,
  ImdbTopEntry,
  DayId,
  DownloadFile,
  DownloadSection,
  LatestEpisode,
  MediaLanguage,
  OperatorAccessKind,
  PersonWorkRef,
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
  imdbTop100: undefined,
};

const REMOTE_CACHE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}aparatchi-catalog-index-v3-cache.json`
  : '';
const REMOTE_CACHE_META_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}aparatchi-catalog-index-v3-cache-meta.json`
  : '';

type RemoteCacheMetadata = {
  etag?: string;
  lastModified?: string;
  manifestRevision?: string;
  catalogVersion?: string;
  catalogUpdatedAt?: string;
};

type RemoteCatalogManifest = {
  revision: string;
  clientRevision?: string;
  catalogVersion?: string;
  catalogUpdatedAt?: string;
  sizeBytes?: number;
  clientSizeBytes?: number;
  clientIndex?: string;
  detailBase?: string;
};

let memoryContent: CatalogPayload | null = null;
let cacheMetadataLoaded = false;
let cacheMetadata: RemoteCacheMetadata = {};
const detailMemoryCache = new Map<string, CatalogItem>();
const detailRequestCache = new Map<string, Promise<CatalogItem | null>>();

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

const normalizeIdentityText = (value: unknown) =>
  asString(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();

const REMOTE_ASSET_BASE = (() => {
  const remote = REMOTE_CONTENT_URL.trim();
  if (!remote) return '';
  try {
    return new URL('.', remote).toString();
  } catch {
    return '';
  }
})();

const remoteRepositoryUrlCandidates = (value: string) => {
  const url = asString(value);
  if (!url) return [] as string[];

  let relative = '';
  for (const base of CONTENT_REPOSITORY_BASES) {
    if (url.startsWith(base)) {
      relative = url.slice(base.length);
      break;
    }
  }
  if (!relative) return [url];

  return [...new Set(CONTENT_REPOSITORY_BASES.map((base) => {
    try {
      return new URL(relative, base).toString();
    } catch {
      return `${base}${relative}`;
    }
  }))];
};

const resolveCatalogAsset = (value: unknown) => {
  const raw = asString(value).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'https://');
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^(?:\.\/)?assets\//i.test(raw) && REMOTE_ASSET_BASE) {
    try {
      return new URL(raw.replace(/^\.\//, ''), REMOTE_ASSET_BASE).toString();
    } catch {
      return raw;
    }
  }
  return raw;
};


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


const correctedCountryMetadata = (
  item: Record<string, unknown>,
  metadata: ReturnType<typeof normalizeCountryMetadata>,
  originalLanguage: string,
  name: string,
  nameFa: string,
) => {
  const normalizedTitle = normalizeIdentityText(`${name} ${nameFa}`);
  let codes = [...metadata.countryCodes];
  let countryNames = [...metadata.countryNames];

  const languageCountry: Record<string, string> = {
    fa: 'IR',
    ko: 'KR',
    hi: 'IN',
    ja: 'JP',
    tr: 'TR',
    zh: 'CN',
  };
  const languageCode = languageCountry[originalLanguage];
  if (languageCode && !codes.includes(languageCode)) codes = [languageCode, ...codes];

  // Known bad legacy match: this American title was incorrectly tagged as Japan.
  if (/wicked for good|شرور برای همیشه/.test(normalizedTitle)) {
    codes = ['US'];
    countryNames = ['United States'];
  }

  // Old enrichment occasionally left JP beside a clearly English US/UK title
  // without any Japanese production-country evidence. Avoid leaking those items
  // into the Japanese category while preserving real co-productions.
  const namesText = normalizeIdentityText([
    ...metadata.countryNames,
    ...metadata.countryLabels,
  ].join(' '));
  if (
    codes.includes('JP') &&
    originalLanguage &&
    originalLanguage !== 'ja' &&
    (codes.includes('US') || codes.includes('GB')) &&
    !/japan|ژاپن/.test(namesText)
  ) {
    codes = codes.filter((code) => code !== 'JP');
    countryNames = countryNames.filter((value) => !/japan/i.test(value));
  }

  codes = [...new Set(codes)];
  return {
    countryCodes: codes,
    countryLabels: codes.map((code) => COUNTRY_LABELS_FA[code] || code),
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
  const resolved = resolveCatalogAsset(value);
  const raw = resolved.trim();
  if (!raw || /default|placeholder|no[-_ ]?image/i.test(raw)) return '';

  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/^http:\/\//i, 'https://');
  }
  if (/^\/\//.test(raw)) return `https:${raw}`;

  if (source === 'tmdb') {
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    if (/\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(path)) {
      return `https://image.tmdb.org/t/p/w185${path}`;
    }
    return '';
  }

  if (raw.startsWith('/')) {
    if (/^\/(?:s3|uploads?|images?|storage|media)\//i.test(raw)) return `https://thumb.upera.tv${raw}`;
    return `https://thumb.upera.tv/s3/actors/${raw.replace(/^\/+/, '')}`;
  }
  if (/\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(raw)) {
    return `https://thumb.upera.tv/s3/actors/${raw.replace(/^\/+/, '')}`;
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
    ...personSourceEntries(item.people),
    ...personSourceEntries(item.credits),
    ...personSourceEntries(item.crew),
    ...personSourceEntries(item.directors, 'director'),
    ...personSourceEntries(item.director, 'director'),
    ...personSourceEntries(item.actors, 'actor'),
    ...personSourceEntries(item.actor, 'actor'),
    ...personSourceEntries(item.cast, 'actor'),
    ...personSourceEntries(item.casts, 'actor'),
  ];

  const ownerId = asString(item.id ?? item.t_id ?? item.series_id, 'item');
  const candidates = sources.flatMap((person, index) => {
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

    const tmdbId = asNumber(person.tmdbId ?? person.tmdb_id, 0);
    const externalId = asString(
      person.personId ?? person.person_id ?? person.tmdbId ?? person.tmdb_id ??
      person.imdb ?? person.id ?? person.slug,
    );
    const fallbackName = (nameFa || name).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-');
    const fallbackId = `${role}-local-${ownerId}-${fallbackName}`;
    const id = externalId
      ? (externalId.startsWith(`${role}-`) ? externalId : `${role}-${externalId}`)
      : fallbackId;

    const personSource =
      asString(person.source).toLowerCase() === 'tmdb' || tmdbId > 0
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
      ...(tmdbId > 0 ? { tmdbId } : {}),
      ...(asString(person.source) ? { source: asString(person.source) } : {}),
      ...(asString(person.birthday ?? person.birth_date) ? { birthday: asString(person.birthday ?? person.birth_date) } : {}),
      ...(asString(person.deathday ?? person.death_date) ? { deathday: asString(person.deathday ?? person.death_date) } : {}),
      ...(asString(person.placeOfBirth ?? person.place_of_birth) ? { placeOfBirth: asString(person.placeOfBirth ?? person.place_of_birth) } : {}),
      ...(asString(person.nationality) ? { nationality: asString(person.nationality) } : {}),
      ...(asNumber(person.popularity, 0) > 0 ? { popularity: asNumber(person.popularity, 0) } : {}),
      order: asNumber(person.order ?? person.castOrder ?? person.cast_order, index),
    } satisfies CatalogPerson];
  });

  const merged = new Map<string, CatalogPerson>();
  const nameKeys = new Map<string, string>();

  for (const candidate of candidates) {
    const normalizedName = asString(candidate.name || candidate.nameFa)
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[يى]/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
      .trim();
    const byTmdb = candidate.tmdbId ? `${candidate.role}:tmdb:${candidate.tmdbId}` : '';
    const byName = normalizedName ? `${candidate.role}:name:${normalizedName}` : '';
    const key = (byTmdb && merged.has(byTmdb))
      ? byTmdb
      : (byName && nameKeys.get(byName))
        ? nameKeys.get(byName)!
        : byTmdb || byName || candidate.id;

    const current = merged.get(key);
    if (!current) {
      merged.set(key, candidate);
      if (byName) nameKeys.set(byName, key);
      continue;
    }

    const candidateHasImage = Boolean(candidate.image);
    const currentHasImage = Boolean(current.image);
    const candidateIsTmdb = candidate.source === 'tmdb' || Boolean(candidate.tmdbId);
    const currentIsTmdb = current.source === 'tmdb' || Boolean(current.tmdbId);
    const preferCandidate =
      Number(candidateHasImage) * 100 + Number(candidateIsTmdb) * 20 + Number(candidate.popularity || 0)
      >
      Number(currentHasImage) * 100 + Number(currentIsTmdb) * 20 + Number(current.popularity || 0);

    const preferred = preferCandidate ? candidate : current;
    const secondary = preferCandidate ? current : candidate;
    merged.set(key, {
      ...secondary,
      ...preferred,
      id: preferred.id || secondary.id,
      nameFa: preferred.nameFa || secondary.nameFa,
      name: preferred.name || secondary.name,
      image: preferred.image || secondary.image,
      tmdbId: preferred.tmdbId || secondary.tmdbId,
      character: secondary.character || preferred.character,
      roleLabel: preferred.roleLabel || secondary.roleLabel,
      order: Math.min(Number(current.order || 0), Number(candidate.order || 0)),
    });
    if (byName) nameKeys.set(byName, key);
  }

  return [...merged.values()]
    .sort((a, b) => {
      const roleDifference = (a.role === 'director' ? 0 : 1) - (b.role === 'director' ? 0 : 1);
      return roleDifference || (a.order || 0) - (b.order || 0) || Number(Boolean(b.image)) - Number(Boolean(a.image));
    })
    .slice(0, 30);
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

const isDownloadableUrl = (url: string) => /\.(?:mp4|m4v|mov|webm|mkv)(?:$|[?#])/i.test(url);
const isPlayableUrl = (url: string) => /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url);

const isOperatorMode = (mode?: DownloadFile['mode']) =>
  mode === 'operator-play' || mode === 'operator-download';

const isOperatorPortalUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const path = decodeURIComponent(parsed.pathname || '');
    return /(^|\.)upera\.tv$/i.test(parsed.hostname) &&
      /^\/stream\/(?:movie|episode)\/[^/?#]+\/?$/i.test(path);
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
  const byMedia = new Map<string, DownloadFile>();
  for (const file of files) {
    const key = `${file.mode || 'download'}:${file.url}`;
    const current = byMedia.get(key);
    // Old catalogs can contain the same URL once without a language and once
    // inside a dubbed/subtitled section. Keep the language-aware copy so its
    // download group and poster badge are not lost during normalization.
    if (!current || (!current.language && file.language)) byMedia.set(key, file);
  }
  return [...byMedia.values()];
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
  const explicitOperator = (asBoolean(file.operatorOnly) || requestedMode.startsWith('operator-')) &&
    isOperatorPortalUrl(url);
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
      : requestedMode === 'purchase'
        ? 'purchase'
        : 'download';

  if (isOperatorMode(mode)) {
    if (!isOperatorPortalUrl(url)) return null;
  } else if (mode === 'purchase') {
    // Paid fallback is a normal HTTPS page/link supplied by the provider; it is
    // opened externally instead of being treated as an MP4 download.
    if (!/^https:\/\//i.test(url)) return null;
  } else if (mode === 'play' ? !isPlayableUrl(url) : !isDownloadableUrl(url)) {
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
    ...(resolveCatalogAsset(section.artwork ?? section.image ?? section.poster ?? section.backdrop ?? section.still)
      ? { artwork: resolveCatalogAsset(section.artwork ?? section.image ?? section.poster ?? section.backdrop ?? section.still) }
      : {}),
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
    return sortFiles(uniqueFiles(files).map((file) => ({ ...file })));
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
    return [{ id: `language-${language}`, title: languageTitle(language), subtitle: files.some((file) => file.mode === 'purchase') ? `${files.length} گزینه دریافت` : `${files.filter((file) => file.mode !== 'play').length} کیفیت دانلود مستقیم`, badge: language === 'dubbed' ? 'دوبله' : 'زیرنویس', language, files } satisfies DownloadSection];
  });
  const plainFiles = sortFiles(uniqueFiles(directStandaloneFiles.filter((file) => !file.language)));
  const plainSections = iranian && plainFiles.length ? [{ id: 'language-plain', title: 'لینک‌های دریافت', subtitle: plainFiles.some((file) => file.mode === 'purchase') ? `${plainFiles.length} گزینه دریافت` : `${plainFiles.filter((file) => file.mode !== 'play').length} کیفیت دانلود مستقیم`, files: plainFiles } satisfies DownloadSection] : [];
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
  const detailPath = asString(item.detailPath ?? item.detail_path);
  const nameFa = asString(item.nameFa ?? item.name_fa ?? item.name);
  const name = asString(item.name ?? item.nameFa ?? item.name_fa, nameFa);
  const posterFallback = resolveCatalogAsset(item.posterFallback ?? item.poster_fallback);
  const backdropFallback = resolveCatalogAsset(item.backdropFallback ?? item.backdrop_fallback);
  const poster = resolveCatalogAsset(item.poster) || posterFallback || backdropFallback;
  const backdrop = resolveCatalogAsset(item.backdrop) || backdropFallback || poster;
  const originalLanguage = asString(item.originalLanguage ?? item.original_language).toLowerCase();
  const countryMetadata = correctedCountryMetadata(
    item,
    normalizeCountryMetadata(item),
    originalLanguage,
    name,
    nameFa,
  );
  const iranian = asBoolean(item.ir) || countryMetadata.countryCodes.includes('IR') || originalLanguage === 'fa';
  if (iranian && !countryMetadata.countryCodes.includes('IR')) {
    countryMetadata.countryCodes.unshift('IR');
  }
  if (iranian && !countryMetadata.countryLabels.includes('ایران')) {
    countryMetadata.countryLabels.unshift('ایران');
  }

  if (!id || !type || !nameFa) return null;

  // catalog-index summaries are already normalized by the Content job. Keep
  // their client-side path deliberately shallow: no download-tree walk, no
  // people normalization and no episode reconstruction on the startup thread.
  if (detailPath) {
    const rawAccess = asString(item.access);
    const access: CatalogItem['access'] = rawAccess === 'paid'
      ? 'paid'
      : rawAccess === 'operator'
        ? 'operator'
        : 'free';
    const declaredOperatorAccess = asString(item.operatorAccess ?? item.operator_access);
    const operatorAccess = ['stream', 'download', 'both'].includes(declaredOperatorAccess)
      ? declaredOperatorAccess as OperatorAccessKind
      : undefined;
    const declaredLanguages = stringArray(item.availableLanguages)
      .filter((language): language is MediaLanguage => language === 'dubbed' || language === 'subtitled');
    const rawLatest = item.latestEpisode ?? item.latest_episode;
    const latestEpisode = normalizeLatestEpisode(rawLatest, []);
    const publicationValue = asString(item.publicationStatus ?? item.publication_status);
    const categoryKeys = stringArray(item.categoryKeys);
    const categoryLabels = stringArray(item.categoryLabels);
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

    return {
      id,
      slug: asString(item.slug, `${type}-${id}`),
      type,
      ir: iranian,
      year: asNumber(item.year, new Date().getUTCFullYear()),
      nameFa,
      name,
      ...(asString(item.imdb) ? { imdb: asString(item.imdb) } : {}),
      ...(asNumber(item.imdbVotes ?? item.imdb_votes, 0) > 0
        ? { imdbVotes: asNumber(item.imdbVotes ?? item.imdb_votes, 0) }
        : {}),
      ...(countryMetadata.countryCodes.length ? { countryCodes: countryMetadata.countryCodes } : {}),
      ...(countryMetadata.countryLabels.length ? { countryLabels: countryMetadata.countryLabels } : {}),
      ...(countryMetadata.countryNames.length ? { countryNames: countryMetadata.countryNames } : {}),
      ...(originalLanguage ? { originalLanguage } : {}),
      ...(collectionId ? { collectionId } : {}),
      ...(collectionNameFa ? { collectionNameFa } : {}),
      ...(collectionName ? { collectionName } : {}),
      ...(collectionOrder > 0 ? { collectionOrder } : {}),
      poster,
      ...(posterFallback ? { posterFallback } : {}),
      backdrop,
      ...(backdropFallback ? { backdropFallback } : {}),
      overview: asString(item.overview, 'توضیحی ثبت نشده است.'),
      genres: stringArray(item.genres),
      ...(Number.isFinite(rate) ? { rate } : {}),
      access,
      ...(asBoolean(item.operatorOnly ?? item.operator_only) ? { operatorOnly: true } : {}),
      ...(operatorAccess ? { operatorAccess } : {}),
      ...(stringArray(item.supportedOperators ?? item.supported_operators).length
        ? { supportedOperators: stringArray(item.supportedOperators ?? item.supported_operators) }
        : {}),
      ...(declaredLanguages.length ? { availableLanguages: declaredLanguages } : {}),
      ...(type === 'series'
        ? {
            episodeCount: asNumber(item.episodeCount ?? item.episode_count, 0),
            seasonCount: asNumber(item.seasonCount ?? item.season_count, 0),
            ...(latestEpisode ? { latestEpisode } : {}),
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
            publicationStatus: publicationValue === 'published' || asBoolean(item.archiveComplete ?? item.archive_complete)
              ? 'published' as const
              : 'building-archive' as const,
            ...(item.archiveComplete !== undefined || item.archive_complete !== undefined
              ? { archiveComplete: asBoolean(item.archiveComplete ?? item.archive_complete) }
              : {}),
            ...(asNumber(item.archivePendingEpisodeCount ?? item.archive_pending_episode_count, -1) >= 0
              ? { archivePendingEpisodeCount: asNumber(item.archivePendingEpisodeCount ?? item.archive_pending_episode_count, 0) }
              : {}),
            ...(asNumber(item.sourceEpisodeCount ?? item.source_episode_count, -1) >= 0
              ? { sourceEpisodeCount: asNumber(item.sourceEpisodeCount ?? item.source_episode_count, 0) }
              : {}),
            ...(asString(item.archiveAuditStatus ?? item.archive_audit_status)
              ? { archiveAuditStatus: asString(item.archiveAuditStatus ?? item.archive_audit_status) as 'pending' | 'checked' | 'blocked' }
              : {}),
            ...(item.archiveEpisodeDiscoveryComplete !== undefined || item.archive_episode_discovery_complete !== undefined
              ? { archiveEpisodeDiscoveryComplete: asBoolean(item.archiveEpisodeDiscoveryComplete ?? item.archive_episode_discovery_complete) }
              : {}),
          }
        : {}),
      ...(asString(item.updateLabel) ? { updateLabel: asString(item.updateLabel) } : {}),
      ...(asString(item.meaningfulUpdatedAt) ? { meaningfulUpdatedAt: asString(item.meaningfulUpdatedAt) } : {}),
      categoryKeys,
      categoryLabels,
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
      detailPath,
      detailLoaded: false,
    };
  }

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
  const operatorAccess: OperatorAccessKind | null = operatorAccessFromFiles(operatorFiles);
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
  const operatorOnly = Boolean(operatorFiles.length && !directFiles.length && !streamUrl);
  const access = rawAccess === 'paid'
    ? 'paid'
    : operatorOnly
      ? 'operator'
      : 'free';
  const declaredLanguages = stringArray(item.availableLanguages)
    .filter((language): language is MediaLanguage => language === 'dubbed' || language === 'subtitled');
  const availableLanguages = LANGUAGE_ORDER.filter((language) =>
    downloads.some((section) =>
      section.files.some((file) => !isOperatorMode(file.mode) && file.language === language),
    ),
  );
  const supportedOperators = [
    ...new Set(operatorFiles.flatMap((file) => file.supportedOperators || [])),
  ];
  const categoryKeys = stringArray(item.categoryKeys)
    .filter((key) => key !== 'mobile-operator');
  const categoryLabels = stringArray(item.categoryLabels)
    .filter((label) => !/ویژه\s*(?:اینترنت\s*)?همراه|mobile\s*operator/i.test(label));
  if (operatorFiles.length) {
    categoryKeys.push('mobile-operator');
    categoryLabels.push('ویژه اینترنت همراه');
  }

  const rawArchivePendingEpisodes = item.archivePendingEpisodes ?? item.archive_pending_episodes;
  const archivePendingEpisodes = Array.isArray(rawArchivePendingEpisodes)
    ? rawArchivePendingEpisodes
        .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
        .map((entry) => ({
          seasonNumber: Math.max(1, asNumber(entry.seasonNumber ?? entry.season_number, 1)),
          episodeNumber: Math.max(0, asNumber(entry.episodeNumber ?? entry.episode_number, 0)),
        }))
        .filter((entry) => entry.episodeNumber > 0)
    : [];
  const archiveEpisodeDiscoveryCompleteValue = item.archiveEpisodeDiscoveryComplete ?? item.archive_episode_discovery_complete;
  const archiveAuditStatusValue = asString(item.archiveAuditStatus ?? item.archive_audit_status);
  const archiveExplicitlyAuditedComplete = Boolean(
    archiveAuditStatusValue === 'checked' &&
    archiveEpisodeDiscoveryCompleteValue !== false &&
    archiveEpisodeDiscoveryCompleteValue !== 'false' &&
    Array.isArray(rawArchivePendingEpisodes) &&
    archivePendingEpisodes.length === 0 &&
    downloads.length > 0,
  );
  const normalizedPublicationStatus = (
    asString(item.publicationStatus ?? item.publication_status) === 'published' ||
    asBoolean(item.archiveComplete ?? item.archive_complete) ||
    archiveExplicitlyAuditedComplete ||
    (asBoolean(item.isAiring ?? item.is_airing) && episodeSections.length > 0)
      ? 'published'
      : 'building-archive'
  ) as 'published' | 'building-archive';

  return {
    id,
    slug: asString(item.slug, `${type}-${id}`),
    type,
    ir: iranian,
    year: asNumber(item.year, new Date().getUTCFullYear()),
    nameFa,
    name,
    ...(asString(item.imdb) ? { imdb: asString(item.imdb) } : {}),
    ...(asNumber(item.imdbVotes ?? item.imdb_votes, 0) > 0
      ? { imdbVotes: asNumber(item.imdbVotes ?? item.imdb_votes, 0) }
      : {}),
    ...(countryMetadata.countryCodes.length
      ? { countryCodes: countryMetadata.countryCodes }
      : {}),
    ...(countryMetadata.countryLabels.length
      ? { countryLabels: countryMetadata.countryLabels }
      : {}),
    ...(countryMetadata.countryNames.length
      ? { countryNames: countryMetadata.countryNames }
      : {}),
    ...(originalLanguage ? { originalLanguage } : {}),
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
    ...(type === 'series'
      ? {
          publicationStatus: normalizedPublicationStatus,
          ...(item.archiveComplete !== undefined || item.archive_complete !== undefined
            ? { archiveComplete: asBoolean(item.archiveComplete ?? item.archive_complete) }
            : {}),
          ...(asNumber(item.archivePendingEpisodeCount ?? item.archive_pending_episode_count, -1) >= 0
            ? { archivePendingEpisodeCount: asNumber(item.archivePendingEpisodeCount ?? item.archive_pending_episode_count, 0) }
            : {}),
          ...(asNumber(item.sourceEpisodeCount ?? item.source_episode_count, -1) >= 0
            ? { sourceEpisodeCount: asNumber(item.sourceEpisodeCount ?? item.source_episode_count, 0) }
            : {}),
          ...(archiveAuditStatusValue
            ? { archiveAuditStatus: archiveAuditStatusValue as 'pending' | 'checked' | 'blocked' }
            : {}),
          ...(Array.isArray(rawArchivePendingEpisodes)
            ? { archivePendingEpisodes }
            : {}),
          ...(archiveEpisodeDiscoveryCompleteValue !== undefined
            ? { archiveEpisodeDiscoveryComplete: asBoolean(archiveEpisodeDiscoveryCompleteValue) }
            : {}),
          ...(asNumber(item.archiveEpisodePaginationPagesFetched ?? item.archive_episode_pagination_pages_fetched, -1) >= 0
            ? { archiveEpisodePaginationPagesFetched: asNumber(item.archiveEpisodePaginationPagesFetched ?? item.archive_episode_pagination_pages_fetched, 0) }
            : {}),
          ...(asNumber(item.archiveEpisodePaginationErrors ?? item.archive_episode_pagination_errors, -1) >= 0
            ? { archiveEpisodePaginationErrors: asNumber(item.archiveEpisodePaginationErrors ?? item.archive_episode_pagination_errors, 0) }
            : {}),
          ...(asString(item.archiveDiscoveryCheckedAt ?? item.archive_discovery_checked_at)
            ? { archiveDiscoveryCheckedAt: asString(item.archiveDiscoveryCheckedAt ?? item.archive_discovery_checked_at) }
            : {}),
        }
      : {}),
    ...(asString(item.updateLabel) ? { updateLabel: asString(item.updateLabel) } : {}),
    ...(asString(item.meaningfulUpdatedAt) ? { meaningfulUpdatedAt: asString(item.meaningfulUpdatedAt) } : {}),
    categoryKeys,
    categoryLabels,
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
    ...(detailPath ? { detailPath } : {}),
    detailLoaded: detailPath ? asBoolean(item.detailLoaded ?? item.detail_loaded) : true,
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
    if (!itemIds.length) return [];
    return [{
      id,
      nameFa: nameFa || name,
      name,
      role: 'actor' as const,
      roleLabel: 'بازیگر',
      ...(image ? { image } : {}),
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
  }).slice(0, 36);
};

const sharedPersonKeys = (person: CatalogPerson) => {
  const keys: string[] = [];
  if (person.tmdbId) keys.push(`tmdb:${person.tmdbId}`);
  const names = [person.name, person.nameFa]
    .map(normalizeIdentityText)
    .filter(Boolean);
  for (const name of names) keys.push(`name:${name}`);
  return [...new Set(keys)];
};

const hydrateSharedPersonImages = (
  items: CatalogItem[],
  featuredPeople: FeaturedPerson[],
) => {
  const imageIndex = new Map<string, { image: string; tmdbId?: number }>();
  const register = (person: CatalogPerson) => {
    const image = asString(person.image);
    if (!image) return;
    const value = {
      image,
      ...(person.tmdbId ? { tmdbId: person.tmdbId } : {}),
    };
    for (const key of sharedPersonKeys(person)) {
      if (!imageIndex.has(key)) imageIndex.set(key, value);
    }
  };

  for (const person of featuredPeople) register(person);
  for (const item of items) {
    for (const person of item.people || []) register(person);
  }

  const fill = <T extends CatalogPerson>(person: T): T => {
    if (person.image) return person;
    const match = sharedPersonKeys(person)
      .map((key) => imageIndex.get(key))
      .find(Boolean);
    if (!match?.image) return person;
    return {
      ...person,
      image: match.image,
      ...(person.tmdbId || !match.tmdbId ? {} : { tmdbId: match.tmdbId }),
    };
  };

  return {
    items: items.map((item) => item.people?.length
      ? { ...item, people: item.people.map(fill) }
      : item),
    featuredPeople: featuredPeople.map(fill),
  };
};

const hydratePeopleFromFeaturedIndex = (
  items: CatalogItem[],
  featuredPeople: FeaturedPerson[],
) => {
  const byItemId = new Map<string, CatalogPerson[]>();
  for (const featured of featuredPeople) {
    const person: CatalogPerson = {
      id: featured.id,
      nameFa: featured.nameFa,
      ...(featured.name ? { name: featured.name } : {}),
      role: featured.role,
      ...(featured.roleLabel ? { roleLabel: featured.roleLabel } : {}),
      ...(featured.image ? { image: featured.image } : {}),
      ...(featured.tmdbId ? { tmdbId: featured.tmdbId } : {}),
      ...(featured.source ? { source: featured.source } : {}),
      ...(featured.order !== undefined ? { order: featured.order } : {}),
    };
    for (const itemId of featured.itemIds) {
      byItemId.set(itemId, [...(byItemId.get(itemId) || []), person]);
    }
  }

  return items.map((item) => {
    const indexed = byItemId.get(String(item.id)) || [];
    if (!indexed.length) return item;
    const merged = new Map<string, CatalogPerson>();
    for (const person of [...(item.people || []), ...indexed]) {
      const key = person.tmdbId
        ? `${person.role}:tmdb:${person.tmdbId}`
        : `${person.role}:name:${normalizeIdentityText(person.name || person.nameFa)}`;
      const current = merged.get(key);
      if (!current || (!current.image && person.image)) merged.set(key, person);
    }
    return { ...item, people: [...merged.values()].slice(0, 24) };
  });
};

const normalizeImdbTop100 = (
  value: unknown,
  items: CatalogItem[],
  fallbackUpdatedAt: string,
): ImdbTop100 => {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const hasRankingPayload = Array.isArray(record.movies) || Array.isArray(record.series);
  if (!hasRankingPayload) {
    return {
      updatedAt: asString(record.updatedAt ?? record.updated_at, fallbackUpdatedAt),
      source: 'catalog',
      movies: [],
      series: [],
    };
  }
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const byImdb = new Map(items
    .filter((item) => Boolean(item.imdb))
    .map((item) => [String(item.imdb).toLowerCase(), item]));

  const normalizeList = (raw: unknown, type: CatalogItem['type']): ImdbTopEntry[] => {
    const seen = new Set<string>();
    const normalized: ImdbTopEntry[] = [];
    for (const entryValue of Array.isArray(raw) ? raw : []) {
      if (!entryValue || typeof entryValue !== 'object') continue;
      const entry = entryValue as Record<string, unknown>;
      const itemId = asString(entry.itemId ?? entry.item_id ?? entry.id);
      const imdb = asString(entry.imdb).toLowerCase();
      const item = byId.get(itemId) || byImdb.get(imdb);
      if (item && item.type !== type) continue;
      const identity = item?.id || imdb || `${type}:${asString(entry.title)}:${asString(entry.year)}`;
      if (!identity || seen.has(identity)) continue;
      const rating = asNumber(entry.rating ?? entry.rate ?? item?.rate, Number.NaN);
      if (!Number.isFinite(rating) || rating <= 0) continue;
      const rawTitle = asString(entry.title ?? entry.name);
      const rawTitleFa = asString(entry.titleFa ?? entry.title_fa ?? entry.nameFa ?? entry.name_fa);
      const rawTitleIsPersian = /[\u0600-\u06FF]/.test(rawTitle);
      const title = asString(
        item?.name,
        rawTitleIsPersian
          ? asString(entry.originalTitle ?? entry.original_title, rawTitle)
          : rawTitle,
      );
      const titleFa = asString(item?.nameFa, rawTitleFa || (rawTitleIsPersian ? rawTitle : ''));
      if (!title) continue;
      seen.add(identity);
      normalized.push({
        rank: normalized.length + 1,
        ...(item ? { itemId: item.id } : {}),
        type,
        title,
        ...(titleFa && normalizeIdentityText(titleFa) !== normalizeIdentityText(title)
          ? { titleFa }
          : {}),
        ...(asString(entry.imdb ?? item?.imdb) ? { imdb: asString(entry.imdb ?? item?.imdb) } : {}),
        ...(asNumber(entry.year ?? item?.year, 0) > 0
          ? { year: asNumber(entry.year ?? item?.year, 0) }
          : {}),
        rating,
        ...(asNumber(entry.votes ?? item?.imdbVotes, 0) > 0
          ? { votes: asNumber(entry.votes ?? item?.imdbVotes, 0) }
          : {}),
        ...(resolveCatalogAsset(entry.poster) || item?.poster
          ? { poster: resolveCatalogAsset(entry.poster) || item?.poster }
          : {}),
      });
    }

    // Never manufacture an IMDb ranking from the app catalog. On a first
    // install the bundled payload may not contain imdbTop100 yet; filling the
    // empty list with ordinary app titles made Home briefly show a fake Top
    // 100 until the remote catalog arrived. Keep the section empty/partial
    // until authoritative ranking entries are actually present.
    return normalized.slice(0, 100).map((entry, index) => ({ ...entry, rank: index + 1 }));
  };

  const movies = normalizeList(record.movies, 'movie');
  const series = normalizeList(record.series, 'series');
  const hasRemoteRanking = Array.isArray(record.movies) || Array.isArray(record.series);
  return {
    updatedAt: asString(record.updatedAt ?? record.updated_at, fallbackUpdatedAt),
    source: hasRemoteRanking && record.source === 'imdb-ratings-dataset'
      ? 'imdb-ratings-dataset'
      : 'catalog',
    movies,
    series,
  };
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
    poster: resolveCatalogAsset(entry.poster),
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

  const featuredPeople = normalizeFeaturedPeople(payload.featuredPeople ?? payload.featured_people);
  const peopleWorks = normalizePeopleWorks(payload.peopleWorks ?? payload.people_works);
  const updatedAt = asString(payload.updatedAt, new Date().toISOString());

  return {
    version: asString(payload.version, 'remote'),
    updatedAt,
    // The content sync already writes newest-first items and enriched people.
    // Rebuilding a global person index and cloning every item on the phone made
    // large catalogs freeze the JS thread during startup.
    items,
    iranianSchedule: normalizeSchedule(payload.iranianSchedule),
    weeklySchedule: normalizeSchedule(payload.weeklySchedule),
    featuredPeople,
    peopleWorks,
    imdbTop100: normalizeImdbTop100(payload.imdbTop100 ?? payload.imdb_top_100, items, updatedAt),
  };
};

const normalizePeopleWorks = (value: unknown): Record<string, PersonWorkRef[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries: Array<[string, PersonWorkRef[]]> = [];
  for (const [rawKey, rawRefs] of Object.entries(value as Record<string, unknown>)) {
    const key = asString(rawKey);
    if (!key || !Array.isArray(rawRefs) || !rawRefs.length) continue;
    const refs: PersonWorkRef[] = [];
    const seen = new Set<string>();
    for (const rawRef of rawRefs) {
      const ref: PersonWorkRef | null = typeof rawRef === 'number' && Number.isInteger(rawRef) && rawRef >= 0
        ? rawRef
        : asString(rawRef) || null;
      if (ref === null) continue;
      const identity = typeof ref === 'number' ? `i:${ref}` : `s:${ref}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      refs.push(ref);
    }
    if (refs.length) entries.push([key, refs]);
  }
  return Object.fromEntries(entries);
};

const normalizedLocalPayload = (): CatalogPayload => {
  const items = LOCAL_PAYLOAD.items
    .map((item) => normalizeCatalogItem(item))
    .filter((item): item is CatalogItem => Boolean(item));
  const featuredPeople = normalizeFeaturedPeople(LOCAL_PAYLOAD.featuredPeople);
  const peopleWorks = normalizePeopleWorks(LOCAL_PAYLOAD.peopleWorks);

  return {
    ...LOCAL_PAYLOAD,
    items,
    featuredPeople,
    peopleWorks,
    imdbTop100: normalizeImdbTop100(LOCAL_PAYLOAD.imdbTop100, items, LOCAL_PAYLOAD.updatedAt),
  };
};

const unavailableLocalPayload = (): CatalogPayload => ({
  version: 'bootstrap-unavailable',
  updatedAt: '',
  items: [],
  iranianSchedule: [],
  weeklySchedule: [],
  featuredPeople: [],
  imdbTop100: undefined,
});

export const getBundledContent = (): LoadedContent => ({
  ...normalizedLocalPayload(),
  source: 'local',
});

const readCachedContent = async (): Promise<CatalogPayload | null> => {
  if (memoryContent) return memoryContent;
  if (!REMOTE_CACHE_URI) return null;
  try {
    const info = await FileSystem.getInfoAsync(REMOTE_CACHE_URI);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(REMOTE_CACHE_URI);
    const parsed = parsePayload(JSON.parse(raw));
    if (parsed) memoryContent = parsed;
    return parsed;
  } catch {
    return null;
  }
};

const readCacheMetadata = async () => {
  if (cacheMetadataLoaded) return;
  cacheMetadataLoaded = true;
  if (!REMOTE_CACHE_META_URI) return;
  try {
    const info = await FileSystem.getInfoAsync(REMOTE_CACHE_META_URI);
    if (!info.exists) return;
    const value = JSON.parse(await FileSystem.readAsStringAsync(REMOTE_CACHE_META_URI));
    if (value && typeof value === 'object') {
      cacheMetadata = {
        ...(asString(value.etag) ? { etag: asString(value.etag) } : {}),
        ...(asString(value.lastModified) ? { lastModified: asString(value.lastModified) } : {}),
        ...(asString(value.manifestRevision) ? { manifestRevision: asString(value.manifestRevision) } : {}),
        ...(asString(value.catalogVersion) ? { catalogVersion: asString(value.catalogVersion) } : {}),
        ...(asString(value.catalogUpdatedAt) ? { catalogUpdatedAt: asString(value.catalogUpdatedAt) } : {}),
      };
    }
  } catch {
    cacheMetadata = {};
  }
};

const writeCacheMetadata = async (metadata: RemoteCacheMetadata) => {
  if (!REMOTE_CACHE_META_URI) return;
  try {
    await FileSystem.writeAsStringAsync(REMOTE_CACHE_META_URI, JSON.stringify(metadata));
  } catch {
    // Metadata is only an optimization; the catalog cache remains usable without it.
  }
};

const fetchRemoteManifest = async (): Promise<RemoteCatalogManifest | null> => {
  const manifestUrl = REMOTE_CONTENT_MANIFEST_URL.trim();
  if (!manifestUrl) return null;
  let lastError: unknown = null;

  for (const candidate of remoteRepositoryUrlCandidates(manifestUrl)) {
    const separator = candidate.includes('?') ? '&' : '?';
    const requestUrl = `${candidate}${separator}_aparatchi_manifest=${Math.floor(Date.now() / 300_000)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(requestUrl, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = new Error(`Manifest HTTP ${response.status} from ${candidate}`);
        continue;
      }
      const value = await response.json();
      if (!value || typeof value !== 'object') {
        lastError = new Error(`Invalid catalog manifest from ${candidate}`);
        continue;
      }
      const record = value as Record<string, unknown>;
      const revision = asString(record.revision);
      if (!revision) {
        lastError = new Error(`Catalog manifest has no revision from ${candidate}`);
        continue;
      }
      return {
        revision,
        ...(asString(record.clientRevision ?? record.client_revision)
          ? { clientRevision: asString(record.clientRevision ?? record.client_revision) }
          : {}),
        ...(asString(record.catalogVersion ?? record.version)
          ? { catalogVersion: asString(record.catalogVersion ?? record.version) }
          : {}),
        ...(asString(record.catalogUpdatedAt ?? record.updatedAt)
          ? { catalogUpdatedAt: asString(record.catalogUpdatedAt ?? record.updatedAt) }
          : {}),
        ...(asNumber(record.sizeBytes, 0) > 0 ? { sizeBytes: asNumber(record.sizeBytes, 0) } : {}),
        ...(asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) > 0
          ? { clientSizeBytes: asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) }
          : {}),
        ...(asString(record.clientIndex ?? record.client_index)
          ? { clientIndex: asString(record.clientIndex ?? record.client_index) }
          : {}),
        ...(asString(record.detailBase ?? record.detail_base)
          ? { detailBase: asString(record.detailBase ?? record.detail_base) }
          : {}),
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Catalog manifest is unavailable from all mirrors');
};
const manifestMatchesCachedContent = (
  manifest: RemoteCatalogManifest,
  cached: CatalogPayload,
) => {
  const revision = manifest.clientRevision || manifest.revision;
  return Boolean(
    (cacheMetadata.manifestRevision && cacheMetadata.manifestRevision === revision) ||
    (
      manifest.catalogVersion &&
      manifest.catalogUpdatedAt &&
      cached.version === manifest.catalogVersion &&
      cached.updatedAt === manifest.catalogUpdatedAt
    )
  );
};

const writeCachedContent = async (
  rawPayload: string,
  metadata: RemoteCacheMetadata,
) => {
  if (!REMOTE_CACHE_URI) return;
  try {
    await FileSystem.writeAsStringAsync(REMOTE_CACHE_URI, rawPayload);
    if (REMOTE_CACHE_META_URI) {
      await FileSystem.writeAsStringAsync(REMOTE_CACHE_META_URI, JSON.stringify(metadata));
    }
  } catch {
    // A cache write failure must never prevent the freshly fetched catalog from opening.
  }
};

export async function loadContent(preferCache = false, forceRemote = false): Promise<LoadedContent> {
  const remoteUrl = (REMOTE_CONTENT_INDEX_URL || REMOTE_CONTENT_URL).trim();
  if (!remoteUrl) {
    return {
      ...normalizedLocalPayload(),
      source: 'local',
    };
  }

  if (preferCache) {
    await readCacheMetadata();
    const cached = await readCachedContent();
    if (cached) return { ...cached, source: 'cache' };
    return {
      ...normalizedLocalPayload(),
      source: 'local',
    };
  }

  await readCacheMetadata();
  const cached = await readCachedContent();
  let manifest: RemoteCatalogManifest | null = null;

  try {
    manifest = await fetchRemoteManifest();
    if (!forceRemote && manifest && cached && manifestMatchesCachedContent(manifest, cached)) {
      cacheMetadata = {
        ...cacheMetadata,
        manifestRevision: manifest.clientRevision || manifest.revision,
        ...(manifest.catalogVersion ? { catalogVersion: manifest.catalogVersion } : {}),
        ...(manifest.catalogUpdatedAt ? { catalogUpdatedAt: manifest.catalogUpdatedAt } : {}),
      };
      void writeCacheMetadata(cacheMetadata);
      return { ...cached, source: 'remote' };
    }
  } catch {
    // A temporary manifest/CDN error must not trigger another multi-megabyte
    // download. Keep the last valid catalog and retry the tiny check later.
    if (cached && !forceRemote) return { ...cached, source: 'cache' };
  }

  try {
    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    };
    if (!forceRemote && cacheMetadata.etag) requestHeaders['If-None-Match'] = cacheMetadata.etag;
    if (!forceRemote && cacheMetadata.lastModified) requestHeaders['If-Modified-Since'] = cacheMetadata.lastModified;

    const catalogRevision = manifest?.clientRevision || manifest?.revision || '';
    type CatalogCandidateResult = {
      response: Awaited<ReturnType<typeof fetch>>;
      rawText: string;
      parsed: CatalogPayload;
      matchesManifest: boolean;
    };
    let selectedCatalog: CatalogCandidateResult | null = null;
    let staleFallbackCatalog: CatalogCandidateResult | null = null;
    let lastCatalogError: unknown = null;

    for (const candidate of remoteRepositoryUrlCandidates(remoteUrl)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      const catalogBaseRequestUrl = catalogRevision
        ? `${candidate}${candidate.includes('?') ? '&' : '?'}revision=${encodeURIComponent(catalogRevision.slice(0, 24))}`
        : candidate;
      const catalogRequestUrl = forceRemote
        ? `${catalogBaseRequestUrl}${catalogBaseRequestUrl.includes('?') ? '&' : '?'}_aparatchi_force=${Date.now()}`
        : catalogBaseRequestUrl;
      try {
        const nextResponse = await fetch(catalogRequestUrl, {
          headers: requestHeaders,
          signal: controller.signal,
        });

        if (nextResponse.status === 304) {
          if (cached) return { ...cached, source: 'remote' };
          cacheMetadata = {};
          if (REMOTE_CACHE_META_URI) {
            void FileSystem.writeAsStringAsync(REMOTE_CACHE_META_URI, '{}').catch(() => undefined);
          }
          lastCatalogError = new Error('Remote catalog returned 304 without a local cache');
          continue;
        }

        if (!nextResponse.ok) {
          lastCatalogError = new Error(`Catalog HTTP ${nextResponse.status} from ${candidate}`);
          continue;
        }

        const nextRawText = await nextResponse.text();
        let nextRawPayload: unknown;
        try {
          nextRawPayload = JSON.parse(nextRawText);
        } catch (error) {
          lastCatalogError = error;
          continue;
        }

        const nextParsed = parsePayload(nextRawPayload);
        if (!nextParsed || !nextParsed.items.length) {
          lastCatalogError = new Error(`Invalid/empty catalog payload from ${candidate}`);
          continue;
        }

        const matchesManifest =
          !manifest?.catalogUpdatedAt || nextParsed.updatedAt === manifest.catalogUpdatedAt;
        const candidateResult: CatalogCandidateResult = {
          response: nextResponse,
          rawText: nextRawText,
          parsed: nextParsed,
          matchesManifest,
        };

        if (matchesManifest) {
          selectedCatalog = candidateResult;
          break;
        }

        if (!staleFallbackCatalog) staleFallbackCatalog = candidateResult;
        lastCatalogError = new Error(`Catalog and manifest are temporarily out of sync at ${candidate}`);
      } catch (error) {
        lastCatalogError = error;
      } finally {
        clearTimeout(timeout);
      }
    }

    const acceptedCatalog = selectedCatalog || staleFallbackCatalog;
    if (!acceptedCatalog) {
      throw lastCatalogError instanceof Error
        ? lastCatalogError
        : new Error('Catalog is unavailable from all mirrors');
    }

    const {
      response,
      rawText,
      parsed,
      matchesManifest: catalogMatchesManifest,
    } = acceptedCatalog;
    const acceptedManifest = catalogMatchesManifest ? manifest : null;
    memoryContent = parsed;
    const responseEtag = response.headers.get('etag') || cacheMetadata.etag;
    const responseLastModified =
      response.headers.get('last-modified') || cacheMetadata.lastModified;
    cacheMetadata = {
      ...(responseEtag ? { etag: responseEtag } : {}),
      ...(responseLastModified ? { lastModified: responseLastModified } : {}),
      ...(acceptedManifest?.revision
        ? { manifestRevision: acceptedManifest.clientRevision || acceptedManifest.revision }
        : {}),
      ...(acceptedManifest?.catalogVersion ? { catalogVersion: acceptedManifest.catalogVersion } : {}),
      ...(acceptedManifest?.catalogUpdatedAt ? { catalogUpdatedAt: acceptedManifest.catalogUpdatedAt } : {}),
    };
    void writeCachedContent(rawText, cacheMetadata);
    return { ...parsed, source: 'remote' };
  } catch {
    if (cached) return { ...cached, source: 'cache' };
    return {
      ...normalizedLocalPayload(),
      source: 'local',
    };
  }
}

const detailCacheUriFor = (detailPath: string) => {
  if (!FileSystem.documentDirectory) return '';
  const key = detailPath.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
  return `${FileSystem.documentDirectory}aparatchi-detail-${key}`;
};

const detailUrlFor = (detailPath: string) => {
  const raw = asString(detailPath).replace(/^\/+/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    return new URL(raw, REMOTE_CONTENT_DETAIL_BASE_URL).toString();
  } catch {
    return `${REMOTE_CONTENT_DETAIL_BASE_URL.replace(/\/+$/, '')}/${raw}`;
  }
};

export async function loadCatalogItemDetail(summary: CatalogItem): Promise<CatalogItem | null> {
  const detailPath = asString(summary?.detailPath);
  if (!detailPath || summary.detailLoaded) return { ...summary, detailLoaded: true };

  const memoryKey = `${summary.type}:${summary.id}:${detailPath}`;
  const memory = detailMemoryCache.get(memoryKey);
  if (memory) return memory;
  const pending = detailRequestCache.get(memoryKey);
  if (pending) return pending;

  const request = (async () => {
    const cacheUri = detailCacheUriFor(detailPath);
    const parseDetail = (value: unknown) => {
      const normalized = normalizeCatalogItem(value);
      if (!normalized || normalized.id !== summary.id || normalized.type !== summary.type) return null;
      return { ...normalized, detailPath, detailLoaded: true } as CatalogItem;
    };

    if (cacheUri) {
      try {
        const info = await FileSystem.getInfoAsync(cacheUri);
        if (info.exists) {
          const cached = parseDetail(JSON.parse(await FileSystem.readAsStringAsync(cacheUri)));
          if (cached) {
            detailMemoryCache.set(memoryKey, cached);
            return cached;
          }
        }
      } catch {
        // Broken one-item cache: fetch a clean copy below.
      }
    }

    const url = detailUrlFor(detailPath);
    if (!url) return null;

    const candidates = remoteRepositoryUrlCandidates(url);
    if (!candidates.length) return null;

    // Detail shards are small. Start CDN and Raw together and keep the first
    // valid response. Sequential 10-second mirror timeouts made a healthy title
    // look link-less whenever the first mirror was slow or temporarily stale.
    const controllers = candidates.map(() => new AbortController());
    const firstValid = await new Promise<{ parsed: CatalogItem; raw: string } | null>((resolve) => {
      let remaining = candidates.length;
      let settled = false;

      candidates.forEach((candidate, index) => {
        const controller = controllers[index];
        const timeout = setTimeout(() => controller.abort(), 6_000);
        void (async () => {
          try {
            const separator = candidate.includes('?') ? '&' : '?';
            const response = await fetch(
              `${candidate}${separator}v=${encodeURIComponent(detailPath)}`,
              {
                headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
                signal: controller.signal,
              },
            );
            if (!response.ok) return;
            const raw = await response.text();
            const parsed = parseDetail(JSON.parse(raw));
            if (!parsed || settled) return;
            settled = true;
            controllers.forEach((other, otherIndex) => {
              if (otherIndex !== index) other.abort();
            });
            resolve({ parsed, raw });
          } catch {
            // Another mirror may still succeed.
          } finally {
            clearTimeout(timeout);
            remaining -= 1;
            if (!remaining && !settled) resolve(null);
          }
        })();
      });
    });

    let resolvedDetail = firstValid;

    if (!resolvedDetail) {
      // A CDN may serve an older catalog-index.json after its content-addressed
      // detail shard has already rotated out of the repository. The first 12
      // hex chars in every detail filename are the permanent title identity.
      // Resolve that identity through a tiny stable pointer, then fetch the
      // current immutable detail shard. This works even when the index itself
      // is stale and avoids publishing duplicate full detail JSON files.
      const identityMatch = detailPath.match(/(?:^|\/)([a-f0-9]{12})-[a-f0-9]{12}\.json$/i);
      const stablePath = identityMatch ? `catalog-stable/${identityMatch[1].toLowerCase()}.json` : '';

      const fetchFirstRawPath = async (targetPath: string): Promise<string | null> => {
        if (!targetPath || targetPath.includes('..')) return null;
        const targetUrl = detailUrlFor(targetPath);
        if (!targetUrl) return null;
        const mirrors = remoteRepositoryUrlCandidates(targetUrl);
        if (!mirrors.length) return null;

        const mirrorControllers = mirrors.map(() => new AbortController());
        return await new Promise<string | null>((resolve) => {
          let remaining = mirrors.length;
          let settled = false;
          mirrors.forEach((candidate, index) => {
            const controller = mirrorControllers[index];
            const timeout = setTimeout(() => controller.abort(), 6_000);
            void (async () => {
              try {
                const separator = candidate.includes('?') ? '&' : '?';
                const response = await fetch(
                  `${candidate}${separator}v=${encodeURIComponent(targetPath)}&stable=1`,
                  {
                    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
                    signal: controller.signal,
                  },
                );
                if (!response.ok) return;
                const raw = await response.text();
                if (settled) return;
                settled = true;
                mirrorControllers.forEach((other, otherIndex) => {
                  if (otherIndex !== index) other.abort();
                });
                resolve(raw);
              } catch {
                // Another public mirror may still succeed.
              } finally {
                clearTimeout(timeout);
                remaining -= 1;
                if (!remaining && !settled) resolve(null);
              }
            })();
          });
        });
      };

      if (stablePath) {
        const pointerRaw = await fetchFirstRawPath(stablePath);
        if (pointerRaw) {
          try {
            const pointer = JSON.parse(pointerRaw) as Record<string, unknown>;
            const pointerType = asString(pointer.type);
            const pointerId = asString(pointer.id);
            const currentDetailPath = asString(pointer.detailPath);
            const pointerMatchesSummary =
              pointerType === asString(summary.type) &&
              pointerId === asString(summary.id);
            const currentPathSafe = /^catalog-items\/[a-f0-9]{12}-[a-f0-9]{12}\.json$/i.test(currentDetailPath);

            if (pointerMatchesSummary && currentPathSafe) {
              const currentRaw = await fetchFirstRawPath(currentDetailPath);
              if (currentRaw) {
                const parsed = parseDetail(JSON.parse(currentRaw));
                if (
                  parsed &&
                  asString(parsed.type) === asString(summary.type) &&
                  asString(parsed.id) === asString(summary.id)
                ) {
                  resolvedDetail = { parsed, raw: currentRaw };
                }
              }
            }
          } catch {
            // Invalid/stale pointer: the forced index refresh remains the final fallback.
          }
        }
      }
    }

    if (!resolvedDetail) return null;
    detailMemoryCache.set(memoryKey, resolvedDetail.parsed);
    if (cacheUri) void FileSystem.writeAsStringAsync(cacheUri, resolvedDetail.raw).catch(() => undefined);
    return resolvedDetail.parsed;
  })().finally(() => detailRequestCache.delete(memoryKey));

  detailRequestCache.set(memoryKey, request);
  return request;
}
