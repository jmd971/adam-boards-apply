-- ============================================================================
-- Portail de dépôt FEC client — Tables & RLS
-- ============================================================================

-- Liens de dépôt tokenisés (créés par le comptable)
create table if not exists deposit_links (
  id         uuid primary key default gen_random_uuid(),
  token      text unique not null default encode(gen_random_bytes(16), 'hex'),
  company_key text not null,
  label      text,                          -- nom affiché au client
  period     text not null default 'N',     -- 'N', 'N-1', 'N-2'
  created_by uuid references auth.users(id),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Historique des dépôts (un par fichier déposé)
create table if not exists deposits (
  id            uuid primary key default gen_random_uuid(),
  link_id       uuid references deposit_links(id),
  company_key   text not null,
  period        text not null,
  file_name     text not null,
  file_path     text not null,               -- chemin dans Storage bucket
  file_size     bigint,
  status        text not null default 'pending',  -- 'pending' | 'integrated' | 'rejected'
  reject_reason text,
  integrated_at timestamptz,
  integrated_by uuid references auth.users(id),
  deposited_at  timestamptz not null default now()
);

-- Index pour les requêtes fréquentes
create index if not exists idx_deposits_status on deposits(status);
create index if not exists idx_deposits_company on deposits(company_key);
create index if not exists idx_deposit_links_token on deposit_links(token);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table deposit_links enable row level security;
alter table deposits enable row level security;

-- deposit_links : lecture/écriture pour les users authentifiés
create policy "auth users can manage deposit_links"
  on deposit_links for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- deposit_links : lecture pour anon (vérification de token)
create policy "anon can read active deposit_links"
  on deposit_links for select
  using (active = true);

-- deposits : INSERT pour anon (dépôt de fichier)
create policy "anon can insert deposits"
  on deposits for insert
  with check (true);

-- deposits : lecture/update pour les users authentifiés
create policy "auth users can read deposits"
  on deposits for select
  using (auth.role() = 'authenticated');

create policy "auth users can update deposits"
  on deposits for update
  using (auth.role() = 'authenticated');

-- ── Storage bucket (privé) ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('fec-deposits', 'fec-deposits', false)
on conflict (id) do nothing;

-- Anon peut upload (pour le dépôt client sans compte)
create policy "anon can upload fec deposits"
  on storage.objects for insert
  with check (bucket_id = 'fec-deposits');

-- Authenticated peut lire/télécharger (pour le comptable)
create policy "auth users can read fec deposits"
  on storage.objects for select
  using (bucket_id = 'fec-deposits' and auth.role() = 'authenticated');
