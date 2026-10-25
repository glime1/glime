# Admin Contact inbox - backend the frontend expects

Frontend: `admin-contact-addon.js` (adds a "Contact" tab in the admin sidebar).

Today `contact_leads` has only an INSERT policy, so the admin page cannot read the messages.
The addon tries the RPCs below first and falls back to reading the table directly, so either
route works. Until one of them exists, the Contact tab shows a yellow note.

## RPCs (admin only, check `is_glime_admin()` and aal2 like the other admin RPCs)

| RPC | Arguments | Returns |
| --- | --- | --- |
| `admin_contact_list` | `p_type text` (null for all), `p_status text` (null for all), `p_search text`, `p_limit int` | rows of `contact_leads` (all columns), newest first |
| `admin_contact_set_status` | `p_id uuid, p_status text ('New', 'In progress', 'Resolved', 'Closed'), p_note text` | `{ ok: true }`. Write an `audit_log` entry. |

## Simpler alternative (no RPC)

Add a SELECT policy and an UPDATE policy on `contact_leads` for admins only, for example
`using (public.is_glime_admin())`. The addon then reads and updates the table directly.

## Notes

- Rows made before the new columns existed have `inquiry_type` null. The addon reads the first line of `message` (for example `[AGENCY] | Agency code: ... | Topic: ...`) to sort them into Agency, Partner, GLIME client or New project.
- The sidebar badge counts rows with status `New`.
- Optional: set `inquiry_type`, `priority` check constraints, and send the admin alert from `glime_notify_admin_contact` for `Urgent` first.
