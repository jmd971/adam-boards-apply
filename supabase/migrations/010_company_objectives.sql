-- ============================================================================
-- Table company_objectives : objectifs de marge par société.
-- Permet à l'utilisateur de définir une cible (taux % ET montant €) par société
-- du tenant. Affichée et éditée depuis la page Objectifs.
-- ============================================================================

create table if not exists company_objectives (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  company_key           text not null,
  target_margin_rate    numeric(5,2),   -- taux de marge cible en % (0-100)
  target_margin_amount  numeric(14,2),  -- marge cible en € (absolu, période annuelle)
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, company_key)
);

create index if not exists idx_company_objectives_tenant      on company_objectives(tenant_id);
create index if not exists idx_company_objectives_company_key on company_objectives(company_key);

-- ─── RLS : isolation par tenant + bypass superadmin ─────────────────────────

alter table company_objectives enable row level security;

drop policy if exists "auth reads own tenant company_objectives"   on company_objectives;
drop policy if exists "auth writes own tenant company_objectives"  on company_objectives;
drop policy if exists "auth updates own tenant company_objectives" on company_objectives;
drop policy if exists "auth deletes own tenant company_objectives" on company_objectives;

create policy "auth reads own tenant company_objectives"
  on company_objectives for select
  using (tenant_id = get_my_tenant_id() or is_superadmin());

create policy "auth writes own tenant company_objectives"
  on company_objectives for insert
  with check (tenant_id = get_my_tenant_id());

create policy "auth updates own tenant company_objectives"
  on company_objectives for update
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

create policy "auth deletes own tenant company_objectives"
  on company_objectives for delete
  using (tenant_id = get_my_tenant_id());

-- Trigger updated_at auto
create or replace function company_objectives_set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_company_objectives_updated_at on company_objectives;
create trigger trg_company_objectives_updated_at
  before update on company_objectives
  for each row execute function company_objectives_set_updated_at();
