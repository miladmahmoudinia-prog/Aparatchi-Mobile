# وضعیت پایدار پروژه آپاراتچی

این فایل حافظهٔ انتقال پروژه بین چت‌های ChatGPT است. در هر چت جدید اول این فایل و سپس HEAD واقعی `main` هر دو مخزن خوانده شود؛ HEAD واقعی مقدم است چون Content خودکار جلو می‌رود.

## مخزن‌ها
- Mobile: `miladmahmoudinia-prog/Aparatchi-Mobile`
- Content: `miladmahmoudinia-prog/Aparatchi-Content`
- Branch: `main`

## checkpoint — 2026-08-16
- آخرین commit عملکردی Mobile: `a6d07d05bcd89f9a307eca1beeff8b3079a1e5aa` — `fix: make startup refresh catalog truth before reveal [skip ci]`
- آخرین commit عملکردی Content برای catalog/bootstrap: `6b9213319fafaccad65ca953d452b7398368c227` — `fix: make bootstrap a complete navigation catalog [skip ci]`
- آخرین guard سازگاری Content: `55ee5235ec7a38a8661946a437f6af1c7bba2c2a`؛ workflowهای قدیمی دیگر bootstrap کامل را به sample 1.5MB برنمی‌گردانند.
- Workflow تأیید Mobile: `Fix truthful startup cache v6`, run `31909685745`.
- Workflow تأیید Content نهایی: `Fix fast movie media v2`, run `31909834507`.
- معیار این milestone فقط سبز بودن تست نیست: روی `catalog.json` واقعی، ۱۸۰ فیلم دوبلهٔ واقعی در منبع و client/bootstrap هر سه حفظ شده‌اند، `dubbedMoviesLost=0` و هیچ URL قابل‌استفاده‌ای بین source/detail/summary حذف نشده است.
- APK توسط ChatGPT ساخته نشد.


# milestone Fresh startup + truthful media/language v9 — 2026-08-16

## Mobile
- commit `8548dc0b4a0502a661033c02833b60cc4b9bd4b3`: online cold-start دیگر cache قدیمی Home را پشت splash پنج‌ثانیه‌ای commit/reveal نمی‌کند؛ bootstrap و catalog از GitHub Raw truth اول خوانده می‌شوند، VPN آیکون پخش را مخفی نمی‌کند و check هنگام tap باقی است.
- commit `0d31f88c1bfda68159d8a29fe09564c5953ab613`: stable detail pointer دیگر CDN قدیمی را بعد از 450ms برنده نمی‌کند؛ GitHub Raw با budget 1800ms منبع اول است و CDN فقط fallback است.
- workflowهای Mobile: `Fix visible media and fresh startup v7` run `31927500718` و `Fix truthful detail pointer v8` run `31927837640` هر دو success + typecheck/regressions سبز.

## Content / language truth
- Content functional commits نهایی این milestone: `0b145c3724ad9ca4240c33b8b08b6cc481827ec3` و `a941f5b1190d17448debf76b839ad3d05c9d61a6` برای catalog/generated artifacts + parser پایدار Upera.
- تشخیص دوبله دیگر از روی `-0-` حدس زده نمی‌شود؛ فقط title-level `dubbed=1` واقعی Upera اجازه می‌دهد primary media به dubbed برچسب بخورد. movie list sparse نیز برای truth عنوان detail fetch می‌شود؛ series از قبل detail fetch داشت.
- «تاج کامل / Perfect Crown»: 72 فایل دوبله و `availableLanguages=[dubbed]` روی HEAD فعلی.
- «برای دزد عزیزم»: دوبله + زیرنویس هر دو حفظ شده‌اند؛ verify فعلی 96 فایل dubbed و 56 فایل subtitled را دید.
- کنترل منفی «بدنم را از دست دادم / I Lost My Body»: dubbed=0 و subtitle-only باقی مانده؛ false Iranian dubbed badges=0.
- Current-HEAD read-only verify: `Verify current HEAD media and language truth v9`, run `31928516774`, success روی HEAD `4b4f2e292d7c2cdebdcff639c0ff80f9bacaaccc`.
- diagnostic واقعی فعلی: `sourceMediaTitlesMissingFromClient=0`, `sourceUrlsLostFromClientDetailTitles=0`, `sourceUrlsLostFromClientSummaryTitles=0`, `dubbedMoviesLost=0` و فیلم‌های دوبله source/client/bootstrap همگی `1415`.
- device samples مثل Yaksha، Toni Kroos، Prophet، Bécassine، DadShah و I Lost My Body در generated client truth پخش+دانلود معتبر دارند؛ فقط یک movie عادی قدیمی بدون action باقی مانده، بقیه no-actionهای شمرده‌شده operator-only هستند.
- APK در این milestone ساخته نشد؛ Mobile نصب‌شده تا build جدید این دو commit را ندارد.


