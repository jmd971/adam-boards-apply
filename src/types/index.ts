// ─── Tenant ───────────────────────────────────────────────────────────────

export interface Tenant {
  id: string
  name: string
  slug: string
  created_at: string
}

// ─── Supabase / Data ───────────────────────────────────────────────────────

export interface CompanyDataRow {
  id: string
  tenant_id: string
  company_key: string
  period: 'N' | 'N-1' | 'N-2'
  fiscal_year: string
  pl_data: Record<string, FecAccount>
  bilan_data: Record<string, BilanAccount>
  months: string[]
  entry_count: number
  source: string
  client_data?: Record<string, ClientInfo>
  ve_entries?: VeEntry[]
  created_at: string
  updated_at: string
}

export interface BudgetRow {
  id: string
  tenant_id: string
  company_key: string
  data: BudgetData
  status: 'draft' | 'validated'
  updated_at: string
}

export interface ManualEntry {
  id: string
  tenant_id: string
  company_key: string
  entry_date: string
  amount_ttc: string
  amount_ht?: string
  tva_amount?: string
  tva_rate?: string
  amount_ht_saisie?: string
  category: 'Vente' | 'Achat' | 'Depense'
  subcategory: string
  label?: string
  counterpart?: string
  account_num?: string
  payment_mode?: 'comptant' | 'echeancier' | 'cb' | 'virement' | 'cheque' | 'especes' | 'prelevement'
  payment_date?: string
  echeancier_data?: EcheancierData | null
  source: 'manual' | 'ocr' | 'csv'
  invoice_url?: string
  created_at: string
}

export interface EcheancierData {
  nb: number
  freq: 'mensuel' | 'bimestriel' | 'trimestriel' | 'semestriel' | 'annuel'
  dates: string[]
}

// ─── FEC / Comptabilité ────────────────────────────────────────────────────

export interface FecAccount {
  mo: Record<string, [number, number]>  // month -> [debit, credit]
  l: string                              // libellé
  e: FecEntry[]                          // écritures détaillées
}

export type FecEntry = [
  string,   // date
  string,   // libellé
  number,   // débit
  number,   // crédit
  string,   // pièce
  number,   // lettrage
]

export interface CompanyRaw {
  name: string
  pn: Record<string, FecAccount>   // N
  p1: Record<string, FecAccount>   // N-1
  p2: Record<string, FecAccount>   // N-2
  bn: Record<string, BilanAccount> // bilan N
  b1: Record<string, BilanAccount> // bilan N-1
  b2: Record<string, BilanAccount> // bilan N-2
  bud: BudgetData
  cdN: Record<string, ClientInfo>
  cdN1: Record<string, ClientInfo>
  veN: VeEntry[]
  veN1: VeEntry[]
}

export interface RAWData {
  companies: Record<string, CompanyRaw>
  mn: string[]   // months N
  m1: string[]   // months N-1
  m2: string[]   // months N-2
  keys: string[]
}

// ─── Bilan ─────────────────────────────────────────────────────────────────

export interface BilanAccount {
  s: number
  l: string
  top?: [string, number][]
  e?: FecEntry[]
}

export interface BilanData {
  n: BilanSide
  n1: BilanSide
}

export interface BilanSide {
  tresoActif: number
  clients: number
  stocks: number
  immos: number
  autresActif: number
  totalActif: number
  capitaux: number
  detteFin: number
  fournisseurs: number
  dettesFisc: number
  autresPassif: number
  totalPassif: number
  fournTop: [string, number][]
  clientTop: [string, number][]
}

// ─── P&L / SIG ─────────────────────────────────────────────────────────────

export interface PlData {
  [id: string]: PlCalcRow
}

export interface PlCalcRow {
  cumulN: number
  cumulN1S: number
  cumulN1F: number
  monthsN: number[]
  monthsN1: number[]
  budMonths: number[]
  budTotal: number
  accs?: string[]
}

export interface SigRow {
  id: string
  label: string
  accs?: string[]
  accsN1?: string[]
  type?: 'produit' | 'charge'
  bold?: boolean
  color?: string
  bg?: string
  sep?: boolean
  header?: boolean
  indent?: number
  formula?: (data: PlData) => number
}

// ─── Budget ────────────────────────────────────────────────────────────────

export interface BudgetData {
  [account: string]: BudgetAccount
}

export interface BudgetAccount {
  b: number[]   // 12 mois
  t: 'c' | 'p' // charge ou produit
  l: string     // libellé
}

// ─── Clients / VE ──────────────────────────────────────────────────────────

export interface ClientInfo {
  n: string         // nom
  ca: number        // CA
  entries: number   // nb écritures
}

export interface VeEntry {
  date: string
  label: string
  amount: number
  account: string
  lettrage: number
  dueDate?: string
}

// ─── Prévisionnel ──────────────────────────────────────────────────────────

export interface PrevRow {
  month: string
  encaiss: number
  totalDecaiss: number
  flux: number
  solde: number
  detVentes: number
  detPrest: number
  detDivers: number
  detAchats: number
  detSalaires: number
  detChargesExt: number
  detSociales: number
  detEmprunts: number
}

// ─── App State ─────────────────────────────────────────────────────────────

export type TabId =
  | 'dashboard'
  | 'cr' | 'sig' | 'equilibre' | 'objectifs' | 'bilan' | 'ratios'
  | 'import' | 'budget' | 'saisie' | 'verification' | 'complementaire'
  | 'tresorerie' | 'creances' | 'rapprochement' | 'depot' | 'aide'

export interface NavItem {
  id: TabId
  label: string
  icon: string
  group: 'ops' | 'analyse' | 'admin' | 'aide'
}

export interface FilterState {
  startM: string
  endM: string
  showMonths: boolean
  showN1Full: boolean
  excludeOD: boolean
  selCo: string[]
  budCo: string
}

// ─── Dépôts FEC ───────────────────────────────────────────────────────────

export interface DepositLink {
  id: string
  tenant_id: string
  token: string
  company_key: string
  label: string | null
  period: 'N' | 'N-1' | 'N-2'
  created_by: string | null
  active: boolean
  created_at: string
}

export interface Deposit {
  id: string
  tenant_id: string
  link_id: string
  company_key: string
  period: string
  file_name: string
  file_path: string
  file_size: number | null
  status: 'pending' | 'integrated' | 'rejected'
  reject_reason: string | null
  integrated_at: string | null
  integrated_by: string | null
  deposited_at: string
}
