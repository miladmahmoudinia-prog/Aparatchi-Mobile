import * as BackgroundTask from 'expo-background-task';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { loadBootstrapContent } from './contentService';
import { CatalogItem } from './types';

const EPISODE_ALERT_TASK = 'aparatchi-episode-alert-check-v1';
const EPISODE_ALERT_CHANNEL = 'episode-updates';
const EPISODE_ALERT_FILE = `${FileSystem.documentDirectory}aparatchi-episode-alerts.json`;

export type SeriesEpisodeSnapshot = {
  episodeCount: number;
  latestOrdinal: number;
  latestEpisodeId?: string;
  updatedAt?: string;
};

export type EpisodeAlertState = {
  subscribedSeriesIds: string[];
  snapshots: Record<string, SeriesEpisodeSnapshot>;
};

const EMPTY_STATE: EpisodeAlertState = {
  subscribedSeriesIds: [],
  snapshots: {},
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const safeNumber = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const seriesSnapshot = (item: CatalogItem): SeriesEpisodeSnapshot => {
  const seasonNumber = safeNumber(item.latestEpisode?.seasonNumber);
  const episodeNumber = safeNumber(item.latestEpisode?.episodeNumber);

  return {
    episodeCount: safeNumber(item.episodeCount),
    latestOrdinal: seasonNumber * 100000 + episodeNumber,
    ...(item.latestEpisode?.id ? { latestEpisodeId: String(item.latestEpisode.id) } : {}),
    updatedAt: item.updatedAt || item.sourceUpdatedAt || item.createdAt || item.sourceCreatedAt,
  };
};

const mergeSnapshot = (
  previous: SeriesEpisodeSnapshot | undefined,
  current: SeriesEpisodeSnapshot,
): SeriesEpisodeSnapshot => {
  if (!previous) return current;

  const currentIsNewer = current.latestOrdinal >= previous.latestOrdinal;
  return {
    episodeCount: Math.max(previous.episodeCount, current.episodeCount),
    latestOrdinal: Math.max(previous.latestOrdinal, current.latestOrdinal),
    latestEpisodeId: currentIsNewer
      ? current.latestEpisodeId || previous.latestEpisodeId
      : previous.latestEpisodeId,
    updatedAt: current.updatedAt || previous.updatedAt,
  };
};

const hasNewEpisode = (
  previous: SeriesEpisodeSnapshot | undefined,
  current: SeriesEpisodeSnapshot,
) => {
  if (!previous) return false;

  const newerLatestEpisode =
    previous.latestOrdinal > 0 && current.latestOrdinal > previous.latestOrdinal;
  const increasedEpisodeCount =
    previous.episodeCount > 0 && current.episodeCount > previous.episodeCount;

  return newerLatestEpisode || increasedEpisodeCount;
};

const episodeDescription = (item: CatalogItem) => {
  const season = safeNumber(item.latestEpisode?.seasonNumber);
  const episode = safeNumber(item.latestEpisode?.episodeNumber);

  if (season && episode) return `فصل ${season}، قسمت ${episode} اضافه شد.`;
  if (episode) return `قسمت ${episode} اضافه شد.`;
  return 'قسمت جدید این سریال اضافه شد.';
};

const normalizeState = (value: Partial<EpisodeAlertState> | null | undefined): EpisodeAlertState => {
  const subscribedSeriesIds = Array.isArray(value?.subscribedSeriesIds)
    ? [...new Set(value.subscribedSeriesIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))]
    : [];
  const rawSnapshots = value?.snapshots && typeof value.snapshots === 'object'
    ? value.snapshots
    : {};
  const snapshots = Object.fromEntries(
    Object.entries(rawSnapshots).flatMap(([id, snapshot]) => {
      if (!snapshot || typeof snapshot !== 'object') return [];
      const normalized: SeriesEpisodeSnapshot = {
        episodeCount: safeNumber(snapshot.episodeCount),
        latestOrdinal: safeNumber(snapshot.latestOrdinal),
        ...(typeof snapshot.latestEpisodeId === 'string'
          ? { latestEpisodeId: snapshot.latestEpisodeId }
          : {}),
        ...(typeof snapshot.updatedAt === 'string' ? { updatedAt: snapshot.updatedAt } : {}),
      };
      return [[id, normalized]];
    }),
  );

  return { subscribedSeriesIds, snapshots };
};

export async function loadEpisodeAlertState(): Promise<EpisodeAlertState> {
  try {
    const info = await FileSystem.getInfoAsync(EPISODE_ALERT_FILE);
    if (!info.exists) return EMPTY_STATE;
    const raw = await FileSystem.readAsStringAsync(EPISODE_ALERT_FILE);
    return normalizeState(JSON.parse(raw) as Partial<EpisodeAlertState>);
  } catch {
    return EMPTY_STATE;
  }
}

async function saveEpisodeAlertState(state: EpisodeAlertState) {
  const normalized = normalizeState(state);
  await FileSystem.writeAsStringAsync(EPISODE_ALERT_FILE, JSON.stringify(normalized));
  return normalized;
}