# milestone UI truth + instant movie actions v10 — 2026-08-16

## Mobile
- functional commit `c8c1ce80e91172c654910335123883d2c7d60c08` — detail actions / episode-label / dubbed-only badge fix.
- workflow `Fix fast detail and episode UI v10`, run `31936501293`: v10 regression + TypeScript typecheck + startup/detail/media regressions success.
- dubbed-only badges keep `availableLanguages` authoritative after detail hydration.
- episode cards display only «قسمت N» (or «جزء N» for Quran); provider subtitle/code strings are not shown.
- visible detail hydration text was removed; heavier detail hydrates silently.

## Content
- functional commit `6ba46574bf17c3f1fc191f9abf1f699143f5c66a` — verified titles, immediate bootstrap movie actions, freshness guards and midpoint episode-frame source.
- workflow `Fix UI truth compact v10b`, run `31936711403`: full Content suite 96/96 success + real diagnostics success.
- verified `Twisted Metal` display title is `فلز درهم‌تنیده`; no generic guessed Persian-title generator was added.
- all 3539 media-equipped client movies have immediate lightweight bootstrap media (previously 112); bootstrap 4,803,827 bytes vs client index 12,044,656 bytes.
- media diagnostics: source/detail/summary URL loss = 0, dubbed loss = 0, source/client/bootstrap dubbed truth = 1415.
- default ordering remains real add/update freshness, not production year؛ new episode meaningful updates sort series to the front.
- episode frame generation probes duration and seeks around the 50% midpoint؛ UI accepts only exact generated episode artwork, not repeated series poster/backdrop.
- pre-fix audit had 2970 episode groups and 2970 missing generated artworks because hourly Sync was blocked by stale tests. Live Sync run `31936854471` passed the regression gate and entered real discovery. Historical artwork is backfilled by the bounded hourly artwork lane؛ do not mark all historical frames complete until a later audit confirms it.
- APK was not built.

---

# milestone Catalog truth + 5s startup — 2026-08-16

## گزارش واقعی دستگاه
- دستهٔ دوبله در اپ به حدود ۱۱ عنوان سقوط کرده بود.
- تعداد زیادی عنوان از دید کاربر پخش/دانلود نداشتند.
- Home روی داده/کش قدیمی مثل «بدنام»، «کلاغ» و موارد مشابه می‌ماند.
- درخواست کاربر: loading اولیه ۵ ثانیه باشد تا دادهٔ واقعی قبل از reveal فرصت بارگذاری داشته باشد.

## ریشه‌های اثبات‌شده
1. `catalog-bootstrap.json` قبلی عمداً فقط sample ردیف‌های Home/دسته‌ها را حمل می‌کرد؛ diagnostic واقعی نشان داد full client دارای ۱۸۰ فیلم دوبله است ولی bootstrap فقط ۸ فیلم دوبله داشت. Mobile همان bootstrap ناقص را موقتاً به‌عنوان `content.items` سراسری استفاده می‌کرد، پس دسته‌ها می‌توانستند ۸ تا حدود ۱۲ آیتم نشان دهند.
2. `manifestMatchesCachedContent` در Mobile حتی با `clientRevision` جدید، اگر `catalogVersion` و `catalogUpdatedAt` برابر بودند cache قدیمی را معتبر می‌دانست. بنابراین client artifact قدیمی/ناقص می‌توانست عملاً ماندگار شود.
3. startup در milestone قبلی بعد از ۲ ثانیه یا بلافاصله بعد از هر محتوای cache/bootstrap بسته می‌شد و full catalog فقط پس‌زمینه می‌آمد.
4. Manifest CDN می‌توانست از GitHub Raw عقب‌تر باشد و در مسیر sequential اول برنده شود.

