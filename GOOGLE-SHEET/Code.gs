/**
 * ═══════════════════════════════════════════════════════════
 *  Paraveda CRM  ⇄  Google Sheets
 *  ⬅️ الشيت → CRM : الطلبيات الجداد (Storeep) كيتصيفطو لـCRM أوتوماتيكياً (كل 5 دقايق)
 *  ➡️ CRM → الشيت : الطلبيات كيتجبدو لورقة COMONDES (كل 10 دقايق)
 * ═══════════════════════════════════════════════════════════
 *
 *  ✅ الجبد كيبدا دايماً بالصيفط: ما كيتمسحش ولا طلبية جديدة من الشيت
 *  ✅ التكرار ما كيقع: السيرفر كيعرف الطلبية بالتاريخ + الهاتف + المنتوج
 *  ✅ كيكتب فورقة COMONDES، من السطر 9 لتحت
 *  ✅ السطور 1 حتى 8 (الإحصائيات + الرأس) ما كيتمسوش
 *  ✅ الأعمدة لي ماشي ديال الـCRM كتبقى كيف ما هي
 *  ❌ ما كيصاوب حتى ورقة جديدة
 */

// ─────────── الإعدادات ───────────

const PV_VERSION   = 'v8';
const CRM_URL      = 'https://paraveda.store/api.php';
const CRM_TOKEN    = '8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';
const TARGET_SHEET = 'COMONDES';   // سمية الورقة ديالك
const HEADER_ROW   = 8;            // السطر ديال الرأس

// الأوراق الزايدة لي كيحيّدهم الزر ديال النضافة
const OLD_SHEETS = ['CRM_COMMANDES', 'CRM_ADS', 'CRM_PERF'];

/* الرأس ديالك → الخانة ديال الـCRM (السكريبت كيطابق لوحدو) */
const COL_MAP = {
  confirmation:'statut', statut:'statut', remarques:'remarques', remarque:'remarques',
  id:'idCmd', idcmd:'idCmd', ordersid:'idCmd', nomprenom:'nom', nom:'nom', client:'nom',
  telephone:'telephone', tel:'telephone', ville:'ville', adress:'adresse', adresse:'adresse',
  qte:'qte', quantite:'qte', prix:'prix', produit:'produit',
  suivie:'livraison', suivi:'livraison', livraison:'livraison',
  upsel:'upsell', upsell:'upsell', agent:'agent', agente:'agent',
  carousell:'carousell', carosell:'carosellFlag', link:'link', lien:'link',
  originlead:'originLead', commision:'commission', commission:'commission',
  fees:'fees', livreur:'livreur', tracking:'tracking', motif:'motif',
  dateexp:'dateExp', datelive:'dateLiv', dateliv:'dateLiv'
};

/* ═══════════ القائمة ═══════════ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔗 Paraveda CRM')
    .addItem('📥  صيفط الطلبيات الجداد للـCRM دابا', 'pvPushManual')
    .addItem('📋  جبد الطلبيات دابا', 'pvPullOrders')
    .addSeparator()
    .addItem('⏰  فعّل التحديث الأوتوماتيكي', 'pvAutoOn')
    .addItem('⏹️  وقّف التحديث الأوتوماتيكي', 'pvAutoOff')
    .addSeparator()
    .addItem('🔍  فحص الأعمدة (بلا كتابة)', 'pvCheck')
    .addItem('🗑️  حيّد الأوراق الزايدة', 'pvCleanup')
    .addItem('🩺  اختبر الاتصال بالسيرفر', 'pvPing')
    .addItem('ℹ️  النسخة وفين كيكتب', 'pvVersion')
    .addToUi();
}

/* ═══════════ أدوات ═══════════ */

function pvProps_() { return PropertiesService.getDocumentProperties(); }

