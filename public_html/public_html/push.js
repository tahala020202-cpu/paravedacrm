/* Paraveda CRM — تفعيل إشعارات الطلبيات (Web Push) للبنات */
(function () {
  'use strict';
  var TOKEN = '8c907fc0f4ffe0b9775a6b7c3c0fc7700e5724c0d78343df';   // نفس التوكن ديال CRM
  var NAMES = ['Meryam', 'AYA', 'imane', 'safa'];
  var KEY = 'pv_push_agent';

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var reg = null;
  navigator.serviceWorker.register('sw.js').then(function (r) { reg = r; }).catch(function () {});

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

  async function enable(agent) {
    if (isIOS && !isStandalone) throw new Error('على آيفون: زيد CRM للشاشة الرئيسية (Partager ← Sur l\'écran d\'accueil)، ومن بعد حلو من الأيقونة وعاود فعّل.');
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('خاص تسماح بالإشعارات.');
    var r = reg || await navigator.serviceWorker.ready;
    var kr = await fetch('api.php?pushkey=1&token=' + TOKEN, { cache: 'no-store' });
    var kj = await kr.json();
    if (!kj.ok) throw new Error('السيرفر ما قدرش يجهز الإشعارات.');
    var sub = await r.pushManager.getSubscription();
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(kj.key) });
    var j = await api({ action: 'push_subscribe', agent: agent, sub: sub.toJSON() });
    if (!j.ok) throw new Error('ما تسجلاتش الهاتف (' + (j.err || '?') + ')');
    localStorage.setItem(KEY, agent);
    return agent;
  }

  function panel() {
    var box = document.getElementById('pv-push-panel');
    if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; return; }
    box = document.createElement('div');
    box.id = 'pv-push-panel';
    box.style.cssText = 'position:fixed;bottom:70px;left:12px;z-index:100000;background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:14px;box-shadow:0 8px 24px rgba(0,0,0,.2);font:14px system-ui;direction:rtl;width:260px';
    var h = document.createElement('div');
    h.style.cssText = 'font-weight:700;margin-bottom:8px';
    h.textContent = '🔔 الإشعارات — شكون نتي؟';
    box.appendChild(h);
    NAMES.forEach(function (n) {
      var b = document.createElement('button');
      b.textContent = n;
      b.style.cssText = 'display:block;width:100%;margin:6px 0;padding:9px;border-radius:10px;border:1px solid #0f766e;background:#f0fdfa;color:#0f766e;font-weight:600;cursor:pointer';
      b.onclick = function () {
        b.disabled = true; b.textContent = 'كنفعّل...';
        enable(n).then(function (a) {
          toast('✅ الإشعارات مفعّلة لـ ' + a);
          box.style.display = 'none';
        }).catch(function (e) {
          toast('❌ ' + e.message);
          b.disabled = false; b.textContent = n;
        });
      };
      box.appendChild(b);
    });
    var test = document.createElement('button');
    test.textContent = '🧪 صيفط إشعار تجريبي';
    test.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px;border-radius:10px;border:none;background:#e2e8f0;cursor:pointer';
    test.onclick = function () {
      var a = localStorage.getItem(KEY);
      if (!a) { toast('ختار سميتك الأول'); return; }
      api({ action: 'push_test', agent: a }).then(function (j) {
        toast(j.sent ? '📨 تصيفط للهاتف ديالك' : '⚠️ ما وصلش، عاود فعّل الإشعارات');
      });
    };
    box.appendChild(test);
    var note = document.createElement('div');
    note.style.cssText = 'margin-top:8px;font-size:12px;color:#64748b';
    note.textContent = isIOS && !isStandalone ? 'على آيفون: زيد CRM للشاشة الرئيسية قبل التفعيل.' : '';
    box.appendChild(note);
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', button);
  else button();
})();
