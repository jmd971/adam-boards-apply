import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { computePlCalc, fmt, pct } from '@/lib/calc'
import { computeBilan } from '@/lib/bilan'
import { SIG } from '@/lib/structure'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { exportRatiosXlsx, printModule } from '@/lib/export'
import { ExportBar } from '@/components/ui'
import { evalThreshold, formatThresholdValue } from '@/lib/alertThresholds'

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
  const printRef = useRef<HTMLDivElement>(null)
  const budData = useAppStore(s => s.budData)
  const alertThresholds = useAppStore(s => s.alertThresholds)
  const setThresholds = useAppStore(s => s.setAlertThresholds)
  const [showConfig, setShowConfig] = useState(false)

  const { RAW, filters, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc } = usePeriodFilter()

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc, budData as any, SIG, filters.excludeOD)
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
  const bfrJours = ca > 0 ? (bfr / ca) * 365 * (nbMonths / 12) : 0

  // Helper: evaluate a threshold by id
  const ev = (id: string, value: number): 'good' | 'warn' | 'bad' => {
    const t = alertThresholds.find(t => t.id === id)
    return t ? evalThreshold(value, t) : 'good'
  }
  const thSub = (id: string): string => {
    const t = alertThresholds.find(t => t.id === id)
    if (!t) return ''
    return `Seuils : ${formatThresholdValue(t.warn, t.unit)} / ${formatThresholdValue(t.bad, t.unit)}`
  }

  const ratios = [
    { label:'Chiffre d\'affaires',    value:`${fmt(ca)} €`,        icon:'💰', sub:`${fmt(caMensuel)} €/mois`, color:'#10b981' },
    { label:'Taux de valeur ajoutée', value:pct(tauxVA),            icon:'⚙️',  sub:`VA = ${fmt(va)} € · ${thSub('txVA')}`,       color:'#3b82f6',
      status: ev('txVA', tauxVA * 100) },
    { label:'Taux d\'EBE',           value:pct(tauxEBE),            icon:'📊', sub:`EBE = ${fmt(ebe)} € · ${thSub('txEbe')}`,      color:'#f59e0b',
      status: ev('txEbe', tauxEBE * 100) },
    { label:'Résultat exploitation',  value:`${fmt(re)} €`,          icon:'🎯', sub: thSub('txRnet'),
      color: re >= 0 ? '#10b981' : '#ef4444', status: ev('txRnet', ca > 0 ? (re / ca) * 100 : 0) },
    { label:'Rentabilité nette',      value:pct(tauxRnet),           icon:'📈', sub:`RN = ${fmt(rnet)} € · ${thSub('txRnet')}`,
      color: rnet >= 0 ? '#10b981' : '#ef4444', status: ev('txRnet', tauxRnet * 100) },
    { label:'BFR',                    value:`${fmt(bfr)} €`,          icon:'🔄', sub:`${Math.round(bfrJours)} jours de CA · ${thSub('bfrJours')}`,
      color: bfr < 0 ? '#10b981' : '#f97316', status: ev('bfrJours', bfrJours) },
    { label:'Trésorerie nette',       value:`${fmt(n.tresoActif)} €`, icon:'💧', color:'#14b8a6' },
    { label:'Levier financier',       value:ratioDet.toFixed(2) + 'x', icon:'⚖️', sub:`Dettes / CP · ${thSub('levier')}`,
      color:'#8b5cf6', status: ev('levier', ratioDet) },
    { label:'Capitaux propres',       value:`${fmt(n.capitaux)} €`,   icon:'🏦', color:'#10b981' },
  ]

  const updateTh = (id: string, field: 'warn' | 'bad', value: string) => {
    const v = parseFloat(value)
    if (isNaN(v)) return
    setThresholds(alertThresholds.map(t => t.id === id ? { ...t, [field]: v } : t))
  }

  const inputSt: React.CSSProperties = {
    width: 58, padding: '3px 5px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1', textAlign: 'right', outline: 'none',
  }

  return (
    <div ref={printRef} className="module-ratios" style={{ padding:'20px 24px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 4 }}>
        <ExportBar
          onPdf={() => printModule(printRef, 'module-print')}
          onExcel={() => exportRatiosXlsx('Ratios', ratios.map(r => ({ label: r.label, value: r.value, sub: r.sub, status: r.status })))}
        />
        <button onClick={() => setShowConfig(v => !v)} className="print-hide" style={{
          padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
          background: showConfig ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
          border:'1px solid var(--border-1)', color: showConfig ? '#93c5fd' : 'var(--text-1)',
        }}>
          Seuils
        </button>
      </div>

      {/* Threshold config */}
      {showConfig && (
        <div className="print-hide" style={{
          background:'#0f172a', borderRadius:12, padding:'14px 16px', marginBottom:12,
          border:'1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>
            Seuils d'alerte personnalisés
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))', gap:6 }}>
            {alertThresholds.map(t => (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,0.02)' }}>
                <span style={{ flex:1, fontSize:11, color:'#94a3b8' }}>{t.label}</span>
                <span style={{ fontSize:9, color:'#f59e0b' }}>W</span>
                <input type="number" step={t.unit === 'x' ? '0.1' : '1'} value={t.warn} onChange={e => updateTh(t.id, 'warn', e.target.value)} style={inputSt} />
                <span style={{ fontSize:9, color:'#ef4444' }}>C</span>
                <input type="number" step={t.unit === 'x' ? '0.1' : '1'} value={t.bad} onChange={e => updateTh(t.id, 'bad', e.target.value)} style={inputSt} />
                <span style={{ fontSize:9, color:'#475569', minWidth:28 }}>{t.unit}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:6, fontSize:10, color:'#334155' }}>W = alerte (orange) · C = critique (rouge) · Les changements sont sauvegardés automatiquement</div>
        </div>
      )}

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
