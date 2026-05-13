import { useState } from 'react'
import { fmt } from '@/lib/calc'
import { SEGMENT_LABELS, SEGMENT_COLORS, exportToGHL, type ClientRFM } from '@/lib/rfm'
import { SCENARIOS, clientsForScenario, type Channel } from '@/lib/scenarios'

interface Props { clients: ClientRFM[] }

const CHANNEL_ICON: Record<Channel, string> = { email: '✉️', sms: '💬', call: '📞' }
const CHANNEL_LABEL: Record<Channel, string> = { email: 'Email', sms: 'SMS', call: 'Appel' }

function dayLabel(d: number): string {
  return d === 0 ? 'J0' : `J+${d}`
}

export function ScenariosView({ clients }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
        🎬 Scénarios marketing prêts à l'emploi — chaque scénario combine plusieurs touches (email, SMS, appel)
        sur un calendrier précis. Exportez les contacts cibles pour les charger dans GoHighLevel.
      </div>

      {SCENARIOS.map(sc => {
        const targets = clientsForScenario(sc, clients)
        const totalCA = targets.reduce((s, c) => s + c.ca, 0)
        const isOpen  = !!expanded[sc.id]
        const color   = SEGMENT_COLORS[sc.targetSegments[0]] ?? 'var(--blue)'

        return (
          <div key={sc.id} style={{
            background: 'var(--bg-1)', borderRadius: 'var(--radius-lg)',
            border: `1px solid ${isOpen ? color + '44' : 'var(--border-1)'}`,
            overflow: 'hidden', transition: 'border-color 0.15s',
          }}>
            {/* En-tête scénario */}
            <div
              onClick={() => setExpanded(e => ({ ...e, [sc.id]: !e[sc.id] }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                cursor: 'pointer', background: isOpen ? color + '0d' : 'transparent',
              }}
            >
              <span style={{ fontSize: 22 }}>🎬</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-0)', fontSize: 13 }}>{sc.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sc.description}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {sc.targetSegments.map(seg => (
                    <span key={seg} style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 8,
                      background: SEGMENT_COLORS[seg] + '22',
                      color: SEGMENT_COLORS[seg],
                      border: `1px solid ${SEGMENT_COLORS[seg]}44`,
                    }}>
                      {SEGMENT_LABELS[seg]}
                    </span>
                  ))}
                  <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>
                    {sc.steps.length} étape{sc.steps.length > 1 ? 's' : ''} · {sc.expectedImpact}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 110 }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Cibles</div>
                <div style={{ fontSize: 16, fontWeight: 700, color }}>{targets.length}</div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-2)' }}>{fmt(totalCA)} € CA</div>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation()
                  if (!targets.length) return
                  exportToGHL(targets)
                }}
                disabled={!targets.length}
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  border: `1px solid ${color}44`,
                  background: targets.length ? color + '22' : 'transparent',
                  color, fontSize: 11, fontWeight: 700,
                  cursor: targets.length ? 'pointer' : 'not-allowed',
                  opacity: targets.length ? 1 : 0.4,
                }}
              >
                ↓ Lancer ({targets.length})
              </button>
              <span style={{ color: 'var(--text-3)', fontSize: 14, marginLeft: 4 }}>{isOpen ? '▾' : '▸'}</span>
            </div>

            {/* Corps : timeline */}
            {isOpen && (
              <div style={{ padding: '0 18px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
                  Séquence
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sc.steps.map((step, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 12, padding: '10px 14px',
                      background: 'var(--bg-0)', borderRadius: 8,
                      border: '1px solid var(--border-1)', borderLeft: `3px solid ${color}`,
                    }}>
                      <div style={{
                        minWidth: 52, fontSize: 11, fontWeight: 700, color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: color + '15', borderRadius: 6, padding: '4px 8px',
                      }}>
                        {dayLabel(step.day)}
                      </div>
                      <div style={{ minWidth: 70, fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{CHANNEL_ICON[step.channel]}</span>
                        <span>{CHANNEL_LABEL[step.channel]}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-0)' }}>{step.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.5 }}>{step.content}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {targets.length === 0 && (
                  <div style={{
                    marginTop: 12, padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                    fontSize: 11, color: 'var(--text-2)',
                  }}>
                    ⓘ Aucun client n'est actuellement éligible à ce scénario (segments cibles : {sc.targetSegments.map(s => SEGMENT_LABELS[s]).join(', ')}).
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
