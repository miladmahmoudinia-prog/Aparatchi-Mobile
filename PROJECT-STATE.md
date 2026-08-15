# وضعیت پایدار پروژه آپاراتچی

این فایل مرجع انتقال پروژه بین چت‌های ChatGPT است. قبل از هر تغییر، **حتماً HEAD فعلی `main` هر دو مخزن دوباره خوانده شود**؛ SHAهای این فایل فقط checkpoint هستند و ممکن است به‌خاطر GitHub Actions جلو رفته باشند.

## مخزن‌ها

- Mobile: `miladmahmoudinia-prog/Aparatchi-Mobile`
- Content: `miladmahmoudinia-prog/Aparatchi-Content`
- Branch هدف: `main`

## آخرین checkpoint هنگام ساخت این فایل

- Mobile `main`: `7bf7ee5b8a48c04d742389f36114e29625739c86`
  - message: `fix: keep catalog visible while remote refresh loads`
- Content `main`: `c13430e5a4583602e0cced1a152972d1562c8754`
  - message: `chore: advance oldest-year archive completion`

> این SHAها نقطهٔ ثبت وضعیت هستند، نه مجوز کار روی نسخهٔ قدیمی. همیشه HEAD جدید خوانده شود.

## قوانین قطعی کار

1. عکس‌ها و ویدئوهای APK قدیمی فقط برای بازبینی‌اند و **دلیل وجود باگ در کد جدید نیستند**.
2. قبل از اصلاح هر مورد، کد فعلی `main` بررسی و وضعیت آن مشخص شود: `حل شده / ناقص حل شده / هنوز مشکل دارد`.
3. فقط مواردی که واقعاً ناقص‌اند تغییر کنند؛ اصلاحات قبلی تکرار یا overwrite نشوند.
4. فقط Action مرتبط با همان اصلاح اجرا شود. اگر قرمز شد همان مورد تا سبز شدن ادامه پیدا کند.
5. Actions پشت‌سرهم poll نشوند.
6. **APK هرگز خودکار ساخته نشود.** فقط با دستور صریح کاربر برای گرفتن APK.
7. Performance و ظاهر فعلی اپ هنگام اصلاح باگ‌ها حفظ شود.
8. برای تغییرات بعدی فقط فایل‌های واقعاً تغییرکرده ملاک باشند؛ کل سورس بی‌دلیل بازنویسی نشود.
9. Content به‌صورت خودکار توسط Actions جلو می‌رود؛ قبل از هر کار Content HEAD باید دوباره خوانده شود.

## مرحلهٔ فعلی پروژه

مرحلهٔ فعلی: **بازبینی نهایی کدهای اصلاح‌شده + رفع فقط موارد باقی‌مانده**.

### 1) ویژه اینترنت همراه / Android Open With

هدف قطعی:
- Android برای لینک ویژه همراه از Native Expo Module استفاده کند:
  `modules/aparatchi-custom-tab/android/src/main/java/expo/modules/aparatchicustomtab/AparatchiCustomTabModule.kt`
- Custom Tab به یک browser package مشخص bind شود، session واقعی بسازد و با `setPackage(browserPackage)` باز شود.
- برای Android operator playback هیچ fallback عمومی به `Linking` / `WebBrowser` / Intent chooser باقی نماند.
- iOS می‌تواند از `WebBrowser` استفاده کند.

وضعیت آخرین audit قبل از ساخت این فایل: مسیر Android در کد بررسی شد و `AparatchiCustomTab.openAsync()` دیده شد؛ Native module نیز package-bound session داشت. بازبینی نهایی فقط باید مطمئن شود fallback عمومی Android دوباره وارد نشده است.

### 2) صفحه عنوان بدون لینک/قسمت

نمونه‌های APK قدیمی: `ویلای من`، `قلب یخی`، `درد مشترک`.

معماری اصلاح‌شده مورد انتظار:
- `src/contentService.ts` detail فعلی را می‌گیرد.
- در شکست detail، از `catalog-stable/<identity>.json` مسیر detail جدید را resolve می‌کند.
- CDN و GitHub Raw را به‌صورت mirror/recovery استفاده می‌کند.
- در `App.tsx` شکست hydration یک `loadContent(false, true)` برای index تازه انجام می‌دهد.
- Content برای عنوان‌ها stable pointer نگه می‌دارد.

Historical check:
- Content `Stable detail audit v3`, run `31875319073`: SUCCESS.

### 3) Performance کل اپ

اصلاحات مورد انتظار:
- Home rows در یک پاس ساخته شوند.
- `categoryKeys` سرور fast-path باشند.
- startup کل detail tree را scan/download نکند.
- در revision یکسان app tree بی‌دلیل replace نشود.
- BottomNavigation از `onPressIn` و `unstable_pressDelay={0}` استفاده کند.
- Stars فقط در نبود `itemIds` معتبر fallback scan انجام دهد.
- prefetch سنگین تصاویر وجود نداشته باشد.

هدف audit: هیچ full-catalog scan یا I/O سنگین در مسیر لمس/شروع Home باقی نماند.

### 4) Startup / Splash

قانون قطعی کاربر:
- Splash فقط تا آماده شدن حداقل محتوای لازم بماند.
- اگر Home آماده است، هیچ minimum اجباری چندثانیه‌ای نباشد.