## اصلاح Content
Content artifact commit: `6b9213319fafaccad65ca953d452b7398368c227`
- bootstrap دیگر sample دسته‌ها نیست؛ هر ۳۷۰۶ عنوان client-visible را برای navigation/search/category حمل می‌کند.
- آیتم‌های Home همچنان rich هستند؛ بقیه compact navigation metadata + `detailPath` دارند تا bootstrap زیر full index بماند.
- اندازهٔ تأییدشده: bootstrap = `3928462` bytes؛ full client index = `11846093` bytes.
- `scripts/fix-fast-movie-media-v2.mjs` rerun-safe شد و guardهای قدیمی 1.5MB به معیار کامل بودن navigation + سقف 5MB تغییر کردند تا workflow قبلی این اصلاح را پس نزند.

## اصلاح Mobile
Mobile commit: `a6d07d05bcd89f9a307eca1beeff8b3079a1e5aa`
- startup حداقل ۵۰۰۰ms نمایش داده می‌شود و fallback نیز ۵۰۰۰ms است.
- full catalog fetch هم‌زمان با bootstrap شروع می‌شود و دیگر پشت await bootstrap نمی‌ماند.
- وقتی manifest دارای `clientRevision` است، فقط تطابق دقیق همان revision cache را معتبر می‌کند؛ version/updatedAt دیگر mismatch را پنهان نمی‌کنند.
- برای manifest، GitHub Raw به‌عنوان truth قبل از CDN امتحان می‌شود و failover آن ۱۸۰۰ms bounded است.

## تأیید واقعی داده — نه صرفاً سبز شدن تست
آخرین diagnostic روی catalog واقعی در run `31909834507`:
- `sourceMoviesWithNormalMedia = 3336`
- `clientIndexMoviesWithImmediateMedia = 3539`
- `sourceMediaTitlesMissingFromClient = 0`
- `sourceUrlsLostFromClientDetailTitles = 0`
- `sourceUrlsLostFromClientSummaryTitles = 0`
- `sourceDubbedMovies = 180`
- `clientDubbedMoviesByTruth = 180`
- `bootstrapDubbedCategoryMovies = 180`
- `dubbedMoviesLost = 0`
- bootstrap items = full index items = `3706`
- categoryKeys خام `dubbed` در bootstrap و index هر دو `200` هستند؛ truth تشخیصیِ فیلم دوبله ۱۸۰ است. اختلاف ۲۰ مورد مربوط به semantics خام categoryKey است، نه حذف دوبله.

## Workflowها
- Mobile `Fix truthful startup cache v6`, run `31909685745`: typecheck + startup exact 5s + clientRevision-authoritative cache + regressions مرتبط.
- Content `Fix fast movie media v2`, run `31909834507`: rebuild واقعی + exact navigation/category equality + diagnostic صفر برای media/url/dubbed loss.
- یک run میانی به‌خاطر guard قدیمی 1.5MB شکست خورد؛ guard اصلاح شد و run نهایی بالا success شد. این شکست محصول نبود و هیچ artifact خراب commit نشد.
- APK ساخته نشد.

---

