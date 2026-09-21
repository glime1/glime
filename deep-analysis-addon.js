/* =========================================================
   GLIME — DEEP LEARNING ANALYSIS ADDON
   ---------------------------------------------------------
   Dashboard frontend for:
   - 7-day Deep Analysis
   - Minimum 10-lead requirement
   - Cooldown handling
   - Analysis result display
   - Learning pattern display
   - Learning action display

   SECURITY:
   - No OpenAI API key here
   - No Supabase service-role key here
   - Uses authenticated Supabase user session only
========================================================= */

(() => {
  'use strict';

  /* =======================================================
     CONFIG
  ======================================================= */

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const FUNCTION_NAME =
    'glime-deep-analysis';

  const MINIMUM_LEADS =
    10;


  /* =======================================================
     SUPABASE CLIENT
  ======================================================= */

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== 'function'
  ) {
    console.error(
      'GLIME Deep Analysis: Supabase client library not found.'
    );
    return;
  }

  const supabaseClient =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );


  /* =======================================================
     STATE
  ======================================================= */

  let runButton = null;
  let statusEl = null;
  let resultEl = null;


  /* =======================================================
     HELPERS
  ======================================================= */

  function escapeHtml(value) {

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  }


  function formatDate(value) {

    if (!value) {
      return '';
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '';
    }

    return date.toLocaleString();

  }


  function setStatus(
    message,
    type = 'muted'
  ) {

    if (!statusEl) {
      return;
    }

    statusEl.textContent =
      message;

    statusEl.dataset.tone =
      type;

  }


  function setButtonState(
    disabled,
    text
  ) {

    if (!runButton) {
      return;
    }

    runButton.disabled =
      disabled;

    runButton.textContent =
      text;

  }


  /* =======================================================
     DATA INSUFFICIENT UI
  ======================================================= */

  function showInsufficientData(
    leadCount
  ) {

    setStatus(
      `Deep Analysis requires at least ${MINIMUM_LEADS} leads. Current leads: ${leadCount}.`,
      'info'
    );


    resultEl.innerHTML = `

      <div class="glime-deep-insufficient">

        <div class="glime-deep-insufficient-icon">
          📊
        </div>

        <div>

          <h4>
            More business data is needed
          </h4>

          <p>

            GLIME Deep Analysis starts only after
            your account has at least

            <strong>
              ${MINIMUM_LEADS} leads
            </strong>.

          </p>

          <p>

            Current lead count:

            <strong>
              ${escapeHtml(leadCount)}
            </strong>

          </p>

          <small>

            This protects the learning system from
            creating patterns from insufficient evidence.

          </small>

        </div>

      </div>

    `;

  }


  /* =======================================================
     COOLDOWN UI
  ======================================================= */

  function showCooldown(
    availableAt
  ) {

    const dateText =
      formatDate(
        availableAt
      );


    setStatus(
      dateText
        ? `Deep Analysis is on cooldown. Next available: ${dateText}`
        : 'Deep Analysis is currently on its 7-day cooldown.',
      'info'
    );


    resultEl.innerHTML = `

      <div class="glime-deep-cooldown">

        <div class="glime-deep-cooldown-icon">
          ⏳
        </div>

        <div>

          <h4>
            Deep Analysis already completed
          </h4>

          <p>

            GLIME runs this deeper learning analysis
            once every 7 days per client.

          </p>

          ${
            dateText
              ? `
                <p>
                  <strong>
                    Next available:
                  </strong>

                  ${escapeHtml(dateText)}
                </p>
              `
              : ''
          }

        </div>

      </div>

    `;

  }


  /* =======================================================
     ANALYSIS RESULT
  ======================================================= */

  function renderAnalysis(
    response
  ) {

    const analysis =
      response?.analysis;


    if (
      !analysis ||
      typeof analysis !== 'object'
    ) {

      resultEl.innerHTML = `

        <div class="glime-deep-empty">

          Deep Analysis completed, but no
          displayable analysis was returned.

        </div>

      `;

      return;
    }


    /* -----------------------------------------------------
       PATTERNS
    ----------------------------------------------------- */

    const patterns =
      Array.isArray(
        analysis.patterns
      )
        ? analysis.patterns.slice(0, 8)
        : [];


    /* -----------------------------------------------------
       LEARNING ACTIONS
    ----------------------------------------------------- */

    const actions =
      Array.isArray(
        analysis.learning_actions
      )
        ? analysis.learning_actions.slice(0, 8)
        : [];


    /* -----------------------------------------------------
       CHANNEL INSIGHTS
    ----------------------------------------------------- */

    const channels =
      Array.isArray(
        analysis.channel_insights
      )
        ? analysis.channel_insights.slice(0, 6)
        : [];


    /* -----------------------------------------------------
       SPECIALIST INSIGHTS
    ----------------------------------------------------- */

    const specialists =
      Array.isArray(
        analysis.specialist_insights
      )
        ? analysis.specialist_insights.slice(0, 6)
        : [];


    /* -----------------------------------------------------
       OUTCOME INSIGHTS
    ----------------------------------------------------- */

    const outcomes =
      Array.isArray(
        analysis.outcome_insights
      )
        ? analysis.outcome_insights.slice(0, 6)
        : [];


    /* -----------------------------------------------------
       DATA QUALITY
    ----------------------------------------------------- */

    const dataQuality =
      Array.isArray(
        analysis.data_quality_issues
      )
        ? analysis.data_quality_issues.slice(0, 6)
        : [];


    /* -----------------------------------------------------
       PATTERN HTML
    ----------------------------------------------------- */

    const patternHtml =
      patterns
        .map(
          (pattern) => {

            const confidence =
              typeof pattern.confidence === 'number'
                ? Math.round(
                    pattern.confidence * 100
                  )
                : null;


            const evidence =
              Array.isArray(
                pattern.evidence
              )
                ? pattern.evidence.slice(0, 4)
                : [];


            return `

              <div class="glime-deep-item">

                <div class="glime-deep-item-head">

                  <strong>

                    ${escapeHtml(
                      pattern.pattern_key ||
                      'Observed pattern'
                    )}

                  </strong>

                  ${
                    confidence !== null
                      ? `
                        <span class="glime-deep-confidence">
                          ${confidence}% confidence
                        </span>
                      `
                      : ''
                  }

                </div>


                <p>

                  ${escapeHtml(
                    pattern.observation ||
                    ''
                  )}

                </p>


                ${
                  evidence.length
                    ? `

                      <div class="glime-deep-evidence-title">
                        Evidence
                      </div>

                      <ul class="glime-deep-evidence">

                        ${
                          evidence
                            .map(
                              item =>
                                `<li>${escapeHtml(item)}</li>`
                            )
                            .join('')
                        }

                      </ul>

                    `
                    : ''
                }


                ${
                  pattern.recommended_learning_action
                    ? `

                      <div class="glime-deep-learning-action">

                        <span>
                          Learning
                        </span>

                        ${escapeHtml(
                          pattern.recommended_learning_action
                        )}

                      </div>

                    `
                    : ''
                }

              </div>

            `;

          }
        )
        .join('');


    /* -----------------------------------------------------
       LEARNING ACTION HTML
    ----------------------------------------------------- */

    const actionHtml =
      actions
        .map(
          (action) => {

            const priority =
              String(
                action.priority ||
                'medium'
              ).toLowerCase();


            return `

              <div class="glime-deep-action">

                <span
                  class="glime-deep-priority"
                  data-priority="${escapeHtml(priority)}"
                >

                  ${escapeHtml(priority)}

                </span>


                <div>

                  <strong>

                    ${escapeHtml(
                      action.action ||
                      'Learning action'
                    )}

                  </strong>


                  ${
                    action.reason
                      ? `
                        <p>
                          ${escapeHtml(
                            action.reason
                          )}
                        </p>
                      `
                      : ''
                  }

                </div>

              </div>

            `;

          }
        )
        .join('');


    /* -----------------------------------------------------
       CHANNEL HTML
    ----------------------------------------------------- */

    const channelHtml =
      channels
        .map(
          (item) => {

            const confidence =
              typeof item.confidence === 'number'
                ? Math.round(
                    item.confidence * 100
                  )
                : null;


            return `

              <div class="glime-deep-mini-item">

                <strong>

                  ${escapeHtml(
                    item.channel ||
                    'Channel'
                  )}

                </strong>

                <p>

                  ${escapeHtml(
                    item.observation ||
                    ''
                  )}

                </p>

                ${
                  confidence !== null
                    ? `
                      <small>
                        ${confidence}% confidence
                      </small>
                    `
                    : ''
                }

              </div>

            `;

          }
        )
        .join('');


    /* -----------------------------------------------------
       SPECIALIST HTML
    ----------------------------------------------------- */

    const specialistHtml =
      specialists
        .map(
          (item) => {

            return `

              <div class="glime-deep-mini-item">

                <strong>

                  ${escapeHtml(
                    item.specialist ||
                    'Specialist'
                  )}

                </strong>

                <p>

                  ${escapeHtml(
                    item.observation ||
                    ''
                  )}

                </p>

              </div>

            `;

          }
        )
        .join('');


    /* -----------------------------------------------------
       OUTCOME HTML
    ----------------------------------------------------- */

    const outcomeHtml =
      outcomes
        .map(
          (item) => {

            return `

              <div class="glime-deep-mini-item">

                <strong>

                  ${escapeHtml(
                    item.outcome ||
                    'Outcome'
                  )}

                </strong>

                <p>

                  ${escapeHtml(
                    item.observation ||
                    ''
                  )}

                </p>

              </div>

            `;

          }
        )
        .join('');


    /* -----------------------------------------------------
       DATA QUALITY HTML
    ----------------------------------------------------- */

    const qualityHtml =
      dataQuality
        .map(
          issue =>
            `<li>${escapeHtml(issue)}</li>`
        )
        .join('');


    /* -----------------------------------------------------
       FINAL RESULT
    ----------------------------------------------------- */

    resultEl.innerHTML = `

      ${
        analysis.summary
          ? `

            <div class="glime-deep-summary">

              <div class="glime-deep-summary-title">
                Analysis Summary
              </div>

              <div>

                ${escapeHtml(
                  analysis.summary
                )}

              </div>

            </div>

          `
          : ''
      }


      ${
        patternHtml
          ? `

            <div class="glime-deep-section">

              <h4>
                🧠 Learning Patterns
              </h4>

              ${patternHtml}

            </div>

          `
          : ''
      }


      ${
        actionHtml
          ? `

            <div class="glime-deep-section">

              <h4>
                ⚙️ Learning Actions
              </h4>

              ${actionHtml}

            </div>

          `
          : ''
      }


      ${
        channelHtml
          ? `

            <div class="glime-deep-section">

              <h4>
                📡 Channel Insights
              </h4>

              ${channelHtml}

            </div>

          `
          : ''
      }


      ${
        specialistHtml
          ? `

            <div class="glime-deep-section">

              <h4>
                🤖 Specialist Insights
              </h4>

              ${specialistHtml}

            </div>

          `
          : ''
      }


      ${
        outcomeHtml
          ? `

            <div class="glime-deep-section">

              <h4>
                📈 Outcome Insights
              </h4>

              ${outcomeHtml}

            </div>

          `
          : ''
      }


      ${
        qualityHtml
          ? `

            <div class="glime-deep-section glime-deep-quality">

              <h4>
                ⚠️ Data Quality Notes
              </h4>

              <ul>
                ${qualityHtml}
              </ul>

            </div>

          `
          : ''
      }


      <div class="glime-deep-meta">

        Provider:
        <strong>
          ${escapeHtml(
            response.provider ||
            'OpenAI'
          )}
        </strong>

        &nbsp; · &nbsp;

        Model:
        <strong>
          ${escapeHtml(
            response.model ||
            'Configured model'
          )}
        </strong>

        ${
          response.next_available_at
            ? `

              &nbsp; · &nbsp;

              Next analysis:
              <strong>
                ${escapeHtml(
                  formatDate(
                    response.next_available_at
                  )
                )}
              </strong>

            `
            : ''
        }

      </div>

    `;

  }


  /* =======================================================
     STYLES
  ======================================================= */

  function injectStyles() {

    if (
      document.getElementById(
        'glimeDeepAnalysisStyles'
      )
    ) {

      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'glimeDeepAnalysisStyles';


    style.textContent = `

      /* ---------------------------------------------------
         MAIN CARD
      --------------------------------------------------- */

      .glime-deep-card {

        margin-top:
          30px;

        background:
          var(--card-bg, #111827);

        border:
          1px solid rgba(0,240,255,.12);

        border-radius:
          16px;

        padding:
          28px;

        box-shadow:
          0 12px 35px rgba(0,0,0,.30);

      }


      .glime-deep-head {

        display:
          flex;

        align-items:
          flex-start;

        justify-content:
          space-between;

        gap:
          20px;

        margin-bottom:
          16px;

      }


      .glime-deep-head h3 {

        margin:
          0 0 7px;

        color:
          var(--cyan-blue,#00f0ff);

        font-size:
          1.2rem;

      }


      .glime-deep-head p {

        margin:
          0;

        max-width:
          720px;

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .85rem;

        line-height:
          1.65;

      }


      /* ---------------------------------------------------
         BUTTON
      --------------------------------------------------- */

      .glime-deep-run {

        border:
          1px solid rgba(0,255,136,.35);

        background:
          rgba(0,255,136,.09);

        color:
          var(--neon-green,#00ff88);

        border-radius:
          9px;

        padding:
          11px 17px;

        font-weight:
          700;

        cursor:
          pointer;

        transition:
          .2s ease;

        white-space:
          nowrap;

      }


      .glime-deep-run:hover:not(:disabled) {

        background:
          rgba(0,255,136,.17);

        transform:
          translateY(-1px);

      }


      .glime-deep-run:disabled {

        opacity:
          .55;

        cursor:
          not-allowed;

        transform:
          none;

      }


      /* ---------------------------------------------------
         STATUS
      --------------------------------------------------- */

      .glime-deep-status {

        margin-bottom:
          17px;

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .82rem;

        line-height:
          1.5;

      }


      .glime-deep-status[data-tone="success"] {

        color:
          var(--neon-green,#00ff88);

      }


      .glime-deep-status[data-tone="error"] {

        color:
          #ff6675;

      }


      .glime-deep-status[data-tone="info"] {

        color:
          var(--cyan-blue,#00f0ff);

      }


      /* ---------------------------------------------------
         SUMMARY
      --------------------------------------------------- */

      .glime-deep-summary {

        background:
          rgba(0,240,255,.035);

        border-left:
          3px solid var(--cyan-blue,#00f0ff);

        padding:
          15px 17px;

        border-radius:
          9px;

        color:
          #fff;

        line-height:
          1.7;

        margin-bottom:
          20px;

      }


      .glime-deep-summary-title {

        color:
          var(--cyan-blue,#00f0ff);

        font-weight:
          700;

        margin-bottom:
          6px;

      }


      /* ---------------------------------------------------
         SECTIONS
      --------------------------------------------------- */

      .glime-deep-section {

        margin-top:
          20px;

      }


      .glime-deep-section h4 {

        margin:
          0 0 11px;

        color:
          #fff;

        font-size:
          .97rem;

      }


      /* ---------------------------------------------------
         PATTERN
      --------------------------------------------------- */

      .glime-deep-item {

        padding:
          14px;

        border:
          1px solid rgba(255,255,255,.06);

        border-radius:
          10px;

        margin-bottom:
          10px;

        background:
          rgba(255,255,255,.018);

      }


      .glime-deep-item-head {

        display:
          flex;

        justify-content:
          space-between;

        align-items:
          flex-start;

        gap:
          12px;

      }


      .glime-deep-item-head strong {

        color:
          #fff;

        font-size:
          .88rem;

      }


      .glime-deep-confidence {

        color:
          var(--cyan-blue,#00f0ff);

        font-size:
          .75rem;

        white-space:
          nowrap;

      }


      .glime-deep-item > p {

        margin:
          7px 0;

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .82rem;

        line-height:
          1.65;

      }


      .glime-deep-evidence-title {

        margin-top:
          9px;

        color:
          #fff;

        font-size:
          .76rem;

        font-weight:
          700;

      }


      .glime-deep-evidence {

        margin:
          5px 0 0 18px;

        padding:
          0;

      }


      .glime-deep-evidence li {

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .78rem;

        line-height:
          1.55;

        margin:
          3px 0;

      }


      .glime-deep-learning-action {

        margin-top:
          10px;

        padding:
          8px 10px;

        background:
          rgba(0,255,136,.05);

        border:
          1px solid rgba(0,255,136,.12);

        border-radius:
          7px;

        color:
          #c9ffe5;

        font-size:
          .77rem;

        line-height:
          1.5;

      }


      .glime-deep-learning-action span {

        color:
          var(--neon-green,#00ff88);

        font-weight:
          700;

        margin-right:
          6px;

      }


      /* ---------------------------------------------------
         LEARNING ACTION
      --------------------------------------------------- */

      .glime-deep-action {

        display:
          flex;

        gap:
          11px;

        align-items:
          flex-start;

        padding:
          11px 0;

        border-bottom:
          1px solid rgba(255,255,255,.05);

      }


      .glime-deep-action:last-child {

        border-bottom:
          none;

      }


      .glime-deep-action strong {

        color:
          #fff;

        font-size:
          .84rem;

      }


      .glime-deep-action p {

        margin:
          4px 0 0;

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .78rem;

        line-height:
          1.55;

      }


      .glime-deep-priority {

        text-transform:
          capitalize;

        font-size:
          .68rem;

        border:
          1px solid rgba(0,240,255,.2);

        color:
          var(--cyan-blue,#00f0ff);

        border-radius:
          999px;

        padding:
          3px 8px;

        flex-shrink:
          0;

      }


      .glime-deep-priority[data-priority="high"] {

        border-color:
          rgba(255,170,0,.35);

        color:
          #ffc04d;

      }


      /* ---------------------------------------------------
         MINI INSIGHTS
      --------------------------------------------------- */

      .glime-deep-mini-item {

        padding:
          11px 13px;

        margin-bottom:
          8px;

        border:
          1px solid rgba(255,255,255,.055);

        border-radius:
          8px;

        background:
          rgba(255,255,255,.015);

      }


      .glime-deep-mini-item strong {

        color:
          #fff;

        font-size:
          .82rem;

      }


      .glime-deep-mini-item p {

        margin:
          5px 0;

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .77rem;

        line-height:
          1.55;

      }


      .glime-deep-mini-item small {

        color:
          var(--cyan-blue,#00f0ff);

        font-size:
          .7rem;

      }


      /* ---------------------------------------------------
         INSUFFICIENT DATA
      --------------------------------------------------- */

      .glime-deep-insufficient,
      .glime-deep-cooldown {

        display:
          flex;

        align-items:
          flex-start;

        gap:
          14px;

        padding:
          18px;

        border:
          1px solid rgba(0,240,255,.12);

        border-radius:
          10px;

        background:
          rgba(0,240,255,.025);

      }


      .glime-deep-insufficient-icon,
      .glime-deep-cooldown-icon {

        font-size:
          1.6rem;

        flex-shrink:
          0;

      }


      .glime-deep-insufficient h4,
      .glime-deep-cooldown h4 {

        margin:
          0 0 7px;

        color:
          #fff;

        font-size:
          .92rem;

      }


      .glime-deep-insufficient p,
      .glime-deep-cooldown p {

        margin:
          4px 0;

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .8rem;

        line-height:
          1.6;

      }


      .glime-deep-insufficient strong {

        color:
          var(--cyan-blue,#00f0ff);

      }


      .glime-deep-insufficient small {

        display:
          block;

        margin-top:
          9px;

        color:
          #7f8a99;

        font-size:
          .72rem;

        line-height:
          1.5;

      }


      /* ---------------------------------------------------
         DATA QUALITY
      --------------------------------------------------- */

      .glime-deep-quality {

        padding:
          12px 14px;

        border:
          1px solid rgba(255,180,0,.12);

        border-radius:
          9px;

      }


      .glime-deep-quality ul {

        margin:
          5px 0 0 18px;

      }


      .glime-deep-quality li {

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .77rem;

        line-height:
          1.55;

        margin:
          3px 0;

      }


      /* ---------------------------------------------------
         META
      --------------------------------------------------- */

      .glime-deep-meta {

        margin-top:
          20px;

        padding-top:
          13px;

        border-top:
          1px solid rgba(255,255,255,.05);

        color:
          var(--text-muted,#7f8a99);

        font-size:
          .72rem;

        line-height:
          1.6;

      }


      .glime-deep-meta strong {

        color:
          #aeb8c5;

        font-weight:
          600;

      }


      .glime-deep-empty {

        color:
          var(--text-muted,#9ca3af);

        font-size:
          .82rem;

        padding:
          10px 0;

      }


      /* ---------------------------------------------------
         MOBILE
      --------------------------------------------------- */

      @media (max-width: 600px) {

        .glime-deep-card {

          padding:
            20px 15px;

        }


        .glime-deep-head {

          flex-direction:
            column;

        }


        .glime-deep-run {

          width:
            100%;

        }


        .glime-deep-item-head {

          flex-direction:
            column;

          gap:
            5px;

        }


        .glime-deep-insufficient,
        .glime-deep-cooldown {

          padding:
            14px;

        }

      }

    `;


    document.head.appendChild(
      style
    );

  }


  /* =======================================================
     CREATE DASHBOARD CARD
  ======================================================= */

  function buildCard() {

    if (
      document.getElementById(
        'glimeDeepAnalysisCard'
      )
    ) {

      return true;
    }


    const main =
      document.querySelector(
        '.main-content'
      );


    if (!main) {

      return false;
    }


    const card =
      document.createElement(
        'section'
      );


    card.id =
      'glimeDeepAnalysisCard';


    card.className =
      'glime-deep-card';


    card.innerHTML = `

      <div class="glime-deep-head">

        <div>

          <h3>
            🧠 Deep Learning Analysis
          </h3>

          <p>

            GLIME analyses business signals,
            identifies repeatable patterns and
            feeds evidence-grounded insights
            back into the learning layer.

          </p>

        </div>


        <button
          type="button"
          class="glime-deep-run"
          id="glimeDeepRunButton"
        >
          Run Deep Analysis
        </button>

      </div>


      <div
        class="glime-deep-status"
        id="glimeDeepStatus"
      >

        Minimum ${MINIMUM_LEADS} leads required.
        Analysis is available once every 7 days.

      </div>


      <div
        id="glimeDeepResult"
      >

        <div class="glime-deep-empty">

          No Deep Analysis has been run
          from this dashboard yet.

        </div>

      </div>

    `;


    main.appendChild(
      card
    );


    runButton =
      document.getElementById(
        'glimeDeepRunButton'
      );


    statusEl =
      document.getElementById(
        'glimeDeepStatus'
      );


    resultEl =
      document.getElementById(
        'glimeDeepResult'
      );


    runButton.addEventListener(
      'click',
      runDeepAnalysis
    );


    return true;

  }


  /* =======================================================
     RUN DEEP ANALYSIS
  ======================================================= */

  async function runDeepAnalysis() {

    if (
      !runButton ||
      !resultEl
    ) {

      return;
    }


    setButtonState(
      true,
      'Analysing...'
    );


    setStatus(
      'GLIME is preparing the learning snapshot...',
      'info'
    );


    try {

      /* ---------------------------------------------------
         CHECK SESSION
      --------------------------------------------------- */

      const {
        data: sessionData,
        error: sessionError
      } =
        await supabaseClient
          .auth
          .getSession();


      if (sessionError) {

        throw sessionError;

      }


      if (
        !sessionData?.session
      ) {

        setStatus(
          'Your session has expired. Please sign in again.',
          'error'
        );

        return;

      }


      /* ---------------------------------------------------
         CALL EDGE FUNCTION
      --------------------------------------------------- */

      const {
        data,
        error
      } =
        await supabaseClient
          .functions
          .invoke(
            FUNCTION_NAME,
            {
              body: {}
            }
          );


      /* ---------------------------------------------------
         HANDLE FUNCTION ERROR
      --------------------------------------------------- */

      if (error) {

        let payload =
          null;


        try {

          if (
            error.context instanceof Response
          ) {

            payload =
              await error.context
                .json()
                .catch(
                  () => null
                );

          }

        } catch (_) {

          payload = null;

        }


        const code =
          payload?.code ||
          data?.code ||
          '';


        /* -----------------------------------------------
           INSUFFICIENT DATA
        ------------------------------------------------ */

        if (
          code ===
          'INSUFFICIENT_DATA'
        ) {

          showInsufficientData(
            payload?.lead_count ??
            data?.lead_count ??
            0
          );

          return;

        }


        /* -----------------------------------------------
           COOLDOWN
        ------------------------------------------------ */

        if (
          code ===
          'DEEP_ANALYSIS_COOLDOWN'
        ) {

          showCooldown(
            payload?.available_at ||
            data?.available_at
          );

          return;

        }


        throw new Error(
          payload?.error ||
          data?.error ||
          error.message ||
          'Deep Analysis failed.'
        );

      }


      /* ---------------------------------------------------
         HANDLE SUCCESS / BACKEND RESPONSE
      --------------------------------------------------- */

      if (
        data?.code ===
        'INSUFFICIENT_DATA'
      ) {

        showInsufficientData(
          data.lead_count || 0
        );

        return;

      }


      if (
        data?.code ===
        'DEEP_ANALYSIS_COOLDOWN'
      ) {

        showCooldown(
          data.available_at
        );

        return;

      }


      if (
        data?.ok !== true
      ) {

        throw new Error(
          data?.error ||
          'Deep Analysis failed.'
        );

      }


      /* ---------------------------------------------------
         SUCCESS
      --------------------------------------------------- */

      setStatus(
        'Deep Analysis completed and GLIME learning data was updated.',
        'success'
      );


      renderAnalysis(
        data
      );


    } catch (error) {

      console.error(
        'GLIME Deep Analysis:',
        error
      );


      setStatus(
        error?.message ||
        'Deep Analysis failed. Please try again later.',
        'error'
      );


    } finally {

      setButtonState(
        false,
        'Run Deep Analysis'
      );

    }

  }


  /* =======================================================
     START
  ======================================================= */

  function start() {

    injectStyles();


    if (
      buildCard()
    ) {

      return;
    }


    /*
      dashboard.html may still be loading its
      .main-content element, so retry shortly.
    */

    setTimeout(
      start,
      500
    );

  }


  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      start,
      {
        once: true
      }
    );

  } else {

    start();

  }

})();
