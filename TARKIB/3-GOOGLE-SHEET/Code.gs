/**
 * ═══════════════════════════════════════════════════════════
 *  Paraveda CRM  →  Google Sheets
 *  الطلبيات كيدخلو مباشرة لورقة COMONDES ديالك. وصافي.
 * ═══════════════════════════════════════════════════════════
 *
 *  ✅ كيكتب غير فورقة COMONDES، من السطر 9 لتحت
 *  ✅ السطور 1 حتى 8 (الإحصائيات + الرأس) ما كيتمسوش
 *  ✅ الأعمدة لي ماشي ديال الـCRM كتبقى كيف ما هي
 *  ❌ ما كيصاوب حتى ورقة جديدة
 */

// ─────────── الإعدادات ───────────

const PV_VERSION   = 'v6-SIMPLE';
const CRM_URL      = 'https://paraveda.store/api.php';
const CRM_TOKEN    = '8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';
const TARGET_SHEET = 'COMONDES';   // سمية الورقة ديالك
const HEADER_ROW   = 8;            // السطر ديال الرأس

// الأوراق الزايدة لي كيحيّدهم الزر ديال النضافة
const OLD_SHEETS = ['CRM_COMMANDES', 'CRM_ADS', 'CRM_PERF'];

/* الرأس ديالك → الخانة ديال الـCRM (السكريبت كيطابق لوحدو) */
const COL_MAP = {
  confirmation:'statut', statut:'statut', remarques:'remarques', remarque:'remarques',
  id:'idCmd', idcmd:'idCmd', nomprenom:'nom', nom:'nom', client:'nom',
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
    .addItem('📋  جبد الطلبيات دابا', 'pvPullOrders')
    .addSeparator()
    .addItem('⏰  فعّل التحديث الأوتوماتيكي', 'pvAutoOn')
    .addItem('⏹️  وقّف التحديث الأوتوماتيكي', 'pvAutoOff')
    .addSeparator()
    .addItem('🔍  فحص الأعمدة (بلا كتابة)', 'pvCheck')
    .addItem('🗑️  حيّد الأوراق الزايدة', 'pvCleanup')
    .addItem('ℹ️  النسخة وفين كيكتب', 'pvVersion')
    .addToUi();
}

/* ═══════════ أدوات ═══════════ */

function pvProps_() { return PropertiesService.getDocumentProperties(); }

function pvCall_(qs) {
  const res = UrlFetchApp.fetch(CRM_URL + (qs || ''), {
    muteHttpExceptions: true,
    headers: { 'X-Sync-Token': CRM_TOKEN },
    followRedirects: true,
  });
  const code = res.getResponseCode(), body = res.getContentText();
  if (code === 403) throw new Error('التوكن غالط (403). شوف CRM_TOKEN.');
  if (code !== 200) throw new Error('السيرفر رجع ' + code + ' — ' + body.slice(0, 200));
  try { return JSON.parse(body); }
  catch (e) { throw new Error('جواب ماشي JSON — تأكد من CRM_URL.\n' + body.slice(0, 200)); }
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
    if (n === 'date') { map[i] = (dateSeen++ === 0) ? 'dateCreation' : 'dateConfirmation'; return; }
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

/* ═══════════ معلومات ═══════════ */

function pvVersion() {
  let where = '', err = '';
  try { where = pvTarget_().getName(); } catch (e) { err = e.message; }
  const extra = OLD_SHEETS.filter(n => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n));
  SpreadsheetApp.getUi().alert(
    'ℹ️ معلومات\n\n' +
    'النسخة: ' + PV_VERSION + '   (خاصها تكون v6-SIMPLE)\n' +
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
  ScriptApp.newTrigger('pvAutoTick').timeBased().everyMinutes(10).create();
  pvToast_('⏰ التحديث الأوتوماتيكي مفعّل — كل 10 دقائق.');
}

function pvAutoOff() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'pvAutoTick') ScriptApp.deleteTrigger(t);
  });
  pvToast_('⏹️ التحديث الأوتوماتيكي موقّف.');
}
