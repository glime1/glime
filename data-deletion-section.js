/* =========================================================
   GLIME - "Delete my business data" section (data-download.html)
   ---------------------------------------------------------
   - Client requests deletion; it is scheduled 30 days ahead.
   - Client can cancel any time before the date.
   - After the date, a GLIME admin completes the deletion.
   - Only business data is removed. Account, login and
     billing records stay.
   Uses the page's own Supabase client (sb), verify() and
   state from data-download.html. Backend: RPCs
   client_get_data_deletion_status / client_request_data_deletion /
   client_cancel_data_deletion.
========================================================= */
(function () {
  'use strict';
  var mount = document.getElementById('deleteMount');
  if (!mount) return;

  var css = document.createElement('style');
  css.textContent =
    '.del{margin-top:30px;border:1px solid rgba(255,71,87,.35);background:rgba(255,71,87,.05);border-radius:16px;padding:20px}' +
    '.del h2{margin:0 0 6px;font-size:1.05rem;color:#ff8b96}' +
    '.del p{color:#d1d5db;font-size:.84rem;line-height:1.6;margin:6px 0}' +
    '.del ul{margin:8px 0 8px 18px;padding:0;color:#cbd5e1;font-size:.82rem;line-height:1.7}' +
    '.del .keep{color:#9ca3af;font-size:.78rem}' +
    '.del-btn{margin-top:12px;padding:12px 20px;border-radius:12px;border:1px solid rgba(255,71,87,.5);background:rgba(255,71,87,.12);color:#ff8b96;font-weight:700;font-size:.9rem;cursor:pointer}' +
    '.del-btn[disabled]{opacity:.5;cursor:not-allowed}' +
    '.del-pending{margin-top:10px;padding:12px 14px;border-radius:12px;background:rgba(255,184,0,.08);border:1px solid rgba(255,184,0,.35);color:#ffd36b;font-size:.86rem;line-height:1.55}' +
    '.del-msg{margin-top:10px;font-size:.82rem;color:#9ca3af}.del-msg.err{color:#ff8b96}.del-msg.ok{color:#00ff88}' +
    '#delOv input{margin-top:6px}';
  document.head.appendChild(css);

  mount.innerHTML =
    '<section class="del" aria-labelledby="delTitle">' +
      '<h2 id="delTitle">Delete my business data</h2>' +
      '<p>You can ask GLIME to delete your business data. The deletion happens <strong>30 days after your request</strong>, and you can cancel any time before that.</p>' +
      '<ul>' +
        '<li>Removed: leads, customers, enquiries, orders, WhatsApp / Instagram / Voice conversations and messages, products &amp; services, knowledge base items.</li>' +
        '<li>Kept: your account and login, plan and billing records (required for accounting).</li>' +
      '</ul>' +
      '<p class="keep">Deleted data cannot be recovered. Download your data above first. Uploaded media files may be removed separately.</p>' +
      '<div id="delState"></div>' +
      '<div class="del-msg" id="delMsg" role="status"></div>' +
    '</section>' +
    '<div class="ov" id="delOv" role="dialog" aria-modal="true" aria-labelledby="delOvTitle"><div class="modal">' +
      '<h2 id="delOvTitle">Delete business data after 30 days?</h2>' +
      '<p>Type <strong>DELETE</strong> to confirm. You will then be asked to verify your identity.</p>' +
      '<input type="text" id="delType" placeholder="Type DELETE" autocomplete="off">' +
      '<div class="acts"><button type="button" class="btn ghost" id="delNo">Cancel</button><button type="button" class="btn" id="delYes" disabled>Continue</button></div>' +
    '</div></div>';

  var stateEl = document.getElementById('delState');
  var msg = document.getElementById('delMsg');
  var ov = document.getElementById('delOv');
  var typed = document.getElementById('delType');
  var yes = document.getElementById('delYes');
  var busy = false;

  function say(t, c) { msg.textContent = t || ''; msg.className = 'del-msg' + (c ? ' ' + c : ''); }

  function render(st) {
    stateEl.innerHTML = '';
    if (st && st.status === 'pending') {
      var when = new Date(st.scheduled_for).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      var box = document.createElement('div');
      box.className = 'del-pending';
      box.textContent = 'Deletion scheduled for ' + when + ' (' + st.days_left + ' day' + (st.days_left === 1 ? '' : 's') + ' left). Your data stays available until then.';
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
    sb.rpc('client_get_data_deletion_status').then(function (r) {
      if (r.error) { say('Could not check deletion status.', 'err'); render(null); return; }
      render(r.data);
    });
  }

  function openConfirm() {
    typed.value = ''; yes.disabled = true;
    ov.classList.add('on'); typed.focus();
  }
  function closeConfirm() { ov.classList.remove('on'); typed.value = ''; }
  typed.addEventListener('input', function () { yes.disabled = typed.value.trim() !== 'DELETE'; });
  typed.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeConfirm(); });
  document.getElementById('delNo').onclick = closeConfirm;

  yes.onclick = function () {
    if (busy || typed.value.trim() !== 'DELETE') return;
    closeConfirm();
    busy = true; say('');
    Promise.resolve(verify()).then(function (ok) {
      if (!ok) { say('Verification cancelled. Nothing was changed.', 'err'); busy = false; return; }
      return sb.rpc('client_request_data_deletion').then(function (r) {
        if (r.error) { say('Could not schedule deletion. Please try again.', 'err'); }
        else { render(r.data); say('Deletion scheduled. You can cancel it any time before the date.', 'ok'); }
        busy = false;
      });
    }).catch(function () { say('Something went wrong. Nothing was changed.', 'err'); busy = false; });
  };

  function cancel() {
    if (busy) return;
    busy = true; say('');
    sb.rpc('client_cancel_data_deletion').then(function (r) {
      if (r.error) say('Could not cancel. Please try again.', 'err');
      else { render({ status: 'none' }); say('Deletion cancelled. Your data stays as it is.', 'ok'); }
      busy = false;
    });
  }

  render(null);
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (typeof state !== 'undefined' && state.ctx) { clearInterval(t); load(); }
    else if (tries > 60) clearInterval(t);
  }, 250);
})();
