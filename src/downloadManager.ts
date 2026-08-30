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
  /** تصویر پوستر یا بندانگشتی برای نمایش آفلاین در صفحه دریافت‌ها. */
  artwork?: string;
  /** نوع محتوای اصلی برای نمایش دقیق اطلاعات فیلم یا سریال. */
  mediaType?: 'movie' | 'series';
  /** اطلاعات قسمت برای دانلودهای سریالی. */
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  language?: 'dubbed' | 'subtitled';
  localUri?: string;
  destinationUri?: string;
  resumeData?: string;
  fileName?: string;
  progress: number;
  bytesWritten?: number;
  totalBytes?: number;
  status: DownloadStatus;
  error?: string;
  responseStatus?: number;
  mimeType?: string;
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
  destinationUri?: string;
  resumeData?: string;
  error?: string;
  unavailable?: boolean;
  responseStatus?: number;
  mimeType?: string;
};

const DOWNLOAD_DIRECTORY = `${FileSystem.documentDirectory}aparatchi-downloads/`;
const DATABASE_FILE = `${FileSystem.documentDirectory}aparatchi-downloads.json`;
const activeTasks = new Map<string, any>();
const MIN_VALID_VIDEO_BYTES = 256 * 1024;
const VIDEO_EXTENSION_RE = /\.(?:mp4|m4v|mov|webm|mkv)(?:$|[?#])/i;
const INVALID_CONTENT_TYPE_RE = /(?:text\/html|text\/plain|application\/(?:json|xml)|text\/xml)/i;

const hasVideoExtension = (...values: Array<string | undefined>) => values.some((value) =>
  VIDEO_EXTENSION_RE.test(String(value || '').replace(/\.part(?=$|[?#])/i, '')),
);

const responseMimeType = (result: any) => String(
  result?.headers?.['content-type'] ||
  result?.headers?.['Content-Type'] ||
  result?.mimeType ||
  '',
).split(';')[0].trim().toLowerCase();

const responseStatusCode = (result: any) => Number(result?.status || result?.statusCode || 0);

const friendlyDownloadFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/unable to resolve host|no address associated|network request failed|socket|connection|offline|internet/i.test(message)) {
    return 'اینترنت قطع است؛ اینترنت را روشن کنید و برای ادامه دوباره بزنید.';
  }
  return message || 'دانلود متوقف شد.';
};

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

const finalDestinationFor = (record: DownloadRecord) => {
  const extension = extensionFromUrl(record.sourceUrl);
  const baseName = sanitizeName(record.fileName || `${record.title}-${record.quality}`);
  return `${DOWNLOAD_DIRECTORY}${baseName}-${sanitizeName(record.id)}${extension}`;
};

const destinationFor = (record: DownloadRecord) => {
  if (record.destinationUri) return record.destinationUri;
  return `${finalDestinationFor(record)}.part`;
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

    const normalized = parsed
      .filter((record) => record && typeof record.id === 'string')
      .map((record) => normalizeRecord(record as DownloadRecord));

    return Promise.all(normalized.map(async (record) => {
      if (record.status !== 'completed' || !record.localUri) return record;

      const fileInfo = await FileSystem.getInfoAsync(record.localUri).catch(() => null);
      const actualSize = Number((fileInfo as any)?.size || 0);
      const expectedSize = Math.max(0, Number(record.totalBytes || 0));
      const looksComplete = Boolean(
        fileInfo?.exists &&
        actualSize >= MIN_VALID_VIDEO_BYTES &&
        hasVideoExtension(record.localUri) &&
        !INVALID_CONTENT_TYPE_RE.test(String(record.mimeType || '')) &&
        (expectedSize <= 0 || actualSize >= expectedSize * 0.97),
      );

      if (looksComplete) {
        return {
          ...record,
          progress: 1,
          bytesWritten: actualSize,
          error: undefined,
        };
      }

      return {
        ...record,
        localUri: undefined,
        destinationUri: record.destinationUri || record.localUri,
        status: 'failed' as const,
        progress: expectedSize > 0 ? Math.max(0, Math.min(0.99, actualSize / expectedSize)) : 0,
        bytesWritten: actualSize,
        error: 'فایل دانلودشده ناقص یا حذف شده است؛ دانلود را دوباره ادامه دهید.',
      };
    }));
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
      return { paused: !activeTasks.has(record.id), destinationUri: destination };
    }

    const info = await FileSystem.getInfoAsync(result.uri);
    const actualSize = Number((info as any).size || 0);
    const expectedSize = Math.max(0, Number(record.totalBytes || 0));
    const status = responseStatusCode(result);
    const mimeType = responseMimeType(result);
    const invalidHttpStatus = status > 0 && status !== 200 && status !== 206;
    const invalidMimeType = Boolean(mimeType && INVALID_CONTENT_TYPE_RE.test(mimeType));
    const invalidFile = Boolean(
      !info.exists ||
      actualSize < MIN_VALID_VIDEO_BYTES ||
      !hasVideoExtension(result.uri, record.sourceUrl) ||
      invalidHttpStatus ||
      invalidMimeType,
    );

    if (invalidFile) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
      return {
        paused: false,
        unavailable: true,
        destinationUri: undefined,
        responseStatus: status || undefined,
        mimeType: mimeType || undefined,
        error: 'فایل این کیفیت در دسترس نیست.',
      };
    }

    if (expectedSize > 0 && actualSize < expectedSize * 0.97) {
      return {
        paused: true,
        destinationUri: result.uri,
        responseStatus: status || undefined,
        mimeType: mimeType || undefined,
        error: 'فایل هنوز کامل نشده است؛ ادامه دانلود را بزنید.',
      };
    }

    const finalDestination = finalDestinationFor(record);
    if (result.uri !== finalDestination) {
      await FileSystem.deleteAsync(finalDestination, { idempotent: true }).catch(() => undefined);
      await FileSystem.moveAsync({ from: result.uri, to: finalDestination });
    }
    return { localUri: finalDestination, destinationUri: finalDestination, paused: false, responseStatus: status || undefined, mimeType: mimeType || undefined };
  } catch (error) {
    const savable = typeof task.savable === 'function' ? task.savable() : null;
    return {
      paused: true,
      destinationUri: task.fileUri || destination,
      resumeData: savable?.resumeData || record.resumeData,
      error: friendlyDownloadFailure(error),
    };
  } finally {
    if (activeTasks.get(record.id) === task) {
      activeTasks.delete(record.id);
    }
  }
}

export async function pauseDownload(id: string): Promise<DownloadPauseSnapshot | null> {
  const task = activeTasks.get(id);
  if (!task) return null;

  // Remove it first so the UI can leave the "downloading" state even when
  // Android's network stack is stuck after a VPN/interface change.
  activeTasks.delete(id);
  const savable = typeof task.savable === 'function' ? task.savable() : null;
  const fallback: DownloadPauseSnapshot = {
    destinationUri: task.fileUri,
    resumeData: savable?.resumeData,
  };

  try {
    const snapshot = await Promise.race([
      task.pauseAsync(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (!snapshot) {
      void task.cancelAsync().catch(() => undefined);
      return fallback.destinationUri ? fallback : null;
    }
    return {
      destinationUri: snapshot.fileUri || fallback.destinationUri,
      resumeData: snapshot.resumeData || fallback.resumeData,
    };
  } catch {
    void task.cancelAsync().catch(() => undefined);
    return fallback.destinationUri ? fallback : null;
  }
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

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists || Number((info as any).size || 0) < MIN_VALID_VIDEO_BYTES || !hasVideoExtension(localUri)) {
    throw new Error('فایل ویدئویی کامل و معتبر نیست.');
  }

  await Asset.create(localUri);
}

export async function removeDownloadedFile(localUri?: string, destinationUri?: string) {
  const targets = [...new Set([localUri, destinationUri].filter(Boolean) as string[])];
  await Promise.all(
    targets.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)),
  );
}
