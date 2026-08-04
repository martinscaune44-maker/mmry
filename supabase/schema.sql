-- ---------------------------------------------------------------------------
-- MMRY — database schema
--
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Sharing model for now: publishing mints a new journey with an unguessable id,
-- and the link is the credential. Nobody can edit or delete a published journey,
-- including its author — republishing simply creates a new link. That avoids
-- needing accounts before they earn their keep, at the cost of orphaned rows.
-- ---------------------------------------------------------------------------

create table if not exists public.journeys (
  id text primary key,
  name text not null default '',
  checkpoints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.journeys enable row level security;

drop policy if exists "Anyone can read a journey" on public.journeys;
create policy "Anyone can read a journey"
  on public.journeys for select
  using (true);

drop policy if exists "Anyone can publish a journey" on public.journeys;
create policy "Anyone can publish a journey"
  on public.journeys for insert
  with check (
    -- Keep obvious junk out: a journey needs a sane name and at least one
    -- checkpoint, and cannot be enormous.
    length(name) <= 120
    and jsonb_typeof(checkpoints) = 'array'
    and jsonb_array_length(checkpoints) between 1 and 50
  );

-- Audio lives in storage rather than the database. 10 MB per file is generous
-- for a soundwalk clip and keeps the free tier from evaporating.
--
-- The type list has to be forgiving. An .m4a voice memo is an MPEG-4 container,
-- so iOS frequently reports audio files as video/mp4 or video/quicktime; a
-- strict audio/* list rejects perfectly good recordings. Size is the limit that
-- actually protects the free tier, so it does the real work here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  true,
  10485760,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
    'audio/aac', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav',
    'audio/wave', 'audio/vnd.wave', 'audio/webm', 'audio/flac', 'audio/x-flac',
    'audio/3gpp', 'audio/amr', 'audio/basic', 'audio/x-caf',
    -- Containers iOS reports for what are really audio recordings.
    'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm',
    -- Some browsers send no useful type at all.
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload audio" on storage.objects;
create policy "Anyone can upload audio"
  on storage.objects for insert
  with check (bucket_id = 'audio');

drop policy if exists "Anyone can read audio" on storage.objects;
create policy "Anyone can read audio"
  on storage.objects for select
  using (bucket_id = 'audio');

-- ---------------------------------------------------------------------------
-- Discovery, for later.
--
-- Deliberately not built yet: a browsable catalogue of walks is the model that
-- sank Detour, and an empty discovery map demos worse than none at all. Links
-- create the supply first; this becomes a query over the same rows.
--
-- When the time comes, store a representative point per journey and index it:
--
--   alter table public.journeys add column origin geography(point);
--   create index journeys_origin_idx on public.journeys using gist (origin);
-- ---------------------------------------------------------------------------
