# GLIME - Fixed Q&A: Backend Spec

Frontend is finished and live in `settings-teach-ai-addon.js` (Settings > Teach AI > **Fixed Q&A** tab).
This file lists everything the backend must provide so the frontend never needs to change again.

Supabase project: **Glime 1**. Nothing in this file has been created in the database yet.

---

## 1. What the feature does

Inside **Settings > Teach AI** there are two separate parts:

| Part | What the client writes | Who writes the reply | Tokens |
|---|---|---|---|
| **Teach AI** (already built, table `client_ai_lessons`) | question + guidance | AI | normal tokens |
| **Fixed Q&A** (this spec, table `client_fixed_qa`) | question + keywords + exact answer | saved text, sent as is | **0 tokens** |

When a customer message matches a Fixed Q&A, the saved answer is sent directly and the AI is **not called**.
The Fixed Q&A tab tells the client in plain words that no tokens are used.

---

## 2. Table: `client_fixed_qa`

```sql
create table public.client_fixed_qa (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.client_data(client_id) on delete cascade,
  question      text not null check (char_length(btrim(question)) between 2 and 300),
  keywords      text[] not null default '{}',
  answer        text not null check (char_length(btrim(answer)) between 2 and 1000),
  is_active     boolean not null default true,
  use_count     integer not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index client_fixed_qa_client_active_idx
  on public.client_fixed_qa (client_id) where is_active;
```

Notes
- Frontend limits: question 2-300 chars, answer 2-1000 chars (Instagram DM limit), each keyword 2-60 chars, max 20 keywords per item. Enforce the same in the database (CHECK or trigger). Keep `client_id` type the same as `client_data.client_id` (check it before running the DDL).
- Frontend sends `keywords` as a plain text array and updates `updated_at` itself on edit, but add a `BEFORE UPDATE` trigger that sets `updated_at = now()` anyway.
- `use_count` and `last_used_at` are written **only by the backend (service role)**, never by the browser.

### 2.1 Row Level Security (required rule: client sees only own rows)

```sql
alter table public.client_fixed_qa enable row level security;

-- the logged-in owner, resolved the same way as the other client tables
create policy fixed_qa_select_own on public.client_fixed_qa for select
  using (client_id = (select client_id from public.client_data where auth_user_id = auth.uid()));

create policy fixed_qa_insert_own on public.client_fixed_qa for insert
  with check (client_id = (select client_id from public.client_data where auth_user_id = auth.uid()));

create policy fixed_qa_update_own on public.client_fixed_qa for update
  using      (client_id = (select client_id from public.client_data where auth_user_id = auth.uid()))
  with check (client_id = (select client_id from public.client_data where auth_user_id = auth.uid()));

create policy fixed_qa_delete_own on public.client_fixed_qa for delete
  using (client_id = (select client_id from public.client_data where auth_user_id = auth.uid()));
```

Also:
- Block the browser from changing `use_count` / `last_used_at` (column-level `REVOKE UPDATE (use_count, last_used_at)` from `authenticated`, or a trigger that resets them when the caller is not service role).
- Use the same owner-lookup pattern your other `client_*` tables already use if it differs from the above (for example a helper function).
- The matching runtime reads this table with the **service role** (it has no logged-in user).

---

## 3. Plan limit

Add a new entitlement code in `glime_billing_entitlements`:

| code | Free | Growth | Omni |
|---|---|---|---|
| `fixed_qa_items` | 5 | 20 | 80 |

(Use the same row shape and plan identifiers as the other entitlement codes. If a plan has no row, treat the limit as 5.)

**Enforce in the database, not only in the screen.** Create a `BEFORE INSERT` trigger on `client_fixed_qa`:

1. Count the client's existing rows in `client_fixed_qa` (all rows, on or off).
2. Read the client's limit for `fixed_qa_items` from their current plan.
3. If `count >= limit`, raise an exception whose message **contains the text `FIXED_QA_LIMIT_REACHED`**.

```sql
raise exception 'FIXED_QA_LIMIT_REACHED: plan allows % Fixed Q&A', v_limit
  using errcode = 'P0001';
```

