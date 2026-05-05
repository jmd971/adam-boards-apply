import type { SigRow } from '@/types'

// Couleurs (références)
const G = '#10b981', O = '#f97316', T = '#14b8a6', P = '#8b5cf6',
      B = '#3b82f6', R = '#ef4444', A = '#f59e0b'

export const SIG: SigRow[] = [
  { id:'ca',           label:"CHIFFRE D'AFFAIRES NET",    accs:['706','707','708'], type:'produit', bold:true, color:G, bg:'rgba(16,185,129,0.08)' },
  { id:'s1', label:'', sep:true },

  // ── Activité commerciale ─────────────────────────────────
  { id:'hdr_negoce',   label:'ACTIVITÉ COMMERCIALE (NÉGOCE)', header:true, color:O },
  { id:'vte_mdse',     label:'Ventes de marchandises',    accs:['707'], type:'produit', indent:1 },
  { id:'cout_mdse',    label:"Coût d'achat marchandises", accs:['607'], type:'charge', indent:1 },
  { id:'marge_comm',   label:'MARGE COMMERCIALE',         bold:true, color:O, bg:'rgba(249,115,22,0.08)' },
  { id:'s2', label:'', sep:true },

  // ── Activité de production ───────────────────────────────
  { id:'hdr_prod',     label:'ACTIVITÉ DE PRODUCTION',    header:true, color:T },
  { id:'prod_vendue',  label:'Production vendue',         accs:['706','708'], type:'produit', indent:1 },
  { id:'prod_stock',   label:'Production stockée et immo.', accs:['71','72','73'], type:'produit', indent:1 },
  { id:'prod_exercice',label:"Production de l'exercice",  color:T },
  { id:'s2b', label:'', sep:true },
  { id:'conso_prod',   label:'Consommations de l\'exercice', accs:['601','602'], type:'charge', indent:1 },
  { id:'var_stock_sig',label:'Variation des stocks',       accs:['603'], type:'charge', indent:1 },
  { id:'604',          label:'Sous-traitance directe',     accs:['604'], type:'charge', indent:1 },
  { id:'marge_prod',   label:'MARGE SUR PRODUCTION',      bold:true, color:T, bg:'rgba(20,184,166,0.08)' },
  { id:'s3', label:'', sep:true },
  { id:'marge',        label:'MARGE GLOBALE',             bold:true, color:P, bg:'rgba(139,92,246,0.12)' },
  { id:'s4', label:'', sep:true },

  // ── Valeur ajoutée ───────────────────────────────────────
  { id:'autres_ext',   label:'Autres achats et charges externes', accs:['605','606','608','609','61','62'], type:'charge' },
  { id:'va',           label:'VALEUR AJOUTÉE',            bold:true, color:B },
  { id:'s5', label:'', sep:true },

  // ── EBE ──────────────────────────────────────────────────
  { id:'sub_exp_sig',  label:"+ Subventions d'exploitation",  accs:['74'], type:'produit' },
  { id:'impots_sig',   label:'− Impôts et taxes',         accs:['63'], type:'charge' },
  { id:'personnel',    label:'− Charges de personnel',    accs:['64'], type:'charge' },
  { id:'ebe',          label:"EBE (Excédent Brut d'Exploitation)", bold:true, color:A, bg:'rgba(245,158,11,0.08)' },
  { id:'s6', label:'', sep:true },

  // ── Résultat d'exploitation ──────────────────────────────
  { id:'autr_prod_sig',label:'+ Autres produits de gestion',accs:['75'], type:'produit' },
  { id:'reprises_sig', label:'+ Reprises sur amort. et prov.',accs:['78','79'], type:'produit' },
  { id:'autr_ch_sig',  label:'− Autres charges de gestion',accs:['65'], type:'charge' },
  { id:'amort',        label:'− Dotations amortissements',accs:['681'], type:'charge' },
  { id:'re',           label:"RÉSULTAT D'EXPLOITATION",   bold:true, color:B, bg:'rgba(59,130,246,0.08)' },
  { id:'s7', label:'', sep:true },

  // ── Résultat courant ─────────────────────────────────────
  { id:'fin',          label:'Résultat financier (76 - 66)', accs:['66','76','686','786'], type:'charge' },
  { id:'rc',           label:'RÉSULTAT COURANT',          bold:true, color:P },
  { id:'s8', label:'', sep:true },

  // ── Résultat net ─────────────────────────────────────────
  { id:'excep',        label:'Résultat exceptionnel (77 - 67)', accs:['67','77','687','787'], type:'charge' },
  { id:'is',           label:'Impôt sur les bénéfices',    accs:['69'], type:'charge' },
  { id:'rnet',         label:'RÉSULTAT NET',              bold:true, color:R, bg:'rgba(239,68,68,0.06)' },
]

