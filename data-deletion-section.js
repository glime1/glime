/* =========================================================
   GLIME - "Delete my business data" section (data-download.html)
   ---------------------------------------------------------
   - Client requests deletion; it is scheduled 30 days ahead.
   - Client can cancel any time before the date.
   - After the date, a GLIME admin completes the deletion.
   - KEPT for security and dispute safety: customers whose order
     is paid or processing, those orders and their leads. Account,
     login, plan and billing records also stay.
   - Everything else (chats, products, services, knowledge base,
     other leads/customers/orders) is removed.
   - Data contact: admin@glime.online
   Uses the page's own Supabase client (sb), verify() and
   state from data-download.html. Backend: RPCs
   client_get_data_deletion_status / client_request_data_deletion /
   client_cancel_data_deletion.
========================================================= */
(function () {
  'use strict';
  var mount = document.getElementById('deleteMount');
  if (!mount || mount.getAttribute('data-ready')) return;
  mount.setAttribute('data-ready', '1');

  var CONTACT = 'admin@glime.online';
  var COOLDOWN_MS = 5000;

  var css = document.createElement('style');
  css.textContent =
    '.del{margin-top:30px;border:1px solid rgba(255,71,87,.35);background:rgba(255,71,87,.05);border-radius:16px;padding:20px}' +
    '.del h2{margin:0 0 6px;font-size:1.05rem;color:#ff8b96}' +
    '.del h3{margin:0 0 6px;font-size:.84rem;letter-spacing:.4px}' +
    '.del p{color:#d1d5db;font-size:.84rem;line-height:1.6;margin:6px 0}' +
    '.del ul{margin:6px 0 4px 18px;padding:0;color:#cbd5e1;font-size:.82rem;line-height:1.7}' +
    '.del a{color:#00f0ff;text-decoration:none;font-weight:600}.del a:hover{text-decoration:underline}' +
    '.del .keep{color:#9ca3af;font-size:.78rem}' +
    '.del-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}' +
    '.del-col{border-radius:12px;padding:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}' +
    '.del-col.rm h3{color:#ff8b96}.del-col.kp h3{color:#00ff88}' +
    '.del-why{margin:10px 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(0,240,255,.25);background:rgba(0,240,255,.05);color:#cfe9ee;font-size:.8rem;line-height:1.6}' +
    '.del-btn{margin-top:12px;padding:12px 20px;border-radius:12px;border:1px solid rgba(255,71,87,.5);background:rgba(255,71,87,.12);color:#ff8b96;font-weight:700;font-size:.9rem;cursor:pointer}' +
    '.del-btn[disabled]{opacity:.5;cursor:not-allowed}' +
    '.del-pending{margin-top:10px;padding:12px 14px;border-radius:12px;background:rgba(255,184,0,.08);border:1px solid rgba(255,184,0,.35);color:#ffd36b;font-size:.86rem;line-height:1.55}' +
    '.del-msg{margin-top:10px;font-size:.82rem;color:#9ca3af}.del-msg.err{color:#ff8b96}.del-msg.ok{color:#00ff88}' +
    '#delOv .modal{max-height:92vh;overflow:auto}' +
    '#delOv ul{margin:0 0 12px 18px;padding:0;color:#cbd5e1;font-size:.8rem;line-height:1.65}' +
    '#delOv input[type=text]{margin-top:10px}' +
    '.del-ack{display:flex;gap:10px;align-items:flex-start;margin:8px 0;font-size:.8rem;line-height:1.5;color:#e5e7eb;cursor:pointer}' +
    '.del-ack input{width:18px;height:18px;margin:2px 0 0;accent-color:#ff4757;flex:0 0 auto}' +
    '@media(max-width:640px){.del-cols{grid-template-columns:1fr}}';
  document.head.appendChild(css);

  mount.innerHTML =
    '<section class="del" aria-labelledby="delTitle">' +
      '<h2 id="delTitle">Delete my business data</h2>' +
      '<p>You can ask GLIME to delete your business data. The deletion happens <strong>30 days after your request</strong>, and you can cancel any time before that.</p>' +
      '<div class="del-cols">' +
        '<div class="del-col rm"><h3>REMOVED</h3><ul>' +
          '<li>WhatsApp chats (conversations and messages)</li>' +
          '<li>Instagram chats (conversations, messages and comments)</li>' +
          '<li>Voice conversations and messages</li>' +
          '<li>Products &amp; services, knowledge base items, enquiries</li>' +
          '<li>All other leads, customers and orders that are not in the kept list</li>' +
        '</ul></div>' +
        '<div class="del-col kp"><h3>KEPT</h3><ul>' +
          '<li>Customers whose order is <strong>paid</strong> or <strong>processing</strong>, with those orders and their leads</li>' +
          '<li>Your account and login</li>' +
          '<li>Plan and billing records (required for accounting)</li>' +
        '</ul></div>' +
      '</div>' +
      '<div class="del-why"><strong>Why are some records kept?</strong> For security and safety. If a customer later says they have paid and a business denies it, these records are needed to settle the matter fairly. They are used only for this and for legal or accounting needs, never for anything else, and no one else can see them.</div>' +
      '<p class="keep">You can also delete WhatsApp chats from the <a href="whatsapp-sales-specialist.html">WhatsApp page</a> and Instagram chats from the <a href="instagram-sales-specialist.html">Instagram page</a> at any time. Deleted data cannot be recovered. Download your data above first. Uploaded media files may be removed separately.</p>' +
      '<p class="keep">Questions about your data? Write to <a id="delMail" href="mailto:' + CONTACT + '">' + CONTACT + '</a> from your registered email. We never ask for your password or login code by email.</p>' +
      '<div id="delState"></div>' +
      '<div class="del-msg" id="delMsg" role="status" aria-live="polite"></div>' +
    '</section>' +
    '<div class="ov" id="delOv" role="dialog" aria-modal="true" aria-labelledby="delOvTitle"><div class="modal">' +
      '<h2 id="delOvTitle">Delete business data after 30 days?</h2>' +
      '<ul>' +
        '<li>Data in the removed list is permanently deleted on the scheduled date.</li>' +
        '<li>Customers with paid or processing orders, their orders and their leads are kept.</li>' +
        '<li>You can cancel any time before the date.</li>' +
      '</ul>' +
      '<label class="del-ack"><input type="checkbox" id="delAck1"><span>I understand deleted data cannot be recovered after the scheduled date.</span></label>' +
      '<label class="del-ack"><input type="checkbox" id="delAck2"><span>I understand paid / processing customers and their leads are kept for security and dispute safety.</span></label>' +
      '<p style="margin:12px 0 0">Type <strong>DELETE</strong> to confirm. You will then be asked to verify your identity.</p>' +
      '<input type="text" id="delType" placeholder="Type DELETE" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
      '<div class="acts"><button type="button" class="btn ghost" id="delNo">Cancel</button><button type="button" class="btn" id="delYes" disabled>Continue</button></div>' +
    '</div></div>';

  var stateEl = document.getElementById('delState');
  var msg = document.getElementById('delMsg');
  var ov = document.getElementById('delOv');
  var typed = document.getElementById('delType');
  var ack1 = document.getElementById('delAck1');
  var ack2 = document.getElementById('delAck2');
  var yes = document.getElementById('delYes');
  var mail = document.getElementById('delMail');
  var busy = false, lastAct = 0, opener = null;

  function say(t, c) { msg.textContent = t || ''; msg.className = 'del-msg' + (c ? ' ' + c : ''); }
  function tooSoon() { return Date.now() - lastAct < COOLDOWN_MS; }

  function render(st) {
    stateEl.innerHTML = '';
    if (st && st.status === 'pending') {
      var d = new Date(st.scheduled_for);
      var when = isNaN(d.getTime()) ? 'the scheduled date' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      var left = Number(st.days_left);
      var box = document.createElement('div');
      box.className = 'del-pending';
      box.textContent = 'Deletion scheduled for ' + when +
        (isFinite(left) ? ' (' + left + ' day' + (left === 1 ? '' : 's') + ' left)' : '') +
        '. Your data stays available until then.';
      stateEl.appendChild(box);
      var c = document.createElement('button');
      c.type = 'button'; c.className = 'del-btn'; c.textContent = 'Cancel deletion';
      c.onclick = cancel;
      stateEl.appendChild(c);
    } else {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'del-btn'; b.textContent = 'Request deletion';
      b.onclick = openConfirm;
      stateEl.appendChild(b);
    }
  }

  function load() {
    if (state.ctx && state.ctx.key) {
      mail.href = 'mailto:' + CONTACT + '?subject=' + encodeURIComponent('Data request - ' + state.ctx.key);
    }
    sb.rpc('client_get_data_deletion_status').then(function (r) {
      if (r.error) { say('Could not check deletion status.', 'err'); render(null); return; }
      render(r.data);
    }, function () { say('Could not check deletion status.', 'err'); render(null); });
  }

  function ready() { yes.disabled = !(ack1.checked && ack2.checked && typed.value.trim() === 'DELETE'); }
  function openConfirm() {
    if (busy || tooSoon()) return;
    opener = document.activeElement;
    typed.value = ''; ack1.checked = false; ack2.checked = false; yes.disabled = true;
    ov.classList.add('on'); ack1.focus();
  }
  function closeConfirm() {
    ov.classList.remove('on'); typed.value = ''; ack1.checked = false; ack2.checked = false; yes.disabled = true;
    if (opener && opener.focus) opener.focus();
  }
  typed.addEventListener('input', ready);
  ack1.addEventListener('change', ready);
  ack2.addEventListener('change', ready);
  document.getElementById('delNo').onclick = closeConfirm;
  ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeConfirm(); });
  ov.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeConfirm(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(ov.querySelectorAll('input,button'), function (x) { return !x.disabled; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  yes.onclick = function () {
    if (busy || !(ack1.checked && ack2.checked && typed.value.trim() === 'DELETE')) return;
    closeConfirm();
    busy = true; say('');
    Promise.resolve(verify()).then(function (ok) {
      if (!ok) { say('Verification cancelled. Nothing was changed.', 'err'); busy = false; return; }
      return sb.rpc('client_request_data_deletion').then(function (r) {
        if (r.error) { say('Could not schedule deletion. Please try again.', 'err'); }
        else {
          lastAct = Date.now();
          if (r.data && r.data.status === 'pending') render(r.data); else load();
          say('Deletion scheduled. You can cancel it any time before the date.', 'ok');
        }
        busy = false;
      });
    }).catch(function () { say('Something went wrong. Nothing was changed.', 'err'); busy = false; });
  };

  function cancel() {
    if (busy) return;
    busy = true; say('');
    sb.rpc('client_cancel_data_deletion').then(function (r) {
      if (r.error) say('Could not cancel. Please try again.', 'err');
      else { lastAct = Date.now(); render({ status: 'none' }); say('Deletion cancelled. Your data stays as it is.', 'ok'); }
      busy = false;
    }, function () { say('Could not cancel. Please try again.', 'err'); busy = false; });
  }

  render(null);
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (typeof state !== 'undefined' && state.ctx) { clearInterval(t); load(); }
    else if (tries > 60) clearInterval(t);
  }, 250);
})();
