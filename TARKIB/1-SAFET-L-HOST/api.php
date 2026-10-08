<?php
/**
 * Paraveda CRM — api.php (v3.82)
 *
 * Contract used by index.html (unchanged):
 *   GET  api.php                       → { key: {t, d}, ... }
 *   POST api.php {key, t, d}           → {ok:true, t:<effective t>}   (header X-Sync-Token required)
 *
 * v3.97 — الشيت → CRM: POST {action:'sheet_orders', rows:[...]} كيزيد الطلبيات الجداد
 *   (تكرار سيرفر-سايد: تاريخ + هاتف + منتوج). الجبد الكامل من CRM ما تبدلش.
 *
 * v3.82 — التسليك النهائي: تغيير الباسوورد كيوصل للسيرفر + يوزر ممسوح ما كيرجعش
 *   + المتصفح كيعاود يصيفط اليوزرز/الطلبيات إلا لقا السيرفر راهو رجع لنسخة قديمة.
 *   POST api.php {action: ...}         → Digylog actions  (header X-Sync-Token required)
 *
 * v3.81 — الإصلاح الجذري ديال "اليوزر الجديد كيتمسح من بعد لحضات":
 *   - journal replay ولى كيقارن الوقت: سطر قديم عمرُو ما كيقدر يتربح على داتا أحدث
 *     منه (v3.80 كانت كتطبق آخر سطر ديما — سطر قديم فـ journal الميرا كان كيمسح
 *     اليوزرز/الطلبيات فكل قرية).
 *   - قرية الملفات: primary + mirror كيتدمجو مفتاح بمفتاح (الأحدث كيربح)، واليوزرز
 *     كيتوحّدو بالـ id — ملف قديم فـ أي بلاصة ما بقاش كيخبي يوزرز.
 *   - t ديال أي مفتاح ما كينقصش عمرو (noop:same كان كيرجّع الوقت للور مع ساعة
 *     متأخرة → الأجهزة الأخرى كيوقفو يشوفو التبدلات).
 *   - POST كيرجّع t الفعلي → المتصفح كيسجلو → كلشي متزامن مع ساعة السيرفر.
 *   - فشل الكتابة فـ journal/MIRA كيتسجل فـ audit.log (ما بقاش صامت).
 *
 * v3.41 hardening:
 *   - key whitelist (only known CRM keys are accepted)
 *   - stale-write rejection (older `t` than stored never overwrites newer data)
 *   - unwrap protection (rejects double-wrapped {t,d:{t,d}} payloads → fixes corrupted custom_sheets / team_photos)
 *   - exclusive lock around read-modify-write (two agents saving at once no longer lose a write)
 *   - rotating backups (last 30 writes + 1 per day) instead of a single .backup that got overwritten
 *   - payload size limit + minimal audit log
 *   - data dir outside public_html when available (../crm-paraveda-data), falls back to local file
 */
error_reporting(E_ALL);
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Sync-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { exit; }

/* ---------- config ---------- */
$SECRET = '8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';

/* v3.67: deterministic data dir + mirror.
 * قبل: كان كيبدل المجلد بصمت إلا كان !is_writable → جوج ملفات بيانات مفروشين =
 * طلبيات كتظهر وكتختفي. دابا: كنختارو المجلد بالـ epoch (أحدث بيانات) ونكتبو
 * فـ الجوج بلاصات ديما حتى يرجع التوأمية بيناتهم. */
$DIR_EXT = __DIR__ . '/../crm-paraveda-data';
$DIR_LOC = __DIR__;
function crm_epoch_dir($d) {
  $m = 0;
  $s = @file_get_contents($d . '/crm_data.json');
  if ($s !== false && $s !== '') {
    $j = json_decode($s, true);
    if (is_array($j)) { foreach ($j as $v) { if (is_array($v) && isset($v['t']) && (int)$v['t'] > $m) $m = (int)$v['t']; } }
    else { $m = -1; } // undecodable file must never win
  }
  foreach (array($d . '/journal.log', $d . '/journal.log.1') as $jf) {
    if (!file_exists($jf)) continue;
    $fh = @fopen($jf, 'r'); if (!$fh) continue;
    $sz = @filesize($jf); if ($sz > 8192) @fseek($fh, -8192, SEEK_END);
    $tail = '';
    while (($l = fgets($fh)) !== false) { $l = trim($l); if ($l !== '') $tail = $l; }
    @fclose($fh);
    $e = json_decode((string)$tail, true);
    if (is_array($e) && isset($e['t']) && (int)$e['t'] > $m) $m = (int)$e['t'];
  }
  return $m;
}
$PRIMARY = $DIR_EXT; $MIRROR = $DIR_LOC;
$__eE = 0; $__eL = 0;
if (!is_dir($DIR_EXT)) { $PRIMARY = $DIR_LOC; $MIRROR = null; }
else {
  $__eE = crm_epoch_dir($DIR_EXT); $__eL = crm_epoch_dir($DIR_LOC);
  if ($__eL > $__eE) { $PRIMARY = $DIR_LOC; $MIRROR = $DIR_EXT; }
}
$DATA_DIR    = $PRIMARY;
$DATA_FILE   = $PRIMARY . '/crm_data.json';
$MIRROR_FILE = ($MIRROR !== null) ? $MIRROR . '/crm_data.json' : null;
$LOCK_FILE   = $PRIMARY . '/.crm.lock';
$BACKUP_DIR  = $PRIMARY . '/backups';
$AUDIT_FILE  = $PRIMARY . '/audit.log';
$JOURNAL     = $PRIMARY . '/journal.log';
$JOURNAL_M   = ($MIRROR !== null) ? $MIRROR . '/journal.log' : null;
/* PERF v3.90: 8MB journal = replay ديال 8 ميغا JSON فـ كل قراية. 512KB كافيين
 * بزاف حيت كل كتابة كتسبقها كتابة كاملة ديال crm_data.json تحت القفل. */
$JOURNAL_MAX = 512 * 1024;
$MAX_BODY    = 24 * 1024 * 1024;   // 24 MB per write
$KEEP_WRITES = 30;                 // rotating pre-write backups
$KEEP_DAYS   = 30;                 // daily snapshots
$ETAG_CACHE  = $PRIMARY . '/.crm.etag';   // PERF v3.90: cache ديال ETag باش GET يولي 304 بلا قراية
$BACKUP_MIN_GAP = 120;             // PERF v3.90: نسخة احتياطية كل دقيقتين كحد أقصى (ماشي فكل كتابة)
$TOMBSTONE_TTL  = 21 * 86400;      // PERF v3.90: الطلبية الممسوحة كتتنحا نهائياً من بعد 21 يوم
$TOMBSTONE_MAX  = 150;             // PERF v3.90: وفأي حال، ما كنحتافظوش بأكثر من 150 طومبستون

$ALLOWED_KEYS = array(
  'paraveda_users_v1','paraveda_orders_v5','paraveda_agent_names_v1','paraveda_chat_v1',
  'paraveda_worktimes_v1','paraveda_remarques_v1','paraveda_avances_v1','paraveda_adspend_v1',
  'paraveda_perfrows_v1','paraveda_livraison_v1','paraveda_history_v1','paraveda_villes_v2',
  'paraveda_catalog_v1','sheet_pièce','paraveda_team_photos_v1','tabs_list_v1',
  'custom_sheets_v1','paraveda_period_v1','paraveda_period_v2',
  'paraveda_backup_v1','paraveda_backup_v1_agents',
  'paraveda_dupok_v1'   // v3.94: المكررات لي تعلّمات «ماشي مكررة»
);

/* ---------- helpers ---------- */
function crm_token() {
  if (isset($_SERVER['HTTP_X_SYNC_TOKEN'])) return (string)$_SERVER['HTTP_X_SYNC_TOKEN'];
  if (isset($_GET['token'])) return (string)$_GET['token'];
  return '';
}
function crm_out($arr, $code = 200) {
  if ($code !== 200) http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}
