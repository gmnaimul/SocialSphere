insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can read post media'
  ) then
    create policy "Authenticated users can read post media"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'post-media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own post media'
  ) then
    create policy "Users can upload own post media"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'post-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own post media'
  ) then
    create policy "Users can update own post media"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'post-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      )
      with check (
        bucket_id = 'post-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own post media'
  ) then
    create policy "Users can delete own post media"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'post-media'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;