import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { KpiCard } from '@/components/ui'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

const ENC_CATS = [
  { label: 'Ventes prestations',    accs: ['706','7061','70611'] },
  { label: 'Ventes marchandises',   accs: ['707','7072'] },
  { label: 'Activités annexes',     accs: ['708','7080'] },
  { label: 'Subventions',           accs: ['74'] },
  { label: 'Produits financiers',   accs: ['76'] },
  { label: 'Produits exceptionnels',accs: ['77'] },
  { label: 'Autres produits',       accs: ['75','78','79'] },
]

const DEC_CATS = [
  { label: 'Achats marchandises',   accs: ['607','6071','6087','6097'] },
  { label: 'Achats mat. premières', accs: ['601','6031','6081'] },
  { label: 'Sous-traitance',        accs: ['604'] },
  { label: 'Services extérieurs',   accs: ['61','62'] },
  { label: 'Impôts & taxes',        accs: ['63'] },
  { label: 'Salaires',              accs: ['641','642','643','644'] },
  { label: 'Charges sociales',      accs: ['645','646'] },
  { label: 'Amortissements',        accs: ['681','682'] },
  { label: 'Charges financières',   accs: ['66'] },
  { label: 'Charges exceptionnelles',accs: ['67'] },
  { label: 'Impôt sur les sociétés',accs: ['695','696','697'] },
  { label: 'Autres charges',        accs: ['65','68','69'] },
]

