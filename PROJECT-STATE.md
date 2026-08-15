# وضعیت پایدار پروژه آپاراتچی

این فایل حافظهٔ انتقال پروژه بین چت‌های ChatGPT است. در هر چت جدید **اول این فایل و سپس HEAD واقعی `main` هر دو مخزن** خوانده شود؛ HEAD واقعی مقدم است چون Content می‌تواند خودکار جلو برود.

## مخزن‌ها
- Mobile: `miladmahmoudinia-prog/Aparatchi-Mobile`
- Content: `miladmahmoudinia-prog/Aparatchi-Content`
- Branch: `main`

## checkpoint — 2026-08-15
- آخرین commit عملکردی Mobile: `ce8b0646b37db5442f9427ddbbb42300e297896b` — `fix: keep Home rails and detail links visible [skip ci]`
- Content HEAD هنگام این checkpoint: `7feeff1dbb49f9c9e6ff6454e1cbaeda72df0b79` — `chore: advance oldest-year archive completion`
- commit اصلی اصلاح refresh دوبله در Content: `da08e72dbb5428aa7a832ea827b4a00abb2953af` — `fix: periodically recheck newly dubbed media [skip ci]`
- هیچ Action/Sync/APK به‌صورت دستی توسط ChatGPT اجرا نشد.

---

# قوانین قطعی کار
1. اگر کاربر چند ایراد پشت سر هم می‌فرستد، تا «تموم شد» یا «اصلاح کن» فقط جمع شوند و هیچ تغییری داده نشود.
2. بعد از «اصلاح کن»، همهٔ موارد audit شوند و فقط مواردی تغییر کنند که روی HEAD فعلی واقعاً هنوز مشکل دارند.
3. screenshot/APK قدیمی به‌تنهایی اثبات خرابی HEAD فعلی نیست؛ ویدیوی تست دستگاه برای regression فعلی معتبر است.
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
`src/contentService.ts` detail یک عنوان را lazy می‌گیرد، cache دارد، CDN/Raw را موازی امتحان می‌کند، در stale shard از `catalog-stable/<identity>.json` استفاده می‌کند و App در شکست نهایی fresh catalog retry محدود دارد. full-catalog prefetch برنگردد.

## Performance
commitهای مهم: `d3aa109...`, `508b24d...`, `274a65a...`.
- navigation قبل از detail hydration؛ preload سنگین روی `onPressIn` برنگردد.
- `categoryKeys` fast path، compact `peopleWorks`، Stars lazy و Home bounded حفظ شوند.
- full catalog scan، bulk prefetch و request flood برنگردد.

## Startup / cold-start catalog
`931b0e3...`, `b248cbc...`, `1366f283...`.
- bundled/local catalog در cold start موجود است و remote بعداً refresh می‌کند.
- IMDb شرط آماده‌شدن catalog نیست.

## RTL / rails
`58587db...` و `ed1ff11...`.
- `removeClippedSubviews={false}` در railهای حساس حفظ شود.
- broad native `direction: rtl` روی FlatList/ScrollView برنگردد؛ reverse-data/right-start یا `scrollToEnd` کنترل‌شده حفظ شود.

## IMDb / Persian title
Mobile `7d5731f...`: فارسی معتبر، وگرنه original English. transliteration فقط detection است، نه fallback نمایشی.

## Next Episode / Images / Operator
- `6e20587...`: countdown پانزده‌ثانیه‌ای Next Episode حفظ شود.
- `aefcc17...`, `19d3dda...`: `expo-image` memory+disk cache، proxy/fallback و بدون bulk prefetch حفظ شود.
- `01a20b3...`: operator Custom Tab به browser واقعی pin شده؛ generic Open With برنگردد.

---

# milestone دوبله — 2026-08-15
Parser اصلی Content از media واقعی زبان را تشخیص می‌دهد. مشکل titleهایی که بعداً دوبله می‌شوند با refresh دوره‌ای bounded و همگام‌سازی `availableLanguages`/categoryKeys رفع شد.
- `da08e72dbb5428aa7a832ea827b4a00abb2953af` — `scripts/prepare-archive-backfill.mjs`
- `07db70dd0e2681603a6bc7bc9bbc4c786031793c` — `scripts/client-catalog.mjs`
حدس دوبله/زیرنویس یا parser موازی ساخته نشود.

---

# milestone Home + Detail — اصلاح قبلی ناکافی و hardening جدید 2026-08-15

