# وضعیت پایدار پروژه آپاراتچی

این فایل حافظهٔ انتقال پروژه بین چت‌های ChatGPT است. هر چت جدید باید **اول این فایل و سپس HEAD واقعی `main` هر دو مخزن** را بخواند. HEAD واقعی همیشه از checkpoint این فایل معتبرتر است، چون Content ممکن است با GitHub Actions جلو برود.

## مخزن‌ها

- Mobile: `miladmahmoudinia-prog/Aparatchi-Mobile`
- Content: `miladmahmoudinia-prog/Aparatchi-Content`
- Branch هدف: `main`

## checkpoint آخرین milestone — 2026-08-15

- آخرین commit عملکردی Mobile قبل از همین state update:
  - `a45b6486ae5a3c67d3704079accfd4b7f6eafd86`
  - `fix: keep deferred detail repaint startup-safe [skip ci]`
- Content HEAD این milestone:
  - `da08e72dbb5428aa7a832ea827b4a00abb2953af`
  - `fix: periodically recheck newly dubbed media [skip ci]`
- هیچ GitHub Action، Sync یا Build APK در این milestone دستی اجرا نشد.

---

# قوانین قطعی کار

1. اگر کاربر چند ایراد پشت سر هم می‌فرستد، تا وقتی نگفته «تموم شد» یا «اصلاح کن» هیچ کدی تغییر نکند و فقط ایرادها جمع شوند.
2. بعد از «اصلاح کن»، همهٔ موارد با هم audit شوند و فقط مواردی تغییر کنند که در HEAD فعلی واقعاً هنوز مشکل دارند.
3. screenshot یا APK قدیمی به‌تنهایی دلیل خرابی HEAD فعلی نیست.
4. فقط فایل‌های واقعاً لازم تغییر کنند؛ کل پروژه بازنویسی نشود.
5. Performance، ظاهر و رفتار بخش‌های سالم حفظ شود.
6. قبل از اصلاح محتوا مشخص شود مشکل Mobile است یا Content.
7. `catalog-index.json`، `catalog-items/`، `catalog-stable/`، `catalog-manifest.json` و catalog اصلی نباید پاک/خالی/ناقص شوند.
8. نام فارسی ساختگی، ترجمهٔ حدسی یا آوانویسی مصنوعی برای نمایش تولید نشود؛ اگر فارسی معتبر نداریم، عنوان اصلی استفاده شود.
9. RTL، Player، image cache/proxy/fallback و detail recovery بی‌دلیل دستکاری نشوند.
10. GitHub Action، Sync یا Build APK بدون دستور صریح کاربر اجرا نشود؛ APK هرگز خودکار ساخته نشود.
11. قبل از هر کار Content HEAD دوباره خوانده شود.
12. بعد از هر milestone اصلاح واقعی همین فایل کوتاه و دقیق به‌روزرسانی شود.
13. پایان کار فقط شامل: چه چیزی اصلاح شد، چه فایل‌هایی تغییر کردند، commit نهایی و نیاز/عدم نیاز به APK باشد.

---

# مرحلهٔ فعلی

مرحلهٔ فعلی: **بازبینی نهایی روی HEAD واقعی + رفع فقط regressionهای باقی‌مانده.**

---

# معماری‌ها و اصلاحات تأییدشده که نباید دوباره بازنویسی شوند

## Detail hydration / stale shard recovery

commitهای مهم Mobile:

- `020b62c5291a089f6ca2eb1501c87cb0a3678e78`
- `f63c1671e941df8664c08cde56b075fd4c30f5f7`
- `1f4485cca8b8e1544e0bfbc65f199e823e7b5f6a`

رفتار فعلی:

- `src/contentService.ts` از detail immutable خراب/قدیمی identity را استخراج می‌کند.
- `catalog-stable/<identity>.json` را می‌خواند و به detail فعلی می‌رود.
- remote mirror + cache v3 + forceRemote retry وجود دارد.
- App در شکست hydration ناشی از index قدیمی یک fresh catalog load و retry محدود انجام می‌دهد.
- این معماری دوباره بازنویسی نشود مگر regression جدید روی HEAD ثابت شود.

