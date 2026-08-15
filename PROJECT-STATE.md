# وضعیت پایدار پروژه آپاراتچی

این فایل حافظهٔ انتقال پروژه بین چت‌های ChatGPT است. هر چت جدید باید **اول این فایل و سپس HEAD واقعی `main` هر دو مخزن** را بخواند. وضعیت این فایل checkpoint است؛ اگر GitHub Actions یا commit جدیدی آمده باشد، HEAD واقعی اولویت دارد.

## مخزن‌ها

- Mobile: `miladmahmoudinia-prog/Aparatchi-Mobile`
- Content: `miladmahmoudinia-prog/Aparatchi-Content`
- Branch هدف: `main`

## checkpoint آخرین بازبینی — 2026-08-15

- Mobile HEAD قبل از همین به‌روزرسانی وضعیت: `0051de9d89f50488ae69b52cc10378c2f3e11bce`
  - `docs: add persistent Aparatchi project state`
- آخرین commit عملکردی Mobile قبل از فایل state:
  - `7bf7ee5b8a48c04d742389f36114e29625739c86`
  - `fix: keep catalog visible while remote refresh loads`
- Content HEAD هنگام آخرین بازبینی:
  - `c13430e5a4583602e0cced1a152972d1562c8754`
  - `chore: advance oldest-year archive completion`

> همیشه HEAD جدید دوباره خوانده شود. از SHAهای این فایل برای کار روی نسخهٔ قدیمی استفاده نشود.

---

# قوانین قطعی کار

1. اگر کاربر چند ایراد پشت سر هم می‌فرستد، تا وقتی نگفته «تموم شد» یا «اصلاح کن» هیچ کدی تغییر نکند و فقط ایرادها جمع شوند.
2. بعد از «اصلاح کن»، همهٔ موارد با هم بررسی شوند و قبل از تغییر مشخص شود: `از قبل حل شده / ناقص / هنوز خراب`.
3. هیچ موردی فقط از روی عکس APK قدیمی یا توضیح قبلی خراب فرض نشود؛ HEAD فعلی ملاک است.
4. فقط فایل‌های واقعاً لازم تغییر کنند؛ کل پروژه بازنویسی نشود.
5. Performance، ظاهر و رفتار قسمت‌های سالم حفظ شود و Regression ایجاد نشود.
6. قبل از اصلاح محتوا مشخص شود مشکل از Mobile است یا Content.
7. catalog/index/detailها نباید پاک، خالی یا ناقص شوند.
8. ساختار `catalog-index.json`، `catalog-items/`، `catalog-stable/` و `catalog-manifest.json` حفظ شود.
9. نام فارسی ساختگی، ترجمهٔ حدسی یا آوانویسی مصنوعی برای نمایش تولید نشود؛ اگر عنوان فارسی معتبر نداریم، عنوان اصلی بهتر است.
10. RTL، Player، image cache/proxy/fallback و detail recoveryهای فعلی بی‌دلیل دستکاری نشوند.
11. GitHub Action، Sync یا Build APK بدون دستور صریح کاربر اجرا نشود.
12. APK هرگز خودکار ساخته نشود.
13. Content ممکن است خودکار با Actions جلو برود؛ قبل از هر کار Content HEAD دوباره خوانده شود.
14. بعد از هر milestone اصلاح واقعی، همین `PROJECT-STATE.md` کوتاه و دقیق آپدیت شود.
15. در پایان کار فقط خلاصه شود: چه چیزی بررسی/اصلاح شد، چه فایل‌هایی تغییر کردند، commit چیست و APK جدید لازم هست یا نه.

---

# مرحلهٔ فعلی پروژه

مرحلهٔ فعلی: **بازبینی نهایی اصلاحات موجود + رفع فقط موارد واقعاً باقی‌مانده.**

