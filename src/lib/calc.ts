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

export function mergePL(RAW: RAWData, keys: string[], field: 'pn' | 'p1' | 'p2', acc: string, months: string[]): [number, number][] {
  return months.map(m => {
    let d = 0, c = 0
    for (const co of keys) { const v = RAW.companies[co]?.[field]?.[acc]?.mo?.[m]; if (v) { d += v[0]; c += v[1] } }
    return [d, c]
  })
}

export function mergeEntries(RAW: RAWData, keys: string[], field: 'pn' | 'p1' | 'p2' | 'bn' | 'b1', acc: string) {
  const entries: [string, string, number, number, string, number][] = []
  for (const co of keys) { const acct = RAW.companies[co]?.[field]?.[acc]; if (acct?.e) entries.push(...acct.e as typeof entries) }
  return entries.sort((a, b) => (a[0] || '').localeCompare(b[0] || ''))
}

export function mergeLabel(RAW: RAWData, keys: string[], field: 'pn' | 'p1' | 'p2' | 'bn' | 'b1', acc: string): string {
  for (const co of keys) {
    const src = RAW.companies[co]?.[field] as any
    if (!src) continue
    const label = src[acc]?.l
    if (label) return label
    for (const k of Object.keys(src)) {
      if (k.startsWith(acc) && src[k]?.l) return src[k].l
    }
  }
  return ''
}

export const sumArr = (arr: number[]): number => arr.reduce((s, v) => s + v, 0)
export const solde  = (adj: [number, number][], isCharge: boolean): number[] => adj.map(([d, c]) => isCharge ? d - c : c - d)

