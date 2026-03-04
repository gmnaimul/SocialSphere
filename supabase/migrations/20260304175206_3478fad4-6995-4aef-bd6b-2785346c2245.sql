-- Shared updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key,
  full_name text not null default '',
  avatar_url text,
  cover_url text,
  date_of_birth date,
  is_online boolean not null default false,
  theme text,
  font_size text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create index if not exists idx_profiles_created_at on public.profiles(created_at desc);

-- POSTS
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content text,
  media_url text,
  type text not null default 'status',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_type_check check (type in ('status', 'photo'))
);

alter table public.posts enable row level security;

create index if not exists idx_posts_user_created on public.posts(user_id, created_at desc);
create index if not exists idx_posts_type on public.posts(type);

-- FRIENDSHIPS
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  addressee_id uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_status_check check (status in ('pending', 'accepted', 'declined')),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

alter table public.friendships enable row level security;

create unique index if not exists uq_friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists idx_friendships_requester on public.friendships(requester_id);
create index if not exists idx_friendships_addressee on public.friendships(addressee_id);

-- MESSAGES
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  receiver_id uuid not null,
  content text,
  media_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_no_self check (sender_id <> receiver_id)
);

alter table public.messages enable row level security;

create index if not exists idx_messages_receiver_read on public.messages(receiver_id, is_read);
create index if not exists idx_messages_pair_created on public.messages(sender_id, receiver_id, created_at desc);

-- updated_at triggers (idempotent)
drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_posts_set_updated_at on public.posts;
create trigger trg_posts_set_updated_at
before update on public.posts
for each row
execute function public.set_updated_at();

drop trigger if exists trg_friendships_set_updated_at on public.friendships;
create trigger trg_friendships_set_updated_at
before update on public.friendships
for each row
execute function public.set_updated_at();

-- RLS policies (idempotent)
do $$
begin
  -- profiles
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='Authenticated can read profiles'
  ) then
    create policy "Authenticated can read profiles"
      on public.profiles
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='Users can insert own profile'
  ) then
    create policy "Users can insert own profile"
      on public.profiles
      for insert
      to authenticated
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  -- posts
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='posts' and policyname='Authenticated can read posts'
  ) then
    create policy "Authenticated can read posts"
      on public.posts
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='posts' and policyname='Users can insert own posts'
  ) then
    create policy "Users can insert own posts"
      on public.posts
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='posts' and policyname='Users can update own posts'
  ) then
    create policy "Users can update own posts"
      on public.posts
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='posts' and policyname='Users can delete own posts'
  ) then
    create policy "Users can delete own posts"
      on public.posts
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;

  -- friendships
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='friendships' and policyname='Users can read own friendships'
  ) then
    create policy "Users can read own friendships"
      on public.friendships
      for select
      to authenticated
      using (auth.uid() = requester_id or auth.uid() = addressee_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='friendships' and policyname='Users can create friendship requests'
  ) then
    create policy "Users can create friendship requests"
      on public.friendships
      for insert
      to authenticated
      with check (auth.uid() = requester_id and requester_id <> addressee_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='friendships' and policyname='Users can update own friendships'
  ) then
    create policy "Users can update own friendships"
      on public.friendships
      for update
      to authenticated
      using (auth.uid() = requester_id or auth.uid() = addressee_id)
      with check (auth.uid() = requester_id or auth.uid() = addressee_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='friendships' and policyname='Users can delete own friendships'
  ) then
    create policy "Users can delete own friendships"
      on public.friendships
      for delete
      to authenticated
      using (auth.uid() = requester_id or auth.uid() = addressee_id);
  end if;

  -- messages
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='messages' and policyname='Users can read own messages'
  ) then
    create policy "Users can read own messages"
      on public.messages
      for select
      to authenticated
      using (auth.uid() = sender_id or auth.uid() = receiver_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='messages' and policyname='Users can send messages'
  ) then
    create policy "Users can send messages"
      on public.messages
      for insert
      to authenticated
      with check (auth.uid() = sender_id and sender_id <> receiver_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='messages' and policyname='Receivers can mark messages read'
  ) then
    create policy "Receivers can mark messages read"
      on public.messages
      for update
      to authenticated
      using (auth.uid() = receiver_id)
      with check (auth.uid() = receiver_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='messages' and policyname='Users can delete own sent messages'
  ) then
    create policy "Users can delete own sent messages"
      on public.messages
      for delete
      to authenticated
      using (auth.uid() = sender_id);
  end if;
end $$;

-- Realtime for chat badge and chat streams
alter publication supabase_realtime add table public.messages;