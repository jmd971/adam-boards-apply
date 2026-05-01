function computeKpis(RAW: any, selCo: string[], months: string[]) {
  let ca=0, caN1=0, ach=0, serv=0, pers=0, amrt=0
  let achN1=0, servN1=0, persN1=0, amrtN1=0
  for (const m of months) {
    const mN1 = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
    ca    += sumAccs(RAW, selCo, 'pn', m,   CA_ACCS)
    caN1  += sumAccs(RAW, selCo, 'p1', mN1, CA_ACCS)
    ach   += sumAccs(RAW, selCo, 'pn', m,   ACHAT_ACCS, true)
    serv  += sumAccs(RAW, selCo, 'pn', m,   SERV_ACCS,  true)
    pers  += sumAccs(RAW, selCo, 'pn', m,   PERS_ACCS,  true)
    amrt  += sumAccs(RAW, selCo, 'pn', m,   AMORT_ACCS, true)
    achN1  += sumAccs(RAW, selCo, 'p1', mN1, ACHAT_ACCS, true)
    servN1 += sumAccs(RAW, selCo, 'p1', mN1, SERV_ACCS,  true)
    persN1 += sumAccs(RAW, selCo, 'p1', mN1, PERS_ACCS,  true)
    amrtN1 += sumAccs(RAW, selCo, 'p1', mN1, AMORT_ACCS, true)
  }
  const marge   = ca   - ach
  const ebe     = marge   - serv  - pers
  const re      = ebe     - amrt
  const margeN1 = caN1 - achN1
  const ebeN1   = margeN1 - servN1 - persN1
  const reN1    = ebeN1   - amrtN1
  const evo = (n: number, n1: number) => n1 !== 0 ? (n - n1) / Math.abs(n1) : null
  return { ca, caN1, ach, serv, pers, amrt, marge, ebe, re,
    evoCa:    caN1   > 0 ? (ca - caN1) / caN1 : null,
    evoMarge: evo(marge, margeN1),
    evoEbe:   evo(ebe,   ebeN1),
    evoRe:    evo(re,    reN1),
    txMarge: ca > 0 ? marge/ca : 0,
    txEbe:   ca > 0 ? ebe/ca   : 0,
    txRe:    ca > 0 ? re/ca    : 0,
  }
}