export const CR: SigRow[] = [
  // ── PRODUITS D'EXPLOITATION ─────────────────────────────────────────
  { id:'hdr_exp',         label:"PRODUITS D'EXPLOITATION",     header:true, color:G },
  { id:'ca_v',            label:'Ventes de marchandises',       accs:['707'], type:'produit', indent:1 },
  { id:'ca_p',            label:'Production vendue (services)', accs:['706'], type:'produit', indent:1 },
  { id:'ca_a',            label:'Activités annexes',            accs:['708'], type:'produit', indent:1 },
  { id:'prod_stockee',    label:'Production stockée / immo.',   accs:['71','72','73'], type:'produit', indent:1 },
  { id:'sub_exp',         label:"Subventions d'exploitation",   accs:['74'], type:'produit', indent:1 },
  { id:'autr_prod',       label:'Autres produits de gestion',   accs:['75'], type:'produit', indent:1 },
  { id:'reprises_exp',    label:'Reprises sur prov. & RAP exp', accs:['78','79'], type:'produit', indent:1 },
  { id:'tot_prod_exp',    label:"TOTAL PRODUITS D'EXPLOITATION",bold:true, color:G, bg:'rgba(16,185,129,0.06)' },
  { id:'s_pf', label:'', sep:true },
  { id:'prod_fin',        label:'Produits financiers',          accs:['76'], type:'produit' },
  { id:'prod_excep',      label:'Produits exceptionnels',       accs:['77'], type:'produit' },
  { id:'tot_produits',    label:'TOTAL DES PRODUITS',           bold:true, color:G, bg:'rgba(16,185,129,0.12)' },

  { id:'s_prod', label:'', sep:true },

  // ── CHARGES D'EXPLOITATION ──────────────────────────────────────────
  { id:'hdr_ch',          label:"CHARGES D'EXPLOITATION",       header:true, color:R },
  { id:'achat_mdse',      label:'Achats de marchandises',       accs:['607'], type:'charge', indent:1 },
  { id:'achat_mp',        label:'Achats matières premières',    accs:['601','602'], type:'charge', indent:1 },
  { id:'var_stocks',      label:'Variation de stocks',           accs:['603'], type:'charge', indent:1 },
  { id:'soustr',          label:'Sous-traitance',                accs:['604'], type:'charge', indent:1 },
  { id:'achat_non_stock', label:'Achats non stockés',            accs:['605','606','608','609'], type:'charge', indent:1 },
  { id:'serv_ext',        label:'Services extérieurs',           accs:['61','62'], type:'charge', indent:1 },
  { id:'impots',          label:'Impôts et taxes',               accs:['63'], type:'charge', indent:1 },
  { id:'sal',             label:'Salaires et traitements',       accs:['641','642','643','644'], type:'charge', indent:1 },
  { id:'cs',              label:'Charges sociales',              accs:['645','646','647','648'], type:'charge', indent:1 },
  { id:'amor',            label:'Dotations aux amortissements',  accs:['681'], type:'charge', indent:1 },
  { id:'autr_ch_exp',     label:'Autres charges de gestion',     accs:['65'], type:'charge', indent:1 },
  { id:'tot_ch_exp',      label:"TOTAL CHARGES D'EXPLOITATION",  bold:true, color:R, bg:'rgba(239,68,68,0.06)' },
  { id:'s_cf', label:'', sep:true },
  { id:'ch_fin',          label:'Charges financières',           accs:['66','686'], type:'charge' },
  { id:'ch_excep',        label:'Charges exceptionnelles',       accs:['67','687'], type:'charge' },
  { id:'is_cr',           label:'Impôt sur les bénéfices',       accs:['69'], type:'charge' },
  { id:'tot_charges',     label:'TOTAL DES CHARGES',             bold:true, color:R, bg:'rgba(239,68,68,0.12)' },

  { id:'s_res', label:'', sep:true },

  // ── RÉSULTAT ────────────────────────────────────────────────────────
  { id:'rnet_cr',         label:'RÉSULTAT NET',                  bold:true, color:B, bg:'rgba(59,130,246,0.12)' },
]

