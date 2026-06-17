import { useState, useMemo } from 'react'
import { fmt, fiscalIndex } from '@/lib/calc'
import { sb } from '@/lib/supabase'

// Ouvre une facture (bucket 'invoice' privé) via une URL signée. Rétro-compat : si la valeur
// est déjà une URL http, on l'ouvre telle quelle.
async function openInvoice(urlOrPath: string) {
  if (!urlOrPath) return
  if (urlOrPath.startsWith('http')) { window.open(urlOrPath, '_blank', 'noopener'); return }
  const { data, error } = await sb.storage.from('invoice').createSignedUrl(urlOrPath, 3600)
  if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  else alert("Impossible d'ouvrir la facture : " + (error?.message ?? 'URL indisponible'))
}

interface EcrituresModalProps {
  title: string
  entries: any[]
  cumN: number
  cumN1: number
  /** Sous-comptes budgétés du compte affiché (agrégés sur les sociétés sélectionnées). */
  budChildren?: { name: string; b: number[] }[]
  /** Mois sélectionnés (YYYY-MM) du filtre période — pour ne sommer le budget que sur ces mois,
   *  exactement comme la colonne Budget de CR/Équilibre/SIG (sumBudInPeriod). */
  budSelMonths?: string[]
  onClose: () => void
}

type SortDir = 1 | -1
const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const fmt2 = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Affichage JJ/MM/AAAA pour une date interne AAAA-MM-JJ (le tri se fait sur la valeur interne triable).
const fmtD = (d: any) => /^\d{4}-\d{2}-\d{2}/.test(String(d)) ? String(d).slice(0, 10).split('-').reverse().join('/') : String(d ?? '')

/**
 * Sous-comptes budgétés d'un compte, agrégés sur les sociétés sélectionnées et fusionnés
 * par nom (b[] = somme mensuelle). Sert à afficher la ventilation budget dans la fenêtre
 * écritures du CR / Équilibre / SIG. Renvoie [] si le compte n'a pas de sous-comptes.
 */
export function budChildrenForAccount(
  budData: Record<string, any> | undefined,
  selCo: string[],
  acc?: string,
): { name: string; b: number[] }[] {
  if (!acc || !budData) return []
  const merged: Record<string, number[]> = {}
  for (const co of selCo) {
    const kids = (budData[co] ?? {})[acc]?.children as any[] | undefined
    for (const ch of (kids ?? [])) {
      const name = (ch?.name || '').trim() || '(sans nom)'
      const arr = (merged[name] ??= Array(12).fill(0))
      ;(ch?.b ?? []).forEach((v: number, i: number) => { arr[i] += v || 0 })
    }
  }
  return Object.entries(merged).map(([name, b]) => ({ name, b }))
}

