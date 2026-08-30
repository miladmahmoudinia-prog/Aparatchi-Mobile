import fs from 'node:fs';

const appPath = 'App.tsx';
const typesPath = 'src/types.ts';

let app = fs.readFileSync(appPath, 'utf8');
let types = fs.readFileSync(typesPath, 'utf8');

const replaceOnce = (source, from, to, label) => {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Patch target not found: ${label}`);
  return source.replace(from, to);
};

types = replaceOnce(
  types,
  "export type MediaLanguage = 'dubbed' | 'subtitled';",
  "export type MediaLanguage = 'dubbed' | 'subtitled' | 'original';",
  'MediaLanguage union',
);

app = replaceOnce(
  app,
  "const LANGUAGE_ORDER: MediaLanguage[] = ['dubbed', 'subtitled'];",
  "const LANGUAGE_ORDER: MediaLanguage[] = ['dubbed', 'subtitled', 'original'];",
  'language order',
);

app = replaceOnce(
  app,
  "const languageTitle = (language: MediaLanguage) =>\n  language === 'dubbed' ? 'دوبله فارسی' : 'زیرنویس فارسی';",
  "const languageTitle = (language: MediaLanguage) =>\n  language === 'dubbed' ? 'دوبله فارسی' : language === 'subtitled' ? 'زیرنویس فارسی' : 'نسخه اصلی';",
  'language title',
);

app = replaceOnce(
  app,
  "    } else if (languages.includes('subtitled')) {\n      badges.push({ id: 'language', label: 'زیرنویس فارسی', kind: 'language' });\n    }",
  "    } else if (languages.includes('subtitled')) {\n      badges.push({ id: 'language', label: 'زیرنویس فارسی', kind: 'language' });\n    } else if (languages.includes('original')) {\n      badges.push({ id: 'language', label: 'نسخه اصلی', kind: 'language' });\n    }",
  'poster original badge',
);

app = replaceOnce(
  app,
  "      badge: language === 'dubbed' ? 'دوبله فارسی' : 'زیرنویس فارسی',",
  "      badge: languageTitle(language),",
  'download language badge',
);

fs.writeFileSync(appPath, app);
fs.writeFileSync(typesPath, types);
console.log('Original-language badge patch applied to mobile source.');
