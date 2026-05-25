// Catégories d'encaissements / décaissements de la trésorerie + mapping compte → catégorie.
// Extrait de Tresorerie.tsx pour être partagé avec Paramètres (taux de TVA par catégorie).
// ⚠️ Valeurs identiques à l'historique — ne pas modifier sans vérifier la trésorerie.

export interface TresoCat { label: string; accs: string[] }

export const ENC_CATS: TresoCat[] = [
  { label:'Ventes prestations',     accs:['706','7061','70611'] },
  { label:'Ventes marchandises',    accs:['707','7072'] },
  { label:'Activités annexes',      accs:['708','7080'] },
  { label:'Subventions',            accs:['74'] },
  { label:'Produits financiers',    accs:['76'] },
  { label:'Produits exceptionnels', accs:['77'] },
  { label:'Autres produits',        accs:['70','71','72','73','75','78','79'] },
]

export const DEC_CATS: TresoCat[] = [
  { label:'Achats marchandises',    accs:['607','6071','6087','6097'] },
  { label:'Achats mat. premières',  accs:['601','6031','6081','602','603'] },
  { label:'Sous-traitance',         accs:['604'] },
  { label:'Services extérieurs',    accs:['61','62'] },
  { label:'Impôts & taxes',         accs:['63'] },
  { label:'Salaires',               accs:['641','642','643','644'] },
  { label:'Charges sociales',       accs:['645','646','647'] },
  { label:'Amortissements',         accs:['681','682','686','687'] },
  { label:'Charges financières',    accs:['66'] },
  { label:'Charges except.',        accs:['67'] },
  { label:'Impôt bénéfices',        accs:['695','696','697','698','699'] },
  { label:'Autres charges',         accs:['60','65','68','69'] },
]

export function catOf(acc: string, cats: TresoCat[]): string | null {
  for (const c of cats) { if (c.accs.some(a => acc.startsWith(a))) return c.label }
  return null
}

/** Toutes les catégories (enc + déc) — pour l'UI de réglage des taux de TVA. */
export const ALL_TRESO_CATS: TresoCat[] = [...ENC_CATS, ...DEC_CATS]

export interface VatConfig { enabled: boolean; rates: Record<string, number> }

/**
 * Taux de TVA (%) applicable à un compte, via sa catégorie de trésorerie.
 * Retourne 0 si la société n'est pas assujettie, ou si aucun taux n'est défini
 * pour la catégorie → conversion HT→TTC neutre (ttc = ht).
 */
export function vatRateForAccount(acc: string, vat: VatConfig | undefined): number {
  if (!vat?.enabled) return 0
  const cat = catOf(acc, ENC_CATS) ?? catOf(acc, DEC_CATS)
  if (!cat) return 0
  return vat.rates[cat] ?? 0
}
