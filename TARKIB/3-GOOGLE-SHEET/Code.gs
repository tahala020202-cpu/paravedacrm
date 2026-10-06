/**
 * ═══════════════════════════════════════════════════════════════
 *  Paraveda CRM  ⇄  Google Sheets
 * ═══════════════════════════════════════════════════════════════
 *
 *  كيزيد 3 أوراق جداد فالملف ديالك. الأوراق ديالك ما كيتمسوش. ✅
 *
 *   📋 CRM_COMMANDES  الطلبيات من الـCRM          (قراءة فقط)
 *   💰 CRM_ADS        المصاريف — هنا كتكتب        (كتمشي للـCRM)
 *   📊 CRM_PERF       المصاريف + الطلبيات محسوبين (قراءة فقط)
 *
 *  ⚠️ ما تكتبش صيغ داخل هاد 3 أوراق — كيتمسحو ويتعاودو فكل تحديث.
 *     دير الحسابات ديالك فالأوراق ديالك، وجبد الداتا بصيغة:
 *        =CRM_COMMANDES!K2
 *        =SUMIFS(CRM_COMMANDES!L:L; CRM_COMMANDES!Q:Q; "imane")
 *        =QUERY(CRM_COMMANDES!A:AA; "select * where D='Confirmé'")
 */

// ─────────── ①  بدّل غير هاد السطر ───────────

const PV_VERSION = 'v5-COMONDES';   // ← علامة النسخة

const CRM_URL = 'https://paraveda.store/api.php';   // ✅ الدومين ديالك — واجد

const CRM_TOKEN = '8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';

// ─────────── ما تبدّل والو من هنا لتحت ───────────

/* v2: بادئة CRM_ باش ما يتضاربش مع الأوراق ديالك.
   (المستخدم عندو أصلاً ورقة سميتها COMMANDES فيها خدمتو) */
/* الطلبيات كيدخلو مباشرة لورقة المستخدم */
const TARGET_SHEET = 'COMONDES';   // سمية الورقة ديالك (بالضبط كيف ما هي فالتبويبة)
const HEADER_ROW   = 8;             // السطر ديال الرأس (date | date | CONFIRMATION | ...)
const SH_ADS = 'CRM_ADS', SH_PERF = 'CRM_PERF';

/* الرأس ديالك → الخانة ديال الـCRM.
   السكريبت كيقرا الرأس ديالك فالسطر 8 وكيطابقو لوحدو.
   الأعمدة لي ما كيعرفهومش كيخليهم كيف ما هوما. */
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
const ADS_COLS  = ['id', 'date', 'agent', 'produit', 'source', 'amount'];
const PERF_COLS = ['date','agent','produit','source','amount','count','conf','livre','retour','ca','cpl'];
const AR = {
  id:'id', date:'التاريخ', agent:'البنت', produit:'المنتوج', source:'المصدر',
  amount:'المصروف', count:'الطلبيات', conf:'مؤكدة', livre:'موصلة', retour:'مرجوعة',
  ca:'رقم المعاملات', cpl:'CPL',
  dateCreation:'تاريخ الطلبية', dateConfirmation:'تاريخ التأكيد', statut:'الحالة',
  remarques:'ملاحظات', idCmd:'رقم', nom:'الزبون', telephone:'الهاتف', ville:'المدينة',
  adresse:'العنوان', qte:'الكمية', prix:'الثمن', livraison:'التوصيل', upsell:'UPSELL',
  carousell:'CAROUSELL', link:'الرابط', carosellFlag:'CAROSELL', originLead:'مصدر الليد',
  commission:'العمولة', fees:'FEES', livreur:'الموزع', tracking:'التتبع',
  dateExp:'تاريخ الإرسال', dateLiv:'تاريخ التوصيل', motif:'السبب'
};

/* ════════════ القائمة ════════════ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔗 Paraveda CRM')
    .addItem('📋  جبد الطلبيات', 'pvPullOrders')
    .addItem('📊  حدّث جدول الأداء', 'pvPullPerf')
    .addSeparator()
    .addItem('⬇️  جبد المصاريف من الـCRM', 'pvPull')
    .addItem('⬆️  صيفط المصاريف للـCRM', 'pvPush')
    .addSeparator()
    .addItem('🔄  حدّث كلشي دابا', 'pvSyncAll')
    .addItem('⏰  فعّل التحديث الأوتوماتيكي', 'pvAutoOn')
    .addItem('⏹️  وقّف التحديث الأوتوماتيكي', 'pvAutoOff')
    .addSeparator()
    .addItem('ℹ️  النسخة وفين كيكتب', 'pvVersion')
    .addItem('🔍  فحص الأعمدة (بلا كتابة)', 'pvCheck')
    .addItem('🛠️  وجّد الأوراق (أول مرة)', 'pvSetup')
    .addItem('🗑️  حيّد ورقة CRM_COMMANDES', 'pvRemoveOldSheet')
    .addToUi();
}

/* ════════════ أدوات ════════════ */

