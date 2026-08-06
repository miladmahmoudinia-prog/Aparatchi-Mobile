import { DAYS } from './data';
import { CatalogItem, DayId, ScheduleEntry } from './types';

type TvMazeShow = {
  id: number;
  status: string;
  _links?: {
    nextepisode?: {
      href: string;
    };
  };
};

type TvMazeEpisode = {
  id: number;
  number?: number;
  airdate?: string;
  airtime?: string;
};

type ScheduleCacheEntry = {
  expiresAt: number;
  value: ScheduleEntry | null;
};

const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_CANDIDATES = 10;
const MAX_CONCURRENT_REQUESTS = 3;
const scheduleCache = new Map<string, ScheduleCacheEntry>();

const JS_DAY_TO_ID: Record<number, DayId> = {
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

const startOfCurrentWeek = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceSaturday = (start.getDay() + 1) % 7;
  start.setDate(start.getDate() - daysSinceSaturday);
  return start;
};

const isInCurrentWeek = (airdate: string) => {
  const parts = airdate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) return false;

  const episodeDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const weekStart = startOfCurrentWeek();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return episodeDate >= weekStart && episodeDate < weekEnd;
};

const fetchJson = async <T>(url: string): Promise<T | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const loadCandidateSchedule = async (item: CatalogItem): Promise<ScheduleEntry | null> => {
  const imdb = String(item.imdb || '').trim();
  if (!imdb) return null;

  const cached = scheduleCache.get(imdb);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const show = await fetchJson<TvMazeShow>(
    `https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(imdb)}`,
  );
  if (
    !show ||
    String(show.status || '').toLowerCase() === 'ended' ||
    !show._links?.nextepisode?.href
  ) {
    scheduleCache.set(imdb, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }

  const episode = await fetchJson<TvMazeEpisode>(show._links.nextepisode.href);
  if (!episode?.airdate || !isInCurrentWeek(episode.airdate)) {
    scheduleCache.set(imdb, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }

  const [year, month, dayOfMonth] = episode.airdate.split('-').map(Number);
  const episodeDate = new Date(year, month - 1, dayOfMonth);
  const value: ScheduleEntry = {
    id: `weekly-${show.id}-${episode.id}`,
    itemId: item.id,
    nameFa: item.nameFa,
    poster: item.poster,
    day: JS_DAY_TO_ID[episodeDate.getDay()],
    time: episode.airtime ? toPersianDigits(episode.airtime) : 'زمان نامشخص',
    ...(episode.number ? { episode: episode.number } : {}),
    region: 'foreign',
  };
  scheduleCache.set(imdb, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
};

const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await task(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

export async function loadVerifiedForeignSchedule(
  catalog: CatalogItem[],
  knownEntries: ScheduleEntry[] = [],
): Promise<ScheduleEntry[]> {
  const scheduledItemIds = new Set(knownEntries.map((entry) => String(entry.itemId)));
  const candidates = catalog
    .filter((item) =>
      item.type === 'series' &&
      !item.ir &&
      Boolean(item.imdb) &&
      !scheduledItemIds.has(String(item.id)),
    )
    .sort((a, b) =>
      Number(b.isAiring === true) - Number(a.isAiring === true) ||
      String(b.nextEpisodeAirDate || b.updatedAt || '').localeCompare(
        String(a.nextEpisodeAirDate || a.updatedAt || ''),
      ),
    )
    .slice(0, MAX_CANDIDATES);

  if (!candidates.length) return [];
  const results = await mapWithConcurrency(
    candidates,
    MAX_CONCURRENT_REQUESTS,
    loadCandidateSchedule,
  );
  return results.filter((entry): entry is ScheduleEntry => Boolean(entry));
}

export const getDayLabel = (day: DayId) =>
  DAYS.find((entry) => entry.id === day)?.label || day;
