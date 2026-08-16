import fs from 'node:fs/promises';

const file = 'PROJECT-STATE.md';
const old = await fs.readFile(file, 'utf8');
const marker = '# milestone Fresh startup + truthful media/language v9 — 2026-08-16';
if (old.includes(marker)) process.exit(0);

const block = `

# milestone Fresh startup + truthful media/language v9 — 2026-08-16

## Mobile
- commit \`8548dc0b4a0502a661033c02833b60cc4b9bd4b3\`: online cold-start دیگر cache قدیمی Home را پشت splash پنج‌ثانیه‌ای commit/reveal نمی‌کند؛ bootstrap و catalog از GitHub Raw truth اول خوانده می‌شوند، VPN آیکون پخش را مخفی نمی‌کند و check هنگام tap باقی است.
- commit \`0d31f88c1bfda68159d8a29fe09564c5953ab613\`: stable detail pointer دیگر CDN قدیمی را بعد از 450ms برنده نمی‌کند؛ GitHub Raw با budget 1800ms منبع اول است و CDN فقط fallback است.
- workflowهای Mobile: \`Fix visible media and fresh startup v7\` run \`31927500718\` و \`Fix truthful detail pointer v8\` run \`31927837640\` هر دو success + typecheck/regressions سبز.

## Content / language truth
- Content functional commits نهایی این milestone: \`0b145c3724ad9ca4240c33b8b08b6cc481827ec3\` و \`a941f5b1190d17448debf76b839ad3d05c9d61a6\` برای catalog/generated artifacts + parser پایدار Upera.
- تشخیص دوبله دیگر از روی \`-0-\` حدس زده نمی‌شود؛ فقط title-level \`dubbed=1\` واقعی Upera اجازه می‌دهد primary media به dubbed برچسب بخورد. movie list sparse نیز برای truth عنوان detail fetch می‌شود؛ series از قبل detail fetch داشت.
- «تاج کامل / Perfect Crown»: 72 فایل دوبله و \`availableLanguages=[dubbed]\` روی HEAD فعلی.
- «برای دزد عزیزم»: دوبله + زیرنویس هر دو حفظ شده‌اند؛ verify فعلی 96 فایل dubbed و 56 فایل subtitled را دید.
- کنترل منفی «بدنم را از دست دادم / I Lost My Body»: dubbed=0 و subtitle-only باقی مانده؛ false Iranian dubbed badges=0.
- Current-HEAD read-only verify: \`Verify current HEAD media and language truth v9\`, run \`31928516774\`, success روی HEAD \`4b4f2e292d7c2cdebdcff639c0ff80f9bacaaccc\`.
- diagnostic واقعی فعلی: \`sourceMediaTitlesMissingFromClient=0\`, \`sourceUrlsLostFromClientDetailTitles=0\`, \`sourceUrlsLostFromClientSummaryTitles=0\`, \`dubbedMoviesLost=0\` و فیلم‌های دوبله source/client/bootstrap همگی \`1415\`.
- device samples مثل Yaksha، Toni Kroos، Prophet، Bécassine، DadShah و I Lost My Body در generated client truth پخش+دانلود معتبر دارند؛ فقط یک movie عادی قدیمی بدون action باقی مانده، بقیه no-actionهای شمرده‌شده operator-only هستند.
- APK در این milestone ساخته نشد؛ Mobile نصب‌شده تا build جدید این دو commit را ندارد.
`;

const insertAt = old.indexOf('\n---\n');
const next = insertAt >= 0
  ? old.slice(0, insertAt) + block + old.slice(insertAt)
  : old + block;
await fs.writeFile(file, next, 'utf8');
console.log('Recorded v9 milestone in PROJECT-STATE.md');
