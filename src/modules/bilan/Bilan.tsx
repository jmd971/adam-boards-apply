import { useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { computeBilan } from '@/lib/bilan'
import { fmt } from '@/lib/calc'
import { KpiCard, ExportBar } from '@/components/ui'
import { exportBilanXlsx, printModule } from '@/lib/export'

export function Bilan() {
  const printRef = useRef<HTMLDivElement>(null)
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const bilan = useMemo(() => {
    if (!RAW || !filters.selCo.length) return null
    return computeBilan(RAW, filters.selCo)
  }, [RAW, filters.selCo.join(',')])

  if (!RAW || !bilan) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      Aucune donnée. Importez un fichier FEC depuis l'onglet Import.
    </div>
  )

  const { n } = bilan

  const Row = ({ label, value, bold, color, indent: _indent }: { label: string; value: number; bold?: boolean; color?: string; indent?: boolean }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding: bold ? '8px 12px' : '5px 24px',
      background: bold ? 'rgba(255,255,255,0.03)' : 'transparent',
      borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize: bold ? 12 : 11, fontWeight: bold ? 700 : 400, color: color || (bold ? '#f1f5f9' : '#94a3b8') }}>{label}</span>
      <span style={{ fontSize: bold ? 13 : 11, fontWeight: bold ? 700 : 500, fontFamily: 'monospace', color: color || (bold ? '#f1f5f9' : '#cbd5e1') }}>{fmt(value)} €</span>
    </div>
  )

  const Section = ({ title, color, children }: { title: string; color: string; children: React.ReactNode }) => (
    <div style={{ borderRadius: 12, overflow:'hidden', border:'1px solid rgba(255,255,255,0.06)', background:'#0f172a' }}>
      <div style={{ padding:'10px 12px', background:`${color}15`, borderBottom:`1px solid ${color}30` }}>
        <span style={{ fontSize:11, fontWeight:700, color, letterSpacing:'0.8px', textTransform:'uppercase' }}>{title}</span>
      </div>
      {children}
    </div>
  )

  return (
    <div ref={printRef} className="module-bilan" style={{ padding:'20px 24px', maxWidth:900 }}>
      <ExportBar
        onPdf={() => printModule(printRef, 'module-print')}
        onExcel={() => exportBilanXlsx('Bilan', n)}
      />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24, marginTop:12 }}>
        <KpiCard label="Total Actif"        value={`${fmt(n.totalActif)} €`}  color="#3b82f6" />
        <KpiCard label="Capitaux propres"   value={`${fmt(n.capitaux)} €`}    color="#10b981" />
        <KpiCard label="Dettes financières" value={`${fmt(n.detteFin)} €`}    color="#f97316" />
        <KpiCard label="Trésorerie"         value={`${fmt(n.tresoActif)} €`}  color="#14b8a6" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Section title="Actif" color="#3b82f6">
          <Row label="Immobilisations nettes"  value={n.immos}       indent />
          <Row label="Stocks"                  value={n.stocks}      indent />
          <Row label="Créances clients"        value={n.clients}     indent />
          <Row label="Trésorerie"              value={n.tresoActif}  indent />
          {n.autresActif > 0 && <Row label="Autres actifs" value={n.autresActif} indent />}
          <Row label="TOTAL ACTIF"             value={n.totalActif}  bold color="#3b82f6" />
        </Section>

        <Section title="Passif" color="#8b5cf6">
          <Row label="Capitaux propres"         value={n.capitaux}      indent />
          <Row label="Dettes financières"       value={n.detteFin}      indent />
          <Row label="Fournisseurs"             value={n.fournisseurs}  indent />
          <Row label="Dettes fisc. & sociales"  value={n.dettesFisc}    indent />
          {n.autresPassif > 0 && <Row label="Autres passifs" value={n.autresPassif} indent />}
          <Row label="TOTAL PASSIF"             value={n.totalPassif}   bold color="#8b5cf6" />
        </Section>
      </div>

      {n.fournTop.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>Top fournisseurs</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:8 }}>
            {n.fournTop.map(([label, val]) => (
              <div key={label} style={{ padding:'8px 12px', borderRadius:8, background:'#0f172a', border:'1px solid rgba(255,255,255,0.05)', display:'flex', justifyContent:'space-between', gap:8 }}>
                <span style={{ fontSize:11, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
                <span style={{ fontSize:11, fontFamily:'monospace', color:'#f97316', flexShrink:0 }}>{fmt(val)} €</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
