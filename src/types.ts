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
};

export type MediaLanguage = 'dubbed' | 'subtitled';

export type OperatorAccessKind = 'stream' | 'download' | 'both';
export type DownloadMode = 'download' | 'play' | 'operator-download' | 'operator-play';

export type DownloadFile = {
  id: string;
  quality: string;
  label?: string;
  size?: string;
  url: string;
  language?: MediaLanguage;
  /**
   * download/play: لینک مستقیم داخل برنامه
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
  updateLabel?: string;
  meaningfulUpdatedAt?: string;
  categoryKeys?: string[];
  categoryLabels?: string[];
  contentKind?: string;
  isAnimation?: boolean;
  /** انیمهٔ ژاپنی؛ از انیمیشن عمومی جدا نمایش داده می‌شود. */
  isAnime?: boolean;
  isTalkShow?: boolean;
  isDocumentary?: boolean;
  createdAt?: string;
  updatedAt?: string;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  tmdbValidationVersion?: number;
};

export type ScheduleEntry = {
  id: string;
  itemId: string;
  nameFa: string;
  poster: string;
  day: DayId;
  time: string;
  season?: number;
  episode?: number;
  region: 'iranian' | 'foreign';
  sourceLabel?: string;
  verifiedAt?: string;
};

export type CatalogPayload = {
  version: string;
  updatedAt: string;
  items: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
  weeklySchedule?: ScheduleEntry[];
};

export type DayId =
  | 'saturday'
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday';
