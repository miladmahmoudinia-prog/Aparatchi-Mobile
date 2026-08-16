from pathlib import Path

path = Path('App.tsx')
text = path.read_text(encoding='utf-8')

old = "  const homeScrollOffsetRef = useRef(0);\n  const lastDeepLinkRef = useRef<{ key: string; receivedAt: number } | null>(null);"
new = "  const homeScrollOffsetRef = useRef(0);\n  const detailHistoryRef = useRef<CatalogItem[]>([]);\n  const lastDeepLinkRef = useRef<{ key: string; receivedAt: number } | null>(null);"
if text.count(old) != 1:
    raise SystemExit(f'detail history ref anchor mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

marker = "  useEffect(() => {\n    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {"
helpers = """  const openRootDetail = useCallback((nextItem: CatalogItem) => {
    detailHistoryRef.current = [];
    setSelectedItem(nextItem);
  }, []);

  const openNestedDetail = useCallback((nextItem: CatalogItem) => {
    const current = navigationStateRef.current.selectedItem;
    if (current && String(current.id) !== String(nextItem.id)) {
      detailHistoryRef.current = [...detailHistoryRef.current.slice(-19), current];
    }
    setSelectedItem(nextItem);
  }, []);

  const closeOrBackDetail = useCallback(() => {
    const previous = detailHistoryRef.current.pop() || null;
    setSelectedItem(previous);
  }, []);

""" + marker
if text.count(marker) != 1:
    raise SystemExit(f'BackHandler anchor mismatch: {text.count(marker)}')
text = text.replace(marker, helpers, 1)

old = "      if (state.selectedItem) { setSelectedItem(null); return true; }"
new = "      if (state.selectedItem) { closeOrBackDetail(); return true; }"
if text.count(old) != 1:
    raise SystemExit(f'hardware detail back mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

old = "        onClose={() => setSelectedItem(null)}"
new = "        onClose={closeOrBackDetail}"
if text.count(old) != 1:
    raise SystemExit(f'DetailModal close mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

old = "        onOpenRelated={setSelectedItem}"
new = "        onOpenRelated={openNestedDetail}"
if text.count(old) != 1:
    raise SystemExit(f'related navigation mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

root_count = text.count('onOpen={setSelectedItem}')
if root_count != 4:
    raise SystemExit(f'root detail open count mismatch: {root_count}')
text = text.replace('onOpen={setSelectedItem}', 'onOpen={openRootDetail}')

old = """        onOpenItem={(nextItem) => {
          setSelectedPerson(null);
          setSelectedItem(nextItem);
        }}"""
new = """        onOpenItem={(nextItem) => {
          setSelectedPerson(null);
          openNestedDetail(nextItem);
        }}"""
if text.count(old) != 1:
    raise SystemExit(f'person work detail navigation mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

old = """    if (linkedItem) {
      setSelectedPerson(null);
      setSelectedItem(linkedItem);
      navigateToTab('home');
"""
new = """    if (linkedItem) {
      setSelectedPerson(null);
      openRootDetail(linkedItem);
      navigateToTab('home');
"""
if text.count(old) != 1:
    raise SystemExit(f'deep link root detail mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

old = """  const openWatchHistoryRecord = (record: WatchHistoryRecord) => {
    if (record.completed) {
      const item = content?.items.find((candidate) => candidate.id === record.itemId);
      if (item) {
        setSelectedItem(item);
        return;
      }
    }
"""
new = """  const openWatchHistoryRecord = (record: WatchHistoryRecord) => {
    if (record.completed) {
      const item = content?.items.find((candidate) => candidate.id === record.itemId);
      if (item) {
        openRootDetail(item);
        return;
      }
    }
"""
if text.count(old) != 1:
    raise SystemExit(f'watch-history root detail mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
