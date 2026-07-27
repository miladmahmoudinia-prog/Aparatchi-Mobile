import { DAYS } from './data';
import { CatalogItem, DayId, ScheduleEntry } from './types';

type TvMazeShow = {
  id: number;
  name: string;
  status: string;
  _links?: {
    nextepisode?: {
      href: string;
    };
  };
};

type TvMazeEpisode = {
  id: number;
  season?: number;
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
        if (!episode.airdate) return null;

        const day = JS_DAY_TO_ID[new Date(`${episode.airdate}T12:00:00Z`).getUTCDay()];
        const episodeNumber = episode.number || undefined;

        return {
          id: `tvmaze-${show.id}-${episode.id}`,
          itemId: item.id,
          nameFa: item.nameFa,
          poster: item.poster,
          day,
          time: episode.airtime ? toPersianDigits(episode.airtime) : 'زمان نامشخص',
          episode: episodeNumber,
          region: 'foreign',
          sourceLabel: 'برنامه قسمت بعدی TVmaze',
          verifiedAt: new Intl.DateTimeFormat('fa-IR').format(new Date()),
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