function crm_audit($line) {
  global $AUDIT_FILE;
  $ip = $_SERVER['REMOTE_ADDR'] ?? '-';
  @file_put_contents($AUDIT_FILE, date('Y-m-d H:i:s') . " | $ip | $line\n", FILE_APPEND | LOCK_EX);
  if (@filesize($AUDIT_FILE) > 2 * 1024 * 1024) { @rename($AUDIT_FILE, $AUDIT_FILE . '.1'); }
}
/** v3.41: afrizon_* → paraveda_* (rename), keeps newest if both exist */
function crm_migrate_keys($j) {
  $o = array();
  foreach ($j as $k => $v) {
    $nk = (strpos($k, 'afrizon_') === 0) ? 'paraveda_' . substr($k, 8) : $k;
    if (isset($o[$nk]) && isset($o[$nk]['t']) && isset($v['t']) && $o[$nk]['t'] >= $v['t']) continue;
    $o[$nk] = $v;
  }
  return $o;
}
/* PERF v3.90: crm_read_raw() كانت كتتسما 3 مرات فـ كل POST — كل مرة كتقرا وتفكّك
 * crm_data.json (1.1MB) + الميرا (1.1MB) + replay ديال 4 ملفات journal.
 * = أكثر من 10MB ديال JSON decoding باش تحفظ طلبية وحدة.
 * دابا النتيجة كتتخزن فالذاكرة داخل نفس الـ request. القراية لي تحت القفل
 * خاصها تكون طرية ($force=true) حيت ممكن شي request آخر كتب بيناتهم. */
function crm_read_raw($force = false) {
  static $cache = null;
  if (!$force && $cache !== null) return $cache;
  $cache = crm_read_raw_fresh();
  return $cache;
}
function crm_read_raw_fresh() {
  global $DATA_FILE, $BACKUP_DIR, $MIRROR_FILE;
  $j = null;
  if (file_exists($DATA_FILE)) {
    $s = @file_get_contents($DATA_FILE);
    $j = json_decode((string)$s, true);
    if (!is_array($j)) crm_audit("corrupt | main file undecodable | len=" . strlen((string)$s));
  }
  if (!is_array($j)) {
    // corrupted/missing main file → try newest backup (journal replay below restores newest state anyway)
    $c = glob($BACKUP_DIR . '/b-*.json');
    if ($c) { rsort($c); foreach ($c as $f) { $j = json_decode((string)@file_get_contents($f), true); if (is_array($j)) { crm_audit("recover | from=" . basename($f)); break; } } }
  }
  if (!is_array($j)) $j = array();
  /* v3.81: دمج primary + mirror مفتاح بمفتاح (الأحدث t كيربح) + توحيد اليوزرز بالـ id.
     قبل: إلا الميرا (crm-paraveda-data) كانت فيها نسخة قديمة، كل قرية كترجع للقديم
     → "اليوزر الجديد كيتمسح من بعد لحضات". دابا ملف قديم فأي بلاصة ما كيقدر
     يخبي داتا أحدث، واليوزرز لي ضاعو من أحد الملفين كيرجعو. */
  if ($MIRROR_FILE && is_file($MIRROR_FILE)) {
    $m = json_decode((string)@file_get_contents($MIRROR_FILE), true);
    if (is_array($m)) {
      /* v3.82: ليستة اليوزرز ديال الملف الرئيسي خاصها تنحفظ قبل دمج المفاتيح —
         إلا الميرا كان أحدث، الدمج كيبدل اليوزرز ديال الرئيسي قبل الاتحاد
         → اليوزرز لي غير فالرئيسي كانو كيضيعو. */
      $pu = (isset($j['paraveda_users_v1']['d']) && is_array($j['paraveda_users_v1']['d'])) ? crm_unwrap($j['paraveda_users_v1']['d']) : null;
      $mirrorOlderKeys = 0;
      foreach ($m as $mk => $mv) {
        if (!is_array($mv) || !isset($mv['t'])) continue;
        if (!isset($j[$mk]) || !is_array($j[$mk]) || (int)$mv['t'] > (int)$j[$mk]['t']) { $j[$mk] = $mv; $mirrorOlderKeys++; }
      }
      if ($mirrorOlderKeys > 0) crm_audit("mirror-merge | newer-from-mirror keys=$mirrorOlderKeys");
      $ub = (isset($m['paraveda_users_v1']['d']) && is_array($m['paraveda_users_v1']['d'])) ? crm_unwrap($m['paraveda_users_v1']['d']) : null;
      if (is_array($pu) && is_array($ub)) {
        $un = crm_users_union($pu, $ub);
        if (count($un) !== count($pu)) { crm_audit("users-rescue | merged users: " . count($pu) . " + " . count($ub) . " → " . count($un)); $j['paraveda_users_v1']['d'] = $un; $j['paraveda_users_v1']['t'] = max((int)$j['paraveda_users_v1']['t'], (int)$m['paraveda_users_v1']['t']); }
      }
    }
  }
  // v3.67: journal replay — أحدث كتابة ناجحة كتربح ديما، حتى إلا crm_data.json تبدل يدويا
  // (FTP) ولا تخسر → الطلبيات الجديدة عمرهم ما كيتنساو.
  return crm_journal_replay(crm_migrate_keys($j));
}
/* v3.81: توحيد ليستة اليوزرز بالـ id — أحدث _u كيربح (الحذف _del محترم).
   كتستعمل فـ دمج الملفات (primary+mirror) باش يوزر مفقود من ملف واحد يرجع. */
function crm_users_union($a, $b) {
  $out = array();
  foreach ($a as $u) { if (is_array($u) && isset($u['id'])) $out[(string)$u['id']] = $u; }
  foreach ($b as $u) {
    if (!is_array($u) || !isset($u['id'])) continue;
    $id = (string)$u['id'];
    if (!isset($out[$id])) { $out[$id] = $u; continue; }
    /* v3.82: الحذف نهائي — إلا شي نسخة فيهم _del هي لي كتربح (من الجوج جيهات).
       جوج طومبستونات → الأحدث _u كيربح. حي ضد ميت → الميت كيربح ديما. */
    $cd = !empty($out[$id]['_del']); $nd = !empty($u['_del']);
    if ($cd || $nd) {
      $cu = isset($out[$id]['_u']) ? (float)$out[$id]['_u'] : -1;
      $nu = isset($u['_u']) ? (float)$u['_u'] : -1;
      if (!$cd || ($nd && $nu > $cu)) $out[$id] = $u;
      continue;
    }
    $cu = isset($out[$id]['_u']) ? (float)$out[$id]['_u'] : -1;
    $nu = isset($u['_u']) ? (float)$u['_u'] : -1;
    if ($nu > $cu) $out[$id] = $u;
  }
  return array_values($out);
}
/* v3.67: journal (WAL) — كل كتابة ناجحة كتسجل سطر فـ journal.log. القراية كتعاود
 * التسجيلات فوق الملف الأساسي: إلا الملف الأساسي رجع لنسخة قديمة ولا تفسد،
 * أحدث حالة كترجع بوحدها من الـ journal. */
function crm_journal_append($k, $t, $d) {
  global $JOURNAL, $JOURNAL_M, $JOURNAL_MAX;
  $line = json_encode(array('k' => $k, 't' => $t, 'd' => $d), JSON_UNESCAPED_UNICODE);
  if ($line === false) return;
  foreach (array($JOURNAL, $JOURNAL_M) as $jf) {
    if (!$jf) continue;
    // v3.81: الفشل كيتسجل فـ audit.log — قبل كان صامت وماحدش كان كيعرف علاش الداتا كتضيع
    if (@file_put_contents($jf, $line . "\n", FILE_APPEND | LOCK_EX) === false) { crm_audit("journal-fail | $jf"); continue; }
    if (@filesize($jf) > $JOURNAL_MAX) {
      // كل كتابة كتسبقها كتابة كاملة ديال الملف الرئيسي تحت القفل → محتوى الـ journalولى
      // مكرر → نحيدوه حتى ما يثقلش القراية (replay) فالطلبات الجاية.
      @unlink($jf);
    }
  }
}
function crm_journal_replay($data) {
  global $JOURNAL, $JOURNAL_M;
  $files = array($JOURNAL . '.1', $JOURNAL, ($JOURNAL_M !== null ? $JOURNAL_M . '.1' : null), $JOURNAL_M);
  foreach ($files as $jf) {
    if (!$jf || !file_exists($jf)) continue;
    $fh = @fopen($jf, 'r'); if (!$fh) continue;
    while (($l = fgets($fh)) !== false) {
      $l = trim($l); if ($l === '') continue;
      $e = json_decode($l, true);
      if (!is_array($e) || !isset($e['k'], $e['t'], $e['d']) || !is_array($e['d'])) continue;
      $k = (string)$e['k']; $et = (int)$e['t'];
      /* v3.81: سطر الـ journal ما كيقبلش يتربح على داتا أحدث منه.
         v3.80 كانت كتطبق آخر سطر ديما بالترتيب → سطر قديم فـ journal الميرا
         (ولا أي journal متأخر) كان كيمسح اليوزرز/الطلبيات الجداد فكل قرية.
         هادشي هو بالضبط "اليوزر الجديد كيتمسح من بعد لحضات". */
      $cur = (isset($data[$k]) && is_array($data[$k]) && isset($data[$k]['t'])) ? (int)$data[$k]['t'] : 0;
      if ($et <= $cur) continue;
      $data[$k] = array('t' => $et, 'd' => $e['d']);
    }
    @fclose($fh);
  }
  return $data;
}
/** unwrap {t,d:{t,d:X}} → X (defensive: corruption produced by old import.php) */
function crm_unwrap($v) {
  $g = 0;
  while (is_array($v) && isset($v['t']) && array_key_exists('d', $v) && is_numeric($v['t']) && count($v) <= 2 && $g++ < 5) { $v = $v['d']; }
  return $v;
}
/* PERF v3.90: بصمة رخيصة (stat فقط، بلا قراية) ديال كل ملفات الداتا.
 * كتخدم باش نعرفو واش تبدل شي حاجة بلا ما نقراو 2.2MB ديال JSON. */
