import type { SaleTransaction } from './rfm'

export interface ArticleStat {
  produit:        string
  ca:             number
  nbVentes:       number          // nombre de lignes de vente
  nbClients:      number          // nombre de clients uniques
  prixMoyen:      number          // ca / nbVentes
  panierMoyen:    number          // ca / nbClients
  lastDate:       string
  clients:        string[]        // client_keys uniques
  partCA:         number          // part dans le CA total (0..1)
}

export function computeArticleStats(txs: SaleTransaction[]): ArticleStat[] {
  if (!txs.length) return []

  const groups = new Map<string, SaleTransaction[]>()
  for (const t of txs) {
    const k = (t.produit ?? '').trim() || '(sans libellé)'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(t)
  }

  const totalCA = txs.reduce((s, t) => s + t.montant, 0)

  return Array.from(groups.entries()).map(([produit, list]) => {
    const ca         = list.reduce((s, t) => s + t.montant, 0)
    const clients    = Array.from(new Set(list.map(t => t.client_key)))
    const nbVentes   = list.length
    const nbClients  = clients.length
    const lastDate   = list.map(t => t.date_achat).sort().slice(-1)[0]
    return {
      produit,
      ca,
      nbVentes,
      nbClients,
      prixMoyen:   nbVentes  ? ca / nbVentes  : 0,
      panierMoyen: nbClients ? ca / nbClients : 0,
      lastDate,
      clients,
      partCA: totalCA > 0 ? ca / totalCA : 0,
    }
  }).sort((a, b) => b.ca - a.ca)
}

export function exportArticlesCSV(articles: ArticleStat[]): void {
  if (!articles.length) return
  const headers = ['produit','ca','nb_ventes','nb_clients','prix_moyen','panier_moyen','part_ca_pct','derniere_vente']
  const rows = articles.map(a => [
    a.produit,
    a.ca.toFixed(2),
    String(a.nbVentes),
    String(a.nbClients),
    a.prixMoyen.toFixed(2),
    a.panierMoyen.toFixed(2),
    (a.partCA * 100).toFixed(1),
    a.lastDate,
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `articles_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
