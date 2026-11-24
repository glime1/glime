# Export Network — Backend Spec (public page + client section)

Frontend files this spec serves:

- `export-program.html` — public page where an overseas distributor applies
- `others-export-addon.js` — "Export Network" section in Others, for approved clients

Admin side is in `EXPORT_NETWORK_ADMIN_BACKEND_SPEC.md`. **Build this file first**, because the admin spec uses the same tables.

All frontend code is finished. Nothing works until these tables and functions exist in Supabase "Glime 1". Until then the public form says "Applications are not open yet", and clients see the locked screen (it fails closed).

---

## 1. Rules that must hold

1. Tables have **RLS enabled and no policies**. Revoke all table access from `anon` and `authenticated`. All access goes through `security definer` functions with `set search_path = public`.
2. A client sees an approved distributor's public fields only. **Never return** `email`, `phone`, `whatsapp`, `website`, `docs_link`, `registration_number`, `tax_id`, `contact_name`, `admin_note`.
3. Only `status = 'approved'` distributors are ever returned to clients.
4. Every client function checks that the caller is an approved client (section 3). If not: `raise exception 'not_approved'`.
5. Policy: UAE first. The data model allows every country. Admin decides who to approve. Nothing in the backend blocks other countries.

---

## 2. Tables

```sql
create table public.export_distributors (
  id uuid primary key default gen_random_uuid(),
  reference_id text not null unique,                 -- EX-YYMMDD-XXXX
  source text not null default 'public' check (source in ('public','admin')),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','revoked')),

  company_name text not null,
  trade_name text,
  business_type text not null,
  established_year int,
  country text not null,
  country_code text not null,                        -- ISO 3166-1 alpha-2
  city text not null,
  address text,
  registration_number text,
  issuing_authority text,
  tax_id text,
  website text,
  docs_link text,
  about text,

  categories text[] not null default '{}',
  products_text text,
  import_volume text,
  order_value text,
  imports_from_india text,
  payment_terms text[] not null default '{}',
  shipping_terms text[] not null default '{}',
  certifications text,

  contact_name text not null,
  designation text,
  email text,
  phone text,
  whatsapp text,
  languages text[] not null default '{}',
  primary_language text,
  contact_channel text,
  timezone text,
  business_hours text,

  licence_verified boolean not null default false,
  verified_at timestamptz,
  reject_reason text,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,

  ip_hash text,
  form_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one open listing per email
create unique index export_distributors_open_email
  on public.export_distributors (lower(email))
  where status in ('pending','approved') and email is not null;
create index export_distributors_dir on public.export_distributors (status, country_code);

create table public.export_network_access (
  client_id text primary key,                        -- GLM-0002 (client_data.client_id)
  approved boolean not null default false,
  note text,
  granted_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.export_network_requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  distributor_id uuid not null references public.export_distributors(id) on delete cascade,
  note text,                                         -- written by the client, max 500
  status text not null default 'requested'
    check (status in ('requested','in_progress','active','declined','closed')),
  admin_note text,                                   -- private, never returned to the client
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, distributor_id)
);

alter table public.export_distributors   enable row level security;
alter table public.export_network_access enable row level security;
alter table public.export_network_requests enable row level security;
revoke all on public.export_distributors, public.export_network_access, public.export_network_requests from anon, authenticated;
```

Keep `updated_at` current with the trigger you already use elsewhere.

---

## 3. Who counts as an "approved client"

```sql
-- helper, security definer, not exposed to anon
create function public.export_network_client_id() returns text ... 
  -- select client_id from client_data where auth_user_id = auth.uid()

create function public.export_network_is_approved() returns boolean ...
  -- exists (select 1 from export_network_access
  --         where client_id = export_network_client_id() and approved)
```

---

## 4. Public function (anon + authenticated)

### `export_distributor_apply(p_application jsonb) returns jsonb`

Called by `export-program.html`. Grant execute to `anon` and `authenticated`.

