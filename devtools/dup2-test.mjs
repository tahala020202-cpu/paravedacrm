import fs from 'node:fs'; import vm from 'node:vm';
const js=fs.readFileSync('../public_html/public_html/index.html','utf8')
  .match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/)[1];
const i=js.indexOf('const __pvDupWin=7;'), j=js.indexOf('const j2=e=>e.toLocaleString');
let store={};
const ctx=vm.createContext({
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v}},
  aa:()=>{}, Ms:()=>{}, ee:{useSyncExternalStore:()=>0}, console, Date,
  Xv:e=>{const n=String(e??'').replace(/\D/g,'');return n?(n.length>9?n.slice(-9):n):''},
  Wi:e=>String(e??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
         .replace(/[^a-z0-9\u0600-\u06FF]+/g,' ').trim(),
});
vm.runInContext(js.slice(i,j)+'\nglobalThis.__X={$v,ZT,__pvDupAdd,__pvDupOk,__pvDupClear};',ctx);
const X=ctx.__X;
const d=JSON.parse(fs.readFileSync('../public_html/public_html/crm_data.json','utf8'));
const orders=d.paraveda_orders_v5.d.filter(o=>!o._del);

let st=X.$v(orders);
console.log('🔴 بالأحمر (زبون عندو أكثر من طلبية):', st.repeat.size,'طلبية');
console.log('🚨 إنذار مكرر حقيقي            :', st.dupOrders.size,'طلبية ·', X.ZT(st).length,'مجموعة');
const both=[...st.dupOrders].filter(id=>st.repeat.has(id)).length;
console.log('   كل المعلّمين 🚨 عندهم حتى الأحمر؟', both===st.dupOrders.size?'✅ إيه':'❌ لا');

console.log('\n── نسكّتو كل المجموعات ──');
X.ZT(st).forEach(g=>X.__pvDupAdd(g.sig));
st=X.$v(orders);
console.log('🚨 الإنذارات :', st.dupOrders.size, X.ZT(st).length,'مجموعة', st.dupOrders.size===0?'✅ تحيدو':'❌');
console.log('🔴 بالأحمر   :', st.repeat.size,'طلبية', st.repeat.size>0?'✅ باقيين':'❌ تحيدو');

const sample=[...st.repeat.entries()].slice(0,3);
console.log('\n   أمثلة (رقم → عدد الطلبيات):');
sample.forEach(([id,n])=>{const o=orders.find(x=>x.id===id);
  console.log(`     ${o.telephone}  →  ${n} طلبيات  (${o.nom})`)});
X.__pvDupClear();
