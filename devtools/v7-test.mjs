import fs from 'node:fs'; import vm from 'node:vm';
const W=18,R=40;
const grid=Array.from({length:R},()=>Array(W).fill(''));
grid[1][0]='AYA'; grid[1][1]=106;
grid[7]=['date','date','CONFIRMA TION','Remarques','ID','Nom& Prénom','Téléphone','Ville',
         'Adress','Qte','Prix','Produit','Suivie','UPSEL','AGENT','CAROUSELL','commision','ملاحظة ديالي'];
// A9 فيها الصيغة القديمة لي كتجبد من CRM_COMMANDES
grid[8][0]='=IFERROR(FILTER(CRM_COMMANDES!B2:N;...))';
for(let r=9;r<18;r++) for(let c=0;c<13;c++) grid[r][c]='قديم';

const mk=name=>({getName:()=>name,getLastColumn:()=>W,getLastRow:()=>18,getMaxRows:()=>R,
 insertRowsAfter(){},getFrozenRows:()=>1,setFrozenRows(){},
 copyTo:()=>({setName:n=>copies.push(n)}),
 getRange(r,c,nr,nc){return{
   getValues:()=>Array.from({length:nr},(_,i)=>grid[r-1+i].slice(c-1,c-1+nc)),
   setValues(v){v.forEach((row,i)=>row.forEach((val,k)=>{grid[r-1+i][c-1+k]=val}));return this},
   clearContent(){for(let i=0;i<nr;i++)for(let k=0;k<nc;k++)grid[r-1+i][c-1+k]='';return this},
   setNumberFormat(){return this},setFontWeight(){return this},
   setBackground(){return this},setFontColor(){return this}}}});
const copies=[];const calls=[];
const sheets=new Map([['COMONDES',mk('COMONDES')],['CRM_COMMANDES',mk('CRM_COMMANDES')],
                      ['CRM_ADS',mk('CRM_ADS')],['CRM_PERF',mk('CRM_PERF')]]);
let props={},alerted='',toasts=[];
const ORD={ok:true,t:1,cols:['id','dateCreation','dateConfirmation','statut','remarques','idCmd','nom',
 'telephone','ville','adresse','qte','prix','produit','livraison','upsell','carousell','agent','link',
 'carosellFlag','originLead','commission','fees','livreur','tracking','dateExp','dateLiv','motif'],
 rows:[[1,'2026-10-06','2026-10-06','Confirmé','','1','Fouzia','0712107386','Oualidia','Hda',1,199,'كتاب','',0,'','Meryam','','','',35,'','','','','',''],
       [2,'2026-10-06','2026-10-06','Confirmé','','1','Youssef','0659208085','Berrechid','Lwafik',1,200,'بخاخ','Expédier vers',0,'','AYA','','','',35,'','','','','','']]};

const ctx=vm.createContext({
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets.get(n)||null,
   getSheets:()=>[...sheets.values()],insertSheet:n=>{const s=mk(n);sheets.set(n,s);return s},
   deleteSheet:s=>{sheets.delete(s.getName())},
   toast:(m)=>toasts.push(m),getSpreadsheetTimeZone:()=>'UTC'}),
  getUi:()=>({alert:(...a)=>{alerted=a[0];return 'YES'},
   ButtonSet:{YES_NO:'YN'},Button:{YES:'YES'},
   createMenu:()=>({addItem(){return this},addSeparator(){return this},addToUi(){}})})},
 PropertiesService:{getDocumentProperties:()=>({getProperty:k=>props[k]??null,
   setProperty:(k,v)=>{props[k]=v},deleteProperty:k=>{delete props[k]}})},
 Utilities:{formatDate:()=>'20261006-1800'},
 UrlFetchApp:{fetch:(u)=>{calls.push(u);return{getResponseCode:()=>200,getContentText:()=>JSON.stringify(ORD)}}},
 Logger:{log:()=>{}}, ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({everyMinutes:()=>({create(){}})})})},
 console});
vm.runInContext(fs.readFileSync('../GOOGLE-SHEET/Code.gs','utf8')+
 '\nglobalThis.__T={pvPullOrders,pvCleanup,pvCheck,OLD_SHEETS,PV_VERSION};',ctx);
const T=ctx.__T;

console.log('النسخة:',T.PV_VERSION);
console.log('الأوراق قبل:',[...sheets.keys()].join(' | '));

console.log('\n── pvPullOrders ──');
const n=T.pvPullOrders();
console.log('  كتب',n,'طلبية');
console.log('  الرابط لي تستعمل:',calls[0]);
console.log('  نسخة احتياطية:',copies.join(', ')||'(والو)');
console.log('  السطر 2 (إحصائيات):',grid[1][0]==='AYA'&&grid[1][1]===106?'✅ باقي':'❌');
console.log('  السطر 8 (الرأس)   :',grid[7][5]==='Nom& Prénom'?'✅ باقي':'❌');
console.log('  الصيغة القديمة فـA9:',String(grid[8][0]).startsWith('=')?'❌ باقية':'✅ تبدلات بقيمة');
console.log('  السطر 9 =',grid[8].slice(0,13).join(' | '));
console.log('  السطر 10=',grid[9].slice(0,13).join(' | '));
console.log('  عمود R ديالك    :',JSON.stringify(grid[8][17]));
console.log('  السطر 11 القديم  :',grid[10].slice(0,13).every(v=>v==='')?'✅ تمسح':'❌');

console.log('\n── pvCleanup ──');
T.pvCleanup();
console.log('  الأوراق بعد:',[...sheets.keys()].join(' | '));
console.log('  COMONDES باقية؟',sheets.has('COMONDES')?'✅':'❌');
console.log('  الزايدين تحيدو؟',T.OLD_SHEETS.every(n=>!sheets.has(n))?'✅':'❌');
