# Promo Codes — Backend Spec (Supabase "Glime 1")

Frontend is done: `admin-promo-addon.js` ("Promo Codes" tab in admin.html). This file lists what the backend must provide. Nothing here is built yet.

Use case: the admin makes a code for a YouTube video, e.g. "first 100 people get 20,000 tokens". A client enters the code and receives AI tokens (credits) once.

## 1. Tables

### `glime_promo_codes`
| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| code | text unique not null | stored UPPERCASE, `^[A-Z0-9_-]{4,32}$` |
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

## 2. Admin RPCs (used by the new tab)
Every one must check the caller is admin@glime.online with AAL2 (2FA), the same way `admin_grant_ai_credits` does, and raise `not_admin` otherwise.

1. `admin_promo_create(p_code text, p_tokens bigint, p_max_redemptions int, p_expires_at timestamptz, p_note text, p_idempotency_key uuid) returns jsonb`
   - Uppercase and validate the code. Errors the UI understands: `INVALID_CODE`, `INVALID_TOKENS`, `INVALID_LIMIT`, `INVALID_EXPIRY` (must be in the future), `CODE_EXISTS`.
   - If `p_idempotency_key` already exists, return the existing row instead of an error.
   - Returns `{ "ok": true, "code": "GLIME-XXXXXX", "id": "..." }`.
2. `admin_promo_list(p_limit int default 200) returns jsonb` — a JSON array, newest first. Each item needs: `code, tokens, max_redemptions, redeemed_count, is_active, expires_at, note, created_at`.
3. `admin_promo_set_active(p_code text, p_active boolean) returns jsonb` — pause or resume. Error: `PROMO_NOT_FOUND`.
4. `admin_promo_redemptions(p_code text, p_limit int default 500) returns jsonb` — JSON array, newest first, each item: `client_id, email, tokens, redeemed_at`.

All four actions should also be written to the existing Audit Logs.

## 3. Client RPC (needed so clients can actually use a code)
`redeem_promo_code(p_code text) returns jsonb` — callable by a logged-in client only (`auth.uid()` decides the client; never trust a client_id sent from the browser).
- In ONE transaction: lock the promo row (`FOR UPDATE`), then check: code exists, `is_active`, not expired, `redeemed_count < max_redemptions`, this client has not used it. Then insert the redemption, add 1 to `redeemed_count`, and add the tokens to the client's AI credits **using the same ledger that `admin_grant_ai_credits` uses**, so the balance and history stay correct.
- The row lock is what makes "first 100" exact even when many people enter the code at the same time.
- Error codes to return: `PROMO_INVALID`, `PROMO_PAUSED`, `PROMO_EXPIRED`, `PROMO_FULL`, `PROMO_ALREADY_USED`.
- Rate-limit attempts per client (for example 10 wrong codes per hour) so codes cannot be guessed.
- Success: `{ "ok": true, "tokens": 20000, "balance_credits": 25000 }`.

## 4. Not built yet (frontend)
The client-side "Enter promo code" box (for example in billing.html or dashboard.html) is not part of this change. Until it exists, clients cannot redeem codes.
