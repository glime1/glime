# GLIME Agency — what the frontend expects from the backend

Frontend: `agency.html/.css/.js` (apply page), `agency-dashboard.html/.css/.js` (dashboard),
`admin-agency-addon.js` (admin approvals). Numbers live in `partner-config.js` (`GLIME_PARTNER.agency`);
keep them equal to `glime_agency_settings` in Supabase.

## Already in Supabase (used as-is)

| RPC | Used by |
| --- | --- |
| `agency_apply(p_details jsonb)` | apply page |
| `agency_get_dashboard()` | dashboard (agency, wallet, stats, tiers, plans, grace_days, clients, transactions) |
| `agency_set_client_plan(p_client_id, p_plan_code)` | Clients > Manage |
| `agency_set_client_price(p_client_id, p_price)` | Clients > Manage |
| `agency_cancel_client_plan(p_client_id)` | Clients > Manage |
| `admin_agency_list(p_status)`, `admin_agency_review(p_agency_id, p_action, p_note)`, `admin_agency_wallet_credit(...)` | admin addon |

## Edge functions (built)

Base URL `https://ufoulgbiqgjriwapuopc.supabase.co/functions/v1/<name>`, headers `Authorization: Bearer <access_token>` and `apikey`. Replies are `{ ok: true, ... }` or `{ ok: false, error: "CODE" }`.

| Task | Function | Body |
| --- | --- | --- |
| Add client | `glime-agency-api` | `{ action: "create_client", name, phone, email, plan_code, client_price }` (returns `plan_charged`, `plan_error`, `setup_link`) |
| Open client | `glime-agency-api` | `{ action: "open_client", client_id }` (returns `url`) |
| Setup link again | `glime-agency-api` | `{ action: "client_setup_link", client_id }` |
| Wallet top-up | `glime-agency-wallet` | `{ action: "topup_create_order", amount }` (returns `razorpay_order_id`, `key_id`, read from `data` if present) |
| Invoice PDF | `glime-agency-invoice` | `GET ?invoice_id=<id>` (the dashboard downloads it with the Authorization header) |

## RPCs the dashboard calls that you still need to confirm or build

Until each exists, its screen shows a "switches on soon" message.

| RPC | Arguments | Returns | Notes |
| --- | --- | --- | --- |
| `agency_set_client_status` | `p_client_id, p_status ('active' or 'paused')` | `{ ok }` | Agency pause or resume of one client. Log in `glime_agency_event_log`. |
| `agency_get_reports` | `p_days int` | rows `{ client_id, messages, leads }` | Usage per client for the last N days. |
| `agency_list_invoices` | none | rows `{ id, invoice_number, issued_at, total_amount }` | GST invoices; the PDF itself comes from `glime-agency-invoice`. |
| `agency_update_profile` | `p_details jsonb { contact_phone, city, website, pan, gst }` | `{ ok }` | Same validation as `agency_apply`. |
| `agency_list_team` | none | rows `{ id, email, role, status }` | Owner row has role `owner`. |
| `agency_invite_member` | `p_email, p_role ('manager','staff','viewer')` | `{ ok }` | Owner only. |
| `agency_remove_member` | `p_member_id` | `{ ok }` | Owner only. |
| `agency_submit_support` | `p_subject, p_message` | `{ ok }` | Store the ticket and notify admin. |
| `agency_get_activity` | `p_limit int` | rows `{ event_type, client_id, created_at }` | Reads `glime_agency_event_log` for the signed-in agency (Activity tab). |

Error codes the dashboard shows friendly messages for: PHONE_ALREADY_USED, EMAIL_ALREADY_REGISTERED, INVALID_PHONE, INVALID_EMAIL, DAILY_LIMIT_REACHED, WALLET_UNAVAILABLE, INSUFFICIENT_BALANCE, INVALID_STATUS, INVALID_ROLE, MEMBER_ALREADY_EXISTS, CANNOT_INVITE_OWNER, TEAM_LIMIT_REACHED, MEMBER_NOT_FOUND, INVALID_SUBJECT, INVALID_MESSAGE, TOO_MANY_REQUESTS, NOTHING_TO_UPDATE, INVALID_PAN, INVALID_GST, INVALID_CITY.

Team roles used in `partner-config.js`: manager (clients and plans, no wallet or team), staff (view and set up clients), viewer (read only).

## Rules the frontend assumes

- A client belongs to exactly one agency; an agency client never earns referral commission.
- RLS: an agency reads only its own rows; all writes go through the RPCs and edge functions above.
- Wallet low balance and the `grace_days` auto-pause run in the scheduled job (`glime_agency_run_billing`).
- Supabase Auth redirect allow-list must include `https://glime.online/agency.html` and `https://glime.online/agency-dashboard.html`.
- White-label stays postponed (see `PARTNER_PROGRAM.md`).
