-- Temporary and revocable unlisted card series share links.
-- Raw tokens are only shared with recipients; the database stores SHA-256 hashes.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.public_card_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_key uuid not null,
  owner_token_hash text not null check (owner_token_hash ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 120),
  domain text not null check (char_length(btrim(domain)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 600),
  cards jsonb not null check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) between 1 and 100),
  background_color text not null default '#4937a6' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  background_image text not null default '' check (
    char_length(background_image) <= 2500000 and
    (background_image = '' or background_image ~ '^data:image/(jpeg|png|webp);base64,')
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists public_card_share_links_owner_created_idx on public.public_card_share_links (owner_key, created_at desc);
create index if not exists public_card_share_links_expiry_idx on public.public_card_share_links (expires_at);
alter table public.public_card_share_links enable row level security;
revoke all on table public.public_card_share_links from public, anon, authenticated;

create or replace function public.create_public_card_share_link(
  p_owner_key uuid, p_owner_token text, p_share_token text,
  p_name text, p_author_name text, p_domain text, p_description text,
  p_cards jsonb, p_background_color text, p_background_image text, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_owner_hash text;
  v_token_hash text;
  v_stored_hash text;
  v_background_color text;
  v_background_image text;
  v_id uuid;
begin
  if p_owner_key is null or p_owner_token is null or char_length(p_owner_token) < 32 or char_length(p_owner_token) > 160
     or p_share_token is null or char_length(p_share_token) < 32 or char_length(p_share_token) > 160 then
    raise exception 'Identifiants de partage invalides';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then raise exception 'Titre invalide'; end if;
  if p_author_name is null or char_length(btrim(p_author_name)) not between 1 and 120 then raise exception 'Auteur invalide'; end if;
  if p_domain is null or char_length(btrim(p_domain)) not between 1 and 100 then raise exception 'Domaine invalide'; end if;
  if coalesce(char_length(p_description),0) > 600 then raise exception 'Description trop longue'; end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'Choisissez une durée comprise entre 1 jour et 90 jours';
  end if;

  v_background_color := coalesce(p_background_color, '#4937a6');
  if v_background_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Couleur de fond invalide'; end if;
  v_background_image := coalesce(p_background_image, '');
  if char_length(v_background_image) > 2500000 or
     (v_background_image <> '' and v_background_image !~ '^data:image/(jpeg|png|webp);base64,') then
    raise exception 'Image de fond invalide ou trop volumineuse';
  end if;
  if p_cards is null or jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) < 1 or jsonb_array_length(p_cards) > 100 then
    raise exception 'La série doit contenir entre 1 et 100 cartes';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_cards) as item
    where jsonb_typeof(item) <> 'object'
      or nullif(btrim(item->>'front'),'') is null
      or nullif(btrim(item->>'back'),'') is null
      or char_length(item->>'front') > 20000
      or char_length(item->>'back') > 20000
      or coalesce(char_length(item->>'backgroundImage'),0) > 2500000
      or (coalesce(item->>'backgroundImage','') <> '' and (item->>'backgroundImage') !~ '^data:image/(jpeg|png|webp);base64,')
      or (coalesce(item->>'backgroundColor','') <> '' and (item->>'backgroundColor') !~ '^#[0-9a-fA-F]{6}$')
  ) then
    raise exception 'Une carte contient un contenu ou un fond invalide';
  end if;

  v_owner_hash := encode(extensions.digest(p_owner_token,'sha256'),'hex');
  v_token_hash := encode(extensions.digest(p_share_token,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext(p_owner_key::text));
  select l.owner_token_hash into v_stored_hash from public.public_card_share_links l
    where l.owner_key = p_owner_key order by l.created_at asc limit 1 for update;
  if found and v_stored_hash <> v_owner_hash then raise exception 'Gestion des liens de cette série non autorisée'; end if;

  insert into public.public_card_share_links
    (owner_key,owner_token_hash,token_hash,name,author_name,domain,description,cards,background_color,background_image,expires_at)
  values
    (p_owner_key,v_owner_hash,v_token_hash,btrim(p_name),btrim(p_author_name),btrim(p_domain),coalesce(btrim(p_description),''),
     p_cards,v_background_color,v_background_image,p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_public_card_share_link(p_share_token text)
returns jsonb language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id',l.id,'owner_key',l.owner_key,'name',l.name,'author_name',l.author_name,'domain',l.domain,
    'description',l.description,'cards',l.cards,'background_color',l.background_color,'background_image',l.background_image,
    'created_at',l.created_at,'expires_at',l.expires_at
  )
  from public.public_card_share_links l
  where p_share_token is not null and char_length(p_share_token) between 32 and 160
    and l.token_hash = encode(extensions.digest(p_share_token,'sha256'),'hex')
    and l.revoked_at is null and l.expires_at > now()
  limit 1
$$;

create or replace function public.list_public_card_share_links(p_owner_key uuid, p_owner_token text)
returns table(id uuid,name text,created_at timestamptz,expires_at timestamptz,revoked_at timestamptz)
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_owner_hash text;
begin
  if p_owner_key is null or p_owner_token is null or char_length(p_owner_token) < 32 or char_length(p_owner_token) > 160 then
    raise exception 'Identifiants de gestion invalides';
  end if;
  v_owner_hash := encode(extensions.digest(p_owner_token,'sha256'),'hex');
  if exists (select 1 from public.public_card_share_links l where l.owner_key=p_owner_key)
     and not exists (select 1 from public.public_card_share_links l where l.owner_key=p_owner_key and l.owner_token_hash=v_owner_hash) then
    raise exception 'Gestion de ces liens non autorisée';
  end if;
  return query select l.id,l.name,l.created_at,l.expires_at,l.revoked_at
    from public.public_card_share_links l where l.owner_key=p_owner_key and l.owner_token_hash=v_owner_hash
    order by l.created_at desc;
end;
$$;

create or replace function public.revoke_public_card_share_link(p_id uuid,p_owner_key uuid,p_owner_token text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_owner_hash text;
begin
  if p_id is null or p_owner_key is null or p_owner_token is null or char_length(p_owner_token) < 32 or char_length(p_owner_token) > 160 then
    raise exception 'Identifiants de gestion invalides';
  end if;
  v_owner_hash := encode(extensions.digest(p_owner_token,'sha256'),'hex');
  update public.public_card_share_links l set revoked_at = coalesce(l.revoked_at,now())
    where l.id=p_id and l.owner_key=p_owner_key and l.owner_token_hash=v_owner_hash;
  if not found then raise exception 'Lien introuvable ou gestion non autorisée'; end if;
  return true;
end;
$$;

revoke all on function public.create_public_card_share_link(uuid,text,text,text,text,text,text,jsonb,text,text,timestamptz) from public;
revoke all on function public.get_public_card_share_link(text) from public;
revoke all on function public.list_public_card_share_links(uuid,text) from public;
revoke all on function public.revoke_public_card_share_link(uuid,uuid,text) from public;
grant execute on function public.create_public_card_share_link(uuid,text,text,text,text,text,text,jsonb,text,text,timestamptz) to anon, authenticated;
grant execute on function public.get_public_card_share_link(text) to anon, authenticated;
grant execute on function public.list_public_card_share_links(uuid,text) to anon, authenticated;
grant execute on function public.revoke_public_card_share_link(uuid,uuid,text) to anon, authenticated;
