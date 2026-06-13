-- Type d'opération d'une saisie :
--   facture       : facture classique (charge/produit de l'exercice) — comportement historique
--   acompte       : avance versée (4091) ou reçue (4191) sur facture non encore reçue/émise
--                   → trésorerie uniquement, AUCUN impact P&L de N
--   reglement_n1  : encaissement (411) / décaissement (401) d'une facture comptabilisée en N-1
--                   → trésorerie uniquement, AUCUN impact P&L de N (la charge/produit est dans le FEC N-1)
-- Appliquée le 13/06/2026 sur les DEUX projets (démo fuxelqeizkmksapnetqz + prod bsjzhtpzvjtyrambyvrl).
alter table manual_entries
  add column if not exists operation_type text not null default 'facture'
  check (operation_type in ('facture', 'acompte', 'reglement_n1'));
