-- Calcul Coûts horaires (Objectifs) : champs de saisie complémentaires.
-- Appliquée le 15/06/2026 sur les DEUX bases (démo + prod).
alter table company_objectives
  add column if not exists nb_salaries       numeric null,  -- nombre de salariés
  add column if not exists monthly_hours     numeric null,  -- heures travaillées mensuelles
  add column if not exists hourly_sale_price numeric null;  -- prix de vente horaire prévisionnel
