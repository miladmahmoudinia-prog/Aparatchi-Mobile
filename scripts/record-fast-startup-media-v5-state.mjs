import fs from 'node:fs/promises';

const path = 'PROJECT-STATE.md';
let state = await fs.readFile(path, 'utf8');

const replaceOnce = (before, after, label) => {
  const count = state.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  state = state.replace(before, after);
};

replaceOnce(
  '- آخرین commit عملکردی Mobile: `fad7c57d6d3de22817c2ce4f6581a54cd44eb98b` — `fix: make Home first frame deterministic [skip ci]`',
  '- آخرین commit عملکردی Mobile: `265545d9e41d3a702a6f9472ab931c1b55d91b02` — `perf: show movie actions without detail wait [skip ci]`',
  'mobile checkpoint',
);
replaceOnce(
  '- Content bootstrap commit: `5a243b352af80e52d4c6ada749fe9e9fa9bdc31f` — `perf: publish fast Home bootstrap [skip ci]`',
  '- Content media/bootstrap commit: `af95c3f14a570fe1f9d5641b32d1e0b021d493ef` — `perf: expose movie media in lightweight catalog [skip ci]`',
  'content checkpoint',
);
replaceOnce(
  '- Workflow تأیید Mobile: `Fix Home first frame v4`, run `31903599514`؛ TypeScript و همهٔ regressionهای Home/Detail/Performance/RTL/Startup/Poster/Operator/Metadata سبز شدند.',
  '- Workflow تأیید Mobile: `Fix fast startup media v5`, run `31905613920`؛ TypeScript و regressionهای Startup/Home/Detail/Performance/RTL/Poster/Operator/Metadata همگی سبز شدند.',
  'mobile workflow checkpoint',
);
replaceOnce(
  '- Workflow تأیید Content: `Add Home bootstrap v1`, run `31903499320` سبز شد و bootstrap کم‌حجم واقعی منتشر شد.',
  '- Workflow تأیید Content: `Fix fast movie media v2`, run `31905568534` سبز شد؛ movie media summary و bootstrap واقعی rebuild و منتشر شدند.',
  'content workflow checkpoint',
);

const marker = '# milestone Home first-frame + cold-start bootstrap — 2026-08-15';
if (!state.includes(marker)) throw new Error('previous Home milestone marker missing');
const milestone = `# milestone Startup + immediate movie media — 2026-08-15\n\n## گزارش واقعی دستگاه\n- Home نسبت به قبل درست شده بود، اما نصب اول عملاً تا fallback پنج‌ثانیه‌ای روی startup می‌ماند.\n- فیلم ایرانی/زیرنویس تا hydration detail حدود دو ثانیه پخش/دانلود نداشت.\n- بعضی فیلم‌های دوبله بعد از hydration هم media action نداشتند.\n\n## ریشه و اصلاح\nMobile commit: \`265545d9e41d3a702a6f9472ab931c1b55d91b02\`\nContent commit: \`af95c3f14a570fe1f9d5641b32d1e0b021d493ef\`\n\n### Startup\n- refresh اولیه دیگر پشت \`InteractionManager + 650ms\` صف نمی‌شود؛ وقتی bundled catalog حاضر است reload واقعی فوراً شروع می‌شود.\n- anti-stuck fallback از ۵۰۰۰ms به ۲۰۰۰ms محدود شد؛ ready content همچنان بدون minimum delay فوراً startup را dismiss می‌کند.\n- refreshهای دوره‌ای/AppState همچنان از مسیر idle استفاده می‌کنند تا interaction عادی سنگین نشود.\n\n### Movie play/download\n- Content برای movie summaryها media کوچک و actionable (کیفیت/اندازه/URL/mode/language) را داخل client index و Home bootstrap حمل می‌کند؛ archive سنگین سریال همچنان detail-sharded است.\n- فیلم ایرانی streamUrl معتبر نیز در summary نگه داشته می‌شود.\n- Mobile دیگر download/play movie را به \`detailBodyReady\` گره نمی‌زند؛ اگر summary media واقعی داشته باشد، همان لحظه دکمه‌های پخش و دانلود فعال‌اند و detail کامل در پس‌زمینه hydrate می‌شود.\n- bootstrap از 404486 به 521030 بایت رسیده و هنوز زیر سقف 1.5MB است؛ client index به 11846093 بایت رسیده ولی در پس‌زمینه بارگذاری می‌شود.\n\n### Dubbed conflict\n- URL واقعی که به‌اشتباه هم dubbed و هم subtitled برچسب خورده دیگر حذف نمی‌شود. Content و Mobile یک representative خنثی نگه می‌دارند؛ زبان حدس زده نمی‌شود ولی پخش/دانلود از بین نمی‌رود.\n\n## تأیید سبز\n- Mobile workflow \`Fix fast startup media v5\`, run \`31905613920\`: typecheck و Startup/Home/Detail/Performance/RTL/Poster/Operator/Metadata همگی سبز.\n- Content workflow \`Fix fast movie media v2\`, run \`31905568534\`: client catalog regressions، rebuild واقعی، bootstrap safety/size و media summary سبز.\n- APK ساخته نشد.\n\n---\n\n`;
state = state.replace(marker, milestone + marker);
await fs.writeFile(path, state, 'utf8');
console.log('Recorded fast startup/movie media v5 milestone.');
