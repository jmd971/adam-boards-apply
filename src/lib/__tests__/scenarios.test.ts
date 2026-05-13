import { describe, it, expect } from 'vitest'
import { SCENARIOS, clientsForScenario } from '@/lib/scenarios'
import type { ClientRFM, RFMSegment } from '@/lib/rfm'

function client(seg: RFMSegment, key = seg): ClientRFM {
  return {
    key, nom: key, ca: 0, nbVisites: 0, lastDate: '2026-01-01',
    daysSinceLast: 0, scoreR: 1, scoreF: 1, scoreM: 1,
    segment: seg, transactions: [],
  }
}

describe('SCENARIOS catalogue', () => {
  it('contient au moins 5 scénarios distincts', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(5)
    const ids = SCENARIOS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('chaque scénario a un titre, des segments cibles et au moins 1 étape', () => {
    for (const s of SCENARIOS) {
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.targetSegments.length).toBeGreaterThan(0)
      expect(s.steps.length).toBeGreaterThan(0)
      for (const step of s.steps) {
        expect(['email', 'sms', 'call']).toContain(step.channel)
        expect(step.day).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('clientsForScenario ne retourne que les clients des segments cibles', () => {
    const clients: ClientRFM[] = [
      client('champion'), client('fidele'),
      client('a_risque'), client('perdu'),
      client('one_shot'),
    ]
    const antiAttrition = SCENARIOS.find(s => s.id === 'anti-attrition')!
    const targets = clientsForScenario(antiAttrition, clients)
    expect(targets.map(t => t.segment).sort()).toEqual(['a_risque', 'perdu'].sort())
  })

  it('clientsForScenario retourne [] si aucun client éligible', () => {
    const oneShotOnly = [client('one_shot')]
    const vip = SCENARIOS.find(s => s.id === 'vip-anniversaire')!
    expect(clientsForScenario(vip, oneShotOnly)).toEqual([])
  })
})
