# GLIME Partner Program

This file describes the partner program: what is built, what the frontend expects from the backend,
and the plan for the Agency program. White-label is postponed (see the end of this file).

Program levels:

1. **Referral partner** (built): anyone joins, shares a link, earns commission.
2. **Agency partner** (planned, next): runs many clients from one dashboard, buys plans at a wholesale
   price and sells at its own price.
3. **White-label** (postponed): agency's own logo, name, colours and domain.

---

## 1. Referral program

### Files

| File | Purpose |
| --- | --- |
| `partner.html` / `partner.css` / `partner.js` | Public partner page with the **Continue with Google** button |
| `partner-dashboard.html` / `.css` / `.js` | Partner dashboard (separate from the client dashboard) |
| `partner-docs.html` / `.css` / `.js` | Partner Guide (documentation and terms) |
| `partner-base.css` | Shared styles |
| `partner-config.js` | Single place for commission tiers, cookie days, hold days, minimum payout, payout day, plan prices |
| `partner-referral.js` | Referral capture: reads `?ref=CODE&src=tag`, tracks the click, attributes it to the new client |
| `glime-global-nav.js` | Adds a "Partner Program" link to the public navigation (desktop and mobile) |

`partner-referral.js` is loaded on `index.html`, `signup.html` and `dashboard.html`.
To change a program number, edit `partner-config.js`. The landing page, dashboard and guide all update.

### User flow

1. A visitor opens `partner.html` (via the "Partner Program" link in the site navigation).
2. They press **Continue with Google**. The page calls `supabase.auth.signInWithOAuth({ provider: "google" })`
   with `redirectTo = partner-dashboard.html`.
3. After Google sign-in they land on `partner-dashboard.html`. With no session, the dashboard sends them back to `partner.html`.

### Referral capture (built)

- A visitor opens `https://glime.online/?ref=<code>&src=<tag>`.
- `partner-referral.js` sends `track_click` to the `glime-partner-api` Supabase edge function and keeps the
  returned `click_id` and `expires_at` in `localStorage` (`glime_partner_click`).
- After sign-up or sign-in, `attribute(accessToken)` sends the saved `click_id` for the signed-in client.
- Final (non-retryable) answers: `REFERRAL_CLICK_NOT_FOUND`, `REFERRAL_CLICK_EXPIRED`,
  `REFERRAL_CLICK_ALREADY_USED`, `PARTNER_NOT_ACTIVE`, `PARTNER_SELF_REFERRAL_BLOCKED`,
  `ACCOUNT_NOT_NEW`, `ACCOUNT_TOO_OLD`, `INVALID_CLICK_ID`.

### Supabase setup the frontend relies on

- Google provider enabled in Supabase Auth.
- The full URL of `partner-dashboard.html` added to the Auth redirect URL allow-list
  (for example `https://glime.online/partner-dashboard.html`).

### RPCs the dashboard calls

#### `partner_get_dashboard()` → json

Called on every dashboard load as the signed-in user (`auth.uid()`).
It should create the partner record on first call, then return:

```json
{
  "partner":  { "code": "AB12CD", "status": "active", "tier": "Starter", "joined_at": "2026-10-18T00:00:00Z",
                "payout": { "method": "upi", "display": "UPI · ab***@okbank" } },
  "stats":    { "clicks": 0, "signups": 0, "active_customers": 0,
                "pending_earnings": 0, "available_balance": 0, "lifetime_earnings": 0, "paid_out": 0 },
  "referrals": [ { "masked_name": "Ra*** Traders", "plan": "GLIME Growth", "status": "active",
                   "signed_up_at": "2026-10-01T00:00:00Z", "monthly_commission": 60 } ],
  "earnings":  [ { "month": "2026-10", "amount": 1200, "status": "pending" } ],
  "payouts":   [ { "amount": 2500, "status": "paid", "method": "UPI",
                   "requested_at": "2026-09-10T00:00:00Z", "paid_at": "2026-09-10T00:00:00Z" } ]
}
```

- `partner.code`: letters and numbers. The referral link is `https://glime.online/?ref=<code>&src=<tag>`.
- `referrals[].status`: `signed_up`, `trial`, `active`, `churned`, `refunded`. Names are masked on the server.
- `earnings[].status`: `pending`, `available`, `paid`, `reversed`.
- `payouts[].status`: `processing`, `paid`, `failed`.
- Never return other partners' data. Never return full bank or UPI details.

