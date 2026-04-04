import type { RAWData, PlData, PlCalcRow, SigRow, BudgetData, CompanyDataRow, ManualEntry, CompanyRaw } from '@/types'

export const fmt = (v: number): string =>
  Math.round(v).toLocaleString('fr-FR').replace(/\s/g, '\u202f')

export const fmt2 = (v: number): string =>
  v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const pct = (v: number): string =>
  isFinite(v) ? `${(v * 100).toFixed(1)}\u00a0%` : '—'

export function monthLabel(m: string): string {
  if (!m) return ''
  const [y, mo] = m.split('-')
  const names = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  return `${names[parseInt(mo) - 1]}\u00a0${y.slice(2)}`
}

export const fiscalIndex = (m: string): number => parseInt(m.split('-')[1]) - 1

export const monthIdx = (m: string): number => {
  const [y, mo] = m.split('-')
  return parseInt(y) * 12 + parseInt(mo)
}

export function mergePL(RAW: RAWData, keys: string[], field: 'pn' | 'p1', acc: string, months: string[]): [number, number][] {
  return months.map(m => {
    let d = 0, c = 0
    for (const co of keys) { const v = RAW.companies[co]?.[field]?.[acc]?.mo?.[m]; if (v) { d += v[0]; c += v[1] } }
    return [d, c]
  })
}

export function mergeEntries(RAW: RAWData, keys: string[], field: 'pn' | 'p1', acc: string) {
  const entries: [string, string, number, number, string, number][] = []
  for (const co of keys) { const acct = RAW.companies[co]?.[field]?.[acc]; if (acct?.e) entries.push(...acct.e as typeof entries) }
  return entries.sort((a, b) => (a[0] || '').localeCompare(b[0] || ''))
}

export function mergeLabel(RAW: RAWData, keys: string[], field: 'pn' | 'p1', acc: string): string {
  for (const co of keys) { const label = RAW.companies[co]?.[field]?.[acc]?.l; if (label) return label }
  return ''
}

export const sumArr = (arr: number[]): number => arr.reduce((s, v) => s + v, 0)
export const solde  = (adj: [number, number][], isCharge: boolean): number[] => adj.map(([d, c]) => isCharge ? d - c : c - d)

export function getAdjMixed(RAW: RAWData, keys: string[], selectedMs: string[], msSrc: Array<'pn' | 'p1' | 'bud'>, acc: string, _excludeOD: boolean): [number, number][] {
  return selectedMs.map((m, i) => {
    const field = msSrc[i] === 'p1' ? 'p1' : 'pn'
    let d = 0, c = 0
    for (const co of keys) { const v = RAW.companies[co]?.[field]?.[acc]?.mo?.[m]; if (v) { d += v[0]; c += v[1] } }
    return [d, c]
  })
}

export function getBudget(selCo: string[], budData: Record<string, BudgetData>, acc: string, fiscalIndices: number[]): number[] {
  return fiscalIndices.map(fi => { let s = 0; for (const co of selCo) s += budData[co]?.[acc]?.b?.[fi] ?? 0; return s })
}

const CO_PALETTE = ['#3b82f6', '#f97316', '#14b8a6', '#8b5cf6', '#f43f5e', '#84cc16', '#f59e0b', '#06b6d4']

export function getCoColor(key: string): string {
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff; return CO_PALETTE[h % CO_PALETTE.length]
}

