-- Reactions table
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reactions_type_valid check (type in ('love', 'hate')),
  constraint reactions_unique_user_per_post unique (post_id, user_id)
);

alter table public.reactions enable row level security;

drop policy if exists "Authenticated can read reactions" on public.reactions;
create policy "Authenticated can read reactions"
on public.reactions
for select
using (true);

drop policy if exists "Users can insert own reactions" on public.reactions;
create policy "Users can insert own reactions"
on public.reactions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own reactions" on public.reactions;
create policy "Users can update own reactions"
on public.reactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own reactions" on public.reactions;
create policy "Users can delete own reactions"
on public.reactions
for delete
using (auth.uid() = user_id);

create index if not exists reactions_post_id_idx on public.reactions (post_id);
create index if not exists reactions_user_id_idx on public.reactions (user_id);

-- Comments table
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments enable row level security;

drop policy if exists "Authenticated can read comments" on public.comments;
create policy "Authenticated can read comments"
on public.comments
for select
using (true);

drop policy if exists "Users can insert own comments" on public.comments;
create policy "Users can insert own comments"
on public.comments
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own comments" on public.comments;
create policy "Users can update own comments"
on public.comments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own comments" on public.comments;
create policy "Users can delete own comments"
on public.comments
for delete
using (auth.uid() = user_id);

create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists comments_user_id_idx on public.comments (user_id);

-- Updated-at triggers
create or replace trigger set_reactions_updated_at
before update on public.reactions
for each row
execute function public.set_updated_at();

create or replace trigger set_comments_updated_at
before update on public.comments
for each row
execute function public.set_updated_at();

-- Accepted friends helper view
create or replace view public.accepted_friends as
select
  f.requester_id as viewer_id,
  f.addressee_id as friend_id
from public.friendships f
where f.status = 'accepted'
union all
select
  f.addressee_id as viewer_id,
  f.requester_id as friend_id
from public.friendships f
where f.status = 'accepted';

-- Feed helper view: posts from viewer and accepted friends
create or replace view public.friend_feed as
select
  af.viewer_id,
  p.id
from public.accepted_friends af
join public.posts p on p.user_id = af.friend_id
union all
select
  p.user_id as viewer_id,
  p.id
from public.posts p;

-- Realtime support
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.profiles;