// ── Ancien équilibre bilan (conservé pour référence interne) ──────────
export const EQ_BILAN: SigRow[] = [
  { id:'hdr_eq_a',   label:'ACTIF ÉCONOMIQUE',            header:true, color:B },
  { id:'immo',       label:'Immobilisations nettes',      accs:['20','21','22','23','26','27'], type:'produit' },
  { id:'stocks',     label:'Stocks',                      accs:['31','32','33','34','35','36','37','38'], type:'produit' },
  { id:'clients_eq', label:'Créances clients',            accs:['411','412','413','416'], type:'produit' },
  { id:'autr_act',   label:'Autres actifs circulants',    accs:['40','41','42','43','44','45','46','48','5'], type:'produit' },
  { id:'eq_a',       label:"TOTAL ACTIF ÉCONOMIQUE",      bold:true, color:B },
  { id:'s_eq1', label:'', sep:true },
  { id:'hdr_eq_p',   label:'FINANCEMENT',                 header:true, color:P },
  { id:'cap_prop',   label:'Capitaux propres',            accs:['10','11','12','13','14','15'], type:'charge' },
  { id:'det_fin',    label:'Dettes financières',          accs:['16'], type:'charge' },
  { id:'fournisseurs_eq', label:'Dettes fournisseurs',   accs:['401','402','403','404','405'], type:'charge' },
  { id:'autr_pass',  label:'Autres passifs',              accs:['42','43','44','45','46','48'], type:'charge' },
  { id:'eq_p',       label:'TOTAL FINANCEMENT',           bold:true, color:P },
  { id:'s_eq2', label:'', sep:true },
  { id:'eq_achats',  label:'Achats (pour BFR)',           accs:['607','601','604','6071'], type:'charge' },
]

