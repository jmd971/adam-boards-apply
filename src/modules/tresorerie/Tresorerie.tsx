import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { KpiCard } from '@/components/ui'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

const ENC_CATS = [
  { label: 'Ventes prestations',     accs: ['706','7061','70611'] },
  { label: 'Ventes marchandises',    accs: ['707','7072'] },
  { label: 'Activités annexes',      accs: ['708','7080'] },
  { label: 'Subventions',            accs: ['74'] },
  { label: 'Produits financiers',    accs: ['76'] },
  { label: 'Produits exceptionnels', accs: ['77'] },
  { label: 'Autres produits',        accs: ['75','78','79'] },
]

const DEC_CATS = [
  { label: 'Achats marchandises',    accs: ['607','6071','6087','6097'] },
  { label: 'Achats mat. premières',  accs: ['601','6031','6081'] },
  { label: 'Sous-traitance',         accs: ['604'] },
  { label: 'Services extérieurs',    accs: ['61','62'] },
  { label: 'Impôts & taxes',         accs: ['63'] },
  { label: 'Salaires',               accs: ['641','642','643','644'] },
  { label: 'Charges sociales',       accs: ['645','646'] },
  { label: 'Amortissements',         accs: ['681','682'] },
  { label: 'Charges financières',    accs: ['66'] },
  { label: 'Charges exceptionnelles',accs: ['67'] },
  { label: 'Impôt sur les sociétés', accs: ['695','696','697'] },
  { label: 'Autres charges',         accs: ['65','68','69'] },
]

