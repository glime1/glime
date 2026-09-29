/* GLIME — Account Review Decision/Response Add-on
 * Works alongside the existing account-review-flow.js.
 * Adds:
 * 1) Admin response + Approve/Reject actions
 * 2) WhatsApp/Instagram activity evidence in the review modal
 * 3) Client-side display of the Admin response after rejection
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

  const isAdmin =
    path === '/admin' ||
    path.endsWith('/admin') ||
    path === '/admin.html' ||
    path.endsWith('/admin.html');


  function esc(v) {
    return String(v ?? '').replace(
      /[&<>"']/g,
      m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m])
    );
  }


  function client() {
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


  async function aal2(sb) {

    const s =
      await sb.auth.getSession();

    if (!s?.data?.session?.user) {
      return false;
    }

    const a =
      await sb.auth.mfa
        .getAuthenticatorAssuranceLevel();

    return (
      a?.data?.currentLevel === 'aal2'
    );
  }


  /* =========================================================
     ADMIN
     ========================================================= */

  async function bootAdmin() {

    const sb = client();

    if (!sb) return;

    let currentReviewId = null;


    document.addEventListener(
      'click',
      function (e) {

        const b =
          e.target.closest(
            '[data-review-id]'
          );

        if (b) {
          currentReviewId =
            b.dataset.reviewId;
        }

      },
      true
    );


    const timer =
      setInterval(
        async function () {

          if (!currentReviewId) {
            return;
          }


          const modal =
            document.getElementById(
              'glimeReviewAdminModal'
            );


          if (
            !modal ||
            !modal.classList.contains('open')
          ) {
            return;
          }


          if (
            modal.dataset.decisionAddon ===
            currentReviewId
          ) {
            return;
          }


          /*
           * IMPORTANT:
           * Admin review actions require AAL2.
           */

          if (!(await aal2(sb))) {
            return;
          }


          const result =
            await sb.rpc(
              'admin_account_review_get',
              {
                p_request_id:
                  currentReviewId
              }
            );


          if (result.error) {
            return;
          }


          const data =
            result.data || {};

          const req =
            data.request || {};

          const activity =
            data.activity || {};


          modal.dataset.decisionAddon =
            currentReviewId;


          const box =
            modal.querySelector(
              '.glime-review-admin-box'
            );


          if (!box) {
            return;
          }


          const old =
            box.querySelector(
              '.glime-review-decision-addon'
            );


          if (old) {
            old.remove();
          }


          const wrap =
            document.createElement('div');


          wrap.className =
            'glime-review-decision-addon';


          wrap.style.marginTop =
            '14px';


          const wa =
            activity.whatsapp_recent ||
            [];


          const ig =
            activity.instagram_recent ||
            [];


          const msgList =
            (items) => {

              if (!items.length) {

                return `
                  <span
                    style="color:#91a0b3"
                  >
                    No messages found.
                  </span>
                `;

              }


              return items
                .map(
                  m => `
                    <div
                      style="
                        padding:8px 0;
                        border-bottom:
                          1px solid
                          rgba(255,255,255,.07)
                      "
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
                        style="
                          color:#91a0b3
                        "
                      >
                        ${esc(
                          m.created_at || ''
                        )}
                      </small>

                    </div>
                  `
                )
                .join('');
            };


          wrap.innerHTML = `

            <!-- MESSAGE ACTIVITY -->

            <div
              style="
                padding:13px;
                border:
                  1px solid
                  rgba(255,255,255,.08);
                border-radius:10px
              "
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


            <!-- WHATSAPP -->

            <div
              style="
                margin-top:12px;
                padding:13px;
                border:
                  1px solid
                  rgba(255,255,255,.08);
                border-radius:10px
              "
            >

              <b>
                Recent WhatsApp Messages
              </b>

              <br><br>

              ${msgList(wa)}

            </div>


            <!-- INSTAGRAM -->

            <div
              style="
                margin-top:12px;
                padding:13px;
                border:
                  1px solid
                  rgba(255,255,255,.08);
                border-radius:10px
              "
            >

              <b>
                Recent Instagram Messages
              </b>

              <br><br>

              ${msgList(ig)}

            </div>


            ${
              String(
                req.status || ''
              ).toLowerCase() ===
              'pending'

              ? `

                <!-- ADMIN RESPONSE -->

                <div
                  style="
                    margin-top:12px;
                    padding:13px;
                    border:
                      1px solid
                      rgba(255,255,255,.08);
                    border-radius:10px
                  "
                >

                  <b>
                    Admin Response
                  </b>


                  <textarea
                    id="
                      glimeReviewAdminNoteAddon
                    "
                    rows="5"
                    placeholder="
                      Write the response
                      that the client will see...
                    "
                    style="
                      width:100%;
                      margin-top:10px;
                      padding:12px;
                      border-radius:10px;
                      border:
                        1px solid
                        rgba(255,255,255,.15);
                      background:#09111b;
                      color:#fff;
                      resize:vertical
                    "
                  ></textarea>


                  <div
                    style="
                      display:flex;
                      gap:10px;
                      flex-wrap:wrap;
                      margin-top:12px
                    "
                  >

                    <button
                      id="
                        glimeReviewApproveAddon
                      "
                      class="btn"
                    >
                      APPROVE & REACTIVATE
                    </button>


                    <button
                      id="
                        glimeReviewRejectAddon
                      "
                      class="btn"
                    >
                      REJECT & KEEP SUSPENDED
                    </button>

                  </div>


                  <div
                    id="
                      glimeReviewDecisionStatusAddon
                    "
                    style="
                      margin-top:10px;
                      min-height:20px
                    "
                  ></div>

                </div>

              `

              : `

                <!-- EXISTING ADMIN RESPONSE -->

                <div
                  style="
                    margin-top:12px;
                    padding:13px;
                    border:
                      1px solid
                      rgba(255,255,255,.08);
                    border-radius:10px
                  "
                >

                  <b>
                    Admin Response
                  </b>

                  <br><br>

                  ${esc(
                    req.admin_note ||
                    'No Admin response recorded.'
                  )}

                </div>

              `
            }

          `;


          box.appendChild(wrap);


          const note =
            wrap.querySelector(
              '#glimeReviewAdminNoteAddon'
            );


          const status =
            wrap.querySelector(
              '#glimeReviewDecisionStatusAddon'
            );


          /*
           * APPROVE / REJECT
           */

          async function decide(
            action
          ) {

            const text =
              note?.value.trim() || '';


            if (!text) {

              status.textContent =
                'Admin response is required.';

              status.style.color =
                '#ff9eaa';

              note?.focus();

              return;
            }


            wrap
              .querySelectorAll('button')
              .forEach(
                x => {
                  x.disabled = true;
                }
              );


            status.textContent =
              'Saving decision…';


            const r =
              await sb.rpc(
                'admin_account_review_action',
                {
                  p_request_id:
                    currentReviewId,

                  p_action:
                    action,

                  p_admin_note:
                    text
                }
              );


            if (r.error) {

              wrap
                .querySelectorAll('button')
                .forEach(
                  x => {
                    x.disabled = false;
                  }
                );


              status.textContent =
                r.error.message ||
                'Could not save decision.';


              status.style.color =
                '#ff9eaa';

              return;
            }


            status.textContent =
              action === 'approve'
                ? 'Approved. Account reactivated.'
                : 'Rejected. Account remains suspended.';


            status.style.color =
              '#9feec9';


            setTimeout(
              () => {

                modal.classList.remove(
                  'open'
                );


                currentReviewId =
                  null;


                modal.dataset.decisionAddon =
                  '';


                const refresh =
                  document.getElementById(
                    'reviewRefreshBtn'
                  );


                if (refresh) {
                  refresh.click();
                }

              },
              700
            );

          }


          const approve =
            wrap.querySelector(
              '#glimeReviewApproveAddon'
            );


          const reject =
            wrap.querySelector(
              '#glimeReviewRejectAddon'
            );


          if (approve) {

            approve.addEventListener(
              'click',
              () =>
                decide('approve')
            );

          }


          if (reject) {

            reject.addEventListener(
              'click',
              () =>
                decide('reject')
            );

          }

        },
        500
      );


    setTimeout(
      () =>
        clearInterval(timer),
      120000
    );

  }


  /* =========================================================
     CLIENT
     ========================================================= */

  async function bootClient() {

    const sb = client();

    if (!sb) return;


    const timer =
      setInterval(
        async function () {

          const gate =
            document.getElementById(
              'glimeAccountReviewGate'
            );


          if (!gate) {
            return;
          }


          const statusEl =
            document.getElementById(
              'glimeReviewStatus'
            );


          if (!statusEl) {
            return;
          }


          const session =
            await sb.auth.getSession();


          const user =
            session?.data?.session?.user;


          if (!user) {
            return;
          }


          const r =
            await sb
              .from(
                'account_review_requests'
              )
              .select(
                [
                  'id',
                  'status',
                  'created_at',
                  'client_message',
                  'admin_note',
                  'reviewed_at'
                ].join(',')
              )
              .order(
                'created_at',
                {
                  ascending:false
                }
              )
              .limit(1);


          if (
            r.error ||
            !r.data?.length
          ) {
            return;
          }


          const review =
            r.data[0];


          const existing =
            document.getElementById(
              'glimeAdminResponseAddon'
            );


          if (existing) {
            existing.remove();
          }


          /*
           * Show Admin response only
           * when review is rejected.
           */

          if (
            review.admin_note &&
            String(
              review.status
            ).toLowerCase() ===
              'rejected'
          ) {

            const box =
              document.createElement(
                'div'
              );


            box.id =
              'glimeAdminResponseAddon';


            box.style.cssText = `
              margin-top:14px;
              padding:14px;
              border:
                1px solid
                rgba(255,83,102,.35);
              border-radius:10px;
              background:
                rgba(255,83,102,.06);
              color:#e8edf3;
              line-height:1.6;
            `;


            box.innerHTML =
              `
                <b>
                  ADMIN RESPONSE
                </b>

                <br><br>

                ${esc(
                  review.admin_note
                )}
              `;


            const shell =
              gate.querySelector(
                '.glime-review-alert'
              );


            const copy =
              shell?.querySelector(
                '.glime-review-copy'
              );


            if (copy) {

              copy.insertAdjacentElement(
                'afterend',
                box
              );

            } else if (shell) {

              shell.appendChild(
                box
              );

            }

          }

        },
        1000
      );


    setTimeout(
      () =>
        clearInterval(timer),
      120000
    );

  }


  /* =========================================================
     START
     ========================================================= */

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      () => {

        if (isAdmin) {
          bootAdmin();
        } else {
          bootClient();
        }

      },
      {
        once:true
      }
    );

  } else {

    if (isAdmin) {
      bootAdmin();
    } else {
      bootClient();
    }

  }

})();
