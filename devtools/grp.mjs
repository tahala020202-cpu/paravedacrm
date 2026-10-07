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


const cards=()=>q('button.pvk');
const tot=()=>(txt().match(/من\s+(\d+)\s+طلبية/)||[])[1];

console.log('\n=== التجميع حسب الوكيلة ===');
console.log('  قبل التفعيل — رؤوس مجموعات:', q('tr.pv-grp').length, q('tr.pv-grp').length===0?'✅ ما كايناش':'❌');

const ship=cards().find(c=>/PRÊT POUR/.test(c.textContent||''));
click(ship); await sleep(1800);
console.log('  بعد PRÊT POUR  :', tot(), 'طلبية');
const hdrs=q('tr.pv-grp');
console.log('  رؤوس المجموعات :', hdrs.length, hdrs.length>0?'✅':'❌');
hdrs.forEach(h=>{
  const b=h.querySelector('b'), n=h.querySelector('.pv-grp-n');
  console.log('     ▸', (b?b.textContent:'?').padEnd(12), (n?n.textContent:'').trim());
});
// الترتيب تنازلي؟
const counts=hdrs.map(h=>parseInt((h.querySelector('.pv-grp-n')||{}).textContent||'0'));
console.log('  ترتيب تنازلي   :', counts.every((v,i)=>i===0||counts[i-1]>=v)?'✅ '+counts.join(' ≥ '):'❌ '+counts.join(','));
// السطور مجمّعة فعلاً؟
const ags=q('tr[data-fill-idx]').map(r=>{const t=(r.textContent||'');return t;});
console.log('  مجموع السطور   :', ags.length);
// زر التحديد
const btn=hdrs[0] && hdrs[0].querySelector('.pv-grp-btn');
console.log('  زر "حدّد الكل" :', btn?'✅ '+btn.textContent.trim():'❌');
if(btn){ click(btn); await sleep(1400);
  const m=txt().match(/محدد:\s*(\d+)\s*طلبية/);
  console.log('  بعد الضغط      :', m?m[1]+' محدد':'❌', m&&+m[1]===counts[0]?'✅ = عدد المجموعة':'⚠️');
  console.log('  زر نسخ لديجيلوك:', q('button').some(b=>/نسخ لديجيلوك/.test(b.textContent||''))?'✅ متاح':'❌'); }

console.log('\n=== runtime errors ===');
console.log(errors.length ? errors.slice(0,5).join('\n') : '  none ✅');
process.exit(0);
