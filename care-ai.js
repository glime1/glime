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

async function session() {

  const {
    data,
    error
  } = await db.auth.getSession();

  if (error)
    throw error;

  if (!data?.session?.access_token) {

    $('badge').textContent =
      'Login required';

    throw new Error(
      'पहले GLIME Client Dashboard में login करें।'
    );
  }

  $('badge').textContent =
    'Logged in · ' +
    (data.session.user.email || 'GLIME user');

  return data.session;
}

$('form').addEventListener(
  'submit',
  async e => {

    e.preventDefault();

    const text =
      $('input').value.trim();

    if (!text)
      return;

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

      const s =
        await session();

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
        d.agent_output || {};

      bubble(

        'ai',

        o.response ||
        'CARE ने response नहीं लौटाया।',

        `Agent: ${d.agent_key || 'unknown'} · ` +
        `Intent: ${o.intent || 'unknown'} · ` +
        `Next: ${
          d.next_step ||
          d.pipeline?.next_step ||
          'respond_to_user'
        }`

      );

      $('status').textContent =
        'Response received. External execution अभी disabled है।';

    } catch (err) {

      $('trace').textContent =
        err.stack ||
        String(err);

      bubble(
        'ai',
        'Test error: ' +
        err.message
      );

      $('status').textContent =
        'Request failed — Runtime Trace देखें।';

    } finally {

      btn.disabled = false;

    }

  }
);

session()
  .catch(
    e =>
      $('status').textContent =
        e.message
  );

})();,
