# GLIME Partner Program — frontend notes

This file describes what the partner frontend does and what data it expects from the backend.
The backend is built separately; the frontend works without it and shows friendly empty states.

## Files

| File | Purpose |
| --- | --- |
| `partner.html` / `partner.css` / `partner.js` | Public partner page with the **Continue with Google** button |
| `partner-dashboard.html` / `.css` / `.js` | Partner dashboard (separate from the client dashboard) |
| `partner-docs.html` / `.css` / `.js` | Partner Guide (documentation and terms) |
| `partner-base.css` | Shared styles |
| `partner-config.js` | Single place for commission tiers, cookie days, hold days, minimum payout, payout day, plan prices |
| `glime-global-nav.js` | Adds a "Partner Program" link to the public navigation (desktop and mobile) on pages that load it |

To change a program number, edit `partner-config.js`. The landing page, dashboard and guide all update.

## User flow

1. A visitor opens `partner.html` (via the "Partner Program" link in the site navigation).
2. They press **Continue with Google**. The page calls `supabase.auth.signInWithOAuth({ provider: "google" })`
   with `redirectTo = partner-dashboard.html`.
3. After Google sign-in they land on `partner-dashboard.html`. With no session, the dashboard sends them back to `partner.html`.

## Supabase setup the frontend relies on

- Google provider enabled in Supabase Auth.
- The full URL of `partner-dashboard.html` added to the Auth redirect URL allow-list
  (for example `https://glime.online/partner-dashboard.html`).

## RPCs the dashboard calls (to be created in the backend)

### `partner_get_dashboard()` → json

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

- `partner.code`: 3 to 32 characters, letters, numbers, `_` or `-`. The referral link is `https://glime.online/?ref=<code>&src=<tag>`.
- `referrals[].status`: `signed_up`, `trial`, `active`, `churned`, `refunded`. Names should be masked on the server.
- `earnings[].status`: `pending`, `available`, `paid`, `reversed`.
- `payouts[].status`: `processing`, `paid`, `failed`.
- Never return other partners' data. Never return full bank or UPI details.

### `partner_save_payout_details(p_method text, p_details jsonb)`

Called from the Payouts tab.

- `p_method = "upi"` → `p_details = { "upi_id": "name@bank" }`
- `p_method = "bank"` → `p_details = { "account_holder": "...", "account_number": "...", "ifsc": "..." }`

Store it only for `auth.uid()` and return the masked `display` string through `partner_get_dashboard()`.

## Not part of this frontend change

- **Referral capture.** Nothing on the public site reads `?ref=CODE` yet. Saving the code for `cookieDays` days and
  attaching it to a new client account at sign-up (and counting clicks) is a backend and sign-up-page step.
  The Partner Guide already describes this behaviour, so it needs to be built before the program goes live.
- **Backend.** The two RPCs above and the partner tables do not exist yet. Until they do, the dashboard shows
  empty states and a welcome message.

## Notes

- Commission numbers, tiers and the Partner Terms text are working defaults. Please review them (and have the terms checked by a legal advisor) before the program goes live.
- The dashboard page is marked `noindex`.
