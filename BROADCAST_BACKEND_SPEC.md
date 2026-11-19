# WhatsApp Broadcast: backend spec

Frontend: `settings-broadcast-addon.js` (Settings > Broadcast). The frontend sends nothing by itself. It only calls the RPCs below. Until an RPC exists the page shows a friendly "not switched on yet" message and nothing is sent.

## 1. RPCs the frontend calls

### 1a. create_whatsapp_broadcast

```
create_whatsapp_broadcast(
  p_name         text,
  p_template_id  uuid,          -- client_followup_templates.id (must be status = 'approved')
  p_lead_ids     uuid[],        -- final, already filtered leads (max 1000)
  p_filters      jsonb,         -- what the client chose, for history only
  p_schedule_at  timestamptz,   -- null = send now
  p_media_path   text default null  -- NEW: photo for an Image-header template, see section 4
) returns jsonb                 -- { broadcast_id, recipients }
```

`p_media_path` is sent only when the client added a photo. Broadcasts without a photo call the function without this argument, so keep it `default null`.

`p_filters` example:
`{"segment":"hot","statuses":[],"keyword":"jaipur","skip_contacted_days":3,"mode":"limit","limit":50,"order":"new"}`

### 1b. get_whatsapp_broadcast_report (NEW)

```
get_whatsapp_broadcast_report(p_broadcast_id uuid) returns jsonb
```

Caller must own the broadcast (same client). Returns:

```
{
  "status": "sending",
  "total": 2000,        -- recipients
  "sent": 2000,         -- accepted by Meta (cumulative: includes delivered and read)
  "delivered": 1968,    -- cumulative: includes read
  "read": 1642,
  "replied": 214,       -- distinct recipients who sent any message back after the broadcast
  "failed": 12,
  "replies": [          -- latest 20, newest first
    { "name": "Ramesh Patel", "phone": "919999999999", "text": "Offer abhi bhi hai?", "at": "2026-11-19T07:40:00Z" }
  ]
}
```

The frontend shows Delivered as a percent of Sent, and Read and Replies as a percent of Delivered. It calls this RPC when a broadcast is opened and every 15 seconds while the status is `queued` or `sending`.

Suggested source of the numbers: `client_broadcast_recipients.status` (sent, delivered, read, failed) updated from the WhatsApp status webhooks (`whatsapp_messages.status` already carries sent, delivered, read), and replies from inbound `whatsapp_messages` for the same phone after `sent_at`. Reply text is untrusted customer text; the frontend escapes it.

### 1c. cancel_whatsapp_broadcast (NEW)

```
cancel_whatsapp_broadcast(p_broadcast_id uuid) returns jsonb
```

Only the owner. Allowed while status is `scheduled` or `queued`. Sets status `cancelled` and stops the sender from picking up unsent recipients. The frontend shows the Cancel button only for those two statuses.

## 2. What create_whatsapp_broadcast must check (never trust the browser)

- Caller owns the client (`auth.uid()` -> `client_data.client_id`).
- Template belongs to that client, `status = 'approved'`.
- WhatsApp is connected (`client_channel_connections`: channel `whatsapp`, status `connected`, can_send true).
- Every id in `p_lead_ids` belongs to the same client. Ignore the rest.
- Re-derive the WhatsApp number from `leads.whatsapp` / `leads.mobile`, drop invalid and duplicate numbers.
- At most 1000 recipients per broadcast. Schedule time must be 5 minutes to 30 days ahead.
- Skip customers who opted out (same opt-out words as template follow-ups).
- Wallet balance must cover recipients x rate (utility 0.80, marketing 1.20 per message).
- Respect the client's daily message limit (Settings > Automation).
- If `p_media_path` is given: the template header must be IMAGE, the path must start with the caller's `client_id` + `/broadcasts/`, and the object must exist in bucket `client-assets`. Reject otherwise.

## 2b. Suggested tables

`client_broadcasts` (read by the frontend for history and report numbers):
`id uuid pk, client_id text, name text, template_id uuid, status text, total_count int, sent_count int, delivered_count int, read_count int, reply_count int, failed_count int, media_path text, filters jsonb, scheduled_at timestamptz, created_at timestamptz`
`status`: queued, scheduled, sending, sent, partial, failed, cancelled.
RLS: select only where `client_id` is the caller's client. No client insert/update (only the RPCs and the sender).

The frontend first selects all count columns above. If `delivered_count`, `read_count` or `reply_count` do not exist yet it falls back to the basic columns, so adding them later is safe.

`client_broadcast_recipients`: `broadcast_id, lead_id, phone, status, error_code, sent_at, delivered_at, read_at, replied_at`. Service-role only.

## 3. Sending

A server-side worker sends the approved template to each recipient with the template variables filled from the lead (for example the first variable = lead name), respects Meta rate limits, retries safely, and updates the counts and the broadcast `status`.

Messages should go out between 9 AM and 9 PM IST, same as template follow-ups.

## 4. Photo (Image header)

WhatsApp lets a business send a photo to customers it has not chatted with in the last 24 hours only as the header of an approved template whose header format is IMAGE. So the photo feature works only with such templates.

- The frontend reads `client_followup_templates.header`. The photo picker is enabled when `header.type` is `image` (case-insensitive). For other templates it explains that the template has no photo slot.
- The client picks a JPG or PNG up to 5 MB. The frontend uploads it to bucket `client-assets` at `<client_id>/broadcasts/<timestamp>-<random>.<jpg|png>` (existing RLS allows the client to write inside their own folder) and passes the path as `p_media_path`. If the RPC fails, the frontend removes the uploaded file.
- The sender creates a signed or public URL for that object and passes it as the IMAGE header parameter of the template message for every recipient.
- Optional cleanup: delete `broadcasts/` photos once the broadcast is finished and older than 30 days.