در آخرین audit، بخش بزرگی از ایرادهای قبلی در HEAD فعلی از قبل رفع شده بودند؛ بنابراین نباید دوباره با راه‌حل جدید بازنویسی شوند.

---

# موارد تأییدشده در آخرین audit

## 1) Detail hydration / لینک یا قسمت خالی — حل‌شده در معماری فعلی

Mobile commitهای مهم:

- `020b62c5291a089f6ca2eb1501c87cb0a3678e78` — `fix: recover stale detail shards through stable pointers`
- `f63c1671e941df8664c08cde56b075fd4c30f5f7` — `fix: recover stale detail shards and media links`
- `1f4485cca8b8e1544e0bfbc65f199e823e7b5f6a` — `fix: add resilient detail hydration recovery patch`

رفتار فعلی مورد تأیید:

- `src/contentService.ts` در شکست detail مستقیم، identity دوازده‌کاراکتری را از مسیر immutable استخراج می‌کند.
- `catalog-stable/<identity>.json` را می‌خواند و pointer فعلی را validate می‌کند.
- detail immutable جدید را از mirrorهای remote می‌گیرد و نتیجهٔ معتبر را cache می‌کند.
- `loadContent(preferCache=false, forceRemote=false)` وجود دارد.
- `forceRemote=true` cache/conditional HTTP را دور می‌زند و catalog تازه می‌گیرد.
- اگر hydration detail با index قدیمی شکست بخورد، App یک بار catalog تازه می‌گیرد و دوباره تلاش می‌کند.
- catalog cache از v2 به v3 ارتقا یافته است.
- stable pointerها در Content واقعاً وجود دارند.

نتیجه: **معماری stale detail recovery در HEAD بررسی و تأیید شده؛ دوباره بازنویسی نشود مگر Regression جدید با HEAD فعلی ثابت شود.**

نمونه‌های تاریخی APK قدیمی مثل `ویلای من`، `قلب یخی` و `درد مشترک` به‌تنهایی دلیل خرابی HEAD فعلی نیستند.

---

## 2) Performance اصلی اپ — اصلاح‌شده و باید حفظ شود

commitهای مهم:

- `d3aa1096378e410046ecd8ee5fda70ef77a3e008` — `perf: unblock critical app interactions`
- `508b24ded137a5c764042b381aa44663b9c4044d` — `perf: add critical interaction patch`
- `274a65a14361d4c0568bbd50a62fad0d026f57fc` — `perf: consume compact people index lazily`

رفتارهای تأییدشده:

- `PosterCard` و Hero دیگر در `onPressIn` detail preload سنگین انجام نمی‌دهند؛ navigation اول انجام می‌شود.
- `categoryKeys` سرور fast-path است و اسکن/classification سنگین بی‌دلیل انجام نمی‌شود.
- Featured people از Content authoritative است؛ fallback فقط در نبود داده استفاده می‌شود.
- Star works فقط برای ستارهٔ انتخاب‌شده محاسبه می‌شود، نه همهٔ ستاره‌ها.
- people reverse index از ref فشرده (`string | number`) پشتیبانی می‌کند.
- Home category preview bounded/single-pass است.
- bulk image prefetch حذف شده و تصاویر visible با `expo-image` مدیریت می‌شوند.
- BottomNavigation از `onPressIn` و `unstable_pressDelay={0}` استفاده می‌کند؛ tab انتخاب‌شده disabled است.
- در revision یکسان، app tree بی‌دلیل replace نمی‌شود.
- اولین content usable قبل از dismiss startup اعمال می‌شود؛ refresh بعدی transition/background است.

نتیجه: **این مسیر Performance سالم است و نباید eager detail load، full-catalog scan، prefetch flood یا محاسبهٔ همهٔ Stars دوباره وارد شود.**

---

## 3) Startup / Splash — اصلاح‌شده

commitهای مهم:

