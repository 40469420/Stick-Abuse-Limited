/**
 * Kernel USB poll math — port of the proven ETW method (tracker: DeepPoll,
 * MIT — our implementation is original code written from the method:
 * completion intervals per device, host stalls excluded, p5–p95 bins).
 *
 * Pure functions only: importable from main, renderer tests, anywhere.
 */

export interface DeepPollBins {
  label: string
  minHz: number
  maxHz: number
  pct: number
}

export interface DeepPollDevice {
  vidPid: string
  rateHz: number
  samples: number
  stalls: number
  stallMs: number
}

export interface DeepPollResult {
  ok: boolean
  /** Headline device (VID:PID match, else busiest). */
  vidPid: string
  rateHz: number
  samples: number
  stalls: number
  stallMs: number
  p50: number
  p95: number
  bins: DeepPollBins[]
  /** Every measured interrupt device, busiest first (capped). */
  devices: DeepPollDevice[]
  error?: string
}

/** Percentile over a pre-sorted array (nearest-rank, clamped). */
export function dpPercentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(Math.floor((sorted.length * p) / 100), sorted.length - 1)
  return sorted[Math.max(0, idx)]
}

export interface DeepPollRate {
  rateHz: number
  steady: number[]
  stalls: number
  stallMs: number
  thresholdUs: number
}

/**
 * Steady-state rate from completion intervals (µs). Host stalls —
 * everything at or above max(4×median, 1000µs) — are excluded from the
 * mean but counted separately. Mirrors the reference behavior.
 */
export function dpComputeRate(intervalsUs: ReadonlyArray<number>): DeepPollRate {
  const valid = intervalsUs.filter((v) => Number.isFinite(v) && v >= 0 && v < 50000)
  if (valid.length === 0) return { rateHz: 0, steady: [], stalls: 0, stallMs: 0, thresholdUs: 0 }
  const sorted = [...valid].sort((a, b) => a - b)
  const median = dpPercentile(sorted, 50)
  const thresholdUs = Math.max(4 * median, 1000)
  const steady = valid.filter((v) => v < thresholdUs)
  const stallMs = valid.filter((v) => v >= thresholdUs).reduce((a, b) => a + b, 0) / 1000
  const mean = steady.length > 0 ? steady.reduce((a, b) => a + b, 0) / steady.length : 0
  return {
    rateHz: mean > 0 ? 1000000 / mean : 0,
    steady,
    stalls: valid.length - steady.length,
    stallMs,
    thresholdUs
  }
}

/**
 * Pair dispatch/completion records into per-device completion intervals.
 * kind 'start' carries the device handle; 'stop' closes the pair.
 * Intervals are differences of consecutive COMPLETION timestamps.
 */
export function dpPairIntervals(
  records: ReadonlyArray<{ urb: string; dev: string; t: number; kind: 'start' | 'stop' }>
): Map<string, number[]> {
  const pending = new Map<string, { t: number; dev: string }>()
  const lastEnd = new Map<string, number>()
  const out = new Map<string, number[]>()
  for (const r of records) {
    if (r.kind === 'start') {
      pending.set(r.urb, { t: r.t, dev: r.dev })
    } else {
      const open = pending.get(r.urb)
      pending.delete(r.urb)
      if (!open) continue
      const prev = lastEnd.get(open.dev)
      lastEnd.set(open.dev, r.t)
      if (prev !== undefined) {
        const dt = r.t - prev
        if (dt >= 0 && dt < 50000) {
          const arr = out.get(open.dev)
          if (arr) arr.push(dt)
          else out.set(open.dev, [dt])
        }
      }
    }
  }
  return out
}

/** Pick the headline device: busiest in the target VID family, else busiest overall. */
export function dpPickDevice(
  perDev: ReadonlyMap<string, ReadonlyArray<number>>,
  devmap: ReadonlyMap<string, string>,
  vid: string
): { dev: string; iv: number[] } | null {
  let best: { dev: string; iv: number[] } | null = null
  for (const [dev, iv] of perDev) {
    if ((devmap.get(dev) ?? '').split(':')[0] !== vid) continue
    if (!best || iv.length > best.iv.length) best = { dev, iv: [...iv] }
  }
  if (best) return best
  for (const [dev, iv] of perDev) {
    if (!best || iv.length > best.iv.length) best = { dev, iv: [...iv] }
  }
  return best
}

/** p5–p95 auto-binning with faster/slower overflow bins (display order). */
export function dpBin(intervalsUs: ReadonlyArray<number>): DeepPollBins[] {
  const total = intervalsUs.length
  if (total === 0) return []
  const sorted = [...intervalsUs].sort((a, b) => a - b)
  const positives = sorted.filter((v) => v > 0)
  const base = positives.length > 0 ? positives : sorted
  const p5 = dpPercentile(base, 5)
  const p95 = dpPercentile(base, 95)
  let width = (p95 - p5) / 6
  if (!(width >= 1)) width = 1
  const edges: Array<{ label: string; lo: number; hi: number }> = []
  edges.push({ label: `>${Math.round(1000000 / Math.max(p5, 1e-9))} Hz`, lo: 0, hi: p5 })
  // Middle bins partition [p5, midEnd); the slow bin starts at midEnd so
  // degenerate data (p95 == p5) can never double-count.
  const midEnd = p5 + 6 * width
  for (let i = 0; i < 6; i++) {
    const lo = p5 + i * width
    const hi = i === 5 ? midEnd : p5 + (i + 1) * width
    edges.push({ label: `${Math.round(1000000 / hi)}-${Math.round(1000000 / Math.max(lo, 1e-9))}`, lo, hi })
  }
  edges.push({ label: `<${Math.round(1000000 / Math.max(p95, 1e-9))} Hz`, lo: midEnd, hi: Infinity })
  return edges.map((e) => {
    const n = intervalsUs.filter((v) => v >= e.lo && v < e.hi).length
    return {
      label: e.label,
      minHz: e.hi === Infinity ? 0 : 1000000 / e.hi,
      maxHz: e.lo <= 0 ? Infinity : 1000000 / e.lo,
      pct: (100 * n) / total
    }
  })
}
