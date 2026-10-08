/* GLIME Client Assistant — extension layer.
 *
 * This file is ONLY a registration helper. The central runtime
 * (client-assistant.js) owns conversation, proposal, approval and execution.
 * Nothing here may:
 *   - patch fetch or any global,
 *   - create another approval/proposal path,
 *   - mutate business data or run SQL,
 *   - contain provider/channel specific business logic.
 *
 * Usage (future specialists):
 *   GlimeAssistantAddon.register({
 *     uiActions: { my_type: (action, ctx) => HTMLElement | null },
 *     onMessage: (messageElement, message) => {}
 *   });
 * ctx = { navigate(target), toast(text) }; navigation targets are allowlisted centrally.
 */
(() => {
  'use strict';

  const pending = [];

  function isValidSpec(spec) {
    return !!spec && typeof spec === 'object' && !Array.isArray(spec);
  }

  function flush() {
    const api = window.GlimeAssistant;
    if (!api || typeof api.extend !== 'function') return;
    while (pending.length) api.extend(pending.shift());
  }

  function register(spec) {
    if (!isValidSpec(spec)) return false;
    pending.push(spec);
    flush();
    return true;
  }

  document.addEventListener('glime-assistant-ready', flush, { once: true });

  window.GlimeAssistantAddon = Object.freeze({ register });
  flush();
})();