- Payload keys: `company_name, trade_name, business_type, established_year, country, country_code, city, address, registration_number, issuing_authority, tax_id, website, docs_link, about, categories[], products_text, import_volume, order_value, imports_from_india, payment_terms[], shipping_terms[], certifications, contact_name, designation, email, phone, whatsapp, languages[], primary_language, contact_channel, timezone, business_hours, consent_accuracy, consent_contact, consent_terms, form_ms`
- Required, otherwise `raise exception 'invalid'`: `company_name, business_type, country, country_code (2 letters), city, registration_number, categories (at least 1), contact_name, email (valid), phone (+ and 8 to 15 digits), languages (at least 1), primary_language (must be one of languages), consent_accuracy = true, consent_contact = true, consent_terms = true`
- Trim and length-limit every text value (max 800). Cap array sizes (max 30). Lowercase the email.
- Rate limit: max 5 applications per IP per hour, max 3 per email per day. Read the IP from `current_setting('request.headers', true)::json ->> 'x-forwarded-for'`, store only a **hash** in `ip_hash`. Raise `rate_limited`.
- Same email already has a `pending` or `approved` row: raise `duplicate`.
- Insert with `source = 'public'`, `status = 'pending'`, `reference_id = 'EX-' || to_char(now(),'YYMMDD') || '-' || 4 random upper-case letters or digits` (retry on collision).
- Returns `{ "ok": true, "reference_id": "EX-261124-AB12" }`.
- Error messages must be exactly `rate_limited`, `duplicate` or `invalid` (the page matches on these words).

---

## 4a. Client functions (authenticated clients)

### `export_network_my_access() returns jsonb`
`{ "approved": true }` or `{ "approved": false }`. Never raises for a non-approved client. The frontend treats anything except approved as locked.

### `export_network_directory(p_search text, p_country text, p_language text, p_category text, p_limit int, p_offset int) returns jsonb`
Requires approved client. Empty string means "no filter". Clamp `p_limit` to 1..50.

- Search (case-insensitive contains) on `company_name, trade_name, city, products_text, about` and the `categories` array.
- `p_country` = ISO code. `p_language` and `p_category` match elements of `languages` / `categories`.
- Order: `licence_verified desc, verified_at desc`.
- Returns:

```json
{
  "total": 120,
  "items": [{
    "id": "uuid", "company_name": "", "business_type": "",
    "country": "United Arab Emirates", "country_code": "AE", "city": "",
    "about": "", "categories": [""], "languages": [""], "primary_language": "",
    "order_value": "", "payment_terms": [""], "shipping_terms": [""],
    "established_year": 2008, "licence_verified": true,
    "verified_at": "2026-11-24T10:00:00Z",
    "my_request_status": null
  }],
  "facets": {
    "countries":  [{ "code": "AE", "name": "United Arab Emirates" }],
    "languages":  [""],
    "categories": [""]
  }
}
```

- `total` and `facets` are computed over approved distributors that match the **current filters except the facet's own**; a simple version (facets over all approved) is acceptable.
- `my_request_status` = status of this client's row in `export_network_requests`, else `null`.
- Use `company_name` as shown. Do not return `trade_name`.

### `export_network_request_intro(p_distributor_id uuid, p_note text) returns jsonb`
Requires approved client. Distributor must exist with `status = 'approved'`, else `not_found`. Insert into `export_network_requests` (note trimmed, max 500). Unique violation: `already_requested`. Returns `{ "ok": true, "status": "requested" }`.

### `export_network_my_requests() returns jsonb`
Requires approved client. Array, newest first:
`[{ id, distributor_id, company_name, country, country_code, city, status, note, created_at }]`.
`note` is the **client's own** note. Never return `admin_note`.

Error messages the frontend matches on: `not_approved`, `not_found`, `already_requested`.

---

## 5. Notifications (optional, recommended)

- When a client sends a request: notify the admin (use the same mechanism as other admin alerts).
- When admin changes a request status: add a client notification through the existing notification system ("Your introduction to <company> is now <status>").

---

## 6. Test checklist

1. Anonymous call to `export_distributor_apply` with a valid payload returns a reference ID and inserts a `pending` row.
2. Same email again returns `duplicate`.
3. Client without access: `export_network_my_access` gives not approved, `export_network_directory` raises `not_approved`.
4. After admin gives access and approves a distributor, it appears in the directory without contact details.
5. `export_network_request_intro` twice for the same distributor raises `already_requested`.
6. A direct `select` on any of the three tables from the browser returns nothing or is denied.
