/* =========================================================
   GLIME - SETTINGS > QUICK BUTTONS
   ---------------------------------------------------------
   The owner builds tap-menus from Settings for TWO channels, each in
   its own tab with its own menu list and editor:
     WhatsApp   reply buttons, list menus and link buttons
     Instagram  Quick replies and a link (CTA) button
   When a customer taps a button, the saved reply is sent directly
   BEFORE the AI runs: no AI call, 0 tokens charged.

   EDITOR = PREVIEW. The menu is built directly inside a phone that
   looks like the customer's chat: the owner types the message, the
   button names (and list options) right in the phone. Tapping a
   button in the phone selects it, and below it the chat continues:
   "customer taps X" and the reply bubble the customer will receive,
   which the owner also types in place. Only the menu settings (name,
   type, Fixed Q&A, welcome) sit in a small form above the phone.

   REVIEW. Every saved menu has a Review button. It opens a test chat
   where the owner taps the buttons like a customer and sees how the
   system answers: the reply text, the next menu, the hand-over to the
   team, or the link. It is a simulation only: nothing is sent to any
   customer and no tokens are used.

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

   Instagram rules enforced on this screen:
     Quick replies   type 'buttons', 1 to 13, title up to 20
     Link button     type 'cta', exactly 1 link button, text up to 20
     No list menu, no header, no footer, no list button text
     (header_text, footer_text and list_button_text are sent as null)
     Message text up to 1000, reply_text up to 1000

   Data: table client_quick_menus (RLS: owner sees and changes only
   their own client_id rows).
     id uuid, client_id text,
     channel text              'whatsapp' | 'instagram'. Sent on INSERT
                               only, never on update.
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
                               menu per client PER CHANNEL. A welcome menu
                               has no trigger_qa_id.
     menu_type text            'buttons' | 'list' | 'cta'
     header_text, body_text, footer_text text
     list_button_text text     WhatsApp list menus only
     items jsonb               array of
       { key, title, description, section, action,
         target_menu_id, reply_text, url }
       action: 'text'  send reply_text
               'menu'  open the menu target_menu_id (same channel only)
               'human' hand the chat to the team (reply_text optional)
               'url'   link button only
     is_active boolean, use_count int, last_used_at,
     created_at, updated_at

   Button id sent to the channel (for the webhooks):
     qm:<menu id>:<item key>     (well under the 256 / 200 limits)
   The webhook reads the tapped id, finds the menu and the item, and
   runs the action with no AI call.

   Errors from the database:
     QUICK_MENU_LIMIT_REACHED  30 menus per channel; the screen shows
                               the upgrade message.
     QUICK_MENU_INVALID: <text> the text after the prefix is shown as is.
     23505 (unique)            there is already an active menu or welcome
                               menu for that channel.
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
    'id,channel,name,trigger_qa_id,is_welcome,menu_type,header_text,body_text,footer_text,list_button_text,items,is_active,use_count,last_used_at,created_at,updated_at';
  const UPGRADE_URL = 'packages.html';
  const MAX_MENUS = 30; // per channel, enforced by the database too

  /* Shared limits */
  const L = {
    name: 60,
    url: 2000
  };

  /* Per-channel rules */
  const CH = {
    whatsapp: {
      label: 'WhatsApp',
      customerWord: 'WhatsApp',
      types: ['buttons', 'list', 'cta'],
      typeInfo: {
        buttons: { label: 'Reply buttons', hint: 'Up to 3 buttons under your message.' },
        list: { label: 'List menu', hint: 'One "open list" button with up to 10 options.' },
        cta: { label: 'Link button', hint: 'One button that opens a website link.' }
      },
      lim: {
        body: 1024,
        header: 60,
        footer: 60,
        listBtn: 20,
        btnTitle: 20,
        rowTitle: 24,
        rowDesc: 72,
        section: 24,
        reply: 1024,
        maxButtons: 3,
        maxRows: 10,
        maxSections: 10
      },
      hasHeaderFooter: true
    },
    instagram: {
      label: 'Instagram',
      customerWord: 'Instagram',
      types: ['buttons', 'cta'],
      typeInfo: {
        buttons: { label: 'Quick replies', hint: 'Up to 13 quick reply chips under your message.' },
        cta: { label: 'Link button', hint: 'One button that opens a website link.' }
      },
      lim: {
        body: 1000,
        btnTitle: 20,
        reply: 1000,
        maxButtons: 13
      },
      hasHeaderFooter: false
    }
  };
  const CHANNELS = ['whatsapp', 'instagram'];

  const S = {
    ready: false,
    loading: false,
    unavailable: false,
    error: null,
    items: [],
    faqs: [],
    channel: 'whatsapp',
    filter: 'all',
    search: '',
    draft: null, // menu being edited or created; null = list view
    sel: 0, // index of the button/option selected inside the phone
    scrollEditor: false,
    limitHit: { whatsapp: false, instagram: false }
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

  const chOf = m => (m && m.channel === 'instagram' ? 'instagram' : 'whatsapp');
  const itemsOf = ch => S.items.filter(m => chOf(m) === ch);
  const limitReached = ch => S.limitHit[ch] || itemsOf(ch).length >= MAX_MENUS;

  const isMissingBackend = e => {
    const code = String((e && (e.code || e.status)) || '');
    return (
      ['42P01', '42883', '42703', 'PGRST205', 'PGRST202', '404'].includes(code) ||
      /does not exist|schema cache|could not find the (table|function|column)/i.test(errMsg(e))
    );
  };
  const isLimitError = e => /quick_menu_limit/i.test(errMsg(e));

  /* text after the QUICK_MENU_INVALID: prefix, shown as is; '' when not that error */
  const invalidText = e => {
    const m = errMsg(e).match(/QUICK_MENU_INVALID:\s*([\s\S]*)/);
    return m && m[1].trim() ? m[1].trim() : '';
  };
  const isUniqueError = e =>
    String((e && e.code) || '') === '23505' || /23505|duplicate key value/i.test(errMsg(e));

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

  /* Turns a database error into a message for the owner.
     Returns { limit: true } when the plan limit was hit. */
  function describeError(e, ch) {
    if (isLimitError(e)) {
      return {
        limit: true,
        text: 'You have reached the limit of ' + MAX_MENUS + ' ' + CH[ch].label + ' menus. Upgrade your plan to add more.'
      };
    }
    const inv = invalidText(e);
    if (inv) return { limit: false, text: inv };
    if (isUniqueError(e)) {
      return {
        limit: false,
        text: 'There is already an active menu or welcome menu for ' + CH[ch].label + '. Turn that one off first, or choose a different Fixed Q&A.'
      };
    }
    return { limit: false, text: errMsg(e) };
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
      .qb-tabs{display:flex;gap:8px;margin:14px 0 0}
      .qb-tab{flex:1;min-height:46px;padding:0 14px;border-radius:14px;border:1px solid var(--bd);background:var(--surf);color:#fff;font-size:.84rem;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
      .qb-tab .qb-tab-n{font-size:.66rem;font-weight:800;padding:2px 8px;border-radius:99px;border:1px solid rgba(255,255,255,.28)}
      .qb-tab.active[data-v="whatsapp"]{background:linear-gradient(105deg,#25d366,#128c7e);color:#031014;border-color:transparent}
      .qb-tab.active[data-v="instagram"]{background:linear-gradient(105deg,#feda75,#d62976 55%,#962fbf);color:#fff;border-color:transparent}
      .qb-tab.active .qb-tab-n{border-color:rgba(255,255,255,.55)}
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
      .qb-check{display:flex;gap:10px;align-items:flex-start;background:var(--surf2);border:1px solid var(--bd);border-radius:12px;padding:12px;cursor:pointer}
      .qb-check input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:#50f5a8}
      .qb-check b{display:block;font-size:.78rem}
      .qb-check span{display:block;font-size:.68rem;color:rgba(255,255,255,.62);margin-top:3px;line-height:1.5}
      .qb-check.off{opacity:.5;cursor:default}
      .qb-count{font-size:.62rem;color:rgba(255,255,255,.5);text-align:right;margin-top:2px}
      .qb-count.over{color:var(--rd);font-weight:800}
      .qb-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:.8rem;font-weight:800;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}
      .qb-btn.primary{background:linear-gradient(105deg,var(--gr),var(--cy));color:#031014;border:0}
      .qb-btn.danger{color:var(--rd);border-color:rgba(255,130,145,.5)}
      .qb-btn.review{color:var(--cy);border-color:rgba(82,232,255,.5)}
      .qb-btn.small{min-height:36px;padding:0 12px;font-size:.74rem;border-radius:10px}
      .qb-btn:disabled{opacity:.5;cursor:default}
      .qb-pill{display:inline-block;font-size:.64rem;font-weight:800;padding:3px 9px;border-radius:99px;border:1px solid rgba(255,255,255,.28);white-space:nowrap}
      .qb-pill.on{color:var(--gr);border-color:rgba(80,245,168,.4)}
      .qb-pill.wait{color:var(--cy);border-color:rgba(82,232,255,.4)}
      .qb-pill.ig{color:#f58ac0;border-color:rgba(214,41,118,.5)}
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
      .qb-row-tools{display:flex;gap:6px}
      .qb-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}

      /* the phone = the editor */
      .qb-phone{background:#0b141a;border:1px solid var(--bd);border-radius:22px;padding:14px;width:100%;max-width:400px}
      .qb-phone.ig{background:#000;border-color:rgba(255,255,255,.14)}
      .qb-ph-cap{font-size:.64rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.5);margin:0 0 6px}
      .qb-ph-bub{background:#1f2c34;border-radius:12px 12px 12px 4px;padding:8px;max-width:96%}
      .qb-phone.ig .qb-ph-bub{background:#262626;border-radius:20px 20px 20px 6px}
      .qb-fld{position:relative}
      .qb-ph-bub .qb-fld+.qb-fld{margin-top:6px}
      .qb-pi{width:100%;background:transparent;border:1px dashed rgba(255,255,255,.28);color:inherit;font:inherit;font-size:16px;line-height:1.45;padding:6px 8px;border-radius:8px;outline:none;resize:none;overflow:hidden;display:block}
      .qb-pi::placeholder{color:rgba(255,255,255,.4)}
      .qb-pi:focus{border-style:solid;border-color:rgba(255,255,255,.7);background:rgba(255,255,255,.05)}
      .qb-pi.bold{font-weight:800}
      .qb-pi.dim{font-size:14px;color:rgba(255,255,255,.7)}
      .qb-pbtn{display:flex;align-items:center;gap:4px;margin-top:6px;border:1px solid transparent;border-radius:10px;background:#1f2c34;padding:2px 6px;max-width:96%;cursor:pointer}
      .qb-pbtn .qb-fld{flex:1;min-width:0}
      .qb-pbtn .qb-ico{color:#53bdeb;font-weight:800}
      .qb-pbtn .qb-pi{color:#53bdeb;text-align:center;font-weight:800;border-color:transparent}
      .qb-pbtn.sel,.qb-ph-row.sel{border-color:#53bdeb;box-shadow:0 0 0 1px #53bdeb}
      .qb-ph-list{background:#1f2c34;border-radius:12px;margin-top:8px;padding:8px;max-width:96%}
      .qb-ph-row{border:1px solid transparent;border-radius:10px;padding:6px;margin-bottom:6px;cursor:pointer}
      .qb-ph-row:last-child{margin-bottom:0}
      .qb-ph-row .qb-fld+.qb-fld{margin-top:4px}
      .qb-ph-row .qb-pi.sec{color:#25d366;font-weight:800;font-size:13px}
      .qb-ph-add{margin-top:8px;min-height:36px;padding:0 14px;border-radius:99px;border:1px dashed rgba(255,255,255,.4);background:transparent;color:rgba(255,255,255,.85);font-size:.74rem;font-weight:800;cursor:pointer}
      .qb-ph-add:disabled{opacity:.4;cursor:default}
      .qb-ig-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:flex-start}
      .qb-ig-pc{display:inline-block;border:1px solid #8e5cff;border-radius:99px;padding:2px 6px;cursor:pointer}
      .qb-ig-pc .qb-pi{border:0;color:#c4a8ff;font-weight:800;text-align:center;width:auto;min-width:60px;padding:5px 6px}
      .qb-ig-pc.sel{background:rgba(142,92,255,.25);box-shadow:0 0 0 1px #8e5cff}
      .qb-phone.ig .qb-pbtn{background:#363636}
      .qb-phone.ig .qb-pbtn .qb-pi,.qb-phone.ig .qb-pbtn .qb-ico{color:#fff}
      .qb-phone.ig .qb-pbtn.sel{border-color:#8e5cff;box-shadow:0 0 0 1px #8e5cff}

      /* the chat after a tap: customer tap + the reply */
      .qb-flow{margin-top:14px;border-top:1px dashed rgba(255,255,255,.18);padding-top:12px}
      .qb-flow-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
      .qb-flow-head b{font-size:.72rem;color:rgba(255,255,255,.85);line-height:1.4;word-break:break-word;flex:1;min-width:140px}
      .qb-flow .qb-select{margin-bottom:8px;padding:9px 10px;font-size:16px}
      .qb-out{margin:8px 0 8px auto;width:fit-content;max-width:80%;background:#005c4b;border-radius:12px 12px 4px 12px;padding:8px 12px;font-size:.8rem;line-height:1.45;word-break:break-word;white-space:pre-wrap}
      .qb-phone.ig .qb-out{background:#3797f0}
      .qb-in{background:#1f2c34;border-radius:12px 12px 12px 4px;padding:8px;max-width:96%;margin-bottom:6px}
      .qb-phone.ig .qb-in{background:#262626;border-radius:20px 20px 20px 6px}
      .qb-in-note{font-size:.72rem;color:rgba(255,255,255,.72);padding:2px 2px 6px;line-height:1.5}
      .qb-in-body{font-size:.8rem;line-height:1.5;white-space:pre-wrap;word-break:break-word}

      /* review: tappable test chat */
      .qb-rv{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.74);display:flex;align-items:center;justify-content:center;padding:14px;color:#fff}
      .qb-rv *{box-sizing:border-box}
      .qb-rv-box{background:var(--surf,#101820);border:1px solid var(--bd,rgba(255,255,255,.18));border-radius:20px;width:100%;max-width:440px;max-height:94vh;display:flex;flex-direction:column;overflow:hidden}
      .qb-rv-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid var(--bd,rgba(255,255,255,.18))}
      .qb-rv-top b{font-size:.84rem;line-height:1.3;word-break:break-word}
      .qb-rv-top .qb-row-tools{flex:none}
      .qb-rv-scroll{overflow:auto;padding:12px 14px;flex:1}
      .qb-rv-scroll .qb-phone{max-width:none;min-height:240px}
      .qb-rv-foot{padding:10px 14px;border-top:1px solid var(--bd,rgba(255,255,255,.18));font-size:.68rem;color:rgba(255,255,255,.68);line-height:1.5}
      .qb-rv-msg{margin-bottom:8px}
      .qb-rv-note{margin:10px auto;width:fit-content;max-width:94%;text-align:center;font-size:.7rem;line-height:1.5;color:rgba(255,255,255,.78);border:1px dashed rgba(255,255,255,.3);border-radius:10px;padding:6px 10px;word-break:break-word}
      .qb-rv-h{font-weight:800;margin-bottom:4px;font-size:.8rem}
      .qb-rv-b{font-size:.8rem;line-height:1.5;white-space:pre-wrap;word-break:break-word}
      .qb-rv-f{font-size:.68rem;color:rgba(255,255,255,.55);margin-top:6px}
      .qb-rvb{display:block;width:96%;margin-top:6px;border:1px solid transparent;border-radius:10px;background:#1f2c34;color:#53bdeb;text-align:center;font-weight:800;font-size:.8rem;padding:10px;font-family:inherit;cursor:pointer;word-break:break-word}
      .qb-rvb:disabled{opacity:.45;cursor:default}
      .qb-rvb:not(:disabled):hover{border-color:#53bdeb}
      .qb-rv-list{background:#1f2c34;border-radius:12px;margin-top:8px;padding:6px 10px;width:96%}
      .qb-rv-sec{font-size:.68rem;font-weight:800;color:#25d366;margin:8px 0 2px}
      .qb-rvr{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.08);color:#fff;padding:9px 0;font-size:.78rem;font-family:inherit;cursor:pointer}
      .qb-rvr:last-child{border-bottom:0}
      .qb-rvr small{display:block;color:rgba(255,255,255,.55);font-size:.68rem;margin-top:2px}
      .qb-rv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .qb-rvc{border:1px solid #8e5cff;background:transparent;color:#c4a8ff;border-radius:99px;padding:7px 14px;font-size:.78rem;font-weight:800;font-family:inherit;cursor:pointer;word-break:break-word}
      .qb-rvc:disabled{opacity:.45;cursor:default}
      .qb-phone.ig .qb-rvb{background:#363636;color:#fff}
      .qb-phone.ig .qb-rvb:not(:disabled):hover{border-color:#8e5cff}

      .qb-note{font-size:.7rem;color:rgba(255,255,255,.66);margin-top:10px;line-height:1.5}
      .qb-safe{display:grid;gap:6px;font-size:.74rem;color:rgba(255,255,255,.82);line-height:1.5}
      @media(max-width:640px){
        .qb-actions .qb-btn{flex:1}
        .qb-btn.block-m{width:100%}
        .qb-grid{grid-template-columns:1fr}
        .qb-toolbar .qb-input{width:100%;flex:none}
        .qb-phone{max-width:none}
        .qb-rv{padding:0;align-items:flex-end}
        .qb-rv-box{max-width:none;max-height:96vh;border-radius:20px 20px 0 0}
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
      .limit(300);
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

  const emptyDraft = ch => ({
    id: null,
    channel: ch,
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

  const fromRow = r => {
    const ch = chOf(r);
    return {
      id: r.id,
      channel: ch,
      name: r.name || '',
      trigger_qa_id: r.trigger_qa_id || '',
      is_welcome: !!r.is_welcome,
      menu_type: CH[ch].typeInfo[r.menu_type] ? r.menu_type : 'buttons',
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
    };
  };

  const maxItems = (ch, type) =>
    type === 'cta' ? 1 : type === 'buttons' ? CH[ch].lim.maxButtons : CH[ch].lim.maxRows;
  const itemTitleMax = (ch, type) => (type === 'list' ? CH[ch].lim.rowTitle : CH[ch].lim.btnTitle);
  const itemWord = (ch, type) => (type === 'list' ? 'option' : ch === 'instagram' && type === 'buttons' ? 'quick reply' : 'button');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* returns an error message, or '' when everything fits the channel's rules */
  function validate(d) {
    const ch = d.channel;
    const C = CH[ch];
    const lim = C.lim;
    const t = d.menu_type;
    const name = d.name.trim();
    if (len(name) < 2) return 'Give this menu a name (only you will see it).';
    if (len(name) > L.name) return 'Menu name can be up to ' + L.name + ' characters.';
    if (!C.typeInfo[t]) return 'This menu type is not available for ' + C.label + '.';

    const body = d.body_text.trim();
    if (!body) return 'Write the message text customers will see.';
    if (len(body) > lim.body) return 'Message text can be up to ' + lim.body + ' characters.';
    if (C.hasHeaderFooter) {
      if (len(d.header_text.trim()) > lim.header) return 'Header can be up to ' + lim.header + ' characters.';
      if (len(d.footer_text.trim()) > lim.footer) return 'Footer can be up to ' + lim.footer + ' characters.';
    }

    const items = d.items;
    const word = itemWord(ch, t);
    if (!items.length) return 'Add at least one ' + word + '.';
    if (items.length > maxItems(ch, t)) {
      return t === 'buttons'
        ? ch === 'instagram'
          ? 'Quick replies allow up to ' + lim.maxButtons + '. Remove the extra ones.'
          : 'Reply buttons allow up to ' + lim.maxButtons + ' buttons. Remove extra buttons or switch to a List menu.'
        : t === 'cta'
          ? 'A link button menu has exactly 1 button.'
          : 'A list menu allows up to ' + lim.maxRows + ' options in total.';
    }

    if (t === 'list') {
      const lb = d.list_button_text.trim();
      if (!lb) return 'Write the text of the button that opens the list.';
      if (len(lb) > lim.listBtn) return 'The list button text can be up to ' + lim.listBtn + ' characters.';
    }

    const sections = new Set();
    const titles = new Set();
    const anySection = t === 'list' && items.some(i => i.section.trim());
    const sameChannelIds = new Set(itemsOf(ch).map(m => m.id));

    for (let n = 0; n < items.length; n++) {
      const i = items[n];
      const label = word + ' ' + (n + 1);
      const title = i.title.trim();
      if (!title) return 'Write the text for ' + label + '.';
      if (len(title) > itemTitleMax(ch, t)) return 'The text of ' + label + ' can be up to ' + itemTitleMax(ch, t) + ' characters.';

      if (ch === 'whatsapp' && t === 'buttons') {
        const k = title.toLowerCase();
        if (titles.has(k)) return 'Two buttons have the same text ("' + title + '"). WhatsApp needs different text on each button.';
        titles.add(k);
      }

      if (t === 'list') {
        if (len(i.description.trim()) > lim.rowDesc) return 'The description of ' + label + ' can be up to ' + lim.rowDesc + ' characters.';
        if (anySection) {
          const sec = i.section.trim();
          if (!sec) return 'When you use sections, every option needs a section name (' + label + ' has none).';
          if (len(sec) > lim.section) return 'A section name can be up to ' + lim.section + ' characters.';
          sections.add(sec.toLowerCase());
        }
      }

      if (!allowedActions(t).includes(i.action)) return 'Choose what happens when ' + label + ' is tapped.';

      if (i.action === 'text') {
        const r = i.reply_text.trim();
        if (!r) return 'Write the reply that ' + label + ' should send.';
        if (len(r) > lim.reply) return 'The reply of ' + label + ' can be up to ' + lim.reply + ' characters.';
      } else if (i.action === 'human') {
        if (len(i.reply_text.trim()) > lim.reply) return 'The message of ' + label + ' can be up to ' + lim.reply + ' characters.';
      } else if (i.action === 'menu') {
        if (!i.target_menu_id) return 'Choose which menu ' + label + ' should open.';
        if (d.id && i.target_menu_id === d.id) return 'A menu cannot open itself (' + label + ').';
        if (!sameChannelIds.has(i.target_menu_id)) return 'A ' + C.label + ' button can only open a ' + C.label + ' menu. Choose another menu for ' + label + '.';
      } else if (i.action === 'url') {
        const u = i.url.trim();
        if (!/^https:\/\/[^\s]+\.[^\s]+$/i.test(u)) return 'Enter a full link starting with https:// for ' + label + '.';
        if (len(u) > L.url) return 'The link of ' + label + ' is too long.';
      }
    }

    if (sections.size > lim.maxSections) return 'A list can have up to ' + lim.maxSections + ' sections.';

    if (d.is_welcome && d.trigger_qa_id) return 'A welcome menu cannot also open from a Fixed Q&A. Choose one.';

    if (d.is_welcome && d.is_active) {
      const w = itemsOf(ch).find(m => m.id !== d.id && m.is_active !== false && m.is_welcome);
      if (w) return 'Another active ' + C.label + ' menu ("' + w.name + '") is already your welcome menu. Turn that one off first.';
    }

    if (d.trigger_qa_id && d.is_active) {
      const clash = itemsOf(ch).find(m => m.id !== d.id && m.is_active !== false && m.trigger_qa_id === d.trigger_qa_id);
      if (clash) return 'Another active ' + C.label + ' menu ("' + clash.name + '") already opens for this Fixed Q&A. Turn that one off or choose a different Fixed Q&A.';
    }
    return '';
  }

  /* channel is NOT part of the row: it is added on insert only */
  function toRow(d) {
    const t = d.menu_type;
    const wa = d.channel === 'whatsapp';
    return {
      name: d.name.trim(),
      trigger_qa_id: d.is_welcome ? null : d.trigger_qa_id || null,
      is_welcome: !!d.is_welcome,
      menu_type: t,
      header_text: wa ? d.header_text.trim() || null : null,
      body_text: d.body_text.trim(),
      footer_text: wa ? d.footer_text.trim() || null : null,
      list_button_text: wa && t === 'list' ? d.list_button_text.trim() : null,
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
     RENDER
  --------------------------------------------------------- */
  function shellHtml() {
    return `
      <div class="qb-head">
        <h2>Quick Buttons</h2>
        <p>Build tap-menus for WhatsApp and Instagram, like "Book appointment: Facial, Hair, Makeup". Customers tap instead of typing. Each channel has its own menus.</p>
      </div>
      <div class="qb-banner"><b>0 tokens used.</b> When a customer taps a button, GLIME sends your saved reply directly and your AI does not run, so no AI tokens are charged.</div>
      <div id="qbBody"></div>
    `;
  }

  function tabsHtml() {
    return `<div class="qb-tabs" role="tablist">${CHANNELS.map(
      c =>
        `<button type="button" role="tab" class="qb-tab ${S.channel === c ? 'active' : ''}" data-act="tab" data-v="${c}" aria-selected="${S.channel === c}">${esc(CH[c].label)} <span class="qb-tab-n">${itemsOf(c).length}/${MAX_MENUS}</span></button>`
    ).join('')}</div>`;
  }

  /* grow textareas to fit their text */
  function autosize(scope) {
    const host = scope || ROOT;
    if (!host) return;
    host.querySelectorAll('textarea.qb-ph-ta').forEach(a => {
      a.style.height = 'auto';
      a.style.height = a.scrollHeight + 2 + 'px';
    });
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
      autosize(host);
      if (S.scrollEditor) {
        S.scrollEditor = false;
        const ed = q('#qbEditor');
        if (ed && ed.scrollIntoView) ed.scrollIntoView({ block: 'start' });
      }
      return;
    }

    const ch = S.channel;
    const C = CH[ch];
    const reached = limitReached(ch);
    host.innerHTML = `
      ${tabsHtml()}
      <div class="qb-card">
        <h3>Your ${esc(C.label)} menus</h3>
        <p class="qb-sub">Only <b>On</b> menus are sent to ${esc(C.customerWord)} customers. A menu can open as your <b>Welcome menu</b> (when a customer writes first), when a Fixed Q&amp;A matches, or when a customer taps a button in another ${esc(C.label)} menu. Tap <b>Review</b> on a menu to try it like a customer.</p>
        <div class="qb-toolbar">
          <input class="qb-input" id="qbSearch" type="search" autocomplete="off" placeholder="Search ${esc(C.label)} menus" value="${esc(S.search)}">
          <button type="button" class="qb-btn primary small" data-act="new" ${reached ? 'disabled' : ''}>+ New ${esc(C.label)} menu</button>
        </div>
        ${reached ? limitHtml(ch) : ''}
        <div class="qb-chips" id="qbChips"></div>
        <div id="qbList"></div>
      </div>
      <div class="qb-card">
        <h3>How it stays safe</h3>
        <div class="qb-safe">
          <span>Only you can create or change menus. Customers can never change them.</span>
          ${
            ch === 'instagram'
              ? '<span>Instagram limits are checked for you before saving: up to 13 quick replies, 20 characters on a button, 1000 characters in a message.</span>'
              : '<span>WhatsApp limits are checked for you before saving: 3 reply buttons, 10 list options, 20 characters on a button.</span>'
          }
          <span>If a customer types something that is not a button tap, your normal Fixed Q&amp;A and AI work as usual.</span>
          <span>Your Welcome menu is sent only on a customer's first message, and on the first message after 24 hours of silence. It is never repeated in the middle of a chat. You can have one active welcome menu for each channel.</span>
        </div>
      </div>`;
    renderChips();
    renderList();
  }

  function limitHtml(ch) {
    return `
      <div class="qb-err"><b>${esc(CH[ch].label)} menu limit reached</b>You have used all ${MAX_MENUS} ${esc(CH[ch].label)} menus in your plan. Upgrade to add more, or delete one you no longer need.
        <div class="qb-actions"><a class="qb-btn small primary" href="${UPGRADE_URL}">Upgrade plan</a></div>
      </div>`;
  }

  const isOn = m => m.is_active !== false;
  const countOf = key =>
    itemsOf(S.channel).filter(m => (key === 'all' ? true : key === 'on' ? isOn(m) : !isOn(m))).length;

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
    const ch = chOf(m);
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
          <span class="qb-pill ${ch === 'instagram' ? 'ig' : 'wait'}">${esc((CH[ch].typeInfo[m.menu_type] || CH[ch].typeInfo.buttons).label)}</span>
          <span class="qb-pill">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
          <span class="qb-pill">Used ${fmtNum(m.use_count)} ${Number(m.use_count) === 1 ? 'time' : 'times'}</span>
          ${m.last_used_at ? `<span class="qb-pill">Last used ${esc(fmtDate(m.last_used_at))}</span>` : ''}
          <span class="qb-pill on">0 tokens</span>
        </div>
        <div class="qb-actions">
          <button type="button" class="qb-btn small review" data-act="review" data-id="${esc(m.id)}">▶ Review</button>
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
    let rows = itemsOf(S.channel).filter(m => (S.filter === 'all' ? true : S.filter === 'on' ? isOn(m) : !isOn(m)));
    if (needle) {
      rows = rows.filter(m =>
        norm([m.name, m.body_text, ...(m.items || []).map(i => i.title)].join(' ')).includes(needle)
      );
    }
    if (!rows.length) {
      const hasAny = itemsOf(S.channel).length > 0;
      const text = hasAny
        ? needle
          ? ['No match.', 'Try a different word.']
          : ['Nothing here.', 'No menus in this view.']
        : [
            'No ' + CH[S.channel].label + ' menus yet.',
            S.channel === 'instagram'
              ? 'Tap + New Instagram menu to build your first one, for example "Book appointment" with quick replies for your services.'
              : 'Tap + New WhatsApp menu to build your first one, for example "Book appointment" with buttons for your services.'
          ];
      host.innerHTML = `<div class="qb-empty"><b>${esc(text[0])}</b>${esc(text[1])}</div>`;
      return;
    }
    host.innerHTML = rows.map(menuCard).join('');
  }

  /* ---------------------------------------------------------
     EDITOR (the phone is the editor)
  --------------------------------------------------------- */
  const counter = (val, max) =>
    `<div class="qb-count ${len(val) > max ? 'over' : ''}">${len(val)}/${max}</div>`;

  function actionLabel(a) {
    return { text: 'Send a reply', menu: 'Open another menu', human: 'Hand over to my team', url: 'Open a link' }[a] || a;
  }

  /* one text input and one growing textarea, both typed directly inside the phone */
  const pin = (f, n, val, max, ph, cls, extra) =>
    `<div class="qb-fld"><input class="qb-pi ${cls || ''}" data-f="${f}" ${n == null ? '' : `data-i="${n}"`} data-max="${max}" autocomplete="off" placeholder="${esc(ph)}" value="${esc(val)}" ${extra || ''}>${counter(val, max)}</div>`;
  const pta = (f, n, val, max, ph) =>
    `<div class="qb-fld"><textarea class="qb-pi qb-ph-ta" rows="1" data-f="${f}" ${n == null ? '' : `data-i="${n}"`} data-max="${max}" placeholder="${esc(ph)}">${esc(val)}</textarea>${counter(val, max)}</div>`;

  /* the part of the chat that follows a tap on the selected button */
  function flowHtml(d) {
    const ch = d.channel;
    const lim = CH[ch].lim;
    const t = d.menu_type;
    const total = d.items.length;
    const n = S.sel;
    const i = d.items[n];
    if (!i) return '';
    const word = itemWord(ch, t);
    const acts = allowedActions(t);
    const action = acts.includes(i.action) ? i.action : acts[0];
    const title = i.title.trim() || cap(word) + ' ' + (n + 1);

    const tools =
      t === 'cta'
        ? ''
        : `<div class="qb-row-tools">
            <button type="button" class="qb-btn small" aria-label="Move up" data-act="up" data-i="${n}" ${n === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="qb-btn small" aria-label="Move down" data-act="down" data-i="${n}" ${n === total - 1 ? 'disabled' : ''}>▼</button>
            <button type="button" class="qb-btn small danger" data-act="del-item" data-i="${n}" ${total <= 1 ? 'disabled' : ''}>Remove</button>
          </div>`;

    let reply = '';
    if (action === 'text') {
      reply = `<div class="qb-in">${pta('reply_text', n, i.reply_text, lim.reply, 'Type the reply customers get, e.g. Facial is Rs 999 and takes 45 minutes. Which day suits you?')}</div>`;
    } else if (action === 'human') {
      reply =
        `<div class="qb-in-note">Your team takes over this chat. You can send a message first (optional):</div>` +
        `<div class="qb-in">${pta('reply_text', n, i.reply_text, lim.reply, 'e.g. Our team will reply to you shortly.')}</div>`;
    } else if (action === 'menu') {
      const others = itemsOf(ch).filter(m => m.id !== d.id);
      const tgt = others.find(m => m.id === i.target_menu_id);
      reply = `
        <select class="qb-select" data-f="target_menu_id" data-i="${n}" data-change="1">
          <option value="">Choose a ${esc(CH[ch].label)} menu to open</option>
          ${others.map(m => `<option value="${esc(m.id)}" ${i.target_menu_id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
        ${others.length ? '' : `<span class="qb-hint" style="margin:-4px 0 8px">You have no other ${esc(CH[ch].label)} menu yet. Save this one, create the next menu, then come back and choose it here.</span>`}
        ${tgt ? `<div class="qb-in"><div class="qb-in-note">This menu opens next:</div><div class="qb-in-body">${esc(tgt.body_text)}</div></div>` : ''}`;
    } else if (action === 'url') {
      reply = `<div class="qb-in"><div class="qb-in-note">The customer's phone opens this link:</div>${pin('url', n, i.url, L.url, 'https://example.com/book', 'dim')}</div>`;
    }

    return `
      <div class="qb-flow-head">
        <b>When the customer taps “${esc(title)}”</b>
        ${tools}
      </div>
      ${
        acts.length > 1
          ? `<select class="qb-select" data-f="action" data-i="${n}" data-change="1">${acts.map(a => `<option value="${a}" ${action === a ? 'selected' : ''}>${esc(actionLabel(a))}</option>`).join('')}</select>`
          : ''
      }
      <div class="qb-out">${esc(title)}</div>
      ${reply}`;
  }

  function renderFlow() {
    const host = q('#qbFlow');
    if (!host || !S.draft) return;
    host.innerHTML = flowHtml(S.draft);
    autosize(host);
  }

  /* the chat as the customer sees it, typed in place */
  function phoneHtml(d) {
    const ch = d.channel;
    const C = CH[ch];
    const lim = C.lim;
    const t = d.menu_type;
    const word = itemWord(ch, t);
    const canAdd = d.items.length < maxItems(ch, t);
    const tMax = itemTitleMax(ch, t);
    const selCls = n => (S.sel === n ? 'sel' : '');
    const addBtn =
      t === 'cta'
        ? ''
        : `<div><button type="button" class="qb-ph-add" data-act="add-item" ${canAdd ? '' : 'disabled'}>+ Add ${esc(word)} (${d.items.length}/${maxItems(ch, t)})</button></div>`;

    let menu = '';
    if (ch === 'instagram') {
      const bub = `<div class="qb-ph-bub">${pta('body_text', null, d.body_text, lim.body, 'Type your message, e.g. Sure! Which service would you like to book?')}</div>`;
      if (t === 'cta') {
        const i = d.items[0] || newItem('cta');
        menu = bub + `<div class="qb-pbtn ${selCls(0)}" data-pi="0"><span class="qb-ico">↗</span>${pin('title', 0, i.title, tMax, 'Button text')}</div>`;
      } else {
        menu =
          bub +
          `<div class="qb-ig-chips">${d.items
            .map(
              (i, n) =>
                `<div class="qb-ig-pc ${selCls(n)}" data-pi="${n}">${pin('title', n, i.title, tMax, 'Quick reply', 'qb-ig-in', `size="${Math.max(8, len(i.title) + 1)}"`)}</div>`
            )
            .join('')}</div>` +
          addBtn;
      }
    } else {
      const bub = `<div class="qb-ph-bub">
        ${pin('header_text', null, d.header_text, lim.header, 'Header (optional)', 'bold')}
        ${pta('body_text', null, d.body_text, lim.body, 'Type your message, e.g. Sure! Which service would you like to book?')}
        ${pin('footer_text', null, d.footer_text, lim.footer, 'Footer (optional)', 'dim')}
      </div>`;
      if (t === 'list') {
        menu =
          bub +
          `<div class="qb-pbtn"><span class="qb-ico">☰</span>${pin('list_button_text', null, d.list_button_text, lim.listBtn, 'Text on the list button')}</div>` +
          `<div class="qb-ph-list">${d.items
            .map(
              (i, n) => `
            <div class="qb-ph-row ${selCls(n)}" data-pi="${n}">
              ${pin('section', n, i.section, lim.section, 'Section (optional)', 'sec')}
              ${pin('title', n, i.title, tMax, 'Option title')}
              ${pin('description', n, i.description, lim.rowDesc, 'Description (optional)', 'dim')}
            </div>`
            )
            .join('')}</div>` +
          addBtn;
      } else if (t === 'cta') {
        const i = d.items[0] || newItem('cta');
        menu = bub + `<div class="qb-pbtn ${selCls(0)}" data-pi="0"><span class="qb-ico">↗</span>${pin('title', 0, i.title, tMax, 'Button text')}</div>`;
      } else {
        menu =
          bub +
          d.items
            .map((i, n) => `<div class="qb-pbtn ${selCls(n)}" data-pi="${n}">${pin('title', n, i.title, tMax, 'Button text')}</div>`)
            .join('') +
          addBtn;
      }
    }

    return `
      <div class="qb-phone ${ch === 'instagram' ? 'ig' : ''}">
        <div class="qb-ph-cap">${esc(C.label)} · what the customer receives</div>
        ${menu}
        <div class="qb-flow" id="qbFlow">${flowHtml(d)}</div>
      </div>`;
  }

  function editorHtml() {
    const d = S.draft;
    const ch = d.channel;
    const C = CH[ch];
    const t = d.menu_type;
    const triggerLocked = d.is_welcome;
    const welcomeLocked = !!d.trigger_qa_id;
    if (S.sel >= d.items.length) S.sel = Math.max(0, d.items.length - 1);
    const itemsHelp =
      t === 'buttons'
        ? ch === 'instagram'
          ? 'Instagram allows up to 13 quick replies, with up to 20 characters each.'
          : 'WhatsApp allows up to 3 buttons, with up to 20 characters each.'
        : t === 'list'
          ? 'WhatsApp allows up to 10 options in total. Use sections to group them (all options then need a section).'
          : C.label + ' allows exactly 1 link button, with up to 20 characters.';

    return `
      <div class="qb-card" id="qbEditor">
        <h3>${d.id ? 'Edit' : 'New'} ${esc(C.label)} menu</h3>
        <p class="qb-sub">${esc(C.typeInfo[t].hint)} Set it up below, then build the chat right inside the phone. ${esc(C.label)} limits are checked when you save.</p>

        <div class="qb-field">
          <label class="qb-label" for="qbName">Menu name <span>(only you see this)</span></label>
          <input class="qb-input" id="qbName" data-f="name" data-max="${L.name}" autocomplete="off" placeholder="e.g. Book appointment" value="${esc(d.name)}">
          <div class="qb-count ${len(d.name) > L.name ? 'over' : ''}">${len(d.name)}/${L.name}</div>
        </div>

        <div class="qb-grid">
          <div class="qb-field">
            <label class="qb-label" for="qbType">Menu type</label>
            <select class="qb-select" id="qbType" data-f="menu_type" data-change="1">
              ${C.types.map(k => `<option value="${k}" ${t === k ? 'selected' : ''}>${esc(C.typeInfo[k].label)}</option>`).join('')}
            </select>
          </div>
          <div class="qb-field">
            <label class="qb-label" for="qbTrigger">Opens when</label>
            <select class="qb-select" id="qbTrigger" data-f="trigger_qa_id" data-change="1" ${triggerLocked ? 'disabled' : ''}>
              <option value="">Only from a button in another menu</option>
              ${S.faqs.map(f => `<option value="${esc(f.id)}" ${d.trigger_qa_id === f.id ? 'selected' : ''}>Fixed Q&amp;A: ${esc(String(f.question).slice(0, 70))}</option>`).join('')}
            </select>
          </div>
        </div>
        ${d.trigger_qa_id ? '<span class="qb-hint" style="margin:-4px 0 12px">When this Fixed Q&amp;A matches, customers get this menu instead of the plain fixed answer. Put the answer text in the message in the phone below.</span>' : ''}

        <div class="qb-field">
          <label class="qb-check ${welcomeLocked ? 'off' : ''}" for="qbWelcome">
            <input type="checkbox" id="qbWelcome" data-f="is_welcome" data-change="1" ${d.is_welcome ? 'checked' : ''} ${welcomeLocked ? 'disabled' : ''}>
            <div>
              <b>Welcome menu</b>
              <span>Send this when a customer writes first, and on the first message after 24 hours of silence, with 0 tokens. You can have one active welcome menu for ${esc(C.label)}. It cannot be combined with a Fixed Q&amp;A${welcomeLocked ? ' (clear the Fixed Q&amp;A above to use it)' : ''}.</span>
            </div>
          </label>
        </div>

        <h3 style="margin-top:18px">Build it in the phone</h3>
        <p class="qb-sub">Type straight into the phone. Tap a ${esc(itemWord(ch, t))} to write what happens when the customer taps it. ${esc(itemsHelp)}</p>
        <div id="qbPhone">${phoneHtml(d)}</div>

        <div class="qb-actions" style="margin-top:16px">
          <button type="button" class="qb-btn primary" data-act="save">Save menu</button>
          <button type="button" class="qb-btn" data-act="cancel">Cancel</button>
        </div>
      </div>`;
  }

  /* highlight and open the chosen button / option */
  function selectItem(n) {
    if (!S.draft || n === S.sel || n < 0 || n >= S.draft.items.length) return;
    S.sel = n;
    ROOT.querySelectorAll('[data-pi]').forEach(w => w.classList.toggle('sel', Number(w.dataset.pi) === n));
    renderFlow();
  }

  function focusItem(n) {
    const el = q('[data-pi="' + n + '"] input');
    if (el) el.focus();
  }

  /* ---------------------------------------------------------
     REVIEW (tappable test chat, nothing is sent to anyone)
  --------------------------------------------------------- */
  let RV = null; // overlay element
  let RVS = null; // { ch, menuId, steps, list }
  /* steps: { k:'menu', m } | { k:'out', t } | { k:'in', t } | { k:'note', t } */

  function rvStart(m) {
    const steps = [];
    if (m.is_welcome) {
      steps.push({ k: 'note', t: "The customer sends their first message (or writes after 24 hours of silence). Your welcome menu is sent." });
    } else if (m.trigger_qa_id) {
      steps.push({ k: 'out', t: faqName(m.trigger_qa_id) || 'A question that matches your Fixed Q&A' });
    } else {
      steps.push({ k: 'note', t: 'This menu opens from a button in another menu. It is shown here on its own.' });
    }
    steps.push({ k: 'menu', m });
    return steps;
  }

  function rvLastMenuIdx() {
    for (let n = RVS.steps.length - 1; n >= 0; n--) if (RVS.steps[n].k === 'menu') return n;
    return -1;
  }

  /* one menu as the customer sees it; only the latest menu can be tapped */
  function rvMenuHtml(m, active) {
    const ch = chOf(m);
    const t = m.menu_type;
    const items = Array.isArray(m.items) ? m.items : [];
    const dis = active ? '' : 'disabled';

    if (ch === 'instagram') {
      const bub = `<div class="qb-ph-bub"><div class="qb-rv-b">${esc(m.body_text)}</div></div>`;
      if (t === 'cta') {
        const i = items[0];
        return bub + (i ? `<button type="button" class="qb-rvb" data-rv="tap" data-i="0" ${dis}>↗ ${esc(i.title)}</button>` : '');
      }
      return (
        bub +
        `<div class="qb-rv-chips">${items.map((i, n) => `<button type="button" class="qb-rvc" data-rv="tap" data-i="${n}" ${dis}>${esc(i.title)}</button>`).join('')}</div>`
      );
    }

    const head = m.header_text ? `<div class="qb-rv-h">${esc(m.header_text)}</div>` : '';
    const foot = m.footer_text ? `<div class="qb-rv-f">${esc(m.footer_text)}</div>` : '';
    const bub = `<div class="qb-ph-bub">${head}<div class="qb-rv-b">${esc(m.body_text)}</div>${foot}</div>`;

    if (t === 'list') {
      let out = bub + `<button type="button" class="qb-rvb" data-rv="list" ${dis}>☰ ${esc(m.list_button_text || 'Choose option')}</button>`;
      if (active && RVS.list) {
        let last = null;
        const rows = items
          .map((i, n) => {
            const sec = (i.section || '').trim();
            let secHtml = '';
            if (sec && sec !== last) {
              secHtml = `<div class="qb-rv-sec">${esc(sec)}</div>`;
              last = sec;
            }
            return (
              secHtml +
              `<button type="button" class="qb-rvr" data-rv="tap" data-i="${n}">${esc(i.title)}${i.description ? `<small>${esc(i.description)}</small>` : ''}</button>`
            );
          })
          .join('');
        out += `<div class="qb-rv-list">${rows}</div>`;
      }
      return out;
    }
    if (t === 'cta') {
      const i = items[0];
      return bub + (i ? `<button type="button" class="qb-rvb" data-rv="tap" data-i="0" ${dis}>↗ ${esc(i.title)}</button>` : '');
    }
    return bub + items.map((i, n) => `<button type="button" class="qb-rvb" data-rv="tap" data-i="${n}" ${dis}>${esc(i.title)}</button>`).join('');
  }

  function rvBodyHtml() {
    const lastIdx = rvLastMenuIdx();
    return RVS.steps
      .map((s, idx) => {
        if (s.k === 'menu') return `<div class="qb-rv-msg">${rvMenuHtml(s.m, idx === lastIdx)}</div>`;
        if (s.k === 'out') return `<div class="qb-out">${esc(s.t)}</div>`;
        if (s.k === 'in') return `<div class="qb-in"><div class="qb-in-body">${esc(s.t)}</div></div>`;
        return `<div class="qb-rv-note">${esc(s.t)}</div>`;
      })
      .join('');
  }

  function rvRender(keepScroll) {
    if (!RV || !RVS) return;
    const scroller = RV.querySelector('.qb-rv-scroll');
    const m = S.items.find(x => x.id === RVS.menuId);
    const ch = RVS.ch;
    const top = scroller ? scroller.scrollTop : 0;
    RV.innerHTML = `
      <div class="qb-rv-box" role="dialog" aria-modal="true" aria-label="Review menu">
        <div class="qb-rv-top">
          <b>Review: ${esc(m ? m.name : 'Menu')} <span class="qb-pill ${ch === 'instagram' ? 'ig' : 'wait'}">${esc(CH[ch].label)}</span></b>
          <div class="qb-row-tools">
            <button type="button" class="qb-btn small" data-rv="restart">↺ Start again</button>
            <button type="button" class="qb-btn small" data-rv="close" aria-label="Close">✕</button>
          </div>
        </div>
        <div class="qb-rv-scroll">
          <div class="qb-phone ${ch === 'instagram' ? 'ig' : ''}">
            <div class="qb-ph-cap">${esc(CH[ch].label)} · tap the buttons like a customer</div>
            ${rvBodyHtml()}
          </div>
        </div>
        <div class="qb-rv-foot">Test view only. Nothing is sent to any customer and no tokens are used. Tapping a button here shows what your customer will get.</div>
      </div>`;
    const sc = RV.querySelector('.qb-rv-scroll');
    if (sc) sc.scrollTop = keepScroll ? top : sc.scrollHeight;
  }

  function rvTap(n) {
    const lastIdx = rvLastMenuIdx();
    if (lastIdx < 0) return;
    const m = RVS.steps[lastIdx].m;
    const it = (m.items || [])[n];
    if (!it) return;
    RVS.list = false;
    RVS.steps.push({ k: 'out', t: it.title });
    if (it.action === 'text') {
      RVS.steps.push({ k: 'in', t: it.reply_text || '' });
    } else if (it.action === 'human') {
      if (it.reply_text) RVS.steps.push({ k: 'in', t: it.reply_text });
      RVS.steps.push({ k: 'note', t: 'The chat is handed over to your team.' });
    } else if (it.action === 'menu') {
      const tgt = itemsOf(RVS.ch).find(x => x.id === it.target_menu_id);
      if (tgt) RVS.steps.push({ k: 'menu', m: tgt });
      else RVS.steps.push({ k: 'note', t: 'The menu this button should open was not found. Edit the button and choose a menu.' });
    } else if (it.action === 'url') {
      RVS.steps.push({ k: 'note', t: "The customer's phone opens this link: " + (it.url || '(no link set)') });
    }
    rvRender(false);
  }

  function rvOnClick(e) {
    if (!RV) return;
    if (e.target === RV) return closeReview();
    const el = e.target.closest ? e.target.closest('[data-rv]') : null;
    if (!el || !RV.contains(el)) return;
    switch (el.dataset.rv) {
      case 'close':
        closeReview();
        break;
      case 'restart': {
        const m = S.items.find(x => x.id === RVS.menuId);
        if (m) {
          RVS.steps = rvStart(m);
          RVS.list = false;
          rvRender(false);
        }
        break;
      }
      case 'list':
        RVS.list = !RVS.list;
        rvRender(false);
        break;
      case 'tap':
        rvTap(Number(el.dataset.i));
        break;
      default:
        break;
    }
  }

  function rvOnKey(e) {
    if (e.key === 'Escape') closeReview();
  }

  function openReview(id) {
    const m = S.items.find(x => x.id === id);
    if (!m) return;
    closeReview();
    RVS = { ch: chOf(m), menuId: m.id, steps: rvStart(m), list: false };
    RV = document.createElement('div');
    RV.className = 'qb-rv';
    RV.addEventListener('click', rvOnClick);
    document.body.appendChild(RV);
    document.addEventListener('keydown', rvOnKey);
    rvRender(false);
  }

  function closeReview() {
    document.removeEventListener('keydown', rvOnKey);
    if (RV) {
      RV.removeEventListener('click', rvOnClick);
      RV.remove();
    }
    RV = null;
    RVS = null;
  }

  /* ---------------------------------------------------------
     ACTIONS
  --------------------------------------------------------- */
  function openNew() {
    if (limitReached(S.channel)) return;
    S.draft = emptyDraft(S.channel);
    S.sel = 0;
    S.scrollEditor = true;
    renderBody();
  }

  function openEdit(id) {
    const row = S.items.find(m => m.id === id);
    if (!row) return;
    S.channel = chOf(row);
    S.draft = fromRow(row);
    S.sel = 0;
    S.scrollEditor = true;
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
          /* update: channel is never sent */
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
          /* insert: channel is sent here only */
          const { data, error } = await db
            .from(TABLE)
            .insert({ client_id: clientId(), channel: d.channel, ...row })
            .select(COLS)
            .single();
          if (error) throw error;
          saved = data;
          S.items.unshift(saved);
          S.limitHit[d.channel] = false;
        }
        S.channel = d.channel;
        S.draft = null;
        S.filter = 'all';
        S.search = '';
        renderBody();
        ui.toast('Menu saved. Tap Review on it to try it like a customer.');
      } catch (e) {
        console.error('[GLIME Quick Buttons] save:', e);
        const info = describeError(e, d.channel);
        if (info.limit) {
          S.limitHit[d.channel] = true;
          S.channel = d.channel;
          S.draft = null;
          renderBody();
        }
        ui.toast(info.text, true);
      }
    });
  }

  async function toggleMenu(btn) {
    const id = btn.dataset.id;
    const on = btn.dataset.v === 'on';
    const row = S.items.find(m => m.id === id);
    if (!row) return;
    const ch = chOf(row);
    const peers = itemsOf(ch);

    if (on && row.trigger_qa_id) {
      const clash = peers.find(m => m.id !== id && isOn(m) && m.trigger_qa_id === row.trigger_qa_id);
      if (clash) return ui.toast('Another active menu ("' + clash.name + '") already opens for this Fixed Q&A. Turn that one off first.', true);
    }

    if (on && row.is_welcome) {
      const clash = peers.find(m => m.id !== id && isOn(m) && m.is_welcome);
      if (clash) return ui.toast('Another active menu ("' + clash.name + '") is already your ' + CH[ch].label + ' welcome menu. Turn that one off first.', true);
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
        ui.toast(describeError(e, ch).text, true);
      }
    });
  }

  async function deleteMenu(btn) {
    const id = btn.dataset.id;
    const row = S.items.find(m => m.id === id);
    if (!row) return;
    const ch = chOf(row);

    const users = itemsOf(ch).filter(
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
        S.limitHit[ch] = false;
        renderBody();
        ui.toast('Menu deleted.');
      } catch (e) {
        console.error('[GLIME Quick Buttons] delete:', e);
        ui.toast(describeError(e, ch).text, true);
      }
    });
  }

  function moveItem(n, dir) {
    const items = S.draft.items;
    const to = n + dir;
    if (to < 0 || to >= items.length) return;
    [items[n], items[to]] = [items[to], items[n]];
    S.sel = to;
    renderBody();
  }

  /* ---------------------------------------------------------
     EVENTS
  --------------------------------------------------------- */
  function onClick(e) {
    const el = e.target.closest ? e.target.closest('[data-act]') : null;

    /* tapping a button or option inside the phone selects it */
    if (!el) {
      const pi = e.target.closest ? e.target.closest('[data-pi]') : null;
      if (pi && ROOT && ROOT.contains(pi) && S.draft) selectItem(Number(pi.dataset.pi));
      return;
    }
    if (!ROOT || !ROOT.contains(el)) return;
    const d = S.draft;

    switch (el.dataset.act) {
      case 'tab':
        if (!d && CH[el.dataset.v]) {
          S.channel = el.dataset.v;
          S.filter = 'all';
          S.search = '';
          renderBody();
        }
        break;
      case 'new':
        openNew();
        break;
      case 'edit':
        openEdit(el.dataset.id);
        break;
      case 'review':
        openReview(el.dataset.id);
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
        if (d && d.items.length < maxItems(d.channel, d.menu_type)) {
          d.items.push(newItem(d.menu_type));
          S.sel = d.items.length - 1;
          renderBody();
          focusItem(S.sel);
        }
        break;
      case 'del-item':
        if (d && d.items.length > 1) {
          const n = Number(el.dataset.i);
          d.items.splice(n, 1);
          S.sel = Math.min(n, d.items.length - 1);
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

  /* focusing a field of a button or option selects it */
  function onFocusIn(e) {
    if (!S.draft || !e.target || !e.target.closest) return;
    const pi = e.target.closest('[data-pi]');
    if (pi && ROOT && ROOT.contains(pi)) selectItem(Number(pi.dataset.pi));
  }

  /* typing: update the draft and the counter without redrawing the phone */
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

    if (t.matches('textarea.qb-ph-ta')) {
      t.style.height = 'auto';
      t.style.height = t.scrollHeight + 2 + 'px';
    }
    if (t.matches('.qb-ig-in')) t.size = Math.max(8, len(t.value) + 1);

    /* the chat below the menu shows the button name the customer taps */
    if (f === 'title') renderFlow();
  }

  /* dropdowns and the welcome checkbox change the shape of the form, so redraw it */
  function onChange(e) {
    const t = e.target;
    if (!S.draft || !t || !t.dataset || !t.dataset.change) return;
    const d = S.draft;
    const f = t.dataset.f;

    if (t.dataset.i !== undefined) {
      d.items[Number(t.dataset.i)][f] = t.value;
    } else if (f === 'is_welcome') {
      d.is_welcome = !!t.checked;
      if (d.is_welcome) d.trigger_qa_id = '';
    } else {
      d[f] = t.value;
      if (f === 'menu_type') {
        const acts = allowedActions(d.menu_type);
        d.items.forEach(i => {
          if (!acts.includes(i.action)) i.action = acts[0];
        });
        const max = maxItems(d.channel, d.menu_type);
        if (d.menu_type === 'cta' && d.items.length > 1) {
          ui.toast('A link button menu has 1 button. Extra buttons were not kept.');
          d.items = d.items.slice(0, 1);
        } else if (d.menu_type === 'buttons' && d.items.length > max) {
          ui.toast(
            (d.channel === 'instagram' ? 'Quick replies' : 'Reply buttons') + ' allow up to ' + max + '. Remove ' + (d.items.length - max) + ' before saving.',
            true
          );
        }
        S.sel = Math.min(S.sel, d.items.length - 1);
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
      closeReview();

      container.innerHTML = '<div class="qb-root" id="qbRoot"></div>';
      ROOT = container.querySelector('#qbRoot');
      if (!ROOT) return;

      ROOT.addEventListener('click', onClick);
      ROOT.addEventListener('input', onInput);
      ROOT.addEventListener('change', onChange);
      ROOT.addEventListener('focusin', onFocusIn);

      /* a new render starts fresh so lists are never stale */
      S.ready = false;
      S.loading = false;
      S.unavailable = false;
      S.error = null;
      S.draft = null;
      S.sel = 0;
      S.scrollEditor = false;
      S.channel = 'whatsapp';
      S.filter = 'all';
      S.search = '';
      S.limitHit = { whatsapp: false, instagram: false };

      ROOT.innerHTML = shellHtml();
      await load();
    }
  });
})();
