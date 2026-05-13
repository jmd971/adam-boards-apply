import React, { useState, useMemo } from 'react'
import { useAppStore } from '@/store'
import { ChoixSource } from './ChoixSource'
import { SegmentsView } from './SegmentsView'
import { CampagnesView } from './CampagnesView'
import { ArticlesView } from './ArticlesView'
import { ScenariosView } from './ScenariosView'
import { ImportWizard } from './ImportWizard'
import { computeRFM, manualEntriesToTransactions, type SaleTransaction } from '@/lib/rfm'

type Source = 'factures' | 'pos'
type SubTab = 'segments' | 'articles' | 'campagnes' | 'scenarios'

export function Ventes() {
  const manualEntries = useAppStore(s => s.manualEntries)
  const filters       = useAppStore(s => s.filters)
  const selCo         = filters.selCo

  // Pas de persistance entre visites : on repart sur le chooser à chaque entrée
  // sur l'onglet. Le state POS étant local au composant, le persister seul forcerait
  // l'utilisateur sur une vue vide "Aucun fichier importé".
  const [source,     setSource]     = useState<Source | null>(null)
  const [subTab,     setSubTab]     = useState<SubTab>('segments')
  const [posTxs,     setPosTxs]     = useState<SaleTransaction[]>([])
  const [showImport, setShowImport] = useState(false)

  const handleSelectSource = (s: Source) => {
    setSource(s)
    if (s === 'pos') setShowImport(true)
  }

  const handleImport = (txs: SaleTransaction[]) => {
    setPosTxs(txs)
    setShowImport(false)
  }

  const transactions = useMemo<SaleTransaction[]>(() => {
    if (source === 'factures') return manualEntriesToTransactions(manualEntries, selCo)
    if (source === 'pos')      return posTxs
    return []
  }, [source, manualEntries, selCo, posTxs])

  const clients = useMemo(() => computeRFM(transactions), [transactions])

  // Écran de choix de source
  if (!source) return <ChoixSource onSelect={handleSelectSource} />

  // Import POS en cours
  if (source === 'pos' && showImport) {
    return (
      <ImportWizard
        onImport={handleImport}
        onCancel={() => { setShowImport(false); if (!posTxs.length) setSource(null) }}
      />
    )
  }

  const sourceBadge = source === 'factures'
    ? { icon: '📄', label: 'Factures saisies' }
    : { icon: '🛒', label: `Fichier POS · ${posTxs.length} lignes` }

  const tabSt = (on: boolean): React.CSSProperties => ({
    flex:1, padding:'8px 16px', border:'none', cursor:'pointer',
    borderRadius:'var(--radius-sm)', fontSize:12, fontWeight:600,
    background: on ? 'rgba(59,130,246,0.18)' : 'transparent',
    color:      on ? '#93c5fd' : 'var(--text-2)',
    boxShadow:  on ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'none',
  })

  return (
    <>
      {/* Barre d'outils */}
      <div style={{
        display:'flex', alignItems:'center', gap:12, padding:'14px 24px 12px',
        background:'var(--bg-0)', position:'sticky', top:54, zIndex:9,
        borderBottom:'1px solid var(--border-0)',
      }}>
        <button onClick={() => setSubTab('segments')}  style={tabSt(subTab === 'segments')}>📊 Segments clients</button>
        <button onClick={() => setSubTab('articles')}  style={tabSt(subTab === 'articles')}>📦 Articles</button>
        <button onClick={() => setSubTab('campagnes')} style={tabSt(subTab === 'campagnes')}>🎯 Campagnes GHL</button>
        <button onClick={() => setSubTab('scenarios')} style={tabSt(subTab === 'scenarios')}>🎬 Scénarios</button>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{
            fontSize:10, padding:'4px 10px', borderRadius:12,
            background:'rgba(255,255,255,0.06)', color:'var(--text-2)',
            border:'1px solid var(--border-1)',
          }}>
            {sourceBadge.icon} {sourceBadge.label}
          </span>
          {source === 'pos' && (
            <button
              onClick={() => setShowImport(true)}
              style={{
                padding:'4px 12px', borderRadius:8, border:'1px solid var(--border-1)',
                background:'transparent', color:'var(--text-2)', fontSize:11, cursor:'pointer',
              }}
            >
              ↻ Ré-importer
            </button>
          )}
          <button
            onClick={() => { setSource(null); setPosTxs([]) }}
            style={{
              padding:'4px 12px', borderRadius:8, border:'1px solid var(--border-1)',
              background:'transparent', color:'var(--text-2)', fontSize:11, cursor:'pointer',
            }}
          >
            ⚙ Changer de source
          </button>
        </div>
      </div>

      {/* État vide — Factures */}
      {source === 'factures' && transactions.length === 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:320, gap:12 }}>
          <span style={{ fontSize:40 }}>📄</span>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)' }}>Aucune facture de vente trouvée</div>
          <div style={{ fontSize:11, color:'var(--text-3)', maxWidth:360, textAlign:'center', lineHeight:1.7 }}>
            Saisissez des factures dans le module <strong style={{ color:'var(--blue)' }}>Saisie</strong> avec
            la catégorie "Vente" et renseignez le nom du client dans le champ "Contrepartie".
          </div>
        </div>
      )}

      {/* État vide — POS */}
      {source === 'pos' && transactions.length === 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:320, gap:12 }}>
          <span style={{ fontSize:40 }}>🛒</span>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1)' }}>Aucun fichier importé</div>
          <button
            onClick={() => setShowImport(true)}
            style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', background:'var(--blue)', color:'#fff', fontSize:12, fontWeight:600, marginTop:8 }}
          >
            Importer un fichier POS
          </button>
        </div>
      )}

      {/* Contenu principal */}
      {transactions.length > 0 && (
        <>
          {subTab === 'segments'  && <SegmentsView  clients={clients} />}
          {subTab === 'articles'  && <ArticlesView  transactions={transactions} />}
          {subTab === 'campagnes' && <CampagnesView clients={clients} />}
          {subTab === 'scenarios' && <ScenariosView clients={clients} />}
        </>
      )}
    </>
  )
}
