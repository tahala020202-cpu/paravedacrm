/**
 * ═══════════════════════════════════════════════════════════════
 *  Paraveda CRM  ⇄  Google Sheets
 *  ربط المصاريف ديال الإعلانات (Dashboard performance) مع الشيت
 * ═══════════════════════════════════════════════════════════════
 *
 *  ورقة "ADS"          ← هنا كتكتب المصاريف. كتمشي للـCRM.
 *  ورقة "PERFORMANCE"  ← جدول الأداء محسوب من الـCRM (قراءة فقط).
 *
 *  ⚠️ بدّل غير هاد السطرين تحت، وصافي.
 */

// ─────────── ①  الإعدادات — بدّلهم ───────────

const CRM_URL   = 'https://PARAVEDA.MA/api.php';   // ⬅️ بدّل بالدومين ديالك
const CRM_TOKEN = '8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';

// ─────────── ما تبدّل والو من هنا لتحت ───────────

const SH_ADS  = 'ADS';
const SH_PERF = 'PERFORMANCE';
const ADS_COLS  = ['id', 'date', 'agent', 'produit', 'source', 'amount'];
const PERF_COLS = ['date', 'agent', 'produit', 'source', 'amount',
                   'count', 'conf', 'livre', 'retour', 'ca', 'cpl'];
const PERF_AR = {
  date: 'التاريخ', agent: 'البنت', produit: 'المنتوج', source: 'المصدر',
  amount: 'المصروف', count: 'الطلبيات', conf: 'مؤكدة', livre: 'موصلة',
  retour: 'مرجوعة', ca: 'رقم المعاملات', cpl: 'CPL'
};

/* ════════════════ القائمة ════════════════ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔗 Paraveda CRM')
    .addItem('⬇️  جبد المصاريف من الـCRM', 'pvPull')
    .addItem('⬆️  صيفط المصاريف للـCRM', 'pvPush')
    .addSeparator()
    .addItem('📊  حدّث جدول الأداء', 'pvPullPerf')
    .addSeparator()
    .addItem('🔄  فعّل التحديث الأوتوماتيكي', 'pvAutoOn')
    .addItem('⏹️  وقّف التحديث الأوتوماتيكي', 'pvAutoOff')
    .addSeparator()
    .addItem('🛠️  وجّد الأوراق (أول مرة)', 'pvSetup')
    .addToUi();
}

/* ════════════════ أدوات ════════════════ */

function pvCall_(qs, payload) {
  const url = CRM_URL + (qs || '');
  const opt = {
    muteHttpExceptions: true,
    headers: { 'X-Sync-Token': CRM_TOKEN },
    followRedirects: true,
  };
  if (payload) {
    opt.method = 'post';
    opt.contentType = 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  const res  = UrlFetchApp.fetch(url, opt);
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code === 403) throw new Error('التوكن غالط (403). تأكد من CRM_TOKEN.');
  if (code !== 200) throw new Error('السيرفر رجع ' + code + ' — ' + body.slice(0, 200));
  let j;
  try { j = JSON.parse(body); }
  catch (e) { throw new Error('جواب ماشي JSON. تأكد من CRM_URL.\n' + body.slice(0, 200)); }
  return j;
}

function pvSheet_(name, headers, arabic) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    const label = headers.map(h => (arabic && arabic[h]) ? arabic[h] : h);
    sh.getRange(1, 1, 1, headers.length).setValues([label])
      .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function pvToast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Paraveda CRM', 6); } catch (e) {}
  Logger.log(msg);
}

/** التاريخ ديال الخلية → "yyyy-MM-dd" مهما كان شكلو */
function pvDate_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                 // 2026-09-25
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);          // 25/09/2026
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}

function pvProps_() { return PropertiesService.getDocumentProperties(); }

/* ════════════════ ① وجّد الأوراق ════════════════ */

function pvSetup() {
  pvSheet_(SH_ADS, ADS_COLS, PERF_AR);
  pvSheet_(SH_PERF, PERF_COLS, PERF_AR);
  pvToast_('✅ الأوراق واجدين. دابا دير «⬇️ جبد المصاريف من الـCRM».');
}

/* ════════════════ ② CRM → الشيت ════════════════ */

function pvPull() {
  const j = pvCall_('?export=adspend');
  const rows = j.rows || [];
  const sh = pvSheet_(SH_ADS, ADS_COLS, PERF_AR);

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ADS_COLS.length).clearContent();
  if (rows.length) {
    const vals = rows.map(r => ADS_COLS.map(c => (r[c] === undefined || r[c] === null) ? '' : r[c]));
    sh.getRange(2, 1, vals.length, ADS_COLS.length).setValues(vals);
  }
  sh.getRange(2, 2, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@'); // التاريخ نص
  sh.autoResizeColumns(1, ADS_COLS.length);

  pvProps_().setProperty('lastT', String(j.t || 0));
  pvProps_().setProperty('rs', String(j.rs || 0));
  pvToast_('⬇️ جبدنا ' + rows.length + ' سطر من الـCRM.');
}

/* ════════════════ ③ الشيت → CRM ════════════════ */