# قوانین قطعی کار
1. اگر کاربر چند ایراد پشت‌سرهم می‌فرستد، تا «تموم شد» یا «اصلاح کن» فقط جمع شوند و هیچ تغییری داده نشود.
2. بعد از «اصلاح کن»، همه موارد audit شوند و فقط چیزهایی تغییر کنند که روی HEAD فعلی واقعاً هنوز مشکل دارند.
3. ویدیوی تست دستگاه برای regression فعلی معتبر است؛ screenshot/APK قدیمی به‌تنهایی اثبات خرابی HEAD جدید نیست.
4. فقط فایل‌های لازم تغییر کنند؛ Performance، ظاهر و بخش‌های سالم حفظ شوند.
5. قبل از اصلاح محتوا مشخص شود مشکل Mobile است یا Content.
6. `catalog-index.json`، `catalog-items/`، `catalog-stable/`، `catalog-manifest.json` و catalog اصلی پاک/خالی/ناقص نشوند.
7. نام فارسی ساختگی/حدسی تولید نشود؛ فارسی معتبر، وگرنه عنوان اصلی.
8. RTL، Player، image cache/proxy/fallback و detail recovery بی‌دلیل بازنویسی نشوند.
9. GitHub Action/Sync لازم بعد از تغییر انجام شود، اما Build APK فقط با دستور صریح کاربر؛ APK خودکار ساخته نشود.
10. Content HEAD قبل از هر کار دوباره خوانده شود.
11. بعد از milestone واقعی همین فایل به‌روزرسانی شود.
12. هیچ اصلاحی «حل‌شده» اعلام نشود تا typecheck/testهای مرتبط سبز نشده باشند.
13. پاسخ‌های پروژه کوتاه نگه داشته شوند تا گفتگو زود به سقف طول نرسد.

---

# milestone Startup + immediate movie media — 2026-08-15

## گزارش واقعی دستگاه
- Home نسبت به قبل درست شده بود، اما نصب اول عملاً تا fallback پنج‌ثانیه‌ای روی startup می‌ماند.
- فیلم ایرانی/زیرنویس تا hydration detail حدود دو ثانیه پخش/دانلود نداشت.
- بعضی فیلم‌های دوبله بعد از hydration هم media action نداشتند.

## ریشه و اصلاح
Mobile commit: `265545d9e41d3a702a6f9472ab931c1b55d91b02`
Content commit: `af95c3f14a570fe1f9d5641b32d1e0b021d493ef`

### Startup
- refresh اولیه دیگر پشت `InteractionManager + 650ms` صف نمی‌شود؛ وقتی bundled catalog حاضر است reload واقعی فوراً شروع می‌شود.
- anti-stuck fallback از ۵۰۰۰ms به ۲۰۰۰ms محدود شد؛ ready content همچنان بدون minimum delay فوراً startup را dismiss می‌کند.
- refreshهای دوره‌ای/AppState همچنان از مسیر idle استفاده می‌کنند تا interaction عادی سنگین نشود.

### Movie play/download
- Content برای movie summaryها media کوچک و actionable (کیفیت/اندازه/URL/mode/language) را داخل client index و Home bootstrap حمل می‌کند؛ archive سنگین سریال همچنان detail-sharded است.
- فیلم ایرانی streamUrl معتبر نیز در summary نگه داشته می‌شود.
- Mobile دیگر download/play movie را به `detailBodyReady` گره نمی‌زند؛ اگر summary media واقعی داشته باشد، همان لحظه دکمه‌های پخش و دانلود فعال‌اند و detail کامل در پس‌زمینه hydrate می‌شود.
- bootstrap از 404486 به 521030 بایت رسیده و هنوز زیر سقف 1.5MB است؛ client index به 11846093 بایت رسیده ولی در پس‌زمینه بارگذاری می‌شود.

### Dubbed conflict
- URL واقعی که به‌اشتباه هم dubbed و هم subtitled برچسب خورده دیگر حذف نمی‌شود. Content و Mobile یک representative خنثی نگه می‌دارند؛ زبان حدس زده نمی‌شود ولی پخش/دانلود از بین نمی‌رود.

## تأیید سبز
- Mobile workflow `Fix fast startup media v5`, run `31905613920`: typecheck و Startup/Home/Detail/Performance/RTL/Poster/Operator/Metadata همگی سبز.
- Content workflow `Fix fast movie media v2`, run `31905568534`: client catalog regressions، rebuild واقعی، bootstrap safety/size و media summary سبز.
- APK ساخته نشد.

