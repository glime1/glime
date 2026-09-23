-- GLIME Services workspace backend migration
-- Applied to Supabase project: ufoulgbiqgjriwapuopc

create table if not exists public.offer_media (
  id uuid primary key default gen_random_uuid(),
  offer_version_id uuid not null references public.offer_versions(id) on delete cascade,
  media_type text not null check (media_type in ('image','video','document')),
  storage_path text,
  file_url text,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offer_media_version_idx on public.offer_media(offer_version_id,sort_order);

create table if not exists public.custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  client_id text references public.client_data(client_id) on delete cascade,
  name text not null,
  field_key text not null,
  field_type text not null default 'text',
  label text not null,
  description text,
  options jsonb not null default '{}'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists custom_field_defs_client_key_uidx
on public.custom_field_defs(coalesce(client_id,''),field_key);

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  offer_version_id uuid not null references public.offer_versions(id) on delete cascade,
  field_def_id uuid not null references public.custom_field_defs(id) on delete cascade,
  value_text text,
  value_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(offer_version_id,field_def_id)
);

create index if not exists custom_field_values_version_idx on public.custom_field_values(offer_version_id);

alter table public.offer_media enable row level security;
alter table public.custom_field_defs enable row level security;
alter table public.custom_field_values enable row level security;

-- Tenant RLS policies are intentionally expressed through client_data.auth_user_id.
-- See the deployed migration for the exact policy bodies.