The frontend detects the text `fixed_qa_limit` (case-insensitive) in the error message and then shows the upgrade message and disables the form. Without this exact text the screen cannot tell a limit error from any other error.

Edge cases
- Downgrade: if a client has more items than the new limit, **do not delete anything**. Existing items keep working; only new inserts are blocked.
- Use a per-client advisory lock (`pg_advisory_xact_lock(hashtext(client_id::text))`) inside the trigger so two quick inserts cannot both slip past the limit.

---

## 4. RPCs used by the screen

All are `SECURITY DEFINER`, resolve the client from `auth.uid()` (never take `client_id` as a parameter), and `GRANT EXECUTE` to `authenticated` only.
The frontend treats every one of them as optional: if an RPC is missing it hides that part, and the plan limit is still enforced by the trigger. But please build all three.

### 4.1 `get_my_fixed_qa_usage()`
Powers the **"x/N used"** counter and the limit banner.

Returns one row:
```
used       integer   -- rows in client_fixed_qa for this client
limit      integer   -- fixed_qa_items for the current plan; NULL if unlimited
plan_name  text      -- e.g. 'Free', 'Growth', 'Omni' (shown as "in your Growth plan")
```
The counter shows `used/limit used`, for example `3/20 used`. The limit comes from the plan, so it is 5, 20 or 80, not a fixed number.

### 4.2 `get_my_fixed_qa_stats()`
Powers the "answered by Fixed Q&A" and "AI tokens saved" tiles.

Returns one row:
```
answered_count  bigint   -- number of customer messages answered by Fixed Q&A (count of log rows, section 6)
tokens_saved    bigint   -- estimated tokens that would have been used (see section 6.3); NULL if you do not estimate
```
If `tokens_saved` is NULL the tile is hidden.

### 4.3 `test_my_fixed_qa(p_message text)`
Powers the **Test a customer message** box. It must run the **exact same matching function** the live runtime uses (section 5) for the caller's own items, and must **not** write a log, change `use_count`, or charge tokens.

Returns one row:
```
matched     boolean
qa_id       uuid     -- NULL when not matched
question    text
answer      text
confidence  numeric  -- 0..1 (a value above 1 is read as a percentage)
```

---

## 5. Matching (most important part)

Runs inside the incoming-message pipeline (WhatsApp, Instagram, and Voice text if used), **after** the message is stored and **before** any AI call. Build it as one shared SQL or edge-function module so the live path and `test_my_fixed_qa` can never disagree.

### 5.1 Order in the pipeline
1. Customer message arrives.
2. Skip Fixed Q&A if the message has no text (image, audio, reaction, sticker only).
3. Run Fixed Q&A matching for that `client_id` (only `is_active = true` rows).
4. **Matched** -> send the saved `answer`, write the log (section 6), bump `use_count`, **stop** (no AI call, no token deduction).
5. **Not matched** or confidence too low -> continue to the normal AI exactly as today.

Respect the same channel gates as the AI path before sending a fixed answer: channel enabled, channel connected and able to send, the client's own daily message limit (Settings > Automation), and the customer 24-hour window rules. Fixed Q&A saves tokens; it does not bypass message limits or Meta rules. If the channel setting "AI replies" is off, still follow your existing product rule for non-AI auto replies (decide and note it here).

### 5.2 Text clean-up (apply to the customer message AND to every saved question and keyword)
1. Unicode NFKC normalize.
2. Lower-case.
3. Remove emoji and symbols; replace every run of punctuation or symbols with one space (keep letters and digits of any script, so Hindi in Devanagari still works).
4. Collapse repeated spaces, trim.
5. Collapse repeated letters ("pleaseee" -> at most 2 in a row, then also compare a version with 1 in a row).
6. **Hinglish spelling fold** applied to Latin text only, so common spellings meet in the middle. Suggested rules (extend over time):
   - Fold only pairs that really vary in Hinglish: `aa->a, ee->i, oo->u, ii->i, uu->u, ph->f, w->v, z->j` (comparison key only, never the stored text). Do not fold `kh`, `th`, `dh`, because that would merge different words.
   - Examples that must become equal: `kitna / kitnaa`, `khula / khulaa`, `kab / kaab`. Spelling slips like `delivary / delivery` are handled by typo tolerance (rule D below), not by folding.
