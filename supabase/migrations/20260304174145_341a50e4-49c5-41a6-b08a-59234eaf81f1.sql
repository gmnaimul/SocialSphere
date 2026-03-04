-- Ensure profile media buckets exist
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('cover-photos', 'cover-photos', true)
on conflict (id) do nothing;

-- Policies (idempotent via conditional creation)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can read profile media'
  ) then
    create policy "Authenticated users can read profile media"
    on storage.objects
    for select
    to authenticated
    using (bucket_id in ('avatars', 'cover-photos'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own profile media'
  ) then
    create policy "Users can upload own profile media"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id in ('avatars', 'cover-photos')
      and auth.uid()::text = (storage.foldername(name))[1]
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own profile media'
  ) then
    create policy "Users can update own profile media"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id in ('avatars', 'cover-photos')
      and auth.uid()::text = (storage.foldername(name))[1]
    )
    with check (
      bucket_id in ('avatars', 'cover-photos')
      and auth.uid()::text = (storage.foldername(name))[1]
    );
  end if;
end $$;