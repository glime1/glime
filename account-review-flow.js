/* GLIME — Account Review Flow
 *
 * PURPOSE
 * - Suspended Free-Trial and Paid clients are blocked from normal dashboard/billing UI.
 * - Suspended clients can submit one account-review request.
 * - Admin sees the requests inside Admin -> Review Requests.
 * - Admin routes (/admin and /admin.html) NEVER run the client suspension gate.
 *
 * IMPORTANT
 * - This is a UI/access gate. Database/RPC/Edge Function security remains authoritative.
 */

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

  /*
   * IMPORTANT:
   * Your live Admin URL is /admin, not only /admin.html.
   * Never let the clientGate run on an Admin route.
   */
  const isAdmin =
    path === '/admin' ||
    path.endsWith('/admin') ||
    path === '/admin.html' ||
    path.endsWith('/admin.html');

  function esc(v) {
    return String(v ?? '').replace(
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

  function injectStyle() {
    if (document.getElementById('glimeAccountReviewStyle')) return;

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
          system-ui,-apple-system,BlinkMacSystemFont,
          "Segoe UI",Roboto,sans-serif;
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
        box-shadow:0 0 50px rgba(255,83,102,.12);
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

      .glime-review-dot{
        width:9px;
        height:9px;
        border-radius:50%;
        background:#ff5366;
        box-shadow:0 0 14px #ff5366;
      }

      .glime-review-alert.pending{
        border-color:#ffad45;
        background:rgba(255,173,69,.08);
      }

      .glime-review-alert.pending .glime-review-flag{
        color:#ffd79f;
        border-color:rgba(255,173,69,.5);
        background:rgba(255,173,69,.1);
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
        line-height:1.55;
      }

      .glime-review-error{
        border-color:#ff5366;
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
        width:min(720px,100%);
        max-height:90vh;
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

        .glime-review-copy{
          font-size:14px;
        }

        .glime-review-admin-kv{
          grid-template-columns:1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function setGatePending(on) {
    document.documentElement.classList.toggle(
      'glime-account-gate-pending',
      !!on
    );
  }

  function removeClientGate() {
    const gate = document.getElementById(
      'glimeAccountReviewGate'
    );

    if (gate) gate.remove();

    setGatePending(false);
  }

  function reviewScreenHtml(client, review) {
    const reason =
      client?.suspension_reason ||
      'Access to this GLIME account has been suspended.';

    const pending =
      String(review?.status || '').toLowerCase() ===
      'pending';

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
            If you believe this suspension should be reviewed,
            you can submit a request to the GLIME Admin team.
          </p>

          <div class="glime-review-actions">
            <button
              id="glimeReviewRequestBtn"
              class="glime-review-btn"
              ${pending ? 'disabled' : ''}
            >
              ${
                pending
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
              pending
                ? 'Your request is waiting for Admin review. Our Admin team will review your request within 2–3 working days. During this review, your dashboard and billing access will remain unavailable.'
                : ''
            }
          </div>

        </div>
      </div>
    `;
  }

  async function createClientGate(sb, client) {
    setGatePending(true);

    const existingResult = await sb
      .from('account_review_requests')
      .select('id,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    const existing =
      existingResult?.error
        ? null
        : (existingResult.data || [])[0] || null;

    const wrap = document.createElement('div');
    wrap.id = 'glimeAccountReviewGate';

    wrap.innerHTML = reviewScreenHtml(
      client,
      existing
    );

    document.body.prepend(wrap);

    const btn = document.getElementById(
      'glimeReviewRequestBtn'
    );

    const status = document.getElementById(
      'glimeReviewStatus'
    );

    if (btn && !btn.disabled) {
      btn.onclick = async function () {
        btn.disabled = true;
        btn.textContent = 'SUBMITTING…';

        const result = await sb.rpc(
          'client_request_account_review',
          {
            p_message: null
          }
        );

        if (result.error) {
          btn.disabled = false;
          btn.textContent = 'REQUEST REVIEW';

          status.textContent =
            result.error.message ||
            'Review request could not be submitted.';

          status.style.color = '#ff9eaa';
          return;
        }

        btn.textContent = 'REVIEW REQUEST SENT';

        status.textContent =
          'Your review request has been submitted. Our Admin team will review your request within 2–3 working days. During this review, your dashboard and billing access will remain unavailable.';

        status.style.color = '#9feec9';
      };
    }
  }

  async function clientGate() {
    injectStyle();
    setGatePending(true);

    if (document.readyState === 'loading') {
      await new Promise(function (resolve) {
        document.addEventListener(
          'DOMContentLoaded',
          resolve,
          { once: true }
        );
      });
    }

    if (!window.supabase) {
      return;
    }

    const sb = window.supabase.createClient(
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

    const sessionResult =
      await sb.auth.getSession();

    const session =
      sessionResult?.data?.session;

    if (!session?.user) {
      location.replace('login.html');
      return;
    }

    const q = await sb
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
      .eq('auth_user_id', session.user.id)
      .limit(1);

    if (q.error || !q.data?.length) {
      const wrap = document.createElement('div');
      wrap.id = 'glimeAccountReviewGate';

      wrap.innerHTML = `
        <div class="glime-review-shell">
          <div class="glime-review-alert glime-review-error">

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
      ).onclick = function () {
        location.reload();
      };

      return;
    }

    const client = q.data[0];

    /*
     * Suspension is independent of subscription/trial.
     * Paid + suspended is blocked exactly like trial + suspended.
     */
    if (
      String(client.account_status || '')
        .toLowerCase() === 'suspended'
    ) {
      await createClientGate(sb, client);
      return;
    }

    removeClientGate();
  }

  function adminStatusClass(status) {
    status = String(status || '').toLowerCase();

    if (status === 'pending') return 'red';
    if (status === 'approved') return 'green';
    if (status === 'rejected') return 'orange';

    return 'blue';
  }

  async function adminGate() {
    injectStyle();

    if (document.readyState === 'loading') {
      await new Promise(function (resolve) {
        document.addEventListener(
          'DOMContentLoaded',
          resolve,
          { once: true }
        );
      });
    }

    /*
     * Admin page authentication remains controlled by admin.html.
     * This addon only adds the Review Requests UI.
     */
    const sb = window.supabase.createClient(
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

    const nav = document.querySelector('nav');
    const main = document.querySelector('main');

    if (!nav || !main) return;

    if (document.getElementById('reviewNavBtn')) return;

    const navButton =
      document.createElement('button');

    navButton.id = 'reviewNavBtn';
    navButton.dataset.view = 'reviews';

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
      nav.insertBefore(navButton, logout);
    } else {
      nav.appendChild(navButton);
    }

    const section =
      document.createElement('section');

    section.className = 'view';
    section.id = 'view-reviews';

    section.innerHTML = `
      <div class="card">

        <h3>Account Review Requests</h3>

        <p class="sub">
          Suspended clients who requested an Admin review.
          Suspension can apply to both Free Trial and Paid clients.
        </p>

        <div class="toolbar">

          <select
            id="reviewStatusFilter"
            style="max-width:220px"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
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

            <tbody id="reviewRows"></tbody>

          </table>

        </div>

      </div>
    `;

    main.appendChild(section);

    const title =
      document.getElementById('title');

    function goReviews() {
      document
        .querySelectorAll('.view')
        .forEach(function (x) {
          x.classList.remove('active');
        });

      section.classList.add('active');

      document
        .querySelectorAll(
          'nav button[data-view]'
        )
        .forEach(function (x) {
          x.classList.toggle(
            'active',
            x === navButton
          );
        });

      if (title) {
        title.textContent =
          'Review Requests';
      }

      loadReviews();
    }

    navButton.onclick = goReviews;

    document.getElementById(
      'reviewRefreshBtn'
    ).onclick = loadReviews;

    document.getElementById(
      'reviewStatusFilter'
    ).onchange = loadReviews;

    function openAdminReviewModal(data) {
      let modal =
        document.getElementById(
          'glimeReviewAdminModal'
        );

      if (!modal) {
        modal =
          document.createElement('div');

        modal.id =
          'glimeReviewAdminModal';

        document.body.appendChild(modal);
      }

      const client =
        data?.client || {};

      const request =
        data?.request || {};

      modal.innerHTML = `
        <div class="glime-review-admin-box">

          <div class="glime-review-admin-head">

            <div>
              <h2 style="margin:0">
                Account Review
              </h2>

              <div
                style="
                  color:#91a0b3;
                  margin-top:4px
                "
              >
                ${esc(client.client_id || '—')}
              </div>
            </div>

            <button
              class="btn"
              id="glimeReviewAdminClose"
            >
              Close
            </button>

          </div>

          <div class="glime-review-admin-kv">

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
                ${esc(client.email || '—')}
              </b>
            </div>

            <div>
              <small>Business</small>
              <b>
                ${esc(client.business_name || '—')}
              </b>
            </div>

            <div>
              <small>Account Status</small>
              <b>
                ${esc(client.account_status || '—')}
              </b>
            </div>

            <div>
              <small>Suspension Reason</small>
              <b>
                ${esc(
                  client.suspension_reason || '—'
                )}
              </b>
            </div>

            <div>
              <small>Request Status</small>
              <b>
                ${esc(request.status || '—')}
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
            <b>Client Message</b>

            <br><br>

            ${esc(
              request.client_message ||
              'No additional message was provided.'
            )}
          </div>

          <div
            class="glime-review-admin-message"
          >
            <b>Admin Note</b>

            <br><br>

            ${esc(
              request.admin_note ||
              'No Admin note yet.'
            )}
          </div>

        </div>
      `;

      modal.classList.add('open');

      document.getElementById(
        'glimeReviewAdminClose'
      ).onclick = function () {
        modal.classList.remove('open');
      };
    }

    async function loadReviews() {
      /*
       * Do not query the admin RPC until the main admin
       * authentication flow has reached AAL2.
       */
      const sessionResult =
        await sb.auth.getSession();

      const session =
        sessionResult?.data?.session;

      if (!session?.user) return;

      const aal =
        await sb.auth.mfa
          .getAuthenticatorAssuranceLevel();

      if (
        aal?.data?.currentLevel !== 'aal2'
      ) {
        return;
      }

      const status =
        document.getElementById(
          'reviewStatusFilter'
        ).value;

      const result =
        await sb.rpc(
          'admin_account_review_list',
          {
            p_status: status || null,
            p_limit: 200
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
              ${esc(result.error.message)}
            </td>
          </tr>
        `;
        return;
      }

      const list =
        result.data || [];

      /*
       * Badge must always show the total number of
       * pending requests, even when the selected filter
       * is Approved/Rejected/All.
       */
      let pendingCount = 0;

      if (status !== 'pending') {
        const pendingResult =
          await sb.rpc(
            'admin_account_review_list',
            {
              p_status: 'pending',
              p_limit: 200
            }
          );

        if (!pendingResult.error) {
          pendingCount =
            (pendingResult.data || []).length;
        }
      } else {
        pendingCount =
          list.filter(function (x) {
            return x.status === 'pending';
          }).length;
      }

      const badge =
        document.getElementById(
          'reviewPendingBadge'
        );

      if (badge) {
        badge.textContent =
          String(pendingCount);
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
              .map(function (x) {
                return x.client_id;
              })
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
                'suspension_reason'
              ].join(',')
            )
            .in('client_id', ids);

        if (!q.error) {
          clients = q.data || [];
        }
      }

      const map =
        new Map(
          clients.map(function (x) {
            return [x.client_id, x];
          })
        );

      rows.innerHTML =
        list.map(function (x) {
          const c =
            map.get(x.client_id) || {};

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
                  ${esc(x.client_id)}
                </span>
              </td>

              <td>
                ${esc(c.email || '—')}
              </td>

              <td>
                ${esc(
                  c.suspension_reason || '—'
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
                  class="
                    badge
                    ${adminStatusClass(x.status)}
                  "
                >
                  ${esc(x.status)}
                </span>
              </td>

              <td>
                <button
                  class="btn"
                  data-review-id="${esc(x.id)}"
                >
                  View
                </button>
              </td>

            </tr>
          `;
        }).join('');

      rows
        .querySelectorAll(
          '[data-review-id]'
        )
        .forEach(function (btn) {
          btn.onclick = async function () {
            const result =
              await sb.rpc(
                'admin_account_review_get',
                {
                  p_request_id:
                    btn.dataset.reviewId
                }
              );

            if (result.error) {
              alert(
                result.error.message
              );
              return;
            }

            openAdminReviewModal(
              result.data || {}
            );
          };
        });
    }

    /*
     * The Admin page itself decides when AAL2 is reached.
     * Retry a few times so the Review Requests badge becomes
     * available after Admin login without affecting login.
     */
    let attempts = 0;

    const bootTimer =
      setInterval(
        async function () {
          attempts += 1;

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
                aal?.data?.currentLevel === 'aal2'
              ) {
                clearInterval(bootTimer);
                await loadReviews();
              }
            }
          } catch (e) {
            console.warn(
              '[GLIME Review Requests]',
              e
            );
          }

          if (attempts >= 30) {
            clearInterval(bootTimer);
          }
        },
        1000
      );
  }

  /*
   * START
   */
  if (isAdmin) {
    adminGate().catch(function (error) {
      console.warn(
        '[GLIME Account Review Admin]',
        error
      );
    });
  } else {
    clientGate().catch(function (error) {
      console.error(
        '[GLIME Account Review Client]',
        error
      );

      setGatePending(false);
    });
  }

})();
