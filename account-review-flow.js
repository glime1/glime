/* GLIME — Account Review Flow
 *
 * RULE:
 * Suspended accounts may be:
 * - Free Trial clients
 * - Paid subscription clients
 *
 * A suspended account:
 * - must not see the normal dashboard
 * - must not see normal billing UI
 * - must not get a "Choose a paid plan" CTA
 * - may submit one Account Review Request
 * - appears inside Admin -> Review Requests
 */

(function () {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const path =
    (location.pathname || '').toLowerCase();

  const isAdmin =
    path.endsWith('/admin.html') ||
    path.endsWith('admin.html');


  /* =========================================================
     GLOBAL STYLE
  ========================================================= */

  function injectStyle() {

    if (
      document.getElementById(
        'glimeAccountReviewStyle'
      )
    ) {
      return;
    }

    const style =
      document.createElement('style');

    style.id =
      'glimeAccountReviewStyle';

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
        width:min(720px,100%);
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
        box-shadow:
          0 0 50px
          rgba(255,83,102,.12);
      }

      .glime-review-flag{
        display:inline-flex;
        align-items:center;
        gap:8px;
        color:#ff7180;
        font-weight:900;
        letter-spacing:.12em;
        font-size:12px;
        border:1px solid
          rgba(255,83,102,.5);
        background:
          rgba(255,83,102,.1);
        border-radius:999px;
        padding:7px 11px;
      }

      .glime-review-dot{
        width:9px;
        height:9px;
        border-radius:50%;
        background:#ff5366;
        box-shadow:
          0 0 14px #ff5366;
      }

      .glime-review-title{
        font-size:
          clamp(30px,7vw,54px);
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
        margin:0 0 22px;
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
      }

      .glime-review-pending{
        border-color:#ffad45;
        background:
          rgba(255,173,69,.08);
      }

      .glime-review-pending
      .glime-review-flag{
        color:#ffd79f;
        border-color:
          rgba(255,173,69,.5);
        background:
          rgba(255,173,69,.1);
      }

      .glime-review-pending
      .glime-review-dot{
        background:#ffad45;
        box-shadow:
          0 0 14px #ffad45;
      }

      .glime-review-error{
        border-color:#ff5366;
      }

      .glime-review-admin-card{
        margin-top:14px;
      }

      .glime-review-detail{
        white-space:pre-wrap;
        color:#cbd5e1;
        line-height:1.6;
        padding:14px;
        border:1px solid
          rgba(255,255,255,.08);
        border-radius:10px;
        background:
          rgba(255,255,255,.02);
      }

      @media(max-width:600px){

        #glimeAccountReviewGate{
          padding:
            16px 12px 28px;
        }

        .glime-review-alert{
          padding:21px;
        }

        .glime-review-reason{
          font-size:16px;
        }

        .glime-review-copy{
          font-size:14px;
        }

      }

    `;

    document.head.appendChild(style);
  }


  /* =========================================================
     HELPERS
  ========================================================= */

  function setPending(on){

    document.documentElement
      .classList
      .toggle(
        'glime-account-gate-pending',
        !!on
      );

  }


  function esc(v){

    return String(v ?? '')
      .replace(
        /[&<>"']/g,
        function (m) {

          return {
            '&':'&amp;',
            '<':'&lt;',
            '>':'&gt;',
            '"':'&quot;',
            "'":'&#39;'
          }[m];

        }
      );

  }


  function removeGate(){

    const gate =
      document.getElementById(
        'glimeAccountReviewGate'
      );

    if(gate){
      gate.remove();
    }

    setPending(false);

  }


  /* =========================================================
     CLIENT SUSPENSION SCREEN
  ========================================================= */

  function gateHtml(
    client,
    review
  ){

    const reason =
      client?.suspension_reason ||
      'Access to this GLIME account has been suspended.';

    const status =
      String(
        review?.status || ''
      ).toLowerCase();

    const isPending =
      status === 'pending';

    return `

      <div class="glime-review-shell">

        <div
          class="
            glime-review-alert
            ${isPending
              ? 'glime-review-pending'
              : ''}
          "
        >

          <div class="glime-review-flag">

            <span
              class="glime-review-dot"
            ></span>

            ${
              isPending
                ? 'REVIEW REQUEST PENDING'
                : 'ACCOUNT ACCESS RESTRICTED'
            }

          </div>


          <div class="glime-review-title">
            ACCOUNT SUSPENDED
          </div>


          <p
            class="glime-review-reason"
          >
            ${esc(reason)}
          </p>


          <p class="glime-review-copy">

            Your GLIME account is currently
            suspended.

            Dashboard and billing access are
            unavailable while the suspension
            is active.

            If you believe this suspension
            should be reviewed, you can submit
            a request to the GLIME Admin team.

          </p>


          <div class="glime-review-actions">

            <button
              id="glimeReviewRequestBtn"
              class="glime-review-btn"
              ${
                isPending
                  ? 'disabled'
                  : ''
              }
            >
              ${
                isPending
                  ? 'REVIEW REQUEST SENT'
                  : 'REQUEST REVIEW'
              }
            </button>

          </div>


          <div
            id="glimeReviewStatus"
            class="glime-review-status"
          >
            ${
              isPending
                ? 'Your request is waiting for Admin review.'
                : ''
            }
          </div>

        </div>

      </div>

    `;

  }


  /* =========================================================
     CREATE CLIENT GATE
  ========================================================= */

  async function createClientGate(
    sb,
    client
  ){

    setPending(true);


    /*
     * RLS allows the client to read only
     * their own review requests.
     */

    const existingResult =
      await sb
        .from('account_review_requests')
        .select(
          'id,status,created_at'
        )
        .eq(
          'status',
          'pending'
        )
        .order(
          'created_at',
          {
            ascending:false
          }
        )
        .limit(1);


    const existing =
      existingResult?.error
        ? null
        : (
            existingResult.data || []
          )[0] || null;


    const wrap =
      document.createElement('div');

    wrap.id =
      'glimeAccountReviewGate';

    wrap.innerHTML =
      gateHtml(
        client,
        existing
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


    if(
      btn &&
      !btn.disabled
    ){

      btn.onclick =
        async function(){

          btn.disabled = true;

          btn.textContent =
            'SUBMITTING…';


          const result =
            await sb.rpc(
              'client_request_account_review',
              {
                p_message:null
              }
            );


          if(result.error){

            btn.disabled = false;

            btn.textContent =
              'REQUEST REVIEW';

            status.textContent =
              result.error.message ||
              'Review request could not be submitted.';

            status.style.color =
              '#ff9eaa';

            return;

          }


          btn.textContent =
            'REVIEW REQUEST SENT';

          status.textContent =
            'Your request has been sent to GLIME Admin for review.';

          status.style.color =
            '#9feec9';

        };

    }

  }


  /* =========================================================
     CLIENT ACCOUNT CHECK
  ========================================================= */

  async function clientGate(){

    injectStyle();

    /*
     * Hide the real page immediately.
     * This prevents dashboard/billing UI
     * from flashing before account status
     * is checked.
     */

    setPending(true);


    if(
      document.readyState ===
      'loading'
    ){

      await new Promise(
        function(resolve){

          document.addEventListener(
            'DOMContentLoaded',
            resolve,
            {
              once:true
            }
          );

        }
      );

    }


    const sb =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
          auth:{
            persistSession:true,
            autoRefreshToken:true,
            detectSessionInUrl:true
          }
        }
      );


    const sessionResult =
      await sb.auth.getSession();

    const session =
      sessionResult?.data?.session;


    if(!session?.user){

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


    if(
      q.error ||
      !q.data?.length
    ){

      const wrap =
        document.createElement('div');

      wrap.id =
        'glimeAccountReviewGate';

      wrap.innerHTML = `

        <div
          class="glime-review-shell"
        >

          <div
            class="
              glime-review-alert
              glime-review-error
            "
          >

            <div
              class="glime-review-title"
            >
              ACCOUNT CHECK FAILED
            </div>

            <p
              class="glime-review-reason"
            >
              GLIME could not verify
              your account status.
            </p>

            <p
              class="glime-review-copy"
            >
              For security, access remains
              locked until the account status
              can be verified.
            </p>

            <div
              class="glime-review-actions"
            >

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


      document
        .getElementById(
          'glimeReviewRetry'
        )
        .onclick =
        function(){

          location.reload();

        };


      return;

    }


    const client =
      q.data[0];


    /*
     * IMPORTANT:
     *
     * Suspension is independent of
     * Free Trial / Paid subscription.
     *
     * A paid client with:
     * account_status = suspended
     *
     * gets the same restriction screen.
     */

    if(
      String(
        client.account_status || ''
      ).toLowerCase()
      ===
      'suspended'
    ){

      await createClientGate(
        sb,
        client
      );

      return;

    }


    /*
     * Account is not suspended.
     * Normal page can become visible.
     */

    removeGate();

  }


  /* =========================================================
     ADMIN REVIEW QUEUE
  ========================================================= */

  async function adminGate(){

    if(
      document.readyState ===
      'loading'
    ){

      await new Promise(
        function(resolve){

          document.addEventListener(
            'DOMContentLoaded',
            resolve,
            {
              once:true
            }
          );

        }
      );

    }


    /*
     * admin.html itself already handles:
     *
     * Email authentication
     * Admin authorization
     * AAL2 / TOTP
     *
     * This addon only adds the Review Requests
     * interface after the Admin page exists.
     */

    const sb =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
          auth:{
            persistSession:true,
            autoRefreshToken:true,
            detectSessionInUrl:true
          }
        }
      );


    const nav =
      document.querySelector('nav');

    const main =
      document.querySelector('main');


    if(
      !nav ||
      !main ||
      document.getElementById(
        'reviewNavBtn'
      )
    ){

      return;

    }


    /*
     * Sidebar item
     */

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
      >
        0
      </span>
    `;


    nav.insertBefore(
      navButton,
      nav.querySelector('.logout')
    );


    /*
     * Review view
     */

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


        <div
          style="overflow:auto"
        >

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


    main.appendChild(section);


    const title =
      document.getElementById(
        'title'
      );


    function goReviews(){

      document
        .querySelectorAll('.view')
        .forEach(
          function(x){
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
          function(x){

            x.classList.toggle(
              'active',
              x === navButton
            );

          }
        );


      title.textContent =
        'Review Requests';


      loadReviews();

    }


    navButton.onclick =
      goReviews;


    document
      .getElementById(
        'reviewRefreshBtn'
      )
      .onclick =
      loadReviews;


    document
      .getElementById(
        'reviewStatusFilter'
      )
      .onchange =
      loadReviews;


    /* =======================================================
       LOAD REVIEW REQUESTS
    ======================================================= */

    async function loadReviews(){

      const status =
        document.getElementById(
          'reviewStatusFilter'
        ).value;


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


      if(result.error){

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


      document
        .getElementById(
          'reviewPendingBadge'
        )
        .textContent =
        list.filter(
          function(x){
            return x.status ===
              'pending';
          }
        ).length;


      if(!list.length){

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


      /*
       * Load matching client information.
       */

      const ids =
        [
          ...new Set(
            list
              .map(
                function(x){
                  return x.client_id;
                }
              )
              .filter(Boolean)
          )
        ];


      let clients = [];


      if(ids.length){

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
                'suspension_reason'
              ].join(',')
            )
            .in(
              'client_id',
              ids
            );


        if(!q.error){

          clients =
            q.data || [];

        }

      }


      const map =
        new Map(
          clients.map(
            function(x){
              return [
                x.client_id,
                x
              ];
            }
          )
        );


      rows.innerHTML =
        list.map(
          function(x){

            const c =
              map.get(
                x.client_id
              ) || {};


            const statusClass =
              x.status === 'pending'
                ? 'red'
                : x.status === 'approved'
                  ? 'green'
                  : 'orange';


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
                    c.email || '—'
                  )}
                </td>


                <td>
                  ${esc(
                    c.suspension_reason ||
                    '—'
                  )}
                </td>


                <td>
                  ${esc(
                    new Date(
                      x.created_at
                    ).toLocaleString()
                  )}
                </td>


                <td>

                  <span
                    class="
                      badge
                      ${statusClass}
                    "
                  >
                    ${esc(
                      x.status
                    )}
                  </span>

                </td>


                <td>

                  <button
                    class="btn"
                    data-review-id="${
                      esc(x.id)
                    }"
                  >
                    View
                  </button>

                </td>

              </tr>

            `;

          }
        )
        .join('');


      /*
       * View request details.
       */

      rows
        .querySelectorAll(
          '[data-review-id]'
        )
        .forEach(
          function(btn){

            btn.onclick =
              async function(){

                const result =
                  await sb.rpc(
                    'admin_account_review_get',
                    {
                      p_request_id:
                        btn.dataset.reviewId
                    }
                  );


                if(result.error){

                  alert(
                    result.error.message
                  );

                  return;

                }


                const data =
                  result.data || {};


                const client =
                  data.client || {};

                const request =
                  data.request || {};


                alert(

`Client: ${
  client.full_name || '—'
}

Client ID: ${
  client.client_id || '—'
}

Email: ${
  client.email || '—'
}

Business: ${
  client.business_name || '—'
}

Account Status: ${
  client.account_status || '—'
}

Suspension Reason: ${
  client.suspension_reason || '—'
}

Requested: ${
  request.created_at
    ? new Date(
        request.created_at
      ).toLocaleString()
    : '—'
}

Status: ${
  request.status || '—'
}

Client Message: ${
  request.client_message || '—'
}

Admin Note: ${
  request.admin_note || '—'
}`

                );

              };

          }
        );

    }


    /*
     * Load pending badge once Admin app is ready.
     */

    setTimeout(
      loadReviews,
      1000
    );

  }


  /* =========================================================
     START
  ========================================================= */

  if(isAdmin){

    adminGate()
      .catch(
        function(error){

          console.warn(
            '[GLIME Account Review Admin]',
            error
          );

        }
      );

  }else{

    clientGate()
      .catch(
        function(error){

          console.error(
            '[GLIME Account Review Gate]',
            error
          );

        }
      );

  }

})();
                
