-- ============================================================================
-- RPC : provision_new_user
-- Crée atomiquement un tenant + une ligne user_roles pour un utilisateur
-- nouvellement inscrit. Appelée depuis src/modules/auth/LoginPage.tsx juste
-- après auth.signUp().
--
-- Sécurité :
--   - SECURITY DEFINER pour bypasser le RLS pendant le provisionnement
--   - p_user_id doit correspondre à l'utilisateur authentifié (auth.uid())
--   - Refuse de re-provisionner un utilisateur déjà rattaché à un tenant
--     (empêche l'escalade de privilège)
-- ============================================================================

create or replace function provision_new_user(
  p_user_id     uuid,
  p_tenant_name text,
  p_role        text default 'admin'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_slug      text;
begin
  -- L'appelant doit être l'utilisateur qu'il provisionne
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'p_user_id must match the authenticated user';
  end if;

  if coalesce(trim(p_tenant_name), '') = '' then
    raise exception 'p_tenant_name is required';
  end if;

  if p_role not in ('admin', 'comptable', 'viewer') then
    raise exception 'invalid role: %', p_role;
  end if;

  -- Refuser le re-provisionnement (anti-escalade)
  if exists (
    select 1 from user_roles
    where user_id = p_user_id and tenant_id is not null
  ) then
    raise exception 'user already provisioned';
  end if;

  -- Slug unique : nom normalisé + suffixe aléatoire
  v_slug := lower(regexp_replace(trim(p_tenant_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) = 0 then
    v_slug := 'tenant';
  end if;
  v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- 1. Créer le tenant
  insert into tenants (name, slug)
  values (trim(p_tenant_name), v_slug)
  returning id into v_tenant_id;

  -- 2. Créer (ou mettre à jour si la ligne user_roles existe sans tenant)
  insert into user_roles (user_id, role, tenant_id)
  values (p_user_id, p_role, v_tenant_id)
  on conflict (user_id) do update
    set role      = excluded.role,
        tenant_id = excluded.tenant_id
    where user_roles.tenant_id is null;

  return v_tenant_id;
end;
$$;

grant execute on function provision_new_user(uuid, text, text) to authenticated;
