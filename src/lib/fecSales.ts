import type { RAWData, ClientInfo } from '@/types'
import type { SaleTransaction } from './rfm'

/**
 * Extrait les transactions de vente depuis le FEC.
 *
 * S'appuie sur `cdN` (Record<compAux | sous-compte 411, ClientInfo>) qui agrège
 * par client les factures émises (débit sur 411xxx).
 *
 * Pour la segmentation RFM :
 *   - montant      = CA total du client (somme des débits)
 *   - date_achat   = date de la dernière facture (proxy de récence)
 *   - commande_ref = clé client (utilisée pour reconnaître les visites)
 *
 * On ne dispose pas d'une transaction par facture (la granularité par entrée
 * n'est pas conservée pour les comptes 411 génériques avec compAux). On
 * produit donc `entries` transactions de même date pour qu'un client à 5
 * factures pèse 5 dans la fréquence RFM (scoreF).
 */
export function fecToSaleTransactions(
  RAW: RAWData | null,
  selCo: string[],
): SaleTransaction[] {
  if (!RAW) return []

  const txs: SaleTransaction[] = []
  const cos = selCo.length ? selCo : RAW.keys

  for (const co of cos) {
    const company = RAW.companies[co]
    if (!company) continue

    pushClients(txs, company.cdN,  co, lastMonth(RAW.mn))
    pushClients(txs, company.cdN1, co, lastMonth(RAW.m1))
  }

  return txs
}

function pushClients(
  out: SaleTransaction[],
  clients: Record<string, ClientInfo>,
  co: string,
  fallbackDate: string,
): void {
  for (const [key, info] of Object.entries(clients)) {
    if (!info || info.ca <= 0) continue
    const nbFactures   = Math.max(1, info.entries ?? 1)
    const totalCA      = info.ca
    const caParFacture = totalCA / nbFactures
    const date         = info.lastDate || fallbackDate

    // Une SaleTransaction par facture, à la même date (faute de mieux),
    // pour pondérer la fréquence RFM correctement.
    for (let i = 0; i < nbFactures; i++) {
      out.push({
        client_key:   key.trim().toLowerCase(),
        client_nom:   info.n || key,
        date_achat:   date,
        montant:      caParFacture,
        commande_ref: `${co}-${key}-${i}`,
      })
    }
  }
}

function lastMonth(months: string[] | undefined): string {
  if (!months || !months.length) return new Date().toISOString().slice(0, 10)
  const last = months[months.length - 1]   // 'YYYY-MM'
  return `${last}-28`                      // approximation safe
}

export interface FecVentesDiag {
  companies:       number
  clientsN:        number
  clientsN1:       number
  totalCA:         number   // somme CA tous clients toutes périodes
  totalFactures:   number   // somme entries
  transactions:    number   // SaleTransaction produits
}

/**
 * Diagnostic d'extraction FEC : compte les clients agrégés (cdN, cdN1) et le
 * volume total. Utile pour expliquer un état vide.
 */
export function diagnoseFec(RAW: RAWData | null, selCo: string[]): FecVentesDiag {
  if (!RAW) return { companies: 0, clientsN: 0, clientsN1: 0, totalCA: 0, totalFactures: 0, transactions: 0 }
  const cos = selCo.length ? selCo : RAW.keys

  let clientsN = 0, clientsN1 = 0, totalCA = 0, totalFactures = 0
  for (const co of cos) {
    const c = RAW.companies[co]
    if (!c) continue
    for (const info of Object.values(c.cdN  ?? {})) {
      if ((info as ClientInfo).ca > 0) { clientsN++;  totalCA += (info as ClientInfo).ca; totalFactures += (info as ClientInfo).entries ?? 0 }
    }
    for (const info of Object.values(c.cdN1 ?? {})) {
      if ((info as ClientInfo).ca > 0) { clientsN1++; totalCA += (info as ClientInfo).ca; totalFactures += (info as ClientInfo).entries ?? 0 }
    }
  }

  return {
    companies:     cos.length,
    clientsN,
    clientsN1,
    totalCA,
    totalFactures,
    transactions:  fecToSaleTransactions(RAW, selCo).length,
  }
}
