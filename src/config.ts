/**
 * منبع‌های عمومی کاتالوگ آپاراتچی.
 * CDN اولویت دارد تا روی شبکه‌هایی که raw.githubusercontent.com کند یا مسدود است
 * اپ به کاتالوگ ۱۰تایی اضطراری سقوط نکند. GitHub Raw به‌عنوان مسیر دوم می‌ماند.
 */
export const CONTENT_REPOSITORY_BASES = [
  'https://cdn.jsdelivr.net/gh/miladmahmoudinia-prog/Aparatchi-Content@main/',
  'https://raw.githubusercontent.com/miladmahmoudinia-prog/Aparatchi-Content/main/',
] as const;

/**
 * فهرست سبک آپاراتچی برای صفحهٔ اصلی، جستجو و دسته‌بندی‌ها.
 * این فایل عمداً بدون لینک‌های دانلود کامل ساخته می‌شود تا
 * افزایش آرشیو باعث هنگ‌کردن رابط کاربری نشود.
 */
export const REMOTE_CONTENT_INDEX_URL =
  `${CONTENT_REPOSITORY_BASES[0]}catalog-index.json`;

/**
 * نمای کم‌حجم صفحهٔ اصلی برای اولین اجرای بدون cache. این فایل شامل
 * summary واقعی ردیف‌های Home و IMDb است و بعداً با index کامل جایگزین می‌شود.
 */
export const REMOTE_CONTENT_BOOTSTRAP_URL =
  `${CONTENT_REPOSITORY_BASES[0]}catalog-bootstrap.json`;

/**
 * تغییرات تجمعی کاتالوگ نسبت به snapshot داخل APK. این فایل همهٔ شناسه‌ها را
 * برای ترتیب دقیق دارد، اما فقط عنوان‌های تازه/تغییرکرده را دوباره حمل می‌کند.
 */
export const REMOTE_CONTENT_LIVE_URL =
  `${CONTENT_REPOSITORY_BASES[0]}catalog-live.json`;

/**
 * نسخهٔ کامل قدیمی فقط برای سازگاری با اولین اجرای مهاجرت نگه داشته شده است.
 * برنامه در حالت عادی آن را دانلود نمی‌کند.
 */
export const REMOTE_CONTENT_URL =
  `${CONTENT_REPOSITORY_BASES[0]}catalog.json`;

/** پایهٔ فایل‌های جزئیات هر فیلم/سریال؛ فقط هنگام بازکردن همان عنوان خوانده می‌شود. */
export const REMOTE_CONTENT_DETAIL_BASE_URL =
  CONTENT_REPOSITORY_BASES[0];

/** فایل بسیار کوچک اعلام نسخهٔ فهرست. */
export const REMOTE_CONTENT_MANIFEST_URL =
  `${CONTENT_REPOSITORY_BASES[0]}catalog-manifest.json`;