---

# milestone Home first-frame + cold-start bootstrap — 2026-08-15

## گزارش واقعی دستگاه
- در بعضی railهای Home فقط یک پوستر در سمت راست paint می‌شد و فضای بزرگی خالی می‌ماند تا scroll/interaction انجام شود.
- در نصب/اجرای تازه، Hero از catalog اضطراری چندآیتمی می‌آمد و IMDb روی «در حال آماده‌سازی» می‌ماند تا index کامل دانلود شود.

## ریشه
- HorizontalCatalog داده را reverse می‌کرد و Android را با initialScrollIndex به انتهای لیست می‌فرستاد؛ در nested horizontal virtualization گاهی فقط همان cell دور materialize می‌شد.
- چهار eager slot بر اساس چهار row تنظیم‌شده انتخاب می‌شدند، نه چهار row واقعاً دارای محتوا؛ category خالی می‌توانست slot eager را هدر بدهد.
- cold start بعد از local emergency catalog مستقیماً منتظر client index حدود ۸MB می‌ماند و local payload هم IMDb واقعی نداشت.

## اصلاح نهایی
Mobile commit: `fad7c57d6d3de22817c2ce4f6581a54cd44eb98b`
Content commit: `5a243b352af80e52d4c6ada749fe9e9fa9bdc31f`

### Home rails
- HorizontalCatalog دیگر reverse-data + far-end initialScrollIndex ندارد؛ source order مستقیم با inverted هدفمند استفاده می‌شود تا item صفر از سمت راست فوراً materialize شود.
- محدودیت performance حفظ شد: initialNumToRender/maxToRenderPerBatch برابر ۴، windowSize برابر ۴ و removeClippedSubviews=false.
- eagerRows از چهار row واقعاً populated انتخاب می‌شوند؛ rowهای خالی دیگر slot اولیه را مصرف نمی‌کنند.
- این تغییر فقط HorizontalCatalog Home است؛ railهای حساس Stars/People/Related که regression جدا دارند بی‌دلیل بازنویسی نشدند.

### Cold start / IMDb
- Content اکنون در هر rebuild/sync فایل `catalog-bootstrap.json` را می‌سازد؛ شامل summary واقعی ردیف‌های اصلی Home، تازه‌ها/به‌روزشده‌ها، featuredPeople و IMDb است و peopleWorks حجیم را حمل نمی‌کند.
- manifest bootstrap را با revision/size/index معرفی می‌کند؛ اندازهٔ bootstrap تأییدشده 404486 بایت است، در برابر client index حدود 8265435 بایت.
- Mobile در cold start واقعی CDN و GitHub Raw bootstrap را هم‌زمان race می‌کند، اولین payload معتبر را اعمال می‌کند و سپس index کامل را در همان مسیر پس‌زمینه جایگزین می‌کند.
- refresh ناموفق اجازه ندارد bootstrap واقعی را دوباره با emergency local catalog downgrade کند.
- IMDb تا قبل از ranking واقعی loader بزرگ و بی‌انتها نشان نمی‌دهد؛ section وقتی دادهٔ معتبر آماده شد atomically mount می‌شود.

## تأیید سبز
Workflow `Fix Home first frame v4`, run `31903599514`:
- npm run typecheck
- Home first-frame regression
- Home/detail regression
- Home performance boundaries
- runtime latency regression
- RTL rails خارج از Home
- startup projectionist
- poster stability
- operator playback
- neutral foreign media
- metadata/detail/next-episode/episode-artwork

Workflow `Add Home bootstrap v1`, run `31903499320` نیز client catalog regressions، final stability و bootstrap واقعی را سبز کرد.

APK ساخته نشد.

---

# milestone Episode + Detail latency — 2026-08-15

