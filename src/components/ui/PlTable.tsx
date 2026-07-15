import { useState } from 'react'
import type { PlData, SigRow, RAWData } from '@/types'
import { fmt, pct, monthLabel, mergeEntries, mergeLabel, getBudget, isODAccount, fiscalIndex } from '@/lib/calc'

interface PlTableProps {
  struct: SigRow[]
  plCalc: PlData
  RAW: RAWData
  selCo: string[]
  selectedMs: string[]
  msSrc?: Array<'pn' | 'p1' | 'p2' | 'bud'>
  showMonths: boolean
  showN1Full: boolean
  showBudget: boolean
  caTotal: number
  /** CA total N-1 (somme des cumulN1S des comptes CA) — pour la colonne « % CA N-1 ». */
  caTotalN1?: number
  /** CA total Budget (somme des budTotal des comptes CA) — pour la colonne « % CA Bud ». */
  caTotalBud?: number
  /** « Hors OD » : masquer les comptes d'inventaire (cohérent avec computePlCalc). */
  excludeOD?: boolean
  budData?: Record<string, Record<string, { b: number[] }>>
  onOpenModal?: (title: string, entries: any[], detailed: boolean, cumN: number, cumN1: number, acc?: string) => void
  maxHeight?: string
  cumulRowKey?: string
  collapsible?: boolean
}

const PLAN: Record<string, string> = {
  "601":"Achats - Matieres premieres", "602":"Achats - Autres appro.", "604":"Sous-traitance directe",
  "605":"Achats materiel", "606":"Achats non stockes", "607":"Achats marchandises",
  "608":"Frais achats", "609":"Rabais achats", "611":"Sous-traitance", "612":"Credit-bail",
  "613":"Locations", "614":"Charges locatives", "615":"Entretien reparations", "616":"Assurances",
  "617":"Etudes recherches", "618":"Documentation", "621":"Personnel exterieur",
  "622":"Intermediaires", "623":"Publicite", "624":"Transports", "625":"Deplacements missions",
  "626":"Telecom postaux", "627":"Services bancaires", "628":"Divers",
  "631":"Impots taxes", "633":"Impots salaires", "635":"Autres impots", "637":"Impots locaux",
  "641":"Salaires", "642":"Conges payes", "645":"Charges sociales", "646":"Cotisations patronales",
  "647":"Autres charges sociales", "651":"Redevances", "654":"Creances irrecouvrables",
  "661":"Interets emprunts", "664":"Dividendes", "665":"Escomptes accordes", "668":"Autres charges fin.",
  "671":"Charges except.", "675":"Valeur nette cessions",
  "681":"DAP exploitation", "686":"DAP financieres", "687":"DAP exceptionnelles",
  "695":"IS", "696":"Imposition forfaitaire", "697":"Integration fiscale",
  "706":"Prestations services", "7061":"Prestations services France", "70611":"Prestations clients",
  "707":"Ventes marchandises", "7072":"Ventes marchandises DOM",
  "708":"Activites annexes", "7080":"Locations", "709":"Rabais accordes",
  "713":"Variation stocks", "741":"Subventions", "751":"Redevances",
  "761":"Produits participations", "768":"Autres produits fin.",
  "771":"Produits except.", "775":"Produits cessions",
  "781":"RAP exploitation", "786":"RAP financieres",
}

const labelFor = (acc: string, fromFec?: string): string => {
  if (fromFec) return fromFec
  for (let l = acc.length; l >= 3; l--) {
    if (PLAN[acc.slice(0, l)]) return PLAN[acc.slice(0, l)]
  }
  return acc
}