export function Tresorerie() {
  const RAW           = useAppStore(s => s.RAW)
  const filters       = useAppStore(s => s.filters)
  const manualEntries = useAppStore(s => s.manualEntries)

  const months = useMemo(() => RAW?.mn ?? [], [RAW?.mn?.join(',')])

  const cashFlow = useMemo(() => {
    if (!RAW || !months.length) return null

    // Initialiser les structures
    const encByCat: Record<string, number[]> = {}
    const decByCat: Record<string, number[]> = {}
    ENC_CATS.forEach(c => { encByCat[c.label] = Array(months.length).fill(0) })
    DEC_CATS.forEach(c => { decByCat[c.label] = Array(months.length).fill(0) })
    const encManuel = Array(months.length).fill(0)
    const decManuel = Array(months.length).fill(0)

    // Données FEC
    for (const co of filters.selCo) {
      const pn = RAW.companies[co]?.pn ?? {}
      for (const [acc, data] of Object.entries(pn)) {
        const moMap = (data as any)?.mo ?? {}
        months.forEach((m, mi) => {
          const mo = moMap[m]
          if (!mo || !Array.isArray(mo)) return
          const [d, cr] = mo as [number, number]

          for (const cat of ENC_CATS) {
            if (cat.accs.some(a => acc.startsWith(a))) {
              encByCat[cat.label][mi] += Math.max(0, cr - d)
              break
            }
          }
          for (const cat of DEC_CATS) {
            if (cat.accs.some(a => acc.startsWith(a))) {
              decByCat[cat.label][mi] += Math.max(0, d - cr)
              break
            }
          }
        })
      }
    }

    // Saisies manuelles
    for (const me of manualEntries) {
      if (!me.entry_date) continue
      const mi = months.findIndex(m => me.entry_date.startsWith(m))
      if (mi < 0) continue
      const ht = parseFloat(me.amount_ht_saisie || me.amount_ht || '0') || 0
      if (me.category === 'Vente') encManuel[mi] += ht
      else decManuel[mi] += ht
    }

    // Arrondir
    ENC_CATS.forEach(c => { encByCat[c.label] = encByCat[c.label].map(v => Math.round(v)) })
    DEC_CATS.forEach(c => { decByCat[c.label] = decByCat[c.label].map(v => Math.round(v)) })

    // Totaux
    const totalEnc = months.map((_, mi) =>
      ENC_CATS.reduce((s, c) => s + encByCat[c.label][mi], 0) + encManuel[mi]
    )
    const totalDec = months.map((_, mi) =>
      DEC_CATS.reduce((s, c) => s + decByCat[c.label][mi], 0) + decManuel[mi]
    )
    const flux = months.map((_, mi) => totalEnc[mi] - totalDec[mi])
    let cumul = 0
    const cumulArr = flux.map(v => { cumul += v; return cumul })

    return { encByCat, decByCat, encManuel, decManuel, totalEnc, totalDec, flux, cumulArr }
  }, [RAW, filters.selCo.join(','), months.join(','), manualEntries.length])

  if (!RAW || !cashFlow || months.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, color:'#475569', fontSize:13 }}>
      {!RAW ? 'Aucune donnée. Importez un fichier FEC.' : 'Aucun mois N disponible.'}
    </div>
  )

  const { encByCat, decByCat, encManuel, decManuel, totalEnc, totalDec, flux, cumulArr } = cashFlow

  const grandTotalEnc = totalEnc.reduce((s,v) => s+v, 0)
  const grandTotalDec = totalDec.reduce((s,v) => s+v, 0)
  const grandFlux     = grandTotalEnc - grandTotalDec

  // Styles
  const thSt = (right = true, highlight = false): React.CSSProperties => ({
    padding: '7px 6px', textAlign: right ? 'right' : 'left',
    color: highlight ? '#3b82f6' : '#475569',
    fontWeight: highlight ? 700 : 600, fontSize: 11,
    borderBottom: '2px solid rgba(255,255,255,0.08)',
    background: '#0a0f1a', position: 'sticky', top: 0, zIndex: 5,
    whiteSpace: 'nowrap',
  })

  const SectionHeader = ({ label, color }: { label: string; color: string }) => (
    <tr style={{ background: `${color}12` }}>
      <td colSpan={months.length + 2} style={{ padding: '10px 12px', fontWeight: 800, fontSize: 12, color, letterSpacing: '0.5px', textTransform: 'uppercase', borderTop: `2px solid ${color}40`, borderBottom: `1px solid ${color}20` }}>
        {label}
      </td>
    </tr>
  )

  const DetailRow = ({ label, vals, color = '#94a3b8', bold = false, italic = false }: { label: string; vals: number[]; color?: string; bold?: boolean; italic?: boolean }) => {
    const total = vals.reduce((s,v) => s+v, 0)
    if (total === 0 && !bold) return null
    return (
      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.025)', background: bold ? 'rgba(255,255,255,0.025)' : 'transparent' }}>
        <td style={{ padding: bold ? '8px 12px' : '5px 12px 5px 28px', color, fontWeight: bold ? 700 : 400, fontSize: bold ? 12 : 11, fontStyle: italic ? 'italic' : 'normal', whiteSpace: 'nowrap' }}>
          {!bold && <span style={{ color: '#334155', marginRight: 6 }}>└</span>}
          {label}
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ padding: bold ? '8px 6px' : '5px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: bold ? 12 : 11, fontWeight: bold ? 700 : 400, color: v === 0 ? '#1e293b' : v < 0 ? '#ef4444' : color }}>
            {v !== 0 ? fmt(v) : '—'}
          </td>
        ))}
        <td style={{ padding: bold ? '8px 10px' : '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: bold ? 12 : 11, fontWeight: 700, color: total === 0 ? '#1e293b' : total < 0 ? '#ef4444' : color }}>
          {total !== 0 ? fmt(total) : '—'}
        </td>
      </tr>
    )
  }

  const SeparatorRow = () => (
    <tr><td colSpan={months.length + 2} style={{ height: 4, background: 'transparent' }} /></tr>
  )

  return (
    <div style={{ padding: '16px 24px' }}>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        <KpiCard label="Encaissements N"  value={`${fmt(grandTotalEnc)} €`} color="#10b981" />
        <KpiCard label="Décaissements N"  value={`${fmt(grandTotalDec)} €`} color="#ef4444" />
        <KpiCard label="Flux net"          value={`${fmt(grandFlux)} €`}    color={grandFlux >= 0 ? '#10b981' : '#ef4444'} />
        <KpiCard label="Cumul fin de période" value={`${fmt(cumulArr[cumulArr.length-1] ?? 0)} €`} color="#8b5cf6" />
      </div>

      {/* Tableau détaillé */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ ...thSt(false), minWidth: 220, paddingLeft: 12 }}>Poste</th>
              {months.map(m => (
                <th key={m} style={{ ...thSt(), minWidth: 62 }}>
                  {MONTHS_SHORT[parseInt(m.slice(5)) - 1]}
                </th>
              ))}
              <th style={{ ...thSt(), minWidth: 85, color: '#3b82f6' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {/* ── ENCAISSEMENTS ── */}
            <SectionHeader label="📥 Encaissements" color="#10b981" />
            {ENC_CATS.map(cat => (
              <DetailRow key={cat.label} label={cat.label} vals={encByCat[cat.label]} color="#6ee7b7" />
            ))}
            {encManuel.some(v => v > 0) && (
              <DetailRow label="Saisies manuelles" vals={encManuel} color="#8b5cf6" italic />
            )}
            <DetailRow label="TOTAL ENCAISSEMENTS" vals={totalEnc} color="#10b981" bold />
            <SeparatorRow />

            {/* ── DÉCAISSEMENTS ── */}
            <SectionHeader label="📤 Décaissements" color="#ef4444" />
            {DEC_CATS.map(cat => (
              <DetailRow key={cat.label} label={cat.label} vals={decByCat[cat.label]} color="#fca5a5" />
            ))}
            {decManuel.some(v => v > 0) && (
              <DetailRow label="Saisies manuelles" vals={decManuel} color="#8b5cf6" italic />
            )}
            <DetailRow label="TOTAL DÉCAISSEMENTS" vals={totalDec} color="#ef4444" bold />
            <SeparatorRow />

            {/* ── FLUX NET ── */}
            <SectionHeader label="💰 Flux de trésorerie" color="#3b82f6" />
            <DetailRow label="FLUX NET" vals={flux} color="#3b82f6" bold />
            <tr style={{ background: 'rgba(139,92,246,0.06)', borderTop: '2px solid rgba(139,92,246,0.2)' }}>
              <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#8b5cf6' }}>CUMUL</td>
              {cumulArr.map((v, i) => (
                <td key={i} style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: v < 0 ? '#ef4444' : '#8b5cf6' }}>
                  {fmt(v)}
                </td>
              ))}
              <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: (cumulArr[cumulArr.length-1]??0) < 0 ? '#ef4444' : '#8b5cf6' }}>
                {fmt(cumulArr[cumulArr.length-1] ?? 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: '#334155' }}>
        * Basé sur les comptes 6 & 7 du Grand Livre FEC. Les lignes à zéro sont masquées automatiquement.
      </div>
    </div>
  )
}
