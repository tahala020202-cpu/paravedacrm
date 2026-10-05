import fs from 'node:fs'; import vm from 'node:vm';

// ── محاكاة الورقة ديال المستخدم ──
const W=18, R=40;
const grid=Array.from({length:R},()=>Array(W).fill(''));
// السطور 1-7 = جدول الإحصائيات ديالو
grid[0][0]=''; grid[1][0]='AYA'; grid[1][1]=106; grid[3][0]='IMANE';
// السطر 8 = الرأس ديالو (index 7)
grid[7]=['date','date','CONFIRMA TION','Remarques','ID','Nom& Prénom','Téléphone','Ville',
         'Adress','Qte','Prix','Produit','Suivie','UPSEL','AGENT','CAROUSELL','commision','ملاحظة ديالي'];
// السطور 9+ = داتا قديمة ديالو
for(let r=8;r<20;r++){ for(let c=0;c<W;c++) grid[r][c]='قديم'+r; }

let props={};
const sheet={
  getLastColumn:()=>W, getLastRow:()=>20, getMaxRows:()=>R,
  insertRowsAfter:()=>{}, getFrozenRows:()=>1, setFrozenRows(){},
  copyTo:()=>({setName:n=>{copies.push(n)}}),
  getRange(r,c,nr,nc){ return {
    getValues:()=>Array.from({length:nr},(_,i)=>grid[r-1+i].slice(c-1,c-1+nc)),
    setValues(v){ v.forEach((row,i)=>row.forEach((val,k)=>{grid[r-1+i][c-1+k]=val})); return this },
    clearContent(){ for(let i=0;i<nr;i++) for(let k=0;k<nc;k++) grid[r-1+i][c-1+k]=''; return this },
    setNumberFormat(){return this}, setFontWeight(){return this},
    setBackground(){return this}, setFontColor(){return this} };}
};
const copies=[]; const sheets=new Map([['COMMANDES',sheet]]);
let alerted='';
const ORD={ok:true,t:1,cols:['id','dateCreation','dateConfirmation','statut','remarques','idCmd','nom',
 'telephone','ville','adresse','qte','prix','produit','livraison','upsell','carousell','agent','link',
 'carosellFlag','originLead','commission','fees','livreur','tracking','dateExp','dateLiv','motif'],
 rows:[[111,'2026-10-03','2026-10-03','Confirmé','rem1','1','نادية','0612','AGADIR','Hay fareh',1,190,
        'بخاخ','Livrée',0,'','imane','','','',35,'','','','','',''],
       [112,'2026-10-02','2026-10-02','Annulé','','2','ABDOU','0699','Rabat','Centre',5,850,
        'سكري','Retour',0,'','Meryam','','','',35,'','','','','','']]};

const ctx=vm.createContext({
  SpreadsheetApp:{getActiveSpreadsheet:()=>({
      getSheetByName:n=>sheets.get(n)||null,
      insertSheet:n=>{const s={...sheet};sheets.set(n,s);return s},
      toast:()=>{}, getSpreadsheetTimeZone:()=>'UTC', deleteSheet:n=>{}}),
    getUi:()=>({alert:m=>{alerted=m}, createMenu:()=>({addItem(){return this},addSeparator(){return this},addToUi(){}})})},
  PropertiesService:{getDocumentProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v}})},
  Utilities:{formatDate:()=>'20261004-2300'},
  UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(ORD)})},
  Logger:{log:()=>{}}, ScriptApp:{}, console,
});
vm.runInContext(fs.readFileSync('../GOOGLE-SHEET/Code.gs','utf8')+
  '\nglobalThis.__T={pvSetup,pvPullOrders,pvMapHeader_,HEADER_ROW};', ctx);
const T=ctx.__T;

console.log('── الرأس ديال المستخدم (السطر 8) ──');
const map=T.pvMapHeader_(grid[7]);
Object.entries(map).forEach(([i,f])=>console.log(`   العمود ${String.fromCharCode(65+ +i)} «${grid[7][i]}» → ${f}`));
console.log('   أعمدة ما تطابقاتش (كتبقى كيف ما هي):',
  grid[7].map((h,i)=>map[i]?null:`${String.fromCharCode(65+i)} «${h}»`).filter(Boolean).join(', '));

console.log('\n── pvSetup (خاص يدير نسخة احتياطية) ──');
T.pvSetup();
console.log('   النسخ الاحتياطية:', copies.join(', ') || '(والو)');

console.log('\n── pvPullOrders ──');
const n=T.pvPullOrders();
console.log('   كتبنا', n, 'طلبية');

console.log('\n── التحقق ──');
console.log('   السطر 2 (إحصائيات) باقي؟', grid[1][0]==='AYA'&&grid[1][1]===106 ? '✅ إيه':'❌ تمسح');
console.log('   السطر 8 (الرأس) باقي؟  ', grid[7][5]==='Nom& Prénom' ? '✅ إيه':'❌ تمسح');
console.log('   السطر 9 =', grid[8].slice(0,13).join(' | '));
console.log('   السطر 10=', grid[9].slice(0,13).join(' | '));
console.log('   العمود R «ملاحظة ديالي» فالسطر 9:', JSON.stringify(grid[8][17]), grid[8][17]==='قديم8'?'✅ ما تمسحش':'⚠️ تمسح');
console.log('   السطر 11 (داتا قديمة زايدة) تمسحات؟', grid[10].slice(0,13).every(v=>v==='')?'✅ إيه':'❌ لا');
