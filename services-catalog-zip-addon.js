/* =========================================================
   GLIME — SERVICES CATALOGUE IMPORT: ZIP SUPPORT ADDON
   ---------------------------------------------------------
   Lets the client upload ONE .zip that contains the Excel / CSV
   catalogue sheet together with the photos.

   How it works (no change to services-catalog-import-addon.js):
   - the "Choose Excel / CSV file" box also accepts a .zip
   - the ZIP is opened in the browser (no upload, no AI tokens)
   - the sheet inside is handed to the normal importer
   - when the review screen appears, the photos inside are added
     through the normal "Add photos" step, so the usual matching
     rules apply:
       * photo file name = service name (Bridal Makeup ->
         bridalmakeup.jpg / "Bridal Makeup.jpg"), or
       * the file name is written in the sheet's "photos" column

   ZIP rules: plain ZIP (no password), up to 100 MB, one sheet
   file (.xlsx / .xls / .csv), photos as JPG / PNG / WEBP,
   up to 300 photos. Folders inside the ZIP are fine.

   Needs a browser with DecompressionStream (Chrome 80+).
   Load order: after services-catalog-import-addon.js.
========================================================= */
(function () {
  'use strict';

  var MAX_ZIP_BYTES = 100 * 1024 * 1024;
  var MAX_ENTRY_BYTES = 40 * 1024 * 1024;
  var MAX_TOTAL_BYTES = 250 * 1024 * 1024;
  var MAX_PHOTOS = 300;

  var SHEET_RANK = { xlsx: 0, xlsm: 1, xls: 2, csv: 3 };
  var IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  var SHEET_TYPES = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv'
  };

  var root = typeof window !== 'undefined' ? window : globalThis;

  /* =======================================================
     ZIP READER (stored + deflate, no dependencies)
  ======================================================= */

  function cleanSegments(name) {
    return String(name || '').replace(/\\/g, '/').split('/').filter(Boolean);
  }

  function ignorable(segs) {
    return segs.some(function (s) {
      return s === '__MACOSX' || s.charAt(0) === '.' || s.indexOf('~$') === 0;
    });
  }

  function extOf(name) {
    var m = /\.([a-z0-9]{2,5})$/i.exec(name);
    return m ? m[1].toLowerCase() : '';
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot open ZIP files. Please update Chrome, or upload the Excel file and the photos separately.');
    }

    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* returns { sheet, sheetCount, images, skippedImages } */
  async function readZip(file) {
    if (file.size > MAX_ZIP_BYTES) {
      throw new Error('This ZIP is larger than 100 MB. Please use fewer or smaller photos.');
    }

    var buf = await file.arrayBuffer();
    var u8 = new Uint8Array(buf);
    var dv = new DataView(buf);

    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }

    if (eocd < 0) throw new Error('This ZIP file could not be read. Please create the ZIP again.');

    var total = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);

    if (total === 0xFFFF || cdOff === 0xFFFFFFFF) {
      throw new Error('This ZIP uses an unsupported format. Please create a normal ZIP file.');
    }

    var dec = new TextDecoder('utf-8');
    var pos = cdOff;
    var entries = [];

    for (var n = 0; n < total; n++) {
      if (pos + 46 > u8.length || dv.getUint32(pos, true) !== 0x02014b50) break;

      var nameLen = dv.getUint16(pos + 28, true);
      var extraLen = dv.getUint16(pos + 30, true);
      var commentLen = dv.getUint16(pos + 32, true);

      entries.push({
        flags: dv.getUint16(pos + 8, true),
        method: dv.getUint16(pos + 10, true),
        csize: dv.getUint32(pos + 20, true),
        usize: dv.getUint32(pos + 24, true),
        lho: dv.getUint32(pos + 42, true),
        name: dec.decode(u8.subarray(pos + 46, pos + 46 + nameLen))
      });

      pos += 46 + nameLen + extraLen + commentLen;
    }

    var sheets = [];
    var photos = [];

    entries.forEach(function (e) {
      var segs = cleanSegments(e.name);
      if (!segs.length || /[\/\\]$/.test(e.name) || ignorable(segs)) return;

      e.base = segs[segs.length - 1];
      e.ext = extOf(e.base);

      if (SHEET_RANK[e.ext] !== undefined) sheets.push(e);
      else if (IMAGE_TYPES[e.ext]) photos.push(e);
    });

    sheets.sort(function (a, b) {
      return (SHEET_RANK[a.ext] - SHEET_RANK[b.ext]) || a.base.localeCompare(b.base);
    });

    photos.sort(function (a, b) { return a.base.localeCompare(b.base); });

    var used = 0;

    async function extract(e) {
      if (e.flags & 1) throw new Error('This ZIP has a password. Please create a ZIP without a password.');

      if (e.usize > MAX_ENTRY_BYTES) return null;
      if (used + e.usize > MAX_TOTAL_BYTES) return null;

      var p = e.lho;
      if (p + 30 > u8.length || dv.getUint32(p, true) !== 0x04034b50) {
        throw new Error('This ZIP file is damaged. Please create the ZIP again.');
      }

      var start = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
      var raw = u8.subarray(start, start + e.csize);
      var out;

      if (e.method === 0) out = raw;
      else if (e.method === 8) out = await inflateRaw(raw);
      else throw new Error('This ZIP uses an unsupported compression. Please create a normal ZIP file.');

      used += out.length;
      return out;
    }

    var sheet = null;

    if (sheets.length) {
      var bytes = await extract(sheets[0]);
      if (bytes) sheet = { name: sheets[0].base, ext: sheets[0].ext, bytes: bytes };
    }

    var images = [];
    var seen = {};
    var skipped = 0;

    for (var k = 0; k < photos.length; k++) {
      var key = photos[k].base.toLowerCase();

      if (seen[key]) continue;
      seen[key] = true;

      if (images.length >= MAX_PHOTOS) { skipped++; continue; }

      var data = await extract(photos[k]);

      if (!data) { skipped++; continue; }

      images.push({ name: photos[k].base, type: IMAGE_TYPES[photos[k].ext], bytes: data });
    }

    return { sheet: sheet, sheetCount: sheets.length, images: images, skippedImages: skipped };
  }

  root.GLIME_CATALOG_ZIP = { readZip: readZip };

  if (typeof document === 'undefined') return;

  /* =======================================================
     HOOKS INTO THE IMPORT WINDOW
  ======================================================= */

  var byId = function (id) { return document.getElementById(id); };
  var bypass = false;
  var busy = false;

  function isZip(f) {
    return !!f && (/\.zip$/i.test(f.name || '') || /zip/i.test(f.type || ''));
  }

  function say(msg) {
    var a = byId('ciAlert');
    if (a) a.textContent = msg || '';
  }

  function note(msg, kind) {
    try {
      if (typeof toast === 'function') toast(msg, kind || 'ok');
    } catch (_) {}
  }

  function waitFor(fn, ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();

      (function tick() {
        var v = fn();
        if (v) return resolve(v);
        if (Date.now() - t0 > ms) return resolve(null);
        setTimeout(tick, 150);
      })();
    });
  }

  function feed(input, files) {
    var dt = new DataTransfer();
    files.forEach(function (f) { dt.items.add(f); });
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function handleZip(file) {
    if (busy) return;
    busy = true;

    try {
      say('Opening your ZIP… please wait.');

      var z = await readZip(file);

      if (!z.sheet) {
        throw new Error(z.sheetCount
          ? 'The Excel / CSV file inside this ZIP is too large to read.'
          : 'No Excel or CSV file was found inside this ZIP. Put the catalogue sheet (.xlsx or .csv) and the photos in the same ZIP.');
      }

      var input = byId('ciSheet');
      if (!input) return;

      var sheetFile = new File([z.sheet.bytes], z.sheet.name, { type: SHEET_TYPES[z.sheet.ext] || '' });

      bypass = true;
      try { feed(input, [sheetFile]); } finally { bypass = false; }

      if (z.sheetCount > 1) {
        note('Using "' + z.sheet.name + '". Other sheet files in the ZIP were ignored.', 'ok');
      }

      if (!z.images.length) return;

      var photoInput = await waitFor(function () { return byId('ciPhotos'); }, 30000);
      if (!photoInput) return;

      feed(photoInput, z.images.map(function (im) {
        return new File([im.bytes], im.name, { type: im.type });
      }));

      if (z.skippedImages) {
        note(z.skippedImages + ' photo(s) were skipped (too many or too large).', 'bad');
      }
    } catch (e) {
      console.error('[GLIME ZIP]', e);
      say((e && e.message) || 'This ZIP could not be read.');
    } finally {
      busy = false;
    }
  }

  /* capture phase: runs before the importer's own handlers */
  document.addEventListener('change', function (e) {
    var t = e.target;

    if (bypass || !t || t.id !== 'ciSheet') return;

    var f = t.files && t.files[0];
    if (!isZip(f)) return;

    e.stopImmediatePropagation();
    t.value = '';
    handleZip(f);
  }, true);

  document.addEventListener('drop', function (e) {
    var d = e.target && e.target.closest && e.target.closest('.ci-drop[data-drop="sheet"]');
    if (!d) return;

    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!isZip(f)) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    d.classList.remove('drag');
    handleZip(f);
  }, true);

  /* the importer re-draws its window on every step, so patch each time */
  function patch() {
    var input = byId('ciSheet');
    if (!input) return;

    var accept = input.getAttribute('accept') || '';
    if (accept.indexOf('.zip') !== -1) return;

    input.setAttribute('accept', accept + ',.zip,application/zip,application/x-zip-compressed');

    var box = input.parentNode;
    var b = box && box.querySelector('b');
    var s = box && box.querySelector('span');

    if (b) b.textContent = 'Choose Excel / CSV / ZIP file';
    if (s) s.textContent = 'ZIP = Excel file + photos together. Or drop it here';
  }

  patch();
  new MutationObserver(patch).observe(document.body, { childList: true, subtree: true });

  console.log('[GLIME IMPORT] ZIP support addon loaded.');
})();
