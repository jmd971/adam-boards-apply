/** Configurable alert thresholds for financial ratios */

export interface AlertThreshold {
  id: string
  label: string
  unit: '%' | '€' | 'x' | 'jours'
  /** "above" = alert when value > threshold, "below" = alert when value < threshold */
  direction: 'above' | 'below'
  warn: number
  bad: number
}

export const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  { id: 'txMarge',   label: 'Taux de marge brute',   unit: '%',     direction: 'below', warn: 25, bad: 15 },
  { id: 'txEbe',     label: "Taux d'EBE / CA",       unit: '%',     direction: 'below', warn: 8,  bad: 3 },
  { id: 'txRnet',    label: 'Rentabilité nette',      unit: '%',     direction: 'below', warn: 3,  bad: 0 },
  { id: 'txVA',      label: 'Taux de VA / CA',        unit: '%',     direction: 'below', warn: 25, bad: 15 },
  { id: 'bfrJours',  label: 'BFR en jours de CA',     unit: 'jours', direction: 'above', warn: 60, bad: 90 },
  { id: 'levier',    label: 'Levier financier',       unit: 'x',     direction: 'above', warn: 1.5, bad: 2.5 },
  { id: 'evoCa',     label: 'Évolution CA vs N-1',    unit: '%',     direction: 'below', warn: 0,  bad: -5 },
]

export type ThresholdMap = Record<string, { warn: number; bad: number }>

export function thresholdsToMap(thresholds: AlertThreshold[]): ThresholdMap {
  const map: ThresholdMap = {}
  for (const t of thresholds) map[t.id] = { warn: t.warn, bad: t.bad }
  return map
}

export interface RatioAlert {
  icon: string
  title: string
  msg: string
  color: string
  priority: number
  status: 'good' | 'warn' | 'bad'
}

/** Evaluate a value against a threshold */
export function evalThreshold(
  value: number,
  threshold: AlertThreshold,
): 'good' | 'warn' | 'bad' {
  if (threshold.direction === 'below') {
    if (value < threshold.bad) return 'bad'
    if (value < threshold.warn) return 'warn'
    return 'good'
  } else {
    if (value > threshold.bad) return 'bad'
    if (value > threshold.warn) return 'warn'
    return 'good'
  }
}

export function formatThresholdValue(v: number, unit: string): string {
  if (unit === '%') return `${v.toFixed(1)} %`
  if (unit === 'x') return `${v.toFixed(1)}x`
  if (unit === 'jours') return `${Math.round(v)} j`
  return `${Math.round(v)} €`
}
