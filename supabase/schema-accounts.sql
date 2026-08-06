-- ---------------------------------------------------------------------------
-- MMRY — accounts, visibility and tags
--
-- Run once in the Supabase SQL Editor, after schema.sql. Safe to re-run.
--
-- What changes: a journey can now belong to somebody, can be hidden, and can
-- carry tags. What deliberately does not change: a link is still all a walker
-- needs. Requiring an account to open a walk would break the only distribution
-- this product has — a message from a friend — so "private" means "not shared
-- yet", not "sign in to listen".
--
--   private   only its owner, signed in
--   unlisted  anyone with the link. The default, and what every existing row
--             already is
--   public    anyone with the link, and listed once discovery exists
--
-- Rows written before this migration get user_id = null and visibility =
-- 'unlisted', which is exactly what they are today. Nothing already shared
-- stops working.
-- ---------------------------------------------------------------------------

alter table public.journeys
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists visibility text not null default 'unlisted',
  add column if not exists tags text[] not null default '{}';

-- Added separately from the column so re-running does not fail on a constraint
-- that already exists.
alter table public.journeys drop constraint if exists journeys_visibility_check;
alter table public.journeys
  add constraint journeys_visibility_check
  check (visibility in ('private', 'unlisted', 'public'));

-- A closed vocabulary rather than free text. Free tags fragment immediately
-- into funny / Funny / comedy, and moderating them is not built.
alter table public.journeys drop constraint if exists journeys_tags_check;
alter table public.journeys
  add constraint journeys_tags_check
  check (
    array_length(tags, 1) is null
    or (
      array_length(tags, 1) <= 5
      and tags <@ array[
        'musical', 'funny', 'atmospheric', 'morning',
        'late night', 'historical', 'personal'
      ]::text[]
    )
  );

-- "My walks" is the only listing that exists, so this is the only index needed.
create index if not exists journeys_user_id_idx
  on public.journeys (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- Replaces the blanket "anyone can read anything" from schema.sql.
drop policy if exists "Anyone can read a journey" on public.journeys;
drop policy if exists "Readable unless private" on public.journeys;
create policy "Readable unless private"
  on public.journeys for select
  using (visibility <> 'private' or user_id = auth.uid());

drop policy if exists "Anyone can publish a journey" on public.journeys;
drop policy if exists "Publish as yourself or as nobody" on public.journeys;
create policy "Publish as yourself or as nobody"
  on public.journeys for insert
  with check (
    -- Claiming someone else's user_id is the one thing that must be impossible
    -- here. Signed out means null, which stays allowed.
    (user_id is null or user_id = auth.uid())
    -- A journey nobody owns cannot be made private: there would be no account
    -- that could ever open it again.
    and (user_id is not null or visibility = 'unlisted')
    -- Same junk filter as before: a sane name, and a real but bounded walk.
    and length(name) <= 120
    and jsonb_typeof(checkpoints) = 'array'
    and jsonb_array_length(checkpoints) between 1 and 50
  );

-- Journeys used to be immutable, which is why republishing minted a new link.
-- Owning one is what makes editing safe to allow.
drop policy if exists "Owners can update their journeys" on public.journeys;
create policy "Owners can update their journeys"
  on public.journeys for update
  using (user_id is not null and user_id = auth.uid())
  with check (user_id = auth.uid() and length(name) <= 120);

drop policy if exists "Owners can delete their journeys" on public.journeys;
create policy "Owners can delete their journeys"
  on public.journeys for delete
  using (user_id is not null and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Audio
--
-- Objects are stored at "<journeyId>/<checkpointId>.<ext>", so the first path
-- segment identifies the journey and ownership can be looked up from it.
-- Delete the audio before the row: once the row is gone this check can no
-- longer find an owner, and the files would be stranded in the bucket.
-- ---------------------------------------------------------------------------

drop policy if exists "Owners can delete their journey audio" on storage.objects;
create policy "Owners can delete their journey audio"
  on storage.objects for delete
  using (
    bucket_id = 'audio'
    and exists (
      select 1 from public.journeys j
      -- Fully qualified on purpose: public.journeys also has a "name" column,
      -- and an unqualified one in here would silently resolve to that instead
      -- of the object's path.
      where j.id = split_part(storage.objects.name, '/', 1)
        and j.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Still deliberately absent
--
--   profiles   nothing reads a display name yet, and it cannot be designed
--              properly before discovery exists
--   moderation becomes necessary the moment strangers can find walks, which
--              is the same moment discovery ships — not before
--   origin     the geography column for area search, sketched in schema.sql
-- ---------------------------------------------------------------------------
