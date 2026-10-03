import fs from 'node:fs';
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';

const targets = process.argv.slice(2);
const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } }));
php.setSapiName('cli');
php.mkdirTree('/work');
let fail = 0;
for (const t of targets) {
  php.writeFile('/work/t.php', fs.readFileSync(t, 'utf8'));
  const r = await php.run({ scriptPath: '/work/t.php', code: null, env: {}, argv: ['php','-l','/work/t.php'] })
    .catch(e => ({ text: '', errors: String(e), exitCode: 1 }));
  const txt = (r.text || '') + (r.errors || '');
  console.log(`### ${t}  exit=${r.exitCode}`);
  console.log(txt.trim() || '(no output)');
  if (r.exitCode) fail = 1;
}
process.exit(fail);
