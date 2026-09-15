(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/client-assistant`;

  const db =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

  const $ = (id) =>
    document.getElementById(id);

  const messages =
    $('messages');

  const form =
    $('chatForm');

  const input =
    $('messageInput');

  const send =
    $('sendBtn');

  const status =
    $('status');

  let history = [];


  /* =====================================================
     ADD MESSAGE
  ===================================================== */

  function addMessage(
    role,
    text
  ) {

    const row =
      document.createElement('div');

    row.className =
      `message ${role}`;


    const label =
      document.createElement('div');

    label.className =
      'message-label';

    label.textContent =
      role === 'user'
        ? 'YOU'
        : 'GLIME AI';


    const bubble =
      document.createElement('div');

    bubble.className =
      'bubble';

    bubble.textContent =
      text;


    row.appendChild(label);

    row.appendChild(bubble);

    messages.appendChild(row);


    messages.scrollTop =
      messages.scrollHeight;


    history.push({
      role,
      content: text
    });


    /*
     * Keep browser history small.
     * The actual authorization/data access
     * remains server-side.
     */

    if (history.length > 12) {

      history =
        history.slice(-12);

    }

  }


  /* =====================================================
     INITIALIZE AUTH
  ===================================================== */

  async function initialize() {

    try {

      const {
        data,
        error
      } =
        await db.auth.getSession();


      if (error) {

        throw error;

      }


      const session =
        data?.session;


      if (
        !session ||
        !session.user
      ) {

        window.location.href =
          'login.html';

        return;

      }


      const email =
        session.user.email || '';


      const clientName =
        $('clientName');


      if (clientName) {

        clientName.textContent =
          ` • ${email}`;

      }


    } catch (error) {

      console.error(
        'Client Assistant auth error:',
        error
      );

      status.textContent =
        'Login session verify नहीं हो सकी।';

    }

  }


  /* =====================================================
     SEND MESSAGE
  ===================================================== */

  form.addEventListener(
    'submit',
    async (event) => {

      event.preventDefault();


      const text =
        input.value.trim();


      if (!text) {

        return;

      }


      addMessage(
        'user',
        text
      );


      input.value = '';

      updateCharacterCount();


      send.disabled = true;


      status.textContent =
        'आपके business data को सुरक्षित रूप से check किया जा रहा है…';


      try {

        /*
         * Get current authenticated session.
         */

        const {
          data,
          error
        } =
          await db.auth.getSession();


        if (error) {

          throw error;

        }


        const session =
          data?.session;


        if (!session) {

          throw new Error(
            'Login required'
          );

        }


        /*
         * IMPORTANT:
         *
         * client_id is NOT sent from the
         * browser.
         *
         * The Edge Function receives the
         * authenticated JWT and resolves
         * the correct client itself.
         */

        const response =
          await fetch(
            FUNCTION_URL,
            {
              method: 'POST',

              headers: {

                'Content-Type':
                  'application/json',

                'Authorization':
                  `Bearer ${session.access_token}`

              },

              body:
                JSON.stringify({

                  message:
                    text,

                  history:
                    history

                })

            }
          );


        const result =
          await response.json();


        if (!response.ok) {

          throw new Error(
            result?.error ||
            'Assistant unavailable'
          );

        }


        addMessage(
          'assistant',
          result?.answer ||
          'कोई उत्तर नहीं मिला।'
        );


        status.textContent =
          '';


      } catch (error) {

        console.error(
          'Client Assistant error:',
          error
        );


        addMessage(
          'assistant',
          error?.message ||
          'अभी assistant उपलब्ध नहीं है।'
        );


        status.textContent =
          '';

      } finally {

        send.disabled =
          false;

        input.focus();

      }

    }
  );


  /* =====================================================
     CLEAR CHAT
  ===================================================== */

  $('clearBtn')
    ?.addEventListener(
      'click',
      () => {

        history = [];

        messages.innerHTML = '';

        addMessage(
          'assistant',
          'चैट साफ हो गई। अब अपना business सवाल पूछें।'
        );

        status.textContent =
          '';

      }
    );


  /* =====================================================
     QUICK SUGGESTIONS
  ===================================================== */

  document
    .querySelectorAll(
      '[data-prompt]'
    )
    .forEach(
      (button) => {

        button.addEventListener(
          'click',
          () => {

            input.value =
              button.dataset.prompt ||
              '';

            updateCharacterCount();

            input.focus();

          }
        );

      }
    );


  /* =====================================================
     CHARACTER COUNT
  ===================================================== */

  function updateCharacterCount() {

    const counter =
      $('charCount');


    if (!counter) {

      return;

    }


    counter.textContent =
      `${input.value.length} / 2000`;

  }


  input.addEventListener(
    'input',
    updateCharacterCount
  );


  /* =====================================================
     ENTER / MOBILE BEHAVIOUR
  ===================================================== */

  input.addEventListener(
    'keydown',
    (event) => {

      /*
       * Desktop:
       * Enter sends message.
       *
       * Shift + Enter:
       * new line.
       */

      if (
        event.key === 'Enter' &&
        !event.shiftKey
      ) {

        event.preventDefault();

        form.requestSubmit();

      }

    }
  );


  /* =====================================================
     START
  ===================================================== */

  updateCharacterCount();

  initialize();

})();
