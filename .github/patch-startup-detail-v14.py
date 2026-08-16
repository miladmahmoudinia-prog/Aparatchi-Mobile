from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label} mismatch: expected 1, got {count}')
    return text.replace(old, new, 1)

# 1) Preserve lightweight media already carried by catalog-index summaries.
service_path = Path('src/contentService.ts')
service = service_path.read_text(encoding='utf-8')

old = """    const collectionOrder = asNumber(
      item.collectionOrder ?? item.collection_order ?? item.collectionPart ?? item.collection_part,
      0,
    );

    return {
"""
new = """    const collectionOrder = asNumber(
      item.collectionOrder ?? item.collection_order ?? item.collectionPart ?? item.collection_part,
      0,
    );
    const summaryDownloads = Array.isArray(item.downloads)
      ? normalizeDownloads(item.downloads, iranian)
      : [];
    const rawSummaryStreamUrl = asString(item.streamUrl);
    const summaryStreamUrl = rawSummaryStreamUrl && isPlayableUrl(rawSummaryStreamUrl)
      ? rawSummaryStreamUrl
      : '';

    return {
"""
service = replace_once(service, old, new, 'summary media variables')

old = """      ...(declaredLanguages.length ? { availableLanguages: declaredLanguages } : {}),
      ...(type === 'series'
"""
new = """      ...(declaredLanguages.length ? { availableLanguages: declaredLanguages } : {}),
      ...(summaryDownloads.length ? { downloads: summaryDownloads } : {}),
      ...(summaryStreamUrl ? { streamUrl: summaryStreamUrl, streamMode: 'video' as const } : {}),
      ...(type === 'series'
"""
service = replace_once(service, old, new, 'summary media return')
service_path.write_text(service, encoding='utf-8')

# 2) On an online cold start, reveal the full current remote index normally.
# Bootstrap/persisted data remains fallback only if the full current index fails.
app_path = Path('App.tsx')
app = app_path.read_text(encoding='utf-8')
old = """      // On an online cold start, a persisted catalog is only a fallback. Never
      // commit it behind the five-second cover and then reveal stale Home rows.
      // Resolve the current Raw-first bootstrap first; the complete index starts
      // at the same time and replaces bootstrap as soon as it is ready.
      if (initialLoad && online && firstContent.source !== 'remote') {
        const freshContentPromise = loadContent(false);
        const bootstrapContent = await loadBootstrapContent();
        const currentBootstrapApplied = Boolean(bootstrapContent && applyContent(bootstrapContent));

        if (!currentBootstrapApplied) applyContent(firstContent);
        dismissStartup();

        void freshContentPromise
          .then((freshContent) => {
            if (freshContent.source !== 'local') applyContent(freshContent);
          })
          .catch(() => undefined);
        return;
      }
"""
new = """      // On an online cold start, bundled/persisted/bootstrap catalogs are fallback
      // only. Keep the branded cover up while the current Raw-first full index is
      // already downloading; normally reveal Home once that full truth is ready.
      // This prevents a visible bootstrap -> full-catalog jump after the splash.
      if (initialLoad && online && firstContent.source !== 'remote') {
        const freshContentPromise = loadContent(false);
        const bootstrapContentPromise = loadBootstrapContent();
        let fallbackContent = firstContent;

        try {
          const freshContent = await freshContentPromise;
          if (freshContent.source === 'remote' && applyContent(freshContent)) {
            dismissStartup();
            return;
          }
          fallbackContent = freshContent;
        } catch {
          // The current full index failed; use the current bootstrap below.
        }

        const bootstrapContent = await bootstrapContentPromise;
        const bootstrapApplied = Boolean(bootstrapContent && applyContent(bootstrapContent));
        if (!bootstrapApplied) applyContent(fallbackContent);
        dismissStartup();
        return;
      }
"""
app = replace_once(app, old, new, 'online cold-start truth branch')
app_path.write_text(app, encoding='utf-8')
