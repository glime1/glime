# Promo Codes — Backend Spec (Supabase "Glime 1")

Frontend is done:
- `admin-promo-addon.js` — "Promo Codes" tab in admin.html (create, list, pause/resume, who used it).
- `signup.html` — the "Referral code" box now also accepts offer (promo) codes.

This file lists what the backend must provide. Nothing here is built yet. Until it is, the admin tab shows "Backend अभी तैयार नहीं है" and signup keeps working exactly as before (partner codes only).

Use case: the admin makes a code for a YouTube video, e.g. "first 100 people get 20,000 tokens". The person types the code in the Referral code box on the signup page and receives the AI tokens once.

## 0. Code format
- Short: **4 to 12 characters, only A-Z and 0-9** (that is all the signup box accepts).
- The admin tab suggests `GLM` + number of people: `GLM100` = 100 people, `GLM500` = 500 people. A custom word works too, e.g. `DIWALI500`. If a code is taken, the tab adds a letter (`GLM100A`).
- Stored UPPERCASE.
- **A promo code must never equal a partner referral code.** `admin_promo_create` must check the partner referral codes table and return `CODE_EXISTS` on a clash. Partner codes are 6 to 12 characters of A-Z/0-9, the same shape, so signup tells them apart only by asking the backend (see `promo_code_check`).

## 1. Tables

### `glime_promo_codes`
| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| code | text unique not null | UPPERCASE, `^[A-Z0-9]{4,12}$` |
| tokens | bigint not null | 1 to 10,000,000, given to each person |
| max_redemptions | integer not null | 1 to 100,000 ("first N people") |
| redeemed_count | integer not null default 0 | |
| is_active | boolean not null default true | admin can pause/resume |
| expires_at | timestamptz null | optional last date |
| note | text null | admin's own note, max 200 chars |
| idempotency_key | uuid unique null | stops a double click creating two codes |
| created_by | uuid | admin user id |
| created_at | timestamptz default now() | |

### `glime_promo_redemptions`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| promo_id | uuid references glime_promo_codes(id) | |
| client_id | text not null | GLM-xxxx |
| tokens | bigint not null | tokens given at that time |
| redeemed_at | timestamptz default now() | |
| unique (promo_id, client_id) | | one use per client per code |

Turn RLS on for both tables with no direct policies. Everything goes through the functions below.

## 2. Admin RPCs (used by the Promo Codes tab)
Every one must check the caller is admin@glime.online with AAL2 (2FA), the same way `admin_grant_ai_credits` does, and raise `not_admin` otherwise.

1. `admin_promo_create(p_code text, p_tokens bigint, p_max_redemptions int, p_expires_at timestamptz, p_note text, p_idempotency_key uuid) returns jsonb`
   - Uppercase and validate the code. Errors the UI understands: `INVALID_CODE`, `INVALID_TOKENS`, `INVALID_LIMIT`, `INVALID_EXPIRY` (must be in the future), `CODE_EXISTS` (also when it matches a partner referral code).
   - If `p_idempotency_key` already exists, return the existing row instead of an error.
   - Returns `{ "ok": true, "code": "GLM100", "id": "..." }`.
2. `admin_promo_list(p_limit int default 200) returns jsonb` — a JSON array, newest first. Each item: `code, tokens, max_redemptions, redeemed_count, is_active, expires_at, note, created_at`.
3. `admin_promo_set_active(p_code text, p_active boolean) returns jsonb` — pause or resume. Error: `PROMO_NOT_FOUND`.
4. `admin_promo_redemptions(p_code text, p_limit int default 500) returns jsonb` — "who used this code". JSON array, newest first, each item: `client_id, full_name, business_name, phone, email, tokens, redeemed_at` (join the redemption with the client record).

All four actions should also be written to the existing Audit Logs.

## 3. Signup RPCs (used by signup.html)

### `promo_code_check(p_code text) returns jsonb` — callable by `anon`
Called before the account is created, to decide whether the typed code is an offer code or a partner code.
- Not a promo code: `{ "found": false }` (signup then follows the partner referral path as before).
- Promo code: `{ "found": true, "valid": true, "tokens": 20000 }`.
- Promo code that cannot be used: `{ "found": true, "valid": false, "reason": "PROMO_FULL" | "PROMO_EXPIRED" | "PROMO_PAUSED" }`.
- Return nothing else (no counts, no limits). Rate-limit by IP so codes cannot be guessed.
- This is a check only; it must not change any data.

### `redeem_promo_code(p_code text) returns jsonb` — logged-in client only
Called right after the account is set up (`glime-provision-self` has already created the client). `auth.uid()` decides the client; never trust a client_id sent from the browser.
- In ONE transaction: lock the promo row (`FOR UPDATE`), then check: code exists, `is_active`, not expired, `redeemed_count < max_redemptions`, this client has not used it. Then insert the redemption, add 1 to `redeemed_count`, and add the tokens to the client's AI credits **using the same ledger that `admin_grant_ai_credits` uses**, so balance and history stay correct.
- The row lock is what makes "first 100" exact when many people enter the code at the same time.
- Error codes: `PROMO_INVALID`, `PROMO_PAUSED`, `PROMO_EXPIRED`, `PROMO_FULL`, `PROMO_ALREADY_USED`.
- Rate-limit wrong attempts per client.
- Success: `{ "ok": true, "tokens": 20000, "balance_credits": 25000 }`.
- If it fails after signup (for example the code filled up in the last second), signup still completes; the user just does not get the tokens.
