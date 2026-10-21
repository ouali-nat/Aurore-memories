create table if not exists public.aurore_certificates (
  certificate_id uuid primary key,
  certificate_code text not null unique,
  service_code text not null default 'MEM' check (service_code ~ '^[A-Z]{2,6}$'),
  resource_type text not null default 'flashcard' check (resource_type in ('flashcard')),
  series_id uuid not null, card_index integer not null check (card_index >= 0),
  series_name text not null default '', author_name text not null default '', domain text not null default '',
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'identified' check (status in ('identified','provenance_verified','certified','revoked','withdrawn')),
  issued_at timestamptz not null default now(), updated_at timestamptz not null default now(), status_note text not null default ''
);
create index if not exists aurore_certificates_series_idx on public.aurore_certificates (series_id, card_index);
create index if not exists aurore_certificates_status_idx on public.aurore_certificates (status);
alter table public.aurore_certificates enable row level security;
revoke all on public.aurore_certificates from anon, authenticated;
grant select on public.aurore_certificates to anon, authenticated;
drop policy if exists "Public can verify Aurore certificate records" on public.aurore_certificates;
create policy "Public can verify Aurore certificate records" on public.aurore_certificates for select to anon, authenticated using (true);
create or replace function public.aurore_prepare_public_card_certificates()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, extensions as $function$
declare item jsonb; result_cards jsonb := '[]'::jsonb; raw_id text; parsed_id uuid; certificate_code text;
begin
 if new.cards is null or jsonb_typeof(new.cards) <> 'array' then return new; end if;
 for item in select value from jsonb_array_elements(new.cards) loop
  raw_id := item->>'certificateId'; parsed_id := null;
  if raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then parsed_id := raw_id::uuid; end if;
  if parsed_id is null then parsed_id := gen_random_uuid(); end if;
  certificate_code := 'AUR-MEM-' || upper(substr(replace(parsed_id::text, '-', ''), 1, 16));
  item := item || jsonb_build_object('certificateId', parsed_id::text, 'certificateCode', certificate_code);
  result_cards := result_cards || jsonb_build_array(item);
 end loop;
 new.cards := result_cards; return new;
end; $function$;
create or replace function public.aurore_sync_public_card_certificates()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, extensions as $function$
declare item jsonb; idx integer := 0; parsed_id uuid; certificate_code text; computed_hash text;
begin
 for item in select value from jsonb_array_elements(coalesce(new.cards, '[]'::jsonb)) loop
  parsed_id := (item->>'certificateId')::uuid; certificate_code := item->>'certificateCode';
  computed_hash := encode(extensions.digest(coalesce(item->>'front', '') || E'\n--AURORE-CARD--\n' || coalesce(item->>'back', ''), 'sha256'), 'hex');
  insert into public.aurore_certificates (certificate_id, certificate_code, service_code, resource_type, series_id, card_index, series_name, author_name, domain, content_hash, status, updated_at)
  values (parsed_id, certificate_code, 'MEM', 'flashcard', new.id, idx, coalesce(new.name, ''), coalesce(new.author_name, ''), coalesce(new.domain, ''), computed_hash, 'identified', now())
  on conflict (certificate_id) do update set certificate_code=excluded.certificate_code, series_id=excluded.series_id, card_index=excluded.card_index, series_name=excluded.series_name, author_name=excluded.author_name, domain=excluded.domain,
   status=case when public.aurore_certificates.content_hash is distinct from excluded.content_hash then 'identified' when public.aurore_certificates.status='withdrawn' then 'identified' else public.aurore_certificates.status end,
   content_hash=excluded.content_hash, updated_at=now();
  idx := idx + 1;
 end loop; return new;
end; $function$;
create or replace function public.aurore_withdraw_public_card_certificates()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, extensions as $function$
declare item jsonb; parsed_id uuid;
begin
 for item in select value from jsonb_array_elements(coalesce(old.cards, '[]'::jsonb)) loop
  if coalesce(item->>'certificateId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   parsed_id := (item->>'certificateId')::uuid;
   update public.aurore_certificates set status='withdrawn', updated_at=now() where certificate_id=parsed_id and status <> 'revoked';
  end if;
 end loop; return old;
end; $function$;
drop trigger if exists aurore_prepare_card_certificates on public.public_card_series;
create trigger aurore_prepare_card_certificates before insert or update on public.public_card_series for each row execute function public.aurore_prepare_public_card_certificates();
drop trigger if exists aurore_sync_card_certificates on public.public_card_series;
create trigger aurore_sync_card_certificates after insert or update on public.public_card_series for each row execute function public.aurore_sync_public_card_certificates();
drop trigger if exists aurore_withdraw_card_certificates on public.public_card_series;
create trigger aurore_withdraw_card_certificates before delete on public.public_card_series for each row execute function public.aurore_withdraw_public_card_certificates();
update public.public_card_series set cards = cards;