## گزارش واقعی دستگاه
- کاور قسمت‌های سریال دیر ظاهر می‌شد و لمس قسمت/پخش با تأخیر واکنش می‌داد.
- کارت «قسمت بعدی» در portrait پایین کل صفحه می‌آمد، نه روی خود video frame.
- بخش پایین Detail مدت زیادی روی «در حال آماده‌کردن جزئیات…» می‌ماند.
- titleهایی مثل «ویلای من 1» باعث نمایش تکراری «قسمت ۱ - ویلای من 1» می‌شدند.

## ریشه و اصلاح
commit عملکردی: `6955c564557907828714df2152262c7afb6ce965`

### Episode artwork / interaction
- تولید thumbnail روی خود گوشی با `createVideoPlayer/generateThumbnailsAsync` از mount کارت‌های قسمت حذف شد؛ این کار برای هر کارت media decoder می‌ساخت و صف سنگین ایجاد می‌کرد.
- کارت قسمت فوراً artwork موجود و cache‌شدهٔ خود عنوان را paint می‌کند و فقط اگر exact server episode frame موجود باشد آن را با `expo-image` و `memory-disk` روی fallback قرار می‌دهد.
- در نتیجه mount/scroll/tap قسمت‌ها دیگر منتظر thumbnail extraction نیست.

### Next Episode
- overlay از `absoluteFillObject` کل صفحه جدا شد و با `frameRect` دقیقاً داخل video frame قرار می‌گیرد.
- countdown پانزده‌ثانیه‌ای، auto-play و fallback دو دقیقه‌ای دست‌نخورده‌اند.

### Detail hydration latency
- `catalog-stable` Raw و CDN دیگر sequential خوانده نمی‌شوند؛ هر دو هم‌زمان شروع می‌شوند، Raw فقط یک grace کوتاه و bounded دارد و سپس اولین pointer معتبر پذیرفته می‌شود.
- cache-buster و validation pointer حفظ شدند تا stale media link برنگردد.
- تا زمان media hydration، summary معتبر مثل genre/overview فوراً دیده می‌شود و loader کوچک فقط برای «پخش و قسمت‌ها» باقی می‌ماند؛ media ناقص همچنان به‌عنوان detail کامل نمایش داده نمی‌شود.

### Episode title cleanup
- بعد از حذف نام سریال از subtitle، bare episode number/ordinal هم boilerplate شناخته می‌شود؛ بنابراین «ویلای من 1» یا مشابه آن دوباره به عنوان اسم مستقل قسمت نمایش داده نمی‌شود.
- title واقعی و متمایز قسمت همچنان نمایش داده می‌شود.

## تأیید سبز
Workflow `Fix runtime latency v3`, run `31901587824` همه مراحل را سبز کرد:
- `npm run typecheck`
- regression مستقیم چهار مورد بالا
- Home/detail regression قبلی
- Home performance
- operator playback
- metadata/cast
- startup
- poster stability
- RTL media rails
- neutral foreign media
- movie end recommendations
- next episode overlay
- detail related titles
- locked controls
- episode artwork performance
- commit عملکردی فقط بعد از سبزشدن همهٔ مراحل انجام شد.

---

# milestone تأییدشده Home + Detail — 2026-08-15

## علامت واقعی روی دستگاه
در APK قبلی:
- Home با Hero/IMDb بالا می‌آمد اما ردیف‌های کاتالوگ تا scroll/interaction غایب می‌ماندند.
- پخش آنلاین/دانلود بعضی فیلم‌ها تا refresh غایب بود.
- قسمت‌های سریال هم سابقهٔ همان رفتار delayed-until-scroll داشتند.

## ریشه و اصلاح نهایی
`f373c76ac02a7649b4a1b8d50dd56a8200477288`

### Home
- چهار ردیف اول Home مستقیماً داخل header tree mount می‌شوند و از outer vertical FlatList virtualization خارج‌اند.
- ردیف‌های بعدی همچنان virtualized/bounded می‌مانند؛ full eager render یا full-catalog prefetch اضافه نشده است.
- بنابراین Hero/IMDb دیگر نمی‌توانند first catalog cells را تا interaction بعدی عقب بیندازند.