export function buildRAW(companyData: CompanyDataRow[], budgets: { company_key: string; data: BudgetData; status: string }[], manualEntries: ManualEntry[] = []): RAWData {
  const companies: Record<string, CompanyRaw> = {}
  const allMsN = new Set<string>(), allMsN1 = new Set<string>()
  const allKeys = [...new Set(companyData.map(r => r.company_key).filter(Boolean))]

  for (const co of allKeys) {
    const rows = companyData.filter(r => r.company_key === co)
    const budget = budgets.find(b => b.company_key === co)
    companies[co] = { name: co.replace(/_/g, ' '), pn: {}, p1: {}, bn: {}, b1: {}, bud: budget?.data ?? {}, cdN: {}, cdN1: {}, veN: [], veN1: [] }
    for (const row of rows) {
      const isN = row.period === 'N', field = isN ? 'pn' : 'p1', bf = isN ? 'bn' : 'b1'
      for (const [acc, acct] of Object.entries(row.pl_data ?? {})) {
        companies[co][field][acc] = acct as any
        for (const m of Object.keys((acct as any).mo ?? {})) { if (isN) allMsN.add(m); else allMsN1.add(m) }
      }
      for (const [acc, acct] of Object.entries(row.bilan_data ?? {})) companies[co][bf][acc] = acct as any
      if (isN) { companies[co].cdN = row.client_data ?? {}; companies[co].veN = row.ve_entries ?? [] }
      else     { companies[co].cdN1 = row.client_data ?? {}; companies[co].veN1 = row.ve_entries ?? [] }
    }
  }

  const mn1Arr = [...allMsN1].sort()
  for (const me of manualEntries) {
    const mco = me.company_key; if (!mco) continue
    if (!companies[mco]) { companies[mco] = { name: mco.replace(/_/g, ' '), pn: {}, p1: {}, bn: {}, b1: {}, bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [] }; allKeys.push(mco) }
    const mDate = me.entry_date; if (!mDate) continue
    const mMonth = mDate.slice(0, 7)
    const isN1 = mn1Arr.length > 0 && mMonth >= mn1Arr[0] && mMonth <= mn1Arr[mn1Arr.length - 1]
    const plField = isN1 ? 'p1' : 'pn'
    if (isN1) allMsN1.add(mMonth); else allMsN.add(mMonth)
    const acc = me.account_num || '658', ht = parseFloat(me.amount_ht || me.amount_ht_saisie || '0') || 0
    if (ht === 0) continue
    const isCat7 = acc[0] === '7', debit = isCat7 ? 0 : ht, credit = isCat7 ? ht : 0
    if (!companies[mco][plField][acc]) companies[mco][plField][acc] = { mo: {}, l: me.subcategory || acc, e: [] }
    if (!companies[mco][plField][acc].mo[mMonth]) companies[mco][plField][acc].mo[mMonth] = [0, 0]
    companies[mco][plField][acc].mo[mMonth][0] = Math.round((companies[mco][plField][acc].mo[mMonth][0] + debit)  * 100) / 100
    companies[mco][plField][acc].mo[mMonth][1] = Math.round((companies[mco][plField][acc].mo[mMonth][1] + credit) * 100) / 100
    companies[mco][plField][acc].e.push([mDate, me.label || me.counterpart || '', debit, credit, 'SA', 0])
  }
  return { companies, mn: [...allMsN].sort(), m1: [...allMsN1].sort(), keys: allKeys }
}

export function computePlCalc(RAW: RAWData, selCo: string[], selectedMs: string[], msSrc: Array<'pn' | 'p1' | 'bud'>, allMsN1Same: string[], allMsN1SameSrc: Array<'pn' | 'p1' | 'bud'>, budData: Record<string, BudgetData>, struct: SigRow[], excludeOD: boolean): PlData {
  const result: PlData = {}
  for (const row of struct) {
    if (row.sep || row.header || !row.accs) continue
    const accs = row.accs ?? []
    let cumulN = 0, cumulN1S = 0
    const monthsN = new Array(selectedMs.length).fill(0), monthsN1 = new Array(allMsN1Same.length).fill(0), budMonths = new Array(12).fill(0)
    for (const acc of accs) {
      const sN = solde(getAdjMixed(RAW, selCo, selectedMs, msSrc, acc, excludeOD), row.type === 'charge')
      sN.forEach((v, i) => { monthsN[i] += v }); cumulN += sumArr(sN)
      cumulN1S += sumArr(solde(getAdjMixed(RAW, selCo, allMsN1Same, allMsN1SameSrc, acc, excludeOD), row.type === 'charge'))
      const budSign = row.type === 'charge' ? 1 : -1
      getBudget(selCo, budData, acc, Array.from({ length: 12 }, (_, i) => i)).forEach((v, i) => { budMonths[i] += v * budSign })
    }
    result[row.id] = { cumulN: Math.round(cumulN), cumulN1S: Math.round(cumulN1S), cumulN1F: 0, monthsN, monthsN1, budMonths, budTotal: Math.round(budMonths.reduce((s, v) => s + v, 0)), accs } as PlCalcRow
  }
  return result
}
