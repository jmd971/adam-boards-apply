import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { KpiCard } from '@/components/ui'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// Mapping comptes → catégories trésorerie
const ENC_CATS: { label: string; accs: string[] }[] = [
  { label: 'Ventes de prestations', accs: ['706','7061','70611'] },
  { label: 'Ventes de marchandises', accs: ['707','7072'] },
  { label: 'Activités annexes',      accs: ['708','7080'] },
  { label: 'Autres produits',        accs: ['74','75','76','77'] },
]

const DEC_CATS: { label: string; accs: string[] }[] = [
  { label: 'Achats marchandises',    accs: ['607','601','604'] },
  { label: 'Charges externes',       accs: ['61','62'] },
  { label: 'Impôts & taxes',         accs: ['63'] },
  { label: 'Salaires',               accs: ['641','642'] },
  { label: 'Charges sociales',       accs: ['645','646'] },
  { label: 'Amortissements',         accs: ['681'] },
  { label: 'Charges financières',    accs: ['66'] },
  { label: 'Autres charges',         accs: ['65','67','68'] },
]

type RowData = {
  month: string
  encaiss: number
  decaiss: number
  flux: number
  encDetails: Record<string, number>
  decDetails: Record<string, number>
  encManuel: number
  decManuel: number
}

export function Tresorerie() {
  const RAW           = useAppStore(s => s.RAW)
  const filters       = useAppStore(s => s.filters)
  const manualEntries = useAppStore(s => s.manualEntries)

  const [expandEnc, setExpandEnc] = useState(false)
  const [expandDec, setExpandDec] = useState(false)

  const months = useMemo(() => RAW?.mn ?? [], [RAW?.mn?.join(',')])

  const cashFlow = useMemo((): RowData[] => {
    if (!RAW || !months.length) return []
    return months.map(m => {
      const encDetails: Record<string, number> = {}
      const decDetails: Record<string, number> = {}
      let encaiss = 0, decaiss = 0

      for (const co of filters.selCo) {
        const pn = RAW.companies[co]?.pn ?? {}
        for (const [acc, data] of Object.entries(pn)) {
          const mo = (data as any)?.mo?.[m]
          if (!mo || !Array.isArray(mo)) continue
          const [d, cr] = mo as [number, number]

          // Encaissements
          for (const cat of ENC_CATS) {
            if (cat.accs.some(a => acc.startsWith(a))) {
              const v = Math.max(0, cr - d)
              encDetails[cat.label] = (encDetails[cat.label] ?? 0) + v
              encaiss += v
              break
            }
          }
          // Décaissements
          for (const cat of DEC_CATS) {
            if (cat.accs.some(a => acc.startsWith(a))) {
              const v = Math.max(0, d - cr)
              decDetails[cat.label] = (decDetails[cat.label] ?? 0) + v
              decaiss += v
              break
            }
          }
        }
      }

      // Saisies manuelles
      let encManuel = 0, decManuel = 0
      for (const me of manualEntries) {
        if (!me.entry_date?.startsWith(m)) continue
        const ht = parseFloat(me.amount_ht_saisie || me.amount_ht || '0') || 0
        if (me.category === 'Vente') { encManuel += ht; encaiss += ht }
        else { decManuel += ht; decaiss += ht }
      }

      return {
        month: m,
        encaiss: Math.round(encaiss),
        decaiss: Math.round(decaiss),
        flux:    Math.round(encaiss - decaiss),
        encDetails, decDetails, encManuel, decManuel,
      }
    })
  }, [RAW, filters.selCo.join(','), months.join(','), manualEntries.length])

  const totalEncaiss = cashFlow.reduce((s, r) => s + r.encaiss, 0)
  const totalDecaiss = cashFlow.reduce((s, r) => s + r.decaiss, 0)
  const totalFlux    = totalEncaiss - totalDecaiss
  let cumul = 0
  const rows = cashFlow.map(r => { cumul += r.flux; return { ...r, cumul } })

  if (!RAW || months.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, color:'#475569', fontSize:13 }}>
      {!RAW ? 'Aucune donnée. Importez un fichier FEC.' : 'Aucun mois N disponible.'}
    </div>
  )

  const thSt = (right = true): React.CSSProperties => ({
    padding: '7px 6px', textAlign: right ? 'right' : 'left',
    color: '#475569', fontWeight: 600, fontSize: 11,
    borderBottom: '2px solid rgba(255,255,255,0.08)',
    background: '#0f172a', position: 'sticky', top: 0, zIndex: 5,
    whiteSpace: 'nowrap',
  })

  const makeRows = (
    label: string,
    key: 'encaiss' | 'decaiss' | 'flux' | 'cumul',
    color: string,
    expanded: boolean,
    setExpanded: (v: boolean) => void,
    detailKey: 'encDetails' | 'decDetails',
    cats: { label: string; accs: string[] }[],
    manuelKey: 'encManuel' | 'decManuel'
  ) => {
    const vals  = rows.map(r => r[key])
    const total = vals.reduce((s, v) => s + v, 0)
    const isSummary = key === 'flux' || key === 'cumul'

    const summaryRow = (
      <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: isSummary ? 'default' : 'pointer' }}
        onClick={() => !isSummary && setExpanded(!expanded)}>
        <td style={{ padding: '8px 12px', color, fontWeight: 700, fontSize: 12, userSelect: 'none' }}>
          {!isSummary && <span style={{ marginRight: 6, fontSize: 10 }}>{expanded ? '▾' : '▸'}</span>}
          {label}
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: v < 0 ? '#ef4444' : v === 0 ? '#334155' : color }}>
            {v !== 0 ? fmt(v) : '—'}
          </td>
        ))}
        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: total < 0 ? '#ef4444' : color }}>
          {fmt(total)}
        </td>
      </tr>
    )

    if (isSummary || !expanded) return [summaryRow]

    // Lignes détail par catégorie
    const detailRows = cats.map(cat => {
      const catVals = rows.map(r => Math.round(r[detailKey][cat.label] ?? 0))
      const catTotal = catVals.reduce((s, v) => s + v, 0)
      if (catTotal === 0) return null
      return (
        <tr key={cat.label} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', background: 'rgba(255,255,255,0.01)' }}>
          <td style={{ padding: '5px 12px 5px 28px', color: '#64748b', fontSize: 11 }}>
            <span style={{ marginRight: 6, color: '#334155' }}>└</span>{cat.label}
          </td>
          {catVals.map((v, i) => (
            <td key={i} style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: v === 0 ? '#334155' : '#94a3b8' }}>
              {v !== 0 ? fmt(v) : '—'}
            </td>
          ))}
          <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: '#64748b', fontWeight: 600 }}>
            {fmt(catTotal)}
          </td>
        </tr>
      )
    }).filter(Boolean)

    // Ligne saisies manuelles
    const manVals  = rows.map(r => Math.round(r[manuelKey]))
    const manTotal = manVals.reduce((s, v) => s + v, 0)
    const manRow   = manTotal > 0 ? (
      <tr key="manuel" style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', background: 'rgba(139,92,246,0.04)' }}>
        <td style={{ padding: '5px 12px 5px 28px', color: '#8b5cf6', fontSize: 11 }}>
          <span style={{ marginRight: 6, color: '#334155' }}>└</span>Saisies manuelles
        </td>
        {manVals.map((v, i) => (
          <td key={i} style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: v === 0 ? '#334155' : '#8b5cf6' }}>
            {v !== 0 ? fmt(v) : '—'}
          </td>
        ))}
        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: '#8b5cf6', fontWeight: 600 }}>
          {fmt(manTotal)}
        </td>
      </tr>
    ) : null

    return [summaryRow, ...detailRows, manRow].filter(Boolean)
  }

  return (
    <div style={{ padding: '16px 24px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
        <KpiCard label="Encaissements N" value={`${fmt(totalEncaiss)} €`} color="#10b981" />
        <KpiCard label="Décaissements N" value={`${fmt(totalDecaiss)} €`} color="#ef4444" />
        <KpiCard label="Flux net"        value={`${fmt(totalFlux)} €`}    color={totalFlux >= 0 ? '#10b981' : '#ef4444'} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thSt(false), minWidth: 200 }}>Poste</th>
              {rows.map(r => (
                <th key={r.month} style={{ ...thSt(), minWidth: 65 }}>
                  {MONTHS_SHORT[parseInt(r.month.slice(5)) - 1]}
                </th>
              ))}
              <th style={{ ...thSt(), color: '#3b82f6', minWidth: 85 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {makeRows('📥 Encaissements', 'encaiss', '#10b981', expandEnc, setExpandEnc, 'encDetails', ENC_CATS, 'encManuel')}
            {makeRows('📤 Décaissements', 'decaiss', '#ef4444', expandDec, setExpandDec, 'decDetails', DEC_CATS, 'decManuel')}
            {makeRows('💰 Flux net',      'flux',    '#3b82f6', false, () => {}, 'encDetails', [], 'encManuel')}
            {/* Cumul */}
            {(() => {
              const cumulVals = rows.map(r => r.cumul)
              const last = cumulVals[cumulVals.length - 1] ?? 0
              return (
                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '8px 12px', color: '#8b5cf6', fontWeight: 700, fontSize: 12 }}>📊 Cumul</td>
                  {cumulVals.map((v, i) => (
                    <td key={i} style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: v < 0 ? '#ef4444' : '#8b5cf6' }}>
                      {fmt(v)}
                    </td>
                  ))}
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: last < 0 ? '#ef4444' : '#8b5cf6' }}>
                    {fmt(last)}
                  </td>
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: '#334155' }}>
        💡 Cliquez sur Encaissements ou Décaissements pour afficher le détail par catégorie.
        * Estimations basées sur le Grand Livre FEC et les saisies manuelles.
      </div>
    </div>
  )
}
