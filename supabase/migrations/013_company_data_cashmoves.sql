-- ============================================================================
-- Migration 013 : mouvements de trésorerie réels (cash) sur company_data.
-- cash_moves : tableau jsonb des mouvements de classe 5 reconstruits depuis le FEC
--   (regroupement par journal+pièce, contrepartie catégorisée, lettrage pour la finesse).
--   Alimente le réalisé "cash réel" de la trésorerie (Phase 2/3).
-- Idempotent (ADD COLUMN IF NOT EXISTS). Un ré-import du FEC est nécessaire pour
--   peupler cette colonne sur les données déjà importées.
-- ============================================================================

alter table company_data
  add column if not exists cash_moves jsonb not null default '[]'::jsonb;