## Performance

commitهای مهم:

- `d3aa1096378e410046ecd8ee5fda70ef77a3e008`
- `508b24ded137a5c764042b381aa44663b9c4044d`
- `274a65a14361d4c0568bbd50a62fad0d026f57fc`

حفظ شود:

- navigation قبل از detail hydration؛ preload سنگین روی `onPressIn` برنگردد.
- `categoryKeys` fast-path، compact `peopleWorks`، محاسبهٔ lazy Stars، Home bounded/single-pass.
- bulk image prefetch و full-catalog scan برنگردد.
- BottomNavigation سریع و revision یکسان بدون replace بی‌دلیل tree.

## Startup / cold-start catalog

commitهای مهم:

- `931b0e37e13b8cf9d9c9b2550c58832a60cc00a8`
- `b248cbc162d1dd155ab1e09d6dbb593cdf04568b`
- `1366f2839b3f1a28c2bb83da2f5609ac686fa69a` — `fix: keep cold-start catalog visible`

رفتار فعلی:

- splash minimum چندثانیه‌ای ندارد؛ fallback فقط anti-stuck است.
- نصب تازه در نبود cache دیگر به `items: []` برنمی‌گردد؛ bundled/local catalog فوراً قابل نمایش است و remote بعداً آن را جایگزین می‌کند.
- `getBundledContent()` و no-cache fallback دوباره به `unavailableLocalPayload()` برگردانده نشوند.

## Home poster rails / RTL

- `58587db1ce69690399b8de04ecbe770c1520fdee` — poster railها هنگام scroll unmount مخرب نداشته باشند.
- `ed1ff11e9b2149fd9443b09c7e28517e6a476dd0` — ریل‌های فارسی با reverse data/right-start یا `scrollToEnd` کنترل‌شده؛ broad `direction: rtl` روی FlatList/ScrollView برنگردد.
- این رفتار برای HorizontalCatalog، Cast/People، Stars، Related، Collections، Player Episodes و recommendations حفظ شود.

## IMDb / عنوان فارسی

- Mobile `7d5731f36f4fa3207c13df31dc3d31bf19739516`: اگر فارسی معتبر نیست original English نمایش داده شود.
- Content title detection نباید proper-nameهای معتبر مثل `سیتا رامام`، `پینوکیو` و `راستین` را فقط به دلیل شباهت آوایی حذف کند.
- transliteration helper فقط detection؛ نه تولید fallback نمایشی.

## Next Episode / Images

- `6e205875e494cbc14d39e3a9243d276c47088e29`: Next Episode با countdown 15 ثانیه حفظ شود.
- `aefcc17b49afe00bd33fb8226169b8a309f0b163` و `19d3dda7039805ebc15be2f1cc7154c1f8dee9f8`: `expo-image` memory+disk cache، proxy/fallback و بدون request flood حفظ شود.

---

# milestone جدید: سه ایراد گزارش‌شده در 2026-08-15

## 1) جزئیات بعد از اسکرول تازه کامل دیده می‌شد — Mobile اصلاح شد

علامت گزارش‌شده: در صفحهٔ جزئیات، بعضی متن‌ها/دکمه‌ها/قسمت‌ها تا یک حرکت scroll تازه روی صفحه paint می‌شدند.

Audit:

- `loadCatalogItemDetail()` آبجکت جدید برمی‌گرداند؛ مشکل same-reference mutation نبود.
- `DetailModal` بخش سنگین را با `InteractionManager.runAfterInteractions` به‌صورت deferred reveal می‌کند.
- دادهٔ summary مثل English title از قبل وجود دارد؛ بنابراین علامت «ظاهرشدن پس از scroll» با frame/repaint deferred روی Android سازگار بود، نه حذف داده.

اصلاح:

- `382d2e80af12542ae27f934789d7e3915a4c082a` و hardening بعدی `a45b6486ae5a3c67d3704079accfd4b7f6eafd86`.
- فایل عملکردی: `index.ts`.
- بعد از callbackهای تابعی `InteractionManager.runAfterInteractions` یک root frame commit در frame بعدی درخواست می‌شود تا state تازهٔ modal بدون نیاز به scroll روی Android paint شود.
- App remount نمی‌شود و state حفظ می‌شود؛ مسیر lazy detail، Player، RTL و image loading تغییر نکرد.
- override با `try/catch` محافظت شده تا runtimeای که InteractionManager را immutable ارائه می‌دهد startup را crash نکند.
- این اصلاح روی APK واقعی هنوز device-test نشده؛ برای دیدن آن APK جدید لازم است.

## 2) دوبله‌های جدید بعداً به عنوان دوبله شناخته نمی‌شدند — Content اصلاح شد

Audit:

- parser فعلی `scripts/sync-upera.mjs` در نسخهٔ media audit 8 از قبل دوبله/زیرنویس، group hint، audio/voice language و لینک‌های واقعی را تشخیص می‌دهد.
- `scripts/client-catalog.mjs` نیز `availableLanguages` و برچسب `دوبله فارسی/زیرنویس فارسی` را فقط از media معتبر می‌سازد؛ parser/client sanitization سالم بود و بازنویسی نشد.
- نقص واقعی freshness بود: عنوان سالمی که یک‌بار با audit version فعلی بررسی شده بود، اگر Upera بعداً نسخهٔ دوبله اضافه می‌کرد الزاماً دوباره وارد media-language audit نمی‌شد.

اصلاح Content:

- commit `da08e72dbb5428aa7a832ea827b4a00abb2953af`.
- فایل: `scripts/prepare-archive-backfill.mjs`.
- audit version این helper با parser اصلی از 6 به 8 همسان شد.
- هر چرخهٔ موجود فقط تعداد bounded از فیلم‌های خارجیِ سالم و قدیمی از نظر media audit را برای re-audit دوباره صف می‌کند؛ پیش‌فرض 6 فیلم و حداکثر 12 مورد outstanding، با اولویت sourceهای تازه‌تر.
- برای سریال خارجی فقط یک re-audit همزمان ایجاد می‌شود و اولویت با سریال در حال پخش/اخیراً به‌روزشده است تا archive completion با صف بزرگ خراب نشود.
- هیچ parser موازی و هیچ حدس دوبله ساخته نشده؛ همان parser معتبر فعلی دوباره media واقعی را می‌خواند.
- این تغییر خودش Sync را اجرا نکرد؛ اثر محتوایی آن در اجرای معمول بعدی workflow موجود اعمال می‌شود.

## 3) «ویژه اینترنت همراه» هنوز Open With نشان می‌داد — source فعلی از قبل اصلاح شده بود

Audit Mobile HEAD قبل از milestone:

- commit `01a20b3cdff6608ee1ffd351036ee7c2121d6734` — `fix: pin operator custom tab activity`.
- فایل native:
  `modules/aparatchi-custom-tab/android/src/main/java/expo/modules/aparatchicustomtab/AparatchiCustomTabModule.kt`
- Android به browser package مشخص bind می‌شود، real CustomTabs session می‌سازد، package/component را pin می‌کند و operator playback به generic `Linking`/`WebBrowser` chooser fallback نمی‌کند.

علت مشاهدهٔ chooser در تست کاربر:

- آخرین APK موفقی که audit شد روی HEAD `25366c3e1c581c36be2612e5e5e9b0674eddbb81` ساخته شده بود؛ این APK قبل از `01a20b3...` است.
- بنابراین برای این مورد فایل native دوباره دستکاری نشد؛ **APK جدید لازم است** تا fix موجود تست شود.

---

# قوانین محتوایی دائمی

## سریال‌ها

- سریال قدیمی: یک عنوان تا حد ممکن کامل شود، بعد صف به بعدی برود.
- سریال در حال پخش: قسمت جدید اضافه و عنوان به بالای updatedها برود.
- لینک‌های episodeها قاطی نشوند؛ download هر قسمت فقط لینک همان قسمت.
- sync مورد انتظار ساعتی است و منطق نباید صرفاً window قدیمی 72h باشد.