function pvCall_(qs, payload) {
  const opt = { muteHttpExceptions: true, headers: { 'X-Sync-Token': CRM_TOKEN }, followRedirects: true };
  if (payload) {
    opt.method = 'post';
    opt.contentType = 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch(CRM_URL + (qs || ''), opt);
  const code = res.getResponseCode(), body = res.getContentText();
  if (code === 403) throw new Error('التوكن غالط (403). شوف CRM_TOKEN.');
  if (code !== 200) throw new Error('السيرفر رجع ' + code + ' — ' + body.slice(0, 200));
  try { return JSON.parse(body); }
  catch (e) { throw new Error('جواب ماشي JSON — تأكد من CRM_URL.\n' + body.slice(0, 200)); }
}

/**
 * كيجيب/كيصاوب ورقة — وكيرفض يكتب فأي ورقة ماشي ديالو.
 * 🛡️ حماية: إلا كانت الورقة موجودة من قبل وماشي السكريبت لي صاوبها،
 *    كيوقف. بلا هادشي، شي ورقة ديالك بنفس السمية كتتمسح.
 */
function pvSheet_(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = pvProps_();
  const owned = JSON.parse(props.getProperty('owned') || '[]');
  let sh = ss.getSheetByName(name);
  if (sh && owned.indexOf(name) === -1) {
    throw new Error(
      '🛑 وقفنا باش ما نمسحوش خدمتك!\n\n' +
      'كاينة ورقة سميتها "' + name + '" وماشي السكريبت لي صاوبها.\n' +
      'إلا كملنا، غادي تتمسح الداتا لي فيها.\n\n' +
      'الحل: بدّل سمية الورقة ديالك، ولا بدّل SH_CMD/SH_ADS/SH_PERF فوق فالسكريبت.');
  }
  if (!sh) {
    sh = ss.insertSheet(name);
    owned.push(name);
    props.setProperty('owned', JSON.stringify(owned));
  }
  const head = cols.map(c => AR[c] || c);
  sh.getRange(1, 1, 1, cols.length).setValues([head])
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  return sh;
}

/** كيمسح الداتا القديمة وكيكتب الجديدة دفعة وحدة */
function pvWrite_(sh, cols, rows) {
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), cols.length)).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, cols.length).setValues(rows);
}

function pvToast_(m) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(m, 'Paraveda CRM', 6); } catch (e) {}
  Logger.log(m);
}

function pvDate_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}

function pvProps_() { return PropertiesService.getDocumentProperties(); }

/**
 * كيلقا الورقة الهدف حتى إلا كانت السمية مكتوبة بشوية فرق
 * (COMONDES / COMMANDES / فراغات زايدة...).
 */
function pvTarget_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TARGET_SHEET);
  if (sh) return sh;
  const want = pvNorm_(TARGET_SHEET);
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) if (pvNorm_(all[i].getName()) === want) return all[i];
  // تسامح: COMONDES ≈ COMMANDES
  const loose = want.replace(/m+/g, 'm');
  for (let i = 0; i < all.length; i++) {
    if (pvNorm_(all[i].getName()).replace(/m+/g, 'm') === loose) return all[i];
  }
  throw new Error('ما لقيتش ورقة "' + TARGET_SHEET + '".\n\n' +
    'الأوراق لي كاينين:\n' + all.map(x => '• ' + x.getName()).join('\n') +
    '\n\nبدّل TARGET_SHEET فوق فالسكريبت بالسمية الصحيحة.');
}

/** كينقّي سمية العمود: صغير، بلا شدّات، بلا فراغات ولا رموز */
function pvNorm_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * كيقرا الرأس ديالك وكيبني: رقم العمود → الخانة ديال الـCRM.
 * «date» الأولى = تاريخ الطلبية · «date» الثانية = تاريخ التأكيد.
 */
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

/** كيجمع أرقام الأعمدة المتلاصقة فمجموعات باش نكتبو بأقل عدد ديال العمليات */
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

/* ════════════ ① أول مرة ════════════ */

function pvSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = pvTarget_();

  const headers = sh.getRange(HEADER_ROW, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const map = pvMapHeader_(headers);
  const n = Object.keys(map).length;
  if (!n) throw new Error('ما لقيت حتى عمود كنعرفو فالسطر ' + HEADER_ROW + ' ديال "' + TARGET_SHEET + '".\n' +
                          'تأكد بلي HEADER_ROW هو السطر الصحيح ديال الرأس.');

  /* 🛡️ نسخة احتياطية، مرة وحدة، قبل أول كتابة */
  if (!pvProps_().getProperty('backupDone')) {
    const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmm');
    sh.copyTo(ss).setName(sh.getName() + '_SAUVEGARDE_' + stamp);
    pvProps_().setProperty('backupDone', '1');
    pvToast_('🛡️ درت نسخة احتياطية: ' + sh.getName() + '_SAUVEGARDE_' + stamp);
  }

  pvSheet_(SH_ADS, ADS_COLS);
  pvSheet_(SH_PERF, PERF_COLS);

  const names = Object.keys(map).map(i => headers[i]).join(' · ');
  SpreadsheetApp.getUi().alert(
    '✅ واجد\n\n' +
    'الورقة: ' + sh.getName() + '\n' +
    'الرأس: السطر ' + HEADER_ROW + '\n' +
    'الأعمدة لي غادي تتعمّر (' + n + '):\n' + names + '\n\n' +
    '⚠️ من السطر ' + (HEADER_ROW + 1) + ' لتحت غادي يتعاود كتابتو فكل تحديث.\n' +
    'السطور 1 حتى ' + HEADER_ROW + ' ما غاديش يتمسو.\n\n' +
    'دابا دير «🔄 حدّث كلشي دابا».');
}

/** ℹ️ كيورّي النسخة وفين غادي يكتب — بلا ما يبدّل والو */
function pvVersion() {
  let where = '', err = '';
  try { where = pvTarget_().getName(); } catch (e) { err = e.message; }
  SpreadsheetApp.getUi().alert(
    'ℹ️ معلومات\n\n' +
    'النسخة: ' + PV_VERSION + '\n' +
    'خاصها تكون: v5-COMONDES\n\n' +
    'الطلبيات غادي تتكتب فورقة: ' + (where || '❌ ما لقيتهاش') + '\n' +
    'من السطر: ' + (HEADER_ROW + 1) + '\n' +
    (err ? '\n⚠️ ' + err : ''));
}

/** 🔍 فحص: كيورّي شمن أعمدة تطابقات — بلا ما يكتب حتى حاجة */
function pvCheck() {
  const sh = pvTarget_();
  const width = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(HEADER_ROW, 1, 1, width).getValues()[0];
  const map = pvMapHeader_(headers);
  const L = i => { let s = '', n = i + 1; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ok = [], no = [];
  headers.forEach((h, i) => {
    const t = String(h == null ? '' : h).trim();
    if (map[i]) ok.push('✅ ' + L(i) + '  «' + t + '»  →  ' + map[i]);
    else if (t) no.push('➖ ' + L(i) + '  «' + t + '»  (غادي تبقى كيف ما هي)');
  });
  SpreadsheetApp.getUi().alert(
    '🔍 فحص — ما كتبت والو\n\n' +
    'الورقة: ' + sh.getName() + '\n' +
    'الرأس: السطر ' + HEADER_ROW + '\n' +
    'الطلبيات غادي تبدا من السطر ' + (HEADER_ROW + 1) + '\n\n' +
    'غادي تتعمّر (' + ok.length + '):\n' + (ok.join('\n') || '(والو!)') +
    '\n\nما غاديش تتمس (' + no.length + '):\n' + (no.join('\n') || '—'));
}

/** كيحيّد ورقة CRM_COMMANDES القديمة إلا كانت */
function pvRemoveOldSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('CRM_COMMANDES');
  if (!sh) { pvToast_('ما كايناش ورقة CRM_COMMANDES.'); return; }
  ss.deleteSheet(sh);
  const owned = JSON.parse(pvProps_().getProperty('owned') || '[]');
  pvProps_().setProperty('owned', JSON.stringify(owned.filter(x => x !== 'CRM_COMMANDES')));
  pvToast_('🗑️ تحيدات ورقة CRM_COMMANDES.');
}

/* ════════════ ② الطلبيات: CRM → الشيت ════════════ */

