import { useState, useMemo, useCallback, useRef } from 'react'
import { useAppStore } from '@/store'
import { fmt, pct } from '@/lib/calc'

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

interface BankLine {
  date: string          // YYYY-MM-DD
  label: string
  amount: number        // positif = crédit/entrée, négatif = débit/sortie
  raw: string           // ligne brute CSV
  lineNum: number
}

interface FecLine {
  date: string
  label: string
  debit: number
  credit: number
  piece: string
  account: string
}

type MatchStatus = 'matched' | 'bank_only' | 'fec_only'

interface MatchResult {
  status: MatchStatus
  bank?: BankLine
  fec?: FecLine
  delta?: number        // écart si matched avec montant différent
}

/* ═══════════════════════════════════════════════════════════
   CSV Parser — relevé bancaire
   ═══════════════════════════════════════════════════════════ */

function detectSeparator(text: string): string {
  const first = text.split('\n').slice(0, 5).join('\n')
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 }
  for (const ch of Object.keys(counts)) {
    counts[ch] = (first.match(new RegExp(ch === '\t' ? '\t' : `\\${ch}`, 'g')) || []).length
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function parseDate(raw: string): string | null {
  raw = raw.trim().replace(/"/g, '')
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  let m = raw.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // YYYY-MM-DD
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return raw
  // YYYYMMDD
  m = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

function parseAmount(raw: string): number | null {
  raw = raw.trim().replace(/"/g, '').replace(/\s/g, '')
  if (!raw || raw === '' || raw === '-') return null
  // Handle French format: 1 234,56 or 1234,56
  raw = raw.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}

interface CsvMapping {
  date: number
  label: number
  debit: number
  credit: number
  amount: number // single column with sign (alternative to debit/credit)
}

function detectColumns(headers: string[]): CsvMapping {
  const lower = headers.map(h => h.toLowerCase().replace(/"/g, '').trim())
  const mapping: CsvMapping = { date: -1, label: -1, debit: -1, credit: -1, amount: -1 }

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (mapping.date === -1 && /date/.test(h)) mapping.date = i
    if (mapping.label === -1 && /(lib|label|desc|intitul|motif|r[eé]f)/.test(h)) mapping.label = i
    if (mapping.debit === -1 && /(d[eé]bit|sortie|retrait)/.test(h)) mapping.debit = i
    if (mapping.credit === -1 && /(cr[eé]dit|entr[eé]e|versement)/.test(h) && !/d[eé]bit/.test(h)) mapping.credit = i
    if (mapping.amount === -1 && /(montant|amount|solde|valeur)/.test(h) && !/solde\s*(final|cumulé)/.test(h)) mapping.amount = i
  }
  // Fallbacks: try first columns
  if (mapping.date === -1) mapping.date = 0
  if (mapping.label === -1) mapping.label = Math.min(1, headers.length - 1)

  return mapping
}

function parseBankCsv(text: string): { lines: BankLine[]; warnings: string[]; headers: string[] } {
  const sep = detectSeparator(text)
  const rows = text.split('\n').filter(r => r.trim())
  if (rows.length < 2) return { lines: [], warnings: ['Fichier vide ou trop court'], headers: [] }

  const headers = rows[0].split(sep).map(h => h.replace(/"/g, '').trim())
  const mapping = detectColumns(headers)
  const lines: BankLine[] = []
  const warnings: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(sep).map(c => c.replace(/^\s+|\s+$/g, ''))
    if (cols.length < 2) continue

    const date = parseDate(cols[mapping.date] ?? '')
    if (!date) { warnings.push(`Ligne ${i + 1}: date invalide "${cols[mapping.date]}"`) ; continue }

    const label = (cols[mapping.label] ?? '').replace(/"/g, '').trim()

    let amount = 0
    if (mapping.debit >= 0 && mapping.credit >= 0) {
      const d = parseAmount(cols[mapping.debit] ?? '') ?? 0
      const c = parseAmount(cols[mapping.credit] ?? '') ?? 0
      amount = c - d  // crédit positif, débit négatif
    } else if (mapping.amount >= 0) {
      amount = parseAmount(cols[mapping.amount] ?? '') ?? 0
    } else {
      // Try last numeric column
      for (let j = cols.length - 1; j >= 0; j--) {
        const v = parseAmount(cols[j])
        if (v !== null) { amount = v; break }
      }
    }

    if (amount === 0 && !label) continue

    lines.push({ date, label, amount, raw: rows[i], lineNum: i + 1 })
  }

  return { lines, warnings, headers }
}

/* ═══════════════════════════════════════════════════════════
   Matching Engine
   ═══════════════════════════════════════════════════════════ */

interface MatchConfig {
  dateTolerance: number   // jours d'écart max
  amountTolerance: number // % d'écart montant
  fuzzyLabel: boolean
}

function normalizeLabel(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüÿç\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function labelSimilarity(a: string, b: string): number {
  const na = normalizeLabel(a)
  const nb = normalizeLabel(b)
  if (na === nb) return 1
  const wordsA = na.split(' ')
  const wordsB = new Set(nb.split(' '))
  let match = 0
  for (const w of wordsA) if (wordsB.has(w)) match++
  return match / Math.max(wordsA.length, wordsB.size)
}

function daysDiff(d1: string, d2: string): number {
  return Math.abs((new Date(d1).getTime() - new Date(d2).getTime()) / 86400000)
}

function matchEntries(
  bankLines: BankLine[],
  fecLines: FecLine[],
  config: MatchConfig
): MatchResult[] {
  const results: MatchResult[] = []
  const usedBank = new Set<number>()
  const usedFec  = new Set<number>()

  // Phase 1: exact matches (amount + date within tolerance)
  for (let bi = 0; bi < bankLines.length; bi++) {
    const b = bankLines[bi]
    let bestIdx = -1
    let bestScore = -1

    for (let fi = 0; fi < fecLines.length; fi++) {
      if (usedFec.has(fi)) continue
      const f = fecLines[fi]

      // Amount check: bank amount vs FEC solde (credit - debit for bank accounts)
      const fecAmount = f.credit - f.debit
      const amtDiff = Math.abs(b.amount - fecAmount)
      const amtRef = Math.max(Math.abs(b.amount), Math.abs(fecAmount), 0.01)
      const amtPct = amtDiff / amtRef * 100

      if (amtPct > config.amountTolerance) continue

      // Date check
      const dd = daysDiff(b.date, f.date)
      if (dd > config.dateTolerance) continue

      // Score: closer date & amount = better
      let score = 100 - dd * 10 - amtPct * 5
      if (config.fuzzyLabel) score += labelSimilarity(b.label, f.label) * 20

      if (score > bestScore) { bestScore = score; bestIdx = fi }
    }

    if (bestIdx >= 0) {
      const f = fecLines[bestIdx]
      const fecAmount = f.credit - f.debit
      const delta = Math.abs(b.amount - fecAmount) > 0.01 ? b.amount - fecAmount : undefined
      results.push({ status: 'matched', bank: b, fec: f, delta })
      usedBank.add(bi)
      usedFec.add(bestIdx)
    }
  }

  // Phase 2: unmatched
  for (let bi = 0; bi < bankLines.length; bi++) {
    if (!usedBank.has(bi)) results.push({ status: 'bank_only', bank: bankLines[bi] })
  }
  for (let fi = 0; fi < fecLines.length; fi++) {
    if (!usedFec.has(fi)) results.push({ status: 'fec_only', fec: fecLines[fi] })
  }

  // Sort: unmatched first, then by date
  results.sort((a, b) => {
    if (a.status !== b.status) {
      const order: Record<MatchStatus, number> = { bank_only: 0, fec_only: 1, matched: 2 }
      return order[a.status] - order[b.status]
    }
    const da = a.bank?.date ?? a.fec?.date ?? ''
    const db = b.bank?.date ?? b.fec?.date ?? ''
    return da.localeCompare(db)
  })

  return results
}

/* ═══════════════════════════════════════════════════════════
   Extract FEC bank entries (512x accounts)
   ═══════════════════════════════════════════════════════════ */

function extractFecBankEntries(RAW: any, selCo: string[], bankAccount: string): FecLine[] {
  const lines: FecLine[] = []

  for (const co of selCo) {
    // Check bilan data (512 accounts are balance sheet)
    const bn = RAW.companies[co]?.bn ?? {}
    for (const [acc, data] of Object.entries(bn)) {
      if (bankAccount && acc !== bankAccount) continue
      if (!bankAccount && !acc.startsWith('512')) continue
      const entries = (data as any)?.e
      if (!Array.isArray(entries)) continue
      for (const e of entries) {
        lines.push({
          date: e[0], label: e[1], debit: e[2], credit: e[3],
          piece: e[4], account: acc,
        })
      }
    }

    // Also check P&L data in case 512 entries ended up there
    const pn = RAW.companies[co]?.pn ?? {}
    for (const [acc, data] of Object.entries(pn)) {
      if (bankAccount && acc !== bankAccount) continue
      if (!bankAccount && !acc.startsWith('512')) continue
      const entries = (data as any)?.e
      if (!Array.isArray(entries)) continue
      for (const e of entries) {
        lines.push({
          date: e[0], label: e[1], debit: e[2], credit: e[3],
          piece: e[4], account: acc,
        })
      }
    }
  }

  return lines.sort((a, b) => a.date.localeCompare(b.date))
}

/* ═══════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════ */

const STATUS_CONFIG: Record<MatchStatus, { label: string; color: string; bg: string; icon: string }> = {
  matched:   { label: 'Rapproché',  color: '#10b981', bg: 'rgba(16,185,129,0.08)',  icon: '✓' },
  bank_only: { label: 'Banque seul', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '?' },
  fec_only:  { label: 'FEC seul',    color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  icon: '!' },
}

export function Rapprochement() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const [bankLines, setBankLines]       = useState<BankLine[]>([])
  const [csvWarnings, setCsvWarnings]   = useState<string[]>([])
  const [csvHeaders, setCsvHeaders]     = useState<string[]>([])
  const [fileName, setFileName]         = useState<string | null>(null)
  const [bankAccount, setBankAccount]   = useState('')
  const [dateTol, setDateTol]           = useState(3)
  const [amountTol, setAmountTol]       = useState(1)
  const [fuzzyLabel, setFuzzyLabel]     = useState(true)
  const [statusFilter, setStatusFilter] = useState<MatchStatus | 'all'>('all')
  const [searchTerm, setSearchTerm]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  // Available 512x accounts
  const bankAccounts = useMemo(() => {
    if (!RAW) return []
    const accs = new Map<string, string>()
    for (const co of selCo) {
      const bn = RAW.companies[co]?.bn ?? {}
      for (const [acc, data] of Object.entries(bn)) {
        if (acc.startsWith('512')) accs.set(acc, (data as any)?.l ?? acc)
      }
      const pn = RAW.companies[co]?.pn ?? {}
      for (const [acc, data] of Object.entries(pn)) {
        if (acc.startsWith('512')) accs.set(acc, (data as any)?.l ?? acc)
      }
    }
    return [...accs.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [RAW, selCo.join(',')])

  // FEC bank entries
  const fecLines = useMemo(
    () => RAW ? extractFecBankEntries(RAW, selCo, bankAccount) : [],
    [RAW, selCo.join(','), bankAccount]
  )

  // Matching results
  const matchResults = useMemo(() => {
    if (bankLines.length === 0) return []
    return matchEntries(bankLines, fecLines, {
      dateTolerance: dateTol,
      amountTolerance: amountTol,
      fuzzyLabel,
    })
  }, [bankLines, fecLines, dateTol, amountTol, fuzzyLabel])

  // Filtered results
  const filtered = useMemo(() => {
    let res = matchResults
    if (statusFilter !== 'all') res = res.filter(r => r.status === statusFilter)
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      res = res.filter(r =>
        (r.bank?.label ?? '').toLowerCase().includes(q) ||
        (r.fec?.label ?? '').toLowerCase().includes(q) ||
        (r.fec?.piece ?? '').toLowerCase().includes(q)
      )
    }
    return res
  }, [matchResults, statusFilter, searchTerm])

  // Stats
  const stats = useMemo(() => {
    const matched   = matchResults.filter(r => r.status === 'matched').length
    const bankOnly  = matchResults.filter(r => r.status === 'bank_only').length
    const fecOnly   = matchResults.filter(r => r.status === 'fec_only').length
    const totalBank = bankLines.reduce((s, l) => s + l.amount, 0)
    const totalFec  = fecLines.reduce((s, l) => s + (l.credit - l.debit), 0)
    const ecart     = totalBank - totalFec
    const withDelta = matchResults.filter(r => r.status === 'matched' && r.delta).length
    return { matched, bankOnly, fecOnly, totalBank, totalFec, ecart, withDelta, total: matchResults.length }
  }, [matchResults, bankLines, fecLines])

  // CSV import handler
  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return
      const { lines, warnings, headers } = parseBankCsv(text)
      setBankLines(lines)
      setCsvWarnings(warnings)
      setCsvHeaders(headers)
    }
    // Try UTF-8 first, common for French bank exports
    reader.readAsText(file, 'UTF-8')
    // Reset input for re-import
    e.target.value = ''
  }, [])

  const inputSt: React.CSSProperties = {
    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#cbd5e1', padding: '6px 10px', fontSize: 12, outline: 'none',
  }

  if (!RAW) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      Importez un fichier FEC pour utiliser le rapprochement bancaire.
    </div>
  )

  return (
    <div style={{ padding: '16px 24px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 22 }}>🏦</span>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Rapprochement bancaire</h2>
        </div>
        <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>
          Importez un relevé bancaire CSV et rapprochez-le avec les écritures FEC du compte 512.
        </p>
      </div>

      {/* ── Import + Config ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20,
      }}>

        {/* Import CSV */}
        <div style={{
          background: '#0f172a', borderRadius: 12, padding: 16,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Import relevé bancaire
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed rgba(59,130,246,0.3)', borderRadius: 10, padding: '20px 16px',
              textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
              background: bankLines.length > 0 ? 'rgba(16,185,129,0.05)' : 'rgba(59,130,246,0.03)',
            }}
          >
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFile}
              style={{ display: 'none' }} />
            {bankLines.length > 0 ? (
              <>
                <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>{fileName}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                  {bankLines.length} lignes importées · Cliquer pour remplacer
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
                  Cliquer ou glisser un fichier CSV
                </div>
                <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>
                  Formats supportés : CSV, TSV, TXT (séparateur auto-détecté)
                </div>
              </>
            )}
          </div>

          {csvWarnings.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>
                Avertissements ({csvWarnings.length})
              </div>
              {csvWarnings.slice(0, 5).map((w, i) => (
                <div key={i} style={{ fontSize: 10, color: '#94a3b8' }}>{w}</div>
              ))}
              {csvWarnings.length > 5 && (
                <div style={{ fontSize: 10, color: '#475569' }}>+{csvWarnings.length - 5} autres...</div>
              )}
            </div>
          )}

          {csvHeaders.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 9, color: '#334155' }}>
              Colonnes détectées : {csvHeaders.join(' · ')}
            </div>
          )}
        </div>

        {/* Config */}
        <div style={{
          background: '#0f172a', borderRadius: 12, padding: 16,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Paramètres de rapprochement
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Compte bancaire FEC
              </label>
              <select value={bankAccount} onChange={e => setBankAccount(e.target.value)} style={{ ...inputSt, width: '100%' }}>
                <option value="">Tous les comptes 512x</option>
                {bankAccounts.map(([acc, label]) => (
                  <option key={acc} value={acc}>{acc} — {label}</option>
                ))}
              </select>
              <div style={{ fontSize: 9, color: '#334155', marginTop: 2 }}>
                {fecLines.length} écritures FEC trouvées
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Tolérance date (jours)
                </label>
                <input type="number" min={0} max={30} value={dateTol}
                  onChange={e => setDateTol(parseInt(e.target.value) || 0)}
                  style={{ ...inputSt, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Tolérance montant (%)
                </label>
                <input type="number" min={0} max={50} step={0.5} value={amountTol}
                  onChange={e => setAmountTol(parseFloat(e.target.value) || 0)}
                  style={{ ...inputSt, width: '100%' }} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={fuzzyLabel} onChange={e => setFuzzyLabel(e.target.checked)}
                style={{ accentColor: '#8b5cf6' }} />
              <label style={{ fontSize: 11, color: '#94a3b8' }}>
                Rapprochement par libellé (fuzzy matching)
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {bankLines.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Lignes banque',  value: bankLines.length.toString(), sub: fileName ?? '', color: '#3b82f6' },
            { label: 'Écritures FEC',  value: fecLines.length.toString(),  sub: bankAccount || '512x', color: '#8b5cf6' },
            { label: 'Rapprochées',    value: stats.matched.toString(),    sub: stats.total > 0 ? pct(stats.matched / stats.total) : '—', color: '#10b981' },
            { label: 'Banque seul',    value: stats.bankOnly.toString(),   sub: 'Non trouvé dans FEC', color: '#f59e0b' },
            { label: 'FEC seul',       value: stats.fecOnly.toString(),    sub: 'Non trouvé en banque', color: '#ef4444' },
            { label: 'Écart global',   value: `${fmt(stats.ecart)} €`,     sub: 'Banque − FEC', color: Math.abs(stats.ecart) < 1 ? '#10b981' : '#ef4444' },
          ].map(k => (
            <div key={k.label} style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 9, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                {k.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: k.color }}>
                {k.value}
              </div>
              <div style={{ fontSize: 9, color: '#334155', marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary bars ── */}
      {bankLines.length > 0 && stats.total > 0 && (
        <div style={{
          display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 20,
          background: 'rgba(255,255,255,0.03)',
        }}>
          {stats.matched > 0 && (
            <div style={{ width: `${stats.matched / stats.total * 100}%`, background: '#10b981', borderRadius: 2 }}
              title={`${stats.matched} rapprochées`} />
          )}
          {stats.bankOnly > 0 && (
            <div style={{ width: `${stats.bankOnly / stats.total * 100}%`, background: '#f59e0b', borderRadius: 2 }}
              title={`${stats.bankOnly} banque seul`} />
          )}
          {stats.fecOnly > 0 && (
            <div style={{ width: `${stats.fecOnly / stats.total * 100}%`, background: '#ef4444', borderRadius: 2 }}
              title={`${stats.fecOnly} FEC seul`} />
          )}
        </div>
      )}

      {/* ── Filter bar ── */}
      {bankLines.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            {(['all', 'matched', 'bank_only', 'fec_only'] as const).map(f => {
              const cnt = f === 'all' ? stats.total : stats[f === 'matched' ? 'matched' : f === 'bank_only' ? 'bankOnly' : 'fecOnly']
              const lbl = f === 'all' ? 'Tous' : STATUS_CONFIG[f].label
              return (
                <button key={f} onClick={() => setStatusFilter(f)}
                  style={{
                    padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: statusFilter === f ? 'rgba(59,130,246,0.2)' : 'transparent',
                    color: statusFilter === f ? '#93c5fd' : '#475569',
                  }}>
                  {lbl} ({cnt})
                </button>
              )
            })}
          </div>

          <input
            type="text" placeholder="Rechercher..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ ...inputSt, width: 200 }}
          />

          {stats.withDelta > 0 && (
            <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 'auto' }}>
              {stats.withDelta} rapprochement(s) avec écart de montant
            </span>
          )}
        </div>
      )}

      {/* ── Results table ── */}
      {bankLines.length > 0 && filtered.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#0a0f1a', position: 'sticky', top: 0, zIndex: 5 }}>
                <th style={{ padding: '8px 10px', textAlign: 'center', color: '#475569', fontWeight: 600, width: 30, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  Statut
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  Date banque
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 180 }}>
                  Libellé banque
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 90 }}>
                  Montant banque
                </th>
                <th style={{ padding: '8px 4px', textAlign: 'center', color: '#334155', borderBottom: '1px solid rgba(255,255,255,0.08)', width: 30 }}>
                  ↔
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  Date FEC
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 180 }}>
                  Libellé FEC
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 90 }}>
                  Montant FEC
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  Pièce
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 70 }}>
                  Écart
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => {
                const cfg = STATUS_CONFIG[r.status]
                const fecAmt = r.fec ? r.fec.credit - r.fec.debit : null
                return (
                  <tr key={idx} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.025)',
                    background: r.status !== 'matched' ? cfg.bg : 'transparent',
                  }}>
                    <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
                      }}>
                        {cfg.icon}
                      </span>
                    </td>
                    <td style={{ padding: '5px 10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 10 }}>
                      {r.bank?.date ?? '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: r.bank ? '#cbd5e1' : '#334155', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.bank?.label ?? '—'}
                    </td>
                    <td style={{
                      padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600,
                      color: r.bank ? (r.bank.amount >= 0 ? '#10b981' : '#ef4444') : '#334155',
                    }}>
                      {r.bank ? `${fmt(r.bank.amount)} €` : '—'}
                    </td>
                    <td style={{ padding: '5px 4px', textAlign: 'center', color: '#1e293b', fontSize: 10 }}>
                      {r.status === 'matched' ? '═' : '·'}
                    </td>
                    <td style={{ padding: '5px 10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 10 }}>
                      {r.fec?.date ?? '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: r.fec ? '#cbd5e1' : '#334155', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.fec?.label ?? '—'}
                    </td>
                    <td style={{
                      padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600,
                      color: fecAmt !== null ? (fecAmt >= 0 ? '#10b981' : '#ef4444') : '#334155',
                    }}>
                      {fecAmt !== null ? `${fmt(fecAmt)} €` : '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: '#475569', fontFamily: 'monospace', fontSize: 10 }}>
                      {r.fec?.piece ?? '—'}
                    </td>
                    <td style={{
                      padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600,
                      color: r.delta ? (Math.abs(r.delta) < 1 ? '#475569' : '#f59e0b') : '#1e293b',
                    }}>
                      {r.delta !== undefined ? `${r.delta > 0 ? '+' : ''}${fmt(r.delta)} €` : r.status === 'matched' ? '0' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Totals row outside table ── */}
      {bankLines.length > 0 && stats.total > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12,
          padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            <div style={{ fontSize: 9, color: '#475569', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Total banque</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#3b82f6' }}>{fmt(stats.totalBank)} €</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#475569', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Total FEC (512)</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#8b5cf6' }}>{fmt(stats.totalFec)} €</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#475569', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Écart net</div>
            <div style={{
              fontSize: 16, fontWeight: 700, fontFamily: 'monospace',
              color: Math.abs(stats.ecart) < 1 ? '#10b981' : '#ef4444',
            }}>
              {stats.ecart > 0 ? '+' : ''}{fmt(stats.ecart)} €
            </div>
          </div>
        </div>
      )}

      {/* ── Empty states ── */}
      {bankLines.length === 0 && (
        <div style={{
          padding: 40, borderRadius: 12, background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', marginTop: 10,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏦</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
            Importez votre relevé bancaire
          </div>
          <div style={{ fontSize: 12, color: '#475569', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
            Glissez un fichier CSV de votre banque dans la zone d'import ci-dessus.<br />
            Le système détectera automatiquement le format et rapprochera<br />
            les lignes avec les écritures du compte 512 de votre FEC.
          </div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 20 }}>
            {[
              { icon: '📅', text: 'Tolérance date configurable' },
              { icon: '💶', text: 'Matching par montant' },
              { icon: '🔍', text: 'Rapprochement fuzzy libellé' },
            ].map(f => (
              <div key={f.text} style={{ fontSize: 11, color: '#64748b' }}>
                <span style={{ marginRight: 4 }}>{f.icon}</span>{f.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {bankLines.length > 0 && filtered.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#475569', fontSize: 12 }}>
          Aucun résultat avec les filtres actuels.
        </div>
      )}
    </div>
  )
}
