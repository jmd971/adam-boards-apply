import { useState, useMemo } from 'react'
import { fmt } from '@/lib/calc'
import { SEGMENT_LABELS, SEGMENT_COLORS, type ClientRFM } from '@/lib/rfm'

interface Props {
  clients: ClientRFM[]
}

function formatDuration(days: number): string {
  if (days >= 365) {
    const y = Math.floor(days / 365)
    return `${y} an${y > 1 ? 's' : ''}`
  }
  if (days >= 30) return `${Math.floor(days / 30)} mois`
  return `${days} j`
}

function urgencyColor(days: number) {
  if (days >= 365) return { bg: 'rgba(239,68,68,0.12)',   color: 'var(--red)' }
  if (days >= 180) return { bg: 'rgba(249,115,22,0.12)',  color: 'var(--orange)' }
  return                  { bg: 'rgba(245,158,11,0.12)',  color: 'var(--amber)' }
}

export function InactifsView({ clients }: Props) {
  const [threshold, setThreshold] = useState(90)
  const [unit,      setUnit]      = useState<'jours' | 'mois'>('jours')

  const thresholdDays = unit === 'mois' ? threshold * 30 : threshold

  const inactifs = useMemo(
    () => clients
      .filter(c => c.daysSinceLast >= thresholdDays)
      .sort((a, b) => b.daysSinceLast - a.daysSinceLast),
    [clients, thresholdDays]
  )

  const exportCSV = () => {
    const rows = [
      ['Client', 'Dernier achat', 'Inactif depuis (jours)', 'CA total (€)', 'Segment', 'Nb visites'],
      ...inactifs.map(c => [
        c.nom,
        c.lastDate,
        String(c.daysSinceLast),
        c.ca.toFixed(2),
        SEGMENT_LABELS[c.segment],
        String(c.nbVisites),
      ]),
    ]
    const csv = rows
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(
      new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    )
    a.download = `clients_inactifs_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  if (clients.length === 0) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
          Aucun client disponible
        </div>
        Importez un FEC contenant des comptes 411 avec CompAux,<br />
        ou saisissez des ventes dans le module <strong style={{ color: 'var(--blue)' }}>Saisie</strong>.
      </div>
    )
  }

  const caInactifs = inactifs.reduce((s, c) => s + c.ca, 0)

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Sélecteur de seuil */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 16px', borderRadius: 10,
        background: 'var(--bg-1)', border: '1px solid var(--border-0)',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>
          Clients non venus depuis plus de
        </span>

        <input
          type="number"
          min={1}
          max={unit === 'mois' ? 120 : 3650}
          value={threshold}
          onChange={e => setThreshold(Math.max(1, parseInt(e.target.value) || 1))}
          style={{
            width: 72, padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border-1)', background: 'var(--bg-2)',
            color: 'var(--text-0)', fontSize: 14, textAlign: 'center', fontWeight: 700,
          }}
        />

        <div style={{ display: 'flex', gap: 4 }}>
          {(['jours', 'mois'] as const).map(u => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              style={{
                padding: '5px 12px', borderRadius: 6,
                border: '1px solid',
                borderColor: unit === u ? 'var(--blue)' : 'var(--border-1)',
                background: unit === u ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: unit === u ? '#93c5fd' : 'var(--text-2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Résumé */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            <strong style={{ color: inactifs.length > 0 ? 'var(--amber)' : 'var(--green)', fontSize: 16 }}>
              {inactifs.length}
            </strong>{' '}
            / {clients.length} clients inactifs
            {inactifs.length > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>
                · CA concerné :{' '}
                <strong style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--amber)' }}>
                  {fmt(caInactifs)} €
                </strong>
              </span>
            )}
          </span>
          {inactifs.length > 0 && (
            <button
              onClick={exportCSV}
              style={{
                padding: '5px 12px', borderRadius: 8,
                border: '1px solid var(--border-1)', background: 'var(--bg-2)',
                color: 'var(--text-1)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ↓ Export CSV
            </button>
          )}
        </div>
      </div>

      {/* État vide positif */}
      {inactifs.length === 0 && (
        <div style={{
          padding: 28, textAlign: 'center',
          background: 'rgba(34,197,94,0.06)', borderRadius: 10,
          border: '1px solid rgba(34,197,94,0.2)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>
            Tous vos clients sont actifs sur la période sélectionnée.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
            Aucun client absent depuis plus de {threshold} {unit}.
          </div>
        </div>
      )}

      {/* Tableau inactifs */}
      {inactifs.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-0)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {[
                  { label: 'Client',           left: true },
                  { label: 'Dernier achat',    left: false },
                  { label: 'Inactif depuis',   left: false },
                  { label: 'CA total',         left: false },
                  { label: 'Segment',          left: false },
                  { label: 'Visites',          left: false },
                ].map(col => (
                  <th
                    key={col.label}
                    style={{
                      padding: '8px 10px',
                      textAlign: col.left ? 'left' : 'center',
                      color: 'var(--text-2)', fontWeight: 700, fontSize: 11,
                      borderBottom: '2px solid var(--border-1)',
                      background: 'var(--bg-1)',
                      position: 'sticky', top: 0,
                      zIndex: col.left ? 6 : 5,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inactifs.map((c, i) => {
                const urg = urgencyColor(c.daysSinceLast)
                return (
                  <tr
                    key={c.key}
                    style={{
                      borderBottom: '1px solid var(--border-0)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}
                  >
                    {/* Client */}
                    <td style={{
                      padding: '8px 10px', color: 'var(--text-0)', fontWeight: 600,
                      maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.nom}
                    </td>

                    {/* Dernier achat */}
                    <td style={{
                      padding: '8px 10px', textAlign: 'center',
                      color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                      whiteSpace: 'nowrap',
                    }}>
                      {c.lastDate}
                    </td>

                    {/* Inactif depuis */}
                    <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 20,
                        background: urg.bg, color: urg.color,
                      }}>
                        {formatDuration(c.daysSinceLast)}
                        <span style={{ opacity: 0.7, fontSize: 10, marginLeft: 4 }}>
                          ({c.daysSinceLast}j)
                        </span>
                      </span>
                    </td>

                    {/* CA total */}
                    <td style={{
                      padding: '8px 10px', textAlign: 'right',
                      fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                      color: 'var(--green)', whiteSpace: 'nowrap',
                    }}>
                      {fmt(c.ca)} €
                    </td>

                    {/* Segment */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 12,
                        background: SEGMENT_COLORS[c.segment] + '22',
                        color: SEGMENT_COLORS[c.segment],
                        border: `1px solid ${SEGMENT_COLORS[c.segment]}44`,
                        whiteSpace: 'nowrap',
                      }}>
                        {SEGMENT_LABELS[c.segment]}
                      </span>
                    </td>

                    {/* Nb visites */}
                    <td style={{
                      padding: '8px 10px', textAlign: 'center',
                      color: 'var(--text-2)', fontSize: 12,
                    }}>
                      {c.nbVisites}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
