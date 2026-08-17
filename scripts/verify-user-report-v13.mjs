import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
assert.ok(app.includes("if (language) return language === originalLanguage;"));
assert.ok(app.includes("case 'indian-series': return false;"));
assert.ok(!app.includes("{ filter: 'indian-series', title: 'سریال‌های هندی' }"));
assert.ok(!app.includes("{ filter: 'indian-series', title: 'سریال‌های هندی', subtitle:"));
assert.ok(app.includes("case 'foreign-series': return item.type === 'series' && !isIranianItem(item) && !isKoreanItem(item) && !isAnimatedItem(item)"));
console.log('v13 regional Mobile verification passed.');
