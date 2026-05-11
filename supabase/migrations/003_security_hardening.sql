-- ============================================================================
-- Durcissement sécurité : restriction RLS deposit_links + limites upload
-- ============================================================================
--
-- Problème adressé : la policy "anon reads active deposit_links by token"
-- (using active = true) permettait à un anonyme de lister TOUS les liens
-- actifs en supprimant simplement le filtre token. Fuite d'énumération
-- (sociétés, périodes, tokens).
--
-- Correction : suppression de la policy anon SELECT sur deposit_links et
-- exposition d'une fonction RPC SECURITY DEFINER `get_deposit_link_by_token`
-- qui retourne UNIQUEMENT le lien correspondant au token fourni.

-- ── 1. Suppression de la policy anon trop permissive ────────────────────────
drop policy if exists "anon reads active deposit_links by token" on deposit_links;
drop policy if exists "anon can read active deposit_links" on deposit_links;

-- ── 2. Fonction RPC sécurisée pour la résolution token → lien ───────────────
create or replace function public.get_deposit_link_by_token(p_token text)
returns table (
  id          uuid,
  tenant_id   uuid,
  company_key text,
  label       text,
  period      text,
  active      boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select id, tenant_id, company_key, label, period, active
  from deposit_links
  where token = p_token
    and active = true
  limit 1;
$$;

revoke all on function public.get_deposit_link_by_token(text) from public;
grant execute on function public.get_deposit_link_by_token(text) to anon, authenticated;

-- ── 3. Limite de taille sur les uploads de dépôt FEC (5 MB) ─────────────────
-- La taille est vérifiée côté client mais on fournit un garde-fou serveur via
-- un trigger qui rejette les dépôts > 5 MB.
create or replace function public.enforce_deposit_size_limit()
returns trigger
language plpgsql
as $$
begin
  if new.file_size is not null and new.file_size > 5 * 1024 * 1024 then
    raise exception 'Fichier trop volumineux (max 5 Mo)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_deposit_size_limit on deposits;
create trigger trg_enforce_deposit_size_limit
  before insert on deposits
  for each row execute function public.enforce_deposit_size_limit();
