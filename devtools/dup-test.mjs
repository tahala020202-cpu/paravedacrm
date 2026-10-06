import fs from 'node:fs'; import vm from 'node:vm';
const html=fs.readFileSync('../public_html/public_html/index.html','utf8');
const js=html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/)[1];
const i=js.indexOf('const __pvDupWin=7;'), j=js.indexOf('const j2=e=>e.toLocaleString');
let store={};
const ctx=vm.createContext({
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v}},
  aa:()=>{}, Ms:()=>{}, ee:{useSyncExternalStore:()=>0}, console, Date,
  Xv:e=>{const n=String(e??'').replace(/\D/g,'');return n?(n.length>9?n.slice(-9):n):''},
  Wi:e=>String(e??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
         .replace(/[^a-z0-9\u0600-\u06FF]+/g,' ').trim(),
});
vm.runInContext(js.slice(i,j)+'\nglobalThis.__X={$v,ZT,$T,__pvDupAdd,__pvDupOk,__pvDupClear};',ctx);
const X=ctx.__X;

const d=JSON.parse(fs.readFileSync('../public_html/public_html/crm_data.json','utf8'));
const orders=d.paraveda_orders_v5.d.filter(o=>!o._del);

let st=X.$v(orders); let gs=X.ZT(st);
console.log('── بالقاعدة الجديدة ──');
console.log('   مجموعات:',gs.length,'· طلبيات معلّمة:',st.dupOrders.size);
console.log('\n   المجموعات:');
gs.forEach(g=>{
  const ds=g.orders.map(o=>String(o.dateCreation).slice(0,10));
  console.log(`   📞 ${g.phone} · ${g.orders.length} طلبيات · ${g.orders[0].produit?.slice(0,22)} · ${ds.join(' ، ')}`);
});

console.log('\n── نجربو زر «✓ ماشي مكررة» على أول مجموعة ──');
const sig=gs[0].sig;
X.__pvDupAdd(sig);
st=X.$v(orders); let gs2=X.ZT(st);
console.log('   قبل:',gs.length,'مجموعة → بعد:',gs2.length,'مجموعة',gs2.length===gs.length-1?'✅':'❌');
console.log('   الطلبيات ديالها بقات معلّمة؟', gs[0].orders.some(o=>st.dupOrders.has(o.id))?'❌ إيه':'✅ لا');

console.log('\n── نزيدو طلبية جديدة لنفس الرقم (خاص ينبّه من جديد) ──');
const base=gs[0].orders[0];
const extra={...base,id:999999999,dateCreation:base.dateCreation};
const st3=X.$v([...orders,extra]); const gs3=X.ZT(st3);
const back=gs3.some(g=>g.orders.some(o=>o.id===999999999));
console.log('   رجع ينبّه؟', back?'✅ إيه':'❌ لا');

console.log('\n── «↺ رجّع الكل» ──');
X.__pvDupClear();
console.log('   المجموعات:',X.ZT(X.$v(orders)).length, X.ZT(X.$v(orders)).length===gs.length?'✅':'❌');

console.log('\n── $T (العلامة 🚨 فالجدول) ──');
const st4=X.$v(orders);
const flagged=orders.filter(o=>st4.dupOrders.has(o.id));
const t=X.$T(flagged[0],st4);
console.log('   طلبية معلّمة → count:',t.count,'byPhone:',t.byPhone,'others:',t.others.length, t.count>0?'✅':'❌');
const clean=orders.find(o=>!st4.dupOrders.has(o.id));
console.log('   طلبية عادية  → count:',X.$T(clean,st4).count, X.$T(clean,st4).count===0?'✅':'❌');
