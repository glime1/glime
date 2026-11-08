/* =========================================================
   GLIME - SETTINGS > QUICK BUTTONS
   ---------------------------------------------------------
   The owner builds WhatsApp tap-menus (reply buttons, list menus
   and link buttons) from Settings. When a customer taps a button,
   the saved reply is sent directly BEFORE the AI runs: no AI call,
   0 tokens charged.

   WhatsApp limits enforced on this screen (Meta Cloud API):
     Reply buttons   1 to 3 buttons, title up to 20 characters,
                     button titles must be different from each other
     List menu       1 to 10 options in total, list button text up to
                     20, option title up to 24, option description up
                     to 72, section title up to 24, up to 10 sections
                     (when sections are used, every option needs one)
     Link button     exactly 1 button, text up to 20, https link
     All types       message text up to 1024, header up to 60 (text
                     only), footer up to 60
   Characters are counted as WhatsApp counts them (an emoji = 1).

   Data: table client_quick_menus (RLS: owner sees and changes only
   their own client_id rows).
     id uuid, client_id text,
     name text                 internal name, only the owner sees it
     trigger_qa_id uuid null   client_fixed_qa.id. When that Fixed Q&A
                               matches, this menu is sent instead of
                               the plain fixed answer. null = the menu
                               opens only from another menu's button
                               (or as the welcome menu, see is_welcome).
     is_welcome boolean        WELCOME MENU. Sent automatically on the
                               customer's first message, and on the first
                               message after 24 hours of silence, when no
                               Fixed Q&A matched. Only one active welcome
                               menu per client. A welcome menu has no
                               trigger_qa_id.
     menu_type text            'buttons' | 'list' | 'cta'
     header_text, body_text, footer_text text
     list_button_text text     list menus only
     items jsonb               array of
       { key, title, description, section, action,
         target_menu_id, reply_text, url }
       action: 'text'  send reply_text
               'menu'  open the menu target_menu_id
               'human' hand the chat to the team (reply_text optional)
               'url'   link button only
     is_active boolean, use_count int, last_used_at,
     created_at, updated_at

   Button id sent to WhatsApp (for whatsapp-webhook):
     qm:<menu id>:<item key>     (well under the 256 / 200 limits)
   The webhook reads button_reply.id or list_reply.id, finds the menu
   and the item, and runs the action with no AI call.

   Plan limit is enforced by the database. When it is reached the
   insert fails with a message containing QUICK_MENU_LIMIT_REACHED and
   this screen shows the upgrade message.
   The screen degrades safely when the table does not exist yet.

   Deep link: settings.html#quick-buttons
   (The id must not start with "ai-": settings.html sends every hash
   that starts with "ai-" to the AI module.)
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

  const TABLE = 'client_quick_menus';
  const COLS =
    'id,name,trigger_qa_id,is_welcome,menu_type,header_text,body_text,footer_text,list_button_text,items,is_active,use_count,last_used_at,created_at,updated_at';
  const UPGRADE_URL = 'packages.html';

  /* WhatsApp limits */
  const L = {
    name: 60,
    body: 1024,
    header: 60,
    footer: 60,
    listBtn: 20,
    btnTitle: 20,
    rowTitle: 24,
    rowDesc: 72,
    section: 24,
    reply: 1024,
    url: 2000,
    maxButtons: 3,
    maxRows: 10,
    maxSections: 10
  };

  const TYPES = {
    buttons: { label: 'Reply buttons', hint: 'Up to 3 buttons under your message.' },
    list: { label: 'List menu', hint: 'One "open list" button with up to 10 options.' },
    cta: { label: 'Link button', hint: 'One button that opens a website link.' }
  };

  const S = {
    ready: false,
    loading: false,
    unavailable: false,
    error: null,
    items: [],
    faqs: [],
    filter: 'all',
    search: '',
    draft: null, // menu being edited or created; null = list view
    limitHit: false
  };

  let ROOT = null;

  const q = sel => (ROOT ? ROOT.querySelector(sel) : null);
  const clientId = () => state.client?.client_id || '';
  const errMsg = e => (e && (e.message || e.error_description)) || String(e || 'Unknown error');
  const fmtNum = n => Number(n || 0).toLocaleString();
  const len = s => Array.from(String(s == null ? '' : s)).length;
  const uid = () => 'k' + Math.random().toString(36).slice(2, 8);
  const norm = v =>
    String(v || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();

  const isMissingBackend = e => {
    const code = String((e && (e.code || e.status)) || '');
    return (
      ['42P01', '42883', 'PGRST205', 'PGRST202', '404'].includes(code) ||
      /does not exist|schema cache|could not find the (table|function)/i.test(errMsg(e))
    );
  };
  const isLimitError = e => /quick_menu_limit/i.test(errMsg(e));

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
    if (document.getElementById('glimeQuickButtonsStyles')) return;
    const style = document.createElement('style');
    style.id = 'glimeQuickButtonsStyles';
    style.textContent = `
      .qb-root{color:#fff}
      .qb-root *{box-sizing:border-box}
      .qb-root [hidden]{display:none!important}
      .qb-head h2{font-size:1.25rem;line-height:1.2}
      .qb-head p{font-size:.78rem;color:rgba(255,255,255,.72);margin-top:4px;max-width:620px}
      .qb-banner{border:1px solid rgba(80,245,168,.4);background:rgba(80,245,168,.07);border-radius:14px;padding:12px 14px;font-size:.76rem;line-height:1.55;margin:14px 0}
      .qb-banner b{color:var(--gr)}
      .qb-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:16px;margin:14px 0}
      .qb-card h3{font-size:.98rem;margin-bottom:3px}
      .qb-sub{font-size:.74rem;color:rgba(255,255,255,.72);margin-bottom:12px;line-height:1.5}
      .qb-field{margin-bottom:12px}
      .qb-label{display:block;font-size:.74rem;font-weight:800;margin-bottom:6px}
      .qb-label span{font-weight:400;opacity:.7}
      .qb-hint{display:block;font-size:.68rem;color:rgba(255,255,255,.62);margin-top:5px;line-height:1.5}
      .qb-input,.qb-textarea,.qb-select{width:100%;background:var(--surf2);color:#fff;border:1px solid var(--bd);border-radius:12px;padding:12px;font-size:16px;outline:none;font-family:inherit}
      .qb-input::placeholder,.qb-textarea::placeholder{color:rgba(255,255,255,.42)}
      .qb-input:focus,.qb-textarea:focus,.qb-select:focus{border-color:rgba(255,255,255,.6)}
      .qb-input:disabled,.qb-textarea:disabled,.qb-select:disabled{opacity:.5}
      .qb-textarea{min-height:90px;resize:vertical;line-height:1.5}
      .qb-select option{color:#000}
      .qb-count{font-size:.66rem;color:rgba(255,255,255,.55);text-align:right;margin-top:4px}
      .qb-count.over{color:var(--rd);font-weight:800}
      .qb-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:.8rem;font-weight:800;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}
      .qb-btn.primary{background:linear-gradient(105deg,var(--gr),var(--cy));color:#031014;border:0}
      .qb-btn.danger{color:var(--rd);border-color:rgba(255,130,145,.5)}
      .qb-btn.small{min-height:36px;padding:0 12px;font-size:.74rem;border-radius:10px}
      .qb-btn:disabled{opacity:.5;cursor:default}
      .qb-pill{display:inline-block;font-size:.64rem;font-weight:800;padding:3px 9px;border-radius:99px;border:1px solid rgba(255,255,255,.28);white-space:nowrap}
      .qb-pill.on{color:var(--gr);border-color:rgba(80,245,168,.4)}
      .qb-pill.wait{color:var(--cy);border-color:rgba(82,232,255,.4)}
      .qb-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
      .qb-chip{min-height:36px;padding:0 12px;border-radius:99px;border:1px solid var(--bd);background:transparent;color:#fff;font-size:.72rem;font-weight:800;cursor:pointer}
      .qb-chip.active{background:#fff;color:#031014;border-color:#fff}
      .qb-item{border:1px solid var(--bd);background:var(--surf2);border-radius:14px;padding:13px;margin-bottom:10px}
      .qb-item h4{font-size:.86rem;line-height:1.4;word-break:break-word}
      .qb-item p{font-size:.76rem;color:rgba(255,255,255,.85);line-height:1.55;white-space:pre-wrap;word-break:break-word;margin-top:4px}
      .qb-meta{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .qb-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .qb-empty{border:1px dashed rgba(255,255,255,.22);border-radius:14px;padding:22px 16px;text-align:center;font-size:.78rem;color:rgba(255,255,255,.8)}
      .qb-empty b{display:block;margin-bottom:4px;font-size:.84rem;color:#fff}
      .qb-err{border:1px solid rgba(255,130,145,.45);border-radius:14px;padding:14px;font-size:.78rem;background:rgba(255,130,145,.07);margin:12px 0;line-height:1.55}
      .qb-err b{display:block;margin-bottom:3px}
      .qb-loading{padding:26px 0;text-align:center;font-size:.8rem;color:rgba(255,255,255,.75)}
      .qb-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
      .qb-toolbar .qb-input{flex:1;min-width:180px}
      .qb-row{border:1px solid var(--bd);background:var(--surf2);border-radius:14px;padding:12px;margin-bottom:10px}
      .qb-row-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
      .qb-row-top b{font-size:.78rem}
      .qb-row-tools{display:flex;gap:6px}
      .qb-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .qb-phone{background:#0b141a;border:1px solid var(--bd);border-radius:18px;padding:14px;max-width:340px}
      .qb-ph-bub{background:#1f2c34;border-radius:12px 12px 12px 4px;padding:10px 12px;font-size:.8rem;line-height:1.5;word-break:break-word}
      .qb-ph-h{font-weight:800;margin-bottom:4px}
      .qb-ph-b{white-space:pre-wrap}
      .qb-ph-f{font-size:.68rem;color:rgba(255,255,255,.55);margin-top:6px}
      .qb-ph-btn{background:#1f2c34;border-radius:10px;color:#53bdeb;text-align:center;font-weight:800;font-size:.78rem;padding:10px;margin-top:6px;word-break:break-word}
      .qb-ph-list{background:#1f2c34;border-radius:12px;margin-top:8px;padding:8px 12px}
      .qb-ph-sec{font-size:.68rem;font-weight:800;color:#25d366;margin:8px 0 2px}
      .qb-ph-opt{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:.76rem}
      .qb-ph-opt:last-child{border-bottom:0}
      .qb-ph-opt small{display:block;color:rgba(255,255,255,.55);font-size:.68rem}
      .qb-note{font-size:.7rem;color:rgba(255,255,255,.66);margin-top:10px;line-height:1.5}
      .qb-safe{display:grid;gap:6px;font-size:.74rem;color:rgba(255,255,255,.82);line-height:1.5}
      @media(max-width:640px){
        .qb-actions .qb-btn{flex:1}
        .qb-btn.block-m{width:100%}
        .qb-grid{grid-template-columns:1fr}
        .qb-toolbar .qb-input{width:100%;flex:none}
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------
     DATA
  --------------------------------------------------------- */
  async function fetchMenus() {
    const { data, error } = await db
      .from(TABLE)
      .select(COLS)
      .eq('client_id', clientId())
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  }

  /* active Fixed Q&A, used for the "Opens when" choice; the screen works without it */
  async function fetchFaqs() {
    try {
      const { data, error } = await db
        .from('client_fixed_qa')
        .select('id,question,is_active')
        .eq('client_id', clientId())
        .order('updated_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []).filter(r => r.is_active !== false);
    } catch (e) {
      console.warn('[GLIME Quick Buttons] fixed qa list:', e);
      return [];
    }
  }

  async function load() {
    S.loading = true;
    S.error = null;
    renderBody();
    try {
      const [menus, faqs] = await Promise.all([fetchMenus(), fetchFaqs()]);
      S.items = menus;
      S.faqs = faqs;
      S.unavailable = false;
    } catch (e) {
      console.error('[GLIME Quick Buttons] load:', e);
      if (isMissingBackend(e)) {
        S.unavailable = true;
        S.items = [];
      } else {
        S.error = errMsg(e);
      }
    }
    S.loading = false;
    S.ready = true;
    renderBody();
  }

  /* ---------------------------------------------------------
     DRAFT HELPERS
  --------------------------------------------------------- */
  const allowedActions = type => (type === 'cta' ? ['url'] : ['text', 'menu', 'human']);

  const newItem = type => ({
    key: uid(),
    title: '',
    description: '',
    section: '',
    action: type === 'cta' ? 'url' : 'text',
    target_menu_id: '',
    reply_text: '',
    url: ''
  });

  const emptyDraft = () => ({
    id: null,
    name: '',
    trigger_qa_id: '',
    is_welcome: false,
    menu_type: 'buttons',
    header_text: '',
    body_text: '',
    footer_text: '',
    list_button_text: 'Choose option',
    items: [newItem('buttons')],
    is_active: true
  });

  const fromRow = r => ({
    id: r.id,
    name: r.name || '',
    trigger_qa_id: r.trigger_qa_id || '',
    is_welcome: !!r.is_welcome,
    menu_type: TYPES[r.menu_type] ? r.menu_type : 'buttons',
    header_text: r.header_text || '',
    body_text: r.body_text || '',
    footer_text: r.footer_text || '',
    list_button_text: r.list_button_text || 'Choose option',
    items: (Array.isArray(r.items) ? r.items : []).map(i => ({
      key: i.key || uid(),
      title: i.title || '',
      description: i.description || '',
      section: i.section || '',
      action: i.action || 'text',
      target_menu_id: i.target_menu_id || '',
      reply_text: i.reply_text || '',
      url: i.url || ''
    })),
    is_active: r.is_active !== false
  });

  const maxItems = type => (type === 'buttons' ? L.maxButtons : type === 'cta' ? 1 : L.maxRows);
  const itemTitleMax = type => (type === 'list' ? L.rowTitle : L.btnTitle);
  const itemWord = type => (type === 'list' ? 'option' : 'button');

  /* returns an error message, or '' when everything fits WhatsApp's rules */
  function validate(d) {
    const t = d.menu_type;
    const name = d.name.trim();
    if (len(name) < 2) return 'Give this menu a name (only you will see it).';
    if (len(name) > L.name) return 'Menu name can be up to ' + L.name + ' characters.';

    const body = d.body_text.trim();
    if (!body) return 'Write the message text customers will see.';
    if (len(body) > L.body) return 'Message text can be up to ' + L.body + ' characters.';
    if (len(d.header_text.trim()) > L.header) return 'Header can be up to ' + L.header + ' characters.';
    if (len(d.footer_text.trim()) > L.footer) return 'Footer can be up to ' + L.footer + ' characters.';

    const items = d.items;
    const word = itemWord(t);
    if (!items.length) return 'Add at least one ' + word + '.';
    if (items.length > maxItems(t)) {
      return t === 'buttons'
        ? 'Reply buttons allow up to ' + L.maxButtons + ' buttons. Remove extra buttons or switch to a List menu.'
        : t === 'cta'
          ? 'A link button menu has exactly 1 button.'
          : 'A list menu allows up to ' + L.maxRows + ' options in total.';
    }

    if (t === 'list') {
      const lb = d.list_button_text.trim();
      if (!lb) return 'Write the text of the button that opens the list.';
      if (len(lb) > L.listBtn) return 'The list button text can be up to ' + L.listBtn + ' characters.';
    }

    const sections = new Set();
    const titles = new Set();
    const anySection = t === 'list' && items.some(i => i.section.trim());

    for (let n = 0; n < items.length; n++) {
      const i = items[n];
      const label = word + ' ' + (n + 1);
      const title = i.title.trim();
      if (!title) return 'Write the text for ' + label + '.';
      if (len(title) > itemTitleMax(t)) return 'The text of ' + label + ' can be up to ' + itemTitleMax(t) + ' characters.';

      if (t === 'buttons') {
        const k = title.toLowerCase();
        if (titles.has(k)) return 'Two buttons have the same text ("' + title + '"). WhatsApp needs different text on each button.';
        titles.add(k);
      }

      if (t === 'list') {
        if (len(i.description.trim()) > L.rowDesc) return 'The description of ' + label + ' can be up to ' + L.rowDesc + ' characters.';
        if (anySection) {
          const sec = i.section.trim();
          if (!sec) return 'When you use sections, every option needs a section name (' + label + ' has none).';
          if (len(sec) > L.section) return 'A section name can be up to ' + L.section + ' characters.';
          sections.add(sec.toLowerCase());
        }
      }

      if (!allowedActions(t).includes(i.action)) return 'Choose what happens when ' + label + ' is tapped.';

      if (i.action === 'text') {
        const r = i.reply_text.trim();
        if (!r) return 'Write the reply that ' + label + ' should send.';
        if (len(r) > L.reply) return 'The reply of ' + label + ' can be up to ' + L.reply + ' characters.';
      } else if (i.action === 'human') {
        if (len(i.reply_text.trim()) > L.reply) return 'The message of ' + label + ' can be up to ' + L.reply + ' characters.';
      } else if (i.action === 'menu') {
        if (!i.target_menu_id) return 'Choose which menu ' + label + ' should open.';
        if (d.id && i.target_menu_id === d.id) return 'A menu cannot open itself (' + label + ').';
        if (!S.items.some(m => m.id === i.target_menu_id)) return 'The menu chosen for ' + label + ' no longer exists.';
      } else if (i.action === 'url') {
        const u = i.url.trim();
        if (!/^https:\/\/[^\s]+\.[^\s]+$/i.test(u)) return 'Enter a full link starting with https:// for ' + label + '.';
        if (len(u) > L.url) return 'The link of ' + label + ' is too long.';
      }
    }

    if (sections.size > L.maxSections) return 'A list can have up to ' + L.maxSections + ' sections.';

    if (d.is_welcome && d.trigger_qa_id) return 'A welcome menu cannot also open from a Fixed Q&A. Choose one.';

    if (d.is_welcome && d.is_active) {
      const w = S.items.find(m => m.id !== d.id && m.is_active !== false && m.is_welcome);
      if (w) return 'Another active menu ("' + w.name + '") is already your welcome menu. Turn that one off first.';
    }

    if (d.trigger_qa_id && d.is_active) {
      const clash = S.items.find(m => m.id !== d.id && m.is_active !== false && m.trigger_qa_id === d.trigger_qa_id);
      if (clash) return 'Another active menu ("' + clash.name + '") already opens for this Fixed Q&A. Turn that one off or choose a different Fixed Q&A.';
    }
    return '';
  }

  function toRow(d) {
    const t = d.menu_type;
    return {
      name: d.name.trim(),
      trigger_qa_id: d.is_welcome ? null : d.trigger_qa_id || null,
      is_welcome: !!d.is_welcome,
      menu_type: t,
      header_text: d.header_text.trim() || null,
      body_text: d.body_text.trim(),
      footer_text: d.footer_text.trim() || null,
      list_button_text: t === 'list' ? d.list_button_text.trim() : null,
      is_active: d.is_active,
      items: d.items.map(i => {
        const o = { key: i.key, title: i.title.trim(), action: i.action };
        if (t === 'list') {
          if (i.description.trim()) o.description = i.description.trim();
          if (i.section.trim()) o.section = i.section.trim();
        }
        if (i.action === 'text' || i.action === 'human') {
          if (i.reply_text.trim()) o.reply_text = i.reply_text.trim();
        }
        if (i.action === 'menu') o.target_menu_id = i.target_menu_id;
        if (i.action === 'url') o.url = i.url.trim();
        return o;
      })
    };
  }

  /* ---------------------------------------------------------
     PREVIEW (looks like the customer's WhatsApp)
  --------------------------------------------------------- */
  function previewHtml(d) {
    const t = d.menu_type;
    const items = d.items || [];
    const head = d.header_text.trim() ? `<div class="qb-ph-h">${esc(d.header_text.trim())}</div>` : '';
    const body = `<div class="qb-ph-b">${esc(d.body_text.trim() || 'Your message text appears here.')}</div>`;
    const foot = d.footer_text.trim() ? `<div class="qb-ph-f">${esc(d.footer_text.trim())}</div>` : '';

    let btns = '';
    let opened = '';
    if (t === 'list') {
      btns = `<div class="qb-ph-btn">☰ ${esc(d.list_button_text.trim() || 'Choose option')}</div>`;
      let last = null;
      const rows = items
        .map(i => {
          const sec = i.section.trim();
          let secHtml = '';
          if (sec && sec !== last) {
            secHtml = `<div class="qb-ph-sec">${esc(sec)}</div>`;
            last = sec;
          }
          return (
            secHtml +
            `<div class="qb-ph-opt">${esc(i.title.trim() || 'Option')}${i.description.trim() ? `<small>${esc(i.description.trim())}</small>` : ''}</div>`
          );
        })
        .join('');
      opened = `<div class="qb-ph-list">${rows || '<div class="qb-ph-opt">No options yet</div>'}</div>`;
    } else if (t === 'cta') {
      btns = `<div class="qb-ph-btn">↗ ${esc((items[0] && items[0].title.trim()) || 'Open link')}</div>`;
    } else {
      btns = items.map(i => `<div class="qb-ph-btn">${esc(i.title.trim() || 'Button')}</div>`).join('');
    }

    return `<div class="qb-phone"><div class="qb-ph-bub">${head}${body}${foot}</div>${btns}${opened}</div>`;
  }

  /* ---------------------------------------------------------
     RENDER
  --------------------------------------------------------- */
  function shellHtml() {
    return `
      <div class="qb-head">
        <h2>Quick Buttons</h2>
        <p>Build tap-menus for WhatsApp, like "Book appointment: Facial, Hair, Makeup". Customers tap instead of typing.</p>
      </div>
      <div class="qb-banner"><b>0 tokens used.</b> When a customer taps a button, GLIME sends your saved reply directly and your AI does not run, so no AI tokens are charged.</div>
      <div id="qbBody"></div>
    `;
  }

  function renderBody() {
    const host = q('#qbBody');
    if (!host) return;

    if (S.loading && !S.ready) {
      host.innerHTML = '<div class="qb-loading">Loading Quick Buttons…</div>';
      return;
    }
    if (S.unavailable) {
      host.innerHTML = `
        <div class="qb-card">
          <h3>Quick Buttons is almost ready</h3>
          <p class="qb-sub" style="margin-bottom:0">This feature is being switched on for your account. Please check again in a little while. Your other settings keep working as usual.</p>
        </div>`;
      return;
    }
    if (S.error) {
      host.innerHTML = `
        <div class="qb-err"><b>Could not load Quick Buttons.</b>${esc(S.error)}
          <div style="margin-top:10px"><button type="button" class="qb-btn small" data-act="retry">Try again</button></div>
        </div>`;
      return;
    }
    if (S.draft) {
      host.innerHTML = editorHtml();
      const ed = q('#qbEditor');
      if (ed && ed.scrollIntoView) ed.scrollIntoView({ block: 'start' });
      return;
    }

    host.innerHTML = `
      <div class="qb-card">
        <h3>Your menus</h3>
        <p class="qb-sub">Only <b>On</b> menus are sent to customers. A menu can open as your <b>Welcome menu</b> (when a customer writes first), when a Fixed Q&amp;A matches, or when a customer taps a button in another menu.</p>
        <div class="qb-toolbar">
          <input class="qb-input" id="qbSearch" type="search" autocomplete="off" placeholder="Search menus" value="${esc(S.search)}">
          <button type="button" class="qb-btn primary small" data-act="new" ${S.limitHit ? 'disabled' : ''}>+ New menu</button>
        </div>
        ${S.limitHit ? limitHtml() : ''}
        <div class="qb-chips" id="qbChips"></div>
        <div id="qbList"></div>
      </div>
      <div class="qb-card">
        <h3>How it stays safe</h3>
        <div class="qb-safe">
          <span>Only you can create or change menus. Customers can never change them.</span>
          <span>WhatsApp limits are checked for you before saving: 3 reply buttons, 10 list options, 20 characters on a button.</span>
          <span>If a customer types something that is not a button tap, your normal Fixed Q&amp;A and AI work as usual.</span>
          <span>Your Welcome menu is sent only on a customer's first message, and on the first message after 24 hours of silence. It is never repeated in the middle of a chat.</span>
        </div>
      </div>`;
    renderChips();
    renderList();
  }

  function limitHtml() {
    return `
      <div class="qb-err"><b>Menu limit reached</b>You have used all the menus in your plan. Upgrade to add more, or delete one you no longer need.
        <div class="qb-actions"><a class="qb-btn small primary" href="${UPGRADE_URL}">Upgrade plan</a></div>
      </div>`;
  }

  const isOn = m => m.is_active !== false;
  const countOf = key => S.items.filter(m => (key === 'all' ? true : key === 'on' ? isOn(m) : !isOn(m))).length;

  function renderChips() {
    const host = q('#qbChips');
    if (!host) return;
    host.innerHTML = [
      ['all', 'All'],
      ['on', 'On'],
      ['off', 'Off']
    ]
      .map(
        ([k, l]) =>
          `<button type="button" class="qb-chip ${S.filter === k ? 'active' : ''}" data-act="filter" data-v="${k}">${esc(l)} (${countOf(k)})</button>`
      )
      .join('');
  }

  const faqName = id => {
    const f = S.faqs.find(x => x.id === id);
    return f ? f.question : '';
  };

  function menuCard(m) {
    const on = isOn(m);
    const items = Array.isArray(m.items) ? m.items : [];
    const trig = m.is_welcome
      ? 'Welcome menu: sent when a customer writes first (and after 24 hours of silence)'
      : m.trigger_qa_id
        ? 'Opens when Fixed Q&A matches: ' + (faqName(m.trigger_qa_id) || 'a Fixed Q&A')
        : 'Opens only from a button in another menu';
    return `
      <article class="qb-item">
        <h4>${esc(m.name)}</h4>
        <p style="opacity:.75">${esc(trig)}</p>
        <p>${esc(m.body_text)}</p>
        <div class="qb-meta">
          <span class="qb-pill ${on ? 'on' : ''}">${on ? 'On' : 'Off'}</span>
          ${m.is_welcome ? '<span class="qb-pill wait">Welcome menu</span>' : ''}
          <span class="qb-pill wait">${esc((TYPES[m.menu_type] || TYPES.buttons).label)}</span>
          <span class="qb-pill">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
          <span class="qb-pill">Used ${fmtNum(m.use_count)} ${Number(m.use_count) === 1 ? 'time' : 'times'}</span>
          ${m.last_used_at ? `<span class="qb-pill">Last used ${esc(fmtDate(m.last_used_at))}</span>` : ''}
          <span class="qb-pill on">0 tokens</span>
        </div>
        <div class="qb-actions">
          <button type="button" class="qb-btn small" data-act="edit" data-id="${esc(m.id)}">Edit</button>
          <button type="button" class="qb-btn small" data-act="toggle" data-id="${esc(m.id)}" data-v="${on ? 'off' : 'on'}">${on ? 'Turn off' : 'Turn on'}</button>
          <button type="button" class="qb-btn small danger" data-act="delete" data-id="${esc(m.id)}">Delete</button>
        </div>
      </article>`;
  }

  function renderList() {
    const host = q('#qbList');
    if (!host) return;
    const needle = norm(S.search);
    let rows = S.items.filter(m => (S.filter === 'all' ? true : S.filter === 'on' ? isOn(m) : !isOn(m)));
    if (needle) {
      rows = rows.filter(m =>
        norm([m.name, m.body_text, ...(m.items || []).map(i => i.title)].join(' ')).includes(needle)
      );
    }
    if (!rows.length) {
      const text = S.items.length
        ? needle
          ? ['No match.', 'Try a different word.']
          : ['Nothing here.', 'No menus in this view.']
        : ['No menus yet.', 'Tap + New menu to build your first one, for example "Book appointment" with buttons for your services.'];
      host.innerHTML = `<div class="qb-empty"><b>${esc(text[0])}</b>${esc(text[1])}</div>`;
      return;
    }
    host.innerHTML = rows.map(menuCard).join('');
  }

  /* ---------------------------------------------------------
     EDITOR
  --------------------------------------------------------- */
  const counter = (val, max) =>
    `<div class="qb-count ${len(val) > max ? 'over' : ''}">${len(val)}/${max}</div>`;

  function actionLabel(a) {
    return { text: 'Send a reply', menu: 'Open another menu', human: 'Hand over to my team', url: 'Open a link' }[a] || a;
  }

  function itemHtml(d, i, n) {
    const t = d.menu_type;
    const tMax = itemTitleMax(t);
    const total = d.items.length;
    const word = itemWord(t);
    const acts = allowedActions(t);

    const otherMenus = S.items.filter(m => m.id !== d.id);
    const action = acts.includes(i.action) ? i.action : acts[0];

    let extra = '';
    if (action === 'text' || action === 'human') {
      extra = `
        <div class="qb-field">
          <label class="qb-label">${action === 'text' ? 'Reply sent when tapped' : 'Message to the customer <span>(optional)</span>'}</label>
          <textarea class="qb-textarea" style="min-height:70px" data-f="reply_text" data-i="${n}" data-max="${L.reply}" placeholder="${action === 'text' ? 'e.g. Facial is Rs 999 and takes 45 minutes. Which day suits you?' : 'e.g. Our team will reply to you shortly.'}">${esc(i.reply_text)}</textarea>
          ${counter(i.reply_text, L.reply)}
        </div>`;
    } else if (action === 'menu') {
      extra = `
        <div class="qb-field">
          <label class="qb-label">Menu to open</label>
          <select class="qb-select" data-f="target_menu_id" data-i="${n}" data-change="1">
            <option value="">Choose a menu</option>
            ${otherMenus.map(m => `<option value="${esc(m.id)}" ${i.target_menu_id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select>
          ${otherMenus.length ? '' : '<span class="qb-hint">You have no other menu yet. Save this one, create the next menu, then come back and choose it here.</span>'}
        </div>`;
    } else if (action === 'url') {
      extra = `
        <div class="qb-field">
          <label class="qb-label">Link</label>
          <input class="qb-input" data-f="url" data-i="${n}" data-max="${L.url}" inputmode="url" autocomplete="off" placeholder="https://example.com/book" value="${esc(i.url)}">
        </div>`;
    }

    const listFields =
      t === 'list'
        ? `
        <div class="qb-grid">
          <div class="qb-field">
            <label class="qb-label">Description <span>(optional)</span></label>
            <input class="qb-input" data-f="description" data-i="${n}" data-max="${L.rowDesc}" autocomplete="off" placeholder="e.g. 45 minutes" value="${esc(i.description)}">
            ${counter(i.description, L.rowDesc)}
          </div>
          <div class="qb-field">
            <label class="qb-label">Section <span>(optional)</span></label>
            <input class="qb-input" data-f="section" data-i="${n}" data-max="${L.section}" autocomplete="off" placeholder="e.g. Skin care" value="${esc(i.section)}">
            ${counter(i.section, L.section)}
          </div>
        </div>`
        : '';

    return `
      <div class="qb-row" data-row="${n}">
        <div class="qb-row-top">
          <b>${esc(word.charAt(0).toUpperCase() + word.slice(1))} ${n + 1}</b>
          <div class="qb-row-tools">
            <button type="button" class="qb-btn small" aria-label="Move up" data-act="up" data-i="${n}" ${n === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="qb-btn small" aria-label="Move down" data-act="down" data-i="${n}" ${n === total - 1 ? 'disabled' : ''}>▼</button>
            <button type="button" class="qb-btn small danger" data-act="del-item" data-i="${n}" ${total <= 1 ? 'disabled' : ''}>Remove</button>
          </div>
        </div>
        <div class="qb-field">
          <label class="qb-label">${t === 'cta' ? 'Button text' : word === 'option' ? 'Option title' : 'Button text'}</label>
          <input class="qb-input" data-f="title" data-i="${n}" data-max="${tMax}" autocomplete="off" placeholder="${t === 'list' ? 'e.g. Facial' : 'e.g. Facial'}" value="${esc(i.title)}">
          ${counter(i.title, tMax)}
        </div>
        ${listFields}
        ${
          acts.length > 1
            ? `<div class="qb-field">
          <label class="qb-label">When tapped</label>
          <select class="qb-select" data-f="action" data-i="${n}" data-change="1">
            ${acts.map(a => `<option value="${a}" ${action === a ? 'selected' : ''}>${esc(actionLabel(a))}</option>`).join('')}
          </select>
        </div>`
            : ''
        }
        ${extra}
      </div>`;
  }

  function editorHtml() {
    const d = S.draft;
    const t = d.menu_type;
    const word = itemWord(t);
    const canAdd = d.items.length < maxItems(t);

    return `
      <div class="qb-card" id="qbEditor">
        <h3>${d.id ? 'Edit menu' : 'New menu'}</h3>
        <p class="qb-sub">${esc(TYPES[t].hint)} WhatsApp limits are checked when you save.</p>

        <div class="qb-field">
          <label class="qb-label" for="qbName">Menu name <span>(only you see this)</span></label>
          <input class="qb-input" id="qbName" data-f="name" data-max="${L.name}" autocomplete="off" placeholder="e.g. Book appointment" value="${esc(d.name)}">
          ${counter(d.name, L.name)}
        </div>

        <div class="qb-grid">
          <div class="qb-field">
            <label class="qb-label" for="qbType">Menu type</label>
            <select class="qb-select" id="qbType" data-f="menu_type" data-change="1">
              ${Object.keys(TYPES).map(k => `<option value="${k}" ${t === k ? 'selected' : ''}>${esc(TYPES[k].label)}</option>`).join('')}
            </select>
          </div>
          <div class="qb-field">
            <label class="qb-label" for="qbTrigger">Opens when</label>
            <select class="qb-select" id="qbTrigger" data-f="trigger_qa_id" data-change="1" ${d.is_welcome ? 'disabled' : ''}>
              <option value="">Only from a button in another menu</option>
              ${S.faqs.map(f => `<option value="${esc(f.id)}" ${d.trigger_qa_id === f.id ? 'selected' : ''}>Fixed Q&amp;A: ${esc(String(f.question).slice(0, 70))}</option>`).join('')}
            </select>
          </div>
        </div>
        ${d.trigger_qa_id ? '<span class="qb-hint" style="margin:-4px 0 12px">When this Fixed Q&amp;A matches, customers get this menu instead of the plain fixed answer. Put the answer text in the message below.</span>' : ''}

        <div class="qb-field">
          <label class="qb-label" for="qbWelcome">Welcome menu</label>
          <select class="qb-select" id="qbWelcome" data-f="is_welcome" data-change="1">
            <option value="no" ${d.is_welcome ? '' : 'selected'}>No</option>
            <option value="yes" ${d.is_welcome ? 'selected' : ''}>Yes, send this when a customer writes first</option>
          </select>
          <span class="qb-hint">A welcome menu is sent on a customer's first message, and on the first message after 24 hours of silence, with 0 tokens. You can have one active welcome menu. If the message matches a Fixed Q&amp;A, that answer is used instead.</span>
        </div>

        <div class="qb-field">
          <label class="qb-label" for="qbHeader">Header <span>(optional, text only)</span></label>
          <input class="qb-input" id="qbHeader" data-f="header_text" data-max="${L.header}" autocomplete="off" placeholder="e.g. Glow Studio" value="${esc(d.header_text)}">
          ${counter(d.header_text, L.header)}
        </div>

        <div class="qb-field">
          <label class="qb-label" for="qbBody">Message text</label>
          <textarea class="qb-textarea" id="qbBody" data-f="body_text" data-max="${L.body}" placeholder="e.g. Sure! Which service would you like to book?">${esc(d.body_text)}</textarea>
          ${counter(d.body_text, L.body)}
        </div>

        <div class="qb-field">
          <label class="qb-label" for="qbFooter">Footer <span>(optional)</span></label>
          <input class="qb-input" id="qbFooter" data-f="footer_text" data-max="${L.footer}" autocomplete="off" placeholder="e.g. Tap an option below" value="${esc(d.footer_text)}">
          ${counter(d.footer_text, L.footer)}
        </div>

        ${
          t === 'list'
            ? `<div class="qb-field">
          <label class="qb-label" for="qbListBtn">Text on the button that opens the list</label>
          <input class="qb-input" id="qbListBtn" data-f="list_button_text" data-max="${L.listBtn}" autocomplete="off" placeholder="e.g. Choose service" value="${esc(d.list_button_text)}">
          ${counter(d.list_button_text, L.listBtn)}
        </div>`
            : ''
        }

        <h3 style="margin-top:18px">${t === 'list' ? 'Options' : t === 'cta' ? 'Button' : 'Buttons'} <span class="qb-pill" id="qbItemCount">${d.items.length}/${maxItems(t)}</span></h3>
        <p class="qb-sub">${
          t === 'buttons'
            ? 'WhatsApp allows up to 3 buttons, with up to 20 characters each.'
            : t === 'list'
              ? 'WhatsApp allows up to 10 options in total. Use sections to group them (all options then need a section).'
              : 'WhatsApp allows exactly 1 link button, with up to 20 characters.'
        }</p>
        <div id="qbItems">${d.items.map((i, n) => itemHtml(d, i, n)).join('')}</div>
        ${t === 'cta' ? '' : `<button type="button" class="qb-btn small" data-act="add-item" ${canAdd ? '' : 'disabled'}>+ Add ${esc(word)}</button>`}

        <h3 style="margin-top:18px">Preview</h3>
        <p class="qb-sub">This is how it looks on the customer's WhatsApp.</p>
        <div id="qbPreview">${previewHtml(d)}</div>

        <div class="qb-actions" style="margin-top:16px">
          <button type="button" class="qb-btn primary" data-act="save">Save menu</button>
          <button type="button" class="qb-btn" data-act="cancel">Cancel</button>
        </div>
      </div>`;
  }

  function refreshPreview() {
    const host = q('#qbPreview');
    if (host && S.draft) host.innerHTML = previewHtml(S.draft);
  }

  /* ---------------------------------------------------------
     ACTIONS
  --------------------------------------------------------- */
  function openNew() {
    S.draft = emptyDraft();
    renderBody();
  }

  function openEdit(id) {
    const row = S.items.find(m => m.id === id);
    if (!row) return;
    S.draft = fromRow(row);
    renderBody();
  }

  async function saveDraft(btn) {
    const d = S.draft;
    if (!d) return;
    const problem = validate(d);
    if (problem) return ui.toast(problem, true);

    await withBusy(btn, 'Saving…', async () => {
      try {
        const row = toRow(d);
        let saved;
        if (d.id) {
          const { data, error } = await db
            .from(TABLE)
            .update({ ...row, updated_at: new Date().toISOString() })
            .eq('id', d.id)
            .eq('client_id', clientId())
            .select(COLS)
            .single();
          if (error) throw error;
          saved = data;
          S.items = S.items.map(m => (m.id === d.id ? saved : m));
        } else {
          const { data, error } = await db
            .from(TABLE)
            .insert({ client_id: clientId(), ...row })
            .select(COLS)
            .single();
          if (error) throw error;
          saved = data;
          S.items.unshift(saved);
          S.limitHit = false;
        }
        S.draft = null;
        S.filter = 'all';
        S.search = '';
        renderBody();
        ui.toast('Menu saved. Taps on it send your reply with 0 tokens.');
      } catch (e) {
        console.error('[GLIME Quick Buttons] save:', e);
        if (isLimitError(e)) {
          S.limitHit = true;
          S.draft = null;
          renderBody();
          ui.toast('Menu limit reached. Upgrade your plan to add more.', true);
        } else {
          ui.toast(errMsg(e), true);
        }
      }
    });
  }

  async function toggleMenu(btn) {
    const id = btn.dataset.id;
    const on = btn.dataset.v === 'on';
    const row = S.items.find(m => m.id === id);
    if (!row) return;

    if (on && row.trigger_qa_id) {
      const clash = S.items.find(m => m.id !== id && isOn(m) && m.trigger_qa_id === row.trigger_qa_id);
      if (clash) return ui.toast('Another active menu ("' + clash.name + '") already opens for this Fixed Q&A. Turn that one off first.', true);
    }

    if (on && row.is_welcome) {
      const clash = S.items.find(m => m.id !== id && isOn(m) && m.is_welcome);
      if (clash) return ui.toast('Another active menu ("' + clash.name + '") is already your welcome menu. Turn that one off first.', true);
    }

    await withBusy(btn, '…', async () => {
      try {
        const { data, error } = await db
          .from(TABLE)
          .update({ is_active: on, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('client_id', clientId())
          .select(COLS)
          .single();
        if (error) throw error;
        S.items = S.items.map(m => (m.id === id ? data : m));
        renderChips();
        renderList();
        ui.toast(on ? 'Turned on.' : 'Turned off. Customers will not get this menu.');
      } catch (e) {
        console.error('[GLIME Quick Buttons] toggle:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function deleteMenu(btn) {
    const id = btn.dataset.id;
    const row = S.items.find(m => m.id === id);
    if (!row) return;

    const users = S.items.filter(
      m => m.id !== id && (m.items || []).some(i => i.action === 'menu' && i.target_menu_id === id)
    );
    const warn = users.length
      ? ' It is opened by a button in: ' + users.map(m => m.name).join(', ') + '. Those buttons will stop working until you change them.'
      : '';

    const ok = await ui.confirm('Delete "' + row.name + '"? Customers will no longer get this menu.' + warn, {
      title: 'Delete menu',
      confirmText: 'Delete',
      danger: true
    });
    if (!ok) return;

    await withBusy(btn, 'Deleting…', async () => {
      try {
        const { error } = await db.from(TABLE).delete().eq('id', id).eq('client_id', clientId());
        if (error) throw error;
        S.items = S.items.filter(m => m.id !== id);
        S.limitHit = false;
        renderBody();
        ui.toast('Menu deleted.');
      } catch (e) {
        console.error('[GLIME Quick Buttons] delete:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  function moveItem(n, dir) {
    const items = S.draft.items;
    const to = n + dir;
    if (to < 0 || to >= items.length) return;
    [items[n], items[to]] = [items[to], items[n]];
    renderBody();
  }

  /* ---------------------------------------------------------
     EVENTS
  --------------------------------------------------------- */
  function onClick(e) {
    const el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !ROOT || !ROOT.contains(el)) return;
    const d = S.draft;

    switch (el.dataset.act) {
      case 'new':
        openNew();
        break;
      case 'edit':
        openEdit(el.dataset.id);
        break;
      case 'cancel':
        S.draft = null;
        renderBody();
        break;
      case 'save':
        saveDraft(el);
        break;
      case 'toggle':
        toggleMenu(el);
        break;
      case 'delete':
        deleteMenu(el);
        break;
      case 'filter':
        S.filter = el.dataset.v || 'all';
        renderChips();
        renderList();
        break;
      case 'retry':
        load();
        break;
      case 'add-item':
        if (d && d.items.length < maxItems(d.menu_type)) {
          d.items.push(newItem(d.menu_type));
          renderBody();
        }
        break;
      case 'del-item':
        if (d && d.items.length > 1) {
          d.items.splice(Number(el.dataset.i), 1);
          renderBody();
        }
        break;
      case 'up':
        if (d) moveItem(Number(el.dataset.i), -1);
        break;
      case 'down':
        if (d) moveItem(Number(el.dataset.i), 1);
        break;
      default:
        break;
    }
  }

  /* typing: update the draft, the counter and the preview without redrawing the form */
  function onInput(e) {
    const t = e.target;
    if (!t || !t.matches) return;

    if (t.matches('#qbSearch')) {
      S.search = t.value;
      renderList();
      return;
    }

    if (!S.draft || !t.dataset.f || t.dataset.change) return;
    const f = t.dataset.f;
    if (t.dataset.i !== undefined) S.draft.items[Number(t.dataset.i)][f] = t.value;
    else S.draft[f] = t.value;

    const max = Number(t.dataset.max || 0);
    const cnt = t.parentElement && t.parentElement.querySelector(':scope > .qb-count');
    if (cnt && max) {
      cnt.textContent = len(t.value) + '/' + max;
      cnt.classList.toggle('over', len(t.value) > max);
    }
    refreshPreview();
  }

  /* dropdowns change the shape of the form, so redraw it */
  function onChange(e) {
    const t = e.target;
    if (!S.draft || !t || !t.dataset || !t.dataset.change) return;
    const d = S.draft;
    const f = t.dataset.f;

    if (t.dataset.i !== undefined) {
      d.items[Number(t.dataset.i)][f] = t.value;
    } else if (f === 'is_welcome') {
      d.is_welcome = t.value === 'yes';
      if (d.is_welcome) d.trigger_qa_id = '';
    } else {
      d[f] = t.value;
      if (f === 'menu_type') {
        const acts = allowedActions(d.menu_type);
        d.items.forEach(i => {
          if (!acts.includes(i.action)) i.action = acts[0];
        });
        if (d.menu_type === 'cta' && d.items.length > 1) {
          ui.toast('A link button menu has 1 button. Extra buttons were not kept.');
          d.items = d.items.slice(0, 1);
        }
        if (d.menu_type === 'buttons' && d.items.length > L.maxButtons) {
          ui.toast('Reply buttons allow up to 3. Remove ' + (d.items.length - L.maxButtons) + ' before saving.', true);
        }
      }
    }
    renderBody();
  }

  /* ---------------------------------------------------------
     MODULE REGISTRATION
  --------------------------------------------------------- */
  shell.register({
    id: 'quick-buttons',
    label: 'Quick Buttons',
    order: 26,

    render: async ({ container }) => {
      injectStyles();

      container.innerHTML = '<div class="qb-root" id="qbRoot"></div>';
      ROOT = container.querySelector('#qbRoot');
      if (!ROOT) return;

      ROOT.addEventListener('click', onClick);
      ROOT.addEventListener('input', onInput);
      ROOT.addEventListener('change', onChange);

      /* a new render starts fresh so lists are never stale */
      S.ready = false;
      S.loading = false;
      S.unavailable = false;
      S.error = null;
      S.draft = null;
      S.filter = 'all';
      S.search = '';

      ROOT.innerHTML = shellHtml();
      await load();
    }
  });
})();
