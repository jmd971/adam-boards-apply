import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { computePlCalc, fmt, pct } from '@/lib/calc'
import { computeBilan } from '@/lib/bilan'
import { SIG } from '@/lib/structure'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { exportRatiosXlsx, exportRatiosCsv, printModule } from '@/lib/export'
import { ExportBar, ExplainModal } from '@/components/ui'
import type { Explanation } from '@/components/ui'
import { evalThreshold, formatThresholdValue } from '@/lib/alertThresholds'

// ── Explanation data ────────────────────────────────────────────────────────

const EXPLANATIONS: Record<string, Explanation> = {
  ca: {
    title: "Chiffre d'affaires (CA)",
    definition: "Montant total des ventes de biens et services réalisées sur la période sélectionnée. C'est l'indicateur de taille et d'activité commerciale de l'entreprise.",
    formula: "Comptes 70x (ventes de produits, marchandises et prestations)",
    reading: [
      { label: "En croissance vs N-1 : dynamique commerciale positive", color: "#10b981" },
      { label: "Stable : activité maintenue, surveiller la marge", color: "#f59e0b" },
      { label: "En baisse : analyser la cause (marché, clients, gamme)", color: "#ef4444" },
    ],
    tip: "Comparez toujours le CA à la même période N-1 pour éliminer la saisonnalité.",
  },
  txVA: {
    title: "Taux de Valeur Ajoutée",
    definition: "Part du chiffre d'affaires qui reste après déduction des consommations intermédiaires (achats de matières, sous-traitance, services externes). Mesure la contribution propre de l'entreprise à la production de richesse.",
    formula: "VA / CA × 100\nVA = CA − Achats et charges externes",
    reading: [
      { label: "> 35 % : excellent — forte valeur ajoutée (services, conseil)", color: "#10b981" },
      { label: "25–35 % : correct — industrie manufacturière typique", color: "#f59e0b" },
      { label: "< 25 % : faible — commerce, distribution, sous-traitance intensive", color: "#ef4444" },
    ],
    tip: "Repères : Services ~55–70 % · Industrie ~30–40 % · Commerce ~15–25 %",
  },
  txEbe: {
    title: "Taux d'EBE (Marge EBITDA)",
    definition: "L'Excédent Brut d'Exploitation mesure la rentabilité opérationnelle brute, avant amortissements, provisions, charges et produits financiers, et impôt sur les sociétés. C'est le cash généré par l'exploitation.",
    formula: "EBE / CA × 100\nEBE = VA − Charges de personnel − Impôts & taxes",
    reading: [
      { label: "> 15 % : excellent — très bonne rentabilité opérationnelle", color: "#10b981" },
      { label: "8–15 % : correct — entreprise saine et profitable", color: "#f59e0b" },
      { label: "< 8 % : à surveiller — marges tendues, peu de marge de sécurité", color: "#ef4444" },
    ],
    tip: "L'EBE est souvent utilisé pour calculer la capacité de remboursement de la dette (Dettes / EBE).",
  },
  re: {
    title: "Résultat d'Exploitation (REX)",
    definition: "Bénéfice ou perte généré par l'activité principale de l'entreprise, après déduction des amortissements et provisions, mais avant les charges financières et l'impôt sur les sociétés.",
    formula: "EBE + Reprises − Dotations aux amortissements et provisions\n+ Autres produits d'exploitation\n− Autres charges d'exploitation",
    reading: [
      { label: "Positif : l'activité couvre ses coûts et génère un profit", color: "#10b981" },
      { label: "Proche de zéro : équilibre fragile, surveiller de près", color: "#f59e0b" },
      { label: "Négatif : perte opérationnelle — plan d'action nécessaire", color: "#ef4444" },
    ],
    tip: "Un REX positif mais un résultat net négatif signale des charges financières importantes.",
  },
  rnet: {
    title: "Rentabilité Nette",
    definition: "Part du chiffre d'affaires transformée en bénéfice net après toutes les charges (exploitation, financières, exceptionnelles) et l'impôt sur les sociétés. Indicateur final de la performance globale.",
    formula: "Résultat Net / CA × 100\nRésultat Net = REX ± Charges/Produits financiers ± Résultat exceptionnel − IS",
    reading: [
      { label: "> 5 % : excellent — très rentable", color: "#10b981" },
      { label: "2–5 % : correct — performance standard", color: "#f59e0b" },
      { label: "< 2 % : faible — peu de marge de sécurité", color: "#ef4444" },
    ],
    tip: "Repères sectoriels : Grande distribution ~1–2 % · Services ~8–15 % · Tech/SaaS ~15–30 %",
  },
  bfr: {
    title: "Besoin en Fonds de Roulement (BFR)",
    definition: "Besoin de trésorerie lié au cycle d'exploitation : délai entre le paiement des fournisseurs et l'encaissement des clients. Un BFR positif doit être financé ; un BFR négatif est une ressource (modèle grande distribution).",
    formula: "BFR = Stocks + Créances clients − Dettes fournisseurs\nBFR en jours = BFR / CA annualisé × 365",
    reading: [
      { label: "< 30 jours : excellent — cycle court, peu de financement requis", color: "#10b981" },
      { label: "30–60 jours : normal — surveiller l'évolution", color: "#f59e0b" },
      { label: "> 60 jours ou croissance rapide : risque de tension trésorerie", color: "#ef4444" },
    ],
    tip: "Réduire le BFR : négocier délais fournisseurs, accélérer encaissements clients, optimiser les stocks.",
  },
  treso: {
    title: "Trésorerie Nette",
    definition: "Solde total des disponibilités : comptes bancaires, caisses et valeurs mobilières de placement. Représente la liquidité immédiate de l'entreprise.",
    formula: "Comptes 50x (VMP) + 51x (banques) + 514 (CCP) + 515 (caisse)\nTrésorerie nette = Fonds de Roulement − BFR",
    reading: [
      { label: "Positive et croissante : bonne santé financière", color: "#10b981" },
      { label: "Positive mais décroissante : surveiller la tendance", color: "#f59e0b" },
      { label: "Négative : recours aux concours bancaires — risque de défaut", color: "#ef4444" },
    ],
    tip: "Visez un coussin de trésorerie couvrant 2 à 3 mois de charges fixes.",
  },
  levier: {
    title: "Levier Financier",
    definition: "Rapport entre les dettes financières à moyen et long terme et les capitaux propres. Mesure le niveau d'endettement structurel et la solidité du bilan. Un fort levier amplifie les gains comme les pertes.",
    formula: "Levier = Dettes financières (16x–17x) / Capitaux propres (10x–15x)",
    reading: [
      { label: "< 1× : sain — endettement maîtrisé", color: "#10b981" },
      { label: "1–2× : modéré — acceptable selon la rentabilité", color: "#f59e0b" },
      { label: "> 2× : fort — surveiller la capacité de remboursement", color: "#ef4444" },
    ],
    tip: "La capacité de remboursement se mesure aussi par Dettes / EBE (idéalement < 3–4 ans).",
  },
  cp: {
    title: "Capitaux Propres",
    definition: "Ressources appartenant aux actionnaires et associés : capital social, réserves accumulées et résultat de l'exercice. Représente la valeur comptable nette de l'entreprise et sa solidité financière.",
    formula: "Comptes 10x–15x\n= Capital + Primes + Réserves + Report à nouveau + Résultat",
    reading: [
      { label: "CP / Total Passif > 30 % : bilan solide", color: "#10b981" },
      { label: "CP / Total Passif 15–30 % : structure correcte", color: "#f59e0b" },
      { label: "CP négatifs ou < 15 % : fragilité — risque de fonds propres insuffisants", color: "#ef4444" },
    ],
    tip: "Des capitaux propres négatifs (situation nette négative) peuvent entraîner des obligations légales de recapitalisation.",
  },
}

