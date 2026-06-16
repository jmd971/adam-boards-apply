-- Paramètres du prévisionnel de trésorerie par société (délai client/fournisseur,
-- remboursement mensuel, solde initial). Stockés en JSONB.
-- Appliquée le 15/06/2026 sur les DEUX projets (démo + prod).
alter table company_settings
  add column if not exists forecast_params jsonb not null default '{}'::jsonb;
