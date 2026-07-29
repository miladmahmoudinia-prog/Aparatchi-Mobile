import { CATALOG, VERIFIED_IRANIAN_SCHEDULE } from './data';
import { REMOTE_CONTENT_URL } from './config';
import { CatalogItem, CatalogPayload, ScheduleEntry } from './types';

export type LoadedContent = CatalogPayload & {
  source: 'remote' | 'local';
};

const LOCAL_PAYLOAD: CatalogPayload = {
  version: '0.2.0-local',
  updatedAt: '۱۴۰۵/۰۵/۰۵',
  items: CATALOG,
  iranianSchedule: VERIFIED_IRANIAN_SCHEDULE,
};

const isString = (value: unknown): value is string => typeof value === 'string';

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

const isCatalogItem = (value: unknown): value is CatalogItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CatalogItem>;
  return (
    isString(item.id) &&
    isString(item.slug) &&
    (item.type === 'movie' || item.type === 'series') &&
    typeof item.ir === 'boolean' &&
    typeof item.year === 'number' &&
    isString(item.nameFa) &&
    isString(item.name) &&
    isString(item.poster) &&
    isString(item.backdrop) &&
    isString(item.overview) &&
    Array.isArray(item.genres) &&
    item.genres.every(isString) &&
    (item.access === 'free' || item.access === 'paid' || item.access === 'operator')
  );
};

const isScheduleEntry = (value: unknown): value is ScheduleEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ScheduleEntry>;
  return (
    isString(entry.id) &&
    isString(entry.itemId) &&
    isString(entry.nameFa) &&
    isString(entry.poster) &&
    isString(entry.day) &&
    isString(entry.time) &&
    (entry.region === 'iranian' || entry.region === 'foreign') &&
    isString(entry.sourceLabel) &&
    isString(entry.verifiedAt)
  );
};

const parsePayload = (value: unknown): CatalogPayload | null => {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Partial<CatalogPayload>;
  if (!isString(payload.version) || !isString(payload.updatedAt)) return null;
  if (!Array.isArray(payload.items) || !payload.items.length || !payload.items.every(isCatalogItem)) return null;
  if (!Array.isArray(payload.iranianSchedule) || !payload.iranianSchedule.every(isScheduleEntry)) return null;
  return payload as CatalogPayload;
};

export async function loadContent(): Promise<LoadedContent> {
  const remoteUrl = REMOTE_CONTENT_URL.trim();
  if (!remoteUrl) return { ...LOCAL_PAYLOAD, items: newestFirst(LOCAL_PAYLOAD.items), source: 'local' };

  try {
    const separator = remoteUrl.includes('?') ? '&' : '?';
    const response = await fetch(`${remoteUrl}${separator}v=${Date.now()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const parsed = parsePayload(await response.json());
    if (!parsed) throw new Error('Invalid catalog payload');

    return { ...parsed, items: newestFirst(parsed.items), source: 'remote' };
  } catch {
    return { ...LOCAL_PAYLOAD, items: newestFirst(LOCAL_PAYLOAD.items), source: 'local' };
  }
}