function crm_data_sig() {
  global $DATA_FILE, $MIRROR_FILE, $JOURNAL, $JOURNAL_M;
  $p = '';
  foreach (array($DATA_FILE, $MIRROR_FILE, $JOURNAL, $JOURNAL_M, $JOURNAL . '.1') as $f) {
    if (!$f) continue;
    $p .= '|' . (@filemtime($f) ?: 0) . ':' . (@filesize($f) ?: 0);
  }
  return md5($p);
}
/* كيرجع الـ ETag المخزن إلا البصمة باقة هي هي، وإلا null (خاصنا نقراو بصح). */
function crm_etag_cached($sig) {
  global $ETAG_CACHE;
  $s = @file_get_contents($ETAG_CACHE);
  if ($s === false || $s === '') return null;
  $j = json_decode($s, true);
  if (!is_array($j) || !isset($j['sig'], $j['etag'])) return null;
  return ($j['sig'] === $sig) ? (string)$j['etag'] : null;
}
function crm_etag_store($sig, $etag) {
  global $ETAG_CACHE;
  @file_put_contents($ETAG_CACHE, json_encode(array('sig' => $sig, 'etag' => $etag)), LOCK_EX);
}

function crm_backup() {
  global $DATA_FILE, $BACKUP_DIR, $KEEP_WRITES, $KEEP_DAYS, $BACKUP_MIN_GAP;
  if (!file_exists($DATA_FILE)) return;
  if (!is_dir($BACKUP_DIR)) @mkdir($BACKUP_DIR, 0755, true);
  if (!is_dir($BACKUP_DIR)) return;
  /* PERF v3.90: قبل، كل كتابة كانت كتنسخ 1.1MB على القرص. مع 10 وكلاء كيخدمو
   * هادشي ميات الميغاوات ديال I/O فالساعة. دابا نسخة كل دقيقتين كحد أقصى —
   * الحماية باقية (الـ journal + الملف الرئيسي + الميرا) والـ I/O نقص ~95%. */
  $last = 0;
  $b0 = glob($BACKUP_DIR . '/b-*.json');
  if ($b0) { foreach ($b0 as $f) { $mt = @filemtime($f); if ($mt > $last) $last = $mt; } }
  if ($last > 0 && (time() - $last) < $BACKUP_MIN_GAP) {
    $daily0 = $BACKUP_DIR . '/d-' . date('Ymd') . '.json';
    if (!file_exists($daily0)) @copy($DATA_FILE, $daily0);
    return;
  }
  @copy($DATA_FILE, $BACKUP_DIR . '/b-' . date('Ymd-His') . '-' . substr((string)microtime(true) * 1000 % 1000, 0, 3) . '.json');
  $daily = $BACKUP_DIR . '/d-' . date('Ymd') . '.json';
  if (!file_exists($daily)) @copy($DATA_FILE, $daily);
  // rotate
  $b = glob($BACKUP_DIR . '/b-*.json'); if ($b && count($b) > $KEEP_WRITES) { sort($b); foreach (array_slice($b, 0, count($b) - $KEEP_WRITES) as $f) @unlink($f); }
  $d = glob($BACKUP_DIR . '/d-*.json'); if ($d && count($d) > $KEEP_DAYS)   { sort($d); foreach (array_slice($d, 0, count($d) - $KEEP_DAYS) as $f) @unlink($f); }
}
// v3.65: field-level merge — a field edited later (per-field stamp _f) is never overwritten
// by a whole-row write coming from a browser that still held an older copy of the row.
// v3.66: DATE LOCK — dateCreation / dateConfirmation / dateExp / dateLiv can only change
// when the incoming row carries a STRICTLY NEWER per-field stamp (_f.date*). A whole-row
// write from an old/stale browser (no _f, or older _f) can never move a date anymore —
// the stored value always wins. This is the server side of "التاريخ ما كيتبدلش بوحدو".
function crm_merge_row($a, $b) {
  $ua = isset($a['_u']) ? (float)$a['_u'] : 0; $ub = isset($b['_u']) ? (float)$b['_u'] : 0;
  $base = $ub >= $ua ? $b : $a; $oth = $ub >= $ua ? $a : $b;
  if (!empty($base['_del']) || !empty($oth['_del'])) return $base;
  $bf = (isset($base['_f']) && is_array($base['_f'])) ? $base['_f'] : array();
  $of = (isset($oth['_f']) && is_array($oth['_f'])) ? $oth['_f'] : array();
  foreach ($of as $k => $to) {
    $to = (float)$to; $tb = isset($bf[$k]) ? (float)$bf[$k] : 0;
    if ($to > $tb && array_key_exists($k, $oth)) { $base[$k] = $oth[$k]; $bf[$k] = $to; }
  }
  if ($bf) $base['_f'] = $bf;
  // v3.66 date lock: $a is the STORED row (crm_merge_orders always calls with stored first).
  // If the value differs and the incoming side has no strictly newer explicit date edit,
  // restore the stored value (and its stamp).
  foreach (array('dateCreation','dateConfirmation','dateExp','dateLiv') as $dk) {
    if (!array_key_exists($dk, $a)) continue;
    $av = (string)$a[$dk];
    $bv = array_key_exists($dk, $b) ? (string)$b[$dk] : '';
    if ($av === $bv) continue;
    $ta = (isset($a['_f'][$dk]) && is_numeric($a['_f'][$dk])) ? (float)$a['_f'][$dk] : 0;
    $tb = (isset($b['_f'][$dk]) && is_numeric($b['_f'][$dk])) ? (float)$b['_f'][$dk] : 0;
    if ($tb <= $ta) {
      $base[$dk] = $av;
      if ($ta > 0) {
        $f0 = (isset($base['_f']) && is_array($base['_f'])) ? $base['_f'] : array();
        $f0[$dk] = $ta; $base['_f'] = $f0;
      }
    }
  }
  return $base;
}
function crm_merge_orders($cur, $in, $reset = 0) {
  $nowms = (int)(microtime(true) * 1000);
  $byId = array(); $order = array();
  foreach ($cur as $o) { if (!is_array($o) || !isset($o['id'])) continue; $id = (string)$o['id']; $byId[$id] = $o; $order[] = $id; }
  foreach ($in as $o) {
    if (!is_array($o) || !isset($o['id'])) continue;
    // v3.66: clamp future stamps (device clock ahead of server) — a client can never
    // win a merge just because its clock is wrong; _u and every _f stamp are capped at server time.
    if (isset($o['_u']) && (float)$o['_u'] > $nowms) { $o['_u'] = $nowms; }
    if (isset($o['_f']) && is_array($o['_f'])) {
      foreach ($o['_f'] as $fk => $ft) { if (is_numeric($ft) && (float)$ft > $nowms) $o['_f'][$fk] = $nowms; }
    }
    $id = (string)$o['id'];
    $beforeDates = array();
    if (isset($byId[$id])) {
      foreach (array('dateCreation','dateConfirmation') as $dk) { $beforeDates[$dk] = isset($byId[$id][$dk]) ? (string)$byId[$id][$dk] : ''; }
    }
    if (!isset($byId[$id])) {
      // v3.62: rows older than the last reset (coming from a stale browser cache) are never resurrected
      $u = isset($o['_u']) ? (float)$o['_u'] : 0;
      if ($reset > 0 && $u < $reset) continue;
      $byId[$id] = $o; $order[] = $id; continue;
    }
    $byId[$id] = crm_merge_row($byId[$id], $o);
    // v3.66 audit: every time a merge actually moves a date, leave a trace in audit.log
    foreach ($beforeDates as $dk => $bv) {
      $av = isset($byId[$id][$dk]) ? (string)$byId[$id][$dk] : '';
      if ($bv !== '' && $av !== $bv) crm_audit("date-change | id=$id | $dk: $bv → $av");
    }
  }
  $out = array(); foreach (array_unique($order) as $id) $out[] = $byId[$id];
  usort($out, function($x, $y) { $a = (float)$x['id']; $b = (float)$y['id']; return $a == $b ? 0 : ($a < $b ? 1 : -1); });
  return $out;
}
/* v3.78: دمج موحد — كتابة أحدث كتربح (حتى الحذف)، كتابة متأخرة كتزيد غير الناقص.
   هذا لي كيمنع اختفاء اليوزر الجديد ملي ساعة الجهاز متأخرة ولا جوج زادو فنفس اللحظة. */
