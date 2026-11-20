/* =========================================================
   GLIME SITE RENDERER  (glime-site-render.js)
   ---------------------------------------------------------
   One renderer shared by:
     - website-generator.html  (live preview + layout cards, inside a sandboxed iframe)
     - site.html               (the public page a client's customers open)
   So what the client sees in the editor is exactly what gets published.

   Industry looks (theme, font, layouts, offer bar, labels) and extra layouts live in the
   database (website_industry_looks / website_layouts, read with website_looks_get) and are
   applied with GlimeSite.setLooks(). The page structures themselves are built in here.

   Public API: window.GlimeSite
     THEMES, FONTS, LAYOUTS, INDUSTRIES, SECTION_IDS
     setLooks(looks)                  -> apply industries/layouts from the database
     defaultConfig(industry)          -> new config
     normalize(cfg)                   -> safe, complete config
     buildDocument(cfg, data, opts)   -> full HTML document string
         data = { offers:[{id,type,name,short,desc,category,price,images:[https urls]}], slug }
         opts = { preview, mini, scrollY, scrollTo }
     hoursFromWorking(workingHours)   -> [{d,t}]
     fmtPrice(price, lang)
     slugify(text)
     waNumber(phone)

   Every text is escaped; only http(s) image links are used.
========================================================= */
(function (root) {
  'use strict';

  var SB = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  var KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var SITE_BASE = 'https://glime.online/site?u=';

  /* ---------- catalogues ---------- */
  var THEMES = {
    emerald:  { n: { en: 'Emerald' },  p: '#10b981', p2: '#06b6d4', bg: '#f5fbf8', sf: '#ffffff', tx: '#0f1f1a', mu: '#5b6f68', on: '#04120b', dark: false },
    ocean:    { n: { en: 'Ocean' },    p: '#2563eb', p2: '#0ea5e9', bg: '#f5f8ff', sf: '#ffffff', tx: '#0e1a33', mu: '#5a6b8c', on: '#ffffff', dark: false },
    royal:    { n: { en: 'Royal' },    p: '#7c3aed', p2: '#c026d3', bg: '#faf7ff', sf: '#ffffff', tx: '#1d1233', mu: '#6b5f85', on: '#ffffff', dark: false },
    sunset:   { n: { en: 'Sunset' },   p: '#ea580c', p2: '#e11d48', bg: '#fff8f3', sf: '#ffffff', tx: '#2a1408', mu: '#7a5f50', on: '#ffffff', dark: false },
    rose:     { n: { en: 'Rose' },     p: '#db2777', p2: '#f43f5e', bg: '#fff5f8', sf: '#ffffff', tx: '#2e0f1d', mu: '#80596a', on: '#ffffff', dark: false },
    gold:     { n: { en: 'Gold' },     p: '#a8782a', p2: '#c99a43', bg: '#faf5ea', sf: '#fffdf8', tx: '#1b1510', mu: '#7a6a55', on: '#ffffff', dark: false },
    forest:   { n: { en: 'Forest' },   p: '#0b5132', p2: '#c2185b', bg: '#fff6e9', sf: '#ffffff', tx: '#0b3d26', mu: '#4d6a5c', on: '#ffffff', dark: false },
    midnight: { n: { en: 'Midnight' }, p: '#34d399', p2: '#22d3ee', bg: '#0b1220', sf: '#131d31', tx: '#eaf2ff', mu: '#93a4c0', on: '#03130d', dark: true }
  };

  var FONTS = {
    modern:   { n: { en: 'Modern' },   h: "'Poppins'",          b: "'Inter'",         g: 'Poppins:wght@500;600;700&family=Inter:wght@400;500;600' },
    elegant:  { n: { en: 'Elegant' },  h: "'Playfair Display'", b: "'Lato'",          g: 'Playfair+Display:wght@500;600;700&family=Lato:wght@400;700' },
    friendly: { n: { en: 'Friendly' }, h: "'Nunito'",           b: "'Nunito Sans'",   g: 'Nunito:wght@600;700;800&family=Nunito+Sans:wght@400;600' },
    luxe:     { n: { en: 'Luxe' },     h: "'Playfair Display'", b: "'Jost'",          g: 'Playfair+Display:ital,wght@0,500;0,600;1,500&family=Jost:wght@400;500;600' },
    classic:  { n: { en: 'Classic' },  h: "'Merriweather'",     b: "'Source Sans 3'", g: 'Merriweather:wght@400;700&family=Source+Sans+3:wght@400;600' }
  };

  /* Built-in page structures. Names, descriptions and extra layouts come from the database (setLooks). */
  var LAYOUTS = {
    luxury:    { n: { en: 'Luxury' },    d: { en: 'Offer marquee, banner slider, round categories' }, sort: 10 },
    editorial: { n: { en: 'Editorial' }, d: { en: 'Big serif headline, photo cards slider' }, sort: 20 },
    showcase:  { n: { en: 'Showcase' },  d: { en: 'Photo first, floating info card' }, sort: 30 },
    classic:   { n: { en: 'Classic' },   d: { en: 'Centered banner, clean cards' }, sort: 40 },
    bold:      { n: { en: 'Bold' },      d: { en: 'Big headline with side photo' }, sort: 50 },
    minimal:   { n: { en: 'Minimal' },   d: { en: 'Light and simple list' }, sort: 60 }
  };

  /* Fallback only, used if the database cannot be reached. The real industry looks live in the
     website_industry_looks table (loaded with website_looks_get), so new industries need no code change. */
  var INDUSTRIES = {
    retail: { ic: '🛍️', label: 'Shop / Retail', n: { en: 'Shop / Retail' }, offers: { en: 'Our products', hi: 'हमारे प्रोडक्ट' }, ratio: '1/1', cta: 'buy', cta2: 'call', theme: 'gold', font: 'luxe', pref: ['luxury', 'showcase', 'classic', 'bold'], sort: 10 },
    healthcare: { ic: '🩺', label: 'Clinic & Healthcare', n: { en: 'Clinic & Healthcare' }, offers: { en: 'Our services', hi: 'हमारी सेवाएँ' }, ratio: '4/3', cta: 'book', cta2: 'call', theme: 'forest', font: 'luxe', pref: ['editorial', 'classic', 'minimal', 'bold'], sort: 20 }
  };

  var SECTION_IDS = ['about', 'offers', 'gallery', 'reviews', 'faq', 'contact'];

  /* ---------- looks from the database (website_looks_get) ----------
     Industry looks and extra layouts live in the DB; the code above is only the fallback.
     A DB layout reuses one built-in structure (base) and may add its own CSS. */
  var BUILTIN = ['classic', 'bold', 'minimal', 'luxury', 'editorial', 'showcase'];
  function cleanCss(css) {
    return String(css || '').replace(/<\/?style/gi, '').replace(/@import[^;]*;?/gi, '').replace(/expression\s*\(/gi, '').slice(0, 20000);
  }
  function setLooks(d) {
    if (!d || typeof d !== 'object') return;
    (d.layouts || []).forEach(function (l) {
      if (!l || !/^[a-z][a-z0-9-]{1,30}$/.test(l.id || '')) return;
      var o = LAYOUTS[l.id] || (LAYOUTS[l.id] = {});
      o.n = { en: l.name, hi: l.name }; o.d = { en: l.description || '', hi: l.description || '' };
      if (BUILTIN.indexOf(l.id) < 0) { o.base = BUILTIN.indexOf(l.base) >= 0 ? l.base : 'classic'; o.css = cleanCss(l.css); }
      o.sort = l.sort || 100;
    });
    (d.industries || []).forEach(function (i) {
      if (!i || !/^[a-z][a-z0-9-]{1,40}$/.test(i.slug || '')) return;
      var o = INDUSTRIES[i.slug] || (INDUSTRIES[i.slug] = {});
      o.ic = i.icon; o.n = { en: i.label, hi: i.label }; o.label = i.label;
      o.offers = i.offers_label && i.offers_label.en ? i.offers_label : { en: 'Our offerings', hi: 'हमारी पेशकश' };
      o.ratio = i.ratio || '4/3'; o.cta = i.cta || 'whatsapp'; o.cta2 = i.cta2 || 'call';
      o.theme = THEMES[i.theme] ? i.theme : 'emerald'; o.font = FONTS[i.font] ? i.font : 'modern';
      o.pref = (i.layouts || []).filter(function (k) { return !!LAYOUTS[k]; }); if (!o.pref.length) o.pref = ['classic'];
      o.ann = i.announce || null; o.tag = i.tagline || null; o.sort = i.sort || 100;
    });
  }
  function structureOf(key) { return (LAYOUTS[key] && LAYOUTS[key].base) || key; }

  var T = {
    en: {
      about: 'About us', gallery: 'Gallery', reviews: 'What customers say', faq: 'Questions & answers', contact: 'Contact us',
      call: 'Call now', whatsapp: 'Chat on WhatsApp', book: 'Book appointment', buy: 'Buy now',
      cCall: 'Call', cWhatsapp: 'Enquire', cBook: 'Book', cBuy: 'Buy now',
      name: 'Your name', phone: 'Mobile number', msg: 'Message (optional)', send: 'Send enquiry',
      thanks: 'Thank you! We will contact you soon.', err: 'Something went wrong. Please try again.',
      hours: 'Opening hours', address: 'Address', directions: 'Get directions', closed: 'Closed', enqTitle: 'Send us an enquiry',
      email: 'Email', instagram: 'Instagram', powered: 'Powered by', menuAbout: 'About', menuGallery: 'Gallery', menuReviews: 'Reviews', menuFaq: 'FAQ', menuContact: 'Contact'
    },
    hi: {
      about: 'हमारे बारे में', gallery: 'गैलरी', reviews: 'ग्राहक क्या कहते हैं', faq: 'सवाल-जवाब', contact: 'संपर्क करें',
      call: 'अभी कॉल करें', whatsapp: 'WhatsApp पर चैट करें', book: 'अपॉइंटमेंट बुक करें', buy: 'अभी खरीदें',
      cCall: 'कॉल करें', cWhatsapp: 'पूछें', cBook: 'बुक करें', cBuy: 'अभी खरीदें',
      name: 'आपका नाम', phone: 'मोबाइल नंबर', msg: 'संदेश (ज़रूरी नहीं)', send: 'पूछताछ भेजें',
      thanks: 'धन्यवाद! हम जल्दी ही आपसे संपर्क करेंगे।', err: 'कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।',
      hours: 'खुलने का समय', address: 'पता', directions: 'रास्ता देखें', closed: 'बंद', enqTitle: 'हमें पूछताछ भेजें',
      email: 'ईमेल', instagram: 'इंस्टाग्राम', powered: 'Powered by', menuAbout: 'हमारे बारे में', menuGallery: 'गैलरी', menuReviews: 'रिव्यू', menuFaq: 'सवाल-जवाब', menuContact: 'संपर्क'
    }
  };

  T.en.items = 'items'; T.hi.items = 'आइटम'; T.en.close = 'Close'; T.hi.close = 'बंद करें';
  T.en.ex = { about: 'Our story', offers: 'Explore', gallery: 'Moments', reviews: 'Testimonials', faq: 'Good to know', contact: 'Get in touch' };
  T.hi.ex = { about: 'हमारी कहानी', offers: 'देखिए', gallery: 'झलकियाँ', reviews: 'भरोसा', faq: 'जानकारी', contact: 'संपर्क' };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nl(s) { return esc(s).replace(/\r?\n/g, '<br>'); }
  function safeUrl(u) {
    try { var x = new URL(String(u || '')); if (x.protocol === 'https:' || x.protocol === 'http:') return x.href; } catch (e) { /* ignore */ }
    return '';
  }
  function cssUrl(u) { var s = safeUrl(u); return s ? 'url("' + s.replace(/"/g, '%22').replace(/\\/g, '%5C') + '")' : ''; }
  function rgba(hex, a) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16) || 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function jsonForScript(o) {
    var j = JSON.stringify(o).replace(/</g, '\\u003c'); return j.split(String.fromCharCode(8232)).join('\\u2028').split(String.fromCharCode(8233)).join('\\u2029');
  }
  function slugify(s) {
    var v = String(s || '').toLowerCase();
    try { v = v.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* ignore */ }
    v = v.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '');
    return v;
  }
  function waNumber(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10) return '91' + d;
    if (d.length === 11 && d.charAt(0) === '0') return '91' + d.slice(1);
    return d;
  }
  function fmtTime(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    if (!m) return String(t || '');
    var h = parseInt(m[1], 10), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m[2] + ' ' + ap;
  }
  function hoursFromWorking(wh) {
    if (!wh || typeof wh !== 'object') return [];
    var days = [['monday', 'Mon'], ['tuesday', 'Tue'], ['wednesday', 'Wed'], ['thursday', 'Thu'], ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun']];
    var items = [];
    for (var i = 0; i < days.length; i++) {
      var h = wh[days[i][0]];
      if (!h || typeof h !== 'object') return [];
      var on = h.enabled !== false && h.open && h.close;
      items.push({ day: days[i][1], t: on ? fmtTime(h.open) + ' – ' + fmtTime(h.close) : 'Closed' });
    }
    var out = [];
    items.forEach(function (it) {
      var last = out[out.length - 1];
      if (last && last.t === it.t) last.to = it.day; else out.push({ from: it.day, to: it.day, t: it.t });
    });
    return out.map(function (g) { return { d: g.from === g.to ? g.from : g.from + ' – ' + g.to, t: g.t }; });
  }
  function fmtPrice(p, lang) {
    if (!p || p.amount == null || p.amount === '') return '';
    var cur = p.currency || 'INR';
    var sym = cur === 'INR' ? '₹' : cur + ' ';
    var n = function (v) { return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }); };
    if (p.type === 'starting_from') return lang === 'hi' ? sym + n(p.amount) + ' से शुरू' : 'From ' + sym + n(p.amount);
    if (p.min != null && p.max != null && Number(p.max) > Number(p.min)) return sym + n(p.min) + ' – ' + sym + n(p.max);
    var s = sym + n(p.amount);
    if (p.period) s += ' / ' + p.period;
    return s;
  }

  /* ---------- config ---------- */
  function defaultConfig(ind) {
    var I = INDUSTRIES[ind] || INDUSTRIES.retail;
    return {
      v: 1, lang: 'hi', industry: INDUSTRIES[ind] ? ind : '',
      layout: I.pref[0], theme: I.theme, font: I.font,
      brand: { name: '', tagline: '', about: '', category: '', logoUrl: '', coverUrl: '' },
      contact: { phone: '', whatsapp: '', email: '', address: '', instagram: '', hours: [], showMap: true, form: true },
      cta: { actions: { whatsapp: true, call: true, book: I.cta === 'book', buy: I.cta === 'buy' }, primary: I.cta, secondary: I.cta2, waMessage: '' },
      sections: SECTION_IDS.map(function (id) { return { id: id, on: true }; }),
      gallery: [], useOfferPhotos: true, banners: [], announce: [], showCats: true,
      reviews: [], faq: [],
      offers: { hidden: [], showPrices: true },
      imageMap: {}
    };
  }

  function merge(base, src) {
    if (src === undefined || src === null) return base;
    if (Array.isArray(base)) return Array.isArray(src) ? src : base;
    if (base && typeof base === 'object') {
      var o = {}, k;
      if (!src || typeof src !== 'object' || Array.isArray(src)) return base;
      for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = merge(base[k], src[k]);
      for (k in src) if (Object.prototype.hasOwnProperty.call(src, k) && !(k in base)) o[k] = src[k];
      return o;
    }
    return typeof src === typeof base ? src : base;
  }

  function str(v, n) { return String(v == null ? '' : v).slice(0, n); }

  function normalize(cfg) {
    var c = merge(defaultConfig(cfg && cfg.industry), cfg || {});
    c.lang = c.lang === 'en' ? 'en' : 'hi';
    if (!THEMES[c.theme]) c.theme = 'emerald';
    if (!FONTS[c.font]) c.font = 'modern';
    if (!LAYOUTS[c.layout]) c.layout = 'classic';
    if (c.industry && !INDUSTRIES[c.industry]) c.industry = '';
    var seen = {}, secs = [];
    (Array.isArray(c.sections) ? c.sections : []).forEach(function (s) {
      if (s && SECTION_IDS.indexOf(s.id) >= 0 && !seen[s.id]) { seen[s.id] = 1; secs.push({ id: s.id, on: s.on !== false }); }
    });
    SECTION_IDS.forEach(function (id) { if (!seen[id]) secs.push({ id: id, on: true }); });
    c.sections = secs;
    c.brand.name = str(c.brand.name, 80); c.brand.tagline = str(c.brand.tagline, 160);
    c.brand.about = str(c.brand.about, 1200); c.brand.category = str(c.brand.category, 60);
    c.contact.hours = (c.contact.hours || []).slice(0, 8).map(function (h) { return { d: str(h && h.d, 30), t: str(h && h.t, 40) }; });
    c.gallery = (c.gallery || []).filter(function (u) { return !!safeUrl(u); }).slice(0, 12);
    c.banners = (c.banners || []).filter(function (u) { return !!safeUrl(u); }).slice(0, 3);
    c.announce = (c.announce || []).map(function (x) { return str(x, 70).trim(); }).filter(Boolean).slice(0, 5);
    c.showCats = c.showCats !== false;
    c.reviews = (c.reviews || []).slice(0, 6).map(function (r) {
      var s = parseInt(r && r.stars, 10); if (!(s >= 1 && s <= 5)) s = 5;
      return { name: str(r && r.name, 60), text: str(r && r.text, 400), stars: s };
    });
    c.faq = (c.faq || []).slice(0, 10).map(function (f) { return { q: str(f && f.q, 160), a: str(f && f.a, 600) }; });
    c.offers.hidden = (c.offers.hidden || []).slice(0, 200);
    var acts = c.cta.actions;
    var order = ['whatsapp', 'call', 'book', 'buy'];
    if (!acts[c.cta.primary]) { c.cta.primary = order.filter(function (k) { return acts[k]; })[0] || 'whatsapp'; acts[c.cta.primary] = true; }
    if (c.cta.secondary !== 'none' && (!acts[c.cta.secondary] || c.cta.secondary === c.cta.primary)) {
      c.cta.secondary = order.filter(function (k) { return acts[k] && k !== c.cta.primary; })[0] || 'none';
    }
    return c;
  }

  /* ---------- actions ---------- */
  function actionHref(kind, c, offer) {
    var L = c.lang, name = c.brand.name || '';
    var wa = waNumber(c.contact.whatsapp || c.contact.phone);
    var tel = waNumber(c.contact.phone || c.contact.whatsapp);
    var msg;
    if (kind === 'call') return tel ? 'tel:+' + tel : '#';
    if (!wa) return '#';
    if (kind === 'buy') {
      msg = L === 'hi' ? 'नमस्ते ' + name + ', मुझे ' + (offer ? offer.name : 'ऑर्डर करना') + ' चाहिए।' : 'Hi ' + name + ', I would like to buy ' + (offer ? offer.name : 'something') + '.';
    } else if (kind === 'book') {
      msg = L === 'hi' ? 'नमस्ते ' + name + ', मैं ' + (offer ? offer.name + ' के लिए ' : '') + 'अपॉइंटमेंट बुक करना चाहता/चाहती हूँ।' : 'Hi ' + name + ', I would like to book an appointment' + (offer ? ' for ' + offer.name : '') + '.';
    } else {
      msg = offer
        ? (L === 'hi' ? 'नमस्ते ' + name + ', मुझे ' + offer.name + ' के बारे में जानकारी चाहिए।' : 'Hi ' + name + ', I would like to know more about ' + offer.name + '.')
        : (c.cta.waMessage || (L === 'hi' ? 'नमस्ते ' + name + ', मुझे आपकी वेबसाइट से जानकारी चाहिए।' : 'Hi ' + name + ', I found you on your website and need some information.'));
    }
    return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(msg);
  }
  function labelOf(kind, t, short) {
    if (short) return { call: t.cCall, whatsapp: t.cWhatsapp, book: t.cBook, buy: t.cBuy }[kind] || t.cWhatsapp;
    return { call: t.call, whatsapp: t.whatsapp, book: t.book, buy: t.buy }[kind] || t.whatsapp;
  }
  function ctaBtn(kind, c, t, cls, offer, short) {
    var href = actionHref(kind, c, offer);
    var ext = href.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '';
    return '<a class="btn ' + (cls || '') + '" href="' + esc(href) + '"' + ext + ' data-ev="' + kind + '" data-label="' + esc(offer ? offer.name : '') + '"' +
      (offer ? ' data-offer="' + esc(offer.id || '') + '"' : '') + '>' + esc(labelOf(kind, t, short)) + '</a>';
  }

  /* ---------- sections ---------- */
  function visibleOffers(c, offers) {
    var hidden = c.offers.hidden || [];
    return (Array.isArray(offers) ? offers : []).filter(function (o) { return o && o.id && hidden.indexOf(o.id) < 0; }).slice(0, 60);
  }
  function offerImg(o) {
    var imgs = (o.images || []).filter(function (u) { return !!safeUrl(u); });
    return imgs[0] || '';
  }
  function galleryImages(c, offers) {
    var list = c.gallery.slice();
    if (c.useOfferPhotos) offers.forEach(function (o) { var u = offerImg(o); if (u && list.indexOf(u) < 0) list.push(u); });
    return list.slice(0, 12);
  }
  function hasContact(c) {
    var k = c.contact;
    return !!(k.phone || k.whatsapp || k.email || k.address || k.instagram || (k.hours && k.hours.length));
  }
  function activeSections(c, offers) {
    var vis = [];
    c.sections.forEach(function (s) {
      if (!s.on) return;
      var ok = true;
      if (s.id === 'about') ok = !!c.brand.about.trim();
      else if (s.id === 'offers') ok = offers.length > 0;
      else if (s.id === 'gallery') ok = galleryImages(c, offers).length > 0;
      else if (s.id === 'reviews') ok = c.reviews.filter(function (r) { return r.text; }).length > 0;
      else if (s.id === 'faq') ok = c.faq.filter(function (f) { return f.q && f.a; }).length > 0;
      else if (s.id === 'contact') ok = hasContact(c);
      if (ok) vis.push(s.id);
    });
    return vis;
  }

  function renderOffers(c, offers, t, I) {
    var kinds = ['buy', 'book', 'whatsapp', 'call'];
    var cardKind = kinds.indexOf(c.cta.primary) >= 0 ? c.cta.primary : 'whatsapp';
    var title = I.offers[c.lang] || I.offers.en;
    var cats = [], cm = {};
    offers.forEach(function (o) {
      var k = o.category;
      if (!k) return;
      if (!cm[k]) { cm[k] = { n: k, img: '', count: 0 }; cats.push(cm[k]); }
      cm[k].count++; if (!cm[k].img) cm[k].img = offerImg(o);
    });
    var catHtml = '';
    if (c.showCats && cats.length > 1) {
      catHtml = '<div class="cats">' + cats.slice(0, 14).map(function (k) {
        var ci = k.img ? '<span class="ci" style="background-image:' + esc(cssUrl(k.img)) + '"></span>' : '<span class="ci">' + esc(k.n.charAt(0).toUpperCase()) + '</span>';
        return '<button type="button" class="cat" data-cat="' + esc(k.n) + '">' + ci + '<b>' + esc(k.n) + '</b><small>' + k.count + ' ' + t.items + '</small></button>';
      }).join('') + '</div>';
    }
    var cards = offers.map(function (o, i) {
      var img = offerImg(o), price = c.offers.showPrices ? fmtPrice(o.price, c.lang) : '';
      var im = img ? '<div class="im" style="background-image:' + esc(cssUrl(img)) + '"></div>'
        : '<div class="im ph">' + esc((o.name || '?').trim().charAt(0).toUpperCase()) + '</div>';
      var d = o.short || o.desc || '';
      return '<article class="card" data-i="' + i + '" data-cat="' + esc(o.category || '') + '">' + im + '<div class="cb">' +
        (o.category ? '<span class="tag">' + esc(o.category) + '</span>' : '') +
        '<h3>' + esc(o.name) + '</h3>' +
        (d ? '<p class="d">' + esc(d) + '</p>' : '') +
        '<div class="row">' + (price ? '<b class="pr">' + esc(price) + '</b>' : '<span></span>') +
        ctaBtn(cardKind, c, t, 'sm', o, true) + '</div></div></article>';
    }).join('');
    return '<section class="sec" id="offers" data-sec="offers"><div class="wrap"><h2>' + esc(title) + '</h2>' + catHtml + '<div class="grid">' + cards + '</div></div></section>';
  }

  function offerData(c, offers, t) {
    var kind = c.cta.primary, wa = waNumber(c.contact.whatsapp || c.contact.phone);
    return offers.map(function (o) {
      var imgs = (o.images || []).filter(function (u) { return !!safeUrl(u); }).slice(0, 4);
      var useKind = (kind === 'call' || kind === 'whatsapp') && !wa && kind !== 'call' ? 'call' : kind;
      return {
        id: o.id, name: o.name, desc: o.desc || o.short || '', cat: o.category || '', images: imgs,
        price: c.offers.showPrices ? fmtPrice(o.price, c.lang) : '',
        k: useKind, href: actionHref(useKind, c, o), label: labelOf(useKind, t, false),
        wa: useKind !== 'whatsapp' && wa ? actionHref('whatsapp', c, o) : '', waLabel: t.whatsapp
      };
    });
  }

  function renderContact(c, t) {
    var k = c.contact, rows = '';
    if (k.address) rows += '<div class="ir"><span>📍</span><div><b>' + t.address + '</b><p>' + nl(k.address) + '</p></div></div>';
    if (k.phone) rows += '<div class="ir"><span>📞</span><div><b>' + esc(k.phone) + '</b><p><a data-ev="call" href="' + esc(actionHref('call', c)) + '">' + t.call + '</a></p></div></div>';
    if (k.whatsapp) rows += '<div class="ir"><span>💬</span><div><b>WhatsApp</b><p><a data-ev="whatsapp" target="_blank" rel="noopener" href="' + esc(actionHref('whatsapp', c)) + '">' + t.whatsapp + '</a></p></div></div>';
    if (k.email) rows += '<div class="ir"><span>✉️</span><div><b>' + t.email + '</b><p>' + esc(k.email) + '</p></div></div>';
    if (k.instagram) {
      var handle = k.instagram.replace(/^@/, '');
      var ig = /^https?:\/\//i.test(k.instagram) ? safeUrl(k.instagram) : (/^[A-Za-z0-9._]{1,30}$/.test(handle) ? 'https://instagram.com/' + handle : '');
      if (ig) rows += '<div class="ir"><span>📷</span><div><b>' + t.instagram + '</b><p><a target="_blank" rel="noopener" href="' + esc(ig) + '">' + esc(k.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, '')) + '</a></p></div></div>';
    }
    var hours = '';
    if (k.hours && k.hours.length) {
      hours = '<div class="ir"><span>🕘</span><div><b>' + t.hours + '</b><table class="hrs">' + k.hours.filter(function (h) { return h.d || h.t; }).map(function (h) {
        return '<tr><td>' + esc(h.d) + '</td><td>' + esc(h.t === 'Closed' ? t.closed : h.t) + '</td></tr>';
      }).join('') + '</table></div></div>';
    }
    var map = '';
    if (k.address && k.showMap) {
      var q = encodeURIComponent((c.brand.name ? c.brand.name + ', ' : '') + k.address);
      map = '<div class="map"><iframe title="Map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=' + q + '&output=embed"></iframe></div>' +
        '<p class="dir"><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + q + '">' + t.directions + ' →</a></p>';
    }
    var form = k.form
      ? '<form class="enq" id="enq" autocomplete="on"><h3>' + t.enqTitle + '</h3>' +
        '<input name="name" required minlength="2" maxlength="80" placeholder="' + esc(t.name) + '" autocomplete="name">' +
        '<input name="phone" required type="tel" inputmode="numeric" maxlength="14" placeholder="' + esc(t.phone) + '" autocomplete="tel">' +
        '<textarea name="msg" rows="3" maxlength="500" placeholder="' + esc(t.msg) + '"></textarea>' +
        '<button class="btn" type="submit">' + t.send + '</button><p class="enqm" id="enqm" role="status"></p></form>'
      : '';
    return '<section class="sec" id="contact" data-sec="contact"><div class="wrap"><h2>' + t.contact + '</h2>' +
      '<div class="ct"><div class="info">' + rows + hours + map + '</div>' + form + '</div></div></section>';
  }

  function renderSectionRaw(id, c, offers, t, I) {
    if (id === 'about') return '<section class="sec" id="about" data-sec="about"><div class="wrap"><h2>' + t.about + '</h2><p class="ab">' + nl(c.brand.about) + '</p></div></section>';
    if (id === 'offers') return renderOffers(c, offers, t, I);
    if (id === 'gallery') {
      return '<section class="sec" id="gallery" data-sec="gallery"><div class="wrap"><h2>' + t.gallery + '</h2><div class="gal">' +
        galleryImages(c, offers).map(function (u) { return '<div class="gi" style="background-image:' + esc(cssUrl(u)) + '"></div>'; }).join('') + '</div></div></section>';
    }
    if (id === 'reviews') {
      return '<section class="sec" id="reviews" data-sec="reviews"><div class="wrap"><h2>' + t.reviews + '</h2><div class="rv">' +
        c.reviews.filter(function (r) { return r.text; }).map(function (r) {
          return '<figure class="rc"><div class="st">' + '★★★★★'.slice(0, r.stars) + '<i>' + '★★★★★'.slice(0, 5 - r.stars) + '</i></div><blockquote>' + nl(r.text) + '</blockquote><figcaption>' + esc(r.name) + '</figcaption></figure>';
        }).join('') + '</div></div></section>';
    }
    if (id === 'faq') {
      return '<section class="sec" id="faq" data-sec="faq"><div class="wrap narrow"><h2>' + t.faq + '</h2>' +
        c.faq.filter(function (f) { return f.q && f.a; }).map(function (f) { return '<details><summary>' + esc(f.q) + '</summary><p>' + nl(f.a) + '</p></details>'; }).join('') + '</div></section>';
    }
    if (id === 'contact') return renderContact(c, t);
    return '';
  }

  function renderSection(id, c, offers, t, I) {
    var h = renderSectionRaw(id, c, offers, t, I);
    return h.replace('<h2>', '<span class="eb">' + esc((t.ex || {})[id] || '') + '</span><h2>');
  }

  function accentTitle(txt) {
    var w = String(txt || '').trim().split(/\s+/);
    if (w.length < 2) return esc(txt);
    var n = w.length > 3 ? 2 : 1;
    return esc(w.slice(0, w.length - n).join(' ')) + ' <em>' + esc(w.slice(w.length - n).join(' ')) + '</em>';
  }

  function extraCss(c) {
    return '' +
      '.ann{background:var(--tx);color:var(--bg);overflow:hidden;white-space:nowrap;font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;padding:11px 0}' +
      '.ann .mq{display:inline-flex;animation:mq 34s linear infinite}.ann span{padding:0 22px}.ann i{color:var(--p2);font-style:normal;padding:0 4px}@keyframes mq{to{transform:translateX(-50%)}}' +
      '.eb{display:none}.card[data-i]{cursor:pointer}' +
      '.wa{position:fixed;right:16px;bottom:88px;z-index:35;width:58px;height:58px;border-radius:50%;background:#25d366;display:grid;place-items:center;box-shadow:0 10px 24px rgba(37,211,102,.45)}.wa svg{width:30px;height:30px;fill:#fff}@media(min-width:900px){.wa{bottom:24px}}' +
      '.cats{display:flex;gap:16px;overflow-x:auto;padding:4px 2px 20px;margin-bottom:8px;scrollbar-width:none}.cats::-webkit-scrollbar{display:none}' +
      '.cat{flex:0 0 auto;width:104px;text-align:center;background:none;border:0;cursor:pointer;font:inherit;color:var(--tx)}' +
      '.cat .ci{display:grid;place-items:center;width:88px;height:88px;margin:0 auto 8px;border-radius:50%;background:' + rgba(THEMES[c.theme].p, .12) + ' center/cover no-repeat;border:3px solid transparent;box-shadow:0 0 0 1.5px var(--bd);font-weight:800;font-size:1.5rem;color:var(--p)}' +
      '.cat.on .ci{border-color:var(--p)}.cat b{display:block;font-family:var(--hf),"Noto Sans Devanagari",serif;font-size:.9rem;line-height:1.25}.cat small{color:var(--mu);font-size:.72rem;letter-spacing:.05em}' +
      '@media(min-width:700px){.cats{justify-content:center}.cat{width:136px}.cat .ci{width:112px;height:112px}}' +
      '.slides{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}.slides::-webkit-scrollbar{display:none}' +
      '.slide{flex:0 0 100%;scroll-snap-align:center;background:center/cover no-repeat;aspect-ratio:16/10}' +
      '.dots{display:flex;justify-content:center;gap:8px;margin-top:14px}.dots span{width:9px;height:9px;border-radius:99px;background:var(--bd);cursor:pointer;transition:.25s}.dots span.on{width:28px;background:var(--p2)}' +
      '.hero-img.sl{background:none;overflow:hidden}.hero-img.sl .slides{height:100%}.hero-img.sl .slide{aspect-ratio:auto;height:100%}' +
      '.L-luxury .ann{background:var(--tx)}.L-luxury .nav{background:var(--bg)}' +
      '.L-luxury .nav-in{display:grid;grid-template-columns:1fr auto 1fr;height:76px}.L-luxury .menu{grid-column:1;grid-row:1}.L-luxury .brand{grid-column:2;grid-row:1;flex-direction:column;gap:2px;text-align:center;font-size:.85rem}' +
      '.L-luxury .nav-in>.btn{grid-column:3;grid-row:1;justify-self:end}.L-luxury .logo{width:46px;height:46px}' +
      '.L-luxury .hero{padding:0 0 8px}.L-luxury .slides{gap:0}.L-luxury .slide{aspect-ratio:16/10}.L-luxury .hero-in{text-align:center;padding:26px 0 4px}' +
      '.L-luxury .hero h1{font-size:clamp(1.5rem,5vw,2.4rem);font-weight:500}.L-luxury .cta-row{justify-content:center}.L-luxury .hero .chip{background:transparent;letter-spacing:.2em;text-transform:uppercase;padding:0;margin-bottom:8px}' +
      '.L-luxury .hero-img{aspect-ratio:16/8}.L-luxury .dots{margin:-26px 0 18px;position:relative}.L-luxury .dots span{background:rgba(255,255,255,.55)}.L-luxury .dots span.on{background:#fff}' +
      '.L-luxury .eb,.L-editorial .eb{display:block;text-align:center;font-size:.76rem;letter-spacing:.24em;text-transform:uppercase;color:var(--p);font-weight:700;margin-bottom:6px}' +
      '.L-luxury .sec h2,.L-editorial .sec h2{text-align:center;font-weight:500}' +
      '.L-luxury .sec h2:before,.L-luxury .sec h2:after{content:"";display:inline-block;width:34px;height:1px;background:var(--p);vertical-align:middle;margin:0 14px}' +
      '.L-luxury .card{background:transparent;border:0}.L-luxury .card .im{border-radius:20px}.L-luxury .cb{text-align:center;align-items:center;padding:12px 4px}.L-luxury .card h3{font-weight:500}.L-luxury .pr{color:var(--p)}' +
      '.L-luxury .card .row{flex-direction:column;gap:8px}.L-luxury .btn{border-radius:10px;letter-spacing:.08em;text-transform:uppercase;font-size:.78rem}.L-luxury .grid{grid-template-columns:repeat(2,1fr);gap:14px}' +
      '@media(min-width:820px){.L-luxury .grid{grid-template-columns:repeat(4,1fr)}.L-luxury .hero-img{aspect-ratio:16/6}}' +
      '.L-editorial .hero{padding:44px 0 26px;text-align:center}.L-editorial .hero-txt{max-width:720px;margin:0 auto}.L-editorial .chip{background:' + rgba(THEMES[c.theme].p, .1) + ';border:1px solid ' + rgba(THEMES[c.theme].p, .12) + '}' +
      '.L-editorial .hero h1{font-size:clamp(2.2rem,8vw,3.8rem);font-weight:500;letter-spacing:-.02em}.L-editorial .hero h1 em,.L-luxury .hero h1 em{color:var(--p2);font-style:italic}' +
      '.L-editorial .tl{margin:12px auto 0}.L-editorial .cta-row{justify-content:center}.L-editorial .btn{background:var(--p)}.L-editorial .btn.ghost{background:transparent}' +
      '.L-editorial .peek{margin-top:30px}.L-editorial .slides{padding:0 11%;scroll-padding:0 11%}.L-editorial .slide{flex-basis:78%;aspect-ratio:4/5;border-radius:26px;box-shadow:0 22px 44px var(--sh)}' +
      '@media(min-width:820px){.L-editorial .peek{max-width:460px;margin-left:auto;margin-right:auto}}' +
      '.L-editorial .card{border-radius:22px}.L-editorial .nav{background:' + rgba(THEMES[c.theme].bg, .95) + '}' +
      '.mdl{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}' +
      '.mb{background:var(--bg);width:min(560px,100%);max-height:92vh;overflow:auto;border-radius:26px 26px 0 0;position:relative}@media(min-width:700px){.mdl{align-items:center}.mb{border-radius:26px}}' +
      '.mx{position:absolute;top:12px;right:12px;z-index:3;width:38px;height:38px;border-radius:50%;border:0;background:var(--sf);color:var(--tx);font-size:1.4rem;cursor:pointer;box-shadow:0 4px 12px var(--sh)}' +
      '.ms{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}.ms::-webkit-scrollbar{display:none}.ms img,.ms .mph{flex:0 0 100%;scroll-snap-align:center;aspect-ratio:1/1;object-fit:cover}' +
      '.mph{display:grid;place-items:center;font-size:4rem;font-weight:800;color:var(--on);background:linear-gradient(135deg,var(--p),var(--p2))}' +
      '.mp{padding:6px 20px 14px}.mp h3{font-size:1.3rem}.mp .pr{font-size:1.25rem;color:var(--p);display:block;margin:6px 0}.mp p{color:var(--mu);margin-top:8px}' +
      '.mact{position:sticky;bottom:0;display:flex;gap:10px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--bd)}.mact .btn{flex:1}';
  }

  /* ---------- css ---------- */
  function buildCss(c, I) {
    var th = THEMES[c.theme], fp = FONTS[c.font];
    var bd = th.dark ? 'rgba(255,255,255,.10)' : 'rgba(15,23,34,.09)';
    var shadow = th.dark ? 'rgba(0,0,0,.45)' : 'rgba(15,23,34,.14)';
    return ':root{--p:' + th.p + ';--p2:' + th.p2 + ';--bg:' + th.bg + ';--sf:' + th.sf + ';--tx:' + th.tx + ';--mu:' + th.mu + ';--on:' + th.on + ';--bd:' + bd + ';--sh:' + shadow + ';--ratio:' + I.ratio + ';--hf:' + fp.h + ';--bf:' + fp.b + '}' +
      '*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}' +
      'body{background:var(--bg);color:var(--tx);font-family:var(--bf),"Noto Sans Devanagari",system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.65;-webkit-text-size-adjust:100%;padding-bottom:78px}' +
      'h1,h2,h3{font-family:var(--hf),"Noto Sans Devanagari",system-ui,sans-serif;line-height:1.22;letter-spacing:-.01em}' +
      'a{color:inherit;text-decoration:none}img{display:block;max-width:100%}.wrap{width:min(1080px,100% - 32px);margin:0 auto}.narrow{width:min(760px,100% - 32px)}' +
      '.nav{position:sticky;top:0;z-index:20;background:' + rgba(th.bg, .92) + ';-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--bd)}' +
      '.nav-in{display:flex;align-items:center;justify-content:space-between;gap:12px;height:62px}' +
      '.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-family:var(--hf),"Noto Sans Devanagari",sans-serif;min-width:0}.brand span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.logo{width:38px;height:38px;border-radius:11px;object-fit:cover;flex:none;background:var(--sf)}' +
      '.logo.ph{display:grid;place-items:center;background:linear-gradient(135deg,var(--p),var(--p2));color:var(--on);font-weight:800}' +
      '.menu{display:none;gap:22px;font-size:.9rem;color:var(--mu)}.menu a:hover{color:var(--tx)}' +
      '.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;cursor:pointer;font:inherit;font-weight:700;padding:13px 22px;border-radius:999px;background:linear-gradient(135deg,var(--p),var(--p2));color:var(--on);font-size:.95rem;line-height:1.2;text-align:center}' +
      '.btn.ghost{background:transparent;color:var(--tx);border:1.5px solid ' + rgba(th.dark ? '#ffffff' : '#0f1722', .22) + '}.btn.sm{padding:9px 16px;font-size:.84rem}' +
      '.hero{position:relative;color:var(--tx)}.hero h1{font-size:clamp(1.9rem,6vw,3rem)}.hero .tl{color:var(--mu);font-size:1.05rem;max-width:560px;margin-top:12px}' +
      '.cta-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}' +
      '.chip{display:inline-block;padding:5px 13px;border-radius:999px;font-size:.78rem;font-weight:700;background:' + rgba(th.p, .14) + ';color:var(--p);margin-bottom:12px}' +
      '.sec{padding:56px 0}.sec h2{font-size:clamp(1.5rem,4vw,2.1rem);margin-bottom:22px}' +
      '.ab{max-width:760px;color:var(--mu);font-size:1.05rem}' +
      '.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}' +
      '.card{background:var(--sf);border:1px solid var(--bd);border-radius:20px;overflow:hidden;display:flex;flex-direction:column}' +
      '.card .im{aspect-ratio:var(--ratio);background:' + rgba(th.p, .1) + ' center/cover no-repeat}' +
      '.card .im.ph{display:grid;place-items:center;font-size:2.4rem;font-weight:800;color:var(--on);background:linear-gradient(135deg,var(--p),var(--p2))}' +
      '.cb{padding:15px;display:flex;flex-direction:column;gap:6px;flex:1}.tag{font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:var(--mu)}' +
      '.card h3{font-size:1.05rem}.card .d{color:var(--mu);font-size:.88rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
      '.card .row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:10px}.pr{font-size:1.05rem}' +
      '.gal{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.gi{aspect-ratio:1/1;border-radius:16px;background:' + rgba(th.p, .1) + ' center/cover no-repeat}' +
      '.rv{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}.rc{background:var(--sf);border:1px solid var(--bd);border-radius:18px;padding:18px}' +
      '.st{color:#f59e0b;letter-spacing:2px;font-size:1.05rem}.st i{color:' + rgba(th.mu, .35) + ';font-style:normal}.rc blockquote{margin:8px 0 10px;color:var(--tx)}.rc figcaption{color:var(--mu);font-size:.85rem;font-weight:700}' +
      'details{background:var(--sf);border:1px solid var(--bd);border-radius:14px;margin-bottom:10px;padding:2px 16px}summary{cursor:pointer;font-weight:700;padding:14px 0;list-style:none}summary::-webkit-details-marker{display:none}' +
      'summary:after{content:"+";float:right;color:var(--p);font-size:1.3rem;line-height:1}details[open] summary:after{content:"−"}details p{color:var(--mu);padding-bottom:14px}' +
      '.ct{display:grid;gap:22px}@media(min-width:820px){.ct{grid-template-columns:1.1fr .9fr;align-items:start}.menu{display:flex}}' +
      '.ir{display:flex;gap:12px;margin-bottom:16px}.ir>span{font-size:1.2rem}.ir b{display:block}.ir p{color:var(--mu)}.ir a{color:var(--p);font-weight:700}.hrs{border-collapse:collapse;color:var(--mu);font-size:.92rem}.hrs td{padding:2px 18px 2px 0}' +
      '.map{border-radius:16px;overflow:hidden;border:1px solid var(--bd);margin-top:8px}.map iframe{display:block;width:100%;height:240px;border:0}.dir{margin-top:8px}.dir a{color:var(--p);font-weight:700}' +
      '.enq{background:var(--sf);border:1px solid var(--bd);border-radius:20px;padding:20px;display:grid;gap:10px}.enq h3{font-size:1.1rem}' +
      '.enq input,.enq textarea{width:100%;font:inherit;color:var(--tx);background:var(--bg);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;outline:none}.enq input:focus,.enq textarea:focus{border-color:var(--p)}' +
      '.enqm{min-height:1.2em;font-size:.88rem;color:var(--p);font-weight:600}' +
      '.foot{padding:26px 0 18px;text-align:center;color:var(--mu);font-size:.82rem;border-top:1px solid var(--bd)}.foot a{color:var(--p);font-weight:800}' +
      '.bar{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:' + rgba(th.sf, .96) + ';border-top:1px solid var(--bd);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}.bar .btn{flex:1}' +
      '@media(min-width:900px){.bar{display:none}body{padding-bottom:0}}' +
      '.hero-img{background:var(--cover,linear-gradient(135deg,var(--p),var(--p2))) center/cover no-repeat}' +
      '.L-classic .hero{padding:78px 0 68px;text-align:center;background:linear-gradient(135deg,var(--p),var(--p2));color:var(--on)}' +
      '.L-classic .hero.cv{background:linear-gradient(rgba(0,0,0,.42),rgba(0,0,0,.58)),var(--cover) center/cover no-repeat;color:#fff}' +
      '.L-classic .hero .tl{margin:12px auto 0;color:inherit;opacity:.93}.L-classic .cta-row{justify-content:center}.L-classic .hero .chip{background:rgba(255,255,255,.22);color:inherit}' +
      '.L-classic .hero .btn{background:#fff;color:#111}.L-classic .hero .btn.ghost{background:transparent;color:inherit;border-color:rgba(255,255,255,.7)}' +
      '.L-bold .hero{padding:44px 0 28px;overflow:hidden}.L-bold .hero:before{content:"";position:absolute;right:-110px;top:-150px;width:430px;height:430px;border-radius:50%;background:linear-gradient(135deg,var(--p),var(--p2));opacity:.17}' +
      '.L-bold .hero-in{display:grid;gap:28px;align-items:center;position:relative}@media(min-width:820px){.L-bold .hero-in{grid-template-columns:1.1fr .9fr}}' +
      '.L-bold .hero h1{font-size:clamp(2.2rem,7vw,3.8rem);letter-spacing:-.03em}.L-bold .hero-img{aspect-ratio:4/3;border-radius:30px;box-shadow:0 26px 54px var(--sh)}' +
      '.L-bold .card{border-radius:24px}.L-bold .sec h2{letter-spacing:-.02em}' +
      '.L-minimal .hero{padding:40px 0 14px}.L-minimal .hero h1{font-size:clamp(1.8rem,5vw,2.6rem);font-weight:600}.L-minimal .hero-img{margin-top:26px;aspect-ratio:16/7;border-radius:14px}' +
      '.L-minimal .sec{padding:44px 0;border-top:1px solid var(--bd)}.L-minimal .hero + .sec{border-top:0}' +
      '.L-minimal .grid{grid-template-columns:1fr;gap:0}.L-minimal .card{flex-direction:row;align-items:center;gap:14px;border:0;border-bottom:1px solid var(--bd);border-radius:0;background:transparent;padding:14px 0}' +
      '.L-minimal .card .im{width:84px;height:84px;aspect-ratio:auto;border-radius:12px;flex:none}.L-minimal .cb{padding:0;flex:1}.L-minimal .card .row{padding-top:4px}' +
      '.L-showcase .hero{padding:0}.L-showcase .hero-img{height:min(60vh,470px)}.L-showcase .hero-in{margin-top:-70px;position:relative}' +
      '.L-showcase .hero-txt{background:var(--sf);border:1px solid var(--bd);border-radius:26px;padding:24px 22px;box-shadow:0 20px 44px var(--sh)}.L-showcase .hero h1{font-size:clamp(1.7rem,5vw,2.5rem)}' +
      '.L-showcase .card{border-radius:24px;box-shadow:0 10px 26px var(--sh);border:0}.L-showcase .grid{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}';
  }

  /* ---------- runtime (runs inside the generated page) ---------- */
  function runtime() {
    var G = window.__GS || {}, P = !!G.preview, vid = '', lastOffer = null, mdl = null;
    try { vid = localStorage.getItem('gs_vid') || ''; if (!vid) { vid = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem('gs_vid', vid); } }
    catch (e) { vid = 'v' + Math.random().toString(36).slice(2, 12); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function rpc(fn, body) {
      return fetch(G.api + '/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: G.key }, body: JSON.stringify(body), keepalive: true });
    }
    function track(ev, label) {
      if (P || !G.slug) return;
      rpc('website_public_track', { p_slug: G.slug, p_event: ev, p_visitor: vid, p_meta: { label: label || '' } }).catch(function () { /* ignore */ });
    }
    function slider(box, dots, auto) {
      if (!box) return;
      var n = box.children.length, cur = 0, timer = 0;
      if (n < 2) { if (dots) dots.style.display = 'none'; return; }
      var spans = [];
      if (dots) { dots.innerHTML = ''; for (var i = 0; i < n; i++) { var sp = document.createElement('span'); sp.setAttribute('data-d', i); dots.appendChild(sp); spans.push(sp); } }
      function show(k) { cur = k; spans.forEach(function (s, j) { s.className = j === k ? 'on' : ''; }); }
      function go(k) { box.scrollTo({ left: k * (box.scrollWidth / n), behavior: 'smooth' }); show(k); }
      box.addEventListener('scroll', function () { show(Math.max(0, Math.min(n - 1, Math.round(box.scrollLeft / (box.scrollWidth / n))))); });
      if (dots) dots.addEventListener('click', function (e) { var d = e.target.getAttribute && e.target.getAttribute('data-d'); if (d !== null && d !== undefined) go(+d); });
      show(0);
      if (auto && !G.mini) {
        timer = setInterval(function () { go((cur + 1) % n); }, 4500);
        box.addEventListener('touchstart', function () { clearInterval(timer); }, { passive: true });
      }
    }
    function closeM() { if (mdl) { mdl.remove(); mdl = null; document.body.style.overflow = ''; } }
    function openM(i) {
      var o = (G.offers || [])[i]; if (!o) return;
      closeM();
      var imgs = o.images.length ? o.images.map(function (u) { return '<img src="' + esc(u) + '" alt="">'; }).join('') : '<div class="mph">' + esc((o.name || '?').charAt(0).toUpperCase()) + '</div>';
      var ext = o.href.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '';
      var h = '<div class="mb" role="dialog" aria-modal="true"><button class="mx" data-x aria-label="' + esc(G.closeLbl) + '">×</button>' +
        '<div class="ms" id="ms">' + imgs + '</div><div class="dots" id="md"></div><div class="mp">' +
        (o.cat ? '<small style="color:var(--mu);text-transform:uppercase;letter-spacing:.08em">' + esc(o.cat) + '</small>' : '') +
        '<h3>' + esc(o.name) + '</h3>' + (o.price ? '<b class="pr">' + esc(o.price) + '</b>' : '') +
        (o.desc ? '<p>' + esc(o.desc).replace(/\n/g, '<br>') + '</p>' : '') + '</div>' +
        '<div class="mact"><a class="btn" href="' + esc(o.href) + '"' + ext + ' data-ev="' + esc(o.k) + '" data-label="' + esc(o.name) + '" data-offer="' + esc(o.id) + '">' + esc(o.label) + '</a>' +
        (o.wa ? '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(o.wa) + '" data-ev="whatsapp" data-label="' + esc(o.name) + '" data-offer="' + esc(o.id) + '">' + esc(o.waLabel) + '</a>' : '') + '</div></div>';
      mdl = document.createElement('div'); mdl.className = 'mdl'; mdl.innerHTML = h;
      document.body.appendChild(mdl); document.body.style.overflow = 'hidden';
      slider(mdl.querySelector('#ms'), mdl.querySelector('#md'), false);
      lastOffer = /^[0-9a-f-]{36}$/i.test(o.id) ? o.id : null;
    }
    function filter(btn) {
      var k = btn.getAttribute('data-cat'), on = btn.classList.contains('on');
      var bs = document.querySelectorAll('.cats .cat');
      for (var i = 0; i < bs.length; i++) bs[i].classList.remove('on');
      if (on) k = ''; else btn.classList.add('on');
      var cards = document.querySelectorAll('.card[data-cat]');
      for (var j = 0; j < cards.length; j++) cards[j].style.display = (!k || cards[j].getAttribute('data-cat') === k) ? '' : 'none';
    }
    slider(document.querySelector('.slides'), document.querySelector('.hero .dots'), true);
    if (!P) track('view');
    if (P) {
      window.addEventListener('load', function () {
        var el = G.scrollTo ? document.getElementById(G.scrollTo) : null;
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 70);
        else if (G.scrollY) window.scrollTo(0, G.scrollY);
      });
      var tk = 0;
      window.addEventListener('scroll', function () {
        if (tk) return;
        tk = setTimeout(function () { tk = 0; try { parent.postMessage({ gs: 'scroll', y: window.pageYOffset }, '*'); } catch (e) { /* ignore */ } }, 150);
      });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeM(); });
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var cb = t.closest('button.cat');
      if (cb) { filter(cb); return; }
      if (mdl && (t === mdl || t.closest('[data-x]'))) { closeM(); return; }
      var a = t.closest('[data-ev]');
      if (P) {
        var sec = t.closest('[data-sec]');
        if (sec) { try { parent.postMessage({ gs: 'select', id: sec.getAttribute('data-sec') }, '*'); } catch (x) { /* ignore */ } }
        var cd = t.closest('.card[data-i]');
        if (cd && !a) openM(+cd.getAttribute('data-i'));
        if (t.closest('a,button')) e.preventDefault();
        return;
      }
      if (a) {
        var off = a.getAttribute('data-offer');
        if (off && /^[0-9a-f-]{36}$/i.test(off)) lastOffer = off;
        track(a.getAttribute('data-ev'), a.getAttribute('data-label') || '');
        return;
      }
      var card = t.closest('.card[data-i]');
      if (card) openM(+card.getAttribute('data-i'));
    });
    var f = document.getElementById('enq');
    if (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (P) return;
        var m = document.getElementById('enqm'), b = f.querySelector('button');
        b.disabled = true; m.textContent = '…';
        rpc('website_public_enquiry', { p_slug: G.slug, p_name: f.elements.name.value, p_phone: f.elements.phone.value, p_message: f.elements.msg.value, p_offer_id: lastOffer, p_visitor: vid })
          .then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
              if (!r.ok) throw new Error(j.message || G.err);
              m.textContent = G.thanks; f.reset();
            });
          })
          .catch(function (er) { m.textContent = (er && er.message) || G.err; })
          .then(function () { b.disabled = false; });
      });
    }
  }

  /* ---------- document ---------- */
  function buildDocument(cfg, data, opts) {
    var c = normalize(cfg);
    data = data || {}; opts = opts || {};
    var lay = structureOf(c.layout);
    var L = c.lang, t = T[L], I = INDUSTRIES[c.industry] || INDUSTRIES.retail, fp = FONTS[c.font];
    var offers = visibleOffers(c, data.offers);
    var secs = activeSections(c, offers);
    if (opts.mini) secs = secs.filter(function (s) { return s === 'offers' || s === 'about'; }).slice(0, 1);
    var name = c.brand.name || (L === 'hi' ? 'आपका बिज़नेस' : 'Your business');
    var logo = safeUrl(c.brand.logoUrl), cover = safeUrl(c.brand.coverUrl);
    var logoHtml = logo ? '<img class="logo" alt="" src="' + esc(logo) + '">' : '<span class="logo ph">' + esc(name.trim().charAt(0).toUpperCase()) + '</span>';
    var primary = c.cta.primary, secondary = c.cta.secondary;
    var tagline = c.brand.tagline || '';
    var chip = c.brand.category || I.n[L] || I.n.en;

    var menuMap = { about: t.menuAbout, offers: I.offers[L] || I.offers.en, gallery: t.menuGallery, reviews: t.menuReviews, faq: t.menuFaq, contact: t.menuContact };
    var menu = secs.map(function (id) { return '<a href="#' + id + '">' + esc(menuMap[id]) + '</a>'; }).join('');
    var nav = '<header class="nav"><div class="wrap nav-in"><a class="brand" href="#top">' + logoHtml + '<span>' + esc(name) + '</span></a>' +
      '<nav class="menu">' + menu + '</nav>' + ctaBtn(primary, c, t, 'sm', null, false) + '</div></header>';

    var banners = c.banners.slice();
    var coverVar0 = cover || banners[0] || '';
    cover = coverVar0;
    var coverVar = cover ? '--cover:' + cssUrl(cover) + ';' : '';
    var slidesHtml = banners.length ? '<div class="slides">' + banners.map(function (u) { return '<div class="slide" style="background-image:' + esc(cssUrl(u)) + '"></div>'; }).join('') + '</div>' : '';
    var dotsHtml = banners.length > 1 ? '<div class="dots"></div>' : '';
    var media = banners.length
      ? '<div class="hero-img sl">' + slidesHtml + '</div>'
      : '<div class="hero-img" style="' + esc(coverVar) + '"></div>';
    var headline = tagline && (lay === 'editorial' || lay === 'luxury') ? accentTitle(tagline) : esc(name);
    var showTl = tagline && !(lay === 'editorial' || lay === 'luxury');
    var txt = '<div class="hero-txt"><span class="chip">' + esc(chip) + '</span><h1>' + headline + '</h1>' +
      (showTl ? '<p class="tl">' + esc(tagline) + '</p>' : '') +
      '<div class="cta-row">' + ctaBtn(primary, c, t, '', null, false) + (secondary && secondary !== 'none' ? ctaBtn(secondary, c, t, 'ghost', null, false) : '') + '</div></div>';
    var hero;
    if (lay === 'luxury') {
      hero = '<section class="hero" id="top" data-sec="hero">' + (banners.length ? slidesHtml + dotsHtml : media) + '<div class="wrap hero-in">' + txt + '</div></section>';
    } else if (lay === 'editorial') {
      hero = '<section class="hero" id="top" data-sec="hero"><div class="wrap">' + txt + '<div class="peek">' + (banners.length ? slidesHtml + dotsHtml : media) + '</div></div></section>';
    } else if (lay === 'showcase') hero = '<section class="hero" id="top" data-sec="hero">' + media + '<div class="wrap hero-in">' + txt + '</div></section>';
    else if (lay === 'bold') hero = '<section class="hero" id="top" data-sec="hero"><div class="wrap hero-in">' + txt + media + '</div></section>';
    else if (lay === 'minimal') hero = '<section class="hero" id="top" data-sec="hero"><div class="wrap">' + txt + media + '</div></section>';
    else hero = '<section class="hero' + (cover ? ' cv' : '') + '" id="top" data-sec="hero" style="' + esc(coverVar) + '"><div class="wrap">' + txt + '</div></section>';

    var body = secs.map(function (id) { return renderSection(id, c, offers, t, I); }).join('');
    var bar = '';
    if (!opts.mini) {
      var k1 = primary, k2 = secondary && secondary !== 'none' ? secondary : (primary === 'call' ? 'whatsapp' : 'call');
      bar = '<div class="bar">' + ctaBtn(k1, c, t, '', null, false) + ((c.contact.phone || c.contact.whatsapp) ? ctaBtn(k2, c, t, 'ghost', null, false) : '') + '</div>';
    }
    var annHtml = '';
    if (c.announce.length && !opts.mini) {
      var one = c.announce.map(function (x) { return '<span>' + esc(x) + '</span><i>✦</i>'; }).join('');
      annHtml = '<div class="ann"><div class="mq">' + one + one + one + one + '</div></div>';
    }
    var waNum = waNumber(c.contact.whatsapp || c.contact.phone);
    var waFloat = (!opts.mini && waNum) ? '<a class="wa" aria-label="WhatsApp" target="_blank" rel="noopener" data-ev="whatsapp" href="' + esc(actionHref('whatsapp', c)) + '"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.200 5.200 0 0 0 1.100 2.800 11.900 11.900 0 0 0 4.600 4c1.700.7 2.400.8 3.300.6.600-.1 1.500-.6 1.700-1.200.2-.6.200-1.100.2-1.200-.1-.1-.3-.2-.5-.3z"/></svg></a>' : '';
    var foot = '<footer class="foot"><div class="wrap">© ' + new Date().getFullYear() + ' ' + esc(name) + ' · ' + t.powered + ' <a href="https://glime.online" target="_blank" rel="noopener">GLIME</a></div></footer>';
    var gs = { api: SB + '/rest/v1', key: KEY, slug: data.slug || '', preview: !!opts.preview, mini: !!opts.mini, closeLbl: t.close, offers: offerData(c, offers, t), thanks: t.thanks, err: t.err, scrollY: opts.scrollY || 0, scrollTo: opts.scrollTo || '' };
    var desc = (tagline || c.brand.about || '').replace(/\s+/g, ' ').slice(0, 155);
    var fontHref = 'https://fonts.googleapis.com/css2?family=' + fp.g + '&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap';
    var themeColor = THEMES[c.theme].p;

    return '<!doctype html><html lang="' + L + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
      '<title>' + esc(name) + (tagline ? ' – ' + esc(tagline) : '') + '</title><meta name="description" content="' + esc(desc) + '">' +
      '<meta name="theme-color" content="' + themeColor + '"><meta property="og:title" content="' + esc(name) + '"><meta property="og:description" content="' + esc(desc) + '">' +
      (logo ? '<meta property="og:image" content="' + esc(cover || logo) + '"><link rel="icon" href="' + esc(logo) + '">' : '') +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="' + fontHref + '">' +
      '<style>' + buildCss(c, I) + extraCss(c) + (LAYOUTS[c.layout] && LAYOUTS[c.layout].css ? LAYOUTS[c.layout].css : '') + '</style></head><body class="L-' + lay + (lay !== c.layout ? ' L-' + c.layout : '') + '">' + annHtml + nav + hero + body + (opts.mini ? '' : foot) + bar + waFloat +
      '<script>window.__GS=' + jsonForScript(gs) + ';(' + runtime.toString() + ')();<\/script></body></html>';
  }

  root.GlimeSite = {
    THEMES: THEMES, FONTS: FONTS, LAYOUTS: LAYOUTS, INDUSTRIES: INDUSTRIES, SECTION_IDS: SECTION_IDS, T: T,
    SUPABASE_URL: SB, KEY: KEY, SITE_BASE: SITE_BASE,
    setLooks: setLooks, defaultConfig: defaultConfig, normalize: normalize, buildDocument: buildDocument,
    hoursFromWorking: hoursFromWorking, fmtPrice: fmtPrice, slugify: slugify, waNumber: waNumber,
    visibleOffers: visibleOffers, activeSections: activeSections, galleryImages: galleryImages, offerImg: offerImg, safeUrl: safeUrl, esc: esc
  };
})(typeof window !== 'undefined' ? window : this);
