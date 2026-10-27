/* =========================================================
   GLIME — SERVICES PREMIUM ADDON
   ---------------------------------------------------------
   - GLIME themed dialogs (no native "glime.online says")
   - Delete service (existing RPC client_delete_offer + media cleanup)
   - One working search across ALL services
   - Premium cards: real primary image + price, status summary chips
   - Drafts that were never published now load their own draft data
   Loads after services.js; no backend changes.
========================================================= */
(function () {
  'use strict';

  if (typeof state === 'undefined' || typeof supabaseClient === 'undefined') {
    console.error('[GLIME SERVICES+] Core services context is unavailable.');
    return;
  }

  var BUCKET = 'client-assets';
  var D = window.GLIME_DIALOG || null;

  var STATUS_LABEL = {
    published: 'Published',
    review: 'In review',
    archived: 'Archived',
    draft: 'Draft'
  };

  var TRASH =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10 11v6M14 11v6"/></svg>';

  /* ---------- data: drafts + thumbnails ---------- */

  async function enrichServices() {
    var list = state.services || [];
    if (!list.length) return;

    /* Offers that were never published have no current_version_id.
       Point them (in memory only) at their latest version so the card shows
       the saved price and re-opening loads the saved draft data. */
    var orphanIds = list.filter(function (s) { return !s.current_version_id; }).map(function (s) { return s.id; });

    if (orphanIds.length) {
      var vr = await supabaseClient
        .from('offer_versions')
        .select('id,offer_id,version_number,status,title,description,metadata')
        .in('offer_id', orphanIds)
        .order('version_number', { ascending: false });

      if (!vr.error) {
        var latest = new Map();
        (vr.data || []).forEach(function (v) {
          if (!latest.has(v.offer_id)) latest.set(v.offer_id, v);
        });

        var vIds = Array.from(latest.values()).map(function (v) { return v.id; });
        var priceMap = new Map();

        if (vIds.length) {
          var pr = await supabaseClient
            .from('offer_prices')
            .select('offer_version_id,amount,currency,price_type,billing_period,is_active')
            .in('offer_version_id', vIds)
            .eq('is_active', true);

          if (!pr.error) {
            priceMap = new Map((pr.data || []).map(function (p) { return [p.offer_version_id, p]; }));
          }
        }

        list.forEach(function (s) {
          if (s.current_version_id) return;
          var v = latest.get(s.id);
          if (!v) return;
          s.version = v;
          s.current_version_id = v.id;
          s.price = priceMap.get(v.id) || null;
        });
      }
    }

    /* Primary image per service (private bucket -> signed URL). */
    var versionIds = list.map(function (s) { return s.current_version_id; }).filter(Boolean);
    if (!versionIds.length) return;

    var mr = await supabaseClient
      .from('offer_media')
      .select('offer_version_id,storage_path,file_url,media_type,is_primary,sort_order')
      .in('offer_version_id', versionIds)
      .eq('media_type', 'image')
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true });

    if (mr.error) return;

    var first = new Map();
    (mr.data || []).forEach(function (m) {
      if (!first.has(m.offer_version_id)) first.set(m.offer_version_id, m);
    });

    var paths = Array.from(new Set(Array.from(first.values()).map(function (m) { return m.storage_path; }).filter(Boolean)));
    var signed = {};

    if (paths.length) {
      var sg = await supabaseClient.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (!sg.error) {
        (sg.data || []).forEach(function (item, i) {
          if (item && item.signedUrl) signed[paths[i]] = item.signedUrl;
        });
      }
    }

    list.forEach(function (s) {
      var m = first.get(s.current_version_id);
      s.thumb = m ? (m.file_url || signed[m.storage_path] || '') : '';
    });
  }

  try {
    if (typeof loadServices === 'function') {
      var originalLoadServices = loadServices;
      loadServices = async function () {
        await originalLoadServices();
        try {
          await enrichServices();
        } catch (e) {
          console.warn('[GLIME SERVICES+] enrich failed:', e);
        }
      };
    }
  } catch (e) {
    console.warn('[GLIME SERVICES+] loadServices wrapper failed:', e);
  }

  /* ---------- filtering: search covers ALL services ---------- */

  filtered = function () {
    var q = String(state.search || '').toLowerCase().trim();

    return state.services.filter(function (s) {
      var ds = derivedStatus(s);
      if (state.status !== 'all' && ds !== state.status) return false;

      if (q) {
        var text = (s.name + ' ' + (s.short_description || '') + ' ' + (s.description || '') + ' ' + (s.offer_type || '')).toLowerCase();
        return text.indexOf(q) !== -1;
      }

      return (
        state.category === 'all' ||
        s.category_id === state.category ||
        (state.category === 'uncategorized' && !s.category_id)
      );
    });
  };

  /* ---------- rendering ---------- */

  function cardHtml(s, i) {
    var status = derivedStatus(s);
    var cat = (state.categories.find(function (c) { return c.id === s.category_id; }) || {}).name || 'GENERAL';
    var price = s.price ? money(s.price.amount, s.price.currency) : 'Price not set';
    var media = s.thumb
      ? '<img src="' + esc(s.thumb) + '" alt="" loading="lazy" onerror="this.remove()">'
      : '';

    return (
      '<article class="service-card sv-card" style="animation-delay:' + (i * 35) + 'ms">' +
        '<div class="service-media">' + media + '<span class="sv-ph">✦</span>' +
          '<span class="service-status ' + esc(status) + '">' + (STATUS_LABEL[status] || 'Draft') + '</span>' +
        '</div>' +
        '<div class="service-body">' +
          '<div class="service-category">' + esc(cat) + '</div>' +
          '<h3 title="' + esc(s.name) + '">' + esc(s.name) + '</h3>' +
          '<p>' + esc(s.short_description || s.description || 'No description yet.') + '</p>' +
          '<div class="service-meta"><strong class="price">' + esc(price) + '</strong>' +
            '<span class="meta-small">' + esc(s.offer_type || 'service') + '</span></div>' +
          '<div class="card-actions">' +
            '<button class="secondary-btn edit-service" data-id="' + s.id + '">Open</button>' +
            '<button class="ghost-btn duplicate-service" data-id="' + s.id + '">Duplicate</button>' +
            '<button class="sv-del delete-service" data-id="' + s.id + '" aria-label="Delete service" title="Delete service">' + TRASH + '</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderStats() {
    var host = document.getElementById('svStats');
    if (!host) return;

    var c = { all: state.services.length, published: 0, draft: 0, review: 0 };
    state.services.forEach(function (s) {
      var d = derivedStatus(s);
      if (c[d] !== undefined) c[d]++;
    });

    host.innerHTML = [['all', 'All'], ['published', 'Published'], ['draft', 'Draft'], ['review', 'In review']]
      .map(function (it) {
        return '<button type="button" class="sv-stat' + (state.status === it[0] ? ' on' : '') + '" data-status="' + it[0] + '">' +
          '<b>' + c[it[0]] + '</b><span>' + it[1] + '</span></button>';
      })
      .join('');
  }

  renderGrid = function () {
    var rows = filtered();
    var grid = document.getElementById('serviceGrid');
    var empty = document.getElementById('emptyState');
    var q = String(state.search || '').trim();

    var catName =
      state.category === 'all' ? 'All Services'
      : state.category === 'uncategorized' ? 'Uncategorized'
      : ((state.categories.find(function (c) { return c.id === state.category; }) || {}).name || 'Uncategorized');

    document.getElementById('gridTitle').textContent = q ? 'Search results' : catName;
    document.getElementById('gridMeta').textContent = q
      ? rows.length + (rows.length === 1 ? ' match' : ' matches') + ' for “' + q + '” in all categories'
      : rows.length + (rows.length === 1 ? ' service' : ' services');

    grid.innerHTML = rows.map(cardHtml).join('');
    empty.classList.toggle('hidden', rows.length > 0);
    grid.classList.toggle('hidden', rows.length === 0);

    var h = empty.querySelector('h3');
    var p = empty.querySelector('p');
    var addBtn = document.getElementById('emptyAddBtn');

    if (h && p) {
      if (q) {
        h.textContent = 'No services found';
        p.textContent = 'Nothing matches “' + q + '”. Try a different word.';
      } else if (state.status !== 'all' || state.category !== 'all') {
        h.textContent = 'Nothing here yet';
        p.textContent = 'There are no services in this view. Try another category or status.';
      } else {
        h.textContent = 'Create your first service';
        p.textContent = 'Add a service so your AI can share accurate prices and details with customers.';
      }
    }

    if (addBtn) addBtn.classList.toggle('hidden', !!q);

    renderStats();
  };

  /* ---------- new category (themed dialog) ---------- */

  addCategory = async function () {
    var raw;

    if (D) {
      raw = await D.prompt('Choose a short, clear name for your new category.', '', {
        title: 'New category',
        placeholder: 'e.g. Bridal, Skincare, Consulting',
        confirmText: 'Create category'
      });
    } else {
      raw = window.prompt('New category name');
    }

    if (raw == null) return;

    var name = String(raw).trim().replace(/\s+/g, ' ');
    if (!name) return;

    if (name.length > 60) {
      toast('Category name must be 60 characters or less', 'bad');
      return;
    }

    if (state.categories.some(function (c) { return String(c.name).toLowerCase() === name.toLowerCase(); })) {
      toast('This category already exists', 'bad');
      return;
    }

    var res = await supabaseClient.from('offer_categories').insert({
      client_id: state.client.client_id,
      name: name,
      slug: slugify(name) || ('category-' + Date.now().toString(36)),
      sort_order: state.categories.length,
      is_active: true,
      is_global: false
    });

    if (res.error) {
      toast(res.error.code === '23505' ? 'This category already exists' : (res.error.message || 'Could not create category'), 'bad');
      return;
    }

    await loadCategories();
    renderAll();
    toast('Category created', 'ok');
  };

  /* ---------- delete service ---------- */

  async function deleteService(id, btn) {
    var s = state.services.find(function (x) { return x.id === id; });
    if (!s) return;

    var message =
      '“' + s.name + '” will be permanently removed along with its pricing, variants, availability and media. ' +
      'Your AI will stop using it right away.\n\nThis can\u2019t be undone.';

    var ok = D
      ? await D.confirm(message, { title: 'Delete this service?', confirmText: 'Delete service', cancelText: 'Keep it', danger: true })
      : window.confirm(message);

    if (!ok) return;

    if (btn) btn.disabled = true;

    try {
      /* Collect media files first; they live in Storage, outside the DB cascade. */
      var paths = [];
      try {
        var vs = await supabaseClient.from('offer_versions').select('id').eq('offer_id', id);
        var vIds = (vs.data || []).map(function (v) { return v.id; });
        if (vIds.length) {
          var mr = await supabaseClient.from('offer_media').select('storage_path').in('offer_version_id', vIds);
          paths = (mr.data || []).map(function (r) { return r.storage_path; }).filter(Boolean);
        }
      } catch (_) { /* cleanup is best-effort */ }

      var del = await supabaseClient.rpc('client_delete_offer', { p_offer_id: id });
      if (del.error) throw del.error;

      if (paths.length) {
        try { await supabaseClient.storage.from(BUCKET).remove(paths); }
        catch (e) { console.warn('[GLIME SERVICES+] media cleanup failed:', e); }
      }

      state.services = state.services.filter(function (x) { return x.id !== id; });
      renderAll();
      toast('Service deleted', 'ok');
    } catch (e) {
      console.error(e);
      if (btn) btn.disabled = false;
      toast((e && e.message) || 'Service could not be deleted.', 'bad');
    }
  }

  /* ---------- events ---------- */

  var grid = document.getElementById('serviceGrid');
  if (grid) {
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.delete-service');
      if (b) deleteService(b.dataset.id, b);
    });
  }

  var stats = document.getElementById('svStats');
  if (stats) {
    stats.addEventListener('click', function (e) {
      var b = e.target.closest('[data-status]');
      if (!b) return;
      state.status = b.dataset.status;
      var sel = document.getElementById('statusFilter');
      if (sel) sel.value = state.status;
      renderGrid();
    });
  }

  console.log('[GLIME SERVICES+] Premium addon loaded.');
})();
