(() => {
  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  const MODULE_SLUG = 'instagram_ai_sales_agent';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const $ = id => document.getElementById(id);

  function message(text) {
    const el = $('pageMessage');

    if (!el) return;

    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
  }

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

  async function getClient() {
    const { data: auth, error: authError } =
      await supabase.auth.getSession();

    if (authError) {
      throw authError;
    }

    const user = auth?.session?.user;

    if (!user) {
      location.replace('login.html');
      return null;
    }

    let { data, error } = await supabase
      .from('client_data')
      .select(
        'id,client_id,auth_user_id,email,client_name,full_name,name'
      )
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    /*
     * Fallback:
     * If auth_user_id is not linked yet, find the client
     * using the authenticated user's email.
     */
    if (!data && user.email) {
      const result = await supabase
        .from('client_data')
        .select(
          'id,client_id,auth_user_id,email,client_name,full_name,name'
        )
        .ilike('email', user.email.trim().toLowerCase())
        .order('created_at', {
          ascending: false
        })
        .limit(1)
        .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      data = result.data;
    }

    return data;
  }

  async function load() {
    try {
      const client = await getClient();

      if (!client) {
        return;
      }

      if (!client.client_id) {
        throw new Error(
          'Client ID is not assigned to this account.'
        );
      }

      /*
       * Find the Instagram AI Sales Agent module.
       */
      const {
        data: module,
        error: moduleError
      } = await supabase
        .from('modules')
        .select('id,name,slug')
        .eq('slug', MODULE_SLUG)
        .maybeSingle();

      if (moduleError) {
        throw moduleError;
      }

      /*
       * Module has not yet been created by Admin.
       */
      if (!module) {
        setStatus(
          'Not configured',
          'GLIME Admin has not created this module yet.'
        );

        const lockedState = $('lockedState');

        if (lockedState) {
          lockedState.classList.remove('hidden');
        }

        return;
      }

      /*
       * Check whether this client has access to the module.
       */
      const {
        data: access,
        error: accessError
      } = await supabase
        .from('client_modules')
        .select(
          'enabled,status,visible_to_client,activated_at,expires_at,plan'
        )
        .eq('client_id', client.client_id)
        .eq('module_id', module.id)
        .maybeSingle();

      if (accessError) {
        throw accessError;
      }

      const visible =
        access?.visible_to_client === true;

      const active =
        access?.enabled === true &&
        (
          !access?.expires_at ||
          new Date(access.expires_at) > new Date()
        );

      /*
       * Module is completely unavailable.
       */
      if (!visible && !active) {
        setStatus(
          'Locked',
          'This module is not enabled for your account.'
        );

        const lockedState = $('lockedState');

        if (lockedState) {
          lockedState.classList.remove('hidden');
        }

        return;
      }

      /*
       * Module is visible but not activated.
       */
      if (!active) {
        setStatus(
          'Available',
          'The module is visible but has not been activated.'
        );

        const lockedState = $('lockedState');

        if (lockedState) {
          lockedState.classList.remove('hidden');
        }

        return;
      }

      /*
       * Module is active.
       */
      setStatus(
        'Active',
        'Your GLIME AI Sales Agent module is enabled.'
      );

      const agentState = $('agentState');

      if (agentState) {
        agentState.classList.remove('hidden');
      }

      /*
       * Load the client's existing Lookbook.
       *
       * The Instagram AI Sales Agent will eventually
       * use this existing catalogue as its product source.
       */
      const {
        data: lookbook,
        error: lookbookError
      } = await supabase
        .from('lookbooks')
        .select('id,name,enabled')
        .eq('client_id', client.client_id)
        .eq('enabled', true)
        .order('created_at', {
          ascending: true
        })
        .limit(1)
        .maybeSingle();

      if (lookbookError) {
        throw lookbookError;
      }

      /*
       * No active catalogue.
       */
      if (!lookbook) {
        const catalogueStatus = $('catalogueStatus');
        const productCount = $('productCount');

        if (catalogueStatus) {
          catalogueStatus.textContent =
            'No active Lookbook';
        }

        if (productCount) {
          productCount.textContent = '0';
        }

        return;
      }

      /*
       * Count published products from the existing Lookbook.
       */
      const {
        count,
        error: countError
      } = await supabase
        .from('lookbook_items')
        .select('id', {
          count: 'exact',
          head: true
        })
        .eq('client_id', client.client_id)
        .eq('lookbook_id', lookbook.id)
        .eq('published', true);

      if (countError) {
        throw countError;
      }

      const catalogueStatus = $('catalogueStatus');
      const productCount = $('productCount');

      if (catalogueStatus) {
        catalogueStatus.textContent =
          lookbook.name || 'Lookbook ready';
      }

      if (productCount) {
        productCount.textContent =
          String(count || 0);
      }

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
        (err?.message || String(err))
      );
    }
  }

  /*
   * Temporary button handler.
   *
   * Actual Instagram / Meta connection will be implemented
   * in the next backend step.
   */
  const connectBtn = $('connectBtn');

  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      message(
        'Instagram/Meta connection will be added in the next implementation step.'
      );
    });
  }

  /*
   * Start module.
   */
  load();

})();