function pvCall_(qs) {
  /* التوكن كيتصيفط فالـheader وفالرابط بجوج — شي استضافات كتحيد الـheaders */
  const url = CRM_URL + (qs || '') + (qs && qs.indexOf('?') === 0 ? '&' : '?') +
              'token=' + encodeURIComponent(CRM_TOKEN);
  let res;
  try {
    res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'X-Sync-Token': CRM_TOKEN },
      followRedirects: true,
    });
  } catch (e) {
    throw new Error('ما قدرناش نوصلو للسيرفر.\n\nالرابط:\n' + url + '\n\n' + e.message);
  }
  const code = res.getResponseCode(), body = res.getContentText();
  if (code === 403) throw new Error('التوكن غالط (403).\n\nالرابط:\n' + url);
  if (code === 404) throw new Error(
    '❌ 404 — ما كاينش api.php فهاد الرابط:\n\n' + url +
    '\n\nصلّح السطر CRM_URL فوق فالسكريبت.\n' +
    'جرّب الرابط فالمتصفح: إلا عطاك {"ok":true...} راه صحيح.');
  if (code !== 200) throw new Error('السيرفر رجع ' + code + '\n\nالرابط:\n' + url +
                                    '\n\n' + body.slice(0, 200));
  try { return JSON.parse(body); }
  catch (e) { throw new Error('جواب ماشي JSON.\n\nالرابط:\n' + url + '\n\n' + body.slice(0, 200)); }
}

function pvToast_(m) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(m, 'Paraveda CRM', 6); } catch (e) {}
  Logger.log(m);
}

/** كينقّي سمية العمود: صغير، بلا شدّات، بلا فراغات ولا رموز */
function pvNorm_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** كيلقا ورقة COMONDES حتى إلا كانت السمية مكتوبة بشوية فرق */
function pvTarget_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TARGET_SHEET);
  if (sh) return sh;
  const want = pvNorm_(TARGET_SHEET), all = ss.getSheets();
  for (let i = 0; i < all.length; i++) if (pvNorm_(all[i].getName()) === want) return all[i];
  const loose = want.replace(/m+/g, 'm');   // COMONDES ≈ COMMANDES
  for (let i = 0; i < all.length; i++) {
    if (pvNorm_(all[i].getName()).replace(/m+/g, 'm') === loose) return all[i];
  }
  throw new Error('ما لقيتش ورقة "' + TARGET_SHEET + '".\n\nالأوراق لي كاينين:\n' +
    all.map(x => '• ' + x.getName()).join('\n') +
    '\n\nبدّل TARGET_SHEET فوق فالسكريبت.');
}

/** كيقرا الرأس وكيبني: رقم العمود → خانة الـCRM */
function pvMapHeader_(headers) {
  const map = {}; let dateSeen = 0;
  headers.forEach((h, i) => {
    const n = pvNorm_(h);
    if (!n) return;
    if (n === 'date' || n === 'ordersdate') { map[i] = (dateSeen++ === 0) ? 'dateCreation' : 'dateConfirmation'; return; }   // Date / Order's date (Storeep)
    if (COL_MAP[n]) map[i] = COL_MAP[n];
  });
  return map;
}

/** كيجمع الأعمدة المتلاصقة باش نكتبو بأقل عدد ديال العمليات */
function pvRuns_(idx) {
  const a = idx.slice().sort((x, y) => x - y), out = [];
  let s = null, p = null;
  a.forEach(i => {
    if (s === null) { s = p = i; return; }
    if (i === p + 1) { p = i; return; }
    out.push([s, p - s + 1]); s = p = i;
  });
  if (s !== null) out.push([s, p - s + 1]);
  return out;
}

const pvL_ = i => { let s = '', n = i + 1; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };

/* ═══════════ الأساسي: الطلبيات → COMONDES ═══════════ */

