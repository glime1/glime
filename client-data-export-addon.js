/* =========================================================
   GLIME CLIENT DATA EXPORT
   ---------------------------------------------------------
   Adds a "Download My Data" button to the shared app-shell
   sidebar. One click builds a ZIP (one CSV per data type)
   containing ONLY the signed-in client's own data.

   - Frontend only. Uses the client's own login session, so
     the database's row-level security still decides what is
     readable. Every query is also filtered by client_id.
   - No backend, SQL or table changes.
========================================================= */
(function () {
  'use strict';
  if (window.GlimeDataExport) return;

  var SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var PAGE = 1000;
  var MAX_PAGES = 200;

  var WA_MSG_COLS = 'id,client_id,conversation_id,provider_message_id,direction,message_type,text_body,media_id,status,sender_phone,recipient_phone,provider_timestamp,specialist_module_slug,metadata,created_at,updated_at';
  var IG_MSG_COLS = 'id,client_id,conversation_id,provider_message_id,direction,message_type,text_body,media_id,status,sender_instagram_user_id,recipient_instagram_user_id,provider_timestamp,specialist_module_slug,metadata,created_at,updated_at';

  /* multi: client_id may be stored as client_data.id (text) on older rows. */
  var TABLES = [
    { file: 'customers', table: 'customers', multi: true },
    { file: 'leads', table: 'leads' },
    { file: 'orders', table: 'orders', multi: true },
    { file: 'order_items', table: 'order_items' },
    { file: 'offers_products_services', table: 'offers' },
    { file: 'enquiries', table: 'enquiries', multi: true },
    { file: 'whatsapp_conversations', table: 'whatsapp_conversations' },
    { file: 'whatsapp_messages', table: 'whatsapp_messages', cols: WA_MSG_COLS },
    { file: 'instagram_conversations', table: 'instagram_conversations' },
    { file: 'instagram_messages', table: 'instagram_messages', cols: IG_MSG_COLS },
    { file: 'instagram_comments', table: 'instagram_comments' },
    { file: 'voice_conversations', table: 'voice_conversations' },
    { file: 'knowledge_items', table: 'client_knowledge_items' },
    { file: 'invoices', table: 'glime_billing_invoices' }
  ];

  var DOWNLOAD_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 19h16"/></svg>';

  var CSS =
    '.gas-download{display:flex;align-items:center;gap:12px;width:100%;min-height:42px;padding:9px 12px;' +
    'color:#00ff88;background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.25);border-radius:10px;' +
    'font:inherit;font-size:.84rem;font-weight:700;cursor:pointer;white-space:nowrap}' +
    '.gas-download:hover{background:rgba(0,255,136,.15)}' +
    '.gas-download[disabled]{opacity:.7;cursor:progress}' +
    '.gas-download:focus-visible{outline:2px solid #00ff88;outline-offset:2px}' +
    'body.gas-collapsed .gas-download{justify-content:center;padding-inline:0}';

  var running = false;
  var ownClient = null;

  /* ---------- Supabase client ---------- */
  function pageClient() {
    try {
      /* Pages declare `const supabaseClient`; classic scripts share that global scope. */
      if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) return supabaseClient;
    } catch (e) { /* not declared on this page */ }
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    return null;
  }

  function loadLib() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Could not load the data library.')); };
      document.head.appendChild(s);
    });
  }

  function getClient() {
    var existing = pageClient();
    if (existing) return Promise.resolve(existing);
    if (ownClient) return Promise.resolve(ownClient);
    return loadLib().then(function () {
      ownClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false }
      });
      return ownClient;
    });
  }

  /* ---------- Fetch helpers ---------- */
  function fetchAll(client, table, cols, applyFilter) {
    var rows = [];
    function next(page) {
      if (page >= MAX_PAGES) return Promise.resolve(rows);
      var q = client.from(table).select(cols || '*');
      q = applyFilter(q);
      return q.order('id', { ascending: true })
        .range(page * PAGE, (page + 1) * PAGE - 1)
        .then(function (res) {
          if (res.error) throw res.error;
          var data = res.data || [];
          for (var i = 0; i < data.length; i++) rows.push(data[i]);
          if (data.length < PAGE) return rows;
          return next(page + 1);
        });
    }
    return next(0);
  }

  function fetchVoiceMessages(client, conversationIds) {
    var all = [];
    var chunks = [];
    for (var i = 0; i < conversationIds.length; i += 100) {
      chunks.push(conversationIds.slice(i, i + 100));
    }
    return chunks.reduce(function (chain, chunk) {
      return chain.then(function () {
        return fetchAll(client, 'voice_messages', '*', function (q) {
          return q.in('conversation_id', chunk);
        }).then(function (rows) {
          for (var k = 0; k < rows.length; k++) all.push(rows[k]);
        });
      });
    }, Promise.resolve()).then(function () { return all; });
  }

  /* ---------- CSV ---------- */
  function cell(v) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=@]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows) {
    var headers = [];
    var seen = {};
    rows.forEach(function (row) {
      Object.keys(row).forEach(function (k) {
        if (!seen[k]) { seen[k] = true; headers.push(k); }
      });
    });
    var lines = [headers.map(cell).join(',')];
    rows.forEach(function (row) {
      lines.push(headers.map(function (h) { return cell(row[h]); }).join(','));
    });
    return '\ufeff' + lines.join('\r\n');
  }

  /* ---------- Minimal ZIP writer (store, no compression) ---------- */
  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZip(files) {
    var enc = new TextEncoder();
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    var parts = [];
    var central = [];
    var offset = 0;

    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = enc.encode(f.content);
      var crc = crc32(data);

      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);

      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);

      offset += 30 + name.length + data.length;
    });

    var centralSize = 0;
    central.forEach(function (c) { centralSize += c.length; });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------- Main flow ---------- */
  function notify(message) {
    window.alert(message);
  }

  function exportAll(setStatus) {
    var client;
    var ids = [];
    var clientKey = '';

    return getClient().then(function (c) {
      client = c;
      setStatus('Checking login…');
      return client.auth.getSession();
    }).then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session || !session.user) throw new Error('Please log in again to download your data.');
      return client.from('client_data')
        .select('id,client_id')
        .eq('auth_user_id', session.user.id)
        .limit(1);
    }).then(function (res) {
      if (res.error) throw res.error;
      var row = res.data && res.data[0];
      if (!row || !row.client_id) throw new Error('Your account could not be found.');
      clientKey = String(row.client_id);
      ids = [clientKey];
      if (row.id !== null && row.id !== undefined && String(row.id) !== clientKey) ids.push(String(row.id));

      var files = [];
      var report = [];
      var voiceConvIds = [];

      var chain = Promise.resolve();
      TABLES.forEach(function (spec, index) {
        chain = chain.then(function () {
          setStatus('Preparing ' + (index + 1) + '/' + (TABLES.length + 1) + '…');
          return fetchAll(client, spec.table, spec.cols, function (q) {
            return spec.multi ? q.in('client_id', ids) : q.eq('client_id', clientKey);
          }).then(function (rows) {
            if (spec.table === 'voice_conversations') {
              voiceConvIds = rows.map(function (r) { return r.id; });
            }
            report.push({ file: spec.file, count: rows.length, ok: true });
            if (rows.length) files.push({ name: spec.file + '.csv', content: toCsv(rows) });
          }).catch(function (err) {
            report.push({ file: spec.file, count: 0, ok: false, why: (err && err.message) || 'not available' });
          });
        });
      });

      chain = chain.then(function () {
        setStatus('Preparing ' + (TABLES.length + 1) + '/' + (TABLES.length + 1) + '…');
        if (!voiceConvIds.length) {
          report.push({ file: 'voice_messages', count: 0, ok: true });
          return;
        }
        return fetchVoiceMessages(client, voiceConvIds).then(function (rows) {
          report.push({ file: 'voice_messages', count: rows.length, ok: true });
          if (rows.length) files.push({ name: 'voice_messages.csv', content: toCsv(rows) });
        }).catch(function (err) {
          report.push({ file: 'voice_messages', count: 0, ok: false, why: (err && err.message) || 'not available' });
        });
      });

      return chain.then(function () {
        var failed = report.filter(function (r) { return !r.ok; });
        if (failed.length === report.length) {
          throw new Error('Your data could not be read right now. Please try again in a moment.');
        }
        var today = new Date().toISOString().slice(0, 10);
        var lines = [
          'GLIME - Your data export',
          'Client ID: ' + clientKey,
          'Exported on: ' + new Date().toISOString(),
          '',
          'Each .csv file opens in Excel or Google Sheets.',
          '',
          'Files and row counts:'
        ];
        report.forEach(function (r) {
          lines.push(' - ' + r.file + ': ' + (r.ok ? r.count + ' rows' + (r.count ? '' : ' (empty, no file)') : 'could not be exported (' + r.why + ')'));
        });
        files.unshift({ name: 'README.txt', content: lines.join('\r\n') });
        setStatus('Creating file…');
        saveBlob(buildZip(files), 'glime-data-' + clientKey + '-' + today + '.zip');
        return { failed: failed.length };
      });
    });
  }

  function onClick(btn) {
    if (running) return;
    running = true;
    var label = btn.querySelector('.gas-label');
    var original = label ? label.textContent : '';
    btn.disabled = true;
    function setStatus(text) { if (label) label.textContent = text; }

    exportAll(setStatus).then(function (result) {
      setStatus('Downloaded ✓');
      if (result && result.failed) {
        notify('Your data was downloaded, but ' + result.failed + ' section(s) could not be included. The README.txt inside the file lists them.');
      }
    }).catch(function (err) {
      console.error('[GLIME] data export failed:', err);
      setStatus(original);
      notify((err && err.message) || 'Download failed. Please try again.');
    }).then(function () {
      setTimeout(function () {
        setStatus(original);
        btn.disabled = false;
        running = false;
      }, 2500);
    });
  }

  /* ---------- Button in the sidebar ---------- */
  function addStyle() {
    if (document.getElementById('gasDownloadStyle')) return;
    var s = document.createElement('style');
    s.id = 'gasDownloadStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function addButton() {
    if (document.getElementById('gasDownload')) return true;
    var logout = document.getElementById('gasLogout');
    if (!logout || !logout.parentNode) return false;
    addStyle();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'gasDownload';
    btn.className = 'gas-download';
    btn.setAttribute('title', 'Download all your data');
    btn.innerHTML = DOWNLOAD_ICON + '<span class="gas-label">Download My Data</span>';
    btn.addEventListener('click', function () { onClick(btn); });
    logout.parentNode.insertBefore(btn, logout);
    return true;
  }

  window.GlimeDataExport = { start: function () { var b = document.getElementById('gasDownload'); if (b) onClick(b); } };

  function boot() {
    if (addButton()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (addButton() || tries > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
