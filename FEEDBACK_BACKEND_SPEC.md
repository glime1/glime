# GLIME Feedback — backend spec

Frontend: `glime-app-shell.js` ("Feedback" item in the client sidebar, Manage group). Frontend only; this file is the contract for the backend.
The contract is deliberately stable: **one RPC, one jsonb payload**. New fields are added inside `metadata`, so the RPC signature never has to change.

## Rules

1. The client is **never** sent by the browser. The backend resolves it from the session: `client_data.auth_user_id = auth.uid()` -> `client_data.client_id`. Ignore any `client_id` in the payload.
2. Only signed-in clients can submit (`grant execute ... to authenticated`, not `anon`).
3. The browser retries unsent feedback later (offline / function missing). Every submit carries `client_request_id` (uuid) so the same feedback is **never stored twice** (unique on `auth_user_id + client_request_id`; on conflict return the existing row as success).
4. No direct table access for clients (RLS on, no client policies). Admin reads with the existing admin-email pattern.

## Table `public.client_feedback`

```sql
create table public.client_feedback (
  id                uuid primary key default gen_random_uuid(),
  ref_no            bigint generated always as identity,
  client_id         text   not null,            -- from client_data, never from the browser
  auth_user_id      uuid   not null,
  client_request_id uuid   not null,
  type              text   not null check (type in ('bug','idea','question','praise','other')),
  rating            smallint check (rating between 1 and 5),   -- optional
  message           text   not null check (char_length(message) between 10 and 2000),
  page              text,                        -- readable page name, e.g. "Orders"
  page_url          text,
  can_contact       boolean not null default true,
  metadata          jsonb   not null default '{}'::jsonb,       -- extra context; add new fields here
  status            text    not null default 'new' check (status in ('new','in_progress','resolved','closed')),
  admin_notes       text,
  resolved_at       timestamptz,
  resolved_by       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (auth_user_id, client_request_id)
);
create index on public.client_feedback (client_id);
create index on public.client_feedback (status, created_at desc);
alter table public.client_feedback enable row level security;
-- admin read/update policy: lower(auth.jwt()->>'email') = 'admin@glime.online'
```

## RPC `public.client_submit_feedback(p_payload jsonb) returns jsonb`

`security definer`, `set search_path = public`, execute granted to `authenticated` only.

**Payload sent by the frontend**

```json
{
  "client_request_id": "3f0c2d9a-...-uuid",
  "type": "bug | idea | question | praise | other",
  "rating": 4,
  "message": "text, 10 to 2000 characters",
  "page": "Orders",
  "page_url": "https://glime.online/orders.html",
  "can_contact": true,
  "metadata": {
    "app_version": "2026-10-27",
    "viewport": "390x844",
    "language": "en-IN",
    "theme": "dark",
    "user_agent": "...",
    "queued": false
  }
}
```

`rating` may be missing or `null`.

**Backend must**

1. Resolve `client_id` from `auth.uid()` via `client_data`; if none -> `{"ok":false,"error":"Client profile not found."}`.
2. Validate: `type` in the list, `message` trimmed 10..2000 chars, `rating` null or 1..5, `client_request_id` is a uuid. Truncate `page` (120), `page_url` (500), `metadata` (max ~4 KB).
3. Rate limit: max 10 feedback per client per hour -> `{"ok":false,"error":"You have sent a lot of feedback recently. Please try again later."}`.
4. Insert; on unique conflict return the existing row as success.
5. Return **exactly**:

```json
{ "ok": true, "id": "<uuid>", "reference": "FB-000123" }
```

(`reference` = `'FB-' || lpad(ref_no::text, 6, '0')`). On any problem return `{"ok":false,"error":"<message the client can read>"}`; the frontend shows `error` as is.

## Admin: which client sent it

Every row carries `client_id`; join `client_data` for the name:

```sql
select f.ref_no, f.created_at, f.status, f.type, f.rating, f.message, f.page, f.can_contact,
       f.client_id, cd.business_name, cd.client_name, cd.email, f.metadata
from client_feedback f
left join client_data cd on cd.client_id = f.client_id
order by f.created_at desc;
```

Suggested admin RPCs (names are only suggestions): `admin_list_feedback(p_status text, p_limit int, p_offset int)` returning the query above, and `admin_update_feedback(p_id uuid, p_status text, p_notes text)` which also sets `resolved_at/resolved_by` when status becomes `resolved`/`closed`.

## Optional later (frontend will not break without it)

`client_list_feedback()` -> the signed-in client's own feedback and status, if a "My feedback" list is added to the sidebar.
