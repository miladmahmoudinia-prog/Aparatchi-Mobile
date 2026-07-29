import { CATALOG, VERIFIED_IRANIAN_SCHEDULE } from './data';
import { REMOTE_CONTENT_URL } from './config';
import {
  CatalogItem,
  CatalogPayload,
  DayId,
  DownloadFile,
  DownloadSection,
  LatestEpisode,
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

const normalizeDownloadFile = (value: unknown, index: number): DownloadFile | null => {
  if (!value || typeof value !== 'object') return null;
  const file = value as Record<string, unknown>;
  const url = asString(file.url ?? file.link);
  if (!/^https?:\/\//i.test(url)) return null;

  const mode = file.mode === 'play' || file.mode === 'web' || file.mode === 'download'
    ? file.mode
    : undefined;

  return {
    id: asString(file.id, `file-${index}`),
    quality: asString(file.quality, asString(file.label, 'کیفیت اصلی')),
    ...(asString(file.label) ? { label: asString(file.label) } : {}),
    ...(asString(file.size) ? { size: asString(file.size) } : {}),
    url,
    ...(mode ? { mode } : {}),
  };
};

const normalizeDownloadSection = (value: unknown, index: number): DownloadSection | null => {
  if (!value || typeof value !== 'object') return null;
  const section = value as Record<string, unknown>;
  const files = Array.isArray(section.files)
    ? section.files
        .map((file, fileIndex) => normalizeDownloadFile(file, fileIndex))
        .filter((file): file is DownloadFile => Boolean(file))
    : [];

  if (!files.length) return null;

  const seasonNumber = asNumber(section.seasonNumber ?? section.season_number, 0);
  const episodeNumber = asNumber(section.episodeNumber ?? section.episode_number, 0);

  return {
    id: asString(section.id, `section-${index}`),
    title: asString(
      section.title,
      episodeNumber > 0 ? `فصل ${seasonNumber || 1} • قسمت ${episodeNumber}` : 'لینک‌های دریافت',
    ),
    ...(asString(section.subtitle) ? { subtitle: asString(section.subtitle) } : {}),
    ...(asString(section.badge) ? { badge: asString(section.badge) } : {}),
    files,
    ...(asString(section.sourceEpisodeId) ? { sourceEpisodeId: asString(section.sourceEpisodeId) } : {}),
    ...(seasonNumber > 0 ? { seasonNumber } : {}),
    ...(episodeNumber > 0 ? { episodeNumber } : {}),
    ...(asString(section.sourceUpdatedAt) ? { sourceUpdatedAt: asString(section.sourceUpdatedAt) } : {}),
  };
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

  if (!id || !type || !nameFa || !poster) return null;

  const downloads = Array.isArray(item.downloads)
    ? item.downloads
        .map((section, index) => normalizeDownloadSection(section, index))
        .filter((section): section is DownloadSection => Boolean(section))
    : [];

  const episodeSections = downloads.filter((section) => (section.episodeNumber || 0) > 0);
  const seasonNumbers = new Set(
    episodeSections.map((section) => section.seasonNumber || 1),
  );
  const latestEpisode = normalizeLatestEpisode(item.latestEpisode, episodeSections);
  const rawAccess = asString(item.access);
  const access = rawAccess === 'paid' || rawAccess === 'operator' ? rawAccess : 'free';
  const rate = asNumber(item.rate, Number.NaN);
  const streamMode = item.streamMode === 'web' || item.streamMode === 'video'
    ? item.streamMode
    : undefined;

  return {
    id,
    slug: asString(item.slug, `${type}-${id}`),
    type,
    ir: asBoolean(item.ir),
    year: asNumber(item.year, new Date().getUTCFullYear()),
    nameFa,
    name,
    ...(asString(item.imdb) ? { imdb: asString(item.imdb) } : {}),
    poster,
    backdrop,
    overview: asString(item.overview, 'توضیحی ثبت نشده است.'),
    genres: stringArray(item.genres),
    ...(Number.isFinite(rate) ? { rate } : {}),
    access,
    ...(asString(item.streamUrl) ? { streamUrl: asString(item.streamUrl) } : {}),
    ...(streamMode ? { streamMode } : {}),
    ...(downloads.length ? { downloads } : {}),
    ...(type === 'series'
      ? {
          episodeCount: asNumber(item.episodeCount, episodeSections.length),
          seasonCount: asNumber(item.seasonCount, seasonNumbers.size),
          latestEpisode,
        }
      : {}),
    ...(asString(item.updateLabel) ? { updateLabel: asString(item.updateLabel) } : {}),
    categoryKeys: stringArray(item.categoryKeys),
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

export async function loadContent(): Promise<LoadedContent> {
  const remoteUrl = REMOTE_CONTENT_URL.trim();
  if (!remoteUrl) {
    return {
      ...LOCAL_PAYLOAD,
      items: newestFirst(LOCAL_PAYLOAD.items),
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
      ...LOCAL_PAYLOAD,
      items: newestFirst(LOCAL_PAYLOAD.items),
      source: 'local',
    };
  }
}
