export type ContentType = 'movie' | 'series';

export type DownloadFile = {
  id: string;
  quality: string;
  label?: string;
  size?: string;
  url: string;
  /** download: ذخیره مستقیم، play: پخش داخلی، web: مرورگر داخلی */
  mode?: 'download' | 'play' | 'web';
};

export type DownloadSection = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  files: DownloadFile[];
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
  poster: string;
  backdrop: string;
  overview: string;
  genres: string[];
  rate?: number;
  access: 'free' | 'paid' | 'operator';
  streamUrl?: string;
  /** video: پلیر داخلی، web: صفحه پخش در مرورگر داخلی */
  streamMode?: 'video' | 'web';
  downloads?: DownloadSection[];
};

export type ScheduleEntry = {
  id: string;
  itemId: string;
  nameFa: string;
  poster: string;
  day: DayId;
  time: string;
  episode?: number;
  region: 'iranian' | 'foreign';
  sourceLabel: string;
  verifiedAt: string;
};

export type CatalogPayload = {
  version: string;
  updatedAt: string;
  items: CatalogItem[];
  iranianSchedule: ScheduleEntry[];
};

export type DayId =
  | 'saturday'
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday';
