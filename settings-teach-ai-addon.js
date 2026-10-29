/* =========================================================
   GLIME - SETTINGS > TEACH AI
   ---------------------------------------------------------
   Lets the business owner teach the Client AI Brain from real
   customer questions. Each lesson = a customer question + the answer
   the owner wants the AI to give next time.

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

  const COLS =
    'id,channel,source,status,customer_question,bad_reply,lesson,last_used_at,created_at,updated_at';
  const Q_MIN = 2;
  const Q_MAX = 1000;
  const L_MIN = 5;
  const L_MAX = 1000;
  const ACTIVE_LIMIT = 80; // client-ai-runtime reads the 80 most recently updated active lessons

  const S = {
    items: [],
    error: null,
    filter: 'active',
    editing: null
  };

  let ROOT = null;

  const clientId = () => state.client?.client_id || '';
  const errMsg = e => (e && (e.message || e.error_description)) || String(e || 'Unknown error');
  const q = sel => (ROOT ? ROOT.querySelector(sel) : null);

  const fmtDate = v => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

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
      .lr-head h2{font-size:1.25rem;line-height:1.2}
      .lr-head p{font-size:.78rem;color:rgba(255,255,255,.72);margin-top:4px;max-width:600px}
      .lr-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:16px;margin:14px 0}
      .lr-card h3{font-size:.98rem;margin-bottom:3px}
      .lr-sub{font-size:.74rem;color:rgba(255,255,255,.72);margin-bottom:12px;line-height:1.5}
      .lr-field{margin-bottom:12px}
      .lr-label{display:block;font-size:.74rem;font-weight:800;margin-bottom:6px}
      .lr-hint{display:block;font-size:.68rem;color:rgba(255,255,255,.62);margin-top:5px}
      .lr-input,.lr-textarea{width:100%;background:var(--surf2);color:#fff;border:1px solid var(--bd);border-radius:12px;padding:12px;font-size:16px;outline:none;font-family:inherit}
      .lr-input::placeholder,.lr-textarea::placeholder{color:rgba(255,255,255,.42)}
      .lr-input:focus,.lr-textarea:focus{border-color:rgba(255,255,255,.6)}
      .lr-textarea{min-height:100px;resize:vertical;line-height:1.5}
      .lr-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:.8rem;font-weight:800;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
      .lr-btn.primary{background:linear-gradient(105deg,var(--gr),var(--cy));color:#031014;border:0}
      .lr-btn.danger{color:var(--rd);border-color:rgba(255,130,145,.5)}
      .lr-btn.small{min-height:36px;padding:0 12px;font-size:.74rem;border-radius:10px}
      .lr-btn:disabled{opacity:.5;cursor:default}
      .lr-note{font-size:.7rem;color:rgba(255,255,255,.66);margin-top:10px;line-height:1.5}
      .lr-pill{display:inline-block;font-size:.64rem;font-weight:800;padding:3px 9px;border-radius:99px;border:1px solid rgba(255,255,255,.28);white-space:nowrap}
      .lr-pill.on{color:var(--gr);border-color:rgba(80,245,168,.4)}
      .lr-pill.wait{color:var(--cy);border-color:rgba(82,232,255,.4)}
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
      @media(max-width:640px){
        .lr-actions .lr-btn{flex:1}
        .lr-btn.block-m{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------
     DATA
  --------------------------------------------------------- */
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

  /* ---------------------------------------------------------
     RENDER
  --------------------------------------------------------- */
  function renderAll() {
    if (!ROOT) return;

    ROOT.innerHTML = `
      <div class="lr-head">
        <h2>Teach AI</h2>
        <p>Teach your AI from real customer questions. Write the answer you want once, and your AI uses it the next time a customer asks something similar.</p>
      </div>

      <div class="lr-card" id="lrTeach">
        <h3>Teach your AI</h3>
        <p class="lr-sub">Add a customer question and the answer your AI should give.</p>

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

  function renderError(message) {
    if (!ROOT) return;
    ROOT.innerHTML = `
      <div class="lr-head"><h2>Teach AI</h2></div>
      <div class="lr-err"><b>Could not load Teach AI.</b>${esc(message)}
        <div style="margin-top:10px"><button type="button" class="lr-btn small" data-act="retry">Try again</button></div>
      </div>`;
  }

  /* ---------------------------------------------------------
     ACTIONS
  --------------------------------------------------------- */
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

  async function load() {
    if (ROOT) ROOT.innerHTML = '<div class="lr-loading">Loading Teach AI…</div>';
    try {
      S.items = await fetchLessons();
      S.error = null;
      S.editing = null;
      // Open on Suggestions when something is waiting for approval and nothing is active yet.
      if (!count('active') && count('pending')) S.filter = 'pending';
      renderAll();
    } catch (e) {
      console.error('[GLIME Teach AI] load:', e);
      S.error = errMsg(e);
      renderError(S.error);
    }
  }

  function onClick(e) {
    const el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !ROOT || !ROOT.contains(el)) return;

    switch (el.dataset.act) {
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
        load();
        break;
      default:
        break;
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
      await load();
    }
  });
})();
