-- =============================================================================
-- GLIME Client Business Growth Overview
-- public.get_client_business_growth_overview(p_selected_date date DEFAULT NULL)
--
-- SOURCE FILE ONLY. This file is NOT applied automatically. Apply it manually
-- (SQL editor / migration) after review. Creates ONE function: no tables, no
-- triggers, no cron jobs, no Edge Functions.
--
-- Security
--   * SECURITY INVOKER + fixed search_path  -> existing RLS stays in force.
--   * No client_id argument. Client is resolved from auth.uid() via
--     client_data.auth_user_id, and every query is also scoped explicitly.
--   * EXECUTE revoked from PUBLIC and anon, granted to authenticated only.
--
-- Errors (RAISE EXCEPTION, SQLSTATE 28000 / P0002 / 22023)
--   AUTH_REQUIRED, CLIENT_NOT_FOUND, INVALID_DATE
--
-- Time model
--   Business timezone: Asia/Kolkata. Range = last 7 calendar days INCLUDING
--   today (today-6 .. today). Comparison = the 7 days before that.
--   All intervals are half-open [start, next_day). Today may be incomplete.
--
-- Metric definitions
--   leads_created        leads.created_at
--   customers_added      customers.created_at
--   orders_created       orders.created_at
--   won_conversions      lead_learning_events where event_type =
--                        'lead_status_changed' AND new_status = 'won' AND
--                        previous_status IS DISTINCT FROM 'won', dated by
--                        occurred_at, DISTINCT lead_id per day.
--                        ('lead_status_outcome' is a parallel record of the
--                        same transition and 'historical_lead_state' has no
--                        real date: neither is counted.)
--   lead_linked_orders   orders created with lead_id IS NOT NULL
--                        (not every order is a lead conversion).
--   cancelled_orders     DISTINCT orders with an order_status_history row where
--                        to_status IN ('cancelled','canceled'), by created_at.
--   gross_order_value    SUM(orders.total_amount) of orders created, per
--                        currency. This is NOT revenue collected.
--   paid_orders          orders created with payment_status = 'paid'
--   collected_revenue    SUM(orders.paid_amount) where payment_status = 'paid'.
--                        NULL (not 0) when payment tracking is unavailable.
--   revenue_available    true only if at least one order in the period has a
--                        tracked payment status (not NULL / 'not_required').
--   Source fields are kept separate and never merged:
--     orders.source_channel, orders.source, leads.source,
--     status-change event payload->>'source' (conversions; 'Unknown' if absent)
--   Missing source => 'Unknown'. Counts of unattributed rows are returned.
--
-- Returned JSONB shape
--   {
--     "meta": { "timezone", "range_start", "range_end", "previous_start",
--               "previous_end", "generated_at", "today_may_be_incomplete",
--               "detail_row_limit", "data_quality": { ... } },
--     "summary":         { <metrics above> },
--     "previous_period": { <same metrics> },
--     "daily":           [ 7 objects, oldest first, zero days included ],
--     "selected_day":    null | { "date", sections... each bounded }
--   }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_client_business_growth_overview(
  p_selected_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_tz        constant text    := 'Asia/Kolkata';
  c_limit     constant integer := 100;

  v_uid       uuid := auth.uid();
  v_client    public.client_data.client_id%TYPE;
  v_today     date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start     date;
  v_end_excl  date;
  v_pstart    date;
  v_pend_excl date;

  v_ts_start  timestamptz;
  v_ts_end    timestamptz;
  v_ts_pstart timestamptz;
  v_ts_pend   timestamptz;

  v_summary   jsonb;
  v_previous  jsonb;
  v_daily     jsonb;
  v_selected  jsonb := NULL;
  v_quality   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  SELECT cd.client_id
    INTO v_client
    FROM public.client_data cd
   WHERE cd.auth_user_id = v_uid
   LIMIT 1;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_start     := v_today - 6;
  v_end_excl  := v_today + 1;
  v_pstart    := v_start - 7;
  v_pend_excl := v_start;

  IF p_selected_date IS NOT NULL
     AND (p_selected_date < v_start OR p_selected_date > v_today) THEN
    RAISE EXCEPTION 'INVALID_DATE' USING ERRCODE = '22023';
  END IF;

  v_ts_start  := v_start::timestamp     AT TIME ZONE c_tz;
  v_ts_end    := v_end_excl::timestamp  AT TIME ZONE c_tz;
  v_ts_pstart := v_pstart::timestamp    AT TIME ZONE c_tz;
  v_ts_pend   := v_pend_excl::timestamp AT TIME ZONE c_tz;

  ---------------------------------------------------------------------------
  -- Period summaries (current + previous) from one helper expression
  ---------------------------------------------------------------------------
  WITH periods AS (
    SELECT 'current'::text AS p, v_ts_start AS f, v_ts_end AS t
    UNION ALL
    SELECT 'previous', v_ts_pstart, v_ts_pend
  ),
  m AS (
    SELECT
      p.p,
      (SELECT count(*) FROM public.leads l
        WHERE l.client_id = v_client
          AND l.created_at >= p.f AND l.created_at < p.t)                    AS leads_created,
      (SELECT count(*) FROM public.customers cu
        WHERE cu.client_id = v_client
          AND cu.created_at >= p.f AND cu.created_at < p.t)                  AS customers_added,
      (SELECT count(*) FROM public.orders o
        WHERE o.client_id = v_client
          AND o.created_at >= p.f AND o.created_at < p.t)                    AS orders_created,
      (SELECT count(DISTINCT e.lead_id) FROM public.lead_learning_events e
        WHERE e.client_id = v_client
          AND e.event_type = 'lead_status_changed'
          AND e.new_status = 'won'
          AND e.previous_status IS DISTINCT FROM 'won'
          AND e.occurred_at >= p.f AND e.occurred_at < p.t)                  AS won_conversions,
      (SELECT count(*) FROM public.orders o
        WHERE o.client_id = v_client AND o.lead_id IS NOT NULL
          AND o.created_at >= p.f AND o.created_at < p.t)                    AS lead_linked_orders,
      (SELECT count(DISTINCT h.order_id) FROM public.order_status_history h
        WHERE h.client_id = v_client
          AND lower(h.to_status) IN ('cancelled','canceled')
          AND h.created_at >= p.f AND h.created_at < p.t)                    AS cancelled_orders,
      (SELECT count(*) FROM public.orders o
        WHERE o.client_id = v_client AND o.payment_status = 'paid'
          AND o.created_at >= p.f AND o.created_at < p.t)                    AS paid_orders,
      (SELECT count(*) FROM public.orders o
        WHERE o.client_id = v_client
          AND o.payment_status IS NOT NULL
          AND o.payment_status <> 'not_required'
          AND o.created_at >= p.f AND o.created_at < p.t)                    AS payment_tracked_orders,
      (SELECT coalesce(jsonb_object_agg(cur, amt), '{}'::jsonb) FROM (
          SELECT coalesce(nullif(o.currency,''),'UNKNOWN') AS cur,
                 sum(o.total_amount) AS amt
            FROM public.orders o
           WHERE o.client_id = v_client
             AND o.created_at >= p.f AND o.created_at < p.t
           GROUP BY 1) g)                                                    AS gross_by_currency,
      (SELECT coalesce(jsonb_object_agg(cur, amt), '{}'::jsonb) FROM (
          SELECT coalesce(nullif(o.currency,''),'UNKNOWN') AS cur,
                 sum(o.paid_amount) AS amt
            FROM public.orders o
           WHERE o.client_id = v_client AND o.payment_status = 'paid'
             AND o.created_at >= p.f AND o.created_at < p.t
           GROUP BY 1) g)                                                    AS collected_by_currency
    FROM periods p
  )
  SELECT
    (SELECT jsonb_build_object(
        'leads_created',      leads_created,
        'customers_added',    customers_added,
        'orders_created',     orders_created,
        'won_conversions',    won_conversions,
        'lead_linked_orders', lead_linked_orders,
        'unlinked_orders',    orders_created - lead_linked_orders,
        'cancelled_orders',   cancelled_orders,
        'gross_order_value_by_currency', gross_by_currency,
        'paid_orders',        paid_orders,
        'revenue_available',  payment_tracked_orders > 0,
        'collected_revenue_by_currency',
            CASE WHEN payment_tracked_orders > 0 THEN collected_by_currency ELSE NULL END)
       FROM m WHERE p = 'current'),
    (SELECT jsonb_build_object(
        'leads_created',      leads_created,
        'customers_added',    customers_added,
        'orders_created',     orders_created,
        'won_conversions',    won_conversions,
        'lead_linked_orders', lead_linked_orders,
        'unlinked_orders',    orders_created - lead_linked_orders,
        'cancelled_orders',   cancelled_orders,
        'gross_order_value_by_currency', gross_by_currency,
        'paid_orders',        paid_orders,
        'revenue_available',  payment_tracked_orders > 0,
        'collected_revenue_by_currency',
            CASE WHEN payment_tracked_orders > 0 THEN collected_by_currency ELSE NULL END)
       FROM m WHERE p = 'previous')
  INTO v_summary, v_previous;

  ---------------------------------------------------------------------------
  -- Daily rows: exactly seven local dates, zero-activity days included
  ---------------------------------------------------------------------------
  SELECT jsonb_agg(day_obj ORDER BY d) INTO v_daily
  FROM (
    SELECT
      gs.d,
      jsonb_build_object(
        'date', to_char(gs.d, 'YYYY-MM-DD'),
        'is_today', gs.d = v_today,
        'is_complete', gs.d < v_today,
        'leads_created', (SELECT count(*) FROM public.leads l
            WHERE l.client_id = v_client
              AND l.created_at >= gs.f AND l.created_at < gs.t),
        'customers_added', (SELECT count(*) FROM public.customers cu
            WHERE cu.client_id = v_client
              AND cu.created_at >= gs.f AND cu.created_at < gs.t),
        'orders_created', (SELECT count(*) FROM public.orders o
            WHERE o.client_id = v_client
              AND o.created_at >= gs.f AND o.created_at < gs.t),
        'won_conversions', (SELECT count(DISTINCT e.lead_id) FROM public.lead_learning_events e
            WHERE e.client_id = v_client
              AND e.event_type = 'lead_status_changed'
              AND e.new_status = 'won'
              AND e.previous_status IS DISTINCT FROM 'won'
              AND e.occurred_at >= gs.f AND e.occurred_at < gs.t),
        'lead_linked_orders', (SELECT count(*) FROM public.orders o
            WHERE o.client_id = v_client AND o.lead_id IS NOT NULL
              AND o.created_at >= gs.f AND o.created_at < gs.t),
        'cancelled_orders', (SELECT count(DISTINCT h.order_id) FROM public.order_status_history h
            WHERE h.client_id = v_client
              AND lower(h.to_status) IN ('cancelled','canceled')
              AND h.created_at >= gs.f AND h.created_at < gs.t),
        'gross_order_value_by_currency', (SELECT coalesce(jsonb_object_agg(cur, amt), '{}'::jsonb) FROM (
            SELECT coalesce(nullif(o.currency,''),'UNKNOWN') AS cur, sum(o.total_amount) AS amt
              FROM public.orders o
             WHERE o.client_id = v_client
               AND o.created_at >= gs.f AND o.created_at < gs.t
             GROUP BY 1) g),
        'paid_orders', (SELECT count(*) FROM public.orders o
            WHERE o.client_id = v_client AND o.payment_status = 'paid'
              AND o.created_at >= gs.f AND o.created_at < gs.t),
        'collected_revenue_by_currency', (
            CASE WHEN EXISTS (SELECT 1 FROM public.orders o
                               WHERE o.client_id = v_client
                                 AND o.payment_status IS NOT NULL
                                 AND o.payment_status <> 'not_required'
                                 AND o.created_at >= gs.f AND o.created_at < gs.t)
                 THEN (SELECT coalesce(jsonb_object_agg(cur, amt), '{}'::jsonb) FROM (
                         SELECT coalesce(nullif(o.currency,''),'UNKNOWN') AS cur, sum(o.paid_amount) AS amt
                           FROM public.orders o
                          WHERE o.client_id = v_client AND o.payment_status = 'paid'
                            AND o.created_at >= gs.f AND o.created_at < gs.t
                          GROUP BY 1) g)
                 ELSE NULL END),
        'orders_by_source_channel', (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (
            SELECT coalesce(nullif(btrim(o.source_channel),''),'Unknown') AS k, count(*) AS n
              FROM public.orders o
             WHERE o.client_id = v_client
               AND o.created_at >= gs.f AND o.created_at < gs.t
             GROUP BY 1) g),
        'orders_by_source', (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (
            SELECT coalesce(nullif(btrim(o.source),''),'Unknown') AS k, count(*) AS n
              FROM public.orders o
             WHERE o.client_id = v_client
               AND o.created_at >= gs.f AND o.created_at < gs.t
             GROUP BY 1) g),
        'leads_by_source', (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (
            SELECT coalesce(nullif(btrim(l.source),''),'Unknown') AS k, count(*) AS n
              FROM public.leads l
             WHERE l.client_id = v_client
               AND l.created_at >= gs.f AND l.created_at < gs.t
             GROUP BY 1) g),
        'conversions_by_source', (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (
            SELECT coalesce(nullif(btrim(x.src),''),'Unknown') AS k, count(*) AS n
              FROM (SELECT DISTINCT ON (e.lead_id) e.payload->>'source' AS src
                      FROM public.lead_learning_events e
                     WHERE e.client_id = v_client
                       AND e.event_type = 'lead_status_changed'
                       AND e.new_status = 'won'
                       AND e.previous_status IS DISTINCT FROM 'won'
                       AND e.occurred_at >= gs.f AND e.occurred_at < gs.t
                     ORDER BY e.lead_id, e.occurred_at) x
             GROUP BY 1) g)
      ) AS day_obj
    FROM (
      SELECT d::date AS d,
             (d::date)::timestamp       AT TIME ZONE c_tz AS f,
             ((d::date) + 1)::timestamp AT TIME ZONE c_tz AS t
        FROM generate_series(v_start::timestamp, v_today::timestamp, interval '1 day') d
    ) gs
  ) days;

  ---------------------------------------------------------------------------
  -- Data-quality flags (visible attribution coverage, no guessing)
  ---------------------------------------------------------------------------
  SELECT jsonb_build_object(
    'orders_in_range',         count(*),
    'orders_linked_to_lead',   count(*) FILTER (WHERE o.lead_id IS NOT NULL),
    'orders_without_lead',     count(*) FILTER (WHERE o.lead_id IS NULL),
    'orders_without_channel',  count(*) FILTER (WHERE nullif(btrim(o.source_channel),'') IS NULL),
    'payment_tracking_available',
        count(*) FILTER (WHERE o.payment_status IS NOT NULL
                           AND o.payment_status <> 'not_required') > 0,
    'multiple_currencies',
        count(DISTINCT coalesce(nullif(o.currency,''),'UNKNOWN')) > 1
  )
  INTO v_quality
  FROM public.orders o
  WHERE o.client_id = v_client
    AND o.created_at >= v_ts_start AND o.created_at < v_ts_end;

  ---------------------------------------------------------------------------
  -- Selected day detail (every section bounded to c_limit rows)
  ---------------------------------------------------------------------------
  IF p_selected_date IS NOT NULL THEN
    DECLARE
      d_from timestamptz := p_selected_date::timestamp       AT TIME ZONE c_tz;
      d_to   timestamptz := (p_selected_date + 1)::timestamp AT TIME ZONE c_tz;
      s_orders jsonb;  n_orders integer;
      s_conv   jsonb;  n_conv   integer;
      s_leads  jsonb;  n_leads  integer;
      s_custs  jsonb;  n_custs  integer;
      s_hist   jsonb;  n_hist   integer;
    BEGIN
      SELECT count(*) INTO n_orders FROM public.orders o
       WHERE o.client_id = v_client AND o.created_at >= d_from AND o.created_at < d_to;

      SELECT coalesce(jsonb_agg(r ORDER BY r->>'created_at'), '[]'::jsonb) INTO s_orders FROM (
        SELECT jsonb_build_object(
                 'order_id',       o.id,
                 'order_number',   o.order_number,
                 'customer_id',    o.customer_id,
                 'customer_name',  cu.name,
                 'created_at',     o.created_at,
                 'status',         o.status,
                 'payment_status', o.payment_status,
                 'total_amount',   o.total_amount,
                 'currency',       o.currency,
                 'source',         coalesce(nullif(btrim(o.source),''),'Unknown'),
                 'source_channel', coalesce(nullif(btrim(o.source_channel),''),'Unknown'),
                 'lead_id',        o.lead_id,
                 'lead_name',      l.name,
                 'lead_source',    CASE WHEN o.lead_id IS NULL THEN NULL
                                        ELSE coalesce(nullif(btrim(l.source),''),'Unknown') END
               ) AS r
          FROM public.orders o
          LEFT JOIN public.customers cu ON cu.id = o.customer_id AND cu.client_id = v_client
          LEFT JOIN public.leads l      ON l.id  = o.lead_id     AND l.client_id::text  = v_client
         WHERE o.client_id = v_client AND o.created_at >= d_from AND o.created_at < d_to
         ORDER BY o.created_at
         LIMIT c_limit) q;

      SELECT count(DISTINCT e.lead_id) INTO n_conv FROM public.lead_learning_events e
       WHERE e.client_id = v_client
         AND e.event_type = 'lead_status_changed' AND e.new_status = 'won'
         AND e.previous_status IS DISTINCT FROM 'won'
         AND e.occurred_at >= d_from AND e.occurred_at < d_to;

      SELECT coalesce(jsonb_agg(r ORDER BY r->>'occurred_at'), '[]'::jsonb) INTO s_conv FROM (
        SELECT jsonb_build_object(
                 'lead_id',         x.lead_id,
                 'lead_name',       l.name,
                 'occurred_at',     x.occurred_at,
                 'previous_status', x.previous_status,
                 'new_status',      x.new_status,
                 'event_source',    coalesce(nullif(btrim(x.src),''),'Unknown'),
                 'linked_order_count', (SELECT count(*) FROM public.orders o
                                         WHERE o.client_id = v_client AND o.lead_id = x.lead_id),
                 'has_linked_order', EXISTS (SELECT 1 FROM public.orders o
                                         WHERE o.client_id = v_client AND o.lead_id = x.lead_id)
               ) AS r
          FROM (
            SELECT DISTINCT ON (e.lead_id)
                   e.lead_id, e.occurred_at, e.previous_status, e.new_status,
                   e.payload->>'source' AS src
              FROM public.lead_learning_events e
             WHERE e.client_id = v_client
               AND e.event_type = 'lead_status_changed' AND e.new_status = 'won'
               AND e.previous_status IS DISTINCT FROM 'won'
               AND e.occurred_at >= d_from AND e.occurred_at < d_to
             ORDER BY e.lead_id, e.occurred_at
          ) x
          LEFT JOIN public.leads l ON l.id = x.lead_id AND l.client_id = v_client
         ORDER BY x.occurred_at
         LIMIT c_limit) q;

      SELECT count(*) INTO n_leads FROM public.leads l
       WHERE l.client_id = v_client AND l.created_at >= d_from AND l.created_at < d_to;

      SELECT coalesce(jsonb_agg(r ORDER BY r->>'created_at'), '[]'::jsonb) INTO s_leads FROM (
        SELECT jsonb_build_object(
                 'lead_id',         l.id,
                 'name',            l.name,
                 'created_at',      l.created_at,
                 'source',          coalesce(nullif(btrim(l.source),''),'Unknown'),
                 'interest',        l.interest,
                 'product_service', l.product_service,
                 'current_status',  l.status,
                 'status_is_current', true
               ) AS r
          FROM public.leads l
         WHERE l.client_id = v_client AND l.created_at >= d_from AND l.created_at < d_to
         ORDER BY l.created_at
         LIMIT c_limit) q;

      SELECT count(*) INTO n_custs FROM public.customers cu
       WHERE cu.client_id = v_client AND cu.created_at >= d_from AND cu.created_at < d_to;

      SELECT coalesce(jsonb_agg(r ORDER BY r->>'created_at'), '[]'::jsonb) INTO s_custs FROM (
        SELECT jsonb_build_object(
                 'customer_id', cu.id,
                 'name',        cu.name,
                 'created_at',  cu.created_at
               ) AS r
          FROM public.customers cu
         WHERE cu.client_id = v_client AND cu.created_at >= d_from AND cu.created_at < d_to
         ORDER BY cu.created_at
         LIMIT c_limit) q;

      SELECT count(*) INTO n_hist FROM public.order_status_history h
       WHERE h.client_id = v_client AND h.created_at >= d_from AND h.created_at < d_to;

      SELECT coalesce(jsonb_agg(r ORDER BY r->>'created_at'), '[]'::jsonb) INTO s_hist FROM (
        SELECT jsonb_build_object(
                 'order_id',     h.order_id,
                 'order_number', o.order_number,
                 'from_status',  h.from_status,
                 'to_status',    h.to_status,
                 'created_at',   h.created_at,
                 'reason',       left(h.reason, 200)
               ) AS r
          FROM public.order_status_history h
          LEFT JOIN public.orders o ON o.id = h.order_id AND o.client_id = v_client
         WHERE h.client_id = v_client AND h.created_at >= d_from AND h.created_at < d_to
         ORDER BY h.created_at
         LIMIT c_limit) q;

      v_selected := jsonb_build_object(
        'date', to_char(p_selected_date, 'YYYY-MM-DD'),
        'is_today', p_selected_date = v_today,
        'row_limit', c_limit,
        'orders_created',   jsonb_build_object('total', n_orders, 'returned', jsonb_array_length(s_orders),
                              'truncated', n_orders > c_limit, 'rows', s_orders),
        'lead_conversions', jsonb_build_object('total', n_conv,   'returned', jsonb_array_length(s_conv),
                              'truncated', n_conv > c_limit,   'rows', s_conv),
        'new_leads',        jsonb_build_object('total', n_leads,  'returned', jsonb_array_length(s_leads),
                              'truncated', n_leads > c_limit,  'rows', s_leads),
        'new_customers',    jsonb_build_object('total', n_custs,  'returned', jsonb_array_length(s_custs),
                              'truncated', n_custs > c_limit,  'rows', s_custs),
        'order_status_changes', jsonb_build_object('total', n_hist, 'returned', jsonb_array_length(s_hist),
                              'truncated', n_hist > c_limit,   'rows', s_hist),
        'unattributed', jsonb_build_object(
            'orders_without_lead',    (SELECT count(*) FROM jsonb_array_elements(s_orders) e WHERE e->>'lead_id' IS NULL),
            'orders_unknown_channel', (SELECT count(*) FROM jsonb_array_elements(s_orders) e WHERE e->>'source_channel' = 'Unknown'),
            'leads_unknown_source',   (SELECT count(*) FROM jsonb_array_elements(s_leads)  e WHERE e->>'source' = 'Unknown'),
            'conversions_unknown_source', (SELECT count(*) FROM jsonb_array_elements(s_conv) e WHERE e->>'event_source' = 'Unknown'),
            'counted_within_returned_rows', true)
      );
    END;
  END IF;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
        'timezone',        c_tz,
        'range_start',     to_char(v_start, 'YYYY-MM-DD'),
        'range_end',       to_char(v_today, 'YYYY-MM-DD'),
        'previous_start',  to_char(v_pstart, 'YYYY-MM-DD'),
        'previous_end',    to_char(v_start - 1, 'YYYY-MM-DD'),
        'generated_at',    now(),
        'today_may_be_incomplete', true,
        'detail_row_limit', c_limit,
        'data_quality',    v_quality),
    'summary',         v_summary,
    'previous_period', v_previous,
    'daily',           coalesce(v_daily, '[]'::jsonb),
    'selected_day',    v_selected
  );
END;
$$;

COMMENT ON FUNCTION public.get_client_business_growth_overview(date) IS
  'Authenticated client 7-day business growth report (Asia/Kolkata). SECURITY INVOKER, RLS-scoped, no client_id argument.';

REVOKE ALL ON FUNCTION public.get_client_business_growth_overview(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_business_growth_overview(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_client_business_growth_overview(date) TO authenticated;
