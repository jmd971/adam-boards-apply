import type { RAWData, BilanAccount } from '@/types'
import type { SaleTransaction } from './rfm'

/**
 * Extrait les ventes (factures) depuis le FEC.
 *
 * Stratégie : on parcourt les comptes 411xxx du bilan (créances clients).
 * Chaque débit sur un 411xxx correspond à une facture émise au client.
 * - Si le compte est un sous-compte client (ex : 411DUPONT) le libellé du
 *   compte sert de nom de client.
 * - Si le compte est générique (411, 411000, "Clients", "Clients divers"),
 *   on tente d'utiliser top[] (compAux par client) pour récupérer le nom.
 *   Faute de date par client dans top[], les transactions sont datées par
 *   défaut au dernier jour de l'exercice — utile pour Articles & Scénarios
 *   mais R/F seront imprécis.
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

    // N et N-1 fusionnés
    for (const period of [company.bn, company.b1] as const) {
      for (const [acc, account] of Object.entries(period)) {
        if (!acc.startsWith('411')) continue
        const data = account as BilanAccount

        const generic = isGenericClientAccount(acc, data.l)

        if (!generic) {
          // Sous-compte client : libellé = nom client, entrées = factures datées
          const clientNom = cleanClientLabel(data.l, acc)
          const clientKey = clientNom.toLowerCase()
          for (const e of (data.e ?? [])) {
            const [date, lib, debit, , piece] = e
            if (!(debit > 0)) continue        // seules les factures (débit) comptent
            if (!date) continue
            txs.push({
              client_key:   clientKey,
              client_nom:   clientNom,
              date_achat:   date,
              montant:      debit,
              produit:      cleanEntryLabel(lib),
              commande_ref: String(piece || `${co}-${acc}-${date}`),
            })
          }
        } else {
          // Compte 411 générique : on utilise top[] = [[compAux, label, montant], …]
          const top = (data.top ?? []) as Array<[string, string, number] | [string, number]>
          for (const t of top) {
            const compAux = t[0] as string
            const name    = (t.length === 3 ? (t[1] as string) : compAux) || compAux
            const amount  = (t.length === 3 ? (t[2] as number) : (t[1] as number)) || 0
            if (amount <= 0) continue
            txs.push({
              client_key:   String(compAux).trim().toLowerCase(),
              client_nom:   String(name).trim(),
              date_achat:   lastDayOfPeriod(period === company.bn ? RAW.mn : RAW.m1),
              montant:      amount,
              commande_ref: `${co}-${compAux}`,
            })
          }
        }
      }
    }
  }

  return txs
}

function isGenericClientAccount(acc: string, label: string): boolean {
  // Comptes racines (411, 411000, 4110000…) ou libellés génériques
  if (/^411\s*0*$/.test(acc)) return true
  const l = (label || '').trim().toLowerCase()
  return l === 'clients' || l === 'créances clients' || l === acc.toLowerCase()
}

function cleanClientLabel(label: string, acc: string): string {
  const raw = (label || acc).trim()
  // Préfixes courants : "411DUPONT - DUPONT SAS" → "DUPONT SAS"
  const m = raw.match(/^\d{3,}\w*\s*[-–—:]\s*(.+)$/)
  if (m) return m[1].trim()
  return raw
}

function cleanEntryLabel(label: string): string | undefined {
  const l = (label || '').trim()
  if (!l) return undefined
  return l
}

function lastDayOfPeriod(months: string[]): string {
  if (!months || months.length === 0) return new Date().toISOString().slice(0, 10)
  const last = months[months.length - 1]   // 'YYYY-MM'
  return `${last}-28`                       // approximation safe (toujours valide)
}

/**
 * Diagnostique combien de comptes 411xxx sont exploitables.
 */
export interface FecVentesDiag {
  companies:        number
  comptes411:       number   // total comptes 411xxx (toutes sociétés sélectionnées, N + N-1)
  comptesClients:   number   // comptes 411xxx avec libellé client identifiable
  comptesGeneriques:number   // comptes 411 / 411000 (sans granularité par sous-compte)
  ecrituresDebit:   number   // total écritures débit (= factures émises) sur ces comptes
  transactions:     number   // SaleTransaction produits par fecToSaleTransactions
}

export function diagnoseFec(RAW: RAWData | null, selCo: string[]): FecVentesDiag {
  if (!RAW) return { companies: 0, comptes411: 0, comptesClients: 0, comptesGeneriques: 0, ecrituresDebit: 0, transactions: 0 }
  const cos = selCo.length ? selCo : RAW.keys

  let comptes411 = 0, comptesClients = 0, comptesGeneriques = 0, ecrituresDebit = 0
  for (const co of cos) {
    const company = RAW.companies[co]
    if (!company) continue
    for (const period of [company.bn, company.b1] as const) {
      for (const [acc, account] of Object.entries(period)) {
        if (!acc.startsWith('411')) continue
        const data = account as BilanAccount
        comptes411++
        if (isGenericClientAccount(acc, data.l)) comptesGeneriques++
        else comptesClients++
        ecrituresDebit += (data.e ?? []).filter(e => (e[2] as number) > 0).length
      }
    }
  }

  return {
    companies:         cos.length,
    comptes411,
    comptesClients,
    comptesGeneriques,
    ecrituresDebit,
    transactions:      fecToSaleTransactions(RAW, selCo).length,
  }
}