7. Keep a small **stop-word list** (Hindi + English filler: `hai, hain, kya, ka, ki, ke, ko, me, mein, se, to, please, pls, plz, ji, sir, madam, the, is, are, a, do, you`) that is ignored when scoring, so "shop kab khulta hai" and "kab khulta hai shop" match.

Store a precomputed clean version of the question and every keyword (extra column or a generated column, for example `match_keys text[]`) so matching at runtime is a fast lookup, not a recompute. Recompute on insert and update.

### 5.3 Matching rules (strict on purpose)
A saved item is a **candidate** only if one of these is true after clean-up:

- **A. Exact:** the whole cleaned customer message equals the cleaned question or equals one cleaned keyword. Confidence 1.00.
- **B. Phrase contained:** a cleaned keyword or question that has **2 or more meaningful words** appears as a whole-word phrase inside the cleaned message, and the message has no more than ~12 meaningful words (long messages are probably about something else). Confidence 0.90.
- **C. Single-word keyword:** a keyword that is **one word** counts only when the cleaned message is **short (at most 3 meaningful words)** and the keyword is not a stop-word. Confidence 0.85.
- **D. Typo tolerance:** allow edit distance 1 for words of length 5-8 and 2 for length 9+ (trigram similarity or Levenshtein), never for words of length 4 or less. Confidence capped at 0.80.

Then:
1. **Minimum confidence to send a fixed answer: 0.85.** Rule D alone never reaches it, so D only helps when combined with an A/B/C hit on another part. (Tune this number with real chats; keep it high.)
2. **Ambiguity guard:** if two or more different items are candidates with confidence within 0.05 of the best one, **do not match** (fall back to AI). Two items sharing a keyword must never cause a random pick.
3. **Negation / multi-question guard:** if the message contains more than one question (two or more `?`, or words like "aur", "and also", "bhi bata") or contains a negation near the keyword ("nahi", "not", "don't", "cancel", "refund", "complaint", "problem", "issue", "kharab", "late"), **fall back to AI**. A complaint must never get a canned FAQ reply.
4. Messages in a state where the AI is mid-flow (collecting an order, booking, lead qualification, human handoff active) must **skip Fixed Q&A**, so a keyword like "price" does not break an open flow. Use the same "conversation busy" signals the AI path already has.
5. A conversation that is handed to a human or paused must skip Fixed Q&A.

The frontend already tells the client to keep keywords specific and warns about overlapping keywords between items.

### 5.4 Performance
- One indexed read of the client's active items per message (cache per client for a few seconds is fine; invalidate on change).
- Matching must finish in a few milliseconds; there is no AI or network call on this path.

---

## 6. Billing and the log

### 6.1 Tokens
A fixed answer **deducts 0 tokens**. Do not call the token deduction function at all on this path.

### 6.2 Log row
Write exactly **one** log row per customer message answered by Fixed Q&A, so the client can see tokens saved. Use the existing AI usage / token log table if it supports a "source" value; otherwise create:

```sql
create table public.client_fixed_qa_log (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.client_data(client_id) on delete cascade,
  fixed_qa_id      uuid references public.client_fixed_qa(id) on delete set null,
  channel          text not null check (channel in ('whatsapp','instagram','voice')),
  conversation_id  uuid,
  message_id       text,          -- inbound message id, makes inserts idempotent
  confidence       numeric(4,3),
  tokens_charged   integer not null default 0 check (tokens_charged = 0),
  tokens_saved_est integer,       -- estimate, see 6.3
  note             text not null default 'Answered from Fixed Q&A',
  created_at       timestamptz not null default now(),
  unique (client_id, channel, message_id)
);
alter table public.client_fixed_qa_log enable row level security;
-- owner can only SELECT their own rows; inserts only by service role
```

