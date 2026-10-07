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


console.log('\n=== البطاقات (النسخة الاحترافية) ===');
const cards = q('button').filter(b => /À CONTACTER|SUIVI NÉCESSAIRE|PRÊT POUR|RISQUE|VENTES DU JOUR|TAUX DE CONVERSION/.test(b.textContent||''));
console.log('  العدد        :', cards.length, cards.length===6?'✅':'❌');
console.log('  أيقونات SVG  :', cards.filter(c=>c.querySelector('svg')).length+'/6',
            cards.every(c=>c.querySelector('svg'))?'✅ بلا إيموجي':'❌');
console.log('  ارتفاع ثابت  :', cards.every(c=>/min-h-\[106px\]/.test(c.className))?'✅ 106px':'❌');
console.log('  خلفية ملوّنة :', cards.every(c=>/bg-(red|amber|blue|violet|emerald|cyan)-50/.test(c.className))?'✅':'❌');
console.log('  hover lift   :', cards.every(c=>/hover:-translate-y-/.test(c.className))?'✅':'❌');
const grid=cards[0].parentElement;
console.log('  Responsive   :', /grid-cols-2/.test(grid.className)&&/sm:grid-cols-3/.test(grid.className)&&/xl:grid-cols-6/.test(grid.className)?'✅ 2/3/6':'❌');
const v=cards.find(c=>/VENTES/.test(c.textContent||''));
console.log('  شارة النسبة  :', /vs hier/.test(v.textContent||'') && (v.textContent.includes('▲')||v.textContent.includes('▼')) ? '✅' : '❌');
cards.forEach(c=>console.log('   ', (c.textContent||'').trim().replace(/\s+/g,' ').slice(0,58)));

const tot=()=>(txt().match(/من\s+(\d+)\s+طلبية/)||[])[1];
const base=tot();
const ship=cards.find(c=>/PRÊT POUR/.test(c.textContent||''));
const n=(ship.textContent.match(/\d+/)||[''])[0];
click(ship); await sleep(1600);
console.log('\n  فلترة PRÊT POUR :', tot(), '=', n, tot()===n?'✅':'⚠️');
console.log('  الحالة النشيطة  :', /ring-2/.test(ship.className)?'✅ حلقة':'❌', ship.textContent.includes('✕')?'✅ ✕':'❌');
click(ship); await sleep(1400);
console.log('  إلغاء           :', tot()===base?'✅ '+base:'❌');
console.log('\n  الأدوات باقية   :', q('button').some(b=>/Create Filter/.test(b.textContent||''))?'✅':'❌');
console.log('\n=== runtime errors ===');
console.log(errors.length ? errors.slice(0,6).join('\n') : '  none ✅');
process.exit(0);
