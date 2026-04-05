import { useState } from 'react'
import type { PlData, SigRow, RAWData } from '@/types'
import { fmt, pct, monthLabel, mergeEntries, mergeLabel } from '@/lib/calc'

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

const PLAN: Record<string, string> = {
  "601":"Achats - Matieres premieres", "602":"Achats - Autres appro.", "604":"Sous-traitance directe",
  "605":"Achats materiel", "606":"Achats non stockes", "607":"Achats marchandises",
  "608":"Frais achats", "609":"Rabais achats", "611":"Sous-traitance", "612":"Credit-bail",
  "613":"Locations", "614":"Charges locatives", "615":"Entretien reparations", "616":"Assurances",
  "617":"Etudes recherches", "618":"Documentation", "621":"Personnel exterieur",
  "622":"Intermediaires", "623":"Publicite", "624":"Transports", "625":"Deplacements missions",
  "626":"Telecom postaux", "627":"Services bancaires", "628":"Divers",
  "631":"Impots taxes", "633":"Impots salaires", "635":"Autres impots", "637":"Impots locaux",
  "641":"Salaires", "642":"Conges payes", "645":"Charges sociales", "646":"Cotisations patronales",
  "647":"Autres charges sociales", "651":"Redevances", "654":"Creances irrecouvrables",
  "661":"Interets emprunts", "664":"Dividendes", "665":"Escomptes accordes", "668":"Autres charges fin.",
  "671":"Charges except.", "675":"Valeur nette cessions",
  "681":"DAP exploitation", "686":"DAP financieres", "687":"DAP exceptionnelles",
  "695":"IS", "696":"Imposition forfaitaire", "697":"Integration fiscale",
  "706":"Prestations services", "7061":"Prestations services France", "70611":"Prestations clients",
  "707":"Ventes marchandises", "7072":"Ventes marchandises DOM",
  "708":"Activites annexes", "7080":"Locations", "709":"Rabais accordes",
  "713":"Variation stocks", "741":"Subventions", "751":"Redevances",
  "761":"Produits participations", "768":"Autres produits fin.",
  "771":"Produits except.", "775":"Produits cessions",
  "781":"RAP exploitation", "786":"RAP financieres",
}

const labelFor = (acc: string, fromFec?: string): string => {
  if (fromFec) return fromFec
  for (let l = acc.length; l >= 3; l--) {
    if (PLAN[acc.slice(0, l)]) return PLAN[acc.slice(0, l)]
  }
  return acc
}

/** Calcule la valeur nette (signe selon type charge/produit) pour un compte sur les mois donnés */
function accValue(RAW: RAWData, selCo: string[], acc: string, months: string[], isCharge: boolean): number {
  let total = 0
  for (const co of selCo) {
    const moMap = (RAW.companies[co]?.pn as any)?.[acc]?.mo ?? {}
    for (const m of months) {
      const mo = moMap[m]
      if (!mo || !Array.isArray(mo)) continue
      total += isCharge ? (mo[0] - mo[1]) : (mo[1] - mo[0])
    }
  }
  return Math.round(total)
}