## گزارش واقعی دستگاه بعد از `344da0b...`
کاربر با ویدیو تأیید کرد که workaround قبلیِ root-frame repaint کافی نبوده است:
- Home با وجود header/hero/IMDb، ردیف‌های اصلی کاتالوگ را در شروع ناقص/غایب نشان می‌داد و بعد از interaction/refresh ظاهر می‌کرد.
- روی Detail بعضی فیلم‌ها پخش آنلاین/دانلود غایب می‌ماند و بعد از refresh ظاهر می‌شد.
- خانوادهٔ همان علامت قبلاً روی قسمت‌های سریال هم دیده شده بود.
پس `344da0b...` دیگر به‌عنوان fix نهایی این regression در نظر گرفته نشود.

## Audit ریشه‌ای
- Home داده را از همان bundled/local catalog دارد؛ مشکل «منتظر IMDb بودن data» نیست.
- outer Home `FlatList` یک `ListHeaderComponent` بلند (Hero + IMDb) دارد و ردیف‌های مهم کاتالوگ cellهای بعد از header هستند. روی Android این ترکیب در APK تست‌شده می‌تواند اولین batch را تا interaction بعدی عقب بیندازد.
- `DetailModal` summary را عمداً بدون downloads/people می‌گیرد، اما یک fallback دقیقاً 1800ms بعد `detailBodyReady=true` می‌کرد؛ بنابراین اگر detail shard هنوز نرسیده بود، summary به‌اشتباه مثل صفحهٔ کامل render می‌شد و پخش/دانلود/قسمت‌ها غایب به نظر می‌رسیدند.
- `catalog-stable/<identity>.json` pointer قابل تغییر است؛ query ثابت می‌تواند توسط intermediary cache شود و recovery را به shard قدیمی بفرستد.

## اصلاح جدید
commit عملکردی:
- `ce8b0646b37db5442f9427ddbbb42300e297896b` — `fix: keep Home rails and detail links visible [skip ci]`
- فایل عملکردی: `index.ts`

رفتار جدید:
1. فقط Home `FlatList` با signature مشخص (`latest`, `updated`, Home rows) شناسایی می‌شود. چهار ردیف اول کاتالوگ که قبلاً initial batch بودند داخل header tree به‌صورت eager mount می‌شوند؛ بقیه همچنان با Native FlatList virtualized و bounded می‌مانند. full eager render اضافه نشده است.
2. workaround قبلیِ global `InteractionManager`/root repaint کاملاً حذف شد.
3. فقط requestهای کوچک `catalog-stable/<identity>.json` cache-buster per-request می‌گیرند تا pointer mutable از cache قدیمی نیاید؛ immutable detail JSON و catalog اصلی دست‌نخورده‌اند.
4. fallback دقیق 1800ms Detail تا 15s عقب برده شده تا summary فاقد links به‌عنوان detail کامل نمایش داده نشود. وقتی `detailLoaded=true` می‌شود، reveal عادی خود DetailModal انجام می‌شود.
5. Content repo، Player، RTL، image loading، download logic و classification دست‌نخورده‌اند.

این hardening روی سورس audit شده ولی device-test نشده است. برای تأیید روی گوشی APK تازه از Mobile HEAD لازم است؛ تا دستور صریح کاربر APK ساخته نشود.

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
- Player: tap controls/timeline، fullscreen/zoom، close، lock، mute/volume، compact quality UI و Next Episode regression نکنند.

# Stars / IMDb
- actor page/image و compact `peopleWorks` حفظ شود؛ full people array روی summary برنگردد.
- IMDb Top 100 فیلم/سریال: عنوان موجود باز شود، ناموجود پیام `هنوز به آپاراتچی اضافه نشده` بدهد.

# شروع چت جدید
1. `PROJECT-STATE.md` از Mobile main.
2. HEAD واقعی Mobile و Content.
3. اگر Content جلوتر است commitهای جدید audit شوند.
4. `344da0b...` برای Home/Detail fix نهایی محسوب نشود؛ وضعیت جدید از `ce8b064...` ادامه پیدا کند.
5. اصلاحات تأییدشده بی‌دلیل تکرار نشوند.
6. اگر کاربر چند ایراد می‌فرستد فقط جمع شود تا «تموم شد/اصلاح کن».
7. APK فقط با دستور صریح.

جملهٔ کوتاه: `پروژه آپاراتچی را از PROJECT-STATE.md روی Mobile main ادامه بده؛ اول HEAD واقعی Mobile و Content را بخوان، برای Home/Detail از ce8b064... ادامه بده و APK فقط با دستور صریح ساخته شود.`
