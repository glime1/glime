# GLIME Calendar — Backend Spec (जो बनाना है)

Frontend तैयार है: `calendar.html` (शेल के अंदर), Connector कार्ड `connector-calendar-addon.js`, मेन्यू `glime-calendar-nav-addon.js`.
Backend अभी **कुछ भी नहीं बना है**। यह फ़ाइल बताती है कि क्या-क्या बनाना है।

---

## 1. बनाने की सूची (एक नज़र में)

1. 6 टेबल्स + RLS (सेक्शन 3)
2. एक Edge Function: `glime-glimecal-gateway` (`verify_jwt = true`) — 15 actions (सेक्शन 4)
3. AI एजेंट के लिए 6 tools: WhatsApp / Instagram AI से बुकिंग (सेक्शन 6)
4. (वैकल्पिक) Connector ON/OFF का backend flag (सेक्शन 7)

---

## 2. Gateway के सामान्य नियम

- Function का नाम: **`glime-glimecal-gateway`**, `verify_jwt = true`.
- Frontend हर कॉल इस तरह करता है:
  `POST {SUPABASE_URL}/functions/v1/glime-glimecal-gateway?action=<action>`
  Headers: `Authorization: Bearer <access_token>`, `apikey`, `Content-Type: application/json`. Body JSON (कुछ actions में खाली `{}`).
- **client_id कभी browser से नहीं आएगा।** Session के `auth.uid()` से `client_data.auth_user_id → client_id` निकालो (जैसे बाकी gateways में है)।
- सफल जवाब: HTTP 200 + JSON।
- Error: non-2xx + `{ "error": "इंसान को दिखने वाला छोटा message" }`. Frontend यही `error` टेक्स्ट सीधे दिखाता है।
- हर query में `client_id = <क्लाइंट>` ज़रूर लगाओ (दूसरे क्लाइंट का डेटा कभी न दिखे)।
- IDs: `uuid`. Frontend id को string की तरह ही इस्तेमाल करता है।

---

## 3. टेबल्स (सब में `client_id` + RLS: सिर्फ़ अपने client_id की rows)

### `calendar_settings` (हर क्लाइंट की 1 row)
| column | type | default |
|---|---|---|
| client_id | text, PK | |
| industry | text | `'general'` (मान: `clinic, salon, fitness, coaching, repair, general`) |
| auto_confirm | boolean | `true` |
| agent_reschedule | boolean | `true` |
| agent_cancel | boolean | `true` |
| min_notice | int (घंटे) | `2` (0–168) |
| max_days | int (दिन आगे) | `60` (1–365) |
| timezone | text | `'Asia/Kolkata'` |
| updated_at | timestamptz | now() |

Row न हो तो `settings.get` defaults लौटाए (नई row बनाने की ज़रूरत नहीं)।

### `calendar_resources` (डॉक्टर / स्टाइलिस्ट / ट्रेनर आदि)
`id uuid PK`, `client_id`, `name text (≤80)`, `color text` (hex, जैसे `#52e8ff`), `created_at`.

### `calendar_services`
`id uuid PK`, `client_id`, `name text (≤80)`, `duration int` (मिनट, **5–480**), `buffer int` (मिनट, **0–120**, default 0), `price numeric` (default 0, Rs), `info text (≤300)` (एजेंट ग्राहक को यह बताता है), `agent boolean` (true = एजेंट बुक कर सकता है; false = सिर्फ़ स्टाफ़), `created_at`.

### `calendar_hours` (हर क्लाइंट के 7 दिन)
`client_id`, `day int` (0=Sunday … 6=Saturday), `on boolean`, `start_time text 'HH:MM'`, `end_time text 'HH:MM'`. PK = (client_id, day).
Default (row न हो तो): Sun बंद, बाकी दिन 10:00–20:00.

### `calendar_bookings`
`id uuid PK`, `client_id`, `resource_id → calendar_resources`, `service_id → calendar_services`, `customer text (≤100)`, `phone text (≤20)`, `start_at timestamptz`, `end_at timestamptz`, `status text`, `source text`, `notes text (≤500)`, `created_at`, `updated_at`.
- `status`: `pending, booked, confirmed, completed, cancelled, no_show`
- `source`: `ai_whatsapp, ai_instagram, staff`
- `end_at = start_at + service.duration` (server में निकालो)
- **Double-booking रोको (DB level):** `EXCLUDE USING gist (resource_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE (status <> 'cancelled')` (extension `btree_gist` चाहिए)।
- Index: `(client_id, start_at)`.