## Stream / Download / Operator

- پخش آنلاین فقط با media واقعی قابل پخش.
- «ویژه همراه» فقط برای operator-only واقعی.
- series header دکمهٔ تکراری generic play/download نداشته باشد؛ کنترل‌ها per-episode.
- free/purchase logic قبل از تغییر از HEAD واقعی audit شود؛ از حافظهٔ قدیمی تحمیل نشود.

## دسته‌بندی

- ژاپنی مستقل حذف؛ عناوین ژاپنی زیر خارجی.
- Kids شامل محتوای کودک غیرانیمیشن هم باشد.
- برنامه/تاک‌شو/مسابقه صحیح؛ فیلم عادی وارد مسابقه/مذهبی نشود.
- Documentary و wildlife درست تفکیک شوند.
- animation-series/anime با نوع واقعی سازگار باشد.
- دسته‌های اضافهٔ بی‌دلیل ساخته نشوند.

---

# UI/UX که باید حفظ شود

- سرعت لمس پوستر، دسته‌بندی، مشاهده همه، Bottom Navigation و Stars مهم است.
- Dynamic title sizing حفظ شود.
- Back یک مرحله برگردد.
- «ادامه تماشا» غیرفعال/حذف بماند مگر درخواست جدید.
- offline stream/download پیام واضح روشن‌کردن اینترنت بدهد.
- play icon episode وسط باشد.
- normal↔fullscreen Player flash صفحهٔ زیرین نداشته باشد.
- ریل‌های فارسی از راست و نرم.
- poster fallback/cache حفظ شود.
- likes/comments فعلاً اضافه نشود.

# Player — جهت طراحی ثابت

- tap controls را ظاهر و همراه timeline مخفی کند.
- fullscreen/zoom، close، lock، mute/volume و timeline مرتب باشند.
- quality UI جمع‌وجور باشد.
- Next Episode فعلی حفظ شود.
- هر تغییر Player باید quality/fullscreen/lock/audio/episode selection/Next Episode را regression-test کند.

# Stars / Cast

- actor page/image حفظ شود.
- TMDB enrichment جداگانه است.
- actor image تا حد امکان با cache/proxy بدون VPN.
- actor search از compact `peopleWorks` استفاده کند؛ full people array دوباره روی هر summary embed نشود.

# IMDb Top 100

- جای برنامه هفتگی/طبق طراحی فعلی Top 100 فیلم و سریال به‌روز باشد.
- عنوان موجود در catalog باز شود؛ عنوان ناموجود پیام `هنوز به آپاراتچی اضافه نشده` بدهد.
- قبل از تغییر دوباره HEAD فعلی audit شود.

# GitHub Actions / Build

- سابقهٔ محدودیت Actions/storage و budget صفر وجود دارد؛ workflow بی‌دلیل اجرا نشود.
- APK فقط با درخواست صریح ساخته شود.
- commitهای این milestone با `[skip ci]` نوشته شدند و هیچ Action/Sync/APK دستی اجرا نشد.

---

# روش شروع هر چت جدید

1. `PROJECT-STATE.md` را از Mobile `main` بخوان.
2. HEAD واقعی Mobile و Content را دوباره بخوان.
3. اگر از checkpoint جلوترند commitهای مرتبط را audit کن.
4. screenshot/APK قدیمی را دلیل قطعی خرابی HEAD ندان.
5. اصلاحات تأییدشده را بی‌دلیل دوباره پیاده‌سازی نکن.
6. اگر چند ایراد پشت سر هم می‌آید فقط جمع کن تا کاربر بگوید «تموم شد/اصلاح کن».
7. بعد از اصلاح واقعی همین فایل را به‌روزرسانی کن.
8. APK فقط با درخواست صریح.

## جملهٔ کوتاه برای چت جدید

`پروژه آپاراتچی را از PROJECT-STATE.md روی Mobile main ادامه بده؛ اول HEAD واقعی Mobile و Content را بخوان، اصلاحات تأییدشده را دوباره دستکاری نکن و بعد فقط موارد واقعاً باقی‌مانده را اصلاح کن.`
