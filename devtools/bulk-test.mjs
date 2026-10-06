import { JSDOM, VirtualConsole } from 'jsdom';
const BASE='http://localhost:8080';
const errors=[]; const vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push('jsdomError: '+(e.stack||e.message)));
vc.on('error',(...a)=>errors.push('console.error: '+a.map(String).join(' ')));
let html=(await (await fetch(BASE+'/index.html')).text()).replace('<script type="module" crossorigin>','<script>');
const dom=new JSDOM(html,{url:BASE+'/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
 beforeParse(w){try{w.localStorage.setItem('paraveda_reset_seen',String(Date.now()));
  w.localStorage.setItem('pv_page_size','500');
  w.localStorage.setItem('paraveda_period_v2',JSON.stringify({period:'all',from:'2026-01-01',to:'2026-12-31'}));
  w.localStorage.setItem('ct_paraveda_period_v2',String(Date.now()+6e5));
  Object.defineProperty(w.location,'reload',{value:()=>{},configurable:true});}catch{}}});
const w=dom.window; w.fetch=(u,o)=>fetch(new URL(u,BASE),o);
w.matchMedia||=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
w.scrollTo||=()=>{}; w.Element.prototype.scrollTo||=function(){};
w.ResizeObserver||=class{observe(){}unobserve(){}disconnect(){}};
w.IntersectionObserver||=class{observe(){}unobserve(){}disconnect(){}};
const d=w.document, sleep=m=>new Promise(r=>setTimeout(r,m)), q=s=>Array.from(d.querySelectorAll(s));
const txt=()=>d.body.textContent||'';
const wait=async(f,ms=30000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(f())return 1}catch{}await sleep(200)}return 0};
const setV=(el,v)=>{const P=el.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(P,'value').set.call(el,v);
 el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));

await wait(()=>q('input[type=password]').length);
const pw=q('input[type=password]')[0], f=pw.closest('form')||d.body;
setV(Array.from(f.querySelectorAll('input')).find(i=>i.type!=='password'),'admin@paraveda.ma');
setV(pw,'rOYtKv0cd9UW');
click(f.querySelector('button[type=submit]')||f.querySelector('button'));
await wait(()=>q('tr[data-fill-idx]').length>0); await sleep(1500);

const api=async()=>{const r=await fetch(BASE+'/api.php?export=stats',{headers:{'X-Sync-Token':'8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df'}});return r.json()};
const countExp=()=>JSON.parse(w.localStorage.getItem('paraveda_orders_v5')||'[]')
  .filter(o=>!o._del&&o.livraison==='Expédier vers').length;

console.log('── قبل ──');
console.log('  Expédier vers فالداتا:', countExp());

// checkbox ديال الرأس كيحدد الكل
const head=q('thead input[type=checkbox]')[0];
console.log('  checkbox ديال الرأس:', head?'✅':'❌');
if(head){ head.checked=true; head.dispatchEvent(new w.Event('click',{bubbles:true}));
  head.dispatchEvent(new w.Event('change',{bubbles:true})); await sleep(1500); }
const bar=txt().match(/محدد:\s*(\d+)\s*طلبية/);
console.log('  المحدد:', bar?bar[1]:'?');

// الزر الجديد
const expBtn=q('button').find(b=>(b.textContent||'').includes('Expédier vers ('));
console.log('\n── الزر الجديد ──');
console.log('  🚚 Expédier vers:', expBtn? '✅ '+expBtn.textContent.trim():'❌ ما كاينش');
const sel=q('select').find(e=>(e.textContent||'').includes('بدّل Suivie'));
console.log('  قائمة بدّل Suivie:', sel?'✅':'❌');

if(expBtn){
  w.confirm=()=>true;
  const before=countExp();
  click(expBtn); await sleep(3000);
  const after=countExp();
  console.log('\n── بعد الضغط ──');
  console.log('  Expédier vers:', before,'→',after, after>before?'✅ تبدلو '+(after-before):'❌');
  console.log('  التحديد تمسح:', /محدد:\s*\d+/.test(txt())?'⚠️ باقي':'✅ إيه');
}
console.log('\n=== أخطاء ===');
console.log(errors.length?errors.slice(0,5).join('\n'):'  والو ✅');
process.exit(0);
