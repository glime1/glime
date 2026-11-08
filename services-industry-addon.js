/* =========================================================
   GLIME — SERVICES INDUSTRY DETAILS ADDON
   ---------------------------------------------------------
   Every service gets the details its own industry needs
   (delivery, GST, discount, stock, batches, consultation
   terms …) and nothing else. Any business can pick a
   template or build its own with custom details.

   Storage — no new tables, no backend change:
   - offer_versions.metadata.offer_details  (versioned, goes
     through the existing review / approve / publish RPCs)
   - offer_variants.attributes              (size, colour, stock …)
   - offer_prices.min_amount / max_amount   (price ranges)
   - offer_versions.sales_talking_points / allowed_claims /
     restrictions / customer_eligibility    (AI guidance)

   Fixes on the way:
   - Duration is now saved (it was never persisted).
   - Variants are updated in place (ids stay stable).
   - Availability rows are only written for types that use them.

   Load order: after services-premium-addon.js and BEFORE
   services-media-persistence-addon.js (it wraps saveStructured).
========================================================= */
(function () {
  'use strict';

  if (typeof state === 'undefined' || typeof supabaseClient === 'undefined') {
    console.error('[GLIME DETAILS] Core services context is unavailable.');
    return;
  }

  const SCHEMA = 1;
  const MAX_ROWS = 15;

  const byId = id => document.getElementById(id);
  const val = id => { const el = byId(id); return el ? el.value : ''; };
  const on = (id, type, fn, capture) => {
    const el = byId(id);
    if (el) el.addEventListener(type, fn, !!capture);
  };
  const sym = () => (val('fCurrency') === 'USD' ? '$' : '₹');
  const todayStr = () => new Date().toLocaleDateString('en-CA');
  const shortDate = s => {
    const d = new Date(s + 'T00:00:00');
    return isNaN(d) ? String(s) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  /* =======================================================
     FIELD BUILDERS
  ======================================================= */

  const T = (k, label, o) => ({ k, label, type: 'text', ...o });
  const N = (k, label, o) => ({ k, label, type: 'number', ...o });
  const M = (k, label, o) => ({ k, label, type: 'money', ...o });
  const D = (k, label, o) => ({ k, label, type: 'date', ...o });
  const A = (k, label, o) => ({ k, label, type: 'textarea', full: true, ...o });
  const S = (k, label, options, o) => ({ k, label, type: 'select', options, ...o });
  const YN = (k, label, o) => S(k, label, [['yes', 'Yes'], ['no', 'No']], o);

  const is = (...list) => v => list.indexOf(v) !== -1;
  const filled = x => x !== undefined && x !== null && String(x) !== '';

  /* =======================================================
     DETAIL BLOCKS (reusable building blocks)
  ======================================================= */

  const BLOCKS = {
    offer: {
      title: 'Offer & discount',
      hint: 'Show the original price so customers see their saving. Your selling price is the Price field above.',
      optional: true,
      fields: [
        M('mrp', 'MRP / original price', { ph: 'e.g. 1999' }),
        D('valid_until', 'Offer valid until'),
        T('coupon', 'Coupon code', { ph: 'e.g. WELCOME10', max: 30 }),
        T('note', 'Offer note', { ph: 'e.g. Extra 5% off on UPI payments', max: 140, full: true })
      ],
      chip: v => (v.valid_until
        ? (String(v.valid_until) < todayStr()
          ? { t: 'Offer ended', c: 'warn' }
          : { t: 'Offer ends ' + shortDate(v.valid_until) })
        : null)
    },

    tax: {
      title: 'GST & tax',
      hint: 'Customers often ask whether GST is included.',
      fields: [
        S('gst', 'GST rate', [['0', '0% / exempt'], ['5', '5%'], ['12', '12%'], ['18', '18%'], ['28', '28%']]),
        S('included', 'Is GST included in the price?',
          [['included', 'Yes, price includes GST'], ['extra', 'No, GST is added extra']],
          { show: v => filled(v.gst) && String(v.gst) !== '0' }),
        T('code', 'HSN / SAC code', { max: 12, ph: 'optional' })
      ],
      chip: v => (filled(v.gst) ? { t: String(v.gst) === '0' ? 'No GST' : 'GST ' + v.gst + '%' } : null)
    },

    stock: {
      title: 'Stock',
      hint: 'If this item has sizes or colours, set stock on each option above instead.',
      fields: [
        S('status', 'Stock status', [
          ['in_stock', 'In stock'], ['low_stock', 'Low stock'], ['out_of_stock', 'Out of stock'],
          ['made_to_order', 'Made to order'], ['preorder', 'Pre-order']
        ]),
        N('quantity', 'Quantity available', { show: v => is('in_stock', 'low_stock')(v.status) }),
        N('lead_days', 'Preparation time (days)', { show: v => is('made_to_order', 'preorder')(v.status) })
      ],
      chip: v => ({
        out_of_stock: { t: 'Out of stock', c: 'bad' },
        low_stock: { t: 'Low stock', c: 'warn' },
        made_to_order: { t: 'Made to order' },
        preorder: { t: 'Pre-order' }
      }[v.status] || null)
    },

    delivery: {
      title: 'Delivery',
      hint: 'Your AI answers "is delivery free?" from here. Leave a field empty if you do not want the AI to promise it.',
      fields: [
        S('mode', 'Delivery charges', [
          ['free', 'Free delivery'], ['paid', 'Paid delivery'],
          ['free_above', 'Free above a minimum order'], ['pickup', 'Pickup / collect only']
        ]),
        M('charge', 'Delivery charge', { show: v => is('paid', 'free_above')(v.mode) }),
        M('free_above', 'Free delivery above', { show: v => v.mode === 'free_above' }),
        N('eta_min', 'Delivery time – from (days)', { show: v => filled(v.mode) && v.mode !== 'pickup' }),
        N('eta_max', 'Delivery time – to (days)', { show: v => filled(v.mode) && v.mode !== 'pickup' }),
        T('areas', 'Areas / pincodes served', { full: true, ph: 'e.g. All India, or Delhi NCR only', max: 160 }),
        S('cod', 'Cash on delivery', [['yes', 'Available'], ['no', 'Not available']])
      ],
      chip: (v, c) => {
        if (v.mode === 'free') return { t: 'Free delivery' };
        if (v.mode === 'paid') return { t: filled(v.charge) ? 'Delivery ' + c.fmt(v.charge) : 'Paid delivery' };
        if (v.mode === 'free_above') return { t: filled(v.free_above) ? 'Free above ' + c.fmt(v.free_above) : 'Free delivery on larger orders' };
        if (v.mode === 'pickup') return { t: 'Pickup only' };
        return null;
      }
    },

    returns: {
      title: 'Returns & exchange',
      fields: [
        S('policy', 'Return / exchange', [
          ['none', 'No returns'], ['return', 'Returns only'], ['exchange', 'Exchange only'], ['both', 'Returns & exchange']
        ]),
        N('window_days', 'Window (days)', { show: v => filled(v.policy) && v.policy !== 'none' }),
        A('conditions', 'Conditions', { ph: 'e.g. Unused, with tags and original packaging', show: v => filled(v.policy) && v.policy !== 'none' })
      ],
      chip: v => {
        if (v.policy === 'none') return { t: 'No returns' };
        if (v.policy === 'exchange') return { t: 'Exchange only' };
        if (is('return', 'both')(v.policy)) return { t: filled(v.window_days) ? v.window_days + '-day returns' : 'Returns accepted' };
        return null;
      }
    },

    product: {
      title: 'Product details',
      fields: [
        T('brand', 'Brand'),
        T('material', 'Material / type'),
        T('warranty', 'Warranty', { ph: 'e.g. 1 year' }),
        T('in_box', "What's in the box"),
        A('care', 'Care / usage instructions')
      ]
    },

    food: {
      title: 'Food details',
      fields: [
        S('diet', 'Diet', [['veg', 'Vegetarian'], ['nonveg', 'Non-vegetarian'], ['egg', 'Contains egg'], ['vegan', 'Vegan']]),
        T('serves', 'Serves', { ph: 'e.g. 2 people' }),
        N('prep', 'Preparation time (minutes)'),
        S('spice', 'Spice level', [['mild', 'Mild'], ['medium', 'Medium'], ['hot', 'Hot']]),
        T('allergens', 'Allergens', { full: true }),
        T('available', 'Available timings', { ph: 'e.g. 12 pm – 11 pm' })
      ],
      chip: v => (v.diet ? { t: { veg: 'Veg', nonveg: 'Non-veg', egg: 'Contains egg', vegan: 'Vegan' }[v.diet] } : null)
    },

    education: {
      title: 'Course details',
      fields: [
        S('mode', 'Mode', [['online', 'Online'], ['offline', 'Offline / classroom'], ['hybrid', 'Hybrid']]),
        T('duration', 'Course duration', { ph: 'e.g. 6 months' }),
        S('level', 'Level', [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'], ['all', 'All levels']]),
        T('language', 'Language of teaching'),
        D('start', 'Next batch starts'),
        T('timing', 'Batch timing', { ph: 'e.g. Mon–Fri, 6–8 pm' }),
        N('seats', 'Seats available'),
        S('demo', 'Demo class', [['free', 'Free demo available'], ['paid', 'Paid demo'], ['none', 'No demo']]),
        S('emi', 'Fee in instalments / EMI', [['yes', 'Available'], ['no', 'Not available']]),
        T('emi_note', 'Instalment details', { full: true, ph: 'e.g. 3 instalments, no extra charge', show: v => v.emi === 'yes' }),
        S('certificate', 'Certificate', [['yes', 'Provided'], ['no', 'Not provided']]),
        T('faculty', 'Faculty / trainer'),
        A('syllabus', 'Syllabus / topics covered'),
        A('eligibility', 'Who can join / eligibility')
      ],
      chip: v => (v.mode ? { t: { online: 'Online', offline: 'Classroom', hybrid: 'Hybrid' }[v.mode] } : null)
    },

    clinic: {
      title: 'Consultation details',
      hint: 'Your AI shares these facts only. See AI guidance below to stop it from giving medical advice.',
      fields: [
        T('provider', 'Doctor / practitioner'),
        T('speciality', 'Speciality'),
        T('qualification', 'Qualification'),
        N('experience', 'Experience (years)'),
        S('mode', 'Consultation mode', [['clinic', 'At the clinic'], ['video', 'Video / online'], ['home', 'Home visit'], ['multiple', 'Clinic & online']]),
        T('languages', 'Languages spoken'),
        T('first_visit', 'First-visit offer', { ph: 'e.g. 20% off first consultation' }),
        N('followup_days', 'Free follow-up (days)'),
        S('insurance', 'Insurance / cashless', [['accepted', 'Accepted'], ['some', 'Some insurers'], ['not', 'Not accepted']]),
        T('insurance_note', 'Which insurers?', { show: v => is('accepted', 'some')(v.insurance) }),
        A('bring', 'What to bring / how to prepare')
      ],
      chip: v => (v.mode ? { t: { clinic: 'At clinic', video: 'Video consult', home: 'Home visit', multiple: 'Clinic & online' }[v.mode] } : null)
    },

    salon: {
      title: 'Service details',
      fields: [
        S('where', 'Where is it done?', [['business', 'At our place'], ['customer', 'At customer location'], ['both', 'Both']]),
        T('area', 'Home-visit area', { show: v => is('customer', 'both')(v.where) }),
        M('travel', 'Travel / visit charge', { show: v => is('customer', 'both')(v.where) }),
        T('staff', 'Expert / stylist'),
        M('advance', 'Advance to book'),
        T('includes', 'What is included', { full: true }),
        A('prep', 'Before the service'),
        A('aftercare', 'Aftercare'),
        A('cancel', 'Cancellation / reschedule policy')
      ],
      chip: v => (v.where === 'customer' || v.where === 'both' ? { t: 'Home visit' } : null)
    },

    home_service: {
      title: 'Service terms',
      fields: [
        M('visit', 'Visit / inspection charge'),
        S('materials', 'Materials', [['included', 'Included in price'], ['extra', 'Charged extra'], ['customer', 'Customer provides']]),
        T('area', 'Service area', { full: true }),
        T('response', 'Response / arrival time', { ph: 'e.g. Within 4 hours' }),
        T('warranty', 'Service warranty'),
        A('includes', 'What is included / excluded'),
        A('cancel', 'Cancellation policy')
      ]
    },

    professional: {
      title: 'Engagement details',
      fields: [
        T('deliverables', 'What the client receives', { full: true }),
        T('turnaround', 'Turnaround time'),
        S('mode', 'Delivery mode', [['online', 'Online'], ['in_person', 'In person'], ['both', 'Online & in person']]),
        M('advance', 'Advance / retainer'),
        A('requirements', 'What we need from the client'),
        A('cancel', 'Cancellation / refund policy')
      ]
    },

    rental: {
      title: 'Rental terms',
      fields: [
        M('deposit', 'Security deposit'),
        T('min_period', 'Minimum rental period'),
        T('max_period', 'Maximum rental period'),
        S('id_proof', 'ID proof', [['required', 'Required'], ['not', 'Not required']]),
        S('handover', 'Handover', [['pickup', 'Customer picks up'], ['delivery', 'We deliver'], ['both', 'Both']]),
        T('late', 'Late-return charges'),
        A('damage', 'Damage / cleaning policy')
      ],
      chip: (v, c) => (filled(v.deposit) ? { t: 'Deposit ' + c.fmt(v.deposit) } : null)
    },

    membership: {
      title: 'Membership terms',
      fields: [
        N('trial', 'Free trial (days)'),
        M('joining', 'Joining fee'),
        T('commitment', 'Minimum commitment'),
        S('renew', 'Renewal', [['yes', 'Renews automatically'], ['no', 'Manual renewal']]),
        A('benefits', 'Benefits included'),
        A('cancel', 'Cancellation / refund policy')
      ],
      chip: v => (filled(v.trial) ? { t: v.trial + '-day trial' } : null)
    },

    package: {
      title: 'Package details',
      fields: [
        A('includes', 'What is included'),
        N('validity', 'Validity (days)'),
        T('saving', 'Saving note', { ph: 'e.g. Save ₹1,500 vs booking separately' })
      ]
    },

    realestate: {
      title: 'Property details',
      fields: [
        S('ptype', 'Property type', [['flat', 'Flat / apartment'], ['house', 'House / villa'], ['plot', 'Plot / land'], ['commercial', 'Commercial'], ['pg', 'PG / rental room']]),
        T('bhk', 'Configuration', { ph: 'e.g. 2 BHK' }),
        N('area', 'Area (sq ft)'),
        S('furnishing', 'Furnishing', [['furnished', 'Furnished'], ['semi', 'Semi-furnished'], ['unfurnished', 'Unfurnished']]),
        T('locality', 'Locality / project', { full: true }),
        T('possession', 'Possession'),
        T('rera', 'RERA number'),
        S('negotiable', 'Price negotiable', [['yes', 'Yes'], ['no', 'No']]),
        A('amenities', 'Amenities')
      ],
      chip: v => (v.bhk ? { t: String(v.bhk) } : null)
    }
  };

  /* =======================================================
     INDUSTRY PROFILES  (which blocks, which variant columns)
  ======================================================= */

  const PROFILES = {
    commerce: {
      label: 'Products & retail',
      note: 'Delivery, GST, discount, stock, sizes and returns.',
      price: ['offer', 'tax'],
      details: ['stock', 'delivery', 'returns', 'product'],
      variants: {
        title: 'Sizes, colours & options', add: 'option', noun: 'Option name',
        hint: 'Add each size or colour that has its own price or stock.',
        cols: [{ k: 'size', label: 'Size', ph: 'M, L, 42…' }, { k: 'color', label: 'Colour' }, { k: 'stock', label: 'Stock', type: 'number' }]
      }
    },
    food: {
      label: 'Food & restaurant',
      note: 'Diet, serving size, timings and delivery.',
      price: ['offer', 'tax'],
      details: ['food', 'delivery'],
      variants: { title: 'Portions & sizes', add: 'portion', noun: 'Portion', hint: 'For example half / full, or small / large.', cols: [] }
    },
    education: {
      label: 'Education & coaching',
      note: 'Batches, seats, demo class, instalments and certificate.',
      price: ['offer', 'tax'],
      details: ['education'],
      variants: {
        title: 'Batches', add: 'batch', noun: 'Batch name',
        hint: 'Add each batch with its own fee, start date and seats.',
        cols: [{ k: 'start', label: 'Starts', type: 'date' }, { k: 'timing', label: 'Timing', ph: '6–8 pm' }, { k: 'seats', label: 'Seats', type: 'number' }]
      }
    },
    clinic: {
      label: 'Clinic & healthcare',
      note: 'Doctor, consultation mode, follow-up and insurance.',
      price: ['offer', 'tax'],
      details: ['clinic'],
      variants: {
        title: 'Consultation types', add: 'consultation type', noun: 'Consultation type',
        hint: 'For example first visit, follow-up or video consult.',
        cols: [{ k: 'duration', label: 'Minutes', type: 'number' }]
      }
    },
    salon: {
      label: 'Salon, beauty & wellness',
      note: 'Where it is done, advance amount, aftercare and cancellation.',
      price: ['offer', 'tax'],
      details: ['salon'],
      variants: {
        title: 'Options & add-ons', add: 'option', noun: 'Option',
        hint: 'For example short / medium / long hair.',
        cols: [{ k: 'duration', label: 'Minutes', type: 'number' }]
      }
    },
    home_service: {
      label: 'Home & field services',
      note: 'Visit charge, materials, service area and warranty.',
      price: ['offer', 'tax'],
      details: ['home_service'],
      variants: { title: 'Service options', add: 'option', noun: 'Option', hint: 'For example 1 AC / 2 ACs.', cols: [] }
    },
    professional: {
      label: 'Professional services',
      note: 'Deliverables, turnaround, advance and cancellation.',
      price: ['offer', 'tax'],
      details: ['professional'],
      variants: { title: 'Plans & tiers', add: 'plan', noun: 'Plan', hint: 'For example basic, standard and premium.', cols: [] }
    },
    rental: {
      label: 'Rentals',
      note: 'Deposit, rental period, ID proof and handover.',
      price: ['offer', 'tax'],
      details: ['rental'],
      variants: {
        title: 'Rental options', add: 'option', noun: 'Option',
        hint: 'For example per day, per week, or different models.',
        cols: [{ k: 'stock', label: 'Units', type: 'number' }]
      }
    },
    membership: {
      label: 'Memberships',
      note: 'Trial, joining fee, renewal and benefits.',
      price: ['offer', 'tax'],
      details: ['membership'],
      variants: { title: 'Plans', add: 'plan', noun: 'Plan', hint: 'For example monthly, quarterly and yearly.', cols: [] }
    },
    package: {
      label: 'Packages & bundles',
      note: 'What is included and how long it is valid.',
      price: ['offer', 'tax'],
      details: ['package'],
      variants: { title: 'Package options', add: 'option', noun: 'Option', hint: 'Different sizes of the same bundle.', cols: [] }
    },
    realestate: {
      label: 'Real estate',
      note: 'Property type, area, possession and amenities.',
      price: ['tax'],
      details: ['realestate'],
      variants: { title: 'Unit types', add: 'unit type', noun: 'Unit type', hint: 'For example 2 BHK and 3 BHK.', cols: [] }
    },
    custom: {
      label: 'Custom / other',
      note: 'Add your own details below. Works for any business.',
      price: ['offer'],
      details: [],
      variants: { title: 'Variants', add: 'variant', noun: 'Variant name', hint: 'Options with their own price.', cols: [] }
    }
  };

  const COL_TYPE = {};
  Object.keys(PROFILES).forEach(k => PROFILES[k].variants.cols.forEach(c => { COL_TYPE[c.k] = c.type || 'text'; }));

  /* =======================================================
     STATE
  ======================================================= */

  const defaults = () => ({
    profile: '',
    profileTouched: false,
    blocks: {},
    faqs: [],
    facts: [],
    ai: { points: '', claims: '', restrictions: '', eligibility: '' },
    aiDirty: {},
    duration: '',
    priceMax: '',
    sourceVersionId: null
  });

  state.details = defaults();
  state.industryHint = null;

  /* ---------- industry hint ---------- */

  const HINTS = [
    ['clinic', /clinic|hospital|doctor|dental|dentist|medical|health|diagnostic|physio|pharma|therap/i],
    ['salon', /salon|\bspa\b|beauty|makeup|parlou?r|barber|wellness|grooming|nail|massage/i],
    ['education', /coach|school|academy|institute|educat|tuition|training|course|learning|universit/i],
    ['food', /restaurant|cafe|food|bakery|catering|kitchen|sweets|hospitality/i],
    ['realestate', /real.?estate|property|realty|builder|broker/i],
    ['home_service', /plumb|electric|repair|cleaning|pest|carpent|home.?service|installation/i],
    ['commerce', /retail|store|shop|fashion|apparel|boutique|e-?commerce|garment|jewel|electronics|furniture/i]
  ];

  const SLUG_HINT = {
    education: 'education', healthcare: 'clinic', 'home-services': 'home_service',
    hospitality: 'food', 'professional-services': 'professional',
    'real-estate': 'realestate', retail: 'commerce', fashion: 'commerce'
  };

  function hintFromText(text) {
    const t = String(text || '');
    for (let i = 0; i < HINTS.length; i++) {
      if (HINTS[i][1].test(t)) return HINTS[i][0];
    }
    return null;
  }

  let hintPromise = null;

  function ensureHint() {
    if (!state.client) return Promise.resolve(null);
    if (hintPromise) return hintPromise;

    hintPromise = (async () => {
      let hint = null;
      try {
        const bp = await supabaseClient.from('client_business_profiles').select('business_type').limit(1).maybeSingle();
        hint = hintFromText(bp.data && bp.data.business_type);

        if (!hint) {
          const cic = await supabaseClient
            .from('client_industry_configurations')
            .select('industry_id,custom_industry_name')
            .limit(1)
            .maybeSingle();

          if (cic.data) {
            hint = hintFromText(cic.data.custom_industry_name);
            if (!hint && cic.data.industry_id) {
              const ind = await supabaseClient.from('industries').select('slug').eq('id', cic.data.industry_id).maybeSingle();
              hint = (ind.data && SLUG_HINT[ind.data.slug]) || null;
            }
          }
        }
      } catch (e) {
        console.warn('[GLIME DETAILS] industry hint unavailable:', e);
      }
      state.industryHint = hint;
      return hint;
    })();

    return hintPromise;
  }

  function suggestProfile(type) {
    const h = state.industryHint;

    switch (type) {
      case 'product': return h === 'food' ? 'food' : h === 'realestate' ? 'realestate' : 'commerce';
      case 'course': return 'education';
      case 'rental': return h === 'realestate' ? 'realestate' : 'rental';
      case 'membership': return 'membership';
      case 'package': return h === 'salon' ? 'salon' : 'package';
      case 'appointment':
      case 'service':
        return h === 'clinic' || h === 'salon' || h === 'home_service' ? h : 'professional';
      default: return 'custom';
    }
  }

  const curType = () => val('fType') || 'service';
  const profileKey = () => (PROFILES[state.details.profile] ? state.details.profile : suggestProfile(curType()));
  const profile = () => PROFILES[profileKey()];
  const activeBlocks = p => p.price.concat(p.details);

  /* =======================================================
     CLEAN / SERIALISE
  ======================================================= */

  function optLabel(bid, k, v) {
    const f = BLOCKS[bid].fields.find(x => x.k === k);
    const o = f && f.options && f.options.find(x => x[0] === String(v));
    return o ? o[1] : String(v);
  }

  function cleanBlock(bid, source) {
    const B = BLOCKS[bid];
    const v = source || state.details.blocks[bid] || {};
    const out = {};

    B.fields.forEach(f => {
      if (f.show && !f.show(v)) return;

      const raw = v[f.k] == null ? '' : String(v[f.k]).trim();
      if (!raw) return;

      if (f.type === 'number' || f.type === 'money') {
        const n = Number(raw);
        if (isFinite(n) && n >= 0) out[f.k] = n;
      } else if (f.type === 'date') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) out[f.k] = raw;
      } else if (f.type === 'select') {
        if (f.options.some(o => o[0] === raw)) out[f.k] = raw;
      } else {
        out[f.k] = raw.slice(0, f.type === 'textarea' ? 600 : (f.max || 120));
      }
    });

    return out;
  }

  function buildPayload() {
    const d = state.details;
    const p = profile();
    const blocks = {};

    activeBlocks(p).forEach(bid => {
      const c = cleanBlock(bid);
      if (Object.keys(c).length) blocks[bid] = c;
    });

    const dur = Number(d.duration);

    return {
      schema: SCHEMA,
      profile: profileKey(),
      blocks,
      duration_minutes: isFinite(dur) && dur > 0 && String(d.duration).trim() !== '' ? dur : null,
      faqs: d.faqs
        .map(x => ({ q: String(x.q || '').trim().slice(0, 200), a: String(x.a || '').trim().slice(0, 800) }))
        .filter(x => x.q && x.a)
        .slice(0, MAX_ROWS),
      facts: d.facts
        .map(x => ({ label: String(x.label || '').trim().slice(0, 60), value: String(x.value || '').trim().slice(0, 300) }))
        .filter(x => x.label && x.value)
        .slice(0, MAX_ROWS)
    };
  }

  const toLines = text =>
    String(text || '')
      .split(/\r?\n/)
      .map(s => s.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 10);

  function linesOf(arr) {
    if (!Array.isArray(arr)) return '';
    return arr
      .map(x => (typeof x === 'string' ? x : (x && (x.text || x.claim || x.point || x.value || x.description)) || ''))
      .map(s => String(s).trim())
      .filter(Boolean)
      .join('\n');
  }

  function eligibilityNote(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
    return typeof obj.note === 'string' ? obj.note : '';
  }

  function hydrate(row, price, versionId) {
    const d = defaults();
    const meta = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const od = meta.offer_details && typeof meta.offer_details === 'object' ? meta.offer_details : {};

    if (PROFILES[od.profile]) {
      d.profile = od.profile;
      d.profileTouched = true;
    }

    const blocks = od.blocks && typeof od.blocks === 'object' ? od.blocks : {};
    Object.keys(blocks).forEach(id => {
      if (!BLOCKS[id] || !blocks[id] || typeof blocks[id] !== 'object') return;
      d.blocks[id] = {};
      Object.keys(blocks[id]).forEach(k => { d.blocks[id][k] = String(blocks[id][k]); });
    });

    d.faqs = (Array.isArray(od.faqs) ? od.faqs : [])
      .map(x => ({ q: String((x && x.q) || ''), a: String((x && x.a) || '') }))
      .filter(x => x.q || x.a)
      .slice(0, MAX_ROWS);

    d.facts = (Array.isArray(od.facts) ? od.facts : [])
      .map(x => ({ label: String((x && x.label) || ''), value: String((x && x.value) || '') }))
      .filter(x => x.label || x.value)
      .slice(0, MAX_ROWS);

    d.duration = od.duration_minutes != null ? String(od.duration_minutes) : '';

    if (row) {
      d.ai.points = linesOf(row.sales_talking_points);
      d.ai.claims = linesOf(row.allowed_claims);
      d.ai.restrictions = linesOf(row.restrictions);
      d.ai.eligibility = eligibilityNote(row.customer_eligibility);
    }

    d.priceMax = price && price.max_amount != null ? String(price.max_amount) : '';
    d.sourceVersionId = versionId || null;
    return d;
  }

  /* =======================================================
     RENDER: detail blocks
  ======================================================= */

  function fieldHtml(bid, f, v) {
    const value = v[f.k] == null ? '' : String(v[f.k]);
    const at = 'data-sd-b="' + bid + '" data-sd-k="' + f.k + '"';
    let ctl;

    if (f.type === 'select') {
      ctl = '<select ' + at + '><option value="">Not specified</option>' +
        f.options.map(o => '<option value="' + esc(o[0]) + '"' + (value === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') +
        '</select>';
    } else if (f.type === 'textarea') {
      ctl = '<textarea ' + at + ' rows="3" maxlength="600" placeholder="' + esc(f.ph || '') + '">' + esc(value) + '</textarea>';
    } else if (f.type === 'money') {
      ctl = '<div class="input-prefix"><b>' + esc(sym()) + '</b><input ' + at +
        ' type="number" min="0" step="0.01" inputmode="decimal" placeholder="' + esc(f.ph || '') + '" value="' + esc(value) + '"></div>';
    } else if (f.type === 'number') {
      ctl = '<input ' + at + ' type="number" min="0" step="1" inputmode="numeric" placeholder="' + esc(f.ph || '') + '" value="' + esc(value) + '">';
    } else if (f.type === 'date') {
      ctl = '<input ' + at + ' type="date" value="' + esc(value) + '">';
    } else {
      ctl = '<input ' + at + ' maxlength="' + (f.max || 120) + '" placeholder="' + esc(f.ph || '') + '" value="' + esc(value) + '">';
    }

    return '<label class="field' + (f.full ? ' full' : '') + '"><span>' + esc(f.label) + '</span>' + ctl + '</label>';
  }

  function blockFields(bid) {
    const v = state.details.blocks[bid] || {};
    return BLOCKS[bid].fields.filter(f => !f.show || f.show(v)).map(f => fieldHtml(bid, f, v)).join('');
  }

  function blockCard(bid) {
    const B = BLOCKS[bid];
    return '<section class="sd-card" data-block="' + bid + '">' +
      '<header class="sd-head"><h4>' + esc(B.title) + '</h4>' + (B.hint ? '<p>' + esc(B.hint) + '</p>' : '') + '</header>' +
      '<div class="form-grid sd-grid">' + blockFields(bid) + '</div></section>';
  }

  function faqRow(x, i) {
    return '<div class="sd-row">' +
      '<label class="field"><span>Question</span><input data-faq-i="' + i + '" data-faq-f="q" maxlength="200" value="' + esc(x.q) + '" placeholder="e.g. Is this suitable for sensitive skin?"></label>' +
      '<label class="field"><span>Answer</span><textarea data-faq-i="' + i + '" data-faq-f="a" rows="2" maxlength="800">' + esc(x.a) + '</textarea></label>' +
      '<button type="button" class="remove-row" data-sd-act="rm-faq" data-i="' + i + '">Remove</button></div>';
  }

  function factRow(x, i) {
    return '<div class="sd-row">' +
      '<label class="field"><span>Detail name</span><input data-fact-i="' + i + '" data-fact-f="label" maxlength="60" value="' + esc(x.label) + '" placeholder="e.g. Fabric, Class size, Parking"></label>' +
      '<label class="field"><span>Value</span><input data-fact-i="' + i + '" data-fact-f="value" maxlength="300" value="' + esc(x.value) + '"></label>' +
      '<button type="button" class="remove-row" data-sd-act="rm-fact" data-i="' + i + '">Remove</button></div>';
  }

  function extrasHtml() {
    const d = state.details;
    const p = profile();
    const aiFilled = Object.keys(d.ai).some(k => String(d.ai[k] || '').trim());

    const intro = p.details.length
      ? ''
      : '<section class="sd-card"><header class="sd-head"><h4>' + esc(p.label) + '</h4><p>' + esc(p.note) +
        ' Use "More details" below to add anything customers ask about this item.</p></header></section>';

    return intro +
      '<details class="sd-card sd-fold"' + (d.facts.length ? ' open' : '') + '><summary>More details <small>' + d.facts.length + '</small></summary>' +
      '<div class="sd-body"><p class="sd-hint">Anything else customers ask about this item — your own labels, any industry.</p>' +
      '<div class="sd-rows">' + d.facts.map(factRow).join('') + '</div>' +
      (d.facts.length < MAX_ROWS ? '<button type="button" class="secondary-btn" data-sd-act="add-fact">＋ Add detail</button>' : '') +
      '</div></details>' +

      '<details class="sd-card sd-fold"' + (d.faqs.length ? ' open' : '') + '><summary>FAQs for this item <small>' + d.faqs.length + '</small></summary>' +
      '<div class="sd-body"><p class="sd-hint">Questions customers ask about this specific item. Your AI answers from these first.</p>' +
      '<div class="sd-rows">' + d.faqs.map(faqRow).join('') + '</div>' +
      (d.faqs.length < MAX_ROWS ? '<button type="button" class="secondary-btn" data-sd-act="add-faq">＋ Add question</button>' : '') +
      '</div></details>' +

      '<details class="sd-card sd-fold"' + (aiFilled ? ' open' : '') + '><summary>AI guidance <small>optional</small></summary>' +
      '<div class="sd-body form-grid">' +
      aiField('points', 'Selling points', 'One per line. What makes this item worth choosing?') +
      aiField('claims', 'Claims your AI may make', 'One per line, for example “Dermatologist tested”.') +
      aiField('restrictions', 'Your AI must never say or promise', 'One per line, for example “Do not promise a delivery date”.') +
      aiField('eligibility', 'Who is this for / not for', 'For example “Adults only”.') +
      (profileKey() === 'clinic'
        ? '<div class="field full"><button type="button" class="secondary-btn" data-sd-act="ai-safe">＋ Add safe-answer rules for healthcare</button><small>Stops the AI from diagnosing or suggesting medicines.</small></div>'
        : '') +
      '</div></details>';
  }

  function aiField(k, label, ph) {
    return '<label class="field full"><span>' + esc(label) + '</span><textarea data-ai-k="' + k + '" rows="3" placeholder="' + esc(ph) + '">' + esc(state.details.ai[k]) + '</textarea></label>';
  }

  function renderOfferBlocks() {
    const h = byId('offerBlocks');
    if (h) h.innerHTML = profile().price.map(blockCard).join('');
  }

  function renderDetailBlocks() {
    const h = byId('detailBlocks');
    if (!h) return;
    h.innerHTML = profile().details.map(blockCard).join('') + '<div id="sdExtras">' + extrasHtml() + '</div>';
  }

  function renderExtras() {
    const h = byId('sdExtras');
    if (h) h.innerHTML = extrasHtml();
  }

  function fillProfileSelect() {
    const sel = byId('fProfile');
    if (!sel) return;

    sel.innerHTML = Object.keys(PROFILES)
      .map(k => '<option value="' + k + '">' + esc(PROFILES[k].label) + '</option>')
      .join('');

    sel.value = profileKey();

    const hint = byId('fProfileHint');
    if (hint) hint.textContent = profile().note;
  }

  function variantMeta() {
    const p = profile().variants;
    const t = byId('variantTitle');
    const h = byId('variantHint');
    const b = byId('addVariantBtn');
    if (t) t.textContent = p.title;
    if (h) h.textContent = p.hint;
    if (b) b.textContent = '＋ Add ' + p.add;
  }

  function renderDetails() {
    fillProfileSelect();
    renderOfferBlocks();
    renderDetailBlocks();
    variantMeta();
    renderVariants();
  }

  function togglePriceMax() {
    const f = byId('fPriceMaxField');
    if (f) f.classList.toggle('hidden', val('fPriceType') !== 'range');
  }

  function syncFields() {
    const dur = byId('fDuration');
    if (dur) dur.value = state.details.duration;

    const mx = byId('fPriceMax');
    if (mx) mx.value = state.details.priceMax;

    togglePriceMax();
    syncCurrency();
  }

  function syncCurrency() {
    const price = byId('fPrice');
    const b = price && price.parentElement && price.parentElement.querySelector('b');
    if (b) b.textContent = sym();
    const mx = byId('fPriceMax');
    const mb = mx && mx.parentElement && mx.parentElement.querySelector('b');
    if (mb) mb.textContent = sym();
  }

  function afterCaps() {
    const c = state.capabilities || {};
    const head = byId('availHead');
    if (head) head.classList.toggle('hidden', !c.availability);
    variantMeta();
  }

  /* =======================================================
     VARIANTS (profile-aware rows)
  ======================================================= */

  renderVariants = function () {
    const host = byId('variantList');
    if (!host) return;

    const p = profile().variants;

    if (!state.variants.length) {
      host.innerHTML = '<p class="sd-empty">None added. Use this only if the item has options with different prices or stock.</p>';
      return;
    }

    host.innerHTML = state.variants.map((v, i) => {
      const a = v.attrs || {};

      const cols = p.cols.map(c =>
        '<label class="sd-vf"><span>' + esc(c.label) + '</span><input data-a="' + esc(c.k) + '" data-i="' + i + '" type="' +
        (c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text') + '"' +
        (c.type === 'number' ? ' min="0" step="1" inputmode="numeric"' : '') +
        ' maxlength="60" placeholder="' + esc(c.ph || '') + '" value="' + esc(a[c.k] == null ? '' : a[c.k]) + '"></label>'
      ).join('');

      return '<div class="sd-vrow">' +
        '<label class="sd-vf sd-wide"><span>' + esc(p.noun) + '</span><input data-v="name" data-i="' + i + '" maxlength="80" value="' + esc(v.name) + '" placeholder="' + esc(p.noun) + '"></label>' +
        '<label class="sd-vf"><span>Price</span><input data-v="price" data-i="' + i + '" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(v.price) + '"></label>' +
        '<label class="sd-vf"><span>SKU / code</span><input data-v="sku" data-i="' + i + '" maxlength="40" value="' + esc(v.sku || '') + '"></label>' +
        cols +
        '<button type="button" class="remove-row sd-vdel" data-remove-variant="' + i + '">Remove</button></div>';
    }).join('');
  };

  function onVariantInput(t) {
    const v = state.variants[Number(t.dataset.i)];
    if (!v) return;

    if (t.dataset.v) {
      v[t.dataset.v] = t.value;
    } else if (t.dataset.a) {
      v.attrs = v.attrs || {};
      v.attrs[t.dataset.a] = t.value;
    }
  }

  function variantAttributes(v) {
    const a = {};
    const price = String(v.price == null ? '' : v.price).trim();
    const n = Number(price);
    a.price = price === '' || !isFinite(n) ? null : n;

    Object.keys(v.attrs || {}).forEach(k => {
      const s = String(v.attrs[k] == null ? '' : v.attrs[k]).trim();
      if (!s) return;
      a[k] = COL_TYPE[k] === 'number' && isFinite(Number(s)) ? Number(s) : s.slice(0, 120);
    });

    return a;
  }

  /* =======================================================
     LOAD
  ======================================================= */

  loadStructured = async function () {
    const vid = state.versionId;
    if (!vid) return;

    const [vr, ar, mr, cr, dr, pr] = await Promise.all([
      supabaseClient.from('offer_variants')
        .select('id,name,sku,description,attributes,is_active,sort_order')
        .eq('offer_version_id', vid).order('sort_order'),
      supabaseClient.from('offer_availability')
        .select('id,day_of_week,start_time,end_time,timezone,capacity,is_available,notes')
        .eq('offer_version_id', vid).order('day_of_week'),
      supabaseClient.from('offer_media')
        .select('id,media_type,storage_path,file_url,alt_text,sort_order,is_primary,metadata')
        .eq('offer_version_id', vid).order('sort_order'),
      supabaseClient.from('custom_field_values')
        .select('field_def_id,value_text,value_json')
        .eq('offer_version_id', vid),
      supabaseClient.from('offer_versions')
        .select('metadata,sales_talking_points,allowed_claims,restrictions,customer_eligibility')
        .eq('id', vid).maybeSingle(),
      supabaseClient.from('offer_prices')
        .select('min_amount,max_amount')
        .eq('offer_version_id', vid).is('variant_id', null).eq('is_active', true)
        .limit(1).maybeSingle()
    ]);

    [vr, ar, mr, cr, dr, pr].forEach(r => { if (r.error) throw r.error; });

    state.variants = (vr.data || []).map(v => {
      const attrs = {};
      const src = v.attributes && typeof v.attributes === 'object' ? v.attributes : {};
      Object.keys(src).forEach(k => { if (k !== 'price' && src[k] != null) attrs[k] = String(src[k]); });

      return {
        id: v.id,
        name: v.name,
        sku: v.sku || '',
        price: src.price == null ? '' : src.price,
        description: v.description || '',
        attrs
      };
    });

    state.days = ar.data || [];

    state.media = (mr.data || []).map(m => ({
      id: m.id,
      url: m.file_url || '',
      storagePath: m.storage_path || '',
      alt: m.alt_text || '',
      primary: !!m.is_primary,
      type: m.media_type,
      metadata: m.metadata || {}
    }));

    state.customValues = {};
    (cr.data || []).forEach(v => {
      state.customValues[v.field_def_id] = v.value_text ?? v.value_json ?? '';
    });

    const touched = state.details.profileTouched;
    const previous = state.details.profile;
    state.details = hydrate(dr.data, pr.data, vid);
    if (!state.details.profileTouched && touched) {
      state.details.profile = previous;
      state.details.profileTouched = true;
    }

    renderDetails();
    renderMedia();
    renderDynamicFields();
    renderDaysFromState();
    syncFields();
  };

  /* =======================================================
     SAVE
  ======================================================= */

  async function saveVariants(vid) {
    const rows = (state.variants || [])
      .filter(v => String(v.name || '').trim())
      .map((v, i) => ({
        ref: v,
        id: v.id,
        payload: {
          offer_version_id: vid,
          name: String(v.name).trim(),
          sku: String(v.sku || '').trim() || null,
          description: String(v.description || '').trim() || null,
          attributes: variantAttributes(v),
          is_active: true,
          sort_order: i
        }
      }));

    const cur = await supabaseClient.from('offer_variants').select('id').eq('offer_version_id', vid);
    if (cur.error) throw cur.error;

    const have = new Set((cur.data || []).map(r => r.id));
    const keep = new Set(rows.filter(r => r.id && have.has(r.id)).map(r => r.id));
    const gone = Array.from(have).filter(id => !keep.has(id));

    if (gone.length) {
      const del = await supabaseClient.from('offer_variants').delete().in('id', gone).eq('offer_version_id', vid);
      if (del.error) throw del.error;
    }

    const fresh = [];

    for (const r of rows) {
      if (r.id && have.has(r.id)) {
        const up = await supabaseClient.from('offer_variants').update(r.payload).eq('id', r.id).eq('offer_version_id', vid);
        if (up.error) throw up.error;
      } else {
        fresh.push(r);
      }
    }

    if (fresh.length) {
      const ins = await supabaseClient.from('offer_variants').insert(fresh.map(r => r.payload)).select('id,sort_order');
      if (ins.error) throw ins.error;

      (ins.data || []).forEach(row => {
        const match = fresh.find(r => r.payload.sort_order === row.sort_order);
        if (match) match.ref.id = row.id;
      });
    }
  }

  async function saveAvailability(vid) {
    const del = await supabaseClient.from('offer_availability').delete().eq('offer_version_id', vid);
    if (del.error) throw del.error;

    /* Types without the availability capability (products, packages …)
       must not carry Monday–Saturday opening hours into the AI context. */
    if (!(state.capabilities && state.capabilities.availability)) return;

    const rows = Array.from(document.querySelectorAll('#dayRows [data-day-start]')).map(el => {
      const i = Number(el.dataset.dayStart);
      const endEl = document.querySelector('#dayRows [data-day-end="' + i + '"]');
      const onEl = document.querySelector('#dayRows [data-day-on="' + i + '"]');
      const end = endEl ? endEl.value : '';
      const on = !!(onEl && onEl.checked);

      return {
        offer_version_id: vid,
        day_of_week: i,
        start_time: on && el.value ? el.value : null,
        end_time: on && end ? end : null,
        timezone: val('fTimezone') || 'Asia/Kolkata',
        is_available: on
      };
    });

    if (rows.length) {
      const ins = await supabaseClient.from('offer_availability').insert(rows);
      if (ins.error) throw ins.error;
    }
  }

  async function saveCustomValues(vid) {
    const rows = Object.entries(state.customValues || {})
      .filter(([, v]) => v !== '' && v != null)
      .map(([field_def_id, value_text]) => ({
        offer_version_id: vid,
        field_def_id,
        value_text: String(value_text),
        value_json: null
      }));

    const del = await supabaseClient.from('custom_field_values').delete().eq('offer_version_id', vid);
    if (del.error) throw del.error;

    if (rows.length) {
      const ins = await supabaseClient.from('custom_field_values').insert(rows);
      if (ins.error) throw ins.error;
    }
  }

  async function savePriceRange(vid) {
    const isRange = val('fPriceType') === 'range';
    const min = Number(val('fPrice') || 0);
    const max = Number(val('fPriceMax'));

    const up = await supabaseClient
      .from('offer_prices')
      .update({
        min_amount: isRange ? min : null,
        max_amount: isRange && isFinite(max) && max > min ? max : null
      })
      .eq('offer_version_id', vid)
      .is('variant_id', null)
      .eq('is_active', true);

    if (up.error) throw up.error;
  }

  async function saveDetails(vid) {
    const cur = await supabaseClient
      .from('offer_versions')
      .select('metadata,status,customer_eligibility')
      .eq('id', vid)
      .maybeSingle();

    if (cur.error) throw cur.error;
    if (!cur.data || cur.data.status !== 'draft') return;

    const d = state.details;
    const metadata = Object.assign({}, cur.data.metadata && typeof cur.data.metadata === 'object' ? cur.data.metadata : {});
    metadata.offer_details = buildPayload();

    const patch = { metadata };

    /* A draft cloned from a published version starts with empty AI columns,
       so every non-empty field is carried over; otherwise only edited ones. */
    const carryAll = d.sourceVersionId !== vid;
    const write = k => d.aiDirty[k] || (carryAll && String(d.ai[k] || '').trim());

    if (write('points')) patch.sales_talking_points = toLines(d.ai.points);
    if (write('claims')) patch.allowed_claims = toLines(d.ai.claims);
    if (write('restrictions')) patch.restrictions = toLines(d.ai.restrictions);

    if (write('eligibility')) {
      const base = cur.data.customer_eligibility && typeof cur.data.customer_eligibility === 'object' && !Array.isArray(cur.data.customer_eligibility)
        ? cur.data.customer_eligibility
        : {};
      patch.customer_eligibility = Object.assign({}, base, { note: String(d.ai.eligibility || '').trim().slice(0, 600) });
    }

    const up = await supabaseClient.from('offer_versions').update(patch).eq('id', vid);
    if (up.error) throw up.error;

    d.aiDirty = {};
    d.sourceVersionId = vid;
  }

  saveStructured = async function () {
    const vid = state.versionId;
    if (!vid) return;

    await saveVariants(vid);
    await saveAvailability(vid);
    await saveCustomValues(vid);
    await savePriceRange(vid);
    await saveDetails(vid);
  };

  /* =======================================================
     WIZARD LIFECYCLE
  ======================================================= */

  const baseReset = resetWizard;

  resetWizard = async function (service) {
    state.details = defaults();

    if (service && !service.id && service.sdDetails) {
      state.details = hydrate({ metadata: { offer_details: service.sdDetails } }, null, null);
    }

    await Promise.race([ensureHint(), new Promise(r => setTimeout(r, 1500))]);

    await baseReset(service);

    const d = state.details;
    if (!PROFILES[d.profile]) {
      d.profile = suggestProfile(curType());
      d.profileTouched = false;
    }

    renderDetails();
    syncFields();
    afterCaps();
    updateChecklist();
  };

  const baseLoadServices = loadServices;

  loadServices = async function () {
    await baseLoadServices();

    (state.services || []).forEach(s => {
      const m = s.version && s.version.metadata;
      s.sdDetails = m && typeof m === 'object' && m.offer_details && typeof m.offer_details === 'object' ? m.offer_details : null;
    });
  };

  const baseCaps = updateCapabilities;

  updateCapabilities = function () {
    baseCaps();
    try { afterCaps(); } catch (_) { /* wizard not mounted yet */ }
  };

  /* =======================================================
     VALIDATION
  ======================================================= */

  const bv = (bid, k) => String((state.details.blocks[bid] || {})[k] == null ? '' : state.details.blocks[bid][k]).trim();

  function extraValidate(n) {
    const p = profile();

    if (n === 2) {
      const price = Number(val('fPrice'));

      if (p.price.indexOf('offer') !== -1 && bv('offer', 'mrp') !== '') {
        const mrp = Number(bv('offer', 'mrp'));
        if (!isFinite(mrp) || mrp <= 0) return 'MRP must be a positive amount.';
        if (isFinite(price) && mrp < price) return 'MRP cannot be lower than your selling price.';
      }

      if (val('fPriceType') === 'range') {
        const max = Number(val('fPriceMax'));
        if (!isFinite(max) || max <= price) return 'Maximum price must be higher than the starting price.';
      }

      for (let i = 0; i < state.variants.length; i++) {
        const v = state.variants[i];
        const anyData = String(v.price == null ? '' : v.price).trim() || String(v.sku || '').trim() ||
          Object.keys(v.attrs || {}).some(k => String(v.attrs[k] || '').trim());

        if (!String(v.name || '').trim() && anyData) return 'Give every option a name, or remove the empty ones.';
        if (String(v.price == null ? '' : v.price).trim() !== '' && Number(v.price) < 0) return 'Option prices cannot be negative.';
      }
    }

    if (n === 3 && p.details.indexOf('delivery') !== -1) {
      const mode = bv('delivery', 'mode');

      if (mode === 'paid' && bv('delivery', 'charge') === '') return 'Enter the delivery charge, or choose another delivery option.';
      if (mode === 'free_above' && bv('delivery', 'free_above') === '') return 'Enter the order value above which delivery is free.';

      const a = bv('delivery', 'eta_min');
      const b = bv('delivery', 'eta_max');
      if (a !== '' && b !== '' && Number(a) > Number(b)) return 'Delivery time “from” cannot be greater than “to”.';
    }

    return '';
  }

  const baseValidate = validateStep;

  validateStep = function (n) {
    const e = baseValidate(n);
    if (e) return e;

    try { return extraValidate(n); } catch (_) { return ''; }
  };

  const basePublish = submitPublish;

  submitPublish = async function () {
    const err = validateStep(2) || validateStep(3);

    if (err) {
      showAlert(err);
      return undefined;
    }

    return basePublish.apply(this, arguments);
  };

  /* =======================================================
     REVIEW: checklist + "what your AI will know"
  ======================================================= */

  function displayValue(bid, f, v) {
    if (f.type === 'select') return optLabel(bid, f.k, v);
    if (f.type === 'money') return money(v, val('fCurrency') || 'INR');
    if (f.type === 'date') return shortDate(v);
    return String(v);
  }

  function aiSummary() {
    const p = profile();
    const lines = [];
    const missing = [];
    const cur = val('fCurrency') || 'INR';
    const priceRaw = val('fPrice');
    const price = Number(priceRaw);

    if (priceRaw !== '' && isFinite(price)) {
      let s = 'Price: ' + money(price, cur);
      const mrp = Number(cleanBlock('offer').mrp);
      if (p.price.indexOf('offer') !== -1 && mrp > price) s += ' (MRP ' + money(mrp, cur) + ', ' + Math.round((1 - price / mrp) * 100) + '% off)';
      lines.push(s);
    }

    activeBlocks(p).forEach(bid => {
      const vals = cleanBlock(bid);
      const keys = Object.keys(vals);

      if (!keys.length) {
        if (!BLOCKS[bid].optional) missing.push(BLOCKS[bid].title);
        return;
      }

      BLOCKS[bid].fields.forEach(f => {
        if (vals[f.k] !== undefined) lines.push(f.label + ': ' + displayValue(bid, f, vals[f.k]));
      });
    });

    const payload = buildPayload();
    if (payload.faqs.length) lines.push('FAQs: ' + payload.faqs.length + ' answered question' + (payload.faqs.length === 1 ? '' : 's'));
    payload.facts.forEach(x => lines.push(x.label + ': ' + x.value));

    return { lines, missing };
  }

  function renderAiPreview() {
    const host = byId('aiPreview');
    if (!host) return;

    const s = aiSummary();
    const shown = s.lines.slice(0, 14);
    const more = s.lines.length - shown.length;

    host.innerHTML = '<section class="sd-ai">' +
      '<div class="sd-ai-head"><span>✦</span><div><strong>What your AI will know</strong><small>Customers asking about this item get these facts.</small></div></div>' +
      (shown.length
        ? '<ul>' + shown.map(l => '<li>' + esc(l) + '</li>').join('') + (more > 0 ? '<li class="sd-more">+ ' + more + ' more</li>' : '') + '</ul>'
        : '<p class="sd-hint">Nothing yet. Fill in the steps above.</p>') +
      (s.missing.length
        ? '<div class="sd-miss"><strong>Not filled in yet</strong><p>Your AI will not promise anything about: ' + esc(s.missing.join(', ')) + '.</p></div>'
        : '') +
      '</section>';
  }

  updateChecklist = function () {
    const name = val('fName').trim();
    const desc = val('fDescription').trim();
    const priceRaw = val('fPrice');
    const p = profile();

    const req = [
      ['Service name', !!name, 'Customer-facing name is present.'],
      ['Description', !!desc, 'Full business description is present.'],
      ['Price', priceRaw !== '' && Number(priceRaw) >= 0, 'A valid commercial price is configured.'],
      ['Catalog type', !!val('fType'), 'The service is assigned to a catalog type.']
    ];

    const rec = [];
    activeBlocks(p).forEach(bid => {
      if (BLOCKS[bid].optional) return;
      rec.push([BLOCKS[bid].title, Object.keys(cleanBlock(bid)).length > 0, 'Your AI can answer customer questions about this.']);
    });
    rec.push(['Photos', (state.media || []).length > 0, 'At least one photo helps customers recognise it.']);

    const row = (x, soft) =>
      '<div class="check-row ' + (x[1] ? 'ok' : soft ? 'warn' : '') + '"><span class="check-icon">' + (x[1] ? '✓' : soft ? '•' : '!') +
      '</span><div><strong>' + esc(x[0]) + '</strong><small>' + esc(x[2]) + '</small></div></div>';

    const okReq = req.filter(x => x[1]).length;

    const count = byId('checkCount');
    if (count) count.textContent = okReq + '/' + req.length;

    const list = byId('publishChecklist');
    if (list) {
      list.innerHTML = req.map(x => row(x, false)).join('') +
        '<div class="sd-check-sep">Recommended for accurate AI answers</div>' +
        rec.map(x => row(x, true)).join('');
    }

    const pub = byId('publishBtn');
    if (pub) pub.disabled = okReq !== req.length;

    const pn = byId('previewName');
    if (pn) pn.textContent = name || 'Service name';

    const pd = byId('previewDescription');
    if (pd) pd.textContent = desc || 'Description preview will appear here.';

    const pp = byId('previewPrice');
    if (pp) {
      const cur = val('fCurrency') || 'INR';
      let text = priceRaw ? money(priceRaw, cur) : '₹0';
      const mrp = Number(cleanBlock('offer').mrp);
      if (priceRaw && p.price.indexOf('offer') !== -1 && mrp > Number(priceRaw)) {
        text += '  (MRP ' + money(mrp, cur) + ', ' + Math.round((1 - Number(priceRaw) / mrp) * 100) + '% off)';
      }
      pp.textContent = text;
    }

    renderAiPreview();
  };

  /* =======================================================
     SERVICE CARDS: price saving, delivery, stock chips
  ======================================================= */

  function chipsFor(s) {
    const od = s.sdDetails;
    const cur = (s.price && s.price.currency) || 'INR';
    const ctx = { fmt: n => money(n, cur) };
    const chips = [];

    if (od && od.blocks) {
      Object.keys(od.blocks).forEach(bid => {
        const B = BLOCKS[bid];
        if (!B || !B.chip) return;
        const c = B.chip(od.blocks[bid], ctx);
        if (c && c.t) chips.push(c);
      });
    } else if (derivedStatus(s) !== 'archived') {
      chips.push({ t: 'Details missing', c: 'warn' });
    }

    return chips.slice(0, 4);
  }

  function decorateCards() {
    const grid = byId('serviceGrid');
    if (!grid) return;

    Array.prototype.forEach.call(grid.querySelectorAll('.service-card'), card => {
      const btn = card.querySelector('.edit-service');
      const s = btn && state.services.find(x => x.id === btn.dataset.id);
      if (!s) return;

      const od = s.sdDetails;
      const offer = od && od.blocks && od.blocks.offer;
      const priceEl = card.querySelector('.service-meta .price');

      if (offer && priceEl && s.price && Number(offer.mrp) > Number(s.price.amount) &&
        !(offer.valid_until && String(offer.valid_until) < todayStr())) {
        const box = document.createElement('div');
        box.className = 'sd-pricebox';
        priceEl.parentNode.insertBefore(box, priceEl);
        box.appendChild(priceEl);

        const mrp = document.createElement('s');
        mrp.className = 'sd-mrp';
        mrp.textContent = money(offer.mrp, s.price.currency);
        box.appendChild(mrp);

        const off = document.createElement('span');
        off.className = 'sd-off';
        off.textContent = Math.round((1 - Number(s.price.amount) / Number(offer.mrp)) * 100) + '% off';
        box.appendChild(off);
      }

      const chips = chipsFor(s);
      const actions = card.querySelector('.card-actions');

      if (chips.length && actions) {
        const row = document.createElement('div');
        row.className = 'sd-chips';
        chips.forEach(c => {
          const el = document.createElement('span');
          el.className = 'sd-chip' + (c.c ? ' ' + c.c : '');
          el.textContent = c.t;
          row.appendChild(el);
        });
        actions.parentNode.insertBefore(row, actions);
      }
    });
  }

  const baseRenderGrid = renderGrid;

  renderGrid = function () {
    baseRenderGrid();
    try { decorateCards(); } catch (e) { console.warn('[GLIME DETAILS] card decoration failed:', e); }
  };

  /* =======================================================
     EVENTS
  ======================================================= */

  function setBlockValue(bid, k, value) {
    if (!state.details.blocks[bid]) state.details.blocks[bid] = {};
    state.details.blocks[bid][k] = value;
  }

  function onBlockEvent(e) {
    const el = e.target.closest && e.target.closest('[data-sd-b]');
    if (!el) return;

    const bid = el.dataset.sdB;
    const k = el.dataset.sdK;
    if (!BLOCKS[bid]) return;

    setBlockValue(bid, k, el.value);

    if (e.type === 'change' && el.tagName === 'SELECT') {
      const grid = document.querySelector('.sd-card[data-block="' + bid + '"] .sd-grid');
      if (grid) {
        grid.innerHTML = blockFields(bid);
        const again = grid.querySelector('[data-sd-k="' + k + '"]');
        if (again) again.focus();
      }
    }

    updateChecklist();
  }

  function onListInput(e) {
    const t = e.target;
    if (!t.dataset) return;

    if (t.dataset.faqI !== undefined) {
      const x = state.details.faqs[Number(t.dataset.faqI)];
      if (x) x[t.dataset.faqF] = t.value;
    } else if (t.dataset.factI !== undefined) {
      const x = state.details.facts[Number(t.dataset.factI)];
      if (x) x[t.dataset.factF] = t.value;
    } else if (t.dataset.aiK) {
      state.details.ai[t.dataset.aiK] = t.value;
      state.details.aiDirty[t.dataset.aiK] = true;
    } else {
      return;
    }

    updateChecklist();
  }

  const SAFE_RULES = [
    'Do not diagnose or give medical advice.',
    'Do not suggest medicines or dosages.',
    'For any medical question, ask the person to consult the doctor.'
  ];

  function onExtrasClick(e) {
    const b = e.target.closest && e.target.closest('[data-sd-act]');
    if (!b) return;

    const d = state.details;
    const i = Number(b.dataset.i);

    switch (b.dataset.sdAct) {
      case 'add-faq': if (d.faqs.length < MAX_ROWS) d.faqs.push({ q: '', a: '' }); break;
      case 'rm-faq': d.faqs.splice(i, 1); break;
      case 'add-fact': if (d.facts.length < MAX_ROWS) d.facts.push({ label: '', value: '' }); break;
      case 'rm-fact': d.facts.splice(i, 1); break;
      case 'ai-safe': {
        const have = toLines(d.ai.restrictions);
        SAFE_RULES.forEach(r => { if (have.indexOf(r) === -1) have.push(r); });
        d.ai.restrictions = have.join('\n');
        d.aiDirty.restrictions = true;
        break;
      }
      default: return;
    }

    renderExtras();
    updateChecklist();
  }

  const detailsHost = byId('detailBlocks');
  if (detailsHost) {
    detailsHost.addEventListener('input', onBlockEvent);
    detailsHost.addEventListener('change', onBlockEvent);
    detailsHost.addEventListener('input', onListInput);
    detailsHost.addEventListener('click', onExtrasClick);
  }

  const offerHost = byId('offerBlocks');
  if (offerHost) {
    offerHost.addEventListener('input', onBlockEvent);
    offerHost.addEventListener('change', onBlockEvent);
  }

  /* Variant rows: handled in the capture phase so the original
     (single-column) handlers in services.js never see these events. */
  const overlay = byId('wizardOverlay');
  if (overlay) {
    overlay.addEventListener('input', e => {
      if (!e.target.closest || !e.target.closest('#variantList')) return;
      e.stopPropagation();
      onVariantInput(e.target);
    }, true);

    overlay.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-remove-variant]');
      if (!b || !b.closest('#variantList')) return;
      e.stopPropagation();
      state.variants.splice(Number(b.dataset.removeVariant), 1);
      renderVariants();
    }, true);
  }

  on('fProfile', 'change', e => {
    state.details.profile = e.target.value;
    state.details.profileTouched = true;
    renderDetails();
    updateChecklist();
  });

  on('fType', 'change', () => {
    if (!state.details.profileTouched) state.details.profile = suggestProfile(curType());
    renderDetails();
    updateChecklist();
  });

  on('fPriceType', 'change', () => { togglePriceMax(); updateChecklist(); });

  on('fCurrency', 'change', () => {
    syncCurrency();
    renderOfferBlocks();
    renderDetailBlocks();
    updateChecklist();
  });

  on('fPriceMax', 'input', e => { state.details.priceMax = e.target.value; });
  on('fDuration', 'input', e => { state.details.duration = e.target.value; updateChecklist(); });

  window.GLIME_SERVICE_DETAILS = {
    profiles: PROFILES,
    blocks: BLOCKS,
    suggestProfile,
    cleanBlock,
    buildPayload,
    hydrate
  };

  console.log('[GLIME DETAILS] Industry details addon loaded.');
})();
