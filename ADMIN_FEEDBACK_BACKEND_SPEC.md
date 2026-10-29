# Admin Feedback inbox - backend the frontend expects

Frontend: `admin-feedback-addon.js` (adds a "Feedback" tab to the admin sidebar, next to Contact).
Read this together with `FEEDBACK_BACKEND_SPEC.md` (table `client_feedback` and the client-side RPC `client_submit_feedback`).

Like the Contact inbox, the addon tries the RPCs below first and falls back to reading/updating the table `client_feedback` directly. Until one route works, the tab shows a yellow note.

## RPCs (admin only: check `is_glime_admin()` and aal2 like the other admin RPCs)

| RPC | Arguments | Returns |
| --- | --- | --- |
| `admin_feedback_list` | `p_type text` (null = all), `p_status text` (null = all), `p_search text`, `p_limit int` | rows, newest first (columns below) |
| `admin_feedback_set_status` | `p_id uuid`, `p_status text` (`new`, `in_progress`, `resolved`, `closed`), `p_note text` (null = keep the old note) | `{ "ok": true }`. Sets `updated_at`; sets `resolved_at` / `resolved_by` when status becomes `resolved` or `closed`; clears them on reopen. Write an `audit_log` entry. |

These two names replace the suggested names in `FEEDBACK_BACKEND_SPEC.md`.

## Columns `admin_feedback_list` must return

All columns of `client_feedback`, plus the client, so the admin sees **who sent it**:

```sql
select f.*,
       cd.business_name,
       cd.client_name,
       cd.email  as client_email,
       cd.mobile as client_phone
from client_feedback f
left join client_data cd on cd.client_id = f.client_id
order by f.created_at desc
limit p_limit;
```

(use the real column names of `client_data`; the frontend reads `business_name`, `client_name`, `client_email`, `client_phone`, and falls back to `client_id` when they are missing).

`metadata` can be a jsonb object. Filters: `p_type` matches `type`, `p_status` matches `status`, `p_search` matches message, business name, client id and reference.

## Simpler alternative (no RPC)

Add a SELECT and an UPDATE policy on `client_feedback` for admins only (`using (public.is_glime_admin())`). The addon then reads and updates the table directly (it will show the client id, since the table has no client name).

## Notes

- The sidebar badge counts rows with status `new`.
- Admin notes are saved in `admin_notes` and shown again on the card.
- Optional: notify the admin on new feedback, with problems (`type = 'bug'`) first.
