import { JSDOM, VirtualConsole } from 'jsdom';
const BASE='http://localhost:8080';
const errors=[]; const vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push('jsdomError: '+(e.stack||e.message)));
vc.on('error',(...a)=>errors.push('console.error: '+a.map(String).join(' ')));
let html=await (await fetch(BASE+'/index.html')).text();
html=html.replace('<script type="module" crossorigin>','<script>');
const dom=new JSDOM(html,{url:BASE+'/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
 beforeParse(w){try{w.localStorage.setItem('paraveda_reset_seen',String(Date.now()));
  w.localStorage.setItem('paraveda_period_v2',JSON.stringify({period:'all',from:'2026-01-01',to:'2026-12-31'}));
  w.localStorage.setItem('ct_paraveda_period_v2',String(Date.now()+6e5));
  Object.defineProperty(w.location,'reload',{value:()=>{},configurable:true});}catch{}}});
const w=dom.window;
w.fetch=(u,o)=>fetch(new URL(u,BASE),o);
w.matchMedia||=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
w.scrollTo||=()=>{}; w.Element.prototype.scrollTo||=function(){};
w.ResizeObserver||=class{observe(){}unobserve(){}disconnect(){}};
w.IntersectionObserver||=class{observe(){}unobserve(){}disconnect(){}};
const d=w.document, sleep=m=>new Promise(r=>setTimeout(r,m)), q=s=>Array.from(d.querySelectorAll(s));
const txt=()=>d.body.textContent||'';
const wait=async(f,ms=30000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(f())return 1}catch{}await sleep(200)}return 0};
const set=(el,v)=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,v);
 el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));

await wait(()=>q('input[type=password]').length);
const pw=q('input[type=password]')[0], form=pw.closest('form')||d.body;
set(Array.from(form.querySelectorAll('input')).find(i=>i.type!=='password'),'admin@paraveda.ma');
set(pw,'rOYtKv0cd9UW');
click(form.querySelector('button[type=submit]')||form.querySelector('button'));
await wait(()=>q('tr[data-fill-idx]').length>0);
await sleep(1500);

console.log('سطور الجدول:', q('tr[data-fill-idx]').length);
console.log('tabs_list_v1 =', w.localStorage.getItem('tabs_list_v1'));
const bar=q('div').filter(e=>e.onclick||e.getAttribute('title'));
console.log('عناصر عندها title:', [...new Set(bar.map(e=>e.getAttribute('title')).filter(Boolean))].slice(0,20).join(' | '));
// نقلبو على التبويبة (التبويبات هي div بـ onClick)
const btns=q('div,button,a,li').filter(e=>(e.textContent||'').trim()==='Duplicate Client'||(e.getAttribute&&e.getAttribute('title')==='Duplicate Client'));
console.log('أزرار فيها "Duplicate Client":', btns.length, btns.length?'✅':'❌');
if(!btns.length){ console.log('نص الصفحة فيه؟', txt().includes('Duplicate Client')); }
else {
  click(btns[btns.length-1]);
  await sleep(2000);
  const t=txt();
  console.log('\n── الصفحة تفتحات؟ ──');
  console.log('  العنوان         :', t.includes('Duplicate Client')?'✅':'❌');
  console.log('  "زبناء معاودين" :', t.includes('زبناء معاودين')?'✅':'❌');
  console.log('  "رقم المعاملات" :', t.includes('رقم المعاملات')?'✅':'❌');
  console.log('  زر التصدير      :', t.includes('تصدير CSV')?'✅':'❌');
  const m=t.match(/زبناء معاودين(\d+)/); console.log('  عدد الزبناء     :', m?m[1]:'?');
  const cards=q('div').filter(e=>/^×\d+$/.test((e.textContent||'').trim()));
  console.log('  بطاقات الزبناء  :', cards.length);
  const phones=q('span').filter(e=>/^0?\d{9,10}$/.test((e.textContent||'').trim()));
  console.log('  أرقام الهواتف   :', phones.length, phones.slice(0,4).map(e=>e.textContent.trim()).join(', '));
  // بحث
  const si=q('input').find(i=>(i.placeholder||'').includes('قلّب'));
  if(si){ set(si,'zzzznope'); await sleep(800);
    console.log('  البحث (بلا نتيجة):', txt().includes('ما لقينا حتى نتيجة')?'✅':'❌'); }
}
console.log('\n=== أخطاء ===');
console.log(errors.length?errors.slice(0,5).join('\n'):'  والو ✅');
process.exit(0);
