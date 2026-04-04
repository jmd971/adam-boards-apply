import type { RAWData } from '@/types'

export interface BilanSide {
  immos: number
  stocks: number
  clients: number
  tresoActif: number
  autresActif: number
  totalActif: number
  capitaux: number
  detteFin: number
  fournisseurs: number
  dettesFisc: number
  autresPassif: number
  totalPassif: number
  fournTop: [string, number][]
  clientTop: [string, number][]
}

export interface BilanResult { n: BilanSide; n1: BilanSide }

function emptyBilan(): BilanSide {
  return { immos:0, stocks:0, clients:0, tresoActif:0, autresActif:0, totalActif:0,
           capitaux:0, detteFin:0, fournisseurs:0, dettesFisc:0, autresPassif:0, totalPassif:0,
           fournTop:[], clientTop:[] }
}

function computeSide(RAW: RAWData, keys: string[], field: 'bn' | 'b1'): BilanSide {
  const b = emptyBilan()
  const fournMap: Record<string, number> = {}
  const clientMap: Record<string, number> = {}

  for (const co of keys) {
    const accounts = RAW.companies[co]?.[field] ?? {}
    for (const [acc, data] of Object.entries(accounts)) {
      const s = Math.abs((data as any).s ?? 0)
      const label = (data as any).l ?? acc

      if (acc.match(/^2[0-8]/))                    b.immos        += s
      else if (acc.match(/^3/))                    b.stocks       += s
      else if (acc.match(/^411/))                 { b.clients      += s; if (s > 100) clientMap[label] = (clientMap[label] ?? 0) + s }
      else if (acc.match(/^5[1-5]/))               b.tresoActif   += s
      else if (acc.match(/^1[0-5]/))               b.capitaux     += s
      else if (acc.match(/^1[6-7]/))               b.detteFin     += s
      else if (acc.match(/^40[1-5]/))             { b.fournisseurs += s; if (s > 100) fournMap[label] = (fournMap[label] ?? 0) + s }
      else if (acc.match(/^4[234]/))               b.dettesFisc   += s
    }
  }

  b.totalActif  = b.immos + b.stocks + b.clients + b.tresoActif + b.autresActif
  b.totalPassif = b.capitaux + b.detteFin + b.fournisseurs + b.dettesFisc + b.autresPassif

  b.fournTop  = Object.entries(fournMap).sort((a,b) => b[1]-a[1]).slice(0,8) as [string,number][]
  b.clientTop = Object.entries(clientMap).sort((a,b) => b[1]-a[1]).slice(0,8) as [string,number][]

  return b
}

export function computeBilan(RAW: RAWData, keys: string[]): BilanResult {
  return { n: computeSide(RAW, keys, 'bn'), n1: computeSide(RAW, keys, 'b1') }
}