- `931b0e37e13b8cf9d9c9b2550c58832a60cc00a8` — `fix: dismiss startup as soon as home is ready`
- `b248cbc162d1dd155ab1e09d6dbb593cdf04568b` — `feat: redesign startup as a cinema projectionist scene`

رفتار تأییدشده:

- minimum اجباری چندثانیه‌ای برای splash وجود ندارد.
- `dismissStartup()` مستقیم startup را مخفی می‌کند.
- fallback پنج‌ثانیه‌ای فقط برای جلوگیری از گیرکردن دائمی است.
- اگر bundled catalog موجود باشد، Home زود paint می‌شود و network refresh بعداً انجام می‌شود.
- اگر bundled catalog نباشد، startup تا remote attempt/fallback می‌ماند.

Regression قدیمی که نباید برگردد:

- `minimumVisibleMs = 10000`
- fallback حدود ۱۵ ثانیه
- workflow/script قدیمی `redesign-startup-projectionist` که ممکن بود ۱۰ ثانیه را دوباره enforce کند.

---

## 4) Home poster rails / پوستر خالی هنگام اسکرول — اصلاح‌شده

commit مهم:

- `58587db1ce69690399b8de04ecbe770c1520fdee` — `fix: keep Home poster rails mounted while scrolling`

تأیید شده:

- Home vertical list در محل‌های حساس `removeClippedSubviews={false}` دارد.
- railهای poster هنگام اسکرول نباید unmount/reload مخرب داشته باشند.

این fix نباید برای optimization ظاهری برگردانده شود.

---

## 5) RTL و ریل‌های افقی — اصلاح‌شده

commit مهم:

- `ed1ff11e9b2149fd9443b09c7e28517e6a476dd0` — `fix: keep media rails smooth while starting from right`

معماری تأییدشده:

- native `direction: rtl` روی ScrollView/FlatList به‌صورت عمومی استفاده نمی‌شود.
- FlatListها با reverse display data + `initialScrollIndex` از راست شروع می‌شوند.
- ScrollViewها در موارد لازم با `scrollToEnd` کنترل‌شده از راست شروع می‌شوند.
- broad `mediaRailRtl` direction حذف شده است.
- alignment کارت/عنوان‌ها اصلاح شده است.

بخش‌هایی که این رفتار باید در آنها حفظ شود:

- `HorizontalCatalog`
- People/Cast
- Stars و Star Works
- Related
- Collections
- Player Episodes
- Movie/Player recommendations

Regression ممنوع: فضای خالی بزرگ اول لیست، پرش، اسکرول معکوس غیرطبیعی یا برگرداندن `direction: rtl` عمومی.

---

## 6) IMDb / فارسی ساختگی — Mobile اصلاح شده؛ Content همچنان در هر تغییر title باید با نمونه واقعی audit شود

Mobile commit:

- `7d5731f36f4fa3207c13df31dc3d31bf19739516` — `fix: keep unknown IMDb titles in original English`

تأیید Mobile:

- fallback مصنوعی Latin→Persian برای نمایش حذف شده.
- ترتیب ترجیح: فارسی واقعی catalog / فارسی ranking / override معتبر؛ در غیر این صورت original English.

Content title logic چند مرحله اصلاح شده:

- `20d06c397c7319bfbb6db6a818ad8f010ed0943f` — transliteration-aware repair
- `f391d01ef9ba6ae57090bd789d0725c1e6138f72` — رد گسترده synthetic transliteration (بعداً مشخص شد بیش از حد broad است)
- `44271a065194e2095b74043e2aded2a2f19f0f3b` — conservative detection
- `3ec2e838aaae41a03bb114e9305b711d29ae8bc1` — `fix: preserve valid Persian proper-name titles`

قانون فعلی:

- transliteration helper داخلی فقط می‌تواند برای detection استفاده شود، نه fallback نمایش مصنوعی.
- Persian-origin هرگز صرفاً به‌خاطر شباهت آوایی synthetic فرض نشود.
- proper name کوتاه بی‌دلیل حذف نشود.
- full phrase transliteration مصنوعی می‌تواند reject شود.
- عنوان synthetic/generated باید به original title برگردد.