function crm_row_key($row) {
  if (is_array($row) && isset($row['id'])) return 'i:' . (string)$row['id'];
  if (is_scalar($row)) return 's:' . (string)$row;
  return 'j:' . json_encode($row);
}
/* PERF v3.90: تنقية الـ tombstones.
 * 599 طلبية من 1408 (42%) كانو عندهم _del=true وباقين فالداتا للأبد — كيتحملو
 * كل مزامنة، كيتدمجو صف بصف، وكياخدو بلاصة فـ localStorage.
 * دابا أي طلبية ممسوحة وقديمة بأكثر من 30 يوم كتتنحا نهائياً. 30 يوم أوسع بزاف
 * من الـ grace ديال المتصفح (15 دقيقة) إذن ما كاين حتى خطر ديال الرجوع. */
function crm_purge_tombstones($rows, $ttl, $max) {
  if (!is_array($rows)) return $rows;
  $cut = ((int)(microtime(true) * 1000)) - ($ttl * 1000);

  /* 1) الشرط ديال العمر: أي طومبستون أقدم من $ttl كيطير. */
  $keep = array(); $stamps = array(); $n = 0;
  foreach ($rows as $r) {
    if (is_array($r) && !empty($r['_del'])) {
      $u = isset($r['_u']) ? (float)$r['_u'] : 0;
      if ($u > 0 && $u < $cut) { $n++; continue; }
      $stamps[] = $u;
    }
    $keep[] = $r;
  }

  /* 2) سقف مطلق: حتى إلا تمسحو 2000 طلبية فنهار واحد، ما كنحتافظوش غير بالأحدث
   *    $max طومبستون. هادشي كيضمن بلي الداتا ما تقدرش تكبر بلا حدود. */
  if (count($stamps) > $max) {
    rsort($stamps);
    $floor = $stamps[$max - 1];
    $out = array(); $kept = 0;
    foreach ($keep as $r) {
      if (is_array($r) && !empty($r['_del'])) {
        $u = isset($r['_u']) ? (float)$r['_u'] : 0;
        if ($u < $floor || ($u == $floor && $kept >= $max)) { $n++; continue; }
        $kept++;
      }
      $out[] = $r;
    }
    $keep = $out;
  }

  if ($n > 0) crm_audit("purge | tombstones removed=$n | rows kept=" . count($keep));
  return $keep;
}
function crm_merge_list($cur, $in, $tCur, $tIn) {
  if ($tIn >= $tCur) return $in;
  $have = array();
  foreach ($cur as $row) $have[crm_row_key($row)] = true;
  foreach ($in as $row) { $kk = crm_row_key($row); if (!isset($have[$kk])) { $cur[] = $row; $have[$kk] = true; } }
  return $cur;
}
function crm_write($data) {
  global $DATA_FILE;
  $tmp = $DATA_FILE . '.tmp.' . getmypid();
  $json = json_encode($data, JSON_UNESCAPED_UNICODE);
  if ($json === false) return false;
  if (@file_put_contents($tmp, $json, LOCK_EX) === false) return false;
  if (!@rename($tmp, $DATA_FILE)) { @unlink($tmp); return false; }
  return true;
}
/* v3.67: write primary + mirror — الجوج ملفات ديما متطابقين، ما بقاش split-brain */
function crm_write_all($data) {
  global $MIRROR_FILE;
  $ok = crm_write($data);
  if ($MIRROR_FILE) {
    $tmp = $MIRROR_FILE . '.tmp.' . getmypid();
    $json = json_encode($data, JSON_UNESCAPED_UNICODE);
    if ($json !== false && @file_put_contents($tmp, $json, LOCK_EX) !== false) {
      if (!@rename($tmp, $MIRROR_FILE)) { @unlink($tmp); crm_audit("mirror-fail | rename | $MIRROR_FILE"); } // v3.81: ما بقاش صامت
    } else {
      if (file_exists($tmp)) @unlink($tmp);
      crm_audit("mirror-fail | write | $MIRROR_FILE"); // v3.81: ما بقاش صامت
    }
  }
  return $ok;
}

/* ================================================================
 * v3.97 — الشيت → CRM (Storeep / Google Sheet → الطلبيات)
 *   POST api.php {action:'sheet_orders', rows:[{dateCreation, nom, telephone, ...}]}
 *   كيزيد غير الطلبيات الجداد. التكرار كيتحسب سيرفر-سايد بـ:
 *     التاريخ + الهاتف (آخر 9 أرقام) + المنتوج   (إلا ما كاينش هاتف → الاسم)
 *   فالتالي إلا تصيفطات نفس السطر مرتين، ما كيتزادش مرتين.
 *   كيرجع: {ok, added, dup, skip, t, results:[{i, st:'added'|'dup'|'skip', id?, why?}]}
 * ================================================================ */
