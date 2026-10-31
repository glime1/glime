# GLIME Payments — Backend Spec

Frontend: `settings-payments-addon.js` (Settings > Payments, `settings.html#payments`).
The frontend only displays numbers and sends requests. **Every balance, limit and fee is decided by the backend.**

Supabase project: **Glime 1**. All table and function names below are proposals. Check them against existing tables (`client_data`, orders, payments) before running anything. Verify Razorpay field names against the current Razorpay Route docs before coding the edge functions.

---

## 1. Idea in one paragraph

A small client who does not want their own Razorpay account chooses **GLIME Payments**. They complete a one-time KYC. GLIME creates a Razorpay **Route linked account** for them. Customer payments are collected through GLIME's Razorpay account and each payment is **transferred to that client's linked account**, minus the GLIME fee. The client can only ever get back what their own customers paid. The client sees received, fee, net, withdrawn, on hold and available in Settings > Payments.

Do **not** keep client money in a GLIME wallet and pay it out by hand. Holding other people's money needs licences. Route keeps the money moving through Razorpay, linked to the client's own verified account.

## 2. Two payout modes (per client, set by GLIME admin)

| `payout_mode` | What happens | Client sees |
|---|---|---|
| `auto` (default, simplest) | Razorpay settles each transfer to the client's bank on its normal schedule (about T+2). | Balances + "settled automatically". No withdraw button. |
| `withdraw` | Each transfer is created with `on_hold = true`. When the client withdraws, GLIME releases holds (`on_hold = false`) and Razorpay settles to the client's bank. | Withdraw box with amount and Max. |

In `withdraw` mode the amount is covered by releasing whole payments. Rule: release the oldest eligible payments whose net total is **≤ the requested amount**. If you want exact amounts, allow partial release only if Razorpay supports it for your account, otherwise tell the client the final amount (the result can be slightly lower, shown in the payout row).

## 3. Tables

```sql
-- 3.1 one row per client
create table payment_accounts (
  client_id            uuid primary key references client_data(client_id),
  mode                 text check (mode in ('own','glime')),          -- null = not chosen yet
  payments_enabled     boolean not null default false,                -- admin switch per client
  payout_mode          text not null default 'auto' check (payout_mode in ('auto','withdraw')),
  fee_bps              int  not null default 200,                     -- GLIME fee in basis points (200 = 2%). Decide the number.
  min_payout_paise     bigint not null default 10000,
  hold_days            int  not null default 2,                       -- refund window before a payment becomes withdrawable
  settlement_days      int  not null default 2,
  kyc_status           text not null default 'not_started'
                       check (kyc_status in ('not_started','submitted','under_review','needs_info','verified','rejected','suspended')),
  kyc_reason           text,                                          -- shown to client on needs_info / rejected
  kyc_submitted_at     timestamptz,
  verified_at          timestamptz,
  razorpay_account_id  text unique,                                   -- acc_xxx (Route linked account)
  razorpay_stakeholder_id text,
  razorpay_product_id  text,
  legal_name           text,
  business_type        text,
  pan_last4            text,                                          -- NEVER the full PAN
  bank_name            text,
  bank_last4           text,                                          -- NEVER the full account number
  bank_ifsc            text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 3.2 audit trail for KYC and mode changes (append only)
create table payment_audit (
  id         bigserial primary key,
  client_id  uuid not null,
  event      text not null,          -- kyc_submitted, kyc_activated, mode_changed, payout_requested ...
  detail     jsonb not null default '{}',   -- no PAN, no account numbers, no tokens
  created_at timestamptz not null default now()
);

-- 3.3 every customer payment collected through GLIME Payments
create table gateway_payments (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references client_data(client_id),
  order_id             uuid,                       -- existing orders table, if any
  order_ref            text,
  customer_name        text,
  channel              text,                       -- whatsapp / instagram
  razorpay_payment_id  text unique not null,
  razorpay_order_id    text,
  razorpay_transfer_id text,
  gross_paise          bigint not null check (gross_paise > 0),
  fee_paise            bigint not null check (fee_paise >= 0),
  net_paise            bigint not null,            -- gross - fee
  refunded_paise       bigint not null default 0,
  status               text not null default 'captured'
                       check (status in ('captured','held','released','settled','refunded','partially_refunded','failed')),
  available_at         timestamptz,                -- created_at + hold_days
  released_at          timestamptz,
  settled_at           timestamptz,
  created_at           timestamptz not null default now()
);
create index on gateway_payments (client_id, created_at desc);

-- 3.4 append-only ledger = single source of truth for balances (amounts signed, in paise)
create table payment_ledger (
  id           bigserial primary key,
  client_id    uuid not null,
  entry_type   text not null check (entry_type in ('payment','fee','refund','refund_fee_reversal','payout','payout_reversal','adjustment')),
  amount_paise bigint not null,            -- + credits client, - debits client
  available_at timestamptz not null default now(),   -- when it counts as withdrawable
  ref_type     text,                       -- gateway_payment / payout
  ref_id       text,
  created_at   timestamptz not null default now(),
  unique (entry_type, ref_type, ref_id)    -- makes webhooks and retries idempotent
);
create index on payment_ledger (client_id, available_at);

-- 3.5 withdrawals
create table payouts (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references client_data(client_id),
  amount_paise     bigint not null check (amount_paise > 0),
  status           text not null default 'pending'
                   check (status in ('pending','processing','paid','failed','reversed','cancelled')),
  idempotency_key  text not null,
  released_payment_ids uuid[] ,
  utr              text,
  failure_reason   text,
  requested_at     timestamptz not null default now(),
  processed_at     timestamptz,
  unique (client_id, idempotency_key)
);

-- 3.6 raw Razorpay webhooks (dedupe + debugging)
create table payment_webhook_events (
  event_id     text primary key,           -- Razorpay x-razorpay-event-id
  event_type   text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);
```

