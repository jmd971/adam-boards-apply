import React, { useState, useMemo } from 'react'
import { useAppStore } from '@/store'
import { ChoixSource } from './ChoixSource'
import { SegmentsView } from './SegmentsView'
import { CampagnesView } from './CampagnesView'
import { ArticlesView } from './ArticlesView'
import { ScenariosView } from './ScenariosView'
import { ImportWizard } from './ImportWizard'
import { computeRFM, manualEntriesToTransactions, diagnoseEntries, type SaleTransaction } from '@/lib/rfm'
import { fecToSaleTransactions, diagnoseFec } from '@/lib/fecSales'

type Source = 'factures' | 'pos'
type SubTab = 'segments' | 'articles' | 'campagnes' | 'scenarios'

export function Ventes() {
  const RAW           = useAppStore(s => s.RAW)
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
    if (source === 'factures') {
      // Segmentation = FEC + Saisie combinés. Un FEC et la saisie ne couvrent
      // jamais le même exercice (si un FEC existe pour l'exercice en cours,
      // l'utilisateur n'utilise pas la Saisie), donc l'union ne double-compte pas.
      const fec    = fecToSaleTransactions(RAW, selCo)
      const saisie = manualEntriesToTransactions(manualEntries, selCo)
      return [...fec, ...saisie]
    }
    if (source === 'pos') return posTxs
    return []
  }, [source, RAW, manualEntries, selCo, posTxs])

  const clients = useMemo(() => computeRFM(transactions), [transactions])

  const diagFec    = useMemo(() => diagnoseFec(RAW, selCo),             [RAW, selCo])
  const diagSaisie = useMemo(() => diagnoseEntries(manualEntries, selCo), [manualEntries, selCo])

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

  const fecClients = diagFec.clientsN + diagFec.clientsN1
  const sourceBadge = source === 'factures'
    ? { icon: '📄', label: `FEC ${fecClients} client${fecClients > 1 ? 's' : ''} · Saisie ${diagSaisie.eligibles}` }
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

      {/* État vide — Factures (diagnostic FEC + Saisie) */}
      {source === 'factures' && transactions.length === 0 && (
        <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 40 }}>📄</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
            Aucune facture exploitable
          </div>

          {/* Diagnostic FEC */}
          <div style={{
            width: '100%', maxWidth: 520,
            background: 'var(--bg-1)', borderRadius: 12, border: '1px solid var(--border-1)',
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
              Source 1 — FEC (extraction automatique)
            </div>
            {[
              { label: 'Sociétés analysées',                  value: diagFec.companies,     color: 'var(--text-1)' },
              { label: 'Clients identifiés (N)',              value: diagFec.clientsN,      color: diagFec.clientsN  > 0 ? 'var(--green)' : 'var(--text-3)' },
              { label: 'Clients identifiés (N-1)',            value: diagFec.clientsN1,     color: diagFec.clientsN1 > 0 ? 'var(--green)' : 'var(--text-3)' },
              { label: 'Factures comptées',                   value: diagFec.totalFactures, color: 'var(--text-1)' },
              { label: 'Transactions FEC extraites',          value: diagFec.transactions,  color: diagFec.transactions > 0 ? 'var(--green)' : 'var(--red)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 12 }}>
                <span style={{ color: 'var(--text-2)' }}>{label}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Diagnostic Saisie (fallback) */}
          <div style={{
            width: '100%', maxWidth: 520,
            background: 'var(--bg-1)', borderRadius: 12, border: '1px solid var(--border-1)',
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
              Source 2 — Saisie manuelle
            </div>
            {[
              { label: 'Entrées de saisie au total',         value: diagSaisie.total,         color: 'var(--text-1)' },
              { label: 'Catégorie "Vente"',                  value: diagSaisie.ventes,        color: 'var(--text-1)' },
              { label: 'Vente sur sociétés sélectionnées',   value: diagSaisie.ventesCo,      color: 'var(--text-1)' },
              { label: 'Sans contrepartie (à compléter)',    value: diagSaisie.ventesSansCp,  color: diagSaisie.ventesSansCp > 0 ? 'var(--amber)' : 'var(--text-3)' },
              { label: 'Éligibles (Saisie)',                 value: diagSaisie.eligibles,     color: diagSaisie.eligibles > 0 ? 'var(--green)' : 'var(--red)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 12 }}>
                <span style={{ color: 'var(--text-2)' }}>{label}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Aide contextuelle */}
          <div style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 520, textAlign: 'center', lineHeight: 1.7 }}>
            {diagFec.clientsN === 0 && diagFec.clientsN1 === 0 ? (
              <>Aucun client identifié dans le FEC. Si votre FEC utilise un compte 411 avec code client en CompAux, <strong style={{ color: 'var(--blue)' }}>ré-importez-le</strong> via le module Import — le parser a été mis à jour pour extraire les clients automatiquement.</>
            ) : diagSaisie.ventesSansCp > 0 ? (
              <>Le FEC ne donne rien et {diagSaisie.ventesSansCp} vente{diagSaisie.ventesSansCp > 1 ? 's' : ''} en Saisie {diagSaisie.ventesSansCp > 1 ? "n'ont" : "n'a"} pas de contrepartie. Soit ré-importez le FEC, soit complétez les contreparties dans <strong style={{ color: 'var(--blue)' }}>Saisie</strong>.</>
            ) : (
              <>Aucune donnée client n'est exploitable. Ré-importez un FEC contenant des comptes 411 avec CompAux, ou ajoutez des factures dans <strong style={{ color: 'var(--blue)' }}>Saisie</strong>.</>
            )}
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
