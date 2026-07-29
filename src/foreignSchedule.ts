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

export async function loadVerifiedForeignSchedule(catalog: CatalogItem[]): Promise<ScheduleEntry[]> {
  const candidates = catalog.filter((item) => item.type === 'series' && !item.ir && item.imdb);

  const results = await Promise.all(
    candidates.map(async (item): Promise<ScheduleEntry | null> => {
      try {
        const showResponse = await fetch(
          `https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(item.imdb!)}`,
        );
        if (!showResponse.ok) return null;

        const show = (await showResponse.json()) as TvMazeShow;
        if (show.status.toLowerCase() === 'ended' || !show._links?.nextepisode?.href) {
          return null;
        }

        const episodeResponse = await fetch(show._links.nextepisode.href);
        if (!episodeResponse.ok) return null;

        const episode = (await episodeResponse.json()) as TvMazeEpisode;
        if (!episode.airdate || !isInCurrentWeek(episode.airdate)) return null;

        const [year, month, dayOfMonth] = episode.airdate.split('-').map(Number);
        const episodeDate = new Date(year, month - 1, dayOfMonth);
        const day = JS_DAY_TO_ID[episodeDate.getDay()];

        return {
          id: `weekly-${show.id}-${episode.id}`,
          itemId: item.id,
          nameFa: item.nameFa,
          poster: item.poster,
          day,
          time: episode.airtime ? toPersianDigits(episode.airtime) : 'زمان نامشخص',
          ...(episode.number ? { episode: episode.number } : {}),
          region: 'foreign',
        };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((entry): entry is ScheduleEntry => Boolean(entry));
}

export const getDayLabel = (day: DayId) =>
  DAYS.find((entry) => entry.id === day)?.label || day;
