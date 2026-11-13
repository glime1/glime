# WhatsApp Broadcast: backend spec

Frontend: `settings-broadcast-addon.js` (Settings > Broadcast). The frontend sends nothing by itself. It only calls the RPC below. Until this RPC exists the page shows "Broadcast sending is not switched on yet" and nothing is sent.

## 1. RPC the frontend calls

```
create_whatsapp_broadcast(
  p_name         text,
  p_template_id  uuid,          -- client_followup_templates.id (must be status = 'approved')
  p_lead_ids     uuid[],        -- final, already filtered leads (max 1000)
  p_filters      jsonb,         -- what the client chose, for history only
  p_schedule_at  timestamptz    -- null = send now
) returns jsonb                 -- { broadcast_id, recipients }
```

`p_filters` example:
`{"segment":"hot","statuses":[],"keyword":"jaipur","skip_contacted_days":3,"mode":"limit","limit":50,"order":"new"}`

## 2. What the RPC must check (never trust the browser)

- Caller owns the client (`auth.uid()` -> `client_data.client_id`).
- Template belongs to that client, `status = 'approved'`.
- WhatsApp is connected (`client_channel_connections`: channel `whatsapp`, status `connected`, can_send true).
- Every id in `p_lead_ids` belongs to the same client. Ignore the rest.
- Re-derive the WhatsApp number from `leads.whatsapp` / `leads.mobile`, drop invalid and duplicate numbers.
- At most 1000 recipients per broadcast. Schedule time must be 5 minutes to 30 days ahead.
- Skip customers who opted out (same opt-out words as template follow-ups).
- Wallet balance must cover recipients x rate (utility 0.80, marketing 1.20 per message).
- Respect the client's daily message limit (Settings > Automation).

## 2b. Suggested tables

`client_broadcasts` (read by the frontend for history):
`id uuid pk, client_id text, name text, template_id uuid, status text, total_count int, sent_count int, failed_count int, filters jsonb, scheduled_at timestamptz, created_at timestamptz`
`status`: queued, scheduled, sending, sent, partial, failed, cancelled.
RLS: select only where `client_id` is the caller's client. No client insert/update (only the RPC and the sender).

`client_broadcast_recipients`: `broadcast_id, lead_id, phone, status, error_code, sent_at`. Service-role only.

## 3. Sending

A server-side worker sends the approved template to each recipient with the template variables filled from the lead (for example the first variable = lead name), respects Meta rate limits, retries safely, and updates `sent_count` / `failed_count` and the broadcast `status`.

Messages should go out between 9 AM and 9 PM IST, same as template follow-ups.
