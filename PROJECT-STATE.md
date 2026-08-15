# وضعیت پایدار پروژه آپاراتچی

این فایل حافظهٔ انتقال پروژه بین چت‌های ChatGPT است. در هر چت جدید **اول این فایل و سپس HEAD واقعی `main` هر دو مخزن** خوانده شود؛ HEAD واقعی مقدم است چون Content می‌تواند خودکار جلو برود.

## مخزن‌ها
- Mobile: `miladmahmoudinia-prog/Aparatchi-Mobile`
- Content: `miladmahmoudinia-prog/Aparatchi-Content`
- Branch: `main`

## checkpoint — 2026-08-15
- آخرین commit عملکردی Mobile: `a45b6486ae5a3c67d3704079accfd4b7f6eafd86` — `fix: keep deferred detail repaint startup-safe [skip ci]`
- Content HEAD هنگام این checkpoint: `07db70dd0e2681603a6bc7bc9bbc4c786031793c` — `fix: sync language categories with media`
- commit اصلی اصلاح refresh دوبله در Content: `da08e72dbb5428aa7a832ea827b4a00abb2953af` — `fix: periodically recheck newly dubbed media [skip ci]`
- هیچ Action/Sync/APK به‌صورت دستی توسط ChatGPT اجرا نشد. اما commit بعدی Content یعنی `07db70d...` بدون `[skip ci]` روی push، workflowهای عادی مخزن را خودکار trigger کرد؛ در لحظهٔ این checkpoint، run شماره 219 از `Sync Upera Catalog` هنوز `in_progress` بود. قبل از کار بعدی HEAD Content دوباره خوانده شود.

---

# قوانین قطعی کار
1. اگر کاربر چند ایراد پشت سر هم می‌فرستد، تا «تموم شد» یا «اصلاح کن» فقط جمع شوند و هیچ تغییری داده نشود.
2. بعد از «اصلاح کن»، همهٔ موارد audit شوند و فقط مواردی تغییر کنند که روی HEAD فعلی واقعاً هنوز مشکل دارند.
3. screenshot/APK قدیمی به‌تنهایی اثبات خرابی HEAD فعلی نیست.
4. فقط فایل‌های لازم تغییر کنند؛ Performance، ظاهر و بخش‌های سالم حفظ شوند.
5. قبل از اصلاح محتوا مشخص شود مشکل Mobile است یا Content.
6. `catalog-index.json`، `catalog-items/`، `catalog-stable/`، `catalog-manifest.json` و catalog اصلی پاک/خالی/ناقص نشوند.
7. نام فارسی ساختگی/حدسی تولید نشود؛ فارسی معتبر، وگرنه عنوان اصلی.
8. RTL، Player، image cache/proxy/fallback و detail recovery بی‌دلیل بازنویسی نشوند.
9. GitHub Action، Sync یا Build APK بدون دستور صریح کاربر دستی اجرا نشود؛ APK هرگز خودکار ساخته نشود.
10. Content HEAD قبل از هر کار دوباره خوانده شود.
11. بعد از milestone واقعی همین فایل به‌روزرسانی شود.
12. پایان هر اصلاح: چه چیزی اصلاح شد، فایل‌های تغییرکرده، commit نهایی، و نیاز/عدم نیاز به APK.

---

# اصلاحات تأییدشده که نباید دوباره بازنویسی شوند

## Detail hydration / stale shard recovery
commitهای مهم Mobile: `020b62c...`, `f63c167...`, `1f4485c...`.
`src/contentService.ts` identity را از immutable detail می‌گیرد، `catalog-stable/<identity>.json` را دنبال می‌کند، remote mirror/cache v3/forceRemote retry دارد و App در stale-index یک fresh catalog retry محدود انجام می‌دهد.

## Performance
commitهای مهم: `d3aa109...`, `508b24d...`, `274a65a...`.
- navigation قبل از detail hydration؛ preload سنگین روی `onPressIn` برنگردد.
- `categoryKeys` fast path، compact `peopleWorks`، Stars lazy، Home bounded/single-pass حفظ شود.
- full catalog scan، bulk prefetch و request flood برنگردد.

## Startup / cold-start catalog
`931b0e3...`, `b248cbc...`, `1366f283...`.
- splash minimum چندثانیه‌ای ندارد؛ fallback فقط anti-stuck.
- bundled/local catalog در cold start قابل نمایش است و remote بعداً refresh می‌کند.

## RTL / rails
`58587db...` و `ed1ff11...`.
- `removeClippedSubviews={false}` در railهای حساس حفظ شود.
- broad native `direction: rtl` روی FlatList/ScrollView برنگردد؛ reverse-data/right-start یا `scrollToEnd` کنترل‌شده حفظ شود.

## IMDb / Persian title
Mobile `7d5731f...`: فارسی معتبر، وگرنه original English. transliteration فقط detection است، نه fallback نمایشی. proper-nameهایی مثل `سیتا رامام`، `پینوکیو` و `راستین` بی‌دلیل حذف نشوند.

## Next Episode / Images
- `6e20587...`: countdown پانزده‌ثانیه‌ای Next Episode حفظ شود.
- `aefcc17...`, `19d3dda...`: `expo-image` memory+disk cache، proxy/fallback و بدون bulk prefetch حفظ شود.

---

# milestone سه ایراد 2026-08-15

## 1) جزئیات تا اسکرول کامل paint نمی‌شد — Mobile
علامت: متن‌ها/دکمه‌ها/قسمت‌های صفحه Detail بعد از یک حرکت scroll تازه کامل دیده می‌شدند.
Audit نشان داد `loadCatalogItemDetail()` آبجکت جدید برمی‌گرداند و مشکل same-reference mutation نیست. `DetailModal` بخش سنگین را با `InteractionManager.runAfterInteractions` deferred reveal می‌کند؛ دادهٔ summary مثل English title از قبل وجود دارد، پس علامت با frame/repaint deferred Android سازگار بود.

