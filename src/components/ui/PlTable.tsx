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

// Plan comptable de référence pour les labels de comptes
const PLAN_COMPTABLE: Record<string, string> = {
  "601":"Achats stockes - Matieres premieres", "602":"Achats stockes - Autres approvisionnements",
  "604":"Achats prestations", "605":"Achats de materiel", "606":"Achats non stockes",
  "607":"Achats de marchandises", "608":"Frais annexes achats", "609":"Rabais sur achats",
  "611":"Sous-traitance generale", "612":"Redevances credit-bail", "613":"Locations",
  "614":"Charges locatives", "615":"Entretien et reparations", "616":"Primes assurances",
  "617":"Etudes et recherches", "618":"Documentation et deplacements",
  "621":"Personnel exterieur", "622":"Remuneration intermediaires", "623":"Publicite",
  "624":"Transports de biens", "625":"Deplacements et missions", "626":"Frais telecom et postaux",
  "627":"Services bancaires", "628":"Divers", "631":"Impots et taxes", "633":"Impots sur salaires",
  "635":"Autres impots", "637":"Impots locaux",
  "641":"Remunerations personnel", "642":"Conges payes", "645":"Charges securite sociale",
  "646":"Cotisations patronales", "647":"Autres charges sociales",
  "651":"Redevances concessions", "654":"Pertes sur creances",
  "661":"Charges interets", "664":"Dividendes", "665":"Escomptes accordes", "668":"Autres charges financieres",
  "671":"Charges exceptionnelles", "675":"VNC elements cedes",
  "681":"DAP exploitation", "686":"DAP financieres", "687":"DAP exceptionnelles",
  "695":"Impot sur les benefices", "696":"Imposition forfaitaire", "697":"Integration fiscale",
  "706":"Prestations de services", "7061":"Prestations services France",
  "70611":"Prestations services clients", "707":"Ventes de marchandises",
  "7072":"Ventes marchandises DOM", "708":"Activites annexes", "7080":"Locations diverses",
  "709":"Rabais accordes", "713":"Variation des stocks", "715":"Travaux pour soi-meme",
  "741":"Subventions exploitation", "751":"Redevances concessions",
  "761":"Produits participations", "764":"Revenus valeurs mobilieres", "768":"Autres produits financiers",
  "771":"Produits exceptionnels", "775":"Produits cessions actifs",
  "781":"RAP exploitation", "786":"RAP financieres",
}

const getAccLabel = (acc: string, pnLabel?: string): string => {
  if (pnLabel) return pnLabel
  // Cherche du plus précis au moins précis
  for (let len = acc.length; len >= 3; len--) {
    const key = acc.slice(0, len)
    if (PLAN_COMPTABLE[key]) return PLAN_COMPTABLE[key]
  }
  return acc
}


