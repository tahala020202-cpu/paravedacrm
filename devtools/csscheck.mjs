import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const csstree = require('css-tree');
const html = fs.readFileSync(process.argv[2],'utf8');
const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]);
blocks.forEach((css,i)=>{
  const errs=[];
  csstree.parse(css,{positions:true,onParseError(e){errs.push(e)}});
  console.log(`style[${i}] طول ${css.length} — أخطاء: ${errs.length}`);
  errs.slice(0,5).forEach(e=>{
    const ln=e.line, around=css.split('\n')[ln-1]||'';
    console.log('   ✗', e.message, '| سطر', ln);
    console.log('     ', around.slice(Math.max(0,e.column-60), e.column+90).trim().slice(0,170));
  });
});
