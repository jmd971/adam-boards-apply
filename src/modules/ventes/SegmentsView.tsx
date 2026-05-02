import React, { useState, useMemo } from 'react'
import { KpiCard } from '@/components/ui'
import { fmt } from '@/lib/calc'
import { SEGMENT_LABELS, SEGMENT_COLORS, exportToGHL, type ClientRFM, type RFMSegment } from '@/lib/rfm'

interface Props { clients: ClientRFM[] }

type SortKey = 'ca' | 'visits' | 'recent' | 'nom'

const SCORE_ICON = ['', '❄️', '🌡️', '🌤️', '☀️'] as const

const ALL_SEGS: (RFMSegment | 'all')[] = ['all','champion','fidele','potentiel','one_shot','a_risque','perdu']

export function SegmentsView({ clients }: Props) {
  const [filterSeg, setFilterSeg] = useState<RFMSegment | 'all'>('all')
  const [sort,      setSort]      = useState<SortKey>('ca')
  const [sortAsc,   setSortAsc]   = useState(false)

  const segCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const cl of clients) c[cl.segment] = (c[cl.segment] ?? 0) + 1
    return c
  }, [clients])

  const filtered = useMemo(() => {
    const list = filterSeg === 'all' ? clients : clients.filter(c => c.segment === filterSeg)
    return [...list].sort((a, b) => {
      let d = 0
      if (sort === 'ca')     d = b.ca - a.ca
      if (sort === 'visits') d = b.nbVisites - a.nbVisites
      if (sort === 'recent') d = a.daysSinceLast - b.daysSinceLast
      if (sort === 'nom')    d = a.nom.localeCompare(b.nom)
      return sortAsc ? -d : d
    })
  }, [clients, filterSeg, sort, sortAsc])

  const totalCA   = clients.reduce((s, c) => s + c.ca, 0)
  const champions = clients.filter(c => c.segment === 'champion').length
  const oneShot   = clients.filter(c => c.segment === 'one_shot').length

  const handleSort = (k: SortKey) => { if (sort === k) setSortAsc(a => !a); else { setSort(k); setSortAsc(false) } }

  const thSt = (k: SortKey, left = false): React.CSSProperties => ({
    padding:'8px 10px', textAlign: left ? 'left' : 'right',
    color: sort === k ? 'var(--blue)' : 'var(--text-2)',
    fontWeight:700, fontSize:11, cursor:'pointer', userSelect:'none',
    borderBottom:'2px solid var(--border-1)', whiteSpace:'nowrap',
    background:'var(--bg-1)', position:'sticky', top:0, zIndex: left ? 6 : 5,
  })

  const segBadge = (seg: RFMSegment) => (
    <span style={{
      display:'inline-block', padding:'2px 8px', borderRadius:12,
      fontSize:10, fontWeight:700,
      background: SEGMENT_COLORS[seg] + '22',
      color: SEGMENT_COLORS[seg],
      border: `1px solid ${SEGMENT_COLORS[seg]}44`,
    }}>
      {SEGMENT_LABELS[seg]}
    </span>
  )

  return (
    <div style={{ padding:'16px 24px' }}>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard label="Clients analysés" value={String(clients.length)}  color="var(--blue)" />
        <KpiCard label="CA total"         value={`${fmt(totalCA)} €`}     color="var(--green)" />
        <KpiCard label="Champions"        value={String(champions)}        color="var(--green)"
          sub={clients.length ? `${Math.round(champions / clients.length * 100)}% des clients` : undefined} />
        <KpiCard label="One-shot"         value={String(oneShot)}          color="var(--amber)"
          sub={clients.length ? `${Math.round(oneShot / clients.length * 100)}% à reconquérir` : undefined} />
      </div>

      {/* Filtres segment */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--text-3)' }}>Filtrer :</span>
        {ALL_SEGS.map(s => {
          const active = filterSeg === s
          const label  = s === 'all' ? 'Tous' : SEGMENT_LABELS[s]
          const count  = s === 'all' ? clients.length : (segCounts[s] ?? 0)
          const color  = s === 'all' ? 'var(--text-2)' : SEGMENT_COLORS[s]
          return (
            <button key={s} onClick={() => setFilterSeg(s)} style={{
              padding:'4px 12px', borderRadius:20,
              border:`1px solid ${active ? color : 'var(--border-1)'}`,
              background: active ? color + '22' : 'transparent',
              color: active ? color : 'var(--text-2)',
              fontSize:11, fontWeight:600, cursor:'pointer',
            }}>
              {label} <span style={{ opacity:0.7 }}>({count})</span>
            </button>
          )
        })}
        <button onClick={() => exportToGHL(filtered, filterSeg === 'all' ? undefined : filterSeg)}
          style={{ marginLeft:'auto', padding:'5px 14px', borderRadius:8, border:'1px solid var(--border-1)', background:'var(--bg-1)', color:'var(--text-1)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
          ↓ Export GHL ({filtered.length})
        </button>
      </div>

      {/* Tableau */}
      <div style={{ borderRadius:'var(--radius-lg)', border:'1px solid var(--border-1)', overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr>
              <th style={{ ...thSt('nom', true), minWidth:200, paddingLeft:16, left:0 }} onClick={() => handleSort('nom')}>
                Client {sort === 'nom' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={{ ...thSt('ca'), minWidth:100 }} onClick={() => handleSort('ca')}>
                CA total {sort === 'ca' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={{ ...thSt('visits'), minWidth:80 }} onClick={() => handleSort('visits')}>
                Visites {sort === 'visits' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={{ ...thSt('recent'), minWidth:120 }} onClick={() => handleSort('recent')}>
                Dernière visite {sort === 'recent' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={{ ...thSt('nom'), minWidth:90, cursor:'default' }}>R · F · M</th>
              <th style={{ ...thSt('nom'), minWidth:110, cursor:'default' }}>Segment</th>
              <th style={{ ...thSt('nom'), minWidth:60, cursor:'default', textAlign:'right', paddingRight:16 }}>GHL</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.key} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding:'9px 10px 9px 16px', color:'var(--text-0)', fontWeight:500, position:'sticky', left:0, background:'var(--bg-0)', zIndex:2 }}>
                  <div>{c.nom}</div>
                  {c.email && <div style={{ fontSize:9, color:'var(--text-3)', marginTop:1 }}>{c.email}</div>}
                </td>
                <td style={{ padding:'9px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'var(--green)' }}>
                  {fmt(c.ca)} €
                </td>
                <td style={{ padding:'9px 10px', textAlign:'right', color:'var(--text-1)' }}>{c.nbVisites}</td>
                <td style={{ padding:'9px 10px', textAlign:'right', fontFamily:'monospace', color: c.daysSinceLast > 180 ? 'var(--red)' : c.daysSinceLast > 90 ? 'var(--amber)' : 'var(--text-1)' }}>
                  {c.lastDate}
                  <div style={{ fontSize:9, color:'var(--text-3)' }}>J-{c.daysSinceLast}</div>
                </td>
                <td style={{ padding:'9px 10px', textAlign:'center', fontSize:14, letterSpacing:2 }}>
                  {SCORE_ICON[c.scoreR]}{SCORE_ICON[c.scoreF]}{SCORE_ICON[c.scoreM]}
                </td>
                <td style={{ padding:'9px 10px' }}>{segBadge(c.segment)}</td>
                <td style={{ padding:'9px 16px 9px 10px', textAlign:'right' }}>
                  <button onClick={() => exportToGHL([c])} style={{
                    padding:'3px 8px', border:'1px solid var(--border-1)', borderRadius:6,
                    background:'transparent', color:'var(--text-2)', fontSize:10, cursor:'pointer',
                  }}>↓</button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7} style={{ padding:'32px', textAlign:'center', color:'var(--text-3)', fontSize:12 }}>
                  Aucun client dans ce segment
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
