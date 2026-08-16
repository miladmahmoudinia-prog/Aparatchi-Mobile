from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label} mismatch: expected 1, got {count}')
    return text.replace(old, new, 1)

path = Path('App.tsx')
text = path.read_text(encoding='utf-8')

old = """  const startupStartedAtRef = useRef(Date.now());
  const startupDismissedRef = useRef(false);
  const startupDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
"""
new = """  const startupStartedAtRef = useRef(Date.now());
  const startupDismissedRef = useRef(false);
  const startupDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupFallbackContentRef = useRef<LoadedContent | null>(null);
"""
text = replace_once(text, old, new, 'startup fallback ref')

old = """        const freshContentPromise = loadContent(false);
        const bootstrapContentPromise = loadBootstrapContent();
        let fallbackContent = firstContent;
"""
new = """        const freshContentPromise = loadContent(false);
        const bootstrapContentPromise = loadBootstrapContent().then((bootstrapContent) => {
          if (bootstrapContent?.items.length) startupFallbackContentRef.current = bootstrapContent;
          return bootstrapContent;
        });
        let fallbackContent = firstContent;
"""
text = replace_once(text, old, new, 'capture current bootstrap')

old = """    startupFallbackTimer = setTimeout(dismissStartup, 10000);
"""
new = """    startupFallbackTimer = setTimeout(() => {
      if (startupDismissedRef.current) return;
      const fallback = startupFallbackContentRef.current;
      if (fallback?.items.length) {
        const visibleFallback = visibleLoadedContent(fallback);
        if (visibleFallback.items.length) {
          contentRevisionRef.current = loadedContentRevision(visibleFallback);
          contentRef.current = visibleFallback;
          setContent(visibleFallback);
          setContentReady(true);
          setContentResolved(true);
        }
      }
      dismissStartup();
    }, 10000);
"""
text = replace_once(text, old, new, 'startup emergency fallback')

path.write_text(text, encoding='utf-8')
