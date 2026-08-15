# وضعیت پایدار پروژه آپاراتچی

این فایل حافظهٔ انتقال پروژه بین چت‌های ChatGPT است. در هر چت جدید اول این فایل و سپس HEAD واقعی `main` هر دو مخزن خوانده شود؛ HEAD واقعی مقدم است چون Content خودکار جلو می‌رود.

## مخزن‌ها
- Mobile: `miladmahmoudinia-prog/Aparatchi-Mobile`
- Content: `miladmahmoudinia-prog/Aparatchi-Content`
- Branch: `main`

## checkpoint — 2026-08-15
- آخرین commit عملکردی Mobile: `f373c76ac02a7649b4a1b8d50dd56a8200477288` — `fix: render Home and hydrated media immediately [skip ci]`
- Content HEAD هنگام checkpoint: `1091d37355a40306444272320e1fe2d42352d09d` — `chore: advance oldest-year archive completion`
- Workflow تأیید fix: `Fix Home and detail render v2`, run `31900029245`, attempt 5؛ TypeScript و تمام regression testهای همان workflow سبز شدند و فقط بعد از سبزشدن commit بالا ساخته شد.
- APK توسط ChatGPT ساخته نشد.

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

## Startup
- bundled/local catalog در cold start موجود است و remote بعداً refresh می‌کند.
- IMDb شرط آماده‌شدن catalog نیست.
- splash minimum چندثانیه‌ای برنگردد؛ fallback فقط anti-stuck.

## RTL / rails
- `removeClippedSubviews={false}` در railهای حساس حفظ شود.
- استراتژی فعلی `reverse-data + initialScrollIndex` برای rails حساس حفظ شود؛ broad native `direction: rtl`/`inverted` یا scroll hack بی‌دلیل برنگردد.

## Operator
- Android operator playback از native `AparatchiCustomTab` با session و browser component صریح استفاده می‌کند؛ generic Open With/Linking fallback برنگردد.

## Images / Player
- `expo-image` memory+disk cache، proxy/fallback و بدون bulk prefetch حفظ شود.
- Next Episode countdown پانزده‌ثانیه‌ای حفظ شود.
- Player controls/fullscreen/lock/mute/volume/quality و smooth transition regression نکنند.

## دوبله و Content
- parser اصلی Content از media واقعی زبان را تشخیص می‌دهد.
- refresh دوره‌ای دوبله: `da08e72dbb5428aa7a832ea827b4a00abb2953af`.
- `availableLanguages/categoryKeys` از media واقعی همگام شوند؛ حدس دوبله/زیرنویس ساخته نشود.

---

# قواعد محتوایی دائمی
- سریال قدیمی: یک عنوان تا حد ممکن کامل، بعد بعدی؛ airing با قسمت جدید به بالای updatedها.
- دانلود هر قسمت فقط لینک همان قسمت؛ episode links قاطی نشوند.
- sync ساعتی و completion قدیمی ادامه داشته باشد؛ window محدود نباید جلوی تکمیل catalog را بگیرد.
- پخش آنلاین فقط با media واقعی؛ «ویژه همراه» فقط operator-only واقعی.
- series header دکمه generic تکراری play/download نداشته باشد؛ کنترل‌ها per-episode.
- ژاپنی دسته مستقل ندارد؛ زیر خارجی. Kids/Programs/Religious/Documentary/Wildlife/Anime/Animation درست تفکیک شوند.
- «ادامه تماشا» و likes/comments تا درخواست جدید برنگردند.

# شروع چت جدید
1. `PROJECT-STATE.md` از Mobile main.
2. HEAD واقعی Mobile و Content.
3. اگر Content جلوتر است commitهای جدید audit شوند.
4. Home/Detail از `f373c76...` ادامه پیدا کند و workaroundهای قبلی برنگردند.
5. اگر کاربر چند ایراد می‌فرستد فقط جمع شود تا «تموم شد/اصلاح کن».
6. هیچ موردی تا سبزشدن تست مرتبط «حل‌شده» اعلام نشود.
7. APK فقط با دستور صریح کاربر.
