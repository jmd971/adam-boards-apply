import { useState } from 'react'
import type { PlData, SigRow, RAWData } from '@/types'
import { fmt, pct, monthLabel, mergeEntries } from '@/lib/calc'

interface PlTableProps {
  struct: SigRow[]
  plCalc: PlData
  RAW: RAWData
  selCo: string[]
  selectedMs: string[]
  showMonths: boolean
  showN1Full: boolean
  showBudget: boolean
  caTotal: number
  onOpenModal?: (title: string, entries: any[], detailed: boolean, cumN: number, cumN1: number) => void
}

export function PlTable({
  struct, plCalc, RAW, selCo, selectedMs,
  showMonths, showN1Full, showBudget, caTotal, onOpenModal
}: PlTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggleExp = (id: string) =>
    setExpanded(p => ({ ...p, [id]: !p[id] }))

  const rows: React.ReactNode[] = []

  for (const row of struct) {
    if (row.sep) {
      rows.push(<tr key={row.id}><td colSpan={30} className="h-1.5" /></tr>)
      continue
    }
    if (row.header) {
      rows.push(
        <tr key={row.id} className="bg-white/[0.02]">
          <td colSpan={30} className="px-2 py-1.5 text-[11px] font-bold tracking-wide uppercase"
            style={{ color: row.color || '#475569', borderBottom: `1px solid ${(row.color || '#475569')}30` }}>
            {row.label}
          </td>
        </tr>
      )
      continue
    }

    const d = plCalc[row.id]
    if (!d) continue

    const hasAccs = (row.accs?.length ?? 0) > 0
    const isExp   = expanded[row.id]
    const varAmt  = d.cumulN - d.cumulN1S
    const varPct  = d.cumulN1S !== 0 ? varAmt / Math.abs(d.cumulN1S) : null
    const budE    = d.cumulN - (d.budTotal || 0)
    const budEP   = d.budTotal ? budE / Math.abs(d.budTotal) : null

    rows.push(
      <tr
        key={row.id}
        className="transition-colors hover:bg-white/[0.02]"
        style={{ background: row.bg || 'transparent', cursor: hasAccs && !row.bold ? 'pointer' : 'default' }}
        onClick={() => hasAccs && !row.bold && toggleExp(row.id)}
      >
        <td
          className="sticky left-0 z-[1] whitespace-nowrap"
          style={{
            padding: `5px 8px 5px ${row.indent ? 16 + row.indent * 18 : 8}px`,
            fontWeight: row.bold ? 700 : 400,
            color: row.color || '#f1f5f9',
            fontSize: row.bold ? 13 : 12,
            background: row.bg || '#0f172a',
          }}
        >
          {hasAccs && !row.bold && (
            <span className="inline-block w-3.5 text-[10px] text-muted">
              {isExp ? '▾' : '▸'}
            </span>
          )}
          {row.label}
        </td>

        {showMonths && d.monthsN.map((v, i) => (
          <td key={i} className="px-2 py-1 text-right text-xs font-mono text-muted">
            {fmt(v)}
          </td>
        ))}

        <td className="px-2 py-1 text-right font-mono font-bold border-l border-white/10"
          style={{ fontSize: row.bold ? 13 : 12, color: d.cumulN < -0.5 ? '#ef4444' : (row.color || '#f1f5f9') }}>
          {fmt(d.cumulN)}
        </td>
        <td className="px-2 py-1 text-right text-xs font-mono text-muted">
          {caTotal ? pct(d.cumulN / caTotal) : '—'}
        </td>
        <td className="px-2 py-1 text-right text-xs font-mono text-muted border-l border-white/10">
          {fmt(d.cumulN1S)}
        </td>
        <td className="px-2 py-1 text-right text-xs font-mono"
          style={{ color: varAmt > 0.5 ? '#10b981' : varAmt < -0.5 ? '#ef4444' : '#475569' }}>
          {varAmt > 0.5 ? '+' + fmt(varAmt) : varAmt < -0.5 ? fmt(varAmt) : '—'}
        </td>
        <td className="px-2 py-1 text-right text-xs font-mono"
          style={{ color: varPct == null ? '#475569' : varPct > 0.01 ? '#10b981' : varPct < -0.01 ? '#ef4444' : '#475569' }}>
          {varPct != null ? ((varPct > 0 ? '+' : '') + pct(varPct)) : '—'}
        </td>

        {showN1Full && (
          <td className="px-2 py-1 text-right text-xs font-mono text-muted border-l border-white/10">
            {fmt(d.cumulN1F)}
          </td>
        )}

        {showBudget && (
          <>
            <td className="px-2 py-1 text-right text-xs font-mono border-l-2"
              style={{ color: '#8b5cf6', borderLeftColor: '#8b5cf620' }}>
              {fmt(d.budTotal)}
            </td>
            <td className="px-2 py-1 text-right text-xs font-mono"
              style={{ color: budE > 0.5 ? '#10b981' : budE < -0.5 ? '#ef4444' : '#475569' }}>
              {budE > 0.5 ? '+' + fmt(budE) : budE < -0.5 ? fmt(budE) : '—'}
            </td>
            <td className="px-2 py-1 text-right text-xs font-mono"
              style={{ color: budEP == null ? '#475569' : budEP > 0.01 ? '#10b981' : budEP < -0.01 ? '#ef4444' : '#475569' }}>
              {budEP != null ? ((budEP > 0 ? '+' : '') + pct(budEP)) : '—'}
            </td>
          </>
        )}
      </tr>
    )

    // Lignes détail comptes
    if (isExp && row.accs) {
      for (const acc of row.accs) {
        const label = RAW.companies[selCo[0]]?.pn?.[acc]?.l
          || RAW.companies[selCo[0]]?.p1?.[acc]?.l || acc
        const entries = mergeEntries(RAW, selCo, 'pn', acc)
        const cumN = d.monthsN.reduce((s, v) => s + v, 0)

        rows.push(
          <tr key={`${row.id}-${acc}`}
            className="bg-white/[0.02] cursor-pointer hover:bg-white/[0.04]"
            onClick={() => onOpenModal?.(`${acc} — ${label}`, entries, true, cumN, d.cumulN1S)}
          >
            <td className="sticky left-0 z-[1] bg-bg-secondary"
              style={{ padding: '3px 8px 3px 50px', fontSize: 11, color: '#475569' }}>
              <span className="text-brand-blue mr-1">▸</span>
              {acc} — {label}
              <span className="ml-1.5 text-[9px] bg-white/10 text-muted px-1 py-0.5 rounded">
                {entries.length}
              </span>
            </td>
            <td colSpan={30} className="px-2 py-0.5 text-right text-xs font-mono text-muted">
              {fmt(cumN)}
            </td>
          </tr>
        )
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" style={{ borderSpacing: 0 }}>
        <thead>
          <tr className="bg-bg-secondary sticky top-0 z-[5]">
            <th className="sticky left-0 z-[7] bg-bg-secondary text-left px-2 py-2.5 text-muted font-semibold text-[11px] min-w-[280px]">
              Poste
            </th>
            {showMonths && selectedMs.map(m => (
              <th key={m} className="px-1.5 py-2.5 text-right text-muted font-semibold text-[11px] min-w-[70px] border-l border-white/5">
                {monthLabel(m)}
              </th>
            ))}
            <th className="px-2 py-2.5 text-right text-brand-blue font-bold text-[11px] border-l-2 border-white/10 min-w-[85px]">
              Cumul N
            </th>
            <th className="px-2 py-2.5 text-right text-muted font-semibold text-[11px] min-w-[55px]">% CA</th>
            <th className="px-2 py-2.5 text-right text-muted font-semibold text-[11px] border-l border-white/10 min-w-[85px]">N-1</th>
            <th className="px-2 py-2.5 text-right text-muted font-semibold text-[11px] min-w-[70px]">Var. €</th>
            <th className="px-2 py-2.5 text-right text-muted font-semibold text-[11px] min-w-[55px]">Var. %</th>
            {showN1Full && <th className="px-2 py-2.5 text-right text-muted font-semibold text-[11px] border-l border-white/10 min-w-[85px]">N-1 An.</th>}
            {showBudget && (
              <>
                <th className="px-2 py-2.5 text-right text-brand-purple font-bold text-[11px] border-l-2 border-brand-purple/20 min-w-[85px]">Budget</th>
                <th className="px-2 py-2.5 text-right text-muted font-semibold text-[11px] min-w-[70px]">Éc. €</th>
                <th className="px-2 py-2.5 text-right text-muted font-semibold text-[11px] min-w-[55px]">Éc. %</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.03]">{rows}</tbody>
      </table>
    </div>
  )
}
