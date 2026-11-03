/* =========================================================
   GLIME - SETTINGS > TEACH AI
   ---------------------------------------------------------
   One Settings section with TWO separate parts:

   1) TEACH AI (lessons)
      The owner teaches the Client AI Brain from real customer questions.
      Each lesson = a customer question + the answer the owner wants the AI to
      give next time. The AI still writes the reply itself, so normal AI
      tokens apply.

      Data: table client_ai_lessons (RLS: owner can only see and change
      the lessons of their own client_id).
        status  'active'   used by the AI (client-ai-runtime picks the few
                           most relevant lessons for each customer message)
                'pending'  suggested lesson waiting for the owner's approval
                'rejected' suggestion the owner declined
                'archived' lesson the owner switched off
      source 'owner' | 'ai_suggested'

      Suggestions: the "Find suggestions" button calls the edge function
      client-ai-learn, which proposes lessons ONLY from chats where the owner
      replied personally after the AI. They arrive as 'pending' and are never
      used until the owner approves them here.

      Safety (enforced in client-ai-runtime): customers can never teach the
      AI, and a lesson never overrides prices, published offers, business
      rules, policies or safety instructions.

      The top of this part also shows a "Fixed Q&A results" card (customers
      answered by Fixed Q&A, tokens saved) so the owner sees the saving
      without opening the other tab.

   2) FIXED Q&A
      The owner writes an exact question + keywords + exact answer. When a
      customer message matches, the saved answer is sent directly BEFORE the
      AI runs: no AI call, 0 tokens charged.

      Limits (enforced on this screen):
        main question  up to 300 characters
        keywords       up to 10 (each up to 60 characters)
        fixed answer   up to 600 characters

      Data: table client_fixed_qa (RLS: owner sees and changes only their own
      client_id rows).
        id, client_id, question, keywords text[], answer,
        is_active boolean, use_count int, last_used_at,
        created_at, updated_at
      RPCs used by this screen (all optional: the screen degrades safely
      when one is missing):
        get_my_fixed_qa_usage()          -> { used, limit, plan_name }
        get_my_fixed_qa_stats()          -> { answered_count, tokens_saved }
        test_my_fixed_qa(p_message text) -> { matched, qa_id, question,
                                              answer, confidence }
      Plan limit is enforced by the database. When it is reached the insert
      fails with a message containing FIXED_QA_LIMIT_REACHED and this screen
      shows the upgrade message.
      Full backend contract: FIXED_QA_BACKEND_SPEC.md

   Deep link: settings.html#teach
   (The id must not start with "ai-": settings.html sends every hash that
   starts with "ai-" to the AI module.)
========================================================= */
(() => {
  'use strict';

  const shell = window.GLIME_SETTINGS;
  if (!shell?.state || !shell?.api || !shell?.ui) {
    throw new Error('GLIME Settings shell is not initialized.');
  }

  const { state, api, ui } = shell;
  const db = api.supabase;
  const esc = ui.escapeHtml;

  /* ---- Teach AI (lessons) ---- */
  const COLS =
    'id,channel,source,status,customer_question,bad_reply,lesson,last_used_at,created_at,updated_at';
  const Q_MIN = 2;
  const Q_MAX = 1000;
  const L_MIN = 5;
  const L_MAX = 1000;
  const ACTIVE_LIMIT = 80; // client-ai-runtime reads the 80 most recently updated active lessons

  /* ---- Fixed Q&A ---- */
  const FQ_TABLE = 'client_fixed_qa';
  const FQ_COLS = 'id,question,keywords,answer,is_active,use_count,last_used_at,created_at,updated_at';
  const FQ_Q_MIN = 2;
  const FQ_Q_MAX = 300; // main question: up to 300 characters
  const FQ_A_MIN = 2;
  const FQ_A_MAX = 600; // fixed answer: up to 600 characters
  const FQ_KW_MIN = 2;
  const FQ_KW_MAX_EACH = 60;
  const FQ_KW_MAX = 10; // keywords: up to 10 per item
  const UPGRADE_URL = 'packages.html';
  const TAB_KEY = 'glimeTeachAiTab';

  const S = {
    items: [],
    error: null,
    filter: 'active',
    editing: null,
    tab: 'teach',
    summary: null, // { answered, tokens, total } shown on the Teach AI tab before Fixed Q&A is opened
    fq: {
      ready: false,
      loading: false,
      unavailable: false,
      error: null,
      items: [],
      limitHit: false,
      usage: null, // { used, limit, plan } or null when the usage RPC is not available
      stats: null, // { answered_count, tokens_saved } or null
      filter: 'all',
      sort: 'new', // 'new' = recently updated, 'used' = most used first
      search: '',
      editing: null,
      editKw: [],
      newKw: []
    }
  };

  let ROOT = null;

  const clientId = () => state.client?.client_id || '';
  const errMsg = e => (e && (e.message || e.error_description)) || String(e || 'Unknown error');
  const q = sel => (ROOT ? ROOT.querySelector(sel) : null);
  const fmtNum = n => Number(n || 0).toLocaleString();

  const fmtDate = v => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /* lower-case, remove symbols, collapse spaces (used only for duplicate warnings and search) */
  const norm = v =>
    String(v || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();

  /* live "12/300" counter; turns red when the text is over the limit */
  function setCount(el, len, max) {
    if (!el) return;
    el.textContent = len + '/' + max;
    el.classList.toggle('over', len > max);
  }

  async function withBusy(btn, label, fn) {
    const original = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = label;
    }
    try {
      return await fn();
    } finally {
      if (btn && btn.isConnected) {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
  }

  /* ---------------------------------------------------------
     STYLES
  --------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('glimeTeachAiStyles')) return;

    const style = document.createElement('style');
    style.id = 'glimeTeachAiStyles';
    style.textContent = `
      .lr-root{color:#fff}
      .lr-root *{box-sizing:border-box}
      .lr-root [hidden]{display:none!important}
      .lr-head h2{font-size:1.25rem;line-height:1.2}
      .lr-head p{font-size:.78rem;color:rgba(255,255,255,.72);margin-top:4px;max-width:600px}
      .lr-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:16px;margin:14px 0}
      .lr-card h3{font-size:.98rem;margin-bottom:3px}
      .lr-sub{font-size:.74rem;color:rgba(255,255,255,.72);margin-bottom:12px;line-height:1.5}
      .lr-field{margin-bottom:12px}
      .lr-label{display:block;font-size:.74rem;font-weight:800;margin-bottom:6px}
      .lr-hint{display:block;font-size:.68rem;color:rgba(255,255,255,.62);margin-top:5px;line-height:1.5}
      .lr-input,.lr-textarea{width:100%;background:var(--surf2);color:#fff;border:1px solid var(--bd);border-radius:12px;padding:12px;font-size:16px;outline:none;font-family:inherit}
      .lr-input::placeholder,.lr-textarea::placeholder{color:rgba(255,255,255,.42)}
      .lr-input:focus,.lr-textarea:focus{border-color:rgba(255,255,255,.6)}
      .lr-input:disabled,.lr-textarea:disabled{opacity:.5}
      .lr-textarea{min-height:100px;resize:vertical;line-height:1.5}
      .lr-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:.8rem;font-weight:800;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}
      .lr-btn.primary{background:linear-gradient(105deg,var(--gr),var(--cy));color:#031014;border:0}
      .lr-btn.danger{color:var(--rd);border-color:rgba(255,130,145,.5)}
      .lr-btn.small{min-height:36px;padding:0 12px;font-size:.74rem;border-radius:10px}
      .lr-btn:disabled{opacity:.5;cursor:default}
      .lr-link{border:0;background:transparent;color:var(--cy);font:inherit;font-weight:800;text-decoration:underline;cursor:pointer;padding:0}
      .lr-note{font-size:.7rem;color:rgba(255,255,255,.66);margin-top:10px;line-height:1.5}
      .lr-pill{display:inline-block;font-size:.64rem;font-weight:800;padding:3px 9px;border-radius:99px;border:1px solid rgba(255,255,255,.28);white-space:nowrap}
      .lr-pill.on{color:var(--gr);border-color:rgba(80,245,168,.4)}
      .lr-pill.wait{color:var(--cy);border-color:rgba(82,232,255,.4)}
      .lr-pill.warn{color:var(--rd);border-color:rgba(255,130,145,.5);white-space:normal}
      .lr-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
      .lr-chip{min-height:36px;padding:0 12px;border-radius:99px;border:1px solid var(--bd);background:transparent;color:#fff;font-size:.72rem;font-weight:800;cursor:pointer}
      .lr-chip.active{background:#fff;color:#031014;border-color:#fff}
      .lr-item{border:1px solid var(--bd);background:var(--surf2);border-radius:14px;padding:13px;margin-bottom:10px}
      .lr-item h4{font-size:.84rem;line-height:1.4;word-break:break-word}
      .lr-item .lr-q-label{font-size:.7rem;font-weight:800;color:rgba(255,255,255,.55);margin-bottom:2px}
      .lr-item p{font-size:.78rem;color:rgba(255,255,255,.88);line-height:1.55;white-space:pre-wrap;word-break:break-word;margin-top:2px}
      .lr-meta{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .lr-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .lr-empty{border:1px dashed rgba(255,255,255,.22);border-radius:14px;padding:22px 16px;text-align:center;font-size:.78rem;color:rgba(255,255,255,.8)}
      .lr-empty b{display:block;margin-bottom:4px;font-size:.84rem;color:#fff}
      .lr-err{border:1px solid rgba(255,130,145,.45);border-radius:14px;padding:14px;font-size:.78rem;background:rgba(255,130,145,.07);margin:12px 0}
      .lr-err b{display:block;margin-bottom:3px}
      .lr-loading{padding:26px 0;text-align:center;font-size:.8rem;color:rgba(255,255,255,.75)}
      .lr-safe{display:grid;gap:6px;font-size:.74rem;color:rgba(255,255,255,.82);line-height:1.5}

      .lr-tabs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}
      .lr-tab{text-align:left;min-height:64px;padding:12px 14px;border-radius:14px;border:1px solid var(--bd);background:var(--surf);color:#fff;cursor:pointer}
      .lr-tab b{display:block;font-size:.86rem}
      .lr-tab small{display:block;font-size:.68rem;color:rgba(255,255,255,.66);margin-top:2px;line-height:1.35}
      .lr-tab.active{border-color:var(--cy);background:rgba(82,232,255,.08)}

      .fq-banner{border:1px solid rgba(80,245,168,.4);background:rgba(80,245,168,.07);border-radius:14px;padding:12px 14px;font-size:.76rem;line-height:1.55;margin:14px 0}
      .fq-banner b{color:var(--gr)}
      .fq-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
      .fq-tile{background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:12px}
      .fq-tile b{display:block;font-size:1.1rem;line-height:1.3}
      .fq-tile span{display:block;font-size:.68rem;color:rgba(255,255,255,.66);margin-top:2px}
      .fq-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.12);margin-top:9px;overflow:hidden}
      .fq-bar i{display:block;height:100%;background:linear-gradient(105deg,var(--gr),var(--cy))}
      .fq-bar.full i{background:var(--rd)}
      .fq-limit{border:1px solid rgba(255,130,145,.45);background:rgba(255,130,145,.07);border-radius:14px;padding:14px;font-size:.78rem;line-height:1.55;margin:14px 0}
      .fq-limit b{display:block;margin-bottom:3px}
      .fq-kws{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .fq-kw{display:inline-flex;align-items:center;gap:4px;font-size:.7rem;padding:4px 10px;border-radius:99px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.05);word-break:break-word}
      .fq-kw button{border:0;background:transparent;color:inherit;font-size:1rem;line-height:1;cursor:pointer;padding:0 2px;min-width:22px;min-height:22px}
      .fq-kw-row{display:flex;gap:8px}
      .fq-kw-row .lr-input{flex:1;min-width:0}
      .fq-count{font-size:.66rem;color:rgba(255,255,255,.55);text-align:right;margin-top:4px}
      .fq-count.over{color:var(--rd);font-weight:800}
      .fq-result{border-radius:14px;padding:13px;font-size:.78rem;line-height:1.55;margin-top:12px;border:1px solid var(--bd);background:var(--surf2)}
      .fq-result.hit{border-color:rgba(80,245,168,.45)}
      .fq-result b{display:block;margin-bottom:3px}
      .fq-result p{white-space:pre-wrap;word-break:break-word;color:rgba(255,255,255,.88);margin-top:4px}
      .fq-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:6px}
      .fq-toolbar .lr-input{flex:1;min-width:180px}
      .fq-toolbar select.lr-input{flex:none;width:auto;min-width:170px}
      @media(max-width:640px){
        .lr-actions .lr-btn{flex:1}
        .lr-btn.block-m{width:100%}
        .lr-tabs{grid-template-columns:1fr}
        .fq-toolbar .lr-input{width:100%;flex:none}
        .fq-toolbar select.lr-input{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  /* =========================================================
     PART 1 - TEACH AI (lessons)
  ========================================================= */
  async function fetchLessons() {
    const { data, error } = await db
      .from('client_ai_lessons')
      .select(COLS)
      .eq('client_id', clientId())
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  const bucket = i => (i.status === 'active' ? 'active' : i.status === 'pending' ? 'pending' : 'off');
  const count = key => S.items.filter(i => bucket(i) === key).length;

  function renderTeachPane() {
    const pane = q('#paneTeach');
    if (!pane) return;

    pane.innerHTML = `
      <div id="lrFixedSummary"></div>

      <div class="lr-card" id="lrTeach">
        <h3>Teach your AI</h3>
        <p class="lr-sub">Add a customer question and the answer your AI should follow. Your AI uses a lesson while it writes its own reply, so normal AI tokens apply. Need an exact reply with no token cost? Use <button type="button" class="lr-link" data-act="tab" data-v="fixed">Fixed Q&amp;A</button>.</p>

        <div class="lr-field">
          <label class="lr-label" for="lrQuestion">What does the customer ask?</label>
          <input class="lr-input" id="lrQuestion" maxlength="${Q_MAX}" autocomplete="off" placeholder="e.g. How many days will delivery take?">
        </div>

        <div class="lr-field">
          <label class="lr-label" for="lrLesson">What should the AI answer?</label>
          <textarea class="lr-textarea" id="lrLesson" maxlength="${L_MAX}" placeholder="e.g. Delivery takes 2-3 days in metro cities and 5-7 days elsewhere. Ask for the customer's pincode first."></textarea>
          <span class="lr-hint">Write it the way you would explain it to a new team member. Do not add prices here: AI always takes prices from your published offers.</span>
        </div>

        <div class="lr-field">
          <label class="lr-label" for="lrBad">What did the AI say wrong? <span style="font-weight:400;opacity:.7">(optional)</span></label>
          <textarea class="lr-textarea" id="lrBad" style="min-height:70px" maxlength="${L_MAX}" placeholder="Paste the wrong or incomplete reply so you remember why you added this lesson."></textarea>
        </div>

        <button type="button" class="lr-btn primary block-m" data-act="add">Teach AI</button>
      </div>

      <div class="lr-card">
        <h3>Your lessons</h3>
        <p class="lr-sub">Only <b>Active</b> lessons are used by your AI.</p>
        <div class="lr-chips" id="lrChips"></div>
        <div id="lrList"></div>
      </div>

      <div class="lr-card">
        <h3>How it stays safe</h3>
        <div class="lr-safe">
          <span>Only you can teach your AI. Customers can never change what it learns.</span>
          <span>A lesson never overrides your prices, published offers, business rules, policies or safety instructions.</span>
          <span>Your AI picks only the few most relevant lessons for each message, so many lessons will not slow it down.</span>
        </div>
      </div>
    `;

    renderChips();
    renderList();
    renderTeachSummary();
  }

  /* ---- "Fixed Q&A results" card shown at the top of the Teach AI tab ---- */
  function summaryValues() {
    const F = S.fq;
    if (F.ready && !F.unavailable && !F.error) {
      return {
        answered: F.stats ? F.stats.answered_count : F.items.reduce((n, i) => n + Number(i.use_count || 0), 0),
        tokens: F.stats ? F.stats.tokens_saved : null,
        total: F.items.length
      };
    }
    return S.summary;
  }

  function renderTeachSummary() {
    const host = q('#lrFixedSummary');
    if (!host) return;

    const v = summaryValues();
    if (!v) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = `
      <div class="lr-card">
        <h3>Fixed Q&amp;A results</h3>
        <p class="lr-sub">Customers who already received one of your exact saved answers, with no AI tokens used.</p>
        <div class="fq-tiles" style="margin:0 0 12px">
          <div class="fq-tile"><b>${fmtNum(v.answered)}</b><span>Customers answered by Fixed Q&amp;A</span></div>
          ${v.tokens != null ? `<div class="fq-tile"><b>${fmtNum(v.tokens)}</b><span>AI tokens saved</span></div>` : ''}
          ${v.total != null ? `<div class="fq-tile"><b>${fmtNum(v.total)}</b><span>Fixed Q&amp;A saved</span></div>` : ''}
        </div>
        <button type="button" class="lr-btn small" data-act="tab" data-v="fixed">Open Fixed Q&amp;A</button>
      </div>`;
  }

  async function loadTeachSummary() {
    try {
      const [st, items] = await Promise.all([fetchStats(), fetchFixedItems().catch(() => null)]);
      if (!st && !items) {
        S.summary = null;
      } else {
        S.summary = {
          answered: st ? st.answered_count : items.reduce((n, i) => n + Number(i.use_count || 0), 0),
          tokens: st ? st.tokens_saved : null,
          total: items ? items.length : null
        };
      }
    } catch (e) {
      console.warn('[GLIME Teach AI] summary:', e);
      S.summary = null;
    }
    renderTeachSummary();
  }

  function renderChips() {
    const host = q('#lrChips');
    if (!host) return;

    const defs = [
      ['active', 'Active'],
      ['pending', 'Suggestions'],
      ['off', 'Stopped']
    ];

    host.innerHTML = defs
      .map(
        ([k, l]) =>
          `<button type="button" class="lr-chip ${S.filter === k ? 'active' : ''}" data-act="filter" data-v="${k}">${esc(l)} (${count(k)})</button>`
      )
      .join('');
  }

  function itemHtml(i) {
    if (S.editing === i.id) return editorHtml(i);

    const b = bucket(i);
    const statusPill =
      b === 'active'
        ? '<span class="lr-pill on">Active</span>'
        : b === 'pending'
          ? '<span class="lr-pill wait">Waiting for your approval</span>'
          : `<span class="lr-pill">${i.status === 'rejected' ? 'Rejected' : 'Stopped'}</span>`;

    const buttons =
      b === 'active'
        ? `<button type="button" class="lr-btn small" data-act="edit" data-id="${esc(i.id)}">Edit</button>
           <button type="button" class="lr-btn small" data-act="status" data-id="${esc(i.id)}" data-v="archived">Stop using</button>
           <button type="button" class="lr-btn small danger" data-act="delete" data-id="${esc(i.id)}">Delete</button>`
        : b === 'pending'
          ? `<button type="button" class="lr-btn small primary" data-act="status" data-id="${esc(i.id)}" data-v="active">Approve</button>
             <button type="button" class="lr-btn small" data-act="edit" data-id="${esc(i.id)}">Edit</button>
             <button type="button" class="lr-btn small danger" data-act="status" data-id="${esc(i.id)}" data-v="rejected">Reject</button>`
          : `<button type="button" class="lr-btn small primary" data-act="status" data-id="${esc(i.id)}" data-v="active">Use again</button>
             <button type="button" class="lr-btn small danger" data-act="delete" data-id="${esc(i.id)}">Delete</button>`;

    return `
      <article class="lr-item">
        <div class="lr-q-label">Customer asks</div>
        <h4>${esc(i.customer_question)}</h4>
        <div class="lr-q-label" style="margin-top:10px">AI should answer</div>
        <p>${esc(i.lesson)}</p>
        ${i.bad_reply ? `<div class="lr-q-label" style="margin-top:10px">AI had said</div><p style="opacity:.7">${esc(i.bad_reply)}</p>` : ''}
        <div class="lr-meta">
          ${statusPill}
          <span class="lr-pill">${i.source === 'ai_suggested' ? 'Suggested by AI' : 'Added by you'}</span>
          ${i.last_used_at ? `<span class="lr-pill">Last used ${esc(fmtDate(i.last_used_at))}</span>` : ''}
        </div>
        <div class="lr-actions">${buttons}</div>
      </article>`;
  }

  function editorHtml(i) {
    return `
      <article class="lr-item" data-editing="${esc(i.id)}">
        <div class="lr-field">
          <label class="lr-label">What does the customer ask?</label>
          <input class="lr-input" data-edit-q maxlength="${Q_MAX}" value="${esc(i.customer_question)}">
        </div>
        <div class="lr-field">
          <label class="lr-label">What should the AI answer?</label>
          <textarea class="lr-textarea" data-edit-l maxlength="${L_MAX}">${esc(i.lesson)}</textarea>
        </div>
        <div class="lr-actions">
          <button type="button" class="lr-btn small primary" data-act="save-edit" data-id="${esc(i.id)}">Save</button>
          <button type="button" class="lr-btn small" data-act="cancel-edit">Cancel</button>
        </div>
      </article>`;
  }

  function renderList() {
    const host = q('#lrList');
    if (!host) return;

    const rows = S.items.filter(i => bucket(i) === S.filter);

    const scanBox =
      S.filter === 'pending'
        ? `<div class="lr-item" style="border-style:dashed">
            <h4>Let your AI review your recent chats</h4>
            <p style="opacity:.8">It looks for moments when you replied personally after the AI answered, and suggests a lesson from your reply. Nothing is used until you approve it. Each review uses a small amount of your AI credits.</p>
            <div class="lr-actions"><button type="button" class="lr-btn small primary" data-act="scan">Find suggestions</button></div>
          </div>`
        : '';

    if (!rows.length) {
      const text = {
        active: ['No active lessons yet.', 'Add your first lesson above. Your AI will start using it right away.'],
        pending: ['No suggestions right now.', 'Tap Find suggestions above. Lessons your AI proposes from your own replies will wait here for your approval.'],
        off: ['Nothing here.', 'Lessons you stop or reject will appear here.']
      }[S.filter];
      host.innerHTML = scanBox + `<div class="lr-empty"><b>${esc(text[0])}</b>${esc(text[1])}</div>`;
      return;
    }

    const warn =
      S.filter === 'active' && count('active') >= ACTIVE_LIMIT
        ? `<p class="lr-note" style="margin:0 0 10px">You have ${count('active')} active lessons. Your AI reads the ${ACTIVE_LIMIT} most recently updated ones, so stop old lessons you no longer need.</p>`
        : '';

    host.innerHTML = scanBox + warn + rows.map(itemHtml).join('');
  }

  function renderTeachError(message) {
    const pane = q('#paneTeach');
    if (!pane) return;
    pane.innerHTML = `
      <div class="lr-err"><b>Could not load Teach AI.</b>${esc(message)}
        <div style="margin-top:10px"><button type="button" class="lr-btn small" data-act="retry">Try again</button></div>
      </div>`;
  }

  async function addLesson(btn) {
    const question = (q('#lrQuestion')?.value || '').trim();
    const lesson = (q('#lrLesson')?.value || '').trim();
    const bad = (q('#lrBad')?.value || '').trim();

    if (question.length < Q_MIN) return ui.toast('Write the customer question.', true);
    if (lesson.length < L_MIN) return ui.toast('Write the answer your AI should give (at least a few words).', true);

    await withBusy(btn, 'Saving…', async () => {
      try {
        const { data, error } = await db
          .from('client_ai_lessons')
          .insert({
            client_id: clientId(),
            source: 'owner',
            status: 'active',
            customer_question: question.slice(0, Q_MAX),
            lesson: lesson.slice(0, L_MAX),
            bad_reply: bad ? bad.slice(0, L_MAX) : null,
            reviewed_at: new Date().toISOString()
          })
          .select(COLS)
          .single();
        if (error) throw error;

        S.items.unshift(data);
        S.filter = 'active';
        ['#lrQuestion', '#lrLesson', '#lrBad'].forEach(sel => {
          const el = q(sel);
          if (el) el.value = '';
        });
        renderChips();
        renderList();
        ui.toast('Your AI has learned this.');
      } catch (e) {
        console.error('[GLIME Teach AI] add:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function setStatus(btn) {
    const id = btn.dataset.id;
    const status = btn.dataset.v;
    if (!id || !['active', 'archived', 'rejected'].includes(status)) return;

    await withBusy(btn, '…', async () => {
      try {
        const { data, error } = await db
          .from('client_ai_lessons')
          .update({ status, reviewed_at: new Date().toISOString() })
          .eq('id', id)
          .eq('client_id', clientId())
          .select(COLS)
          .single();
        if (error) throw error;

        S.items = S.items.map(i => (i.id === id ? data : i));
        renderChips();
        renderList();
        ui.toast(
          status === 'active' ? 'Lesson is now active.' : status === 'rejected' ? 'Suggestion rejected.' : 'Lesson stopped.'
        );
      } catch (e) {
        console.error('[GLIME Teach AI] status:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function saveEdit(btn) {
    const id = btn.dataset.id;
    const card = btn.closest('[data-editing]');
    if (!id || !card) return;

    const question = (card.querySelector('[data-edit-q]')?.value || '').trim();
    const lesson = (card.querySelector('[data-edit-l]')?.value || '').trim();

    if (question.length < Q_MIN) return ui.toast('Write the customer question.', true);
    if (lesson.length < L_MIN) return ui.toast('Write the answer your AI should give (at least a few words).', true);

    await withBusy(btn, 'Saving…', async () => {
      try {
        const { data, error } = await db
          .from('client_ai_lessons')
          .update({
            customer_question: question.slice(0, Q_MAX),
            lesson: lesson.slice(0, L_MAX)
          })
          .eq('id', id)
          .eq('client_id', clientId())
          .select(COLS)
          .single();
        if (error) throw error;

        S.items = S.items.map(i => (i.id === id ? data : i));
        S.editing = null;
        renderChips();
        renderList();
        ui.toast('Lesson updated.');
      } catch (e) {
        console.error('[GLIME Teach AI] edit:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function deleteLesson(btn) {
    const id = btn.dataset.id;
    const item = S.items.find(i => i.id === id);
    if (!item) return;

    const ok = await ui.confirm('Delete this lesson? Your AI will no longer use it.', {
      title: 'Delete lesson',
      confirmText: 'Delete',
      danger: true
    });
    if (!ok) return;

    await withBusy(btn, 'Deleting…', async () => {
      try {
        const { error } = await db
          .from('client_ai_lessons')
          .delete()
          .eq('id', id)
          .eq('client_id', clientId());
        if (error) throw error;

        S.items = S.items.filter(i => i.id !== id);
        renderChips();
        renderList();
        ui.toast('Lesson deleted.');
      } catch (e) {
        console.error('[GLIME Teach AI] delete:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function scanChats(btn) {
    await withBusy(btn, 'Reviewing chats…', async () => {
      try {
        const { data, error } = await db.functions.invoke('client-ai-learn', { body: { action: 'suggest' } });
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);

        S.items = await fetchLessons();
        renderChips();
        renderList();

        const n = Number((data && data.suggested) || 0);
        const reason = data && data.reason;
        if (n > 0) {
          ui.toast(n === 1 ? '1 new suggestion is ready.' : n + ' new suggestions are ready.');
        } else if (reason === 'too_soon') {
          ui.toast('You just checked. Please try again in a few minutes.');
        } else if (reason === 'no_credits') {
          ui.toast('Not enough AI credits. Please recharge, then try again.', true);
        } else if (reason === 'too_many_pending') {
          ui.toast('Approve or reject your current suggestions first.');
        } else if (reason === 'no_new_corrections') {
          ui.toast('No new replies from you to learn from yet.');
        } else {
          ui.toast('Nothing reusable found in your recent chats.');
        }
      } catch (e) {
        console.error('[GLIME Teach AI] scan:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function loadTeach() {
    const pane = q('#paneTeach');
    if (pane) pane.innerHTML = '<div class="lr-loading">Loading Teach AI…</div>';
    try {
      S.items = await fetchLessons();
      S.error = null;
      S.editing = null;
      // Open on Suggestions when something is waiting for approval and nothing is active yet.
      if (!count('active') && count('pending')) S.filter = 'pending';
      renderTeachPane();
      loadTeachSummary();
    } catch (e) {
      console.error('[GLIME Teach AI] load:', e);
      S.error = errMsg(e);
      renderTeachError(S.error);
    }
  }

  /* =========================================================
     PART 2 - FIXED Q&A
  ========================================================= */
  const isMissingBackend = e => {
    const code = String((e && (e.code || e.status)) || '');
    const msg = errMsg(e);
    return (
      ['42P01', '42883', 'PGRST205', 'PGRST202', '404'].includes(code) ||
      /does not exist|schema cache|could not find the (table|function)/i.test(msg)
    );
  };

  const isLimitError = e => /fixed_qa_limit/i.test(errMsg(e));

  const firstRow = d => (Array.isArray(d) ? d[0] : d) || null;

  async function fetchFixedItems() {
    const { data, error } = await db
      .from(FQ_TABLE)
      .select(FQ_COLS)
      .eq('client_id', clientId())
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  async function fetchUsage() {
    try {
      const { data, error } = await db.rpc('get_my_fixed_qa_usage');
      if (error) throw error;
      const r = firstRow(data);
      if (!r) return null;
      const limit = r.limit == null ? null : Number(r.limit);
      return {
        used: Number(r.used ?? S.fq.items.length),
        limit: Number.isFinite(limit) ? limit : null,
        plan: r.plan_name || r.plan || ''
      };
    } catch (e) {
      if (!isMissingBackend(e)) console.warn('[GLIME Fixed Q&A] usage:', e);
      return null;
    }
  }

  async function fetchStats() {
    try {
      const { data, error } = await db.rpc('get_my_fixed_qa_stats');
      if (error) throw error;
      const r = firstRow(data);
      if (!r) return null;
      return {
        answered_count: Number(r.answered_count || 0),
        tokens_saved: r.tokens_saved == null ? null : Number(r.tokens_saved)
      };
    } catch (e) {
      if (!isMissingBackend(e)) console.warn('[GLIME Fixed Q&A] stats:', e);
      return null;
    }
  }

  async function refreshUsageStats() {
    const [u, st] = await Promise.all([fetchUsage(), fetchStats()]);
    S.fq.usage = u;
    S.fq.stats = st;
  }

  async function loadFixed() {
    const F = S.fq;
    F.loading = true;
    F.error = null;
    renderFixedPane();
    try {
      F.items = await fetchFixedItems();
      F.unavailable = false;
      await refreshUsageStats();
    } catch (e) {
      console.error('[GLIME Fixed Q&A] load:', e);
      if (isMissingBackend(e)) {
        F.unavailable = true;
        F.items = [];
      } else {
        F.error = errMsg(e);
      }
    }
    F.loading = false;
    F.ready = true;
    renderFixedPane();
    renderTeachSummary();
  }

  function usageView() {
    const F = S.fq;
    const used = F.usage ? F.usage.used : F.items.length;
    const limit = F.usage && F.usage.limit != null && F.usage.limit >= 0 ? F.usage.limit : null;
    return { used, limit, plan: (F.usage && F.usage.plan) || '' };
  }

  const limitReached = () => {
    const { used, limit } = usageView();
    if (limit != null) return used >= limit;
    return !!S.fq.limitHit;
  };

  function syncUsage() {
    S.fq.limitHit = false; // count changed (item added or deleted): re-check from fresh numbers
    if (S.fq.usage) S.fq.usage.used = S.fq.items.length;
  }

  const chipsHtml = (arr, scope) =>
    arr
      .map(
        (k, i) =>
          `<span class="fq-kw">${esc(k)}<button type="button" aria-label="Remove ${esc(k)}" data-act="fq-kw-del" data-scope="${scope}" data-i="${i}">×</button></span>`
      )
      .join('');

  function renderKw(scope) {
    const arr = scope === 'new' ? S.fq.newKw : S.fq.editKw;
    const host = scope === 'new' ? q('#fqKwChips') : q('[data-kw-chips="edit"]');
    if (host) host.innerHTML = chipsHtml(arr, scope);

    const cnt = scope === 'new' ? q('#fqKwCount') : q('[data-kw-count="edit"]');
    if (cnt) {
      cnt.textContent = arr.length + '/' + FQ_KW_MAX + ' keywords';
      cnt.classList.toggle('over', arr.length > FQ_KW_MAX);
    }
  }

  function commitKw(scope) {
    const input = scope === 'new' ? q('#fqKwInput') : q('[data-kw-input="edit"]');
    if (!input) return;

    const arr = scope === 'new' ? S.fq.newKw : S.fq.editKw;
    const parts = input.value
      .split(/[,\n]/)
      .map(p => p.trim().replace(/\s+/g, ' '))
      .filter(Boolean);

    let tooMany = false;
    let tooLong = false;
    parts.forEach(p => {
      if (p.length < FQ_KW_MIN) return;
      if (p.length > FQ_KW_MAX_EACH) {
        tooLong = true;
        return;
      }
      if (arr.some(x => norm(x) === norm(p))) return;
      if (arr.length >= FQ_KW_MAX) {
        tooMany = true;
        return;
      }
      arr.push(p);
    });

    input.value = '';
    renderKw(scope);
    if (tooMany) ui.toast('You can add up to ' + FQ_KW_MAX + ' keywords.', true);
    else if (tooLong) ui.toast('Each keyword can be up to ' + FQ_KW_MAX_EACH + ' characters.', true);
  }

  function renderFixedPane() {
    const pane = q('#paneFixed');
    if (!pane) return;
    const F = S.fq;

    if (!F.ready && F.loading) {
      pane.innerHTML = '<div class="lr-loading">Loading Fixed Q&amp;A…</div>';
      return;
    }

    if (F.unavailable) {
      pane.innerHTML = `
        <div class="lr-card">
          <h3>Fixed Q&amp;A is almost ready</h3>
          <p class="lr-sub" style="margin-bottom:0">This feature is being switched on for your account. Please check again in a little while. Your Teach AI lessons keep working as usual.</p>
        </div>`;
      return;
    }

    if (F.error) {
      pane.innerHTML = `
        <div class="lr-err"><b>Could not load Fixed Q&amp;A.</b>${esc(F.error)}
          <div style="margin-top:10px"><button type="button" class="lr-btn small" data-act="fq-retry">Try again</button></div>
        </div>`;
      return;
    }

    pane.innerHTML = `
      <div class="fq-banner">
        <b>0 tokens used.</b> When a customer asks one of these questions, GLIME sends your saved answer directly and your AI does not run, so no AI tokens are charged. Anything that does not clearly match goes to your AI as usual.
      </div>

      <div id="fqStats"></div>
      <div id="fqLimit"></div>

      <div class="lr-card" id="fqFormCard">
        <h3>Add a fixed question and answer</h3>
        <p class="lr-sub">Use this for questions that always have the same answer, like timings, address, delivery or return policy.</p>

        <div class="lr-field">
          <label class="lr-label" for="fqQuestion">Main question</label>
          <input class="lr-input" id="fqQuestion" maxlength="${FQ_Q_MAX}" autocomplete="off" placeholder="e.g. What are your shop timings?">
          <div class="fq-count" id="fqQuestionCount">0/${FQ_Q_MAX}</div>
        </div>

        <div class="lr-field">
          <label class="lr-label" for="fqKwInput">Other words customers use <span style="font-weight:400;opacity:.7">(keywords, optional, up to ${FQ_KW_MAX})</span></label>
          <div class="fq-kw-row">
            <input class="lr-input" id="fqKwInput" data-kw-input="new" autocomplete="off" placeholder="e.g. timing, open time, kab khulta hai">
            <button type="button" class="lr-btn small" data-act="fq-kw-add" data-scope="new">Add</button>
          </div>
          <div class="fq-kws" id="fqKwChips"></div>
          <div class="fq-count" id="fqKwCount">0/${FQ_KW_MAX} keywords</div>
          <span class="lr-hint">Add the different ways customers ask this, one at a time (press Enter or tap Add). You can add up to ${FQ_KW_MAX} keywords. Capital letters, symbols and common Hinglish spellings are handled for you. Keep keywords specific: very common words can match the wrong question.</span>
        </div>

        <div class="lr-field">
          <label class="lr-label" for="fqAnswer">Fixed answer</label>
          <textarea class="lr-textarea" id="fqAnswer" maxlength="${FQ_A_MAX}" placeholder="e.g. We are open every day from 10 AM to 9 PM."></textarea>
          <div class="fq-count" id="fqAnswerCount">0/${FQ_A_MAX}</div>
          <span class="lr-hint">This exact text is sent to the customer (up to ${FQ_A_MAX} characters). Do not put prices that change often here, because the answer will not update by itself.</span>
        </div>

        <button type="button" class="lr-btn primary block-m" id="fqAddBtn" data-act="fq-add">Save Fixed Q&amp;A</button>
      </div>

      <div class="lr-card">
        <h3>Test a customer message</h3>
        <p class="lr-sub">Type a message like a customer would. You will see whether a fixed answer would be sent. Testing does not use tokens and is not counted.</p>
        <div class="fq-kw-row">
          <input class="lr-input" id="fqTestInput" autocomplete="off" maxlength="500" placeholder="e.g. shop kab tak khula rehta hai?">
          <button type="button" class="lr-btn small" data-act="fq-test">Test</button>
        </div>
        <div id="fqTestResult"></div>
      </div>

      <div class="lr-card">
        <h3>Your Fixed Q&amp;A</h3>
        <p class="lr-sub">Only <b>On</b> items are matched against customer messages.</p>
        <div class="fq-toolbar">
          <input class="lr-input" id="fqSearch" type="search" autocomplete="off" placeholder="Search questions, keywords or answers" value="${esc(F.search)}">
          <select class="lr-input" id="fqSort" aria-label="Sort Fixed Q&amp;A">
            <option value="new" ${F.sort === 'used' ? '' : 'selected'}>Recently updated</option>
            <option value="used" ${F.sort === 'used' ? 'selected' : ''}>Most used first</option>
          </select>
        </div>
        <div class="lr-chips" id="fqChips"></div>
        <div id="fqList"></div>
      </div>

      <div class="lr-card">
        <h3>How it stays safe</h3>
        <div class="lr-safe">
          <span>Matching is strict. If GLIME is not sure, your normal AI replies instead of a wrong fixed answer.</span>
          <span>Only you can add or change Fixed Q&amp;A. Customers can never change it.</span>
          <span>If two items share the same keyword, matching can become unclear, so give each item its own keywords.</span>
        </div>
      </div>
    `;

    renderFixedStats();
    renderFixedLimit();
    renderFixedChips();
    renderFixedList();
    renderKw('new');
    applyLimitState();
  }

  function renderFixedStats() {
    const host = q('#fqStats');
    if (!host) return;
    const F = S.fq;
    const { used, limit } = usageView();

    const answered = F.stats ? F.stats.answered_count : F.items.reduce((n, i) => n + Number(i.use_count || 0), 0);
    const pct = limit == null ? 0 : limit === 0 ? 100 : Math.min(100, (used / limit) * 100);

    const counter =
      limit == null
        ? `<b>${fmtNum(used)} saved</b><span>Fixed Q&amp;A</span>`
        : `<b>${fmtNum(used)}/${fmtNum(limit)} used</b><span>Fixed Q&amp;A${F.usage && F.usage.plan ? ' in your ' + esc(F.usage.plan) + ' plan' : ''}</span><div class="fq-bar ${limitReached() ? 'full' : ''}"><i style="width:${pct}%"></i></div>`;

    const tokens =
      F.stats && F.stats.tokens_saved != null
        ? `<div class="fq-tile"><b>${fmtNum(F.stats.tokens_saved)}</b><span>AI tokens saved</span></div>`
        : '';

    host.innerHTML = `
      <div class="fq-tiles">
        <div class="fq-tile">${counter}</div>
        <div class="fq-tile"><b>${fmtNum(answered)}</b><span>Customer questions answered by Fixed Q&amp;A</span></div>
        ${tokens}
      </div>`;
  }

  function renderFixedLimit() {
    const host = q('#fqLimit');
    if (!host) return;
    if (!limitReached()) {
      host.innerHTML = '';
      return;
    }
    const { limit, plan } = usageView();
    host.innerHTML = `
      <div class="fq-limit">
        <b>Fixed Q&amp;A limit reached</b>
        You have used all ${limit != null ? fmtNum(limit) + ' ' : ''}Fixed Q&amp;A${plan ? ' in your ' + esc(plan) + ' plan' : ''}. Upgrade your plan to add more, or delete one you no longer need.
        <div class="lr-actions"><a class="lr-btn small primary" href="${UPGRADE_URL}">Upgrade plan</a></div>
      </div>`;
  }

  function applyLimitState() {
    const blocked = limitReached();
    ['#fqQuestion', '#fqKwInput', '#fqAnswer'].forEach(sel => {
      const el = q(sel);
      if (el) el.disabled = blocked;
    });
    const kwAdd = q('[data-act="fq-kw-add"][data-scope="new"]');
    if (kwAdd) kwAdd.disabled = blocked;
    const btn = q('#fqAddBtn');
    if (btn) {
      btn.disabled = blocked;
      btn.textContent = blocked ? 'Limit reached' : 'Save Fixed Q&A';
    }
  }

  function refreshFixedTop() {
    renderFixedStats();
    renderFixedLimit();
    applyLimitState();
    renderFixedChips();
    renderFixedList();
    renderTeachSummary();
  }

  const fqOn = i => i.is_active !== false;
  const fqCount = key =>
    S.fq.items.filter(i => (key === 'all' ? true : key === 'on' ? fqOn(i) : !fqOn(i))).length;

  /* an older item saved before the current limits: ask the owner to shorten it when editing */
  const fqOver = i =>
    String(i.question || '').length > FQ_Q_MAX ||
    String(i.answer || '').length > FQ_A_MAX ||
    (Array.isArray(i.keywords) ? i.keywords.length : 0) > FQ_KW_MAX;

  function renderFixedChips() {
    const host = q('#fqChips');
    if (!host) return;
    const defs = [
      ['all', 'All'],
      ['on', 'On'],
      ['off', 'Off']
    ];
    host.innerHTML = defs
      .map(
        ([k, l]) =>
          `<button type="button" class="lr-chip ${S.fq.filter === k ? 'active' : ''}" data-act="fq-filter" data-v="${k}">${esc(l)} (${fqCount(k)})</button>`
      )
      .join('');
  }

  function fqItemHtml(i) {
    if (S.fq.editing === i.id) return fqEditorHtml(i);

    const on = fqOn(i);
    const kws = Array.isArray(i.keywords) ? i.keywords : [];
    return `
      <article class="lr-item">
        <div class="lr-q-label">Customer asks</div>
        <h4>${esc(i.question)}</h4>
        ${
          kws.length
            ? `<div class="fq-kws">${kws.map(k => `<span class="fq-kw">${esc(k)}</span>`).join('')}</div>`
            : ''
        }
        <div class="lr-q-label" style="margin-top:10px">Fixed answer</div>
        <p>${esc(i.answer)}</p>
        <div class="lr-meta">
          <span class="lr-pill ${on ? 'on' : ''}">${on ? 'On' : 'Off'}</span>
          <span class="lr-pill">Used ${fmtNum(i.use_count)} ${Number(i.use_count) === 1 ? 'time' : 'times'}</span>
          ${i.last_used_at ? `<span class="lr-pill">Last used ${esc(fmtDate(i.last_used_at))}</span>` : ''}
          <span class="lr-pill on">0 tokens</span>
          ${fqOver(i) ? `<span class="lr-pill warn">Over the limit (question ${FQ_Q_MAX}, keywords ${FQ_KW_MAX}, answer ${FQ_A_MAX}). Tap Edit to shorten.</span>` : ''}
        </div>
        <div class="lr-actions">
          <button type="button" class="lr-btn small" data-act="fq-edit" data-id="${esc(i.id)}">Edit</button>
          <button type="button" class="lr-btn small" data-act="fq-toggle" data-id="${esc(i.id)}" data-v="${on ? 'off' : 'on'}">${on ? 'Turn off' : 'Turn on'}</button>
          <button type="button" class="lr-btn small danger" data-act="fq-delete" data-id="${esc(i.id)}">Delete</button>
        </div>
      </article>`;
  }

  function fqEditorHtml(i) {
    const qLen = String(i.question || '').length;
    const aLen = String(i.answer || '').length;
    const kLen = S.fq.editKw.length;
    return `
      <article class="lr-item" data-fq-editing="${esc(i.id)}">
        <div class="lr-field">
          <label class="lr-label">Main question</label>
          <input class="lr-input" data-fq-edit-q maxlength="${FQ_Q_MAX}" value="${esc(i.question)}">
          <div class="fq-count ${qLen > FQ_Q_MAX ? 'over' : ''}" data-cnt="q">${qLen}/${FQ_Q_MAX}</div>
        </div>
        <div class="lr-field">
          <label class="lr-label">Keywords <span style="font-weight:400;opacity:.7">(up to ${FQ_KW_MAX})</span></label>
          <div class="fq-kw-row">
            <input class="lr-input" data-kw-input="edit" autocomplete="off" placeholder="Add a keyword, then press Enter">
            <button type="button" class="lr-btn small" data-act="fq-kw-add" data-scope="edit">Add</button>
          </div>
          <div class="fq-kws" data-kw-chips="edit">${chipsHtml(S.fq.editKw, 'edit')}</div>
          <div class="fq-count ${kLen > FQ_KW_MAX ? 'over' : ''}" data-kw-count="edit">${kLen}/${FQ_KW_MAX} keywords</div>
        </div>
        <div class="lr-field">
          <label class="lr-label">Fixed answer</label>
          <textarea class="lr-textarea" data-fq-edit-a maxlength="${FQ_A_MAX}">${esc(i.answer)}</textarea>
          <div class="fq-count ${aLen > FQ_A_MAX ? 'over' : ''}" data-cnt="a">${aLen}/${FQ_A_MAX}</div>
        </div>
        <div class="lr-actions">
          <button type="button" class="lr-btn small primary" data-act="fq-save-edit" data-id="${esc(i.id)}">Save</button>
          <button type="button" class="lr-btn small" data-act="fq-cancel-edit">Cancel</button>
        </div>
      </article>`;
  }

  function renderFixedList() {
    const host = q('#fqList');
    if (!host) return;
    const F = S.fq;

    const needle = norm(F.search);
    let rows = F.items.filter(i => (F.filter === 'all' ? true : F.filter === 'on' ? fqOn(i) : !fqOn(i)));
    if (needle) {
      rows = rows.filter(i => norm([i.question, ...(i.keywords || []), i.answer].join(' ')).includes(needle));
    }
    if (F.sort === 'used') {
      rows.sort((a, b) => Number(b.use_count || 0) - Number(a.use_count || 0));
    }

    if (!rows.length) {
      const text = F.items.length
        ? needle
          ? ['No match.', 'Try a different word.']
          : ['Nothing here.', 'No items in this view.']
        : ['No Fixed Q&A yet.', 'Add your first question above. Customers who ask it will get your exact answer with no AI tokens used.'];
      host.innerHTML = `<div class="lr-empty"><b>${esc(text[0])}</b>${esc(text[1])}</div>`;
      return;
    }

    host.innerHTML = rows.map(fqItemHtml).join('');
  }

  /* Another ON item already uses the same question or keyword: matching could become unclear. */
  function findOverlap(question, keywords, excludeId) {
    const mine = new Set([question, ...keywords].map(norm).filter(Boolean));
    for (const it of S.fq.items) {
      if (it.id === excludeId || !fqOn(it)) continue;
      const theirs = [it.question, ...(it.keywords || [])].map(norm);
      if (theirs.some(t => t && mine.has(t))) return it;
    }
    return null;
  }

  async function confirmOverlap(question, keywords, excludeId) {
    const other = findOverlap(question, keywords, excludeId);
    if (!other) return true;
    return ui.confirm(
      'Another Fixed Q&A ("' +
        String(other.question).slice(0, 80) +
        '") already uses the same question or keyword. When two items overlap, GLIME may not be sure which answer is right and your AI may reply instead. Save anyway?',
      { title: 'Similar Fixed Q&A found', confirmText: 'Save anyway' }
    );
  }

  /* checks the three Fixed Q&A limits; returns an error message or '' when everything fits */
  function fqLimitError(question, keywords, answer) {
    if (question.length < FQ_Q_MIN) return 'Write the main question.';
    if (question.length > FQ_Q_MAX) return 'Main question can be up to ' + FQ_Q_MAX + ' characters.';
    if (keywords.length > FQ_KW_MAX) return 'You can keep up to ' + FQ_KW_MAX + ' keywords. Remove a few.';
    if (answer.length < FQ_A_MIN) return 'Write the fixed answer.';
    if (answer.length > FQ_A_MAX) return 'Fixed answer can be up to ' + FQ_A_MAX + ' characters.';
    return '';
  }

  function handleLimitError(e) {
    S.fq.limitHit = true; // server said no: block the form even if the usage RPC is not available
    ui.toast('Fixed Q&A limit reached. Upgrade your plan to add more.', true);
    refreshFixedTop();
    refreshUsageStats().then(refreshFixedTop);
    console.warn('[GLIME Fixed Q&A] limit:', errMsg(e));
  }

  async function addFixed(btn) {
    const F = S.fq;
    if (limitReached()) {
      renderFixedLimit();
      return ui.toast('Fixed Q&A limit reached. Upgrade your plan to add more.', true);
    }

    commitKw('new');
    const question = (q('#fqQuestion')?.value || '').trim().replace(/\s+/g, ' ');
    const answer = (q('#fqAnswer')?.value || '').trim();
    const keywords = [...F.newKw];

    const problem = fqLimitError(question, keywords, answer);
    if (problem) return ui.toast(problem, true);

    if (!(await confirmOverlap(question, keywords, null))) return;

    await withBusy(btn, 'Saving…', async () => {
      try {
        const { data, error } = await db
          .from(FQ_TABLE)
          .insert({
            client_id: clientId(),
            question,
            keywords,
            answer,
            is_active: true
          })
          .select(FQ_COLS)
          .single();
        if (error) throw error;

        F.items.unshift(data);
        syncUsage();
        F.newKw = [];
        F.filter = 'all';
        F.search = '';
        ['#fqQuestion', '#fqKwInput', '#fqAnswer', '#fqSearch'].forEach(sel => {
          const el = q(sel);
          if (el) el.value = '';
        });
        setCount(q('#fqQuestionCount'), 0, FQ_Q_MAX);
        setCount(q('#fqAnswerCount'), 0, FQ_A_MAX);
        renderKw('new');
        refreshFixedTop();
        ui.toast('Fixed Q&A saved. Matching customers get this answer with 0 tokens.');
        refreshUsageStats().then(refreshFixedTop);
      } catch (e) {
        console.error('[GLIME Fixed Q&A] add:', e);
        if (isLimitError(e)) handleLimitError(e);
        else ui.toast(errMsg(e), true);
      }
    });
  }

  async function saveFixedEdit(btn) {
    const F = S.fq;
    const id = btn.dataset.id;
    const card = btn.closest('[data-fq-editing]');
    if (!id || !card) return;

    commitKw('edit');
    const question = (card.querySelector('[data-fq-edit-q]')?.value || '').trim().replace(/\s+/g, ' ');
    const answer = (card.querySelector('[data-fq-edit-a]')?.value || '').trim();
    const keywords = [...F.editKw];

    const problem = fqLimitError(question, keywords, answer);
    if (problem) return ui.toast(problem, true);

    if (!(await confirmOverlap(question, keywords, id))) return;

    await withBusy(btn, 'Saving…', async () => {
      try {
        const { data, error } = await db
          .from(FQ_TABLE)
          .update({
            question,
            keywords,
            answer,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .eq('client_id', clientId())
          .select(FQ_COLS)
          .single();
        if (error) throw error;

        F.items = F.items.map(i => (i.id === id ? data : i));
        F.editing = null;
        F.editKw = [];
        refreshFixedTop();
        ui.toast('Fixed Q&A updated.');
      } catch (e) {
        console.error('[GLIME Fixed Q&A] edit:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function toggleFixed(btn) {
    const F = S.fq;
    const id = btn.dataset.id;
    const on = btn.dataset.v === 'on';
    if (!id) return;

    await withBusy(btn, '…', async () => {
      try {
        const { data, error } = await db
          .from(FQ_TABLE)
          .update({ is_active: on, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('client_id', clientId())
          .select(FQ_COLS)
          .single();
        if (error) throw error;

        F.items = F.items.map(i => (i.id === id ? data : i));
        refreshFixedTop();
        ui.toast(on ? 'Turned on.' : 'Turned off. Customers will not get this fixed answer.');
      } catch (e) {
        console.error('[GLIME Fixed Q&A] toggle:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function deleteFixed(btn) {
    const F = S.fq;
    const id = btn.dataset.id;
    if (!F.items.find(i => i.id === id)) return;

    const ok = await ui.confirm('Delete this Fixed Q&A? Customers will no longer get this fixed answer.', {
      title: 'Delete Fixed Q&A',
      confirmText: 'Delete',
      danger: true
    });
    if (!ok) return;

    await withBusy(btn, 'Deleting…', async () => {
      try {
        const { error } = await db.from(FQ_TABLE).delete().eq('id', id).eq('client_id', clientId());
        if (error) throw error;

        F.items = F.items.filter(i => i.id !== id);
        if (F.editing === id) F.editing = null;
        syncUsage();
        refreshFixedTop();
        ui.toast('Fixed Q&A deleted.');
      } catch (e) {
        console.error('[GLIME Fixed Q&A] delete:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function testFixed(btn) {
    const host = q('#fqTestResult');
    const message = (q('#fqTestInput')?.value || '').trim();
    if (message.length < 2) return ui.toast('Type a customer message to test.', true);

    await withBusy(btn, 'Testing…', async () => {
      try {
        const { data, error } = await db.rpc('test_my_fixed_qa', { p_message: message });
        if (error) throw error;
        const r = firstRow(data);

        if (r && r.matched === true) {
          const item = S.fq.items.find(i => i.id === r.qa_id);
          const qText = r.question || (item && item.question) || '';
          const aText = r.answer || (item && item.answer) || '';
          const conf = Number(r.confidence);
          const confText = Number.isFinite(conf) ? ' Match confidence: ' + Math.round((conf <= 1 ? conf * 100 : conf)) + '%.' : '';
          host.innerHTML = `
            <div class="fq-result hit">
              <b>Fixed answer would be sent (0 tokens).</b>
              ${qText ? 'Matched: ' + esc(qText) + '.' : ''}${esc(confText)}
              ${aText ? '<p>' + esc(aText) + '</p>' : ''}
            </div>`;
        } else {
          host.innerHTML = `
            <div class="fq-result">
              <b>No fixed answer matched.</b>
              Your AI would reply to this message as usual, and normal AI tokens would apply.
            </div>`;
        }
      } catch (e) {
        console.error('[GLIME Fixed Q&A] test:', e);
        if (isMissingBackend(e)) {
          host.innerHTML = '<div class="fq-result"><b>Testing is not available yet.</b>Please try again later.</div>';
        } else {
          ui.toast(errMsg(e), true);
        }
      }
    });
  }

  /* =========================================================
     TABS + EVENTS
  ========================================================= */
  function renderShell() {
    ROOT.innerHTML = `
      <div class="lr-head">
        <h2>Teach AI</h2>
        <p>Two ways to teach your business: let your AI learn from your answers, or save exact answers that are sent directly with no AI tokens.</p>
      </div>

      <div class="lr-tabs" role="tablist">
        <button type="button" class="lr-tab" role="tab" data-act="tab" data-v="teach">
          <b>Teach AI</b>
          <small>Your AI learns from your lessons and writes its own reply. Normal AI tokens apply.</small>
        </button>
        <button type="button" class="lr-tab" role="tab" data-act="tab" data-v="fixed">
          <b>Fixed Q&amp;A</b>
          <small>Exact question, exact answer, sent directly. 0 tokens.</small>
        </button>
      </div>

      <div id="paneTeach"></div>
      <div id="paneFixed" hidden></div>
    `;
  }

  function setTab(tab) {
    S.tab = tab === 'fixed' ? 'fixed' : 'teach';
    try {
      sessionStorage.setItem(TAB_KEY, S.tab);
    } catch (_) {
      /* storage can be blocked */
    }

    ROOT.querySelectorAll('.lr-tab').forEach(b => {
      const active = b.dataset.v === S.tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const teach = q('#paneTeach');
    const fixed = q('#paneFixed');
    if (teach) teach.hidden = S.tab !== 'teach';
    if (fixed) fixed.hidden = S.tab !== 'fixed';

    if (S.tab === 'teach') renderTeachSummary();
    if (S.tab === 'fixed' && !S.fq.ready && !S.fq.loading) loadFixed();
  }

  function onClick(e) {
    const el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !ROOT || !ROOT.contains(el)) return;
    const F = S.fq;

    switch (el.dataset.act) {
      case 'tab':
        setTab(el.dataset.v);
        break;

      /* ---- Teach AI ---- */
      case 'add':
        addLesson(el);
        break;
      case 'filter':
        S.filter = el.dataset.v || 'active';
        S.editing = null;
        renderChips();
        renderList();
        break;
      case 'status':
        setStatus(el);
        break;
      case 'edit':
        S.editing = el.dataset.id || null;
        renderList();
        break;
      case 'cancel-edit':
        S.editing = null;
        renderList();
        break;
      case 'save-edit':
        saveEdit(el);
        break;
      case 'delete':
        deleteLesson(el);
        break;
      case 'scan':
        scanChats(el);
        break;
      case 'retry':
        loadTeach();
        break;

      /* ---- Fixed Q&A ---- */
      case 'fq-add':
        addFixed(el);
        break;
      case 'fq-kw-add':
        commitKw(el.dataset.scope === 'edit' ? 'edit' : 'new');
        break;
      case 'fq-kw-del': {
        const scope = el.dataset.scope === 'edit' ? 'edit' : 'new';
        const arr = scope === 'new' ? F.newKw : F.editKw;
        arr.splice(Number(el.dataset.i), 1);
        renderKw(scope);
        break;
      }
      case 'fq-filter':
        F.filter = el.dataset.v || 'all';
        F.editing = null;
        renderFixedChips();
        renderFixedList();
        break;
      case 'fq-edit': {
        const item = F.items.find(i => i.id === el.dataset.id);
        F.editing = item ? item.id : null;
        F.editKw = item && Array.isArray(item.keywords) ? [...item.keywords] : [];
        renderFixedList();
        break;
      }
      case 'fq-cancel-edit':
        F.editing = null;
        F.editKw = [];
        renderFixedList();
        break;
      case 'fq-save-edit':
        saveFixedEdit(el);
        break;
      case 'fq-toggle':
        toggleFixed(el);
        break;
      case 'fq-delete':
        deleteFixed(el);
        break;
      case 'fq-test':
        testFixed(el);
        break;
      case 'fq-retry':
        loadFixed();
        break;
      default:
        break;
    }
  }

  function onKeydown(e) {
    const t = e.target;
    if (!t || !t.matches) return;

    if (e.key === 'Enter' && t.matches('[data-kw-input]')) {
      e.preventDefault();
      commitKw(t.dataset.kwInput === 'edit' ? 'edit' : 'new');
    } else if (e.key === 'Enter' && t.matches('#fqTestInput')) {
      e.preventDefault();
      const btn = q('[data-act="fq-test"]');
      if (btn && !btn.disabled) testFixed(btn);
    }
  }

  function onInput(e) {
    const t = e.target;
    if (!t || !t.matches) return;

    if (t.matches('#fqSearch')) {
      S.fq.search = t.value;
      renderFixedList();
    } else if (t.matches('#fqSort')) {
      S.fq.sort = t.value === 'used' ? 'used' : 'new';
      renderFixedList();
    } else if (t.matches('[data-kw-input]') && /[,\n]/.test(t.value)) {
      commitKw(t.dataset.kwInput === 'edit' ? 'edit' : 'new');
    } else if (t.matches('#fqQuestion')) {
      setCount(q('#fqQuestionCount'), t.value.length, FQ_Q_MAX);
    } else if (t.matches('#fqAnswer')) {
      setCount(q('#fqAnswerCount'), t.value.length, FQ_A_MAX);
    } else if (t.matches('[data-fq-edit-q]')) {
      setCount(t.closest('[data-fq-editing]')?.querySelector('[data-cnt="q"]'), t.value.length, FQ_Q_MAX);
    } else if (t.matches('[data-fq-edit-a]')) {
      setCount(t.closest('[data-fq-editing]')?.querySelector('[data-cnt="a"]'), t.value.length, FQ_A_MAX);
    }
  }

  /* ---------------------------------------------------------
     MODULE REGISTRATION
  --------------------------------------------------------- */
  shell.register({
    id: 'teach',
    label: 'Teach AI',
    order: 25,

    render: async ({ container }) => {
      injectStyles();

      container.innerHTML = '<div class="lr-root" id="lrRoot"></div>';
      ROOT = container.querySelector('#lrRoot');
      if (!ROOT) return;

      ROOT.addEventListener('click', onClick);
      ROOT.addEventListener('keydown', onKeydown);
      ROOT.addEventListener('input', onInput);

      let saved = 'teach';
      try {
        saved = sessionStorage.getItem(TAB_KEY) || 'teach';
      } catch (_) {
        /* storage can be blocked */
      }

      /* a new render starts fresh so counters and lists are never stale */
      S.fq.ready = false;
      S.fq.loading = false;
      S.fq.editing = null;
      S.fq.editKw = [];
      S.fq.newKw = [];
      S.fq.filter = 'all';
      S.fq.sort = 'new';
      S.fq.search = '';
      S.summary = null;

      renderShell();
      setTab(saved);
      await loadTeach();
    }
  });
})();