اصلاح:
- `382d2e80af12542ae27f934789d7e3915a4c082a`
- hardening: `a45b6486ae5a3c67d3704079accfd4b7f6eafd86`
- فایل: `index.ts`
پس از callback تابعی `InteractionManager.runAfterInteractions` یک root frame commit در frame بعدی درخواست می‌شود تا state تازهٔ Modal بدون نیاز به scroll paint شود. App remount نمی‌شود؛ lazy detail، Player، RTL و image loading دست‌نخورده‌اند. override با `try/catch` محافظت شده است.
این مورد device-test نشده و برای تست واقعی APK جدید لازم است.

## 2) دوبله‌ای که بعداً اضافه می‌شود ممکن بود دوبله شناخته نشود — Content
Parser اصلی `scripts/sync-upera.mjs` در media audit version 8 از قبل دوبله/زیرنویس، group hint، audio/voice language و media معتبر را تشخیص می‌دهد. مشکل parser نبود؛ freshness بود: عنوانی که قبلاً با version فعلی audit شده، اگر Upera بعداً دوبله اضافه کند ممکن بود دوباره وارد media-language audit نشود.

اصلاح اصلی:
- `da08e72dbb5428aa7a832ea827b4a00abb2953af`
- فایل: `scripts/prepare-archive-backfill.mjs`
- helper با audit version 8 همسان شد.
- refresh دوره‌ای bounded اضافه شد: پیش‌فرض 6 فیلم خارجی در هر چرخه و حداکثر 12 outstanding، با اولویت source تازه‌تر؛ برای سریال فقط یک re-audit خارجیِ کامل/منتشرشده در هر زمان و اولویت با airing/recently-updated، تا archive completion عقب نیفتد.
- parser موازی یا حدس دوبله ساخته نشد؛ همان parser معتبر فعلی دوباره media واقعی را می‌خواند.

commit تکمیلی فعلی Content:
- `07db70dd0e2681603a6bc7bc9bbc4c786031793c`
- فایل: `scripts/client-catalog.mjs`
`availableLanguages` معتبر را با `categoryKeys/categoryLabels` همگام می‌کند؛ بنابراین `dubbed/subtitled` و `دوبله فارسی/زیرنویس فارسی` از media واقعی اضافه یا حذف می‌شوند و category قدیمیِ اشتباه باقی نمی‌ماند.

## 3) ویژه اینترنت همراه / Open With — سورس از قبل درست بود، APK نصب‌شده قدیمی است
Mobile source در `01a20b3cdff6608ee1ffd351036ee7c2121d6734` (`fix: pin operator custom tab activity`) مسیر Android را به browser package/component واقعی و Custom Tabs session مشخص pin می‌کند و operator playback به generic `Linking`/`WebBrowser` chooser fallback ندارد.
آخرین APK موفق auditشده روی HEAD `25366c3e1c581c36be2612e5e5e9b0674eddbb81` ساخته شده بود، یعنی قبل از این native fix. پس native source دوباره دستکاری نشد و APK جدید برای مشاهده/تست fix لازم است.

---

# قواعد محتوایی دائمی
- سریال قدیمی: یک عنوان تا حد ممکن کامل، بعد بعدی؛ airing با قسمت جدید به بالای updatedها.
- episode links قاطی نشوند؛ دانلود هر قسمت فقط لینک همان قسمت.
- sync مورد انتظار ساعتی است و نباید صرفاً به window 72h محدود شود.
- پخش آنلاین فقط با media واقعی؛ «ویژه همراه» فقط operator-only واقعی.
- series header دکمهٔ generic تکراری play/download نداشته باشد؛ کنترل‌ها per-episode.
- ژاپنی دستهٔ مستقل ندارد؛ زیر خارجی. Kids شامل non-animation child content هم باشد. فیلم عادی وارد مسابقه/مذهبی نشود. Documentary/Wildlife و Anime/Animation درست تفکیک شوند.

# UI/UX و Player که باید حفظ شود
- لمس پوستر/دسته/مشاهده همه/BottomNav/Stars سریع بماند.
- dynamic title sizing، Back یک‌مرحله‌ای، offline message، centered episode play icon، smooth fullscreen و poster fallback/cache حفظ شوند.
- «ادامه تماشا» و likes/comments تا درخواست جدید برنگردند.
- Player: tap controls/timeline، fullscreen/zoom، close، lock، mute/volume، compact quality UI و Next Episode فعلی regression نکنند.

# Stars / IMDb
- actor page/image و compact `peopleWorks` حفظ شود؛ full people array روی summary برنگردد.
- IMDb Top 100 فیلم/سریال: عنوان موجود باز شود، ناموجود پیام `هنوز به آپاراتچی اضافه نشده` بدهد؛ قبل از تغییر HEAD واقعی audit شود.

# شروع چت جدید
1. `PROJECT-STATE.md` از Mobile main.
2. HEAD واقعی Mobile و Content.
3. اگر Content از checkpoint جلوتر است commitهای جدید audit شوند.
4. اصلاحات تأییدشده بی‌دلیل تکرار نشوند.
5. اگر کاربر چند ایراد می‌فرستد فقط جمع شود تا «تموم شد/اصلاح کن».
6. APK فقط با دستور صریح.

جملهٔ کوتاه: `پروژه آپاراتچی را از PROJECT-STATE.md روی Mobile main ادامه بده؛ اول HEAD واقعی Mobile و Content را بخوان، اصلاحات تأییدشده را دوباره دستکاری نکن و فقط موارد واقعاً باقی‌مانده را اصلاح کن.`