// ── Équilibre exploitation : Ventes - Achats = Marge - Charges = Résultat ──
export const EQ: SigRow[] = [
  // VENTES
  { id:'hdr_ventes',   label:'VENTES',                      header:true, color:G },
  { id:'vte_mdse_eq',  label:'Ventes de marchandises',      accs:['707'], type:'produit', indent:1 },
  { id:'vte_prest_eq', label:'Prestations de services',     accs:['706'], type:'produit', indent:1 },
  { id:'vte_annexe_eq',label:'Activités annexes',            accs:['708'], type:'produit', indent:1 },
  { id:'vte_prod_stock',label:'Production stockée / immo.',  accs:['71','72','73'], type:'produit', indent:1 },
  { id:'vte_subv_eq',  label:"Subventions d'exploitation",  accs:['74'], type:'produit', indent:1 },
  { id:'vte_aut_eq',   label:'Autres produits de gestion',  accs:['75','78','79'], type:'produit', indent:1 },
  { id:'vte_fin_eq',   label:'Produits financiers',         accs:['76'], type:'produit', indent:1 },
  { id:'vte_excep_eq', label:'Produits exceptionnels',      accs:['77'], type:'produit', indent:1 },
  { id:'tot_ventes',   label:'TOTAL VENTES & PRODUITS',     bold:true, color:G, bg:'rgba(16,185,129,0.08)' },

  // ACHATS
  { id:'hdr_achats',   label:'ACHATS',                      header:true, color:O },
  { id:'ach_mdse_eq',  label:'Achats de marchandises',      accs:['607'], type:'charge', indent:1 },
  { id:'ach_mp_eq',    label:'Achats matières premières',   accs:['601','602'], type:'charge', indent:1 },
  { id:'var_stocks_eq',label:'Variation de stocks',          accs:['603'], type:'charge', indent:1 },
  { id:'ach_soustr_eq',label:'Sous-traitance',               accs:['604'], type:'charge', indent:1 },
  { id:'ach_non_stock_eq', label:'Achats non stockés',       accs:['605','606','608','609'], type:'charge', indent:1 },
  { id:'tot_achats',   label:'TOTAL ACHATS',                bold:true, color:O, bg:'rgba(249,115,22,0.08)' },

  // MARGE (juste après achats, pas de séparateur)
  { id:'marge_eq',     label:'MARGE BRUTE',                 bold:true, color:T, bg:'rgba(20,184,166,0.12)' },
  { id:'s_eq_m', label:'', sep:true },

  // CHARGES EXTERNES & PERSONNEL
  { id:'hdr_charges',  label:'CHARGES',                     header:true, color:R },
  // Services extérieurs (61)
  { id:'ch_loyer_eq',     label:'Locations & crédit-bail',     accs:['612','613'], type:'charge', indent:1 },
  { id:'ch_charges_loc',  label:'Charges locatives & copro.',  accs:['614'], type:'charge', indent:1 },
  { id:'ch_entret_eq',    label:'Entretien & réparations',     accs:['615'], type:'charge', indent:1 },
  { id:'ch_assur_eq',     label:'Assurances',                  accs:['616'], type:'charge', indent:1 },
  { id:'ch_etudes_eq',    label:'Études, recherches & doc.',   accs:['617','618'], type:'charge', indent:1 },
  { id:'ch_soustr_gen',   label:'Sous-traitance générale',     accs:['611'], type:'charge', indent:1 },
  // Autres services extérieurs (62)
  { id:'ch_pers_ext',     label:'Personnel extérieur',          accs:['621'], type:'charge', indent:1 },
  { id:'ch_hono_eq',      label:'Honoraires & commissions',    accs:['622'], type:'charge', indent:1 },
  { id:'ch_pub_eq',       label:'Publicité & communication',   accs:['623'], type:'charge', indent:1 },
  { id:'ch_transp_eq',    label:'Transports',                  accs:['624'], type:'charge', indent:1 },
  { id:'ch_depl_eq',      label:'Déplacements & missions',     accs:['625'], type:'charge', indent:1 },
  { id:'ch_telecom_eq',   label:'Téléphone & affranchissement', accs:['626'], type:'charge', indent:1 },
  { id:'ch_banque_eq',    label:'Services bancaires',          accs:['627'], type:'charge', indent:1 },
  { id:'ch_divers_eq',    label:'Divers (cotisations...)',     accs:['628'], type:'charge', indent:1 },
  // Impôts et personnel
  { id:'ch_impots_eq', label:'Impôts & taxes',               accs:['63'], type:'charge', indent:1 },
  { id:'ch_sal_eq',    label:'Salaires & traitements',       accs:['641','642','643','644'], type:'charge', indent:1 },
  { id:'ch_social_eq', label:'Charges sociales',             accs:['645','646','647','648'], type:'charge', indent:1 },
  // Autres
  { id:'ch_autr_eq',   label:'Autres charges de gestion',    accs:['65'], type:'charge', indent:1 },
  { id:'ch_amort_eq',  label:'Dotations amortissements',     accs:['681'], type:'charge', indent:1 },
  { id:'ch_fin_eq',    label:'Charges financières',          accs:['66','686'], type:'charge', indent:1 },
  { id:'ch_except_eq', label:'Charges exceptionnelles',      accs:['67','687'], type:'charge', indent:1 },
  { id:'ch_is_eq',     label:'Impôt sur les bénéfices',      accs:['69'], type:'charge', indent:1 },
  { id:'tot_charges_eq', label:'TOTAL CHARGES',             bold:true, color:R, bg:'rgba(239,68,68,0.06)' },

  // RÉSULTAT (juste après total charges, pas de séparateur)
  { id:'resultat_eq',  label:'RÉSULTAT NET',                bold:true, color:B, bg:'rgba(59,130,246,0.12)' },
]