Regression شناخته‌شده قبلی:
- `const minimumVisibleMs = 10000`
- fallback حدود ۱۵ ثانیه

نکته مهم: workflow/script قدیمی `redesign-startup-projectionist` قبلاً همین ۱۰ ثانیه را دوباره enforce می‌کرد. قبل از هر تغییر، HEAD فعلی و script/workflow آن بررسی شود تا fix مجدداً revert نشود.

### 5) پوسترهای سیاه/خالی هنگام اسکرول

هدف:
- Home و railهای حساس clipping نداشته باشند (`removeClippedSubviews={false}` جایی که لازم است).
- تغییرات بعدی این fix را برنگردانند.

### 6) اسکرول افقی / RTL

قانون معماری:
- روی ScrollView/FlatList جهت native با `direction: rtl` دستکاری نشود.
- برای شروع از راست از reverse data + `initialScrollIndex` یا یک `scrollToEnd` کنترل‌شده استفاده شود.
- `getItemLayout.length/offset` باید دقیقاً برابر `card width + gap` واقعی باشد.
- reverse + initial index نباید فضای خالی بزرگ بسازد.

بخش‌های الزامی audit:
- `HorizontalCatalog`
- `PeopleSection`
- Stars
- Star Works
- Related
- Collections
- Player Episodes
- Player Recommendations

Historical check:
- RTL Action run `31875399918`: SUCCESS.
- commit تاریخی مهم: `ed1ff11e9b2149fd9443b09c7e28517e6a476dd0`.

### 7) نام فارسی معتبر؛ بدون transliteration مصنوعی

قانون قطعی:
- اگر نام فارسی معتبر و قابل اعتماد وجود دارد، فارسی نمایش داده شود.
- اگر وجود ندارد، همان عنوان اصلی انگلیسی نمایش داده شود.
- **هرگز ترجمه/تلفظ آوایی مصنوعی تولید نشود.**

نمونهٔ حساس برای audit:
- `Surviving Paradise: A Family Tale`

Title repairهای قبلی چند مرحله داشته‌اند؛ سبز بودن تست به‌تنهایی کافی نیست. catalog فعلی و چند نمونه تصادفی باید مستقیم بررسی شوند.

### 8) Next Episode Overlay

هدف قطعی:
- پیشنهاد قسمت بعدی داخل خود video/player overlay باشد، نه پایین layout.
- نزدیک پایان قسمت ظاهر شود.
- countdown = 15s.
- دکمه بستن داشته باشد.
- با پایان countdown قسمت بعدی در همان Player باز شود.

### 9) سرعت تصاویر

هدف:
- `expo-image` با `memory-disk` cache.
- fallback برای TMDB proxy وجود داشته باشد.
- candidate/retry chain نباید درخواست‌های پشت‌سرهم و غیرضروری ایجاد کند.
- اولویت candidateها باید با منبع اصلی و دسترس‌پذیری واقعی سازگار باشد.

## مشکل فوری ثبت‌شده در آخرین APK مشاهده‌شده

کاربر تصویری فرستاد که Home ابتدا skeleton نشان می‌داد و بعد به پیام `فهرست محتوا خالی است` می‌رسید.

این مشاهده مربوط به APK نصب‌شده است و **نباید خودکار معادل وضعیت HEAD فعلی فرض شود**. هنگام ثبت این فایل، Mobile `main` به commit زیر رسیده بود:

`7bf7ee5b8a48c04d742389f36114e29625739c86` — `fix: keep catalog visible while remote refresh loads`

بنابراین قبل از هر اصلاح جدید باید بررسی شود این commit دقیقاً چه کرده و آیا مشکل empty catalog در کد فعلی حل شده ولی هنوز APK جدید گرفته نشده، یا هنوز مسیر دیگری باقی است.

## Content architecture مهم

- client index: `catalog-index.json`
- full catalog: `catalog.json`
- detail shards: `catalog-items/`
- stable pointers: `catalog-stable/`
- manifest: `catalog-manifest.json`
- Mobile source selection: `src/config.ts`
- Mobile hydration/recovery: `src/contentService.ts`

در بررسی Content، بزرگ بودن فایل‌ها یا محدودیت نمایش GitHub connector نباید با «فایل واقعاً خالی است» اشتباه گرفته شود؛ در صورت response مشکوک، از metadata/blob/raw endpoint یا روش دوم تأیید شود.

## روش شروع در هر چت جدید

وقتی کاربر گفت «پروژه آپاراتچی را ادامه بده»:

1. این فایل را از Mobile `main` بخوان.
2. HEAD واقعی Mobile و Content را دوباره بخوان.
3. اگر HEADها از checkpoint جلوترند، commitهای جدید مرتبط را بررسی کن.
4. از روی عکس APK قدیمی حکم به وجود باگ در HEAD نده.
5. دقیقاً از مرحلهٔ ثبت‌شده در این فایل ادامه بده؛ کارهای سبز/تأییدشده را بی‌دلیل تکرار نکن.
6. بعد از پایان یک milestone مهم، این فایل را کوتاه و دقیق به‌روزرسانی کن.
7. APK فقط با درخواست صریح کاربر.

## جملهٔ کوتاه برای چت جدید

`پروژه آپاراتچی را از PROJECT-STATE.md روی Mobile main ادامه بده؛ اول HEAD واقعی Mobile و Content را بخوان و هیچ اصلاح قبلی را بدون audit تکرار نکن.`
