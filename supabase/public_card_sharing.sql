-- Public sharing for Aurore Memory card series.
-- Applied to the Aurore memories Supabase project.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.public_card_series (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 120),
  domain text not null check (char_length(btrim(domain)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 600),
  cards jsonb not null check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) between 1 and 100),
  owner_token_hash text not null check (owner_token_hash ~ '^[0-9a-f]{64}$'),
  visibility text not null default 'public' check (visibility = 'public'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.public_card_series enable row level security;
revoke all on table public.public_card_series from anon, authenticated;
grant select (id, name, author_name, domain, description, cards, visibility, created_at, updated_at)
  on table public.public_card_series to anon, authenticated;

drop policy if exists "Public can read published card series" on public.public_card_series;
create policy "Public can read published card series"
  on public.public_card_series for select to anon, authenticated using (visibility = 'public');

create or replace function public.save_public_card_series(
  p_id uuid, p_owner_token text, p_name text, p_author_name text, p_domain text, p_description text, p_cards jsonb
) returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token_hash text; v_stored_hash text;
begin
  if p_id is null or p_owner_token is null or char_length(p_owner_token) < 32 or char_length(p_owner_token) > 160 then
    raise exception 'Identifiants de gestion invalides';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then raise exception 'Titre invalide'; end if;
  if p_author_name is null or char_length(btrim(p_author_name)) not between 1 and 120 then raise exception 'Auteur invalide'; end if;
  if p_domain is null or char_length(btrim(p_domain)) not between 1 and 100 then raise exception 'Domaine invalide'; end if;
  if coalesce(char_length(p_description),0) > 600 then raise exception 'Description trop longue'; end if;
  if p_cards is null or jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) not between 1 and 100 then
    raise exception 'La série doit contenir entre 1 et 100 cartes';
  end if;
  if exists (select 1 from jsonb_array_elements(p_cards) as item
    where jsonb_typeof(item) <> 'object' or nullif(btrim(item->>'front'),'') is null
      or nullif(btrim(item->>'back'),'') is null or char_length(item->>'front') > 20000 or char_length(item->>'back') > 20000) then
    raise exception 'Chaque carte doit avoir une question et une réponse';
  end if;
  v_token_hash := encode(extensions.digest(p_owner_token,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext(p_id::text));
  select owner_token_hash into v_stored_hash from public.public_card_series where id=p_id for update;
  if found then
    if v_stored_hash <> v_token_hash then raise exception 'Gestion de cette série non autorisée'; end if;
    update public.public_card_series set name=btrim(p_name), author_name=btrim(p_author_name),
      domain=btrim(p_domain), description=coalesce(btrim(p_description),''), cards=p_cards, updated_at=now()
      where id=p_id;
  else
    insert into public.public_card_series(id,name,author_name,domain,description,cards,owner_token_hash,visibility)
      values(p_id,btrim(p_name),btrim(p_author_name),btrim(p_domain),coalesce(btrim(p_description),''),p_cards,v_token_hash,'public');
  end if;
  return p_id;
end;
$$;

create or replace function public.delete_public_card_series(p_id uuid,p_owner_token text) returns boolean
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token_hash text;
begin
  if p_id is null or p_owner_token is null or char_length(p_owner_token) < 32 or char_length(p_owner_token) > 160 then
    raise exception 'Identifiants de gestion invalides';
  end if;
  v_token_hash := encode(extensions.digest(p_owner_token,'sha256'),'hex');
  delete from public.public_card_series where id=p_id and owner_token_hash=v_token_hash;
  if not found then raise exception 'Série introuvable ou jeton de gestion incorrect'; end if;
  return true;
end;
$$;
revoke all on function public.save_public_card_series(uuid,text,text,text,text,text,jsonb) from public;
revoke all on function public.delete_public_card_series(uuid,text) from public;
grant execute on function public.save_public_card_series(uuid,text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.delete_public_card_series(uuid,text) to anon, authenticated;
