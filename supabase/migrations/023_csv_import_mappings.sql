-- ============================================================================
-- Table csv_import_mappings : mappings d'import CSV réutilisables.
-- Un mapping enregistre la correspondance colonnes fichier → champs AdamBoards,
-- stockée par NOM d'en-tête (normalisé) pour rester robuste à un changement
-- d'ordre des colonnes. Clé métier : (société, catégorie, nom de profil) — on
-- peut donc enregistrer plusieurs profils par société (ex : « Ventes Sellsy »,
-- « Achats Pennylane »). Édité depuis la page Saisie → Import CSV.
-- ============================================================================

create table if not exists csv_import_mappings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  company_key   text not null,
  category      text not null,   -- 'Vente' | 'Achat' | 'Depense' | 'Immobilisation'
  name          text not null,   -- nom de profil libre, ex : « Export Sellsy »
  mapping       jsonb not null,  -- { <fieldKey>: "<en-tête normalisé>", ... }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, company_key, category, name)
);

create index if not exists idx_csv_import_mappings_tenant      on csv_import_mappings(tenant_id);
create index if not exists idx_csv_import_mappings_company_key on csv_import_mappings(company_key);

-- ─── RLS : isolation par tenant + bypass superadmin ─────────────────────────

alter table csv_import_mappings enable row level security;

drop policy if exists "auth reads own tenant csv_import_mappings"   on csv_import_mappings;
drop policy if exists "auth writes own tenant csv_import_mappings"  on csv_import_mappings;
drop policy if exists "auth updates own tenant csv_import_mappings" on csv_import_mappings;
drop policy if exists "auth deletes own tenant csv_import_mappings" on csv_import_mappings;

create policy "auth reads own tenant csv_import_mappings"
  on csv_import_mappings for select
  using (tenant_id = get_my_tenant_id() or is_superadmin());

create policy "auth writes own tenant csv_import_mappings"
  on csv_import_mappings for insert
  with check (tenant_id = get_my_tenant_id());

create policy "auth updates own tenant csv_import_mappings"
  on csv_import_mappings for update
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

create policy "auth deletes own tenant csv_import_mappings"
  on csv_import_mappings for delete
  using (tenant_id = get_my_tenant_id());

-- Trigger updated_at auto
create or replace function csv_import_mappings_set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_csv_import_mappings_updated_at on csv_import_mappings;
create trigger trg_csv_import_mappings_updated_at
  before update on csv_import_mappings
  for each row execute function csv_import_mappings_set_updated_at();