function pvPullOrders() {
  const j = pvCall_('?export=orders');
  const cols = j.cols, rows = j.rows || [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = pvTarget_();

  const width = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(HEADER_ROW, 1, 1, width).getValues()[0];
  const map = pvMapHeader_(headers);                    // رقم العمود → خانة الـCRM
  const idx = Object.keys(map).map(Number);
  if (!idx.length) throw new Error('ما لقيت حتى عمود كنعرفو فالسطر ' + HEADER_ROW + '.');

  const at = {};                                        // خانة الـCRM → رقمها فالجواب
  cols.forEach((c, i) => { at[c] = i; });

  const start = HEADER_ROW + 1;

  /* نمسحو غير الأعمدة لي كنعمروها — الأعمدة ديالك الأخرى كنخليوهم */
  const lastRow = sh.getLastRow();
  if (lastRow >= start) {
    pvRuns_(idx).forEach(r => sh.getRange(start, r[0] + 1, lastRow - start + 1, r[1]).clearContent());
  }

  /* نكتبو مجموعة بمجموعة ديال الأعمدة المتلاصقة */
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

  pvProps_().setProperty('ordT', String(j.t || 0));
  pvToast_('📋 ' + rows.length + ' طلبية فورقة ' + sh.getName() + '.');
  return rows.length;
}

/* ════════════ ③ المصاريف: CRM → الشيت ════════════ */

function pvPull() {
  const j = pvCall_('?export=adspend');
  const rows = (j.rows || []).map(r => ADS_COLS.map(c => (r[c] === undefined || r[c] === null) ? '' : r[c]));
  const sh = pvSheet_(SH_ADS, ADS_COLS);
  pvWrite_(sh, ADS_COLS, rows);
  if (rows.length) sh.getRange(2, 2, rows.length, 1).setNumberFormat('@');
  pvProps_().setProperty('lastT', String(j.t || 0));
  pvProps_().setProperty('rs', String(j.rs || 0));
  pvToast_('⬇️ ' + rows.length + ' سطر ديال المصاريف.');
}

/* ════════════ ④ المصاريف: الشيت → CRM ════════════ */

function pvPush(force) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_ADS);
  if (!sh) throw new Error('ما كايناش ورقة "' + SH_ADS + '". دير «🛠️ وجّد الأوراق».');

  const last = sh.getLastRow();
  const raw = last > 1 ? sh.getRange(2, 1, last - 1, ADS_COLS.length).getValues() : [];

  const rows = []; let maxId = 0;
  raw.forEach(r => {
    const o = {};
    ADS_COLS.forEach((c, i) => { o[c] = r[i]; });
    o.date = pvDate_(o.date);
    o.agent = String(o.agent || '').trim();
    o.produit = String(o.produit || '').trim();
    o.source = String(o.source || '').trim();
    o.amount = Number(o.amount) || 0;
    if (!o.date && !o.agent && !o.produit && !o.amount) return;     // سطر خاوي
    if (!o.date) throw new Error('كاين سطر بلا تاريخ فورقة ADS. صلحو وعاود.');
    o.id = Number(o.id) || 0;
    if (o.id > maxId) maxId = o.id;
    rows.push(o);
  });
  let next = maxId + 1;
  rows.forEach(o => { if (!o.id) o.id = next++; });

  if (!rows.length) throw new Error('ورقة ADS خاوية — ما صيفطنا والو.');

  const cur = pvCall_('?export=adspend');
  const lastT = Number(pvProps_().getProperty('lastT') || 0);
  if (!force && lastT && Number(cur.t) > lastT) {
    throw new Error('⚠️ المصاريف تبدّلو فالـCRM من آخر مرة جبدتي.\n' +
                    'دير «⬇️ جبد المصاريف» أولاً، ومن بعد عاود صيفط.');
  }

  const res = pvCall_('', {
    key: 'paraveda_adspend_v1', t: Date.now(),
    rs: Number(cur.rs || pvProps_().getProperty('rs') || 0),
    d: rows.map(o => ({ id:o.id, date:o.date, agent:o.agent, produit:o.produit, source:o.source, amount:o.amount })),
  });
  if (!res.ok) throw new Error('الـCRM رفض: ' + JSON.stringify(res));
  if (res.noop === 'ghost') throw new Error('الـCRM منع المسح (ليستة خاوية).');

  // نرجّعو الـid الجداد للشيت
  const ids = rows.map(o => [o.id]); let w = 0;
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

/* ════════════ ⑤ جدول الأداء ════════════ */

function pvPullPerf() {
  const j = pvCall_('?export=perf');
  const rows = (j.rows || []).map(r => PERF_COLS.map(c => (r[c] === undefined || r[c] === null) ? '' : r[c]));
  const sh = pvSheet_(SH_PERF, PERF_COLS);
  pvWrite_(sh, PERF_COLS, rows);
  if (rows.length) sh.getRange(2, 1, rows.length, 1).setNumberFormat('@');
  pvToast_('📊 جدول الأداء — ' + rows.length + ' سطر.');
}

/* ════════════ ⑥ الكل + الأوتوماتيكي ════════════ */

function pvSyncAll() {
  const n = pvPullOrders();
  try { pvPush(); } catch (e) { Logger.log('ads push: ' + e.message); }
  pvPullPerf();
  pvToast_('✅ ' + n + ' طلبية فورقة «' + pvTarget_().getName() + '» — ' + PV_VERSION);
}

function pvAutoTick() {
  try { pvPullOrders(); } catch (e) { Logger.log('orders: ' + e.message); }
  try { pvPush(); }       catch (e) { Logger.log('ads: ' + e.message); }
  try { pvPullPerf(); }   catch (e) { Logger.log('perf: ' + e.message); }
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
