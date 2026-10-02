/* GLIME Admin Website Analytics — Phase 2 */
(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  function ready() {
    return (
      window.supabase &&
      document.getElementById('view-overview')
    );
  }

  function addStyles() {
    if (document.getElementById('glimeAnalyticsStyles')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'glimeAnalyticsStyles';

    style.textContent = `
      #glimeWebAnalytics {
        margin-top: 14px;
      }

      #glimeWebAnalytics .wa-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }

      #glimeWebAnalytics .wa-head h3 {
        margin: 0;
      }

      #glimeWebAnalytics .wa-grid {
        display: grid;
        grid-template-columns:
          repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      #glimeWebAnalytics .wa-pages {
        margin-top: 12px;
        overflow: auto;
      }

      #glimeWebAnalytics .wa-status {
        color: var(--muted);
        font-size: 12px;
      }

      @media (max-width: 900px) {
        #glimeWebAnalytics .wa-grid {
          grid-template-columns:
            repeat(2, 1fr);
        }
      }

      @media (max-width: 600px) {
        #glimeWebAnalytics .wa-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function addPanel() {
    if (document.getElementById('glimeWebAnalytics')) {
      return;
    }

    const overview =
      document.getElementById('view-overview');

    if (!overview) {
      return;
    }

    const panel = document.createElement('div');

    panel.className = 'card';
    panel.id = 'glimeWebAnalytics';

    panel.innerHTML = `
      <div class="wa-head">
        <div>
          <h3>
            Website Analytics — Last 24 Hours
          </h3>

          <div
            class="wa-status"
            id="waStatus"
          >
            Loading...
          </div>
        </div>

        <button
          class="btn"
          id="waRefresh"
        >
          ↻ Refresh
        </button>
      </div>

      <div class="wa-grid">

        <div class="card metric">
          <small>Visitors</small>
          <strong id="waVisitors">0</strong>
        </div>

        <div class="card metric">
          <small>Sessions</small>
          <strong id="waSessions">0</strong>
        </div>

        <div class="card metric">
          <small>Online Now</small>
          <strong id="waOnline">0</strong>
        </div>

        <div class="card metric">
          <small>Page Views</small>
          <strong id="waPageViews">0</strong>
        </div>

      </div>

      <div class="wa-pages">

        <h4>Top Pages</h4>

        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Views</th>
            </tr>
          </thead>

          <tbody id="waPages">
            <tr>
              <td
                colspan="2"
                class="sub"
              >
                Loading...
              </td>
            </tr>
          </tbody>
        </table>

      </div>
    `;

    overview.appendChild(panel);

    document.getElementById(
      'waRefresh'
    ).onclick = load;
  }

  function number(value) {
    return Number(
      value || 0
    ).toLocaleString('en-IN');
  }

  async function load() {
    const status =
      document.getElementById('waStatus');

    if (
      !status ||
      !window.supabase
    ) {
      return;
    }

    status.textContent =
      'Loading...';

    try {
      const sb =
        window.supabase.createClient(
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

      const aal =
        await sb.auth
          .mfa
          .getAuthenticatorAssuranceLevel();

      if (
        aal.error ||
        aal.data?.currentLevel !== 'aal2'
      ) {
        status.textContent =
          'Admin 2FA required.';

        return;
      }

      const result =
        await sb.rpc(
          'website_analytics_admin_summary'
        );

      if (result.error) {
        throw result.error;
      }

      const data =
        result.data || {};

      const pages =
        Array.isArray(data.pages)
          ? data.pages
          : [];

      document.getElementById(
        'waVisitors'
      ).textContent =
        number(data.visitors_24h);

      document.getElementById(
        'waSessions'
      ).textContent =
        number(data.sessions_24h);

      document.getElementById(
        'waOnline'
      ).textContent =
        number(data.online_now);

      document.getElementById(
        'waPageViews'
      ).textContent =
        number(data.page_views_24h);

      document.getElementById(
        'waPages'
      ).innerHTML =
        pages.length
          ? pages
              .slice(0, 20)
              .map(page => `
                <tr>
                  <td>
                    ${escapeHtml(
                      page.page || '/'
                    )}
                  </td>

                  <td>
                    ${number(
                      page.views
                    )}
                  </td>
                </tr>
              `)
              .join('')

          : `
            <tr>
              <td
                colspan="2"
                class="sub"
              >
                No page views yet.
              </td>
            </tr>
          `;

      status.textContent =
        'Updated ' +
        new Date()
          .toLocaleTimeString('en-IN');

    } catch (error) {

      console.error(
        'GLIME website analytics:',
        error
      );

      status.textContent =
        'Analytics could not be loaded: ' +
        (
          error.message ||
          'Unknown error'
        );
    }
  }

  function escapeHtml(value) {
    return String(
      value ?? ''
    ).replace(
      /[&<>"']/g,
      function (character) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character];
      }
    );
  }

  function init() {
    if (!ready()) {
      return;
    }

    addStyles();
    addPanel();
    load();
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }

})();
