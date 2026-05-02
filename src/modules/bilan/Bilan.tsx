import { useState, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { computeBilan } from '@/lib/bilan'
import { fmt } from '@/lib/calc'
import { KpiCard, ExportBar, EcrituresModal } from '@/components/ui'
import { exportBilanXlsx, printModule } from '@/lib/export'
import type { RAWData, FecEntry } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────

interface AccDetail {
  acc: string
  label: string
  valueN: number
  valueN1: number
  entries: FecEntry[]
}

interface BilanCat {
  id: string
  label: string
  color: string
  totalN: number
  totalN1: number
  accounts: AccDetail[]
}

interface ModalState {
  title: string
  entries: FecEntry[]
  cumN: number
  cumN1: number
}

// ── Account label dictionary ──────────────────────────────────────────────

const ACC_LABELS: Record<string, string> = {
  '10':'Capital et réserves','101':'Capital','104':'Primes d\'émission',
  '106':'Réserves','108':'Compte associés','11':'Report à nouveau',
  '110':'Report à nouveau','120':'Résultat — bénéfice','129':'Résultat — perte',
  '13':'Subventions d\'investissement','14':'Provisions réglementées',
  '15':'Provisions pour risques','151':'Provisions pour risques',
  '152':'Provisions pour charges','153':'Provisions retraites',
  '16':'Emprunts et dettes assimilées','161':'Emprunts obligataires',
  '162':'Emprunts établissements de crédit','163':'Autres emprunts',
  '164':'Emprunts participatifs','165':'Dépôts & cautionnements',
  '166':'Participation des salariés','168':'Intérêts courus sur emprunts',
  '20':'Immob. incorporelles','201':'Frais d\'établissement',
  '203':'Frais de R&D','205':'Concessions & brevets',
  '206':'Droit au bail','207':'Fonds commercial','208':'Autres immobi. incorp.',
  '21':'Immob. corporelles','211':'Terrains','212':'Agencements terrains',
  '213':'Constructions','215':'Installations techniques','218':'Autres immobi. corp.',
  '22':'Immob. en concession','23':'Immob. en cours',
  '26':'Participations','27':'Créances rattachées à des participations',
  '28':'Amortissements','280':'Amort. immobi. incorp.','281':'Amort. immobi. corp.',
  '29':'Dépréciations immobi.',
  '30':'Stocks matières','31':'Matières premières','32':'Autres appro.',
  '33':'Encours production biens','34':'Encours production services',
  '35':'Stocks produits finis','37':'Stocks marchandises',
  '38':'Stock en voie de transport','39':'Dépréciations stocks',
  '40':'Fournisseurs','401':'Fournisseurs','402':'Fournisseurs — effets à payer',
  '403':'Fournisseurs — avances versées','404':'Fournisseurs d\'immos',
  '405':'Fournisseurs d\'immos — effets','408':'Fournisseurs — factures à recevoir',
  '409':'Avances versées sur commandes',
  '41':'Clients','411':'Clients','412':'Clients douteux ou litigieux',
  '413':'Clients — effets à recevoir','416':'Clients litigieux',
  '417':'Clients — garanties','418':'Clients — factures à établir',
  '419':'Clients — avances & acomptes',
  '42':'Personnel et comptes rattachés','421':'Personnel — rémunérations dues',
  '425':'Personnel — avances & acomptes','427':'Personnel — oppositions',
  '428':'Personnel — charges à payer',
  '43':'Sécurité sociale et prévoyance','431':'SS — cotisations',
  '437':'Autres organismes sociaux','438':'SS — charges à payer',
  '44':'État et collectivités','441':'État — impôts directs',
  '442':'État — TVA','444':'État — IS','445':'État — TVA collectée',
  '447':'Autres impôts & taxes','448':'État — charges à payer',
  '45':'Groupe & associés','46':'Débiteurs & créanciers divers',
  '47':'Comptes transitoires','48':'Comptes de régularisation',
  '49':'Dépréciations comptes de tiers','491':'Dépréciations clients',
  '50':'Valeurs mobilières de placement','501':'VMP',
  '51':'Banques & établissements de crédit','511':'Valeurs à encaisser',
  '512':'Banques','514':'CCP','515':'Caisse',
  '52':'Instruments de trésorerie',
}

function labelFor(acc: string, fromData?: string): string {
  if (fromData && fromData !== acc) return fromData
  for (let l = Math.min(acc.length, 5); l >= 2; l--) {
    const key = acc.slice(0, l)
    if (ACC_LABELS[key]) return ACC_LABELS[key]
  }
  return acc
}

// ── Account categorization ────────────────────────────────────────────────

const CAT_DEFS: { id:string; label:string; color:string; side:'actif'|'passif'; test:(a:string)=>boolean }[] = [
  { id:'immo',      label:'Actif immobilisé',           color:'#3b82f6', side:'actif',
    test: a => /^2[0-9]/.test(a) },
  { id:'stocks',    label:'Stocks & en-cours',          color:'#06b6d4', side:'actif',
    test: a => /^3/.test(a) },
  { id:'clients',   label:'Clients & Créances',         color:'#10b981', side:'actif',
    test: a => /^41/.test(a) },
  { id:'treso',     label:'Trésorerie & équiv.',        color:'#14b8a6', side:'actif',
    test: a => /^5[0-6]/.test(a) },
  { id:'capitaux',  label:'Capitaux propres',           color:'#10b981', side:'passif',
    test: a => /^1[0-5]/.test(a) },
  { id:'dette_fin', label:'Dettes financières',         color:'#f97316', side:'passif',
    test: a => /^1[6-9]/.test(a) },
  { id:'fourn',     label:'Fournisseurs',               color:'#ef4444', side:'passif',
    test: a => /^40/.test(a) },
  { id:'fisc',      label:'Dettes fiscales & sociales', color:'#f59e0b', side:'passif',
    test: a => /^4[23456]/.test(a) && !/^41/.test(a) },
]

function buildBilanDetail(RAW: RAWData, selCo: string[]) {
  const accMap: Record<string, { valueN:number; valueN1:number; label:string; entries:FecEntry[] }> = {}

  for (const co of selCo) {
    for (const [acc, data] of Object.entries(RAW.companies[co]?.bn ?? {})) {
      const d = data as any
      const v = Math.abs(d.s ?? 0)
      if (v < 0.5) continue
      if (!accMap[acc]) accMap[acc] = { valueN:0, valueN1:0, label: d.l ?? acc, entries:[] }
      accMap[acc].valueN += v
      if (d.e) accMap[acc].entries.push(...(d.e as FecEntry[]))
    }
    for (const [acc, data] of Object.entries(RAW.companies[co]?.b1 ?? {})) {
      const d = data as any
      const v = Math.abs(d.s ?? 0)
      if (v < 0.5) continue
      if (!accMap[acc]) accMap[acc] = { valueN:0, valueN1:0, label: d.l ?? acc, entries:[] }
      accMap[acc].valueN1 += v
    }
  }

  const cats: Record<string, BilanCat> = {}
  for (const def of CAT_DEFS)
    cats[def.id] = { id:def.id, label:def.label, color:def.color, totalN:0, totalN1:0, accounts:[] }

  for (const [acc, data] of Object.entries(accMap)) {
    const def = CAT_DEFS.find(c => c.test(acc))
    if (!def) continue
    const cat = cats[def.id]
    cat.totalN  += data.valueN
    cat.totalN1 += data.valueN1
    cat.accounts.push({ acc, label: labelFor(acc, data.label), valueN: data.valueN, valueN1: data.valueN1, entries: data.entries })
  }

  for (const cat of Object.values(cats))
    cat.accounts.sort((a, b) => a.acc.localeCompare(b.acc))

  const actif  = ['immo','stocks','clients','treso'].map(id => cats[id])
  const passif = ['capitaux','dette_fin','fourn','fisc'].map(id => cats[id])

  return {
    actif, passif,
    totalActifN:   actif.reduce((s, c) => s + c.totalN,  0),
    totalActifN1:  actif.reduce((s, c) => s + c.totalN1, 0),
    totalPassifN:  passif.reduce((s, c) => s + c.totalN,  0),
    totalPassifN1: passif.reduce((s, c) => s + c.totalN1, 0),
  }
}

// ── BilanSection component ────────────────────────────────────────────────

const COL = { N1: 82, VAR: 90, N: 100 }

function varColor(d: number): string {
  if (Math.abs(d) < 0.5) return 'var(--text-3)'
  return d > 0 ? 'var(--green)' : 'var(--red)'
}
function varStr(d: number): string {
  if (Math.abs(d) < 0.5) return '—'
  return (d > 0 ? '+' : '') + fmt(d)
}

function BilanSection({
  title, sideColor, categories, totalN, totalN1,
  expanded, toggle, onOpenModal,
}: {
  title: string; sideColor: string
  categories: BilanCat[]
  totalN: number; totalN1: number
  expanded: Record<string, boolean>
  toggle: (id: string) => void
  onOpenModal: (m: ModalState) => void
}) {
  return (
    <div style={{ borderRadius:12, border:`1px solid ${sideColor}25`, overflow:'hidden', display:'flex', flexDirection:'column' }}>

      {/* Column header */}
      <div style={{ display:'flex', alignItems:'center', padding:'8px 14px', background:`${sideColor}18`, borderBottom:`2px solid ${sideColor}35`, flexShrink:0 }}>
        <span style={{ flex:1, fontSize:12, fontWeight:800, color:sideColor, textTransform:'uppercase', letterSpacing:'1px' }}>{title}</span>
        <span style={{ width:COL.N1, textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-3)', flexShrink:0 }}>N-1</span>
        <span style={{ width:COL.VAR, textAlign:'right', fontSize:10, fontWeight:600, color:'var(--text-3)', flexShrink:0 }}>Var. €</span>
        <span style={{ width:COL.N, textAlign:'right', fontSize:11, fontWeight:700, color:sideColor, flexShrink:0 }}>Cumul N</span>
      </div>

      {/* Rows */}
      <div style={{ overflowY:'auto', maxHeight:'calc(100vh - 300px)' }}>
        {categories.map(cat => (
          <div key={cat.id}>
            {/* Category row */}
            <div
              onClick={() => cat.accounts.length > 0 && toggle(cat.id)}
              style={{ display:'flex', alignItems:'center', padding:'9px 14px',
                cursor: cat.accounts.length > 0 ? 'pointer' : 'default',
                background: expanded[cat.id] ? `${cat.color}10` : 'transparent',
                borderBottom:'1px solid var(--border-0)', borderLeft:`3px solid ${cat.color}` }}
            >
              <span style={{ fontSize:10, color:'var(--text-3)', width:14, flexShrink:0 }}>
                {cat.accounts.length > 0 ? (expanded[cat.id] ? '▾' : '▸') : ''}
              </span>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--text-0)', flex:1 }}>{cat.label}</span>
              <span style={{ width:COL.N1, textAlign:'right', fontFamily:'monospace', fontSize:11, color:'var(--text-2)', flexShrink:0 }}>
                {cat.totalN1 > 0.5 ? fmt(cat.totalN1) : '—'}
              </span>
              <span style={{ width:COL.VAR, textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color:varColor(cat.totalN - cat.totalN1), flexShrink:0 }}>
                {varStr(cat.totalN - cat.totalN1)}
              </span>
              <span style={{ width:COL.N, textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:800, color:cat.color, flexShrink:0 }}>
                {fmt(cat.totalN)}
              </span>
            </div>

            {/* Account rows */}
            {expanded[cat.id] && cat.accounts.map(acc => (
              <div
                key={acc.acc}
                onClick={() => onOpenModal({ title:`${acc.acc} — ${acc.label}`, entries:acc.entries, cumN:acc.valueN, cumN1:acc.valueN1 })}
                style={{ display:'flex', alignItems:'center', padding:'5px 14px 5px 32px',
                  cursor:'pointer',
                  background:'rgba(0,0,0,0.18)', borderBottom:'1px solid var(--border-0)' }}
              >
                <span style={{ fontSize:9, color:'var(--blue)', marginRight:4, flexShrink:0 }}>▸</span>
                <span style={{ fontFamily:'monospace', fontSize:10, color:'var(--text-3)', marginRight:6, flexShrink:0 }}>{acc.acc}</span>
                <span style={{ fontSize:11, color:'var(--text-1)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{acc.label}</span>
                {acc.entries.length > 0 && (
                  <span style={{ fontSize:9, color:'var(--blue)', background:'rgba(59,130,246,0.08)', padding:'1px 5px', borderRadius:10, marginLeft:6, marginRight:6, flexShrink:0 }}>
                    {acc.entries.length} éc.
                  </span>
                )}
                <span style={{ width:COL.N1, textAlign:'right', fontFamily:'monospace', fontSize:10, color:'var(--text-2)', flexShrink:0 }}>
                  {acc.valueN1 > 0.5 ? fmt(acc.valueN1) : '—'}
                </span>
                <span style={{ width:COL.VAR, textAlign:'right', fontFamily:'monospace', fontSize:10, fontWeight:600, color:varColor(acc.valueN - acc.valueN1), flexShrink:0 }}>
                  {varStr(acc.valueN - acc.valueN1)}
                </span>
                <span style={{ width:COL.N, textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:700, color: acc.valueN > 0.5 ? 'var(--text-0)' : 'var(--text-3)', flexShrink:0 }}>
                  {acc.valueN > 0.5 ? fmt(acc.valueN) : '—'}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Total row — always visible */}
      <div style={{ display:'flex', alignItems:'center', padding:'10px 14px', flexShrink:0,
        background:`${sideColor}18`, borderTop:`2px solid ${sideColor}35`, borderLeft:`3px solid ${sideColor}` }}>
        <span style={{ flex:1, fontSize:12, fontWeight:800, color:sideColor, textTransform:'uppercase', letterSpacing:'0.5px' }}>
          Total {title}
        </span>
        <span style={{ width:COL.N1, textAlign:'right', fontFamily:'monospace', fontSize:11, color:'var(--text-2)', fontWeight:600, flexShrink:0 }}>
          {totalN1 > 0.5 ? fmt(totalN1) : '—'}
        </span>
        <span style={{ width:COL.VAR, textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:700, color:varColor(totalN - totalN1), flexShrink:0 }}>
          {varStr(totalN - totalN1)}
        </span>
        <span style={{ width:COL.N, textAlign:'right', fontFamily:'monospace', fontSize:14, fontWeight:900, color:sideColor, flexShrink:0 }}>
          {fmt(totalN)}
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function Bilan() {
  const printRef = useRef<HTMLDivElement>(null)
  const RAW      = useAppStore(s => s.RAW)
  const filters  = useAppStore(s => s.filters)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<ModalState | null>(null)

  const bilan = useMemo(() => {
    if (!RAW || !filters.selCo.length) return null
    return computeBilan(RAW, filters.selCo)
  }, [RAW, filters.selCo.join(',')])

  const detail = useMemo(() => {
    if (!RAW || !filters.selCo.length) return null
    return buildBilanDetail(RAW, filters.selCo)
  }, [RAW, filters.selCo.join(',')])

  if (!RAW || !bilan || !detail) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      Aucune donnée. Importez un fichier FEC depuis l'onglet Import.
    </div>
  )

  const { n } = bilan
  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  return (
    <div ref={printRef} className="module-bilan" style={{ padding:'20px 24px' }}>
      <ExportBar
        onPdf={() => printModule(printRef, 'module-print')}
        onExcel={() => exportBilanXlsx('Bilan', n)}
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24, marginTop:12 }}>
        <KpiCard label="Total Actif"        value={`${fmt(n.totalActif)} €`} color="#3b82f6" />
        <KpiCard label="Capitaux propres"   value={`${fmt(n.capitaux)} €`}   color="#10b981" />
        <KpiCard label="Dettes financières" value={`${fmt(n.detteFin)} €`}   color="#f97316" />
        <KpiCard label="Trésorerie"         value={`${fmt(n.tresoActif)} €`} color="#14b8a6" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <BilanSection
          title="Actif" sideColor="#3b82f6"
          categories={detail.actif}
          totalN={detail.totalActifN} totalN1={detail.totalActifN1}
          expanded={expanded} toggle={toggle}
          onOpenModal={m => setModal(m)}
        />
        <BilanSection
          title="Passif" sideColor="#8b5cf6"
          categories={detail.passif}
          totalN={detail.totalPassifN} totalN1={detail.totalPassifN1}
          expanded={expanded} toggle={toggle}
          onOpenModal={m => setModal(m)}
        />
      </div>

      {modal && <EcrituresModal {...modal} onClose={() => setModal(null)} />}
    </div>
  )
}