### `calendar_activity` (एजेंट/स्टाफ़ की हाल की गतिविधि)
`id uuid PK`, `client_id`, `type text` (`booked, held, updated, cancelled`), `channel text` (`ai_whatsapp, ai_instagram, staff`), `text text`, `at timestamptz default now()`. Index `(client_id, at desc)`.

> RLS: सब टेबल्स पर enable करो। Browser सीधे टेबल नहीं पढ़ेगा, सिर्फ़ gateway (service role) पढ़ेगा/लिखेगा। फिर भी policy रखो: `client_id` = अपना।

---

## 4. Actions (Request → Response)

सारी तारीख/समय के लिए `start`/`end` **ISO 8601 UTC** में लौटाओ। `date` = `'YYYY-MM-DD'`, `time` = `'HH:MM'` — ये **क्लाइंट के `timezone` के हिसाब से** समझो (सेक्शन 8 देखो)।

| # | action | Request body | Response |
|---|---|---|---|
| 1 | `resources.list` | `{}` | `{ items: [{ id, name, color }] }` |
| 2 | `resource.save` | `{ id?, name, color }` (id हो तो update, नहीं तो insert) | `{ ok: true }` |
| 3 | `resource.delete` | `{ id }` | `{ ok: true }`. अगर इस resource की cancelled के अलावा कोई booking है → **error:** `"Cancel or move its bookings first."` |
| 4 | `services.list` | `{}` | `{ items: [{ id, name, duration, buffer, price, agent, info }] }` |
| 5 | `service.save` | `{ id?, name, duration, buffer, price, info, agent }` | `{ ok: true }` (duration 5–480 जाँचो) |
| 6 | `service.delete` | `{ id }` | `{ ok: true }` (पुरानी bookings रहें; FK में `ON DELETE SET NULL` या soft-delete) |
| 7 | `hours.get` | `{}` | `{ items: [{ day, on, start, end }] }` (7 items) |
| 8 | `hours.save` | `{ items: [{ day, on, start, end }] }` | `{ ok: true }` (on हो तो end > start जाँचो) |
| 9 | `settings.get` | `{}` | `{ industry, auto_confirm, agent_reschedule, agent_cancel, min_notice, max_days }` |
| 10 | `settings.save` | ऊपर के fields में से कोई भी (partial) | `{ ok: true }` (मान range जाँचो) |
| 11 | `activity.list` | `{}` | `{ items: [{ id, type, channel, text, at }] }` — **नई 20** rows |
| 12 | `bookings.list` | `{ from, to }` (ISO) | `{ items: [{ id, resource_id, service_id, customer, phone, start, end, status, source, notes }] }` — `start_at >= from AND < to` |
| 13 | `booking.status` | `{ id, status }` | `{ ok: true }` + activity log (`cancelled` → type `cancelled`, बाकी `updated`; text जैसे `"Rahul marked Confirmed"`) |
| 14 | `booking.delete` | `{ id }` | `{ ok: true }` + activity (`cancelled`, `"<customer> booking deleted"`) |
| 15 | `availability.check` | `{ resource_id, service_id, date, exclude_id?, as? }` | `{ slots: ["10:00", "10:20", …] }` |
| 16 | `booking.save` | `{ id?, resource_id, service_id, customer, phone, date, time, status, notes, source? }` | `{ ok: true }` |

(ऊपर 16 actions हैं — सेक्शन 1 में "15" कहा था, सही गिनती **16** है।)

### `availability.check` का logic
1. उस `date` के हफ़्ते के दिन की `calendar_hours` row लो। `on = false` या service/hours न मिले → `{ slots: [] }`.
2. `step = service.duration + service.buffer` मिनट।
3. `start_time` से शुरू करके हर `step` पर slot बनाओ, जब तक `slot + duration <= end_time`.
4. Slot तभी दो जब: (a) वह **अभी से आगे** हो, (b) उस resource की किसी non-cancelled booking से **overlap न हो** (`exclude_id` वाली booking को छोड़ दो — edit के समय)।
5. अगर `as = 'agent'`: (a) अभी + `min_notice` घंटे के बाद का ही slot, (b) `date > आज + max_days` हो तो खाली, (c) `service.agent = false` हो तो खाली।

