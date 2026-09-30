/* =========================================================
   GLIME — ACCOUNT REVIEW FLOW
   =========================================================
   CLIENT:
   - Suspended account is blocked.
   - Suspension reason is shown.
   - Latest review status is shown.
   - Client can submit a review message.
   - If Admin rejects/keeps suspended, Admin Response is shown
     directly on the client suspension screen.

   ADMIN:
   - Review Requests appears inside Admin.
   - Review details open in one modal.
   - Client message + suspension reason + activity shown.
   - Admin Response textarea.
   - APPROVE & REACTIVATE.
   - REJECT & KEEP SUSPENDED.
   - Decision uses secure admin RPC.

   IMPORTANT:
   - client_data.account_status is the account-state source of truth.
   - account_review_requests is review workflow/history.
   ========================================================= */

(function () {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const path =
    (location.pathname || '/')
      .toLowerCase()
      .replace(/\/+$/, '') || '/';

  const isAdmin =
    path === '/admin' ||
    path.endsWith('/admin') ||
    path === '/admin.html' ||
    path.endsWith('/admin.html');

  function esc(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      function (m) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[m];
      }
    );
  }

  function supabaseClient() {
    if (!window.supabase) return null;

    return window.supabase.createClient(
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
  }

  function injectStyle() {
    if (document.getElementById('glimeAccountReviewStyle')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'glimeAccountReviewStyle';

    style.textContent = `
      html.glime-account-gate-pending body{
        visibility:hidden!important;
      }

      #glimeAccountReviewGate{
        position:fixed;
        inset:0;
        z-index:2147483000;
        display:flex;
        align-items:flex-start;
        justify-content:center;
        padding:28px 18px 40px;
        background:#05080c;
        color:#fff;
        overflow:auto;
        visibility:visible!important;
      }

      #glimeAccountReviewGate *{
        box-sizing:border-box;
        font-family:
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          Roboto,
          sans-serif;
      }

      .glime-review-shell{
        width:min(760px,100%);
        margin-top:4vh;
      }

      .glime-review-alert{
        border:2px solid #ff5366;
        background:
          linear-gradient(
            180deg,
            rgba(255,83,102,.15),
            rgba(255,83,102,.045)
          );
        border-radius:20px;
        padding:26px;
        box-shadow:0 0 50px rgba(255,83,102,.12);
      }

      .glime-review-alert.pending{
        border-color:#ffad45;
        background:rgba(255,173,69,.08);
      }

      .glime-review-flag{
        display:inline-flex;
        align-items:center;
        gap:8px;
        color:#ff7180;
        font-weight:900;
        letter-spacing:.12em;
        font-size:12px;
        border:1px solid rgba(255,83,102,.5);
        background:rgba(255,83,102,.1);
        border-radius:999px;
        padding:7px 11px;
      }

      .glime-review-alert.pending .glime-review-flag{
        color:#ffd79f;
        border-color:rgba(255,173,69,.5);
        background:rgba(255,173,69,.1);
      }

      .glime-review-dot{
        width:9px;
        height:9px;
        border-radius:50%;
        background:#ff5366;
        box-shadow:0 0 14px #ff5366;
      }

      .glime-review-alert.pending .glime-review-dot{
        background:#ffad45;
        box-shadow:0 0 14px #ffad45;
      }

      .glime-review-title{
        font-size:clamp(30px,7vw,54px);
        line-height:1;
        margin:22px 0 10px;
        font-weight:900;
        letter-spacing:.02em;
      }

      .glime-review-reason{
        font-size:18px;
        color:#ffb8c0;
        line-height:1.55;
        margin:0 0 18px;
        word-break:break-word;
      }

      .glime-review-copy{
        color:#c2ccd8;
        line-height:1.65;
        margin:0 0 18px;
      }

      .glime-review-message-wrap{
        margin:0 0 14px;
      }

      .glime-review-message-label{
        display:block;
        margin:0 0 7px;
        color:#dbe4ee;
        font-size:14px;
        font-weight:800;
      }

      .glime-review-message{
        width:100%;
        min-height:112px;
        padding:12px 13px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:11px;
        background:#09111b;
        color:#fff;
        outline:none;
        resize:vertical;
        line-height:1.5;
        font-size:14px;
      }

      .glime-review-message:focus{
        border-color:rgba(255,173,69,.7);
        box-shadow:0 0 0 3px rgba(255,173,69,.10);
      }

      .glime-review-message:disabled{
        opacity:.65;
      }

      .glime-review-message-hint{
        margin-top:6px;
        color:#91a0b3;
        font-size:12px;
      }

      .glime-review-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .glime-review-btn{
        border:0;
        border-radius:11px;
        padding:13px 18px;
        font-weight:850;
        cursor:pointer;
        background:#ff5366;
        color:#160307;
      }

      .glime-review-btn:disabled{
        opacity:.55;
        cursor:not-allowed;
      }

      .glime-review-status{
        margin-top:14px;
        color:#9feec9;
        min-height:20px;
        font-size:14px;
        line-height:1.55;
      }

      .glime-admin-response{
        margin:16px 0;
        padding:15px;
        border:1px solid rgba(255,83,102,.42);
        border-radius:12px;
        background:rgba(255,83,102,.07);
        color:#e8edf3;
        line-height:1.65;
      }

      .glime-admin-response-title{
        color:#ff7180;
        font-weight:900;
        letter-spacing:.04em;
        margin-bottom:8px;
      }

      #glimeReviewAdminModal{
        position:fixed;
        inset:0;
        z-index:2147482000;
        display:none;
        align-items:center;
        justify-content:center;
        padding:16px;
        background:rgba(0,0,0,.72);
      }

      #glimeReviewAdminModal.open{
        display:flex;
      }

      .glime-review-admin-box{
        width:min(820px,100%);
        max-height:92vh;
        overflow:auto;
        background:#0d1724;
        color:#f4f7fb;
        border:1px solid rgba(255,255,255,.12);
        border-radius:18px;
        padding:20px;
      }

      .glime-review-admin-head{
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:center;
        margin-bottom:16px;
      }

      .glime-review-admin-kv{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
      }

      .glime-review-admin-kv > div{
        padding:11px;
        border:1px solid rgba(255,255,255,.08);
        border-radius:10px;
        background:rgba(255,255,255,.025);
      }

      .glime-review-admin-kv small{
        display:block;
        color:#91a0b3;
        margin-bottom:4px;
      }

      .glime-review-admin-message{
        margin-top:12px;
        padding:13px;
        border:1px solid rgba(255,255,255,.08);
        border-radius:10px;
        white-space:pre-wrap;
        line-height:1.55;
        color:#cbd5e1;
      }

      .glime-review-activity{
        margin-top:12px;
        padding:13px;
        border:1px solid rgba(255,255,255,.08);
        border-radius:10px;
      }

      .glime-review-activity-item{
        padding:8px 0;
        border-bottom:1px solid rgba(255,255,255,.07);
      }

      .glime-review-activity-item:last-child{
        border-bottom:0;
      }

      .glime-review-admin-decision{
        margin-top:14px;
        padding:13px;
        border:1px solid rgba(0,234,255,.12);
        border-radius:10px;
      }

      .glime-review-admin-decision textarea{
        width:100%;
        margin-top:10px;
        padding:12px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,.15);
        background:#09111b;
        color:#fff;
        resize:vertical;
        line-height:1.5;
      }

      .glime-review-admin-buttons{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin-top:12px;
      }

      .glime-review-admin-buttons button{
        border:1px solid rgba(255,255,255,.12);
        padding:10px 13px;
        border-radius:10px;
        cursor:pointer;
        color:#fff;
        background:#132031;
      }

      .glime-review-admin-buttons .approve{
        background:rgba(0,232,138,.10);
        color:#00e88a;
        border-color:rgba(0,232,138,.35);
      }

      .glime-review-admin-buttons .reject{
        background:rgba(255,83,102,.10);
        color:#ff5366;
        border-color:rgba(255,83,102,.35);
      }

      .glime-review-admin-buttons button:disabled{
        opacity:.55;
        cursor:not-allowed;
      }

      @media(max-width:600px){
        #glimeAccountReviewGate{
          padding:16px 12px 28px;
        }

        .glime-review-alert{
          padding:21px;
        }

        .glime-review-reason{
          font-size:16px;
        }

        .glime-review-admin-kv{
          grid-template-columns:1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function setGatePending(value) {
    document.documentElement.classList.toggle(
      'glime-account-gate-pending',
      !!value
    );
  }

  function removeClientGate() {
    const gate =
      document.getElementById(
        'glimeAccountReviewGate'
      );

    if (gate) gate.remove();

    setGatePending(false);
  }

  /* =========================================================
     CLIENT SCREEN
     ========================================================= */

  function clientScreenHtml(client, review) {

    const reason =
      client?.suspension_reason ||
      'Access to this GLIME account has been suspended.';

    const status =
      String(review?.status || '').toLowerCase();

    const pending = status === 'pending';

    const hasAdminResponse =
      !!String(review?.admin_note || '').trim();

    return `
      <div class="glime-review-shell">

        <div class="glime-review-alert ${pending ? 'pending' : ''}">

          <div class="glime-review-flag">
            <span class="glime-review-dot"></span>
            ${
              pending
                ? 'REVIEW REQUEST PENDING'
                : 'ACCOUNT ACCESS RESTRICTED'
            }
          </div>

          <div class="glime-review-title">
            ACCOUNT SUSPENDED
          </div>

          <p class="glime-review-reason">
            ${esc(reason)}
          </p>

          <p class="glime-review-copy">
            Your GLIME account is currently suspended.
            Dashboard and billing access are unavailable
            while the suspension is active.
          </p>

          ${
            hasAdminResponse
              ? `
                <div class="glime-admin-response">

                  <div class="glime-admin-response-title">
                    ADMIN RESPONSE
                  </div>

                  <div>
                    ${esc(review.admin_note)}
                  </div>

                </div>
              `
              : ''
          }

          ${
            pending
              ? `
                <div class="glime-review-status">
                  Your review request is currently being reviewed
                  by the GLIME Admin team. Your account will remain
                  suspended until a decision is made.
                </div>
              `
              : `
                <div class="glime-review-message-wrap">

                  <label
                    class="glime-review-message-label"
                    for="glimeReviewClientMessage"
                  >
                    Message to GLIME Admin
                  </label>

                  <textarea
                    id="glimeReviewClientMessage"
                    class="glime-review-message"
                    maxlength="2000"
                    rows="5"
                    placeholder="Explain why you believe your account should be reviewed."
                  ></textarea>

                  <div class="glime-review-message-hint">
                    Maximum 2000 characters.
                  </div>

                </div>

                <div class="glime-review-actions">

                  <button
                    id="glimeReviewRequestBtn"
                    class="glime-review-btn"
                  >
                    REQUEST REVIEW
                  </button>

                </div>

                <div
                  id="glimeReviewStatus"
                  class="glime-review-status"
                ></div>
              `
          }

        </div>

      </div>
    `;
  }

  async function getLatestClientReview(sb) {

    const result = await sb
      .from('account_review_requests')
      .select(
        'id,status,created_at,client_message,admin_note,reviewed_at'
      )
      .order(
        'created_at',
        { ascending:false }
      )
      .limit(1);

    if (result.error) {
      return null;
    }

    return result.data?.[0] || null;
  }

  async function createClientGate(sb, client) {

    setGatePending(true);

    const review =
      await getLatestClientReview(sb);

    const wrap =
      document.createElement('div');

    wrap.id =
      'glimeAccountReviewGate';

    wrap.innerHTML =
      clientScreenHtml(
        client,
        review
      );

    document.body.prepend(wrap);

    const btn =
      document.getElementById(
        'glimeReviewRequestBtn'
      );

    const status =
      document.getElementById(
        'glimeReviewStatus'
      );

    const messageInput =
      document.getElementById(
        'glimeReviewClientMessage'
      );

    if (!btn) {
      return;
    }

    btn.onclick = async function () {

      const message =
        String(
          messageInput?.value || ''
        ).trim();

      if (!message) {

        if (status) {
          status.textContent =
            'Please write a message before submitting the review request.';

          status.style.color =
            '#ffcf8a';
        }

        messageInput?.focus();

        return;
      }

      if (message.length > 2000) {

        if (status) {
          status.textContent =
            'Your message must be 2000 characters or less.';

          status.style.color =
            '#ff9eaa';
        }

        messageInput?.focus();

        return;
      }

      btn.disabled = true;

      if (messageInput) {
        messageInput.disabled = true;
      }

      btn.textContent =
        'SUBMITTING…';

      if (status) {
        status.textContent =
          'Submitting your review request…';

        status.style.color =
          '#c2ccd8';
      }

      const result =
        await sb.rpc(
          'client_request_account_review',
          {
            p_message: message
          }
        );

      if (result.error) {

        btn.disabled = false;

        if (messageInput) {
          messageInput.disabled = false;
        }

        btn.textContent =
          'REQUEST REVIEW';

        if (status) {
          status.textContent =
            result.error.message ||
            'Review request could not be submitted.';

          status.style.color =
            '#ff9eaa';
        }

        return;
      }

      btn.textContent =
        'REVIEW REQUEST SENT';

      if (status) {
        status.textContent =
          'Your review request has been submitted. Your account will remain suspended while the Admin review is pending.';

        status.style.color =
          '#9feec9';
      }

    };
  }

  async function clientGate() {

    injectStyle();

    setGatePending(true);

    if (document.readyState === 'loading') {

      await new Promise(
        function (resolve) {
          document.addEventListener(
            'DOMContentLoaded',
            resolve,
            { once:true }
          );
        }
      );
    }

    if (!window.supabase) {
      setGatePending(false);
      return;
    }

    const sb =
      supabaseClient();

    if (!sb) {
      setGatePending(false);
      return;
    }

    const sessionResult =
      await sb.auth.getSession();

    const session =
      sessionResult?.data?.session;

    if (!session?.user) {

      location.replace(
        'login.html'
      );

      return;
    }

    const q =
      await sb
        .from('client_data')
        .select(
          [
            'client_id',
            'full_name',
            'client_name',
            'name',
            'email',
            'business_name',
            'account_status',
            'suspension_reason',
            'suspended_at'
          ].join(',')
        )
        .eq(
          'auth_user_id',
          session.user.id
        )
        .limit(1);

    if (
      q.error ||
      !q.data?.length
    ) {

      const wrap =
        document.createElement('div');

      wrap.id =
        'glimeAccountReviewGate';

      wrap.innerHTML = `
        <div class="glime-review-shell">
          <div class="glime-review-alert">

            <div class="glime-review-title">
              ACCOUNT CHECK FAILED
            </div>

            <p class="glime-review-reason">
              GLIME could not verify your account status.
            </p>

            <p class="glime-review-copy">
              For security, access remains locked until
              the account status can be verified.
            </p>

            <div class="glime-review-actions">

              <button
                id="glimeReviewRetry"
                class="glime-review-btn"
              >
                RETRY
              </button>

            </div>

          </div>
        </div>
      `;

      document.body.prepend(wrap);

      document.getElementById(
        'glimeReviewRetry'
      ).onclick =
        function () {
          location.reload();
        };

      return;
    }

    const client =
      q.data[0];

    if (
      String(
        client.account_status || ''
      ).toLowerCase() ===
      'suspended'
    ) {

      await createClientGate(
        sb,
        client
      );

      return;
    }

    removeClientGate();
  }

  /* =========================================================
     ADMIN
     ========================================================= */

  function adminStatusClass(status) {

    const s =
      String(
        status || ''
      ).toLowerCase();

    if (s === 'pending')
      return 'red';

    if (s === 'approved')
      return 'green';

    if (s === 'rejected')
      return 'orange';

    return 'blue';
  }

  async function adminGate() {

    injectStyle();

    if (document.readyState === 'loading') {

      await new Promise(
        function (resolve) {
          document.addEventListener(
            'DOMContentLoaded',
            resolve,
            { once:true }
          );
        }
      );
    }

    const sb =
      supabaseClient();

    if (!sb) return;

    const nav =
      document.querySelector('nav');

    const main =
      document.querySelector('main');

    if (!nav || !main) return;

    if (
      document.getElementById(
        'reviewNavBtn'
      )
    ) {
      return;
    }

    const navButton =
      document.createElement('button');

    navButton.id =
      'reviewNavBtn';

    navButton.dataset.view =
      'reviews';

    navButton.innerHTML = `
      Review Requests
      <span
        id="reviewPendingBadge"
        class="badge red"
        style="float:right"
      >0</span>
    `;

    const logout =
      nav.querySelector('.logout');

    if (logout) {
      nav.insertBefore(
        navButton,
        logout
      );
    } else {
      nav.appendChild(
        navButton
      );
    }

    const section =
      document.createElement('section');

    section.className =
      'view';

    section.id =
      'view-reviews';

    section.innerHTML = `
      <div class="card">

        <h3>
          Account Review Requests
        </h3>

        <p class="sub">
          Suspended clients who requested
          an Admin review.
        </p>

        <div class="toolbar">

          <select
            id="reviewStatusFilter"
            style="max-width:220px"
          >
            <option value="pending">
              Pending
            </option>

            <option value="approved">
              Approved
            </option>

            <option value="rejected">
              Rejected
            </option>

            <option value="">
              All
            </option>
          </select>

          <button
            class="btn"
            id="reviewRefreshBtn"
          >
            ↻ Refresh
          </button>

        </div>

        <div style="overflow:auto">

          <table>

            <thead>
              <tr>
                <th>Client</th>
                <th>Email</th>
                <th>Reason</th>
                <th>Request</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>

            <tbody
              id="reviewRows"
            ></tbody>

          </table>

        </div>

      </div>
    `;

    main.appendChild(
      section
    );

    const title =
      document.getElementById(
        'title'
      );

    function goReviews() {

      document
        .querySelectorAll('.view')
        .forEach(
          function (x) {
            x.classList.remove(
              'active'
            );
          }
        );

      section.classList.add(
        'active'
      );

      document
        .querySelectorAll(
          'nav button[data-view]'
        )
        .forEach(
          function (x) {
            x.classList.toggle(
              'active',
              x === navButton
            );
          }
        );

      if (title) {
        title.textContent =
          'Review Requests';
      }

      loadReviews();
    }

    navButton.onclick =
      goReviews;

    document.getElementById(
      'reviewRefreshBtn'
    ).onclick =
      loadReviews;

    document.getElementById(
      'reviewStatusFilter'
    ).onchange =
      loadReviews;

    /* =====================================================
       ADMIN REVIEW MODAL
       ===================================================== */

    async function openAdminReview(
      requestId
    ) {

      const result =
        await sb.rpc(
          'admin_account_review_get',
          {
            p_request_id:
              requestId
          }
        );

      if (result.error) {

        alert(
          result.error.message ||
          'Could not load review.'
        );

        return;
      }

      const data =
        result.data || {};

      const client =
        data.client || {};

      const request =
        data.request || {};

      const activity =
        data.activity || {};

      let modal =
        document.getElementById(
          'glimeReviewAdminModal'
        );

      if (!modal) {

        modal =
          document.createElement(
            'div'
          );

        modal.id =
          'glimeReviewAdminModal';

        document.body.appendChild(
          modal
        );
      }

      const wa =
        activity.whatsapp_recent ||
        [];

      const ig =
        activity.instagram_recent ||
        [];

      function messageList(
        items
      ) {

        if (!items.length) {

          return `
            <span
              style="color:#91a0b3"
            >
              No messages found.
            </span>
          `;
        }

        return items.map(
          function (m) {

            return `
              <div
                class="glime-review-activity-item"
              >
                <b>
                  ${esc(
                    m.direction || ''
                  )}
                </b>

                ·

                ${esc(
                  m.status || ''
                )}

                <br>

                ${esc(
                  m.text_body ||
                  '[non-text message]'
                )}

                <br>

                <small
                  style="color:#91a0b3"
                >
                  ${esc(
                    m.created_at || ''
                  )}
                </small>
              </div>
            `;
          }
        ).join('');
      }

      const pending =
        String(
          request.status || ''
        ).toLowerCase() ===
        'pending';

      modal.innerHTML = `

        <div
          class="glime-review-admin-box"
        >

          <div
            class="glime-review-admin-head"
          >

            <div>

              <h2
                style="margin:0"
              >
                Account Review
              </h2>

              <div
                style="
                  color:#91a0b3;
                  margin-top:4px
                "
              >
                ${esc(
                  client.client_id ||
                  '—'
                )}
              </div>

            </div>

            <button
              class="btn"
              id="glimeReviewAdminClose"
            >
              Close
            </button>

          </div>


          <div
            class="glime-review-admin-kv"
          >

            <div>
              <small>Client</small>
              <b>
                ${esc(
                  client.full_name ||
                  client.client_name ||
                  client.name ||
                  '—'
                )}
              </b>
            </div>

            <div>
              <small>Email</small>
              <b>
                ${esc(
                  client.email ||
                  '—'
                )}
              </b>
            </div>

            <div>
              <small>Business</small>
              <b>
                ${esc(
                  client.business_name ||
                  '—'
                )}
              </b>
            </div>

            <div>
              <small>Account Status</small>
              <b>
                ${esc(
                  client.account_status ||
                  '—'
                )}
              </b>
            </div>

            <div>
              <small>Suspension Reason</small>
              <b>
                ${esc(
                  client.suspension_reason ||
                  '—'
                )}
              </b>
            </div>

            <div>
              <small>Request Status</small>
              <b>
                ${esc(
                  request.status ||
                  '—'
                )}
              </b>
            </div>

            <div>
              <small>Requested At</small>
              <b>
                ${
                  request.created_at
                    ? esc(
                        new Date(
                          request.created_at
                        ).toLocaleString()
                      )
                    : '—'
                }
              </b>
            </div>

            <div>
              <small>Reviewed At</small>
              <b>
                ${
                  request.reviewed_at
                    ? esc(
                        new Date(
                          request.reviewed_at
                        ).toLocaleString()
                      )
                    : '—'
                }
              </b>
            </div>

          </div>


          <div
            class="glime-review-admin-message"
          >

            <b>
              Client Message
            </b>

            <br><br>

            ${esc(
              request.client_message ||
              'No client message was provided.'
            )}

          </div>


          <div
            class="glime-review-admin-message"
          >

            <b>
              Admin Response
            </b>

            <br><br>

            ${
              request.admin_note
                ? esc(
                    request.admin_note
                  )
                : 'No Admin response yet.'
            }

          </div>


          <div
            class="glime-review-activity"
          >

            <b>
              Messaging Activity
            </b>

            <br><br>

            WhatsApp total:
            <b>
              ${esc(
                activity.whatsapp_total ??
                0
              )}
            </b>

            &nbsp;|&nbsp;

            outbound:
            <b>
              ${esc(
                activity.whatsapp_outbound ??
                0
              )}
            </b>

            <br>

            Instagram total:
            <b>
              ${esc(
                activity.instagram_total ??
                0
              )}
            </b>

            &nbsp;|&nbsp;

            outbound:
            <b>
              ${esc(
                activity.instagram_outbound ??
                0
              )}
            </b>

          </div>


          <div
            class="glime-review-activity"
          >

            <b>
              Recent WhatsApp Messages
            </b>

            <br><br>

            ${messageList(wa)}

          </div>


          <div
            class="glime-review-activity"
          >

            <b>
              Recent Instagram Messages
            </b>

            <br><br>

            ${messageList(ig)}

          </div>


          ${
            pending
              ? `

                <div
                  class="glime-review-admin-decision"
                >

                  <b>
                    Admin Decision
                  </b>

                  <textarea
                    id="glimeReviewAdminNote"
                    rows="5"
                    maxlength="2000"
                    placeholder="Write the response that the client will see..."
                  ></textarea>

                  <div
                    class="glime-review-admin-buttons"
                  >

                    <button
                      id="glimeReviewApprove"
                      class="approve"
                    >
                      APPROVE &amp; REACTIVATE
                    </button>

                    <button
                      id="glimeReviewReject"
                      class="reject"
                    >
                      REJECT &amp; KEEP SUSPENDED
                    </button>

                  </div>

                  <div
                    id="glimeReviewDecisionStatus"
                    style="
                      margin-top:10px;
                      min-height:20px
                    "
                  ></div>

                </div>

              `
              : `
                <div
                  class="glime-review-admin-decision"
                >

                  <b>
                    Final Decision
                  </b>

                  <br><br>

                  ${
                    String(
                      request.status || ''
                    ).toLowerCase() ===
                    'approved'
                      ? 'Approved and account reactivated.'
                      : 'Rejected and account remains suspended.'
                  }

                </div>
              `
          }

        </div>
      `;

      modal.classList.add(
        'open'
      );

      document.getElementById(
        'glimeReviewAdminClose'
      ).onclick =
        function () {
          modal.classList.remove(
            'open'
          );
        };

      const note =
        document.getElementById(
          'glimeReviewAdminNote'
        );

      const approve =
        document.getElementById(
          'glimeReviewApprove'
        );

      const reject =
        document.getElementById(
          'glimeReviewReject'
        );

      const decisionStatus =
        document.getElementById(
          'glimeReviewDecisionStatus'
        );

      async function decide(
        action
      ) {

        if (!note ||
            !decisionStatus) {
          return;
        }

        const text =
          String(
            note.value || ''
          ).trim();

        if (!text) {

          decisionStatus.textContent =
            'Admin response is required.';

          decisionStatus.style.color =
            '#ff9eaa';

          note.focus();

          return;
        }

        if (text.length > 2000) {

          decisionStatus.textContent =
            'Admin response must be 2000 characters or less.';

          decisionStatus.style.color =
            '#ff9eaa';

          note.focus();

          return;
        }

        if (approve)
          approve.disabled = true;

        if (reject)
          reject.disabled = true;

        note.disabled = true;

        decisionStatus.textContent =
          'Saving decision…';

        decisionStatus.style.color =
          '#91a0b3';

        const response =
          await sb.rpc(
            'admin_account_review_action',
            {
              p_request_id:
                request.id,

              p_action:
                action,

              p_admin_note:
                text
            }
          );

        if (response.error) {

          if (approve)
            approve.disabled = false;

          if (reject)
            reject.disabled = false;

          note.disabled = false;

          decisionStatus.textContent =
            response.error.message ||
            'Could not save decision.';

          decisionStatus.style.color =
            '#ff9eaa';

          return;
        }

        decisionStatus.textContent =
          action === 'approve'
            ? 'Approved. Account reactivated.'
            : 'Rejected. Account remains suspended.';

        decisionStatus.style.color =
          '#9feec9';

        setTimeout(
          function () {

            modal.classList.remove(
              'open'
            );

            loadReviews();

          },
          700
        );
      }

      approve?.addEventListener(
        'click',
        function () {
          decide('approve');
        }
      );

      reject?.addEventListener(
        'click',
        function () {
          decide('reject');
        }
      );
    }

    /* =====================================================
       REVIEW LIST
       ===================================================== */

    async function loadReviews() {

      const sessionResult =
        await sb.auth.getSession();

      const session =
        sessionResult?.data?.session;

      if (!session?.user) {
        return;
      }

      const aal =
        await sb.auth.mfa
          .getAuthenticatorAssuranceLevel();

      if (
        aal?.data?.currentLevel !==
        'aal2'
      ) {
        return;
      }

      const filter =
        document.getElementById(
          'reviewStatusFilter'
        );

      const status =
        filter?.value || '';

      const result =
        await sb.rpc(
          'admin_account_review_list',
          {
            p_status:
              status || null,

            p_limit:
              200
          }
        );

      const rows =
        document.getElementById(
          'reviewRows'
        );

      if (!rows) return;

      if (result.error) {

        rows.innerHTML = `
          <tr>
            <td colspan="6">
              ${esc(
                result.error.message
              )}
            </td>
          </tr>
        `;

        return;
      }

      const list =
        result.data || [];

      let pendingCount =
        list.filter(
          function (x) {
            return x.status === 'pending';
          }
        ).length;

      if (status !== 'pending') {

        const pendingResult =
          await sb.rpc(
            'admin_account_review_list',
            {
              p_status:
                'pending',

              p_limit:
                200
            }
          );

        if (
          !pendingResult.error
        ) {
          pendingCount =
            (
              pendingResult.data ||
              []
            ).length;
        }
      }

      const badge =
        document.getElementById(
          'reviewPendingBadge'
        );

      if (badge) {
        badge.textContent =
          String(
            pendingCount
          );
      }

      if (!list.length) {

        rows.innerHTML = `
          <tr>
            <td
              colspan="6"
              class="sub"
            >
              No review requests found.
            </td>
          </tr>
        `;

        return;
      }

      const ids =
        [
          ...new Set(
            list
              .map(
                function (x) {
                  return x.client_id;
                }
              )
              .filter(Boolean)
          )
        ];

      let clients = [];

      if (ids.length) {

        const q =
          await sb
            .from('client_data')
            .select(
              [
                'client_id',
                'full_name',
                'client_name',
                'name',
                'email',
                'business_name',
                'account_status',
                'suspension_reason'
              ].join(',')
            )
            .in(
              'client_id',
              ids
            );

        if (!q.error) {
          clients =
            q.data || [];
        }
      }

      const map =
        new Map(
          clients.map(
            function (x) {
              return [
                x.client_id,
                x
              ];
            }
          )
        );

      rows.innerHTML =
        list.map(
          function (x) {

            const c =
              map.get(
                x.client_id
              ) || {};

            return `
              <tr>

                <td>
                  <b>
                    ${esc(
                      c.full_name ||
                      c.client_name ||
                      c.name ||
                      '—'
                    )}
                  </b>

                  <br>

                  <span class="sub">
                    ${esc(
                      x.client_id
                    )}
                  </span>
                </td>

                <td>
                  ${esc(
                    c.email ||
                    '—'
                  )}
                </td>

                <td>
                  ${esc(
                    c.suspension_reason ||
                    '—'
                  )}
                </td>

                <td>
                  ${
                    x.created_at
                      ? esc(
                          new Date(
                            x.created_at
                          ).toLocaleString()
                        )
                      : '—'
                  }
                </td>

                <td>
                  <span
                    class="badge ${
                      adminStatusClass(
                        x.status
                      )
                    }"
                  >
                    ${esc(
                      x.status
                    )}
                  </span>
                </td>

                <td>

                  <button
                    class="btn"
                    data-review-id="${esc(
                      x.id
                    )}"
                  >
                    View
                  </button>

                </td>

              </tr>
            `;
          }
        ).join('');

      rows
        .querySelectorAll(
          '[data-review-id]'
        )
        .forEach(
          function (button) {

            button.onclick =
              function () {

                openAdminReview(
                  button.dataset
                    .reviewId
                );

              };

          }
        );
    }

    let attempts = 0;

    const timer =
      setInterval(
        async function () {

          attempts++;

          try {

            const sessionResult =
              await sb.auth.getSession();

            if (
              sessionResult?.data?.session
            ) {

              const aal =
                await sb.auth.mfa
                  .getAuthenticatorAssuranceLevel();

              if (
                aal?.data?.currentLevel ===
                'aal2'
              ) {

                clearInterval(
                  timer
                );

                await loadReviews();
              }
            }

          } catch (error) {

            console.warn(
              '[GLIME Review]',
              error
            );

          }

          if (
            attempts >= 30
          ) {

            clearInterval(
              timer
            );

          }

        },
        1000
      );
  }

  /* =========================================================
     START
     ========================================================= */

  if (isAdmin) {

    adminGate().catch(
      function (error) {

        console.warn(
          '[GLIME Account Review Admin]',
          error
        );

      }
    );

  } else {

    clientGate().catch(
      function (error) {

        console.error(
          '[GLIME Account Review Client]',
          error
        );

        setGatePending(false);

      }
    );

  }

})();
