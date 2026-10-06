/**
 * Headless smoke test: boots the real index.html in jsdom against the dev
 * server, logs in as admin, and measures what the orders table renders.
 *   node smoke.mjs <user> <pass>
 */
import { JSDOM, VirtualConsole } from 'jsdom';

const BASE = process.env.BASE || 'http://localhost:8080';
const USER = process.argv[2];
const PASS = process.argv[3];

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));

let html = await (await fetch(BASE + '/index.html')).text();
// jsdom does not execute type="module" scripts; the bundle has no imports,
// so downgrade it to a classic script for the test only.
html = html.replace('<script type="module" crossorigin>', '<script>');
const dom = new JSDOM(html, {
	url: BASE + '/',
	runScripts: 'dangerously',
	pretendToBeVisual: true,
	virtualConsole: vc,
	beforeParse(win) {
		// the app does a one-time location.reload() to acknowledge the reset epoch;
		// jsdom cannot navigate, so pre-acknowledge it and stub reload.
		try { win.localStorage.setItem('paraveda_reset_seen', String(Date.now()));
			if (process.env.PAGE_SIZE) win.localStorage.setItem('pv_page_size', process.env.PAGE_SIZE);
			if (process.env.PERIOD) {
				win.localStorage.setItem('paraveda_period_v2', JSON.stringify({ period: process.env.PERIOD, from: '2026-01-01', to: '2026-12-31' }));
				win.localStorage.setItem('ct_paraveda_period_v2', String(Date.now() + 600000));
			} } catch {}
		try { Object.defineProperty(win.location, 'reload', { value: () => {}, configurable: true }); } catch {}
	},
});
const { window } = dom;
window.fetch = (u, o) => fetch(new URL(u, BASE), o);
window.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.scrollTo ||= () => {};
window.Element.prototype.scrollTo ||= function () {};
window.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver ||= class { observe() {} unobserve() {} disconnect() {} };

const d = window.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => Array.from(d.querySelectorAll(s));
const txt = () => d.body.textContent || '';

async function waitFor(fn, label, ms = 30000) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { const v = fn(); if (v) return v; } catch {}
		await sleep(200);
	}
	console.log(`  !! TIMEOUT: ${label}`);
	return null;
}

function setVal(el, v) {
	const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
	Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
	el.dispatchEvent(new window.Event('input', { bubbles: true }));
	el.dispatchEvent(new window.Event('change', { bubbles: true }));
}
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

await waitFor(() => q('input').length, 'app boot');
console.log('=== boot ===');
console.log('  inputs:', q('input').length, 'buttons:', q('button').length);

// ---------- login ----------
const pw = await waitFor(() => q('input[type=password]')[0], 'login form');
if (pw) {
	const form = pw.closest('form') || d.body;
	const user = Array.from(form.querySelectorAll('input')).find((i) => i.type !== 'password');
	setVal(user, USER);
	setVal(pw, PASS);
	const btn = Array.from(form.querySelectorAll('button')).find((b) => b.type === 'submit') || form.querySelector('button');
	click(btn);
	console.log('=== login submitted ===');
}

// ---------- wait for the orders grid ----------
const ok = await waitFor(() => q('tr[data-fill-idx]').length > 0, 'orders table rows');
await sleep(1500);

const rows = q('tr[data-fill-idx]');
console.log('=== orders table ===');
console.log('  rendered <tr> rows :', rows.length);
console.log('  total <input>      :', q('input').length);
console.log('  total DOM nodes    :', q('*').length);
const pager = txt().match(/عرض\s+\d+–\d+\s+من\s+\d+\s+طلبية/);
console.log('  pager              :', pager ? pager[0] : '(not found)');
const pageNums = q('button').filter((b) => ['«', '‹', '›', '»'].includes(b.textContent.trim()));
console.log('  pager buttons      :', pageNums.length);


// ---------- bulk Expédier vers ----------
const TOK='8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';
const countExp = () => JSON.parse(window.localStorage.getItem('paraveda_orders_v5')||'[]')
  .filter(o => !o._del && o.livraison === 'Expédier vers').length;

console.log('\n=== تبديل جماعي ===');
console.log('  Expédier vers قبل :', countExp());

const head2 = q('thead input[type=checkbox]')[0];
console.log('  checkbox الرأس     :', head2 ? '✅' : '❌');
if (head2) {
  click(head2);
  head2.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(1800);
}
const m = txt().match(/محدد:\s*(\d+)\s*طلبية/);
console.log('  المحدد             :', m ? m[1] : '❌ الشريط ما بانش');

const expBtn = q('button').find(b => (b.textContent||'').includes('Expédier vers ('));
console.log('  زر 🚚 Expédier vers:', expBtn ? '✅ ' + expBtn.textContent.trim() : '❌');
const selEl = q('select').find(e => (e.textContent||'').includes('بدّل Suivie'));
console.log('  قائمة بدّل Suivie  :', selEl ? '✅ (' + selEl.options.length + ' خيارات)' : '❌');

if (expBtn) {
  window.confirm = () => true;
  const before = countExp();
  click(expBtn);
  await sleep(4000);
  const after = countExp();
  console.log('  بعد الضغط          :', before, '→', after, after > before ? '✅ +' + (after - before) : '❌');
  console.log('  التحديد تمسح       :', /محدد:\s*\d+/.test(txt()) ? '⚠️ باقي' : '✅ إيه');
  const rows = q('tr[data-fill-idx]').length;
  console.log('  الجدول باقي يرسم   :', rows > 0 ? '✅ ' + rows + ' سطر' : '❌');
}

console.log('\n=== runtime errors ===');
console.log(errors.length ? errors.slice(0, 6).join('\n') : '  none ✅');
process.exit(0);