function crm_sheet_text($v) {
  if ($v === null || is_array($v) || is_object($v)) return '';
  return trim((string)$v);
}
function crm_sheet_num($v, $def) {
  if ($v === null || is_array($v) || is_object($v)) return $def;
  $s = str_replace(',', '.', trim((string)$v));
  if ($s === '' || !is_numeric($s)) return $def;
  $f = (float)$s;
  return ($f == floor($f)) ? (int)$f : $f;
}
/* صيغ مقبولة: YYYY-MM-DD (وبالساعة) ولا DD/MM/YYYY (ولا DD-MM-YYYY) */
function crm_sheet_date($v) {
  $s = crm_sheet_text($v);
  if ($s === '') return '';
  if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) { $y = (int)$m[1]; $mo = (int)$m[2]; $d = (int)$m[3]; }
  elseif (preg_match('/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/', $s, $m)) { $d = (int)$m[1]; $mo = (int)$m[2]; $y = (int)$m[3]; }
  else return null;   // ماشي تاريخ صحيح
  return checkdate($mo, $d, $y) ? sprintf('%04d-%02d-%02d', $y, $mo, $d) : null;
}
/* الهاتف: غير الأرقام، +212 / 212 → 0، ورقم 9 أرقام بلا 0 → كنزيدو 0 */
function crm_sheet_phone($v) {
  $d = preg_replace('/\D+/', '', crm_sheet_text($v));
  if (strlen($d) === 12 && strpos($d, '212') === 0) $d = '0' . substr($d, 3);
  elseif (strlen($d) === 9 && $d[0] !== '0') $d = '0' . $d;
  return $d;
}
function crm_sheet_key($date, $phone, $nom, $produit) {
  $p = crm_sheet_phone($phone);
  $p9 = strlen($p) >= 9 ? substr($p, -9) : '';
  $who = $p9 !== '' ? 'p:' . $p9
                    : 'n:' . strtolower(preg_replace('/\s+/u', ' ', crm_sheet_text($nom)));
  return $date . '|' . $who . '|' . strtolower(preg_replace('/\s+/u', ' ', crm_sheet_text($produit)));
}
/* كينقّي سطر الشيت ويحوّلو لطلبية CRM. كيرجع [سبب الرفض|null, الطلبية|null] */
function crm_sheet_norm($r) {
  $raw = isset($r['dateCreation']) ? $r['dateCreation'] : '';
  $dc = crm_sheet_date($raw);
  if ($dc === null || $dc === '') return array(crm_sheet_text($raw) === '' ? 'no-date' : 'bad-date', null);
  $tel = crm_sheet_phone(isset($r['telephone']) ? $r['telephone'] : '');
  $nom = crm_sheet_text(isset($r['nom']) ? $r['nom'] : '');
  if ($tel === '' && $nom === '') return array('no-name-or-phone', null);

  $o = array();
  $o['dateCreation'] = $dc;
  $dco = crm_sheet_date(isset($r['dateConfirmation']) ? $r['dateConfirmation'] : '');
  $o['dateConfirmation'] = ($dco === null || $dco === '') ? $dc : $dco;
  foreach (array('dateExp', 'dateLiv') as $f) {
    $x = crm_sheet_date(isset($r[$f]) ? $r[$f] : '');
    $o[$f] = ($x === null) ? '' : $x;
  }
  $o['telephone'] = $tel;
  $o['nom'] = $nom;
  foreach (array('idCmd','ville','adresse','produit','statut','livraison','remarques','agent','link',
                 'carousell','carosellFlag','originLead','livreur','tracking','motif','fees') as $f) {
    $o[$f] = crm_sheet_text(isset($r[$f]) ? $r[$f] : '');
  }
  $o['qte']        = max(1, (int)crm_sheet_num(isset($r['qte']) ? $r['qte'] : '', 1));
  $o['prix']       = crm_sheet_num(isset($r['prix']) ? $r['prix'] : '', 0);
  $o['upsell']     = crm_sheet_num(isset($r['upsell']) ? $r['upsell'] : '', 0);
  $o['commission'] = crm_sheet_num(isset($r['commission']) ? $r['commission'] : '', 0);
  return array(null, $o);
}
function crm_sheet_orders($b) {
  global $LOCK_FILE;
  $rows = (isset($b['rows']) && is_array($b['rows'])) ? array_values($b['rows']) : null;
  if ($rows === null) crm_out(array('ok'=>false, 'err'=>'bad-rows'), 400);
  if (count($rows) > 2000) crm_out(array('ok'=>false, 'err'=>'too-many-rows', 'max'=>2000), 413);

  $fh = @fopen($LOCK_FILE, 'c');
  if ($fh) @flock($fh, LOCK_EX);

  $data = crm_read_raw(true);
  $cur = isset($data['paraveda_orders_v5']['d']) ? crm_unwrap($data['paraveda_orders_v5']['d']) : array();
  if (!is_array($cur)) $cur = array();
  $cur = array_values($cur);
  $prevT = isset($data['paraveda_orders_v5']['t']) ? (int)$data['paraveda_orders_v5']['t'] : 0;

  /* مفاتيح الطلبيات الموجودة (الحية) + أكبر id (حتى الممسوحة) باش ما نعاودوش نستعملو id */
  $keys = array(); $maxId = 0;
  foreach ($cur as $o) {
    if (!is_array($o)) continue;
    if (isset($o['id']) && is_numeric($o['id']) && (int)$o['id'] > $maxId) $maxId = (int)$o['id'];
    if (!empty($o['_del'])) continue;
    $keys[crm_sheet_key(
      isset($o['dateCreation']) ? (string)$o['dateCreation'] : '',
      isset($o['telephone'])    ? $o['telephone'] : '',
      isset($o['nom'])          ? $o['nom'] : '',
      isset($o['produit'])      ? $o['produit'] : ''
    )] = true;
  }

  $nowms  = (int)(microtime(true) * 1000);
  $nextId = max((int)(microtime(true) * 1000000), $maxId + 1);
  $out = array(); $added = 0; $dup = 0; $skip = 0;
  foreach ($rows as $i => $r) {
    if (!is_array($r)) { $out[] = array('i'=>$i, 'st'=>'skip', 'why'=>'bad-row'); $skip++; continue; }
    list($why, $o) = crm_sheet_norm($r);
    if ($why !== null) { $out[] = array('i'=>$i, 'st'=>'skip', 'why'=>$why); $skip++; continue; }
    $k = crm_sheet_key($o['dateCreation'], $o['telephone'], $o['nom'], $o['produit']);
    if (isset($keys[$k])) { $out[] = array('i'=>$i, 'st'=>'dup'); $dup++; continue; }

    $o['id'] = $nextId++;
    $o['_u'] = $nowms;
    $f = array();
    foreach ($o as $fk => $fv) { if ($fk !== 'id' && $fk !== '_u') $f[$fk] = $nowms; }
    $o['_f'] = $f;

    $cur[] = $o;
    $keys[$k] = true;
    $out[] = array('i'=>$i, 'st'=>'added', 'id'=>$o['id']);
    $added++;
  }

  if ($added === 0) {
    if ($fh) { @flock($fh, LOCK_UN); @fclose($fh); }
    if ($skip > 0) crm_audit("sheet-orders | added=0 | dup=$dup | skip=$skip");
    crm_out(array('ok'=>true, 'added'=>0, 'dup'=>$dup, 'skip'=>$skip, 'results'=>$out));
  }

  crm_backup();
  $t = max($prevT + 1, $nowms);
  $data['paraveda_orders_v5'] = array('t' => $t, 'd' => $cur);
  $ok = crm_write_all($data);
  if ($ok) crm_journal_append('paraveda_orders_v5', $t, $cur);
  if ($fh) { @flock($fh, LOCK_UN); @fclose($fh); }

  if (!$ok) crm_out(array('ok'=>false, 'err'=>'write-failed'), 500);
  crm_audit("sheet-orders | added=$added | dup=$dup | skip=$skip | t=$t");
  crm_out(array('ok'=>true, 'added'=>$added, 'dup'=>$dup, 'skip'=>$skip, 't'=>$t, 'results'=>$out));
}

