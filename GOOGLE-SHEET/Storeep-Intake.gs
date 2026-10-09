/**
 * ═══════════════════════════════════════════════════════════
 *  Paraveda CRM  ←  Storeep  (شيت الطلبيات الجداد)
 *  هاد السكريبت غير كيصيفط الطلبيات من الشيت للـCRM.
 *  ما كيكتبش فالشيت ولا كيمسح والو.
 * ═══════════════════════════════════════════════════════════
 *
 *  ✅ كيقرا السميات من السطر HEADER_ROW
 *  ✅ كيصيفط أوتوماتيكياً: فور دخول طلبية (تقريباً 20 ثانية)، وشبكة أمان كل دقيقة
 *  ✅ التكرار كيتحسب فالسيرفر: إعادة الصيفط ما كتزيد طلبية مرتين
 *  ✅ الطلبية بلا تاريخ ولا اسم/هاتف كتتجاهل وكتبان فالرسالة
 *
 *  هاد السكريبت مستقل عن Code.gs (لي كيخدم على الشيت القديم).
 *  ما تحطوش فالشيت القديم.
 */

// ─────────── الإعدادات ───────────

const IP_VERSION      = 'intake-v1';
const CRM_URL         = 'https://paraveda.store/api.php';
const CRM_TOKEN       = '8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';
const TARGET_SHEET    = '';   // '' = أول ورقة فالشيت. ولا دير سمية الورقة (مثلاً 'Orders')
const HEADER_ROW      = 1;    // السطر ديال السميات (فالشيت الجديد = 1)

/* السميات ديال الشيت → الخانات ديال الـCRM (نفس منطق Code.gs) */
const IP_COL_MAP = {
  id:'idCmd', idcmd:'idCmd', ordersid:'idCmd',
  nomprenom:'nom', nom:'nom', client:'nom',
  telephone:'telephone', tel:'telephone',
  ville:'ville',
  adress:'adresse', adresse:'adresse',
  qte:'qte', quantite:'qte',
  prix:'prix',
  produit:'produit',
  remarques:'remarques', remarque:'remarques',
  upsel:'upsell', upsell:'upsell',
  commision:'commission', commission:'commission',
};

/* ═══════════ القائمة ═══════════ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔗 Paraveda CRM')
    .addItem('📥  صيفط الطلبيات دابا', 'ipPushManual')
    .addSeparator()
    .addItem('⏰  فعّل الصيفط الأوتوماتيكي', 'ipAutoOn')
    .addItem('⏹️  وقّف الصيفط الأوتوماتيكي', 'ipAutoOff')
    .addSeparator()
    .addItem('🔍  فحص الأعمدة (بلا كتابة)', 'ipCheck')
    .addToUi();
}

/* ═══════════ أدوات ═══════════ */

function ipNorm_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function ipTarget_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!TARGET_SHEET) return ss.getSheets()[0];
  const sh = ss.getSheetByName(TARGET_SHEET);
  if (!sh) {
    throw new Error('ما لقيتش ورقة "' + TARGET_SHEET + '".\n\nالأوراق لي كاينين:\n' +
      ss.getSheets().map(x => '• ' + x.getName()).join('\n'));
  }
  return sh;
}

/** كيقرا السميات وكيعطي: رقم العمود → خانة الـCRM */
function ipMapHeader_(headers) {
  const map = {}; let dateSeen = 0;
  headers.forEach((h, i) => {
    const n = ipNorm_(h);
    if (!n) return;
    if (n === 'date' || n === 'ordersdate') {   // Date / Order's date (Storeep)
      map[i] = (dateSeen++ === 0) ? 'dateCreation' : 'dateConfirmation';
      return;
    }
    if (IP_COL_MAP[n]) map[i] = IP_COL_MAP[n];
  });
  return map;
}

function ipPost_(body) {
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
    throw new Error('ما قدرناش نوصلو للسيرفر.\n\n' + CRM_URL + '\n\n' + e.message);
  }
  const code = res.getResponseCode(), text = res.getContentText();
  if (code === 403) throw new Error('التوكن غالط (403).');
  if (code >= 300 && code < 400) throw new Error('السيرفر حوّل الطلب (' + code + '). خاص CRM_URL يكون https:// مباشرة.');
  if (code !== 200) throw new Error('السيرفر رجع ' + code + '\n\n' + text.slice(0, 200));
  let j;
  try { j = JSON.parse(text); }
  catch (e) { throw new Error('جواب ماشي JSON.\n\n' + text.slice(0, 200)); }
  if (!j.ok) throw new Error('السيرفر رفض الطلب: ' + (j.err || 'unknown'));
  return j;
}