نمونه‌های proper-name که نباید قربانی detection شوند: `سیتا رامام`، `پینوکیو`، `راستین` و مشابه‌ها.

**وضعیت:** Mobile behavior تأیید شده؛ برای تغییرات بعدی Content title، چند نمونهٔ واقعی از catalog فعلی حتماً مستقیم بررسی شود. این بخش را «کاملاً بسته و غیرقابل بررسی» فرض نکن.

---

## 7) Next Episode Overlay — اصلاح‌شده

commit:

- `6e205875e494cbc14d39e3a9243d276c47088e29` — `feat: suggest next episode near playback end`

رفتار فعلی:

- episodeهای playable مرتب می‌شوند.
- قسمت فعال و قسمت بعدی پیدا می‌شود.
- نزدیک پایان پخش overlay داخل Player ظاهر می‌شود.
- countdown = 15 ثانیه.
- با صفر شدن، progress ذخیره و همان Player به قسمت بعدی می‌رود.
- دکمهٔ پخش دستی نیز همان مسیر را اجرا می‌کند.
- artwork قسمت بعد با `exactEpisodeArtworkFor` گرفته می‌شود.

---

## 8) Images / cache / fallback — معماری فعلی سالم است

commit مهم:

- `aefcc17b49afe00bd33fb8226169b8a309f0b163` — `fix: smooth progressive poster loading`
- `19d3dda7039805ebc15be2f1cc7154c1f8dee9f8` — مسیر proxy/fallback تصاویر TMDB

رفتار فعلی:

- `expo-image` با memory+disk cache.
- image instance بین fallback URLها بی‌دلیل با `key={remoteUrl}` remount نمی‌شود.
- `recyclingKey` پایدار دارد.
- TMDB proxy candidate قبل/کنار direct URL وجود دارد.
- bulk prefetch سنگین حذف شده.

در تغییرات آینده candidate/retry chain نباید request flood ایجاد کند.

---

## 9) catalog Content واقعاً خالی نیست — تأیید شده

در audit آخر Content repo شامل این ساختارها بود:

- `catalog-index.json` حدود 7.9 MB
- `catalog.json` حدود 43.3 MB
- `catalog-items/`
- `catalog-stable/`
- `catalog-manifest.json`
- `persian-title-cache.json`
- `tmdb-cache.json`
- sync reports/state

Content tree بررسی‌شده: `08a4797d9442685b3c82de2acbbcfaafa3a2890f`.

بنابراین پیام APK قدیمی `فهرست محتوا خالی است` نباید مساوی «فایل Content خالی شده» فرض شود.

Mobile functional commit مرتبط:

- `7bf7ee5b8a48c04d742389f36114e29625739c86` — `fix: keep catalog visible while remote refresh loads`

اگر کاربر هنوز در APK نصب‌شده empty catalog می‌بیند، اول مشخص شود APK قبل از این commit است یا نه. برای اثبات runtime جدید ممکن است **APK جدید لازم باشد، ولی فقط با درخواست صریح کاربر ساخته شود.**

---

# مواردی که هنوز باید در صورت گزارش کاربر با HEAD فعلی بررسی شوند

## ویژه اینترنت همراه / Android Open With

هدف قطعی:

- Android از Native Expo Module زیر استفاده کند:
  `modules/aparatchi-custom-tab/android/src/main/java/expo/modules/aparatchicustomtab/AparatchiCustomTabModule.kt`
- Custom Tab به browser package مشخص bind شود، session واقعی داشته باشد و با `setPackage(browserPackage)` باز شود.
- برای operator playback روی Android fallback عمومی `Linking` / `WebBrowser` / Intent chooser برنگردد.
- iOS می‌تواند `WebBrowser` داشته باشد.

