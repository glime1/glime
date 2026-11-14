/* =========================================================
   GLIME — SERVICES FAST NAVIGATION ADDON
   ---------------------------------------------------------
   Problem:
   "Continue" waited for the whole save (offer, version, price,
   variants, availability, media, then a full catalog reload)
   before moving to the next step. The button looked frozen for
   2-3 seconds, people tapped it again, and the taps then fired
   together.

   Fix:
   - Continue moves to the next step immediately.
   - The draft save runs in the background, one save at a time
     (a queue), so repeated taps can never run two saves at once
     or create a duplicate service.
   - If a background save fails, the wizard returns to the step
     that failed and shows the error.
   - The full catalog reload after each step is skipped while the
     wizard is open and done once when it closes.
   - Media upload is locked only while the Step 3 -> 4 save runs,
     so the saved media list cannot be overwritten.
   - Save draft and Publish wait for any pending background save.

   Load order: LAST, after every other services-*.js file.
   No backend changes.
========================================================= */
(function () {
  'use strict';

  if (typeof state === 'undefined' || typeof supabaseClient === 'undefined') {
    console.error('[GLIME FAST NAV] Core services context is unavailable.');
    return;
  }

  var byId = function (id) { return document.getElementById(id); };

  var chain = Promise.resolve(true);
  var quiet = false;
  var dirty = false;
  var mediaLocks = 0;

  /* ---------- serialized draft save ---------- */

  function runSave(silent, step, isQuiet) {
    var task = async function () {
      quiet = !!isQuiet;

      var realStep = state.step;

      try {
        var pending;

        /* saveDraft validates state.step synchronously before its first
           await. The wizard may already be on the next step, so validate
           the step the person just left. */
        try {
          if (step) state.step = step;
          pending = saveDraft(silent);
        } finally {
          state.step = realStep;
        }

        return await pending;
      } catch (e) {
        console.error(e);
        return false;
      } finally {
        quiet = false;
      }
    };

    chain = chain.then(task, task);
    return chain;
  }

  /* ---------- skip per-step catalog reload while the wizard is open ---------- */

  var baseLoadServices = loadServices;

  loadServices = function () {
    if (quiet) {
      dirty = true;
      return Promise.resolve();
    }

    dirty = false;
    return baseLoadServices.apply(this, arguments);
  };

  var baseRenderAll = renderAll;

  renderAll = function () {
    if (quiet) return undefined;
    return baseRenderAll.apply(this, arguments);
  };

  function refreshIfDirty() {
    if (!dirty) return undefined;

    return loadServices()
      .then(function () { return renderAll(); })
      .catch(function (e) { console.warn('[GLIME FAST NAV] catalog refresh failed:', e); });
  }

  var baseCloseWizard = closeWizard;

  closeWizard = function () {
    var result = baseCloseWizard.apply(this, arguments);
    chain.then(refreshIfDirty);
    return result;
  };

  /* A new wizard must not open while an old save is still running. */
  var baseOpenWizard = openWizard;

  openWizard = async function () {
    await chain;
    return baseOpenWizard.apply(this, arguments);
  };

  /* ---------- media lock (only while Step 3 -> 4 is saving) ---------- */

  function lockMedia(on) {
    mediaLocks = Math.max(0, mediaLocks + (on ? 1 : -1));

    var locked = mediaLocks > 0;

    ['chooseMediaBtn', 'uploadZone'].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.style.pointerEvents = locked ? 'none' : '';
      el.style.opacity = locked ? '.55' : '';
    });
  }

  /* ---------- buttons ---------- */

  function onNext() {
    var err = validateStep(state.step);

    if (err) {
      showAlert(err);
      return;
    }

    if (state.step >= 5) return;

    showAlert('');

    var from = state.step;

    setStep(from + 1);

    if (from === 3) lockMedia(true);

    runSave(true, from, true).then(function (ok) {
      if (from === 3) lockMedia(false);

      if (!ok && state.step === from + 1) {
        setStep(from);
      }
    });
  }

  function onSaveDraft() {
    runSave(false, 0, false);
  }

  function onPublish() {
    chain
      .then(function () { return submitPublish(); })
      .catch(function (e) { console.error(e); });
  }

  /* Capture phase on the wizard: the original click handlers on these
     buttons never run, so nothing can save twice. */
  var overlay = byId('wizardOverlay');

  if (overlay) {
    overlay.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('#nextStep, #saveDraftBtn, #publishBtn');
      if (!btn) return;

      e.stopPropagation();
      e.preventDefault();

      if (btn.id === 'nextStep') onNext();
      else if (btn.id === 'saveDraftBtn') onSaveDraft();
      else onPublish();
    }, true);
  }

  console.log('[GLIME FAST NAV] Fast navigation addon loaded.');
})();