export function PlTable({ struct, plCalc, RAW, selCo, selectedMs, showMonths, showN1Full, showBudget, caTotal, onOpenModal }: PlTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const rows: React.ReactNode[] = []

  for (const row of struct) {
    if (row.sep) {
      rows.push(<tr key={row.id}><td colSpan={99} style={{ height: 8 }} /></tr>)
      continue
    }
    if (row.header) {
      rows.push(
        <tr key={row.id}>
          <td colSpan={99} style={{
            padding: '10px 14px 4px', fontSize: 10, fontWeight: 700,
            letterSpacing: '1px', textTransform: 'uppercase',
            color: row.color || 'var(--text-2)',
            borderTop: `1px solid ${row.color ? row.color + '30' : 'var(--border-1)'}`,
          }}>
            {row.label}
          </td>
        </tr>
      )
      continue
    }

    const d = plCalc[row.id]
    if (!d) continue

    const hasAccs  = (row.accs?.length ?? 0) > 0
    const isOpen   = !!expanded[row.id]
    const varAmt   = d.cumulN - d.cumulN1S
    const varPct   = d.cumulN1S !== 0 ? varAmt / Math.abs(d.cumulN1S) : null
    const budE     = d.cumulN - (d.budTotal || 0)
    const budEP    = d.budTotal ? budE / Math.abs(d.budTotal) : null
    const isCharge = row.type === 'charge'

    // ── Ligne principale ──────────────────────────────────────────────────
    rows.push(
      <tr key={row.id}
        onClick={hasAccs ? () => toggle(row.id) : undefined}
        style={{ background: row.bg || (row.bold ? 'rgba(255,255,255,0.025)' : 'transparent'), cursor: hasAccs ? 'pointer' : 'default', borderBottom: '1px solid var(--border-0)' }}
      >
        <td style={{
          position:'sticky', left:0, zIndex:2,
          background: row.bg || (row.bold ? '#111827' : 'var(--bg-0)'),
          padding: `${row.bold ? 10 : 7}px 14px ${row.bold ? 10 : 7}px ${14 + (row.indent || 0) * 18}px`,
          fontSize: row.bold ? 13 : 12, fontWeight: row.bold ? 700 : 400,
          color: row.color || (row.bold ? 'var(--text-0)' : 'var(--text-1)'),
          borderLeft: row.bold && row.color ? `3px solid ${row.color}` : '3px solid transparent',
          whiteSpace: 'nowrap',
        }}>
          {hasAccs && <span style={{ display:'inline-block', width:14, marginRight:4, fontSize:9, color:'var(--text-3)' }}>{isOpen ? '▾' : '▸'}</span>}
          {row.label}
        </td>

        {showMonths && d.monthsN.map((v, i) => (
          <td key={i} style={{ padding:'7px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: Math.abs(v) < 0.5 ? 'var(--text-3)' : v < 0 ? 'var(--red)' : 'var(--text-1)' }}>
            {Math.abs(v) > 0.5 ? fmt(v) : '—'}
          </td>
        ))}

        <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontSize: row.bold ? 14 : 13, fontWeight: row.bold ? 800 : 600, color: d.cumulN < -0.5 ? 'var(--red)' : (row.color || 'var(--text-0)'), borderLeft:'2px solid var(--border-1)', minWidth:90 }}>
          {fmt(d.cumulN)}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color:'var(--text-2)', minWidth:52, fontFamily:'monospace' }}>
          {caTotal > 0.5 && Math.abs(d.cumulN) > 0.5 ? pct(d.cumulN / caTotal) : '—'}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--text-2)', borderLeft:'1px solid var(--border-0)', minWidth:88 }}>
          {Math.abs(d.cumulN1S) > 0.5 ? fmt(d.cumulN1S) : '—'}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:78, color: Math.abs(varAmt) < 0.5 ? 'var(--text-3)' : varAmt > 0 ? 'var(--green)' : 'var(--red)' }}>
          {Math.abs(varAmt) > 0.5 ? (varAmt > 0 ? '+' : '') + fmt(varAmt) : '—'}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:58, color: varPct == null ? 'var(--text-3)' : varPct > 0.005 ? 'var(--green)' : varPct < -0.005 ? 'var(--red)' : 'var(--text-3)' }}>
          {varPct != null ? (varPct > 0 ? '+' : '') + pct(varPct) : '—'}
        </td>
        {showN1Full && <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--text-2)', borderLeft:'1px solid var(--border-0)', minWidth:88 }}>
          {Math.abs(d.cumulN1F) > 0.5 ? fmt(d.cumulN1F) : '—'}
        </td>}
        {showBudget && <>
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--purple)', borderLeft:'2px solid rgba(168,85,247,0.15)', minWidth:88 }}>
            {Math.abs(d.budTotal) > 0.5 ? fmt(d.budTotal) : '—'}
          </td>
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:78, color: Math.abs(budE) < 0.5 ? 'var(--text-3)' : budE > 0 ? 'var(--green)' : 'var(--red)' }}>
            {Math.abs(budE) > 0.5 ? (budE > 0 ? '+' : '') + fmt(budE) : '—'}
          </td>
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:58, color: budEP == null ? 'var(--text-3)' : budEP > 0.005 ? 'var(--green)' : budEP < -0.005 ? 'var(--red)' : 'var(--text-3)' }}>
            {budEP != null ? (budEP > 0 ? '+' : '') + pct(budEP) : '—'}
          </td>
        </>}
      </tr>
    )

    // ── Lignes de détail par compte ───────────────────────────────────────
    if (isOpen && row.accs) {
      for (const acc of row.accs) {
        const fecLabel = mergeLabel(RAW, selCo, 'pn', acc) || mergeLabel(RAW, selCo, 'p1', acc)
        const lbl      = labelFor(acc, fecLabel || undefined)
        const ents     = mergeEntries(RAW, selCo, 'pn', acc)

        // Valeur propre à CE compte (pas le total du parent)
        const val = accValue(RAW, selCo, acc, selectedMs, isCharge)

        rows.push(
          <tr key={`${row.id}__${acc}`}
            onClick={() => onOpenModal?.(`${acc} — ${lbl}`, ents, true, val, d.cumulN1S)}
            style={{ background:'rgba(0,0,0,0.18)', borderBottom:'1px solid var(--border-0)', cursor: onOpenModal ? 'pointer' : 'default' }}
          >
            <td style={{ padding:'5px 14px 5px 48px', fontSize:11, color:'var(--text-2)', position:'sticky', left:0, zIndex:2, background:'rgba(6,11,20,0.95)', whiteSpace:'nowrap' }}>
              <span style={{ color:'var(--blue)', marginRight:5, fontSize:9 }}>▸</span>
              <span style={{ fontFamily:'monospace', color:'var(--text-3)', marginRight:6, fontSize:10 }}>{acc}</span>
              <span>{lbl}</span>
              {ents.length > 0 && <span style={{ marginLeft:6, fontSize:9, color:'var(--text-3)', background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:10 }}>{ents.length} éc.</span>}
            </td>

            {/* Colonnes mois par mois pour ce compte */}
            {showMonths && selectedMs.map(m => {
              let mv = 0
              for (const co of selCo) {
                const mo = (RAW.companies[co]?.pn as any)?.[acc]?.mo?.[m]
                if (mo && Array.isArray(mo)) mv += isCharge ? (mo[0] - mo[1]) : (mo[1] - mo[0])
              }
              mv = Math.round(mv)
              return (
                <td key={m} style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontSize:10, color: Math.abs(mv) < 0.5 ? 'var(--text-3)' : mv < 0 ? 'var(--red)' : 'var(--text-2)' }}>
                  {Math.abs(mv) > 0.5 ? fmt(mv) : '—'}
                </td>
              )
            })}

            {/* Cumul propre au compte */}
            <td style={{ padding:'5px 10px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:600, color: val < -0.5 ? 'var(--red)' : Math.abs(val) > 0.5 ? 'var(--text-0)' : 'var(--text-3)', borderLeft:'2px solid var(--border-1)' }}>
              {Math.abs(val) > 0.5 ? fmt(val) : '—'}
            </td>

            {/* Colonnes vides pour aligner */}
            <td colSpan={99} />
          </tr>
        )
      }
    }
  }

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg-1)' }}>
            <th style={{ padding:'8px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', position:'sticky', left:0, background:'var(--bg-1)', zIndex:11, minWidth:260, whiteSpace:'nowrap' }}>Poste</th>
            {showMonths && selectedMs.map(m => (
              <th key={m} style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:68, borderLeft:'1px solid var(--border-0)', whiteSpace:'nowrap' }}>{monthLabel(m)}</th>
            ))}
            <th style={{ padding:'8px 10px', textAlign:'right', fontSize:11, fontWeight:700, color:'var(--blue)', borderBottom:'2px solid var(--blue)', minWidth:90, borderLeft:'2px solid var(--border-1)', whiteSpace:'nowrap' }}>Cumul N</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:52, whiteSpace:'nowrap' }}>% CA</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:88, borderLeft:'1px solid var(--border-0)', whiteSpace:'nowrap' }}>N-1</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:78, whiteSpace:'nowrap' }}>Var. €</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:58, whiteSpace:'nowrap' }}>Var. %</th>
            {showN1Full && <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:88, borderLeft:'1px solid var(--border-0)', whiteSpace:'nowrap' }}>N-1 An.</th>}
            {showBudget && <>
              <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--purple)', borderBottom:'2px solid rgba(168,85,247,0.4)', minWidth:88, borderLeft:'2px solid rgba(168,85,247,0.15)', whiteSpace:'nowrap' }}>Budget</th>
              <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--purple)', borderBottom:'2px solid rgba(168,85,247,0.4)', minWidth:78, whiteSpace:'nowrap' }}>Éc. €</th>
              <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--purple)', borderBottom:'2px solid rgba(168,85,247,0.4)', minWidth:58, whiteSpace:'nowrap' }}>Éc. %</th>
            </>}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}
