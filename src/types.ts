export type ContentType = 'movie' | 'series';

export type PersonRole = 'actor' | 'director';

export type CatalogPerson = {
  id: string;
  nameFa: string;
  name?: string;
  role: PersonRole;
  roleLabel?: string;
  character?: string;
  image?: string;
  order?: number;
  tmdbId?: number;
  source?: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  nationality?: string;
  popularity?: number;
};

export type FeaturedPerson = CatalogPerson & {
  itemIds: string[];
  workCount?: number;
  region?: 'iranian' | 'foreign';
};

export type MediaLanguage = 'dubbed' | 'subtitled';

export type OperatorAccessKind = 'stream' | 'download' | 'both';
export type DownloadMode = 'download' | 'play' | 'purchase' | 'operator-download' | 'operator-play';

export type DownloadFile = {
  id: string;
  quality: string;
  label?: string;
  size?: string;
  url: string;
  language?: MediaLanguage;
  /**
   * download/play: لینک مستقیم داخل برنامه
   * purchase: صفحه خرید/دریافت منبع وقتی نسخه رایگان وجود ندارد
   * operator-download/operator-play: درگاه رایگان ویژه اینترنت همراه
   */
  mode?: DownloadMode;
  operatorOnly?: boolean;
  supportedOperators?: string[];
};

export type DownloadSection = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  /** تصویر همان قسمت؛ اگر آماده نیست UI فقط placeholder سبک نشان می‌دهد. */
  artwork?: string;
  files: DownloadFile[];
  language?: MediaLanguage;
  sourceEpisodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  sourceUpdatedAt?: string;
  tmdbValidationVersion?: number;
};

export type LatestEpisode = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
};

