import * as FileSystem from 'expo-file-system/legacy';

export type WatchProgressRecord = {
  id: string;
  itemId: string;
  title: string;
  subtitle?: string;
  artwork?: string;
  episodeId?: string;
  language?: 'dubbed' | 'subtitled';
  downloadId?: string;
  sourceId?: string;
  sourceUrl?: string;
  sourceQuality?: string;
  position: number;
  duration: number;
  updatedAt: string;
};

export type LibraryState = {
  favorites: string[];
  watchProgress: WatchProgressRecord[];
};

const LIBRARY_FILE = `${FileSystem.documentDirectory}aparatchi-library.json`;
const EMPTY_LIBRARY: LibraryState = { favorites: [], watchProgress: [] };

const normalizeProgress = (record: WatchProgressRecord): WatchProgressRecord | null => {
  if (!record || typeof record.id !== 'string' || typeof record.itemId !== 'string') {
    return null;
  }

  const position = Math.max(0, Number(record.position || 0));
  const duration = Math.max(0, Number(record.duration || 0));
  if (position < 15) return null;
  if (duration > 0 && position / duration >= 0.94) return null;

  return {
    ...record,
    position,
    duration,
    updatedAt: record.updatedAt || new Date(0).toISOString(),
  };
};

export async function loadLibraryState(): Promise<LibraryState> {
  try {
    const info = await FileSystem.getInfoAsync(LIBRARY_FILE);
    if (!info.exists) return EMPTY_LIBRARY;

    const raw = await FileSystem.readAsStringAsync(LIBRARY_FILE);
    const parsed = JSON.parse(raw) as Partial<LibraryState>;
    const favorites = Array.isArray(parsed.favorites)
      ? [...new Set(parsed.favorites.filter((id): id is string => typeof id === 'string'))]
      : [];
    const watchProgress = Array.isArray(parsed.watchProgress)
      ? parsed.watchProgress
          .map((record) => normalizeProgress(record as WatchProgressRecord))
          .filter((record): record is WatchProgressRecord => Boolean(record))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 20)
      : [];

    return { favorites, watchProgress };
  } catch {
    return EMPTY_LIBRARY;
  }
}

export async function saveLibraryState(state: LibraryState) {
  const payload: LibraryState = {
    favorites: [...new Set(state.favorites)].slice(0, 500),
    watchProgress: [...state.watchProgress]
      .map((record) => normalizeProgress(record))
      .filter((record): record is WatchProgressRecord => Boolean(record))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 20),
  };

  await FileSystem.writeAsStringAsync(LIBRARY_FILE, JSON.stringify(payload));
}
