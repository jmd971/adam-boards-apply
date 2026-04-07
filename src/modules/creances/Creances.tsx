import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { EcrituresModal } from '@/components/ui'

const TODAY = new Date()

const BUCKETS = [
  { label: '> 90 jours',  color: '#ef4444', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.2)',  icon: '🔴', tag: 'Critique' },
  { label: '60 – 90 j',   color: '#f97316', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.18)', icon: '🟠', tag: 'Risque' },
  { label: '30 – 60 j',   color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.18)', icon: '🟡', tag: 'À surveiller' },
  { label: '< 30 jours',  color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.18)', icon: '🔵', tag: 'Courant' },
  { label: 'Non échu',    color: '#22c55e', bg: 'rgba(34,197,94,0.05)',   border: 'rgba(34,197,94,0.15)',  icon: '🟢', tag: 'OK' },
]

function ageDays(dateStr: string): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  return Math.round((TODAY.getTime() - d.getTime()) / 86400000)
}

function getBucket(days: number): number {
  if (days > 90) return 0
  if (days > 60) return 1
  if (days > 30) return 2
  if (days >= 0) return 3
  return 4
}

function formatDate(d: string): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

interface InvoiceLine {
  date: string
  label: string
  debit: number
  credit: number
  piece: string
  age: number
  bucket: number
}

interface ClientRow {
  name: string
  account: string
  total: number
  bk: number
  entries: any[]
  invoices: InvoiceLine[]
  oldest: string
  oldestDays: number
  nbInvoices: number
}

