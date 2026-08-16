import fs from 'node:fs/promises';

const appPath = new URL('../App.tsx', import.meta.url);
let source = await fs.readFile(appPath, 'utf8');

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(from, to);
};

replaceOnce(
`const itemLanguages = (item: CatalogItem): MediaLanguage[] =>
  LANGUAGE_ORDER.filter((language) =>
    (item.detailLoaded !== true && item.availableLanguages?.includes(language)) ||
    (item.downloads || []).some((section) =>
      section.files.some((file) =>
        !isOperatorFile(file) && file.language === language
      ),
    ),
  );`,
`const itemLanguages = (item: CatalogItem): MediaLanguage[] =>
  LANGUAGE_ORDER.filter((language) =>
    item.availableLanguages?.includes(language) ||
    (item.downloads || []).some((section) =>
      section.files.some((file) =>
        !isOperatorFile(file) && file.language === language
      ),
    ),
  );`,
  'truthful language badge',
);

source = source.replace(
  /const episodeShowcaseLabel = \(item: CatalogItem, group: DownloadSection, quran: boolean\) => \{[\s\S]*?\n\};\n\nconst /,
  `const episodeShowcaseLabel = (_item: CatalogItem, group: DownloadSection, quran: boolean) => {\n  const noun = quran ? 'جزء' : 'قسمت';\n  return \`${'${noun} ${toPersianDigits(Number(group.episodeNumber || 0))}'}\`;\n};\n\nconst `,
);
if (!source.includes("const episodeShowcaseLabel = (_item: CatalogItem")) {
  throw new Error('episode showcase label patch failed');
}

replaceOnce(
`          <Text numberOfLines={1} style={styles.episodeGroupSubtitle}>
            {cleanMediaLabel(group.subtitle) ||
              \`${'${toPersianDigits(languageGroups.length + (operatorFiles.length ? 1 : 0))} گزینه پخش یا دریافت'}\`}
          </Text>`,
`          <Text numberOfLines={1} style={styles.episodeGroupSubtitle}>
            {\`${'${toPersianDigits(languageGroups.length + (operatorFiles.length ? 1 : 0))} گزینه پخش یا دریافت'}\`}
          </Text>`,
  'remove episode secondary source title',
);

replaceOnce(
`                ) : (
                  <View style={styles.detailPreparing}>
                    <ActivityIndicator color={COLORS.gold} size="small" />
                    <Text style={styles.detailPreparingText}>در حال آماده‌کردن پخش و قسمت‌ها…</Text>
                  </View>
                )}`,
`                ) : (
                  <View style={styles.detailActions}>
                    <Pressable onPress={() => void shareCatalogItem(item)} style={styles.detailSecondaryButton}>
                      <Ionicons name="share-social-outline" color={COLORS.text} size={20} />
                    </Pressable>
                  </View>
                )}`,
  'silent detail hydration',
);

await fs.writeFile(appPath, source, 'utf8');
console.log('Applied UI batch v10');
