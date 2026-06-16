-- Heures facturables annuelles (solopreneurs / prestataires de services).
-- Permet de calculer le coût horaire de revient (dépenses / heures) et le
-- taux horaire cible (objectif de ventes / heures). NULL = non concerné.
-- Appliquée le 15/06/2026 sur les DEUX projets (démo + prod).
alter table company_objectives
  add column if not exists billable_hours numeric null;
