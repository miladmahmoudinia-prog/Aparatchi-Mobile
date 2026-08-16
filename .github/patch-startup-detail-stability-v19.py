from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)

path = Path('App.tsx')
text = path.read_text(encoding='utf-8')

text = replace_once(
    text,
    "const STARTUP_MIN_VISIBLE_MS = 5000;\n\nfunction AppContent() {",
    """const STARTUP_MIN_VISIBLE_MS = 5000;

const sameCatalogIdentityOrder = (left: CatalogItem[], right: CatalogItem[]) =>
  left.length === right.length &&
  left.every((item, index) =>
    item.type === right[index]?.type && String(item.id) === String(right[index]?.id),
  );

function AppContent() {""",
    'catalog identity helper',
)

anchor = """      if (visibleContent.source === 'remote') {
        void syncEpisodeAlerts(visibleContent.items, true);
      }
      return true;
    };

    try {
"""
replacement = """      if (visibleContent.source === 'remote') {
        void syncEpisodeAlerts(visibleContent.items, true);
      }
      return true;
    };

    const mergeSupplementalContent = (nextContent: LoadedContent) => {
      const visibleNext = visibleLoadedContent(nextContent);
      if (!visibleNext.items.length) return false;

      const current = contentRef.current;
      if (!sameCatalogIdentityOrder(current.items, visibleNext.items)) {
        return applyContent(nextContent);
      }

      // Bootstrap and full index intentionally share the same catalog identity
      // and ordering. Keep the already-painted bootstrap item objects so a later
      // 10+ MB index download cannot visibly rebuild Home; merge only global
      // supplemental indexes/schedules needed by search, people and IMDb.
      const merged: LoadedContent = {
        ...visibleNext,
        items: current.items,
      };
      contentRevisionRef.current = loadedContentRevision(visibleNext);
      contentRef.current = merged;
      startTransition(() => setContent(merged));
      lastContentLoadRef.current = Date.now();
      setContentReady(true);
      setContentResolved(true);
      if (visibleNext.source === 'remote') {
        void syncEpisodeAlerts(visibleNext.items, true);
      }
      return true;
    };

    try {
"""
text = replace_once(text, anchor, replacement, 'supplemental full-index merge')

old_cold = """      if (initialLoad && online && firstContent.source !== 'remote') {
        const freshContentPromise = loadContent(false);
        const bootstrapContentPromise = loadBootstrapContent().then((bootstrapContent) => {
          if (bootstrapContent?.items.length) startupFallbackContentRef.current = bootstrapContent;
          return bootstrapContent;
        });
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
new_cold = """      if (initialLoad && online && firstContent.source !== 'remote') {
        // Start both requests together, but the ~4-6 MB current bootstrap owns
        // first paint. Waiting for the 10+ MB full index here made first install
        // sit behind Splash for tens of seconds on real devices.
        const freshContentPromise = loadContent(false);
        const bootstrapContent = await loadBootstrapContent();

        if (bootstrapContent?.items.length) {
          startupFallbackContentRef.current = bootstrapContent;
          applyContent(bootstrapContent);
          dismissStartup();

          // The full index still downloads/caches in the background. If it is
          // the same catalog (normal case), do not replace the visible item
          // array; only merge supplemental indexes. A genuinely changed catalog
          // is still applied in full.
          void freshContentPromise
            .then((freshContent) => {
              if (freshContent.source !== 'local') mergeSupplementalContent(freshContent);
            })
            .catch(() => undefined);
          return;
        }

        // If both remote bootstrap mirrors fail, never reveal the bundled demo
        // catalog as if it were current. Leave a truthful empty state after the
        // bounded startup cover while the full index keeps trying in background.
        const emptyFallback: LoadedContent = { ...firstContent, items: [] };
        contentRevisionRef.current = loadedContentRevision(emptyFallback);
        contentRef.current = emptyFallback;
        setContent(emptyFallback);
        setContentReady(false);
        setContentResolved(true);
        dismissStartup();
        void freshContentPromise
          .then((freshContent) => {
            if (freshContent.source !== 'local') applyContent(freshContent);
          })
          .catch(() => undefined);
        return;
      }
"""
text = replace_once(text, old_cold, new_cold, 'bootstrap-first cold start')

old_detail = """  // catalog-index is only a summary. Never render that summary as if its media
  // were complete. As soon as the selected detail object is hydrated React
  // renders the real actions/episodes directly; no InteractionManager/scroll
  // event is allowed to gate their visibility.
  const detailBodyReady = Boolean(item && (!item.detailPath || item.detailLoaded === true));
"""
new_detail = """  // Client summaries now carry truthful lightweight movie actions and bounded
  // episode previews. Use that real media immediately so hydration only enriches
  // metadata/qualities and never changes the page's primary layout.
  const detailBodyReady = Boolean(
    item && (!item.detailPath || item.detailLoaded === true || (item.downloads?.length || 0) > 0),
  );
"""
text = replace_once(text, old_detail, new_detail, 'summary-ready detail layout')

old_sections = """            <Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : `داستان ${item.nameFa}`}</Text><Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>
            <PeopleSection item={item} onOpen={onOpenPerson} />
            <MovieCollectionSection item={item} catalog={catalog} onOpen={onOpenRelated} />
            <RelatedTitlesSection item={item} catalog={catalog} onOpen={onOpenRelated} />
            {item.type === 'series' && episodeGroups.length ? (
              <SeriesEpisodeShowcase
                item={item}
                onPlay={(group) => onStream(item, group)}
                onOpenDownloads={(group) => { setDownloadInitialGroup(group.id); setDownloadSheetOpen(true); }}
                onOpenOperator={(file) => onOperatorOpen(item, file)}
              />
            ) : null}
"""
new_sections = """            <Text style={styles.detailSectionTitle}>{isReligiousItem(item) ? 'درباره مجموعه' : `داستان ${item.nameFa}`}</Text><Text style={styles.detailOverview}>{catalogOverviewFor(item)}</Text>
            {item.type === 'series' && episodeGroups.length ? (
              <SeriesEpisodeShowcase
                item={item}
                onPlay={(group) => onStream(item, group)}
                onOpenDownloads={(group) => { setDownloadInitialGroup(group.id); setDownloadSheetOpen(true); }}
                onOpenOperator={(file) => onOperatorOpen(item, file)}
              />
            ) : null}
            <PeopleSection item={item} onOpen={onOpenPerson} />
            <MovieCollectionSection item={item} catalog={catalog} onOpen={onOpenRelated} />
            <RelatedTitlesSection item={item} catalog={catalog} onOpen={onOpenRelated} />
"""
text = replace_once(text, old_sections, new_sections, 'stable series episode placement')

path.write_text(text, encoding='utf-8')
