import * as FileSystem from 'expo-file-system/legacy';
import type { CatalogPayload } from './types';

// Only a complete, renamed generation is eligible for the first screen. A late
// writer with an older catalog date cannot replace a newer generation.
const root = FileSystem.documentDirectory;
const prefix = 'aparatchi-home-snapshot-v1-';
const generations = async () => root ? (await FileSystem.readDirectoryAsync(root))
  .filter(n => n.startsWith(prefix) && n.endsWith('.json')).sort().reverse() : [];

export async function saveStartupSnapshot(payload: CatalogPayload) {
  const time = Date.parse(payload.updatedAt);
  if (!root || !Number.isFinite(time) || !payload.items.length) throw new Error('No durable catalog');
  const key = prefix + String(time).padStart(16,'0') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const tmp = root + key + '.part';
  try {
    await FileSystem.writeAsStringAsync(tmp, JSON.stringify({ count: payload.items.length, payload }));
    await FileSystem.moveAsync({ from: tmp, to: root + key + '.json' });
  } finally {
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
  }
  // Leave the preceding complete generation available for recovery.
  for (const name of (await generations().catch(() => [])).slice(2)) {
    await FileSystem.deleteAsync(root + name, { idempotent: true }).catch(() => {});
  }
}

export async function readStartupSnapshot(floor: string) {
  for (const name of await generations().catch(() => [])) {
    const time = Number(name.slice(prefix.length, prefix.length + 16));
    if (time < Date.parse(floor)) continue;
    try {
      const entry = JSON.parse(await FileSystem.readAsStringAsync(root + name));
      const p: CatalogPayload = entry.payload;
      if (Array.isArray(p?.items) && p.items.length && p.items.length === entry.count && Date.parse(p.updatedAt) === time) {
        return { ...p, source: 'cache' as const };
      }
    } catch { /* Try the preceding committed generation. */ }
  }
  return null;
}