### Detail / links / episodes
- `DetailModal` دیگر `detailBodyReady` را با timer یا `InteractionManager` باز نمی‌کند؛ readiness مستقیماً از `detailLoaded` واقعی مشتق می‌شود.
- summary فاقد media دیگر به‌عنوان detail کامل نمایش داده نمی‌شود.
- `src/contentService.ts` قبل از cache/shard قدیمی، pointer کوچک `catalog-stable/<identity>.json` را resolve می‌کند؛ pointer mutable با cache-buster خوانده و 5 دقیقه در memory cache می‌شود.
- GitHub Raw برای pointer کوچک source-of-truth ترجیح داده می‌شود و immutable detail shardها مسیر cache/CDN عادی خود را نگه می‌دارند.
- hydrated item طوری برمی‌گردد که stale lightweight index فوراً آن را downgrade نکند.

### حذف workaround قبلی
- global monkeypatchهای `FlatList`, `fetch`, `setTimeout` از `index.ts` حذف شدند.
- `index.ts` دوباره فقط App را استاندارد register می‌کند.
- `ce8b0646...` و `344da0b...` برای این regression fix نهایی محسوب نشوند؛ از `f373c76...` ادامه بده.

## تأیید سبز قبل از commit
Workflow `Fix Home and detail render v2` در attempt 5 همه مراحل زیر را سبز کرد:
- `npm run typecheck`
- Home/detail regression مستقیم
- Home performance
- operator playback/native custom tab
- metadata empty state/cast rail
- startup projectionist
- poster stability
- RTL media rails
- neutral foreign media
- movie end recommendations
- series next episode overlay
- detail related titles
- locked controls auto-hide
- exact episode thumbnails
- commit مرحله آخر فقط بعد از سبزشدن همه موارد انجام شد.

تست‌های قدیمی Operator/RTL/Related که expectation مربوط به implementation قبلی داشتند، با رفتار واقعی و تأییدشدهٔ فعلی همگام شدند؛ منطق سالم اپ برای پاس‌کردن تست‌ها به عقب برگردانده نشد.

---

# اصلاحات مهمی که باید حفظ شوند

## Performance
- navigation قبل از detail hydration؛ preload سنگین روی `onPressIn` برنگردد.
- `categoryKeys` fast path، compact `peopleWorks`، Stars lazy و Home bounded حفظ شوند.
- full catalog scan، bulk prefetch و request flood برنگردد.
- episode cards نباید هنگام mount ویدئو decoder/thumbnail extraction راه بیندازند.

## Startup
- emergency local catalog فقط fallback ضدگیرکردن است؛ در cold start واقعی bootstrap کم‌حجم Home قبل از client index کامل resolve و اعمال شود.
- bootstrap باید summary واقعی Home + IMDb را داشته باشد و بعد با index کامل refresh شود؛ failure نباید آن را به local اضطراری downgrade کند.
- IMDb شرط آماده‌شدن catalog نیست و در نبود ranking معتبر section نباید loader بزرگ بی‌انتها نشان دهد.
- splash minimum چندثانیه‌ای برنگردد؛ fallback فقط anti-stuck.

## RTL / rails
- `removeClippedSubviews={false}` در railهای حساس حفظ شود.
- برای Stars/People/Related همان `reverse-data + initialScrollIndex` تست‌شده حفظ شود؛ HorizontalCatalog صفحهٔ Home استثنائاً direct-data + `inverted` هدفمند دارد تا first cell فوراً از راست paint شود. broad `direction: rtl` یا scroll hack سراسری برنگردد.

## Operator
- Android operator playback از native `AparatchiCustomTab` با session و browser component صریح استفاده می‌کند؛ generic Open With/Linking fallback برنگردد.

## Images / Player
- `expo-image` memory+disk cache، proxy/fallback و بدون bulk prefetch حفظ شود.
- Next Episode countdown پانزده‌ثانیه‌ای و frame-relative overlay حفظ شود.
- Player controls/fullscreen/lock/mute/volume/quality و smooth transition regression نکنند.