**Balance formula (computed in SQL, never in the browser):**

```
gross_paise     = sum(gross of gateway_payments, not failed)
fee_paise       = sum(fee_paise)
refunded_paise  = sum(refunded_paise)
net_paise       = gross - fee - refunded
withdrawn_paise = sum(amount of payouts with status in pending, processing, paid)   -- pending counts, so it cannot be withdrawn twice
hold_paise      = sum(ledger credits where available_at > now())
available_paise = sum(ledger where available_at <= now())   -- ledger already contains payout debits and refunds
```

## 4. Row Level Security

- Enable RLS on **all** tables above.
- Clients get **no direct table access**. They read only through the RPCs in section 5 (all `security definer`, `set search_path = public`, and always filter by the client found from `auth.uid()` via `client_data.auth_user_id`).
- `payment_ledger`, `payouts`, `gateway_payments`, `payment_webhook_events`, `payment_audit` are written only by `service_role` (edge functions) or by the security definer RPCs.
- Admin reads through the existing admin pattern.

## 5. RPC functions (called by the frontend)

All: `security definer`, resolve `client_id` from the logged-in user, raise errors with the **exact code words below** at the start of the message (the frontend maps them to friendly text).

| RPC | Args | Returns | Rules / error codes |
|---|---|---|---|
| `get_my_payments_overview()` | – | jsonb (shape below) | `enabled=false` when `payments_enabled` is false. |
| `set_my_payment_mode(p_mode text)` | `'own'` or `'glime'` | void | `PAYMENTS_NOT_ENABLED`. Switch glime → own only if balances are zero, no held payments, no pending payout, else `MODE_CHANGE_BLOCKED`. Write `payment_audit`. |
| `list_my_gateway_payments(p_limit int, p_offset int, p_status text)` | | rows: `id, created_at, order_ref, customer_name, channel, gross_paise, fee_paise, net_paise, refunded_paise, status` | Cap `p_limit` at 50. |
| `list_my_payouts(p_limit int, p_offset int)` | | rows: `id, requested_at, amount_paise, status, utr, failure_reason` | |
| `request_my_payout(p_amount_paise bigint, p_idempotency_key text)` | | jsonb `{payout_id,status}` | See 5.2. |

### 5.1 `get_my_payments_overview()` shape

```json
{
  "enabled": true,
  "mode": "glime",
  "payout_mode": "withdraw",
  "fee_bps": 200,
  "min_payout_paise": 10000,
  "settlement_days": 2,
  "own_razorpay_connected": false,
  "kyc": {
    "status": "verified",
    "reason": null,
    "legal_name": "…", "business_type": "proprietorship",
    "bank_name": "HDFC Bank", "bank_last4": "1234", "bank_ifsc": "HDFC0001234",
    "pan_last4": "234F",
    "submitted_at": "…", "verified_at": "…",
    "prefill": { "legal_name": "…", "email": "…", "phone": "…" }
  },
  "balances": {
    "gross_paise": 0, "fee_paise": 0, "refunded_paise": 0, "net_paise": 0,
    "withdrawn_paise": 0, "hold_paise": 0, "available_paise": 0
  },
  "pending_payout": null
}
```

`own_razorpay_connected` comes from the existing Razorpay connector table. Amounts are always **integer paise**.

### 5.2 `request_my_payout` logic (must be one transaction)