در audit قبلی `AparatchiCustomTab.openAsync()` و package-bound session دیده شده بود. اگر دوباره این مورد گزارش شد، فقط HEAD فعلی مسیر Android audit شود؛ از نو بازنویسی نشود مگر fallback واقعاً برگشته باشد.

---

# قوانین محتوایی دائمی پروژه

## سریال‌ها

- سریال قدیمی: یک سریال باید تا حد ممکن کامل شود، سپس انتشار/حرکت به سریال بعدی.
- سریال در حال پخش: با آمدن قسمت جدید به‌روزرسانی شود و به بالای «به‌روزشده‌ها» بیاید.
- episode links هر قسمت فقط متعلق به همان قسمت باشد؛ لینک‌های قسمت‌ها قاطی نشوند.
- کاربر انتظار sync ساعتی دارد و نمی‌خواهد منطق صرفاً به window قدیمی 72h محدود شود.

## فیلم/سریال و لینک‌ها

- پخش آنلاین فقط وقتی media قابل پخش وجود دارد.
- برچسب «ویژه همراه/اینترنت همراه» فقط برای محتوای واقعاً operator-only.
- برای series header دکمهٔ عمومی و تکراری «پخش آنلاین/دانلود» لازم نیست؛ کنترل‌ها per-episode باشند.
- download هر episode فقط لینک‌های همان episode را نشان دهد.
- وضعیت free/purchase را قبل از هر تغییر از منطق فعلی HEAD بخوان؛ قوانین این بخش در طول پروژه تغییر کرده و نباید از حافظهٔ قدیمی به کد تحمیل شود.

## دسته‌بندی‌ها

قواعد تثبیت‌شده کاربر:

- دستهٔ مستقل «ژاپنی» حذف باشد؛ عناوین ژاپنی زیر خارجی.
- Kids برای محتوای کودکِ غیرانیمیشن هم وجود داشته باشد.
- برنامه/تاک‌شو/مسابقه در دستهٔ مناسب باشند و فیلم عادی وارد «مسابقه» نشود.
- «مذهبی» نباید فیلم عادی را اشتباهی بگیرد.
- Documentary و wildlife/documentary classification قاطی نشوند.
- animation-series و anime classification با نوع واقعی محتوا سازگار باشد.
- تعداد دسته‌ها بی‌دلیل زیاد نشود.

---

# UI/UX ثابت که نباید Regression پیدا کند

- سرعت لمس روی پوسترها، دسته‌بندی‌ها، «مشاهده همه»، Bottom Navigation و Stars بسیار مهم است.
- Dynamic title sizing برای عنوان‌های کوتاه/بلند حفظ شود.
- Back باید یک مرحله به view قبلی برگردد، نه چند undo متوالی.
- «ادامه تماشا» طبق درخواست کاربر حذف/غیرفعال بماند مگر بعداً صریحاً درخواست شود.
- offline برای stream/download باید پیام واضح روشن‌کردن اینترنت بدهد.
- play icon هر episode وسط و مرتب باشد.
- normal↔fullscreen Player نباید flash صفحهٔ زیرین ایجاد کند.
- ریل‌های فارسی از سمت راست شروع شوند و نرم باشند.
- poster fallback و cache فعلی حذف نشود.
- likes/comments فعلاً اضافه نشود.

---

# Player — جهت طراحی مورد انتظار کاربر

کاربر Player مرتب شبیه منطق Rubika می‌خواهد:

- با tap روی ویدئو controls ظاهر شوند و همراه timeline دوباره محو شوند.
- fullscreen/zoom مرتب و در جای ثابت.
- دکمه close جدا و منظم.
- lock در ناحیهٔ fullscreen/zoom برای قفل همهٔ controls.
- mute و volume controls.
- timeline و کنترل‌های پایین منظم.
- کیفیت‌ها به شکل جمع‌وجور و مناسب، نه overlay بسیار بزرگ.
- Next Episode فعلی حفظ شود.

