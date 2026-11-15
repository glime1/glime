/* =========================================================
   GLIME SERVICES — CREATOR COURSE (approved creators only)
   ---------------------------------------------------------
   Connects the Creator program (creator_applications, approved by the GLIME
   admin) with Services.

   What it does
   - Reads the signed-in user's OWN creator_applications row (read-only).
   - ONLY when status = 'approved':
       * adds the profile "Creator course" to the service wizard
         (kind of business list) with a course-specific template:
         how the buyer gets the course, when the AI may send the link,
         preview link, payment note, refund, access period, certificate...
       * shows an "Add your course" card on the Services page, pre-filled
         with the course name from the application
   - When the status is anything else (pending / rejected / revoked / none):
       * the profile is removed from the wizard, publishing a creator course
         is blocked, and existing creator-course cards show a warning.
   - On every save it writes the common buyer questions as FAQs from the
     course fields (so the AI always has a ready answer), and on first
     selection it pre-fills safe AI rules (never share the link early,
     never promise income or results, no extra discounts/refunds).

   Frontend only. Needs: services-industry-addon.js (GLIME_SERVICE_DETAILS)
   and services-fixes-addon.js loaded BEFORE this file.
   No database change. The real permission must still be enforced by the
   backend (see notes in the hand-over message).
========================================================= */
(function () {
  'use strict';

  const D = window.GLIME_SERVICE_DETAILS;
  if (typeof state === 'undefined' || typeof supabaseClient === 'undefined' || !D || !D.profiles || !D.blocks) {
    console.warn('[GLIME CREATOR] Services details addon not found; creator courses disabled.');
    return;
  }

  const KEY = 'creator_course';
  const MAX_ROWS = 15;
  const byId = id => document.getElementById(id);
  const safe = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const say = (m, t) => { try { toast(m, t); } catch (_) { /* ignore */ } };
  const isUrl = u => /^https?:\/\/\S+$/i.test(String(u || ''));

  let approved = false;
  let app = null;
  let inflight = null;
  let muteSeed = false;

  /* =======================================================
     TEMPLATE
  ======================================================= */

  const T = (k, label, o) => Object.assign({ k, label, type: 'text' }, o);
  const S = (k, label, options, o) => Object.assign({ k, label, type: 'select', options }, o);

  const BLOCK = {
    title: 'Course details for your AI',
    hint: 'Your AI uses this to tell buyers how they get the course, when it may send the link, how to pay and what your refund rule is. Answers to common questions are written for you from these details when you save.',
    fields: [
      S('format', 'Course format', [['recorded', 'Recorded videos'], ['live', 'Live classes'], ['mixed', 'Recorded + live'], ['pdf', 'PDF / notes']]),
      S('delivery', 'How does the buyer get the course? *', [
        ['link_chat', 'Course link sent on chat'],
        ['app', 'Access inside an app / platform'],
        ['group', 'Invite to a WhatsApp / Telegram group'],
        ['live', 'Joining link for live classes'],
        ['email', 'Details sent by email']
      ]),
      S('share_link', 'When may your AI send the link? *', [
        ['after_payment', 'Only after payment is confirmed'],
        ['on_request', 'When the customer asks'],
        ['never', 'Never. The customer must contact me']
      ]),
      T('access_link', 'Course / join link *', {
        full: true, max: 300, ph: 'https://…',
        show: v => !!v.share_link && v.share_link !== 'never'
      }),
      T('preview_link', 'Free preview / demo link (optional)', { full: true, max: 300, ph: 'https://…' }),
      T('pay_note', 'How should the buyer pay?', { full: true, max: 200, ph: 'e.g. Pay on the payment link we send, or UPI to 98xxxxxx' }),
      T('ask_first', 'What should the AI ask a new buyer first?', { full: true, max: 160, ph: 'e.g. Their goal and current level' }),
      T('access_period', 'How long does access last?', { max: 60, ph: 'Lifetime / 6 months' }),
      T('duration', 'Course length', { max: 60, ph: '8 hours / 21 days' }),
      { k: 'lessons', label: 'Number of lessons', type: 'number' },
      T('language', 'Language', { max: 40 }),
      S('level', 'Level', [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'], ['all', 'All levels']]),
      S('certificate', 'Certificate', [['yes', 'Provided'], ['no', 'Not provided']]),
      T('support', 'Doubt support', { full: true, max: 160, ph: 'e.g. WhatsApp group, replies within 24 hours' }),
      S('refund', 'Refund policy', [['none', 'No refund'], ['days7', '7-day refund'], ['custom', 'Custom policy']]),
      T('refund_note', 'Refund details', { full: true, max: 200, show: v => v.refund === 'custom' }),
      { k: 'who_for', label: 'Who is this course for?', type: 'textarea', full: true },
      { k: 'syllabus', label: 'What the buyer will learn', type: 'textarea', full: true }
    ],
    chip: () => ({ t: 'Creator course' })
  };

  const PROFILE = {
    label: 'Creator course (approved creators)',
    note: 'Online course: how the buyer gets it, link rules, payment and refund.',
    price: ['offer', 'tax'],
    details: [KEY],
    variants: {
      title: 'Course plans', add: 'plan', noun: 'Plan',
      hint: 'For example Basic and Premium (with 1:1 support).',
      cols: []
    }
  };

  const AI_POINTS = [
    'Explain clearly how the buyer gets the course and when.',
    'Mention the free preview if one is available.',
    'Quote the exact price shown for this course.'
  ].join('\n');

  const AI_RULES = [
    'Share the course link only as set in the course details. Never share it earlier.',
    'Do not promise income, jobs, rankings or guaranteed results.',
    'Do not offer discounts, refunds or extra access beyond what is written here.'
  ].join('\n');

  /* =======================================================
     APPROVAL (own row, read-only)
  ======================================================= */

  function register() {
    D.blocks[KEY] = BLOCK;
    D.profiles[KEY] = PROFILE;
  }

  function unregister() {
    delete D.profiles[KEY];
    if (state.details && state.details.profile === KEY) {
      state.details.profile = '';
      state.details.profileTouched = false;
    }
  }

  /* The kind-of-business list lost "Creator course": redraw the open wizard
     (the industry addon re-reads the profile when the catalog type changes). */
  function redrawAfterLoss() {
    const ov = byId('wizardOverlay');
    const t = byId('fType');
    if (!ov || ov.classList.contains('hidden') || !t) return;
    t.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setApproved(on) {
    const changed = on !== approved;
    const hadProfile = !!(state.details && state.details.profile === KEY);
    approved = on;
    if (on) register(); else unregister();
    if (changed) { paintBanner(); paintWarnings(); }
    if (!on && hadProfile) redrawAfterLoss();
  }

  function refresh() {
    if (inflight) return inflight;

    inflight = (async () => {
      try {
        const s = await supabaseClient.auth.getSession();
        const uid = s && s.data && s.data.session && s.data.session.user && s.data.session.user.id;
        if (!uid) return;

        const r = await supabaseClient
          .from('creator_applications')
          .select('status,course_name,category')
          .eq('auth_user_id', uid)
          .limit(1);

        if (r.error) {
          if (/does not exist|PGRST205|42P01/i.test(String(r.error.code || '') + ' ' + String(r.error.message || ''))) {
            app = null;
            setApproved(false);
          }
          return; /* other errors: keep what we know */
        }

        app = (r.data && r.data[0]) || null;
        setApproved(!!app && String(app.status).toLowerCase() === 'approved');
      } catch (e) {
        console.warn('[GLIME CREATOR] status check failed:', e);
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }

  /* =======================================================
     AUTO FAQs / FACTS from the course fields
  ======================================================= */

  const HOW = {
    link_chat: 'a course link on chat',
    app: 'access inside the course app or platform',
    group: 'an invite to the course group',
    live: 'the joining link for the live classes',
    email: 'an email with the access details'
  };

  function answers(v) {
    const faq = {};

    if (HOW[v.delivery]) {
      let a = 'You get ' + HOW[v.delivery] + '.';
      if (v.share_link === 'after_payment') a += ' It is shared once your payment is confirmed.';
      else if (v.share_link === 'on_request') a += ' Just ask and we will share it.';
      else if (v.share_link === 'never') a += ' Please contact us directly to get access.';
      faq['How will I get the course?'] = a;
    }

    if (v.pay_note) faq['How can I pay?'] = v.pay_note;
    if (v.preview_link) faq['Is there a free preview?'] = 'Yes. You can watch the free preview here: ' + v.preview_link;
    if (v.access_period) faq['How long will I have access?'] = 'You get access for ' + v.access_period + '.';
    if (v.duration) faq['How long is the course?'] = 'The course is ' + v.duration + (v.lessons ? ' with ' + v.lessons + ' lessons' : '') + '.';
    if (v.certificate) faq['Will I get a certificate?'] = v.certificate === 'yes' ? 'Yes, you get a certificate.' : 'No, a certificate is not provided.';
    if (v.support) faq['Can I get help if I am stuck?'] = v.support;

    if (v.refund === 'none') faq['Can I get a refund?'] = 'No. Course fees are non-refundable.';
    else if (v.refund === 'days7') faq['Can I get a refund?'] = 'Yes, within 7 days of purchase.';
    else if (v.refund === 'custom' && v.refund_note) faq['Can I get a refund?'] = v.refund_note;

    if (v.who_for) faq['Who is this course for?'] = v.who_for;
    if (v.syllabus) faq['What will I learn?'] = v.syllabus;

    const facts = {};
    if (v.ask_first) facts['First question to ask a new buyer'] = v.ask_first;
    if (v.format) facts['Course format'] = { recorded: 'Recorded videos', live: 'Live classes', mixed: 'Recorded and live', pdf: 'PDF / notes' }[v.format] || v.format;

    return { faq, facts };
  }

  const AUTO_Q = [
    'How will I get the course?', 'How can I pay?', 'Is there a free preview?', 'How long will I have access?',
    'How long is the course?', 'Will I get a certificate?', 'Can I get help if I am stuck?', 'Can I get a refund?',
    'Who is this course for?', 'What will I learn?'
  ];
  const AUTO_F = ['First question to ask a new buyer', 'Course format'];

  function syncRows() {
    const d = state.details;
    const gen = answers(D.cleanBlock(KEY));

    const keepFaq = d.faqs.filter(x => AUTO_Q.indexOf(String(x.q || '').trim()) === -1);
    const keepFact = d.facts.filter(x => AUTO_F.indexOf(String(x.label || '').trim()) === -1);

    const newFaq = Object.keys(gen.faq).map(q => ({ q, a: String(gen.faq[q]).slice(0, 800) }));
    const newFact = Object.keys(gen.facts).map(label => ({ label, value: String(gen.facts[label]).slice(0, 300) }));

    d.faqs = newFaq.slice(0, Math.max(0, MAX_ROWS - keepFaq.length)).concat(keepFaq);
    d.facts = newFact.slice(0, Math.max(0, MAX_ROWS - keepFact.length)).concat(keepFact);
  }

  /* Re-draw the details area from state (the industry addon does this on a
     profile change) so row numbers on screen match the data again. */
  function redrawDetails() {
    const sel = byId('fProfile');
    if (!sel || sel.value !== KEY) return;
    muteSeed = true;
    try { sel.dispatchEvent(new Event('change', { bubbles: true })); } finally { muteSeed = false; }
  }

  /* =======================================================
     AI RULES (first time the course profile is used)
  ======================================================= */

  function seedAi() {
    const d = state.details;
    if (muteSeed || d.profile !== KEY) return;
    if (['points', 'restrictions'].some(k => String(d.ai[k] || '').trim())) return;

    d.ai.points = AI_POINTS;
    d.ai.restrictions = AI_RULES;
    d.aiDirty.points = true;
    d.aiDirty.restrictions = true;

    const p = document.querySelector('[data-ai-k="points"]');
    const r = document.querySelector('[data-ai-k="restrictions"]');
    if (p) p.value = AI_POINTS;
    if (r) r.value = AI_RULES;
  }

  const sel0 = byId('fProfile');
  if (sel0) sel0.addEventListener('change', seedAi);

  /* =======================================================
     VALIDATION + PUBLISH GUARD
  ======================================================= */

  const NOT_APPROVED = 'Creator course needs your GLIME creator approval. Apply from Settings > Connector > Creator, or choose another kind of business.';

  function courseErr() {
    const v = D.cleanBlock(KEY);

    if (!v.delivery) return 'Course details: choose how the buyer gets the course.';
    if (!v.share_link) return 'Course details: choose when your AI may send the link.';

    if (v.share_link !== 'never') {
      if (!v.access_link) return 'Course details: add the course link your AI should send.';
      if (!isUrl(v.access_link)) return 'Course link must start with http:// or https://';
    }

    if (v.preview_link && !isUrl(v.preview_link)) return 'Preview link must start with http:// or https://';
    return '';
  }

  const baseValidate = validateStep;

  validateStep = function (n) {
    const e = baseValidate.apply(this, arguments);
    if (e) return e;

    if (state.details && state.details.profile === KEY) {
      if (!approved) return NOT_APPROVED;
      if (n === 3) return courseErr();
    }
    return '';
  };

  const basePublish = submitPublish;

  submitPublish = async function () {
    if (state.details && state.details.profile === KEY) {
      await refresh();
      if (!approved) {
        try { showAlert(NOT_APPROVED); } catch (_) { say(NOT_APPROVED, 'bad'); }
        return undefined;
      }
    }
    return basePublish.apply(this, arguments);
  };

  const baseSave = saveStructured;

  saveStructured = async function () {
    if (state.details && state.details.profile === KEY && approved) {
      try { syncRows(); } catch (e) { console.warn('[GLIME CREATOR] FAQ sync failed:', e); }
    }

    const out = await baseSave.apply(this, arguments);

    if (state.details && state.details.profile === KEY) {
      try { redrawDetails(); } catch (_) { /* ignore */ }
    }
    return out;
  };

  /* =======================================================
     SERVICES PAGE: "Add your course" card + warnings
  ======================================================= */

  const hasCourse = () => (state.services || []).some(s =>
    s && s.sdDetails && s.sdDetails.profile === KEY && s.status !== 'archived');

  function paintBanner() {
    let box = byId('svCreatorBanner');
    const show = approved && app && !hasCourse();

    if (!show) {
      if (box) box.remove();
      return;
    }

    const anchor = byId('svStats');
    if (!anchor || !anchor.parentNode) return;

    if (!box) {
      box = document.createElement('div');
      box.id = 'svCreatorBanner';
      box.className = 'sv-creator';
      anchor.parentNode.insertBefore(box, anchor);
    }

    const name = String(app.course_name || '').trim();
    box.innerHTML =
      '<div><strong>Creator approved ✓</strong>' +
      '<p>Add ' + (name ? '“' + safe(name) + '”' : 'your course') +
      ' as a service so your AI can tell buyers how to get it, send the link and answer payment and refund questions.</p></div>' +
      '<button type="button" class="primary-btn" data-cr-add>＋ Add course</button>';
  }

  function paintWarnings() {
    const grid = byId('serviceGrid');
    if (!grid) return;

    Array.prototype.forEach.call(grid.querySelectorAll('.sv-cr-warn'), n => n.remove());
    if (approved) return;

    Array.prototype.forEach.call(grid.querySelectorAll('.service-card'), card => {
      const btn = card.querySelector('.edit-service');
      const s = btn && (state.services || []).find(x => x.id === btn.dataset.id);
      if (!s || !s.sdDetails || s.sdDetails.profile !== KEY) return;

      const actions = card.querySelector('.card-actions');
      if (!actions) return;

      const w = document.createElement('div');
      w.className = 'sv-pending sv-cr-warn';
      w.innerHTML = '<span>⚠ Creator approval is not active. This course cannot be published.</span>';
      actions.parentNode.insertBefore(w, actions);
    });
  }

  async function addCourse(btn) {
    if (btn) btn.disabled = true;
    try {
      await refresh();
      if (!approved || !app) { say(NOT_APPROVED, 'bad'); return; }

      await openWizard({
        id: null,
        current_version_id: null,
        name: String(app.course_name || '').trim(),
        offer_type: 'course',
        status: 'draft',
        version: null,
        pending: null,
        sdDetails: { schema: 1, profile: KEY, blocks: {}, faqs: [], facts: [] }
      });

      const t = byId('wizardTitle');
      if (t) t.textContent = 'Add creator course';

      seedAi();
    } catch (e) {
      say((e && e.message) || 'Could not open the course form.', 'bad');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-cr-add]');
    if (!b) return;
    e.preventDefault();
    addCourse(b);
  });

  /* =======================================================
     HOOKS
  ======================================================= */

  const baseLoad = loadServices;

  loadServices = async function () {
    const out = await baseLoad.apply(this, arguments);
    await refresh();
    paintBanner();
    paintWarnings();
    return out;
  };

  const baseGrid = renderGrid;

  renderGrid = function () {
    baseGrid.apply(this, arguments);
    try { paintBanner(); paintWarnings(); } catch (_) { /* ignore */ }
  };

  /* Pick up an approval (or a revoke) made while this page stayed open. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });

  window.GLIME_CREATOR_SERVICES = {
    isApproved: () => approved,
    refresh,
    _answers: answers,
    _courseErr: courseErr
  };

  refresh();
  console.log('[GLIME CREATOR] Creator course addon loaded.');
})();