const IP_WHY_ = {
  'no-date':          'ماكاينش تاريخ',
  'bad-date':         'التاريخ ماشي صحيح (خاصو يكون 2026-10-08 ولا 08/10/2026)',
  'no-name-or-phone': 'خاصها اسم ولا رقم الهاتف',
  'bad-row':          'سطر غالط',
};

/* ═══════════ الصيفط ═══════════ */

/** كيقرا كل الطلبيات ديال الشيت وكيصيفط اللي ماكاينينش فـCRM. ما كيكتبش فالشيت. */
function ipPushNewOrders_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ipTarget_();
  const width = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(HEADER_ROW, 1, 1, width).getValues()[0];
  const map = ipMapHeader_(headers);
  const cols = Object.keys(map).map(Number);
  const out = { added: 0, dup: 0, skip: 0, skipped: [] };
  if (!cols.length) {
    throw new Error('ما لقيت حتى عمود كنعرفو فالسطر ' + HEADER_ROW + ' ديال "' + sh.getName() + '".');
  }
  const lastRow = sh.getLastRow();
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
    const j = ipPost_({ action: 'sheet_orders', rows: rows.slice(s, s + CHUNK) });
    (j.results || []).forEach(r => {
      if (r.st === 'added') out.added++;
      else if (r.st === 'dup') out.dup++;
      else {
        out.skip++;
        out.skipped.push('سطر ' + refs[s + r.i] + ': ' + (IP_WHY_[r.why] || r.why || '?'));
      }
    });
  }
  return out;
}

function ipPushManual() {
  const ui = SpreadsheetApp.getUi();
  let r;
  try { r = ipPushNewOrders_(); }
  catch (e) { ui.alert('❌ ماتصيفطات حتى طلبية\n\n' + e.message); return; }
  ui.alert('📥 الصيفط للـCRM — سالا\n\n' +
    '✅ تزادو جداد : ' + r.added + '\n' +
    '➖ كانو deja فـCRM : ' + r.dup + '\n' +
    '⚠️ ماتصيفطاتش : ' + r.skip +
    (r.skipped.length ? '\n\n' + r.skipped.slice(0, 15).join('\n') : ''));
}

/** التريغر: كيصيفط أوتوماتيكياً */
function ipTick() {
  try {
    const r = ipPushNewOrders_();
    Logger.log('intake: +' + r.added + ' dup=' + r.dup + ' skip=' + r.skip);
  } catch (e) { Logger.log('intake: ' + e.message); }
}

/* ═══════════ فحص ═══════════ */

function ipCheck() {
  const sh = ipTarget_();
  const width = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(HEADER_ROW, 1, 1, width).getValues()[0];
  const map = ipMapHeader_(headers);
  const ok = [], no = [];
  headers.forEach((h, i) => {
    const t = String(h == null ? '' : h).trim();
    if (!t) return;
    if (map[i]) ok.push('✅ «' + t + '»  →  ' + map[i]);
    else no.push('➖ «' + t + '»');
  });
  SpreadsheetApp.getUi().alert(
    '🔍 فحص — ما كتبت والو\n\n' +
    'الورقة: ' + sh.getName() + '  ·  السميات: السطر ' + HEADER_ROW + '\n\n' +
    'غادي يتصيفط (' + ok.length + '):\n' + (ok.join('\n') || '(والو!)') +
    '\n\nما غاديش يتصيفط (' + no.length + '):\n' + (no.join('\n') || '—') +
    (ok.some(x => x.endsWith('dateCreation')) ? '' : '\n\n⚠️ ماكاينش عمود تاريخ! (Date / Order\'s date)'));
}

/* ═══════════ الأوتوماتيك ═══════════ */

/*  Google ما كيسمحش بأقل من دقيقة للتريغر بالتوقيت، لهذا:
 *  1) ملي تدخل طلبية جديدة للشيت → كيصيفط بعد ثواني قليلة (ipOnChange)
 *  2) كل دقيقة شبكة أمان (ipTick) إلا فاتت شي طلبية
 */

function ipOnChange() {
  Utilities.sleep(20000);   // نخليو Storeep يكمل كتابة السطر قبل الصيفط
  ipTick();
}

function ipAutoOn() {
  ipAutoOff();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('ipOnChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('ipTick').timeBased().everyMinutes(1).create();
  ss.toast('⏰ مفعّل: الطلبيات كتتصيفط فور دخولها (تقريباً 20 ثانية)، وشبكة الأمان كل دقيقة.', 'Paraveda CRM', 8);
}

function ipAutoOff() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (h === 'ipTick' || h === 'ipOnChange') ScriptApp.deleteTrigger(t);
  });
  SpreadsheetApp.getActiveSpreadsheet().toast('⏹️ الصيفط الأوتوماتيكي موقّف.', 'Paraveda CRM', 6);
}
