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

## Still to build (the frontend calls these and shows a "switches on soon" message until they exist)

| RPC | Arguments | Returns | Notes |
| --- | --- | --- | --- |
| `agency_add_client` | `p_name, p_phone, p_email, p_plan_code (nullable), p_client_price (nullable)` | `{ ok, client_id }` | Create the client account under the agency; if a plan is given, charge the wallet through `glime_agency_charge_plan`. Block a client that already belongs to another agency (`CLIENT_ALREADY_EXISTS`). Insufficient balance: `INSUFFICIENT_BALANCE`. |
| `agency_create_topup_order` | `p_amount numeric` | `{ checkout_url }` or `{ razorpay_order_id, key_id }` | Create the payment order with `metadata.agency_id`, so `glime_agency_topup_on_paid` credits the wallet. Enforce `min_topup`. |
| `agency_set_client_status` | `p_client_id, p_status ('active' or 'paused')` | `{ ok }` | Agency pause or resume of one client. Log in `glime_agency_event_log`. |
| `agency_open_client` | `p_client_id` | `{ url }` (optional) | Log the access in `glime_agency_event_log`; return a short-lived sign-in link only if you build impersonation. |
| `agency_get_reports` | `p_days int` | rows `{ client_id, messages, leads }` | Usage per client for the last N days. |
| `agency_list_invoices` | none | rows `{ id, invoice_number, issued_at, total_amount, url }` | GST invoices for wallet top-ups and plan charges (`url` must be https). |
| `agency_update_profile` | `p_details jsonb { contact_phone, city, website, pan, gst }` | `{ ok }` | Same validation as `agency_apply`. |
| `agency_list_team` | none | rows `{ id, email, role, status }` | Owner row has role `owner`. |
| `agency_invite_member` | `p_email, p_role ('manager','staff','viewer')` | `{ ok }` | Owner only. |
| `agency_remove_member` | `p_member_id` | `{ ok }` | Owner only. |
| `agency_submit_support` | `p_subject, p_message` | `{ ok }` | Store the ticket and notify admin. |

Team roles used in `partner-config.js`: manager (clients and plans, no wallet or team), staff (view and set up clients), viewer (read only).

## Rules the frontend assumes

- A client belongs to exactly one agency; an agency client never earns referral commission.
- RLS: an agency reads only its own rows; all writes go through the RPCs above.
- Wallet low balance and the `grace_days` auto-pause run in the scheduled job (`glime_agency_run_billing`).
- Supabase Auth redirect allow-list must include `https://glime.online/agency.html` and `https://glime.online/agency-dashboard.html`.
- White-label stays postponed (see `PARTNER_PROGRAM.md`).
