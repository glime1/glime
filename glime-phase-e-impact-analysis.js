(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const supabaseClient =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

  const CARD_ID =
    'glime-phase-e-impact-analysis';


  // =====================================================
  // HELPERS
  // =====================================================

  function esc(value) {
    return String(value ?? '')
      .replace(/[&<>"']/g, function (char) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        }[char];
      });
  }


  function formatNumber(value) {
    return new Intl.NumberFormat('en-IN')
      .format(Number(value || 0));
  }


  function formatPercent(value) {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return '—';
    }

    const number = Number(value);

    return (
      (number > 0 ? '+' : '') +
      number.toFixed(1) +
      '%'
    );
  }


  function formatDate(value) {
    if (!value) return '—';

    try {
      return new Date(value)
        .toLocaleString('en-IN');
    } catch {
      return String(value);
    }
  }


  // =====================================================
  // CLIENT
  // =====================================================

  async function getClientId() {

    const {
      data: { user },
      error: authError
    } =
      await supabaseClient.auth.getUser();

    if (authError || !user) {
      return null;
    }


    const {
      data,
      error
    } =
      await supabaseClient
        .from('client_data')
        .select('client_id')
        .eq(
          'auth_user_id',
          user.id
        )
        .maybeSingle();


    if (error) {
      throw error;
    }


    return data?.client_id || null;
  }


  // =====================================================
  // LOAD IMPACT DATA
  // =====================================================

  async function loadImpact() {

    const clientId =
      await getClientId();


    if (!clientId) {
      return [];
    }


    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          'client_action_impact_analysis'
        )
        .select(`
          id,
          execution_job_id,
          impact_status,
          baseline_metrics,
          after_metrics,
          metric_deltas,
          summary,
          measured_at,
          created_at
        `)
        .eq(
          'client_id',
          clientId
        )
        .order(
          'measured_at',
          {
            ascending: false
          }
        )
        .limit(5);


    if (error) {
      throw error;
    }


    return data || [];
  }


  // =====================================================
  // METRIC DELTA
  // =====================================================

  function getDelta(
    row,
    metricName
  ) {

    const delta =
      row.metric_deltas?.[
        metricName
      ] || {};


    return {

      delta:
        Number(
          delta.delta || 0
        ),

      percent:
        delta.percent_change

    };
  }


  // =====================================================
  // METRIC CARD
  // =====================================================

  function metricCard(
    label,
    metricName,
    row
  ) {

    const result =
      getDelta(
        row,
        metricName
      );


    return `
      <div class="gei-metric">

        <div class="gei-label">
          ${esc(label)}
        </div>

        <div class="gei-value">
          ${
            result.delta > 0
              ? '+'
              : ''
          }${formatNumber(
            result.delta
          )}
        </div>

        <div class="gei-pct">
          ${esc(
            formatPercent(
              result.percent
            )
          )}
        </div>

      </div>
    `;
  }


  // =====================================================
  // STYLES
  // =====================================================

  function injectStyles() {

    if (
      document.getElementById(
        'gei-style'
      )
    ) {
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'gei-style';


    style.textContent = `

      #${CARD_ID} {

        margin-bottom: 30px;

        background:
          var(--card-bg, #111827);

        border:
          1px solid
          rgba(0,255,136,.14);

        border-radius: 15px;

        padding: 26px;

        box-shadow:
          0 10px 30px
          rgba(0,0,0,.35);

      }


      #${CARD_ID} .gei-head {

        display: flex;

        justify-content:
          space-between;

        align-items:
          flex-start;

        gap: 16px;

        margin-bottom: 18px;

      }


      #${CARD_ID} .gei-title {

        color:
          var(--neon-green,#00ff88);

        font-size:
          1.18rem;

        font-weight:
          700;

      }


      #${CARD_ID} .gei-sub {

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .82rem;

        margin-top:
          5px;

        line-height:
          1.55;

      }


      #${CARD_ID} .gei-refresh {

        border:
          1px solid
          rgba(0,240,255,.25);

        background:
          rgba(0,240,255,.06);

        color:
          var(--cyan-blue,#00f0ff);

        border-radius:
          9px;

        padding:
          9px 12px;

        font-weight:
          700;

        cursor:
          pointer;

      }


      #${CARD_ID}
      .gei-refresh:disabled {

        opacity:
          .55;

        cursor:
          wait;

      }


      #${CARD_ID} .gei-list {

        display:
          grid;

        gap:
          12px;

      }


      #${CARD_ID} .gei-card {

        border:
          1px solid
          rgba(255,255,255,.07);

        background:
          rgba(255,255,255,.025);

        border-radius:
          12px;

        padding:
          16px;

      }


      #${CARD_ID} .gei-top {

        display:
          flex;

        justify-content:
          space-between;

        gap:
          12px;

        margin-bottom:
          12px;

      }


      #${CARD_ID} .gei-name {

        color:
          #fff;

        font-weight:
          700;

      }


      #${CARD_ID} .gei-date {

        color:
          #9ca3af;

        font-size:
          .72rem;

        margin-top:
          4px;

      }


      #${CARD_ID} .gei-badge {

        border-radius:
          999px;

        padding:
          5px 9px;

        font-size:
          .66rem;

        font-weight:
          800;

        background:
          rgba(0,255,136,.07);

        color:
          #00ff88;

      }


      #${CARD_ID} .gei-metrics {

        display:
          grid;

        grid-template-columns:
          repeat(
            auto-fit,
            minmax(110px,1fr)
          );

        gap:
          9px;

      }


      #${CARD_ID} .gei-metric {

        background:
          rgba(255,255,255,.035);

        border-radius:
          10px;

        padding:
          11px;

      }


      #${CARD_ID} .gei-label {

        color:
          #9ca3af;

        font-size:
          .68rem;

      }


      #${CARD_ID} .gei-value {

        color:
          #fff;

        font-size:
          1.05rem;

        font-weight:
          700;

        margin-top:
          4px;

      }


      #${CARD_ID} .gei-pct {

        color:
          #9ca3af;

        font-size:
          .68rem;

        margin-top:
          2px;

      }


      #${CARD_ID} .gei-summary {

        margin-top:
          12px;

        color:
          #cbd5e1;

        font-size:
          .78rem;

        line-height:
          1.6;

      }


      #${CARD_ID} .gei-note {

        margin-top:
          8px;

        color:
          #6b7280;

        font-size:
          .68rem;

        line-height:
          1.5;

      }


      #${CARD_ID} .gei-empty {

        color:
          #9ca3af;

        padding:
          12px 0;

        line-height:
          1.6;

      }


      @media(max-width:700px) {

        #${CARD_ID} {

          padding:
            20px;

        }


        #${CARD_ID} .gei-head {

          flex-direction:
            column;

        }


        #${CARD_ID} .gei-refresh {

          width:
            100%;

        }


        #${CARD_ID} .gei-top {

          flex-direction:
            column;

        }

      }

    `;


    document.head.appendChild(
      style
    );
  }


  // =====================================================
  // CREATE DASHBOARD CARD
  // =====================================================

  function createCard() {

    const old =
      document.getElementById(
        CARD_ID
      );


    if (old) {
      old.remove();
    }


    const card =
      document.createElement(
        'section'
      );


    card.id =
      CARD_ID;


    card.innerHTML = `

      <div class="gei-head">

        <div>

          <div class="gei-title">
            📈 GLIME Action Impact
          </div>

          <div class="gei-sub">
            Observed business changes
            after approved actions.
          </div>

        </div>


        <button
          class="gei-refresh"
          type="button"
        >
          ↻ Refresh
        </button>

      </div>


      <div class="gei-list">

        <div class="gei-empty">
          Loading impact data…
        </div>

      </div>

    `;


    const progress =
      document.querySelector(
        '.progress-card'
      );


    const main =
      document.querySelector(
        '.main-content'
      );


    if (
      progress?.parentNode
    ) {

      progress.parentNode
        .insertBefore(
          card,
          progress
        );

    }

    else if (main) {

      main.insertBefore(
        card,
        main.firstChild
      );

    }

    else {

      return null;

    }


    return card;
  }


  // =====================================================
  // RENDER
  // =====================================================

  function render(
    card,
    rows
  ) {

    const list =
      card.querySelector(
        '.gei-list'
      );


    if (!rows.length) {

      list.innerHTML = `

        <div class="gei-empty">

          अभी कोई measured action
          impact उपलब्ध नहीं है।

          Approved action complete होने
          के बाद GLIME यहाँ observed
          changes दिखाएगा।

        </div>

      `;

      return;
    }


    list.innerHTML =
      rows.map(
        function (row) {

          return `

            <article
              class="gei-card"
            >

              <div class="gei-top">

                <div>

                  <div class="gei-name">
                    Business Action Impact
                  </div>

                  <div class="gei-date">

                    Measured:

                    ${esc(
                      formatDate(
                        row.measured_at
                      )
                    )}

                  </div>

                </div>


                <span
                  class="gei-badge"
                >

                  ${esc(
                    row.impact_status ||
                    'pending'
                  )}

                </span>

              </div>


              <div
                class="gei-metrics"
              >

                ${metricCard(
                  'Customers',
                  'customers',
                  row
                )}

                ${metricCard(
                  'Orders',
                  'orders',
                  row
                )}

                ${metricCard(
                  'Paid Orders',
                  'paidOrders',
                  row
                )}

                ${metricCard(
                  'Revenue',
                  'revenue',
                  row
                )}

                ${metricCard(
                  'Enquiries',
                  'enquiries',
                  row
                )}

                ${metricCard(
                  'Leads',
                  'leads',
                  row
                )}

                ${metricCard(
                  'New Customers 30D',
                  'newCustomers30d',
                  row
                )}

              </div>


              <div
                class="gei-summary"
              >

                <strong>
                  GLIME observation:
                </strong>

                ${esc(
                  row.summary ||
                  'Impact is being evaluated.'
                )}

              </div>


              <div
                class="gei-note"
              >

                Observed changes do not
                by themselves prove that
                the action caused the change.

              </div>


            </article>

          `;

        }
      ).join('');
  }


  // =====================================================
  // INIT
  // =====================================================

  async function init() {

    try {

      injectStyles();


      const card =
        createCard();


      if (!card) {
        return;
      }


      const button =
        card.querySelector(
          '.gei-refresh'
        );


      async function refresh() {

        button.disabled =
          true;

        button.textContent =
          'Checking…';


        try {

          const rows =
            await loadImpact();


          render(
            card,
            rows
          );

        }

        catch (error) {

          console.error(
            'GLIME Action Impact:',
            error
          );


          card.querySelector(
            '.gei-list'
          ).innerHTML = `

            <div class="gei-empty">

              Impact data अभी load
              नहीं हो पाया।

              कृपया Refresh करें।

            </div>

          `;

        }

        finally {

          button.disabled =
            false;

          button.textContent =
            '↻ Refresh';

        }

      }


      button.addEventListener(
        'click',
        refresh
      );


      await refresh();

    }

    catch (error) {

      console.error(
        'GLIME Phase E impact add-on:',
        error
      );

    }

  }


  // =====================================================
  // START
  // =====================================================

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  }

  else {

    init();

  }

})();
