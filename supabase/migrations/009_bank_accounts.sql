-- ============================================================================
-- Table bank_accounts : comptes bancaires saisis pour le module Trésorerie.
-- La somme des soldes (par société sélectionnée) sert de "solde initial" du
-- prévisionnel cumulé.
-- ============================================================================

create table if not exists bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  company_key    text not null,
  label          text not null,                       -- "CCP", "Livret A", "Compte courant pro"…
  balance        numeric(14,2) not null default 0,    -- solde au balance_date
  balance_date   date not null default current_date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_bank_accounts_tenant      on bank_accounts(tenant_id);
create index if not exists idx_bank_accounts_company_key on bank_accounts(company_key);

-- ─── RLS : isolation par tenant + bypass superadmin ─────────────────────────

alter table bank_accounts enable row level security;

drop policy if exists "auth reads own tenant bank_accounts"   on bank_accounts;
drop policy if exists "auth writes own tenant bank_accounts"  on bank_accounts;
drop policy if exists "auth updates own tenant bank_accounts" on bank_accounts;
drop policy if exists "auth deletes own tenant bank_accounts" on bank_accounts;

create policy "auth reads own tenant bank_accounts"
  on bank_accounts for select
  using (tenant_id = get_my_tenant_id() or is_superadmin());

create policy "auth writes own tenant bank_accounts"
  on bank_accounts for insert
  with check (tenant_id = get_my_tenant_id());

create policy "auth updates own tenant bank_accounts"
  on bank_accounts for update
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

create policy "auth deletes own tenant bank_accounts"
  on bank_accounts for delete
  using (tenant_id = get_my_tenant_id());

-- Trigger updated_at auto
create or replace function bank_accounts_set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_bank_accounts_updated_at on bank_accounts;
create trigger trg_bank_accounts_updated_at
  before update on bank_accounts
  for each row execute function bank_accounts_set_updated_at();
