// محاكاة ديال Code.gs: pvPull -> تعديل فالشيت -> pvPush -> تحقق
const URL='http://localhost:8080/api.php';
const TOK='8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';
const call=async(qs,payload)=>{
  const o={headers:{'X-Sync-Token':TOK}};
  if(payload){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(payload);}
  const r=await fetch(URL+(qs||''),o);
  if(r.status===403) throw new Error('403 token');
  if(!r.ok) throw new Error('http '+r.status);
  return r.json();
};
const COLS=['id','date','agent','produit','source','amount'];

// ① pvPull → "الشيت"
let j=await call('?export=adspend');
let lastT=j.t;
let sheet=j.rows.map(r=>COLS.map(c=>r[c]??''));
console.log('① جبدنا:', sheet.length,'سطر | lastT =',lastT);

// ② المستخدم كيكتب 2 أسطر جداد فالشيت (بلا id) + كيبدل مبلغ
sheet.unshift(['', '2026-10-04','Meryam','خاتم ملكي','Facebook', 320]);
sheet.unshift(['', '2026-10-04','imane','لصقات التنحيف','Leader', 85]);
sheet[sheet.length-1][5] = 999;                 // تعديل آخر سطر
sheet.push(['','','','','','']);                 // سطر خاوي (خاصو يتقفز)
console.log('② فالشيت دابا:', sheet.length,'سطر (فيهم 1 خاوي)');

// ③ pvPush
const rows=[]; let maxId=0;
for(const r of sheet){
  const o={}; COLS.forEach((c,i)=>o[c]=r[i]);
  o.date=String(o.date||'').trim(); o.agent=String(o.agent||'').trim();
  o.produit=String(o.produit||'').trim(); o.source=String(o.source||'').trim();
  o.amount=Number(o.amount)||0;
  if(!o.date&&!o.agent&&!o.produit&&!o.amount) continue;
  if(!o.date) throw new Error('سطر بلا تاريخ');
  o.id=Number(o.id)||0; if(o.id>maxId)maxId=o.id; rows.push(o);
}
let next=maxId+1; rows.forEach(o=>{if(!o.id)o.id=next++;});
if(!rows.length) throw new Error('خاوي');
const cur=await call('?export=adspend');
if(lastT && Number(cur.t)>lastT) throw new Error('تبدّل فالـCRM');
const res=await call('',{key:'paraveda_adspend_v1',t:Date.now(),rs:Number(cur.rs||0),
  d:rows.map(o=>({id:o.id,date:o.date,agent:o.agent,produit:o.produit,source:o.source,amount:o.amount}))});
console.log('③ صيفطنا:',rows.length,'سطر →',JSON.stringify(res));

// ④ تحقق
const after=await call('?export=adspend');
console.log('④ فالـCRM دابا:',after.rows.length,'سطر');
console.log('   الجداد:',JSON.stringify(after.rows.slice(0,2),null,0));
const ids=after.rows.map(r=>Number(r.id));
console.log('   id مكررين؟',ids.length!==new Set(ids).size ? '❌ إيه':'✅ لا');
console.log('   المبلغ المعدّل وصل؟', after.rows[after.rows.length-1].amount===999 ? '✅ إيه':'❌ لا');

// ⑤ جدول الأداء كياخد الأسطر الجداد فعتبارو
const perf=await call('?export=perf');
const neu=perf.rows.filter(r=>r.date==='2026-10-04');
console.log('⑤ جدول الأداء:',perf.rows.length,'سطر | الأسطر ديال 2026-10-04:',neu.length);
neu.forEach(r=>console.log('   ',r.agent,'|',r.produit,'| مصروف',r.amount,'| طلبيات',r.count,'| CPL',r.cpl));
