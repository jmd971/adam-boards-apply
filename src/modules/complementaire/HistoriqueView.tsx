import React, { useState, useMemo } from 'react'
import { fmt } from '@/lib/calc'
import type { SaleTransaction } from '@/lib/rfm'

interface Props {
  transactions: SaleTransaction[]
}

type SortKey = 'date' | 'client' | 'montant' | 'produit'

export function HistoriqueView({ transactions }: Props) {
  const [sort,    setSort]    = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [search,  setSearch]  = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? transactions.filter(t =>
          t.client_nom.toLowerCase().includes(q) ||
          (t.produit ?? '').toLowerCase().includes(q)
        )
      : transactions
    return [...list].sort((a, b) => {
      let d = 0
      if (sort === 'date')    d = a.date_achat.localeCompare(b.date_achat)
      if (sort === 'client')  d = a.client_nom.localeCompare(b.client_nom)
      if (sort === 'montant') d = b.montant - a.montant
      if (sort === 'produit') d = (a.produit ?? '').localeCompare(b.produit ?? '')
      return sortAsc ? -d : d
    })
  }, [transactions, search, sort, sortAsc])

  const handleSort = (k: SortKey) => {
    if (sort === k) setSortAsc(a => !a)
    else { setSort(k); setSortAsc(false) }
  }

  const totalCA = filtered.reduce((s, t) => s + t.montant, 0)
  const hasProduit = transactions.some(t => t.produit)

  const exportCSV = () => {
    const rows = [
      ['Date', 'Article / Libellé', 'Client', 'Montant (€)'],
      ...filtered.map(t => [
        t.date_achat,
        t.produit ?? '—',
        t.client_nom,
        t.montant.toFixed(2),
      ]),
    ]
    const csv = rows
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(
      new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    )
    a.download = `historique_ventes_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const thSt = (k: SortKey, left = false): React.CSSProperties => ({
    padding: '8px 10px',
    textAlign: left ? 'left' : 'right',
    color: sort === k ? 'var(--blue)' : 'var(--text-2)',
    fontWeight: 700,
    fontSize: 11,
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '2px solid var(--border-1)',
    whiteSpace: 'nowrap',
    background: 'var(--bg-1)',
    position: 'sticky',
    top: 0,
    zIndex: left ? 6 : 5,
  })

  if (transactions.length === 0) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
          Aucune transaction disponible
        </div>
        Importez un FEC contenant des comptes 411 avec CompAux,<br />
        ou saisissez des ventes dans le module <strong style={{ color: 'var(--blue)' }}>Saisie</strong>.
        {!hasProduit && (
          <div style={{ marginTop: 12, padding: '10px 16px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--amber)', fontSize: 11, maxWidth: 480, margin: '12px auto 0' }}>
            💡 La colonne <strong>Article</strong> est alimentée par les fichiers POS (module Ventes) ou le libellé de Saisie.
            Depuis le FEC comptable, seul le nom du client est disponible.
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Barre outils */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          placeholder="Rechercher client ou article…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border-1)',
            background: 'var(--bg-2)', color: 'var(--text-0)',
            fontSize: 12, width: 240,
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
          {filtered.length} ligne{filtered.length > 1 ? 's' : ''} ·{' '}
          <strong style={{ color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>
            {fmt(totalCA)} €
          </strong>
        </span>

        {!hasProduit && (
          <span style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 12,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            color: 'var(--amber)',
          }}>
            💡 Article non disponible depuis FEC comptable
          </span>
        )}

        <button
          onClick={exportCSV}
          style={{
            marginLeft: 'auto', padding: '5px 14px', borderRadius: 8,
            border: '1px solid var(--border-1)', background: 'var(--bg-1)',
            color: 'var(--text-1)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Tableau */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-0)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thSt('date', true)} onClick={() => handleSort('date')}>
                Date {sort === 'date' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={thSt('produit', true)} onClick={() => handleSort('produit')}>
                Article / Libellé {sort === 'produit' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={thSt('client', true)} onClick={() => handleSort('client')}>
                Client {sort === 'client' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={thSt('montant')} onClick={() => handleSort('montant')}>
                Montant {sort === 'montant' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr
                key={t.commande_ref ?? `${t.client_key}-${i}`}
                style={{
                  borderBottom: '1px solid var(--border-0)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(20,30,60,0.03)',
                }}
              >
                <td style={{
                  padding: '7px 10px', color: 'var(--text-2)',
                  whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                }}>
                  {t.date_achat}
                </td>
                <td style={{
                  padding: '7px 10px', color: 'var(--text-1)',
                  maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.produit
                    ? t.produit
                    : <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>—</span>
                  }
                </td>
                <td style={{
                  padding: '7px 10px', color: 'var(--text-0)', fontWeight: 500,
                  maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.client_nom}
                </td>
                <td style={{
                  padding: '7px 10px', textAlign: 'right',
                  fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                  color: 'var(--green)', whiteSpace: 'nowrap',
                }}>
                  {fmt(t.montant)} €
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