export function PlTable({ struct, plCalc, RAW, selCo, selectedMs, msSrc: _msSrc, showMonths, showN1Full, showBudget, caTotal, caTotalN1, caTotalBud, excludeOD, budData, onOpenModal, maxHeight, cumulRowKey, collapsible }: PlTableProps) {
  // Défaut 0 si non fourni → les colonnes « % CA N-1 / Bud » affichent « — » sans crasher.
  const totN1  = caTotalN1  ?? 0
  const totBud = caTotalBud ?? 0
  // Δpts (différence de points de % du CA), distinct du taux de croissance Var %.
  // Seuil 0.05 pt pour masquer le bruit d'arrondi.
  const fmtPts = (delta: number | null): string => {
    if (delta == null || Math.abs(delta) < 0.0005) return '—'
    return `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)} pt`
  }
  // All rows with sub-accounts start expanded — user can click to collapse
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(struct.filter(r => (r.accs?.length ?? 0) > 0 && !r.sep && !r.header).map(r => [r.id, true]))
  )
  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  // Indices budgétaires (mois calendaires, jan=0…déc=11) correspondant à la période
  // sélectionnée — pour restreindre le budget des sous-lignes aux mois filtrés (comme computePlCalc).
  const budPeriodIdx = [...new Set(selectedMs.map(m => fiscalIndex(m)))]

  let currentHeader: string | null = null
  const rows: React.ReactNode[] = []

  for (const row of struct) {
    if (row.sep) {
      rows.push(<tr key={row.id}><td colSpan={99} style={{ height: 8 }} /></tr>)
      currentHeader = null
      continue
    }
    if (row.header) {
      currentHeader = row.id
      if (collapsible) {
        const isOpen = !!expanded[row.id]
        rows.push(
          <tr key={row.id} onClick={() => toggle(row.id)} style={{ cursor: 'pointer' }}>
            <td colSpan={99} style={{
              padding: '10px 14px 4px', fontSize: 10, fontWeight: 700,
              letterSpacing: '1px', textTransform: 'uppercase',
              color: row.color || 'var(--text-2)',
              borderTop: `1px solid ${row.color ? row.color + '30' : 'var(--border-1)'}`,
            }}>
              <span style={{ marginRight: 6, fontSize: 9 }}>{isOpen ? '▼' : '▶'}</span>
              {row.label}
            </td>
          </tr>
        )
      } else {
        rows.push(
          <tr key={row.id}>
            <td colSpan={99} style={{
              padding: '10px 14px 4px', fontSize: 10, fontWeight: 700,
              letterSpacing: '1px', textTransform: 'uppercase',
              color: row.color || 'var(--text-2)',
              borderTop: `1px solid ${row.color ? row.color + '30' : 'var(--border-1)'}`,
            }}>
              {row.label}
            </td>
          </tr>
        )
      }
      continue
    }

    if (collapsible && !row.bold && currentHeader && !expanded[currentHeader]) continue

    const d = plCalc[row.id]
    if (!d) continue

    const hasAccs  = (row.accs?.length ?? 0) > 0
    const isOpen   = !!expanded[row.id]
    const varAmt   = d.cumulN - d.cumulN1S
    const varPct   = d.cumulN1S !== 0 ? varAmt / Math.abs(d.cumulN1S) : null
    const budE     = d.cumulN - (d.budTotal || 0)
    const budEP    = d.budTotal ? budE / Math.abs(d.budTotal) : null
    // Ratios « % du CA » pour les 3 référentiels — pour la lecture structurelle du P&L
    const pctN     = caTotal > 0.5 ? d.cumulN    / caTotal : null
    const pctN1    = totN1   > 0.5 ? d.cumulN1S  / totN1   : null
    const pctBud   = totBud  > 0.5 ? d.budTotal  / totBud  : null
    const dPctN1   = pctN != null && pctN1  != null ? pctN - pctN1  : null
    const dPctBud  = pctN != null && pctBud != null ? pctN - pctBud : null
    const isCharge = row.type === 'charge'

    // ── Ligne principale ──────────────────────────────────────────────────
    rows.push(
      <tr key={row.id}
        onClick={hasAccs ? () => toggle(row.id) : undefined}
        style={{ background: row.bg || (row.bold ? 'rgba(255,255,255,0.025)' : 'transparent'), cursor: hasAccs ? 'pointer' : 'default', borderBottom: '1px solid var(--border-0)' }}
      >
        <td style={{
          position:'sticky', left:0, zIndex:2,
          background: row.bg || (row.bold ? '#111827' : 'var(--bg-0)'),
          padding: `${row.bold ? 10 : 7}px 14px ${row.bold ? 10 : 7}px ${14 + (row.indent || 0) * 18}px`,
          fontSize: row.bold ? 13 : 12, fontWeight: row.bold ? 700 : 400,
          color: row.color || (row.bold ? 'var(--text-0)' : 'var(--text-1)'),
          borderLeft: row.bold && row.color ? `3px solid ${row.color}` : '3px solid transparent',
          whiteSpace: 'nowrap',
        }}>
          {hasAccs && <span style={{ display:'inline-block', width:14, marginRight:4, fontSize:9, color:'var(--text-3)' }}>{isOpen ? '▾' : '▸'}</span>}
          {row.label}
        </td>

        {showMonths && d.monthsN.map((v, i) => (
          <td key={i} style={{ padding:'7px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: Math.abs(v) < 0.5 ? 'var(--text-3)' : v < 0 ? 'var(--red)' : 'var(--text-1)' }}>
            {Math.abs(v) > 0.5 ? fmt(v) : '—'}
          </td>
        ))}

        <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontSize: row.bold ? 14 : 13, fontWeight: row.bold ? 800 : 600, color: d.cumulN < -0.5 ? 'var(--red)' : (row.color || 'var(--text-0)'), borderLeft:'2px solid var(--border-1)', minWidth:90 }}>
          {fmt(d.cumulN)}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color:'var(--text-2)', minWidth:52, fontFamily:'monospace' }}>
          {caTotal > 0.5 && Math.abs(d.cumulN) > 0.5 ? pct(d.cumulN / caTotal) : '—'}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--text-2)', borderLeft:'1px solid var(--border-0)', minWidth:88 }}>
          {Math.abs(d.cumulN1S) > 0.5 ? fmt(d.cumulN1S) : '—'}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color:'var(--text-2)', minWidth:60, fontFamily:'monospace' }}>
          {pctN1 != null && Math.abs(d.cumulN1S) > 0.5 ? pct(pctN1) : '—'}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:64, color: dPctN1 == null ? 'var(--text-3)' : dPctN1 > 0.0005 ? 'var(--green)' : dPctN1 < -0.0005 ? 'var(--red)' : 'var(--text-3)' }}>
          {fmtPts(dPctN1)}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:78, color: Math.abs(varAmt) < 0.5 ? 'var(--text-3)' : varAmt > 0 ? 'var(--green)' : 'var(--red)' }}>
          {Math.abs(varAmt) > 0.5 ? (varAmt > 0 ? '+' : '') + fmt(varAmt) : '—'}
        </td>
        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:58, color: varPct == null ? 'var(--text-3)' : varPct > 0.005 ? 'var(--green)' : varPct < -0.005 ? 'var(--red)' : 'var(--text-3)' }}>
          {varPct != null ? (varPct > 0 ? '+' : '') + pct(varPct) : '—'}
        </td>
        {showN1Full && <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--text-2)', borderLeft:'1px solid var(--border-0)', minWidth:88 }}>
          {Math.abs(d.cumulN1F) > 0.5 ? fmt(d.cumulN1F) : '—'}
        </td>}
        {showBudget && <>
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--purple)', borderLeft:'2px solid rgba(168,85,247,0.15)', minWidth:88 }}>
            {Math.abs(d.budTotal) > 0.5 ? fmt(d.budTotal) : '—'}
          </td>
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color:'var(--purple)', minWidth:60, fontFamily:'monospace' }}>
            {pctBud != null && Math.abs(d.budTotal) > 0.5 ? pct(pctBud) : '—'}
          </td>
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:64, color: dPctBud == null ? 'var(--text-3)' : dPctBud > 0.0005 ? 'var(--green)' : dPctBud < -0.0005 ? 'var(--red)' : 'var(--text-3)' }}>
            {fmtPts(dPctBud)}
          </td>
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:78, color: Math.abs(budE) < 0.5 ? 'var(--text-3)' : budE > 0 ? 'var(--green)' : 'var(--red)' }}>
            {Math.abs(budE) > 0.5 ? (budE > 0 ? '+' : '') + fmt(budE) : '—'}
          </td>
          <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, minWidth:58, color: budEP == null ? 'var(--text-3)' : budEP > 0.005 ? 'var(--green)' : budEP < -0.005 ? 'var(--red)' : 'var(--text-3)' }}>
            {budEP != null ? (budEP > 0 ? '+' : '') + pct(budEP) : '—'}
          </td>
        </>}
      </tr>
    )

    // ── Lignes de détail par compte ───────────────────────────────────────
    if (isOpen && row.accs) {
      // Bilan rows (class 1-5): expand prefixes into actual FEC accounts
      // P&L rows (class 6-9): direct lookup by exact code
      const isBilanRow = row.accs.some(a => a[0] >= '1' && a[0] <= '5')

      if (isBilanRow) {
        // Collect all actual accounts in bn that match any prefix in row.accs
        const seen = new Set<string>()
        const bilanAccs: string[] = []
        for (const co of selCo) {
          for (const acc of Object.keys(RAW.companies[co]?.bn ?? {})) {
            if (!seen.has(acc) && row.accs!.some(p => acc.startsWith(p))) {
              seen.add(acc); bilanAccs.push(acc)
            }
          }
        }
        bilanAccs.sort()

        for (const acc of bilanAccs) {
          const fecLabel = mergeLabel(RAW, selCo, 'bn' as any, acc) || mergeLabel(RAW, selCo, 'b1' as any, acc)
          const lbl      = labelFor(acc, fecLabel || undefined)
          const ents     = mergeEntries(RAW, selCo, 'bn' as any, acc)

          let val = 0
          for (const co of selCo) {
            const sv = (RAW.companies[co]?.bn as any)?.[acc]?.s ?? 0
            val += Math.abs(sv)
          }
          val = Math.round(val)

          rows.push(
            <tr key={`${row.id}__${acc}`}
              onClick={() => onOpenModal?.(`${acc} — ${lbl}`, ents, true, val, d.cumulN1S, acc)}
              style={{ background:'rgba(0,0,0,0.18)', borderBottom:'1px solid var(--border-0)', cursor: onOpenModal ? 'pointer' : 'default' }}
            >
              <td style={{ padding:'5px 14px 5px 48px', fontSize:11, color:'var(--text-2)', position:'sticky', left:0, zIndex:2, background:'rgba(6,11,20,0.95)', whiteSpace:'nowrap' }}>
                <span style={{ color:'var(--blue)', marginRight:5, fontSize:9 }}>▸</span>
                <span style={{ fontFamily:'monospace', color:'var(--text-3)', marginRight:6, fontSize:10 }}>{acc}</span>
                <span>{lbl}</span>
                {ents.length > 0 && <span style={{ marginLeft:6, fontSize:9, color:'var(--text-3)', background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:10 }}>{ents.length} éc.</span>}
              </td>
              {showMonths && selectedMs.map(m => (
                <td key={m} style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontSize:10, color:'var(--text-3)' }}>—</td>
              ))}
              <td style={{ padding:'5px 10px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:600, color: Math.abs(val) > 0.5 ? 'var(--text-0)' : 'var(--text-3)', borderLeft:'2px solid var(--border-1)' }}>
                {Math.abs(val) > 0.5 ? fmt(val) : '—'}
              </td>
              <td colSpan={99} />
            </tr>
          )
        }
      } else {
        // Expand P&L prefixes to individual FEC/manual accounts — shows each sub-account
        // (including manual entries at specific codes like 6262) as a distinct row.
        const uniqueAccs = row.accs!.filter((acc, i, arr) =>
          !arr.some((other, j) => j !== i && acc.startsWith(other) && other.length < acc.length)
        )
        const seen = new Set<string>()
        const plAccs: string[] = []
        for (const co of selCo) {
          // p2 inclus : un FEC classé N-2 par exercice fiscal (ex: exercice avr→mars importé
          // 2 ans après) doit exposer ses sous-comptes comme pn/p1 (cf CLAUDE.md « oublierait p2 »).
          for (const field of ['pn', 'p1', 'p2'] as const) {
            const src = (RAW.companies[co] as any)?.[field] ?? {}
            for (const k of Object.keys(src)) {
              if (excludeOD && isODAccount(k)) continue   // « Hors OD » : masquer les comptes d'inventaire
              if (!seen.has(k) && uniqueAccs.some(p => k.startsWith(p))) {
                seen.add(k); plAccs.push(k)
              }
            }
          }
          // Inclure aussi les comptes présents uniquement dans le budget (ajout manuel
          // depuis la page Budget) — sinon ils n'apparaîtraient pas comme sous-ligne.
          if (budData) {
            const bd = (budData as any)[co] ?? {}
            for (const k of Object.keys(bd)) {
              if (excludeOD && isODAccount(k)) continue
              if (!seen.has(k) && uniqueAccs.some(p => k.startsWith(p))) {
                seen.add(k); plAccs.push(k)
              }
            }
          }
        }
        plAccs.sort()

        for (const acc of plAccs) {
          // Look in both pn and p1 for each month (same as April-16 accValue approach)
          // to avoid blank sub-rows when RAW.mn is empty or msSrc routes incorrectly.
          let val = 0
          for (const m of selectedMs) {
            for (const co of selCo) {
              for (const field of ['pn', 'p1', 'p2'] as const) {
                const src = (RAW.companies[co] as any)?.[field] ?? {}
                const mo  = src[acc]?.mo?.[m]
                if (mo && Array.isArray(mo)) val += isCharge ? (mo[0] - mo[1]) : (mo[1] - mo[0])
              }
            }
          }
          val = Math.round(val)

          // ── N-1 du sous-compte : on cherche, pour chaque mois N sélectionné, son
          // équivalent N-1 (même mois calendaire, année − 1) dans les sources p1/p2/pn.
          // Permet d'afficher N-1, Var € et Var % au niveau du compte individuel,
          // pas seulement à la ligne agrégée parente.
          let valN1 = 0
          for (const m of selectedMs) {
            const mN1 = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
            for (const co of selCo) {
              for (const field of ['pn', 'p1', 'p2'] as const) {
                const src = (RAW.companies[co] as any)?.[field] ?? {}
                const mo  = src[acc]?.mo?.[mN1]
                if (mo && Array.isArray(mo)) valN1 += isCharge ? (mo[0] - mo[1]) : (mo[1] - mo[0])
              }
            }
          }
          valN1 = Math.round(valN1)
          const accVarAmt = val - valN1
          const accVarPct = valN1 !== 0 ? accVarAmt / Math.abs(valN1) : null

          const allEnts: any[] = []
          let fecLabel = ''
          for (const co of selCo) {
            for (const field of ['pn', 'p1', 'p2'] as const) {
              const src = (RAW.companies[co] as any)?.[field] ?? {}
              if (!fecLabel && src[acc]?.l) fecLabel = src[acc].l
              const tag = field === 'pn' ? 'N' : field === 'p1' ? 'N-1' : 'N-2'
              allEnts.push(...mergeEntries(RAW, [co], field, acc).map((e: any) => [...e, tag]))
            }
            // Si le compte n'a ni val FEC ni écritures, prendre son label depuis le budget
            // pour les comptes ajoutés manuellement.
            if (!fecLabel && budData) {
              const bdLbl = ((budData as any)[co] ?? {})[acc]?.l
              if (bdLbl) fecLabel = bdLbl
            }
          }

          // Garder la sous-ligne si elle a un budget (compte manuel hors FEC), même sans val/écritures.
          let hasBudget = false
          if (budData) {
            for (const co of selCo) {
              const b = ((budData as any)[co] ?? {})[acc]?.b
              if (Array.isArray(b) && b.some((v: number) => Math.abs(v) > 0.5)) { hasBudget = true; break }
            }
          }
          if (Math.abs(val) < 0.5 && allEnts.length === 0 && !hasBudget) continue

          const lbl = labelFor(acc, fecLabel || undefined)

          rows.push(
            <tr key={`${row.id}__${acc}`}
              onClick={() => onOpenModal?.(`${acc} — ${lbl}`, allEnts, true, val, valN1, acc)}
              style={{ background:'rgba(0,0,0,0.18)', borderBottom:'1px solid var(--border-0)', cursor: onOpenModal ? 'pointer' : 'default' }}
            >
              <td style={{ padding:'5px 14px 5px 48px', fontSize:11, color:'var(--text-2)', position:'sticky', left:0, zIndex:2, background:'rgba(6,11,20,0.95)', whiteSpace:'nowrap' }}>
                <span style={{ color:'var(--blue)', marginRight:5, fontSize:9 }}>▸</span>
                <span style={{ fontFamily:'monospace', color:'var(--text-3)', marginRight:6, fontSize:10 }}>{acc}</span>
                <span>{lbl}</span>
                {allEnts.length > 0 && <span style={{ marginLeft:6, fontSize:9, color:'var(--text-3)', background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:10 }}>{allEnts.length} éc.</span>}
              </td>
              {showMonths && selectedMs.map((m, _mi) => {
                let mv = 0
                for (const co of selCo) {
                  for (const field of ['pn', 'p1', 'p2'] as const) {
                    const src = (RAW.companies[co] as any)?.[field] ?? {}
                    const mo  = src[acc]?.mo?.[m]
                    if (mo && Array.isArray(mo)) mv += isCharge ? (mo[0] - mo[1]) : (mo[1] - mo[0])
                  }
                }
                mv = Math.round(mv)
                return (
                  <td key={m} style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontSize:10, color: Math.abs(mv) < 0.5 ? 'var(--text-3)' : mv < 0 ? 'var(--red)' : 'var(--text-2)' }}>
                    {Math.abs(mv) > 0.5 ? fmt(mv) : '—'}
                  </td>
                )
              })}
              <td style={{ padding:'5px 10px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:600, color: val < -0.5 ? 'var(--red)' : Math.abs(val) > 0.5 ? 'var(--text-0)' : 'var(--text-3)', borderLeft:'2px solid var(--border-1)' }}>
                {Math.abs(val) > 0.5 ? fmt(val) : '—'}
              </td>
              <td style={{ padding:'5px 8px', textAlign:'right', fontSize:11, color:'var(--text-3)', fontFamily:'monospace' }}>
                {caTotal > 0.5 && Math.abs(val) > 0.5 ? pct(val / caTotal) : '—'}
              </td>
              <td style={{ padding:'5px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', color:'var(--text-3)', borderLeft:'1px solid var(--border-0)' }}>
                {Math.abs(valN1) > 0.5 ? fmt(valN1) : '—'}
              </td>
              <td style={{ padding:'5px 8px', textAlign:'right', fontSize:11, color:'var(--text-3)', fontFamily:'monospace' }}>
                {totN1 > 0.5 && Math.abs(valN1) > 0.5 ? pct(valN1 / totN1) : '—'}
              </td>
              <td style={{ padding:'5px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, color: (() => {
                const pa = caTotal > 0.5 ? val / caTotal : null
                const pb = totN1 > 0.5 ? valN1 / totN1 : null
                const dp = pa != null && pb != null ? pa - pb : null
                return dp == null ? 'var(--text-3)' : dp > 0.0005 ? 'var(--green)' : dp < -0.0005 ? 'var(--red)' : 'var(--text-3)'
              })() }}>
                {fmtPts(caTotal > 0.5 && totN1 > 0.5 ? (val / caTotal) - (valN1 / totN1) : null)}
              </td>
              <td style={{ padding:'5px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, color: Math.abs(accVarAmt) < 0.5 ? 'var(--text-3)' : accVarAmt > 0 ? 'var(--green)' : 'var(--red)' }}>
                {Math.abs(accVarAmt) > 0.5 ? (accVarAmt > 0 ? '+' : '') + fmt(accVarAmt) : '—'}
              </td>
              <td style={{ padding:'5px 8px', textAlign:'right', fontSize:11, fontFamily:'monospace', fontWeight:600, color: accVarPct == null ? 'var(--text-3)' : accVarPct > 0.005 ? 'var(--green)' : accVarPct < -0.005 ? 'var(--red)' : 'var(--text-3)' }}>
                {accVarPct != null ? (accVarPct > 0 ? '+' : '') + pct(accVarPct) : '—'}
              </td>
              {showN1Full && <td style={{ padding:'5px 8px', textAlign:'right', fontSize:11, color:'var(--text-3)', borderLeft:'1px solid var(--border-0)' }}>—</td>}
              {showBudget && (() => {
                // Budget stocké en valeur absolue (positif) ; restreint aux mois de la période.
                const accBudget = budData
                  ? Math.round(getBudget(selCo, budData as any, acc, budPeriodIdx).reduce((s, v) => s + v, 0))
                  : 0
                const accEcart  = Math.round(val - accBudget)
                const accEcartP = accBudget !== 0 ? accEcart / Math.abs(accBudget) : null
                return (
                  <>
                    <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, color:'var(--purple)', borderLeft:'2px solid rgba(168,85,247,0.1)' }}>
                      {Math.abs(accBudget) > 0.5 ? fmt(accBudget) : '—'}
                    </td>
                    <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, color:'var(--purple)' }}>
                      {totBud > 0.5 && Math.abs(accBudget) > 0.5 ? pct(accBudget / totBud) : '—'}
                    </td>
                    <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color: (() => {
                      const pa = caTotal > 0.5 ? val / caTotal : null
                      const pb = totBud  > 0.5 ? accBudget / totBud : null
                      const dp = pa != null && pb != null ? pa - pb : null
                      return dp == null ? 'var(--text-3)' : dp > 0.0005 ? 'var(--green)' : dp < -0.0005 ? 'var(--red)' : 'var(--text-3)'
                    })() }}>
                      {fmtPts(caTotal > 0.5 && totBud > 0.5 ? (val / caTotal) - (accBudget / totBud) : null)}
                    </td>
                    <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color: Math.abs(accEcart) < 0.5 ? 'var(--text-3)' : accEcart > 0 ? 'var(--green)' : 'var(--red)' }}>
                      {Math.abs(accEcart) > 0.5 && Math.abs(accBudget) > 0.5 ? (accEcart > 0 ? '+' : '') + fmt(accEcart) : '—'}
                    </td>
                    <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color: accEcartP == null ? 'var(--text-3)' : accEcartP > 0.005 ? 'var(--green)' : accEcartP < -0.005 ? 'var(--red)' : 'var(--text-3)' }}>
                      {accEcartP != null ? (accEcartP > 0 ? '+' : '') + pct(accEcartP) : '—'}
                    </td>
                  </>
                )
              })()}
            </tr>
          )
        }
      }
    }
  }

  return (
    <div style={{ overflowX:'auto', ...(maxHeight ? { overflowY:'auto', maxHeight } : {}) }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg-1)' }}>
            <th style={{ padding:'8px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', position:'sticky', left:0, background:'var(--bg-1)', zIndex:11, minWidth:260, whiteSpace:'nowrap' }}>Poste</th>
            {showMonths && selectedMs.map(m => (
              <th key={m} style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:68, borderLeft:'1px solid var(--border-0)', whiteSpace:'nowrap' }}>{monthLabel(m)}</th>
            ))}
            <th style={{ padding:'8px 10px', textAlign:'right', fontSize:11, fontWeight:700, color:'var(--blue)', borderBottom:'2px solid var(--blue)', minWidth:90, borderLeft:'2px solid var(--border-1)', whiteSpace:'nowrap' }}>Cumul N</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:52, whiteSpace:'nowrap' }}>% CA</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:88, borderLeft:'1px solid var(--border-0)', whiteSpace:'nowrap' }}>N-1</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:60, whiteSpace:'nowrap' }}>% CA N-1</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:64, whiteSpace:'nowrap' }}>Δpts N-1</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:78, whiteSpace:'nowrap' }}>Var. €</th>
            <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:58, whiteSpace:'nowrap' }}>Var. %</th>
            {showN1Full && <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-2)', borderBottom:'2px solid var(--border-1)', minWidth:88, borderLeft:'1px solid var(--border-0)', whiteSpace:'nowrap' }}>N-1 An.</th>}
            {showBudget && <>
              <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--purple)', borderBottom:'2px solid rgba(168,85,247,0.4)', minWidth:88, borderLeft:'2px solid rgba(168,85,247,0.15)', whiteSpace:'nowrap' }}>Budget</th>
              <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--purple)', borderBottom:'2px solid rgba(168,85,247,0.4)', minWidth:60, whiteSpace:'nowrap' }}>% CA Bud</th>
              <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--purple)', borderBottom:'2px solid rgba(168,85,247,0.4)', minWidth:64, whiteSpace:'nowrap' }}>Δpts Bud</th>
              <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--purple)', borderBottom:'2px solid rgba(168,85,247,0.4)', minWidth:78, whiteSpace:'nowrap' }}>Éc. €</th>
              <th style={{ padding:'8px 8px', textAlign:'right', fontSize:10, fontWeight:600, color:'var(--purple)', borderBottom:'2px solid rgba(168,85,247,0.4)', minWidth:58, whiteSpace:'nowrap' }}>Éc. %</th>
            </>}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
        {cumulRowKey && (() => {
          const cd = plCalc[cumulRowKey]
          if (!cd) return null
          let cum = 0
          const cumulMs = cd.monthsN.map(v => { cum += v; return cum })
          return (
            <tfoot>
              <tr style={{ background:'rgba(139,92,246,0.07)', borderTop:'2px solid rgba(139,92,246,0.3)' }}>
                <td style={{ position:'sticky', left:0, zIndex:2, background:'#160e2b', padding:'10px 14px', fontSize:13, fontWeight:700, color:'#8b5cf6', borderLeft:'3px solid #8b5cf6', whiteSpace:'nowrap' }}>
                  📊 Résultat cumulé
                </td>
                {showMonths && cumulMs.map((v, i) => (
                  <td key={i} style={{ padding:'7px 8px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color: v < -0.5 ? 'var(--red)' : v > 0.5 ? '#8b5cf6' : 'var(--text-3)' }}>
                    {Math.abs(v) > 0.5 ? fmt(v) : '—'}
                  </td>
                ))}
                <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontSize:14, fontWeight:800, color: cd.cumulN < -0.5 ? 'var(--red)' : '#8b5cf6', borderLeft:'2px solid var(--border-1)', minWidth:90 }}>
                  {fmt(cd.cumulN)}
                </td>
                <td colSpan={99} />
              </tr>
            </tfoot>
          )
        })()}
      </table>
    </div>
  )
}
