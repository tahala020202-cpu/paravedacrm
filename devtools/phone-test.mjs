import fs from 'node:fs'; import vm from 'node:vm';
const js=fs.readFileSync('../public_html/public_html/index.html','utf8')
  .match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/)[1];
const a=js.indexOf('function __pvPhone(v){'), b=js.indexOf('function __pvLocalDate');
const ctx=vm.createContext({console});
vm.runInContext(js.slice(a,b)+'\nglobalThis.__P={__pvPhone,__pvClean};',ctx);
const {__pvPhone:P,__pvClean:C}=ctx.__P;

const cases=[
  // [مدخل, متوقع]
  ['0662 71 80 52','0662718052'],
  ['662718052','0662718052'],
  ['+212662718052','0662718052'],
  ['212662718052','0662718052'],
  ['00212662718052','0662718052'],
  ['212776946063','0776946063'],
  ['0662718052','0662718052'],
  ['671715536','0671715536'],
  ['770192106','0770192106'],
  ['0667133744','0667133744'],
  ['0668714474','0668714474'],
  ['0618361516','0618361516'],
  ['06 12 88 13 62','0612881362'],
  ['+212 662 71 80 52','0662718052'],
  ['0612-88-13-62','0612881362'],
  ['(0612) 881362','0612881362'],
  ['523456789','0523456789'],          // أرضي
  ['','' ],
  ['   ','' ],
  ['Wtsp 0612881362','0612881362'],    // نص + رقم
  ['123','123'],                        // قصير — ما نمسوهش
  ['abc','abc'],                        // بلا أرقام
];
let ok=0,bad=[];
for(const [i,e] of cases){ const g=P(i); if(g===e)ok++; else bad.push(`  «${i}» → «${g}»  (خاص «${e}»)`); }
console.log(`الدالة __pvPhone : ${ok}/${cases.length}`, bad.length?'❌':'✅');
bad.forEach(x=>console.log(x));

console.log('\n── __pvClean (الاستيراد/الإضافة) ──');
const o=C({nom:'  Ahmed  ', telephone:'+212 662 71 80 52', produit:' بخاخ  التحصين '});
console.log('  telephone:',JSON.stringify(o.telephone), o.telephone==='0662718052'?'✅':'❌');
console.log('  nom      :',JSON.stringify(o.nom));
console.log('  produit  :',JSON.stringify(o.produit));
const o2=C({telephone:'671715536'});
console.log('  بلا صفر  :',JSON.stringify(o2.telephone), o2.telephone==='0671715536'?'✅':'❌');
