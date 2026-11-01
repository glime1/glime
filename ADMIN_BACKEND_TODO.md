# Admin Panel: Backend To-Do

Everything below is what the admin frontend still needs from Supabase project "Glime 1".
The frontend never breaks if an item is missing: the tab or card just says the backend is not ready,
or the Command Center skips that source.

## 1. What changed in the admin (summary)

| Area | Change |
| --- | --- |
| `admin-command-center-addon.js` (new) | Real Overview: KPIs, "Needs your attention" queue, signups per week, trials ending soon, recent signups, quick search (press `/` or `Ctrl+K`). Replaces the old placeholder cards (the old "72 / 76" style numbers). |
| `admin-payments-addon.js` (new) | **Payments** tab: every client payment account, KYC status, balances, GLIME fee earned, failed payouts; freeze payouts, suspend payments, edit fee / hold / settlement. Uses existing RPCs only. |
| `admin-data-requests-addon.js` (new) | **Data Requests** tab: data-deletion requests with the 30-day wait, purge button with typed confirmation. Uses existing RPCs only. |
| `admin-partner-addon.js` (new) | **Partners** tab. Needs the RPCs in section 2. |
| `admin.html` | One shared Supabase client (`window.supabaseClient`) for all addons. Safety Monitor counters now show real totals (exact counts), not the length of a 80-row list. Old Overview cards are kept but hidden once the Command Center loads. |
| Removed (loaded by no page) | `admin-modules-addon.js`, `admin-payment-addon.js`, `admin-instagram-addon.js`, `voice-provider-admin-addon.js`, `voice-provider-provision-addon.js`. `account-review-decision-addon.js` is no longer loaded on admin.html (it does nothing there); the file stays because `dashboard.html` uses it. |

The new tabs appear in the phone bottom-nav "More" sheet automatically.

## 2. Required: Partners RPCs

Full contract is in `ADMIN_PARTNER_BACKEND_SPEC.md`:

- `admin_partner_list(p_status text default null) returns json`
- `admin_partner_referrals(p_partner_id uuid default null, p_limit int default 500) returns json`

The Command Center also reads `admin_partner_list` (partner count, pending applications, signups).

## 3. Recommended

### 3.1 Partner approve / reject / suspend
`admin_partner_review(p_partner_id uuid, p_action text, p_note text) returns json`
- Actions: `approve`, `reject`, `suspend`, `reactivate`. Note required for reject and suspend.
- Update `glime_partners.status`, write an `audit_log` row, return `{ "ok": true }`.
- Same pattern as `admin_agency_review`. Tell me when it exists and I add the buttons to the Partners tab.

### 3.2 One-call dashboard numbers
`admin_dashboard_summary() returns json`
Today the Command Center loads up to 500 clients and counts in the browser. That works for hundreds of
clients but not for tens of thousands. Suggested shape:
```json
{ "clients": { "total": 0, "active": 0, "suspended": 0, "trial_active": 0, "trial_converted": 0, "trial_expired": 0, "new_7d": 0, "new_30d": 0 },
  "signups_by_week": [ { "week_start": "2026-09-14", "count": 0 } ],
  "trials_ending": [ { "client_id": "GLM-0001", "name": "", "ends_at": "..." } ],
  "queues": { "reviews": 0, "agencies": 0, "partners": 0, "contacts": 0, "feedback": 0, "deletions_due": 0, "failed_payouts": 0, "kyc_pending": 0 } }
```
Check `is_glime_admin()` first. Once it exists I switch the Command Center to it.

### 3.3 Revenue (money in)
`admin_revenue_summary(p_from date, p_to date) returns json`
- Subscription revenue by month (from `glime_billing_subscriptions` / payments), active paying clients, MRR,
  churned clients, trial to paid conversion.
- GLIME fee earned from client payments (`gateway_payments.fee_paise` minus `fee_reversed_paise`).
- The Overview currently shows "Paid / Payment Records: 0" because the subscriptions table is empty for the
  admin read. This RPC would give the admin a real revenue card.

### 3.4 Audit coverage
`admin_client_account_action` and `admin_client_profile_update` should write to `audit_log`
(`admin_payments_*` already do). The old browser-side audit wrappers in `admin-control-gap-addon.js`
no longer fire because the secure account tab calls these RPCs directly. Also, that file only audits
the login of `admin@glime.online`; use `is_glime_admin()` instead of a hardcoded email.

### 3.5 Admin check on the server, not the email
`admin.html` compares the login email with `admin@glime.online` in the browser. That is only a convenience.
Make sure every `admin_*` RPC checks `is_glime_admin()` AND that the session is `aal2` (2FA),
so a second admin or a stolen password alone is never enough.

## 4. Optional, for later

| Idea | Backend needed |
| --- | --- |
| Clients table with plan, MRR and last-active columns | Extend `admin_clients_list` with `plan_name`, `mrr`, `last_active_at`, `messages_30d` |
| Per-client usage (WhatsApp / Instagram messages, AI tokens) in the Usage tab | `admin_client_usage(p_client_id text, p_days int)` |
| Maintenance banner for all clients | table `glime_announcements` + `admin_set_announcement(...)` |
| Admin team with roles (support, finance, read-only) | table `glime_admin_users(user_id, role)`, and make `is_glime_admin()` / a new `admin_role()` read it |
| Audit log CSV export | `admin_audit_list` already exists; only a frontend button is needed |
| Failed-webhook / error monitor | table of recent webhook failures + `admin_system_health()` |

## 5. Needs your decision

1. **Partner status values.** Real values in `glime_partners.status` (the filter assumes `active`, `pending`, `suspended`, `rejected`).
2. **`reset-admin.html`.** It is linked from nowhere and hardcoded to `admin@glime.online`. Keep it only if you want a reset path.
   If you keep it, in the Supabase dashboard set a rate limit on reset emails, and add `{{ .Token }}` to the recovery email
   template (the page asks for a 6-digit code).
3. **Duplicate "Permanent delete" button.** `admin-control-gap-addon.js` and `admin-client-profile-account-secure-addon.js`
   both inject one into the Account tab. I left both untouched (this is risky code). Say the word and I remove the one in `admin-control-gap-addon.js`.
