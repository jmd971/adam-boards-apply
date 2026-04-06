import type { FecAccount, BilanAccount, ClientInfo, VeEntry } from '@/types'

// ─── Types internes ────────────────────────────────────────────────────────

export interface ParseWarning {
  type: 'skip' | 'format' | 'column' | 'data'
  message: string
  line?: number
}

interface ParsedFEC {
  plData: Record<string, FecAccount>
  bilanData: Record<string, BilanAccount>
  months: string[]
  entryCount: number
  clientData: Record<string, ClientInfo>
  veEntries: VeEntry[]
  warnings: ParseWarning[]
  skippedLines: number
}

// ─── Utilitaires ──────────────────────────────────────────────────────────

function parseNum(s: string): number {
  if (!s) return 0
  return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0
}

function parseDate(raw: string): string {
  if (!raw) return ''
  const s = raw.trim()
  if (/^\d{8}$/.test(s))               return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s))   return s
  if (/^\d{2}-\d{2}-\d{4}$/.test(s))   return `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}`
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}`
  return ''
}

function parseMonth(raw: string): string {
  if (!raw) return ''
  const d = parseDate(raw)
  return d.length >= 7 ? d.slice(0, 7) : ''
}

function isValidAccount(acc: string): boolean {
  if (!acc || acc.length < 1 || acc.length > 12) return false
  return /^[1-9]\d*$/.test(acc)
}

function isValidMonth(m: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(m)) return false
  const year = parseInt(m.slice(0, 4))
  const month = parseInt(m.slice(5, 7))
  return year >= 1990 && year <= 2099 && month >= 1 && month <= 12
}

function detectSeparator(line: string): string {
  const tabCount = (line.match(/\t/g) || []).length
  const semiCount = (line.match(/;/g) || []).length
  const commaCount = (line.match(/,/g) || []).length
  // Tab est prioritaire (FEC standard), puis point-virgule, puis virgule
  if (tabCount >= 3) return '\t'
  if (semiCount >= 3) return ';'
  if (commaCount >= 3) return ','
  // Fallback
  if (tabCount > 0) return '\t'
  if (semiCount > 0) return ';'
  return ','
}

// ─── Parser principal ──────────────────────────────────────────────────────

export function parseFEC(text: string): ParsedFEC | null {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return null

  const sep = detectSeparator(lines[0])
  const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''))
  const warnings: ParseWarning[] = []

  // Recherche d'en-têtes avec variantes étendues
  const find = (patterns: string[]): number => {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase().replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ùû]/g, 'u')
      if (patterns.some(p => h.includes(p.toLowerCase()))) return i
    }
    return -1
  }

  const ci = {
    acc:           find(['comptenum', 'compte num', 'numcompte', 'num compte', 'n° compte']),
    label:         find(['comptelib', 'libelle compte', 'intitule compte', 'intitule du compte', 'nom compte']),
    date:          find(['ecrituredate', 'date ecriture', 'date d\'ecriture', 'date comptable']),
    debit:         find(['debit', 'montant debit']),
    credit:        find(['credit', 'montant credit']),
    journal:       find(['journalcode', 'journal', 'code journal']),
    ecLib:         find(['ecriturelib', 'libelle ecriture', 'libelle de l\'ecriture']),
    compAux:       find(['compauxnum', 'compte auxiliaire', 'num auxiliaire']),
    piece:         find(['pieceref', 'piece', 'reference piece', 'n° piece']),
    datePiece:     find(['piecedate', 'date piece', 'date de piece']),
    dateLettrage:  find(['ecriturelettrage', 'ecriturelet', 'date lettrage']),
    lettrage:      find(['lettrage', 'code lettrage']),
    dateEcheance:  find(['date de l\'echeance', 'echeance', 'date echeance']),
    moyenPaiement: find(['moyen de paiement', 'moyenpaiement', 'mode reglement']),
  }

  // Colonnes critiques
  const criticalMissing: string[] = []

  if (ci.acc < 0) {
    // Fallback : première colonne numérique qui ressemble à un numéro de compte
    const fallback = headers.findIndex((_, i) => {
      const sample = lines[1]?.split(sep)[i]?.trim().replace(/"/g, '')
      return sample && /^[1-9]\d{2,}$/.test(sample)
    })
    if (fallback >= 0) {
      ci.acc = fallback
      warnings.push({ type: 'column', message: `Colonne compte non trouvée par en-tête, détectée en position ${fallback + 1} ("${headers[fallback]}")` })
    } else {
      ci.acc = 0
      criticalMissing.push('CompteNum')
    }
  }

  if (ci.date < 0) {
    // Fallback : chercher une colonne qui contient des dates
    const fallback = headers.findIndex((_, i) => {
      const sample = lines[1]?.split(sep)[i]?.trim().replace(/"/g, '')
      return sample && parseDate(sample) !== ''
    })
    if (fallback >= 0) {
      ci.date = fallback
      warnings.push({ type: 'column', message: `Colonne date non trouvée par en-tête, détectée en position ${fallback + 1} ("${headers[fallback]}")` })
    } else {
      criticalMissing.push('EcritureDate')
    }
  }

  if (ci.debit < 0 || ci.credit < 0) {
    // Fallback : chercher deux colonnes numériques adjacentes en fin de ligne
    const sampleCols = lines[1]?.split(sep).map(c => c.trim().replace(/"/g, ''))
    if (sampleCols) {
      for (let i = sampleCols.length - 1; i >= 1; i--) {
        if (parseNum(sampleCols[i]) !== 0 || parseNum(sampleCols[i - 1]) !== 0) {
          if (/^[\d\s,.-]+$/.test(sampleCols[i]) && /^[\d\s,.-]+$/.test(sampleCols[i - 1])) {
            if (ci.debit < 0) ci.debit = i - 1
            if (ci.credit < 0) ci.credit = i
            warnings.push({ type: 'column', message: `Colonnes débit/crédit détectées en positions ${i}/${i + 1} ("${headers[i - 1]}"/"${headers[i]}")` })
            break
          }
        }
      }
    }
    if (ci.debit < 0) criticalMissing.push('Debit')
    if (ci.credit < 0) criticalMissing.push('Credit')
  }

  if (ci.label < 0) {
    // Fallback : colonne juste après le compte
    if (ci.acc >= 0 && ci.acc + 1 < headers.length) {
      ci.label = ci.acc + 1
      warnings.push({ type: 'column', message: `Colonne libellé non trouvée, utilisation de la position ${ci.label + 1} ("${headers[ci.label]}")` })
    }
  }

  // Si des colonnes critiques manquent totalement, échouer
  if (criticalMissing.length > 0) {
    warnings.push({ type: 'format', message: `Colonnes obligatoires introuvables : ${criticalMissing.join(', ')}. Vérifiez que le fichier est au format FEC.` })
    return null
  }

  // Fallbacks optionnels par détection sur les données
  if (ci.ecLib < 0 && ci.label >= 0) {
    // Chercher une autre colonne texte différente de label
    for (let i = 0; i < headers.length; i++) {
      if (i === ci.acc || i === ci.label || i === ci.date || i === ci.debit || i === ci.credit) continue
      const sample = lines[1]?.split(sep)[i]?.trim().replace(/"/g, '')
      if (sample && sample.length > 3 && !/^[\d\s,.-]+$/.test(sample)) {
        ci.ecLib = i
        break
      }
    }
  }
  if (ci.piece < 0) ci.piece = find(['pieceref', 'piece', 'ref'])
  if (ci.lettrage < 0) ci.lettrage = find(['lettrage', 'let'])

  const plData: Record<string, FecAccount> = {}
  const bilanData: Record<string, BilanAccount> = {}
  const months = new Set<string>()
  const clientData: Record<string, ClientInfo> = {}
  const veEntries: VeEntry[] = []
  let entryCount = 0
  let skippedLines = 0

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''))
    if (cols.length < 3) { skippedLines++; continue }

    const acc = cols[ci.acc]?.trim()
    if (!acc) { skippedLines++; continue }

    // Validation du numéro de compte
    if (!isValidAccount(acc)) {
      skippedLines++
      if (skippedLines <= 5) warnings.push({ type: 'data', message: `Compte invalide "${acc}"`, line: i + 1 })
      continue
    }

    const label = ci.label >= 0 ? (cols[ci.label] || acc) : acc
    const dateCol = ci.date >= 0 ? ci.date : 2
    const month = parseMonth(cols[dateCol] || '')

    if (!month) { skippedLines++; continue }

    // Validation du mois
    if (!isValidMonth(month)) {
      skippedLines++
      if (skippedLines <= 5) warnings.push({ type: 'data', message: `Date hors plage "${cols[dateCol]}"`, line: i + 1 })
      continue
    }

    const debit  = parseNum(cols[ci.debit])
    const credit = parseNum(cols[ci.credit])

    // Validation montants
    if (debit < 0 || credit < 0) {
      skippedLines++
      if (skippedLines <= 5) warnings.push({ type: 'data', message: `Montant négatif ligne ${i + 1} (D:${debit} C:${credit})`, line: i + 1 })
      continue
    }

    if (debit === 0 && credit === 0) { skippedLines++; continue }

    const isOD = (
      acc.startsWith('713') || acc.startsWith('603') ||
      acc.startsWith('6412') || acc.startsWith('64582')
    ) ? 1 : 0
    const ecLib  = ci.ecLib >= 0 ? (cols[ci.ecLib] || '') : ''
    const piece  = ci.piece >= 0 ? (cols[ci.piece] || '') : ''
    const compAux = ci.compAux >= 0 ? (cols[ci.compAux] || '') : ''
    const lettrage = ci.lettrage >= 0 ? (cols[ci.lettrage] || '') : ''

    // Comptes de classes 6 et 7 → compte de résultat
    if (acc[0] === '6' || acc[0] === '7') {
      months.add(month)
      entryCount++
      if (!plData[acc]) plData[acc] = { mo: {}, l: label, e: [] }
      if (!plData[acc].mo[month]) plData[acc].mo[month] = [0, 0]
      plData[acc].mo[month][0] = Math.round((plData[acc].mo[month][0] + debit) * 100) / 100
      plData[acc].mo[month][1] = Math.round((plData[acc].mo[month][1] + credit) * 100) / 100
      plData[acc].e.push([parseDate(cols[dateCol] || ''), ecLib || label, debit, credit, piece, isOD])

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
          date: parseDate(cols[dateCol] || ''),
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
      bilanData[acc].s = Math.round((bilanData[acc].s + debit - credit) * 100) / 100
      if (acc.startsWith('41') && !acc.startsWith('419')) {
        const dateStr = parseDate(cols[dateCol] || '')
        ;(bilanData[acc].e as any[]).push([dateStr, ecLib || label, debit, credit, piece || '', isOD])
        if (compAux && acc.startsWith('411')) {
          const topArr = bilanData[acc].top as any[]
          const existing = topArr.find((t: any) => t[0] === compAux)
          if (existing) existing[2] = (existing[2] || 0) + (credit - debit)
          else topArr.push([compAux, ecLib || compAux, credit - debit])
        }
      }
    }
  }

  if (entryCount === 0) {
    warnings.push({ type: 'format', message: 'Aucune écriture de classe 6/7 trouvée. Le fichier ne contient pas de données P&L.' })
    return null
  }

  // Warnings de synthèse
  if (skippedLines > 0) {
    warnings.push({ type: 'skip', message: `${skippedLines} ligne(s) ignorée(s) sur ${lines.length - 1} (${((skippedLines / (lines.length - 1)) * 100).toFixed(1)}%)` })
  }

  if (skippedLines > (lines.length - 1) * 0.2) {
    warnings.push({ type: 'format', message: `Attention : plus de 20% des lignes ont été ignorées. Vérifiez le format du fichier.` })
  }

  return {
    plData,
    bilanData,
    months: [...months].sort(),
    entryCount,
    clientData,
    veEntries,
    warnings,
    skippedLines,
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
