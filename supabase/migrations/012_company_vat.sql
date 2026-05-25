-- ============================================================================
-- Migration 012 : TVA par société (réglages company_settings).
-- Ajout de deux colonnes au réglage par société :
--   vat_enabled : la société est-elle assujettie à la TVA ?
--   vat_rates   : taux de TVA par catégorie (jsonb { "<catégorie>": <taux %> }).
--                 Ex : {"Ventes prestations": 20, "Ventes marchandises": 5.5}
-- Utilisé pour convertir le budget HT → TTC dans le prévisionnel de trésorerie.
-- Idempotent (ADD COLUMN IF NOT EXISTS) → sûr à rejouer.
-- ============================================================================

alter table company_settings
  add column if not exists vat_enabled boolean not null default false;

alter table company_settings
  add column if not exists vat_rates jsonb not null default '{}'::jsonb;
