(() => {
  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const MODULE_SLUG = 'instagram_ai_sales_agent';

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  const $ = (id) => document.getElementById(id);

  /* ---------------------------------
     MESSAGE
  --------------------------------- */

  function message(text, type = '') {
    const el = $('pageMessage');

    if (!el) return;

    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
    el.dataset.type = type;
  }

  /* ---------------------------------
     AGENT STATUS
  --------------------------------- */

  function setStatus(text, hint) {
    const status = $('agentStatus');
    const statusHint = $('statusHint');

    if (status) {
      status.textContent = text;
    }

    if (statusHint) {
      statusHint.textContent = hint;
    }
  }

  /* ---------------------------------
     INSTAGRAM STATUS
  --------------------------------- */

  function setInstagramStatus(text) {
    const el = $('instagramStatus');

    if (el) {
      el.textContent = text;
    }
  }

  /* ---------------------------------
     CONNECT BUTTON
  --------------------------------- */

  function setConnectButton(text, disabled = false) {
    const button = $('connectBtn');

    if (!button) return;

    button.textContent = text;
    button.disabled = disabled;
  }

  /* ---------------------------------
     CLEAN OAUTH QUERY
  --------------------------------- */

  function cleanOAuthQuery() {
    const url = new URL(window.location.href);

    [
      'instagram_connected',
      'instagram_username',
      'instagram_error'
    ].forEach((key) => {
      url.searchParams.delete(key);
    });

    window.history.replaceState(
      {},
      document.title,
      url.pathname + url.search + url.hash
    );
  }

  /* ---------------------------------
     HANDLE OAUTH RESULT
  --------------------------------- */

  function handleOAuthResult() {
    const params = new URLSearchParams(
      window.location.search
    );

    const connected =
      params.get('instagram_connected') === '1';

    const username =
      params.get('instagram_username');

    const error =
      params.get('instagram_error');

    if (connected) {
      message(
        username
          ? `Instagram @${username} successfully connected to GLIME.`
          : 'Instagram successfully connected to GLIME.',
        'success'
      );

      if (username) {
        setInstagramStatus(`@${username}`);
      } else {
        setInstagramStatus('Connected');
      }

      setConnectButton(
        'Reconnect Instagram',
        false
      );
    }

    if (error) {
      message(
        `Instagram connection failed: ${error}`,
        'error'
      );

      setInstagramStatus('Not connected');
      setConnectButton(
        'Connect Instagram',
        false
      );
    }

    if (connected || error) {
      cleanOAuthQuery();
    }
  }

  /* ---------------------------------
     GET AUTHENTICATED CLIENT
  --------------------------------- */

  async function getClient() {
    const {
      data: auth,
      error: authError
    } = await supabase.auth.getSession();

    if (authError) {
      throw authError;
    }

    const user =
      auth?.session?.user;

    if (!user) {
      location.replace('login.html');
      return null;
    }

    let {
      data,
      error
    } = await supabase
      .from('client_data')
      .select(
        'id,client_id,auth_user_id,email,client_name,full_name,name'
      )
      .eq(
        'auth_user_id',
        user.id
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    /*
     * Fallback:
     * If auth_user_id is not linked,
     * find client by email.
     */

    if (!data && user.email) {
      const result =
        await supabase
          .from('client_data')
          .select(
            'id,client_id,auth_user_id,email,client_name,full_name,name'
          )
          .ilike(
            'email',
            user.email.trim().toLowerCase()
          )
          .order(
            'created_at',
            {
              ascending: false
            }
          )
          .limit(1)
          .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      data = result.data;
    }

    return data;
  }

  /* ---------------------------------
     LOAD INSTAGRAM CONNECTION STATUS
  --------------------------------- */

  async function loadInstagramConnection() {
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke(
        'instagram-connection-status',
        {
          body: {}
        }
      );

      if (error) {
        throw error;
      }

      /*
       * Not connected
       */

      if (!data?.connected) {

        if (data?.expired) {
          setInstagramStatus(
            'Connection expired'
          );
        } else {
          setInstagramStatus(
            'Not connected'
          );
        }

        setConnectButton(
          'Connect Instagram',
          false
        );

        return;
      }

      /*
       * Connected
       */

      const username =
        data.username
          ? `@${data.username}`
          : 'Connected';

      setInstagramStatus(
        username
      );

      setConnectButton(
        'Reconnect Instagram',
        false
      );

    } catch (error) {

      console.error(
        'GLIME Instagram connection status error:',
        error
      );

      /*
       * Status API failure should not
       * break the entire dashboard.
       */

      setInstagramStatus(
        'Not connected'
      );

      setConnectButton(
        'Connect Instagram',
        false
      );
    }
  }

  /* ---------------------------------
     START INSTAGRAM OAUTH
  --------------------------------- */

  async function connectInstagram() {

    try {

      message(
        'Instagram connection शुरू हो रही है…'
      );

      setConnectButton(
        'Connecting…',
        true
      );

      /*
       * Ask Supabase Edge Function
       * to create the secure OAuth flow.
       */

      const {
        data,
        error
      } = await supabase.functions.invoke(
        'instagram-oauth-start',
        {
          body: {}
        }
      );

      if (error) {
        throw error;
      }

      /*
       * OAuth URL must come
       * from backend.
       */

      if (!data?.url) {
        throw new Error(
          'GLIME did not receive an Instagram authorization URL.'
        );
      }

      /*
       * Redirect client to Meta /
       * Instagram authorization page.
       */

      window.location.href =
        data.url;

    } catch (error) {

      console.error(
        'GLIME Instagram OAuth start error:',
        error
      );

      setConnectButton(
        'Connect Instagram',
        false
      );

      message(
        error?.message ||
        'Instagram connection शुरू नहीं हो सकी।',
        'error'
      );
    }
  }

  /* ---------------------------------
     LOAD PAGE
  --------------------------------- */

  async function load() {

    /*
     * Check OAuth result first.
     */

    handleOAuthResult();

    try {

      const client =
        await getClient();

      if (!client) {
        return;
      }

      if (!client.client_id) {
        throw new Error(
          'Client ID is not assigned to this account.'
        );
      }

      /* ---------------------------------
         FIND MODULE
      --------------------------------- */

      const {
        data: module,
        error: moduleError
      } = await supabase
        .from('modules')
        .select(
          'id,name,slug'
        )
        .eq(
          'slug',
          MODULE_SLUG
        )
        .maybeSingle();

      if (moduleError) {
        throw moduleError;
      }

      /*
       * Module does not exist.
       */

      if (!module) {

        setStatus(
          'Not configured',
          'GLIME Admin has not created this module yet.'
        );

        $('lockedState')
          ?.classList
          .remove('hidden');

        return;
      }

      /* ---------------------------------
         CHECK CLIENT ACCESS
      --------------------------------- */

      const {
        data: access,
        error: accessError
      } = await supabase
        .from('client_modules')
        .select(
          'enabled,status,visible_to_client,activated_at,expires_at,plan'
        )
        .eq(
          'client_id',
          client.client_id
        )
        .eq(
          'module_id',
          module.id
        )
        .maybeSingle();

      if (accessError) {
        throw accessError;
      }

      const visible =
        access?.visible_to_client === true;

      const active =
        access?.enabled === true &&
        (
          access?.status === 'active' ||
          access?.status === 'trial'
        ) &&
        (
          !access?.expires_at ||
          new Date(access.expires_at) >
          new Date()
        );

      /* ---------------------------------
         LOCKED
      --------------------------------- */

      if (!visible && !active) {

        setStatus(
          'Locked',
          'This module is not enabled for your account.'
        );

        $('lockedState')
          ?.classList
          .remove('hidden');

        return;
      }

      /* ---------------------------------
         VISIBLE BUT NOT ACTIVE
      --------------------------------- */

      if (!active) {

        setStatus(
          'Available',
          'The module is visible but has not been activated.'
        );

        $('lockedState')
          ?.classList
          .remove('hidden');

        return;
      }

      /* ---------------------------------
         ACTIVE
      --------------------------------- */

      setStatus(
        'Active',
        'Your GLIME AI Sales Agent module is enabled.'
      );

      $('agentState')
        ?.classList
        .remove('hidden');

      /* ---------------------------------
         LOAD LOOKBOOK
      --------------------------------- */

      const {
        data: lookbook,
        error: lookbookError
      } = await supabase
        .from('lookbooks')
        .select(
          'id,name,enabled'
        )
        .eq(
          'client_id',
          client.client_id
        )
        .eq(
          'enabled',
          true
        )
        .order(
          'created_at',
          {
            ascending: true
          }
        )
        .limit(1)
        .maybeSingle();

      if (lookbookError) {
        throw lookbookError;
      }

      /* ---------------------------------
         NO LOOKBOOK
      --------------------------------- */

      if (!lookbook) {

        if ($('catalogueStatus')) {
          $('catalogueStatus').textContent =
            'No active Lookbook';
        }

        if ($('productCount')) {
          $('productCount').textContent =
            '0';
        }

      } else {

        /* ---------------------------------
           COUNT PUBLISHED PRODUCTS
        --------------------------------- */

        const {
          count,
          error: countError
        } = await supabase
          .from('lookbook_items')
          .select(
            'id',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'client_id',
            client.client_id
          )
          .eq(
            'lookbook_id',
            lookbook.id
          )
          .eq(
            'published',
            true
          );

        if (countError) {
          throw countError;
        }

        if ($('catalogueStatus')) {
          $('catalogueStatus').textContent =
            lookbook.name ||
            'Lookbook ready';
        }

        if ($('productCount')) {
          $('productCount').textContent =
            String(count || 0);
        }
      }

      /* ---------------------------------
         LOAD INSTAGRAM STATUS
      --------------------------------- */

      await loadInstagramConnection();

    } catch (err) {

      console.error(
        'GLIME Instagram AI Sales Agent error:',
        err
      );

      setStatus(
        'Error',
        'Could not load module information.'
      );

      message(
        'Unable to load AI Sales Agent: ' +
        (err?.message || String(err)),
        'error'
      );
    }
  }

  /* ---------------------------------
     BUTTON
  --------------------------------- */

  const connectBtn =
    $('connectBtn');

  if (connectBtn) {

    connectBtn.addEventListener(
      'click',
      connectInstagram
    );

  }

  /* ---------------------------------
     START
  --------------------------------- */

  load();

})();
