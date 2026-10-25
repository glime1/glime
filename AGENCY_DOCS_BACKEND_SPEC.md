# Agency documents (admin asks, agency uploads) - backend the frontend expects

Frontend: `agency-docs.js` (agency side, auto-loaded on agency.html and agency-dashboard.html by partner-config.js) and
`admin-agency-docs-addon.js` (admin side, add a script tag after `admin-agency-addon.js`).

## Table `glime_agency_doc_requests`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| agency_id | uuid | fk glime_agencies |
| label | text | e.g. "PAN card", "FIR copy", or admin's own text |
| note | text null | admin message to the agency |
| status | text | `requested`, `uploaded`, `accepted`, `rejected` (rejected = upload again) |
| file_path | text null | storage path in bucket `agency-docs` |
| file_name, file_size, file_mime | text, int, text | |
| uploaded_at | timestamptz null | |
| reviewer_note | text null | reason when asking to upload again |
| requested_by, reviewed_by | uuid null | admin user ids |
| created_at | timestamptz | default now() |

RLS on: no direct table access for agencies; everything through the RPCs below.

## Storage

Private bucket `agency-docs`. Policies:
- INSERT for authenticated where the first path segment equals `auth.uid()::text` (path is `<user_id>/<request_id>/<timestamp>-<name>`). Cap 5 MB, types pdf, jpeg, png, webp.
- SELECT for admins only (`is_glime_admin()`), used by `createSignedUrl` (300 s) in the admin addon.

## RPCs

| RPC | Who | Arguments | Returns |
| --- | --- | --- | --- |
| `admin_agency_doc_request` | admin | `p_agency_id uuid, p_items jsonb` (array of label strings), `p_note text` | `{ ok }`. Inserts one `requested` row per label. Log in `glime_agency_event_log`. |
| `admin_agency_doc_list` | admin | `p_agency_id uuid` | rows `{ id, label, note, status, file_path, file_name, uploaded_at, reviewer_note }` |
| `admin_agency_doc_review` | admin | `p_request_id uuid, p_action ('accept' or 'reject'), p_note text` | `{ ok }`. `reject` sets status `rejected` and stores `reviewer_note` (required) so the agency can upload again. |
| `agency_get_doc_requests` | agency owner | none | rows `{ id, label, note, status, file_name, reviewer_note }` for the signed-in agency (any agency status, including pending, rejected, suspended) |
| `agency_submit_doc_upload` | agency owner | `p_request_id uuid, p_path text, p_file_name text, p_size int, p_mime text` | `{ ok }`. Allowed only when status is `requested` or `rejected`; check `p_path` starts with `auth.uid()::text || '/' || p_request_id`; set status `uploaded`. |

Notes:
- These RPCs must work for agencies whose status is `rejected` or `pending` (not only `active`).
- Optional: notify the agency by email when documents are requested.
- After all documents are `accepted`, the admin can use the existing Approve action.
