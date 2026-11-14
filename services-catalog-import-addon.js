/* =========================================================
   GLIME — SERVICES CATALOGUE IMPORT ADDON
   ---------------------------------------------------------
   Lets a client add a whole catalogue at once instead of one
   service at a time.

   1) Excel / CSV  (recommended, uses NO AI tokens)
      - downloadable template, tolerant column names
      - photos: links in the sheet, or photo files named like
        the service
   2) PDF / photo  (GLIME AI reads it, USES AI TOKENS)
      - clear English warning + confirmation before any call
      - edge function: services-catalog-import (billed to the
        client's own AI credits)

   Both end in the same review screen; the client can edit or
   untick rows, then everything is created as DRAFT services
   (optionally published straight away).

   Storage = the same tables the Services wizard uses:
   offers, offer_versions, offer_prices, offer_media,
   offer_categories. No schema changes.

   Load order: after services.js and the other services addons.
========================================================= */
(function () {
  'use strict';

  if (typeof state === 'undefined' || typeof supabaseClient === 'undefined') {
    console.error('[GLIME IMPORT] Core services context is unavailable.');
    return;
  }

  var BUCKET = 'client-assets';
  var MAX_ROWS = 500;
  var MAX_SHEET_BYTES = 5 * 1024 * 1024;
  var AI_MAX_FILES = 8;
  var AI_MAX_BYTES = 10 * 1024 * 1024;
  var MAX_PHOTOS_PER_ROW = 5;
  var CONCURRENCY = 4;
  var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  var byId = function (id) { return document.getElementById(id); };

  /* =======================================================
     STATE
  ======================================================= */

  var S = fresh();

  function fresh() {
    return {
      stage: 'choose',     // choose | reading | preview | running | done
      method: '',          // sheet | ai
      rows: [],
      aiFiles: [],
      photos: [],
      aiTokens: 0,
      aiNote: '',
      defaultType: 'service',
      defaultCategory: '',
      publish: false,
      busy: false,
      alert: '',
      progress: { done: 0, total: 0 },
      result: null,
      sheetNote: ''
    };
  }

  /* =======================================================
     SMALL HELPERS
  ======================================================= */

  function randomId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (_) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function hkey(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  /* keeps Devanagari so Hindi names still match */
  function nameKey(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, '');
  }

  function fileBase(name) {
    return String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '');
  }

  function safeFileName(name) {
    var clean = String(name || 'photo')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
    return clean || 'photo';
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  var xlsxPromise = null;

  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxPromise) {
      xlsxPromise = loadScript(XLSX_URL).then(function () { return window.XLSX; }).catch(function (e) {
        xlsxPromise = null;
        throw e;
      });
    }
    return xlsxPromise;
  }

  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read the file.')); };
      r.readAsArrayBuffer(file);
    });
  }

  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('Could not read the file.')); };
      r.readAsText(file);
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result || '');
        var i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = function () { reject(new Error('Could not read the file.')); };
      r.readAsDataURL(blob);
    });
  }

  /* Downscale big phone photos: smaller upload, fewer AI tokens. */
  async function shrinkImage(file, maxDim, quality) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
    if (file.size < 600 * 1024) return file;

    try {
      var bmp = await createImageBitmap(file);
      var scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      var w = Math.max(1, Math.round(bmp.width * scale));
      var h = Math.max(1, Math.round(bmp.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();

      var blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, 'image/jpeg', quality);
      });

      if (blob && blob.size < file.size) return blob;
    } catch (e) {
      console.warn('[GLIME IMPORT] image shrink skipped:', e);
    }

    return file;
  }

  /* =======================================================
     COLUMN ALIASES (Excel / CSV)
  ======================================================= */

  var ALIASES = {
    name: ['name', 'servicename', 'service', 'productname', 'product', 'itemname', 'item', 'title', 'offering', 'servicetitle', 'producttitle'],
    price: ['price', 'amount', 'rate', 'cost', 'sellingprice', 'saleprice', 'fee', 'fees', 'charges', 'priceinr', 'pricerupees', 'rs', 'inr'],
    description: ['description', 'details', 'fulldescription', 'about', 'desc', 'longdescription'],
    short: ['shortdescription', 'shortdesc', 'summary', 'tagline', 'shortdetails'],
    category: ['category', 'categoryname', 'group', 'section', 'collection'],
    type: ['type', 'catalogtype', 'itemtype', 'kind'],
    currency: ['currency', 'curr'],
    price_type: ['pricetype'],
    price_max: ['pricemax', 'maxprice', 'maximumprice', 'priceto', 'maxamount'],
    billing: ['billingperiod', 'billing', 'period', 'recurring'],
    duration: ['duration', 'durationminutes', 'minutes', 'durationmin', 'durationinminutes'],
    photos: ['photos', 'photo', 'image', 'images', 'imageurl', 'imageurls', 'picture', 'pictures', 'img', 'photourl', 'photourls', 'media', 'imagelink', 'imagelinks']
  };

  function mapColumns(headerRow) {
    var map = {};
    var used = {};

    Object.keys(ALIASES).forEach(function (field) {
      for (var i = 0; i < headerRow.length; i++) {
        if (used[i]) continue;
        if (ALIASES[field].indexOf(hkey(headerRow[i])) !== -1) {
          map[field] = i;
          used[i] = true;
          break;
        }
      }
    });

    return map;
  }

  /* =======================================================
     PARSING
  ======================================================= */

  function parseCsv(text) {
    text = String(text || '').replace(/^\uFEFF/, '');

    var first = text.split(/\r?\n/, 1)[0] || '';
    var delim = ',';
    var best = -1;

    [',', ';', '\t'].forEach(function (d) {
      var n = first.split(d).length;
      if (n > best) { best = n; delim = d; }
    });

    var rows = [];
    var row = [];
    var cell = '';
    var inq = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inq) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else { inq = false; }
        } else {
          cell += c;
        }
      } else if (c === '"') {
        inq = true;
      } else if (c === delim) {
        row.push(cell);
        cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        cell = '';
        rows.push(row);
        row = [];
      } else {
        cell += c;
      }
    }

    if (cell !== '' || row.length) {
      row.push(cell);
      rows.push(row);
    }

    return rows;
  }

  async function readSheetFile(file) {
    var name = String(file.name || '').toLowerCase();

    if (/\.csv$|\.txt$/.test(name) || file.type === 'text/csv') {
      return parseCsv(await readAsText(file));
    }

    if (/\.xlsx$|\.xls$|\.xlsm$/.test(name)) {
      var lib;

      try {
        lib = await ensureXlsx();
      } catch (e) {
        throw new Error('Excel reader could not be loaded. Please check your internet, or save the file as CSV and upload that.');
      }

      var wb = lib.read(await readAsArrayBuffer(file), { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];

      if (!ws) throw new Error('The Excel file has no sheets.');

      return lib.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    }

    throw new Error('Please upload an Excel (.xlsx, .xls) or CSV file.');
  }

  function cleanPrice(v) {
    if (v == null) return '';
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? String(v) : '';

    var s = String(v).trim();
    if (!s) return '';

    s = s.replace(/₹|rs\.?|inr|\/-|\$|usd/gi, '').replace(/,/g, '').trim();

    var m = s.match(/-?\d+(\.\d+)?/);
    return m ? m[0] : '';
  }

  function normPriceType(v) {
    var s = String(v || '').toLowerCase().replace(/[^a-z]+/g, '');
    if (!s) return '';
    if (s === 'range') return 'range';
    if (/start|from|onward/.test(s)) return 'starting_from';
    if (s === 'fixed') return 'fixed';
    return '';
  }

  function normCurrency(v) {
    var s = String(v || '').toLowerCase();
    if (/usd|\$|dollar/.test(s)) return 'USD';
    return 'INR';
  }

  function normBilling(v) {
    var s = String(v || '').toLowerCase();
    if (/month/.test(s)) return 'monthly';
    if (/year|annual/.test(s)) return 'yearly';
    return '';
  }

  function typeKeys() {
    return (state.types || []).map(function (t) { return t.type_key; });
  }

  function normType(v) {
    var s = hkey(v);
    if (!s) return '';

    var found = (state.types || []).find(function (t) {
      return hkey(t.type_key) === s || hkey(t.label) === s;
    });

    return found ? found.type_key : '';
  }

  function splitPhotos(v) {
    return String(v || '')
      .split(/[\s,;|]+/)
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }

  function rowFromRaw(raw) {
    var r = {
      id: randomId(),
      include: true,
      name: String(raw.name || '').trim().slice(0, 120),
      price: cleanPrice(raw.price),
      price_max: cleanPrice(raw.price_max),
      price_type: normPriceType(raw.price_type),
      currency: normCurrency(raw.currency),
      billing: normBilling(raw.billing),
      category: String(raw.category || '').trim().slice(0, 60),
      type: normType(raw.type),
      short: String(raw.short || '').trim().slice(0, 300),
      description: String(raw.description || '').trim().slice(0, 4000),
      duration: cleanPrice(raw.duration),
      photos: splitPhotos(raw.photos),
      issues: [],
      valid: true,
      dup: false
    };

    /* "500-800" typed into the price cell */
    if (!r.price_max && /\d\s*(?:-|–|to)\s*\d/i.test(String(raw.price || ''))) {
      var nums = String(raw.price).replace(/,/g, '').match(/\d+(\.\d+)?/g) || [];
      if (nums.length >= 2 && Number(nums[1]) > Number(nums[0])) {
        r.price = nums[0];
        r.price_max = nums[1];
        if (!r.price_type) r.price_type = 'range';
      }
    }

    if (!r.price_type) r.price_type = r.price_max ? 'range' : 'fixed';

    return r;
  }

  function matrixToRows(matrix) {
    var data = (matrix || []).filter(function (r) {
      return Array.isArray(r) && r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; });
    });

    if (!data.length) return { rows: [], error: 'The file is empty.' };

    var headerIdx = 0;

    for (var i = 0; i < Math.min(10, data.length); i++) {
      var m = mapColumns(data[i]);
      if (m.name !== undefined) { headerIdx = i; break; }
    }

    var map = mapColumns(data[headerIdx]);

    if (map.name === undefined) {
      return {
        rows: [],
        error: 'Could not find a "name" column. Please use the template: the first row must have headings like name, price, description.'
      };
    }

    var out = [];
    var cut = false;

    for (var k = headerIdx + 1; k < data.length; k++) {
      if (out.length >= MAX_ROWS) { cut = true; break; }

      var line = data[k];
      var raw = {};

      Object.keys(map).forEach(function (f) {
        raw[f] = line[map[f]];
      });

      if (!String(raw.name == null ? '' : raw.name).trim() && !String(raw.price == null ? '' : raw.price).trim()) continue;

      out.push(rowFromRaw(raw));
    }

    return { rows: out, cut: cut, missing: map.price === undefined ? 'No "price" column was found. Items will be created without a price.' : '' };
  }

  function rowsFromAi(items) {
    return (items || []).map(function (x) {
      return rowFromRaw({
        name: x.name,
        price: x.price == null ? '' : x.price,
        price_max: x.price_max == null ? '' : x.price_max,
        price_type: x.price_type,
        currency: x.currency,
        billing: x.billing_period,
        category: x.category,
        short: x.short_description,
        description: x.description,
        duration: x.duration_minutes == null ? '' : x.duration_minutes,
        photos: ''
      });
    });
  }

  /* =======================================================
     VALIDATION / DUPLICATES / PHOTOS
  ======================================================= */

  function existingNames() {
    var set = new Set();
    (state.services || []).forEach(function (s) { set.add(nameKey(s.name)); });
    return set;
  }

  function validateAll() {
    var existing = existingNames();
    var seen = new Set();

    S.rows.forEach(function (r) {
      var k = nameKey(r.name);
      r.dup = false;

      if (k) {
        if (existing.has(k)) r.dup = 'exists';
        else if (seen.has(k)) r.dup = 'repeat';
        seen.add(k);
      }

      validateRow(r);
    });
  }

  function validateRow(r) {
    var issues = [];
    var valid = true;

    if (!String(r.name).trim()) {
      issues.push({ t: 'Name is missing', c: 'bad' });
      valid = false;
    }

    if (r.price !== '') {
      var p = Number(r.price);
      if (!isFinite(p) || p < 0) {
        issues.push({ t: 'Price is not a valid number', c: 'bad' });
        valid = false;
      }
    } else {
      issues.push({ t: 'No price: will be saved as a draft without a price', c: 'warn' });
    }

    if (r.price_type === 'range' && valid && r.price !== '') {
      var mx = Number(r.price_max);
      if (!isFinite(mx) || mx <= Number(r.price)) {
        issues.push({ t: 'Maximum price missing: will be saved as "starting from"', c: 'warn' });
      }
    }

    if (!String(r.description).trim() && !String(r.short).trim()) {
      issues.push({ t: 'No description yet', c: 'info' });
    }

    if (r.dup === 'exists') issues.push({ t: 'Already in your catalogue', c: 'warn' });
    if (r.dup === 'repeat') issues.push({ t: 'Repeated in this file', c: 'warn' });

    r.issues = issues;
    r.valid = valid;
  }

  function photoIndex() {
    var byName = new Map();
    S.photos.forEach(function (f) { byName.set(String(f.name).toLowerCase(), f); });
    return byName;
  }

  function photosFor(r, byName) {
    var out = [];
    var seen = new Set();

    function add(item) {
      if (!item || seen.has(item.id) || out.length >= MAX_PHOTOS_PER_ROW) return;
      seen.add(item.id);
      out.push(item);
    }

    (r.photos || []).forEach(function (tok) {
      if (/^https?:\/\//i.test(tok)) {
        add({ id: tok, url: tok });
        return;
      }
      var f = byName.get(String(tok).toLowerCase());
      if (f) add({ id: 'f:' + f.name + ':' + f.size, file: f });
    });

    var rk = nameKey(r.name);

    if (rk) {
      S.photos
        .slice()
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
        .forEach(function (f) {
          var k = nameKey(fileBase(f.name));
          var k2 = k.replace(/\d+$/, '');
          if (k === rk || k2 === rk) add({ id: 'f:' + f.name + ':' + f.size, file: f });
        });
    }

    return out;
  }

  function photoMatchCount() {
    var by = photoIndex();
    var n = 0;
    S.rows.forEach(function (r) {
      if (r.include && r.valid && photosFor(r, by).length) n++;
    });
    return n;
  }

  /* =======================================================
     TEMPLATE
  ======================================================= */

  var TEMPLATE_HEAD = ['name', 'price', 'description', 'short_description', 'category', 'type', 'currency', 'price_type', 'price_max', 'billing_period', 'duration_minutes', 'photos'];

  var TEMPLATE_ROWS = [
    ['Bridal Makeup', 15000, 'Full bridal makeup with hairstyling and draping.', 'Complete bridal look', 'Bridal', 'service', 'INR', 'starting_from', '', '', 180, 'bridal-makeup.jpg'],
    ['Monthly Yoga Plan', 1999, 'Daily group classes with a certified trainer.', 'Unlimited group classes', 'Fitness', 'membership', 'INR', 'fixed', '', 'monthly', '', 'https://example.com/yoga.jpg']
  ];

  async function downloadTemplate() {
    try {
      var lib = await ensureXlsx();
      var wb = lib.utils.book_new();

      var sheet = lib.utils.aoa_to_sheet([TEMPLATE_HEAD].concat(TEMPLATE_ROWS));
      sheet['!cols'] = TEMPLATE_HEAD.map(function (h) { return { wch: Math.max(14, h.length + 4) }; });
      lib.utils.book_append_sheet(wb, sheet, 'Catalogue');

      var help = lib.utils.aoa_to_sheet([
        ['Column', 'What to write'],
        ['name', 'Required. The name customers know.'],
        ['price', 'Number only, e.g. 1500. Leave empty if not fixed yet.'],
        ['description', 'Full description (optional, but your AI answers better with it).'],
        ['short_description', 'One line (optional).'],
        ['category', 'Any category name. New categories are created for you.'],
        ['type', 'service, product, course, appointment, rental, membership or package (optional).'],
        ['currency', 'INR or USD (optional, default INR).'],
        ['price_type', 'fixed, starting_from or range (optional).'],
        ['price_max', 'Only for range prices: the highest price.'],
        ['billing_period', 'monthly or yearly for recurring items, otherwise empty.'],
        ['duration_minutes', 'Minutes, e.g. 60 (optional).'],
        ['photos', 'Photo links (https://...) or photo file names, separated by commas. You can also name photo files like the service and add them in the next step.']
      ]);
      help['!cols'] = [{ wch: 20 }, { wch: 90 }];
      lib.utils.book_append_sheet(wb, help, 'How to fill');

      lib.writeFile(wb, 'GLIME-catalogue-template.xlsx');
    } catch (e) {
      console.warn('[GLIME IMPORT] xlsx template unavailable, using CSV:', e);

      var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      var csv = '\uFEFF' + [TEMPLATE_HEAD].concat(TEMPLATE_ROWS).map(function (r) { return r.map(q).join(','); }).join('\r\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'GLIME-catalogue-template.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    }
  }

  /* =======================================================
     AI READ (PDF / photo)
  ======================================================= */

  function aiTotalBytes() {
    return S.aiFiles.reduce(function (n, f) { return n + f.size; }, 0);
  }

  function addAiFiles(list) {
    var ok = /^(application\/pdf|image\/(jpeg|png|webp))$/i;
    var skipped = 0;

    Array.prototype.forEach.call(list || [], function (f) {
      if (!ok.test(f.type)) { skipped++; return; }
      if (S.aiFiles.length >= AI_MAX_FILES) { skipped++; return; }
      S.aiFiles.push(f);
    });

    S.alert = skipped ? skipped + ' file(s) skipped. Use PDF, JPG, PNG or WEBP, up to ' + AI_MAX_FILES + ' files.' : '';
    renderAiList();
  }

  async function runAi() {
    if (S.busy) return;

    var ack = byId('ciAck');

    if (!ack || !ack.checked) {
      S.alert = 'Please tick the box to confirm that AI tokens will be used.';
      paintAlert();
      return;
    }

    if (!S.aiFiles.length) {
      S.alert = 'Please add a PDF or photo first.';
      paintAlert();
      return;
    }

    if (aiTotalBytes() > AI_MAX_BYTES) {
      S.alert = 'The files are larger than ' + fmtBytes(AI_MAX_BYTES) + '. Please upload fewer pages or smaller photos.';
      paintAlert();
      return;
    }

    S.busy = true;
    S.alert = '';
    S.stage = 'reading';
    render();

    try {
      var payload = [];

      for (var i = 0; i < S.aiFiles.length; i++) {
        var f = S.aiFiles[i];
        var blob = f.type === 'application/pdf' ? f : await shrinkImage(f, 2200, 0.85);
        var mime = blob === f ? f.type : 'image/jpeg';

        payload.push({ name: f.name, mime: mime, data: await blobToBase64(blob) });
      }

      var j = await edge('services-catalog-import', { files: payload });

      var items = Array.isArray(j.items) ? j.items : [];

      S.aiTokens = Number(j.tokens || 0);
      S.aiNote = j.truncated
        ? 'The catalogue was long, so the last items may be missing. Upload fewer pages at a time to get everything.'
        : '';

      if (!items.length) {
        S.busy = false;
        S.stage = 'choose';
        S.alert = 'No services were found in these files. Try a clearer photo or PDF, or use the Excel / CSV import.';
        render();
        return;
      }

      S.method = 'ai';
      S.rows = rowsFromAi(items);
      S.busy = false;
      S.stage = 'preview';
      validateAll();

      /* items already in the catalogue start unticked */
      S.rows.forEach(function (r) { if (r.dup) r.include = false; });

      render();
    } catch (e) {
      console.error(e);
      S.busy = false;
      S.stage = 'choose';
      S.alert = (e && e.message) || 'The AI could not read these files.';
      render();
    }
  }

  /* =======================================================
     SHEET LOAD
  ======================================================= */

  async function handleSheet(file) {
    if (!file) return;

    if (file.size > MAX_SHEET_BYTES) {
      S.alert = 'This file is larger than ' + fmtBytes(MAX_SHEET_BYTES) + '. Please split it into smaller files.';
      paintAlert();
      return;
    }

    S.alert = '';
    S.busy = true;
    S.stage = 'reading';
    render();

    try {
      var matrix = await readSheetFile(file);
      var res = matrixToRows(matrix);

      S.busy = false;

      if (res.error || !res.rows.length) {
        S.stage = 'choose';
        S.alert = res.error || 'No items were found in this file.';
        render();
        return;
      }

      S.method = 'sheet';
      S.rows = res.rows;
      S.aiTokens = 0;
      S.aiNote = '';
      S.sheetNote = [
        res.cut ? 'Only the first ' + MAX_ROWS + ' rows were read.' : '',
        res.missing || ''
      ].filter(Boolean).join(' ');
      S.stage = 'preview';
      validateAll();
      S.rows.forEach(function (r) { if (r.dup) r.include = false; });
      render();
    } catch (e) {
      console.error(e);
      S.busy = false;
      S.stage = 'choose';
      S.alert = (e && e.message) || 'This file could not be read.';
      render();
    }
  }

  /* =======================================================
     IMPORT
  ======================================================= */

  async function pool(items, size, fn) {
    var i = 0;

    var workers = [];
    for (var w = 0; w < Math.min(size, items.length); w++) {
      workers.push((async function () {
        while (i < items.length) {
          var idx = i++;
          await fn(items[idx], idx);
        }
      })());
    }

    await Promise.all(workers);
  }

  async function resolveCategories(rows) {
    var map = new Map();

    (state.categories || []).forEach(function (c) { map.set(String(c.name).toLowerCase(), c.id); });

    var needed = [];
    var seen = new Set();

    rows.forEach(function (r) {
      var n = String(r.category || '').trim();
      var k = n.toLowerCase();
      if (n && !map.has(k) && !seen.has(k)) { seen.add(k); needed.push(n); }
    });

    if (!needed.length) return map;

    var base = (state.categories || []).length;

    var ins = await supabaseClient
      .from('offer_categories')
      .insert(needed.map(function (n, i) {
        return {
          client_id: state.client.client_id,
          name: n,
          slug: (slugify(n) || 'category') + '-' + Math.random().toString(36).slice(2, 6),
          sort_order: base + i,
          is_active: true,
          is_global: false
        };
      }))
      .select('id,name');

    if (ins.error) throw ins.error;

    (ins.data || []).forEach(function (c) { map.set(String(c.name).toLowerCase(), c.id); });

    return map;
  }

  async function uploadPhoto(file, offerId, versionId) {
    var blob = await shrinkImage(file, 1600, 0.85);
    var type = blob === file ? (file.type || 'image/jpeg') : 'image/jpeg';
    var name = blob === file ? file.name : fileBase(file.name) + '.jpg';

    var path = [state.client.client_id, 'offers', offerId, versionId, randomId() + '-' + safeFileName(name)].join('/');

    var up = await supabaseClient.storage.from(BUCKET).upload(path, blob, {
      cacheControl: '3600',
      contentType: type,
      upsert: false
    });

    if (up.error) throw up.error;

    return { path: path, mime: type, size: blob.size, original: file.name };
  }

  async function importRow(r, ctx) {
    var type = r.type || S.defaultType || 'service';
    var name = r.name.trim().slice(0, 120);

    var catId = r.category
      ? (ctx.catMap.get(r.category.toLowerCase()) || null)
      : (S.defaultCategory || null);

    var offerId = null;

    try {
      var o = await supabaseClient
        .from('offers')
        .insert({
          client_id: state.client.client_id,
          offer_type: type,
          name: name,
          slug: (slugify(name) || 'service') + '-' + Math.random().toString(36).slice(2, 8),
          short_description: r.short || null,
          description: r.description || null,
          category_id: catId,
          status: 'draft',
          current_version_id: null
        })
        .select('id')
        .single();

      if (o.error) throw o.error;
      offerId = o.data.id;

      var metadata = {};
      var dur = Number(r.duration);

      if (r.duration !== '' && isFinite(dur) && dur > 0) {
        metadata.offer_details = { schema: 1, blocks: {}, duration_minutes: dur, faqs: [], facts: [] };
      }

      var v = await supabaseClient
        .from('offer_versions')
        .insert({
          offer_id: offerId,
          version_number: 1,
          status: 'draft',
          title: name,
          description: r.description || r.short || null,
          metadata: metadata
        })
        .select('id')
        .single();

      if (v.error) throw v.error;
      var versionId = v.data.id;

      if (r.price !== '') {
        var amount = Number(r.price);
        var mx = Number(r.price_max);
        var ptype = r.price_type === 'range'
          ? (isFinite(mx) && mx > amount ? 'range' : 'starting_from')
          : (r.price_type === 'starting_from' ? 'starting_from' : 'fixed');

        var p = await supabaseClient.from('offer_prices').insert({
          offer_version_id: versionId,
          amount: amount,
          currency: r.currency === 'USD' ? 'USD' : 'INR',
          price_type: ptype,
          min_amount: ptype === 'range' ? amount : null,
          max_amount: ptype === 'range' ? mx : null,
          billing_period: r.billing || null,
          is_active: true
        });

        if (p.error) throw p.error;
      }

      var mediaNote = '';
      var photos = photosFor(r, ctx.photoIdx);

      if (photos.length) {
        var rows = [];

        for (var i = 0; i < photos.length; i++) {
          var ph = photos[i];

          if (ph.url) {
            rows.push({
              offer_version_id: versionId,
              media_type: 'image',
              storage_path: null,
              file_url: ph.url,
              alt_text: name,
              sort_order: i,
              is_primary: i === 0,
              metadata: { source: 'catalogue_import' }
            });
          } else {
            try {
              var u = await uploadPhoto(ph.file, offerId, versionId);

              rows.push({
                offer_version_id: versionId,
                media_type: 'image',
                storage_path: u.path,
                file_url: null,
                alt_text: name,
                sort_order: i,
                is_primary: i === 0,
                metadata: { original_name: u.original, mime_type: u.mime, size_bytes: u.size, source: 'catalogue_import' }
              });
            } catch (e) {
              mediaNote = 'some photos could not be uploaded';
              console.warn('[GLIME IMPORT] photo upload failed:', e);
            }
          }
        }

        if (rows.length) {
          /* the first kept photo must be the primary one */
          rows.forEach(function (x, idx) { x.is_primary = idx === 0; x.sort_order = idx; });

          var m = await supabaseClient.from('offer_media').insert(rows);
          if (m.error) { mediaNote = 'photos could not be saved'; console.warn(m.error); }
        }
      }

      var published = false;
      var publishNote = '';

      if (S.publish) {
        var canPublish = r.price !== '' && String(r.description || r.short).trim() !== '';

        if (!canPublish) {
          publishNote = 'kept as draft (needs a price and a description to publish)';
        } else {
          try {
            var sub = await supabaseClient.rpc('client_submit_offer_version_for_review', { p_version_id: versionId });
            if (sub.error) throw sub.error;

            var apr = await supabaseClient.rpc('client_approve_offer_version', { p_version_id: versionId, p_notes: 'Client approved from catalogue import.' });
            if (apr.error) throw apr.error;

            var pub = await supabaseClient.rpc('client_publish_offer_version', { p_version_id: versionId });
            if (pub.error) throw pub.error;

            published = true;
          } catch (e) {
            publishNote = 'saved as draft, publish failed: ' + ((e && e.message) || 'unknown error');
          }
        }
      }

      return { ok: true, name: name, published: published, note: [mediaNote, publishNote].filter(Boolean).join('; ') };
    } catch (e) {
      /* do not leave a half-created service behind */
      if (offerId) {
        try { await supabaseClient.rpc('client_delete_offer', { p_offer_id: offerId }); } catch (_) {}
      }

      return { ok: false, name: name, error: (e && e.message) || 'could not be saved' };
    }
  }

  async function runImport() {
    if (S.busy) return;

    var picked = S.rows.filter(function (r) { return r.include && r.valid; });

    if (!picked.length) {
      S.alert = 'Tick at least one valid service to import.';
      paintAlert();
      return;
    }

    S.busy = true;
    S.alert = '';
    S.stage = 'running';
    S.progress = { done: 0, total: picked.length };
    render();

    var results = [];

    try {
      var catMap = await resolveCategories(picked);
      var ctx = { catMap: catMap, photoIdx: photoIndex() };

      await pool(picked, CONCURRENCY, async function (row) {
        results.push(await importRow(row, ctx));
        S.progress.done++;
        paintProgress();
      });
    } catch (e) {
      console.error(e);
      S.alert = (e && e.message) || 'Import stopped unexpectedly.';
    }

    S.busy = false;

    var okRows = results.filter(function (x) { return x.ok; });

    S.result = {
      created: okRows.length,
      published: okRows.filter(function (x) { return x.published; }).length,
      failed: results.filter(function (x) { return !x.ok; }),
      notes: okRows.filter(function (x) { return x.note; })
    };

    S.stage = 'done';
    render();

    try {
      await loadCategories();
      await loadServices();
      renderAll();
    } catch (e) {
      console.warn('[GLIME IMPORT] catalogue refresh failed:', e);
    }

    if (S.result.created) {
      toast(S.result.created + ' service' + (S.result.created === 1 ? '' : 's') + ' imported', 'ok');
    }
  }

  /* =======================================================
     DOM + RENDER
  ======================================================= */

  var ov = null;

  function injectStyles() {
    if (byId('glimeImportStyles')) return;

    var st = document.createElement('style');
    st.id = 'glimeImportStyles';
    st.textContent = [
      '.ci-overlay{position:fixed;inset:0;z-index:9000;background:rgba(2,5,9,.78);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center}',
      '.ci-overlay.hidden{display:none}',
      '.ci-sheet{width:100%;max-width:820px;height:100%;max-height:100%;background:#0b111a;color:#fff;display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.12);font-family:inherit}',
      '@media(min-width:760px){.ci-overlay{align-items:center}.ci-sheet{height:auto;max-height:92vh;border-radius:22px}}',
      '.ci-head{display:flex;align-items:flex-start;gap:12px;padding:18px 18px 12px;border-bottom:1px solid rgba(255,255,255,.1)}',
      '.ci-head h2{margin:2px 0 4px;font-size:1.25rem;line-height:1.25}',
      '.ci-head p{margin:0;font-size:.82rem;color:rgba(255,255,255,.72);line-height:1.45}',
      '.ci-kicker{font-size:.68rem;font-weight:800;letter-spacing:.16em;color:#00f0ff}',
      '.ci-x{margin-left:auto;flex:none;width:42px;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);color:#fff;font-size:1.4rem;line-height:1;cursor:pointer}',
      '.ci-x:disabled{opacity:.4;cursor:not-allowed}',
      '.ci-body{flex:1;overflow:auto;padding:16px 18px;-webkit-overflow-scrolling:touch}',
      '.ci-foot{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap;padding:12px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.1);background:#0b111a}',
      '.ci-foot .ci-count{margin-right:auto;font-size:.82rem;color:rgba(255,255,255,.78)}',
      '.ci-grid{display:grid;grid-template-columns:1fr;gap:14px}',
      '@media(min-width:760px){.ci-grid{grid-template-columns:1fr 1fr}}',
      '.ci-card{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.ci-card h3{margin:0;font-size:1.05rem}',
      '.ci-card p{margin:0;font-size:.84rem;line-height:1.5;color:rgba(255,255,255,.8)}',
      '.ci-badge{align-self:flex-start;font-size:.68rem;font-weight:800;letter-spacing:.06em;padding:4px 9px;border-radius:999px}',
      '.ci-badge.ok{background:rgba(0,255,136,.14);color:#00ff88;border:1px solid rgba(0,255,136,.4)}',
      '.ci-badge.warn{background:rgba(255,184,0,.14);color:#ffc83d;border:1px solid rgba(255,184,0,.45)}',
      '.ci-btn{min-height:46px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:transparent;color:#fff;font-weight:700;font-size:.9rem;cursor:pointer;font-family:inherit}',
      '.ci-btn.primary{border:0;background:linear-gradient(135deg,#00ff88,#00f0ff);color:#061016;font-weight:800}',
      '.ci-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.ci-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:92px;padding:14px;border:1.5px dashed rgba(255,255,255,.3);border-radius:14px;text-align:center;cursor:pointer;background:rgba(255,255,255,.02)}',
      '.ci-drop b{font-size:.92rem}.ci-drop span{font-size:.78rem;color:rgba(255,255,255,.7)}',
      '.ci-drop.drag{border-color:#00f0ff;background:rgba(0,240,255,.07)}',
      '.ci-warn{border:1px solid rgba(255,184,0,.55);background:rgba(255,184,0,.1);color:#fff;border-radius:12px;padding:12px;font-size:.82rem;line-height:1.55}',
      '.ci-warn b{color:#ffc83d}',
      '.ci-check{display:flex;gap:10px;align-items:flex-start;font-size:.84rem;line-height:1.45;cursor:pointer}',
      '.ci-check input{width:20px;height:20px;margin-top:1px;flex:none;accent-color:#00ff88}',
      '.ci-files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}',
      '.ci-files li{display:flex;align-items:center;gap:8px;font-size:.8rem;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05)}',
      '.ci-files li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ci-files button{border:0;background:transparent;color:#ff6472;font-size:1.1rem;cursor:pointer;padding:2px 6px}',
      '.ci-alert{margin:0 0 12px;padding:11px 13px;border-radius:12px;font-size:.84rem;line-height:1.45;border:1px solid rgba(255,100,114,.5);background:rgba(255,100,114,.1)}',
      '.ci-alert:empty{display:none}',
      '.ci-note{margin:0 0 12px;padding:10px 12px;border-radius:12px;font-size:.8rem;line-height:1.45;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04);color:rgba(255,255,255,.86)}',
      '.ci-note.warn{border-color:rgba(255,184,0,.5);background:rgba(255,184,0,.09)}',
      '.ci-opts{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:14px}',
      '@media(min-width:640px){.ci-opts{grid-template-columns:1fr 1fr}}',
      '.ci-field{display:flex;flex-direction:column;gap:5px;font-size:.78rem;color:rgba(255,255,255,.78)}',
      '.ci-field select,.ci-field input[type=text],.ci-field input[type=number],.ci-field input[type=tel]{min-height:44px;border-radius:11px;border:1px solid rgba(255,255,255,.2);background:#101823;color:#fff;padding:0 12px;font-size:.92rem;font-family:inherit;width:100%;box-sizing:border-box}',
      '.ci-bar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:4px 0 10px;font-size:.82rem;color:rgba(255,255,255,.8)}',
      '.ci-link{border:0;background:transparent;color:#00f0ff;font-weight:700;font-size:.82rem;cursor:pointer;padding:6px 0;font-family:inherit}',
      '.ci-rows{display:flex;flex-direction:column;gap:10px}',
      '.ci-row{border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px;background:rgba(255,255,255,.03);display:grid;grid-template-columns:auto 1fr;gap:10px 12px}',
      '.ci-row.off{opacity:.55}',
      '.ci-row.bad{border-color:rgba(255,100,114,.55)}',
      '.ci-row>input[type=checkbox]{width:22px;height:22px;margin-top:10px;accent-color:#00ff88}',
      '.ci-fields{display:grid;grid-template-columns:1fr;gap:8px;min-width:0}',
      '@media(min-width:640px){.ci-fields{grid-template-columns:1fr 150px}}',
      '.ci-meta{grid-column:2;display:flex;flex-wrap:wrap;gap:6px;font-size:.72rem}',
      '.ci-chip{padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.86)}',
      '.ci-chip.bad{background:rgba(255,100,114,.16);color:#ff8f9a}',
      '.ci-chip.warn{background:rgba(255,184,0,.15);color:#ffc83d}',
      '.ci-chip.info{background:rgba(0,240,255,.1);color:#7be9ff}',
      '.ci-center{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:36px 8px}',
      '.ci-spin{width:46px;height:46px;border-radius:50%;border:4px solid rgba(255,255,255,.16);border-top-color:#00f0ff;animation:ciSpin 0.9s linear infinite}',
      '@keyframes ciSpin{to{transform:rotate(360deg)}}',
      '.ci-prog{width:100%;max-width:420px;height:10px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden}',
      '.ci-prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#00ff88,#00f0ff);transition:width .25s}',
      '.ci-done h3{margin:0;font-size:1.3rem}',
      '.ci-list{margin:8px 0 0;padding-left:18px;font-size:.82rem;line-height:1.6;color:rgba(255,255,255,.85);text-align:left}',
      '.ci-top-btn{display:inline-flex;align-items:center;gap:6px}'
    ].join('\n');

    document.head.appendChild(st);
  }

  function ensureDom() {
    if (ov) return;

    injectStyles();

    ov = document.createElement('div');
    ov.id = 'catalogImportOverlay';
    ov.className = 'ci-overlay hidden';
    ov.innerHTML =
      '<section class="ci-sheet" role="dialog" aria-modal="true" aria-labelledby="ciTitle">' +
        '<header class="ci-head">' +
          '<div><div class="ci-kicker">CATALOGUE IMPORT</div><h2 id="ciTitle">Import your catalogue</h2>' +
          '<p id="ciSub">Add many services at once instead of one by one.</p></div>' +
          '<button class="ci-x" id="ciClose" type="button" aria-label="Close">×</button>' +
        '</header>' +
        '<div class="ci-body" id="ciBody"></div>' +
        '<footer class="ci-foot" id="ciFoot"></footer>' +
      '</section>';

    document.body.appendChild(ov);

    ov.addEventListener('click', onClick);
    ov.addEventListener('change', onChange);
    ov.addEventListener('input', onInput);

    ov.addEventListener('dragover', function (e) {
      var d = e.target.closest && e.target.closest('.ci-drop');
      if (!d) return;
      e.preventDefault();
      d.classList.add('drag');
    });

    ov.addEventListener('dragleave', function (e) {
      var d = e.target.closest && e.target.closest('.ci-drop');
      if (d) d.classList.remove('drag');
    });

    ov.addEventListener('drop', function (e) {
      var d = e.target.closest && e.target.closest('.ci-drop');
      if (!d) return;
      e.preventDefault();
      d.classList.remove('drag');

      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;

      if (d.dataset.drop === 'sheet') handleSheet(files[0]);
      else if (d.dataset.drop === 'ai') { addAiFiles(files); }
      else if (d.dataset.drop === 'photos') { addPhotos(files); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov && !ov.classList.contains('hidden') && !S.busy) closeImport();
    });
  }

  function openImport() {
    if (!state.client) {
      toast('Your workspace is still loading. Please try again in a moment.', 'bad');
      return;
    }

    S = fresh();

    var types = typeKeys();
    S.defaultType = types.indexOf('service') !== -1 ? 'service' : (types[0] || 'service');

    ensureDom();
    ov.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    render();

    var c = byId('ciClose');
    if (c) c.focus();
  }

  function closeImport() {
    if (S.busy || !ov) return;

    ov.classList.add('hidden');

    var wiz = byId('wizardOverlay');
    if (!wiz || wiz.classList.contains('hidden')) document.body.style.overflow = '';
  }

  function paintAlert() {
    var a = byId('ciAlert');
    if (a) a.textContent = S.alert || '';
  }

  function paintProgress() {
    var bar = byId('ciBar');
    var txt = byId('ciProgText');
    var pct = S.progress.total ? Math.round((S.progress.done / S.progress.total) * 100) : 0;

    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = 'Importing ' + S.progress.done + ' of ' + S.progress.total + '…';
  }

  function render() {
    var body = byId('ciBody');
    var foot = byId('ciFoot');
    var close = byId('ciClose');
    var sub = byId('ciSub');

    if (!body || !foot) return;

    if (close) close.disabled = !!S.busy;

    var html = '<div class="ci-alert" id="ciAlert" role="alert">' + esc(S.alert || '') + '</div>';
    var footHtml = '';

    if (S.stage === 'choose') {
      if (sub) sub.textContent = 'Add many services at once instead of one by one.';
      html += chooseHtml();
      footHtml = '<button class="ci-btn" type="button" data-act="close">Cancel</button>';
    } else if (S.stage === 'reading') {
      if (sub) sub.textContent = 'Please wait…';
      html += '<div class="ci-center"><div class="ci-spin"></div><strong>' +
        (S.method === 'sheet' || !S.aiFiles.length ? 'Reading your file…' : 'GLIME AI is reading your catalogue…') +
        '</strong><span style="font-size:.82rem;color:rgba(255,255,255,.72)">' +
        (S.aiFiles.length && S.stage === 'reading' && S.busy && S.method !== 'sheet' ? 'This can take up to a minute. Please keep this window open.' : '') +
        '</span></div>';
    } else if (S.stage === 'preview') {
      if (sub) sub.textContent = 'Check the list, fix anything that looks wrong, then import.';
      html += previewHtml();
      footHtml = '<span class="ci-count" id="ciCount"></span>' +
        '<button class="ci-btn" type="button" data-act="back">Back</button>' +
        '<button class="ci-btn primary" type="button" data-act="import" id="ciImportBtn">Import</button>';
    } else if (S.stage === 'running') {
      if (sub) sub.textContent = 'Creating your services…';
      html += '<div class="ci-center"><div class="ci-prog"><i id="ciBar"></i></div><strong id="ciProgText"></strong>' +
        '<span style="font-size:.82rem;color:rgba(255,255,255,.72)">Please keep this window open until it finishes.</span></div>';
    } else if (S.stage === 'done') {
      if (sub) sub.textContent = 'Import finished.';
      html += doneHtml();
      footHtml = '<button class="ci-btn primary" type="button" data-act="close">Done</button>';
    }

    body.innerHTML = html;
    foot.innerHTML = footHtml;

    if (S.stage === 'choose') renderAiList();
    if (S.stage === 'preview') paintCount();
    if (S.stage === 'running') paintProgress();
  }

  /* ---------- choose ---------- */

  function chooseHtml() {
    return '<div class="ci-grid">' +
      '<section class="ci-card">' +
        '<span class="ci-badge ok">RECOMMENDED · NO AI TOKENS</span>' +
        '<h3>Excel / CSV file</h3>' +
        '<p>Fill our simple template with names, prices, descriptions, categories and photo links, then upload it. Fast and exact.</p>' +
        '<button class="ci-btn" type="button" data-act="template">⬇ Download template</button>' +
        '<label class="ci-drop" data-drop="sheet"><input id="ciSheet" type="file" accept=".xlsx,.xls,.csv,text/csv" hidden>' +
          '<b>Choose Excel / CSV file</b><span>or drop it here</span></label>' +
      '</section>' +
      '<section class="ci-card">' +
        '<span class="ci-badge warn">USES AI TOKENS</span>' +
        '<h3>PDF / Photo catalogue</h3>' +
        '<p>Upload a PDF or photos of your catalogue or price list. GLIME AI reads it and prepares the list for you to review.</p>' +
        '<div class="ci-warn" role="note"><b>⚠ AI tokens will be used.</b> Reading a PDF or photo is done by GLIME AI and is deducted from your AI token balance (usually a few thousand tokens per page or photo). If your tokens run out, the import will stop. Excel / CSV import does not use any AI tokens.</div>' +
        '<label class="ci-check"><input type="checkbox" id="ciAck"><span>I understand that AI tokens will be used.</span></label>' +
        '<label class="ci-drop" data-drop="ai"><input id="ciAiFiles" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden>' +
          '<b>Choose PDF or photos</b><span>Up to ' + AI_MAX_FILES + ' files, ' + fmtBytes(AI_MAX_BYTES) + ' in total</span></label>' +
        '<ul class="ci-files" id="ciAiList"></ul>' +
        '<button class="ci-btn primary" type="button" data-act="ai-run" id="ciAiRun" disabled>Read catalogue with AI</button>' +
      '</section>' +
    '</div>';
  }

  function renderAiList() {
    var ul = byId('ciAiList');
    if (!ul) { paintAlert(); return; }

    ul.innerHTML = S.aiFiles.map(function (f, i) {
      return '<li><span>' + esc(f.name) + ' · ' + esc(fmtBytes(f.size)) + '</span>' +
        '<button type="button" data-act="ai-remove" data-i="' + i + '" aria-label="Remove file">×</button></li>';
    }).join('');

    paintAlert();
    syncAiButton();
  }

  function syncAiButton() {
    var b = byId('ciAiRun');
    var ack = byId('ciAck');
    if (b) b.disabled = !(S.aiFiles.length && ack && ack.checked) || S.busy;
  }

  /* ---------- preview ---------- */

  function typeOptions(selected) {
    var list = (state.types || []);
    if (!list.length) return '<option value="service">Service</option>';

    return list.map(function (t) {
      return '<option value="' + esc(t.type_key) + '"' + (t.type_key === selected ? ' selected' : '') + '>' + esc(t.label || t.type_key) + '</option>';
    }).join('');
  }

  function categoryOptions(selected) {
    return '<option value="">No category</option>' + (state.categories || []).map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
  }

  function previewHtml() {
    var newCats = [];
    var have = new Set((state.categories || []).map(function (c) { return String(c.name).toLowerCase(); }));

    S.rows.forEach(function (r) {
      var n = String(r.category || '').trim();
      if (n && !have.has(n.toLowerCase()) && newCats.indexOf(n) === -1) newCats.push(n);
    });

    var notes = '';

    if (S.method === 'ai') {
      notes += '<div class="ci-note warn">GLIME AI read your files' +
        (S.aiTokens ? ' and used about <b>' + esc(S.aiTokens.toLocaleString('en-IN')) + ' AI tokens</b>' : '') +
        '. AI can misread text, so please check every name and price below before importing.</div>';
    }

    if (S.aiNote) notes += '<div class="ci-note warn">' + esc(S.aiNote) + '</div>';
    if (S.sheetNote) notes += '<div class="ci-note warn">' + esc(S.sheetNote) + '</div>';

    if (newCats.length) {
      notes += '<div class="ci-note">New categories will be created: <b>' + esc(newCats.slice(0, 8).join(', ')) +
        (newCats.length > 8 ? ' and ' + (newCats.length - 8) + ' more' : '') + '</b></div>';
    }

    var opts =
      '<div class="ci-opts">' +
        '<label class="ci-field">Catalog type for rows without one<select id="ciDefType">' + typeOptions(S.defaultType) + '</select></label>' +
        '<label class="ci-field">Category for rows without one<select id="ciDefCat">' + categoryOptions(S.defaultCategory) + '</select></label>' +
      '</div>' +
      '<label class="ci-drop" data-drop="photos" style="margin-bottom:12px;min-height:76px"><input id="ciPhotos" type="file" accept="image/*" multiple hidden>' +
        '<b>＋ Add photos (optional)</b>' +
        '<span id="ciPhotoNote">Name each photo like the service, e.g. “Bridal Makeup.jpg”, or list file names in the “photos” column.</span></label>' +
      '<label class="ci-check" style="margin-bottom:14px"><input type="checkbox" id="ciPublish"' + (S.publish ? ' checked' : '') + '>' +
        '<span>Publish right away (only services that have a price and a description). Otherwise everything is saved as draft.</span></label>';

    var bar =
      '<div class="ci-bar"><span id="ciFound">' + S.rows.length + ' found</span>' +
      '<span><button class="ci-link" type="button" data-act="all">Select all</button> · <button class="ci-link" type="button" data-act="none">None</button></span></div>';

    return notes + opts + bar + '<div class="ci-rows" id="ciRows">' + S.rows.map(rowHtml).join('') + '</div>';
  }

  function rowChips(r) {
    return r.issues.map(function (i) {
      return '<span class="ci-chip ' + i.c + '">' + esc(i.t) + '</span>';
    }).join('');
  }

  function rowHtml(r) {
    var typeLabel = '';
    var t = (state.types || []).find(function (x) { return x.type_key === r.type; });
    if (t) typeLabel = '<span class="ci-chip">' + esc(t.label || t.type_key) + '</span>';

    var info = (r.category ? '<span class="ci-chip">' + esc(r.category) + '</span>' : '') + typeLabel +
      (r.price_type === 'starting_from' ? '<span class="ci-chip">starting from</span>' : '') +
      (r.price_type === 'range' && r.price_max ? '<span class="ci-chip">up to ' + esc(r.price_max) + '</span>' : '') +
      (r.billing ? '<span class="ci-chip">' + esc(r.billing) + '</span>' : '');

    return '<div class="ci-row' + (r.include ? '' : ' off') + (r.valid ? '' : ' bad') + '" data-row="' + esc(r.id) + '">' +
      '<input type="checkbox" data-f="include" aria-label="Import this service"' + (r.include && r.valid ? ' checked' : '') + (r.valid ? '' : ' disabled') + '>' +
      '<div class="ci-fields">' +
        '<input type="text" data-f="name" maxlength="120" placeholder="Service name" value="' + esc(r.name) + '">' +
        '<input type="tel" inputmode="decimal" data-f="price" placeholder="Price" value="' + esc(r.price) + '">' +
      '</div>' +
      '<div class="ci-meta" data-meta>' + info + rowChips(r) + '</div>' +
    '</div>';
  }

  function paintCount() {
    var n = S.rows.filter(function (r) { return r.include && r.valid; }).length;
    var c = byId('ciCount');
    var b = byId('ciImportBtn');

    if (c) {
      var bad = S.rows.filter(function (r) { return !r.valid; }).length;
      c.textContent = n + ' selected' + (bad ? ' · ' + bad + ' need fixing' : '');
    }

    if (b) {
      b.disabled = n === 0;
      b.textContent = n ? 'Import ' + n + ' service' + (n === 1 ? '' : 's') : 'Import';
    }

    paintPhotoNote();
  }

  function paintPhotoNote() {
    var el = byId('ciPhotoNote');
    if (!el) return;

    if (!S.photos.length) {
      el.textContent = 'Name each photo like the service, e.g. “Bridal Makeup.jpg”, or list file names in the “photos” column.';
      return;
    }

    el.textContent = S.photos.length + ' photo' + (S.photos.length === 1 ? '' : 's') + ' added · matched to ' + photoMatchCount() + ' service(s). Tap to add more.';
  }

  function addPhotos(list) {
    Array.prototype.forEach.call(list || [], function (f) {
      if (/^image\//i.test(f.type) && S.photos.length < 300) S.photos.push(f);
    });

    paintPhotoNote();
  }

  /* ---------- done ---------- */

  function doneHtml() {
    var r = S.result || { created: 0, published: 0, failed: [], notes: [] };
    var parts = [];

    parts.push('<div class="ci-done ci-center"><div style="font-size:2.4rem">' + (r.created ? '✓' : '!') + '</div>' +
      '<h3>' + r.created + ' service' + (r.created === 1 ? '' : 's') + ' imported</h3>');

    parts.push('<p style="margin:0;font-size:.86rem;color:rgba(255,255,255,.82)">' +
      (S.publish ? r.published + ' published · ' + (r.created - r.published) + ' saved as draft' : 'Saved as draft. Open each service to review, add photos and publish.') + '</p>');

    if (S.method === 'ai' && S.aiTokens) {
      parts.push('<p style="margin:0;font-size:.8rem;color:rgba(255,255,255,.7)">AI tokens used for reading: about ' + esc(S.aiTokens.toLocaleString('en-IN')) + '</p>');
    }

    if (r.failed.length) {
      parts.push('<div class="ci-alert" style="text-align:left;width:100%"><b>' + r.failed.length + ' could not be imported</b><ul class="ci-list">' +
        r.failed.slice(0, 10).map(function (x) { return '<li>' + esc(x.name) + ': ' + esc(x.error) + '</li>'; }).join('') +
        (r.failed.length > 10 ? '<li>and ' + (r.failed.length - 10) + ' more</li>' : '') + '</ul></div>');
    }

    if (r.notes.length) {
      parts.push('<div class="ci-note" style="text-align:left;width:100%"><b>Please note</b><ul class="ci-list">' +
        r.notes.slice(0, 10).map(function (x) { return '<li>' + esc(x.name) + ': ' + esc(x.note) + '</li>'; }).join('') +
        (r.notes.length > 10 ? '<li>and ' + (r.notes.length - 10) + ' more</li>' : '') + '</ul></div>');
    }

    if (S.alert) parts.push('<div class="ci-alert" style="width:100%">' + esc(S.alert) + '</div>');

    parts.push('</div>');

    return parts.join('');
  }

  /* =======================================================
     EVENTS
  ======================================================= */

  function rowOf(el) {
    var d = el.closest && el.closest('[data-row]');
    if (!d) return null;
    return S.rows.find(function (r) { return r.id === d.dataset.row; }) || null;
  }

  function repaintRow(r) {
    var d = ov.querySelector('[data-row="' + r.id + '"]');
    if (!d) return;

    d.classList.toggle('off', !r.include);
    d.classList.toggle('bad', !r.valid);

    var cb = d.querySelector('[data-f="include"]');
    if (cb) {
      cb.disabled = !r.valid;
      cb.checked = r.include && r.valid;
    }

    var meta = d.querySelector('[data-meta]');
    if (meta) {
      var tmp = document.createElement('div');
      tmp.innerHTML = rowHtml(r);
      var fresh = tmp.querySelector('[data-meta]');
      if (fresh) meta.innerHTML = fresh.innerHTML;
    }
  }

  function onInput(e) {
    var f = e.target.dataset && e.target.dataset.f;
    if (!f || (f !== 'name' && f !== 'price')) return;

    var r = rowOf(e.target);
    if (!r) return;

    if (f === 'name') r.name = e.target.value;
    else r.price = cleanPrice(e.target.value) === '' && e.target.value.trim() !== '' ? e.target.value.trim() : cleanPrice(e.target.value);

    validateAll();
    repaintAllMeta();
    paintCount();
  }

  function repaintAllMeta() {
    S.rows.forEach(repaintRow);
  }

  function onChange(e) {
    var t = e.target;

    if (t.id === 'ciSheet') {
      handleSheet(t.files && t.files[0]);
      t.value = '';
      return;
    }

    if (t.id === 'ciAiFiles') {
      addAiFiles(t.files);
      t.value = '';
      return;
    }

    if (t.id === 'ciAck') { syncAiButton(); return; }

    if (t.id === 'ciPhotos') {
      addPhotos(t.files);
      t.value = '';
      return;
    }

    if (t.id === 'ciDefType') { S.defaultType = t.value; return; }
    if (t.id === 'ciDefCat') { S.defaultCategory = t.value; return; }
    if (t.id === 'ciPublish') { S.publish = !!t.checked; return; }

    if (t.dataset && t.dataset.f === 'include') {
      var r = rowOf(t);
      if (!r) return;
      r.include = !!t.checked;
      repaintRow(r);
      paintCount();
    }
  }

  function onClick(e) {
    var b = e.target.closest && e.target.closest('[data-act]');

    if (!b) {
      /* tapping the dark backdrop closes the window when idle */
      if (e.target === ov && !S.busy) closeImport();
      return;
    }

    var act = b.dataset.act;

    if (act === 'close') closeImport();
    else if (act === 'template') downloadTemplate();
    else if (act === 'ai-run') runAi();
    else if (act === 'ai-remove') { S.aiFiles.splice(Number(b.dataset.i), 1); renderAiList(); }
    else if (act === 'back') { S.stage = 'choose'; S.alert = ''; render(); }
    else if (act === 'import') runImport();
    else if (act === 'all') {
      S.rows.forEach(function (r) { if (r.valid) r.include = true; });
      render();
    } else if (act === 'none') {
      S.rows.forEach(function (r) { r.include = false; });
      render();
    }
  }

  /* =======================================================
     ENTRY POINTS (topbar + empty state)
  ======================================================= */

  function addButtons() {
    var top = document.querySelector('.top-actions');
    var add = byId('addServiceBtn');

    if (top && !byId('importCatalogBtn')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'importCatalogBtn';
      btn.className = 'ghost-btn ci-top-btn';
      btn.textContent = '⬆ Import catalogue';
      btn.addEventListener('click', openImport);

      if (add && add.parentNode === top) top.insertBefore(btn, add);
      else top.appendChild(btn);
    }

    var empty = byId('emptyAddBtn');

    if (empty && !byId('emptyImportBtn')) {
      var eb = document.createElement('button');
      eb.type = 'button';
      eb.id = 'emptyImportBtn';
      eb.className = 'ghost-btn';
      eb.style.marginLeft = '8px';
      eb.textContent = '⬆ Import catalogue';
      eb.addEventListener('click', openImport);
      empty.parentNode.appendChild(eb);
    }
  }

  addButtons();

  window.GLIME_CATALOG_IMPORT = { open: openImport };

  console.log('[GLIME IMPORT] Catalogue import addon loaded.');
})();
