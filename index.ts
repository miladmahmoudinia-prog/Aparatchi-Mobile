import { registerRootComponent } from 'expo';
import { Fragment, createElement, forwardRef, isValidElement } from 'react';

// App.tsx is intentionally kept performance-focused and uses one outer FlatList
// on Home. On some Android builds a very tall ListHeaderComponent (hero + IMDb)
// can leave the first catalog cells waiting for a later list interaction even
// though their data already exists. Patch only that one recognisable Home list:
// keep the first four bounded rows in the eager header tree and leave every
// later row virtualized by the native FlatList.
const ReactNativeModule = require('react-native') as typeof import('react-native');
const NativeFlatList = ReactNativeModule.FlatList as any;

const emptySeparators = {
  highlight: () => undefined,
  unhighlight: () => undefined,
  updateProps: () => undefined,
};

const HomeAwareFlatList = forwardRef<any, any>((props, ref) => {
  const data = Array.isArray(props.data) ? props.data : [];
  const homeRows = Boolean(
    data.length >= 4 &&
    data[0]?.filter === 'latest' &&
    data[1]?.filter === 'updated' &&
    data.every((row: any) => row && typeof row.filter === 'string' && Array.isArray(row.items)),
  );

  if (!homeRows || typeof props.renderItem !== 'function') {
    return createElement(NativeFlatList, { ...props, ref });
  }

  const eagerRows = data.slice(0, 4);
  const deferredRows = data.slice(4);
  const originalHeader = isValidElement(props.ListHeaderComponent)
    ? props.ListHeaderComponent
    : typeof props.ListHeaderComponent === 'function'
      ? createElement(props.ListHeaderComponent)
      : props.ListHeaderComponent || null;

  const eagerNodes = eagerRows.map((item: any, index: number) => {
    const rendered = props.renderItem({ item, index, separators: emptySeparators });
    const key = typeof props.keyExtractor === 'function'
      ? props.keyExtractor(item, index)
      : String(item?.filter || index);
    return createElement(Fragment, { key: `home-eager-${key}` }, rendered);
  });

  const combinedHeader = createElement(Fragment, null, originalHeader, ...eagerNodes);

  return createElement(NativeFlatList, {
    ...props,
    ref,
    data: deferredRows,
    ListHeaderComponent: combinedHeader,
    // The four important rows are already mounted above. Keep the remaining
    // catalog bounded so this fix cannot turn Home into a full eager render.
    initialNumToRender: Math.min(Number(props.initialNumToRender || 2), 2),
    maxToRenderPerBatch: Math.min(Number(props.maxToRenderPerBatch || 2), 2),
  });
});

try {
  const descriptor = Object.getOwnPropertyDescriptor(ReactNativeModule, 'FlatList');
  if (!descriptor || descriptor.configurable !== false) {
    Object.defineProperty(ReactNativeModule, 'FlatList', {
      configurable: true,
      enumerable: true,
      value: HomeAwareFlatList,
    });
  }
} catch {
  // If a future React Native runtime freezes this export, fall back to the
  // untouched native FlatList rather than risking startup.
}

// catalog-stable/<identity>.json is a mutable pointer. A fixed query string can
// be cached by an intermediary and keep pointing to a rotated-away detail shard.
// Only these tiny pointer requests get a per-request cache buster; immutable
// detail JSON and the main catalog keep their existing cache/performance path.
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: any, init?: any) => {
  if (typeof input === 'string' && /\/catalog-stable\/[a-f0-9]{12}\.json(?:[?#]|$)/i.test(input)) {
    const separator = input.includes('?') ? '&' : '?';
    return nativeFetch(`${input}${separator}_aparatchi_pointer=${Date.now()}`, init);
  }
  return nativeFetch(input, init);
}) as typeof globalThis.fetch;

// Detail summaries deliberately do not contain downloads/episodes. The old
// 1.8s fallback could therefore render a summary as if it were a finished
// detail page while the real one-item shard was still loading. Keep that exact
// fallback from firing during the normal bounded detail recovery window. Once
// detailLoaded becomes true, DetailModal's own 80ms reveal path runs normally.
const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
globalThis.setTimeout = ((handler: any, timeout?: number, ...args: any[]) =>
  nativeSetTimeout(handler, timeout === 1800 ? 15_000 : timeout, ...args)) as typeof globalThis.setTimeout;

// Require App only after the narrow runtime compatibility hooks above are in
// place so App.tsx receives the Home-aware FlatList export from the beginning.
const App = require('./App').default;
registerRootComponent(App);
