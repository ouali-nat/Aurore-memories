-- Permit public groups to stream/download shared audio without weakening private-group isolation.
drop policy if exists "Group members read shared audio" on storage.objects;
create policy "Group members read shared audio"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'aurore-group-learning-audio'
    and exists (
      select 1
      from public.study_groups g
      where g.id::text = (storage.foldername(storage.objects.name))[1]
        and (
          g.visibility = 'public'
          or g.created_by = (select auth.uid())
          or private.is_current_user_study_group_member(g.id)
        )
    )
  );
