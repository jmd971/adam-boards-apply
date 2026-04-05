import type { FecAccount, BilanAccount, ClientInfo, VeEntry } from '@/types'

// ─── Types internes ────────────────────────────────────────────────────────

interface ParsedFEC {
  plData: Record<string, FecAccount>
  bilanData: Record<string, BilanAccount>
  months: string[]
  entryCount: number
  clientData: Record<string, ClientInfo>
  veEntries: VeEntry[]
}

// ─── Utilitaires ──────────────────────────────────────────────────────────

function parseNum(s: string): number {
  if (!s) return 0
  return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0
}

function parseDate(raw: string): string {
  if (!raw) return ''
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return `${raw.slice(6)}-${raw.slice(3, 5)}-${raw.slice(0, 2)}`
  return raw
}

function parseMonth(raw: string): string {
  if (!raw) return ''
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return `${raw.slice(6)}-${raw.slice(3, 5)}`
  return ''
}

// ─── Parser principal ──────────────────────────────────────────────────────

export function parseFEC(text: string): ParsedFEC | null {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return null

  const sep = lines[0].includes('\t') ? '\t' : ';'
  const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''))

  const find = (patterns: string[]) => {
    for (let i = 0; i < headers.length; i++) {
      if (patterns.some(p => headers[i].toLowerCase().includes(p.toLowerCase()))) return i
    }
    return -1
  }

  const ci = {
    acc:          find(['CompteNum', 'Compte']),
    label:        find(['CompteLib', 'Libellé compte', 'Libelle compte', 'Intitulé']),
    date:         find(['EcritureDate', 'Date']),
    debit:        find(['Debit', 'Débit']),
    credit:       find(['Credit', 'Crédit']),
    journal:      find(['JournalCode', 'Journal']),
    ecLib:        find(['EcritureLib', 'Libellé écriture', 'Libelle ecriture', 'Libellé', 'Libelle']),
    compAux:      find(['CompAuxNum', 'Compte auxiliaire']),
    piece:        find(['PieceRef', 'Pièce']),
    datePiece:    find(['PieceDate', 'Date de pièce']),
    dateLettrage: find(['EcritureLet', 'Date de lettrage']),
    lettrage:     find(['Lettrage']),
    dateEcheance: find(["Date de l'échéance", 'Echeance']),
    moyenPaiement: find(['Moyen de paiement', 'MoyenPaiement']),
  }

  // Fallbacks EBP
  if (ci.acc < 0)          ci.acc = 0
  if (ci.label < 0)        ci.label = 1
  if (ci.debit < 0)        ci.debit = headers.length - 2
  if (ci.credit < 0)       ci.credit = headers.length - 1
  if (ci.ecLib >= 0 && ci.ecLib === ci.label) ci.ecLib = -1
  if (ci.ecLib < 0 && headers.length > 9)    ci.ecLib = 9
  if (ci.piece < 0 && headers.length > 6)    ci.piece = 6
  if (ci.datePiece < 0 && headers.length > 7) ci.datePiece = 7
  if (ci.dateLettrage < 0 && headers.length > 16) ci.dateLettrage = 16
  if (ci.lettrage < 0 && headers.length > 17) ci.lettrage = 17
  if (ci.dateEcheance < 0 && headers.length > 19) ci.dateEcheance = 19
  if (ci.moyenPaiement < 0 && headers.length > 20) ci.moyenPaiement = 20

  const plData: Record<string, FecAccount> = {}
  const bilanData: Record<string, BilanAccount> = {}
  const months = new Set<string>()
  const clientData: Record<string, ClientInfo> = {}
  const veEntries: VeEntry[] = []
  let entryCount = 0

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''))
    if (cols.length < 3) continue

    const acc = cols[ci.acc]?.trim()
    if (!acc) continue

    const label = ci.label >= 0 ? (cols[ci.label] || acc) : acc
    const month = parseMonth(cols[ci.date >= 0 ? ci.date : 2] || '')
    if (!month) continue

    const debit  = parseNum(cols[ci.debit])
    const credit = parseNum(cols[ci.credit])
    const _journal = ci.journal >= 0 ? (cols[ci.journal] || '') : ''
    const isOD = (
      acc.startsWith('713') || acc.startsWith('603') ||
      acc.startsWith('6412') || acc.startsWith('64582')
    ) ? 1 : 0
    const ecLib  = ci.ecLib >= 0 ? (cols[ci.ecLib] || '') : ''
    const piece  = ci.piece >= 0 ? (cols[ci.piece] || '') : ''
    const compAux = ci.compAux >= 0 ? (cols[ci.compAux] || '') : ''
    const _rawDatePiece = ci.datePiece >= 0 ? (cols[ci.datePiece] || '') : ''
    const lettrage = ci.lettrage >= 0 ? (cols[ci.lettrage] || '') : ''

    // Comptes de classes 6 et 7 → compte de résultat
    if (acc[0] === '6' || acc[0] === '7') {
      months.add(month)
      entryCount++
      if (!plData[acc]) plData[acc] = { mo: {}, l: label, e: [] }
      if (!plData[acc].mo[month]) plData[acc].mo[month] = [0, 0]
      plData[acc].mo[month][0] = Math.round((plData[acc].mo[month][0] + debit) * 100) / 100
      plData[acc].mo[month][1] = Math.round((plData[acc].mo[month][1] + credit) * 100) / 100
      plData[acc].e.push([parseDate(cols[ci.date >= 0 ? ci.date : 2] || ''), ecLib || label, debit, credit, piece, isOD])

      // Clients (comptes 41x) → données de créances
      if (acc.startsWith('411') && compAux) {
        if (!clientData[compAux]) clientData[compAux] = { n: compAux, ca: 0, entries: 0 }
        clientData[compAux].ca += credit - debit
        clientData[compAux].entries++
      }

      // Ventes à encaisser (4111)
      if (acc.startsWith('411') && !lettrage) {
        const dateEch = ci.dateEcheance >= 0 ? cols[ci.dateEcheance] || '' : ''
        veEntries.push({
          date: parseDate(cols[ci.date >= 0 ? ci.date : 2] || ''),
          label: ecLib || label,
          amount: credit - debit,
          account: acc,
          lettrage: 0,
          dueDate: parseDate(dateEch),
        })
      }
    }
    // Comptes de classes 1-5 → bilan
    else if (acc[0] >= '1' && acc[0] <= '5') {
      if (!bilanData[acc]) bilanData[acc] = { s: 0, l: label, top: [], e: [] }
      // Cumuler le solde sur TOUTES les écritures (pas seulement le dernier mois)
      bilanData[acc].s = Math.round((bilanData[acc].s + debit - credit) * 100) / 100
      // Pour les comptes clients 41x (hors 419), stocker les écritures individuelles
      if (acc.startsWith('41') && !acc.startsWith('419')) {
        const dateStr = parseDate(cols[ci.date >= 0 ? ci.date : 2] || '')
        bilanData[acc].e.push([dateStr, ecLib || label, debit, credit, piece, isOD])
        // Format 411 standard avec CompAuxNum → top[] par client auxiliaire
        if (compAux && acc.startsWith('411')) {
          const existing = bilanData[acc].top.find((t: any) => t[0] === compAux)
          if (existing) existing[2] += credit - debit
          else bilanData[acc].top.push([compAux, ecLib || compAux, credit - debit])
        }
      }
    }
  }

  if (entryCount === 0) return null

  return {
    plData,
    bilanData,
    months: [...months].sort(),
    entryCount,
    clientData,
    veEntries,
  }
}

// ─── Détection société / période ──────────────────────────────────────────

export function detectCompany(filename: string): string {
  const base = filename.replace(/\.(txt|csv)$/i, '')
  const clean = base
    .replace(/_?(N-1|N1)$/i, '')
    .replace(/(\_N)$/i, '')
    .replace(/_DEMO$/i, '')
  return clean.toUpperCase() || 'SOCIETE'
}

export function detectPeriod(months: string[]): { period: 'N' | 'N-1'; fy: string } {
  if (!months.length) {
    const cy = new Date().getFullYear()
    return { period: 'N', fy: String(cy) }
  }
  const sorted = [...months].sort()
  const maxY = parseInt(sorted[sorted.length - 1].slice(0, 4))
  const cy = new Date().getFullYear()
  if (maxY < cy) return { period: 'N-1', fy: String(maxY) }
  return { period: 'N', fy: String(maxY) }
}
