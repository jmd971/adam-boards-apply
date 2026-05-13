import React, { useState, useMemo } from 'react'
import { useAppStore } from '@/store'
import { ChoixSource } from './ChoixSource'
import { SegmentsView } from './SegmentsView'
import { CampagnesView } from './CampagnesView'
import { ArticlesView } from './ArticlesView'
import { ScenariosView } from './ScenariosView'
import { ImportWizard } from './ImportWizard'
import { computeRFM, type SaleTransaction } from '@/lib/rfm'
import { fecToSaleTransactions, diagnoseFec } from '@/lib/fecSales'

type Source = 'factures' | 'pos'
type SubTab = 'segments' | 'articles' | 'campagnes' | 'scenarios'

export function Ventes() {
  const RAW           = useAppStore(s => s.RAW)
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
    if (source === 'factures') return fecToSaleTransactions(RAW, selCo)
    if (source === 'pos')      return posTxs
    return []
  }, [source, RAW, selCo, posTxs])

  const clients = useMemo(() => computeRFM(transactions), [transactions])

  const diag = useMemo(
    () => diagnoseFec(RAW, selCo),
    [RAW, selCo]
  )

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

      {/* État vide — Factures (diagnostic FEC) */}
      {source === 'factures' && transactions.length === 0 && (
        <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 40 }}>📄</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
            Aucune facture exploitable dans le FEC
          </div>

          {/* Tableau de diagnostic */}
          <div style={{
            width: '100%', maxWidth: 520,
            background: 'var(--bg-1)', borderRadius: 12, border: '1px solid var(--border-1)',
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
              Diagnostic — extraction depuis le FEC
            </div>
            {[
              { label: 'Sociétés analysées',                  value: diag.companies,         color: 'var(--text-1)' },
              { label: 'Comptes 411xxx (clients) trouvés',    value: diag.comptes411,        color: 'var(--text-1)' },
              { label: 'Sous-comptes par client (411xxx)',    value: diag.comptesClients,    color: diag.comptesClients > 0 ? 'var(--green)' : 'var(--text-3)' },
              { label: 'Comptes 411 génériques',              value: diag.comptesGeneriques, color: diag.comptesGeneriques > 0 ? 'var(--amber)' : 'var(--text-3)' },
              { label: 'Écritures débit (factures émises)',   value: diag.ecrituresDebit,    color: 'var(--text-1)' },
              { label: 'Transactions extraites',              value: diag.transactions,      color: diag.transactions > 0 ? 'var(--green)' : 'var(--red)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', fontSize: 12,
              }}>
                <span style={{ color: 'var(--text-2)' }}>{label}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Aide contextuelle selon le diagnostic */}
          <div style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 520, textAlign: 'center', lineHeight: 1.7 }}>
            {diag.comptes411 === 0 ? (
              <>Aucun compte 411 (créances clients) n'a été détecté dans le FEC. Importez un FEC contenant des ventes clients via <strong style={{ color: 'var(--blue)' }}>Import</strong>.</>
            ) : diag.comptesClients === 0 && diag.comptesGeneriques > 0 ? (
              <>Le FEC n'utilise qu'un compte 411 générique sans sous-comptes par client. L'analyse RFM nécessite des sous-comptes par client (ex&nbsp;: <code style={{ color:'var(--blue)' }}>411DUPONT</code>) ou un FEC enrichi du compte auxiliaire (compAux).</>
            ) : diag.ecrituresDebit === 0 ? (
              <>Aucune facture émise (écriture débit sur compte 411) n'a été trouvée. Vérifiez que le FEC contient bien les ventes de la période.</>
            ) : (
              <>Les comptes 411 sont présents mais aucune transaction n'a pu être extraite. Vérifiez que les libellés clients sont renseignés sur les comptes 411xxx.</>
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
