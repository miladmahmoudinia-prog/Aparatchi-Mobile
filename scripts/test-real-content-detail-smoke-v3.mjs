const bases = [
  'https://cdn.jsdelivr.net/gh/miladmahmoudinia-prog/Aparatchi-Content@main/',
  'https://raw.githubusercontent.com/miladmahmoudinia-prog/Aparatchi-Content/main/',
];

const fetchJson = async (relative) => {
  let lastError;
  for (const base of bases) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${base}${relative}?smoke=${Date.now()}`, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${base}${relative}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error(`Could not fetch ${relative}`);
};

const fetchDetailWithStableRecovery = async (summary) => {
  try {
    return { detail: await fetchJson(summary.detailPath), recovered: false };
  } catch {
    const match = String(summary.detailPath || '').match(/(?:^|\/)([a-f0-9]{12})-[a-f0-9]{12}\.json$/i);
    if (!match) throw new Error(`Cannot derive stable identity from ${summary.detailPath}`);
    const pointerPath = `catalog-stable/${match[1].toLowerCase()}.json`;
    const pointer = await fetchJson(pointerPath);
    if (String(pointer?.id) !== String(summary.id) || String(pointer?.type) !== String(summary.type)) {
      throw new Error(`Stable pointer identity mismatch for ${summary.id}`);
    }
    const currentPath = String(pointer?.detailPath || '');
    if (!/^catalog-items\/[a-f0-9]{12}-[a-f0-9]{12}\.json$/i.test(currentPath)) {
      throw new Error(`Invalid stable pointer target for ${summary.id}: ${currentPath}`);
    }
    return { detail: await fetchJson(currentPath), recovered: true, pointerPath, currentPath };
  }
};

const fileUsable = (file) => {
  const url = String(file?.url || '');
  const mode = String(file?.mode || 'download');
  if (!/^https?:\/\//i.test(url)) return false;
  if (mode === 'play') return /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url);
  if (mode.startsWith('operator-')) return Boolean(file?.panelVerified && file?.operatorOnly);
  return /\.(?:mp4|m4v|mov|webm|mkv)(?:$|[?#])/i.test(url);
};

const index = await fetchJson('catalog-index.json');
const byId = new Map((index.items || []).map((item) => [String(item.id), item]));
const samples = [
  { id: 'af3f70e0-d919-11e8-962e-35c1bfc338e6', label: 'ویلای من', type: 'series', minEpisodes: 40 },
  { id: '7f0e60a0-e07b-11ea-83c4-2144b9a142fa', label: 'قلب یخی', type: 'series', minEpisodes: 54 },
  { id: '11d635d0-5419-11f1-aa16-612588af74c5', label: 'درد مشترک', type: 'movie', minFiles: 1 },
];

const results = [];
for (const sample of samples) {
  const summary = byId.get(sample.id);
  if (!summary) throw new Error(`${sample.label} is missing from catalog-index.json`);
  if (!summary.detailPath) throw new Error(`${sample.label} has no detailPath`);

  const resolved = await fetchDetailWithStableRecovery(summary);
  const detail = resolved.detail;
  if (String(detail.id) !== sample.id) throw new Error(`${sample.label} detail ID mismatch`);
  const sections = Array.isArray(detail.downloads) ? detail.downloads : [];
  const usableFiles = sections.flatMap((section) => section.files || []).filter(fileUsable);
  const usableEpisodes = new Set(
    sections
      .filter((section) => Number(section.episodeNumber || 0) > 0 && (section.files || []).some(fileUsable))
      .map((section) => `${Number(section.seasonNumber || 1)}:${Number(section.episodeNumber)}`),
  );

  if (sample.type === 'series' && usableEpisodes.size < sample.minEpisodes) {
    throw new Error(`${sample.label} expected >=${sample.minEpisodes} usable episodes, got ${usableEpisodes.size}`);
  }
  if (sample.type === 'movie' && usableFiles.length < sample.minFiles) {
    throw new Error(`${sample.label} has no usable movie media in resolved detail shard`);
  }
  results.push({
    label: sample.label,
    staleDetailPath: summary.detailPath,
    recoveredThroughStablePointer: resolved.recovered,
    currentDetailPath: resolved.currentPath || summary.detailPath,
    usableFiles: usableFiles.length,
    usableEpisodes: usableEpisodes.size,
  });
}

console.log(JSON.stringify({ realCurrentContent: true, stableRecoverySupported: true, results }, null, 2));
