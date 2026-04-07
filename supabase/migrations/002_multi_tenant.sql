-- ============================================================================
-- Multi-tenant isolation — Script complet
-- Prérequis : tables company_data, budget, manual_entries doivent exister
-- Ce script crée les tables manquantes (user_roles, deposit_links, deposits,
-- tenants) puis ajoute l'isolation multi-tenant sur tout.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 1 : Création des tables manquantes
-- ═══════════════════════════════════════════════════════════════════════════

-- Table des rôles utilisateurs
create table if not exists user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique not null references auth.users(id) on delete cascade,
  role       text not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Table des tenants (cabinets / entreprises)
create table if not exists tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  created_at timestamptz not null default now()
);

-- Liens de dépôt tokenisés
create table if not exists deposit_links (
  id         uuid primary key default gen_random_uuid(),
  token      text unique not null default encode(gen_random_bytes(16), 'hex'),
  company_key text not null,
  label      text,
  period     text not null default 'N',
  created_by uuid references auth.users(id),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Historique des dépôts
create table if not exists deposits (
  id            uuid primary key default gen_random_uuid(),
  link_id       uuid references deposit_links(id),
  company_key   text not null,
  period        text not null,
  file_name     text not null,
  file_path     text not null,
  file_size     bigint,
  status        text not null default 'pending',
  reject_reason text,
  integrated_at timestamptz,
  integrated_by uuid references auth.users(id),
  deposited_at  timestamptz not null default now()
);

-- Index dépôts
create index if not exists idx_deposits_status on deposits(status);
create index if not exists idx_deposits_company on deposits(company_key);
create index if not exists idx_deposit_links_token on deposit_links(token);

-- Storage bucket (privé)
insert into storage.buckets (id, name, public)
values ('fec-deposits', 'fec-deposits', false)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 2 : Ajout tenant_id sur toutes les tables de données
-- ═══════════════════════════════════════════════════════════════════════════

alter table user_roles     add column if not exists tenant_id uuid references tenants(id);
alter table company_data   add column if not exists tenant_id uuid references tenants(id);
alter table budget         add column if not exists tenant_id uuid references tenants(id);
alter table manual_entries add column if not exists tenant_id uuid references tenants(id);
alter table deposit_links  add column if not exists tenant_id uuid references tenants(id);
alter table deposits       add column if not exists tenant_id uuid references tenants(id);

-- Index pour le filtrage par tenant
create index if not exists idx_user_roles_tenant     on user_roles(tenant_id);
create index if not exists idx_company_data_tenant    on company_data(tenant_id);
create index if not exists idx_budget_tenant          on budget(tenant_id);
create index if not exists idx_manual_entries_tenant   on manual_entries(tenant_id);
create index if not exists idx_deposit_links_tenant    on deposit_links(tenant_id);
create index if not exists idx_deposits_tenant         on deposits(tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 3 : Contraintes d'unicité tenant-scoped
-- ═══════════════════════════════════════════════════════════════════════════

-- company_data : (company_key, period) → (tenant_id, company_key, period)
-- Chercher et supprimer l'ancienne contrainte quel que soit son nom
do $$
declare
  _cname text;
begin
  select constraint_name into _cname
    from information_schema.table_constraints
   where table_name = 'company_data'
     and constraint_type = 'UNIQUE'
     and constraint_name not like '%tenant%'
   limit 1;
  if _cname is not null then
    execute format('alter table company_data drop constraint %I', _cname);
  end if;
end $$;

alter table company_data
  add constraint company_data_tenant_company_period_key
  unique (tenant_id, company_key, period);

-- budget : (company_key) → (tenant_id, company_key)
do $$
declare
  _cname text;
begin
  select constraint_name into _cname
    from information_schema.table_constraints
   where table_name = 'budget'
     and constraint_type = 'UNIQUE'
     and constraint_name not like '%tenant%'
   limit 1;
  if _cname is not null then
    execute format('alter table budget drop constraint %I', _cname);
  end if;
end $$;

alter table budget
  add constraint budget_tenant_company_key
  unique (tenant_id, company_key);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 4 : Fonction helper get_my_tenant_id()
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function get_my_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from user_roles where user_id = auth.uid() limit 1;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 5 : RLS policies
-- ═══════════════════════════════════════════════════════════════════════════

-- ── tenants ──────────────────────────────────────────────────────────────────
alter table tenants enable row level security;
drop policy if exists "users see own tenant" on tenants;
create policy "users see own tenant"
  on tenants for select
  using (id = get_my_tenant_id());

-- ── user_roles ───────────────────────────────────────────────────────────────
alter table user_roles enable row level security;
drop policy if exists "users see own tenant roles" on user_roles;
create policy "users see own tenant roles"
  on user_roles for select
  using (tenant_id = get_my_tenant_id());

-- ── company_data ─────────────────────────────────────────────────────────────
alter table company_data enable row level security;
drop policy if exists "tenant isolation on company_data" on company_data;
create policy "tenant isolation on company_data"
  on company_data for all
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

-- ── budget ───────────────────────────────────────────────────────────────────
alter table budget enable row level security;
drop policy if exists "tenant isolation on budget" on budget;
create policy "tenant isolation on budget"
  on budget for all
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

-- ── manual_entries ───────────────────────────────────────────────────────────
alter table manual_entries enable row level security;
drop policy if exists "tenant isolation on manual_entries" on manual_entries;
create policy "tenant isolation on manual_entries"
  on manual_entries for all
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

-- ── deposit_links ────────────────────────────────────────────────────────────
alter table deposit_links enable row level security;
drop policy if exists "auth users can manage deposit_links" on deposit_links;
drop policy if exists "anon can read active deposit_links" on deposit_links;
drop policy if exists "tenant users manage deposit_links" on deposit_links;
drop policy if exists "anon reads active deposit_links by token" on deposit_links;

create policy "tenant users manage deposit_links"
  on deposit_links for all
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

-- Anon lit les liens actifs par token (pas de filtre tenant)
create policy "anon reads active deposit_links by token"
  on deposit_links for select
  using (active = true);

-- ── deposits ─────────────────────────────────────────────────────────────────
alter table deposits enable row level security;
drop policy if exists "anon can insert deposits" on deposits;
drop policy if exists "auth users can read deposits" on deposits;
drop policy if exists "auth users can update deposits" on deposits;
drop policy if exists "tenant users read deposits" on deposits;
drop policy if exists "tenant users update deposits" on deposits;
drop policy if exists "anon inserts deposits via link" on deposits;

create policy "tenant users read deposits"
  on deposits for select
  using (tenant_id = get_my_tenant_id());

create policy "tenant users update deposits"
  on deposits for update
  using (tenant_id = get_my_tenant_id());

-- Anon insère un dépôt : le tenant_id doit correspondre au link
create policy "anon inserts deposits via link"
  on deposits for insert
  with check (
    exists (
      select 1 from deposit_links dl
      where dl.id = link_id
        and dl.active = true
        and dl.tenant_id = tenant_id
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 6 : Storage policies tenant-scoped
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "anon can upload fec deposits" on storage.objects;
drop policy if exists "auth users can read fec deposits" on storage.objects;
drop policy if exists "anon uploads fec deposits" on storage.objects;
drop policy if exists "auth reads own tenant fec deposits" on storage.objects;
drop policy if exists "auth uploads invoice with tenant path" on storage.objects;
drop policy if exists "auth reads own tenant invoices" on storage.objects;

-- fec-deposits : anon peut uploader
create policy "anon uploads fec deposits"
  on storage.objects for insert
  with check (bucket_id = 'fec-deposits');

-- fec-deposits : auth télécharge uniquement dans son tenant
create policy "auth reads own tenant fec deposits"
  on storage.objects for select
  using (
    bucket_id = 'fec-deposits'
    and (storage.foldername(name))[1] = get_my_tenant_id()::text
  );

-- invoice : auth upload dans son tenant
create policy "auth uploads invoice with tenant path"
  on storage.objects for insert
  with check (
    bucket_id = 'invoice'
    and (storage.foldername(name))[1] = get_my_tenant_id()::text
  );

-- invoice : auth télécharge dans son tenant
create policy "auth reads own tenant invoices"
  on storage.objects for select
  using (
    bucket_id = 'invoice'
    and (storage.foldername(name))[1] = get_my_tenant_id()::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 7 : Backfill des données existantes
-- ═══════════════════════════════════════════════════════════════════════════

-- Tenant par défaut pour les données existantes
insert into tenants (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Cabinet par défaut', 'default')
on conflict (id) do nothing;

-- Rattacher toutes les lignes existantes au tenant par défaut
update user_roles     set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update company_data   set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update budget         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update manual_entries set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update deposit_links  set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update deposits       set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

-- Rendre NOT NULL après backfill
alter table user_roles     alter column tenant_id set not null;
alter table company_data   alter column tenant_id set not null;
alter table budget         alter column tenant_id set not null;
alter table manual_entries alter column tenant_id set not null;
alter table deposit_links  alter column tenant_id set not null;
alter table deposits       alter column tenant_id set not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 8 : Créer le user_role pour l'utilisateur actuel (si absent)
-- Décommentez et adaptez l'user_id avec votre ID depuis Authentication > Users
-- ═══════════════════════════════════════════════════════════════════════════

-- insert into user_roles (user_id, role, tenant_id)
-- values (
--   'VOTRE_USER_ID_ICI',
--   'admin',
--   '00000000-0000-0000-0000-000000000001'
-- )
-- on conflict (user_id) do update set
--   role = 'admin',
--   tenant_id = '00000000-0000-0000-0000-000000000001';
