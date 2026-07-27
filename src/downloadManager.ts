import * as FileSystem from 'expo-file-system/legacy';

export type DownloadStatus = 'downloading' | 'completed' | 'failed';

export type DownloadRecord = {
  id: string;
  itemId: string;
  title: string;
  subtitle: string;
  quality: string;
  sourceUrl: string;
  localUri?: string;
  progress: number;
  status: DownloadStatus;
  error?: string;
  createdAt: string;
};

const DOWNLOAD_DIRECTORY = `${FileSystem.documentDirectory}aparatchi-downloads/`;
const DATABASE_FILE = `${FileSystem.documentDirectory}aparatchi-downloads.json`;

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

async function ensureDownloadDirectory() {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIRECTORY, { intermediates: true });
  }
}

export async function loadDownloadRecords(): Promise<DownloadRecord[]> {
  try {
    const info = await FileSystem.getInfoAsync(DATABASE_FILE);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(DATABASE_FILE);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record) => record && typeof record.id === 'string');
  } catch {
    return [];
  }
}

export async function saveDownloadRecords(records: DownloadRecord[]) {
  await FileSystem.writeAsStringAsync(DATABASE_FILE, JSON.stringify(records));
}

export async function downloadToApp({
  id,
  url,
  fileName,
  onProgress,
}: {
  id: string;
  url: string;
  fileName: string;
  onProgress: (progress: number) => void;
}) {
  await ensureDownloadDirectory();
  const extension = extensionFromUrl(url);
  const destination = `${DOWNLOAD_DIRECTORY}${sanitizeName(fileName)}-${sanitizeName(id)}${extension}`;

  const oldFile = await FileSystem.getInfoAsync(destination);
  if (oldFile.exists) await FileSystem.deleteAsync(destination, { idempotent: true });

  const task = FileSystem.createDownloadResumable(
    url,
    destination,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const progress = totalBytesExpectedToWrite > 0
        ? totalBytesWritten / totalBytesExpectedToWrite
        : 0;
      onProgress(Math.max(0, Math.min(1, progress)));
    },
  );

  const result = await task.downloadAsync();
  if (!result?.uri) throw new Error('فایل در دستگاه ذخیره نشد.');
  return result.uri;
}

export async function removeDownloadedFile(localUri?: string) {
  if (!localUri) return;
  await FileSystem.deleteAsync(localUri, { idempotent: true });
}
