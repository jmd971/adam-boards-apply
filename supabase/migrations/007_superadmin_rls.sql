-- ============================================================================
-- Permet aux superadmins de lire les données de TOUS les tenants.
--
-- Problème : les policies RLS utilisent `get_my_tenant_id()` qui retourne
-- le tenant fixe du user. Du coup, même un superadmin ne voyait QUE son
-- tenant attribué — impossible de switch entre tenants depuis le UI.
--
-- Solution : ajouter une fonction `is_superadmin()` et l'incorporer dans
-- toutes les policies SELECT. Les superadmins lisent tout, les autres
-- restent isolés sur leur tenant.
--
-- Note sécurité : les writes (INSERT/UPDATE/DELETE) restent gated sur le
-- tenant pour éviter qu'un superadmin écrive par erreur dans un mauvais
-- tenant via une session pas filtrée côté client.
-- ============================================================================

create or replace function is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and role = 'superadmin'
  );
$$;

-- ── tenants ─────────────────────────────────────────────────────────────────
drop policy if exists "users see own tenant"   on tenants;
drop policy if exists "users read own tenant"  on tenants;
create policy "users read own tenant or superadmin"
  on tenants for select
  using (id = get_my_tenant_id() or is_superadmin());

-- ── company_data ────────────────────────────────────────────────────────────
drop policy if exists "users read own tenant company_data"   on company_data;
drop policy if exists "tenant_isolation_company_data_select" on company_data;
create policy "tenant_isolation_company_data_select"
  on company_data for select
  using (tenant_id = get_my_tenant_id() or is_superadmin());

-- ── budget ──────────────────────────────────────────────────────────────────
drop policy if exists "users read own tenant budget"   on budget;
drop policy if exists "tenant_isolation_budget_select" on budget;
create policy "tenant_isolation_budget_select"
  on budget for select
  using (tenant_id = get_my_tenant_id() or is_superadmin());

-- ── manual_entries ──────────────────────────────────────────────────────────
drop policy if exists "users read own tenant manual_entries"   on manual_entries;
drop policy if exists "tenant_isolation_manual_entries_select" on manual_entries;
create policy "tenant_isolation_manual_entries_select"
  on manual_entries for select
  using (tenant_id = get_my_tenant_id() or is_superadmin());

-- ── relances ────────────────────────────────────────────────────────────────
drop policy if exists "auth reads own tenant relances"        on relances;
create policy "auth reads own tenant relances"
  on relances for select
  using (tenant_id = get_my_tenant_id() or is_superadmin());

-- ── user_roles : un superadmin peut lister tous les rôles (sans modif RLS écriture) ──
drop policy if exists "users read own tenant user_roles"     on user_roles;
drop policy if exists "tenant_isolation_user_roles_select"   on user_roles;
create policy "tenant_isolation_user_roles_select"
  on user_roles for select
  using (
    tenant_id = get_my_tenant_id()
    or user_id = auth.uid()
    or is_superadmin()
  );