export function PlTable({ struct, plCalc, RAW, selCo, selectedMs, showMonths, showN1Full, showBudget, caTotal, onOpenModal }: PlTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const handleToggle = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const renderRows = () => {
    const result: React.ReactNode[] = []

    for (const row of struct) {
      // Séparateur
      if (row.sep) {
        result.push(<tr key={row.id}><td colSpan={30} style={{ height: 8 }} /></tr>)
        continue
      }
      // En-tête de section
      if (row.header) {
        result.push(
          <tr key={row.id}>
            <td colSpan={30} style={{
              padding: '10px 14px 4px',
              fontSize: 10, fontWeight: 700, letterSpacing: '1px',
              textTransform: 'uppercase',
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
      const clickable = hasAccs

      // Ligne principale
      result.push(
        <tr
          key={row.id}
          onClick={clickable ? () => handleToggle(row.id) : undefined}
          style={{
            background:   row.bg || (row.bold ? 'rgba(255,255,255,0.025)' : 'transparent'),
            cursor:       clickable ? 'pointer' : 'default',
            borderBottom: '1px solid var(--border-0)',
          }}
        >
          {/* Libellé */}
          <td style={{
            position: 'sticky', left: 0, zIndex: 2,
            background: row.bg || (row.bold ? '#111827' : 'var(--bg-0)'),
            padding: `${row.bold ? 10 : 7}px 14px ${row.bold ? 10 : 7}px ${14 + (row.indent || 0) * 18}px`,
            fontSize: row.bold ? 13 : 12,
            fontWeight: row.bold ? 700 : 400,
            color: row.color || (row.bold ? 'var(--text-0)' : 'var(--text-1)'),
            borderLeft: row.bold && row.color ? `3px solid ${row.color}` : '3px solid transparent',
            whiteSpace: 'nowrap',
          }}>
            {clickable && (
              <span style={{ display:'inline-block', width:14, marginRight:4, fontSize:9, color:'var(--text-3)' }}>
                {isOpen ? '▾' : '▸'}
              </span>
            )}
            {row.label}
          </td>

          {/* Mois */}
          {showMonths && d.monthsN.map((v, i) => (
            <td key={i} style={{
              padding: '7px 8px', textAlign: 'right',
              fontFamily: 'monospace', fontSize: 11,
              color: Math.abs(v) < 0.5 ? 'var(--text-3)' : v < 0 ? 'var(--red)' : 'var(--text-1)',
            }}>
              {Math.abs(v) > 0.5 ? fmt(v) : '—'}
            </td>
          ))}

          {/* Cumul N */}
          <td style={{
            padding: '7px 10px', textAlign: 'right',
            fontFamily: 'monospace',
            fontSize: row.bold ? 14 : 13,
            fontWeight: row.bold ? 800 : 600,
            color: d.cumulN < -0.5 ? 'var(--red)' : (row.color || 'var(--text-0)'),
            borderLeft: '2px solid var(--border-1)', minWidth: 90,
          }}>
            {fmt(d.cumulN)}
          </td>

          {/* % CA */}
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color:'var(--text-2)', minWidth:52, fontFamily:'monospace' }}>
            {caTotal > 0.5 && Math.abs(d.cumulN) > 0.5 ? pct(d.cumulN / caTotal) : '—'}
          </td>

          {/* N-1 */}
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--text-2)', borderLeft:'1px solid var(--border-0)', minWidth:88 }}>
            {Math.abs(d.cumulN1S) > 0.5 ? fmt(d.cumulN1S) : '—'}
          </td>

          {/* Var € */}
          <td style={{
            padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:78,
            color: Math.abs(varAmt) < 0.5 ? 'var(--text-3)' : varAmt > 0 ? 'var(--green)' : 'var(--red)',
          }}>
            {Math.abs(varAmt) > 0.5 ? (varAmt > 0 ? '+' : '') + fmt(varAmt) : '—'}
          </td>

          {/* Var % */}
          <td style={{
            padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:58,
            color: varPct == null ? 'var(--text-3)' : varPct > 0.005 ? 'var(--green)' : varPct < -0.005 ? 'var(--red)' : 'var(--text-3)',
          }}>
            {varPct != null ? (varPct > 0 ? '+' : '') + pct(varPct) : '—'}
          </td>

          {/* N-1 annuel */}
          {showN1Full && (
            <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--text-2)', borderLeft:'1px solid var(--border-0)', minWidth:88 }}>
              {Math.abs(d.cumulN1F) > 0.5 ? fmt(d.cumulN1F) : '—'}
            </td>
          )}

          {/* Budget */}
          {showBudget && <>
            <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--purple)', borderLeft:'2px solid rgba(168,85,247,0.15)', minWidth:88 }}>
              {Math.abs(d.budTotal) > 0.5 ? fmt(d.budTotal) : '—'}
            </td>
            <td style={{
              padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:78,
              color: Math.abs(budE) < 0.5 ? 'var(--text-3)' : budE > 0 ? 'var(--green)' : 'var(--red)',
            }}>
              {Math.abs(budE) > 0.5 ? (budE > 0 ? '+' : '') + fmt(budE) : '—'}
            </td>
            <td style={{
              padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:58,
              color: budEP == null ? 'var(--text-3)' : budEP > 0.005 ? 'var(--green)' : budEP < -0.005 ? 'var(--red)' : 'var(--text-3)',
            }}>
              {budEP != null ? (budEP > 0 ? '+' : '') + pct(budEP) : '—'}
            </td>
          </>}
        </tr>
      )

      // Lignes de détail comptes
      if (isOpen && row.accs && row.accs.length > 0) {
        for (const acc of row.accs) {
          const co   = selCo[0] || RAW.keys[0]
          const pnLbl = mergeLabel(RAW, selCo, 'pn', acc) || mergeLabel(RAW, selCo, 'p1', acc)
          const lbl  = getAccLabel(acc, pnLbl || undefined)
          const ents = mergeEntries(RAW, selCo, 'pn', acc)
          const cumN = d.monthsN.reduce((s, v) => s + v, 0)

          result.push(
            <tr
              key={`${row.id}__${acc}`}
              onClick={() => onOpenModal?.(`${acc} — ${lbl}`, ents, true, cumN, d.cumulN1S)}
              style={{ background:'rgba(0,0,0,0.18)', borderBottom:'1px solid var(--border-0)', cursor: onOpenModal ? 'pointer' : 'default' }}
            >
              <td style={{
                padding:'5px 14px 5px 48px', fontSize:11,
                color:'var(--text-2)', position:'sticky', left:0, zIndex:2,
                background:'rgba(6,11,20,0.95)', whiteSpace:'nowrap',
              }}>
                <span style={{ color:'var(--blue)', marginRight:5, fontSize:9 }}>▸</span>
                <span style={{ fontFamily:'monospace', color:'var(--text-3)', marginRight:6, fontSize:10 }}>{acc}</span>
                {lbl}
                {ents.length > 0 && (
                  <span style={{ marginLeft:6, fontSize:9, color:'var(--text-3)', background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:10 }}>
                    {ents.length} éc.
                  </span>
                )}
              </td>
              <td
                colSpan={30}
                style={{ padding:'5px 10px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'var(--text-2)', fontWeight:500 }}
              >
                {fmt(cumN)}
              </td>
            </tr>
          )
        }
      }
    }

    return result
  }

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg-1)' }}>
            <th style={{ padding:'8px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', position:'sticky', left:0, background:'var(--bg-1)', zIndex:11, minWidth:260, whiteSpace:'nowrap' }}>
              Poste
            </th>
            {showMonths && selectedMs.map(m => (
              <th key={m} style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:68, borderLeft:'1px solid var(--border-0)', whiteSpace:'nowrap' }}>
                {monthLabel(m)}
              </th>
            ))}
            <th style={{ padding:'8px 10px', textAlign:'right', fontSize:11, fontWeight:700, color:'var(--blue)', borderBottom:'2px solid var(--blue)', minWidth:90, borderLeft:'2px solid var(--border-1)', whiteSpace:'nowrap' }}>
              Cumul N
            </th>
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
        <tbody>
          {renderRows()}
        </tbody>
      </table>
    </div>
  )
}
