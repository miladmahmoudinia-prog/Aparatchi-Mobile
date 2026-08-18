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
const cleanText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const identityKey = (value: unknown) => cleanText(value)
  .toLowerCase()
  .normalize('NFKC')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();
const stripPersianCollectionPrefix = (value: unknown) =>
  cleanText(value).replace(/^مجموعه\s+/u, '').trim();
const englishCollectionBase = (value: unknown) => cleanText(value)
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b(?:collection|films?|movies?|trilogy|saga)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const englishMemberMatchesCollection = (item: AnyRecord) => {
  const member = identityKey(item?.name);
  const collection = identityKey(englishCollectionBase(item?.collectionName));
  if (!member || !collection) return false;
  return member === collection ||
    member.startsWith(`${collection} `) ||
    member.startsWith(`${collection}:`) ||
    member.startsWith(`${collection}-`);
};

const titleLooksLikeCollectionLeak = (item: AnyRecord) => {
  const titleFa = cleanText(item?.nameFa);
  if (!titleFa || !item?.collectionNameFa || !item?.collectionId) return false;

  if (/^مجموعه\s+/u.test(titleFa) && !/\bcollection\b/i.test(cleanText(item?.name))) {
    return true;
  }

  const titleKey = identityKey(stripPersianCollectionPrefix(titleFa));
  const collectionKey = identityKey(stripPersianCollectionPrefix(item?.collectionNameFa));
  if (!titleKey || !collectionKey || titleKey !== collectionKey) return false;
  return !englishMemberMatchesCollection(item);
};

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

const groupTitleLooksLikeMemberLeak = (group: AnyRecord) => {
  const titleFa = stripPersianCollectionPrefix(group?.titleFa);
  const titleKey = identityKey(titleFa);
  const collectionBase = identityKey(englishCollectionBase(group?.titleEn));
  if (!titleKey || !collectionBase) return false;

  for (const member of Array.isArray(group?.members) ? group.members : []) {
    const memberFa = stripPersianCollectionPrefix(member?.nameFa);
    if (!memberFa || identityKey(memberFa) !== titleKey) continue;
    const memberEn = identityKey(member?.name);
    if (!memberEn) continue;
    const sameFranchiseIdentity = memberEn === collectionBase ||
      memberEn.startsWith(`${collectionBase} `) ||
      memberEn.startsWith(`${collectionBase}:`) ||
      memberEn.startsWith(`${collectionBase}-`);
    if (!sameFranchiseIdentity) return true;
  }
  return false;
};

const repairDerivedCollectionFolderTitles = (groups: AnyRecord[]) => {
  for (const group of groups) {
    const firstFa = cleanText(group?.members?.[0]?.nameFa);
    const manufactured = `مجموعه ${firstFa || 'فیلم‌ها'}`;
    const titleFa = cleanText(group?.titleFa);
    const titleEn = cleanText(group?.titleEn);

    // Never manufacture a collection identity from a member. Keep a verified
    // Persian folder title when it is genuinely the franchise name; otherwise
    // the original collection title is safer than a wrong installment title.
    if (
      titleEn &&
      (!titleFa || titleFa === manufactured || groupTitleLooksLikeMemberLeak(group))
    ) {
      group.titleFa = titleEn;
    }
  }
};

const patchPosterCardTree = (
  node: unknown,
  originalItem: AnyRecord,
  displayItem: AnyRecord,
): unknown => {
  if (!isValidElement(node)) return node;

  const element = node as any;
  const props = (element.props || {}) as AnyRecord;
  const shouldProtectOwnTitle =
    props.item === originalItem &&
    typeof props.onOpen === 'function';

  const children = props.children;
  const patchedChildren = children == null
    ? children
    : Children.map(children, (child) => patchPosterCardTree(child, originalItem, displayItem));

  if (shouldProtectOwnTitle) {
    // Only the rendered card receives the display-safe copy. Its onOpen closure
    // still points at the original item, so detail/collection metadata remains
    // fully intact after the tap.
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
        if (!isCatalogItem(item) || !item.collectionNameFa || !item.collectionId) {
          return rendered;
        }

        const latinOwnTitle = hasLatinScript(item.nameFa) && hasPersianScript(item.collectionNameFa);
        const leakedCollectionTitle = titleLooksLikeCollectionLeak(item);
        if (!latinOwnTitle && !leakedCollectionTitle) return rendered;

        const displayItem = {
          ...item,
          collectionNameFa: undefined,
          ...(leakedCollectionTitle ? { nameFa: cleanText(item.name) || cleanText(item.nameFa) } : {}),
        };
        return patchPosterCardTree(rendered, item, displayItem);
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
