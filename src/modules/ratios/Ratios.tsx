import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { computePlCalc, fmt, pct, monthIdx } from '@/lib/calc'
import { computeBilan } from '@/lib/bilan'
import { SIG } from '@/lib/structure'

interface RatioCardProps {
  label: string; value: string; icon: string
  sub?: string; color?: string; status?: 'good' | 'warn' | 'bad'
}

function RatioCard({ label, value, icon, sub, color = '#3b82f6', status }: RatioCardProps) {
  const statusColor = status === 'good' ? '#10b981' : status === 'bad' ? '#ef4444' : status === 'warn' ? '#f59e0b' : color
  return (
    <div style={{ background:'#0f172a', borderRadius:12, padding:'16px', border:'1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize:20, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:11, color:'#475569', fontWeight:600, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, fontFamily:'monospace', color:statusColor, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#334155' }}>{sub}</div>}
    </div>
  )
}

export function Ratios() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const budData = useAppStore(s => s.budData)

  const selectedMs = useMemo(() => {
    const allMonths = [...new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? [])])].sort()
    if (!filters.startM || !filters.endM) return RAW?.mn ?? []
    return allMonths.filter(m => monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM))
  }, [RAW?.mn?.join(','), RAW?.m1?.join(','), filters.startM, filters.endM])

  const msSrc = useMemo(() =>
    selectedMs.map(m => (RAW?.mn ?? []).includes(m) ? 'pn' as const : 'p1' as const),
    [selectedMs, RAW?.mn?.join(',')]
  )

  const allMsN1Same = useMemo(() =>
    selectedMs.map(m => `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`).filter(m => (RAW?.m1 ?? []).includes(m)),
    [selectedMs, RAW?.m1?.join(',')]
  )

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same, allMsN1Same.map(() => 'p1' as const), budData as any, SIG, filters.excludeOD)
  }, [RAW, filters.selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  const bilan = useMemo(() => {
    if (!RAW || !filters.selCo.length) return null
    return computeBilan(RAW, filters.selCo)
  }, [RAW, filters.selCo.join(',')])

  if (!RAW || !bilan) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      Aucune donnée. Importez un fichier FEC.
    </div>
  )

  const ca   = plCalc['ca']?.cumulN ?? 0
  const va   = plCalc['va']?.cumulN ?? 0
  const ebe  = plCalc['ebe']?.cumulN ?? 0
  const re   = plCalc['re']?.cumulN ?? 0
  const rnet = plCalc['rnet']?.cumulN ?? 0
  const { n } = bilan

  const tauxVA   = ca > 0 ? va / ca : 0
  const tauxEBE  = ca > 0 ? ebe / ca : 0
  const tauxRnet = ca > 0 ? rnet / ca : 0
  const bfr      = n.stocks + n.clients - n.fournisseurs
  const ratioDet = n.capitaux > 0 ? n.detteFin / n.capitaux : 0

  const nbMonths = selectedMs.length || 12
  const caMensuel = ca / nbMonths

  const ratios = [
    { label:'Chiffre d\'affaires',  value:`${fmt(ca)} €`,       icon:'💰', sub:`${fmt(caMensuel)} €/mois`, color:'#10b981' },
    { label:'Taux de valeur ajoutée', value:pct(tauxVA),          icon:'⚙️',  sub:`VA = ${fmt(va)} €`,       color:'#3b82f6',
      status: tauxVA > 0.3 ? 'good' as const : tauxVA > 0.15 ? 'warn' as const : 'bad' as const },
    { label:'Taux d\'EBE',          value:pct(tauxEBE),          icon:'📊', sub:`EBE = ${fmt(ebe)} €`,      color:'#f59e0b',
      status: tauxEBE > 0.1 ? 'good' as const : tauxEBE > 0.05 ? 'warn' as const : 'bad' as const },
    { label:'Résultat exploitation', value:`${fmt(re)} €`,        icon:'🎯', color: re >= 0 ? '#10b981' : '#ef4444',
      status: re >= 0 ? 'good' as const : 'bad' as const },
    { label:'Rentabilité nette',    value:pct(tauxRnet),         icon:'📈', sub:`RN = ${fmt(rnet)} €`,      color: rnet >= 0 ? '#10b981' : '#ef4444',
      status: rnet >= 0 ? 'good' as const : 'bad' as const },
    { label:'BFR',                  value:`${fmt(bfr)} €`,        icon:'🔄', sub:'Stocks + Clients - Fourn.',
      color: bfr < 0 ? '#10b981' : '#f97316', status: bfr < 0 ? 'good' as const : bfr < ca * 0.1 ? 'warn' as const : 'bad' as const },
    { label:'Trésorerie nette',     value:`${fmt(n.tresoActif)} €`, icon:'💧', color:'#14b8a6' },
    { label:'Levier financier',     value:ratioDet.toFixed(2) + 'x', icon:'⚖️', sub:'Dettes / Capitaux propres',
      color:'#8b5cf6', status: ratioDet < 1 ? 'good' as const : ratioDet < 2 ? 'warn' as const : 'bad' as const },
    { label:'Capitaux propres',     value:`${fmt(n.capitaux)} €`, icon:'🏦', color:'#10b981' },
  ]

  return (
    <div style={{ padding:'20px 24px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
        {ratios.map((r, i) => <RatioCard key={i} {...r} />)}
      </div>

      <div style={{ marginTop:24, padding:16, borderRadius:12, background:'#0f172a', border:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Légende</div>
        <div style={{ display:'flex', gap:16, fontSize:11, color:'#475569' }}>
          <span><span style={{ color:'#10b981' }}>●</span> Bon</span>
          <span><span style={{ color:'#f59e0b' }}>●</span> À surveiller</span>
          <span><span style={{ color:'#ef4444' }}>●</span> Attention</span>
        </div>
      </div>
    </div>
  )
}
