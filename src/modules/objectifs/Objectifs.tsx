import { useMemo, useState, useEffect } from 'react'
import { fmt } from '@/lib/calc'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { useEffectiveBudData } from '@/hooks/useEffectiveBudData'
import { useCompanyObjectives, useCompanyObjectiveMutations } from '@/hooks/useCompanyObjectives'

const CA_PREFIXES     = ['7']
const ACHATS_PREFIXES = ['60']

function sumAccs(
  RAW: any, selCo: string[], field: 'pn' | 'p1',
  months: string[], prefixes: string[], isCharge = false
): number {
  let total = 0
  for (const co of selCo) {
    const data = RAW?.companies?.[co]?.[field] ?? {}
    for (const [acc, acctData] of Object.entries(data)) {
      if (!prefixes.some((p: string) => acc.startsWith(p))) continue
      const moMap = (acctData as any)?.mo ?? {}
      for (const m of months) {
        const mo = moMap[m]
        if (!mo || !Array.isArray(mo)) continue
        const [d, cr] = mo as [number, number]
        total += isCharge ? Math.max(0, d - cr) : Math.max(0, cr - d)
      }
    }
  }
  return Math.round(total)
}

// Dépenses Budget = somme annuelle des charges fixes (61 à 69), HORS achats variables (60*)
function budgetDepensesFixes(budData: any, co: string): number {
  const bd = budData[co] ?? {}
  let total = 0
  for (const [acc, bv] of Object.entries(bd)) {
    if (!acc.startsWith('6')) continue
    if (acc.startsWith('60')) continue
    const b = (bv as any)?.b ?? []
    for (let i = 0; i < 12; i++) total += b[i] || 0
  }
  return Math.round(total)
}

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e', '#14b8a6']