export type CatalogItem = {
  id: string;
  slug: string;
  type: ContentType;
  ir: boolean;
  year: number;
  nameFa: string;
  name: string;
  imdb?: string;
  imdbVotes?: number;
  /** کدهای استاندارد کشور سازنده، مثل IR، KR و IN. */
  countryCodes?: string[];
  countryLabels?: string[];
  countryNames?: string[];
  /** زبان اصلی عنوان، مانند fa، ko، hi یا ja. */
  originalLanguage?: string;
  /** شناسه پایدار کالکشن؛ هرگز از شباهت نام ساخته نمی‌شود. */
  collectionId?: string;
  collectionNameFa?: string;
  collectionName?: string;
  collectionOrder?: number;
  /** عوامل و بازیگران با شناسهٔ پایدار منبع. */
  people?: CatalogPerson[];
  poster: string;
  /** پوستر جایگزین معتبر، معمولاً از TMDB، برای خطای آدرس اصلی. */
  posterFallback?: string;
  backdrop: string;
  /** تصویر پس‌زمینهٔ جایگزین برای خطای آدرس اصلی. */
  backdropFallback?: string;
  overview: string;
  genres: string[];
  rate?: number;
  access: 'free' | 'paid' | 'operator';
  operatorOnly?: boolean;
  operatorAccess?: OperatorAccessKind;
  supportedOperators?: string[];
  streamUrl?: string;
  /** فقط پخش مستقیم داخل پلیر برنامه */
  streamMode?: 'video';
  downloads?: DownloadSection[];
  availableLanguages?: MediaLanguage[];
  episodeCount?: number;
  seasonCount?: number;
  latestEpisode?: LatestEpisode | null;
  /** روزهای پخش هفتگی، ترجیحاً از TMDB یا منبع رسمی. */
  airDays?: DayId[];
  airTime?: string;
  nextEpisodeAirDate?: string;
  nextEpisodeSeasonNumber?: number;
  nextEpisodeNumber?: number;
  isAiring?: boolean;
  /** وضعیت انتشار آرشیو سریال در اپ. */
  publicationStatus?: 'published' | 'building-archive';
  /** آیا تمام قسمت‌های کشف‌شده دارای لینک قابل‌استفاده‌اند. */
  archiveComplete?: boolean;
  /** تعداد قسمت‌هایی که هنوز باید به آرشیو اضافه شوند. */
  archivePendingEpisodeCount?: number;
  /** تعداد قسمت‌هایی که منبع برای این سریال گزارش کرده است. */
  sourceEpisodeCount?: number;
  /** وضعیت بررسی کامل آرشیو قدیمی. */
  archiveAuditStatus?: 'pending' | 'checked' | 'blocked';
  /** فهرست صریح قسمت‌های کشف‌شده‌ای که هنوز لینک ندارند. */
  archivePendingEpisodes?: Array<{ seasonNumber: number; episodeNumber: number }>;
  /** قسمت‌هایی که پس از چند تلاش منبع برایشان فایل قابل‌استفاده نداده است. */
  archiveUnavailableEpisodes?: Array<{
    sourceEpisodeId?: string;
    seasonNumber: number;
    episodeNumber: number;
    reason?: string;
    attempts?: number;
    markedAt?: string;
  }>;
  /** آیا صفحه‌بندی قسمت‌ها بدون خطا تا انتها بررسی شده است. */
  archiveEpisodeDiscoveryComplete?: boolean;
  archiveEpisodePaginationPagesFetched?: number;
  archiveEpisodePaginationErrors?: number;
  archiveDiscoveryCheckedAt?: string;
  updateLabel?: string;
  meaningfulUpdatedAt?: string;
  /** زمان اولین انتشار واقعی عنوان پس از کامل‌شدن آرشیو. */
  publishedAt?: string;
  /** زمان اولین کشف واقعی عنوان در آپاراتچی؛ برای ترتیب تازه‌ها. */
  firstSeenAt?: string;
  categoryKeys?: string[];
  categoryLabels?: string[];
  contentKind?: string;
  isAnimation?: boolean;
  /** انیمهٔ ژاپنی؛ از انیمیشن عمومی جدا نمایش داده می‌شود. */
  isAnime?: boolean;
  isTalkShow?: boolean;
  isDocumentary?: boolean;
  isWildlife?: boolean;
  createdAt?: string;
  updatedAt?: string;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  tmdbValidationVersion?: number;
  /** مسیر فایل جزئیات سبک؛ تنها هنگام بازکردن عنوان دریافت می‌شود. */
  detailPath?: string;
  /** true وقتی لینک‌ها و عوامل کامل این عنوان بارگذاری شده‌اند. */
  detailLoaded?: boolean;
};

export type ScheduleEntry = {
  id: string;
  itemId: string;
  nameFa: string;
  poster: string;
  day: DayId;
  time?: string;
  season?: number;
  episode?: number;
  region: 'iranian' | 'foreign';
  sourceLabel?: string;
  verifiedAt?: string;
};

export type ImdbTopEntry = {
  rank: number;
  itemId?: string;
  type: ContentType;
  /** عنوان اصلی/انگلیسی IMDb. */
  title: string;
  /** عنوان فارسی، در صورت وجود در کاتالوگ یا ترجمهٔ TMDB. */
  titleFa?: string;
  imdb?: string;
  year?: number;
  rating: number;
  votes?: number;
  poster?: string;
};

export type ImdbTop100 = {
  updatedAt: string;
  source: 'imdb-ratings-dataset' | 'catalog';
  movies: ImdbTopEntry[];
  series: ImdbTopEntry[];
};

export type PersonWorkRef = string | number;

export type CatalogPayload = {
  version: string;
  updatedAt: string;
  clientRevision?: string;
  items: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
  weeklySchedule?: ScheduleEntry[];
  featuredPeople?: FeaturedPerson[];
  /** Compact reverse lookup: person identity key -> item index (remote) or legacy item ID. */
  peopleWorks?: Record<string, PersonWorkRef[]>;
  imdbTop100?: ImdbTop100;
};

export type DayId =
  | 'saturday'
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday';
