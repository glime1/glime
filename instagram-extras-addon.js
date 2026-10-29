/* =========================================================
   GLIME — Instagram Sales extras (frontend only)
   ---------------------------------------------------------
   1. Light / dark button inside the mobile menu drawer (the drawer is
      built by instagram-mobile-ui-addon.js; the desktop button is a
      data-gtheme-slot in the page sidebar).
   2. "Lead details" card: name, stage, mobile and city of the lead that
      belongs to the open conversation, plus the details the AI captured
      (occasion, quantity, date ...). Read only; it never writes data.
========================================================= */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  const $ = id => document.getElementById(id);
  const clean = value => String(value ?? '').trim();

  /* ---------- 1. theme button in the mobile drawer ---------- */
  function addDrawerToggle() {
    const bottom = document.querySelector('#glime-instagram-mobile-menu-v2 .ig-drawer-bottom');
    if (!bottom) return false;
    if (!bottom.querySelector('[data-gtheme-slot]')) {
      const slot = document.createElement('div');
      slot.className = 'gtheme-slot ig-drawer-theme';
      slot.setAttribute('data-gtheme-slot', 'row');
      bottom.insertBefore(slot, bottom.firstChild);
    }
    if (window.GlimeTheme && typeof window.GlimeTheme.scan === 'function') window.GlimeTheme.scan();
    return true;
  }

  let drawerTries = 0;
  const drawerTimer = setInterval(() => {
    drawerTries++;
    if (addDrawerToggle() || drawerTries > 40) clearInterval(drawerTimer);
  }, 250);

  /* ---------- 2. lead details ---------- */
  const db = window.supabase && typeof window.supabase.createClient === 'function'
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  let seq = 0;
  let timer = null;

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = clean(value) || '—';
  }

  function reset() {
    ['igLeadName', 'igLeadStage', 'igLeadMobile', 'igLeadCity'].forEach(id => setText(id, ''));
    const wrap = $('igLeadNotesWrap');
    if (wrap) wrap.hidden = true;
  }

  function activeId() {
    const el = document.querySelector('.conversation-item.active');
    return el ? clean(el.dataset.id) : '';
  }

  function clientId() {
    const value = clean($('clientId') && $('clientId').textContent);
    return !value || /^loading/i.test(value) ? '' : value;
  }

  function stageLabel(value) {
    const s = clean(value).replace(/_/g, ' ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  async function refresh() {
    const mine = ++seq;
    const id = activeId();
    const cid = clientId();
    if (!db || !id || !cid) { reset(); return; }

    try {
      const conv = await db.from('instagram_conversations')
        .select('lead_id,instagram_user_id').eq('id', id).eq('client_id', cid).maybeSingle();
      if (conv.error) throw conv.error;

      let lead = null;
      if (conv.data && conv.data.lead_id) {
        const r = await db.from('leads').select('*')
          .eq('id', conv.data.lead_id).eq('client_id', cid).maybeSingle();
        if (!r.error) lead = r.data;
      }
      if (!lead && conv.data && conv.data.instagram_user_id) {
        const r = await db.from('leads').select('*')
          .eq('client_id', cid).eq('instagram_user_id', conv.data.instagram_user_id)
          .order('updated_at', { ascending: false }).limit(1).maybeSingle();
        if (!r.error) lead = r.data;
      }

      /* the person may have opened another chat while this was loading */
      if (mine !== seq || id !== activeId()) return;
      if (!lead) { reset(); return; }

      setText('igLeadName', lead.name);
      setText('igLeadStage', stageLabel(lead.status));
      setText('igLeadMobile', lead.mobile || lead.whatsapp);
      setText('igLeadCity', lead.city_area);

      const notes = clean(lead.notes);
      const wrap = $('igLeadNotesWrap');
      const pre = $('igLeadNotes');
      if (wrap && pre) {
        pre.textContent = notes.slice(-1200);
        wrap.hidden = !notes;
      }
    } catch (error) {
      console.warn('[GLIME IG extras]', error);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 250);
  }

  /* The page rewrites these when a chat is opened and after the AI saves a lead. */
  ['budget', 'interest', 'ctxInstagramId'].forEach(id => {
    const el = $(id);
    if (el && window.MutationObserver) {
      new MutationObserver(schedule).observe(el, { childList: true, characterData: true, subtree: true });
    }
  });

  reset();
})();