function pvPush(force) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_ADS);
  if (!sh) throw new Error('ما لقيتش ورقة "' + SH_ADS + '". دير «🛠️ وجّد الأوراق» أولاً.');

  const last = sh.getLastRow();
  const raw  = last > 1 ? sh.getRange(2, 1, last - 1, ADS_COLS.length).getValues() : [];

  // ①  نقرا ونصفّي
  const rows = [];
  let maxId = 0;
  raw.forEach(r => {
    const o = {};
    ADS_COLS.forEach((c, i) => { o[c] = r[i]; });
    o.date   = pvDate_(o.date);
    o.agent  = String(o.agent   || '').trim();
    o.produit= String(o.produit || '').trim();
    o.source = String(o.source  || '').trim();
    o.amount = Number(o.amount) || 0;
    // سطر خاوي؟ نقفزوه
    if (!o.date && !o.agent && !o.produit && !o.amount) return;
    if (!o.date) throw new Error('كاين سطر بلا تاريخ فورقة ADS. صلحو وعاود.');
    const id = Number(o.id) || 0;
    o.id = id;
    if (id > maxId) maxId = id;
    rows.push(o);
  });

  // ②  السطور الجداد (بلا id) كناخدو ليهم id جديد
  let next = maxId + 1;
  rows.forEach(o => { if (!o.id) o.id = next++; });

  // ③  🛡️ أمان: ما نصيفطوش ليستة خاوية
  if (!rows.length) {
    throw new Error('ورقة ADS خاوية — ما صيفطنا والو.\n' +
                    'إلا بغيتي تمسح كلشي بصح، دير هادشي من الـCRM مباشرة.');
  }

  // ④  🛡️ أمان: واش شي حد بدّل المصاريف فالـCRM من آخر مرة جبدنا؟
  const cur = pvCall_('?export=adspend');
  const lastT = Number(pvProps_().getProperty('lastT') || 0);
  if (!force && lastT && Number(cur.t) > lastT) {
    throw new Error('⚠️ المصاريف تبدّلو فالـCRM من آخر مرة جبدتي.\n\n' +
                    'إلا صيفطتي دابا غادي تمسح داكشي.\n' +
                    'دير «⬇️ جبد المصاريف من الـCRM» أولاً، ومن بعد عاود صيفط.');
  }

  // ⑤  صيفط
  const res = pvCall_('', {
    key: 'paraveda_adspend_v1',
    t:   Date.now(),
    rs:  Number(cur.rs || pvProps_().getProperty('rs') || 0),
    d:   rows.map(o => ({
      id: o.id, date: o.date, agent: o.agent,
      produit: o.produit, source: o.source, amount: o.amount
    })),
  });
  if (!res.ok) throw new Error('الـCRM رفض: ' + JSON.stringify(res));
  if (res.noop === 'ghost') throw new Error('الـCRM منع المسح (ليستة خاوية).');

  // ⑥  نرجّعو الـid الجداد للشيت
  const ids = rows.map(o => [o.id]);
  let w = 0;
  const back = raw.map(r => {
    const empty = !pvDate_(r[1]) && !String(r[2] || '').trim() &&
                  !String(r[3] || '').trim() && !(Number(r[5]) || 0);
    return empty ? [r[0]] : ids[w++];
  });
  if (back.length) sh.getRange(2, 1, back.length, 1).setValues(back);

  pvProps_().setProperty('lastT', String(res.t || Date.now()));
  pvToast_('⬆️ صيفطنا ' + rows.length + ' سطر للـCRM.');
}

function pvPushForce() { pvPush(true); }

/* ════════════════ ④ جدول الأداء (قراءة فقط) ════════════════ */

function pvPullPerf() {
  const j = pvCall_('?export=perf');
  const rows = j.rows || [];
  const sh = pvSheet_(SH_PERF, PERF_COLS, PERF_AR);

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, PERF_COLS.length).clearContent();
  if (rows.length) {
    const vals = rows.map(r => PERF_COLS.map(c => (r[c] === undefined || r[c] === null) ? '' : r[c]));
    sh.getRange(2, 1, vals.length, PERF_COLS.length).setValues(vals);
  }
  sh.autoResizeColumns(1, PERF_COLS.length);
  pvToast_('📊 جدول الأداء تحدّث — ' + rows.length + ' سطر.');
}

/* ════════════════ ⑤ التحديث الأوتوماتيكي ════════════════ */

function pvAutoTick() {
  // كل 10 دقائق: صيفط المصاريف الجداد، ومن بعد حدّث جدول الأداء
  try { pvPush(); } catch (e) { Logger.log('push: ' + e.message); }
  try { pvPullPerf(); } catch (e) { Logger.log('perf: ' + e.message); }
}

function pvAutoOn() {
  pvAutoOff();
  ScriptApp.newTrigger('pvAutoTick').timeBased().everyMinutes(10).create();
  pvToast_('🔄 التحديث الأوتوماتيكي مفعّل — كل 10 دقائق.');
}

function pvAutoOff() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'pvAutoTick') ScriptApp.deleteTrigger(t);
  });
  pvToast_('⏹️ التحديث الأوتوماتيكي موقّف.');
}