export function Tresorerie() {
  const RAW           = useAppStore(s => s.RAW)
  const filters       = useAppStore(s => s.filters)
  const manualEntries = useAppStore(s => s.manualEntries)

  // Clés des catégories dépliées
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setExpanded(p => {
    const n = new Set(p)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  })

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])
  const months = useMemo(() => RAW?.mn ?? [], [RAW?.mn?.join(',')])


  // Construire toutes les données
  const data = useMemo(() => {
    if (!RAW || !months.length) return null

    // encByCat[cat][mi] = montant total
    // encByAcc[cat][acc][mi] = montant par compte
    const encByCat:  Record<string, number[]>            = {}
    const encByAcc:  Record<string, Record<string, { vals: number[]; label: string }>> = {}
    const decByCat:  Record<string, number[]>            = {}
    const decByAcc:  Record<string, Record<string, { vals: number[]; label: string }>> = {}
    const encManuel  = Array(months.length).fill(0)
    const decManuel  = Array(months.length).fill(0)

    ENC_CATS.forEach(c => {
      encByCat[c.label] = Array(months.length).fill(0)
      encByAcc[c.label] = {}
    })
    DEC_CATS.forEach(c => {
      decByCat[c.label] = Array(months.length).fill(0)
      decByAcc[c.label] = {}
    })

    for (const co of selCo) {
      const pn = RAW.companies[co]?.pn ?? {}
      for (const [acc, acctData] of Object.entries(pn)) {
        const moMap  = (acctData as any)?.mo ?? {}
        const lbl    = (acctData as any)?.l ?? acc

        for (const cat of ENC_CATS) {
          if (!cat.accs.some(a => acc.startsWith(a))) continue
          if (!encByAcc[cat.label][acc]) encByAcc[cat.label][acc] = { vals: Array(months.length).fill(0), label: lbl }
          months.forEach((m, mi) => {
            const mo = moMap[m]
            if (!mo || !Array.isArray(mo)) return
            const v = Math.max(0, (mo[1] as number) - (mo[0] as number))
            encByCat[cat.label][mi] += v
            encByAcc[cat.label][acc].vals[mi] += v
          })
          break
        }

        for (const cat of DEC_CATS) {
          if (!cat.accs.some(a => acc.startsWith(a))) continue
          if (!decByAcc[cat.label][acc]) decByAcc[cat.label][acc] = { vals: Array(months.length).fill(0), label: lbl }
          months.forEach((m, mi) => {
            const mo = moMap[m]
            if (!mo || !Array.isArray(mo)) return
            const v = Math.max(0, (mo[0] as number) - (mo[1] as number))
            decByCat[cat.label][mi] += v
            decByAcc[cat.label][acc].vals[mi] += v
          })
          break
        }
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
    ENC_CATS.forEach(c => {
      encByCat[c.label] = encByCat[c.label].map(v => Math.round(v))
      Object.values(encByAcc[c.label]).forEach(a => { a.vals = a.vals.map(v => Math.round(v)) })
    })
    DEC_CATS.forEach(c => {
      decByCat[c.label] = decByCat[c.label].map(v => Math.round(v))
      Object.values(decByAcc[c.label]).forEach(a => { a.vals = a.vals.map(v => Math.round(v)) })
    })

    const totalEnc = months.map((_, mi) => ENC_CATS.reduce((s, c) => s + encByCat[c.label][mi], 0) + encManuel[mi])
    const totalDec = months.map((_, mi) => DEC_CATS.reduce((s, c) => s + decByCat[c.label][mi], 0) + decManuel[mi])
    const flux     = months.map((_, mi) => totalEnc[mi] - totalDec[mi])
    let cum = 0
    const cumulArr = flux.map(v => { cum += v; return cum })

    return { encByCat, encByAcc, decByCat, decByAcc, encManuel, decManuel, totalEnc, totalDec, flux, cumulArr }
  }, [RAW, filters.selCo.join(','), months.join(','), manualEntries.length])

  if (!RAW || !data || months.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, color:'#475569', fontSize:13 }}>
      {!RAW ? 'Aucune donnée. Importez un fichier FEC.' : 'Aucun mois N disponible.'}
    </div>
  )

  const { encByCat, encByAcc, decByCat, decByAcc, encManuel, decManuel, totalEnc, totalDec, flux, cumulArr } = data
  const grandEnc  = totalEnc.reduce((s,v) => s+v, 0)
  const grandDec  = totalDec.reduce((s,v) => s+v, 0)
  const grandFlux = grandEnc - grandDec

  const thSt: React.CSSProperties = {
    padding: '7px 6px', textAlign: 'right', color: '#475569', fontWeight: 600, fontSize: 11,
    borderBottom: '2px solid rgba(255,255,255,0.08)', background: '#0a0f1a',
    position: 'sticky', top: 0, zIndex: 5, whiteSpace: 'nowrap',
  }

  // Ligne totale (cliquable pour déplier)
  const CatRow = ({ catLabel, vals, color, type }: { catLabel: string; vals: number[]; color: string; type: 'enc' | 'dec' }) => {
    const total    = vals.reduce((s,v) => s+v, 0)
    const key      = `${type}_${catLabel}`
    const isOpen   = expanded.has(key)
    const accMap   = type === 'enc' ? encByAcc[catLabel] : decByAcc[catLabel]
    const hasDetail = Object.values(accMap).some(a => a.vals.some(v => v > 0))
    if (total === 0) return null
    return (
      <>
        <tr
          onClick={() => hasDetail && toggle(key)}
          style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background: isOpen ? 'rgba(255,255,255,0.03)' : 'transparent', cursor: hasDetail ? 'pointer' : 'default' }}
        >
          <td style={{ padding:'7px 12px 7px 24px', color, fontWeight:500, fontSize:11, whiteSpace:'nowrap' }}>
            {hasDetail && <span style={{ marginRight:6, fontSize:9, color:'#475569' }}>{isOpen ? '▾':'▸'}</span>}
            {catLabel}
          </td>
          {vals.map((v, i) => (
            <td key={i} style={{ padding:'7px 6px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: v===0 ? '#1e293b' : color }}>
              {v !== 0 ? fmt(v) : '—'}
            </td>
          ))}
          <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color }}>
            {fmt(total)}
          </td>
        </tr>

        {/* Détail par compte */}
        {isOpen && Object.entries(accMap)
          .filter(([, a]) => a.vals.some(v => v > 0))
          .sort(([, a], [, b]) => b.vals.reduce((s,v)=>s+v,0) - a.vals.reduce((s,v)=>s+v,0))
          .map(([acc, a]) => {
            const accTotal = a.vals.reduce((s,v) => s+v, 0)
            return (
              <tr key={acc} style={{ borderBottom:'1px solid rgba(255,255,255,0.02)', background:'rgba(0,0,0,0.15)' }}>
                <td style={{ padding:'4px 12px 4px 44px', fontSize:10, color:'#475569', whiteSpace:'nowrap' }}>
                  <span style={{ fontFamily:'monospace', color:'#334155', marginRight:6 }}>{acc}</span>
                  <span style={{ color:'#64748b' }}>{a.label}</span>
                </td>
                {a.vals.map((v, i) => (
                  <td key={i} style={{ padding:'4px 6px', textAlign:'right', fontFamily:'monospace', fontSize:10, color: v===0 ? '#1e293b' : '#64748b' }}>
                    {v !== 0 ? fmt(v) : '—'}
                  </td>
                ))}
                <td style={{ padding:'4px 10px', textAlign:'right', fontFamily:'monospace', fontSize:10, color:'#475569', fontWeight:600 }}>
                  {fmt(accTotal)}
                </td>
              </tr>
            )
          })
        }
      </>
    )
  }

  const TotalRow = ({ label, vals, color, border = false }: { label: string; vals: number[]; color: string; border?: boolean }) => {
    const total = vals.reduce((s,v) => s+v, 0)
    return (
      <tr style={{ background:'rgba(255,255,255,0.025)', borderTop: border ? `2px solid ${color}30` : '1px solid rgba(255,255,255,0.06)' }}>
        <td style={{ padding:'9px 12px', fontWeight:800, fontSize:12, color }}>{label}</td>
        {vals.map((v, i) => (
          <td key={i} style={{ padding:'9px 6px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:12, color: v<0 ? '#ef4444' : v===0 ? '#334155' : color }}>
            {v !== 0 ? fmt(v) : '—'}
          </td>
        ))}
        <td style={{ padding:'9px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:12, color: total<0 ? '#ef4444' : color }}>
          {fmt(total)}
        </td>
      </tr>
    )
  }

  const SectionHeader = ({ label, color }: { label: string; color: string }) => (
    <tr style={{ background:`${color}10` }}>
      <td colSpan={months.length + 2} style={{ padding:'10px 12px', fontWeight:800, fontSize:11, color, letterSpacing:'1px', textTransform:'uppercase', borderTop:`2px solid ${color}40`, borderBottom:`1px solid ${color}20` }}>
        {label}
      </td>
    </tr>
  )

  return (
    <div style={{ padding:'16px 24px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        <KpiCard label="Encaissements N"      value={`${fmt(grandEnc)} €`}  color="#10b981" />
        <KpiCard label="Décaissements N"      value={`${fmt(grandDec)} €`}  color="#ef4444" />
        <KpiCard label="Flux net"              value={`${fmt(grandFlux)} €`} color={grandFlux>=0?'#10b981':'#ef4444'} />
        <KpiCard label="Cumul fin de période" value={`${fmt(cumulArr[cumulArr.length-1]??0)} €`} color="#8b5cf6" />
      </div>

      <div style={{ marginBottom:10, fontSize:10, color:'#334155' }}>
        💡 Cliquez sur une catégorie pour afficher le détail par compte comptable.
      </div>

      <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid rgba(255,255,255,0.06)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thSt, textAlign:'left', minWidth:240, paddingLeft:12, position:'sticky', left:0, zIndex:7, background:'#0a0f1a' }}>Poste</th>
              {months.map(m => (
                <th key={m} style={{ ...thSt, minWidth:62 }}>
                  {MONTHS_SHORT[parseInt(m.slice(5))-1]}
                </th>
              ))}
              <th style={{ ...thSt, minWidth:85, color:'#3b82f6' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {/* ENCAISSEMENTS */}
            <SectionHeader label="📥 Encaissements" color="#10b981" />
            {ENC_CATS.map(cat => (
              <CatRow key={cat.label} catLabel={cat.label} vals={encByCat[cat.label]} color="#34d399" type="enc" />
            ))}
            {encManuel.some(v=>v>0) && (
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding:'7px 12px 7px 24px', color:'#8b5cf6', fontWeight:500, fontSize:11, fontStyle:'italic' }}>Saisies manuelles</td>
                {encManuel.map((v,i) => <td key={i} style={{ padding:'7px 6px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: v===0?'#1e293b':'#8b5cf6' }}>{v!==0?fmt(v):'—'}</td>)}
                <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color:'#8b5cf6' }}>{fmt(encManuel.reduce((s,v)=>s+v,0))}</td>
              </tr>
            )}
            <TotalRow label="TOTAL ENCAISSEMENTS" vals={totalEnc} color="#10b981" border />

            {/* DÉCAISSEMENTS */}
            <SectionHeader label="📤 Décaissements" color="#ef4444" />
            {DEC_CATS.map(cat => (
              <CatRow key={cat.label} catLabel={cat.label} vals={decByCat[cat.label]} color="#fca5a5" type="dec" />
            ))}
            {decManuel.some(v=>v>0) && (
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding:'7px 12px 7px 24px', color:'#8b5cf6', fontWeight:500, fontSize:11, fontStyle:'italic' }}>Saisies manuelles</td>
                {decManuel.map((v,i) => <td key={i} style={{ padding:'7px 6px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: v===0?'#1e293b':'#8b5cf6' }}>{v!==0?fmt(v):'—'}</td>)}
                <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color:'#8b5cf6' }}>{fmt(decManuel.reduce((s,v)=>s+v,0))}</td>
              </tr>
            )}
            <TotalRow label="TOTAL DÉCAISSEMENTS" vals={totalDec} color="#ef4444" border />

            {/* FLUX */}
            <SectionHeader label="💰 Flux de trésorerie" color="#3b82f6" />
            <TotalRow label="FLUX NET" vals={flux} color="#3b82f6" />
            <tr style={{ background:'rgba(139,92,246,0.06)', borderTop:'2px solid rgba(139,92,246,0.2)' }}>
              <td style={{ padding:'9px 12px', fontWeight:800, fontSize:12, color:'#8b5cf6' }}>CUMUL</td>
              {cumulArr.map((v,i) => (
                <td key={i} style={{ padding:'9px 6px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:12, color: v<0?'#ef4444':'#8b5cf6' }}>{fmt(v)}</td>
              ))}
              <td style={{ padding:'9px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:12, color:(cumulArr[cumulArr.length-1]??0)<0?'#ef4444':'#8b5cf6' }}>
                {fmt(cumulArr[cumulArr.length-1]??0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop:12, fontSize:10, color:'#334155' }}>
        * Basé sur les comptes 6 & 7 du Grand Livre FEC. Lignes à zéro masquées automatiquement.
      </div>
    </div>
  )
}