function pvPullOrders() {
  /* 1) الأول نصيفطو الطلبيات الجداد لي دخلات للشيت (Storeep) → CRM.
   *    باش ما تتمسحوش ملي نكتبو الشيت من CRM. */
  const sync = pvPushNewOrders_();
  if (sync.skip) {
    throw new Error('⚠️ ماقدرناش نجبدو الطلبيات حيت ' + sync.skip + ' سطر ماتصيفطاتش للـCRM ' +
                    '(باش ما يتمسحوش من الشيت):\n\n• ' + sync.skipped.slice(0, 10).join('\n• ') +
                    '\n\nصلّح هاد الأسطر (التاريخ / الاسم أو الهاتف)، وعاود.');
  }

  const j = pvCall_('?export=orders');
  const cols = j.cols, rows = j.rows || [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = pvTarget_();

  const width = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(HEADER_ROW, 1, 1, width).getValues()[0];
  const map = pvMapHeader_(headers);
  const idx = Object.keys(map).map(Number);
  if (!idx.length) throw new Error('ما لقيت حتى عمود كنعرفو فالسطر ' + HEADER_ROW +
                                   ' ديال "' + sh.getName() + '".');

  /* 🛡️ نسخة احتياطية مرة وحدة قبل أول كتابة */
  if (!pvProps_().getProperty('backupDone')) {
    const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmm');
    sh.copyTo(ss).setName(sh.getName() + '_SAUVEGARDE_' + stamp);
    pvProps_().setProperty('backupDone', '1');
  }

  const at = {};
  cols.forEach((c, i) => { at[c] = i; });
  const start = HEADER_ROW + 1;

  /* 🛡️ إلا دخلات طلبيات جداد للشيت وسط هاد العملية، ما كنمسحوش — عاود مرة أخرى */
  if (sh.getLastRow() !== sync.lastRow) {
    throw new Error('الشيت تبدل وانت كتجبد (طلبية جديدة دخلات). عاود المحاولة دابا.');
  }

  /* كنمسحو غير الأعمدة لي كنعمروها — الأعمدة ديالك الأخرى كيبقاو */
  const lastRow = sh.getLastRow();
  if (lastRow >= start) {
    pvRuns_(idx).forEach(r => sh.getRange(start, r[0] + 1, lastRow - start + 1, r[1]).clearContent());
  }

  if (rows.length) {
    const need = start + rows.length - 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    pvRuns_(idx).forEach(r => {
      const block = rows.map(src => {
        const out = [];
        for (let c = r[0]; c < r[0] + r[1]; c++) {
          const f = map[c];
          const v = (f !== undefined && at[f] !== undefined) ? src[at[f]] : '';
          out.push(v === null || v === undefined ? '' : v);
        }
        return out;
      });
      sh.getRange(start, r[0] + 1, block.length, r[1]).setValues(block);
    });
  }

  pvToast_('📋 ' + rows.length + ' طلبية فورقة ' + sh.getName());
  return rows.length;
}

/* ═══════════ الشيت → CRM: الطلبيات الجداد ═══════════ */

const PV_WHY_ = {
  'no-date':          'ماكاينش تاريخ',
  'bad-date':         'التاريخ ماشي صحيح (خاصو يكون 2026-10-08 ولا 08/10/2026)',
  'no-name-or-phone': 'خاصها اسم ولا رقم الهاتف',
  'bad-row':          'سطر غالط',
};

/** كيصيفط طلب POST للسيرفر (بنفس التوكن ديال القراية) */
function pvPost_(body) {
  const url = CRM_URL + '?token=' + encodeURIComponent(CRM_TOKEN);
  let res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      headers: { 'X-Sync-Token': CRM_TOKEN },
      muteHttpExceptions: true,
      followRedirects: false,
    });
  } catch (e) {
    throw new Error('ما قدرناش نوصلو للسيرفر (صيفط).\n\nالرابط:\n' + CRM_URL + '\n\n' + e.message);
  }
  const code = res.getResponseCode(), text = res.getContentText();
  if (code === 403) throw new Error('التوكن غالط (403).');
  if (code >= 300 && code < 400) throw new Error('السيرفر حوّل الطلب (' + code + ').\n\nخاص CRM_URL يكون https:// مباشرة.');
  if (code !== 200) throw new Error('السيرفر رجع ' + code + '\n\n' + text.slice(0, 200));
  let j;
  try { j = JSON.parse(text); }
  catch (e) { throw new Error('جواب ماشي JSON.\n\n' + text.slice(0, 200)); }
  if (!j.ok) throw new Error('السيرفر رفض الطلب: ' + (j.err || 'unknown'));
  return j;
}

