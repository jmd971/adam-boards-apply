-- ============================================================================
-- Migration 015 : autoriser plusieurs versions de budget par société.
-- La contrainte historique budget_tenant_company_key UNIQUE (tenant_id, company_key)
-- empêchait toute 2e version → "duplicate key value violates unique constraint
-- budget_tenant_company_key" au clic « nouvelle version ».
-- On la remplace par une unicité sur (tenant_id, company_key, version_name).
-- Idempotent.
-- ============================================================================

-- 1. version_name non nul (rétro-compat : les lignes existantes prennent un nom par défaut)
update budget set version_name = 'Budget principal'
 where version_name is null or version_name = '';

alter table budget alter column version_name set default 'Budget principal';

-- 2. Remplacer la contrainte d'unicité
alter table budget drop constraint if exists budget_tenant_company_key;

alter table budget drop constraint if exists budget_tenant_company_version_key;
alter table budget
  add constraint budget_tenant_company_version_key
  unique (tenant_id, company_key, version_name);
