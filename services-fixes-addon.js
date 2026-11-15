/* =========================================================
   GLIME — SERVICES FIXES ADDON
   ---------------------------------------------------------
   Covers (only these):
   1) Big catalogues: every .in() query is chunked and the offers
      list is paginated (no more "URL too long" with 500 services).
   2) Safer save: if a save fails half-way, availability and custom
      field values that were already deleted are put back.
   3) Publish that can resume: retry on network errors, no double
      click, a stuck "review" version is moved back to draft when the
      service is reopened, an "approved" one can be published.
   4) "Unpublished changes" badge + Discard changes on a published
      service that has a newer draft. Reopening it edits that draft
      (it used to overwrite it with the published values).
   5) Duplicate now copies variants, availability, custom fields,
      details and media (files are copied in Storage).
   6) Required custom fields are enforced (step 1 and publish).
   7) Archive / Restore (offers.status = archived) + Archived filter.
   9) Realtime listens only to this client's offers, debounced.
  12) "Same hours" toggle works, categories can be renamed / deleted /
      re-ordered, custom fields can be created from Step 1.

   Load order: after services-industry-addon.js and BEFORE
   services-media-persistence-addon.js (it wraps saveStructured).
   No new tables. Uses only existing RPCs and RLS.
========================================================= */
(function () {
  'use strict';

  if (typeof state === 'undefined' || typeof supabaseClient === 'undefined') {
    console.error('[GLIME FIXES] Core services context is unavailable.');
    return;
  }

  var BUCKET = 'client-assets';
  var CHUNK = 100;
  var PAGE = 1000;
  var D = window.GLIME_DIALOG || null;

  var byId = function (id) { return document.getElementById(id); };
  var val = function (id) { var el = byId(id); return el ? el.value : ''; };

  function randomId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (_) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function chunk(arr, n) {
    var out = [];
    for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  async function ask(message, title, ok, cancel, danger) {
    if (D && typeof D.confirm === 'function') {
      return D.confirm(message, { title: title, confirmText: ok, cancelText: cancel, danger: !!danger });
    }
    return window.confirm(message);
  }

  /* =======================================================
     1) CHUNKED / PAGINATED LOADING
  ======================================================= */

  async function inChunks(ids, build) {
    var unique = Array.from(new Set((ids || []).filter(Boolean)));
    if (!unique.length) return [];

    var results = await Promise.all(chunk(unique, CHUNK).map(function (part) { return build(part); }));
    var rows = [];

    results.forEach(function (r) {
      if (r.error) throw r.error;
      (r.data || []).forEach(function (x) { rows.push(x); });
    });

    return rows;
  }

  async function fetchOffers() {
    var cols = 'id,client_id,name,slug,short_description,description,category_id,status,offer_type,current_version_id,updated_at';
    var out = [];

    for (var from = 0; ; from += PAGE) {
      var r = await supabaseClient
        .from('offers')
        .select(cols)
        .eq('client_id', state.client.client_id)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);

      if (r.error) throw r.error;

      var rows = r.data || [];
      rows.forEach(function (x) { out.push(x); });
      if (rows.length < PAGE) break;
    }

    return out;
  }

  /* Replaces the whole loadServices chain (base + premium thumbnails +
     industry details) with one chunked implementation. */
  loadServices = async function () {
    var offers = await fetchOffers();

    var light = await inChunks(offers.map(function (o) { return o.id; }), function (part) {
      return supabaseClient.from('offer_versions').select('id,offer_id,version_number,status').in('offer_id', part);
    });

    var byOffer = new Map();
    light.forEach(function (v) {
      if (!byOffer.has(v.offer_id)) byOffer.set(v.offer_id, []);
      byOffer.get(v.offer_id).push(v);
    });
    byOffer.forEach(function (list) { list.sort(function (a, b) { return b.version_number - a.version_number; }); });

    /* The version shown on the card: the published one, or (never
       published) the latest one. */
    var displayOf = new Map();
    offers.forEach(function (o) {
      var list = byOffer.get(o.id) || [];
      var cur = o.current_version_id ? list.find(function (v) { return v.id === o.current_version_id; }) : null;
      var dv = cur || list[0] || null;
      if (dv) displayOf.set(o.id, dv.id);
    });

    var displayIds = Array.from(displayOf.values());

    var res = await Promise.all([
      inChunks(displayIds, function (part) {
        return supabaseClient.from('offer_versions')
          .select('id,offer_id,version_number,status,title,description,metadata').in('id', part);
      }),
      inChunks(displayIds, function (part) {
        return supabaseClient.from('offer_prices')
          .select('offer_version_id,amount,currency,price_type,billing_period,is_active')
          .in('offer_version_id', part).eq('is_active', true).is('variant_id', null);
      }),
      inChunks(displayIds, function (part) {
        return supabaseClient.from('offer_media')
          .select('offer_version_id,storage_path,file_url,media_type,is_primary,sort_order')
          .in('offer_version_id', part).eq('media_type', 'image')
          .order('is_primary', { ascending: false }).order('sort_order', { ascending: true });
      }).catch(function (e) {
        console.warn('[GLIME FIXES] thumbnails unavailable:', e);
        return [];
      })
    ]);

    var fullMap = new Map(res[0].map(function (v) { return [v.id, v]; }));

    var priceMap = new Map();
    res[1].forEach(function (p) { if (!priceMap.has(p.offer_version_id)) priceMap.set(p.offer_version_id, p); });

    var firstMedia = new Map();
    res[2].forEach(function (m) { if (!firstMedia.has(m.offer_version_id)) firstMedia.set(m.offer_version_id, m); });

    var paths = Array.from(new Set(
      Array.from(firstMedia.values())
        .filter(function (m) { return !m.file_url && m.storage_path; })
        .map(function (m) { return m.storage_path; })
    ));

    var signed = {};

    for (var c of chunk(paths, CHUNK)) {
      try {
        var sg = await supabaseClient.storage.from(BUCKET).createSignedUrls(c, 3600);
        if (!sg.error) {
          (sg.data || []).forEach(function (item, i) {
            var p = (item && item.path) || c[i];
            if (item && item.signedUrl) signed[p] = item.signedUrl;
          });
        }
      } catch (e) {
        console.warn('[GLIME FIXES] signed urls failed:', e);
      }
    }

    state.services = offers.map(function (o) {
      var list = byOffer.get(o.id) || [];
      var dvId = displayOf.get(o.id);
      var v = dvId ? (fullMap.get(dvId) || null) : null;

      var s = Object.assign({}, o, {
        version: v,
        price: v ? (priceMap.get(v.id) || null) : null
      });

      if (!s.current_version_id && v) s.current_version_id = v.id;

      var m = v ? firstMedia.get(v.id) : null;
      s.thumb = m ? (m.file_url || signed[m.storage_path] || '') : '';

      var meta = v && v.metadata;
      s.sdDetails = meta && typeof meta === 'object' && meta.offer_details && typeof meta.offer_details === 'object'
        ? meta.offer_details
        : null;

      /* a newer, unpublished version of a published service */
      s.pending = null;

      if (o.current_version_id) {
        var cur = list.find(function (x) { return x.id === o.current_version_id; });
        if (cur) {
          var newer = list.filter(function (x) {
            return x.version_number > cur.version_number &&
              (x.status === 'draft' || x.status === 'review' || x.status === 'approved');
          });
          if (newer.length) {
            s.pending = { id: newer[0].id, status: newer[0].status, version_number: newer[0].version_number };
          }
        }
      }

      return s;
    });
  };

  /* =======================================================
     7) STATUS: archived wins over published
  ======================================================= */

  derivedStatus = function (s) {
    var vs = (s.version && s.version.status) || '';

    if (s.status === 'archived') return 'archived';
    /* restored from archive, waiting to be published again */
    if (s.status === 'draft' && vs === 'published') return 'draft';
    if (vs === 'published' || s.status === 'active') return 'published';
    if (vs === 'review' || vs === 'approved') return 'review';
    if (vs === 'archived') return 'archived';
    return 'draft';
  };

  /* =======================================================
     6) REQUIRED CUSTOM FIELDS
  ======================================================= */

  var baseValidate = validateStep;

  validateStep = function (n) {
    var e = baseValidate(n);
    if (e) return e;

    if (n === 1) {
      var fields = state.customFields || [];

      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (!f.is_required) continue;

        var v = state.customValues ? state.customValues[f.id] : '';
        if (v == null || String(v).trim() === '') return '“' + f.label + '” is required.';
      }
    }

    return '';
  };

  /* =======================================================
     3) PUBLISH THAT CAN RESUME
  ======================================================= */

  var publishing = false;

  async function callRpc(name, args) {
    var last = null;

    for (var attempt = 0; attempt < 2; attempt++) {
      var r;

      try {
        r = await supabaseClient.rpc(name, args);
      } catch (e) {
        r = { error: e };
      }

      if (!r.error) return r.data;

      last = r.error;

      /* only a network problem is worth a second try */
      if (!/network|fetch|timeout|failed to fetch|load failed/i.test(String(last.message || ''))) break;

      await new Promise(function (res) { setTimeout(res, 700); });
    }

    throw last;
  }

  var baseSaveDraft = saveDraft;

  saveDraft = async function () {
    if (state.publishPending) {
      showAlert('Publishing is half-done. Press “Publish service” to finish it, or close and reopen the service to edit it again.');
      return false;
    }

    return baseSaveDraft.apply(this, arguments);
  };

  submitPublish = async function () {
    if (publishing) return undefined;

    var missing = [];
    if (!val('fName').trim()) missing.push('service name');
    if (!val('fDescription').trim()) missing.push('description');
    if (val('fPrice') === '' || Number(val('fPrice')) < 0) missing.push('price');

    if (missing.length) {
      showAlert('Complete before publishing: ' + missing.join(', ') + '.');
      return undefined;
    }

    for (var n = 1; n <= 3; n++) {
      var err = validateStep(n);

      if (err) {
        showAlert(err);
        setStep(n);
        return undefined;
      }
    }

    publishing = true;

    var btn = byId('publishBtn');
    if (btn) btn.disabled = true;

    try {
      if (!state.offerId || !state.versionId) {
        var ok = await baseSaveDraft(true);
        if (!ok) return undefined;
      }

      var vid = state.versionId;

      var vc = await supabaseClient.from('offer_versions').select('id,status').eq('id', vid).maybeSingle();
      if (vc.error) throw vc.error;
      if (!vc.data) throw new Error('Service version could not be found.');

      var status = vc.data.status;

      if (status === 'published') {
        showAlert('This service is already published. Reopen it to start a new draft before publishing again.');
        return undefined;
      }

      if (status === 'draft') {
        await saveStructured();
        await callRpc('client_submit_offer_version_for_review', { p_version_id: vid });
        status = 'review';
      }

      if (status === 'review') {
        await callRpc('client_approve_offer_version', {
          p_version_id: vid,
          p_notes: 'Client approved from Services wizard.'
        });
        status = 'approved';
      }

      if (status === 'approved') {
        await callRpc('client_publish_offer_version', { p_version_id: vid });
        status = 'published';
      }

      if (status !== 'published') {
        throw new Error('This version cannot be published from its current status (' + status + ').');
      }

      state.publishPending = false;

      await loadServices();
      renderAll();

      toast('Service published successfully.', 'ok');
      closeWizard();
    } catch (e) {
      console.error(e);

      var note = '';

      try {
        var chk = await supabaseClient.from('offer_versions').select('status').eq('id', state.versionId).maybeSingle();
        var st = chk.data && chk.data.status;

        if (st === 'review' || st === 'approved') {
          state.publishPending = true;
          note = ' Publishing stopped half-way. Press “Publish service” again to continue from here.';

          try { await loadServices(); renderAll(); } catch (_) { /* list refresh is best-effort */ }
        }
      } catch (_) { /* keep the original error */ }

      showAlert(((e && e.message) || 'Service could not be published.') + note);
    } finally {
      publishing = false;
      try { updateChecklist(); } catch (_) { /* wizard closed */ }
    }

    return undefined;
  };

  /* =======================================================
     4 + 5) REOPEN (pending draft, stuck publish) + DUPLICATE
  ======================================================= */

  /* Returns the service object the wizard should open. */
  async function normalizeForOpen(s) {
    var target = null;
    var vs = s.version && s.version.status;

    if (s.pending) {
      target = { id: s.pending.id, status: s.pending.status };
    } else if (vs === 'review' || vs === 'approved') {
      /* never published, but stuck mid-way */
      target = { id: s.version.id, status: vs };
    }

    if (!target) return s;

    if (target.status === 'approved') {
      var go = await ask(
        'This version was approved but publishing was never finished. Publish it now?',
        'Finish publishing?',
        'Publish now',
        'Not now',
        false
      );

      if (go) {
        await callRpc('client_publish_offer_version', { p_version_id: target.id });
        toast('Service published', 'ok');
        await loadServices();
        renderAll();
        return state.services.find(function (x) { return x.id === s.id; }) || s;
      }

      /* declined: open normally; for a never-published service still show its data */
      if (!s.pending) return Object.assign({}, s, { prefillFrom: target.id });
      return s;
    }

    if (target.status === 'review') {
      await callRpc('client_reject_offer_version', {
        p_version_id: target.id,
        p_notes: 'Reopened for editing from Services.'
      });

      toast('Publishing was left in review. It is back in draft so you can edit it.', 'ok');
      target.status = 'draft';
    }

    if (target.status === 'draft') {
      var rows = await Promise.all([
        supabaseClient.from('offer_versions')
          .select('id,offer_id,version_number,status,title,description,metadata')
          .eq('id', target.id).maybeSingle(),
        supabaseClient.from('offer_prices')
          .select('offer_version_id,amount,currency,price_type,billing_period,is_active')
          .eq('offer_version_id', target.id).eq('is_active', true).is('variant_id', null)
          .limit(1).maybeSingle()
      ]);

      if (rows[0].error) throw rows[0].error;

      if (rows[0].data) {
        var meta = rows[0].data.metadata;

        return Object.assign({}, s, {
          version: rows[0].data,
          current_version_id: target.id,
          price: (rows[1].data) || s.price,
          sdDetails: meta && typeof meta === 'object' && meta.offer_details ? meta.offer_details : s.sdDetails
        });
      }
    }

    return s;
  }

  function markCarry() {
    (state.media || []).forEach(function (m) {
      if (!m || m.file) return;

      if (m.storagePath || /^https?:\/\//i.test(m.url || '')) {
        m.carry = true;
        m.id = null;
      }
    });
  }

  function refreshSameHoursToggle() {
    var box = byId('sameHours');
    if (!box) return;

    var seen = null;
    var same = true;

    Array.prototype.forEach.call(document.querySelectorAll('#dayRows [data-day-on]'), function (on) {
      if (!on.checked) return;

      var i = on.dataset.dayOn;
      var s = document.querySelector('#dayRows [data-day-start="' + i + '"]');
      var e = document.querySelector('#dayRows [data-day-end="' + i + '"]');
      var key = (s ? s.value : '') + '|' + (e ? e.value : '');

      if (seen === null) seen = key;
      else if (seen !== key) same = false;
    });

    box.checked = same;
  }

  var baseReset = resetWizard;

  resetWizard = async function (service) {
    state.publishPending = false;

    var svc = service;

    if (svc && svc.id) {
      try {
        svc = await normalizeForOpen(svc);
      } catch (e) {
        console.warn('[GLIME FIXES] reopen check failed:', e);
        svc = service;
        toast((e && e.message) || 'Could not prepare this service for editing.', 'bad');
      }
    }

    await baseReset(svc);

    try {
      if (svc && !svc.id && svc.duplicateFrom) {
        /* duplicate: bring everything over from the source version */
        state.versionId = svc.duplicateFrom;

        try {
          await loadStructured();
        } finally {
          state.versionId = null;
        }

        (state.variants || []).forEach(function (v) { delete v.id; });
      } else if (svc && svc.id && svc.prefillFrom && !state.versionId) {
        state.versionId = svc.prefillFrom;

        try {
          await loadStructured();
        } finally {
          state.versionId = null;
        }
      }

      /* no draft loaded -> media of the source must be copied on first save */
      if (!state.versionId) markCarry();

      renderMedia();
      refreshSameHoursToggle();
      updateChecklist();
    } catch (e) {
      console.error(e);
      showAlert((e && e.message) || 'Some saved details could not be loaded.');
    }
  };

  /* =======================================================
     2 + 5) SAVE: media carry-over and roll-back of half saves
  ======================================================= */

  function stripId(name) {
    return String(name || 'media').replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '') || 'media';
  }

  async function carryMedia(vid) {
    var items = (state.media || []).filter(function (m) { return m && m.carry && !m.file; });
    if (!items.length) return;

    var copied = [];
    var inserted = [];

    try {
      for (var i = 0; i < items.length; i++) {
        var m = items[i];
        var path = null;

        if (m.storagePath) {
          path = [
            state.client.client_id, 'offers', state.offerId, vid,
            randomId() + '-' + stripId(String(m.storagePath).split('/').pop())
          ].join('/');

          var cp = await supabaseClient.storage.from(BUCKET).copy(m.storagePath, path);
          if (cp.error) throw cp.error;

          copied.push(path);
        }

        var ins = await supabaseClient
          .from('offer_media')
          .insert({
            offer_version_id: vid,
            media_type: m.type || 'image',
            storage_path: path,
            file_url: path ? null : (m.url || null),
            alt_text: m.alt || null,
            sort_order: state.media.indexOf(m),
            is_primary: !!m.primary,
            metadata: Object.assign({}, m.metadata || {}, { carried: true })
          })
          .select('id')
          .single();

        if (ins.error) throw ins.error;

        inserted.push(ins.data.id);
        m.nextRow = { id: ins.data.id, path: path };
      }
    } catch (e) {
      try {
        if (inserted.length) await supabaseClient.from('offer_media').delete().in('id', inserted);
        if (copied.length) await supabaseClient.storage.from(BUCKET).remove(copied);
      } catch (cleanup) {
        console.warn('[GLIME FIXES] media cleanup failed:', cleanup);
      }

      items.forEach(function (m) { delete m.nextRow; });
      throw e;
    }

    items.forEach(function (m) {
      m.id = m.nextRow.id;
      if (m.nextRow.path) m.storagePath = m.nextRow.path;
      m.carry = false;
      delete m.nextRow;
    });
  }

  async function snapshotRows(vid) {
    var r = await Promise.all([
      supabaseClient.from('offer_availability')
        .select('day_of_week,start_time,end_time,timezone,capacity,is_available,notes')
        .eq('offer_version_id', vid),
      supabaseClient.from('custom_field_values')
        .select('field_def_id,value_text,value_json')
        .eq('offer_version_id', vid)
    ]);

    return {
      av: r[0].error ? null : (r[0].data || []),
      cv: r[1].error ? null : (r[1].data || [])
    };
  }

  /* The industry save deletes availability / custom values and inserts
     them again. If it fails in between, put the old rows back. */
  async function restoreRows(vid, snap) {
    if (!snap) return;

    try {
      if (snap.av && snap.av.length) {
        var a = await supabaseClient.from('offer_availability').select('id').eq('offer_version_id', vid);

        if (!a.error && !(a.data || []).length) {
          await supabaseClient.from('offer_availability').insert(
            snap.av.map(function (r) { return Object.assign({ offer_version_id: vid }, r); })
          );
        }
      }

      if (snap.cv && snap.cv.length) {
        var c = await supabaseClient.from('custom_field_values').select('id').eq('offer_version_id', vid);

        if (!c.error && !(c.data || []).length) {
          await supabaseClient.from('custom_field_values').insert(
            snap.cv.map(function (r) { return Object.assign({ offer_version_id: vid }, r); })
          );
        }
      }
    } catch (e) {
      console.warn('[GLIME FIXES] roll-back failed:', e);
    }
  }

  var baseSave = saveStructured;

  saveStructured = async function () {
    var vid = state.versionId;
    if (!vid) return undefined;

    await carryMedia(vid);

    var snap = null;
    try { snap = await snapshotRows(vid); } catch (_) { snap = null; }

    try {
      return await baseSave.apply(this, arguments);
    } catch (e) {
      await restoreRows(vid, snap);
      throw e;
    }
  };

  /* =======================================================
     9) REALTIME: only this client's offers, debounced
  ======================================================= */

  function wizardOpen() {
    var w = byId('wizardOverlay');
    return !!w && !w.classList.contains('hidden');
  }

  function importOpen() {
    var o = byId('catalogImportOverlay');
    return !!o && !o.classList.contains('hidden');
  }

  function subscribeLive() {
    var id = state.client && state.client.client_id;
    if (!id) return;

    var timer = null;
    var dirty = false;

    var refresh = function () {
      timer = null;

      if (wizardOpen() || importOpen()) {
        dirty = true;
        return;
      }

      dirty = false;
      loadServices().then(renderAll).catch(console.warn);
    };

    var bump = function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 900);
    };

    supabaseClient
      .channel('services-live-v2-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: 'client_id=eq.' + id }, bump)
      .subscribe();

    var w = byId('wizardOverlay');

    if (w && window.MutationObserver) {
      new MutationObserver(function () {
        if (dirty && !wizardOpen()) bump();
      }).observe(w, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function replaceOldRealtime() {
    var tries = 0;

    var iv = setInterval(function () {
      tries++;

      if (tries > 80) { clearInterval(iv); return; }
      if (!state.client || !state.client.client_id) return;

      var chans = typeof supabaseClient.getChannels === 'function' ? supabaseClient.getChannels() : [];
      var old = chans.filter(function (c) { return String(c.topic || '').indexOf('services-live-') !== -1 && String(c.topic).indexOf('services-live-v2-') === -1; });

      if (!old.length) return;

      clearInterval(iv);

      old.forEach(function (c) {
        try { supabaseClient.removeChannel(c); } catch (_) { /* already gone */ }
      });

      subscribeLive();
    }, 300);
  }

  replaceOldRealtime();

  /* =======================================================
     4 + 7) CARDS: pending badge, archive / restore / discard
  ======================================================= */

  var ICON_ARCHIVE =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h18v4H3zM5 11v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M10 15h4"/></svg>';

  var ICON_RESTORE =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>';

  function decorate() {
    var sel = byId('statusFilter');

    if (sel && !sel.querySelector('option[value="archived"]')) {
      var opt = document.createElement('option');
      opt.value = 'archived';
      opt.textContent = 'Archived';
      sel.appendChild(opt);
    }

    var stats = byId('svStats');

    if (stats) {
      var n = state.services.filter(function (s) { return derivedStatus(s) === 'archived'; }).length;

      if (n || state.status === 'archived') {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sv-stat' + (state.status === 'archived' ? ' on' : '');
        chip.dataset.status = 'archived';
        chip.innerHTML = '<b>' + n + '</b><span>Archived</span>';
        stats.appendChild(chip);
      }
    }

    var grid = byId('serviceGrid');
    if (!grid) return;

    Array.prototype.forEach.call(grid.querySelectorAll('.service-card'), function (card) {
      var openBtn = card.querySelector('.edit-service');
      var s = openBtn && state.services.find(function (x) { return x.id === openBtn.dataset.id; });
      if (!s) return;

      var actions = card.querySelector('.card-actions');
      var archived = derivedStatus(s) === 'archived';

      if (actions && !actions.querySelector('.sv-arc')) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sv-arc ' + (archived ? 'sv-restore' : 'sv-archive');
        b.dataset.id = s.id;
        b.title = archived ? 'Restore service' : 'Archive service';
        b.setAttribute('aria-label', b.title);
        b.innerHTML = archived ? ICON_RESTORE : ICON_ARCHIVE;

        var del = actions.querySelector('.delete-service');
        if (del) actions.insertBefore(b, del);
        else actions.appendChild(b);
      }

      if (s.pending && actions && !card.querySelector('.sv-pending')) {
        var row = document.createElement('div');
        row.className = 'sv-pending';

        if (s.pending.status === 'draft') {
          row.innerHTML = '<span>✎ Unpublished changes</span><button type="button" class="sv-discard" data-id="' + s.id + '">Discard</button>';
        } else {
          row.innerHTML = '<span>⚠ Publishing not finished</span><span class="sv-pending-hint">Open to continue</span>';
        }

        actions.parentNode.insertBefore(row, actions);
      }
    });
  }

  var baseRenderGrid = renderGrid;

  renderGrid = function () {
    baseRenderGrid.apply(this, arguments);

    try { decorate(); } catch (e) { console.warn('[GLIME FIXES] card decoration failed:', e); }
  };

  async function setArchived(id, on, btn) {
    var s = state.services.find(function (x) { return x.id === id; });
    if (!s) return;

    if (on) {
      var ok = await ask(
        '“' + s.name + '” will be hidden from your AI and customers. You can restore it any time.',
        'Archive this service?',
        'Archive',
        'Keep it',
        false
      );

      if (!ok) return;
    }

    if (btn) btn.disabled = true;

    try {
      var r = await supabaseClient
        .from('offers')
        .update({ status: on ? 'archived' : 'draft' })
        .eq('id', id)
        .eq('client_id', state.client.client_id)
        .select('id,status')
        .single();

      if (r.error) throw r.error;

      s.status = r.data.status;

      await loadServices();
      renderAll();

      if (on) {
        toast('Service archived', 'ok');
      } else {
        toast('Restored as draft. Press Publish to make it live again.', 'ok');
        var fresh = state.services.find(function (x) { return x.id === id; });
        if (fresh) openWizard(fresh);
      }
    } catch (e) {
      console.error(e);
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'Could not update the service.', 'bad');
    }
  }

  async function discardDraft(id, btn) {
    var s = state.services.find(function (x) { return x.id === id; });
    if (!s || !s.pending || s.pending.status !== 'draft') return;

    var ok = await ask(
      'The unpublished changes to “' + s.name + '” will be removed. The published version stays exactly as it is.',
      'Discard changes?',
      'Discard changes',
      'Keep them',
      true
    );

    if (!ok) return;

    if (btn) btn.disabled = true;

    var vid = s.pending.id;

    try {
      var paths = [];

      try {
        var mr = await supabaseClient.from('offer_media').select('storage_path').eq('offer_version_id', vid);
        paths = (mr.data || []).map(function (r) { return r.storage_path; }).filter(Boolean);
      } catch (_) { /* file clean-up is best-effort */ }

      /* variants first, in case the foreign key does not cascade */
      var dv = await supabaseClient.from('offer_variants').delete().eq('offer_version_id', vid);
      if (dv.error) throw dv.error;

      var del = await supabaseClient.from('offer_versions').delete().eq('id', vid).eq('status', 'draft').select('id');
      if (del.error) throw del.error;
      if (!del.data || !del.data.length) throw new Error('The draft could not be discarded.');

      if (paths.length) {
        try { await supabaseClient.storage.from(BUCKET).remove(paths); }
        catch (e) { console.warn('[GLIME FIXES] file clean-up failed:', e); }
      }

      await loadServices();
      renderAll();
      toast('Changes discarded', 'ok');
    } catch (e) {
      console.error(e);
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'Could not discard the changes.', 'bad');
    }
  }

  var grid = byId('serviceGrid');

  if (grid) {
    /* capture phase: the original click handler never sees these */
    grid.addEventListener('click', function (e) {
      var dup = e.target.closest && e.target.closest('.duplicate-service');

      if (dup) {
        e.stopPropagation();
        e.preventDefault();

        var s = state.services.find(function (x) { return x.id === dup.dataset.id; });
        if (!s) return;

        openWizard(Object.assign({}, s, {
          id: null,
          current_version_id: null,
          name: s.name + ' Copy',
          status: 'draft',
          version: null,
          pending: null,
          duplicateFrom: s.pending && s.pending.status === 'draft' ? null : (s.current_version_id || null)
        }));

        toast('Duplicate opened as a new draft', 'ok');
        return;
      }

      var arc = e.target.closest && e.target.closest('.sv-archive');
      if (arc) { e.stopPropagation(); setArchived(arc.dataset.id, true, arc); return; }

      var res = e.target.closest && e.target.closest('.sv-restore');
      if (res) { e.stopPropagation(); setArchived(res.dataset.id, false, res); return; }

      var dis = e.target.closest && e.target.closest('.sv-discard');
      if (dis) { e.stopPropagation(); discardDraft(dis.dataset.id, dis); }
    }, true);
  }

  /* =======================================================
     12a) "USE THE SAME HOURS" TOGGLE
  ======================================================= */

  var dayRows = byId('dayRows');
  var sameBox = byId('sameHours');

  function enabledDays() {
    return Array.prototype.filter.call(document.querySelectorAll('#dayRows [data-day-on]'), function (c) { return c.checked; })
      .map(function (c) { return c.dataset.dayOn; });
  }

  function copyHours(fromDay) {
    var s = document.querySelector('#dayRows [data-day-start="' + fromDay + '"]');
    var e = document.querySelector('#dayRows [data-day-end="' + fromDay + '"]');
    if (!s || !e) return;

    enabledDays().forEach(function (d) {
      var ds = document.querySelector('#dayRows [data-day-start="' + d + '"]');
      var de = document.querySelector('#dayRows [data-day-end="' + d + '"]');
      if (ds) ds.value = s.value;
      if (de) de.value = e.value;
    });
  }

  if (dayRows) {
    dayRows.addEventListener('input', function (ev) {
      if (!sameBox || !sameBox.checked) return;

      var t = ev.target;
      var day = t.dataset.dayStart !== undefined ? t.dataset.dayStart : t.dataset.dayEnd;
      if (day === undefined) return;

      var on = document.querySelector('#dayRows [data-day-on="' + day + '"]');
      if (on && !on.checked) return;

      copyHours(day);
    });

    dayRows.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!sameBox || !sameBox.checked || t.dataset.dayOn === undefined || !t.checked) return;

      var other = enabledDays().filter(function (d) { return d !== t.dataset.dayOn; })[0];
      if (other === undefined) return;

      var s = document.querySelector('#dayRows [data-day-start="' + other + '"]');
      var e = document.querySelector('#dayRows [data-day-end="' + other + '"]');
      var ts = document.querySelector('#dayRows [data-day-start="' + t.dataset.dayOn + '"]');
      var te = document.querySelector('#dayRows [data-day-end="' + t.dataset.dayOn + '"]');

      if (s && e && ts && te) { ts.value = s.value; te.value = e.value; }
    });
  }

  if (sameBox) {
    sameBox.addEventListener('change', function () {
      if (!sameBox.checked) return;

      var first = enabledDays()[0];
      if (first !== undefined) copyHours(first);
    });
  }

  /* =======================================================
     SMALL SHEET (used by categories + custom fields)
  ======================================================= */

  function closeSheet() {
    var o = byId('svSheet');
    if (o) o.remove();
  }

  function openSheet(title, bodyHtml, footHtml) {
    closeSheet();

    var ov = document.createElement('div');
    ov.className = 'sv-sheet-ov';
    ov.id = 'svSheet';

    ov.innerHTML =
      '<section class="sv-sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<header class="sv-sheet-head"><h3>' + esc(title) + '</h3>' +
        '<button type="button" class="sv-sheet-x" data-sheet="close" aria-label="Close">×</button></header>' +
        '<div class="sv-sheet-body" id="svSheetBody">' + bodyHtml + '</div>' +
        (footHtml ? '<footer class="sv-sheet-foot">' + footHtml + '</footer>' : '') +
      '</section>';

    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('[data-sheet="close"]'))) closeSheet();
    });

    return ov;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && byId('svSheet')) closeSheet();
  });

  /* =======================================================
     12b) MANAGE CATEGORIES (rename / delete / re-order)
  ======================================================= */

  function ownCats() {
    return (state.categories || []).filter(function (c) { return !c.is_global; });
  }

  function usedBy(id) {
    return state.services.filter(function (s) { return s.category_id === id; }).length;
  }

  function slotsFor(list) {
    var s = list.map(function (c) { return Number(c.sort_order) || 0; }).sort(function (a, b) { return a - b; });
    for (var i = 1; i < s.length; i++) if (s[i] <= s[i - 1]) s[i] = s[i - 1] + 1;
    return s;
  }

  function renderCatMgr() {
    var body = byId('svSheetBody');
    if (!body) return;

    var own = ownCats();
    var glob = (state.categories || []).filter(function (c) { return c.is_global; });

    body.innerHTML =
      (own.length
        ? own.map(function (c, i) {
          return '<div class="sv-crow" data-id="' + esc(c.id) + '">' +
            '<input type="text" maxlength="60" value="' + esc(c.name) + '" aria-label="Category name">' +
            '<div class="sv-crow-actions">' +
              '<button type="button" data-cat="save">Save</button>' +
              '<button type="button" data-cat="up" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
              '<button type="button" data-cat="down" aria-label="Move down"' + (i === own.length - 1 ? ' disabled' : '') + '>↓</button>' +
              '<button type="button" class="danger" data-cat="del">Delete</button>' +
            '</div>' +
            '<small>' + usedBy(c.id) + ' service' + (usedBy(c.id) === 1 ? '' : 's') + '</small>' +
          '</div>';
        }).join('')
        : '<p class="sv-empty">You have not created any category yet.</p>') +
      (glob.length
        ? '<h4 class="sv-sub">GLIME default categories</h4><div class="sv-chips">' +
          glob.map(function (c) { return '<span>' + esc(c.name) + '</span>'; }).join('') + '</div>'
        : '');
  }

  async function catAction(act, id, row) {
    var own = ownCats();
    var idx = own.findIndex(function (c) { return c.id === id; });
    var cat = own[idx];
    if (!cat) return;

    try {
      if (act === 'save') {
        var name = row.querySelector('input').value.trim().replace(/\s+/g, ' ');

        if (!name) { toast('Category name is required', 'bad'); return; }
        if (name.length > 60) { toast('Category name must be 60 characters or less', 'bad'); return; }

        if (state.categories.some(function (c) { return c.id !== id && String(c.name).toLowerCase() === name.toLowerCase(); })) {
          toast('This category already exists', 'bad');
          return;
        }

        var u = await supabaseClient.from('offer_categories').update({ name: name })
          .eq('id', id).eq('client_id', state.client.client_id).select('id').single();
        if (u.error) throw u.error;

        toast('Category renamed', 'ok');
      } else if (act === 'up' || act === 'down') {
        var j = act === 'up' ? idx - 1 : idx + 1;
        if (j < 0 || j >= own.length) return;

        var order = own.slice();
        var tmp = order[idx];
        order[idx] = order[j];
        order[j] = tmp;

        var slots = slotsFor(own);

        var res = await Promise.all(order.map(function (c, i) {
          return supabaseClient.from('offer_categories').update({ sort_order: slots[i] })
            .eq('id', c.id).eq('client_id', state.client.client_id);
        }));

        res.forEach(function (r) { if (r.error) throw r.error; });
      } else if (act === 'del') {
        var n = usedBy(id);

        var ok = await ask(
          '“' + cat.name + '” will be deleted.' + (n ? ' Its ' + n + ' service' + (n === 1 ? '' : 's') + ' will move to Uncategorized.' : ''),
          'Delete this category?',
          'Delete category',
          'Keep it',
          true
        );

        if (!ok) return;

        var d = await supabaseClient.from('offer_categories').delete()
          .eq('id', id).eq('client_id', state.client.client_id).eq('is_global', false).select('id');
        if (d.error) throw d.error;
        if (!d.data || !d.data.length) throw new Error('The category could not be deleted.');

        if (state.category === id) state.category = 'all';

        toast('Category deleted', 'ok');
      }

      await loadCategories();
      await loadServices();
      renderAll();
      renderCatMgr();
    } catch (e) {
      console.error(e);
      toast((e && e.message) || 'Could not update the category.', 'bad');
    }
  }

  function openCatMgr() {
    var ov = openSheet('Manage categories', '', '<button type="button" class="secondary-btn" data-sheet="close">Done</button>');

    renderCatMgr();

    ov.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-cat]');
      if (!b || b.disabled) return;

      var row = b.closest('.sv-crow');
      if (row) catAction(b.dataset.cat, row.dataset.id, row);
    });
  }

  /* =======================================================
     12c) CREATE A CUSTOM FIELD (Step 1)
  ======================================================= */

  async function saveField() {
    var label = val('svCfLabel').trim().replace(/\s+/g, ' ');
    var type = val('svCfType') || 'text';
    var required = !!(byId('svCfReq') && byId('svCfReq').checked);
    var opts = [];

    if (!label) { toast('Field name is required', 'bad'); return; }

    if (type === 'select') {
      opts = Array.from(new Set(val('svCfOpts').split(/[\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean))).slice(0, 30);

      if (opts.length < 2) { toast('Add at least two dropdown options', 'bad'); return; }
    }

    var btn = byId('svCfSave');
    if (btn) btn.disabled = true;

    var base = (slugify(label).replace(/-/g, '_') || 'field').slice(0, 40);

    try {
      var done = false;

      for (var attempt = 0; attempt < 3 && !done; attempt++) {
        var key = attempt === 0 ? base : base + '_' + Math.random().toString(36).slice(2, 6);

        var r = await supabaseClient.from('custom_field_defs').insert({
          client_id: state.client.client_id,
          name: label,
          field_key: key,
          field_type: type,
          label: label,
          description: null,
          options: type === 'select' ? { options: opts } : {},
          is_required: required,
          is_active: true,
          sort_order: (state.customFields || []).length
        });

        if (!r.error) { done = true; break; }
        if (r.error.code !== '23505') throw r.error;
      }

      if (!done) throw new Error('A field with this name already exists.');

      await loadCustomFields();
      closeSheet();
      toast('Custom field added', 'ok');
    } catch (e) {
      console.error(e);
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'Could not add the field.', 'bad');
    }
  }

  function openFieldSheet() {
    var ov = openSheet(
      'New custom field',
      '<div class="form-grid">' +
        '<label class="field"><span>Field name <em>*</em></span><input id="svCfLabel" maxlength="60" placeholder="e.g. Brand, Warranty, Eligibility"></label>' +
        '<label class="field"><span>Type</span><select id="svCfType">' +
          '<option value="text">Text</option><option value="textarea">Long text</option>' +
          '<option value="number">Number</option><option value="select">Dropdown</option></select></label>' +
        '<label class="field hidden" id="svCfOptWrap"><span>Dropdown options</span>' +
          '<textarea id="svCfOpts" rows="3" placeholder="One option per line, or separated by commas"></textarea></label>' +
        '<label class="sv-check"><input type="checkbox" id="svCfReq"><span>Required for every service</span></label>' +
        '<small class="sv-note">Required fields must be filled before a service can be published, including existing services.</small>' +
      '</div>',
      '<button type="button" class="secondary-btn" data-sheet="close">Cancel</button>' +
      '<button type="button" class="primary-btn" id="svCfSave">Add field</button>'
    );

    var typeSel = byId('svCfType');
    typeSel.addEventListener('change', function () {
      byId('svCfOptWrap').classList.toggle('hidden', typeSel.value !== 'select');
    });

    byId('svCfSave').addEventListener('click', saveField);

    var input = byId('svCfLabel');
    if (input) setTimeout(function () { input.focus(); }, 60);

    void ov;
  }

  /* =======================================================
     BUTTONS
  ======================================================= */

  var addCat = byId('addCategoryBtn');

  if (addCat && !byId('manageCategoryBtn')) {
    var mb = document.createElement('button');
    mb.type = 'button';
    mb.id = 'manageCategoryBtn';
    mb.className = 'category-add category-manage';
    mb.textContent = 'Manage categories';
    mb.addEventListener('click', openCatMgr);
    addCat.parentNode.insertBefore(mb, addCat.nextSibling);
  }

  var dyn = byId('dynamicFields');

  if (dyn && !byId('svAddFieldBtn')) {
    var wrap = document.createElement('div');
    wrap.className = 'sv-addfield';
    wrap.innerHTML = '<button type="button" class="secondary-btn" id="svAddFieldBtn">＋ Custom field</button>';
    dyn.parentNode.insertBefore(wrap, dyn.nextSibling);
    byId('svAddFieldBtn').addEventListener('click', openFieldSheet);
  }

  console.log('[GLIME FIXES] Services fixes addon loaded.');
})();
