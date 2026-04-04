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

export function PlTable({ struct, plCalc, RAW, selCo, selectedMs, showMonths, showN1Full, showBudget, caTotal, onOpenModal }: PlTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggleExp = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const rows: React.ReactNode[] = []

  for (const row of struct) {
    if (row.sep) {
      rows.push(<tr key={row.id}><td colSpan={30} style={{ height: 6 }} /></tr>)
      continue
    }
    if (row.header) {
      rows.push(
        <tr key={row.id}>
          <td colSpan={30} style={{
            padding: '10px 12px 4px', fontSize: 10, fontWeight: 700,
            color: row.color || 'var(--text-2)', letterSpacing: '1px',
            textTransform: 'uppercase', borderBottom: `1px solid ${(row.color || 'var(--text-2)')}25`,
          }}>
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
    const isPos   = d.cumulN >= 0

    rows.push(
      <tr key={row.id}
        style={{
          background: row.bg || (row.bold ? 'rgba(255,255,255,0.02)' : 'transparent'),
          cursor: hasAccs && !row.bold ? 'pointer' : 'default',
          borderBottom: '1px solid var(--border-0)',
        }}
        onClick={() => hasAccs && !row.bold && toggleExp(row.id)}
      >
        {/* Poste */}
        <td style={{
          position: 'sticky', left: 0, zIndex: 1,
          background: row.bg || (row.bold ? '#111827' : 'var(--bg-0)'),
          padding: `${row.bold ? 10 : 7}px 12px ${row.bold ? 10 : 7}px ${row.indent ? 12 + row.indent * 18 : 12}px`,
          fontWeight: row.bold ? 700 : 400,
          fontSize: row.bold ? 13 : 12,
          color: row.color || (row.bold ? 'var(--text-0)' : 'var(--text-1)'),
          whiteSpace: 'nowrap',
          borderLeft: row.bold && row.color ? `3px solid ${row.color}` : '3px solid transparent',
        }}>
          {hasAccs && !row.bold && (
            <span style={{ display:'inline-block', width:14, fontSize:9, color:'var(--text-3)', marginRight:4 }}>
              {isExp ? '▾' : '▸'}
            </span>
          )}
          {row.label}
        </td>

        {/* Mois */}
        {showMonths && d.monthsN.map((v, i) => (
          <td key={i} style={{ padding:'7px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: v < -0.5 ? 'var(--red)' : v > 0.5 ? 'var(--text-1)' : 'var(--text-3)' }}>
            {Math.abs(v) > 0.5 ? fmt(v) : '—'}
          </td>
        ))}

        {/* Cumul N */}
        <td style={{
          padding: '7px 10px', textAlign: 'right',
          fontFamily: 'monospace', fontWeight: row.bold ? 800 : 600,
          fontSize: row.bold ? 14 : 13,
          color: d.cumulN < -0.5 ? 'var(--red)' : (row.color || 'var(--text-0)'),
          borderLeft: '2px solid var(--border-1)',
          minWidth: 90,
        }}>
          {fmt(d.cumulN)}
        </td>

        {/* % CA */}
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color:'var(--text-2)', minWidth:55, fontFamily:'monospace' }}>
          {caTotal && Math.abs(d.cumulN) > 0.5 ? pct(d.cumulN / caTotal) : '—'}
        </td>

        {/* N-1 */}
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color:'var(--text-2)', fontFamily:'monospace', borderLeft:'1px solid var(--border-0)', minWidth:90 }}>
          {Math.abs(d.cumulN1S) > 0.5 ? fmt(d.cumulN1S) : '—'}
        </td>

        {/* Var € */}
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600,
          color: varAmt > 0.5 ? 'var(--green)' : varAmt < -0.5 ? 'var(--red)' : 'var(--text-3)', minWidth:80 }}>
          {Math.abs(varAmt) > 0.5 ? (varAmt > 0 ? '+' : '') + fmt(varAmt) : '—'}
        </td>

        {/* Var % */}
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600,
          color: varPct == null ? 'var(--text-3)' : varPct > 0.01 ? 'var(--green)' : varPct < -0.01 ? 'var(--red)' : 'var(--text-3)', minWidth:60 }}>
          {varPct != null ? (varPct > 0 ? '+' : '') + pct(varPct) : '—'}
        </td>

        {/* N-1 annuel */}
        {showN1Full && (
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color:'var(--text-2)', fontFamily:'monospace', borderLeft:'1px solid var(--border-0)', minWidth:90 }}>
            {Math.abs(d.cumulN1F) > 0.5 ? fmt(d.cumulN1F) : '—'}
          </td>
        )}

        {/* Budget */}
        {showBudget && (
          <>
            <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--purple)', borderLeft:'2px solid rgba(168,85,247,0.2)', minWidth:90 }}>
              {Math.abs(d.budTotal) > 0.5 ? fmt(d.budTotal) : '—'}
            </td>
            <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600,
              color: budE > 0.5 ? 'var(--green)' : budE < -0.5 ? 'var(--red)' : 'var(--text-3)', minWidth:80 }}>
              {Math.abs(budE) > 0.5 ? (budE > 0 ? '+' : '') + fmt(budE) : '—'}
            </td>
            <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600,
              color: budEP == null ? 'var(--text-3)' : budEP > 0.01 ? 'var(--green)' : budEP < -0.01 ? 'var(--red)' : 'var(--text-3)', minWidth:60 }}>
              {budEP != null ? (budEP > 0 ? '+' : '') + pct(budEP) : '—'}
            </td>
          </>
        )}
      </tr>
    )

    // Lignes détail comptes
    if (isExp && row.accs) {
      for (const acc of row.accs) {
        const lbl     = RAW.companies[selCo[0]]?.pn?.[acc]?.l || RAW.companies[selCo[0]]?.p1?.[acc]?.l || acc
        const entries = mergeEntries(RAW, selCo, 'pn', acc)
        const cumN    = d.monthsN.reduce((s, v) => s + v, 0)

        rows.push(
          <tr key={`${row.id}-${acc}`}
            style={{ cursor:'pointer', borderBottom:'1px solid var(--border-0)', background:'rgba(0,0,0,0.2)' }}
            onClick={() => onOpenModal?.(`${acc} — ${lbl}`, entries, true, cumN, d.cumulN1S)}
          >
            <td style={{ padding:'5px 12px 5px 44px', fontSize:11, color:'var(--text-2)', position:'sticky', left:0, background:'rgba(0,0,0,0.3)', zIndex:1, whiteSpace:'nowrap' }}>
              <span style={{ color:'var(--blue)', marginRight:5, fontSize:9 }}>▸</span>
              <span style={{ fontFamily:'monospace', color:'var(--text-3)', marginRight:6 }}>{acc}</span>
              {lbl}
              {entries.length > 0 && (
                <span style={{ marginLeft:6, fontSize:9, color:'var(--text-3)', background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:10 }}>
                  {entries.length}
                </span>
              )}
            </td>
            <td colSpan={showMonths ? selectedMs.length + 5 : 5}
              style={{ padding:'5px 10px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'var(--text-2)', fontWeight:500 }}>
              {fmt(cumN)}
            </td>
          </tr>
        )
      }
    }
  }

  return (
    <div style={{ overflowX:'auto' }}>
      <table className="pl-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr>
            <th style={{ position:'sticky', left:0, zIndex:7, textAlign:'left', minWidth:260 }}>Poste</th>
            {showMonths && selectedMs.map(m => (
              <th key={m} style={{ minWidth:72, textAlign:'right', borderLeft:'1px solid var(--border-0)' }}>
                {monthLabel(m)}
              </th>
            ))}
            <th style={{ minWidth:90, textAlign:'right', color:'var(--blue)', fontWeight:700, borderLeft:'2px solid var(--border-1)' }}>Cumul N</th>
            <th style={{ minWidth:55, textAlign:'right' }}>% CA</th>
            <th style={{ minWidth:90, textAlign:'right', borderLeft:'1px solid var(--border-0)' }}>N-1</th>
            <th style={{ minWidth:80, textAlign:'right' }}>Var. €</th>
            <th style={{ minWidth:60, textAlign:'right' }}>Var. %</th>
            {showN1Full && <th style={{ minWidth:90, textAlign:'right', borderLeft:'1px solid var(--border-0)' }}>N-1 An.</th>}
            {showBudget && <>
              <th style={{ minWidth:90, textAlign:'right', color:'var(--purple)', borderLeft:'2px solid rgba(168,85,247,0.2)' }}>Budget</th>
              <th style={{ minWidth:80, textAlign:'right' }}>Éc. €</th>
              <th style={{ minWidth:60, textAlign:'right' }}>Éc. %</th>
            </>}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}