export function EcrituresModal({ title, entries, cumN, cumN1, budChildren, budSelMonths, onClose }: EcrituresModalProps) {
  const [search,  setSearch]  = useState('')
  const [sortCol, setSortCol] = useState(0)
  const [sortDir, setSortDir] = useState<SortDir>(1)

  const hasPeriod = entries.some(e => e[6] === 'N' || e[6] === 'N-1')
  const hasOD     = entries.some(e => e[5] === 1)
  const varN      = cumN - cumN1

  const toggleSort = (col: number) => {
    if (sortCol === col) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortCol(col); setSortDir(1) }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let rows = entries.filter(e =>
      !q || String(e[0]).includes(q) || fmtD(e[0]).includes(q) ||
      String(e[1]).toLowerCase().includes(q) || String(e[4]).toLowerCase().includes(q)
    )
    rows = [...rows].sort((a, b) => {
      const va = sortCol === 6 ? ((b[3] || 0) - (b[2] || 0)) : a[sortCol]
      const vb = sortCol === 6 ? ((a[3] || 0) - (a[2] || 0)) : b[sortCol]
      if (va < vb) return -sortDir
      if (va > vb) return sortDir
      return 0
    })
    return rows
  }, [entries, search, sortCol, sortDir])

  const totalD   = filtered.reduce((s, e) => s + (e[2] || 0), 0)
  const totalC   = filtered.reduce((s, e) => s + (e[3] || 0), 0)
  const solde    = totalD - totalC
  const totalN   = filtered.filter(e => e[6] === 'N').reduce((s, e) => s + (e[3] - e[2]), 0)
  const totalN1  = filtered.filter(e => e[6] === 'N-1').reduce((s, e) => s + (e[3] - e[2]), 0)

  const SortTh = ({ col, label, align = 'right', w }: { col: number; label: string; align?: string; w?: number }) => (
    <th onClick={() => toggleSort(col)} style={{
      padding: '8px 8px', textAlign: align as any, color: 'var(--text-2)',
      fontWeight: 600, cursor: 'pointer', userSelect: 'none', fontSize: 11,
      borderBottom: '2px solid var(--border-1)',
      width: w, minWidth: w,
      background: sortCol === col ? 'rgba(59,130,246,0.06)' : 'transparent',
    }}>
      {label} <span style={{ fontSize: 9, opacity: 0.6 }}>{sortCol === col ? (sortDir === 1 ? '▲' : '▼') : '⇅'}</span>
    </th>
  )

  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, backdropFilter:'blur(4px)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:'#0d1424', borderRadius:14, width:'min(1100px,95vw)', maxHeight:'88vh', display:'flex', flexDirection:'column', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 30px 60px rgba(0,0,0,0.6)' }}
      >

        {/* En-tête */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border-0)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <h3 style={{ margin:0, fontSize:15, color:'var(--blue)', fontWeight:700 }}>{title}</h3>
            <div style={{ fontSize:11, color:'var(--text-2)', marginTop:2 }}>
              {filtered.length} écriture{filtered.length > 1 ? 's' : ''} — Solde :{' '}
              <strong style={{ color: solde < 0 ? 'var(--red)' : 'var(--green)', fontFamily:'monospace' }}>{fmt2(solde)}</strong>
            </div>
          </div>
          <div style={{ display:'flex', gap:20, alignItems:'center' }}>
            {/* KPIs */}
            {[
              { label:'Cumul N',  value:cumN,  color: cumN  < 0 ? 'var(--red)' : 'var(--blue)' },
              { label:'Cumul N-1',value:cumN1, color:'var(--text-2)' },
              { label:'Var.',     value:varN,  color: varN  > 0 ? 'var(--green)' : varN < 0 ? 'var(--red)' : 'var(--text-2)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, color:'var(--text-2)' }}>{label}</div>
                <div style={{ fontSize:16, fontWeight:700, fontFamily:'monospace', color }}>
                  {value > 0 && label === 'Var.' ? '+' : ''}{fmt(value)}
                </div>
              </div>
            ))}
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.08)', border:'none', color:'var(--text-2)', fontSize:16, cursor:'pointer', width:34, height:34, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ✕
            </button>
          </div>
        </div>

        {/* Recherche */}
        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border-0)', flexShrink:0 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher..."
            style={{ width:'100%', padding:'8px 12px', background:'var(--bg-0)', border:'1px solid var(--border-1)', borderRadius:8, color:'var(--text-0)', fontSize:12, outline:'none', boxSizing:'border-box' as const }}
          />
        </div>

        {/* Tableau */}
        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead style={{ position:'sticky', top:0, background:'#0d1424', zIndex:2 }}>
              <tr>
                <SortTh col={0} label="Date"    align="left"   w={100} />
                <SortTh col={1} label="Libellé" align="left"   />
                <SortTh col={2} label="Débit"   align="right"  w={90} />
                <SortTh col={3} label="Crédit"  align="right"  w={90} />
                <SortTh col={4} label="Jnl"     align="center" w={45} />
                {hasPeriod && (
                  <th style={{ padding:'8px 8px', textAlign:'right', color:'var(--blue)', fontWeight:700, fontSize:11, borderBottom:'2px solid var(--border-1)', width:85, borderLeft:'2px solid rgba(59,130,246,0.3)' }}>
                    N ⇅
                  </th>
                )}
                {hasPeriod && (
                  <th style={{ padding:'8px 8px', textAlign:'right', color:'var(--text-2)', fontWeight:600, fontSize:11, borderBottom:'2px solid var(--border-1)', width:85 }}>
                    N-1 ⇅
                  </th>
                )}
                {hasOD && (
                  <th style={{ padding:'8px 4px', textAlign:'center', color:'var(--amber)', fontWeight:600, fontSize:11, borderBottom:'2px solid var(--border-1)', width:35 }}>
                    OD
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const net   = Math.round(((e[3] || 0) - (e[2] || 0)) * 100) / 100
                const isN   = e[6] === 'N'
                const isN1  = e[6] === 'N-1'
                const isOD  = e[5] === 1
                return (
                  <tr key={i} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: isOD ? 'rgba(245,158,11,0.04)' : isN1 ? 'rgba(148,163,184,0.03)' : 'transparent',
                    opacity: isOD ? 0.75 : 1,
                  }}>
                    <td style={{ padding:'5px 8px', fontFamily:'monospace', color:'var(--text-2)', whiteSpace:'nowrap' }}>{fmtD(e[0])}</td>
                    <td style={{ padding:'5px 8px', color:'var(--text-1)', maxWidth:340, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {e[1] || '—'}
                      {e[7] && (
                        <button onClick={ev => { ev.stopPropagation(); openInvoice(String(e[7])) }}
                          title="Voir / télécharger la facture"
                          style={{ marginLeft:8, display:'inline-flex', alignItems:'center', gap:3, padding:'1px 7px',
                            borderRadius:6, background:'rgba(59,130,246,0.18)', color:'#93c5fd', fontSize:10, fontWeight:600,
                            border:'none', boxShadow:'inset 0 0 0 1px rgba(59,130,246,0.35)', cursor:'pointer',
                            fontFamily:'inherit', verticalAlign:'middle' }}>
                          📎 Facture
                        </button>
                      )}
                    </td>
                    <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', color: e[2] > 0 ? 'var(--text-0)' : 'var(--text-3)' }}>
                      {e[2] > 0 ? fmt2(e[2]) : '—'}
                    </td>
                    <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', color: e[3] > 0 ? 'var(--text-0)' : 'var(--text-3)' }}>
                      {e[3] > 0 ? fmt2(e[3]) : '—'}
                    </td>
                    <td style={{ padding:'5px 8px', textAlign:'center', color:'var(--text-2)', fontSize:10 }}>{e[4] || '—'}</td>
                    {hasPeriod && (
                      <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:600, borderLeft:'2px solid rgba(59,130,246,0.2)',
                        color: isN ? (net < 0 ? 'var(--red)' : 'var(--blue)') : 'rgba(100,116,139,0.3)' }}>
                        {isN ? (net < 0 ? `(${fmt2(Math.abs(net))})` : fmt2(net)) : '—'}
                      </td>
                    )}
                    {hasPeriod && (
                      <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:500,
                        color: isN1 ? (net < 0 ? 'rgba(239,68,68,0.6)' : 'rgba(148,163,184,0.7)') : 'rgba(100,116,139,0.3)' }}>
                        {isN1 ? (net < 0 ? `(${fmt2(Math.abs(net))})` : fmt2(net)) : '—'}
                      </td>
                    )}
                    {hasOD && (
                      <td style={{ padding:'5px 8px', textAlign:'center' }}>
                        {isOD && <span style={{ fontSize:9, color:'var(--amber)', background:'rgba(245,158,11,0.15)', padding:'1px 4px', borderRadius:4 }}>OD</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'var(--text-3)', fontSize:12 }}>Aucune écriture trouvée</div>
          )}

          {/* Détail budget par sous-comptes — même fenêtre, sous les écritures réelles.
              On ne somme QUE les mois sélectionnés (index calendaire), exactement comme la
              colonne Budget de CR/Équilibre/SIG → les totaux concordent avec le tableau. */}
          {budChildren && budChildren.length > 0 && (() => {
            // Mois affichés = mois sélectionnés (ordonnés). À défaut, les 12 mois.
            const cols = (budSelMonths && budSelMonths.length)
              ? budSelMonths.map(m => ({ idx: fiscalIndex(m), label: MONTHS_SHORT[fiscalIndex(m)] ?? m }))
              : MONTHS_SHORT.map((label, idx) => ({ idx, label }))
            const sumCols = (b: number[]) => cols.reduce((s, c) => s + (b?.[c.idx] ?? 0), 0)
            const monthTotals = cols.map(c => budChildren.reduce((s, ch) => s + (ch.b?.[c.idx] ?? 0), 0))
            const grandTotal = monthTotals.reduce((s, x) => s + (x || 0), 0)
            const isFullYear = cols.length === 12
            return (
              <div style={{ borderTop:'8px solid rgba(245,158,11,0.12)', padding:'14px 20px 4px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--amber)', marginBottom:10 }}>
                  📋 Détail budget — sous-comptes ({budChildren.length}) · {isFullYear ? 'annuel' : `${cols.length} mois sélectionnés`} ·{' '}
                  <span style={{ fontFamily:'monospace' }}>{fmt(grandTotal)}</span>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr>
                      <th style={{ padding:'6px 8px', textAlign:'left', color:'var(--text-2)', fontWeight:600, minWidth:150, borderBottom:'2px solid var(--border-1)' }}>Sous-compte</th>
                      {cols.map((c, i) => (
                        <th key={i} style={{ padding:'6px 4px', textAlign:'right', color:'var(--text-2)', fontWeight:600, minWidth:52, borderBottom:'2px solid var(--border-1)' }}>{c.label}</th>
                      ))}
                      <th style={{ padding:'6px 8px', textAlign:'right', color:'var(--amber)', fontWeight:700, minWidth:76, borderBottom:'2px solid var(--border-1)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budChildren.map((ch, ci) => (
                      <tr key={ci} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding:'4px 8px', color:'var(--text-1)', whiteSpace:'nowrap' }}>
                          <span style={{ color:'var(--amber)', marginRight:6, opacity:0.7 }}>└</span>
                          {ch.name || <span style={{ color:'var(--text-3)', fontStyle:'italic' }}>(sans nom)</span>}
                        </td>
                        {cols.map((c, i) => {
                          const v = ch.b?.[c.idx] ?? 0
                          return (
                            <td key={i} style={{ padding:'4px 4px', textAlign:'right', fontFamily:'monospace', color: v !== 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                              {v !== 0 ? fmt(v) : '—'}
                            </td>
                          )
                        })}
                        <td style={{ padding:'4px 8px', textAlign:'right', fontFamily:'monospace', color:'var(--amber)', fontWeight:600 }}>{fmt(sumCols(ch.b ?? []))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:'2px solid var(--border-1)', background:'rgba(245,158,11,0.04)' }}>
                      <td style={{ padding:'6px 8px', fontWeight:700, color:'var(--text-1)' }}>Total budget compte</td>
                      {monthTotals.map((v, i) => (
                        <td key={i} style={{ padding:'6px 4px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'var(--amber)' }}>{v !== 0 ? fmt(v) : '—'}</td>
                      ))}
                      <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'var(--amber)' }}>{fmt(grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })()}
        </div>

        {/* Footer totaux */}
        <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border-1)', flexShrink:0, display:'flex', alignItems:'center', gap:24, background:'rgba(255,255,255,0.02)' }}>
          {[
            { label:'Débit',  value:totalD, color:'var(--text-1)' },
            { label:'Crédit', value:totalC, color:'var(--text-1)' },
            { label:'Solde',  value:solde,  color: solde < 0 ? 'var(--red)' : 'var(--green)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ fontSize:11 }}>
              <span style={{ color:'var(--text-2)' }}>{label} : </span>
              <span style={{ fontFamily:'monospace', fontWeight:700, color }}>{fmt2(value)}</span>
            </div>
          ))}
          {hasPeriod && (
            <>
              <div style={{ width:1, height:16, background:'var(--border-1)', margin:'0 4px' }} />
              <div style={{ fontSize:11 }}>
                <span style={{ color:'var(--blue)' }}>N : </span>
                <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--blue)' }}>({fmt2(Math.abs(totalN))})</span>
              </div>
              <div style={{ fontSize:11 }}>
                <span style={{ color:'var(--text-2)' }}>N-1 : </span>
                <span style={{ fontFamily:'monospace', fontWeight:600, color:'var(--text-2)' }}>{fmt2(totalN1)}</span>
              </div>
            </>
          )}
          <div style={{ marginLeft:'auto', fontSize:11, color:'var(--text-3)' }}>
            {entries.length !== filtered.length ? `${filtered.length} / ${entries.length}` : `${entries.length}`} écriture{entries.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
