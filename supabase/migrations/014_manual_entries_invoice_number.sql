-- ============================================================================
-- Migration 014 : numéro de facture sur les saisies manuelles.
-- invoice_number : référence de la facture (saisie, OCR ou CSV). Sert de réf dans
--   le détail de trésorerie (prévisionnel) et l'historique de saisie.
-- Idempotent (ADD COLUMN IF NOT EXISTS).
-- ============================================================================

alter table manual_entries
  add column if not exists invoice_number text;
