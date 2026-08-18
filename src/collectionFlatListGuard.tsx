import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useMemo,
} from 'react';

declare const require: (name: string) => any;

type AnyRecord = Record<string, any>;

let collectionFolderScrollOffset = 0;
let installed = false;

const hasPersianScript = (value: unknown) => /[\u0600-\u06FF]/.test(String(value || ''));
const hasLatinScript = (value: unknown) => /[A-Za-z]/.test(String(value || ''));

const isCatalogItem = (value: unknown): value is AnyRecord => {
  if (!value || typeof value !== 'object') return false;
  const item = value as AnyRecord;
  return item.type === 'movie' || item.type === 'series';
};

const isCollectionFolderData = (value: unknown): value is AnyRecord[] => {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0] as AnyRecord | undefined;
  return Boolean(
    first &&
    Array.isArray(first.members) &&
    typeof first.id === 'string' &&
    typeof first.titleFa === 'string' &&
    typeof first.titleEn === 'string',
  );
};

const repairDerivedCollectionFolderTitles = (groups: AnyRecord[]) => {
  for (const group of groups) {
    const firstFa = String(group?.members?.[0]?.nameFa || '').trim();
    const manufactured = `مجموعه ${firstFa || 'فیلم‌ها'}`;
    const titleFa = String(group?.titleFa || '').trim();
    const titleEn = String(group?.titleEn || '').trim();

    // App.tsx historically manufactured a folder title from its first movie when
    // Persian collection metadata was missing. That swaps collection and movie
    // identity. Keep a real Persian collection title, otherwise use the original
    // collection name instead of borrowing an installment title.
    if (titleEn && (titleFa === manufactured || !titleFa)) {
      group.titleFa = titleEn;
    }
  }
};

const patchPosterCardTree = (node: unknown, originalItem: AnyRecord): unknown => {
  if (!isValidElement(node)) return node;

  const element = node as any;
  const props = (element.props || {}) as AnyRecord;
  const shouldProtectOwnTitle =
    props.item === originalItem &&
    typeof props.onOpen === 'function';

  const children = props.children;
  const patchedChildren = children == null
    ? children
    : Children.map(children, (child) => patchPosterCardTree(child, originalItem));

  if (shouldProtectOwnTitle) {
    // PosterCard's legacy fallback substitutes collectionNameFa whenever nameFa
    // contains Latin characters. Give only the rendered card a safe shallow copy;
    // onOpen remains the original closure/item so detail and collection metadata
    // are not lost after the tap.
    const displayItem = { ...originalItem, collectionNameFa: undefined };
    return cloneElement(element, { item: displayItem }, patchedChildren);
  }

  if (children !== patchedChildren) {
    return cloneElement(element, undefined, patchedChildren);
  }
  return element;
};

const makeGuardedFlatList = (OriginalFlatList: any) => {
  const GuardedFlatList = forwardRef<any, AnyRecord>((props, ref) => {
    const folderList = isCollectionFolderData(props.data);
    if (folderList) repairDerivedCollectionFolderTitles(props.data);

    const originalRenderItem = props.renderItem;
    const renderItem = useMemo(() => {
      if (typeof originalRenderItem !== 'function') return originalRenderItem;
      return (info: AnyRecord) => {
        const item = info?.item;
        const rendered = originalRenderItem(info);
        if (
          !isCatalogItem(item) ||
          !item.collectionNameFa ||
          !hasLatinScript(item.nameFa) ||
          !hasPersianScript(item.collectionNameFa)
        ) {
          return rendered;
        }
        return patchPosterCardTree(rendered, item);
      };
    }, [originalRenderItem]);

    const originalOnScroll = props.onScroll;
    const onScroll = useCallback((event: AnyRecord) => {
      if (folderList) {
        collectionFolderScrollOffset = Math.max(
          0,
          Number(event?.nativeEvent?.contentOffset?.y || 0),
        );
      }
      if (typeof originalOnScroll === 'function') originalOnScroll(event);
    }, [folderList, originalOnScroll]);

    const guardedProps = folderList
      ? {
          ...props,
          contentOffset: { x: 0, y: collectionFolderScrollOffset },
          onScroll,
          scrollEventThrottle: Math.min(Number(props.scrollEventThrottle || 32), 32),
          renderItem,
        }
      : { ...props, renderItem };

    return <OriginalFlatList {...guardedProps} ref={ref} />;
  });

  GuardedFlatList.displayName = 'AparatchiGuardedFlatList';
  return GuardedFlatList;
};

export function installCollectionFlatListGuard() {
  if (installed) return;

  const reactNative = require('react-native');
  const OriginalFlatList = reactNative.FlatList;
  if (!OriginalFlatList) return;

  const GuardedFlatList = makeGuardedFlatList(OriginalFlatList);
  const descriptor = Object.getOwnPropertyDescriptor(reactNative, 'FlatList');

  try {
    Object.defineProperty(reactNative, 'FlatList', {
      configurable: descriptor?.configurable !== false,
      enumerable: descriptor?.enumerable !== false,
      value: GuardedFlatList,
      writable: true,
    });
    installed = reactNative.FlatList === GuardedFlatList;
  } catch {
    try {
      reactNative.FlatList = GuardedFlatList;
      installed = reactNative.FlatList === GuardedFlatList;
    } catch {
      installed = false;
    }
  }

  if (!installed) {
    console.warn('[Aparatchi] collection FlatList guard could not be installed.');
  }
}
