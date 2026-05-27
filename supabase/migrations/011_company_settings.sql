-- ============================================================================
-- Table company_settings : réglages par société (scoping tenant).
-- Premier réglage : fiscal_year_start_month — mois de début d'exercice (1-12).
--   1  = janvier  → exercice = année civile (comportement par défaut, rétro-compat)
--   10 = octobre  → exercice du 1er oct au 30 sep (ex : SCI à cheval sur 2 années)
-- Extensible pour d'autres réglages société à venir.
-- ============================================================================

create table if not exists company_settings (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references tenants(id) on delete cascade,
  company_key              text not null,
  fiscal_year_start_month  smallint not null default 1
    check (fiscal_year_start_month between 1 and 12),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (tenant_id, company_key)
);

create index if not exists idx_company_settings_tenant      on company_settings(tenant_id);
create index if not exists idx_company_settings_company_key on company_settings(company_key);

-- ─── RLS : isolation par tenant + bypass superadmin ─────────────────────────

alter table company_settings enable row level security;

drop policy if exists "auth reads own tenant company_settings"   on company_settings;
drop policy if exists "auth writes own tenant company_settings"  on company_settings;
drop policy if exists "auth updates own tenant company_settings" on company_settings;
drop policy if exists "auth deletes own tenant company_settings" on company_settings;

create policy "auth reads own tenant company_settings"
  on company_settings for select
  using (tenant_id = get_my_tenant_id() or is_superadmin());

create policy "auth writes own tenant company_settings"
  on company_settings for insert
  with check (tenant_id = get_my_tenant_id());

create policy "auth updates own tenant company_settings"
  on company_settings for update
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

create policy "auth deletes own tenant company_settings"
  on company_settings for delete
  using (tenant_id = get_my_tenant_id());

-- Trigger updated_at auto
create or replace function company_settings_set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_company_settings_updated_at on company_settings;
create trigger trg_company_settings_updated_at
  before update on company_settings
  for each row execute function company_settings_set_updated_at();
