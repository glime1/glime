# Export Network — Admin Backend Spec

Frontend file this spec serves: `admin-export-addon.js` (the **Export Network** tab in `admin.html`).

Tables are defined in `EXPORT_NETWORK_CLIENT_BACKEND_SPEC.md` (section 2). Create them first.

Every function below:

- is `security definer`, `set search_path = public`
- starts with `if not public.is_glime_admin() then raise exception 'not_admin'; end if;`
- is executable by `authenticated` only (revoke from `anon` and `public`)

The admin frontend is finished. Until these functions exist, the tab shows "Backend is not ready".

---

## 1. Distributors

### `admin_export_distributors_list(p_status text default null) returns jsonb`
Array of every distributor (all statuses when `p_status` is null, else only that status). Newest first. Return all columns of `export_distributors` **except** `ip_hash`, `form_ms` and `reviewed_by`. Admin sees contact details.

### `admin_export_application_review(p_application_id uuid, p_action text, p_note text default null, p_licence_verified boolean default false) returns jsonb`

| action | allowed from | result |
|---|---|---|
| `approve` | `pending`, `rejected`, `revoked` | `status='approved'`, `verified_at=now()`, `licence_verified=p_licence_verified`, clear `reject_reason` |
| `reject` | `pending` | `status='rejected'`, `reject_reason=p_note` (note required) |
| `revoke` | `approved` | `status='revoked'`, `reject_reason=p_note` (note required) — the listing disappears from the client directory |

Always set `reviewed_by=auth.uid()`, `reviewed_at=now()`.

Errors: `not_found`, `invalid_transition`, `note_required`, `note_too_long` (note max 500 characters), `invalid` (unknown action).
Returns `{ "ok": true, "status": "approved" }`.

### `admin_export_distributor_create(p_distributor jsonb) returns jsonb`
**Manual add by admin.** Creates the listing already approved, so it shows in the client directory right away.

- Insert with `source='admin'`, `status='approved'`, `verified_at=now()`, `reviewed_by=auth.uid()`, `reviewed_at=now()`, generated `reference_id` (same format as public applications).
- Payload keys: `company_name, trade_name, business_type, established_year, country, country_code, city, address, registration_number, issuing_authority, tax_id, website, docs_link, about, categories[], products_text, import_volume, order_value, payment_terms[], shipping_terms[], certifications, contact_name, designation, email, phone, whatsapp, languages[], primary_language, licence_verified, admin_note`
- Required, else `invalid`: `company_name, business_type, country, country_code, city, categories (1+), contact_name, languages (1+), primary_language (one of languages)`, and **at least one** of `email, phone, whatsapp`.
- `registration_number` is **not** required for admin entries.
- Duplicate open email: `duplicate`.
- Returns `{ "ok": true, "id": "uuid", "reference_id": "EX-..." }`.

### `admin_export_distributor_update(p_id uuid, p_distributor jsonb) returns jsonb`
Same payload and validation as create. Updates the listed fields only. **Does not change `status`.** Unknown id: `not_found`. Returns `{ "ok": true }`.

---

## 2. Client access

### `admin_export_access_list(p_search text default null) returns jsonb`
Every client (from `client_data`, left join `export_network_access`). Optional search over client_id, name, business name, email. Limit 1000. Array of:

```json
{ "client_id": "GLM-0002", "business_name": "", "full_name": "", "email": "",
  "approved": false, "granted_at": null, "updated_at": null }
```

`approved` is `coalesce(access.approved, false)`.

### `admin_export_access_set(p_client_id text, p_allow boolean, p_note text default null) returns jsonb`
Upsert into `export_network_access`: `approved=p_allow`, `granted_at=now()` when allowing, `updated_by=auth.uid()`. Unknown client_id: `not_found`. Returns `{ "ok": true, "approved": true }`.

Effect: `export_network_my_access()` for that client now returns approved, and the Export Network section opens in Others.

---

## 3. Introduction requests

### `admin_export_requests_list(p_status text default null) returns jsonb`
Requests joined with client and distributor, newest first, limit 500. Array of:

```json
{ "id": "uuid", "client_id": "GLM-0002", "business_name": "", "email": "",
  "distributor_id": "uuid", "company_name": "", "country": "", "country_code": "AE", "city": "",
  "note": "client's note", "admin_note": "private", "status": "requested",
  "created_at": "", "updated_at": "" }
```

### `admin_export_request_update(p_request_id uuid, p_status text, p_note text default null) returns jsonb`
Status must be one of `requested, in_progress, active, declined, closed`, else `invalid`. Saves `admin_note=p_note` (max 500, else `note_too_long`). Unknown id: `not_found`. Returns `{ "ok": true, "status": "active" }`.

The client sees only the status. `admin_note` never leaves admin.

---

## 4. Error words the frontend recognises

`not_admin`, `not_found`, `invalid_transition`, `note_required`, `note_too_long`, `duplicate`, `invalid`. Raise them as the exception **message** exactly.

---

## 5. Test checklist

1. Non-admin call to any function raises `not_admin`.
2. A public application shows in the Pending list; Approve moves it to Approved and it appears in the client directory (client with access).
3. Reject without a note raises `note_required`.
4. Remove from directory (`revoke`): the listing disappears from the client directory.
5. Manual add: appears in the Approved list as "Added by admin" and in the client directory immediately.
6. Give access to GLM-xxxx: that client's Others page opens the Export Network. Remove access: it locks again.
7. Changing a request status shows the new status in the client's "My requests".
