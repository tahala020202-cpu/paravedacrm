import fs from 'node:fs';
import vm from 'node:vm';

let store={}, sheets=new Map();
const mkSheet=n=>({name:n,
  getRange:()=>({setValues(){return this},setFontWeight(){return this},
                 setBackground(){return this},setFontColor(){return this},
                 clearContent(){return this},setNumberFormat(){return this}}),
  getFrozenRows:()=>1,setFrozenRows:()=>{},getLastRow:()=>1,getLastColumn:()=>5});

const ctx=vm.createContext({
  SpreadsheetApp:{getActiveSpreadsheet:()=>({
    getSheetByName:n=>sheets.get(n)||null,
    insertSheet:n=>{const s=mkSheet(n);sheets.set(n,s);return s},
    toast:()=>{},getSpreadsheetTimeZone:()=>'UTC',
    getUi:()=>({createMenu:()=>({addItem(){return this},addSeparator(){return this},addToUi(){}})})})},
  PropertiesService:{getDocumentProperties:()=>({
    getProperty:k=>store[k]??null,setProperty:(k,v)=>{store[k]=v}})},
  Logger:{log:()=>{}}, UrlFetchApp:{}, ScriptApp:{}, Utilities:{}, console,
});
vm.runInContext(fs.readFileSync('../GOOGLE-SHEET/Code.gs','utf8') + '\nglobalThis.__T={SH_CMD,SH_ADS,SH_PERF,pvSheet_};', ctx);
const {SH_CMD,SH_ADS,SH_PERF,pvSheet_}=ctx.__T;

console.log('── حالة المستخدم: عندو ورقة "COMMANDES" فيها خدمتو ──');
sheets.set('COMMANDES', mkSheet('COMMANDES'));
console.log('   السكريبت دابا كيستهدف:', SH_CMD+',', SH_ADS+',', SH_PERF);

console.log('\n1) السكريبت كيصاوب أوراقو');
pvSheet_(SH_CMD,['id','nom']); pvSheet_(SH_ADS,['id']); pvSheet_(SH_PERF,['id']);
console.log('   ✅ تصاوبو');
console.log('   ورقة COMMANDES ديال المستخدم باقة؟', sheets.has('COMMANDES')?'✅ إيه':'❌ تمسحات');

console.log('\n2) الحماية: نحاولو نكتبو فورقة ديال المستخدم');
try { pvSheet_('COMMANDES',['id','nom']); console.log('   ❌ الحماية ما خدماتش!'); }
catch(e){ console.log('   🛡️ وقفات —', e.message.split('\n')[0]); }

console.log('\n3) نعاودو على ورقة ديالنا');
pvSheet_(SH_CMD,['id','nom']); console.log('   ✅ عادي');

console.log('\nالأوراق:', [...sheets.keys()].join(' | '));