export function Creances() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const [modal, setModal]         = useState<{ title: string; entries: any[]; cumN: number; cumN1: number } | null>(null)
  const [search, setSearch]       = useState('')
  const [expanded, setExpanded]   = useState<Record<string, boolean>>({})
  const [viewMode, setViewMode]   = useState<'buckets' | 'clients'>('buckets')
  const [bucketFilter, setBucketFilter] = useState<number | null>(null)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const toggleExpand = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  const { byBucket, allClients, totalCreances, dso } = useMemo(() => {
    if (!RAW) return { byBucket: BUCKETS.map(() => []) as ClientRow[][], allClients: [] as ClientRow[], totalCreances: 0, dso: null }

    const map: Record<string, ClientRow> = {}

    for (const co of selCo) {
      const bn = RAW.companies[co]?.bn ?? {}
      for (const [acc, acctData] of Object.entries(bn)) {
        if (!acc.startsWith('41') || acc.startsWith('419')) continue
        const data = acctData as any
        const lbl = data?.l || acc
        const entries: any[] = data?.e ?? []
        const topArr: any[] = data?.top ?? []

        if (entries.length > 0) {
          let soldeReel = 0
          let oldestUnpaid = ''
          const invoices: InvoiceLine[] = []

          for (const e of entries) {
            const debit = e[2] || 0
            const credit = e[3] || 0
            soldeReel += debit - credit
          }

          if (Math.round(soldeReel) <= 0) continue

          for (const e of entries) {
            const debit = e[2] || 0
            const credit = e[3] || 0
            const dateStr = String(e[0] || '')
            const age = ageDays(dateStr)
            invoices.push({
              date: dateStr,
              label: String(e[1] || ''),
              debit,
              credit,
              piece: String(e[4] || ''),
              age,
              bucket: getBucket(age),
            })
            if (debit > 0) {
              if (!oldestUnpaid || dateStr < oldestUnpaid) oldestUnpaid = dateStr
            }
          }

          const days = ageDays(oldestUnpaid)
          const bk = getBucket(days)
          const nbInvoices = invoices.filter(inv => inv.debit > 0).length

          if (!map[acc]) map[acc] = { name: lbl, account: acc, total: 0, bk: 4, entries: [], invoices: [], oldest: '', oldestDays: 0, nbInvoices: 0 }
          map[acc].total = Math.round(soldeReel)
          map[acc].entries = entries
          map[acc].invoices = invoices.sort((a, b) => a.date.localeCompare(b.date))
          map[acc].oldest = oldestUnpaid
          map[acc].oldestDays = days
          map[acc].bk = bk
          map[acc].nbInvoices = nbInvoices

        } else if (topArr.length > 0) {
          for (const t of topArr) {
            const [cAux, cLbl, montant] = t
            if ((montant || 0) <= 0) continue
            const key = `${acc}__${cAux}`
            if (!map[key]) map[key] = { name: String(cLbl || cAux), account: String(cAux), total: 0, bk: 3, entries: [], invoices: [], oldest: '', oldestDays: 0, nbInvoices: 0 }
            map[key].total += Math.round(montant)
          }
        } else if ((data?.s || 0) > 0) {
          if (!map[acc]) map[acc] = { name: lbl, account: acc, total: 0, bk: 3, entries: [], invoices: [], oldest: '', oldestDays: 0, nbInvoices: 0 }
          map[acc].total += Math.round(data.s)
        }
      }
    }

    const allClients = Object.values(map).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
    const byBucket: ClientRow[][] = BUCKETS.map(() => [])
    for (const c of allClients) byBucket[c.bk].push(c)

    const totalCreances = allClients.reduce((s, c) => s + c.total, 0)

    // DSO
    let ca = 0
    if (RAW.mn?.length) {
      for (const m of RAW.mn) {
        for (const co of selCo) {
          const pn = RAW.companies[co]?.pn ?? {}
          for (const [acc, d] of Object.entries(pn)) {
            if (!['706', '707', '708'].some(p => acc.startsWith(p))) continue
            const mo = (d as any)?.mo?.[m]
            if (mo && Array.isArray(mo)) ca += Math.max(0, mo[1] - mo[0])
          }
        }
      }
    }
    const dso = ca > 0 && RAW.mn?.length ? Math.round(totalCreances / (ca / RAW.mn.length) * 30) : null

    return { byBucket, allClients, totalCreances, dso }
  }, [RAW, selCo.join(',')])

  // Apply filters
  const filteredClients = useMemo(() => {
    let list = bucketFilter !== null ? byBucket[bucketFilter] : allClients
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.account.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => b.total - a.total)
  }, [allClients, byBucket, bucketFilter, search])

  const filteredByBucket = useMemo(() => {
    if (!search.trim()) return byBucket
    const q = search.toLowerCase()
    return byBucket.map(bk => bk.filter(c =>
      c.name.toLowerCase().includes(q) || c.account.toLowerCase().includes(q)
    ))
  }, [byBucket, search])

  if (!RAW) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: '#64748b', fontSize: 13 }}>Aucune donnée.</div>

  const secTotals = byBucket.map(bk => bk.reduce((s, c) => s + c.total, 0))
  const nbTotal = allClients.length
  return (
    <>
      <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>

        {/* ── Titre ── */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', margin: '0 0 4px' }}>
            Créances clients
          </h2>
          <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>
            Balance âgée des comptes clients (41x) · {nbTotal} client{nbTotal > 1 ? 's' : ''} avec solde dû
          </p>
        </div>

        {/* ── KPIs principaux ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ background: '#0f172a', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)', gridColumn: 'span 1' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Total créances</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: '#f59e0b' }}>{fmt(totalCreances)} €</div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>{nbTotal} client{nbTotal > 1 ? 's' : ''}</div>
          </div>
          <div style={{ background: '#0f172a', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>DSO (délai moyen)</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: dso ? (dso > 60 ? '#ef4444' : dso > 30 ? '#f59e0b' : '#10b981') : '#475569' }}>
              {dso !== null ? `${dso} j` : '—'}
            </div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>Objectif : &lt; 45 jours</div>
          </div>
          <div style={{ background: '#0f172a', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Échu (&gt; 30 j)</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: '#ef4444' }}>{fmt(secTotals[0] + secTotals[1] + secTotals[2])} €</div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>
              {totalCreances > 0 ? `${Math.round((secTotals[0] + secTotals[1] + secTotals[2]) / totalCreances * 100)}% du total` : '—'}
            </div>
          </div>
          <div style={{ background: '#0f172a', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(59,130,246,0.15)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Courant (&lt; 30 j)</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: '#3b82f6' }}>{fmt(secTotals[3])} €</div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>{byBucket[3].length} client{byBucket[3].length > 1 ? 's' : ''}</div>
          </div>
          <div style={{ background: '#0f172a', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(34,197,94,0.15)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Non échu</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: '#22c55e' }}>{fmt(secTotals[4])} €</div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>{byBucket[4].length} client{byBucket[4].length > 1 ? 's' : ''}</div>
          </div>
        </div>

        {/* ── Balance âgée résumé ── */}
        <div style={{
          background: '#0f172a', borderRadius: 12, padding: '16px 20px', marginBottom: 20,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>
            Répartition par ancienneté
          </div>

          {/* Visual bar */}
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', gap: 2, marginBottom: 14 }}>
            {BUCKETS.map((bk, i) => {
              const p = totalCreances > 0 ? (secTotals[i] / totalCreances) * 100 : 0
              if (p < 0.3) return null
              return (
                <div key={i}
                  onClick={() => setBucketFilter(bucketFilter === i ? null : i)}
                  style={{
                    width: `${p}%`, background: bk.color, opacity: bucketFilter === null || bucketFilter === i ? 0.85 : 0.25,
                    cursor: 'pointer', transition: 'opacity 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#fff',
                    minWidth: p > 5 ? undefined : 0,
                  }}
                  title={`${bk.label}: ${fmt(secTotals[i])} €`}
                >
                  {p > 8 ? `${Math.round(p)}%` : ''}
                </div>
              )
            })}
          </div>

          {/* Legend grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {BUCKETS.map((bk, i) => {
              const isActive = bucketFilter === i
              return (
                <button key={i}
                  onClick={() => setBucketFilter(bucketFilter === i ? null : i)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '10px 8px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                    background: isActive ? bk.bg : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? bk.color + '60' : 'rgba(255,255,255,0.04)'}`,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: bk.color }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: bk.color }}>{bk.label}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: bk.color }}>
                    {fmt(secTotals[i])} €
                  </div>
                  <div style={{ fontSize: 9, color: '#475569' }}>
                    {byBucket[i].length} client{byBucket[i].length > 1 ? 's' : ''}
                    {totalCreances > 0 ? ` · ${Math.round(secTotals[i] / totalCreances * 100)}%` : ''}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          {/* View mode */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            {([['buckets', 'Par délai'], ['clients', 'Par client']] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{
                  padding: '6px 14px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: viewMode === mode ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: viewMode === mode ? '#93c5fd' : '#475569',
                }}>
                {label}
              </button>
            ))}
          </div>

          {bucketFilter !== null && (
            <button onClick={() => setBucketFilter(null)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: BUCKETS[bucketFilter].bg, border: `1px solid ${BUCKETS[bucketFilter].border}`,
                color: BUCKETS[bucketFilter].color,
              }}>
              {BUCKETS[bucketFilter].icon} {BUCKETS[bucketFilter].label} ✕
            </button>
          )}

          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client..."
            style={{
              padding: '7px 12px', borderRadius: 8, background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', fontSize: 12,
              outline: 'none', width: 220, marginLeft: 'auto',
            }} />
        </div>

        {/* ── Avertissement si pas d'entrées ── */}
        {nbTotal > 0 && allClients.every(c => c.entries.length === 0) && (
          <div style={{
            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
            borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: '#f59e0b',
          }}>
            Les données ne contiennent pas d'écritures détaillées — le calcul d'ancienneté n'est pas disponible. Réimportez le FEC avec les écritures détaillées.
          </div>
        )}

        {/* ── Vue par délai (buckets) ── */}
        {viewMode === 'buckets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {BUCKETS.map((bk, bi) => {
              if (bucketFilter !== null && bucketFilter !== bi) return null
              const clients = [...(search ? filteredByBucket[bi] : byBucket[bi])].sort((a, b) => b.total - a.total)
              if (!clients.length) return null

              return (
                <div key={bi} style={{ borderRadius: 12, border: `1px solid ${bk.border}`, overflow: 'hidden' }}>
                  {/* Section header */}
                  <div style={{
                    padding: '14px 20px', background: bk.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{bk.icon}</span>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 800, color: bk.color }}>{bk.label}</span>
                        <span style={{
                          marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 10,
                          background: bk.color + '20', color: bk.color, fontWeight: 600,
                        }}>
                          {bk.tag}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: bk.color }}>
                        {fmt(secTotals[bi])} €
                      </div>
                      <div style={{ fontSize: 10, color: '#475569' }}>
                        {clients.length} client{clients.length > 1 ? 's' : ''}
                        {totalCreances > 0 ? ` · ${Math.round(secTotals[bi] / totalCreances * 100)}%` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Client list */}
                  <div style={{ background: '#080d1a' }}>
                    {clients.map((c, ci) => {
                      const key = c.account
                      const isExpanded = expanded[key]
                      const pct = totalCreances > 0 ? (c.total / totalCreances) * 100 : 0

                      return (
                        <div key={ci}>
                          {/* Client row */}
                          <div
                            onClick={() => c.entries.length > 0 && toggleExpand(key)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 100px 120px 90px 100px 80px',
                              alignItems: 'center',
                              padding: '12px 20px',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                              cursor: c.entries.length > 0 ? 'pointer' : 'default',
                              background: isExpanded ? 'rgba(255,255,255,0.02)' : ci % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.008)',
                              transition: 'background 0.1s',
                            }}
                          >
                            {/* Nom client */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              {c.entries.length > 0 && (
                                <span style={{
                                  fontSize: 10, color: '#475569', transition: 'transform 0.15s',
                                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                                  flexShrink: 0,
                                }}>
                                  ▶
                                </span>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {c.name}
                                </div>
                                <div style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace' }}>{c.account}</div>
                              </div>
                            </div>

                            {/* Montant */}
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: bk.color }}>
                                {fmt(c.total)} €
                              </div>
                            </div>

                            {/* Barre % */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <div style={{ height: 6, width: 60, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: bk.color, width: `${Math.min(100, pct * 2)}%`, opacity: 0.7, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, color: '#64748b', minWidth: 40, textAlign: 'right', fontFamily: 'monospace' }}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>

                            {/* Ancienneté */}
                            <div style={{ textAlign: 'right' }}>
                              {c.oldestDays > 0 ? (
                                <span style={{
                                  fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                                  color: c.oldestDays > 90 ? '#ef4444' : c.oldestDays > 60 ? '#f97316' : c.oldestDays > 30 ? '#f59e0b' : '#3b82f6',
                                }}>
                                  {c.oldestDays} j
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: '#334155' }}>—</span>
                              )}
                            </div>

                            {/* Date + ancienne */}
                            <div style={{ textAlign: 'right', fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
                              {formatDate(c.oldest)}
                            </div>

                            {/* Nb factures */}
                            <div style={{ textAlign: 'right' }}>
                              {c.nbInvoices > 0 ? (
                                <span style={{ fontSize: 11, color: '#64748b' }}>
                                  {c.nbInvoices} fact.
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, color: '#1e293b' }}>—</span>
                              )}
                            </div>
                          </div>

                          {/* ── Expanded: invoice detail ── */}
                          {isExpanded && c.invoices.length > 0 && (
                            <div style={{
                              padding: '0 20px 12px 48px',
                              background: 'rgba(255,255,255,0.015)',
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                            }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                  <tr>
                                    {['Date', 'Libellé', 'Pièce', 'Débit', 'Crédit', 'Ancienneté'].map(h => (
                                      <th key={h} style={{
                                        padding: '6px 8px',
                                        textAlign: h === 'Libellé' || h === 'Pièce' ? 'left' : 'right',
                                        fontSize: 9, fontWeight: 600, color: '#334155', textTransform: 'uppercase',
                                        letterSpacing: '0.4px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                      }}>
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.invoices.map((inv, ii) => {
                                    const invBk = BUCKETS[inv.bucket]
                                    return (
                                      <tr key={ii} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8', fontSize: 10 }}>
                                          {formatDate(inv.date)}
                                        </td>
                                        <td style={{ padding: '5px 8px', color: '#cbd5e1', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {inv.label || '—'}
                                        </td>
                                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#475569', fontSize: 10 }}>
                                          {inv.piece || '—'}
                                        </td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: inv.debit > 0 ? 600 : 400, color: inv.debit > 0 ? '#ef4444' : '#1e293b' }}>
                                          {inv.debit > 0 ? fmt(inv.debit) : ''}
                                        </td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: inv.credit > 0 ? 600 : 400, color: inv.credit > 0 ? '#10b981' : '#1e293b' }}>
                                          {inv.credit > 0 ? fmt(inv.credit) : ''}
                                        </td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                          {inv.age > 0 ? (
                                            <span style={{
                                              fontSize: 10, fontWeight: 600, fontFamily: 'monospace', padding: '1px 6px',
                                              borderRadius: 6, background: invBk.bg, color: invBk.color,
                                            }}>
                                              {inv.age} j
                                            </span>
                                          ) : '—'}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <td colSpan={3} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#64748b' }}>
                                      Solde client
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444', fontSize: 11 }}>
                                      {fmt(c.invoices.reduce((s, inv) => s + inv.debit, 0))}
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#10b981', fontSize: 11 }}>
                                      {fmt(c.invoices.reduce((s, inv) => s + inv.credit, 0))}
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: bk.color, fontSize: 12 }}>
                                      = {fmt(c.total)} €
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>

                              {/* Button to open full modal */}
                              <div style={{ marginTop: 6, textAlign: 'right' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setModal({ title: `${c.name} — Écritures`, entries: c.entries, cumN: c.total, cumN1: 0 }) }}
                                  style={{
                                    padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                    background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#93c5fd',
                                  }}>
                                  Voir toutes les écritures ({c.entries.length})
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Vue par client (tableau unique) ── */}
        {viewMode === 'clients' && (
          <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 120px 80px 90px 90px 70px',
              padding: '10px 20px',
              background: '#0a0f1a',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              {['Client', 'Montant dû', '% total', 'Délai', 'Ancienneté', 'Fact. + anc.', 'Détail'].map((h, i) => (
                <div key={h} style={{
                  fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px',
                  textAlign: i === 0 ? 'left' : 'right',
                }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Client rows */}
            <div style={{ background: '#080d1a' }}>
              {filteredClients.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#334155', fontSize: 12 }}>
                  {search ? `Aucun résultat pour "${search}"` : 'Aucune créance client.'}
                </div>
              ) : filteredClients.map((c, ci) => {
                const bk = BUCKETS[c.bk]
                const key = c.account
                const isExpanded = expanded[key]
                const pctVal = totalCreances > 0 ? (c.total / totalCreances) * 100 : 0

                return (
                  <div key={ci}>
                    <div
                      onClick={() => c.entries.length > 0 && toggleExpand(key)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px 120px 80px 90px 90px 70px',
                        alignItems: 'center',
                        padding: '10px 20px',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        cursor: c.entries.length > 0 ? 'pointer' : 'default',
                        background: isExpanded ? 'rgba(255,255,255,0.02)' : ci % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.008)',
                      }}
                    >
                      {/* Client */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: bk.color, flexShrink: 0 }} />
                        {c.entries.length > 0 && (
                          <span style={{ fontSize: 9, color: '#475569', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▶</span>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                          <div style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace' }}>{c.account}</div>
                        </div>
                      </div>

                      {/* Montant */}
                      <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: bk.color }}>
                        {fmt(c.total)} €
                      </div>

                      {/* % barre */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <div style={{ height: 6, width: 60, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: bk.color, width: `${Math.min(100, pctVal * 2)}%`, opacity: 0.7, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', minWidth: 36, textAlign: 'right' }}>{pctVal.toFixed(1)}%</span>
                      </div>

                      {/* Délai badge */}
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                          background: bk.bg, color: bk.color, border: `1px solid ${bk.border}`,
                        }}>
                          {bk.tag}
                        </span>
                      </div>

                      {/* Ancienneté */}
                      <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: c.oldestDays > 0 ? bk.color : '#1e293b' }}>
                        {c.oldestDays > 0 ? `${c.oldestDays} j` : '—'}
                      </div>

                      {/* Date */}
                      <div style={{ textAlign: 'right', fontSize: 10, fontFamily: 'monospace', color: '#64748b' }}>
                        {formatDate(c.oldest)}
                      </div>

                      {/* Detail */}
                      <div style={{ textAlign: 'right' }}>
                        {c.entries.length > 0 ? (
                          <span style={{ fontSize: 10, color: '#475569' }}>{c.nbInvoices} fact.</span>
                        ) : '—'}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && c.invoices.length > 0 && (
                      <div style={{
                        padding: '0 20px 12px 48px',
                        background: 'rgba(255,255,255,0.015)',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr>
                              {['Date', 'Libellé', 'Pièce', 'Débit', 'Crédit', 'Ancienneté'].map(h => (
                                <th key={h} style={{
                                  padding: '6px 8px',
                                  textAlign: h === 'Libellé' || h === 'Pièce' ? 'left' : 'right',
                                  fontSize: 9, fontWeight: 600, color: '#334155', textTransform: 'uppercase',
                                  letterSpacing: '0.4px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {c.invoices.map((inv, ii) => {
                              const invBk = BUCKETS[inv.bucket]
                              return (
                                <tr key={ii} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8', fontSize: 10 }}>
                                    {formatDate(inv.date)}
                                  </td>
                                  <td style={{ padding: '5px 8px', color: '#cbd5e1', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {inv.label || '—'}
                                  </td>
                                  <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#475569', fontSize: 10 }}>
                                    {inv.piece || '—'}
                                  </td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: inv.debit > 0 ? 600 : 400, color: inv.debit > 0 ? '#ef4444' : '#1e293b' }}>
                                    {inv.debit > 0 ? fmt(inv.debit) : ''}
                                  </td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: inv.credit > 0 ? 600 : 400, color: inv.credit > 0 ? '#10b981' : '#1e293b' }}>
                                    {inv.credit > 0 ? fmt(inv.credit) : ''}
                                  </td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                    {inv.age > 0 ? (
                                      <span style={{
                                        fontSize: 10, fontWeight: 600, fontFamily: 'monospace', padding: '1px 6px',
                                        borderRadius: 6, background: invBk.bg, color: invBk.color,
                                      }}>
                                        {inv.age} j
                                      </span>
                                    ) : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                              <td colSpan={3} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#64748b' }}>Solde</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444', fontSize: 11 }}>
                                {fmt(c.invoices.reduce((s, inv) => s + inv.debit, 0))}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#10b981', fontSize: 11 }}>
                                {fmt(c.invoices.reduce((s, inv) => s + inv.credit, 0))}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: bk.color, fontSize: 12 }}>
                                = {fmt(c.total)} €
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                        <div style={{ marginTop: 6, textAlign: 'right' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setModal({ title: `${c.name} — Écritures`, entries: c.entries, cumN: c.total, cumN1: 0 }) }}
                            style={{
                              padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#93c5fd',
                            }}>
                            Voir toutes les écritures ({c.entries.length})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {allClients.length === 0 && (
          <div style={{
            padding: 40, textAlign: 'center', color: '#475569', fontSize: 12,
            background: '#0f172a', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            Aucune créance client détectée dans ce FEC.
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 10, color: '#334155' }}>
          Comptes 41x (hors 419). Solde = factures (débit) − paiements (crédit). Cliquez sur un client pour voir le détail des factures.
        </div>
      </div>

      {modal && <EcrituresModal {...modal} onClose={() => setModal(null)} />}
    </>
  )
}
