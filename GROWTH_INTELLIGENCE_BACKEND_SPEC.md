# GLIME Business Growth Intelligence — Backend Spec

Spec only. Nothing here has been created in Supabase. The page (`glime-intelligence-center.html` + `gi-*.js`) calls the RPCs / edge functions below.
Until a function exists, its section shows "being set up" (PGRST202 / 42883 / HTTP 404 = missing), so the page works while you build these one by one.
The exact response shape each section reads is also written in the header comment of its file (`gi-<section>.js`). **If a comment and this file differ, the file's comment is the contract.**

## Global rules
- Client is always resolved from `auth.uid()` inside the function. The frontend never sends `client_id`.
- RPCs: `SECURITY DEFINER`, `search_path = public`, `GRANT EXECUTE ... TO authenticated` only. Raise `AUTH_REQUIRED` / `CLIENT_NOT_FOUND` when there is no client.
- Never invent data. Unknown = `null` (UI shows "—"). AI-produced data must be labelled (`source`, `disclaimer`) and carry `source_url` where one exists.
- Time zone `Asia/Kolkata` unless the client has its own. `p_range` ∈ `7d | 30d | this_month`.
- Edge functions: `POST /functions/v1/<name>`, JWT required, JSON in/out. 401 auth, 402 or `code:"AI_CREDITS_EXHAUSTED"` credits, 429 rate limit, other non-2xx or `{error}` = backend error. Spend AI credits the same way client-assistant does.

## A. Already existing (unchanged contracts)
`get_client_business_growth_trend(p_range)`, `get_client_business_growth_overview(p_selected_date)`, `get_client_action_impact_cards(p_limit)`, `get_client_evidence_metrics()`, `get_client_decision_action_center()`, `get_client_proactive_insights()`, `create_client_decision_action_proposal(p_decision_id)`, `approve_client_business_action(p_action_request_id)`, `reject_client_business_action(p_action_request_id)`, `update_client_action_proposal(p_action_request_id,p_changes)`, `get_client_decision_leads(...)`, `skip_client_decision_lead`, `restore_client_decision_lead`; edge `client-decision-action-proposal` (modes `prepare`, `switch`), edge `client-assistant`.

## B. New RPCs (shapes the page reads)

**`get_growth_channel_roi(p_range)`** → `{meta:{currency, ai_cost_available}, channels:[{channel, leads, won, orders, paid_orders, revenue|null, avg_first_response_seconds|null, ai_messages|null, ai_cost|null, lead_to_won_pct|null}]}`

**`get_growth_product_performance(p_range)`** → `{meta:{currency, tracked}, items:[{key, name, type:'product'|'service', orders, units, revenue, share_pct, trend_pct|null, prev_units|null, repeat_customers|null}]}`. `tracked:false` when orders are not linked to products. `trend_pct` only when the previous period had sales.

**`get_growth_customer_health()`** → `{meta:{as_of,total_customers}, segments:{champions,loyal,new,one_time,at_risk,lost}, definitions:{<segment>:text, note?}, top_customers:[{customer_id,name,orders,total_spent,days_since}], at_risk:[{customer_id,name,orders,total_spent,days_since,usual_gap_days}]}`. Segments are rule-based on the server (e.g. at_risk = overdue vs the customer's own buying gap).

**`get_growth_best_time(p_range)`** → `{meta:{timezone,sample}, matrix:[{dow 0-6 (0=Monday), hour 0-23, inbound, won, orders}]}`

**`get_growth_market_demand(p_range)`** → `{meta:{generated_at, region, business_type, source, disclaimer}, items:[{topic, demand_index 0-100, trend_pct|null, momentum:'rising'|'steady'|'falling', in_catalog:true|false|null, evidence, source_url|null}], own_top:[{name,units}]}`. Reads the cache written by edge `growth-market-demand`. Always AI-assisted estimate.

**Competitors**
- `list_growth_competitors()` → `[{id, name, instagram_handle, website, followers|null, city, price_note, offers:[text], notes, source:'client'|'ai', status:'active'|'suggested'|'ignored'}]`
- `upsert_growth_competitor(p_payload jsonb)` — payload `{id|null, name, instagram_handle, followers, website, city, price_note, offers:[..], notes}` → saved row (source = `client`)
- `delete_growth_competitor(p_id)`, `set_growth_competitor_status(p_id, p_status)` (`active|ignored`)
- `get_growth_competitor_report()` → `null | {generated_at, confidence, summary, comparison:[{metric, you, competitors:[{name,value}]}], gaps:[text], opportunities:[text], threats:[text], sources:[{title,url}]}`
- `get_growth_own_profile()` → `{name, city, category, instagram_handle, followers, offers}` (client's own side of the comparison)

**`get_growth_forecast(p_horizon_days)`** → `{meta:{method, confidence:'low|medium|high', history_days, enough_data, currency}, history:[{date,revenue,orders}], forecast:[{date,revenue,orders,low,high}], totals:{expected_revenue, low, high, expected_orders}}`. Trend + weekday seasonality is enough. `enough_data:false` below 14 days of history.

**Goals** — `get_growth_goals()` → `[{id, metric:'revenue|orders|leads|customers', target, period_start, period_end, current, progress_pct, expected_pct_today, status:'achieved|ahead|on_track|behind|missed'}]`; `set_growth_goal(p_metric,p_target,p_period_start,p_period_end)`; `delete_growth_goal(p_id)`.

**`get_growth_weekly_briefing()`** → `null | {id, week_start, week_end, generated_at, headline:{en,hi}, summary:{en,hi}, wins:[{en,hi}], risks:[{en,hi}], actions:[{en,hi}], numbers:[{label,value,change_pct}]}` (latest briefing). `hi` must be Hindi in Devanagari.

## C. New edge functions
1. **`growth-market-demand`** `{refresh:true}` — AI + web search for the client's city and category: what is selling more and what people ask for. Stores one cached result per client (TTL ~7 days), returns the same shape as `get_growth_market_demand`. Limit: 1 refresh / 6 h. Items are estimates, with `source_url` where one exists.
2. **`growth-competitor-research`** `{mode:'discover'|'analyze'}` — `discover`: finds 5–8 competitors in the client's city/category and inserts them with `source:'ai', status:'suggested'` (never overwrites client-entered rows). `analyze`: compares own profile vs tracked competitors and stores the report. Same credit / rate rules.
3. **`growth-weekly-briefing`** `{force?:true}` — builds the weekly briefing from the client's own numbers (trend, channels, products, health, goals) in English and Hindi. `force:true` regenerates on demand (limit 1 / day → HTTP 429). Uses only data that exists.

## D. New tables (RLS: client sees only own rows)
`growth_competitors`, `growth_competitor_reports`, `growth_goals`, `growth_market_cache`, `growth_weekly_briefings` (unique `client_id + week_start`). All with `client_id`, `created_at`, `updated_at`.

## E. Scheduling
Weekly cron (Monday ~08:00 IST) calls `growth-weekly-briefing` for every active client so the briefing is ready when they open the page. Optional weekly `growth-market-demand` refresh for clients with credits.

## F. Ask Anaya (optional improvement)
The page embeds the card's numbers (≤ 1800 chars) inside the first message to `client-assistant`. Optionally accept `{context:{section, period, lines[]}}` in the request and put it in Anaya's system prompt instead. Anaya must keep refusing to approve actions from this mini chat — the UI sends the client to the full chat for approvals.