export function Objectifs() {
  const budData = useEffectiveBudData()
  const { RAW, selCo, selectedMs: msN } = usePeriodFilter()
  const { data: objData } = useCompanyObjectives()
  const { upsert } = useCompanyObjectiveMutations()
  const objByCompany = objData?.byCompany ?? {}

  // Édition inline du taux par société (string pour gérer "" pendant la saisie)
  const [edits, setEdits] = useState<Record<string, string>>({})

  useEffect(() => {
    const init: Record<string, string> = {}
    for (const co of selCo) {
      const o = objByCompany[co]
      init[co] = o?.target_margin_rate != null ? String(o.target_margin_rate) : ''
    }
    setEdits(init)
  }, [selCo.join(','), objData])

  const saveRate = async (co: string) => {
    const val = (edits[co] ?? '').trim()
    const rate = val === '' ? null : parseFloat(val.replace(',', '.'))
    if (rate != null && !isFinite(rate)) return
    try { await upsert(co, { target_margin_rate: rate }) }
    catch (err) { console.error('[objectifs] save error:', err) }
  }

  // ── Calculs par société ──────────────────────────────────────────────
  const perCo = useMemo(() => {
    if (!RAW) return {} as Record<string, any>
    const r: Record<string, any> = {}
    for (const co of selCo) {
      const depenses = budgetDepensesFixes(budData, co)
      const editedRate = parseFloat((edits[co] ?? '').replace(',', '.'))
      const storedRate = objByCompany[co]?.target_margin_rate
      const ratePct    = isFinite(editedRate) ? editedRate : (storedRate ?? 0)
      const taux       = ratePct / 100

      const objVentesAn  = taux > 0 ? Math.round(depenses / taux) : 0
      const objAchatsAn  = Math.max(0, objVentesAn - depenses)

      const realVentes = sumAccs(RAW, [co], 'pn', msN, CA_PREFIXES)
      const realAchats = sumAccs(RAW, [co], 'pn', msN, ACHATS_PREFIXES, true)
      const realMarge  = realVentes - realAchats
      const realRate   = realVentes > 0 ? realMarge / realVentes : 0

      r[co] = {
        name:          RAW.companies[co]?.name || co,
        depenses,
        ratePct,
        taux,
        objVentesAn,
        objVentesMois: Math.round(objVentesAn / 12),
        objAchatsAn,
        objAchatsMois: Math.round(objAchatsAn / 12),
        realVentes,
        realAchats,
        realMarge,
        realRate,
        avancementV:   objVentesAn > 0 ? realVentes / objVentesAn : 0,
        avancementA:   objAchatsAn > 0 ? realAchats / objAchatsAn : 0,
        ecart:         realVentes - objVentesAn,
      }
    }
    return r
  }, [RAW, selCo.join(','), msN.join(','), budData, edits, objByCompany])

  if (!RAW) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, fontSize:13, color:'var(--text-2)' }}>
      Aucune donnée. Importez un fichier FEC.
    </div>
  )
  if (selCo.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, fontSize:13, color:'var(--text-2)' }}>
      Sélectionnez au moins une société.
    </div>
  )

  // ── Totaux ────────────────────────────────────────────────────────────
  const tot = {
    depenses:      selCo.reduce((s, co) => s + (perCo[co]?.depenses ?? 0), 0),
    objVentesAn:   selCo.reduce((s, co) => s + (perCo[co]?.objVentesAn ?? 0), 0),
    objVentesMois: selCo.reduce((s, co) => s + (perCo[co]?.objVentesMois ?? 0), 0),
    objAchatsAn:   selCo.reduce((s, co) => s + (perCo[co]?.objAchatsAn ?? 0), 0),
    objAchatsMois: selCo.reduce((s, co) => s + (perCo[co]?.objAchatsMois ?? 0), 0),
    realVentes:    selCo.reduce((s, co) => s + (perCo[co]?.realVentes ?? 0), 0),
  }
  const totAvancement = tot.objVentesAn > 0 ? tot.realVentes / tot.objVentesAn : 0
  const totEcart      = tot.realVentes - tot.objVentesAn

  const fmtEcart = (v: number) => v >= 0 ? `+${fmt(v)}` : `(${fmt(Math.abs(v))})`

  // ── Styles partagés ──────────────────────────────────────────────────
  const cardSt: React.CSSProperties = {
    background:'#0f172a', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:18,
  }
  const thSt: React.CSSProperties = {
    padding:'10px 14px', color:'#94a3b8', fontWeight:700, fontSize:10,
    textTransform:'uppercase', letterSpacing:'0.5px',
    borderBottom:'1px solid rgba(255,255,255,0.07)',
  }
  const tdSt: React.CSSProperties = {
    padding:'10px 14px', fontFamily:'monospace', fontSize:11.5,
  }
  const cols = Math.min(selCo.length, 4)

  return (
    <div style={{ padding:'20px 24px' }}>
      {/* Titre + formule */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text-0)', margin:0 }}>
          Objectifs de Ventes et Achats
        </h2>
        <div style={{ fontSize:11, color:'#475569', marginTop:4 }}>
          Calcul : Objectif Ventes = Dépenses Budget / Taux de marge
        </div>
      </div>

      {/* Cartes : taux de marge prévisionnel éditable par société */}
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:16, marginBottom:24 }}>
        {selCo.map((co, idx) => {
          const d = perCo[co]; if (!d) return null
          const color = COLORS[idx % COLORS.length]
          const realRatePct = Math.round(d.realRate * 100)
          const targetPct   = Math.round(d.ratePct)
          const realColor   = d.realVentes === 0 ? '#475569'
                              : realRatePct >= targetPct ? '#10b981' : '#ef4444'
          return (
            <div key={co} style={cardSt}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                <span style={{ fontSize:14, fontWeight:800, color }}>{co}</span>
                <span style={{ fontSize:10, color:'#475569' }}>{d.name}</span>
              </div>
              <div style={{ fontSize:10, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
                Taux de marge prévisionnel
              </div>
              <div style={{
                background:'rgba(255,255,255,0.02)',
                border:'1px solid rgba(255,255,255,0.05)',
                borderRadius:8, padding:'14px 8px',
                display:'flex', alignItems:'center', justifyContent:'center',
                marginBottom:10,
              }}>
                <input
                  type="number" step="1" min="0" max="100"
                  value={edits[co] ?? ''}
                  onChange={e => setEdits(p => ({ ...p, [co]: e.target.value }))}
                  onBlur={() => saveRate(co)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  placeholder="—"
                  style={{
                    background:'transparent', border:'none', outline:'none',
                    color, fontSize:40, fontWeight:700, fontFamily:'monospace',
                    textAlign:'right', width:80, padding:0,
                  }}
                />
                <span style={{ color, fontSize:40, fontWeight:700, fontFamily:'monospace', marginLeft:4 }}>%</span>
              </div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>
                Taux réel N : <span style={{ color: realColor, fontWeight:700 }}>
                  {d.realVentes > 0 ? `${realRatePct}%` : '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tableau récap */}
      <div style={{ ...cardSt, padding:0, overflow:'hidden', marginBottom:24 }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                <th style={{ ...thSt, textAlign:'left' }}>Société</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Dépenses Budget</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Taux marge</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Obj. Ventes annuel</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Obj. Ventes / mois</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Obj. Achats annuel</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Obj. Achats / mois</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Réalisé Ventes</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Avancement</th>
                <th style={{ ...thSt, textAlign:'right', color:'#3b82f6' }}>Écart</th>
              </tr>
            </thead>
            <tbody>
              {selCo.map((co, idx) => {
                const d = perCo[co]; if (!d) return null
                const color = COLORS[idx % COLORS.length]
                return (
                  <tr key={co} style={{ borderTop:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ ...tdSt, fontFamily:'inherit', fontWeight:600, color }}>{co} — {d.name}</td>
                    <td style={{ ...tdSt, textAlign:'right' }}>{fmt(d.depenses)}</td>
                    <td style={{ ...tdSt, textAlign:'right', color }}>{Math.round(d.ratePct)}%</td>
                    <td style={{ ...tdSt, textAlign:'right', color:'#10b981' }}>{fmt(d.objVentesAn)}</td>
                    <td style={{ ...tdSt, textAlign:'right', color:'#64748b' }}>{fmt(d.objVentesMois)}</td>
                    <td style={{ ...tdSt, textAlign:'right', color:'#f59e0b' }}>{fmt(d.objAchatsAn)}</td>
                    <td style={{ ...tdSt, textAlign:'right', color:'#64748b' }}>{fmt(d.objAchatsMois)}</td>
                    <td style={{ ...tdSt, textAlign:'right', color:'#3b82f6' }}>{fmt(d.realVentes)}</td>
                    <td style={{ ...tdSt, textAlign:'right', fontWeight:700,
                                color: d.avancementV >= 1 ? '#10b981' : d.avancementV >= 0.75 ? '#f59e0b' : '#94a3b8' }}>
                      {Math.round(d.avancementV * 100)}%
                    </td>
                    <td style={{ ...tdSt, textAlign:'right', color: d.ecart >= 0 ? '#10b981' : '#ef4444' }}>
                      {fmtEcart(d.ecart)}
                    </td>
                  </tr>
                )
              })}
              {/* TOTAL */}
              <tr style={{ borderTop:'2px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.02)' }}>
                <td style={{ ...tdSt, fontFamily:'inherit', fontWeight:800 }}>TOTAL</td>
                <td style={{ ...tdSt, textAlign:'right', fontWeight:800 }}>{fmt(tot.depenses)}</td>
                <td></td>
                <td style={{ ...tdSt, textAlign:'right', fontWeight:800, color:'#10b981' }}>{fmt(tot.objVentesAn)}</td>
                <td style={{ ...tdSt, textAlign:'right', fontWeight:800, color:'#64748b' }}>{fmt(tot.objVentesMois)}</td>
                <td style={{ ...tdSt, textAlign:'right', fontWeight:800, color:'#f59e0b' }}>{fmt(tot.objAchatsAn)}</td>
                <td style={{ ...tdSt, textAlign:'right', fontWeight:800, color:'#64748b' }}>{fmt(tot.objAchatsMois)}</td>
                <td style={{ ...tdSt, textAlign:'right', fontWeight:800, color:'#3b82f6' }}>{fmt(tot.realVentes)}</td>
                <td style={{ ...tdSt, textAlign:'right', fontWeight:800,
                             color: totAvancement >= 1 ? '#10b981' : totAvancement >= 0.75 ? '#f59e0b' : '#94a3b8' }}>
                  {Math.round(totAvancement * 100)}%
                </td>
                <td style={{ ...tdSt, textAlign:'right', fontWeight:800, color: totEcart >= 0 ? '#10b981' : '#ef4444' }}>
                  {fmtEcart(totEcart)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Progression des objectifs */}
      <div style={{ marginBottom:8 }}>
        <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-0)', margin:'0 0 14px 0' }}>
          Progression des objectifs
        </h3>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:16 }}>
          {selCo.map((co, idx) => {
            const d = perCo[co]; if (!d) return null
            const color   = COLORS[idx % COLORS.length]
            const pctV    = Math.round(d.avancementV * 100)
            const pctA    = Math.round(d.avancementA * 100)
            const pctM    = Math.round(d.realRate * 100)
            const target  = Math.round(d.ratePct)
            const colorV  = '#10b981'
            const colorA  = pctA > 100 ? '#ef4444' : pctA > 90 ? '#f59e0b' : '#10b981'
            const colorM  = d.realVentes === 0 ? '#475569' : pctM >= target ? '#10b981' : '#ef4444'

            const Bar = ({ pct, color }: { pct:number; color:string }) => (
              <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${Math.min(100, Math.max(0, pct))}%`, background:color, borderRadius:3, transition:'width 0.5s' }} />
              </div>
            )

            return (
              <div key={co} style={cardSt}>
                <div style={{ fontSize:13, fontWeight:800, color, marginBottom:14 }}>{co}</div>

                {/* Ventes */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, marginBottom:4 }}>
                    <span style={{ color:'#94a3b8' }}>Ventes</span>
                    <span style={{ color:'#cbd5e1', fontFamily:'monospace' }}>{fmt(d.realVentes)} / {fmt(d.objVentesAn)}</span>
                  </div>
                  <Bar pct={pctV} color={colorV} />
                  <div style={{ textAlign:'right', fontSize:9.5, color:'#475569', marginTop:2 }}>{pctV}%</div>
                </div>

                {/* Achats */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, marginBottom:4 }}>
                    <span style={{ color:'#94a3b8' }}>Achats</span>
                    <span style={{ color:'#cbd5e1', fontFamily:'monospace' }}>{fmt(d.realAchats)} / {fmt(d.objAchatsAn)}</span>
                  </div>
                  <Bar pct={pctA} color={colorA} />
                  <div style={{ textAlign:'right', fontSize:9.5, color: colorA, marginTop:2, fontWeight:600 }}>{pctA}%</div>
                </div>

                {/* Marge réelle */}
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, marginBottom:4 }}>
                    <span style={{ color:'#94a3b8' }}>Marge réelle</span>
                    <span style={{ color: colorM, fontFamily:'monospace', fontWeight:600 }}>
                      {d.realVentes > 0 ? `${pctM}%` : '—'} <span style={{ color:'#64748b', fontWeight:400 }}>(obj: {target}%)</span>
                    </span>
                  </div>
                  <Bar pct={target > 0 ? (pctM / target) * 100 : 0} color={colorM} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
