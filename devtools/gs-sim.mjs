// محاكاة pvPullOrders + pvSyncAll
const URL='http://localhost:8081/api.php', TOK='8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';
const call=async(qs,p)=>{const o={headers:{'X-Sync-Token':TOK}};
  if(p){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(p);}
  const r=await fetch(URL+(qs||''),o); if(!r.ok) throw new Error('http '+r.status); return r.json();};

const t0=Date.now();
const o=await call('?export=orders');
console.log('📋 COMMANDES :',o.rows.length,'طلبية ×',o.cols.length,'عمود');
const a=await call('?export=adspend');
console.log('💰 ADS       :',a.rows.length,'سطر');
const p=await call('?export=perf');
console.log('📊 PERFORMANCE:',p.rows.length,'سطر');
console.log('⏱  المجموع   :',Date.now()-t0,'ms');

// نتأكد بلي كل صف عندو نفس عدد الخانات (باش setValues ما يطيحش)
const bad=o.rows.filter(r=>r.length!==o.cols.length);
console.log('\nصفوف بحجم غالط:',bad.length, bad.length?'❌':'✅');
const types=new Set(); o.rows.forEach(r=>r.forEach(v=>types.add(typeof v)));
console.log('أنواع القيم:',[...types].join(', '),'(خاص يكونو string/number فقط)');
const nulls=o.rows.flat().filter(v=>v===null||v===undefined).length;
console.log('قيم فارغة null:',nulls, nulls?'❌':'✅');
