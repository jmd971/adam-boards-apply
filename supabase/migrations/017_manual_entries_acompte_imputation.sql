-- Phase 2 acomptes : imputation sur la facture finale.
-- L'acompte (operation_type='acompte') pointe vers la facture sur laquelle il est imputé.
-- Trésorerie : le règlement de la facture = TTC - somme des acomptes imputés
-- (l'acompte ayant déjà été compté en trésorerie à sa propre date de paiement).
-- ON DELETE SET NULL : supprimer la facture libère automatiquement ses acomptes.
-- Appliquée le 13/06/2026 sur les DEUX projets (démo fuxelqeizkmksapnetqz + prod bsjzhtpzvjtyrambyvrl).
alter table manual_entries
  add column if not exists acompte_invoice_id uuid null
  references manual_entries(id) on delete set null;
create index if not exists idx_manual_entries_acompte_invoice
  on manual_entries(acompte_invoice_id) where acompte_invoice_id is not null;