export function getAdjMixed(RAW: RAWData, keys: string[], selectedMs: string[], msSrc: Array<'pn' | 'p1' | 'p2' | 'bud'>, acc: string, _excludeOD: boolean): [number, number][] {
  return selectedMs.map((m, i) => {
    const field: 'pn' | 'p1' | 'p2' = msSrc[i] === 'p2' ? 'p2' : msSrc[i] === 'p1' ? 'p1' : 'pn'
    let d = 0, c = 0
    for (const co of keys) {
      const src = RAW.companies[co]?.[field] as any
      if (!src) continue
      // Always prefix-scan: k.startsWith(acc) covers exact match (acc.startsWith(acc)===true)
      // and all sub-accounts. This ensures manual entries at 6262 are found even when FEC
      // also has a summary entry at 626.
      for (const k of Object.keys(src)) {
        if (k.startsWith(acc)) {
          const v = src[k]?.mo?.[m]
          if (v) { d += v[0]; c += v[1] }
        }
      }
    }
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
  const allMsN = new Set<string>(), allMsN1 = new Set<string>(), allMsN2 = new Set<string>()
  const allKeys = [...new Set(companyData.map(r => r.company_key).filter(Boolean))]

  for (const co of allKeys) {
    const rows = companyData.filter(r => r.company_key === co)
    const budget = budgets.find(b => b.company_key === co)
    const coName = (rows.find(r => (r as any).company_name) as any)?.company_name || co.replace(/_/g, ' ')
    companies[co] = { name: coName, pn: {}, p1: {}, p2: {}, bn: {}, b1: {}, b2: {}, bud: budget?.data ?? {}, cdN: {}, cdN1: {}, veN: [], veN1: [] }
    for (const row of rows) {
      const plField = row.period === 'N' ? 'pn' : row.period === 'N-1' ? 'p1' : 'p2'
      const bField  = row.period === 'N' ? 'bn' : row.period === 'N-1' ? 'b1' : 'b2'
      const msSet   = row.period === 'N' ? allMsN : row.period === 'N-1' ? allMsN1 : allMsN2
      for (const [acc, acct] of Object.entries(row.pl_data ?? {})) {
        companies[co][plField][acc] = acct as any
        for (const m of Object.keys((acct as any).mo ?? {})) msSet.add(m)
      }
      for (const [acc, acct] of Object.entries(row.bilan_data ?? {})) companies[co][bField][acc] = acct as any
      if (row.period === 'N') { companies[co].cdN = row.client_data ?? {}; companies[co].veN = row.ve_entries ?? [] }
      else if (row.period === 'N-1') { companies[co].cdN1 = row.client_data ?? {}; companies[co].veN1 = row.ve_entries ?? [] }
    }
  }

  for (const me of manualEntries) {
    if (me.source === 'echeance') continue          // entrées-enfants : ignorées du P&L (gérées dans trésorerie)
    const mco = me.company_key; if (!mco) continue
    if (!companies[mco]) { companies[mco] = { name: mco.replace(/_/g, ' '), pn: {}, p1: {}, p2: {}, bn: {}, b1: {}, b2: {}, bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [] }; allKeys.push(mco) }
    const mDate = me.entry_date; if (!mDate) continue
    const mMonth = mDate.slice(0, 7)
    // Classifier par appartenance exacte aux mois FEC. Priorité : N > N-1 > N-2.
    // (Range-based check classait à tort les écritures courantes en N-1 quand le FEC N-1
    //  couvrait plusieurs années.)
    const inN  = allMsN.has(mMonth)
    const inN1 = allMsN1.has(mMonth)
    const inN2 = allMsN2.has(mMonth)
    const plField: 'pn' | 'p1' | 'p2' =
      inN ? 'pn' :
      inN1 ? 'p1' :
      inN2 ? 'p2' : 'pn'
    if (plField === 'p2') allMsN2.add(mMonth)
    else if (plField === 'p1') allMsN1.add(mMonth)
    else allMsN.add(mMonth)
    const acc = me.account_num || '658', ht = parseFloat(me.amount_ht || me.amount_ht_saisie || '0') || 0
    if (ht === 0) continue
    const isCat7 = acc[0] === '7', debit = isCat7 ? 0 : ht, credit = isCat7 ? ht : 0
    if (!companies[mco][plField][acc]) companies[mco][plField][acc] = { mo: {}, l: me.subcategory || acc, e: [] }
    if (!companies[mco][plField][acc].mo[mMonth]) companies[mco][plField][acc].mo[mMonth] = [0, 0]
    companies[mco][plField][acc].mo[mMonth][0] = Math.round((companies[mco][plField][acc].mo[mMonth][0] + debit)  * 100) / 100
    companies[mco][plField][acc].mo[mMonth][1] = Math.round((companies[mco][plField][acc].mo[mMonth][1] + credit) * 100) / 100
    companies[mco][plField][acc].e.push([mDate, me.label || me.counterpart || '', debit, credit, 'SA', 0])
  }
  return { companies, mn: [...allMsN].sort(), m1: [...allMsN1].sort(), m2: [...allMsN2].sort(), keys: allKeys }
}

export function computePlCalc(RAW: RAWData, selCo: string[], selectedMs: string[], msSrc: Array<'pn' | 'p1' | 'p2' | 'bud'>, allMsN1Same: string[], allMsN1SameSrc: Array<'pn' | 'p1' | 'p2' | 'bud'>, budData: Record<string, BudgetData>, struct: SigRow[], excludeOD: boolean): PlData {
  const result: PlData = {}
  for (const row of struct) {
    if (row.sep || row.header || !row.accs) continue
    const allAccs = row.accs ?? []
    const accs = allAccs.filter((acc, i, arr) =>
      !arr.some((other, j) => j !== i && acc.startsWith(other) && other.length < acc.length)
    )
    let cumulN = 0, cumulN1S = 0
    const monthsN = new Array(selectedMs.length).fill(0), monthsN1 = new Array(allMsN1Same.length).fill(0), budMonths = new Array(12).fill(0)
    for (const acc of accs) {
      const sN = solde(getAdjMixed(RAW, selCo, selectedMs, msSrc, acc, excludeOD), row.type === 'charge')
      sN.forEach((v, i) => { monthsN[i] += v }); cumulN += sumArr(sN)
      cumulN1S += sumArr(solde(getAdjMixed(RAW, selCo, allMsN1Same, allMsN1SameSrc, acc, excludeOD), row.type === 'charge'))
      const budSign = row.type === 'charge' ? 1 : -1
      getBudget(selCo, budData, acc, Array.from({ length: 12 }, (_, i) => i)).forEach((v, i) => { budMonths[i] += v * budSign })
    }
    result[row.id] = { cumulN: Math.round(cumulN), cumulN1S: Math.round(cumulN1S), cumulN1F: 0, monthsN, monthsN1, budMonths, budTotal: Math.round(budMonths.reduce((s, v) => s + v, 0)), accs: allAccs } as PlCalcRow
  }

  // Helper: combine existing result rows with signs into a new summary row
  const add = (id: string, ...ids: [string, number][]) => {
    const nM = selectedMs.length, n1M = allMsN1Same.length
    const monthsN = new Array(nM).fill(0), monthsN1 = new Array(n1M).fill(0), budMonths = new Array(12).fill(0)
    let cumulN = 0, cumulN1S = 0, budTotal = 0
    for (const [rid, sign] of ids) {
      const r = result[rid]; if (!r) continue
      cumulN += r.cumulN * sign; cumulN1S += r.cumulN1S * sign
      r.monthsN.forEach((v, i) => { if (i < nM) monthsN[i] += v * sign })
      r.monthsN1.forEach((v, i) => { if (i < n1M) monthsN1[i] += v * sign })
      r.budMonths.forEach((v, i) => { budMonths[i] += v * sign })
      budTotal += r.budTotal * sign
    }
    result[id] = { cumulN: Math.round(cumulN), cumulN1S: Math.round(cumulN1S), cumulN1F: 0, monthsN, monthsN1, budMonths, budTotal: Math.round(budTotal), accs: [] } as PlCalcRow
  }

  // ── EQ exploitation formulas ──
  const isEQ = struct.some(r => r.id === 'tot_ventes' || r.id === 'tot_achats' || r.id === 'tot_charges_eq')
  if (isEQ) {
    const sumByPrefixes = (prefixes: string[], type: 'produit' | 'charge'): PlCalcRow => {
      const monthsN = new Array(selectedMs.length).fill(0)
      const monthsN1 = new Array(allMsN1Same.length).fill(0)
      const budMonths = new Array(12).fill(0)
      let cumulN = 0, cumulN1S = 0
      // Collect exact FEC account keys — must NOT call getAdjMixed (prefix scan) on these
      // exact keys, as that would double-count when FEC has both '706' and '7061'/'7062'.
      const allAccKeys = new Set<string>()
      for (const co of selCo) {
        for (const f of ['pn', 'p1'] as const) {
          const src = (RAW.companies[co] as any)?.[f]
          if (!src) continue
          for (const k of Object.keys(src)) {
            if (prefixes.some(p => k.startsWith(p))) allAccKeys.add(k)
          }
        }
      }
      // Direct exact lookup per account key — no prefix scan
      for (const acc of allAccKeys) {
        for (const co of selCo) {
          for (let mi = 0; mi < selectedMs.length; mi++) {
            const field = msSrc[mi] === 'p1' ? 'p1' : 'pn'
            const v = (RAW.companies[co] as any)?.[field]?.[acc]?.mo?.[selectedMs[mi]]
            if (v) { const s = type === 'charge' ? v[0] - v[1] : v[1] - v[0]; monthsN[mi] += s; cumulN += s }
          }
          for (let mi = 0; mi < allMsN1Same.length; mi++) {
            const field = allMsN1SameSrc[mi] === 'p1' ? 'p1' : 'pn'
            const v = (RAW.companies[co] as any)?.[field]?.[acc]?.mo?.[allMsN1Same[mi]]
            if (v) cumulN1S += type === 'charge' ? v[0] - v[1] : v[1] - v[0]
          }
        }
      }
      return { cumulN: Math.round(cumulN), cumulN1S: Math.round(cumulN1S), cumulN1F: 0, monthsN, monthsN1, budMonths, budTotal: 0, accs: [] } as PlCalcRow
    }
    result['tot_ventes'] = sumByPrefixes(['7'], 'produit')
    result['tot_achats'] = sumByPrefixes(['60'], 'charge')
    result['tot_charges_eq'] = sumByPrefixes(['61','62','63','64','65','66','67','68','69'], 'charge')
    add('marge_eq', ['tot_ventes', 1], ['tot_achats', -1])
    add('resultat_eq', ['marge_eq', 1], ['tot_charges_eq', -1])
  }

  // ── SIG formulas ──
  if (result['vte_mdse'] && result['cout_mdse']) add('marge_comm', ['vte_mdse', 1], ['cout_mdse', -1])
  if (result['prod_vendue']) {
    const parts: [string, number][] = [['prod_vendue', 1]]
    if (result['prod_stock']) parts.push(['prod_stock', 1])
    add('prod_exercice', ...parts)
  }
  if (result['prod_exercice']) {
    const parts: [string, number][] = [['prod_exercice', 1]]
    if (result['conso_prod']) parts.push(['conso_prod', -1])
    if (result['var_stock_sig']) parts.push(['var_stock_sig', -1])
    if (result['604']) parts.push(['604', -1])
    add('marge_prod', ...parts)
  }
  if (result['marge_comm'] || result['marge_prod']) {
    const parts: [string, number][] = []
    if (result['marge_comm']) parts.push(['marge_comm', 1])
    if (result['marge_prod']) parts.push(['marge_prod', 1])
    add('marge', ...parts)
  }
  if (result['marge']) {
    const parts: [string, number][] = [['marge', 1]]
    if (result['autres_ext']) parts.push(['autres_ext', -1])
    add('va', ...parts)
  }
  if (result['va']) {
    const parts: [string, number][] = [['va', 1]]
    if (result['sub_exp_sig']) parts.push(['sub_exp_sig', 1])
    if (result['impots_sig']) parts.push(['impots_sig', -1])
    if (result['personnel']) parts.push(['personnel', -1])
    add('ebe', ...parts)
  }
  if (result['ebe']) {
    const parts: [string, number][] = [['ebe', 1]]
    if (result['autr_prod_sig']) parts.push(['autr_prod_sig', 1])
    if (result['reprises_sig']) parts.push(['reprises_sig', 1])
    if (result['autr_ch_sig']) parts.push(['autr_ch_sig', -1])
    if (result['dotations_sig']) parts.push(['dotations_sig', -1])
    add('re', ...parts)
  }
  if (result['re']) {
    const parts: [string, number][] = [['re', 1]]
    if (result['prod_fin_sig']) parts.push(['prod_fin_sig', 1])
    if (result['ch_fin_sig']) parts.push(['ch_fin_sig', -1])
    add('rc', ...parts)
  }
  if (result['rc']) {
    const parts: [string, number][] = [['rc', 1]]
    if (result['prod_excep_sig']) parts.push(['prod_excep_sig', 1])
    if (result['ch_excep_sig']) parts.push(['ch_excep_sig', -1])
    if (result['is']) parts.push(['is', -1])
    add('rnet', ...parts)
  }

  // ── CR formulas ──
  {
    const ids = ['ca_v','ca_p','ca_a','prod_stockee','sub_exp','autr_prod','reprises_exp'].filter(id => result[id])
    if (ids.length > 0) add('tot_prod_exp', ...ids.map(id => [id, 1] as [string, number]))
  }
  if (result['tot_prod_exp']) {
    const parts: [string, number][] = [['tot_prod_exp', 1]]
    if (result['prod_fin']) parts.push(['prod_fin', 1])
    if (result['prod_excep']) parts.push(['prod_excep', 1])
    add('tot_produits', ...parts)
  }
  {
    const ids = ['achat_mdse','achat_mp','var_stocks','soustr','achat_non_stock','serv_ext','impots','sal','cs','amor','autr_ch_exp'].filter(id => result[id])
    if (ids.length > 0) add('tot_ch_exp', ...ids.map(id => [id, 1] as [string, number]))
  }
  if (result['tot_ch_exp']) {
    const parts: [string, number][] = [['tot_ch_exp', 1]]
    if (result['ch_fin']) parts.push(['ch_fin', 1])
    if (result['ch_excep']) parts.push(['ch_excep', 1])
    if (result['is_cr']) parts.push(['is_cr', 1])
    add('tot_charges', ...parts)
  }
  if (result['tot_produits'] && result['tot_charges']) add('rnet_cr', ['tot_produits', 1], ['tot_charges', -1])

  // Auto-cumulate bold summary rows not yet computed (generic fallback for other structs)
  const FORMULA_IDS = new Set([
    'marge_eq', 'resultat_eq', 'tot_ventes', 'tot_achats', 'tot_charges_eq',
    'marge_comm', 'prod_exercice', 'marge_prod', 'marge', 'va', 'ebe', 're', 'rc', 'rnet',
    'tot_prod_exp', 'tot_produits', 'tot_ch_exp', 'tot_charges', 'rnet_cr',
  ])
  for (const row of struct) {
    if (row.sep || row.header || row.accs || result[row.id]) continue
    if (FORMULA_IDS.has(row.id)) continue
    const idx = struct.indexOf(row)
    let startIdx = idx - 1
    while (startIdx >= 0
      && !struct[startIdx].sep
      && !struct[startIdx].header
      && !(struct[startIdx].bold && !struct[startIdx].accs)
      && struct[startIdx].id !== row.id) {
      startIdx--
    }
    startIdx++
    const children = struct.slice(startIdx, idx).filter(r => r.accs && result[r.id])
    if (children.length > 0) add(row.id, ...children.map(c => [c.id, 1] as [string, number]))
  }

  return result
}

