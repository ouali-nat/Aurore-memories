-- Correct the storage path check for shared group audio objects.
drop policy if exists "Group members upload shared audio" on storage.objects;
create policy "Group members upload shared audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'aurore-group-learning-audio'
    and exists (
      select 1 from public.study_groups g
      where g.id::text = (storage.foldername(storage.objects.name))[1]
        and (g.created_by = (select auth.uid()) or exists (
          select 1 from public.study_group_members m
          where m.group_id = g.id and m.user_id = (select auth.uid())
        ))
    )
  );
drop policy if exists "Group owners delete shared audio" on storage.objects;
create policy "Group owners delete shared audio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'aurore-group-learning-audio'
    and exists (
      select 1 from public.study_groups g
      where g.id::text = (storage.foldername(storage.objects.name))[1]
        and g.created_by = (select auth.uid())
    )
  );
