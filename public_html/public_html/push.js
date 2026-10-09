/* Paraveda CRM — إشعارات الطلبيات (Web Push) لكل بنت */
(function () {
  'use strict';
  var TOKEN = '8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';   // نفس التوكن ديال CRM
  var NAMES = ['Meryam', 'AYA', 'imane', 'safa'];                  // غير إلا ما كانش حساب مرتبط بالبنت
  var KEY = 'pv_push_agent';          // البنت لي مرتبطة بهاد الهاتف
  var EP_KEY = 'pv_push_endpoint';    // آخر عنوان إشعارات تسجل فالسيرفر
  var SESSION_KEY = 'paraveda_session_v1';
  var USERS_KEY = 'paraveda_users_v1';

  var supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var IOS_MSG = 'على آيفون: الإشعارات كتخدم غير من الشاشة الرئيسية.\n\n1) فـSafari كليكي على زر Partager (⬆️)\n2) ختار Sur l\'écran d\'accueil (زيد للشاشة الرئيسية)\n3) حل CRM من الأيقونة الجديدة\n4) من هناك كليكي على 🔔 الإشعارات';
  var reg = null;
  if (supported) navigator.serviceWorker.register('sw.js').then(function (r) { reg = r; }).catch(function () {});

  /* البنت لي داخلة دابا (من الحساب ديالها). ماكاينش حساب = ''  */
  function myAgent() {
    try {
      var sid = localStorage.getItem(SESSION_KEY);
      var users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      var me = users.find(function (u) { return String(u.id) === String(sid) && !u._del; });
      return (me && me.agent) ? String(me.agent) : '';
    } catch (e) { return ''; }
  }
  function b64uToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:70px;left:12px;z-index:100000;background:#0f172a;color:#fff;padding:10px 14px;border-radius:10px;font:14px system-ui;max-width:80vw;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }
  function api(body) {
    return fetch('api.php', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Token': TOKEN },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  /* يسجل الهاتف عند السيرفر باسم البنت (خاص الإذن يكون مسموح) */
  async function subscribe(agent) {
    var r = reg || await navigator.serviceWorker.ready;
    var kj = await (await fetch('api.php?pushkey=1&token=' + TOKEN, { cache: 'no-store' })).json();
    if (!kj.ok) throw new Error('السيرفر ما قدرش يجهز الإشعارات.');
    var sub = await r.pushManager.getSubscription();
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(kj.key) });
    var j = await api({ action: 'push_subscribe', agent: agent, sub: sub.toJSON() });
    if (!j.ok) throw new Error('ما تسجلاتش الهاتف (' + (j.err || '?') + ')');
    localStorage.setItem(KEY, agent);
    localStorage.setItem(EP_KEY, sub.endpoint);
    return agent;
  }
  /* بالضغط على الزر (خاص ضغطة وحدة أول مرة فقط) */
  async function enable(agent) {
    if (isIOS && !isStandalone) throw new Error(IOS_MSG);
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('خاص تسماح بالإشعارات.');
    return subscribe(agent);
  }
  /* بلا ضغط: إلا كان الإذن مسموح وكاين حساب، كيتسجل وحدو (ولا كيحوّل الهاتف لحساب آخر) */
  var syncing = false;
  async function autoSync() {
    if (!supported || syncing || Notification.permission !== 'granted') return;
    if (isIOS && !isStandalone) return;
    var a = myAgent();
    if (!a) return;
    syncing = true;
    try {
      var r = reg || await navigator.serviceWorker.ready;
      var sub = await r.pushManager.getSubscription();
      if (sub && localStorage.getItem(KEY) === a && localStorage.getItem(EP_KEY) === sub.endpoint) return;
      await subscribe(a);
    } catch (e) { /* نعاودو مرة أخرى */ }
    finally { syncing = false; }
  }

  function panel() {
    if (!supported) { alert(isIOS ? IOS_MSG : 'المتصفح ديالك ما كيدعمش الإشعارات. جرب Chrome.'); return; }
    var old = document.getElementById('pv-push-panel');
    if (old) { old.remove(); return; }
    var box = document.createElement('div');
    box.id = 'pv-push-panel';
    box.style.cssText = 'position:fixed;bottom:70px;left:12px;z-index:100000;background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:14px;box-shadow:0 8px 24px rgba(0,0,0,.2);font:14px system-ui;direction:rtl;width:240px';
    var h = document.createElement('div');
    h.style.cssText = 'font-weight:700;margin-bottom:8px';
    var me = myAgent();
    var names = me ? [me] : NAMES;          // البنت كتشوف سميتها غير
    h.textContent = me ? '🔔 الإشعارات' : '🔔 الإشعارات — شكون نتي؟';
    box.appendChild(h);
    names.forEach(function (n) {
      var b = document.createElement('button');
      var done = Notification.permission === 'granted' && localStorage.getItem(KEY) === n;
      b.textContent = done ? '✅ ' + n : n;
      b.style.cssText = 'display:block;width:100%;margin:6px 0;padding:10px;border-radius:10px;border:1px solid #0f766e;background:#f0fdfa;color:#0f766e;font-weight:600;cursor:pointer';
      b.onclick = function () {
        b.disabled = true; b.textContent = '...';
        enable(n).then(function (a) {
          toast('✅ الإشعارات مفعّلة لـ ' + a);
          box.remove();
        }).catch(function (e) {
          toast('❌ ' + e.message);
          b.disabled = false; b.textContent = n;
        });
      };
      box.appendChild(b);
    });
    var test = document.createElement('button');
    test.textContent = '🧪 إشعار تجريبي';
    test.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px;border-radius:10px;border:none;background:#e2e8f0;cursor:pointer';
    test.onclick = function () {
      var a = localStorage.getItem(KEY) || me;
      if (!a) { toast('ختار سميتك الأول'); return; }
      api({ action: 'push_test', agent: a }).then(function (j) {
        toast(j.sent ? '📨 تصيفط للهاتف' : '⚠️ ما وصلش، عاود فعّل الإشعارات');
      });
    };
    box.appendChild(test);
    document.body.appendChild(box);
  }

  function button() {
    var b = document.createElement('button');
    b.id = 'pv-push-btn';
    b.textContent = '🔔 الإشعارات';
    b.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:100000;padding:8px 12px;border-radius:999px;border:none;background:#0f766e;color:#fff;font:13px system-ui;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2)';
    b.onclick = panel;
    document.body.appendChild(b);
  }

  function start() {
    button();
    autoSync();
    setInterval(autoSync, 5000);   // كتشوف الحساب ملي تدخل البنت
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
