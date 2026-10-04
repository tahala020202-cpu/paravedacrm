const URL='http://localhost:8080/api.php', TOK='8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';
const call=async(qs,p)=>{const o={headers:{'X-Sync-Token':TOK}};
  if(p){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(p);}
  const r=await fetch(URL+(qs||''),o); return r.json();};

// الشيت كيجبد
const pull=await call('?export=adspend');
const lastT=pull.t;
console.log('الشيت جبد فـ t =',lastT);

// شي حد زاد مصروف من واجهة الـCRM
const viaCrm=[{id:9001,date:'2026-10-04',agent:'safa',produit:'تيست من الCRM',source:'Leader',amount:12},...pull.rows];
await call('',{key:'paraveda_adspend_v1',t:Date.now(),rs:pull.rs,d:viaCrm});
console.log('شي حد زاد سطر من الـCRM 👤');

// الشيت كيحاول يصيفط بالداتا القديمة
const cur=await call('?export=adspend');
if(lastT && Number(cur.t)>lastT){
  console.log('🛡️ السكريبت وقف الكتابة — رسالة للمستخدم:');
  console.log('   "⚠️ المصاريف تبدّلو فالـCRM من آخر مرة جبدتي.');
  console.log('    دير ⬇️ جبد أولاً، ومن بعد عاود صيفط."');
  console.log('   → السطر ديال الـCRM ما تمساش ✅');
} else { console.log('❌ الحماية ما خدماتش'); }

const after=await call('?export=adspend');
console.log('\nعدد الأسطر:',after.rows.length,'| سطر الـCRM باقي؟',
  after.rows.some(r=>r.id===9001)?'✅ إيه':'❌ تمسح');
