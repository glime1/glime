# Admin Partners Tab: Backend Spec

The admin panel has a **Partners** tab (`admin-partner-addon.js`, loaded from `admin.html`).
It shows which partners applied, their status, how many people came through each partner's
referral link, and the list of those referred clients.

The frontend is done and pushed. It needs **two RPC functions** in Supabase project "Glime 1".
Until they exist, the tab shows: "Backend is not ready yet: the admin_partner_list /
admin_partner_referrals functions are missing in Supabase."

---

## Rules for both functions

- Schema `public`, `language plpgsql` (or sql), `security definer`, `set search_path = public`.
- First line of each function: if `not is_glime_admin()` then `raise exception 'not_admin'`.
  (Same check the agency admin RPCs use. The frontend maps `not_admin` to "Admin access is required.")
- `revoke all on function ... from public, anon;` then `grant execute ... to authenticated;`
- Return full, **unmasked** data (admin is allowed to see real names and emails).
  Do not use `glime_partner_mask_name` here.
- Return type: `json` (a JSON array). The frontend also accepts `{ "rows": [...] }`.
- Numbers must be real numbers (not strings). Missing values: `0` for counts and money, `null` for dates.

---

## 1. `admin_partner_list(p_status text default null) returns json`

One row per partner, newest applicants included, all statuses when `p_status` is null.
The frontend always calls it with `p_status = null` and filters on the page.

### Row shape

| Field | Type | Source |
| --- | --- | --- |
| `id` | uuid | `glime_partners.id` |
| `partner_code` | text | `glime_partners.partner_code` |
| `display_name` | text | `glime_partners.display_name` |
| `business_name` | text | `glime_partners.business_name` |
| `contact_email` | text | `glime_partners.contact_email` |
| `status` | text | `glime_partners.status` (expected: `active`, `pending`, `suspended`, `rejected`) |
| `created_at` | timestamptz | `glime_partners.created_at` (shown as "applied") |
| `terms_accepted_at` | timestamptz | `glime_partners.terms_accepted_at` |
| `payout_setup_status` | text | `glime_partners.payout_setup_status` |
| `tier` | text | `glime_partner_tier_for(active_customers)` (use its name/label output) |
| `clicks` | int | count of `glime_partner_referral_clicks` where `partner_id = id` |
| `signups` | int | count of `glime_partner_referrals` where `partner_id = id` |
| `active_customers` | int | `glime_partner_active_customers(id)` |
| `paying_customers` | int | count of `glime_partner_referrals` where `partner_id = id` and `first_paid_at is not null` |
| `pending_earnings` | numeric | sum of `glime_partner_commissions.commission_amount` where `status` is `pending` or `available` (not yet paid) |
| `lifetime_earnings` | numeric | sum of `commission_amount` where `status <> 'reversed'` |
| `paid_out` | numeric | sum of `glime_partner_payouts.amount` where `status = 'paid'` |

Order: `created_at desc`.

### Notes

- Use `left join` / subqueries so a partner with no clicks, referrals or commissions still appears (with zeros).
- If the real `status` values in `glime_partners` differ from the four above, the frontend still shows
  whatever text is returned; only the filter dropdown uses the four names. Tell me the real values and I will update the dropdown.

---

## 2. `admin_partner_referrals(p_partner_id uuid default null, p_limit int default 500) returns json`

One row per referred client.
- `p_partner_id` null: referrals of **all** partners (used by the "All referrals" view).
- `p_partner_id` set: only that partner's referrals (used when "View referred clients" is opened).

Clamp `p_limit` to between 1 and 1000. Order: `attributed_at desc`.

### Row shape

| Field | Type | Source |
| --- | --- | --- |
| `referral_id` | uuid | `glime_partner_referrals.id` |
| `partner_id` | uuid | `glime_partner_referrals.partner_id` |
| `partner_name` | text | `glime_partners.display_name` (fallback `business_name`) |
| `partner_code` | text | `glime_partners.partner_code` |
| `client_id` | text | `glime_partner_referrals.referred_client_id` (the GLM-xxxx id) |
| `client_name` | text | client's full name from `client_data`, joined on `client_id` |
| `client_email` | text | client's email from `client_data` |
| `business_name` | text | client's business name from `client_data` |
| `plan` | text | client's current or latest paid plan name (from `glime_billing_subscriptions`); `null` if none |
| `status` | text | `glime_partner_referrals.status` (expected: `signed_up`, `trial`, `active`, `churned`, `refunded`) |
| `attributed_at` | timestamptz | `glime_partner_referrals.attributed_at` (shown as "signed up") |
| `first_paid_at` | timestamptz | `glime_partner_referrals.first_paid_at` |
| `eligible_until` | timestamptz | `glime_partner_referrals.eligible_until` |
| `commission_total` | numeric | sum of `glime_partner_commissions.commission_amount` where `referral_id = id` and `status <> 'reversed'` |

### Notes

- Join `client_data` with a `left join`, so a referral still shows if the client row is missing.
  Use the same client columns that `admin_clients_list` already reads (`client_id`, `full_name` / `client_name`, `email`, `business_name`).
- If a client has several subscriptions, return the most recent one for `plan`.

---

## Test after creating

Run as the admin user (a normal user must get `not_admin`):

```sql
select admin_partner_list(null);
select admin_partner_referrals(null, 50);
select admin_partner_referrals('<partner uuid>', 50);
```

Then open `admin.html` > **Partners**. Check:

1. The summary cards show totals (partners, clicks, signups, active customers, earnings, paid out).
2. Each partner card shows its own numbers; "Signups via referral" equals the number of rows in "View referred clients".
3. "All referrals" lists every referred client with the partner who brought them.
4. Export CSV downloads the current filtered view.

## Out of scope (not built)

Approve / reject / suspend of a partner from the admin panel. The tab is view-only for now.
If you want it, it needs an `admin_partner_review(p_partner_id, p_action, p_note)` RPC like the agency one,
and a small frontend change.