$m = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* ---------- GET: full snapshot ---------- */
if ($m === 'GET') {
  // v3.41: la lecture exige aussi le token (avant: n'importe qui avec l'URL téléchargeait tous les clients)
  if (!hash_equals($SECRET, crm_token())) crm_out(array('ok'=>false, 'err'=>'token'), 403);

  /* PERF v3.90 — أهم إصلاح فالسيرفر.
   * قبل: كل جهاز كيدير GET كل 5 ثواني وكيحمّل 1.1MB حتى إلا ما تبدل والو.
   *      = 720 طلب/ساعة × 1.1MB = ~800MB فالساعة لكل مستخدم.
   * دابا: بصمة رخيصة (stat) → إلا ما تبدل والو كنرجعو 304 بلا ما نقراو حتى ملف
   *      وبلا ما نصيفطو حتى بايت. المتصفح ما كيديرش parse ولا localStorage ولا
   *      إعادة رسم — وهادا هو لي كان كيبلوكي الشاشة كل 5 ثواني. */
  /* ================================================================
   * v3.91 — واجهة خفيفة لـ Google Sheets
   *   api.php?export=adspend&token=...  → المصاريف الخام (للتحرير فالشيت)
   *   api.php?export=perf&token=...     → جدول الأداء محسوب (للقراءة فقط)
   * كترجع غير لي محتاج الشيت (بضع كيلوبايتات) عوض 1.1 ميغا.
   * ================================================================ */
  if (isset($_GET['export'])) {
    $__what = (string)$_GET['export'];
    $__d    = crm_read_raw();
    $__ads  = isset($__d['paraveda_adspend_v1']['d']) ? crm_unwrap($__d['paraveda_adspend_v1']['d']) : array();
    if (!is_array($__ads)) $__ads = array();
    $__adsT = isset($__d['paraveda_adspend_v1']['t']) ? (int)$__d['paraveda_adspend_v1']['t'] : 0;
    $__rs   = isset($__d['paraveda_reset_v1']['t'])   ? (int)$__d['paraveda_reset_v1']['t']   : 0;

    if ($__what === 'adspend') {
      crm_out(array('ok'=>true, 't'=>$__adsT, 'rs'=>$__rs, 'rows'=>array_values($__ads)));
    }

    if ($__what === 'perf') {
      $__ord = isset($__d['paraveda_orders_v5']['d']) ? crm_unwrap($__d['paraveda_orders_v5']['d']) : array();
      if (!is_array($__ord)) $__ord = array();
      /* فهرسة الطلبيات بالتاريخ — بلا هادشي كنديرو 109 × 1400 مقارنة */
      $__byDate = array();
      foreach ($__ord as $o) {
        if (!is_array($o) || !empty($o['_del'])) continue;
        $dt = isset($o['dateCreation']) ? (string)$o['dateCreation'] : '';
        if ($dt === '') continue;
        $__byDate[$dt][] = $o;
      }
      $__norm = function($v) { return strtolower(trim((string)$v)); };
      $__rows = array();
      foreach ($__ads as $a) {
        if (!is_array($a)) continue;
        $aDate = isset($a['date'])    ? (string)$a['date']    : '';
        $aAg   = isset($a['agent'])   ? (string)$a['agent']   : '';
        $aPr   = isset($a['produit']) ? (string)$a['produit'] : '';
        $aSrc  = isset($a['source'])  ? (string)$a['source']  : '';
        $amt   = isset($a['amount'])  ? (float)$a['amount']   : 0;

        $cnt = 0; $conf = 0; $livre = 0; $retour = 0; $ca = 0;
        $pool = isset($__byDate[$aDate]) ? $__byDate[$aDate] : array();
        foreach ($pool as $o) {
          /* نفس منطق المطابقة ديال صفحة Dashboard performance بالضبط */
          if ($aAg !== '' && $__norm(isset($o['agent']) ? $o['agent'] : '') !== $__norm($aAg)) continue;
          if ($aPr !== '' && $__norm(isset($o['produit']) ? $o['produit'] : '') !== $__norm($aPr)) continue;
          if ($aAg === '' && $aSrc !== ''
              && $__norm(isset($o['originLead']) ? $o['originLead'] : '') !== $__norm($aSrc)) continue;

          $cnt++;
          $st = isset($o['statut'])    ? (string)$o['statut']    : '';
          $lv = isset($o['livraison']) ? (string)$o['livraison'] : '';
          if ($st === 'Confirmé') $conf++;
          if ($lv === 'Livrée' || $lv === 'Rechange')   { $livre++;  $ca += isset($o['prix']) ? (float)$o['prix'] : 0; }
          if ($lv === 'Retour' || $lv === 'Remboursé')  { $retour++; }
        }
        $__rows[] = array(
          'id'      => isset($a['id']) ? $a['id'] : '',
          'date'    => $aDate,
          'agent'   => $aAg,
          'produit' => $aPr,
          'source'  => $aSrc,
          'amount'  => $amt,
          'count'   => $cnt,
          'conf'    => $conf,
          'livre'   => $livre,
          'retour'  => $retour,
          'ca'      => $ca,
          'cpl'     => $cnt > 0 ? round($amt / $cnt, 2) : '',
        );
      }
      crm_out(array('ok'=>true, 't'=>$__adsT, 'rs'=>$__rs, 'rows'=>$__rows));
    }

    if ($__what === 'orders') {
      /* v3.92: الطلبيات الحية للـ Google Sheet.
       * كنرجعو صفوف (arrays) ماشي objects — الحجم كينقص ~60% وكيدخل
       * مباشرة لـ setValues() بلا تحويل. */
      $__cols = array('id','dateCreation','dateConfirmation','statut','remarques','idCmd',
                      'nom','telephone','ville','adresse','qte','prix','produit','livraison',
                      'upsell','carousell','agent','link','carosellFlag','originLead',
                      'commission','fees','livreur','tracking','dateExp','dateLiv','motif');
      $__since = isset($_GET['since']) ? trim((string)$_GET['since']) : '';
      $__ord = isset($__d['paraveda_orders_v5']['d']) ? crm_unwrap($__d['paraveda_orders_v5']['d']) : array();
      if (!is_array($__ord)) $__ord = array();
      $__out = array();
      foreach ($__ord as $o) {
        if (!is_array($o) || !empty($o['_del'])) continue;              // الممسوحة ما كتبانش
        if ($__since !== '' && (string)(isset($o['dateCreation']) ? $o['dateCreation'] : '') < $__since) continue;
        $row = array();
        foreach ($__cols as $c) {
          $v = isset($o[$c]) ? $o[$c] : '';
          if (is_array($v) || is_object($v)) $v = '';
          $row[] = $v;
        }
        $__out[] = $row;
      }
      /* الأحدث فاللول (نفس ترتيب الـCRM) */
      usort($__out, function($a, $b) {
        if ($a[1] === $b[1]) return ((float)$b[0] < (float)$a[0]) ? -1 : (((float)$b[0] > (float)$a[0]) ? 1 : 0);
        return strcmp((string)$b[1], (string)$a[1]);
      });
      crm_out(array(
        'ok'   => true,
        't'    => isset($__d['paraveda_orders_v5']['t']) ? (int)$__d['paraveda_orders_v5']['t'] : 0,
        'cols' => $__cols,
        'rows' => $__out,
      ));
    }

    if ($__what === 'stats') {
      /* v3.93: تشخيص — كيعطي الأرقام ديال الطلبيات بلا ما يحمّل الداتا كاملة */
      $__ord = isset($__d['paraveda_orders_v5']['d']) ? crm_unwrap($__d['paraveda_orders_v5']['d']) : array();
      if (!is_array($__ord)) $__ord = array();
      $live = 0; $del = 0; $nodate = 0; $bymonth = array(); $min = ''; $max = '';
      foreach ($__ord as $o) {
        if (!is_array($o)) continue;
        if (!empty($o['_del'])) { $del++; continue; }
        $live++;
        $dt = isset($o['dateCreation']) ? (string)$o['dateCreation'] : '';
        if ($dt === '') { $nodate++; continue; }
        $m = substr($dt, 0, 7);
        $bymonth[$m] = (isset($bymonth[$m]) ? $bymonth[$m] : 0) + 1;
        if ($min === '' || $dt < $min) $min = $dt;
        if ($max === '' || $dt > $max) $max = $dt;
      }
      ksort($bymonth);
      crm_out(array(
        'ok'            => true,
        'total_rows'    => count($__ord),
        'live_orders'   => $live,
        'deleted'       => $del,
        'without_date'  => $nodate,
        'oldest'        => $min,
        'newest'        => $max,
        'by_month'      => $bymonth,
        'data_file_kb'  => round(@filesize($DATA_FILE) / 1024),
        'journal_kb'    => round(@filesize($JOURNAL) / 1024),
        'orders_t'      => isset($__d['paraveda_orders_v5']['t']) ? (int)$__d['paraveda_orders_v5']['t'] : 0,
      ));
    }

    if ($__what === 'csv') {
      /* v3.95: CSV مباشر لـ Google Sheets عبر IMPORTDATA() — بلا Apps Script.
       * الأعمدة بنفس ترتيب ورقة COMONDES: A حتى M. بلا رأس. */
      $__ord = isset($__d['paraveda_orders_v5']['d']) ? crm_unwrap($__d['paraveda_orders_v5']['d']) : array();
      if (!is_array($__ord)) $__ord = array();
      $__c = array('dateCreation','dateConfirmation','statut','remarques','idCmd','nom',
                   'telephone','ville','adresse','qte','prix','produit','livraison');
      /* v3.96: &cols=upsell  ولا  &cols=agent,link  → كيرجع غير داك/هادوك الأعمدة،
       * بنفس ترتيب السطور. مفيد للأعمدة لي جايين بعد M فالشيت. */
      if (!empty($_GET['cols'])) {
        $__allf = array('id','dateCreation','dateConfirmation','statut','remarques','idCmd','nom',
                        'telephone','ville','adresse','qte','prix','produit','livraison','upsell',
                        'carousell','agent','link','carosellFlag','originLead','commission','fees',
                        'livreur','tracking','dateExp','dateLiv','motif');
        $__sel = array();
        foreach (explode(',', (string)$_GET['cols']) as $__r) {
          $__r = trim($__r);
          if ($__r === '') continue;
          foreach ($__allf as $__f) { if (strcasecmp($__f, $__r) === 0) { $__sel[] = $__f; break; } }
        }
        if (!$__sel) crm_out(array('ok'=>false,'err'=>'bad-cols','allowed'=>$__allf), 400);
        $__c = $__sel;
      }
      $__rows = array();
      foreach ($__ord as $o) {
        if (!is_array($o) || !empty($o['_del'])) continue;
        $__rows[] = $o;
      }
      usort($__rows, function($a, $b) {
        $x = isset($a['dateCreation']) ? (string)$a['dateCreation'] : '';
        $y = isset($b['dateCreation']) ? (string)$b['dateCreation'] : '';
        if ($x === $y) {
          $ai = isset($a['id']) ? (float)$a['id'] : 0; $bi = isset($b['id']) ? (float)$b['id'] : 0;
          return ($bi < $ai) ? -1 : (($bi > $ai) ? 1 : 0);
        }
        return strcmp($y, $x);
      });
      $out = '';
      foreach ($__rows as $o) {
        $line = array();
        foreach ($__c as $c) {
          $v = isset($o[$c]) ? $o[$c] : '';
          if (is_array($v) || is_object($v)) $v = '';
          $v = (string)$v;
          /* الهاتف: فراغ رفيع فاللول باش Google Sheets ما يحيدش الصفر */
          /* &plain=1 كيحيد الحماية إلا كان عمود الهاتف معمول "نص عادي" فالشيت */
          if ($c === 'telephone' && $v !== '' && $v[0] === '0' && empty($_GET['plain']))
            $v = "\xE2\x80\x8B" . $v;
          $line[] = '"' . str_replace('"', '""', $v) . '"';
        }
        $out .= implode(',', $line) . "\r\n";
      }
      if (!headers_sent()) {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: inline; filename="commandes.csv"');
      }
      echo $out;
      exit;
    }

    crm_out(array('ok'=>false, 'err'=>'unknown-export'), 400);
  }

  $__sig  = crm_data_sig();
  $__inm  = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
  $__hit  = crm_etag_cached($__sig);
  if ($__hit !== null && $__inm !== '' && ($__inm === $__hit || $__inm === 'W/' . $__hit)) {
    header('ETag: ' . $__hit);
    http_response_code(304);
    exit;
  }

  $data = crm_read_raw();
  // normalise on the way out so old corrupted entries never reach the browser
  foreach ($data as $k => $v) {
    if (is_array($v) && array_key_exists('d', $v)) { $data[$k]['d'] = crm_unwrap($v['d']); }
  }
  // v3.83: حصر السجل فـ 400 عملية الأخيرة باش أجهزة المتصفح ما تعمرش وتضرب QuotaExceededError
  if (isset($data['paraveda_history_v1']['d']) && is_array($data['paraveda_history_v1']['d'])) {
    if (count($data['paraveda_history_v1']['d']) > 400) {
      $data['paraveda_history_v1']['d'] = array_slice($data['paraveda_history_v1']['d'], 0, 400);
    }
  }
  unset($data['paraveda_backup_v1']);
  unset($data['paraveda_backup_v1_agents']);

  $__body = json_encode($data, JSON_UNESCAPED_UNICODE);
  $__etag = '"' . md5($__body) . '"';
  crm_etag_store($__sig, $__etag);
  header('ETag: ' . $__etag);
  if ($__inm !== '' && ($__inm === $__etag || $__inm === 'W/' . $__etag)) { http_response_code(304); exit; }

  /* PERF v3.90: gzip — الداتا JSON كتضغط ~85%. 1.1MB → ~150KB. */
  if (!headers_sent() && !ini_get('zlib.output_compression')
      && strpos((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip') !== false
      && function_exists('gzencode')) {
    $__gz = @gzencode($__body, 5);
    if ($__gz !== false) {
      header('Content-Encoding: gzip');
      header('Vary: Accept-Encoding');
      header('Content-Length: ' . strlen($__gz));
      echo $__gz;
      exit;
    }
  }
  header('Content-Length: ' . strlen($__body));
  echo $__body;
  exit;
}

/* ---------- POST ---------- */
if ($m === 'POST') {
  if (!hash_equals($SECRET, crm_token())) crm_out(array('ok'=>false, 'err'=>'token'), 403);

  $raw = file_get_contents('php://input');
  if (strlen($raw) > $MAX_BODY) crm_out(array('ok'=>false, 'err'=>'too-large'), 413);
  $b = json_decode($raw, true);
  if (!is_array($b)) crm_out(array('ok'=>false, 'err'=>'bad-json'), 400);

  /* -- actions (Digylog etc.) -- */
  if (isset($b['action'])) {
    $a = (string)$b['action'];
    if ($a === 'ping') crm_out(array('ok'=>true, 'v'=>'3.83'));
    if ($a === 'restore') crm_out(array('ok'=>false, 'err'=>'restore-not-implemented', 'msg'=>'الاسترجاع كيدار يدوياً من مجلد backups'), 501);
    if ($a === 'sheet_orders') crm_sheet_orders($b);   // v3.97: الشيت → CRM
    if (strpos($a, 'digylog') === 0) crm_out(array('ok'=>false, 'err'=>'digylog-removed', 'msg'=>'الربط مع Digylog تحيد فـ v3.41'), 410);
    crm_out(array('ok'=>false, 'err'=>'unknown-action'), 400);
  }

  /* -- normal key write -- */
  if (!isset($b['key']) || !array_key_exists('d', $b)) crm_out(array('ok'=>false, 'err'=>'bad-body'), 400);
  $k = (string)$b['key'];
  if (strpos($k, 'afrizon_') === 0) $k = 'paraveda_' . substr($k, 8); // old tabs
  if (!in_array($k, $ALLOWED_KEYS, true)) { crm_audit("reject | key=$k | not-allowed"); crm_out(array('ok'=>false, 'err'=>'key-not-allowed'), 400); }
  // v3.83: paraveda_backup_v1 ملغية لحماية كاش المتصفح من الامتلاء
  if ($k === 'paraveda_backup_v1' || $k === 'paraveda_backup_v1_agents') {
    // FIX v3.90: $t كانت كتستعمل قبل ما تتعرّف (notice + t=null فالجواب)
    crm_out(array('ok'=>true, 'noop'=>'backup_deprecated', 't'=>(int)(microtime(true) * 1000)));
  }

  $d = crm_unwrap($b['d']);
  $t = isset($b['t']) ? (int)$b['t'] : (int)(microtime(true) * 1000);
  $now = (int)(microtime(true) * 1000);
  if ($t > $now + 60000) $t = $now; // clock skew guard

  // v3.62: reset epoch — writes of wiped keys carrying data older than the reset are ignored
  // v3.67: EXCEPT for reset-aware clients — the body now carries rs (the client's seen reset
  // stamp). A device that acknowledged the reset can never silently lose its NEW orders again,
  // even if its clock is behind (client _u < RESET_T was wrongly discarding genuine new rows).
  $__cur0 = crm_read_raw();
  $RESET_T = isset($__cur0['paraveda_reset_v1']['t']) ? (int)$__cur0['paraveda_reset_v1']['t'] : 0;
  $RS = isset($b['rs']) ? (int)$b['rs'] : 0;
  $RESET_AWARE = ($RESET_T > 0 && $RS >= $RESET_T);
  $RESET_KEYS = array('paraveda_catalog_v1','sheet_pièce','paraveda_history_v1','paraveda_adspend_v1','paraveda_perfrows_v1','paraveda_backup_v1');
  if ($RESET_T > 0 && !$RESET_AWARE && in_array($k, $RESET_KEYS, true) && $t < $RESET_T) { crm_audit("reset-stale | key=$k | t=$t < reset=$RESET_T"); crm_out(array('ok'=>true, 'noop'=>'reset-stale', 'reset'=>$RESET_T, 't'=>$RESET_T)); }
  if ($k === 'paraveda_orders_v5' && $RESET_T > 0 && !$RESET_AWARE && is_array($d)) {
    $__f = array(); foreach ($d as $o) { if (is_array($o) && isset($o['_u']) && (float)$o['_u'] >= $RESET_T) $__f[] = $o; }
    $d = $__f;
  }
  // ghost guard: never let a client wipe orders/users with an empty array while server has data
  /* v3.91: zidt paraveda_adspend_v1 — دابا Google Sheet كيقدر يكتب هنا،
   * وإلا تمسحات الورقة بالغلط (ولا سكريبت طاح فنص الطريق) ما خاصش
   * المصاريف كاملين يطيرو من الـCRM. */
  if (($k === 'paraveda_orders_v5' || $k === 'paraveda_users_v1' || $k === 'paraveda_villes_v2' || $k === 'paraveda_chat_v1' || $k === 'paraveda_catalog_v1' || $k === 'paraveda_adspend_v1' || $k === 'paraveda_backup_v1' || $k === 'paraveda_backup_v1_agents') && is_array($d) && count($d) === 0) {
    $cur = $__cur0;   // PERF v3.90: كنعاودو نستعملو القراية ديال فوق عوض قراية جديدة ديال 2.2MB
    if (isset($cur[$k]['d']) && is_array($cur[$k]['d']) && count($cur[$k]['d']) > 0) {
      crm_audit("ghost | key=$k | empty write blocked");
      crm_out(array('ok'=>true, 'noop'=>'ghost', 't'=>(int)$cur[$k]['t']));
    }
  }

  $fh = @fopen($LOCK_FILE, 'c');
  if ($fh) @flock($fh, LOCK_EX);

  // PERF v3.90: هادي الوحيدة لي خاصها تكون طرية — ممكن شي request آخر كتب
  // قبل ما ناخدو القفل. الجوج القرايات ديال فوق كيتشاركو نفس الـ cache.
  $data = crm_read_raw(true);
  $prevT = isset($data[$k]['t']) ? (int)$data[$k]['t'] : 0;

  $__NOMERGE = array('paraveda_orders_v5','paraveda_chat_v1','paraveda_users_v1','paraveda_agent_names_v1','paraveda_villes_v2','paraveda_worktimes_v1','paraveda_remarques_v1','paraveda_avances_v1','paraveda_adspend_v1','paraveda_perfrows_v1','paraveda_livraison_v1','paraveda_history_v1','paraveda_catalog_v1','tabs_list_v1','sheet_pièce');
  if ($t < $prevT && !in_array($k, $__NOMERGE, true)) { // stale write — غير على ليستة ما كيندمجوش
    if ($fh) { @flock($fh, LOCK_UN); @fclose($fh); }
    crm_audit("stale | key=$k | t=$t < $prevT");
    crm_out(array('ok'=>true, 'noop'=>'stale', 't'=>$prevT));
  }
  $prevJson = isset($data[$k]['d']) ? json_encode($data[$k]['d'], JSON_UNESCAPED_UNICODE) : null;
  $newJson  = json_encode($d, JSON_UNESCAPED_UNICODE);
  if ($prevJson === $newJson) {          // nothing changed: touch time only, no backup churn
    /* v3.81: t ما كينقصش عمرو — قبل، جهاز ساعتو متأخرة كان كيرجّع t للور
       → الأجهزة الأخرى كيوقفو يشوفو التبدلات (i.t > c كتفشل ديما). */
    $effT = max($prevT, $t);
    $data[$k]['t'] = $effT;
    crm_write_all($data);
    if ($fh) { @flock($fh, LOCK_UN); @fclose($fh); }
    crm_out(array('ok'=>true, 'noop'=>'same', 't'=>$effT));
  }

  crm_backup();
  // v3.45: orders are merged row-by-row (newest _u wins, rows never dropped) so
  // several agents/admins writing at the same time never erase each other.
  if ($k === 'paraveda_orders_v5' && is_array($d)) {
    $__storedO = (isset($data[$k]['d']) && is_array($data[$k]['d'])) ? crm_unwrap($data[$k]['d']) : null;   // v3.81: unwrap قبل الدمج
    if (is_array($__storedO)) $d = crm_merge_orders($__storedO, $d, $RESET_T);
    // PERF v3.90: تنقية الطلبيات الممسوحة القديمة (أكثر من 30 يوم) — كانو 42% من الداتا
    $d = crm_purge_tombstones($d, $TOMBSTONE_TTL, $TOMBSTONE_MAX);
  }
  // v3.72: الرسائل كيتدمجو union بالـ id (ما كاينش مسح فالشات) — كاتب متزامنين ما يضيعوش رسائل
  if ($k === 'paraveda_chat_v1' && is_array($d)) {
    $__storedC = (isset($data[$k]['d']) && is_array($data[$k]['d'])) ? crm_unwrap($data[$k]['d']) : null;   // v3.81: unwrap قبل الدمج
    if (!is_array($__storedC)) $__storedC = array();
    $byId = array();
    foreach ($__storedC as $m) { if (is_array($m) && isset($m['id'])) $byId[(string)$m['id']] = $m; }
    foreach ($d as $m) {
      if (!is_array($m) || !isset($m['id'])) continue;
      $id = (string)$m['id'];
      if (isset($byId[$id])) { $byId[$id]['read'] = !empty($byId[$id]['read']) || !empty($m['read']); }
      else $byId[$id] = $m;
    }
    usort($byId, function($x, $y) { $a = (float)$x['id']; $b = (float)$y['id']; return $a == $b ? 0 : ($a < $b ? -1 : 1); });
    $d = array_values($byId);
  }
  // v3.79: اليوزرز — دمج بالصفوف (نفس حل الطلبيات): _u الأحدث كيربح، الحذف _del ناعم.
  // حتى دفع قديم ولا ساعة متقدمة ما بقاش يقدر يمسح يوزر مضاف.
  // v3.81: unwrap على الداتا المخزنة قبل الدمج — غلاف مزدوج قديم كان كيخلي
  // الدمج كيبدا من ليستة خاوية → اليوزرز كلهم كيتمسحو بلا ما حد يحس.
  if ($k === 'paraveda_users_v1' && is_array($d)) {
    $__storedU = (isset($data[$k]['d']) && is_array($data[$k]['d'])) ? crm_unwrap($data[$k]['d']) : null;
    if (is_array($__storedU)) {
      $uById = array();
      foreach ($__storedU as $u) { if (is_array($u) && isset($u['id'])) $uById[(string)$u['id']] = $u; }
      $nowms2 = (int)(microtime(true) * 1000);
      foreach ($d as $u) {
        if (!is_array($u) || !isset($u['id'])) continue;
        if (isset($u['_u']) && (float)$u['_u'] > $nowms2) $u['_u'] = $nowms2;
        $uid = (string)$u['id'];
        if (!isset($uById[$uid])) {
          /* v3.81: نفس الاسم ما كيتزادش مرتين بجوج ids — جوج أجهزة زادو نفس
             اليوزر فنفس الوقت كانو كيديرو دوبلون. اللي كاين فالسيرفر كيبقى. */
          $un = (isset($u['username']) && is_string($u['username'])) ? strtolower(trim($u['username'])) : '';
          $dup = false;
          if ($un !== '') { foreach ($uById as $su) { if (empty($su['_del']) && isset($su['username']) && is_string($su['username']) && strtolower(trim((string)$su['username'])) === $un) { $dup = true; break; } } }
          if (!$dup) $uById[$uid] = $u;
          continue;
        }
        /* v3.82: الحذف نهائي (من الجوج جيهات): نسخة فيها _del كتربح دايماً،
           حتى إلا كانت _u ديالها أقدم — يوزر ممسوح ما كيرجعش. */
        $sd = !empty($uById[$uid]['_del']); $id2 = !empty($u['_del']);
        if ($sd || $id2) {
          $cu = isset($uById[$uid]['_u']) ? (float)$uById[$uid]['_u'] : 0;
          $nu = isset($u['_u']) ? (float)$u['_u'] : 0;
          if (!$sd || ($id2 && $nu > $cu)) $uById[$uid] = $u;
          continue;
        }
        $cu = isset($uById[$uid]['_u']) ? (float)$uById[$uid]['_u'] : 0;
        $nu = isset($u['_u']) ? (float)$u['_u'] : 0;
        if ($nu > $cu) $uById[$uid] = $u;
      }
      $d = array_values($uById);
    }
  }
  // v3.78: دمج موحد — الوكلاء/المدن/غيرهم
  if (in_array($k, $__NOMERGE, true) && $k !== 'paraveda_orders_v5' && $k !== 'paraveda_chat_v1' && $k !== 'paraveda_users_v1'
      && is_array($d)) {
    $__storedL = (isset($data[$k]['d']) && is_array($data[$k]['d'])) ? crm_unwrap($data[$k]['d']) : null;    // v3.81: unwrap قبل الدمج
    if (is_array($__storedL)) $d = crm_merge_list($__storedL, $d, $prevT, $t);
  }
  // v3.83: حصر السجل فـ 400 عملية الأخيرة كحد أقصى
  if ($k === 'paraveda_history_v1' && is_array($d)) {
    usort($d, function($x, $y) {
      $atX = (is_array($x) && isset($x['at'])) ? (string)$x['at'] : '';
      $atY = (is_array($y) && isset($y['at'])) ? (string)$y['at'] : '';
      $c = strcmp($atY, $atX);
      if ($c !== 0) return $c;
      $idX = (is_array($x) && isset($x['id'])) ? (float)$x['id'] : 0;
      $idY = (is_array($y) && isset($y['id'])) ? (float)$y['id'] : 0;
      return $idX == $idY ? 0 : ($idX < $idY ? 1 : -1);
    });
    if (count($d) > 400) {
      $d = array_slice($d, 0, 400);
    }
  }
  $data[$k] = array('t' => max($prevT + 1, $t), 'd' => $d);   // v3.81: t رتيب ديما — كتابة جديدة كيشوفها كلشي حتى من جهاز ساعتو متأخرة
  $effT = $data[$k]['t'];
  $ok = crm_write_all($data);
  if ($ok && is_array($d)) crm_journal_append($k, $effT, $d);
  if ($fh) { @flock($fh, LOCK_UN); @fclose($fh); }

  if (!$ok) crm_out(array('ok'=>false, 'err'=>'write-failed'), 500);
  crm_audit("write | $k | t=$effT | bytes=" . strlen($newJson));
  crm_out(array('ok'=>true, 't'=>$effT));
}

http_response_code(405);
echo '{"ok":false,"err":"method-not-allowed"}';
exit;