#### `partner_save_payout_details(p_method text, p_details jsonb)`

Called from the Payouts tab.

- `p_method = "upi"` → `p_details = { "upi_id": "name@bank" }`
- `p_method = "bank"` → `p_details = { "account_holder": "...", "account_number": "...", "ifsc": "..." }`

Store it only for `auth.uid()` and return the masked `display` string through `partner_get_dashboard()`.

### Status and open checks

- Frontend and referral capture are built. Verify the backend side in Supabase (partner tables, the two RPCs,
  commission calculation, hold days and payout flow) before the program goes live.
- Commission numbers, tiers and the Partner Terms text are working defaults. Review them, and have the terms
  checked by a legal advisor, before the program goes live.
- The dashboard page is marked `noindex`.

---

## 2. Agency program (planned)

An agency is a business (for example a marketing agency) that manages many clients on Glime.
Goal: once an agency signs up, almost everything runs automatically.

### How it works (example: "Rahul Marketing")

1. **Join:** Rahul signs up as an *Agency* with Google and fills company details (name, PAN, GST if any).
   Approval is automatic or one click by the admin (decision below).
2. **Add balance:** Rahul adds money to his agency wallet by online payment (for example Rs 5,000).
3. **Add a client:** In the agency dashboard Rahul presses **Add client**, enters client name, WhatsApp number
   and plan. The client's Glime account is created automatically under the agency.
4. **Set up the client:** Rahul opens the client's account and connects WhatsApp, Instagram and auto-replies,
   or sends the client a setup link so the client does it.
5. **Billing:** Each client's plan charge is deducted from the agency wallet every month at the wholesale price.
   The agency charges its client its own price; the difference is the agency's margin.
6. **Low balance:** The agency gets a reminder before the wallet runs out. If it is still not topped up, after a
   grace period the client accounts are paused.
7. **Reports:** The agency sees a report per client and a combined report.

### What runs automatically

Account creation, wallet deduction, invoices, low-balance warnings, pausing and resuming accounts, reports.

### What to build

| # | Item | Notes |
| --- | --- | --- |
| 1 | Agency sign-up and approval | Company details, PAN/GST; admin approves (or auto-approve) |
| 2 | Client management | Add client, client list, switch client; every "open client account" action is logged |
| 3 | Wholesale pricing | Discount by number of clients, kept in `partner-config.js` next to the referral tiers |
| 4 | Agency wallet and billing | Prepaid wallet, monthly deduction per client, GST invoice, low-balance warning, grace period, auto-pause |
| 5 | Client ownership rules | A client belongs to exactly one agency; what happens when an agency leaves or stops paying; client transfer |
| 6 | No double payment | An agency's client never also earns referral commission |
| 7 | Reporting | Usage per client (messages, leads, balance deductions) and an agency summary |
| 8 | Team roles | Agency owner and staff with different permissions |
| 9 | Security | Row-level security: an agency sees only its own clients' data |
| 10 | Admin panel | Approve agencies, view all agencies and clients, change discount, pause an agency |
| 11 | Onboarding | Agency guide, demo account, pitch material |
| 12 | Agency agreement | Separate terms, checked by a legal advisor |

Suggested build order: 1, 2, 3, 4, 5, 9 first; the rest afterwards.

### Likely backend pieces (to be designed)

- Tables: agencies, agency members, agency clients, agency wallet and wallet transactions, agency pricing.
- RPCs / edge function actions: create agency, add client, get agency dashboard, top up wallet, pause/resume client.
- A scheduled job for monthly deduction, warnings and auto-pause.
- Payment gateway integration for wallet top-ups.

### Decisions needed

- Wholesale discount amounts and the client-count thresholds.
- Payment gateway for wallet top-ups.
- Agency approval: automatic or manual.
- Billing model. Recommended: prepaid wallet (money comes first). Alternative: monthly invoice after use.
- Grace period length before a client is paused.

---

## 3. White-label (postponed)

Agency's own logo, brand name, colours and custom domain, with no Glime branding for the client.
To be taken up after the Agency program works. A light version (logo, colours, subdomain) can come first,
and a full custom domain later in a higher plan.
