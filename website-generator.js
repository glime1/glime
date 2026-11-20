/* GLIME Website Generator - editor (website-generator.html)
   Uses the shared renderer window.GlimeSite (glime-site-render.js) so the preview equals the published page.
   Backend: website_* RPCs, website_looks_get (industry looks live in the database) and the public bucket `site-assets`. */
(function () {
  'use strict';
  var GS = window.GlimeSite;
  var sb = window.supabase.createClient(GS.SUPABASE_URL, GS.KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  var $ = function (id) { return document.getElementById(id); };
  var esc = GS.esc;

  var STEPS = ['Business', 'Design', 'Customize', 'Actions', 'Publish'];
  var SEC_NAMES = { about: 'About us', offers: 'Services / Products', gallery: 'Gallery', reviews: 'Reviews', faq: 'FAQ', contact: 'Contact & map' };
  var ACTS = {
    whatsapp: ['💬', 'Chat on WhatsApp', 'The customer lands in your GLIME chat'],
    call: ['📞', 'Call now', 'One tap to dial'],
    book: ['📅', 'Book appointment', 'The booking message goes to your GLIME chat'],
    buy: ['🛒', 'Buy now', 'Order and payment are handled in your GLIME chat']
  };

  var S = {
    step: 1, cfg: null, slug: '', slugOk: null, slugMsg: '', status: 'draft', exists: false, unpub: false, publishedAt: null,
    pre: null, cid: '', offers: [], url: {}, hist: [], hi: -1, saveT: 0, histT: 0, pvT: 0, saving: false, busy: false,
    scrollY: 0, scrollTo: '', open: { design: true }, dev: 'phone', showAll: false, stats: null, vers: null, flash: '', uploading: {}
  };

  /* ---------- small utils ---------- */
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function rpc(fn, args) { return sb.rpc(fn, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function errMsg(e) { return (e && (e.message || e.error_description)) || 'Something went wrong'; }
  function ask(msg, ok) {
    return new Promise(function (res) {
      var d = document.createElement('div'); d.className = 'ovl';
      d.innerHTML = '<div class="dlg"><p>' + esc(msg) + '</p><div class="btns"><button class="btn ghost sm" data-r="0">Cancel</button><button class="btn sm" data-r="1">' + esc(ok || 'OK') + '</button></div></div>';
      d.addEventListener('click', function (e) { var r = e.target.getAttribute && e.target.getAttribute('data-r'); if (r !== null) { d.remove(); res(r === '1'); } });
      document.body.appendChild(d);
    });
  }
  function setPath(o, path, v) {
    var p = path.split('.'), k;
    for (var i = 0; i < p.length - 1; i++) { k = p[i]; if (o[k] == null) o[k] = /^\d+$/.test(p[i + 1]) ? [] : {}; o = o[k]; }
    o[p[p.length - 1]] = v;
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function ind() { return GS.INDUSTRIES[S.cfg.industry] || null; }
  function siteUrl() { return GS.SITE_BASE + S.slug; }
  function industryList() {
    return Object.keys(GS.INDUSTRIES).filter(function (k) { return GS.INDUSTRIES[k].label; })
      .sort(function (a, b) { return (GS.INDUSTRIES[a].sort || 100) - (GS.INDUSTRIES[b].sort || 100); });
  }

  /* ---------- offers / images ---------- */
  function previewOffers() {
    var map = S.cfg.imageMap || {};
    return (S.offers || []).map(function (o) {
      var c = clone(o);
      c.images = (o.images || []).map(function (p) { return S.url[p] || map[p] || ''; }).filter(Boolean);
      return c;
    });
  }
  function signAll() {
    var map = S.cfg.imageMap || {};
    var paths = []; (S.offers || []).forEach(function (o) { (o.images || []).forEach(function (p) { if (!S.url[p] && !map[p] && paths.indexOf(p) < 0) paths.push(p); }); });
    var chunks = []; for (var i = 0; i < paths.length; i += 100) chunks.push(paths.slice(i, i + 100));
    return Promise.all(chunks.map(function (ch) {
      return sb.storage.from('client-assets').createSignedUrls(ch, 7200).then(function (r) {
        (r.data || []).forEach(function (d) { if (d && d.signedUrl) S.url[d.path] = d.signedUrl; });
      }).catch(function () { /* ignore */ });
    }));
  }
  function shrink(blob, max, type) {
    return createImageBitmap(blob).then(function (bm) {
      var k = Math.min(1, max / Math.max(bm.width, bm.height)), w = Math.round(bm.width * k), h = Math.round(bm.height * k);
      var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bm, 0, 0, w, h);
      return new Promise(function (r) { c.toBlob(function (b) { r(b || blob); }, type, 0.86); });
    }).catch(function () { return blob; });
  }
  function putPublic(path, blob, type) {
    return sb.storage.from('site-assets').upload(path, blob, { upsert: true, contentType: type, cacheControl: '31536000' }).then(function (r) {
      if (r.error) throw r.error;
      return sb.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
    });
  }
  function pickFiles(multi) {
    return new Promise(function (res) {
      var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/jpeg,image/png,image/webp'; i.multiple = !!multi;
      i.onchange = function () { res(Array.prototype.slice.call(i.files || [])); }; i.click();
    });
  }
  function upload(kind) {
    var multi = kind !== 'logo';
    return pickFiles(multi).then(function (files) {
      if (!files.length) return;
      var cfg = S.cfg;
      if (kind === 'banners') files = files.slice(0, Math.max(0, 3 - cfg.banners.length));
      if (kind === 'gallery') files = files.slice(0, Math.max(0, 12 - cfg.gallery.length));
      if (!files.length) { toast('You have reached the photo limit'); return; }
      S.uploading[kind] = true; renderPanel();
      var tasks = files.map(function (f) {
        var png = kind === 'logo' && f.type === 'image/png';
        var type = png ? 'image/png' : 'image/jpeg';
        return shrink(f, kind === 'logo' ? 512 : 1600, type).then(function (b) {
          return putPublic(S.cid + '/' + kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + (png ? '.png' : '.jpg'), b, type);
        });
      });
      return Promise.all(tasks).then(function (urls) {
        if (kind === 'logo') cfg.brand.logoUrl = urls[0];
        else if (kind === 'banners') cfg.banners = cfg.banners.concat(urls);
        else cfg.gallery = cfg.gallery.concat(urls);
        toast('Photo added ✓');
      }).catch(function (e) { toast('Upload failed: ' + errMsg(e)); }).then(function () { S.uploading[kind] = false; changed(true); });
    });
  }
  function syncImages(progress) {
    var cfg = S.cfg, map = cfg.imageMap || {}, need = [], keep = {};
    var hidden = cfg.offers.hidden || [];
    (S.offers || []).forEach(function (o) {
      if (hidden.indexOf(o.id) >= 0) return;
      (o.images || []).slice(0, 4).forEach(function (p) { keep[p] = 1; if (!map[p] && need.indexOf(p) < 0) need.push(p); });
    });
    Object.keys(map).forEach(function (p) { if (!keep[p]) delete map[p]; });
    cfg.imageMap = map;
    var done = 0, i = 0;
    function worker() {
      if (i >= need.length) return Promise.resolve();
      var p = need[i++], u = S.url[p];
      return (u ? fetch(u).then(function (r) { return r.blob(); }) : Promise.reject(new Error('no url')))
        .then(function (b) { return shrink(b, 1400, 'image/jpeg'); })
        .then(function (b) { return putPublic(S.cid + '/offers/' + hash(p) + '.jpg', b, 'image/jpeg'); })
        .then(function (pu) { map[p] = pu; })
        .catch(function () { /* skip this image */ })
        .then(function () { done++; if (progress) progress(done, need.length); return worker(); });
    }
    return Promise.all([worker(), worker(), worker(), worker()]);
  }

  /* ---------- state: history, preview, autosave ---------- */
  function changed(rerender) {
    if (rerender) renderPanel();
    schedulePreview(); scheduleHist(); scheduleSave();
  }
  function scheduleHist() {
    clearTimeout(S.histT);
    S.histT = setTimeout(function () {
      var j = JSON.stringify(S.cfg);
      if (S.hist[S.hi] === j) return;
      S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(j); if (S.hist.length > 40) S.hist.shift();
      S.hi = S.hist.length - 1; undoState();
    }, 450);
  }
  function undoState() { $('undoBtn').disabled = S.hi <= 0; $('redoBtn').disabled = S.hi >= S.hist.length - 1; }
  function jump(d) {
    clearTimeout(S.histT);
    var j = JSON.stringify(S.cfg);
    if (S.hist[S.hi] !== j) { S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(j); S.hi = S.hist.length - 1; }
    var n = S.hi + d; if (n < 0 || n >= S.hist.length) return;
    S.hi = n; S.cfg = JSON.parse(S.hist[n]); undoState(); renderPanel(); schedulePreview(); scheduleSave();
  }
  function schedulePreview() { clearTimeout(S.pvT); S.pvT = setTimeout(drawPreview, 220); }
  function drawPreview() {
    var f = $('pvFrame');
    f.srcdoc = GS.buildDocument(S.cfg, { offers: previewOffers(), slug: '' }, { preview: true, scrollY: S.scrollY, scrollTo: S.scrollTo });
    S.scrollTo = '';
  }
  function setState(txt, cls) { var s = $('saveState'); s.textContent = txt; s.className = cls || ''; }
  function scheduleSave() {
    setState('Unsaved changes…', 'bad');
    clearTimeout(S.saveT);
    S.saveT = setTimeout(function () { save(false); }, 2500);
  }
  function save(snapshot, label) {
    clearTimeout(S.saveT);
    if (S.saving) { S.saveT = setTimeout(function () { save(snapshot, label); }, 800); return Promise.resolve(); }
    if (!S.cfg.brand.name || S.cfg.brand.name.trim().length < 2) { setState('Enter a business name to save', 'bad'); return Promise.resolve(); }
    S.saving = true; setState('Saving…');
    return ensureSlug().then(function () {
      if (!S.slug || S.slugOk === false) throw new Error('Choose a site name (step 5)');
      var draft = GS.normalize(S.cfg);
      return rpc('website_my_save', { p_slug: S.slug, p_draft: draft, p_label: label || null, p_snapshot: !!snapshot });
    }).then(function (r) {
      S.exists = true; S.unpub = !!r.unpublished_changes; S.status = r.status || S.status; setState('Saved ✓', 'ok'); return true;
    }).catch(function (e) { setState('Not saved', 'bad'); if (snapshot) toast(errMsg(e)); return false; })
      .then(function (ok) { S.saving = false; return ok; });
  }

  /* ---------- slug ---------- */
  function slugReason(r) { return { format: 'Only a-z, 0-9 and "-" (3 to 30 characters)', reserved: 'This name cannot be used', taken: 'This name is already taken' }[r] || 'This name will not work'; }
  function checkSlug(v) {
    S.slugOk = null; S.slugMsg = 'Checking…'; paintSlug();
    var my = (checkSlug.n = (checkSlug.n || 0) + 1);
    return rpc('website_name_check', { p_slug: v }).then(function (r) {
      if (my !== checkSlug.n) return null;
      S.slugOk = !!r.available; S.slugMsg = r.available ? '✓ This name is available' : slugReason(r.reason); paintSlug(); return r;
    }).catch(function (e) { if (my === checkSlug.n) { S.slugOk = null; S.slugMsg = errMsg(e); paintSlug(); } return null; });
  }
  function paintSlug() { var m = $('slugMsg'); if (m) { m.textContent = S.slugMsg; m.className = 'msg ' + (S.slugOk === true ? 'ok' : S.slugOk === false ? 'bad' : 'mu'); } }
  function ensureSlug() {
    if (S.slug) return Promise.resolve();
    var base = GS.slugify(S.cfg.brand.name) || 'my-site'; if (base.length < 3) base = (base + '-site').slice(0, 30);
    var tries = 0;
    function next() {
      var cand = tries === 0 ? base : (base.slice(0, 26) + '-' + Math.floor(100 + Math.random() * 900)); tries++;
      return rpc('website_name_check', { p_slug: cand }).then(function (r) {
        if (r.available) { S.slug = cand; S.slugOk = true; S.slugMsg = '✓ This name is available'; return; }
        if (tries < 6) return next();
      });
    }
    return next();
  }

  /* ---------- "Generate with AI" (template based; never invents facts or reviews) ---------- */
  function aiFill() {
    var c = S.cfg, hi = c.lang === 'hi', I = ind() || {}, buy = I.cta === 'buy' || I.cta === 'whatsapp' && /hospitality/.test(c.industry || '');
    var name = c.brand.name.trim(), line = (c.brand.line || '').trim();
    var names = (S.offers || []).slice(0, 4).map(function (o) { return o.name; }).filter(Boolean);
    var tag = I.tag && (I.tag[hi ? 'hi' : 'en'] || I.tag.en);
    c.brand.tagline = tag || (hi ? 'आपका भरोसेमंद साथी' : 'Your trusted partner');
    var parts = [];
    if (line) parts.push(line.replace(/[.।]*$/, '') + (hi ? '।' : '.'));
    if (names.length) parts.push(hi ? name + ' में आपको ' + names.join(', ') + ' जैसी चीज़ें मिलती हैं।' : 'At ' + name + ' you will find ' + names.join(', ') + ' and more.');
    parts.push(hi ? 'कोई भी सवाल हो तो हमें WhatsApp या कॉल करें — हम खुशी से मदद करेंगे।' : 'Have a question? Message us on WhatsApp or call - we are happy to help.');
    c.brand.about = parts.join(' ');
    var shop = buy && I.cta === 'buy' || /hospitality/.test(c.industry || '');
    c.faq = hi
      ? (shop ? [{ q: 'क्या आप डिलीवरी करते हैं?', a: 'हाँ, ऑर्डर के लिए WhatsApp पर संपर्क करें, हम डिलीवरी की जानकारी देंगे।' }, { q: 'ऑर्डर कैसे करें?', a: 'पसंद का प्रोडक्ट चुनिए और "अभी खरीदें" दबाइए, चैट में ऑर्डर पूरा हो जाएगा।' }, { q: 'पेमेंट कैसे करें?', a: 'पेमेंट की जानकारी चैट में दी जाती है।' }]
        : [{ q: 'अपॉइंटमेंट कैसे बुक करें?', a: '"अपॉइंटमेंट बुक करें" बटन दबाइए, चैट में समय तय हो जाएगा।' }, { q: 'आप कब खुले रहते हैं?', a: 'हमारे खुलने का समय संपर्क सेक्शन में दिया है।' }, { q: 'जानकारी कहाँ मिलेगी?', a: 'WhatsApp पर पूछिए, हम तुरंत बताएँगे।' }])
      : (shop ? [{ q: 'Do you deliver?', a: 'Yes - message us on WhatsApp and we will share delivery details.' }, { q: 'How do I order?', a: 'Pick a product and tap Buy now; the order is completed in chat.' }, { q: 'How do I pay?', a: 'Payment details are shared in the chat.' }]
        : [{ q: 'How do I book?', a: 'Tap Book appointment and we will confirm the time in chat.' }, { q: 'What are your timings?', a: 'See the opening hours in the contact section.' }, { q: 'Where can I ask questions?', a: 'Message us on WhatsApp - we reply quickly.' }]);
    if (!c.announce.length && I.ann) c.announce = (I.ann[hi ? 'hi' : 'en'] || I.ann.en || []).slice();
    toast('✨ Done! Edit anything you do not like');
    changed(true);
  }
  function applyIndustry(key) {
    var c = S.cfg, I = GS.INDUSTRIES[key]; c.industry = key; if (!I) return;
    c.layout = I.pref[0]; c.theme = I.theme; c.font = I.font;
    c.cta.actions = { whatsapp: true, call: true, book: I.cta === 'book', buy: I.cta === 'buy' };
    c.cta.actions[I.cta] = true; if (I.cta2 && I.cta2 !== 'none') c.cta.actions[I.cta2] = true;
    c.cta.primary = I.cta; c.cta.secondary = I.cta2;
    if (!c.announce.length || c.announceAuto) { c.announce = (I.ann ? (I.ann[c.lang === 'en' ? 'en' : 'hi'] || I.ann.en || []) : []).slice(); c.announceAuto = true; }
  }

  /* ---------- panels ---------- */
  function renderSteps() {
    $('steps').innerHTML = STEPS.map(function (n, i) {
      var k = i + 1; return '<button class="stp ' + (S.step === k ? 'on' : S.step > k ? 'done' : '') + '" data-step="' + k + '"><i>' + (S.step > k ? '✓' : k) + '</i>' + esc(n) + '</button>';
    }).join('');
    $('prevBtn').style.visibility = S.step === 1 ? 'hidden' : 'visible';
    $('nextBtn').textContent = S.step === 5 ? '🚀 Publish' : 'Next →';
  }
  function imgs(list, kind) {
    var busy = S.uploading[kind], max = kind === 'banners' ? 3 : 12;
    return '<div class="imgs">' + list.map(function (u, i) { return '<div class="im" style="background-image:url(&quot;' + esc(u) + '&quot;)"><button data-a="rmimg" data-k="' + kind + '" data-i="' + i + '" aria-label="Remove">×</button></div>'; }).join('') +
      (list.length < max ? '<button class="add ' + (busy ? 'busy' : '') + '" data-a="addimg" data-k="' + kind + '">' + (busy ? 'Uploading…' : '＋ Add photo') + '</button>' : '') + '</div>';
  }
  function fld(label, path, val, opt) {
    opt = opt || {};
    var tag = opt.area ? '<textarea data-f="' + path + '" maxlength="' + (opt.max || 500) + '" placeholder="' + esc(opt.ph || '') + '">' + esc(val) + '</textarea>'
      : '<input data-f="' + path + '" value="' + esc(val) + '" maxlength="' + (opt.max || 120) + '" placeholder="' + esc(opt.ph || '') + '"' + (opt.type ? ' type="' + opt.type + '"' : '') + (opt.mode ? ' inputmode="' + opt.mode + '"' : '') + '>';
    return '<label class="fld"><span>' + esc(label) + '</span>' + tag + '</label>';
  }
  function tg(path, on) { return '<label class="tg"><input type="checkbox" data-f="' + path + '" data-t="bool"' + (on ? ' checked' : '') + '><span></span></label>'; }

  function step1() {
    var c = S.cfg, n = (S.offers || []).length, ph = 0;
    (S.offers || []).forEach(function (o) { ph += (o.images || []).length ? 1 : 0; });
    var chk = function (ok, t, hint) { return '<div class="' + (ok ? '' : 'no') + '"><b>' + (ok ? '✓' : '＋') + '</b><span>' + esc(t) + (ok ? '' : ' - ' + hint) + '</span></div>'; };
    return '<h2>Tell us about your business</h2><p class="sub">Your GLIME details are already filled in. Just check them.</p>' +
      '<div class="card">' + fld('Business name', 'brand.name', c.brand.name, { ph: 'e.g. Radhe Jewellers', max: 80 }) +
      '<div class="fld"><span>Choose your industry</span><div class="chips">' + industryList().map(function (k) { var x = GS.INDUSTRIES[k]; return '<button class="chip ' + (c.industry === k ? 'on' : '') + '" data-a="ind" data-v="' + k + '">' + esc(x.ic || '') + ' ' + esc(x.label) + '</button>'; }).join('') + '</div></div>' +
      fld('Describe your business in one line', 'brand.line', c.brand.line || '', { ph: 'e.g. Genuine rudraksha and gold-plated jewellery in Surat', max: 160 }) +
      '<button class="btn ai" data-a="ai">✨ Generate with AI</button><p class="hint" style="margin-top:8px">Writes a tagline, "About us" and FAQ for you. You add the reviews yourself.</p></div>' +
      '<div class="card"><h3>Filled in from GLIME</h3><div class="auto">' +
      chk(!!(c.contact.phone || c.contact.whatsapp), 'Phone / WhatsApp', 'add below') +
      chk(n > 0, n + ' services / products', 'add them on the Services page') +
      chk(ph > 0, ph + ' items with photos', 'add photos to your services') +
      chk(!!c.contact.address, 'Address', 'add below') + chk(c.contact.hours.length > 0, 'Opening hours', 'add them in step 4') + '</div>' +
      (n === 0 ? '<div class="btns"><a class="btn sm ghost" href="services.html">Open Services page</a></div>' : '') + '</div>' +
      '<div class="card"><h3>2-3 front photos</h3><p class="hint">Shown as banners at the top. Product and service photos come from your Services automatically.</p>' + imgs(c.banners, 'banners') + '</div>' +
      '<div class="card"><h3>Contact</h3><div class="row2">' + fld('Phone number', 'contact.phone', c.contact.phone, { mode: 'tel', max: 15 }) + fld('WhatsApp number', 'contact.whatsapp', c.contact.whatsapp, { mode: 'tel', max: 15 }) + '</div>' +
      fld('Address', 'contact.address', c.contact.address, { area: true, max: 250 }) + '</div>';
  }
  function step2() {
    var I = ind(), all = Object.keys(GS.LAYOUTS).sort(function (a, b) { return (GS.LAYOUTS[a].sort || 100) - (GS.LAYOUTS[b].sort || 100); }), list = I ? I.pref.slice() : all.slice(0, 4);
    if (S.showAll) list = all;
    return '<h2>Pick your design</h2><p class="sub">Every card already shows your own details. ' + (I ? 'Showing designs for ' + esc(I.label) + '.' : 'Choose an industry in step 1 first.') + '</p>' +
      '<div class="lays">' + list.map(function (k) {
        return '<button class="lay ' + (S.cfg.layout === k ? 'on' : '') + '" data-a="lay" data-v="' + k + '"><div class="fr"><iframe tabindex="-1" sandbox="allow-scripts" data-lay="' + k + '" title="' + esc(GS.LAYOUTS[k].n.en) + '"></iframe></div><b>' + esc(GS.LAYOUTS[k].n.en) + (S.cfg.layout === k ? ' ✓' : '') + '</b><small>' + esc(GS.LAYOUTS[k].d.en) + '</small></button>';
      }).join('') + '</div>' + (S.showAll ? '' : '<div class="btns"><button class="btn ghost sm" data-a="allLay">See all designs</button></div>');
  }
  function fillLayFrames() {
    var offers = previewOffers();
    Array.prototype.forEach.call(document.querySelectorAll('iframe[data-lay]'), function (f) {
      var c = clone(S.cfg); c.layout = f.getAttribute('data-lay');
      f.srcdoc = GS.buildDocument(c, { offers: offers, slug: '' }, { preview: true, mini: true });
    });
  }
  function acc(key, title, body) { return '<details class="acc" data-k="' + key + '"' + (S.open[key] ? ' open' : '') + '><summary>' + esc(title) + '</summary><div>' + body + '</div></details>'; }
  function step3() {
    var c = S.cfg, themes = Object.keys(GS.THEMES), fonts = Object.keys(GS.FONTS);
    var active = GS.activeSections(GS.normalize(c), GS.visibleOffers(GS.normalize(c), previewOffers()));
    var design = '<div class="fld"><span>Colour</span></div><div class="sw">' + themes.map(function (k) { var t = GS.THEMES[k]; return '<button class="' + (c.theme === k ? 'on' : '') + '" data-a="theme" data-v="' + k + '"><i style="background:linear-gradient(135deg,' + t.p + ',' + t.p2 + ');' + (t.dark ? 'outline:2px solid #fff3' : '') + '"></i>' + esc(t.n.en) + '</button>'; }).join('') + '</div>' +
      '<div class="fld" style="margin-top:14px"><span>Font</span></div><div class="fonts">' + fonts.map(function (k) { var f = GS.FONTS[k]; return '<button class="' + (c.font === k ? 'on' : '') + '" data-a="font" data-v="' + k + '"><em style="font-family:' + f.h + ',serif">Aa</em><small>' + esc(f.n.en) + '</small></button>'; }).join('') + '</div>' +
      '<div class="fld" style="margin-top:14px"><span>Website language</span></div><div class="seg"><button class="' + (c.lang === 'hi' ? 'on' : '') + '" data-a="lang" data-v="hi">Hindi</button><button class="' + (c.lang === 'en' ? 'on' : '') + '" data-a="lang" data-v="en">English</button></div>';
    var media = '<div class="fld"><span>Logo</span></div><div class="imgs">' + (c.brand.logoUrl ? '<div class="im" style="background-image:url(&quot;' + esc(c.brand.logoUrl) + '&quot;)"><button data-a="rmimg" data-k="logo" data-i="0" aria-label="Remove">×</button></div>' : '<button class="add ' + (S.uploading.logo ? 'busy' : '') + '" data-a="addimg" data-k="logo">＋ Logo</button>') + '</div>' +
      '<div class="fld" style="margin-top:14px"><span>Front / cover photos (up to 3)</span></div>' + imgs(c.banners, 'banners') +
      '<div class="fld" style="margin-top:14px"><span>Your own gallery photos</span></div>' + imgs(c.gallery, 'gallery') +
      '<div class="sec-row" style="margin-top:12px"><div class="nm">Also show service / product photos in the gallery</div>' + tg('useOfferPhotos', c.useOfferPhotos) + '</div>';
    var secs = c.sections.map(function (s, i) {
      var empty = s.on && active.indexOf(s.id) < 0;
      return '<div class="sec-row ' + (S.flash === s.id ? 'flash' : '') + '"><div class="nm">' + esc(SEC_NAMES[s.id]) + (empty ? '<small>Empty, so it stays hidden on the site</small>' : '') + '</div>' +
        '<button class="mv" data-a="mv" data-i="' + i + '" data-d="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button><button class="mv" data-a="mv" data-i="' + i + '" data-d="1"' + (i === c.sections.length - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button>' +
        '<label class="tg"><input type="checkbox" data-a="sec" data-i="' + i + '"' + (s.on ? ' checked' : '') + '><span></span></label></div>';
    }).join('');
    var text = fld('Tagline (headline)', 'brand.tagline', c.brand.tagline, { max: 160 }) + fld('About us', 'brand.about', c.brand.about, { area: true, max: 1200 }) + fld('Category label (small tag on top)', 'brand.category', c.brand.category, { max: 60, ph: 'e.g. Fitness & Wellness' });
    var hidden = c.offers.hidden || [];
    var offs = '<div class="sec-row"><div class="nm">Show prices</div>' + tg('offers.showPrices', c.offers.showPrices) + '</div><div class="sec-row"><div class="nm">Show round categories</div>' + tg('showCats', c.showCats) + '</div>' +
      '<p class="hint">These come from your Services. Switch off anything you do not want to show.</p><div class="offs">' + (S.offers || []).map(function (o) {
        var u = (o.images || []).map(function (p) { return S.url[p] || (c.imageMap || {})[p]; }).filter(Boolean)[0];
        return '<div class="off"><div class="th"' + (u ? ' style="background-image:url(&quot;' + esc(u) + '&quot;)"' : '') + '></div><div class="nm">' + esc(o.name) + '</div><label class="tg"><input type="checkbox" data-a="hideoff" data-id="' + esc(o.id) + '"' + (hidden.indexOf(o.id) < 0 ? ' checked' : '') + '><span></span></label></div>';
      }).join('') + (S.offers.length ? '' : '<p class="hint">You have no services or products yet.</p>') + '</div>';
    var rv = c.reviews.map(function (r, i) { return '<div class="li"><button class="x" data-a="rmrv" data-i="' + i + '">×</button>' + fld('Customer name', 'reviews.' + i + '.name', r.name, { max: 60 }) + fld('Review', 'reviews.' + i + '.text', r.text, { area: true, max: 400 }) + '<div class="chips">' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="chip ' + (r.stars === n ? 'on' : '') + '" data-a="stars" data-i="' + i + '" data-v="' + n + '">' + n + '★</button>'; }).join('') + '</div></div>'; }).join('') +
      (c.reviews.length < 6 ? '<button class="btn ghost sm" data-a="addrv">＋ Add review</button>' : '') + '<p class="hint" style="margin-top:8px">Only add real customer reviews.</p>';
    var fq = c.faq.map(function (f, i) { return '<div class="li"><button class="x" data-a="rmfq" data-i="' + i + '">×</button>' + fld('Question', 'faq.' + i + '.q', f.q, { max: 160 }) + fld('Answer', 'faq.' + i + '.a', f.a, { area: true, max: 600 }) + '</div>'; }).join('') + (c.faq.length < 10 ? '<button class="btn ghost sm" data-a="addfq">＋ Add question</button>' : '');
    var ann = c.announce.map(function (a, i) { return '<div class="li"><button class="x" data-a="rman" data-i="' + i + '">×</button>' + fld('Line ' + (i + 1), 'announce.' + i, a, { max: 70 }) + '</div>'; }).join('') + (c.announce.length < 5 ? '<button class="btn ghost sm" data-a="adan">＋ Add offer line</button>' : '') + '<p class="hint" style="margin-top:8px">Shown in the scrolling bar at the top, e.g. "10% off on prepaid orders".</p>';
    return '<h2>Make it yours</h2><p class="sub">Everything is a tap - no code.</p>' +
      acc('design', '🎨 Colour, font and language', design) + acc('media', '🖼️ Logo and photos', media) + acc('secs', '🧩 Sections on / off and order', secs) +
      acc('text', '✏️ Text', text) + acc('offs', '🛍️ Services / products', offs) + acc('rv', '⭐ Reviews', rv) + acc('fq', '❓ FAQ', fq) + acc('ann', '📣 Offer bar', ann);
  }
  function step4() {
    var c = S.cfg, on = Object.keys(ACTS).filter(function (k) { return c.cta.actions[k]; });
    var sel = function (path, val, none) { return '<select data-f="' + path + '">' + (none ? '<option value="none"' + (val === 'none' ? ' selected' : '') + '>None</option>' : '') + on.map(function (k) { return '<option value="' + k + '"' + (val === k ? ' selected' : '') + '>' + esc(ACTS[k][1]) + '</option>'; }).join('') + '</select>'; };
    var hrs = c.contact.hours.map(function (h, i) { return '<div class="li"><button class="x" data-a="rmhr" data-i="' + i + '">×</button><div class="row2">' + fld('Day', 'contact.hours.' + i + '.d', h.d, { max: 30 }) + fld('Time', 'contact.hours.' + i + '.t', h.t, { max: 40 }) + '</div></div>'; }).join('') + (c.contact.hours.length < 8 ? '<button class="btn ghost sm" data-a="adhr">＋ Add hours</button>' : '');
    return '<h2>Choose your action buttons</h2><p class="sub">Keep only what is useful for your business. All buttons connect to your GLIME chat.</p>' +
      Object.keys(ACTS).map(function (k) { var a = ACTS[k]; return '<div class="act ' + (c.cta.actions[k] ? 'on' : '') + '"><span class="ico">' + a[0] + '</span><div class="nm"><b>' + esc(a[1]) + '</b><small>' + esc(a[2]) + '</small></div><label class="tg"><input type="checkbox" data-a="act" data-v="' + k + '"' + (c.cta.actions[k] ? ' checked' : '') + '><span></span></label></div>'; }).join('') +
      '<div class="card"><div class="row2"><label class="fld"><span>Main button</span>' + sel('cta.primary', c.cta.primary, false) + '</label><label class="fld"><span>Second button</span>' + sel('cta.secondary', c.cta.secondary, true) + '</label></div>' +
      fld('First WhatsApp message', 'cta.waMessage', c.cta.waMessage, { area: true, max: 300, ph: 'Leave empty to use an automatic message' }) + '</div>' +
      '<div class="card"><div class="sec-row"><div class="nm">Enquiry form (leads come to you)</div>' + tg('contact.form', c.contact.form) + '</div><div class="sec-row"><div class="nm">Show Google map</div>' + tg('contact.showMap', c.contact.showMap) + '</div>' +
      '<div class="row2">' + fld('Email', 'contact.email', c.contact.email, { max: 120 }) + fld('Instagram', 'contact.instagram', c.contact.instagram, { max: 100, ph: '@username' }) + '</div></div>' +
      '<div class="card"><h3>Opening hours</h3>' + hrs + '</div>';
  }
  function step5() {
    var url = S.slug ? siteUrl() : '', pub = S.status === 'published';
    var h = '<h2>Publish</h2><p class="sub">Choose your site name, then go live in one tap.</p><div class="card"><h3>Site name</h3><div class="slug"><span>glime.online/site?u=</span><input id="slugIn" value="' + esc(S.slug) + '" maxlength="30" autocapitalize="off" autocomplete="off" spellcheck="false"></div><div class="msg ' + (S.slugOk === true ? 'ok' : S.slugOk === false ? 'bad' : 'mu') + '" id="slugMsg">' + esc(S.slugMsg) + '</div></div>';
    h += '<div class="card"><h3>' + (pub ? '🟢 Your site is live' : 'Not published yet') + '</h3>' +
      (pub ? '<div class="live">' + esc(url) + '</div>' + (S.unpub ? '<p class="msg" style="color:var(--am)">⚠ Some changes are not published yet</p>' : '<p class="msg ok">All changes are live ✓</p>') : '<p class="hint">You will get the link as soon as you publish.</p>') +
      '<div class="btns"><button class="btn" data-a="publish">' + (pub ? '🔄 Publish changes' : '🚀 Publish') + '</button>' +
      (pub ? '<button class="btn ghost" data-a="copy">🔗 Copy link</button><button class="btn ghost" data-a="share">📲 Share on WhatsApp</button><a class="btn ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Open site ↗</a><button class="btn warn" data-a="unpub">Unpublish</button>' : '') + '</div></div>';
    if (S.exists) {
      var st = S.stats;
      h += '<div class="card"><h3>📈 Last 30 days</h3>' + (st && st.exists ? '<div class="stats"><div class="stat"><b>' + st.views + '</b><small>Visits</small></div><div class="stat"><b>' + st.visitors + '</b><small>Unique visitors</small></div><div class="stat"><b>' + (Object.keys(st.clicks || {}).reduce(function (a, k) { return a + (k === 'share' ? 0 : st.clicks[k]); }, 0)) + '</b><small>Button clicks</small></div><div class="stat"><b>' + st.enquiries + '</b><small>Enquiries (leads)</small></div></div>' +
        '<div class="spark">' + (function () { var m = Math.max.apply(null, [1].concat((st.daily || []).map(function (d) { return d.views; }))); return (st.daily || []).map(function (d) { return '<i title="' + esc(d.d) + ': ' + d.views + '" style="height:' + Math.max(3, Math.round(d.views / m * 100)) + '%"></i>'; }).join(''); })() + '</div>' +
        ((st.recent_leads || []).length ? '<h3 style="margin-top:10px">Recent enquiries</h3>' + st.recent_leads.map(function (l) { var d = new Date(l.at); return '<div class="lead"><div><b>' + esc(l.name) + '</b> · ' + esc(l.phone) + '<small>' + esc(l.offer ? l.offer + ' - ' : '') + esc(l.message || '') + ' · ' + esc(d.toLocaleDateString('en-IN')) + '</small></div><a class="btn sm ghost" href="https://wa.me/' + esc(GS.waNumber(l.phone)) + '" target="_blank" rel="noopener">WhatsApp</a></div>'; }).join('') : '<p class="hint">No enquiries yet.</p>') : '<p class="hint">Loading stats…</p>') + '</div>';
      h += '<div class="card"><h3>🕘 Version history</h3>' + (S.vers ? (S.vers.length ? S.vers.map(function (v) { var d = new Date(v.created_at); return '<div class="ver"><div><b>' + (v.kind === 'publish' ? 'Published' : 'Saved') + '</b>' + (v.label ? ' · ' + esc(v.label) : '') + '<small>' + esc(d.toLocaleString('en-IN')) + '</small></div><button class="btn sm ghost" data-a="restore" data-id="' + esc(v.id) + '">Restore</button></div>'; }).join('') : '<p class="hint">No versions yet.</p>') : '<p class="hint">Loading…</p>') + '</div>';
    }
    return h;
  }
  function renderPanel() {
    var p = $('panel'), y = window.pageYOffset;
    p.innerHTML = [null, step1, step2, step3, step4, step5][S.step]();
    renderSteps();
    if (S.step === 2) fillLayFrames();
    window.scrollTo(0, y);
  }
  function go(n) {
    if (n === S.step) return;
    if (n > 1 && (!S.cfg.brand.name || S.cfg.brand.name.trim().length < 2)) { toast('Enter your business name first'); n = 1; }
    if (n > 1 && !S.cfg.industry) { toast('Choose an industry'); n = 1; }
    S.step = n; renderPanel(); window.scrollTo(0, 0);
    if (n === 5) { ensureSlug().then(function () { if (S.slug && S.slugOk === null) return checkSlug(S.slug); }).then(function () { renderPanel(); }); loadSite(); }
  }
  function loadSite() {
    if (!S.exists) { save(false).then(function () { if (S.exists) loadSite(); }); return; }
    rpc('website_my_stats', { p_days: 30 }).then(function (r) { S.stats = r; if (S.step === 5) renderPanel(); }).catch(function () { /* ignore */ });
    rpc('website_my_versions').then(function (r) { S.vers = r || []; if (S.step === 5) renderPanel(); }).catch(function () { S.vers = []; });
  }

  /* ---------- publish ---------- */
  function publish() {
    if (S.busy) return;
    var nm = S.cfg.brand.name.trim();
    if (nm.length < 2) { toast('Enter your business name'); go(1); return; }
    if (S.slugOk === false || !S.slug) { toast('Choose a site name'); if (S.step !== 5) go(5); return; }
    S.busy = true; var b = $('nextBtn'); b.disabled = true;
    var say = function (t) { setState(t); };
    say('Preparing photos…');
    return signAll().then(function () { return syncImages(function (d, t) { say('Preparing photos: ' + d + '/' + t); }); })
      .then(function () { return save(true, 'Publish'); })
      .then(function (ok) { if (!ok) throw new Error('Could not save'); return rpc('website_my_publish'); })
      .then(function (r) { S.status = 'published'; S.unpub = false; S.publishedAt = r.published_at; setState('Published ✓', 'ok'); toast('🎉 Your site is live!'); if (S.step !== 5) go(5); else renderPanel(); loadSite(); })
      .catch(function (e) { setState('Not published', 'bad'); toast(errMsg(e)); })
      .then(function () { S.busy = false; b.disabled = false; });
  }

  /* ---------- events ---------- */
  function onClick(e) {
    var t = e.target.closest('[data-a]'); if (!t) return;
    var a = t.getAttribute('data-a'), v = t.getAttribute('data-v'), i = +t.getAttribute('data-i'), k = t.getAttribute('data-k'), c = S.cfg;
    var next = function () { changed(true); };
    switch (a) {
      case 'ind': applyIndustry(v); next(); break;
      case 'ai': if (!c.brand.name.trim()) { toast('Enter your business name first'); break; } if (!c.industry) { toast('Choose an industry'); break; } aiFill(); break;
      case 'addimg': upload(k); break;
      case 'rmimg': if (k === 'logo') c.brand.logoUrl = ''; else if (k === 'banners') c.banners.splice(i, 1); else c.gallery.splice(i, 1); next(); break;
      case 'lay': c.layout = v; next(); break;
      case 'allLay': S.showAll = true; renderPanel(); break;
      case 'theme': c.theme = v; next(); break;
      case 'font': c.font = v; next(); break;
      case 'lang': c.lang = v; if (c.announceAuto && ind() && ind().ann) c.announce = (ind().ann[v] || ind().ann.en || []).slice(); next(); break;
      case 'mv': var d = +t.getAttribute('data-d'), s = c.sections, tmp = s[i]; s[i] = s[i + d]; s[i + d] = tmp; next(); break;
      case 'stars': c.reviews[i].stars = +v; next(); break;
      case 'addrv': c.reviews.push({ name: '', text: '', stars: 5 }); next(); break;
      case 'rmrv': c.reviews.splice(i, 1); next(); break;
      case 'addfq': c.faq.push({ q: '', a: '' }); next(); break;
      case 'rmfq': c.faq.splice(i, 1); next(); break;
      case 'adan': c.announce.push(''); c.announceAuto = false; next(); break;
      case 'rman': c.announce.splice(i, 1); c.announceAuto = false; next(); break;
      case 'adhr': c.contact.hours.push({ d: '', t: '' }); next(); break;
      case 'rmhr': c.contact.hours.splice(i, 1); next(); break;
      case 'publish': publish(); break;
      case 'copy': (navigator.clipboard ? navigator.clipboard.writeText(siteUrl()) : Promise.reject()).then(function () { toast('Link copied ✓'); }).catch(function () { window.prompt('Copy your link', siteUrl()); }); break;
      case 'share':
        window.open('https://wa.me/?text=' + encodeURIComponent((c.brand.name || 'Our website') + ' - ' + siteUrl()), '_blank', 'noopener');
        sb.rpc('website_public_track', { p_slug: S.slug, p_event: 'share', p_visitor: 'owner', p_meta: {} }); break;
      case 'unpub': ask('Unpublish your site? The link will stop working, but your design stays saved.', 'Unpublish').then(function (ok) { if (!ok) return; return rpc('website_my_unpublish').then(function () { S.status = 'draft'; toast('Site unpublished'); renderPanel(); }).catch(function (er) { toast(errMsg(er)); }); }); break;
      case 'restore': ask('Restore this version? It will replace your current changes (you can undo afterwards).', 'Restore').then(function (ok) {
        if (!ok) return; return rpc('website_my_restore', { p_version_id: t.getAttribute('data-id') }).then(function (r) { S.cfg = GS.normalize(r.draft); next(); toast('Version restored ✓'); }).catch(function (er) { toast(errMsg(er)); });
      }); break;
    }
  }
  function onInput(e) {
    var t = e.target, f = t.getAttribute && t.getAttribute('data-f'), c = S.cfg;
    if (f) {
      var val = t.getAttribute('data-t') === 'bool' ? t.checked : t.value;
      if (f.indexOf('announce.') === 0) c.announceAuto = false;
      setPath(c, f, val); changed(e.type === 'change' && (t.tagName === 'SELECT' || f === 'offers.showPrices' || f === 'showCats' || f === 'contact.form' || f === 'contact.showMap' || f === 'useOfferPhotos'));
      return;
    }
    if (t.id === 'slugIn') {
      var v = t.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); if (v !== t.value) t.value = v;
      S.slug = v; clearTimeout(onInput.t);
      if (v.length < 3) { S.slugOk = false; S.slugMsg = slugReason('format'); paintSlug(); return; }
      S.slugOk = null; S.slugMsg = 'Checking…'; paintSlug();
      onInput.t = setTimeout(function () { checkSlug(v).then(function () { if (S.slugOk) scheduleSave(); }); }, 450);
      return;
    }
    if (t.getAttribute && t.getAttribute('data-a') === 'sec') { c.sections[+t.getAttribute('data-i')].on = t.checked; changed(true); }
    else if (t.getAttribute && t.getAttribute('data-a') === 'act') {
      var k = t.getAttribute('data-v'); c.cta.actions[k] = t.checked;
      if (!Object.keys(c.cta.actions).some(function (x) { return c.cta.actions[x]; })) { c.cta.actions[k] = true; toast('At least one button must stay on'); }
      Object.assign(c, GS.normalize(c)); changed(true);
    } else if (t.getAttribute && t.getAttribute('data-a') === 'hideoff') {
      var id = t.getAttribute('data-id'), h = c.offers.hidden, ix = h.indexOf(id);
      if (t.checked && ix >= 0) h.splice(ix, 1); else if (!t.checked && ix < 0) h.push(id);
      changed(false);
    }
  }

  /* ---------- boot ---------- */
  function fatal(msg) { $('boot').style.display = 'none'; $('panel').innerHTML = '<div class="fatal"><h2>Could not open</h2><p>' + esc(msg) + '</p><div class="btns" style="justify-content:center"><button class="btn" onclick="location.reload()">Try again</button></div></div>'; }
  function init() {
    sb.auth.getSession().then(function (r) {
      if (!r.data.session) { location.replace('login.html'); return; }
      return rpc('website_looks_get').then(function (looks) { GS.setLooks(looks); }).catch(function () { /* built-in looks are used */ })
        .then(function () { return Promise.all([rpc('website_my_prefill'), rpc('website_my_get')]); }).then(function (rs) {
          var pre = rs[0], mine = rs[1]; S.pre = pre; S.cid = pre.client_id; S.offers = pre.offers || [];
          if (mine && mine.exists) {
            S.exists = true; S.slug = mine.slug; S.slugOk = true; S.status = mine.status; S.unpub = !!mine.unpublished_changes; S.publishedAt = mine.published_at;
            S.cfg = GS.normalize(mine.draft); if (!S.cfg.industry && pre.industry && GS.INDUSTRIES[pre.industry]) S.cfg.industry = pre.industry;
          } else {
            var key = GS.INDUSTRIES[pre.industry] ? pre.industry : '';
            var c = GS.defaultConfig(key); c.industry = key;
            c.brand.name = pre.name || ''; c.brand.category = pre.category || ''; c.brand.about = pre.about || '';
            c.contact.phone = pre.phone || ''; c.contact.whatsapp = pre.whatsapp || ''; c.contact.email = pre.email || ''; c.contact.address = pre.address || pre.location || ''; c.contact.instagram = pre.instagram || '';
            c.contact.hours = GS.hoursFromWorking(pre.hours);
            S.cfg = c;
            if (key) { applyIndustry(key); }
          }
          S.hist = [JSON.stringify(S.cfg)]; S.hi = 0; undoState();
          return signAll();
        }).then(function () {
          $('boot').style.display = 'none'; renderPanel(); drawPreview(); setState(S.exists ? (S.unpub ? 'Some changes are not published' : 'Saved ✓') : 'New site', S.exists && !S.unpub ? 'ok' : '');
        });
    }).catch(function (e) { fatal(errMsg(e)); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var panel = $('panel');
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    panel.addEventListener('change', function (e) { if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox' || e.target.tagName === 'SELECT') onInput(e); });
    panel.addEventListener('toggle', function (e) { var d = e.target; if (d.classList && d.classList.contains('acc')) S.open[d.getAttribute('data-k')] = d.open; }, true);
    $('steps').addEventListener('click', function (e) { var b = e.target.closest('[data-step]'); if (b) go(+b.getAttribute('data-step')); });
    $('prevBtn').addEventListener('click', function () { go(S.step - 1); });
    $('nextBtn').addEventListener('click', function () { if (S.step === 5) publish(); else go(S.step + 1); });
    $('undoBtn').addEventListener('click', function () { jump(-1); });
    $('redoBtn').addEventListener('click', function () { jump(1); });
    $('pvOpen').addEventListener('click', function () { $('pvWrap').classList.add('open'); });
    $('pvClose').addEventListener('click', function () { $('pvWrap').classList.remove('open'); });
    $('devSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-dev]'); if (!b) return; S.dev = b.getAttribute('data-dev');
      Array.prototype.forEach.call($('devSeg').children, function (x) { x.classList.toggle('on', x === b); });
      var ph = $('phone'), st = $('pvStage'); ph.classList.toggle('desk', S.dev === 'desk');
      if (S.dev === 'desk') { var s = Math.min(1, (st.clientWidth - 24) / 1100); ph.style.transform = 'scale(' + s + ')'; ph.style.marginBottom = (-(760 * (1 - s))) + 'px'; } else { ph.style.transform = ''; ph.style.marginBottom = ''; }
    });
    window.addEventListener('message', function (e) {
      if (e.source !== $('pvFrame').contentWindow || !e.data) return;
      if (e.data.gs === 'scroll') S.scrollY = e.data.y || 0;
      if (e.data.gs === 'select' && e.data.id && e.data.id !== 'hero') {
        $('pvWrap').classList.remove('open'); S.step = 3; S.open.secs = true; S.flash = e.data.id; renderPanel(); renderSteps();
        var r = document.querySelector('.sec-row.flash'); if (r) r.scrollIntoView({ block: 'center' }); setTimeout(function () { S.flash = ''; var f = document.querySelector('.sec-row.flash'); if (f) f.classList.remove('flash'); }, 1800);
      }
    });
    window.addEventListener('beforeunload', function (e) { if (S.saving || (S.cfg && S.saveT && $('saveState').className === 'bad')) { e.preventDefault(); e.returnValue = ''; } });
    init();
  });
})();