/**
 * كيقرا كل الأسطر ديال COMONDES وكيصيفط للـCRM اللي ماكاينينش.
 * التكرار كيتحسب فالسيرفر، فإعادة الصيفط ما كتزيد حتى طلبية مرتين.
 * كيرجع: { added, dup, skip, skipped:[...], lastRow }
 */
function pvPushNewOrders_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = pvTarget_();
  const width = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(HEADER_ROW, 1, 1, width).getValues()[0];
  const map = pvMapHeader_(headers);
  const cols = Object.keys(map).map(Number);
  const lastRow = sh.getLastRow();
  const out = { added: 0, dup: 0, skip: 0, skipped: [], lastRow: lastRow };
  if (!cols.length) {
    throw new Error('ما لقيت حتى عمود كنعرفو فالسطر ' + HEADER_ROW + ' ديال "' + sh.getName() + '".');
  }
  if (lastRow <= HEADER_ROW) return out;

  const tz = ss.getSpreadsheetTimeZone();
  const vals = sh.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, width).getValues();
  const rows = [], refs = [];
  vals.forEach((line, k) => {
    const o = {};
    cols.forEach(c => {
      let v = line[c];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      v = (v === null || v === undefined) ? '' : String(v).trim();
      const f = map[c];
      if (o[f] === undefined || o[f] === '') o[f] = v;
    });
    if (!o.nom && !o.telephone && !o.produit && !o.dateCreation) return;   // سطر خاوي
    rows.push(o);
    refs.push(HEADER_ROW + 1 + k);
  });

  const CHUNK = 500;
  for (let s = 0; s < rows.length; s += CHUNK) {
    const j = pvPost_({ action: 'sheet_orders', rows: rows.slice(s, s + CHUNK) });
    (j.results || []).forEach(r => {
      if (r.st === 'added') out.added++;
      else if (r.st === 'dup') out.dup++;
      else {
        out.skip++;
        out.skipped.push('سطر ' + refs[s + r.i] + ': ' + (PV_WHY_[r.why] || r.why || '?'));
      }
    });
  }
  if (out.added) pvToast_('📥 تزادو ' + out.added + ' طلبية جديدة للـCRM');
  return out;
}

function pvPushManual() {
  const ui = SpreadsheetApp.getUi();
  let r;
  try { r = pvPushNewOrders_(); }
  catch (e) { ui.alert('❌ ماتصيفطات حتى طلبية\n\n' + e.message); return; }
  ui.alert('📥 الصيفط للـCRM — سالا\n\n' +
    '✅ تزادو جداد : ' + r.added + '\n' +
    '➖ كانو deja فـCRM : ' + r.dup + '\n' +
    '⚠️ ماتصيفطاتش : ' + r.skip +
    (r.skipped.length ? '\n\n' + r.skipped.slice(0, 15).join('\n') : ''));
}

/** تريغر كل 5 دقايق: كيصيفط غير الجداد (ما كيكتبش فالشيت — آمن) */
function pvPushTick() {
  try {
    const r = pvPushNewOrders_();
    Logger.log('push: +' + r.added + ' dup=' + r.dup + ' skip=' + r.skip);
  } catch (e) { Logger.log('push: ' + e.message); }
}

/* ═══════════ فحص (بلا كتابة) ═══════════ */

function pvCheck() {
  const sh = pvTarget_();
  const width = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(HEADER_ROW, 1, 1, width).getValues()[0];
  const map = pvMapHeader_(headers);
  const ok = [], no = [];
  headers.forEach((h, i) => {
    const t = String(h == null ? '' : h).trim();
    if (map[i]) ok.push('✅ ' + pvL_(i) + '  «' + t + '»  →  ' + map[i]);
    else if (t) no.push('➖ ' + pvL_(i) + '  «' + t + '»');
  });
  SpreadsheetApp.getUi().alert(
    '🔍 فحص — ما كتبت والو\n\n' +
    'الورقة: ' + sh.getName() + '  ·  الرأس: السطر ' + HEADER_ROW + '\n' +
    'الطلبيات كتبدا من السطر ' + (HEADER_ROW + 1) + '\n\n' +
    'غادي تتعمّر (' + ok.length + '):\n' + (ok.join('\n') || '(والو!)') +
    '\n\nما غاديش تتمس (' + no.length + '):\n' + (no.join('\n') || '—'));
}

