import React, { useState, useMemo } from 'react'
import { KpiCard } from '@/components/ui'
import { fmt } from '@/lib/calc'
import { computeArticleStats, exportArticlesCSV, type ArticleStat } from '@/lib/articles'
import type { SaleTransaction } from '@/lib/rfm'

interface Props { transactions: SaleTransaction[] }

type SortKey = 'ca' | 'ventes' | 'clients' | 'prix' | 'panier' | 'nom'

export function ArticlesView({ transactions }: Props) {
  const [sort,    setSort]    = useState<SortKey>('ca')
  const [sortAsc, setSortAsc] = useState(false)
  const [search,  setSearch]  = useState('')

  const articles = useMemo(() => computeArticleStats(transactions), [transactions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? articles.filter(a => a.produit.toLowerCase().includes(q)) : articles
    return [...list].sort((a, b) => {
      let d = 0
      if (sort === 'ca')      d = b.ca - a.ca
      if (sort === 'ventes')  d = b.nbVentes - a.nbVentes
      if (sort === 'clients') d = b.nbClients - a.nbClients
      if (sort === 'prix')    d = b.prixMoyen - a.prixMoyen
      if (sort === 'panier')  d = b.panierMoyen - a.panierMoyen
      if (sort === 'nom')     d = a.produit.localeCompare(b.produit)
      return sortAsc ? -d : d
    })
  }, [articles, search, sort, sortAsc])

  const totalCA       = articles.reduce((s, a) => s + a.ca, 0)
  const totalArticles = articles.length
  const monoClient    = articles.filter(a => a.nbClients === 1).length
  const top3CAPart    = articles.slice(0, 3).reduce((s, a) => s + a.partCA, 0)

  const handleSort = (k: SortKey) => { if (sort === k) setSortAsc(a => !a); else { setSort(k); setSortAsc(false) } }

  const thSt = (k: SortKey, left = false): React.CSSProperties => ({
    padding: '8px 10px', textAlign: left ? 'left' : 'right',
    color: sort === k ? 'var(--blue)' : 'var(--text-2)',
    fontWeight: 700, fontSize: 11, cursor: 'pointer', userSelect: 'none',
    borderBottom: '2px solid var(--border-1)', whiteSpace: 'nowrap',
    background: 'var(--bg-1)', position: 'sticky', top: 0, zIndex: left ? 6 : 5,
  })

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <KpiCard label="Articles vendus"    value={String(totalArticles)} />
        <KpiCard label="CA total articles"  value={`${fmt(totalCA)} €`} />
        <KpiCard label="Top 3 = part du CA" value={`${(top3CAPart * 100).toFixed(0)} %`} />
        <KpiCard label="Articles mono-client" value={String(monoClient)} sub="vendus à 1 seul client (cibles cross-sell)" />
      </div>

      {/* Barre d'actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Rechercher un article..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12,
            background: 'var(--bg-1)', border: '1px solid var(--border-1)',
            color: 'var(--text-1)', outline: 'none', minWidth: 240,
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {filtered.length} article{filtered.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={() => exportArticlesCSV(filtered)}
          disabled={!filtered.length}
          style={{
            marginLeft: 'auto', padding: '6px 14px', borderRadius: 8,
            border: '1px solid var(--border-1)', background: 'rgba(59,130,246,0.12)',
            color: '#93c5fd', fontSize: 11, fontWeight: 600,
            cursor: filtered.length ? 'pointer' : 'not-allowed',
            opacity: filtered.length ? 1 : 0.5,
          }}
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Tableau */}
      {filtered.length === 0 ? (
        <div style={{ padding: 32, borderRadius: 12, background: 'var(--bg-1)', border: '1px solid var(--border-1)', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
          {articles.length === 0
            ? 'Aucun article identifié dans les ventes. Renseignez le libellé / produit dans les factures ou le fichier POS.'
            : 'Aucun article ne correspond à la recherche.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border-1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={thSt('nom', true)} onClick={() => handleSort('nom')}>Produit</th>
                <th style={thSt('ca')}      onClick={() => handleSort('ca')}>CA</th>
                <th style={thSt('ca')}>Part CA</th>
                <th style={thSt('ventes')}  onClick={() => handleSort('ventes')}>Ventes</th>
                <th style={thSt('clients')} onClick={() => handleSort('clients')}>Clients</th>
                <th style={thSt('prix')}    onClick={() => handleSort('prix')}>Prix moyen</th>
                <th style={thSt('panier')}  onClick={() => handleSort('panier')}>Panier / client</th>
                <th style={{ ...thSt('nom'), textAlign: 'right' }}>Dernière vente</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.produit} style={{ borderBottom: '1px solid var(--border-1)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text-1)' }}>
                    {a.produit}
                    {a.nbClients === 1 && (
                      <span style={{ marginLeft: 8, fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }}>
                        mono-client
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--green)', fontWeight: 600 }}>
                    {fmt(a.ca)} €
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-3)' }}>
                    {(a.partCA * 100).toFixed(1)} %
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{a.nbVentes}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{a.nbClients}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-2)' }}>{fmt(a.prixMoyen)} €</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-2)' }}>{fmt(a.panierMoyen)} €</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-3)', fontSize: 10 }}>
                    {a.lastDate.split('-').reverse().join('/')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hint mono-client */}
      {monoClient > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
          fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          💡 <strong style={{ color: 'var(--amber)' }}>{monoClient}</strong> article{monoClient > 1 ? 's' : ''} {monoClient > 1 ? 'ont' : 'a'} été vendu{monoClient > 1 ? 's' : ''} à un seul client.
          Ce sont d'excellentes cibles pour des campagnes de cross-sell auprès de votre base clients existante.
        </div>
      )}
    </div>
  )
}

// Re-export for tests
export type { ArticleStat }
