-- Migration 016 : table rapports (cache des rapports d'activité générés par IA)
create table if not exists rapports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_key text not null,
  period_start date not null,
  period_end date not null,
  data_json jsonb not null default '{}',
  rapport_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists rapports_tenant_company_idx
  on rapports(tenant_id, company_key, period_start desc);

alter table rapports enable row level security;

create policy "rapports_tenant_rw" on rapports
  for all using (
    tenant_id in (
      select tenant_id from user_roles
      where user_id = auth.uid()
        and role in ('admin', 'comptable', 'superadmin')
    )
  );