// ── RatioCard ───────────────────────────────────────────────────────────────

interface RatioCardProps {
  label: string; value: string; icon: string
  sub?: string; color?: string; status?: 'good' | 'warn' | 'bad'
  explKey?: string
  onInfo?: () => void
}

function RatioCard({ label, value, icon, sub, color = '#3b82f6', status, onInfo }: RatioCardProps) {
  const statusColor = status === 'good' ? '#10b981' : status === 'bad' ? '#ef4444' : status === 'warn' ? '#f59e0b' : color
  return (
    <div style={{ background:'#0f172a', borderRadius:12, padding:'16px', border:'1px solid rgba(255,255,255,0.06)', position:'relative' }}>
      {/* Info button */}
      {onInfo && (
        <button
          onClick={onInfo}
          title="Voir l'explication"
          className="print-hide"
          style={{ position:'absolute', top:10, right:10, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:6, width:22, height:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#475569', lineHeight:1, transition:'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#93c5fd' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}
        >ℹ</button>
      )}
      <div style={{ fontSize:20, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:11, color:'#475569', fontWeight:600, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, fontFamily:'monospace', color:statusColor, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#334155' }}>{sub}</div>}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function Ratios() {
  const printRef = useRef<HTMLDivElement>(null)
  const budData = useAppStore(s => s.budData)
  const alertThresholds = useAppStore(s => s.alertThresholds)
  const setThresholds = useAppStore(s => s.setAlertThresholds)
  const [showConfig, setShowConfig] = useState(false)
  const [activeExpl, setActiveExpl] = useState<string | null>(null)

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

  const nbMonths  = selectedMs.length || 12
  const caMensuel = ca / nbMonths
  const bfrJours  = ca > 0 ? (bfr / ca) * 365 * (nbMonths / 12) : 0

  const ev = (id: string, value: number): 'good' | 'warn' | 'bad' => {
    const t = alertThresholds.find(t => t.id === id)
    return t ? evalThreshold(value, t) : 'good'
  }
  const thSub = (id: string): string => {
    const t = alertThresholds.find(t => t.id === id)
    if (!t) return ''
    return `Seuils : ${formatThresholdValue(t.warn, t.unit)} / ${formatThresholdValue(t.bad, t.unit)}`
  }

  const ratios: (RatioCardProps & { explKey: string })[] = [
    { label:"Chiffre d'affaires",    value:`${fmt(ca)} €`,           icon:'💰', sub:`${fmt(caMensuel)} €/mois`,                              color:'#10b981', explKey:'ca'     },
    { label:'Taux de valeur ajoutée',value:pct(tauxVA),              icon:'⚙️',  sub:`VA = ${fmt(va)} € · ${thSub('txVA')}`,                  color:'#3b82f6', explKey:'txVA',  status: ev('txVA', tauxVA * 100)    },
    { label:"Taux d'EBE",           value:pct(tauxEBE),              icon:'📊', sub:`EBE = ${fmt(ebe)} € · ${thSub('txEbe')}`,                color:'#f59e0b', explKey:'txEbe', status: ev('txEbe', tauxEBE * 100)  },
    { label:'Résultat exploitation', value:`${fmt(re)} €`,           icon:'🎯', sub:thSub('txRnet'),                                          color: re >= 0 ? '#10b981' : '#ef4444', explKey:'re', status: ev('txRnet', ca > 0 ? (re / ca) * 100 : 0) },
    { label:'Rentabilité nette',     value:pct(tauxRnet),            icon:'📈', sub:`RN = ${fmt(rnet)} € · ${thSub('txRnet')}`,              color: rnet >= 0 ? '#10b981' : '#ef4444', explKey:'rnet', status: ev('txRnet', tauxRnet * 100) },
    { label:'BFR',                   value:`${fmt(bfr)} €`,           icon:'🔄', sub:`${Math.round(bfrJours)} jours de CA · ${thSub('bfrJours')}`, color: bfr < 0 ? '#10b981' : '#f97316', explKey:'bfr', status: ev('bfrJours', bfrJours) },
    { label:'Trésorerie nette',      value:`${fmt(n.tresoActif)} €`,  icon:'💧', color:'#14b8a6', explKey:'treso' },
    { label:'Levier financier',      value:ratioDet.toFixed(2) + 'x', icon:'⚖️', sub:`Dettes / CP · ${thSub('levier')}`,                    color:'#8b5cf6', explKey:'levier', status: ev('levier', ratioDet) },
    { label:'Capitaux propres',      value:`${fmt(n.capitaux)} €`,    icon:'🏦', color:'#10b981', explKey:'cp' },
  ]

  const [draft, setDraft] = useState(alertThresholds)
  const draftDirty = JSON.stringify(draft) !== JSON.stringify(alertThresholds)

  const updateTh = (id: string, field: 'warn' | 'bad', value: string) => {
    const v = parseFloat(value)
    if (isNaN(v)) return
    setDraft(prev => prev.map(t => t.id === id ? { ...t, [field]: v } : t))
  }

  const applyThresholds = () => { setThresholds(draft); setShowConfig(false) }
  const resetDraft = () => setDraft(alertThresholds)

  const inputSt: React.CSSProperties = {
    width: 58, padding: '3px 5px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1', textAlign: 'right', outline: 'none',
  }

  const currentExpl = activeExpl ? EXPLANATIONS[activeExpl] : null

  return (
    <div ref={printRef} className="module-ratios" style={{ padding:'20px 24px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 4 }}>
        <ExportBar
          onPdf={() => printModule(printRef, 'module-print')}
          onExcel={() => exportRatiosXlsx('Ratios', ratios.map(r => ({ label: r.label, value: r.value, sub: r.sub, status: r.status })))}
          onCsv={() => exportRatiosCsv('Ratios', ratios.map(r => ({ label: r.label, value: r.value, sub: r.sub, status: r.status })))}
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
            {draft.map(t => (
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
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10 }}>
            <button onClick={applyThresholds} disabled={!draftDirty} style={{
              padding:'7px 20px', borderRadius:8, fontSize:12, fontWeight:600, cursor: draftDirty ? 'pointer' : 'not-allowed',
              background: draftDirty ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'rgba(255,255,255,0.05)',
              border:'none', color: draftDirty ? '#fff' : '#475569', opacity: draftDirty ? 1 : 0.5,
            }}>Valider</button>
            <button onClick={resetDraft} disabled={!draftDirty} style={{
              padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:500, cursor: draftDirty ? 'pointer' : 'not-allowed',
              background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color: draftDirty ? '#94a3b8' : '#334155',
            }}>Annuler</button>
            <span style={{ fontSize:10, color:'#334155' }}>W = alerte (orange) · C = critique (rouge)</span>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
        {ratios.map((r, i) => (
          <RatioCard
            key={i} {...r}
            onInfo={EXPLANATIONS[r.explKey] ? () => setActiveExpl(r.explKey) : undefined}
          />
        ))}
      </div>

      <div style={{ marginTop:24, padding:16, borderRadius:12, background:'#0f172a', border:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Légende</div>
        <div style={{ display:'flex', gap:16, fontSize:11, color:'#475569' }}>
          <span><span style={{ color:'#10b981' }}>●</span> Bon</span>
          <span><span style={{ color:'#f59e0b' }}>●</span> À surveiller</span>
          <span><span style={{ color:'#ef4444' }}>●</span> Attention</span>
          <span style={{ marginLeft:8, color:'#334155' }}>ℹ Cliquez sur l'icône d'info pour l'explication du ratio</span>
        </div>
      </div>

      {/* Explanation modal */}
      {currentExpl && <ExplainModal expl={currentExpl} onClose={() => setActiveExpl(null)} />}
    </div>
  )
}
