# GLIME Webhook Connector: Backend Spec

The frontend is done: `connector-webhook-addon.js`, mounted on `ai-connections.html` (Connector Hub, group "Automation").
This file lists everything the backend still has to do. Until the gateway below is deployed, the card shows **Coming soon** (it detects HTTP 404), so nothing breaks for clients.

## 1. What it does
A client pastes one HTTPS URL (Zapier Catch Hook, Make Custom webhook, n8n Webhook node, or their own server) and picks events. GLIME then POSTs a signed JSON body to that URL whenever one of those events happens. No third-party approval is needed, so it works for every client.

## 2. Tables
Use the same owner key your other connector tables use (shown here as `client_id`). RLS on, no client policies; only the Edge Functions (service role) touch these tables.

```sql
create table public.client_webhooks (
  client_id uuid primary key,
  url text not null,
  events text[] not null default '{}',
  enabled boolean not null default true,
  auto_paused boolean not null default false,
  secret_enc text not null,          -- encrypted (Vault / pgsodium). Never store plain.
  secret_last4 text not null,
  consecutive_failures int not null default 0,
  last_delivery_at timestamptz,
  last_status_code int,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  event_key text not null,
  payload jsonb not null,
  status text not null default 'pending',   -- pending | ok | failed
  attempts int not null default 0,
  next_attempt_at timestamptz default now(),
  status_code int,
  duration_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index on public.webhook_deliveries (client_id, created_at desc);
create index on public.webhook_deliveries (status, next_attempt_at);
```
Retention: delete `webhook_deliveries` older than 30 days (daily cron).

## 3. Edge Function `glime-webhook-gateway` (verify_jwt = true)
Called by the page as `/functions/v1/glime-webhook-gateway?action=...` with the user's JWT. Always return JSON. On errors return `{ok:false, message:"..."}` with a non-2xx status; the page shows `message` as is. Do not return 404 for normal errors (the page treats 404 as "not deployed").

| Action | Method | Body | Response |
|---|---|---|---|
| `webhook.status` | GET | none | `{ok, connected, enabled, url, events[], secret_last4, auto_paused, last_delivery_at, last_status_code, last_error}`. If no row: `{ok:true, connected:false}` |
| `webhook.save` | POST | `{url, events[], enabled}` | `{ok, secret}` where `secret` is returned only when the row is first created, never on later saves |
| `webhook.set_enabled` | POST | `{enabled}` | `{ok}`. On `true`: clear `auto_paused` and `consecutive_failures` |
| `webhook.test` | POST | `{}` | `{ok, delivered, status_code, duration_ms, message}` |
| `webhook.rotate_secret` | POST | `{}` | `{ok, secret}` (new secret, shown once) |
| `webhook.deliveries` | GET | none | `{ok, deliveries:[{id, event_key, ok, status_code, duration_ms, error, created_at}]}` newest first, max 10 |
| `webhook.disconnect` | POST | `{}` | `{ok}`. Delete the row (and the secret) |

Validation on `webhook.save` (the page only does a light check, this is the real one):
- `url`: max 2000 chars, `https:` only, no user:password, no IP-address hosts, no `localhost` / `.local` / `.internal`.
- `events`: must be a non-empty subset of: `lead.created`, `lead.stage_changed`, `order.created`, `order.paid`, `message.received`, `booking.created`. Reject anything else.
- Rate limits per client: save 10/min, test 1 per 10 seconds.

## 4. Sending events (dispatcher)
Suggested: a function `glime-webhook-dispatcher` run every minute by pg_cron (protect it with a secret header, `verify_jwt = false`), plus an immediate call after enqueue for speed.

**Enqueue.** A SQL function `enqueue_webhook_event(p_client_id, p_event_key, p_data jsonb)` inserts a `pending` row only if that client has a webhook that is `enabled` and has `p_event_key` in `events`. Call it from the places where these things already happen (triggers or RPCs): new lead, lead stage change, new order, order paid, inbound WhatsApp/Instagram message, new booking. You know the schema; the frontend does not touch it.

**Send.**
- `POST` to the saved URL, 8 second timeout, **do not follow redirects**.
- Headers: `Content-Type: application/json`, `User-Agent: GLIME-Webhooks/1.0`, `X-GLIME-Event: <event_key>`, `X-GLIME-Delivery: <delivery id>`, `X-GLIME-Signature: sha256=<hex>`.
- Signature = `HMAC-SHA256(secret, raw_body)` as lowercase hex. The page text says exactly this, so keep it.
- Success = any 2xx. Otherwise retry up to 4 attempts at +1 min, +5 min, +30 min, +2 h, then mark `failed`.
- After every attempt update the delivery row and `client_webhooks.last_*`. After 20 consecutive failed deliveries set `enabled=false, auto_paused=true` (the card then shows "Paused automatically").
- Test (`webhook.test`) sends event `webhook.test` with `data: {"message":"This is a test from GLIME"}`, waits for the reply and logs it like any delivery.

**Body (same for all events):**
```json
{
  "id": "<delivery id>",
  "event": "lead.created",
  "created_at": "2026-11-04T10:00:00Z",
  "data": { }
}
```
Keep `data` small and useful (ids, name, phone, stage, amount, channel, message text). Do not send full chat history, tokens or internal notes. The client sees a warning on the card that customer details go to their URL.

## 5. Security rules (important)
- **SSRF:** before every send, resolve the hostname and block private, loopback, link-local and metadata ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 including 169.254.169.254, `::1`, `fc00::/7`, `fe80::/10`). Check again at send time, not only at save time (DNS rebinding). Allow port 443 only.
- Secret: 32 random bytes, format `whsec_<base64url>`. Store encrypted, return once, never log it.
- Never log full URLs (Zapier/Make URLs contain tokens). Log only the host.
- `webhook_deliveries.error`: store a short reason ("timeout", "HTTP 500", "blocked address"), not the response body.
- Only the owner can read or change their row (derive `client_id` from the JWT, never from the request body).

## 6. How a client verifies (for the Help / docs page)
```js
const crypto = require('crypto');
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-glime-signature'] || ''));
```
Use the raw request body, not re-serialized JSON. Zapier and Make users can skip verification.

## 7. Deploy order
1. Create the two tables + `enqueue_webhook_event`.
2. Deploy `glime-webhook-gateway` (verify_jwt = true). The card switches from "Coming soon" to "Not connected" automatically.
3. Deploy the dispatcher + cron.
4. Hook `enqueue_webhook_event` into leads / orders / payments / messages / bookings.
5. In the Connector page: Connect, Send test, and check Recent deliveries.