1. Resolve client. `PAYMENTS_NOT_ENABLED` if not enabled, `KYC_NOT_VERIFIED` if `kyc_status <> 'verified'`, and mode must be `glime` and `payout_mode = 'withdraw'`.
2. Validate amount: integer, `> 0` else `INVALID_AMOUNT`; `>= min_payout_paise` else `BELOW_MINIMUM`.
3. `pg_advisory_xact_lock(hashtext(client_id::text))` so two taps cannot both pass the balance check.
4. Idempotency: if a payout with the same `(client_id, key)` exists, return it. If its amount differs, raise `INVALID_AMOUNT`.
5. If another payout is `pending` or `processing`, raise `PAYOUT_ALREADY_PENDING`.
6. Compute `available_paise` from the ledger. If amount > available, raise `INSUFFICIENT_BALANCE`.
7. Insert `payouts` row (`pending`) and a **negative** `payment_ledger` row (`entry_type='payout'`, `ref_id = payout id`). The money is now reserved.
8. Return. The edge function worker (section 6.3) does the Razorpay release.

If the Razorpay step fails later, the worker marks the payout `failed` and inserts a positive `payout_reversal` ledger row, so the balance comes back.

## 6. Edge functions

### 6.1 `glime-payments-kyc` (POST, JWT required)

Receives the KYC form (PAN and bank details travel **only** here, over HTTPS).

Body from the frontend:

```json
{
  "action": "submit",
  "business_type": "individual|proprietorship|partnership|llp|private_limited",
  "business_category": "retail|services|food_beverage|education|beauty_wellness|other",
  "legal_name": "", "display_name": "",
  "pan": "", "owner_pan": "", "gstin": null,
  "contact_name": "", "email": "", "phone": "",
  "address": { "line1": "", "line2": "", "city": "", "state": "", "pincode": "" },
  "bank": { "account_holder": "", "account_number": "", "ifsc": "" },
  "consent": { "accepted": true, "version": "v1", "at": "ISO time" }
}
```

Response: `{ "ok": true }` or `{ "ok": false, "error": "KYC_INVALID_PAN" }` (other codes: `KYC_INVALID_BANK`, `KYC_INVALID_IFSC`, `KYC_ALREADY_SUBMITTED`, `PAYMENTS_NOT_ENABLED`).

Steps:

1. Verify the JWT, find the client, check `payments_enabled` and that `kyc_status` is `not_started`, `needs_info` or `rejected`.
2. Re-validate every field on the server (PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`, IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`, phone, pincode, account 9–18 digits, consent true). Never trust the browser.
3. **Razorpay Route onboarding** (GLIME's platform keys live in edge function secrets, never in the frontend):
   1. `POST /v2/accounts` — create the linked account (email, phone, legal business name, business type, profile category/subcategory mapped from `business_category`, registered address, `legal_info.pan` and optional `gst`).
   2. `POST /v2/accounts/{id}/stakeholders` — the owner / authorised person (name, email, `kyc.pan` = `owner_pan`, address).
   3. `POST /v2/accounts/{id}/products` with `product_name: "route"` and `tnc_accepted: true`.
   4. `PATCH /v2/accounts/{id}/products/{product_id}` — settlement bank details (`beneficiary_name`, `account_number`, `ifsc_code`).
4. Save to `payment_accounts`: ids, `kyc_status='under_review'` (or `submitted`), `kyc_submitted_at`, `legal_name`, `business_type`, `pan_last4`, `bank_last4`, `bank_ifsc`. **Do not store the full PAN or account number anywhere** (not in tables, logs, audit, or error messages).
5. Write `payment_audit` (`kyc_submitted`) with no sensitive values.
6. Rate limit: max 5 submissions per client per day.

Razorpay's own KYC decides the result. GLIME does not store identity documents.

### 6.2 `glime-payments-webhook` (Razorpay webhook, no JWT, verify signature)

1. Verify `x-razorpay-signature` (HMAC SHA256 of the raw body with the webhook secret). Reject on mismatch.
2. Insert into `payment_webhook_events` by `event_id`. If it already exists, return 200 and stop (idempotent).
3. Handle:
   - `product.route.under_review` → `kyc_status = 'under_review'`.
   - `product.route.activated` → `verified`, set `verified_at`, fill `bank_name`.
   - `product.route.needs_clarification` → `needs_info`, `kyc_reason` = Razorpay's requirement text (shown to the client).
   - `product.route.rejected` → `rejected`, `kyc_reason`.
   - `account.suspended` / `account.under_review` (or equivalent) → `suspended`.
   - `payment.captured` (payments with our `client_id` in `notes`) → insert `gateway_payments`; compute `fee = round(gross * fee_bps / 10000)`; insert ledger rows (`payment` + gross, `fee` − fee) with `available_at = now() + hold_days`.
   - `transfer.processed` / `transfer.settled` → set `razorpay_transfer_id`, `settled_at`, status `settled`.
   - `refund.processed` → add to `refunded_paise`, insert a negative `refund` ledger row (and `refund_fee_reversal` if you give the fee back; decide the policy).
   - `payment.failed` → mark failed, no ledger rows.
   - `settlement.processed` / payout events → update `payouts` status and `utr`.
4. Always return 200 quickly after storing. Do heavy work after.

### 6.3 `glime-payments-payout-worker` (service role; called right after the RPC or on a short cron)

For every payout in `pending`:

1. Mark `processing`.
2. `withdraw` mode: select the client's oldest transfers that are still on hold and past `available_at`, whose net total is ≤ the payout amount. Release them with `PATCH /v1/transfers/{id}` `{ "on_hold": 0 }`. Save the ids in `released_payment_ids` and set those payments to `released`.
3. If Razorpay accepts, keep `processing`; the webhook moves it to `paid` and saves the UTR. If it rejects, mark `failed`, store `failure_reason`, and insert the `payout_reversal` ledger row.
4. If the released total is lower than the request, update `payouts.amount_paise` to the real amount and insert a positive `adjustment` row for the difference.

### 6.4 Creating payment links (existing code)

Wherever GLIME creates the Razorpay payment link or order for a client in `glime` mode:

- Use GLIME's Razorpay account.
- Put `client_id` and `order_ref` in `notes`.
- Add a `transfers` entry: `account = razorpay_account_id`, `amount = gross − fee`, `currency = INR`, `on_hold = 1` when `payout_mode = 'withdraw'`, else `0`.
- Only allow this if `mode='glime'`, `kyc_status='verified'` and `payments_enabled`.
- Clients in `own` mode keep using the existing flow with their own keys.

### 6.5 Nightly reconcile (cron)

Compare `sum(ledger)` per client with Razorpay transfers and settlements. Raise an alert on any mismatch. Mark payments `settled` when Razorpay settled them.

## 7. KYC statuses and what the client sees

| `kyc_status` | Frontend shows |
|---|---|
| `not_started` | 3-step form: Business → Contact → Bank & consent |
| `submitted`, `under_review` | "Under review, 1 to 3 working days". No form. |
| `needs_info` | Warning card with `kyc_reason` + the form again |
| `rejected` | Card with `kyc_reason` + the form again |
| `verified` | Dashboard: Overview, Payments, Payouts, Account |
| `suspended` | "Paused, contact support" |

KYC form fields are in section 6.1. For company types (`partnership`, `llp`, `private_limited`) two PANs are collected: the business PAN and the authorised person's PAN.

## 8. Security checklist

- PAN, account number, IFSC: server-side only; never log request bodies; store only last 4 digits.
- All amounts in integer paise. No floats.
- Balance checks happen inside the RPC under an advisory lock. Never trust an amount or balance sent by the browser.
- Idempotency on payouts (key from the browser) and on webhooks (`event_id`).
- Webhook signature verification is mandatory.
- Edge function secrets: Razorpay key id and secret, webhook secret. Never in git or the frontend.
- A client can only read their own rows (RPCs derive `client_id` from `auth.uid()`).
- Admin action to suspend a client and to freeze payouts.

## 9. Admin side (later, not part of this frontend)

- Switch `payments_enabled`, `payout_mode`, `fee_bps`, `min_payout_paise` per client.
- See KYC status, balances, payouts, failed payouts.
- Manual `adjustment` ledger entry with a required reason.

## 10. Things to confirm outside the code

1. Ask Razorpay (account manager or support) in writing: is Route allowed for your use case (GLIME collecting on behalf of small businesses), what are the fees, and what is the settlement and hold behaviour?
2. Decide who pays the Razorpay fee: GLIME fee covers it, or it is deducted from the client's net.
3. GST on the GLIME fee: decide whether `fee_paise` is shown inclusive or exclusive, and invoice the fee. Check with your CA.
4. Update Terms and Refund policy: GLIME's role, fee, hold period, refund and chargeback rules.
5. This spec is a design guide, not legal advice. Have a CA or lawyer review the money flow before going live.

## 11. Build order

1. Tables + RLS (section 3, 4).
2. `get_my_payments_overview`, `set_my_payment_mode`, the two list RPCs (frontend loads and shows KYC form).
3. `glime-payments-kyc` + webhook KYC events (test in Razorpay test mode end to end).
4. Payment link change (6.4) + `payment.captured` webhook + ledger.
5. `request_my_payout` + worker (only needed for `withdraw` mode).
6. Reconcile cron, admin screens, then switch on `payments_enabled` for one test client.