### `booking.save` का logic
1. `start = date + time` (क्लाइंट timezone), `end = start + service.duration`.
2. Overlap हो (उसी resource, non-cancelled, दूसरी booking) → error: `"That time overlaps another booking. Pick a free slot."` (DB exclusion constraint से भी पकड़ो, और constraint error को यही message दो)।
3. `id` हो → update + activity `updated` (`"<customer> booking updated"`).
4. `id` न हो → insert + `source` (न आए तो `staff`) + activity:
   `status = pending` → type `held`, text `"<customer> booked <service>"`; वरना type `booked`.
5. `customer` खाली हो तो error। `status` केवल ऊपर की 6 में से।

---

## 5. Error messages (frontend में सीधे दिखते हैं)

- `"Cancel or move its bookings first."`
- `"That time overlaps another booking. Pick a free slot."`
- `"Duration must be between 5 and 480 minutes."`
- सामान्य: `"Request failed. Try again."` (frontend खुद दिखाता है अगर `error` न मिले)
- Unknown action → 400 `{ "error": "Unknown action" }`

---

## 6. AI एजेंट tools (WhatsApp / Instagram चैट से बुकिंग)

Calendar पेज का "Agent" टैब इन्हीं 6 tools का नाम दिखाता है। इन्हें मौजूदा AI runtime (जैसे `client-ai-runtime` / WhatsApp-Instagram AI functions) में जोड़ना है। हर tool उसी logic को चलाए जो ऊपर gateway में है, और **settings के नियम लागू करे**:

| Tool | क्या करे | नियम |
|---|---|---|
| `list_services` | `agent = true` वाली services | बाकी न दिखें |
| `check_availability` | `availability.check` with `as = 'agent'` | min_notice, max_days लागू |
| `create_booking` | `booking.save` | `source = ai_whatsapp` / `ai_instagram` (चैनल से); `auto_confirm = true` → `confirmed`, वरना `pending` (activity type `held`) |
| `reschedule_booking` | मौजूदा booking का समय बदले | सिर्फ़ अगर `agent_reschedule = true`, और सिर्फ़ **उसी ग्राहक** की booking |
| `cancel_booking` | status `cancelled` | सिर्फ़ अगर `agent_cancel = true`, और सिर्फ़ उसी ग्राहक की |
| `find_customer_bookings` | उस फ़ोन नंबर की आने वाली bookings | सिर्फ़ उसी चैट के ग्राहक की |

- एजेंट कभी दूसरे ग्राहक की booking न देख सके/बदल सके।
- हर एजेंट एक्शन पर `calendar_activity` में row लिखो (channel = `ai_whatsapp` / `ai_instagram`)।
- "Run test booking" बटन `availability.check (as=agent)` + `booking.save` (`customer = "Agent test"`, `source = ai_whatsapp`) चलाता है; यह सामान्य booking है, बस delete हो सके।

---

## 7. (वैकल्पिक) Connector ON/OFF का backend flag

अभी ON/OFF सिर्फ़ ब्राउज़र के `localStorage` में है (key `glime_cal_on_<auth user id>`), यानी दूसरे डिवाइस पर दोबारा ON करना पड़ता है। Backend में रखना चाहो तो:

- `calendar_settings` में कॉलम `enabled boolean default false`.
- दो actions: `connector.get` → `{ enabled }`, `connector.set` `{ enabled }` → `{ ok: true }`.
- Gateway के बाकी actions में `enabled = false` हो तो 403 `{ "error": "Calendar is off. Turn it on in Connector." }`.
- एजेंट tools भी `enabled = false` में बंद रहें।

जब यह बन जाए तो मुझे बताना: मैं `connector-calendar-addon.js` के `isOn` / `setOn`, `glime-calendar-nav-addon.js` और `calendar.html` में इसे जोड़ दूँगा।

---

## 8. ध्यान रखने वाली बातें

- **Timezone:** frontend `date` और `time` ब्राउज़र के local समय में भेजता है और slots `"HH:MM"` में पाता है। इसलिए gateway में `calendar_settings.timezone` (default `Asia/Kolkata`) से ही `date + time` को UTC में बदलो और slots उसी timezone में लौटाओ। `start`/`end` हमेशा UTC ISO में लौटाओ।
- `calendar_hours.start_time/end_time` भी उसी business timezone में हैं।
- पुरानी bookings कभी अपने-आप delete न हों।
- Rate limit / input length limits ऊपर की टेबल्स के हिसाब से server में भी लगाओ (सिर्फ़ frontend पर भरोसा नहीं)।
- Function deploy के बाद `calendar.html` अपने-आप असली डेटा पर चलेगा (अभी वही function न मिलने से error दिखता है)।
