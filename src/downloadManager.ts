import * as FileSystem from 'expo-file-system/legacy';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

export type DownloadStatus = 'downloading' | 'paused' | 'completed' | 'failed';

export type DownloadRecord = {
  id: string;
  itemId: string;
  title: string;
  subtitle: string;
  quality: string;
  sourceUrl: string;
  localUri?: string;
  destinationUri?: string;
  resumeData?: string;
  fileName?: string;
  progress: number;
  bytesWritten?: number;
  totalBytes?: number;
  status: DownloadStatus;
  error?: string;
  createdAt: string;
};

export type DownloadProgress = {
  progress: number;
  bytesWritten: number;
  totalBytes: number;
};

export type DownloadPauseSnapshot = {
  destinationUri: string;
  resumeData?: string;
};

export type DownloadRunResult = {
  localUri?: string;
  paused: boolean;
};

const DOWNLOAD_DIRECTORY = `${FileSystem.documentDirectory}aparatchi-downloads/`;
const DATABASE_FILE = `${FileSystem.documentDirectory}aparatchi-downloads.json`;
const activeTasks = new Map<string, any>();

const sanitizeName = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'video';

const extensionFromUrl = (url: string) => {
  const clean = url.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  return match ? `.${match[1].toLowerCase()}` : '.mp4';
};

const destinationFor = (record: DownloadRecord) => {
  if (record.destinationUri) return record.destinationUri;
  const extension = extensionFromUrl(record.sourceUrl);
  const baseName = sanitizeName(record.fileName || `${record.title}-${record.quality}`);
  return `${DOWNLOAD_DIRECTORY}${baseName}-${sanitizeName(record.id)}${extension}`;
};

async function ensureDownloadDirectory() {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIRECTORY, { intermediates: true });
  }
}

const normalizeRecord = (record: DownloadRecord): DownloadRecord => ({
  ...record,
  progress: Math.max(0, Math.min(1, Number(record.progress || 0))),
  status: record.status === 'downloading' ? 'paused' : record.status,
  error:
    record.status === 'downloading'
      ? 'دانلود متوقف شده است؛ برای ادامه بزنید.'
      : record.error,
});

export async function loadDownloadRecords(): Promise<DownloadRecord[]> {
  try {
    const info = await FileSystem.getInfoAsync(DATABASE_FILE);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(DATABASE_FILE);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((record) => record && typeof record.id === 'string')
      .map((record) => normalizeRecord(record as DownloadRecord));
  } catch {
    return [];
  }
}

export async function saveDownloadRecords(records: DownloadRecord[]) {
  await FileSystem.writeAsStringAsync(DATABASE_FILE, JSON.stringify(records));
}

export function isDownloadActive(id: string) {
  return activeTasks.has(id);
}

export async function runDownload({
  record,
  onProgress,
}: {
  record: DownloadRecord;
  onProgress: (progress: DownloadProgress) => void;
}): Promise<DownloadRunResult> {
  await ensureDownloadDirectory();
  const destination = destinationFor(record);

  if (!record.resumeData) {
    const oldFile = await FileSystem.getInfoAsync(destination);
    if (oldFile.exists) {
      await FileSystem.deleteAsync(destination, { idempotent: true });
    }
  }

  const task = FileSystem.createDownloadResumable(
    record.sourceUrl,
    destination,
    {
      sessionType: FileSystem.FileSystemSessionType?.BACKGROUND,
    },
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const progress = totalBytesExpectedToWrite > 0
        ? totalBytesWritten / totalBytesExpectedToWrite
        : 0;
      onProgress({
        progress: Math.max(0, Math.min(1, progress)),
        bytesWritten: Math.max(0, Number(totalBytesWritten || 0)),
        totalBytes: Math.max(0, Number(totalBytesExpectedToWrite || 0)),
      });
    },
    record.resumeData,
  );

  activeTasks.set(record.id, task);

  try {
    const result = record.resumeData
      ? await task.resumeAsync()
      : await task.downloadAsync();

    if (!result?.uri) {
      return { paused: !activeTasks.has(record.id) };
    }

    return { localUri: result.uri, paused: false };
  } finally {
    if (activeTasks.get(record.id) === task) {
      activeTasks.delete(record.id);
    }
  }
}

export async function pauseDownload(id: string): Promise<DownloadPauseSnapshot | null> {
  const task = activeTasks.get(id);
  if (!task) return null;

  const snapshot = await task.pauseAsync();
  activeTasks.delete(id);

  return {
    destinationUri: snapshot.fileUri || task.fileUri,
    resumeData: snapshot.resumeData,
  };
}

export async function cancelDownload(id: string) {
  const task = activeTasks.get(id);
  if (!task) return;
  activeTasks.delete(id);
  await task.cancelAsync();
}

export async function saveDownloadedFileToGallery(localUri?: string) {
  if (!localUri) {
    throw new Error('فایل کامل هنوز روی گوشی موجود نیست.');
  }

  const permission = await requestPermissionsAsync(true, ['video']);
  if (permission.status !== 'granted') {
    throw new Error('اجازه ذخیره ویدئو در گالری داده نشد.');
  }

  await Asset.create(localUri);
}

export async function removeDownloadedFile(localUri?: string, destinationUri?: string) {
  const targets = [...new Set([localUri, destinationUri].filter(Boolean) as string[])];
  await Promise.all(
    targets.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)),
  );
}
