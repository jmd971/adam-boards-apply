import * as XLSX from 'xlsx'
import type { PlData, SigRow } from '@/types'

/* ═══════════════════════════════════════════════════════════
   Excel export helpers
   ═══════════════════════════════════════════════════════════ */

const n = (v: number): number | string => Math.abs(v) > 0.5 ? Math.round(v) : ''
const p = (v: number, base: number): string => base > 0.5 && Math.abs(v) > 0.5 ? `${(v / base * 100).toFixed(1)}%` : ''

/** Export PlCalc-based modules (CR, SIG, Equilibre) to xlsx */
export function exportPlCalcXlsx(
  filename: string,
  sheetName: string,
  struct: SigRow[],
  plCalc: PlData,
  caTotal: number,
) {
  const rows: (string | number)[][] = []
  rows.push(['Poste', 'Cumul N', '% CA', 'N-1', 'Var. €', 'Var. %'])

  for (const row of struct) {
    if (row.sep) continue
    if (row.header) {
      rows.push([row.label])
      continue
    }
    const d = plCalc[row.id]
    if (!d) continue
    const varAmt = d.cumulN - d.cumulN1S
    const varPct = d.cumulN1S !== 0 ? varAmt / Math.abs(d.cumulN1S) : null
    rows.push([
      row.label,
      n(d.cumulN),
      p(d.cumulN, caTotal),
      n(d.cumulN1S),
      n(varAmt),
      varPct != null ? `${(varPct * 100).toFixed(1)}%` : '',
    ])
  }

  downloadXlsx(filename, sheetName, rows)
}

/** Export Bilan data to xlsx */
export function exportBilanXlsx(
  filename: string,
  bilanN: {
    immos: number; stocks: number; clients: number; tresoActif: number; autresActif: number; totalActif: number
    capitaux: number; detteFin: number; fournisseurs: number; dettesFisc: number; autresPassif: number; totalPassif: number
    fournTop: [string, number][]
  },
) {
  const rows: (string | number)[][] = []
  rows.push(['Poste', 'Montant €'])
  rows.push(['', ''])
  rows.push(['── ACTIF ──', ''])
  rows.push(['Immobilisations nettes', Math.round(bilanN.immos)])
  rows.push(['Stocks', Math.round(bilanN.stocks)])
  rows.push(['Créances clients', Math.round(bilanN.clients)])
  rows.push(['Trésorerie', Math.round(bilanN.tresoActif)])
  if (bilanN.autresActif > 0) rows.push(['Autres actifs', Math.round(bilanN.autresActif)])
  rows.push(['TOTAL ACTIF', Math.round(bilanN.totalActif)])
  rows.push(['', ''])
  rows.push(['── PASSIF ──', ''])
  rows.push(['Capitaux propres', Math.round(bilanN.capitaux)])
  rows.push(['Dettes financières', Math.round(bilanN.detteFin)])
  rows.push(['Fournisseurs', Math.round(bilanN.fournisseurs)])
  rows.push(['Dettes fisc. & sociales', Math.round(bilanN.dettesFisc)])
  if (bilanN.autresPassif > 0) rows.push(['Autres passifs', Math.round(bilanN.autresPassif)])
  rows.push(['TOTAL PASSIF', Math.round(bilanN.totalPassif)])

  if (bilanN.fournTop.length > 0) {
    rows.push(['', ''])
    rows.push(['── TOP FOURNISSEURS ──', ''])
    for (const [label, val] of bilanN.fournTop) {
      rows.push([label, Math.round(val)])
    }
  }

  downloadXlsx(filename, 'Bilan', rows)
}

/** Export Ratios data to xlsx */
export function exportRatiosXlsx(
  filename: string,
  ratios: { label: string; value: string; sub?: string; status?: string }[],
) {
  const rows: (string)[][] = []
  rows.push(['Ratio', 'Valeur', 'Détail', 'Statut'])
  for (const r of ratios) {
    rows.push([r.label, r.value, r.sub || '', r.status || ''])
  }
  downloadXlsx(filename, 'Ratios', rows)
}

/* ═══════════════════════════════════════════════════════════
   PDF via browser print
   ═══════════════════════════════════════════════════════════ */

export function printModule(ref: React.RefObject<HTMLDivElement | null>, className: string) {
  ref.current?.classList.add(className)
  window.print()
  setTimeout(() => ref.current?.classList.remove(className), 500)
}

/* ═══════════════════════════════════════════════════════════
   Internal: download xlsx
   ═══════════════════════════════════════════════════════════ */

function downloadXlsx(filename: string, sheetName: string, rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Auto-size columns
  const colWidths = rows[0].map((_, ci) => {
    let max = 10
    for (const row of rows) {
      const cell = row[ci]
      if (cell != null) max = Math.max(max, String(cell).length)
    }
    return { wch: Math.min(max + 2, 40) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
