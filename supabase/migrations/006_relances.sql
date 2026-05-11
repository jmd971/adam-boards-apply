-- ============================================================================
-- Table relances : journal des actions de relance par client (compte 411xxx)
-- Permet l'historique des relances, le suivi de leurs résultats, et l'analyse
-- de l'efficacité (évolution du délai moyen de paiement).
-- ============================================================================

create table if not exists relances (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  company_key    text not null,
  client_account text not null,       -- compte client (ex. 411DUP, 411MARTIN)
  client_label   text,                -- libellé du client (cache pour affichage)
  date_relance   date not null default current_date,
  type           text not null check (type in ('email', 'telephone', 'courrier', 'mise_en_demeure', 'autre')),
  amount         numeric(14,2),       -- montant relancé (optionnel)
  status         text not null default 'envoyee' check (status in ('envoyee', 'attente', 'resolue', 'partielle')),
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_relances_tenant         on relances(tenant_id);
create index if not exists idx_relances_client_account on relances(client_account);
create index if not exists idx_relances_date           on relances(date_relance desc);

-- ─── RLS : isolation par tenant ────────────────────────────────────────────

alter table relances enable row level security;

drop policy if exists "auth reads own tenant relances"   on relances;
drop policy if exists "auth writes own tenant relances"  on relances;
drop policy if exists "auth updates own tenant relances" on relances;
drop policy if exists "auth deletes own tenant relances" on relances;

create policy "auth reads own tenant relances"
  on relances for select
  using (tenant_id = get_my_tenant_id());

create policy "auth writes own tenant relances"
  on relances for insert
  with check (tenant_id = get_my_tenant_id());

create policy "auth updates own tenant relances"
  on relances for update
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

create policy "auth deletes own tenant relances"
  on relances for delete
  using (tenant_id = get_my_tenant_id());