اگر Player بعداً اصلاح شد، ویژگی‌های سالم فعلی (quality/fullscreen/lock/audio/episode selection/Next Episode) همزمان regression تست شوند.

---

# Stars / Cast

- actor page و actor image لازم است.
- TMDB enrichment workflow جداگانه وجود دارد.
- تصاویر actor باید تا حد امکان بدون VPN با cache/proxy قابل استفاده باشند.
- search by actor از compact `peopleWorks` reverse lookup استفاده می‌کند؛ full people array را دوباره روی هر summary embed نکن.

---

# IMDb Top 100 — قابلیت مورد درخواست

کاربر خواسته بخش برنامه هفتگی حذف/جایگزین شود و Top 100 IMDb برای فیلم و سریال وجود داشته باشد:

- خودکار به‌روزرسانی شود.
- اگر title در catalog موجود است، باز شود.
- اگر موجود نیست، پیام `هنوز به آپاراتچی اضافه نشده` نمایش داده شود.

قبل از پیاده‌سازی/تغییر این بخش، HEAD فعلی بررسی شود چون ممکن است بخشی از آن از قبل اضافه شده باشد.

---

# GitHub Actions / هزینه و Build

- سابقهٔ محدودیت GitHub Actions/storage وجود دارد؛ plan حدود 0.5 GB و budget صفر باعث block شدن runها شده بود.
- بنابراین workflowها بی‌دلیل اجرا نشوند.
- sync historically ساعتی بوده و workflowهای catalog/TMDB/APK جدا هستند.
- APK فقط وقتی کاربر صریحاً گفت ساخته شود.
- در آخرین audit **هیچ Action و هیچ APK اجرا/ساخته نشد.**

---

# آخرین نتیجهٔ کاری این چت

در audit آخر، بدون تغییر executable code، موارد زیر از روی HEAD بررسی شدند:

1. stale detail recovery → موجود و درست.
2. Performance interaction paths → اصلاحات اصلی موجود.
3. startup/splash → minimum اجباری حذف شده.
4. poster rails → clipping fix موجود.
5. RTL rails → معماری reverse/right-start موجود.
6. IMDb unknown title fallback → Mobile دیگر فارسی مصنوعی نمی‌سازد.
7. Next Episode → overlay/countdown و انتقال قسمت موجود.
8. image caching/fallback → معماری progressive/cache موجود.
9. Content catalog → فایل‌ها و detail/stable structure واقعاً موجود و catalog خالی نیست.

در آن audit هیچ executable file تغییر نکرد و هیچ Action/APK اجرا نشد. تنها کار بعدی این مرحله، ثبت همین وضعیت در `PROJECT-STATE.md` بود.

---

# روش شروع هر چت جدید

وقتی کاربر گفت «آپاراتچی را ادامه بده»:

1. `PROJECT-STATE.md` را از Mobile `main` بخوان.
2. HEAD واقعی Mobile و Content را بخوان.
3. اگر از checkpoint جلوترند، commitهای جدید مرتبط را audit کن.
4. screenshot/APK قدیمی را دلیل قطعی خرابی HEAD ندان.
5. موارد تأییدشده بالا را بی‌دلیل دوباره پیاده‌سازی نکن.
6. اگر کاربر چند ایراد می‌فرستد، فقط جمع کن تا بگوید «تموم شد/اصلاح کن».
7. بعد از اصلاح واقعی، همین فایل را دوباره آپدیت کن.
8. APK فقط با درخواست صریح.

## جملهٔ کوتاه برای چت جدید

`پروژه آپاراتچی را از PROJECT-STATE.md روی Mobile main ادامه بده؛ اول HEAD واقعی Mobile و Content را بخوان، اصلاحات تأییدشده را دوباره دستکاری نکن و بعد فقط موارد واقعاً باقی‌مانده را اصلاح کن.`