The note shown to clients: **"Answered from Fixed Q&A"**. Nothing else is logged for this message (no AI request row, no token ledger deduction).
The unique `(client_id, channel, message_id)` makes webhook retries safe, so one customer message can never be counted or sent twice.

### 6.3 `tokens_saved_est`
Simple and stable: use the average tokens of this client's last 50 AI replies (fallback constant, for example 600). Store it on the log row at the time of the answer so old numbers do not change later.

### 6.4 Counters
In the same transaction as the log insert: `use_count = use_count + 1`, `last_used_at = now()` on the matched item. The screen shows "Used N times" and "Last used" from these.

---

## 7. Safe fallback (summary)

Send a fixed answer **only** when all are true: item is on, text message, confidence >= 0.85, no ambiguity, no complaint/negation/multi-question signal, conversation not mid-flow, not handed to a human, channel allowed to send.
In every other case, or if anything in the Fixed Q&A step throws an error, **continue to the normal AI** and never block or delay the customer's reply. Log the error for you, not for the client.

---

## 8. What the frontend sends and expects (contract)

Direct table access with the logged-in client's session (anon key + RLS):

| Action | Call |
|---|---|
| List | `select id,question,keywords,answer,is_active,use_count,last_used_at,created_at,updated_at from client_fixed_qa where client_id = <me> order by updated_at desc limit 500` |
| Add | `insert { client_id, question, keywords[], answer, is_active: true }` then `select` the row back |
| Edit | `update { question, keywords[], answer, updated_at } where id and client_id` |
| On / Off | `update { is_active, updated_at } where id and client_id` |
| Delete | `delete where id and client_id` |

RPCs: `get_my_fixed_qa_usage()`, `get_my_fixed_qa_stats()`, `test_my_fixed_qa(p_message)` as in section 4 (RPC rows may come back as an object or a one-item array; both work).

Errors the screen understands
- Message containing `FIXED_QA_LIMIT_REACHED` -> shows the upgrade message and disables the form.
- Missing table or RPC (`42P01`, `42883`, `PGRST202`, `PGRST205`) -> the Fixed Q&A tab shows "almost ready" and Teach AI keeps working.
- Anything else -> shown as a short error message.

The upgrade button opens `packages.html`.

---

## 9. Checklist

- [ ] Table `client_fixed_qa` + indexes + `updated_at` trigger
- [ ] RLS: owner sees and changes only their own rows; browser cannot change `use_count` / `last_used_at`
- [ ] Entitlement code `fixed_qa_items` (Free 5, Growth 20, Omni 80)
- [ ] `BEFORE INSERT` limit trigger with `FIXED_QA_LIMIT_REACHED`
- [ ] Clean-up + match keys (computed on insert/update)
- [ ] Shared matching function (live runtime and test RPC use the same one)
- [ ] Runtime step before the AI call on WhatsApp and Instagram (and Voice text if used)
- [ ] 0 tokens on match, one log row per answered message (idempotent)
- [ ] `use_count` / `last_used_at` updated on match
- [ ] RPCs: `get_my_fixed_qa_usage`, `get_my_fixed_qa_stats`, `test_my_fixed_qa`
- [ ] Safe fallback to AI on low confidence, ambiguity, complaints, errors
- [ ] Tests (below)

## 10. Test cases to run after building

| Customer message | Saved item | Expected |
|---|---|---|
| `Shop timings?` | question "What are your shop timings", keyword "shop timings" | fixed answer |
| `SHOP   TIMINGS!!! 😀` | same | fixed answer |
| `shop kab khulta hai` | keyword "kab khulta hai" | fixed answer |
| `price kitna hai` | two items both with keyword "price" | AI (ambiguous) |
| `delivery late hai, complaint karna hai` | keyword "delivery" | AI (complaint) |
| `timing aur address bata do` | items for timing and address | AI (multi-question) |
| `ok` | any | AI |
| any message | item turned **off** | AI |
| any message | client at limit, then deletes one, then adds one | insert allowed again |
| 6th add on Free plan | - | `FIXED_QA_LIMIT_REACHED` |
| other client's message | item belongs to a different client | never matches, never visible |