/* ═══════════ نضافة: حيّد الأوراق الزايدة ═══════════ */

function pvCleanup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const found = OLD_SHEETS.filter(n => ss.getSheetByName(n));
  if (!found.length) { pvToast_('✅ ما كاين حتى ورقة زايدة.'); return; }
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('🗑️ نحيّدو هاد الأوراق؟\n\n• ' + found.join('\n• ') +
                     '\n\n⚠️ إلا كانت شي صيغة فـCOMONDES كتجبد منهم، غادي تطيح.\n' +
                     'السكريبت دابا كيكتب مباشرة فـCOMONDES، إذن ما بقاوش خاصين.',
                     ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  found.forEach(n => { try { ss.deleteSheet(ss.getSheetByName(n)); } catch (e) { Logger.log(e); } });
  pvProps_().deleteProperty('owned');
  pvToast_('🗑️ تحيدو: ' + found.join(' · '));
}

/* ═══════════ اختبار الاتصال ═══════════ */

function pvPing() {
  const ui = SpreadsheetApp.getUi();
  try {
    const j = pvCall_('?export=stats');
    ui.alert('✅ الاتصال خدام\n\n' +
      'الرابط: ' + CRM_URL + '\n\n' +
      'الطلبيات الحية : ' + j.live_orders + '\n' +
      'الممسوحة       : ' + j.deleted + '\n' +
      'من ' + j.oldest + ' إلى ' + j.newest + '\n\n' +
      'دابا تقدر دير «📋 جبد الطلبيات دابا».');
  } catch (e) {
    ui.alert('❌ الاتصال ما خدامش\n\n' + e.message);
  }
}

/* ═══════════ معلومات ═══════════ */

function pvVersion() {
  let where = '', err = '';
  try { where = pvTarget_().getName(); } catch (e) { err = e.message; }
  const extra = OLD_SHEETS.filter(n => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n));
  SpreadsheetApp.getUi().alert(
    'ℹ️ معلومات\n\n' +
    'النسخة: ' + PV_VERSION + '   (خاصها تكون v8)\n' +
    'السيرفر: ' + CRM_URL + '\n\n' +
    'الطلبيات كتتكتب فورقة: ' + (where || '❌ ما لقيتهاش') + '\n' +
    'من السطر: ' + (HEADER_ROW + 1) + '\n\n' +
    'أوراق زايدة باقية: ' + (extra.length ? extra.join(' · ') + '  → دير «🗑️ حيّد الأوراق الزايدة»' : 'والو ✅') +
    (err ? '\n\n⚠️ ' + err : ''));
}

/* ═══════════ التحديث الأوتوماتيكي ═══════════ */

function pvAutoTick() {
  try { pvPullOrders(); } catch (e) { Logger.log('orders: ' + e.message); }
}

function pvAutoOn() {
  pvAutoOff();
  ScriptApp.newTrigger('pvPushTick').timeBased().everyMinutes(5).create();    // الشيت → CRM
  ScriptApp.newTrigger('pvAutoTick').timeBased().everyMinutes(10).create();   // CRM → الشيت (كيصيفط الجداد قبلو)
  pvToast_('⏰ مفعّل: الطلبيات الجداد كل 5 دقائق — والجبد من CRM كل 10 دقائق.');
}

function pvAutoOff() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (h === 'pvAutoTick' || h === 'pvPushTick') ScriptApp.deleteTrigger(t);
  });
  pvToast_('⏹️ التحديث الأوتوماتيكي موقّف.');
}
