(() => {
  'use strict';

  const URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  const RUNTIME = `${URL}/functions/v1/care-agent-ai-runtime`;

  const db = window.supabase.createClient(URL, KEY);

  const $ = id => document.getElementById(id);

  const esc = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[c]));

  function bubble(type, text, meta = '') {
    const d = document.createElement('div');

    d.className = 'bubble ' + type;

    d.innerHTML =
      esc(text).replace(/\n/g, '<br>') +
      (meta
        ? `<span class="meta">${esc(meta)}</span>`
        : '');

    $('messages').appendChild(d);

    $('messages').scrollTop =
      $('messages').scrollHeight;
  }

  /*
   * STEP 1
   * Check whether the GLIME user is logged in.
   */
  async function getSession() {

    const {
      data,
      error
    } = await db.auth.getSession();

    if (error) {
      throw error;
    }

    const s = data?.session;

    if (!s?.access_token) {

      $('badge').textContent =
        'Login required';

      throw new Error(
        'पहले GLIME Client Dashboard में login करें।'
      );
    }

    return s;
  }

  /*
   * STEP 2
   * Check CARE access from the same backend
   * used by the CARE Control Center.
   *
   * Admin CARE OFF => AI blocked
   * Admin CARE ON  => AI available
   */
  async function checkCareAccess() {

    const s = await getSession();

    const {
      data,
      error
    } = await db.rpc(
      'care_dashboard_snapshot'
    );

    if (error) {
      throw error;
    }

    const status =
      String(
        data?.profile?.status || ''
      ).toLowerCase();

    if (status !== 'active') {

      $('badge').textContent =
        'CARE not enabled';

      throw new Error(
        'GLIME CARE इस account के लिए enabled नहीं है। Admin से CARE Access enable करवाएँ।'
      );
    }

    const displayName =
      data?.profile?.display_name ||
      'Family';

    $('badge').textContent =
      `CARE Active · ${displayName}`;

    $('send').disabled = false;

    return s;
  }

  /*
   * STEP 3
   * Initial page startup.
   */
  async function initialize() {

    $('send').disabled = true;

    $('status').textContent =
      'CARE access check हो रहा है…';

    try {

      await checkCareAccess();

      $('status').textContent =
        'CARE AI तैयार है। अपना सवाल भेजें।';

    } catch (err) {

      console.error(
        'CARE initialization error:',
        err
      );

      $('status').textContent =
        err.message ||
        'CARE access check failed.';

      $('trace').textContent =
        err.stack ||
        String(err);
    }
  }

  /*
   * STEP 4
   * Send user request to CARE Agent Runtime.
   */
  $('form').addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      const text =
        $('input').value.trim();

      if (!text) {
        return;
      }

      const btn =
        $('send');

      btn.disabled = true;

      $('input').value = '';

      bubble(
        'user',
        text
      );

      $('status').textContent =
        'CARE runtime चल रहा है…';

      try {

        /*
         * Re-check CARE access before EVERY request.
         *
         * इससे अगर Admin ने CARE बीच में disable कर दिया,
         * तो अगली request नहीं जाएगी।
         */
        const s =
          await checkCareAccess();

        const r =
          await fetch(
            RUNTIME,
            {
              method: 'POST',

              headers: {

                Authorization:
                  `Bearer ${s.access_token}`,

                apikey:
                  KEY,

                'Content-Type':
                  'application/json'
              },

              body: JSON.stringify({

                user_input:
                  text,

                request_type:
                  'chat',

                limit:
                  10
              })
            }
          );

        const d =
          await r.json()
            .catch(() => ({}));

        /*
         * Full runtime response
         * debugging के लिए दिखाएँ।
         */
        $('trace').textContent =
          JSON.stringify(
            d,
            null,
            2
          );

        if (!r.ok) {

          throw new Error(
            d.message ||
            d.error ||
            `Runtime HTTP ${r.status}`
          );
        }

        const o =
          d.agent_output ||
          {};

        /*
         * AI response
         */
        bubble(

          'ai',

          o.response ||
          'CARE ने response नहीं लौटाया।',

          `Agent: ${
            d.agent_key ||
            'unknown'
          } · ` +

          `Intent: ${
            o.intent ||
            'unknown'
          } · ` +

          `Next: ${
            d.next_step ||
            d.pipeline?.next_step ||
            'respond_to_user'
          }`

        );

        $('status').textContent =
          'Response received. External execution अभी disabled है।';

      } catch (err) {

        console.error(
          'CARE AI request error:',
          err
        );

        $('trace').textContent =
          err.stack ||
          String(err);

        bubble(
          'ai',
          'Test error: ' +
          (
            err.message ||
            String(err)
          )
        );

        $('status').textContent =
          'Request failed — Runtime Trace देखें।';

      } finally {

        /*
         * Button को केवल तब enable करें
         * जब CARE अभी भी active हो।
         */
        try {

          await checkCareAccess();

        } catch (_) {

          $('send').disabled =
            true;
        }
      }
    }
  );

  /*
   * Start application.
   */
  initialize();

})();
