-- Shared learning resources for Aurore Mémoire. Existing flashcard tables stay untouched.
create table if not exists public.public_learning_resources (
 id uuid primary key default gen_random_uuid(),
 resource_type text not null check (resource_type in ('memory','audio','qcm')),
 title text not null check (char_length(btrim(title)) between 1 and 160),
 description text not null default '' check (char_length(description) <= 1000),
 subject text not null default '' check (char_length(subject) <= 100),
 author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 author_name text not null default '' check (char_length(author_name) <= 120),
 payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
 visibility text not null default 'public' check (visibility = 'public'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists public_learning_resources_type_created_idx on public.public_learning_resources(resource_type, created_at desc);
alter table public.public_learning_resources enable row level security;
drop policy if exists "Public can read public learning resources" on public.public_learning_resources;
create policy "Public can read public learning resources" on public.public_learning_resources for select to anon, authenticated using (visibility = 'public');
drop policy if exists "Authors publish their own learning resources" on public.public_learning_resources;
create policy "Authors publish their own learning resources" on public.public_learning_resources for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists "Authors update their own learning resources" on public.public_learning_resources;
create policy "Authors update their own learning resources" on public.public_learning_resources for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists "Authors remove their own learning resources" on public.public_learning_resources;
create policy "Authors remove their own learning resources" on public.public_learning_resources for delete to authenticated using (author_id = (select auth.uid()));

create table if not exists public.study_group_shared_resources (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.study_groups(id) on delete cascade,
 shared_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
 resource_type text not null check (resource_type in ('memory','audio','qcm')),
 title text not null check (char_length(btrim(title)) between 1 and 160),
 description text not null default '' check (char_length(description) <= 1000),
 subject text not null default '' check (char_length(subject) <= 100),
 payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
 created_at timestamptz not null default now()
);
create index if not exists study_group_shared_resources_group_created_idx on public.study_group_shared_resources(group_id, created_at desc);
create index if not exists study_group_shared_resources_type_idx on public.study_group_shared_resources(resource_type, group_id);
alter table public.study_group_shared_resources enable row level security;
drop policy if exists "Shared learning resources visible to group audience" on public.study_group_shared_resources;
create policy "Shared learning resources visible to group audience" on public.study_group_shared_resources for select to anon, authenticated using (
 exists (select 1 from public.study_groups g where g.id = study_group_shared_resources.group_id and
 (g.visibility = 'public' or g.created_by = (select auth.uid()) or private.is_current_user_study_group_member(g.id)))
);
drop policy if exists "Group members share learning resources" on public.study_group_shared_resources;
create policy "Group members share learning resources" on public.study_group_shared_resources for insert to authenticated with check (
 shared_by = (select auth.uid()) and exists (select 1 from public.study_groups g where g.id = study_group_shared_resources.group_id and
 (g.created_by = (select auth.uid()) or exists (select 1 from public.study_group_members m where m.group_id = g.id and m.user_id = (select auth.uid()))))
);
drop policy if exists "Authors or group owners remove shared learning resources" on public.study_group_shared_resources;
create policy "Authors or group owners remove shared learning resources" on public.study_group_shared_resources for delete to authenticated using (
 shared_by = (select auth.uid()) or exists (select 1 from public.study_groups g where g.id = study_group_shared_resources.group_id and g.created_by = (select auth.uid()))
);
