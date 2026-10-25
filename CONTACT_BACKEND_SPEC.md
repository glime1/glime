# Contact page - backend notes

`contact.html` now asks who the person is: New project, GLIME client, Agency, or Partner.
Agency and Partner must enter their code. The form works today with no backend change
(details are written at the top of `message`, and `selected_package` shows the request type).
Add the items below to store the details in proper columns and to verify codes.

## 1. Extra columns on `contact_leads` (all nullable text)

| column | filled with |
| --- | --- |
| inquiry_type | `business`, `support`, `agency` or `partner` |
| support_code | the Agency code or Partner code |
| topic | topic chosen in the form |
| priority | `Normal` or `Urgent` (agency and client support) |
| client_ref | client ID, registered email or referred customer |
| budget | budget range (new project only) |
| contact_pref | e.g. `WhatsApp, Evening (4 pm to 8 pm)` |
| reference_id | e.g. `GL-261025-AB12`, shown to the user after submit |

The page first inserts with these columns. If any column is missing, it retries with the
old columns only, so adding them later switches the structured data on without a code change.

## 2. Optional RPC `contact_verify_code(p_kind text, p_code text) returns boolean`

- `p_kind` is `agency` or `partner`. Compare `upper(p_code)` with `glime_agencies.agency_code` or `glime_partners.partner_code`.
- Return `true` or `false` only (never agency details). `security definer`, executable by `anon` and `authenticated`.
- Rate limit it (for example 20 calls per IP per hour), because it can be used to guess codes.
- If the RPC does not exist, the page accepts the code by format and the team confirms it manually.

## 3. Admin and alerts

- Update `glime_notify_admin_contact` so the alert shows `inquiry_type`, `support_code`, `topic` and `priority`. Urgent agency requests should notify first.
- Admin leads list: filter by `inquiry_type`, show `support_code` and join to the agency or partner record.

## 4. URL shortcuts used by other pages

`contact.html?type=agency&code=<AGENCY_CODE>&topic=Wallet%20or%20top-up` opens the form pre-filled.
Topics: agency (Wallet or top-up, Add or set up a client, Plan pricing or margin, Billing or GST invoice, Application or documents, Team access, Technical issue, Something else), partner (Commission or payout, Referral not tracked, Referral link or code, Tier or rewards, Dashboard issue, Something else).
