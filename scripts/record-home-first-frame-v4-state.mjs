import fs from 'node:fs/promises';

const path = 'PROJECT-STATE.md';
let state = await fs.readFile(path, 'utf8');
const replaceOnce = (before, after, label) => {
  const count = state.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  state = state.replace(before, after);
};

replaceOnce(
  '- آخرین commit عملکردی Mobile: `6955c564557907828714df2152262c7afb6ce965` — `fix: speed episode and detail interactions [skip ci]`\n- Content HEAD هنگام checkpoint: `1091d37355a40306444272320e1fe2d42352d09d` — `chore: advance oldest-year archive completion`\n- Workflow تأیید fix جدید: `Fix runtime latency v3`, run `31901587824`؛ TypeScript و تمام regression testها سبز شدند و فقط بعد از سبزشدن commit عملکردی ساخته شد.',
  '- آخرین commit عملکردی Mobile: `fad7c57d6d3de22817c2ce4f6581a54cd44eb98b` — `fix: make Home first frame deterministic [skip ci]`\n- Content bootstrap commit: `5a243b352af80e52d4c6ada749fe9e9fa9bdc31f` — `perf: publish fast Home bootstrap [skip ci]`\n- Workflow تأیید Mobile: `Fix Home first frame v4`, run `31903599514`؛ TypeScript و همهٔ regressionهای Home/Detail/Performance/RTL/Startup/Poster/Operator/Metadata سبز شدند.\n- Workflow تأیید Content: `Add Home bootstrap v1`, run `31903499320` سبز شد و bootstrap کم‌حجم واقعی منتشر شد.',
  'checkpoint',
);

const milestoneMarker = '---\n\n# milestone Episode + Detail latency — 2026-08-15';
const milestone = `---\n\n# milestone Home first-frame + cold-start bootstrap — 2026-08-15\n\n## گزارش واقعی دستگاه\n- در بعضی railهای Home فقط یک پوستر در سمت راست paint می‌شد و فضای بزرگی خالی می‌ماند تا scroll/interaction انجام شود.\n- در نصب/اجرای تازه، Hero از catalog اضطراری چندآیتمی می‌آمد و IMDb روی «در حال آماده‌سازی» می‌ماند تا index کامل دانلود شود.\n\n## ریشه\n- HorizontalCatalog داده را reverse می‌کرد و Android را با initialScrollIndex به انتهای لیست می‌فرستاد؛ در nested horizontal virtualization گاهی فقط همان cell دور materialize می‌شد.\n- چهار eager slot بر اساس چهار row تنظیم‌شده انتخاب می‌شدند، نه چهار row واقعاً دارای محتوا؛ category خالی می‌توانست slot eager را هدر بدهد.\n- cold start بعد از local emergency catalog مستقیماً منتظر client index حدود ۸MB می‌ماند و local payload هم IMDb واقعی نداشت.\n\n## اصلاح نهایی\nMobile commit: \`fad7c57d6d3de22817c2ce4f6581a54cd44eb98b\`\nContent commit: \`5a243b352af80e52d4c6ada749fe9e9fa9bdc31f\`\n\n### Home rails\n- HorizontalCatalog دیگر reverse-data + far-end initialScrollIndex ندارد؛ source order مستقیم با inverted هدفمند استفاده می‌شود تا item صفر از سمت راست فوراً materialize شود.\n- محدودیت performance حفظ شد: initialNumToRender/maxToRenderPerBatch برابر ۴، windowSize برابر ۴ و removeClippedSubviews=false.\n- eagerRows از چهار row واقعاً populated انتخاب می‌شوند؛ rowهای خالی دیگر slot اولیه را مصرف نمی‌کنند.\n- این تغییر فقط HorizontalCatalog Home است؛ railهای حساس Stars/People/Related که regression جدا دارند بی‌دلیل بازنویسی نشدند.\n\n### Cold start / IMDb\n- Content اکنون در هر rebuild/sync فایل \`catalog-bootstrap.json\` را می‌سازد؛ شامل summary واقعی ردیف‌های اصلی Home، تازه‌ها/به‌روزشده‌ها، featuredPeople و IMDb است و peopleWorks حجیم را حمل نمی‌کند.\n- manifest bootstrap را با revision/size/index معرفی می‌کند؛ اندازهٔ bootstrap تأییدشده 404486 بایت است، در برابر client index حدود 8265435 بایت.\n- Mobile در cold start واقعی CDN و GitHub Raw bootstrap را هم‌زمان race می‌کند، اولین payload معتبر را اعمال می‌کند و سپس index کامل را در همان مسیر پس‌زمینه جایگزین می‌کند.\n- refresh ناموفق اجازه ندارد bootstrap واقعی را دوباره با emergency local catalog downgrade کند.\n- IMDb تا قبل از ranking واقعی loader بزرگ و بی‌انتها نشان نمی‌دهد؛ section وقتی دادهٔ معتبر آماده شد atomically mount می‌شود.\n\n## تأیید سبز\nWorkflow \`Fix Home first frame v4\`, run \`31903599514\`:\n- npm run typecheck\n- Home first-frame regression\n- Home/detail regression\n- Home performance boundaries\n- runtime latency regression\n- RTL rails خارج از Home\n- startup projectionist\n- poster stability\n- operator playback\n- neutral foreign media\n- metadata/detail/next-episode/episode-artwork\n\nWorkflow \`Add Home bootstrap v1\`, run \`31903499320\` نیز client catalog regressions، final stability و bootstrap واقعی را سبز کرد.\n\nAPK ساخته نشد.\n\n---\n\n# milestone Episode + Detail latency — 2026-08-15`;
replaceOnce(milestoneMarker, milestone, 'milestone insertion');

replaceOnce(
  '- bundled/local catalog در cold start موجود است و remote بعداً refresh می‌کند.\n- IMDb شرط آماده‌شدن catalog نیست.',
  '- emergency local catalog فقط fallback ضدگیرکردن است؛ در cold start واقعی bootstrap کم‌حجم Home قبل از client index کامل resolve و اعمال شود.\n- bootstrap باید summary واقعی Home + IMDb را داشته باشد و بعد با index کامل refresh شود؛ failure نباید آن را به local اضطراری downgrade کند.\n- IMDb شرط آماده‌شدن catalog نیست و در نبود ranking معتبر section نباید loader بزرگ بی‌انتها نشان دهد.',
  'startup rules',
);

replaceOnce(
  '- استراتژی فعلی `reverse-data + initialScrollIndex` برای rails حساس حفظ شود؛ broad native `direction: rtl`/`inverted` یا scroll hack بی‌دلیل برنگردد.',
  '- برای Stars/People/Related همان `reverse-data + initialScrollIndex` تست‌شده حفظ شود؛ HorizontalCatalog صفحهٔ Home استثنائاً direct-data + `inverted` هدفمند دارد تا first cell فوراً از راست paint شود. broad `direction: rtl` یا scroll hack سراسری برنگردد.',
  'RTL strategy rule',
);

await fs.writeFile(path, state, 'utf8');
console.log('PROJECT-STATE.md updated for Home first-frame v4 milestone.');