const notificationPermissionGranted = async () => {
  try {
    const permission = await Notifications.getPermissionsAsync();
    return Boolean(permission.granted);
  } catch {
    return false;
  }
};

const prepareAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(EPISODE_ALERT_CHANNEL, {
    name: 'قسمت‌های جدید سریال‌ها',
    description: 'اعلان انتشار قسمت جدید سریال‌های انتخاب‌شده',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 120, 220],
    sound: 'default',
  });
};

const requestNotificationPermission = async () => {
  try {
    await prepareAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return Boolean(requested.granted);
  } catch {
    return false;
  }
};

const registerBackgroundCheck = async () => {
  try {
    const taskManagerAvailable = await TaskManager.isAvailableAsync();
    if (!taskManagerAvailable) return false;
    const registered = await TaskManager.isTaskRegisteredAsync(EPISODE_ALERT_TASK);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(EPISODE_ALERT_TASK, {
        minimumInterval: 360,
      });
    }
    return true;
  } catch {
    return false;
  }
};

const unregisterBackgroundCheck = async () => {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(EPISODE_ALERT_TASK);
    if (registered) await BackgroundTask.unregisterTaskAsync(EPISODE_ALERT_TASK);
  } catch {
    // Registration support differs between Expo Go, debug builds, and release builds.
  }
};

async function showEpisodeNotification(item: CatalogItem) {
  const trigger = Platform.OS === 'android'
    ? { channelId: EPISODE_ALERT_CHANNEL }
    : null;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `قسمت جدید ${item.nameFa}`,
      body: episodeDescription(item),
      sound: 'default',
      data: {
        url: `aparatchi://content/series/${encodeURIComponent(String(item.id))}`,
        itemId: String(item.id),
        itemType: 'series',
      },
    },
    trigger,
  });
}

export async function syncEpisodeAlerts(
  items: CatalogItem[],
  notify = true,
): Promise<{ notifiedCount: number; state: EpisodeAlertState }> {
  const state = await loadEpisodeAlertState();
  if (!state.subscribedSeriesIds.length) return { notifiedCount: 0, state };

  const canNotify = notify && await notificationPermissionGranted();
  const nextSnapshots = { ...state.snapshots };
  let notifiedCount = 0;

  for (const seriesId of state.subscribedSeriesIds) {
    const item = items.find(
      (candidate) => candidate.type === 'series' && String(candidate.id) === seriesId,
    );
    if (!item) continue;

    const current = seriesSnapshot(item);
    const previous = state.snapshots[seriesId];
    if (canNotify && hasNewEpisode(previous, current)) {
      try {
        await showEpisodeNotification(item);
        notifiedCount += 1;
      } catch {
        // The snapshot is still updated to avoid sending the same alert repeatedly.
      }
    }
    nextSnapshots[seriesId] = mergeSnapshot(previous, current);
  }

  const nextState = await saveEpisodeAlertState({
    subscribedSeriesIds: state.subscribedSeriesIds,
    snapshots: nextSnapshots,
  });

  return { notifiedCount, state: nextState };
}

export async function setSeriesEpisodeAlert(
  item: CatalogItem,
  enabled: boolean,
): Promise<{ enabled: boolean; permissionGranted: boolean; state: EpisodeAlertState }> {
  const state = await loadEpisodeAlertState();
  const seriesId = String(item.id);

  if (!enabled) {
    const subscribedSeriesIds = state.subscribedSeriesIds.filter((id) => id !== seriesId);
    const snapshots = { ...state.snapshots };
    delete snapshots[seriesId];
    const nextState = await saveEpisodeAlertState({ subscribedSeriesIds, snapshots });
    if (!subscribedSeriesIds.length) await unregisterBackgroundCheck();
    return { enabled: false, permissionGranted: true, state: nextState };
  }

  const permissionGranted = await requestNotificationPermission();
  if (!permissionGranted) {
    return { enabled: false, permissionGranted: false, state };
  }

  const nextState = await saveEpisodeAlertState({
    subscribedSeriesIds: [...new Set([...state.subscribedSeriesIds, seriesId])],
    snapshots: {
      ...state.snapshots,
      [seriesId]: seriesSnapshot(item),
    },
  });
  await registerBackgroundCheck();
  return { enabled: true, permissionGranted: true, state: nextState };
}

export async function initializeEpisodeAlertSystem() {
  try {
    await prepareAndroidChannel();
    const state = await loadEpisodeAlertState();
    if (state.subscribedSeriesIds.length && await notificationPermissionGranted()) {
      await registerBackgroundCheck();
    }
    return state;
  } catch {
    return EMPTY_STATE;
  }
}

if (!TaskManager.isTaskDefined(EPISODE_ALERT_TASK)) {
  TaskManager.defineTask(EPISODE_ALERT_TASK, async () => {
    try {
      const content = await loadBootstrapContent();
      if (content?.source === 'remote') {
        await syncEpisodeAlerts(content.items, true);
      }
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}