## دوبله و Content
- parser اصلی Content از media واقعی زبان را تشخیص می‌دهد.
- refresh دوره‌ای دوبله: `da08e72dbb5428aa7a832ea827b4a00abb2953af`.
- `availableLanguages/categoryKeys` از media واقعی همگام شوند؛ حدس دوبله/زیرنویس ساخته نشود.

---

# قواعد محتوایی دائمی
- سریال قدیمی: یک عنوان تا حد ممکن کامل، بعد بعدی؛ airing با قسمت جدید به بالای updatedها.
- دانلود هر قسمت فقط لینک همان قسمت؛ episode links قاطی نشوند.
- اسم سریال یا شمارهٔ سادهٔ قسمت به‌عنوان title مستقل episode نمایش داده نشود؛ فقط اسم واقعی و متمایز قسمت نمایش داده شود.
- sync ساعتی و completion قدیمی ادامه داشته باشد؛ window محدود نباید جلوی تکمیل catalog را بگیرد.
- پخش آنلاین فقط با media واقعی؛ «ویژه همراه» فقط operator-only واقعی.
- series header دکمه generic تکراری play/download نداشته باشد؛ کنترل‌ها per-episode.
- ژاپنی دسته مستقل ندارد؛ زیر خارجی. Kids/Programs/Religious/Documentary/Wildlife/Anime/Animation درست تفکیک شوند.
- «ادامه تماشا» و likes/comments تا درخواست جدید برنگردند.

# شروع چت جدید
1. `PROJECT-STATE.md` از Mobile main.
2. HEAD واقعی Mobile و Content.
3. اگر Content جلوتر است commitهای جدید audit شوند.
4. Episode/Detail latency از `6955c564...` ادامه پیدا کند؛ runtime thumbnail extraction و sequential stable-pointer wait برنگردند.
5. Home/Detail از `f373c76...` ادامه پیدا کند و workaroundهای قبلی برنگردند.
6. اگر کاربر چند ایراد می‌فرستد فقط جمع شود تا «تموم شد/اصلاح کن».
7. هیچ موردی تا سبزشدن تست مرتبط «حل‌شده» اعلام نشود.
8. APK فقط با دستور صریح کاربر.

---

# milestone Final reported batch v22 — 2026-08-18
- Functional Mobile HEAD `84d2e3572e6a7e3bd1e7e73829575087f228aab5` با runner سالم Content روی source خام و source واقعیِ materialized توسط Metro بررسی شد؛ `rawTypecheck=success`, `patchedTypecheck=success`, `regressions=success`, `requestedBehaviorAudit=success`.
- اصلاحات عنوان/کالکشن، بازگشت دقیق scroll کالکشن، badgeهای واقعی «ویژه همراه/دوبله/زیرنویس» در Related و بهینه‌سازی scroll عمودی Home در deterministic Metro patch فعال‌اند؛ startup gate نیز قبل از App نصب می‌شود.
- تست‌های قدیمی که implementation منسوخ را انتظار داشتند با رفتار جدیدتر و از قبل تأییدشدهٔ neutral foreign media، RTL `initialScrollIndex` و trusted operator URL guard همگام شدند؛ منطق سالم اپ برای پاس کردن تست عقب‌گرد نکرد.
- Content commit `fcbe103e7764953d9749b8e7a4ec011fbca36821` برای bootstrap هر عنوان حداکثر ۴ عامل/بازیگر اولیه حمل می‌کند تا بخش عوامل در اولین باز شدن منتظر detail shard نماند؛ detail کامل همچنان مرجع نهایی است.
- workflow/scriptهای موقت قرمز v19/v20/v21/v22 از Mobile حذف شدند؛ workflowهای دائمی `android-apk.yml`, `delete-all-artifacts.yml`, `validate-mobile.yml` باقی ماندند.
- APK ساخته نشد؛ رفتار واقعی روی دستگاه فقط بعد از build بعدی قابل تأیید است.
